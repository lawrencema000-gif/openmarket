import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  parentalControls,
  users,
} from "@openmarket/db/schema";
import {
  acceptLinkSchema,
  inviteChildSchema,
  setParentalControlsSchema,
  verifyPinSchema,
} from "@openmarket/contracts/parental-controls";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  PIN_LOCKOUT_DURATION_MS,
  PIN_LOCKOUT_THRESHOLD,
  generateLinkToken,
  getOrCreateControlsRow,
  hashPin,
  verifyPin,
} from "../lib/parental-controls";
import type { Variables } from "../lib/types";

export const parentalControlsRouter = new Hono<{ Variables: Variables }>();

/**
 * Parental controls endpoints (P3-F).
 *
 *   GET    /users/me/parental-controls           — read own row (creates parent row if missing)
 *   PATCH  /users/me/parental-controls           — parent sets PIN / maxContentRating
 *   POST   /users/me/parental-controls/verify-pin
 *                                                — child or parent verifies the parent's PIN
 *                                                  (for install-gate unlock)
 *   POST   /users/me/parental-controls/invites   — parent generates a link token
 *   POST   /users/me/parental-controls/accept-link
 *                                                — child claims a token
 *   POST   /users/me/parental-controls/unlink/:childId
 *                                                — parent removes a child
 */

async function findProfile(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
}

parentalControlsRouter.get(
  "/users/me/parental-controls",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    // Default row is a parent profile — child rows are only created
    // when a parent invites or the child accepts a link.
    const existing = await db.query.parentalControls.findFirst({
      where: eq(parentalControls.userId, profile.id),
    });
    if (!existing) {
      return c.json({
        userId: profile.id,
        role: "parent",
        pinSet: false,
        parentUserId: null,
        maxContentRating: "everyone",
        children: [],
      });
    }

    // If this user is a parent, also surface their linked children
    // so the settings page can render a manage-children list.
    const children =
      existing.role === "parent"
        ? await db
            .select({
              id: parentalControls.userId,
              email: users.email,
              displayName: users.displayName,
              maxContentRating: parentalControls.maxContentRating,
              unlinkedAt: parentalControls.unlinkedAt,
              linkedAt: parentalControls.createdAt,
            })
            .from(parentalControls)
            .innerJoin(users, eq(users.id, parentalControls.userId))
            .where(eq(parentalControls.parentUserId, profile.id))
        : [];

    return c.json({
      userId: existing.userId,
      role: existing.role,
      pinSet: !!existing.pinHash,
      parentUserId: existing.parentUserId,
      maxContentRating: existing.maxContentRating,
      pendingInviteEmail: existing.pendingInviteEmail,
      lockedUntil: existing.lockedUntil,
      children,
    });
  },
);

parentalControlsRouter.patch(
  "/users/me/parental-controls",
  requireAuth,
  zValidator("json", setParentalControlsSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const row = await getOrCreateControlsRow(profile.id, "parent");
    if (row.role !== "parent") {
      throw new HTTPException(403, {
        message:
          "Only the parent on a linked account can change parental controls",
      });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.pin !== undefined) {
      const { hash, salt } = hashPin(body.pin);
      patch.pinHash = hash;
      patch.pinSalt = salt;
      // Resetting the PIN clears any lockout — assume the parent did
      // it because they forgot, not because they were being attacked.
      patch.failedPinAttempts = 0;
      patch.lockedUntil = null;
    }
    if (body.maxContentRating !== undefined) {
      patch.maxContentRating = body.maxContentRating;
    }

    await db
      .update(parentalControls)
      .set(patch)
      .where(eq(parentalControls.id, row.id));

    return c.json({ success: true });
  },
);

parentalControlsRouter.post(
  "/users/me/parental-controls/verify-pin",
  requireAuth,
  zValidator("json", verifyPinSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    // Who's PIN are we checking?
    //   1. caller is the child → use parent's row (via parentUserId)
    //   2. caller is the parent → use their own row (acts as confirmation
    //      that this device/browser actually has the parent's PIN)
    //
    // childUserId param is reserved for future cross-device flows; not
    // used in v1 — we always derive the target from the caller's role.
    const callerRow = await db.query.parentalControls.findFirst({
      where: eq(parentalControls.userId, profile.id),
    });
    const targetUserId =
      callerRow?.role === "child" && callerRow.parentUserId
        ? callerRow.parentUserId
        : profile.id;

    const target = await db.query.parentalControls.findFirst({
      where: eq(parentalControls.userId, targetUserId),
    });
    if (!target || !target.pinHash || !target.pinSalt) {
      throw new HTTPException(409, {
        message:
          "No PIN is set. The parent must set a PIN before unlocks are possible.",
      });
    }

    if (target.lockedUntil && target.lockedUntil > new Date()) {
      throw new HTTPException(429, {
        message: `Too many failed attempts. Try again after ${target.lockedUntil.toISOString()}`,
      });
    }

    const ok = verifyPin(body.pin, target.pinHash, target.pinSalt);
    if (!ok) {
      const newAttempts = target.failedPinAttempts + 1;
      const lock =
        newAttempts >= PIN_LOCKOUT_THRESHOLD
          ? new Date(Date.now() + PIN_LOCKOUT_DURATION_MS)
          : null;
      await db
        .update(parentalControls)
        .set({
          failedPinAttempts: newAttempts,
          lockedUntil: lock,
          updatedAt: new Date(),
        })
        .where(eq(parentalControls.id, target.id));
      throw new HTTPException(401, {
        message: lock ? "PIN locked — too many failures" : "Incorrect PIN",
      });
    }

    // Success — clear the counter + lockout.
    await db
      .update(parentalControls)
      .set({
        failedPinAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(parentalControls.id, target.id));

    return c.json({ success: true });
  },
);

parentalControlsRouter.post(
  "/users/me/parental-controls/invites",
  requireAuth,
  zValidator("json", inviteChildSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });
    if (profile.email.toLowerCase() === body.email) {
      throw new HTTPException(400, { message: "Can't invite yourself" });
    }

    const parentRow = await getOrCreateControlsRow(profile.id, "parent");
    if (parentRow.role !== "parent") {
      throw new HTTPException(403, {
        message:
          "Only the parent on a linked account can invite a child",
      });
    }
    if (!parentRow.pinHash) {
      throw new HTTPException(409, {
        message: "Set a PIN before inviting a child",
      });
    }

    const token = generateLinkToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db
      .update(parentalControls)
      .set({
        pendingInviteEmail: body.email,
        pendingInviteToken: token,
        pendingInviteExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(parentalControls.id, parentRow.id));

    return c.json({
      success: true,
      token,
      expiresAt,
      // Plain text the parent can hand the child — admins handing
      // family-link setup in person is the canonical UX.
      acceptUrl: `/parental-link/${token}`,
    }, 201);
  },
);

parentalControlsRouter.post(
  "/users/me/parental-controls/accept-link",
  requireAuth,
  zValidator("json", acceptLinkSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const parent = await db.query.parentalControls.findFirst({
      where: eq(parentalControls.pendingInviteToken, body.token),
    });
    if (!parent) {
      throw new HTTPException(404, {
        message: "Invite token not found or already claimed",
      });
    }
    if (
      parent.pendingInviteExpiresAt &&
      parent.pendingInviteExpiresAt < new Date()
    ) {
      throw new HTTPException(410, { message: "Invite has expired" });
    }
    if (
      parent.pendingInviteEmail &&
      parent.pendingInviteEmail.toLowerCase() !== profile.email.toLowerCase()
    ) {
      throw new HTTPException(403, {
        message: "This invite was sent to a different email",
      });
    }
    if (parent.userId === profile.id) {
      throw new HTTPException(409, { message: "Can't link yourself as your own child" });
    }

    // Upsert the child's controls row.
    const existing = await db.query.parentalControls.findFirst({
      where: eq(parentalControls.userId, profile.id),
    });
    if (existing) {
      if (existing.role === "parent") {
        throw new HTTPException(409, {
          message:
            "This account is already configured as a parent; unlink first to become a child",
        });
      }
      await db
        .update(parentalControls)
        .set({
          parentUserId: parent.userId,
          unlinkedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(parentalControls.id, existing.id));
    } else {
      await db.insert(parentalControls).values({
        userId: profile.id,
        role: "child",
        parentUserId: parent.userId,
      });
    }

    // Clear the invite slot on the parent so it can't be reused.
    await db
      .update(parentalControls)
      .set({
        pendingInviteEmail: null,
        pendingInviteToken: null,
        pendingInviteExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(parentalControls.id, parent.id));

    return c.json({ success: true, parentUserId: parent.userId });
  },
);

parentalControlsRouter.post(
  "/users/me/parental-controls/unlink/:childId",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const childId = c.req.param("childId") as string;
    const profile = await findProfile(user.email);
    if (!profile) throw new HTTPException(403, { message: "Account not found" });

    const childRow = await db.query.parentalControls.findFirst({
      where: and(
        eq(parentalControls.userId, childId),
        eq(parentalControls.parentUserId, profile.id),
      ),
    });
    if (!childRow) {
      throw new HTTPException(404, {
        message: "Child not found or not linked to this account",
      });
    }
    if (childRow.unlinkedAt) {
      throw new HTTPException(409, { message: "Child is already unlinked" });
    }

    await db
      .update(parentalControls)
      .set({
        parentUserId: null,
        unlinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(parentalControls.id, childRow.id));

    return c.json({ success: true });
  },
);
