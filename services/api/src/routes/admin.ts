import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, desc, asc, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import {
  adminActions,
  apps,
  appListings,
  releases,
  releaseRollouts,
  reviews,
  developers,
  moderationActions,
  releaseArtifacts,
  scanResults,
} from "@openmarket/db/schema";
import { requireAdmin } from "../middleware/admin";
import { notifyQueue, scanQueue } from "../lib/queue";
import {
  appendTransparencyEvent,
  CURRENT_CONTENT_POLICY_VERSION,
} from "../lib/transparency";
import { enqueueEmail } from "../lib/email";
import { recordAdminAction } from "../lib/audit";
import { dispatchReleaseToLibrary } from "../lib/push";
import { dispatchPreRegistrationLaunch } from "../lib/pre-registration";
import { promoteDueReviews } from "../lib/review-moderation";
import { syncAppToSearchIndex } from "../lib/search-index";
import { sourceCodeVerificationPatchSchema } from "@openmarket/contracts/source-code";
import type { Variables } from "../lib/types";

export const adminRouter = new Hono<{ Variables: Variables }>();

const approveRejectSchema = z.object({
  reason: z.string().optional(),
});

const suspendSchema = z.object({
  reason: z.string().min(1),
});

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// GET /admin/risk-queue — releases in "review" status with latest scan risk score
adminRouter.get("/admin/risk-queue", requireAdmin, async (c) => {
  // Get all releases in review status
  const reviewReleases = await db.query.releases.findMany({
    where: eq(releases.status, "review"),
    with: {
      app: {
        columns: { id: true, packageName: true },
      },
      artifacts: {
        columns: { id: true },
        limit: 1,
      },
    },
  });

  // For each release, get its latest artifact's scan result
  const queue = await Promise.all(
    reviewReleases.map(async (release) => {
      const artifact = release.artifacts?.[0] as any;
      let latestScan = null;

      if (artifact) {
        latestScan = await db.query.scanResults.findFirst({
          where: eq(scanResults.artifactId, artifact.id),
          orderBy: [desc(scanResults.createdAt)],
        });
      }

      return {
        ...release,
        artifacts: undefined,
        riskScore: latestScan?.riskScore ?? null,
        scanStatus: latestScan?.status ?? null,
        scanSummary: latestScan?.summary ?? null,
      };
    })
  );

  // Sort by risk score descending (nulls last)
  queue.sort((a, b) => {
    if (a.riskScore === null && b.riskScore === null) return 0;
    if (a.riskScore === null) return 1;
    if (b.riskScore === null) return -1;
    return b.riskScore - a.riskScore;
  });

  return c.json(queue);
});

// POST /admin/releases/:id/approve — approve a release
adminRouter.post(
  "/admin/releases/:id/approve",
  requireAdmin,
  zValidator("json", approveRejectSchema),
  async (c) => {
    const authUser = c.get("user");
    const releaseId = c.req.param("id");

    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
    });

    if (!release) {
      throw new HTTPException(404, { message: "Release not found" });
    }

    // Find the developer record for the moderator (for reviewedBy FK)
    const moderator = await db.query.developers.findFirst({
      where: eq(developers.email, authUser.email),
    });

    const [updated] = await db
      .update(releases)
      .set({
        status: "published",
        reviewedBy: moderator?.id ?? null,
        reviewedAt: new Date(),
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(releases.id, releaseId))
      .returning();

    // Publish the APP itself on its first approved release. An app stays
    // isPublished=false (invisible in search/storefront/federation) until
    // a release has passed moderation — this is the gate that makes a
    // security-reviewed app publicly discoverable. Scoped to isPublished
    // =false so it's a no-op on subsequent approvals.
    await db
      .update(apps)
      .set({ isPublished: true, updatedAt: new Date() })
      .where(and(eq(apps.id, release.appId), eq(apps.isPublished, false)));

    await notifyQueue.add("notify", {
      type: "release_approved",
      releaseId,
      appId: release.appId,
      moderatorId: moderator?.id ?? null,
    });

    // Fire-and-forget push fan-out (P2-P). Errors logged but don't
    // block the approval response — the email path above is the
    // user-facing critical-path channel.
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, release.appId),
      with: { listings: true },
    });
    const listing =
      app?.listings?.find((l) => l.id === app.currentListingId) ??
      app?.listings?.[app?.listings.length - 1];
    // P3-A: pre-registration fan-out. Fires once per app — the
    // helper marks notifiedAt and is idempotent so a second invocation
    // (e.g. re-approval after rollback) is a no-op.
    void dispatchPreRegistrationLaunch(release.appId, release.versionName).catch(
      (err) => {
        console.error("[admin] pre-registration launch fan-out failed", err);
      },
    );

    void dispatchReleaseToLibrary(release.appId, {
      title: listing?.title
        ? `${listing.title} v${release.versionName} is available`
        : `New release v${release.versionName}`,
      body:
        release.releaseNotes?.slice(0, 200) ??
        "Open OpenMarket to install the latest version.",
      url: `/apps/${release.appId}`,
      type: "release_update",
      tag: `release-${release.appId}`,
    }).catch((err) => {
      console.error("[admin] release-publish push fan-out failed", err);
    });

    // Refresh the search index — the new release updates the app's
    // latest-release recency signal (and (re)indexes it if it's now live).
    void syncAppToSearchIndex(release.appId);

    return c.json(updated);
  }
);

// POST /admin/releases/:id/reject — reject a release (back to draft)
adminRouter.post(
  "/admin/releases/:id/reject",
  requireAdmin,
  zValidator("json", approveRejectSchema),
  async (c) => {
    const authUser = c.get("user");
    const releaseId = c.req.param("id");
    const body = c.req.valid("json");

    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
    });

    if (!release) {
      throw new HTTPException(404, { message: "Release not found" });
    }

    const moderator = await db.query.developers.findFirst({
      where: eq(developers.email, authUser.email),
    });

    const [updated] = await db
      .update(releases)
      .set({
        status: "draft",
        reviewedBy: moderator?.id ?? null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(releases.id, releaseId))
      .returning();

    // Log moderation action if we have a moderator record
    if (moderator) {
      await db.insert(moderationActions).values({
        targetType: "release",
        targetId: releaseId,
        action: "delist_release",
        reason: body.reason ?? "Release rejected during review",
        moderatorId: moderator.id,
      });
    }

    await notifyQueue.add("notify", {
      type: "release_rejected",
      releaseId,
      appId: release.appId,
      reason: body.reason ?? null,
      moderatorId: moderator?.id ?? null,
    });

    return c.json(updated);
  }
);

/**
 * GET /admin/apps/source-code (P3-O)
 *
 * Lists apps with a sourceCodeUrl set on their current listing, with
 * the current verification flags. Drives the admin source-code-
 * verification triage page. Newest-first.
 */
adminRouter.get("/admin/apps/source-code", requireAdmin, async (c) => {
  const rows = await db
    .select({
      id: apps.id,
      packageName: apps.packageName,
      sourceCodeVerified: apps.sourceCodeVerified,
      sourceCodeVerifiedAt: apps.sourceCodeVerifiedAt,
      reproducibleVerified: apps.reproducibleVerified,
      reproducibleVerifiedAt: apps.reproducibleVerifiedAt,
      sourceCodeUrl: appListings.sourceCodeUrl,
      currentListingId: apps.currentListingId,
    })
    .from(apps)
    .leftJoin(
      appListings,
      and(
        eq(appListings.appId, apps.id),
        eq(appListings.id, apps.currentListingId),
      ),
    )
    .where(sql`${appListings.sourceCodeUrl} IS NOT NULL`)
    .orderBy(desc(apps.updatedAt))
    .limit(200);

  return c.json({ items: rows });
});

/**
 * PATCH /admin/apps/:id/source-code-verification (P3-O)
 *
 * Toggles either or both of the source-code verification flags on
 * the app row. Independently optional so an admin can flip one
 * without touching the other.
 *
 * Setting a flag to true stamps `*_VerifiedAt`; clearing leaves the
 * timestamp in place (audit trail of past verifications). The
 * companion record on admin_actions captures who/when/why.
 */
adminRouter.patch(
  "/admin/apps/:id/source-code-verification",
  requireAdmin,
  zValidator("json", sourceCodeVerificationPatchSchema),
  async (c) => {
    const authUser = c.get("user");
    const appId = c.req.param("id");
    const body = c.req.valid("json");

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });
    if (!app) {
      throw new HTTPException(404, { message: "App not found" });
    }

    const moderator = await db.query.developers.findFirst({
      where: eq(developers.email, authUser.email),
    });

    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (body.sourceCodeVerified !== undefined) {
      patch.sourceCodeVerified = body.sourceCodeVerified;
      if (body.sourceCodeVerified) patch.sourceCodeVerifiedAt = now;
    }
    if (body.reproducibleVerified !== undefined) {
      patch.reproducibleVerified = body.reproducibleVerified;
      if (body.reproducibleVerified) patch.reproducibleVerifiedAt = now;
    }

    const [updated] = await db
      .update(apps)
      .set(patch)
      .where(eq(apps.id, appId))
      .returning();

    await recordAdminAction({
      c,
      action: "app.source-code.verify",
      targetType: "app",
      targetId: appId,
      metadata: {
        sourceCodeVerified: body.sourceCodeVerified ?? null,
        reproducibleVerified: body.reproducibleVerified ?? null,
      },
    });

    return c.json(updated);
  },
);

// POST /admin/developers/:id/suspend — suspend a developer
adminRouter.post(
  "/admin/developers/:id/suspend",
  requireAdmin,
  zValidator("json", suspendSchema),
  async (c) => {
    const authUser = c.get("user");
    const developerId = c.req.param("id");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.id, developerId),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer not found" });
    }

    const moderator = await db.query.developers.findFirst({
      where: eq(developers.email, authUser.email),
    });

    const [updated] = await db
      .update(developers)
      .set({
        trustLevel: "suspended",
        suspensionReason: body.reason,
        updatedAt: new Date(),
      })
      .where(eq(developers.id, developerId))
      .returning();

    // Log moderation action
    if (moderator) {
      await db.insert(moderationActions).values({
        targetType: "developer",
        targetId: developerId,
        action: "suspend_developer",
        reason: body.reason,
        moderatorId: moderator.id,
      });
    }

    await notifyQueue.add("notify", {
      type: "developer_suspended",
      developerId,
      reason: body.reason,
      moderatorId: moderator?.id ?? null,
    });

    return c.json(updated);
  }
);

// POST /admin/developers/:id/reinstate — reinstate a suspended developer
adminRouter.post(
  "/admin/developers/:id/reinstate",
  requireAdmin,
  zValidator("json", approveRejectSchema),
  async (c) => {
    const authUser = c.get("user");
    const developerId = c.req.param("id");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.id, developerId),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer not found" });
    }

    const moderator = await db.query.developers.findFirst({
      where: eq(developers.email, authUser.email),
    });

    const [updated] = await db
      .update(developers)
      .set({
        trustLevel: "experimental",
        suspensionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(developers.id, developerId))
      .returning();

    // Log moderation action
    if (moderator) {
      await db.insert(moderationActions).values({
        targetType: "developer",
        targetId: developerId,
        action: "reinstate",
        reason: body.reason ?? "Developer reinstated",
        moderatorId: moderator.id,
      });
    }

    await notifyQueue.add("notify", {
      type: "developer_reinstated",
      developerId,
      reason: body.reason ?? null,
      moderatorId: moderator?.id ?? null,
    });

    return c.json(updated);
  }
);

/**
 * GET /admin/audit-log — admin-action forensic trail.
 *
 * Reads from `admin_actions` (every admin mutation lands there via
 * `recordAdminAction`). The legacy `moderation_actions` table is kept
 * for backwards compat but is no longer the source of truth — the
 * report/appeal resolve handlers now write to `admin_actions` instead.
 */
adminRouter.get(
  "/admin/audit-log",
  requireAdmin,
  zValidator(
    "query",
    auditLogQuerySchema.extend({
      action: z.string().optional(),
      actorId: z.string().optional(),
    }),
  ),
  async (c) => {
    const { page, limit, action, actorId } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const items = await db
      .select()
      .from(adminActions)
      .where(
        and(
          ...(action ? [eq(adminActions.action, action)] : []),
          ...(actorId ? [eq(adminActions.actorId, actorId)] : []),
        ),
      )
      .orderBy(desc(adminActions.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({ page, limit, data: items });
  },
);

// POST /admin/test-email — send a test email through the queue (any template)
const testEmailSchema = z.object({
  to: z.string().email(),
  template: z.enum([
    "welcome",
    "verify-email",
    "password-reset",
    "release-published",
    "release-rejected",
    "report-resolved",
    "developer-takedown",
    "review-response",
  ]),
});

adminRouter.post(
  "/admin/test-email",
  requireAdmin,
  zValidator("json", testEmailSchema),
  async (c) => {
    const { to, template } = c.req.valid("json");

    // Default props per template, sufficient to render an exemplar email.
    const propsByTemplate = {
      welcome: { recipientName: "Test User", ctaUrl: "https://openmarket.app" },
      "verify-email": {
        verifyUrl: "https://openmarket.app/verify?token=test",
        expiryMinutes: 60,
      },
      "password-reset": {
        resetUrl: "https://openmarket.app/reset?token=test",
        expiryMinutes: 30,
        ipAddress: "127.0.0.1",
      },
      "release-published": {
        appName: "TestApp",
        versionName: "1.0.0",
        versionCode: 1,
        releaseUrl: "https://openmarket.app/apps/com.test",
        riskScore: 12,
      },
      "release-rejected": {
        appName: "TestApp",
        versionName: "1.0.0",
        versionCode: 1,
        reason: "Test rejection — declared permissions don't match the manifest.",
        findings: ["Missing data-safety entry", "Below minimum SDK"],
        fixUrl: "https://dev.openmarket.app/apps/test",
        appealUrl: "https://dev.openmarket.app/apps/test/appeal",
      },
      "report-resolved": {
        reportId: "00000000-0000-0000-0000-000000000000",
        targetType: "app",
        resolution: "delisted" as const,
        notes: "Test resolution notes.",
        transparencyUrl: "https://openmarket.app/transparency-report",
      },
      "developer-takedown": {
        appName: "TestApp",
        reason: "Test takedown — repackaged copy.",
        ruleVersion: "v2026-01",
        rulesUrl: "https://openmarket.app/content-policy",
        appealUrl: "https://dev.openmarket.app/appeals/new",
        effectiveAt: new Date().toISOString().slice(0, 10),
      },
      "review-response": {
        appName: "TestApp",
        developerName: "Acme Inc.",
        responseBody: "Thanks for the feedback!",
        reviewUrl: "https://openmarket.app/apps/com.test#reviews",
      },
    } as const;

    const props = propsByTemplate[template];
    const result = await enqueueEmail({
      template,
      to,
      props: props as never,
      tags: [{ name: "category", value: "test" }],
    });

    return c.json({ success: true, jobId: result.jobId, template, to });
  },
);

// ───────── Review hold-back (anti-review-bombing) ─────────

/**
 * POST /admin/reviews/promote-due
 *
 * Idempotent. Promotes all reviews that:
 *   - have `publishedAt IS NULL` (still in cool-off)
 *   - are older than 24h
 *   - are not flagged
 *   - belong to apps that are NOT under review-freeze
 *
 * Designed for a periodic cron (Vercel cron + this admin endpoint, or a
 * worker tick). Returns the number of rows that flipped to published.
 *
 * The 24h hold-back gives the platform a window to detect coordinated
 * bombing or spam waves before any of those reviews become public —
 * with zero impact on the legitimate review experience.
 */
adminRouter.post("/admin/reviews/promote-due", requireAdmin, async (c) => {
  const { promoted, affectedApps } = await promoteDueReviews();
  await recordAdminAction({
    c,
    action: "reviews.promote-due",
    targetType: null,
    targetId: null,
    metadata: { promoted, affectedApps },
  });
  return c.json({ success: true, promoted, affectedApps });
});

const freezeToggleSchema = z.object({
  frozen: z.boolean(),
  /** Optional moderator note kept on the apps row's delistReason for audit trail. */
  reason: z.string().max(500).optional(),
});

/**
 * PATCH /admin/apps/:id/review-freeze
 *
 * Sets `apps.reviewFreeze`. While true, the promote-due job skips this
 * app's reviews — they remain invisible to the public. Used during
 * coordinated review-bombing investigations.
 */
adminRouter.patch(
  "/admin/apps/:id/review-freeze",
  requireAdmin,
  zValidator("json", freezeToggleSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app) throw new HTTPException(404, { message: "App not found" });

    const [updated] = await db
      .update(apps)
      .set({ reviewFreeze: body.frozen, updatedAt: new Date() })
      .where(eq(apps.id, appId))
      .returning();
    await recordAdminAction({
      c,
      action: body.frozen ? "reviews.freeze" : "reviews.unfreeze",
      targetType: "app",
      targetId: appId,
      metadata: { reasonProvided: !!body.reason, reason: body.reason ?? null },
    });
    return c.json({ id: updated!.id, reviewFreeze: updated!.reviewFreeze });
  },
);

/**
 * POST /admin/reviews/detect-bombs
 *
 * Scans every app for review-bomb signatures (>=25 reviews ≤2★ in
 * the last 60min combined with a ≥1.0 drop in rolling average vs the
 * prior 30 days). Auto-freezes any app that newly matches and
 * records an admin_actions row per freeze for moderator review.
 *
 * Idempotent — safe to schedule every 5–10 minutes. Already-frozen
 * apps that match are NOT re-recorded (we'd flood the audit log).
 *
 * Returns the verdicts so the admin dashboard can surface
 * the offending apps alongside the count + drop signal.
 */
adminRouter.post("/admin/reviews/detect-bombs", requireAdmin, async (c) => {
  const { runBombDetectionAndFreeze } = await import("../lib/review-moderation");
  const frozen = await runBombDetectionAndFreeze();
  for (const v of frozen) {
    await recordAdminAction({
      c,
      action: "reviews.auto-freeze",
      targetType: "app",
      targetId: v.appId,
      metadata: {
        recentLowStarCount: v.recentLowStarCount,
        recentAvg: Number(v.recentAvg.toFixed(2)),
        baselineAvg: Number(v.baselineAvg.toFixed(2)),
        drop: Number(v.drop.toFixed(2)),
      },
    });
  }
  return c.json({
    success: true,
    frozenCount: frozen.length,
    frozen,
  });
});

/**
 * GET /admin/reviews/bomb-signals
 *
 * Read-only dashboard surface. Returns the same verdicts the
 * detector uses, but doesn't flip anything. Used by the admin app's
 * "Watch list" panel so moderators can see emerging signals before
 * the auto-freeze threshold trips.
 */
adminRouter.get("/admin/reviews/bomb-signals", requireAdmin, async (c) => {
  const { findReviewBombs, DEFAULT_BOMB_CONFIG } = await import(
    "../lib/review-moderation"
  );
  // Surface anything with at least HALF the bomb threshold so the
  // dashboard shows early-warning signals.
  const watchConfig = {
    ...DEFAULT_BOMB_CONFIG,
    minLowStarCount: Math.floor(DEFAULT_BOMB_CONFIG.minLowStarCount / 2),
    minAverageDrop: 0.5,
  };
  const verdicts = await findReviewBombs(watchConfig);
  return c.json({ items: verdicts });
});

// ───────── Emergency takedown + re-scan (malware response path) ─────────

const takedownSchema = z.object({
  reason: z.string().min(10, "Takedown reason must be substantive").max(2000),
});

/**
 * POST /admin/apps/:id/takedown — the kill switch.
 *
 * One call, atomically: delists the app, halts every live/paused rollout
 * (so the device delivery endpoints refuse further downloads), pushes the
 * search index, and appends a public transparency event. This is the
 * response path when a published app turns out to be malicious.
 */
adminRouter.post(
  "/admin/apps/:id/takedown",
  requireAdmin,
  zValidator("json", takedownSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const { reason } = c.req.valid("json");

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app) throw new HTTPException(404, { message: "App not found" });
    if (app.isDelisted) {
      return c.json({ success: true, alreadyDelisted: true, haltedReleases: [] });
    }

    // Append the PUBLIC transparency record FIRST, before mutating any
    // state. If this throws, nothing is delisted yet and the admin can
    // retry cleanly — we never end up with an app pulled from the store
    // but missing from the public log (the DSA record and the action
    // must not diverge). appendTransparencyEvent runs its own
    // serializable tx, so it can't join the delist tx below.
    await appendTransparencyEvent({
      eventType: "app_takedown",
      targetType: "app",
      targetId: appId,
      reason,
    });

    const haltedReleases: string[] = [];
    await db.transaction(async (tx) => {
      await tx
        .update(apps)
        .set({ isDelisted: true, delistReason: reason, updatedAt: new Date() })
        .where(eq(apps.id, appId));

      const activeReleases = await tx
        .select({
          id: releases.id,
          rolloutPercentage: releases.rolloutPercentage,
        })
        .from(releases)
        .where(
          and(
            eq(releases.appId, appId),
            inArray(releases.rolloutStatus, ["live", "paused"]),
          ),
        );

      for (const rel of activeReleases) {
        await tx
          .update(releases)
          .set({ rolloutStatus: "halted", updatedAt: new Date() })
          .where(eq(releases.id, rel.id));
        await tx.insert(releaseRollouts).values({
          releaseId: rel.id,
          percentage: rel.rolloutPercentage ?? 100,
          status: "halted",
          reason: `App takedown: ${reason}`,
          actorId: null,
        });
        haltedReleases.push(rel.id);
      }
    });

    // Search stays consistent even if this sync fails — the search route
    // re-checks isDelisted against Postgres on every request.
    try {
      await syncAppToSearchIndex(appId);
    } catch (err) {
      console.error("[admin] search index sync after takedown failed:", err);
    }

    // Notify the developer with a real templated email (not the loosely
    // shaped {type} notify job the older delist paths enqueue). Fire-and-
    // forget so a queue hiccup can't fail the takedown itself.
    try {
      const developer = await db.query.developers.findFirst({
        where: eq(developers.id, app.developerId),
      });
      const listing = app.currentListingId
        ? await db.query.appListings.findFirst({
            where: eq(appListings.id, app.currentListingId),
          })
        : null;
      const webBase = process.env.WEB_BASE_URL ?? "https://openmarket.app";
      const devBase = process.env.DEV_PORTAL_URL ?? "https://dev.openmarket.app";
      if (developer?.email) {
        await enqueueEmail({
          template: "developer-takedown",
          to: developer.email,
          props: {
            appName: listing?.title ?? app.packageName,
            reason,
            ruleVersion: CURRENT_CONTENT_POLICY_VERSION,
            rulesUrl: `${webBase}/content-policy`,
            appealUrl: `${devBase}/appeals/new`,
            effectiveAt: new Date().toISOString().slice(0, 10),
          },
          idempotencyKey: `takedown:${appId}`,
        });
      }
    } catch (err) {
      console.error("[admin] takedown developer notification enqueue failed:", err);
    }

    await recordAdminAction({
      c,
      action: "app.takedown",
      targetType: "app",
      targetId: appId,
      metadata: { reason, haltedReleases },
    });

    return c.json({ success: true, alreadyDelisted: false, haltedReleases });
  },
);

/**
 * POST /admin/releases/:id/rescan — re-enqueue the security scan for a
 * release's latest verified artifact. Used after signature-database
 * updates (new ClamAV defs, fresh VirusTotal verdicts) to re-check apps
 * that were already scanned — malware defense is continuous, not
 * one-shot at upload time.
 */
adminRouter.post("/admin/releases/:id/rescan", requireAdmin, async (c) => {
  const releaseId = c.req.param("id") as string;

  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
  });
  if (!release) throw new HTTPException(404, { message: "Release not found" });

  const [artifact] = await db
    .select()
    .from(releaseArtifacts)
    .where(
      and(
        eq(releaseArtifacts.releaseId, releaseId),
        eq(releaseArtifacts.uploadStatus, "verified"),
      ),
    )
    .orderBy(desc(releaseArtifacts.createdAt))
    .limit(1);
  if (!artifact) {
    throw new HTTPException(404, {
      message: "Release has no verified artifact to re-scan",
    });
  }

  await scanQueue.add("scan", { releaseId, artifactId: artifact.id });

  await recordAdminAction({
    c,
    action: "release.rescan",
    targetType: "release",
    targetId: releaseId,
    metadata: { artifactId: artifact.id },
  });

  return c.json({ success: true, enqueued: { releaseId, artifactId: artifact.id } });
});
