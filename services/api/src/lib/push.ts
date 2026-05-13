import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  apps,
  libraryEntries,
  notificationLog,
  pushSubscriptions,
  users,
} from "@openmarket/db/schema";
import {
  shouldSendPush,
  type NotificationPreferences,
  type PushPayload,
} from "@openmarket/contracts/push";
import { db } from "./db";

/**
 * Web Push delivery adapter. The default driver is a noop that logs
 * to notification_log only — useful for local dev + CI where VAPID
 * keys aren't configured. Production swaps in a `web-push`-backed
 * implementation behind WEB_PUSH_DRIVER=web-push (not implemented in
 * this commit — wiring is left for the deploy step).
 *
 * Driver contract:
 *   - `send` resolves on success
 *   - throws an Error with `.statusCode` (number) on push-service
 *     failure; callers use `statusCode in [404, 410]` to recognize
 *     permanently-invalid subscriptions and mark them revoked.
 */
export interface PushDriver {
  name(): string;
  send(args: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    payload: PushPayload;
  }): Promise<void>;
}

export class NoopPushDriver implements PushDriver {
  name() {
    return "noop";
  }
  async send(): Promise<void> {
    // Intentionally empty — local dev / tests.
  }
}

let driverSingleton: PushDriver | null = null;
export function getPushDriver(): PushDriver {
  if (driverSingleton) return driverSingleton;
  const which = (process.env.WEB_PUSH_DRIVER ?? "noop").toLowerCase();
  if (which === "noop") {
    driverSingleton = new NoopPushDriver();
    return driverSingleton;
  }
  // Future: dynamically import a web-push-backed driver here.
  // Throwing is louder than silently falling back — production
  // deploys must set this explicitly.
  throw new Error(`Unknown WEB_PUSH_DRIVER=${which}`);
}

/** Test seam — call after each test to reset the cached driver. */
export function resetPushDriver(): void {
  driverSingleton = null;
}

/**
 * Send a payload to one user across every active subscription they
 * have. Returns the per-subscription outcome so callers can surface
 * failures back through the audit log.
 *
 * Subscription invalidation:
 *   - 404/410 from the push service → flip revokedAt and stop sending
 *   - any other error → log to notification_log status=failed and
 *     leave the subscription alone for retry
 */
export async function dispatchToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) return { sent: 0, skipped: 0, failed: 0 };

  const prefs = (user.notificationPreferences ??
    null) as NotificationPreferences | null;

  if (!shouldSendPush(prefs, payload.type)) {
    await db.insert(notificationLog).values({
      userId,
      type: payload.type,
      status: "skipped",
      payload,
      errorReason: "user-prefs-opt-out",
    });
    return { sent: 0, skipped: 1, failed: 0 };
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        isNull(pushSubscriptions.revokedAt),
      ),
    );

  if (subs.length === 0) {
    await db.insert(notificationLog).values({
      userId,
      type: payload.type,
      status: "skipped",
      payload,
      errorReason: "no-active-subscription",
    });
    return { sent: 0, skipped: 1, failed: 0 };
  }

  const driver = getPushDriver();
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      await driver.send({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
        payload,
      });
      await db.insert(notificationLog).values({
        userId,
        subscriptionId: sub.id,
        type: payload.type,
        status: "sent",
        payload,
      });
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      const isPermanent = status === 404 || status === 410;
      if (isPermanent) {
        await db
          .update(pushSubscriptions)
          .set({ revokedAt: new Date() })
          .where(eq(pushSubscriptions.id, sub.id));
      }
      await db.insert(notificationLog).values({
        userId,
        subscriptionId: sub.id,
        type: payload.type,
        status: "failed",
        payload,
        errorReason: err instanceof Error ? err.message : String(err),
        invalidatedSubscription: isPermanent ? sub.endpoint : null,
      });
      failed += 1;
    }
  }

  return { sent, skipped: 0, failed };
}

/**
 * Fan-out helper invoked when a release transitions to `published`.
 * Finds every user whose library contains the app (and who hasn't
 * uninstalled) and dispatches a release_update push to each.
 *
 * Intentionally synchronous — for now we don't queue this through
 * BullMQ. Once libraries exceed ~1k subscribers per app we'll push
 * this into a worker; the contract stays the same.
 */
export async function dispatchReleaseToLibrary(
  appId: string,
  payload: PushPayload,
): Promise<{ targets: number; sent: number; skipped: number; failed: number }> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: { id: true },
  });
  if (!app) return { targets: 0, sent: 0, skipped: 0, failed: 0 };

  const subscribers = await db
    .select({ userId: libraryEntries.userId })
    .from(libraryEntries)
    .where(
      and(
        eq(libraryEntries.appId, appId),
        isNull(libraryEntries.uninstalledAt),
      ),
    );

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const { userId } of subscribers) {
    const r = await dispatchToUser(userId, payload);
    sent += r.sent;
    skipped += r.skipped;
    failed += r.failed;
  }
  return { targets: subscribers.length, sent, skipped, failed };
}

/**
 * Recent notification log for the signed-in user. Powers the
 * /account/notifications history panel.
 */
export async function recentNotifications(userId: string, limit = 50) {
  return db
    .select()
    .from(notificationLog)
    .where(eq(notificationLog.userId, userId))
    .orderBy(desc(notificationLog.sentAt))
    .limit(limit);
}

/**
 * Tiny helper that takes a list of subscription ids and revokes them
 * in one query — used by the manage-devices DELETE endpoint.
 */
export async function revokeSubscriptions(
  userId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db
    .update(pushSubscriptions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        inArray(pushSubscriptions.id, ids),
        isNull(pushSubscriptions.revokedAt),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return result.length;
}
