import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { users } from "./users";

/**
 * Paid-apps foundation (P4-A start) + refund window scaffolding (P3-I).
 *
 * v1 ships the data model + the pricing CRUD + the refund-eligibility
 * helper. Stripe wire-up (Checkout sessions, webhooks, refund
 * issuance) is deferred to a follow-up block — the `purchases.status`
 * state machine is designed so future Stripe events plug in cleanly:
 *
 *   pending    → created via POST /apps/:id/purchase, awaiting payment
 *   completed  → Stripe webhook flipped the row when the payment cleared
 *   refunded   → developer / admin / auto-policy issued a refund
 *   failed     → Stripe webhook reported a failed/cancelled payment
 *
 * For the storefront/dev-portal in this block: prices appear on app
 * detail, devs can set per-country prices, the purchase endpoint
 * records `pending` rows. Actual checkout intentionally fails until
 * the Stripe block ships.
 */

export const purchaseStatusEnum = pgEnum("purchase_status", [
  "pending",
  "completed",
  "refunded",
  "failed",
]);

/**
 * Per-app, per-country pricing.
 *
 *   countryCode — ISO 3166-1 alpha-2 ("US", "DE", "JP"…) OR the
 *                 literal string "default" for the fallback price.
 *                 Resolution: exact-match by country first, then
 *                 the "default" row, then "no price set" (free).
 *
 *   priceCents — integer minor-unit amount (cents for USD,
 *                 öre for SEK, ¢ for JPY which is whole-yen but we
 *                 model it × 100 for uniformity).
 *
 *   currency   — ISO 4217 ("USD", "EUR"…). Distinct per row so
 *                 multi-currency apps can price natively.
 *
 *   active     — soft-disable flag. False rows are ignored by
 *                 resolution; we keep them so devs can A/B prices
 *                 without losing history.
 */
export const appPricing = pgTable(
  "app_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    countryCode: text("country_code").notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // One active row per (app, country) — devs change pricing by
    // updating in place, not by piling up duplicate rows.
    uniqueIndex("app_pricing_app_country_idx").on(t.appId, t.countryCode),
  ],
);

/**
 * One row per purchase attempt. Persisted on POST /apps/:id/purchase
 * with status='pending'; flipped to 'completed' by the Stripe webhook
 * once the payment clears (future block). Refund-eligibility math
 * uses `purchasedAt` against the app's `refundWindowHours`.
 *
 * stripePaymentIntentId is captured on every create so admin tooling
 * can correlate against Stripe's dashboard during disputes. Kept
 * nullable because the v1 stub doesn't talk to Stripe yet.
 */
export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull(),
    /** Country at purchase time — frozen so later relocation doesn't change refund logic. */
    countryAtPurchase: text("country_at_purchase"),
    status: purchaseStatusEnum("status").default("pending").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundReason: text("refund_reason"),
  },
  (t) => [
    index("purchases_user_idx").on(t.userId, t.purchasedAt),
    index("purchases_app_idx").on(t.appId, t.purchasedAt),
    index("purchases_stripe_idx").on(t.stripePaymentIntentId),
  ],
);
