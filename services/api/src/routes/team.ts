import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  developers,
  teamMembers,
  users,
} from "@openmarket/db/schema";
import { db } from "../lib/db";
import { devPortalBaseUrl } from "../lib/urls";
import { requireAuth, requireAuthVerified } from "../middleware/auth";
import { findEffectiveDeveloperContext, roleSatisfies } from "../lib/team";
import { enqueueEmail } from "../lib/email";
import type { Variables } from "../lib/types";

export const teamRouter = new Hono<{ Variables: Variables }>();

const INVITE_TTL_DAYS = 7;
const DEV_PORTAL_BASE = devPortalBaseUrl();

const inviteBodySchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(["admin", "developer", "viewer"]),
});

async function requireRole(
  email: string,
  required: "owner" | "admin",
): Promise<{
  developer: typeof developers.$inferSelect;
  role: "owner" | "admin" | "developer" | "viewer";
}> {
  const ctx = await findEffectiveDeveloperContext(email);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }
  if (!roleSatisfies(ctx.role, required)) {
    throw new HTTPException(403, {
      message: `This action requires the "${required}" role; you have "${ctx.role}"`,
    });
  }
  return ctx;
}

/**
 * GET /developers/me/team
 *
 * Returns the membership list for the caller's effective developer
 * context. Anyone in the team can see the list (read-only — viewer
 * role suffices). Includes pending invites alongside accepted
 * members so the dashboard can show a unified "team" view.
 */
teamRouter.get("/developers/me/team", requireAuth, async (c) => {
  const user = c.get("user");
  const ctx = await findEffectiveDeveloperContext(user.email);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }

  const rows = await db
    .select({
      id: teamMembers.id,
      invitedEmail: teamMembers.invitedEmail,
      role: teamMembers.role,
      acceptedAt: teamMembers.acceptedAt,
      revokedAt: teamMembers.revokedAt,
      expiresAt: teamMembers.expiresAt,
      createdAt: teamMembers.createdAt,
      userId: teamMembers.userId,
      userEmail: users.email,
      userDisplayName: users.displayName,
    })
    .from(teamMembers)
    .leftJoin(users, eq(users.id, teamMembers.userId))
    .where(
      and(
        eq(teamMembers.developerId, ctx.developer.id),
        isNull(teamMembers.revokedAt),
      ),
    )
    .orderBy(desc(teamMembers.createdAt));

  return c.json({
    developer: {
      id: ctx.developer.id,
      displayName: ctx.developer.displayName,
      email: ctx.developer.email,
    },
    callerRole: ctx.role,
    // Implicit owner — the developers.email account isn't in
    // team_members. Render it at the top of the list so the UI shows
    // "everyone with access" in one place.
    implicitOwner: {
      email: ctx.developer.email,
      role: "owner" as const,
    },
    members: rows,
  });
});

/**
 * POST /developers/me/team/invites
 *
 * Mint an invite. Requires `admin` (or `owner`) effective role.
 * Validates the invited email isn't already an active member.
 *
 * Returns the invite row + token-bearing accept URL (the same URL
 * that's emailed). The token is in the URL so the dashboard can
 * fall back to copy-link if the email doesn't arrive.
 */
teamRouter.post(
  "/developers/me/team/invites",
  // Inviting teammates is a privileged action — require a verified email.
  requireAuthVerified,
  zValidator("json", inviteBodySchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const ctx = await requireRole(user.email, "admin");
    const invitedEmail = body.email.toLowerCase();

    if (invitedEmail === ctx.developer.email.toLowerCase()) {
      throw new HTTPException(409, {
        message:
          "This email is already the publisher owner — no invite needed",
      });
    }

    // Check for an existing non-revoked row.
    const existing = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.developerId, ctx.developer.id),
        eq(teamMembers.invitedEmail, invitedEmail),
        isNull(teamMembers.revokedAt),
      ),
    });
    if (existing) {
      throw new HTTPException(409, {
        message: existing.acceptedAt
          ? "This person is already a team member"
          : "An outstanding invite already exists for this email — revoke it first to re-send",
      });
    }

    const acceptToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const [invite] = await db
      .insert(teamMembers)
      .values({
        developerId: ctx.developer.id,
        invitedEmail,
        role: body.role,
        invitedBy: ctx.developer.id, // we don't track the human inviter
                                     // separately yet; team-action audit
                                     // is enough granularity for v1
        acceptToken,
        expiresAt,
      })
      .returning();

    const acceptUrl = `${DEV_PORTAL_BASE}/team/accept/${acceptToken}`;
    try {
      await enqueueEmail({
        template: "team-invite",
        to: invitedEmail,
        props: {
          inviterName: ctx.developer.displayName ?? ctx.developer.email,
          developerName:
            ctx.developer.displayName ?? ctx.developer.email,
          role: body.role,
          acceptUrl,
          expiresIn: `in ${INVITE_TTL_DAYS} days`,
        },
        idempotencyKey: `team-invite_${invite!.id}`,
        tags: [{ name: "category", value: "team" }],
      });
    } catch (err) {
      console.warn("[team] invite email failed:", err);
    }

    return c.json(
      {
        id: invite!.id,
        invitedEmail: invite!.invitedEmail,
        role: invite!.role,
        expiresAt: invite!.expiresAt,
        acceptUrl, // returned so the dashboard can show "copy link"
      },
      201,
    );
  },
);

/**
 * POST /team/invites/:token/accept
 *
 * Auth-required: the accepting user must be signed in (or sign up
 * first and then click the link from inside the dev-portal). The
 * accept handler binds the invite's userId to the caller's profile.
 *
 * Validates: token exists, not expired, not revoked, not already
 * accepted, AND the caller's email matches the original invitedEmail
 * (defense against forwarding the invite link to a stranger).
 */
teamRouter.post(
  "/team/invites/:token/accept",
  // The accepting user must have a verified email before being bound into
  // a publisher's team — otherwise an unverified address that merely
  // received the invite link could gain team access.
  requireAuthVerified,
  async (c) => {
    const token = c.req.param("token") as string;
    const user = c.get("user");

    const invite = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.acceptToken, token),
        isNull(teamMembers.acceptedAt),
        isNull(teamMembers.revokedAt),
        isNotNull(teamMembers.expiresAt),
        gt(teamMembers.expiresAt!, new Date()),
      ),
    });
    if (!invite) {
      throw new HTTPException(410, {
        message: "Invite is invalid, revoked, expired, or already accepted",
      });
    }

    if (invite.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new HTTPException(403, {
        message:
          "Sign in with the email this invite was sent to before accepting",
      });
    }

    // Resolve the user's profile row (auto-create if needed via the
    // existing users-table semantics — minimal columns).
    let profile = await db.query.users.findFirst({
      where: eq(users.email, user.email.toLowerCase()),
    });
    if (!profile) {
      const [created] = await db
        .insert(users)
        .values({ authUserId: user.id, email: user.email.toLowerCase() })
        .returning();
      profile = created;
    }

    const [accepted] = await db
      .update(teamMembers)
      .set({
        userId: profile!.id,
        acceptedAt: new Date(),
        acceptToken: null, // burn the token
      })
      .where(eq(teamMembers.id, invite.id))
      .returning();

    return c.json({
      success: true,
      developerId: accepted!.developerId,
      role: accepted!.role,
    });
  },
);

/**
 * DELETE /developers/me/team/members/:id
 *
 * Revoke a team member (or a pending invite). Requires `admin` or
 * `owner` effective role. Soft-delete via revokedAt — the row is
 * kept for audit.
 *
 * Refuses to revoke a member with role=owner (only owner-on-owner
 * with explicit transfer-of-ownership is allowed; we haven't shipped
 * transfer in v1 so owners are immovable here).
 */
teamRouter.delete(
  "/developers/me/team/members/:id",
  // Removing a teammate is privileged — require a verified email.
  requireAuthVerified,
  async (c) => {
    const user = c.get("user");
    const memberId = c.req.param("id") as string;
    const ctx = await requireRole(user.email, "admin");

    const target = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.id, memberId),
        eq(teamMembers.developerId, ctx.developer.id),
      ),
    });
    if (!target) {
      throw new HTTPException(404, {
        message: "Team member not found in this publisher account",
      });
    }
    if (target.role === "owner") {
      throw new HTTPException(409, {
        message:
          "Cannot remove an owner. Transfer ownership first (not yet supported in the dashboard).",
      });
    }
    if (target.revokedAt) {
      throw new HTTPException(409, { message: "Already revoked" });
    }

    await db
      .update(teamMembers)
      .set({ revokedAt: new Date(), acceptToken: null })
      .where(eq(teamMembers.id, memberId));

    return c.json({ success: true, id: memberId });
  },
);

// ────── Test helper export ──────
// Exposed so the test file can avoid re-implementing the role-helper
// import chain when stubbing.
export { findEffectiveDeveloperContext };
