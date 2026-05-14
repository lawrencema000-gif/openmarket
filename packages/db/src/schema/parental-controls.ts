import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Parental controls (P3-F).
 *
 * Per-user opt-in. Two roles:
 *
 *   parent  — sets a PIN, picks a `maxContentRating`, can invite a
 *             child account to be linked under their oversight
 *   child   — installs are gated against the parent's
 *             `maxContentRating`; installs above the rating require
 *             the parent's PIN to be entered on-device
 *
 * A child has at most one parent (parentUserId FK on the child row).
 * A parent can have many children (no enforced cap in v1; future
 * row-count check + family-sharing semantics in P3-E).
 *
 * Linkage flow:
 *   1. parent POSTs /parental-controls/invites with child's email
 *      → server creates a row on the parent's controls with
 *      `pendingChildInviteEmail` set; we DON'T look up the user
 *      yet because the child may not have signed up
 *   2. child POSTs /parental-controls/accept-link with the parent's
 *      `linkToken` → child's controls row is created/updated with
 *      parentUserId pointing at the parent
 *
 * Removing a child: parent POSTs /parental-controls/unlink/:childId
 * which clears the child's parentUserId and removes the PIN gate.
 * Soft-revocation (`unlinkedAt`) keeps an audit row for the family
 * activity log; we hard-delete only on explicit parent request.
 *
 * PIN storage: scrypt hash + 16-byte per-row salt. The PIN doesn't
 * need to defeat a determined attacker — defense is rate limiting +
 * lockout — but scrypt buys us ~100ms per attempt which makes brute-
 * force on a 4-digit PIN take ~17 minutes worst case.
 */

export const parentalControlRoleEnum = pgEnum("parental_control_role", [
  "parent",
  "child",
]);

export const parentalControlRatingEnum = pgEnum("parental_control_rating", [
  "everyone",
  "teen",
  "mature",
]);

export const parentalControls = pgTable(
  "parental_controls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: parentalControlRoleEnum("role").notNull(),
    /** Set only on child rows; FK back to the parent's users.id. */
    parentUserId: uuid("parent_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Set when parent unlinks a child but we want to keep the audit row. */
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
    /**
     * scrypt(pinPlain, pinSalt) hex-encoded. Only present on parent
     * rows — children don't store their own PIN.
     */
    pinHash: text("pin_hash"),
    pinSalt: text("pin_salt"),
    /**
     * Ceiling on what installs the child can attempt without parent
     * unlock. Applies to apps via `app_listings.content_rating`.
     */
    maxContentRating: parentalControlRatingEnum("max_content_rating")
      .default("everyone")
      .notNull(),
    /**
     * Bump on failed PIN attempt; reset on success. Couple with a
     * server-side timestamp gate to lock out a child for N seconds
     * after K consecutive misses. Kept here (not Redis) so the lock
     * survives a worker restart.
     */
    failedPinAttempts: integer("failed_pin_attempts").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    /**
     * Token a child uses to accept a pending invite. Generated server-
     * side, format `om_link_<hex>`. Cleared on accept or on a parent-
     * driven revoke.
     */
    pendingInviteEmail: text("pending_invite_email"),
    pendingInviteToken: text("pending_invite_token"),
    pendingInviteExpiresAt: timestamp("pending_invite_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("parental_controls_user_idx").on(t.userId),
    index("parental_controls_parent_idx").on(t.parentUserId),
    index("parental_controls_token_idx").on(t.pendingInviteToken),
  ],
);
