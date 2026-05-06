import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import {
  apps,
  developers,
  reports,
  reviews,
  users,
} from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { rateLimit } from "../middleware/rate-limit";
import { enqueueEmail } from "../lib/email";
import {
  CURRENT_CONTENT_POLICY_VERSION,
  appendTransparencyEvent,
} from "../lib/transparency";
import { recordAdminAction } from "../lib/audit";
import type { Variables } from "../lib/types";

export const reportsRouter = new Hono<{ Variables: Variables }>();

const createReportSchema = z.object({
  targetType: z.enum(["app", "release", "developer", "review"]),
  targetId: z.string().uuid(),
  reportType: z.enum([
    "malware",
    "scam",
    "impersonation",
    "illegal",
    "spam",
    "broken",
    "other",
  ]),
  description: z.string().min(1).max(4000),
});

const listQuerySchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "dismissed"]).optional(),
  type: z
    .enum(["malware", "scam", "impersonation", "illegal", "spam", "broken", "other"])
    .optional(),
  targetType: z.enum(["app", "release", "developer", "review"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const resolveSchema = z.object({
  /**
   * delist     → app: app.isDelisted=true, transparency event, takedown email,
   *              status=resolved.
   *              review: review.isFlagged=true (hides it), transparency event,
   *              status=resolved.
   * warn       → no DB change to target, status=resolved with notes; email
   *              the developer (if app/release/developer target).
   * dismiss    → no action, status=dismissed.
   */
  resolution: z.enum(["delist", "warn", "dismiss"]),
  notes: z.string().max(4000).optional(),
});

const bulkResolveSchema = z.object({
  reportIds: z.array(z.string().uuid()).min(1).max(50),
  resolution: z.enum(["dismiss"]), // bulk only allows dismiss for safety
  notes: z.string().max(2000).optional(),
});

async function findOrCreateProfile(authUserId: string, email: string) {
  const existing = await db.query.users.findFirst({
    where: eq(users.authUserId, authUserId),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ authUserId, email: email.toLowerCase() })
    .onConflictDoUpdate({ target: users.email, set: { authUserId } })
    .returning();
  return created!;
}

/**
 * POST /reports — submit a report (any signed-in user can report any
 * target type). Rate limiting applied at the gateway layer.
 */
reportsRouter.post(
  "/reports",
  requireAuth,
  // 5 reports / hour / signed-in user. Reports are mostly low-volume +
  // moderator-time-expensive; a tight cap deters abuse without
  // affecting honest users.
  rateLimit({ windowSec: 3600, max: 5, by: "user", bucket: "reports" }),
  zValidator("json", createReportSchema),
  async (c) => {
    const authUser = c.get("user");
    const body = c.req.valid("json");
    const profile = await findOrCreateProfile(authUser.id, authUser.email);

    const [report] = await db
      .insert(reports)
      .values({
        targetType: body.targetType,
        targetId: body.targetId,
        reporterId: profile.id,
        reportType: body.reportType,
        description: body.description,
      })
      .returning();

    return c.json({ id: report!.id, status: report!.status }, 201);
  },
);

/**
 * GET /admin/reports?status=&type=&targetType=&page=&limit=
 * Admin-only paginated queue with filters + counts per status.
 */
reportsRouter.get(
  "/admin/reports",
  requireAdmin,
  zValidator("query", listQuerySchema),
  async (c) => {
    const { status, type, targetType, page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const where = and(
      ...(status ? [eq(reports.status, status)] : []),
      ...(type ? [eq(reports.reportType, type)] : []),
      ...(targetType ? [eq(reports.targetType, targetType)] : []),
    );

    const items = await db
      .select()
      .from(reports)
      .where(where)
      .orderBy(desc(reports.createdAt))
      .limit(limit)
      .offset(offset);

    // Count per status for the queue header (kept cheap with a single GROUP BY).
    const statusCounts = await db
      .select({
        status: reports.status,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(reports)
      .groupBy(reports.status);

    const counts: Record<string, number> = {
      open: 0, investigating: 0, resolved: 0, dismissed: 0,
    };
    for (const row of statusCounts) counts[row.status] = Number(row.count);

    return c.json({ items, page, limit, counts });
  },
);

/**
 * POST /admin/reports/:id/resolve — single-report resolution with side effects.
 *
 * Per §2 principle 2: every resolution that affects what users see writes
 * a transparency_events row. The mod also gets a moderation_actions audit
 * (separate concern; that's the internal log).
 */
reportsRouter.post(
  "/admin/reports/:id/resolve",
  requireAdmin,
  zValidator("json", resolveSchema),
  async (c) => {
    const reportId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const adminUser = c.get("user");

    const report = await db.query.reports.findFirst({
      where: eq(reports.id, reportId),
    });
    if (!report) throw new HTTPException(404, { message: "Report not found" });

    if (report.status === "resolved" || report.status === "dismissed") {
      throw new HTTPException(409, {
        message: "Report is already resolved or dismissed",
      });
    }

    const reasonText = body.notes?.trim() ?? "";
    const resolutionStatus =
      body.resolution === "dismiss" ? "dismissed" : "resolved";
    const reasonGiven = reasonText || "Violates content policy";

    // Atomicity: the report-status update and the target-state mutation
    // (delist app / hide review) live in the same txn so a process crash
    // can't leave the report flagged "resolved" with the target unchanged.
    // The transparency event + emails run outside the txn — losing them
    // on a crash is recoverable; a half-applied delist is not.
    let delistedAppId: string | null = null;
    let removedReviewId: string | null = null;
    await db.transaction(async (tx) => {
      await tx
        .update(reports)
        .set({
          status: resolutionStatus,
          resolutionNotes: reasonText,
          resolvedAt: new Date(),
        })
        .where(eq(reports.id, reportId));

      if (body.resolution === "delist") {
        if (report.targetType === "app") {
          const app = await tx.query.apps.findFirst({
            where: eq(apps.id, report.targetId),
          });
          if (app) {
            await tx
              .update(apps)
              .set({
                isDelisted: true,
                delistReason: reasonGiven,
                updatedAt: new Date(),
              })
              .where(eq(apps.id, app.id));
            delistedAppId = app.id;
          }
        } else if (report.targetType === "review") {
          await tx
            .update(reviews)
            .set({ isFlagged: true, updatedAt: new Date() })
            .where(eq(reviews.id, report.targetId));
          removedReviewId = report.targetId;
        }
      }
    });

    // Side effects (transparency log + notifications) run *after* the
    // atomic state change. Each is best-effort and self-logged on
    // failure so a recovery tool can replay them later.
    if (body.resolution === "delist") {
      await applyDelistSideEffects({
        report,
        notes: reasonGiven,
        adminEmail: adminUser.email,
        delistedAppId,
        removedReviewId,
      });
    } else if (body.resolution === "warn") {
      await applyWarnSideEffects({ report, notes: reasonText });
    } else {
      // dismiss — notify reporter so they know we read it.
      await notifyReporter({
        report,
        resolution: "dismissed",
        notes: reasonText,
      });
    }

    await recordAdminAction({
      c,
      action: `report.resolve.${body.resolution}`,
      targetType: "report",
      targetId: reportId,
      metadata: {
        resolution: body.resolution,
        reportTargetType: report.targetType,
        reportTargetId: report.targetId,
        // notes captured in moderation_actions / transparency separately;
        // the audit row stores the slug for filtering, not the verbatim
        // PII-bearing text.
        notesProvided: reasonText.length > 0,
      },
    });

    return c.json({ success: true, reportId, resolution: body.resolution });
  },
);

/**
 * POST /admin/reports/bulk-dismiss — bulk dismiss N reports.
 * Bulk-delist is intentionally NOT supported — that needs per-report review.
 */
reportsRouter.post(
  "/admin/reports/bulk-dismiss",
  requireAdmin,
  zValidator("json", bulkResolveSchema),
  async (c) => {
    const body = c.req.valid("json");

    const targetReports = await db
      .select()
      .from(reports)
      .where(
        and(
          inArray(reports.id, body.reportIds),
          inArray(reports.status, ["open", "investigating"]),
        ),
      );

    await db
      .update(reports)
      .set({
        status: "dismissed",
        resolutionNotes: body.notes ?? "",
        resolvedAt: new Date(),
      })
      .where(
        and(
          inArray(reports.id, body.reportIds),
          inArray(reports.status, ["open", "investigating"]),
        ),
      );

    // Best-effort reporter emails (one per report).
    for (const r of targetReports) {
      try {
        await notifyReporter({ report: r, resolution: "dismissed", notes: body.notes ?? "" });
      } catch {
        // ignore per-report email failure
      }
    }

    await recordAdminAction({
      c,
      action: "report.resolve.bulk-dismiss",
      targetType: "report",
      targetId: null,
      metadata: {
        reportIds: body.reportIds,
        dismissedCount: targetReports.length,
      },
    });

    return c.json({ success: true, dismissedCount: targetReports.length });
  },
);

// ───────── side-effect helpers ─────────

async function applyDelistSideEffects(opts: {
  report: typeof reports.$inferSelect;
  notes: string;
  adminEmail: string;
  delistedAppId: string | null;
  removedReviewId: string | null;
}) {
  const { report, notes, adminEmail, delistedAppId, removedReviewId } = opts;
  const reasonGiven = notes;

  if (report.targetType === "app") {
    if (delistedAppId === null) {
      // App vanished between report creation and resolution — still
      // record the public decision with a footnote.
      await appendTransparencyEvent({
        eventType: "app_delisted",
        targetType: "app",
        targetId: report.targetId,
        reason: reasonGiven + " (target app no longer found at resolution time)",
        ruleVersion: CURRENT_CONTENT_POLICY_VERSION,
        sourceReportId: report.id,
      });
      return;
    }

    await appendTransparencyEvent({
      eventType: "app_delisted",
      targetType: "app",
      targetId: delistedAppId,
      reason: reasonGiven,
      sourceReportId: report.id,
    });

    await Promise.allSettled([
      notifyReporter({ report, resolution: "delisted", notes: reasonGiven }),
      notifyDeveloperOfTakedown({ appId: delistedAppId, reason: reasonGiven, adminEmail }),
    ]);
    return;
  }

  if (report.targetType === "review") {
    await appendTransparencyEvent({
      eventType: "review_removed",
      targetType: "review",
      targetId: removedReviewId ?? report.targetId,
      reason: reasonGiven,
      sourceReportId: report.id,
    });

    await notifyReporter({ report, resolution: "delisted", notes: reasonGiven });
    return;
  }

  // For other target types (release, developer) we just log the decision
  // without an additional DB mutation here. Those flows land in dedicated
  // endpoints (release rollback, developer suspend) when we ship them.
  await appendTransparencyEvent({
    eventType: `${report.targetType}_action`,
    targetType: report.targetType as "app" | "developer" | "review",
    targetId: report.targetId,
    reason: reasonGiven,
    sourceReportId: report.id,
  });
  await notifyReporter({ report, resolution: "delisted", notes: reasonGiven });
}

async function applyWarnSideEffects(opts: {
  report: typeof reports.$inferSelect;
  notes: string;
}) {
  await notifyReporter({
    report: opts.report,
    resolution: "warned",
    notes: opts.notes,
  });
  // No transparency event for "warn" — internal action only.
  // Internal moderation_actions row would go here if we wired moderator IDs through.
}

async function notifyReporter(opts: {
  report: typeof reports.$inferSelect;
  resolution: "delisted" | "warned" | "dismissed";
  notes: string;
}) {
  const reporter = await db.query.users.findFirst({
    where: eq(users.id, opts.report.reporterId),
  });
  if (!reporter) return;
  try {
    await enqueueEmail({
      template: "report-resolved",
      to: reporter.email,
      props: {
        reportId: opts.report.id,
        targetType: opts.report.targetType,
        resolution: opts.resolution,
        notes: opts.notes,
        transparencyUrl: "https://openmarket.app/transparency-report",
      },
      idempotencyKey: `report-resolved_${opts.report.id}`,
      tags: [{ name: "category", value: "trust-safety" }],
    });
  } catch (err) {
    console.error("notifyReporter failed:", err);
  }
}

async function notifyDeveloperOfTakedown(opts: {
  appId: string;
  reason: string;
  adminEmail: string;
}) {
  const app = await db.query.apps.findFirst({ where: eq(apps.id, opts.appId) });
  if (!app) return;
  const dev = await db.query.developers.findFirst({
    where: eq(developers.id, app.developerId),
  });
  if (!dev) return;
  try {
    await enqueueEmail({
      template: "developer-takedown",
      to: dev.email,
      props: {
        appName: app.packageName,
        reason: opts.reason,
        ruleVersion: CURRENT_CONTENT_POLICY_VERSION,
        rulesUrl: "https://openmarket.app/content-policy",
        appealUrl: `https://dev.openmarket.app/apps/${app.id}/appeal`,
        effectiveAt: new Date().toISOString().slice(0, 10),
      },
      idempotencyKey: `takedown_${app.id}`,
      tags: [{ name: "category", value: "trust-safety" }],
    });
  } catch (err) {
    console.error("notifyDeveloperOfTakedown failed:", err);
  }
}

// ───────── Public transparency log ─────────

const transparencyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  eventType: z.string().optional(),
  targetType: z.enum(["app", "developer", "review", "platform"]).optional(),
});

reportsRouter.get(
  "/transparency-events",
  zValidator("query", transparencyQuerySchema),
  async (c) => {
    const { page, limit, eventType, targetType } = c.req.valid("query");
    const offset = (page - 1) * limit;

    // Late import so transparency module side effects don't load on every API request.
    const { transparencyEvents } = await import("@openmarket/db/schema");
    const filters = and(
      ...(eventType ? [eq(transparencyEvents.eventType, eventType)] : []),
      ...(targetType ? [eq(transparencyEvents.targetType, targetType)] : []),
    );

    const items = await db
      .select()
      .from(transparencyEvents)
      .where(filters)
      .orderBy(desc(transparencyEvents.createdAt))
      .limit(limit)
      .offset(offset);

    const countRows = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(transparencyEvents)
      .where(filters);
    const total = Number(countRows[0]?.count ?? 0);

    return c.json({ items, page, limit, total });
  },
);

// ───────── Legacy compat: keep old admin GET / PATCH for transition ─────────

reportsRouter.get("/reports", requireAdmin, async (c) => {
  const status = c.req.query("status") as
    | "open"
    | "investigating"
    | "resolved"
    | "dismissed"
    | undefined;
  const allReports = await db.query.reports.findMany({
    where: status ? eq(reports.status, status) : undefined,
  });
  return c.json(allReports);
});
