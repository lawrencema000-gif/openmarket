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
import { developers } from "./developers";

/**
 * Developer payouts via Stripe Connect Express (P4-D).
 *
 * Flow:
 *   1. Developer hits "Set up payouts" in the dev-portal
 *      → POST /developers/me/payouts/onboard
 *      → server creates a Stripe Connect Express account, returns the
 *        onboarding URL. We store the account id on
 *        `developer_payout_accounts` immediately so the next event
 *        can correlate.
 *   2. Developer completes the onboarding form (Stripe hosts the UI).
 *   3. Webhook `account.updated` fires with charges_enabled +
 *        payouts_enabled flags — we mirror them onto our row.
 *   4. Monthly cron computes `payouts` rows = net revenue across
 *        all purchases + iap_purchases + app_subscriptions for the
 *        developer's apps, minus platform fee (e.g. 15%), grouped
 *        by currency. Each row references the Stripe transfer id
 *        created via stripe.transfers.create() once the developer
 *        has charges_enabled=true.
 *   5. Tax form collection (W-9, W-8BEN) is bundled into Stripe's
 *        own onboarding for US/non-US developers — we don't store
 *        the forms ourselves. The `tax_info_collected` flag on the
 *        connect account row mirrors Stripe's `requirements.eventually_due`.
 *
 * Schema notes:
 *   - One Stripe Connect account per developer (developer_payout_accounts).
 *   - Many payout rows per developer, one per (cycle, currency).
 *   - payouts.status follows Stripe's transfer lifecycle:
 *       pending → paid (transfer succeeded) | failed (transfer
 *       failed; needs reissue) | reversed (manual claw-back).
 */

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "paid",
  "failed",
  "reversed",
]);

export const developerPayoutAccounts = pgTable(
  "developer_payout_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    /** Stripe Connect account id (acct_…). Set immediately on creation. */
    stripeAccountId: text("stripe_account_id").notNull(),
    /** Mirror of stripe account.charges_enabled — true means we can pay this account. */
    chargesEnabled: boolean("charges_enabled").default(false).notNull(),
    /** Mirror of stripe account.payouts_enabled. */
    payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),
    /** True when stripe.account.requirements has zero pending items (TIN, identity verification, etc.). */
    detailsSubmitted: boolean("details_submitted").default(false).notNull(),
    /** Country at onboarding — informational, used by tax-form classification. */
    countryCode: text("country_code"),
    /** Default currency the developer wants payouts in (Stripe derives from country). */
    defaultCurrency: text("default_currency"),
    /** Set once Stripe records they collected the relevant W-9/W-8BEN. */
    taxInfoCollected: boolean("tax_info_collected").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("developer_payout_accounts_dev_idx").on(t.developerId),
    uniqueIndex("developer_payout_accounts_stripe_idx").on(t.stripeAccountId),
  ],
);

/**
 * One row per (developer, billing cycle, currency).
 *
 * Cycle: monthly by default. The cron computes earnings for the
 * cycle, deducts the platform fee (defaultPlatformFeeBps), and
 * fires stripe.transfers.create() against the developer's Connect
 * account.
 */
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    /** Inclusive of from, exclusive of to. UTC day boundaries. */
    periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
    periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
    currency: text("currency").notNull(),
    /** Sum of (completed - refunded) across the developer's apps. */
    grossCents: integer("gross_cents").notNull(),
    /** Platform fee in basis points captured at payout time. */
    platformFeeBps: integer("platform_fee_bps").notNull(),
    /** grossCents - (grossCents * platformFeeBps / 10000). */
    netCents: integer("net_cents").notNull(),
    status: payoutStatusEnum("status").default("pending").notNull(),
    /** Stripe transfer id once issued (tr_…). */
    stripeTransferId: text("stripe_transfer_id"),
    /** Failure reason from Stripe (if status=failed). */
    failureReason: text("failure_reason"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("payouts_developer_idx").on(t.developerId, t.periodFrom),
    uniqueIndex("payouts_period_idx").on(
      t.developerId,
      t.periodFrom,
      t.currency,
    ),
    index("payouts_stripe_idx").on(t.stripeTransferId),
  ],
);
