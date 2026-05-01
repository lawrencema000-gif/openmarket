import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { users } from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  buildMediaKey,
  getPublicMediaUrl,
  getSignedUploadUrl,
  isStorageConfigured,
  StorageNotConfiguredError,
} from "../lib/storage";
import type { Variables } from "../lib/types";

export const usersRouter = new Hono<{ Variables: Variables }>();

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  locale: z
    .string()
    .regex(/^[a-z]{2}-[A-Z]{2}$/, "must be a BCP 47 tag like en-US")
    .optional(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, "must be a 2-letter country code")
    .optional(),
  notificationPreferences: z
    .object({
      email: z
        .object({
          transactional: z.boolean().optional(),
          reviewReply: z.boolean().optional(),
          updateAvailable: z.boolean().optional(),
          marketing: z.boolean().optional(),
        })
        .optional(),
      push: z
        .object({
          transactional: z.boolean().optional(),
          reviewReply: z.boolean().optional(),
          updateAvailable: z.boolean().optional(),
          marketing: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Find the storefront profile linked to a Better Auth user. Lazy-creates if
 * the row doesn't exist yet — covers the case where someone signed up before
 * the after-create hook landed.
 */
async function findOrCreateProfile(authUserId: string, email: string) {
  const existing = await db.query.users.findFirst({
    where: eq(users.authUserId, authUserId),
  });
  if (existing) return existing;

  // Lazy-create. Idempotent on email (already unique).
  const [created] = await db
    .insert(users)
    .values({ authUserId, email: email.toLowerCase() })
    .onConflictDoUpdate({
      target: users.email,
      set: { authUserId },
    })
    .returning();
  return created!;
}

// Public profile shape — never leak email or auth IDs in cross-user contexts.
function toPublicProfile(profile: typeof users.$inferSelect) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.createdAt,
  };
}

function toSelfProfile(profile: typeof users.$inferSelect) {
  return {
    ...toPublicProfile(profile),
    email: profile.email,
    locale: profile.locale,
    country: profile.country,
    notificationPreferences: profile.notificationPreferences,
    deletedAt: profile.deletedAt,
  };
}

// GET /users/me — full profile for the signed-in user.
usersRouter.get("/users/me", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await findOrCreateProfile(user.id, user.email);
  if (profile.deletedAt) {
    // Account is in soft-deleted state; treat as if signed out.
    throw new HTTPException(410, {
      message: "This account is pending deletion",
    });
  }
  return c.json(toSelfProfile(profile));
});

// PATCH /users/me — partial update of profile fields.
usersRouter.patch(
  "/users/me",
  requireAuth,
  zValidator("json", updateProfileSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findOrCreateProfile(user.id, user.email);
    if (profile.deletedAt) {
      throw new HTTPException(410, { message: "Account pending deletion" });
    }

    // Merge notificationPreferences shallowly so partial updates don't wipe
    // the whole tree.
    const mergedPrefs = body.notificationPreferences
      ? mergePrefs(profile.notificationPreferences, body.notificationPreferences)
      : profile.notificationPreferences;

    const [updated] = await db
      .update(users)
      .set({
        displayName: body.displayName ?? profile.displayName,
        locale: body.locale ?? profile.locale,
        country: body.country ?? profile.country,
        notificationPreferences: mergedPrefs,
        updatedAt: new Date(),
      })
      .where(eq(users.id, profile.id))
      .returning();

    return c.json(toSelfProfile(updated!));
  },
);

// DELETE /users/me — soft delete. Hard-delete cron sweeps after 30 days.
usersRouter.delete("/users/me", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await findOrCreateProfile(user.id, user.email);
  if (profile.deletedAt) {
    return c.json({ success: true, alreadyDeleted: true });
  }
  const deletedAt = new Date();
  await db.update(users).set({ deletedAt, updatedAt: deletedAt }).where(eq(users.id, profile.id));
  return c.json({
    success: true,
    deletedAt: deletedAt.toISOString(),
    hardDeleteScheduledAt: new Date(
      deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
  });
});

// POST /users/me/avatar/upload-url — return a presigned PUT URL for an image.
usersRouter.post(
  "/users/me/avatar/upload-url",
  requireAuth,
  zValidator(
    "json",
    z.object({
      contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
      contentHash: z.string().regex(/^[a-f0-9]{16,64}$/i, "must be hex content hash"),
      fileSize: z.number().int().positive().max(2 * 1024 * 1024, "max 2MB"),
    }),
  ),
  async (c) => {
    if (!isStorageConfigured()) {
      throw new HTTPException(503, { message: "Storage not configured" });
    }
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findOrCreateProfile(user.id, user.email);

    const ext =
      body.contentType === "image/png" ? "png"
      : body.contentType === "image/jpeg" ? "jpg"
      : "webp";

    const key = buildMediaKey({
      appId: `users-${profile.id}`,
      kind: "icon",
      contentHash: body.contentHash,
      ext,
    });

    let signed;
    try {
      signed = await getSignedUploadUrl({
        bucket: "media",
        key,
        contentType: body.contentType,
        contentLength: body.fileSize,
        expiresInSeconds: 600,
      });
    } catch (err) {
      if (err instanceof StorageNotConfiguredError) {
        throw new HTTPException(503, { message: err.message });
      }
      throw err;
    }
    return c.json({
      uploadUrl: signed.url,
      bucket: signed.bucket,
      key: signed.key,
      publicUrl: getPublicMediaUrl(key),
      expiresAt: signed.expiresAt.toISOString(),
    });
  },
);

// POST /users/me/avatar/finalize — record the new avatar URL after upload.
usersRouter.post(
  "/users/me/avatar/finalize",
  requireAuth,
  zValidator("json", z.object({ avatarUrl: z.string().url().max(1024) })),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const profile = await findOrCreateProfile(user.id, user.email);
    const [updated] = await db
      .update(users)
      .set({ avatarUrl: body.avatarUrl, updatedAt: new Date() })
      .where(eq(users.id, profile.id))
      .returning();
    return c.json(toSelfProfile(updated!));
  },
);

// GET /users/:id — public profile lookup (used in review threads, etc.).
usersRouter.get("/users/:id", async (c) => {
  const id = c.req.param("id") as string;
  const profile = await db.query.users.findFirst({
    where: eq(users.id, id),
  });
  if (!profile || profile.deletedAt) {
    throw new HTTPException(404, { message: "User not found" });
  }
  return c.json(toPublicProfile(profile));
});

// Internal helper for hard-delete cron — finds users whose soft-delete
// window has elapsed. Exposed via internal admin endpoint.
export async function findUsersForHardDelete(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return db.query.users.findMany({
    where: (u, { and, lte, isNotNull }) =>
      and(isNotNull(u.deletedAt), lte(u.deletedAt, cutoff)),
  });
}

function mergePrefs(
  current: unknown,
  patch: { email?: Record<string, boolean>; push?: Record<string, boolean> },
): unknown {
  const base = (current ?? {}) as { email?: Record<string, boolean>; push?: Record<string, boolean> };
  return {
    email: { ...(base.email ?? {}), ...(patch.email ?? {}) },
    push: { ...(base.push ?? {}), ...(patch.push ?? {}) },
  };
}

// Re-exported for parity with existing routes.
export { isNull };
