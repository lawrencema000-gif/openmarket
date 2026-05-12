import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { developers } from "./developers";
import { users } from "./users";

/**
 * Per-developer-entity team membership. A "developer" in our model is
 * the publishing identity (the row apps.developerId points at); a
 * "team_member" is a human that has been granted some role inside
 * that publishing identity.
 *
 * Role ladder (highest → lowest):
 *   - owner     full control; cannot be removed except by another
 *               owner; can transfer ownership; can delete the team
 *   - admin     invite/remove non-owner members, manage API tokens,
 *               publish releases, edit listings
 *   - developer publish releases, edit listings, view stats; no team
 *               management
 *   - viewer    read-only across the dashboard (statistics, releases,
 *               team list); cannot publish, cannot edit
 *
 * Backwards compatibility: the original 1:1 developer→email mapping
 * still works. The `developers.email` row continues to be treated as
 * the implicit "owner" — `findEffectiveDeveloperContext` walks the
 * email match first, then falls back to team_members lookup. We
 * never auto-create team_members rows for the email-owner; their
 * ownership is implied so removing them is impossible.
 *
 * Invite flow:
 *   1. Owner/admin invites by email → row inserted with
 *      acceptedAt=null, invitedEmail, acceptToken (random 32B)
 *   2. Recipient clicks the email link → POSTs the token to
 *      /developers/team/invites/:token/accept
 *   3. On accept we set acceptedAt + bind userId to the accepting
 *      account (joined on auth_user.email match)
 *
 * A pending invite (acceptedAt IS NULL) has userId=null. We use
 * `invited_email` instead of a userId lookup at insert time because
 * the invited person may not have an account yet — they sign up after
 * clicking the email and the accept handler resolves the binding.
 *
 * UNIQUE on (developerId, invitedEmail) prevents accidental duplicate
 * invites; UNIQUE on (developerId, userId) prevents the same human
 * from being added twice (after accept).
 */

export const teamRoleEnum = pgEnum("team_role", [
  "owner",
  "admin",
  "developer",
  "viewer",
]);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    /** Set once the invite is accepted; NULL while pending. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    role: teamRoleEnum("role").notNull(),
    /** Email the invite was originally sent to. Kept after accept for audit. */
    invitedEmail: text("invited_email").notNull(),
    /** developers.id of the inviter (the owner/admin who clicked invite). */
    invitedBy: uuid("invited_by"),
    /**
     * 32-byte hex token used in the accept URL. Null after the invite
     * has been consumed.
     */
    acceptToken: text("accept_token"),
    /**
     * Pending invites expire after 7 days; the accept endpoint
     * rejects tokens older than this.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // One outstanding invite per (developer, email).
    uniqueIndex("team_members_dev_email_idx").on(t.developerId, t.invitedEmail),
    // One active membership per (developer, user). NULL userId rows
    // (pending invites) are allowed to coexist — Postgres treats NULLs
    // as distinct in unique indexes by default.
    uniqueIndex("team_members_dev_user_idx").on(t.developerId, t.userId),
    index("team_members_user_idx").on(t.userId),
    index("team_members_token_idx").on(t.acceptToken),
  ],
);
