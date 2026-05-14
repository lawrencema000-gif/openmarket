import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  apps,
  familyGroups,
  familyMembers,
  users,
} from "@openmarket/db/schema";
import {
  acceptInviteSchema,
  createFamilyGroupSchema,
  FAMILY_INVITE_EXPIRY_MS,
  familySharingPatchSchema,
  inviteMemberSchema,
  MAX_FAMILY_MEMBERS,
} from "@openmarket/contracts/family-sharing";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import { generateFamilyInviteToken } from "../lib/family-sharing";
import type { Variables } from "../lib/types";

export const familySharingRouter = new Hono<{ Variables: Variables }>();

/**
 * Family-sharing endpoints (P3-E).
 *
 *   GET    /users/me/family-group              — current group I own or am a member of
 *   POST   /users/me/family-group              — create (caller becomes owner)
 *   POST   /family-groups/:id/invites          — owner invites by email
 *   POST   /family-groups/accept-invite        — invitee claims token
 *   DELETE /family-groups/:id/members/:userId  — owner removes member
 *   DELETE /family-groups/:id                  — owner disbands
 *
 *   PATCH  /apps/:id/family-sharing            — developer (admin+) toggle
 */

async function findProfile(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
}

async function findActiveGroupForUser(userId: string) {
  const membership = await db.query.familyMembers.findFirst({
    where: and(
      eq(familyMembers.userId, userId),
      isNull(familyMembers.removedAt),
    ),
  });
  if (!membership) return null;
  const group = await db.query.familyGroups.findFirst({
    where: eq(familyGroups.id, membership.familyGroupId),
  });
  if (!group) return null;
  return { group, membership };
}

familySharingRouter.get("/users/me/family-group", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await findProfile(user.email);
  if (!profile) throw new HTTPException(403, { message: "Account not found" });

  const found = await findActiveGroupForUser(profile.id);
  if (!found) {
    return c.json({ group: null, role: null, members: [] });
  }

  const memberRows = await db
    .select({
      id: familyMembers.id,
      userId: familyMembers.userId,
      role: familyMembers.role,
      invitedEmail: familyMembers.invitedEmail,
      invitedAt: familyMembers.invitedAt,
      acceptedAt: familyMembers.acceptedAt,
      removedAt: familyMembers.removedAt,
      inviteToken: familyMembers.inviteToken,
      memberEmail: users.email,
      memberDisplayName: users.displayName,
    })
    .from(familyMembers)
    .leftJoin(users, eq(users.id, familyMembers.userId))
    .where(
      and(
        eq(familyMembers.familyGroupId, found.group.id),
        isNull(familyMembers.removedAt),
      ),
    );

  // Don't leak invite tokens to non-owners.
  const isOwner = found.membership.role === "owner";
  const members = memberRows.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    email: m.memberEmail ?? m.invitedEmail,
    displayName: m.memberDisplayName,
    pending: m.acceptedAt == null,
    invitedAt: m.invitedAt,
    acceptedAt: m.acceptedAt,
    inviteToken: isOwner ? m.inviteToken : null,
  }));

  return c.json({
    group: found.group,
    role: found.membership.role,
    members,
  });
});

familySharingRouter.post(
  "/users/me/family-group",
  requireAuth,
  zValidator("json", createFamilyGroupSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const existing = await findActiveGroupForUser(profile.id);
    if (existing) {
      throw new HTTPException(409, {
        message: "You're already part of a family group",
      });
    }

    const [group] = await db
      .insert(familyGroups)
      .values({
        ownerUserId: profile.id,
        name: body.name ?? "My family",
      })
      .returning();

    await db.insert(familyMembers).values({
      familyGroupId: group!.id,
      userId: profile.id,
      role: "owner",
      acceptedAt: new Date(),
    });

    return c.json(group, 201);
  },
);

familySharingRouter.post(
  "/family-groups/:id/invites",
  requireAuth,
  zValidator("json", inviteMemberSchema),
  async (c) => {
    const user = c.get("user");
    const groupId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });
    if (profile.email.toLowerCase() === body.email) {
      throw new HTTPException(400, { message: "Can't invite yourself" });
    }

    const group = await db.query.familyGroups.findFirst({
      where: and(
        eq(familyGroups.id, groupId),
        eq(familyGroups.ownerUserId, profile.id),
      ),
    });
    if (!group) {
      throw new HTTPException(403, {
        message: "Only the family-group owner can invite",
      });
    }

    // Active-member cap (includes owner).
    const activeMembers = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.familyGroupId, groupId),
          isNull(familyMembers.removedAt),
        ),
      );
    if (activeMembers.length >= MAX_FAMILY_MEMBERS) {
      throw new HTTPException(409, {
        message: `Family group is full (max ${MAX_FAMILY_MEMBERS} members including owner)`,
      });
    }

    // Refuse duplicate pending invites for the same email.
    const pending = await db.query.familyMembers.findFirst({
      where: and(
        eq(familyMembers.familyGroupId, groupId),
        eq(familyMembers.invitedEmail, body.email),
        isNull(familyMembers.removedAt),
        isNull(familyMembers.acceptedAt),
      ),
    });
    if (pending) {
      throw new HTTPException(409, {
        message: "An invite is already pending for that email",
      });
    }

    const token = generateFamilyInviteToken();
    const [row] = await db
      .insert(familyMembers)
      .values({
        familyGroupId: groupId,
        role: "member",
        invitedEmail: body.email,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + FAMILY_INVITE_EXPIRY_MS),
      })
      .returning();

    return c.json(
      {
        id: row!.id,
        token,
        acceptUrl: `/account/family/accept/${token}`,
      },
      201,
    );
  },
);

familySharingRouter.post(
  "/family-groups/accept-invite",
  requireAuth,
  zValidator("json", acceptInviteSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const invite = await db.query.familyMembers.findFirst({
      where: eq(familyMembers.inviteToken, body.token),
    });
    if (!invite || invite.removedAt || invite.acceptedAt) {
      throw new HTTPException(404, {
        message: "Invite token not found or already claimed",
      });
    }
    if (invite.inviteExpiresAt && invite.inviteExpiresAt < new Date()) {
      throw new HTTPException(410, { message: "Invite has expired" });
    }
    if (
      invite.invitedEmail &&
      invite.invitedEmail.toLowerCase() !== profile.email.toLowerCase()
    ) {
      throw new HTTPException(403, {
        message: "This invite was sent to a different email",
      });
    }

    // The user can't be a member of another active group at the same
    // time — accept-invite requires they leave the previous one first.
    const existing = await findActiveGroupForUser(profile.id);
    if (existing) {
      throw new HTTPException(409, {
        message: "Leave your current family group before accepting a new invite",
      });
    }

    await db
      .update(familyMembers)
      .set({
        userId: profile.id,
        acceptedAt: new Date(),
        inviteToken: null,
        inviteExpiresAt: null,
      })
      .where(eq(familyMembers.id, invite.id));

    return c.json({ success: true, familyGroupId: invite.familyGroupId });
  },
);

familySharingRouter.delete(
  "/family-groups/:id/members/:userId",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const groupId = c.req.param("id") as string;
    const targetUserId = c.req.param("userId") as string;
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const group = await db.query.familyGroups.findFirst({
      where: and(
        eq(familyGroups.id, groupId),
        eq(familyGroups.ownerUserId, profile.id),
      ),
    });
    if (!group) {
      throw new HTTPException(403, {
        message: "Only the family-group owner can remove members",
      });
    }
    if (targetUserId === profile.id) {
      throw new HTTPException(409, {
        message: "Owners disband via DELETE /family-groups/:id, not member-remove",
      });
    }

    const member = await db.query.familyMembers.findFirst({
      where: and(
        eq(familyMembers.familyGroupId, groupId),
        eq(familyMembers.userId, targetUserId),
        isNull(familyMembers.removedAt),
      ),
    });
    if (!member) {
      throw new HTTPException(404, { message: "Member not found" });
    }

    await db
      .update(familyMembers)
      .set({ removedAt: new Date() })
      .where(eq(familyMembers.id, member.id));

    return c.json({ success: true });
  },
);

familySharingRouter.delete(
  "/family-groups/:id",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const groupId = c.req.param("id") as string;
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const group = await db.query.familyGroups.findFirst({
      where: and(
        eq(familyGroups.id, groupId),
        eq(familyGroups.ownerUserId, profile.id),
      ),
    });
    if (!group) {
      throw new HTTPException(403, {
        message: "Only the family-group owner can disband",
      });
    }

    // ON DELETE CASCADE on family_members handles the child rows.
    await db.delete(familyGroups).where(eq(familyGroups.id, groupId));
    return c.json({ success: true });
  },
);

/**
 * PATCH /apps/:id/family-sharing — developer toggle (P3-E).
 *
 * Requires admin+ via findEffectiveDeveloperContext. We don't gate
 * on app status because devs may want to mark new apps as family-
 * shareable before they go through review.
 */
familySharingRouter.patch(
  "/apps/:id/family-sharing",
  requireAuth,
  zValidator("json", familySharingPatchSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const ctx = await findEffectiveDeveloperContext(user.email);
    if (!ctx) {
      throw new HTTPException(403, {
        message: "No publisher account associated with this user",
      });
    }
    if (!roleSatisfies(ctx.role, "admin")) {
      throw new HTTPException(403, {
        message: `Toggling family sharing requires admin role; you have ${ctx.role}`,
      });
    }

    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, appId), eq(apps.developerId, ctx.developer.id)),
    });
    if (!app) {
      throw new HTTPException(404, {
        message: "App not found or not owned by this publisher",
      });
    }

    await db
      .update(apps)
      .set({ familySharingEnabled: body.enabled, updatedAt: new Date() })
      .where(eq(apps.id, appId));

    return c.json({ success: true, enabled: body.enabled });
  },
);
