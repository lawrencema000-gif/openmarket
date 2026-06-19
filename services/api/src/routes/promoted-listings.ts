import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, lt, lte, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  appListings,
  apps,
  promotedListings,
  promotionDailyStats,
} from "@openmarket/db/schema";
import {
  promotedListingInputSchema,
  promotedListingModerationSchema,
  promotedListingPatchSchema,
} from "@openmarket/contracts/promoted-listings";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { rateLimit } from "../middleware/rate-limit";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import type { Variables } from "../lib/types";

export const promotedListingsRouter = new Hono<{ Variables: Variables }>();

/**
 * Promoted listings (P4-G).
 *
 *   POST   /promoted-listings                       developer+; create
 *                                                   draft promotion. Always
 *                                                   starts pending_review.
 *   PATCH  /promoted-listings/:id                   developer+; edit while
 *                                                   draft / pending; bumps
 *                                                   back to pending_review.
 *   GET    /promoted-listings/mine                  viewer+; list own
 *   POST   /promoted-listings/:id/end               developer+; end a
 *                                                   live promotion (status
 *                                                   = ended)
 *
 *   POST   /admin/promoted-listings/:id/decision    admin; approve/reject
 *   GET    /admin/promoted-listings/pending         admin; review queue
 *
 *   GET    /promoted/active                         PUBLIC; storefront feed
 *                                                   of currently-live
 *                                                   sponsored cards. Joins
 *                                                   apps where isDelisted
 *                                                   and reviewFreeze are
 *                                                   both false — so
 *                                                   moderation action auto-
 *                                                   pauses paid placement.
 *   POST   /promoted/:id/impression                 PUBLIC; bump impression
 *                                                   counter.
 *   POST   /promoted/:id/click                      PUBLIC; bump click +
 *                                                   spend; flips status to
 *                                                   paused_budget when the
 *                                                   day's cap is hit.
 */

const TRUST_TIERS_ELIGIBLE = new Set(["standard", "enhanced"]);

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ensureOwnership(userEmail: string, appId: string) {
  const ctx = await findEffectiveDeveloperContext(userEmail);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }
  if (!roleSatisfies(ctx.role, "developer")) {
    throw new HTTPException(403, {
      message: `Managing promotions requires developer role; you have ${ctx.role}`,
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
  // Editorial gate: an app under moderation freeze, delisted, or in the
  // `experimental` trust tier cannot run paid placement. This prevents
  // promotion from masking trust signals.
  if (app.isDelisted) {
    throw new HTTPException(409, {
      message: "Delisted apps cannot run promotions",
    });
  }
  if (app.reviewFreeze) {
    throw new HTTPException(409, {
      message: "This app has an active moderation freeze",
    });
  }
  if (!TRUST_TIERS_ELIGIBLE.has(app.trustTier)) {
    throw new HTTPException(409, {
      message: `Apps in the ${app.trustTier} trust tier cannot run promotions`,
    });
  }
  return { ctx, app };
}

async function loadOwnedPromotion(userEmail: string, promotionId: string) {
  const ctx = await findEffectiveDeveloperContext(userEmail);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }
  const row = await db.query.promotedListings.findFirst({
    where: and(
      eq(promotedListings.id, promotionId),
      eq(promotedListings.developerId, ctx.developer.id),
    ),
  });
  if (!row) {
    throw new HTTPException(404, { message: "Promotion not found" });
  }
  return { ctx, row };
}

promotedListingsRouter.post(
  "/promoted-listings",
  requireAuth,
  zValidator("json", promotedListingInputSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const { ctx } = await ensureOwnership(user.email, input.appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Creating promotions requires developer role; you have ${ctx.role}`,
      });
    }

    const [inserted] = await db
      .insert(promotedListings)
      .values({
        appId: input.appId,
        developerId: ctx.developer.id,
        bidCentsPerClick: input.bidCentsPerClick,
        dailyBudgetCents: input.dailyBudgetCents,
        currency: input.currency,
        targetCountries: input.targetCountries ?? null,
        targetCategories: input.targetCategories ?? null,
        status: "pending_review",
        startAt: input.startAt ? new Date(input.startAt) : null,
        endAt: input.endAt ? new Date(input.endAt) : null,
      })
      .returning();
    return c.json({ promotion: inserted }, 201);
  },
);

promotedListingsRouter.patch(
  "/promoted-listings/:id",
  requireAuth,
  zValidator("json", promotedListingPatchSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id") as string;
    const patch = c.req.valid("json");
    const { ctx, row } = await loadOwnedPromotion(user.email, id);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Editing promotions requires developer role; you have ${ctx.role}`,
      });
    }
    if (row.status === "ended") {
      throw new HTTPException(409, {
        message: "Ended promotions cannot be edited",
      });
    }

    const next: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.bidCentsPerClick !== undefined)
      next.bidCentsPerClick = patch.bidCentsPerClick;
    if (patch.dailyBudgetCents !== undefined)
      next.dailyBudgetCents = patch.dailyBudgetCents;
    if (patch.targetCountries !== undefined)
      next.targetCountries = patch.targetCountries;
    if (patch.targetCategories !== undefined)
      next.targetCategories = patch.targetCategories;
    if (patch.startAt !== undefined)
      next.startAt = patch.startAt ? new Date(patch.startAt) : null;
    if (patch.endAt !== undefined)
      next.endAt = patch.endAt ? new Date(patch.endAt) : null;

    // Any economic change re-enters review so editorial doesn't get
    // bypassed by editing a previously approved promotion.
    if (
      patch.bidCentsPerClick !== undefined ||
      patch.dailyBudgetCents !== undefined ||
      patch.targetCountries !== undefined ||
      patch.targetCategories !== undefined
    ) {
      next.status = "pending_review";
      next.policyApprovedAt = null;
      next.policyApprovedBy = null;
    }

    const [updated] = await db
      .update(promotedListings)
      .set(next)
      .where(eq(promotedListings.id, id))
      .returning();
    return c.json({ promotion: updated });
  },
);

promotedListingsRouter.get(
  "/promoted-listings/mine",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const ctx = await findEffectiveDeveloperContext(user.email);
    if (!ctx) {
      throw new HTTPException(403, {
        message: "No publisher account associated with this user",
      });
    }
    const rows = await db
      .select()
      .from(promotedListings)
      .where(eq(promotedListings.developerId, ctx.developer.id))
      .orderBy(desc(promotedListings.createdAt))
      .limit(200);
    return c.json({ promotions: rows });
  },
);

promotedListingsRouter.post(
  "/promoted-listings/:id/end",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id") as string;
    const { ctx, row } = await loadOwnedPromotion(user.email, id);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Ending promotions requires developer role; you have ${ctx.role}`,
      });
    }
    if (row.status === "ended") {
      return c.json({ promotion: row });
    }
    const [updated] = await db
      .update(promotedListings)
      .set({ status: "ended", updatedAt: new Date() })
      .where(eq(promotedListings.id, id))
      .returning();
    return c.json({ promotion: updated });
  },
);

/* -------------------------------------------------------------------------
 *  ADMIN — moderation queue
 * ----------------------------------------------------------------------- */

promotedListingsRouter.get(
  "/admin/promoted-listings/pending",
  requireAuth,
  requireAdmin,
  async (c) => {
    const rows = await db
      .select()
      .from(promotedListings)
      .where(eq(promotedListings.status, "pending_review"))
      .orderBy(desc(promotedListings.createdAt))
      .limit(200);
    return c.json({ promotions: rows });
  },
);

promotedListingsRouter.post(
  "/admin/promoted-listings/:id/decision",
  requireAuth,
  requireAdmin,
  zValidator("json", promotedListingModerationSchema),
  async (c) => {
    const admin = c.get("admin") as { id: string };
    const id = c.req.param("id") as string;
    const decision = c.req.valid("json");
    const existing = await db.query.promotedListings.findFirst({
      where: eq(promotedListings.id, id),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Promotion not found" });
    }
    if (decision.decision === "approve") {
      const [updated] = await db
        .update(promotedListings)
        .set({
          status: "active",
          policyApprovedAt: new Date(),
          policyApprovedBy: admin.id,
          policyRejectionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(promotedListings.id, id))
        .returning();
      return c.json({ promotion: updated });
    }
    const [updated] = await db
      .update(promotedListings)
      .set({
        status: "paused_policy",
        policyApprovedAt: null,
        policyApprovedBy: null,
        policyRejectionReason: decision.reason,
        updatedAt: new Date(),
      })
      .where(eq(promotedListings.id, id))
      .returning();
    return c.json({ promotion: updated });
  },
);

/* -------------------------------------------------------------------------
 *  PUBLIC — storefront feed + tracking
 * ----------------------------------------------------------------------- */

promotedListingsRouter.get("/promoted/active", async (c) => {
  const surfaceParam = c.req.query("surface");
  const country = c.req.query("country")?.toUpperCase();
  const category = c.req.query("category")?.toLowerCase();
  const limit = Math.min(Number(c.req.query("limit") ?? 6), 20);

  const now = new Date();

  // The storefront query joins apps + the current app_listings row
  // and excludes any app that's been delisted or has a review-freeze.
  // This way moderation action auto-pauses paid placement without us
  // needing a separate cron.
  const rows = await db
    .select({
      promotion: promotedListings,
      app: apps,
      listing: appListings,
    })
    .from(promotedListings)
    .innerJoin(apps, eq(apps.id, promotedListings.appId))
    .innerJoin(appListings, eq(appListings.id, apps.currentListingId))
    .where(
      and(
        eq(promotedListings.status, "active"),
        eq(apps.isDelisted, false),
        eq(apps.reviewFreeze, false),
        or(
          sql`${promotedListings.startAt} IS NULL`,
          lte(promotedListings.startAt, now),
        ),
        or(
          sql`${promotedListings.endAt} IS NULL`,
          gte(promotedListings.endAt, now),
        ),
      ),
    )
    .orderBy(desc(promotedListings.bidCentsPerClick))
    .limit(limit * 2);

  // v1 in-memory targeting filter. Lexicographic-by-bid auction below.
  const filtered = rows
    .filter(({ promotion, listing }) => {
      if (country && promotion.targetCountries && promotion.targetCountries.length > 0) {
        if (!promotion.targetCountries.includes(country)) return false;
      }
      if (category && promotion.targetCategories && promotion.targetCategories.length > 0) {
        if (!promotion.targetCategories.includes(category)) return false;
      }
      // Defensive: if a promotion was approved but the developer later
      // changed category and we want to scope it, the category filter
      // is per-promotion not per-listing — listing kept here for the
      // render-side card.
      void listing;
      return true;
    })
    .slice(0, limit);

  return c.json({
    surface: surfaceParam ?? "home",
    promotions: filtered.map(({ promotion, app, listing }) => ({
      id: promotion.id,
      appId: app.id,
      title: listing.title,
      iconUrl: listing.iconUrl,
      shortDescription: listing.shortDescription,
      sponsored: true,
    })),
  });
});

promotedListingsRouter.post(
  "/promoted/:id/impression",
  // Public, unauthenticated, and feeds billing/analytics counters — so it
  // is a fraud target. Cap per IP+route. Impressions fire on every render
  // so the ceiling is higher than clicks but still finite.
  rateLimit({ windowSec: 60, max: 60, by: "ip+route", bucket: "promo-impression" }),
  async (c) => {
    const id = c.req.param("id") as string;
    const day = todayUtc();
    const promotion = await db.query.promotedListings.findFirst({
      where: eq(promotedListings.id, id),
    });
    if (!promotion || promotion.status !== "active") {
      return c.json({ recorded: false }, 200);
    }
    await db
      .insert(promotionDailyStats)
      .values({
        promotionId: id,
        day,
        impressions: 1,
        clicks: 0,
        spendCents: 0,
        currency: promotion.currency,
      })
      .onConflictDoUpdate({
        target: [promotionDailyStats.promotionId, promotionDailyStats.day],
        set: { impressions: sql`${promotionDailyStats.impressions} + 1`, updatedAt: new Date() },
      });
    return c.json({ recorded: true });
  },
);

promotedListingsRouter.post(
  "/promoted/:id/click",
  // Clicks directly debit the promotion's daily budget — the highest-value
  // fraud target on the platform. Tight per-IP+route cap; a real user
  // clicking a sponsored card more than a handful of times a minute is
  // already anomalous.
  rateLimit({ windowSec: 60, max: 10, by: "ip+route", bucket: "promo-click" }),
  async (c) => {
    const id = c.req.param("id") as string;
    const day = todayUtc();
    const promotion = await db.query.promotedListings.findFirst({
      where: eq(promotedListings.id, id),
    });
    if (!promotion || promotion.status !== "active") {
      return c.json({ recorded: false }, 200);
    }

    const inserted = await db
      .insert(promotionDailyStats)
      .values({
        promotionId: id,
        day,
        impressions: 0,
        clicks: 1,
        spendCents: promotion.bidCentsPerClick,
        currency: promotion.currency,
      })
      .onConflictDoUpdate({
        target: [promotionDailyStats.promotionId, promotionDailyStats.day],
        set: {
          clicks: sql`${promotionDailyStats.clicks} + 1`,
          spendCents: sql`${promotionDailyStats.spendCents} + ${promotion.bidCentsPerClick}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    const todayRow = inserted[0];
    if (todayRow && todayRow.spendCents >= promotion.dailyBudgetCents) {
      await db
        .update(promotedListings)
        .set({ status: "paused_budget", updatedAt: new Date() })
        .where(eq(promotedListings.id, id));
    }
    return c.json({ recorded: true });
  },
);

// Touch unused imports to satisfy tree-shaking checks for future stats endpoints.
export const _promotedListingsHelpers = { lt };
