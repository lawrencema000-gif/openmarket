import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { developers } from "./developers";

/**
 * Promoted listings (P4-G).
 *
 * Editorial policy from the implementation plan:
 *   - Only LABELED sponsored placements. Every promoted card shows a
 *     "Sponsored" badge.
 *   - Never bumps established trust signals — i.e. an app with
 *     `trustTier=experimental` or with active moderation issues
 *     can't run a promotion that hides those signals.
 *   - We enforce both at the API surface: promotion records carry
 *     a `policyApproved` flag set by an admin before they go live,
 *     and the storefront's promoted-listings query joins
 *     `apps.isDelisted = false` + `apps.reviewFreeze = false` so a
 *     promotion auto-pauses on moderation action.
 *
 * Pricing model v1: CPC (cost per click) with a daily budget.
 *   - Developer sets a max bid + daily cap
 *   - Stripe payment intent fronts the daily-cap amount; we deduct
 *     as the cap depletes
 *   - When daily cap exhausts, status flips paused until midnight UTC
 *   - Bidding heuristic for v1: lexicographic by bid amount desc;
 *     real auction logic lands in a follow-up
 */

export const promotionStatusEnum = pgEnum("promotion_status", [
  "draft",
  "pending_review",
  "active",
  "paused_budget",
  "paused_policy",
  "ended",
]);

export const promotedListings = pgTable(
  "promoted_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    /** Max bid per click in minor units. */
    bidCentsPerClick: integer("bid_cents_per_click").notNull(),
    /** Daily cap before auto-pause; integer minor units. */
    dailyBudgetCents: integer("daily_budget_cents").notNull(),
    currency: text("currency").notNull(),
    /** Optional country targeting; null = global. */
    targetCountries: text("target_countries").array(),
    /** Optional category targeting; null = appears in any category surface. */
    targetCategories: text("target_categories").array(),
    status: promotionStatusEnum("status").default("draft").notNull(),
    /** Set by admin moderator after editorial-policy review. */
    policyApprovedAt: timestamp("policy_approved_at", { withTimezone: true }),
    policyApprovedBy: uuid("policy_approved_by"),
    policyRejectionReason: text("policy_rejection_reason"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("promoted_listings_status_idx").on(t.status, t.startAt),
    index("promoted_listings_app_idx").on(t.appId),
  ],
);

/**
 * Per-day spend log. The cron + impression-recording pipeline writes
 * one row per (promotion, day) and accumulates impressions/clicks/
 * spend across the day. End-of-day, the row is finalized and the
 * promotion's daily cap resets at midnight UTC.
 */
export const promotionDailyStats = pgTable(
  "promotion_daily_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promotionId: uuid("promotion_id")
      .references(() => promotedListings.id, { onDelete: "cascade" })
      .notNull(),
    /** UTC day, YYYY-MM-DD. */
    day: text("day").notNull(),
    impressions: integer("impressions").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    spendCents: integer("spend_cents").default(0).notNull(),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("promotion_daily_stats_promo_day_idx").on(
      t.promotionId,
      t.day,
    ),
  ],
);
