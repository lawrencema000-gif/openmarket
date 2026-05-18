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
 * In-app products (P4-B).
 *
 * Three product kinds:
 *
 *   consumable      — buyer can repurchase indefinitely (e.g. coin packs,
 *                     extra-life unlocks). Each purchase records a new
 *                     `iap_purchases` row; no uniqueness constraint
 *                     across (user, product).
 *
 *   non_consumable  — buyer purchases once and keeps the entitlement
 *                     forever (e.g. "remove ads", "pro tier unlock").
 *                     We enforce a partial unique check in the API:
 *                     refusing a second purchase for the same
 *                     (user, product) while a prior completed row exists.
 *
 *   subscription    — recurring billing managed by Stripe. We mirror the
 *                     subscription state from webhooks
 *                     (customer.subscription.updated/deleted +
 *                     invoice.payment_succeeded). Lifecycle fields
 *                     (currentPeriodEnd, cancelAtPeriodEnd,
 *                     subscriptionStatus) live on iap_purchases.
 *
 * Pricing reuses the same per-country pattern as app_pricing — one
 * row per (productId, countryCode), `default` as the catch-all.
 */

export const iapProductTypeEnum = pgEnum("iap_product_type", [
  "consumable",
  "non_consumable",
  "subscription",
]);

export const iapSubscriptionStatusEnum = pgEnum("iap_subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

export const appIapProducts = pgTable(
  "app_iap_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /**
     * Developer-chosen SKU — shown to buyers and used by the device
     * SDK to identify products. ASCII, dot-separated, like a reverse
     * domain ("com.example.app.coins.100"). Unique per app.
     */
    sku: text("sku").notNull(),
    type: iapProductTypeEnum("type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Subscription interval — only meaningful when type='subscription'.
     * Stored as text ("month", "year", "week", "day") to keep the
     * enum from sprawling; storefront UI maps to localized strings.
     */
    subscriptionInterval: text("subscription_interval"),
    subscriptionIntervalCount: integer("subscription_interval_count"),
    /** Free-trial days for subscriptions; null/0 means no trial. */
    trialDays: integer("trial_days"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("app_iap_products_app_sku_idx").on(t.appId, t.sku),
    index("app_iap_products_app_idx").on(t.appId, t.active),
  ],
);

/**
 * Per-country pricing for an IAP product. Mirror of app_pricing
 * keyed on productId instead of appId. Same resolution rules:
 *   exact country match → "default" → null (product not sold here).
 */
export const iapPricing = pgTable(
  "iap_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .references(() => appIapProducts.id, { onDelete: "cascade" })
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
  (t) => [uniqueIndex("iap_pricing_product_country_idx").on(t.productId, t.countryCode)],
);

/**
 * One row per IAP purchase attempt. Parallel to `purchases` for app
 * sales — same Stripe webhook + refund-eligibility plumbing. For
 * subscriptions, additional lifecycle fields are populated by the
 * webhook handlers.
 */
export const iapPurchases = pgTable(
  "iap_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => appIapProducts.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull(),
    countryAtPurchase: text("country_at_purchase"),
    /** pending | completed | refunded | failed — same enum as app purchases. */
    status: text("status").default("pending").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    /** Stripe subscription id (sub_…) — only for type=subscription products. */
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Mirror of stripe subscription status. */
    subscriptionStatus: iapSubscriptionStatusEnum("subscription_status"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundReason: text("refund_reason"),
  },
  (t) => [
    index("iap_purchases_user_idx").on(t.userId, t.purchasedAt),
    index("iap_purchases_product_idx").on(t.productId, t.purchasedAt),
    index("iap_purchases_session_idx").on(t.stripeCheckoutSessionId),
    index("iap_purchases_subscription_idx").on(t.stripeSubscriptionId),
  ],
);
