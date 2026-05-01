import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  apps,
  appListings,
  users,
  wishlistEntries,
} from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import type { Variables } from "../lib/types";

export const wishlistRouter = new Hono<{ Variables: Variables }>();

async function profileForAuthUser(authUserId: string, email: string) {
  const existing = await db.query.users.findFirst({
    where: eq(users.authUserId, authUserId),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ authUserId, email: email.toLowerCase() })
    .onConflictDoUpdate({ target: users.email, set: { authUserId } })
    .returning();
  return created!;
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(40),
  /**
   * "ids" returns just the appId set — useful for the heart icon to know
   * "is this app on my list?" without paying for the full listing join.
   */
  shape: z.enum(["full", "ids"]).default("full"),
});

/**
 * GET /users/me/wishlist
 *
 * shape=full (default): each entry with the current listing for rendering.
 * shape=ids: just `{ appIds: string[] }` for cheap "is this wishlisted?" checks.
 */
wishlistRouter.get(
  "/users/me/wishlist",
  requireAuth,
  zValidator("query", listQuerySchema),
  async (c) => {
    const user = c.get("user");
    const { page, limit, shape } = c.req.valid("query");
    const profile = await profileForAuthUser(user.id, user.email);
    if (profile.deletedAt) {
      throw new HTTPException(410, { message: "Account pending deletion" });
    }

    if (shape === "ids") {
      const rows = await db
        .select({ appId: wishlistEntries.appId })
        .from(wishlistEntries)
        .where(eq(wishlistEntries.userId, profile.id));
      return c.json({ appIds: rows.map((r) => r.appId) });
    }

    const offset = (page - 1) * limit;
    const rows = await db
      .select({
        entry: wishlistEntries,
        app: apps,
        listing: appListings,
      })
      .from(wishlistEntries)
      .innerJoin(apps, eq(apps.id, wishlistEntries.appId))
      .leftJoin(appListings, eq(appListings.id, apps.currentListingId))
      .where(eq(wishlistEntries.userId, profile.id))
      .orderBy(desc(wishlistEntries.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      page,
      limit,
      total: rows.length,
      entries: rows.map((r) => ({
        id: r.entry.id,
        createdAt: r.entry.createdAt,
        app: {
          id: r.app.id,
          packageName: r.app.packageName,
          trustTier: r.app.trustTier,
          listing: r.listing
            ? {
                title: r.listing.title,
                shortDescription: r.listing.shortDescription,
                iconUrl: r.listing.iconUrl,
                category: r.listing.category,
                contentRating: r.listing.contentRating,
              }
            : null,
        },
      })),
    });
  },
);

/**
 * PUT /users/me/wishlist/:appId — idempotent add.
 *
 * Returns 200 on either fresh add or already-present (so the heart icon
 * doesn't have to know which case it's in). 404 if app doesn't exist or
 * is delisted.
 */
wishlistRouter.put("/users/me/wishlist/:appId", requireAuth, async (c) => {
  const user = c.get("user");
  const appId = c.req.param("appId") as string;
  const profile = await profileForAuthUser(user.id, user.email);
  if (profile.deletedAt) {
    throw new HTTPException(410, { message: "Account pending deletion" });
  }

  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }

  // Idempotent insert; on conflict we just return the existing row.
  const [created] = await db
    .insert(wishlistEntries)
    .values({ userId: profile.id, appId })
    .onConflictDoNothing({
      target: [wishlistEntries.userId, wishlistEntries.appId],
    })
    .returning();

  if (created) {
    return c.json({ entry: created, alreadyPresent: false });
  }
  // Conflict — fetch the existing row to return.
  const existing = await db.query.wishlistEntries.findFirst({
    where: and(
      eq(wishlistEntries.userId, profile.id),
      eq(wishlistEntries.appId, appId),
    ),
  });
  return c.json({ entry: existing, alreadyPresent: true });
});

/**
 * DELETE /users/me/wishlist/:appId — idempotent remove.
 *
 * 200 whether the entry existed or not, so unsubscribing twice isn't an
 * error.
 */
wishlistRouter.delete(
  "/users/me/wishlist/:appId",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const appId = c.req.param("appId") as string;
    const profile = await profileForAuthUser(user.id, user.email);

    const deleted = await db
      .delete(wishlistEntries)
      .where(
        and(
          eq(wishlistEntries.userId, profile.id),
          eq(wishlistEntries.appId, appId),
        ),
      )
      .returning();

    return c.json({ removed: deleted.length > 0 });
  },
);
