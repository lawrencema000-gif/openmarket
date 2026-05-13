import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { developers } from "./developers";
import { users } from "./users";

/**
 * Developer-issued promo codes (P3-C).
 *
 * In the Tier 3 framing these are "preferred install track" codes,
 * not paid-app discount codes. A code, when redeemed by a signed-in
 * user, can:
 *   - auto-join the user to the app's beta track (when grantsBeta = true)
 *   - auto-pre-register the user for launch (when grantsPreRegistration = true)
 *   - simply record a redemption for analytics
 *
 * Tier 4 (paid apps) will extend this table with `grantsPurchase` +
 * `purchasePriceCents` columns; the redemption pipeline stays the
 * same.
 *
 * Lifecycle:
 *   - dev generates → code is a short alphanumeric string (server-
 *     generated, capitalization-insensitive, dashes-stripped on input)
 *   - dev hands out the code to launch partners
 *   - user pastes it on /redeem or visits /redeem/<code>
 *   - server validates: not revoked, not expired, redemptions <
 *     maxRedemptions, user hasn't already redeemed
 *   - applies effects, inserts a redemption row, increments
 *     redeemedCount on the parent row
 *
 * Revocation is soft (revokedAt) — keeps the audit log intact and
 * lets the dev-portal show "X was revoked on date Y".
 */
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /**
     * Display code shown to users. Stored uppercase + no separators —
     * the redemption endpoint normalizes input before comparing.
     * Format: 8 chars from `[A-Z2-9]` minus I/O (Crockford-ish), so
     * codes are unambiguous when copied by hand.
     */
    code: text("code").notNull(),
    /** Optional friendly label kept only in the dev-portal list. */
    label: text("label"),
    grantsBeta: boolean("grants_beta").default(false).notNull(),
    grantsPreRegistration: boolean("grants_pre_registration")
      .default(false)
      .notNull(),
    /** Hard cap on total redemptions across all users. Null = unlimited. */
    maxRedemptions: integer("max_redemptions"),
    /** Denormalized counter — bumped atomically on every successful redeem. */
    redeemedCount: integer("redeemed_count").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => developers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("promo_codes_code_idx").on(t.code),
    index("promo_codes_app_idx").on(t.appId, t.revokedAt),
  ],
);

/**
 * One row per (codeId, userId) — guarantees a user can't double-redeem
 * the same code. Unique constraint enforces the dedupe; the redeem
 * endpoint surfaces a 409 on the conflict.
 */
export const promoCodeRedemptions = pgTable(
  "promo_code_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeId: uuid("code_id")
      .references(() => promoCodes.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("promo_code_redemptions_code_user_idx").on(t.codeId, t.userId),
    index("promo_code_redemptions_user_idx").on(t.userId, t.redeemedAt),
  ],
);
