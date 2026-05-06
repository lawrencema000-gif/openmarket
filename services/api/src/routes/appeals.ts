import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import {
  appeals,
  apps,
  developers,
  reviews,
} from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { enqueueEmail } from "../lib/email";
import { appendTransparencyEvent } from "../lib/transparency";
import { recordAdminAction } from "../lib/audit";
import type { Variables } from "../lib/types";

export const appealsRouter = new Hono<{ Variables: Variables }>();

const submitAppealSchema = z.object({
  targetType: z.enum(["app_delisting", "developer_ban", "review_removal"]),
  targetId: z.string().uuid(),
  body: z.string().min(20).max(4000),
});

const listAdminQuerySchema = z.object({
  status: z.enum(["open", "in_review", "accepted", "rejected"]).optional(),
  targetType: z
    .enum(["app_delisting", "developer_ban", "review_removal"])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const resolveSchema = z.object({
  resolution: z.enum(["accept", "reject"]),
  notes: z.string().min(10).max(4000),
});

async function requireDeveloper(email: string): Promise<{
  id: string;
  email: string;
  displayName: string | null;
}> {
  const dev = await db.query.developers.findFirst({
    where: eq(developers.email, email),
  });
  if (!dev) {
    throw new HTTPException(403, {
      message: "Only developers can submit appeals",
    });
  }
  return { id: dev.id, email: dev.email, displayName: dev.displayName };
}

/**
 * POST /developers/me/appeals — submit an appeal against a moderation
 * decision. Validates that the target actually concerns this developer
 * (e.g., for app_delisting, the app must belong to them).
 *
 * One open appeal per (developerId, targetType, targetId) — duplicate
 * submissions get 409 with a pointer to the existing one.
 */
appealsRouter.post(
  "/developers/me/appeals",
  requireAuth,
  zValidator("json", submitAppealSchema),
  async (c) => {
    const authUser = c.get("user");
    const body = c.req.valid("json");
    const developer = await requireDeveloper(authUser.email);

    // Authorization check: the appealed target must be tied to this developer.
    if (body.targetType === "app_delisting") {
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, body.targetId),
      });
      if (!app || app.developerId !== developer.id) {
        throw new HTTPException(403, {
          message: "You can only appeal decisions about your own apps",
        });
      }
      if (!app.isDelisted) {
        throw new HTTPException(409, {
          message: "Nothing to appeal — this app isn't delisted",
        });
      }
    } else if (body.targetType === "developer_ban") {
      // Self-target only.
      if (body.targetId !== developer.id) {
        throw new HTTPException(403, {
          message: "You can only appeal a ban against your own account",
        });
      }
    } else if (body.targetType === "review_removal") {
      // Reviews are removed via reviews.isFlagged. The appealed review
      // must be on an app owned by the appealing developer.
      const review = await db.query.reviews.findFirst({
        where: eq(reviews.id, body.targetId),
      });
      if (!review) {
        throw new HTTPException(404, { message: "Review not found" });
      }
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, review.appId),
      });
      if (!app || app.developerId !== developer.id) {
        throw new HTTPException(403, {
          message: "You can only appeal review removals on your own apps",
        });
      }
    }

    // Dedup: any existing open/in_review appeal for the same target?
    const existing = await db.query.appeals.findFirst({
      where: and(
        eq(appeals.developerId, developer.id),
        eq(appeals.targetType, body.targetType),
        eq(appeals.targetId, body.targetId),
      ),
    });
    if (existing && (existing.status === "open" || existing.status === "in_review")) {
      throw new HTTPException(409, {
        message:
          "You already have an open appeal for this decision. We'll respond within 5 business days.",
      });
    }

    const [created] = await db
      .insert(appeals)
      .values({
        developerId: developer.id,
        targetType: body.targetType,
        targetId: body.targetId,
        body: body.body,
      })
      .returning();

    return c.json(
      {
        id: created!.id,
        status: created!.status,
        createdAt: created!.createdAt,
      },
      201,
    );
  },
);

/**
 * GET /developers/me/appeals — developer's own appeal history.
 */
appealsRouter.get("/developers/me/appeals", requireAuth, async (c) => {
  const authUser = c.get("user");
  const developer = await requireDeveloper(authUser.email);

  const items = await db
    .select()
    .from(appeals)
    .where(eq(appeals.developerId, developer.id))
    .orderBy(desc(appeals.createdAt));

  return c.json({ items });
});

/**
 * GET /admin/appeals — admin queue with filters + per-status counts.
 */
appealsRouter.get(
  "/admin/appeals",
  requireAdmin,
  zValidator("query", listAdminQuerySchema),
  async (c) => {
    const { status, targetType, page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const where = and(
      ...(status ? [eq(appeals.status, status)] : []),
      ...(targetType ? [eq(appeals.targetType, targetType)] : []),
    );

    const items = await db
      .select()
      .from(appeals)
      .where(where)
      .orderBy(desc(appeals.createdAt))
      .limit(limit)
      .offset(offset);

    const counts = await db
      .select({
        status: appeals.status,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(appeals)
      .groupBy(appeals.status);

    const statusCounts: Record<string, number> = {
      open: 0, in_review: 0, accepted: 0, rejected: 0,
    };
    for (const r of counts) statusCounts[r.status] = Number(r.count);

    return c.json({ items, page, limit, counts: statusCounts });
  },
);

/**
 * POST /admin/appeals/:id/resolve — accept or reject.
 *
 * On accept:
 *   - app_delisting   → app.isDelisted=false, app.delistReason=null,
 *                       transparency event "app_relisted".
 *   - developer_ban   → (suspension flag flip — not yet wired into
 *                       developers schema; logged for visibility).
 *   - review_removal  → review.isFlagged=false, transparency event
 *                       "review_restored".
 *   In all cases, the developer gets an email with the resolution.
 *
 * On reject:
 *   - status=rejected, resolution=notes, public transparency event
 *     "appeal_rejected" so the community can see we considered it.
 *   - Email the developer with the final written reason.
 */
appealsRouter.post(
  "/admin/appeals/:id/resolve",
  requireAdmin,
  zValidator("json", resolveSchema),
  async (c) => {
    const id = c.req.param("id") as string;
    const body = c.req.valid("json");
    const adminUser = c.get("user");

    const appeal = await db.query.appeals.findFirst({
      where: eq(appeals.id, id),
    });
    if (!appeal) throw new HTTPException(404, { message: "Appeal not found" });
    if (appeal.status === "accepted" || appeal.status === "rejected") {
      throw new HTTPException(409, {
        message: "Appeal is already resolved",
      });
    }

    const newStatus = body.resolution === "accept" ? "accepted" : "rejected";

    // Resolve first so side effects run against settled state.
    await db
      .update(appeals)
      .set({
        status: newStatus,
        resolution: body.notes,
        resolvedBy: null, // moderatorId wiring lives in admin middleware (TODO)
        resolvedAt: new Date(),
      })
      .where(eq(appeals.id, id));

    if (body.resolution === "accept") {
      await applyAcceptance({ appeal, notes: body.notes });
    } else {
      await applyRejection({ appeal, notes: body.notes });
    }

    await recordAdminAction({
      c,
      action: `appeal.resolve.${body.resolution}`,
      targetType: "appeal",
      targetId: id,
      metadata: {
        resolution: body.resolution,
        appealTargetType: appeal.targetType,
        appealTargetId: appeal.targetId,
        appealDeveloperId: appeal.developerId,
      },
    });

    return c.json({
      success: true,
      appealId: id,
      resolution: body.resolution,
      adminEmail: adminUser.email,
    });
  },
);

// ───────── Side effects ─────────

async function applyAcceptance(opts: {
  appeal: typeof appeals.$inferSelect;
  notes: string;
}) {
  const { appeal, notes } = opts;
  const responseTimeMs =
    appeal.createdAt instanceof Date
      ? Date.now() - appeal.createdAt.getTime()
      : null;

  if (appeal.targetType === "app_delisting") {
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appeal.targetId),
    });
    if (app) {
      await db
        .update(apps)
        .set({
          isDelisted: false,
          delistReason: null,
          updatedAt: new Date(),
        })
        .where(eq(apps.id, app.id));
    }
    await appendTransparencyEvent({
      eventType: "app_relisted",
      targetType: "app",
      targetId: appeal.targetId,
      reason: `Reinstated on appeal: ${notes}`,
      sourceAppealId: appeal.id,
      responseTimeMs,
    });
  } else if (appeal.targetType === "review_removal") {
    await db
      .update(reviews)
      .set({ isFlagged: false, updatedAt: new Date() })
      .where(eq(reviews.id, appeal.targetId));
    await appendTransparencyEvent({
      eventType: "review_restored",
      targetType: "review",
      targetId: appeal.targetId,
      reason: `Restored on appeal: ${notes}`,
      sourceAppealId: appeal.id,
      responseTimeMs,
    });
  } else if (appeal.targetType === "developer_ban") {
    // Developer suspension flag isn't wired into the developers schema
    // yet (P2 item); log the appeal acceptance regardless so the public
    // record exists.
    await appendTransparencyEvent({
      eventType: "developer_reinstated",
      targetType: "developer",
      targetId: appeal.targetId,
      reason: `Reinstated on appeal: ${notes}`,
      sourceAppealId: appeal.id,
      responseTimeMs,
    });
  }

  await notifyDeveloperOfAppealOutcome({
    developerId: appeal.developerId,
    appeal,
    accepted: true,
    notes,
  });
}

async function applyRejection(opts: {
  appeal: typeof appeals.$inferSelect;
  notes: string;
}) {
  const { appeal, notes } = opts;
  const responseTimeMs =
    appeal.createdAt instanceof Date
      ? Date.now() - appeal.createdAt.getTime()
      : null;

  // Per §2 principle 3: rejected appeals get a public transparency
  // entry too — "we considered this and stand by the original decision".
  await appendTransparencyEvent({
    eventType: "appeal_rejected",
    targetType:
      appeal.targetType === "review_removal"
        ? "review"
        : appeal.targetType === "developer_ban"
          ? "developer"
          : "app",
    targetId: appeal.targetId,
    reason: `Appeal denied: ${notes}`,
    sourceAppealId: appeal.id,
    responseTimeMs,
  });

  await notifyDeveloperOfAppealOutcome({
    developerId: appeal.developerId,
    appeal,
    accepted: false,
    notes,
  });
}

async function notifyDeveloperOfAppealOutcome(opts: {
  developerId: string;
  appeal: typeof appeals.$inferSelect;
  accepted: boolean;
  notes: string;
}) {
  const dev = await db.query.developers.findFirst({
    where: eq(developers.id, opts.developerId),
  });
  if (!dev) return;
  // Reuse the developer-takedown template for now — same shape, just
  // different reason text. A dedicated "appeal-resolved" template lands
  // in a polish pass.
  try {
    await enqueueEmail({
      template: "developer-takedown",
      to: dev.email,
      props: {
        appName: opts.appeal.targetType.replace(/_/g, " "),
        reason: opts.accepted
          ? `Appeal accepted. Resolution: ${opts.notes}`
          : `Appeal rejected. Final response: ${opts.notes}`,
        ruleVersion: "v2026.04.30",
        rulesUrl: "https://openmarket.app/content-policy",
        appealUrl: "https://dev.openmarket.app/appeals",
        effectiveAt: new Date().toISOString().slice(0, 10),
      },
      idempotencyKey: `appeal_${opts.appeal.id}`,
      tags: [{ name: "category", value: "trust-safety" }],
    });
  } catch (err) {
    console.error("notifyDeveloperOfAppealOutcome failed:", err);
  }
}
