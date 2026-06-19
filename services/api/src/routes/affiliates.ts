import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  affiliateAccounts,
  affiliateClicks,
  affiliateConversions,
  appAffiliatePrograms,
  apps,
} from "@openmarket/db/schema";
import {
  affiliateAccountEnrollSchema,
  affiliateClickSchema,
  appAffiliateProgramSchema,
  generateReferralCode,
  normalizeReferralCode,
} from "@openmarket/contracts/affiliates";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { rateLimit } from "../middleware/rate-limit";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import type { Variables } from "../lib/types";

export const affiliatesRouter = new Hono<{ Variables: Variables }>();

const adminReasonSchema = z.object({ reason: z.string().min(4).max(500) });

/**
 * Affiliate / referral program (P4-H).
 *
 * Developer-facing:
 *   POST   /affiliates/enroll                  owner+ — opt the dev into
 *                                              the affiliate program.
 *                                              Auto-generates referral
 *                                              code, returns it.
 *   GET    /affiliates/me                      viewer+ — own account +
 *                                              attribution stats.
 *   PATCH  /apps/:id/affiliate-program         admin+ on the publisher —
 *                                              configure commission /
 *                                              attribution window.
 *
 * Public (tracking):
 *   POST   /affiliate/click                    No auth. Records a click.
 *                                              Dedup on (code, device)
 *                                              within 30 days.
 *
 * Admin moderation:
 *   POST   /admin/affiliates/:id/ban           Ban for fraud.
 *   POST   /admin/affiliate-conversions/:id/reverse  Reverse on fraud
 *                                              chargeback.
 */

async function ensurePublisherOwnership(userEmail: string, appId: string) {
  const ctx = await findEffectiveDeveloperContext(userEmail);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }
  const app = await db.query.apps.findFirst({
    where: and(eq(apps.id, appId), eq(apps.developerId, ctx.developer.id)),
  });
  if (!app) {
    throw new HTTPException(404, {
      message: "App not found or not owned by this publisher",
    });
  }
  return { ctx, app };
}

affiliatesRouter.post(
  "/affiliates/enroll",
  requireAuth,
  zValidator("json", affiliateAccountEnrollSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const ctx = await findEffectiveDeveloperContext(user.email);
    if (!ctx) {
      throw new HTTPException(403, {
        message: "No publisher account associated with this user",
      });
    }
    if (!roleSatisfies(ctx.role, "owner")) {
      throw new HTTPException(403, {
        message: `Enrolling as affiliate requires owner role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.affiliateAccounts.findFirst({
      where: eq(affiliateAccounts.developerId, ctx.developer.id),
    });
    if (existing) {
      return c.json({ account: existing });
    }

    // Generate a unique referral code. Birthday collisions in 32^8 are
    // statistically near-zero; we still retry once on conflict.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateReferralCode();
      try {
        const [inserted] = await db
          .insert(affiliateAccounts)
          .values({
            developerId: ctx.developer.id,
            referralCode: code,
            handle: input.handle ?? null,
            payoutEmail: input.payoutEmail ?? null,
            status: "active",
          })
          .returning();
        return c.json({ account: inserted }, 201);
      } catch (err) {
        // unique-violation on referralCode — retry with a fresh code.
        if (attempt === 2) throw err;
        continue;
      }
    }
    throw new HTTPException(500, { message: "Failed to allocate referral code" });
  },
);

affiliatesRouter.get(
  "/affiliates/me",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const ctx = await findEffectiveDeveloperContext(user.email);
    if (!ctx) {
      throw new HTTPException(403, {
        message: "No publisher account associated with this user",
      });
    }

    const account = await db.query.affiliateAccounts.findFirst({
      where: eq(affiliateAccounts.developerId, ctx.developer.id),
    });
    if (!account) {
      return c.json({ enrolled: false });
    }

    // Aggregate stats for the dashboard. Three quick queries; cheap on
    // indexed columns.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [clicks, conversions, earnings] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(affiliateClicks)
        .where(
          and(
            eq(affiliateClicks.affiliateId, account.id),
            gte(affiliateClicks.clickedAt, since),
          ),
        ),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(affiliateConversions)
        .where(
          and(
            eq(affiliateConversions.affiliateId, account.id),
            gte(affiliateConversions.createdAt, since),
          ),
        ),
      db
        .select({
          pendingCents: sql<number>`COALESCE(SUM(${affiliateConversions.commissionCents}) FILTER (WHERE ${affiliateConversions.status} = 'pending'), 0)::int`,
          approvedCents: sql<number>`COALESCE(SUM(${affiliateConversions.commissionCents}) FILTER (WHERE ${affiliateConversions.status} = 'approved'), 0)::int`,
          paidCents: sql<number>`COALESCE(SUM(${affiliateConversions.commissionCents}) FILTER (WHERE ${affiliateConversions.status} = 'paid'), 0)::int`,
        })
        .from(affiliateConversions)
        .where(eq(affiliateConversions.affiliateId, account.id)),
    ]);

    return c.json({
      enrolled: true,
      account,
      stats: {
        clicksLast30d: clicks[0]?.count ?? 0,
        conversionsLast30d: conversions[0]?.count ?? 0,
        earnings: earnings[0] ?? {
          pendingCents: 0,
          approvedCents: 0,
          paidCents: 0,
        },
      },
    });
  },
);

affiliatesRouter.patch(
  "/apps/:id/affiliate-program",
  requireAuth,
  zValidator("json", appAffiliateProgramSchema),
  async (c) => {
    const user = c.get("user");
    const appId = c.req.param("id") as string;
    const input = c.req.valid("json");
    const { ctx } = await ensurePublisherOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "admin")) {
      throw new HTTPException(403, {
        message: `Configuring affiliate program requires admin role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.appAffiliatePrograms.findFirst({
      where: eq(appAffiliatePrograms.appId, appId),
    });

    if (existing) {
      const [updated] = await db
        .update(appAffiliatePrograms)
        .set({
          commissionBps: input.commissionBps ?? null,
          flatCommissionCents: input.flatCommissionCents ?? null,
          attributionWindowDays: input.attributionWindowDays,
          dailyCapPerAffiliateCents: input.dailyCapPerAffiliateCents ?? null,
          enabled: input.enabled ? 1 : 0,
          updatedAt: new Date(),
        })
        .where(eq(appAffiliatePrograms.id, existing.id))
        .returning();
      return c.json({ program: updated });
    }

    const [inserted] = await db
      .insert(appAffiliatePrograms)
      .values({
        appId,
        commissionBps: input.commissionBps ?? null,
        flatCommissionCents: input.flatCommissionCents ?? null,
        attributionWindowDays: input.attributionWindowDays,
        dailyCapPerAffiliateCents: input.dailyCapPerAffiliateCents ?? null,
        enabled: input.enabled ? 1 : 0,
      })
      .returning();
    return c.json({ program: inserted }, 201);
  },
);

/* -------------------------------------------------------------------------
 *  PUBLIC — click recording
 * ----------------------------------------------------------------------- */

affiliatesRouter.post(
  "/affiliate/click",
  // Device-fingerprint dedup (below) stops a single device padding clicks,
  // but does nothing against a distributed botnet rotating fingerprints.
  // A per-IP cap raises the cost of that attack. Generous enough that a
  // real user browsing several referral links in a session is unaffected.
  rateLimit({ windowSec: 60, max: 30, by: "ip", bucket: "affiliate-click" }),
  zValidator("json", affiliateClickSchema),
  async (c) => {
    const input = c.req.valid("json");
    const code = normalizeReferralCode(input.referralCode);

    const account = await db.query.affiliateAccounts.findFirst({
      where: and(
        eq(affiliateAccounts.referralCode, code),
        eq(affiliateAccounts.status, "active"),
      ),
    });
    if (!account) {
      return c.json({ recorded: false, reason: "unknown_code" }, 200);
    }

    // App must be in the affiliate program AND be promoting-eligible
    // (not delisted, not review-frozen).
    const program = await db.query.appAffiliatePrograms.findFirst({
      where: eq(appAffiliatePrograms.appId, input.appId),
    });
    if (!program || program.enabled !== 1) {
      return c.json({ recorded: false, reason: "no_program" }, 200);
    }

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, input.appId),
    });
    if (!app || app.isDelisted || app.reviewFreeze) {
      return c.json({ recorded: false, reason: "app_unavailable" }, 200);
    }

    // Idempotency: same (code, device) within the attribution window is
    // a single click. Use a simple find instead of unique-index because
    // the dedup window is configurable per-app.
    if (input.deviceFingerprintHash) {
      const windowStart = new Date(
        Date.now() - program.attributionWindowDays * 24 * 60 * 60 * 1000,
      );
      const recent = await db
        .select({ id: affiliateClicks.id })
        .from(affiliateClicks)
        .where(
          and(
            eq(affiliateClicks.referralCode, code),
            eq(
              affiliateClicks.deviceFingerprintHash,
              input.deviceFingerprintHash,
            ),
            gte(affiliateClicks.clickedAt, windowStart),
          ),
        )
        .limit(1);
      if (recent.length > 0) {
        return c.json({ recorded: false, reason: "dedup" }, 200);
      }
    }

    await db.insert(affiliateClicks).values({
      affiliateId: account.id,
      appId: input.appId,
      referralCode: code,
      deviceFingerprintHash: input.deviceFingerprintHash ?? null,
      countryCode: input.countryCode ?? null,
      surface: input.surface ?? null,
    });
    return c.json({ recorded: true });
  },
);

/* -------------------------------------------------------------------------
 *  ADMIN — moderation
 * ----------------------------------------------------------------------- */

affiliatesRouter.post(
  "/admin/affiliates/:id/ban",
  requireAuth,
  requireAdmin,
  zValidator("json", adminReasonSchema),
  async (c) => {
    const id = c.req.param("id") as string;
    const { reason } = c.req.valid("json");
    const account = await db.query.affiliateAccounts.findFirst({
      where: eq(affiliateAccounts.id, id),
    });
    if (!account) {
      throw new HTTPException(404, { message: "Affiliate not found" });
    }
    const [updated] = await db
      .update(affiliateAccounts)
      .set({
        status: "banned",
        bannedAt: new Date(),
        banReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(affiliateAccounts.id, id))
      .returning();

    // Reverse all pending conversions so we don't pay the fraud out.
    await db
      .update(affiliateConversions)
      .set({
        status: "reversed",
        reversalReason: `affiliate_banned: ${reason}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(affiliateConversions.affiliateId, id),
          eq(affiliateConversions.status, "pending"),
        ),
      );

    return c.json({ account: updated });
  },
);

affiliatesRouter.post(
  "/admin/affiliate-conversions/:id/reverse",
  requireAuth,
  requireAdmin,
  zValidator("json", adminReasonSchema),
  async (c) => {
    const id = c.req.param("id") as string;
    const { reason } = c.req.valid("json");
    const existing = await db.query.affiliateConversions.findFirst({
      where: eq(affiliateConversions.id, id),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Conversion not found" });
    }
    if (existing.status === "paid") {
      throw new HTTPException(409, {
        message:
          "Conversion already paid out; reversal must come via the chargeback flow",
      });
    }
    const [updated] = await db
      .update(affiliateConversions)
      .set({
        status: "reversed",
        reversalReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(affiliateConversions.id, id))
      .returning();
    return c.json({ conversion: updated });
  },
);

affiliatesRouter.get(
  "/admin/affiliates/top",
  requireAuth,
  requireAdmin,
  async (c) => {
    const rows = await db
      .select()
      .from(affiliateAccounts)
      .where(eq(affiliateAccounts.status, "active"))
      .orderBy(desc(affiliateAccounts.createdAt))
      .limit(50);
    return c.json({ affiliates: rows });
  },
);
