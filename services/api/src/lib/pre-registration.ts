import { and, eq, isNull, sql } from "drizzle-orm";
import {
  appListings,
  apps,
  preRegistrations,
  users,
} from "@openmarket/db/schema";
import { db } from "./db";
import { dispatchToUser } from "./push";
import { enqueueEmail } from "./email";

/**
 * Pre-registration launch fan-out (P3-A).
 *
 * Called from the admin release-approve flow the moment a release
 * transitions to `published`. Walks every active pre-registrant for
 * the app, dispatches their chosen channel(s), and marks them
 * notified so subsequent releases on the same app don't trigger
 * launch notifications.
 *
 * Idempotent by design: a second invocation finds no un-notified
 * rows and returns zeros. Failure on one user does not abort the
 * fan-out — every successful send marks itself, every failed send
 * surfaces in notification_log via dispatchToUser.
 */
export async function dispatchPreRegistrationLaunch(
  appId: string,
  releaseVersionName: string,
): Promise<{
  notified: number;
  pushSent: number;
  emailQueued: number;
  failed: number;
}> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    with: { listings: true },
  });
  if (!app) {
    return { notified: 0, pushSent: 0, emailQueued: 0, failed: 0 };
  }
  const listing =
    app.listings?.find((l) => l.id === app.currentListingId) ??
    app.listings?.[app.listings.length - 1];
  const appTitle = listing?.title ?? "Your pre-registered app";

  // Pull every active, un-notified pre-registration plus the user's
  // email — one query.
  const rows = await db
    .select({
      id: preRegistrations.id,
      userId: preRegistrations.userId,
      channel: preRegistrations.channel,
      email: users.email,
    })
    .from(preRegistrations)
    .innerJoin(users, eq(users.id, preRegistrations.userId))
    .where(
      and(
        eq(preRegistrations.appId, appId),
        isNull(preRegistrations.unregisteredAt),
        isNull(preRegistrations.notifiedAt),
      ),
    );

  let pushSent = 0;
  let emailQueued = 0;
  let failed = 0;

  for (const row of rows) {
    const wantsPush = row.channel === "push" || row.channel === "both";
    const wantsEmail = row.channel === "email" || row.channel === "both";

    try {
      if (wantsPush) {
        const result = await dispatchToUser(row.userId, {
          title: `${appTitle} is here!`,
          body: `The app you pre-registered for just launched (v${releaseVersionName}). Tap to install.`,
          url: `/apps/${appId}`,
          tag: `prereg-launch-${appId}`,
          type: "release_update",
        });
        pushSent += result.sent;
      }

      if (wantsEmail) {
        await enqueueEmail({
          template: "pre-registration-launch",
          to: row.email,
          props: {
            appTitle,
            appId,
            versionName: releaseVersionName,
          },
        });
        emailQueued += 1;
      }

      await db
        .update(preRegistrations)
        .set({ notifiedAt: new Date() })
        .where(eq(preRegistrations.id, row.id));
    } catch (err) {
      console.error(
        `[pre-registration] failed to notify userId=${row.userId} appId=${appId}`,
        err,
      );
      failed += 1;
    }
  }

  return { notified: rows.length, pushSent, emailQueued, failed };
}

/**
 * Public count + viewer status for the storefront app-detail render.
 * One round-trip helper for the GET /apps/:id/pre-register/status path
 * and the storefront CTA component.
 */
export async function preRegistrationStatusFor(
  appId: string,
  userId: string | null,
): Promise<{
  enabled: boolean;
  registered: boolean;
  registeredCount: number;
}> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: { preRegistrationEnabled: true },
  });
  if (!app) return { enabled: false, registered: false, registeredCount: 0 };

  // Single aggregate: count active rows + whether the current user
  // has one. We do them as two short queries — counts are cheap and
  // collapse to one round trip via concurrent dispatch.
  const [countRow, viewerRow] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(preRegistrations)
      .where(
        and(
          eq(preRegistrations.appId, appId),
          isNull(preRegistrations.unregisteredAt),
        ),
      ),
    userId
      ? db.query.preRegistrations.findFirst({
          where: and(
            eq(preRegistrations.appId, appId),
            eq(preRegistrations.userId, userId),
            isNull(preRegistrations.unregisteredAt),
          ),
        })
      : Promise.resolve(undefined),
  ]);

  return {
    enabled: app.preRegistrationEnabled,
    registered: !!viewerRow,
    registeredCount: countRow[0]?.count ?? 0,
  };
}

/**
 * Used by the listing surface (the homepage "Coming soon" rail in a
 * future commit, plus search filters). Returns the app's enabled-
 * flag without the per-viewer query.
 */
export async function isPreRegistrationEnabled(appId: string): Promise<boolean> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: { preRegistrationEnabled: true },
  });
  return !!app?.preRegistrationEnabled;
}

/**
 * Approximate active count — exposed for the dev-portal so the
 * publisher sees how many users are waiting. Unscoped by channel.
 */
export async function countActivePreRegistrations(appId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(preRegistrations)
    .where(
      and(
        eq(preRegistrations.appId, appId),
        isNull(preRegistrations.unregisteredAt),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Re-export of the appListings symbol kept here so the dispatch path
 * above can resolve currentListing without pulling apps.ts into the
 * route file. Pure ergonomic shim — no runtime behavior.
 */
export const _appListingsForTypecheck = appListings;
