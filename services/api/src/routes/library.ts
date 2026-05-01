import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  apps,
  appListings,
  libraryEntries,
  releases,
  users,
} from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import type { Variables } from "../lib/types";

export const libraryRouter = new Hono<{ Variables: Variables }>();

const recordInstallSchema = z.object({
  versionCode: z.number().int().positive().optional(),
  source: z.enum(["store_app", "web", "direct"]).optional(),
});

async function profileForAuthUser(authUserId: string, email: string) {
  // Mirror of the helper in routes/users.ts but local — keeps the import
  // graph small. Idempotent on email.
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

const statusQuerySchema = z.object({
  status: z.enum(["installed", "uninstalled", "updates", "all"]).default("installed"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * GET /users/me/library?status=installed|uninstalled|updates|all
 *
 * Returns the user's library entries with the current published listing
 * for each app and the latest stable version available. The "updates"
 * filter is computed via SQL: installedVersionCode < latest published
 * stable release for that app.
 */
libraryRouter.get(
  "/users/me/library",
  requireAuth,
  zValidator("query", statusQuerySchema),
  async (c) => {
    const user = c.get("user");
    const { status, page, limit } = c.req.valid("query");
    const profile = await profileForAuthUser(user.id, user.email);
    if (profile.deletedAt) {
      throw new HTTPException(410, { message: "Account pending deletion" });
    }

    // Base WHERE clause based on status filter.
    const baseWhere =
      status === "installed"
        ? and(eq(libraryEntries.userId, profile.id), isNull(libraryEntries.uninstalledAt))
        : status === "uninstalled"
          ? and(eq(libraryEntries.userId, profile.id), isNotNull(libraryEntries.uninstalledAt))
          : eq(libraryEntries.userId, profile.id);

    // Latest stable version per app (used for both surfacing "available" + filtering "updates").
    // Subquery: max(version_code) where status='published' and channel='stable' grouped by app.
    const latestPerApp = db
      .select({
        appId: releases.appId,
        latestVersionCode: sql<number>`max(${releases.versionCode})`.as("latest_version_code"),
      })
      .from(releases)
      .where(and(eq(releases.status, "published"), eq(releases.channel, "stable")))
      .groupBy(releases.appId)
      .as("latest");

    const offset = (page - 1) * limit;

    // Pull entries joined with the current listing + latest version for each app.
    const rows = await db
      .select({
        entry: libraryEntries,
        app: apps,
        listing: appListings,
        latestVersionCode: latestPerApp.latestVersionCode,
      })
      .from(libraryEntries)
      .innerJoin(apps, eq(apps.id, libraryEntries.appId))
      .leftJoin(appListings, eq(appListings.id, apps.currentListingId))
      .leftJoin(latestPerApp, eq(latestPerApp.appId, libraryEntries.appId))
      .where(baseWhere)
      .orderBy(desc(libraryEntries.installedAt))
      .limit(limit)
      .offset(offset);

    let entries = rows.map((r) => ({
      id: r.entry.id,
      installedAt: r.entry.installedAt,
      uninstalledAt: r.entry.uninstalledAt,
      lastOpenedAt: r.entry.lastOpenedAt,
      installedVersionCode: r.entry.installedVersionCode,
      latestVersionCode: r.latestVersionCode,
      hasUpdate:
        r.entry.uninstalledAt === null &&
        r.entry.installedVersionCode != null &&
        r.latestVersionCode != null &&
        r.entry.installedVersionCode < r.latestVersionCode,
      isOwned: r.entry.isOwned,
      source: r.entry.source,
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
    }));

    if (status === "updates") {
      entries = entries.filter((e) => e.hasUpdate);
    }

    return c.json({
      page,
      limit,
      total: entries.length,
      entries,
    });
  },
);

/**
 * POST /users/me/library/:appId
 *
 * Idempotent install. If the entry doesn't exist, create it. If it does
 * exist (e.g., the user previously uninstalled), reactivate it and bump
 * the installed version. The Android client calls this after a successful
 * install; the web "Add to library" button will too.
 */
libraryRouter.post(
  "/users/me/library/:appId",
  requireAuth,
  zValidator("json", recordInstallSchema),
  async (c) => {
    const user = c.get("user");
    const appId = c.req.param("appId") as string;
    const body = c.req.valid("json");
    const profile = await profileForAuthUser(user.id, user.email);

    // App must exist and not be delisted.
    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app || app.isDelisted) {
      throw new HTTPException(404, { message: "App not found" });
    }

    const existing = await db.query.libraryEntries.findFirst({
      where: and(
        eq(libraryEntries.userId, profile.id),
        eq(libraryEntries.appId, appId),
      ),
    });

    if (existing) {
      const [updated] = await db
        .update(libraryEntries)
        .set({
          installedVersionCode: body.versionCode ?? existing.installedVersionCode,
          source: body.source ?? existing.source,
          uninstalledAt: null,
          installedAt: existing.uninstalledAt ? new Date() : existing.installedAt,
          updatedAt: new Date(),
        })
        .where(eq(libraryEntries.id, existing.id))
        .returning();
      return c.json({ entry: updated, reinstalled: existing.uninstalledAt !== null });
    }

    const [created] = await db
      .insert(libraryEntries)
      .values({
        userId: profile.id,
        appId,
        installedVersionCode: body.versionCode,
        source: body.source ?? "store_app",
      })
      .returning();
    return c.json({ entry: created, reinstalled: false }, 201);
  },
);

/**
 * DELETE /users/me/library/:appId — record uninstall.
 *
 * Soft: sets uninstalledAt timestamp. The entry stays so the user can
 * find the app in the "Uninstalled" tab and reinstall.
 */
libraryRouter.delete("/users/me/library/:appId", requireAuth, async (c) => {
  const user = c.get("user");
  const appId = c.req.param("appId") as string;
  const profile = await profileForAuthUser(user.id, user.email);

  const existing = await db.query.libraryEntries.findFirst({
    where: and(
      eq(libraryEntries.userId, profile.id),
      eq(libraryEntries.appId, appId),
    ),
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Not in your library" });
  }
  if (existing.uninstalledAt) {
    return c.json({ entry: existing, alreadyUninstalled: true });
  }

  const [updated] = await db
    .update(libraryEntries)
    .set({ uninstalledAt: new Date(), updatedAt: new Date() })
    .where(eq(libraryEntries.id, existing.id))
    .returning();
  return c.json({ entry: updated, alreadyUninstalled: false });
});

/**
 * POST /users/me/library/:appId/opened — record an "open" event.
 *
 * Updates lastOpenedAt for the entry. Idempotent — multiple rapid calls
 * just update the timestamp. Used by the Android client; a no-op if the
 * user doesn't have the app in their library.
 */
libraryRouter.post("/users/me/library/:appId/opened", requireAuth, async (c) => {
  const user = c.get("user");
  const appId = c.req.param("appId") as string;
  const profile = await profileForAuthUser(user.id, user.email);

  const existing = await db.query.libraryEntries.findFirst({
    where: and(
      eq(libraryEntries.userId, profile.id),
      eq(libraryEntries.appId, appId),
    ),
  });
  if (!existing || existing.uninstalledAt) {
    // Don't error — the Android client will fire this for any open, and
    // the user might have uninstalled. Just no-op.
    return c.json({ recorded: false });
  }
  await db
    .update(libraryEntries)
    .set({ lastOpenedAt: new Date(), updatedAt: new Date() })
    .where(eq(libraryEntries.id, existing.id));
  return c.json({ recorded: true });
});
