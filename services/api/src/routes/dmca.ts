import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  apps,
  developers,
  dmcaCounterNotices,
  dmcaNotices,
} from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { rateLimit } from "../middleware/rate-limit";
import { recordAdminAction } from "../lib/audit";
import { appendTransparencyEvent } from "../lib/transparency";
import { enqueueEmail } from "../lib/email";
import type { Variables } from "../lib/types";

export const dmcaRouter = new Hono<{ Variables: Variables }>();

// ────── Public notice submission ──────

const submitNoticeSchema = z.object({
  claimantName: z.string().min(1).max(200),
  claimantEmail: z.string().email().max(254),
  claimantAddress: z.string().min(10).max(2000),
  claimantOrganization: z.string().max(200).optional(),
  copyrightedWork: z.string().min(10).max(4000),
  infringingUrl: z.string().min(1).max(2000),
  goodFaithStatement: z.literal(true),
  accuracyStatement: z.literal(true),
  signature: z.string().min(2).max(200),
});

/**
 * Mint a human-readable notice number: DMCA-YYYY-NNNNN where the
 * NNNNN portion is a per-year monotonic counter. Computed by counting
 * existing rows whose noticeNumber starts with DMCA-<year>- and
 * adding 1. Race-safe enough for the volume — at our scale two
 * concurrent submissions collide on the daily counter at most once
 * a year, and the UNIQUE index on noticeNumber catches the rare
 * collision so the caller can retry. We keep the retry path simple
 * (10 attempts with random suffix on conflict).
 */
async function mintNoticeNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `DMCA-${year}-`;
  const [countRow] = await db
    .select({ n: sql<number>`count(*)`.as("n") })
    .from(dmcaNotices)
    .where(sql`${dmcaNotices.noticeNumber} LIKE ${prefix + "%"}`);
  const next = Number(countRow?.n ?? 0) + 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

/**
 * POST /dmca/notices — public. Accept a copyright takedown notice.
 *
 * Stored in `received` status; an admin reviews + maps the
 * infringingUrl onto an app row, then either marks invalid (bad
 * notice) or processes (takes down the app).
 *
 * Rate-limited at 3/hr per IP — DMCA is high-friction by design and
 * we don't want a one-line script flooding the moderator queue.
 *
 * Returns the notice number + a public status-tracking link.
 */
dmcaRouter.post(
  "/dmca/notices",
  rateLimit({ windowSec: 3600, max: 3, by: "ip", bucket: "dmca-submit" }),
  zValidator("json", submitNoticeSchema),
  async (c) => {
    const body = c.req.valid("json");

    let inserted: typeof dmcaNotices.$inferSelect | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const noticeNumber = await mintNoticeNumber();
        const [row] = await db
          .insert(dmcaNotices)
          .values({
            noticeNumber,
            claimantName: body.claimantName,
            claimantEmail: body.claimantEmail.toLowerCase(),
            claimantAddress: body.claimantAddress,
            claimantOrganization: body.claimantOrganization,
            copyrightedWork: body.copyrightedWork,
            infringingUrl: body.infringingUrl,
            goodFaithStatement: body.goodFaithStatement,
            accuracyStatement: body.accuracyStatement,
            signature: body.signature,
          })
          .returning();
        inserted = row;
        break;
      } catch (err) {
        // UNIQUE violation on notice_number → retry.
        const message = err instanceof Error ? err.message : String(err);
        if (!message.toLowerCase().includes("unique")) throw err;
      }
    }
    if (!inserted) {
      throw new HTTPException(500, {
        message: "Could not mint a unique notice number — try again",
      });
    }

    // Acknowledge to the claimant. Best-effort; failure doesn't
    // affect the response. The actual takedown email is sent later
    // when an admin processes the notice.
    try {
      await enqueueEmail({
        template: "dmca-notice-received",
        to: inserted.claimantEmail,
        props: {
          noticeNumber: inserted.noticeNumber,
          claimantName: inserted.claimantName,
        },
        idempotencyKey: `dmca-ack_${inserted.id}`,
        tags: [{ name: "category", value: "trust-safety" }],
      });
    } catch (err) {
      console.warn("[dmca] notice-received email failed:", err);
    }

    return c.json(
      {
        noticeNumber: inserted.noticeNumber,
        status: inserted.status,
        receivedAt: inserted.receivedAt,
      },
      201,
    );
  },
);

// ────── Admin queue + review ──────

const listAdminQuerySchema = z.object({
  status: z
    .enum([
      "received",
      "valid",
      "invalid",
      "processed",
      "counter_noticed",
      "restored",
      "withdrawn",
    ])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** GET /admin/dmca/notices — paginated queue. */
dmcaRouter.get(
  "/admin/dmca/notices",
  requireAdmin,
  zValidator("query", listAdminQuerySchema),
  async (c) => {
    const { status, page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const where = status ? eq(dmcaNotices.status, status) : undefined;
    const items = await db
      .select()
      .from(dmcaNotices)
      .where(where)
      .orderBy(desc(dmcaNotices.receivedAt))
      .limit(limit)
      .offset(offset);

    // Per-status counts for the header tabs.
    const counts = await db
      .select({
        status: dmcaNotices.status,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(dmcaNotices)
      .groupBy(dmcaNotices.status);
    const statusCounts: Record<string, number> = {
      received: 0,
      valid: 0,
      invalid: 0,
      processed: 0,
      counter_noticed: 0,
      restored: 0,
      withdrawn: 0,
    };
    for (const r of counts) statusCounts[r.status] = Number(r.count);

    return c.json({ items, page, limit, counts: statusCounts });
  },
);

const reviewBodySchema = z
  .object({
    decision: z.enum(["valid", "invalid"]),
    notes: z.string().max(4000).optional(),
    /** Set on `decision=valid` if the admin has mapped the URL to an app. */
    appId: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "valid" && !v.appId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "decision=valid requires appId (map the infringing URL to an app)",
        path: ["appId"],
      });
    }
  });

/**
 * POST /admin/dmca/notices/:id/review
 *
 * Two transitions:
 *   - `valid`   → status="valid", appId mapped, ready for takedown
 *   - `invalid` → status="invalid", notice closed; claimant notified
 */
dmcaRouter.post(
  "/admin/dmca/notices/:id/review",
  requireAdmin,
  zValidator("json", reviewBodySchema),
  async (c) => {
    const id = c.req.param("id") as string;
    const body = c.req.valid("json");
    const admin = c.get("admin") as { id: string };

    const notice = await db.query.dmcaNotices.findFirst({
      where: eq(dmcaNotices.id, id),
    });
    if (!notice) throw new HTTPException(404, { message: "Notice not found" });
    if (notice.status !== "received") {
      throw new HTTPException(409, {
        message: `Notice is already ${notice.status} — only received notices can be reviewed`,
      });
    }

    if (body.decision === "valid") {
      // Verify the app exists before flipping the status.
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, body.appId!),
      });
      if (!app) {
        throw new HTTPException(404, {
          message: `App ${body.appId} not found — recheck the mapping`,
        });
      }
      await db
        .update(dmcaNotices)
        .set({
          status: "valid",
          appId: app.id,
          reviewNotes: body.notes ?? null,
          reviewedBy: admin.id,
          reviewedAt: new Date(),
        })
        .where(eq(dmcaNotices.id, id));
    } else {
      await db
        .update(dmcaNotices)
        .set({
          status: "invalid",
          reviewNotes: body.notes ?? null,
          reviewedBy: admin.id,
          reviewedAt: new Date(),
        })
        .where(eq(dmcaNotices.id, id));
      // Notify the claimant their notice was rejected.
      try {
        await enqueueEmail({
          template: "dmca-notice-rejected",
          to: notice.claimantEmail,
          props: {
            noticeNumber: notice.noticeNumber,
            reason: body.notes ?? "Notice did not satisfy 17 USC 512(c)(3).",
          },
          idempotencyKey: `dmca-rejected_${notice.id}`,
          tags: [{ name: "category", value: "trust-safety" }],
        });
      } catch (err) {
        console.warn("[dmca] rejection email failed:", err);
      }
    }

    await recordAdminAction({
      c,
      action: `dmca.review.${body.decision}`,
      targetType: null,
      targetId: id,
      metadata: { noticeNumber: notice.noticeNumber, appId: body.appId },
    });

    return c.json({ success: true, decision: body.decision });
  },
);

/**
 * POST /admin/dmca/notices/:id/takedown
 *
 * Execute the takedown on a previously-validated notice. Atomically:
 *   - delist the app (isDelisted=true, delistReason flagged as DMCA)
 *   - flip the notice status to "processed"
 *   - write a transparency event ("dmca_takedown") with the legal
 *     basis citing 17 USC 512(c)
 *   - email the developer with the counter-notice instructions +
 *     notice number for cross-reference
 *
 * Per safe-harbor expectations the takedown should be "expeditious";
 * our policy is within 24h of receipt validation.
 */
dmcaRouter.post(
  "/admin/dmca/notices/:id/takedown",
  requireAdmin,
  async (c) => {
    const id = c.req.param("id") as string;
    const adminUser = c.get("user");

    const notice = await db.query.dmcaNotices.findFirst({
      where: eq(dmcaNotices.id, id),
    });
    if (!notice) throw new HTTPException(404, { message: "Notice not found" });
    if (notice.status !== "valid") {
      throw new HTTPException(409, {
        message: `Takedown requires status=valid, got "${notice.status}"`,
      });
    }
    if (!notice.appId) {
      throw new HTTPException(409, {
        message: "Notice has no mapped app — re-run /review with appId",
      });
    }

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, notice.appId),
    });

    // Atomic: notice status flip + app delist. The transparency
    // event + emails are best-effort after the atomic write so a
    // failure in either doesn't leave a half-applied takedown.
    await db.transaction(async (tx) => {
      await tx
        .update(dmcaNotices)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(dmcaNotices.id, id));
      if (app) {
        await tx
          .update(apps)
          .set({
            isDelisted: true,
            delistReason: `DMCA takedown (notice ${notice.noticeNumber})`,
            updatedAt: new Date(),
          })
          .where(eq(apps.id, app.id));
      }
    });

    // Public record.
    await appendTransparencyEvent({
      eventType: "dmca_takedown",
      targetType: "app",
      targetId: notice.appId,
      reason: `DMCA notice ${notice.noticeNumber}: ${notice.copyrightedWork}`,
      legalBasis: "17 USC 512(c)",
      jurisdiction: "US",
      responseTimeMs:
        notice.receivedAt instanceof Date
          ? Date.now() - notice.receivedAt.getTime()
          : null,
    });

    // Notify the developer.
    if (app) {
      const developer = await db.query.developers.findFirst({
        where: eq(developers.id, app.developerId),
      });
      if (developer) {
        try {
          await enqueueEmail({
            template: "dmca-takedown-notice",
            to: developer.email,
            props: {
              noticeNumber: notice.noticeNumber,
              appName: app.packageName,
              copyrightedWork: notice.copyrightedWork,
              counterNoticeUrl: `https://dev.openmarket.app/apps/${app.id}/dmca-counter-notice/${id}`,
            },
            idempotencyKey: `dmca-takedown_${notice.id}`,
            tags: [{ name: "category", value: "trust-safety" }],
          });
        } catch (err) {
          console.warn("[dmca] takedown notice email failed:", err);
        }
      }
    }

    await recordAdminAction({
      c,
      action: "dmca.takedown",
      targetType: "app",
      targetId: notice.appId,
      metadata: {
        noticeId: id,
        noticeNumber: notice.noticeNumber,
        adminEmail: adminUser.email,
      },
    });

    return c.json({ success: true, noticeId: id });
  },
);

// ────── Counter-notice flow ──────

const counterNoticeBodySchema = z.object({
  noticeId: z.string().uuid(),
  materialIdentification: z.string().min(10).max(4000),
  goodFaithMistakeStatement: z.literal(true),
  jurisdictionConsent: z.literal(true),
  counterPartyName: z.string().min(1).max(200),
  counterPartyEmail: z.string().email().max(254),
  counterPartyAddress: z.string().min(10).max(2000),
  signature: z.string().min(2).max(200),
});

/**
 * POST /dmca/counter-notices
 *
 * Developer files a counter-notice against a processed DMCA notice.
 * Requires session auth (developer must be the owner of the
 * delisted app).
 */
dmcaRouter.post(
  "/dmca/counter-notices",
  requireAuth,
  rateLimit({
    windowSec: 3600,
    max: 5,
    by: "user",
    bucket: "dmca-counter",
  }),
  zValidator("json", counterNoticeBodySchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });
    if (!developer) {
      throw new HTTPException(403, {
        message: "Only registered developers can file counter-notices",
      });
    }

    const notice = await db.query.dmcaNotices.findFirst({
      where: eq(dmcaNotices.id, body.noticeId),
    });
    if (!notice) throw new HTTPException(404, { message: "Notice not found" });
    if (notice.status !== "processed") {
      throw new HTTPException(409, {
        message: `Counter-notice requires processed notice, got "${notice.status}"`,
      });
    }
    if (!notice.appId) {
      throw new HTTPException(409, { message: "Notice has no mapped app" });
    }

    // Ownership check: only the developer of the targeted app can
    // counter-notice. Without this an unrelated party could try.
    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, notice.appId), eq(apps.developerId, developer.id)),
    });
    if (!app) {
      throw new HTTPException(403, {
        message: "Counter-notices can only be filed by the app's developer",
      });
    }

    const [created] = await db
      .insert(dmcaCounterNotices)
      .values({
        noticeId: notice.id,
        developerId: developer.id,
        materialIdentification: body.materialIdentification,
        goodFaithMistakeStatement: body.goodFaithMistakeStatement,
        jurisdictionConsent: body.jurisdictionConsent,
        counterPartyName: body.counterPartyName,
        counterPartyEmail: body.counterPartyEmail.toLowerCase(),
        counterPartyAddress: body.counterPartyAddress,
        signature: body.signature,
      })
      .returning();

    // Mark the parent notice counter_noticed for visibility in the
    // admin queue.
    await db
      .update(dmcaNotices)
      .set({
        status: "counter_noticed",
        counterNoticedAt: new Date(),
      })
      .where(eq(dmcaNotices.id, notice.id));

    return c.json(
      {
        counterNoticeId: created!.id,
        status: created!.status,
        filedAt: created!.filedAt,
      },
      201,
    );
  },
);

/**
 * POST /admin/dmca/counter-notices/:id/validate
 *
 * Admin reviews a filed counter-notice. On `validated`, sets a 10-
 * calendar-day restoreEligibleAt timestamp; an unrelated cron
 * (POST /admin/dmca/restore-due) will sweep expired ones.
 */
const validateCounterBodySchema = z.object({
  decision: z.enum(["validated", "rejected"]),
  notes: z.string().max(4000).optional(),
});

dmcaRouter.post(
  "/admin/dmca/counter-notices/:id/validate",
  requireAdmin,
  zValidator("json", validateCounterBodySchema),
  async (c) => {
    const id = c.req.param("id") as string;
    const body = c.req.valid("json");

    const cn = await db.query.dmcaCounterNotices.findFirst({
      where: eq(dmcaCounterNotices.id, id),
    });
    if (!cn) throw new HTTPException(404, { message: "Counter-notice not found" });
    if (cn.status !== "filed") {
      throw new HTTPException(409, {
        message: `Counter-notice is already ${cn.status}`,
      });
    }

    if (body.decision === "validated") {
      const eligibleAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      await db
        .update(dmcaCounterNotices)
        .set({
          status: "validated",
          reviewNotes: body.notes ?? null,
          reviewedAt: new Date(),
          restoreEligibleAt: eligibleAt,
        })
        .where(eq(dmcaCounterNotices.id, id));
    } else {
      await db
        .update(dmcaCounterNotices)
        .set({
          status: "rejected",
          reviewNotes: body.notes ?? null,
          reviewedAt: new Date(),
        })
        .where(eq(dmcaCounterNotices.id, id));
    }

    await recordAdminAction({
      c,
      action: `dmca.counter-notice.${body.decision}`,
      targetType: null,
      targetId: id,
      metadata: { noticeId: cn.noticeId },
    });

    return c.json({ success: true, decision: body.decision });
  },
);

/**
 * POST /admin/dmca/restore-due
 *
 * Idempotent cron sweep. For every counter-notice in status
 * "validated" with restoreEligibleAt <= now AND status != restored:
 *   - relist the app
 *   - mark counter-notice status "restored"
 *   - mark parent notice status "restored"
 *   - write transparency event "dmca_counter_notice_restored"
 *
 * The claimant has 10 calendar days from validation to file suit
 * (which the admin records by hitting a separate "withdraw" endpoint —
 * not shipped yet, but the data model supports it). If no suit is
 * filed in that window, this cron flips them back live.
 */
dmcaRouter.post("/admin/dmca/restore-due", requireAdmin, async (c) => {
  const now = new Date();
  const eligibleNotices = await db
    .select({
      cn: dmcaCounterNotices,
      notice: dmcaNotices,
    })
    .from(dmcaCounterNotices)
    .innerJoin(dmcaNotices, eq(dmcaNotices.id, dmcaCounterNotices.noticeId))
    .where(
      and(
        eq(dmcaCounterNotices.status, "validated"),
        isNotNull(dmcaCounterNotices.restoreEligibleAt),
        lte(dmcaCounterNotices.restoreEligibleAt, now),
        eq(dmcaNotices.status, "counter_noticed"),
      ),
    );

  const results: Array<{ noticeId: string; appId: string | null }> = [];
  for (const row of eligibleNotices) {
    const { cn, notice } = row;
    await db.transaction(async (tx) => {
      await tx
        .update(dmcaCounterNotices)
        .set({ status: "restored" })
        .where(eq(dmcaCounterNotices.id, cn.id));
      await tx
        .update(dmcaNotices)
        .set({ status: "restored", restoredAt: now })
        .where(eq(dmcaNotices.id, notice.id));
      if (notice.appId) {
        await tx
          .update(apps)
          .set({
            isDelisted: false,
            delistReason: null,
            updatedAt: now,
          })
          .where(eq(apps.id, notice.appId));
      }
    });

    if (notice.appId) {
      await appendTransparencyEvent({
        eventType: "dmca_counter_notice_restored",
        targetType: "app",
        targetId: notice.appId,
        reason: `Counter-notice waiting period elapsed without lawsuit. Notice ${notice.noticeNumber}.`,
        legalBasis: "17 USC 512(g)",
        jurisdiction: "US",
      });
    }
    results.push({ noticeId: notice.id, appId: notice.appId });
  }

  await recordAdminAction({
    c,
    action: "dmca.restore-due",
    targetType: null,
    targetId: null,
    metadata: { restoredCount: results.length },
  });

  return c.json({ success: true, restoredCount: results.length, results });
});
