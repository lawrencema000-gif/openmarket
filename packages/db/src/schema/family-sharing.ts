import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Family-sharing groups (P3-E).
 *
 * Distinct from parental_controls (P3-F):
 *   - parental_controls is about supervision (PIN gate, content
 *     rating ceiling)
 *   - family_groups is about sharing (the owner's installed apps
 *     appear in members' libraries when the developer opts the app
 *     into family sharing)
 *
 * One owner per group; up to 5 total members including the owner
 * (4 invitees max). The cap is enforced in the API; we don't carry
 * a column for it because changes to the policy shouldn't require
 * a migration.
 *
 * Removed members are kept as soft-deleted rows (removedAt) so the
 * audit log survives.
 */
export const familyMemberRoleEnum = pgEnum("family_member_role", [
  "owner",
  "member",
]);

export const familyGroups = pgTable(
  "family_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").default("My family").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("family_groups_owner_idx").on(t.ownerUserId)],
);

/**
 * Per-member row inside a family group.
 *
 * The owner gets a row too (role='owner', acceptedAt=createdAt) so
 * "count of active members" is just `removedAt IS NULL`.
 *
 * Invites:
 *   - owner POSTs /invites with an email → row inserted with
 *     invitedEmail + inviteToken, no userId yet
 *   - invitee accepts via /accept-invite { token } → row updated
 *     with userId + acceptedAt, token cleared
 *
 * A user can be a member of at most one family group at a time
 * (enforced in the API, not the schema, to keep migration churn low).
 */
export const familyMembers = pgTable(
  "family_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyGroupId: uuid("family_group_id")
      .references(() => familyGroups.id, { onDelete: "cascade" })
      .notNull(),
    /** Set after the invitee accepts; null while invite is pending. */
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    role: familyMemberRoleEnum("role").default("member").notNull(),
    invitedEmail: text("invited_email"),
    inviteToken: text("invite_token"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("family_members_token_idx").on(t.inviteToken),
    index("family_members_group_idx").on(t.familyGroupId, t.removedAt),
    index("family_members_user_idx").on(t.userId, t.removedAt),
  ],
);
