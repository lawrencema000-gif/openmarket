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
 * Affiliate / referral program (P4-H).
 *
 * Pay-per-install commission. The flow:
 *  1. An affiliate signs up (their developer row gets an
 *     affiliate_accounts entry). They get a unique short code.
 *  2. Affiliate generates a tracking link: /apps/:id?ref=ABCD1234
 *  3. Storefront sets a first-party cookie + records a click in
 *     affiliate_clicks (idempotent on (referralCode, deviceHash) within
 *     a 30-day window).
 *  4. When an install_events row lands for that user/device within
 *     attribution window, we write affiliate_conversions and reserve
 *     commissionCents for the next payout cycle.
 *  5. End of cycle, payable conversions roll into payouts table.
 *
 * v1 attribution: 30-day cookie + device fingerprint hash fallback,
 * last-click wins. Anti-fraud: same deviceHash can convert at most
 * once per app per 90 days.
 *
 * Commission is configured per-app by the developer (commissionBps).
 * The platform takes a flat 30% of the COMMISSION (not the install
 * revenue) on top — captured at the time the conversion is recorded
 * via platformFeeBps. This way the developer + affiliate + platform
 * can all see the splits without further computation downstream.
 */

export const affiliateStatusEnum = pgEnum("affiliate_status", [
  "active",
  "paused",
  "banned",
]);

export const affiliateConversionStatusEnum = pgEnum(
  "affiliate_conversion_status",
  ["pending", "approved", "reversed", "paid"],
);

export const affiliateAccounts = pgTable(
  "affiliate_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Affiliates ARE developers (they need a payout account anyway).
     * If we ever open the program to non-developers, we'd carve out a
     * dedicated `affiliates` row here. v1 reuses the developer row.
     */
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    /**
     * 8-char Crockford-32 referral code. Encoded into tracking URLs as
     * ?ref=<code>. The same scheme as promo codes for consistency.
     */
    referralCode: text("referral_code").notNull(),
    status: affiliateStatusEnum("status").default("active").notNull(),
    /** Optional display name shown on the affiliate's public profile. */
    handle: text("handle"),
    /** Optional payout email if the developer wants commissions paid out separately. */
    payoutEmail: text("payout_email"),
    /** Soft-deleted when banned for fraud. */
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    banReason: text("ban_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("affiliate_accounts_developer_idx").on(t.developerId),
    uniqueIndex("affiliate_accounts_code_idx").on(t.referralCode),
  ],
);

/**
 * Per-app commission program. Default is no commission (apps must
 * explicitly opt-in to pay affiliates). When `commissionBps` is null,
 * the app simply isn't part of the affiliate program.
 */
export const appAffiliatePrograms = pgTable(
  "app_affiliate_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /**
     * Basis points (1bps = 0.01%). 1000bps = 10%. Of the install price.
     * Free apps that opt in are allowed to set a flat
     * `flatCommissionCents` instead — see below.
     */
    commissionBps: integer("commission_bps"),
    /**
     * Flat commission for free / freemium apps where the install itself
     * generates no revenue but the developer is willing to pay e.g.
     * $0.10 per qualified install. Mutually exclusive with bps in v1.
     */
    flatCommissionCents: integer("flat_commission_cents"),
    /** Attribution window in days; default 30. */
    attributionWindowDays: integer("attribution_window_days")
      .default(30)
      .notNull(),
    /** Hard cap per affiliate per day to bound fraud blast radius. */
    dailyCapPerAffiliateCents: integer("daily_cap_per_affiliate_cents"),
    enabled: integer("enabled").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("app_affiliate_programs_app_idx").on(t.appId),
  ],
);

export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .references(() => affiliateAccounts.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    referralCode: text("referral_code").notNull(),
    /** Same salted hash used by install_events. Non-PII. */
    deviceFingerprintHash: text("device_fingerprint_hash"),
    countryCode: text("country_code"),
    surface: text("surface"),
    clickedAt: timestamp("clicked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("affiliate_clicks_app_idx").on(t.appId, t.clickedAt),
    index("affiliate_clicks_device_idx").on(t.deviceFingerprintHash),
  ],
);

export const affiliateConversions = pgTable(
  "affiliate_conversions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .references(() => affiliateAccounts.id, { onDelete: "cascade" })
      .notNull(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /** Click that converted (best-effort; null if attribution was cookieless). */
    clickId: uuid("click_id"),
    /** install_events row that triggered this conversion. */
    installEventId: uuid("install_event_id"),
    /** Device hash dedup: same device cannot convert twice within window. */
    deviceFingerprintHash: text("device_fingerprint_hash"),
    /** Commission gross + platform's cut, captured at write time. */
    commissionCents: integer("commission_cents").notNull(),
    platformFeeBps: integer("platform_fee_bps").default(3000).notNull(),
    currency: text("currency").notNull(),
    status: affiliateConversionStatusEnum("status")
      .default("pending")
      .notNull(),
    /** Hold for the refund window; transitions to approved when safe. */
    holdUntil: timestamp("hold_until", { withTimezone: true }),
    /** Payout this conversion was rolled into, if paid. */
    payoutId: uuid("payout_id"),
    reversalReason: text("reversal_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("affiliate_conversions_affiliate_idx").on(t.affiliateId, t.status),
    index("affiliate_conversions_app_idx").on(t.appId),
    uniqueIndex("affiliate_conversions_install_idx").on(t.installEventId),
  ],
);
