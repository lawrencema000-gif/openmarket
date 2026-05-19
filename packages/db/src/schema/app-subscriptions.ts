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
import { iapSubscriptionStatusEnum } from "./iap";

/**
 * App-level subscriptions (P4-C).
 *
 * Distinct from in-app product subscriptions (P4-B / iap_purchases
 * with type=subscription):
 *
 *   - P4-B sub  →  per-product, additive to a free or paid app.
 *                  Example: a free game with a $2.99/mo cloud-save
 *                  IAP. User installs the app for free, optionally
 *                  pays for the IAP.
 *
 *   - P4-C sub  →  the whole app requires an active subscription
 *                  to download. Example: a $4.99/mo professional
 *                  tool. No active sub → no install.
 *
 * One row per subscriber per app. Active means status='active' or
 * 'trialing' (matching Stripe's lifecycle). Cancellation flips
 * cancel_at_period_end=true and lets the row run out naturally.
 *
 * Receipt verification endpoint reads this table — devs hit
 * /api/apps/:id/subscriptions/verify with a user id and we return
 * whether they have an active sub.
 */

export const appSubscriptions = pgTable(
  "app_subscriptions",
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
    countryAtPurchase: text("country_at_purchase"),
    /** Mirror of stripe subscription state — same enum we used for IAP. */
    status: iapSubscriptionStatusEnum("status").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    /** Reuse `iap_purchases.subscriptionInterval` style on the parent
     * apps row; the value's denorm-frozen here so refunds + audit
     * survive a subsequent pricing change. */
    interval: text("interval").notNull(),
    intervalCount: integer("interval_count").default(1).notNull(),
    trialDays: integer("trial_days"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
  },
  (t) => [
    // A user can re-subscribe after a previous cancellation — soft
    // dedupe at the API layer, not via a unique index, because the
    // row stays for audit.
    index("app_subscriptions_user_app_idx").on(t.userId, t.appId, t.status),
    uniqueIndex("app_subscriptions_stripe_sub_idx").on(t.stripeSubscriptionId),
    index("app_subscriptions_session_idx").on(t.stripeCheckoutSessionId),
  ],
);
