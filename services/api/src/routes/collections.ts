import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import {
  apps,
  appListings,
  editorialCollections,
  editorialCollectionItems,
} from "@openmarket/db/schema";
import {
  createCollectionSchema,
  updateCollectionSchema,
  reorderCollectionsSchema,
  addCollectionAppSchema,
  reorderCollectionAppsSchema,
} from "@openmarket/contracts";
import { requireAdmin } from "../middleware/admin";
import { recordAdminAction } from "../lib/audit";
import type { Variables } from "../lib/types";

/**
 * Editorial collections (P2-C) — hand-curated, admin-authored app lists.
 *
 * Three discovery surfaces, kept strictly separate:
 *   - /charts    → ALGORITHMIC (cron-computed rankings)
 *   - /promoted  → PAID, always labeled "Sponsored"
 *   - /collections → HUMAN editorial with a NAMED curator + written rationale;
 *     money can never buy a slot here (there is no billing on this surface).
 *
 * The public reads (GET /collections, GET /collections/:slug) return only
 * PUBLISHED collections and only PUBLISHED, non-delisted apps — so a
 * moderation action on an app silently drops it from every collection it's in.
 * The admin CRUD mirrors routes/categories.ts one-for-one (requireAdmin +
 * recordAdminAction audit), extended with app-membership management.
 */

export const collectionsRouter = new Hono<{ Variables: Variables }>();

/** Max apps returned per collection on the multi-rail home feed. */
const HOME_ITEMS_LIMIT = 12;

type PublicItemRow = {
  collectionId: string;
  position: number;
  note: string | null;
  id: string;
  packageName: string;
  trustTier: string;
  title: string;
  shortDescription: string | null;
  iconUrl: string | null;
  category: string | null;
};

/**
 * Fetch collection members (published + non-delisted apps only), ordered by
 * item position, for a set of collection ids in a single query. Grouped into
 * a Map<collectionId, apps[]> to avoid an N+1 across rails.
 */
async function fetchPublicItems(
  collectionIds: string[],
  perCollectionLimit?: number,
): Promise<Map<string, Array<Omit<PublicItemRow, "collectionId">>>> {
  const byCollection = new Map<string, Array<Omit<PublicItemRow, "collectionId">>>();
  if (collectionIds.length === 0) return byCollection;

  const rows = (await db
    .select({
      collectionId: editorialCollectionItems.collectionId,
      position: editorialCollectionItems.position,
      note: editorialCollectionItems.note,
      id: apps.id,
      packageName: apps.packageName,
      trustTier: apps.trustTier,
      title: appListings.title,
      shortDescription: appListings.shortDescription,
      iconUrl: appListings.iconUrl,
      category: appListings.category,
    })
    .from(editorialCollectionItems)
    .innerJoin(apps, eq(apps.id, editorialCollectionItems.appId))
    .innerJoin(appListings, eq(appListings.id, apps.currentListingId))
    .where(
      and(
        inArray(editorialCollectionItems.collectionId, collectionIds),
        eq(apps.isPublished, true),
        eq(apps.isDelisted, false),
      ),
    )
    .orderBy(asc(editorialCollectionItems.position))) as PublicItemRow[];

  for (const r of rows) {
    const arr = byCollection.get(r.collectionId) ?? [];
    if (perCollectionLimit === undefined || arr.length < perCollectionLimit) {
      const { collectionId: _drop, ...app } = r;
      arr.push(app);
      byCollection.set(r.collectionId, arr);
    }
  }
  return byCollection;
}

/**
 * GET /collections
 *
 * Public. The home-page editorial feed: every PUBLISHED collection in display
 * order, each with up to HOME_ITEMS_LIMIT of its (published, non-delisted)
 * apps inlined. Collections with zero currently-visible apps are dropped so
 * the storefront never renders an empty rail.
 */
collectionsRouter.get("/collections", async (c) => {
  const cols = await db
    .select({
      id: editorialCollections.id,
      slug: editorialCollections.slug,
      title: editorialCollections.title,
      blurb: editorialCollections.blurb,
      rationale: editorialCollections.rationale,
      curatorName: editorialCollections.curatorName,
      icon: editorialCollections.icon,
      position: editorialCollections.position,
    })
    .from(editorialCollections)
    .where(eq(editorialCollections.isPublished, true))
    .orderBy(asc(editorialCollections.position));

  const items = await fetchPublicItems(
    cols.map((col) => col.id),
    HOME_ITEMS_LIMIT,
  );

  const withApps = cols
    .map((col) => ({ ...col, apps: items.get(col.id) ?? [] }))
    .filter((col) => col.apps.length > 0);

  return c.json({ collections: withApps });
});

/**
 * GET /collections/:slug
 *
 * Public. A single published collection with ALL its visible apps + the
 * curator's rationale and per-app notes. Backs /collections/<slug>.
 */
collectionsRouter.get("/collections/:slug", async (c) => {
  const slug = c.req.param("slug") as string;

  const collection = await db.query.editorialCollections.findFirst({
    where: and(
      eq(editorialCollections.slug, slug),
      eq(editorialCollections.isPublished, true),
    ),
  });
  if (!collection) {
    throw new HTTPException(404, { message: "Collection not found" });
  }

  const items = await fetchPublicItems([collection.id]);
  return c.json({
    collection,
    apps: items.get(collection.id) ?? [],
  });
});

// ───────── Admin CRUD ─────────

/**
 * GET /admin/collections — all collections (incl. unpublished) + itemCount.
 */
collectionsRouter.get("/admin/collections", requireAdmin, async (c) => {
  const rows = await db
    .select({
      id: editorialCollections.id,
      slug: editorialCollections.slug,
      title: editorialCollections.title,
      blurb: editorialCollections.blurb,
      rationale: editorialCollections.rationale,
      curatorName: editorialCollections.curatorName,
      icon: editorialCollections.icon,
      isPublished: editorialCollections.isPublished,
      position: editorialCollections.position,
      createdAt: editorialCollections.createdAt,
      updatedAt: editorialCollections.updatedAt,
      itemCount: sql<number>`count(${editorialCollectionItems.id})`.as("item_count"),
    })
    .from(editorialCollections)
    .leftJoin(
      editorialCollectionItems,
      eq(editorialCollectionItems.collectionId, editorialCollections.id),
    )
    .groupBy(editorialCollections.id)
    .orderBy(asc(editorialCollections.position));

  return c.json(rows.map((r) => ({ ...r, itemCount: Number(r.itemCount ?? 0) })));
});

/**
 * GET /admin/collections/:slug — full collection + members (incl. unpublished
 * apps, so a moderator can see and remove them). NOTE: registered before the
 * :slug pattern can shadow it because the app-search endpoint lives at a
 * distinct top-level path (/admin/collection-app-search).
 */
collectionsRouter.get("/admin/collections/:slug", requireAdmin, async (c) => {
  const slug = c.req.param("slug") as string;
  const collection = await db.query.editorialCollections.findFirst({
    where: eq(editorialCollections.slug, slug),
  });
  if (!collection) {
    throw new HTTPException(404, { message: "Collection not found" });
  }

  const items = await db
    .select({
      itemId: editorialCollectionItems.id,
      position: editorialCollectionItems.position,
      note: editorialCollectionItems.note,
      appId: apps.id,
      packageName: apps.packageName,
      trustTier: apps.trustTier,
      isPublished: apps.isPublished,
      isDelisted: apps.isDelisted,
      title: appListings.title,
      iconUrl: appListings.iconUrl,
    })
    .from(editorialCollectionItems)
    .innerJoin(apps, eq(apps.id, editorialCollectionItems.appId))
    .leftJoin(appListings, eq(appListings.id, apps.currentListingId))
    .where(eq(editorialCollectionItems.collectionId, collection.id))
    .orderBy(asc(editorialCollectionItems.position));

  return c.json({ collection, apps: items });
});

/**
 * GET /admin/collection-app-search?q= — typeahead for the add-app picker.
 * Postgres title ILIKE (not Meilisearch) so the admin editor works even when
 * the search index is cold. Distinct top-level path so it can't be shadowed
 * by GET /admin/collections/:slug.
 */
collectionsRouter.get(
  "/admin/collection-app-search",
  requireAdmin,
  zValidator("query", z.object({ q: z.string().min(1).max(100) })),
  async (c) => {
    const { q } = c.req.valid("query");
    const rows = await db
      .select({
        id: apps.id,
        packageName: apps.packageName,
        trustTier: apps.trustTier,
        title: appListings.title,
        iconUrl: appListings.iconUrl,
      })
      .from(apps)
      .innerJoin(appListings, eq(appListings.id, apps.currentListingId))
      .where(
        and(
          ilike(appListings.title, `%${q}%`),
          eq(apps.isPublished, true),
          eq(apps.isDelisted, false),
        ),
      )
      .limit(10);
    return c.json({ items: rows });
  },
);

collectionsRouter.post(
  "/admin/collections",
  requireAdmin,
  zValidator("json", createCollectionSchema),
  async (c) => {
    const body = c.req.valid("json");
    const existing = await db.query.editorialCollections.findFirst({
      where: eq(editorialCollections.slug, body.slug),
    });
    if (existing) {
      throw new HTTPException(409, {
        message: `Collection "${body.slug}" already exists`,
      });
    }

    const [created] = await db
      .insert(editorialCollections)
      .values({
        slug: body.slug,
        title: body.title,
        blurb: body.blurb,
        rationale: body.rationale,
        curatorName: body.curatorName,
        icon: body.icon,
        position: body.position ?? 0,
        isPublished: body.isPublished ?? false,
      })
      .returning();
    await recordAdminAction({
      c,
      action: "collection.create",
      targetType: "collection",
      targetId: body.slug,
      diff: { after: created },
    });
    return c.json(created, 201);
  },
);

collectionsRouter.patch(
  "/admin/collections/:slug",
  requireAdmin,
  zValidator("json", updateCollectionSchema),
  async (c) => {
    const slug = c.req.param("slug") as string;
    const body = c.req.valid("json");
    const existing = await db.query.editorialCollections.findFirst({
      where: eq(editorialCollections.slug, slug),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Collection not found" });
    }

    const [updated] = await db
      .update(editorialCollections)
      .set({
        ...(body.title !== undefined && { title: body.title }),
        ...(body.blurb !== undefined && { blurb: body.blurb }),
        ...(body.rationale !== undefined && { rationale: body.rationale }),
        ...(body.curatorName !== undefined && { curatorName: body.curatorName }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
        updatedAt: new Date(),
      })
      .where(eq(editorialCollections.slug, slug))
      .returning();
    await recordAdminAction({
      c,
      action: "collection.update",
      targetType: "collection",
      targetId: slug,
      diff: { before: existing, after: updated },
    });
    return c.json(updated);
  },
);

/**
 * POST /admin/collections/reorder — bulk position update (drag-and-drop).
 * Body: { positions: [{ slug, position }, ...] }
 */
collectionsRouter.post(
  "/admin/collections/reorder",
  requireAdmin,
  zValidator("json", reorderCollectionsSchema),
  async (c) => {
    const body = c.req.valid("json");
    await db.transaction(async (tx) => {
      const now = new Date();
      for (const p of body.positions) {
        await tx
          .update(editorialCollections)
          .set({ position: p.position, updatedAt: now })
          .where(eq(editorialCollections.slug, p.slug));
      }
    });
    await recordAdminAction({
      c,
      action: "collection.reorder",
      targetType: "collection",
      targetId: null,
      metadata: { positions: body.positions },
    });
    return c.json({ success: true, updatedCount: body.positions.length });
  },
);

collectionsRouter.delete("/admin/collections/:slug", requireAdmin, async (c) => {
  const slug = c.req.param("slug") as string;
  const existing = await db.query.editorialCollections.findFirst({
    where: eq(editorialCollections.slug, slug),
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Collection not found" });
  }
  // collection_items rows cascade via FK onDelete.
  await db.delete(editorialCollections).where(eq(editorialCollections.slug, slug));
  await recordAdminAction({
    c,
    action: "collection.delete",
    targetType: "collection",
    targetId: slug,
    diff: { before: existing },
  });
  return c.json({ success: true, slug });
});

// ───────── Admin membership management ─────────

/** Resolve a collection by slug or 404. */
async function requireCollection(slug: string) {
  const collection = await db.query.editorialCollections.findFirst({
    where: eq(editorialCollections.slug, slug),
  });
  if (!collection) {
    throw new HTTPException(404, { message: "Collection not found" });
  }
  return collection;
}

/**
 * POST /admin/collections/:slug/apps — add an app to the end of a collection.
 */
collectionsRouter.post(
  "/admin/collections/:slug/apps",
  requireAdmin,
  zValidator("json", addCollectionAppSchema),
  async (c) => {
    const slug = c.req.param("slug") as string;
    const body = c.req.valid("json");
    const collection = await requireCollection(slug);

    const app = await db.query.apps.findFirst({ where: eq(apps.id, body.appId) });
    if (!app) {
      throw new HTTPException(404, { message: "App not found" });
    }

    const dupe = await db.query.editorialCollectionItems.findFirst({
      where: and(
        eq(editorialCollectionItems.collectionId, collection.id),
        eq(editorialCollectionItems.appId, body.appId),
      ),
    });
    if (dupe) {
      throw new HTTPException(409, {
        message: "App is already in this collection",
      });
    }

    const maxRows = await db
      .select({
        max: sql<number>`coalesce(max(${editorialCollectionItems.position}), -1)`.as(
          "max",
        ),
      })
      .from(editorialCollectionItems)
      .where(eq(editorialCollectionItems.collectionId, collection.id));
    const nextPos = Number(maxRows[0]?.max ?? -1) + 1;

    const [created] = await db
      .insert(editorialCollectionItems)
      .values({
        collectionId: collection.id,
        appId: body.appId,
        position: nextPos,
        note: body.note,
      })
      .returning();
    await recordAdminAction({
      c,
      action: "collection.app.add",
      targetType: "collection",
      targetId: slug,
      metadata: { appId: body.appId },
    });
    return c.json(created, 201);
  },
);

/**
 * DELETE /admin/collections/:slug/apps/:appId — remove an app.
 */
collectionsRouter.delete(
  "/admin/collections/:slug/apps/:appId",
  requireAdmin,
  async (c) => {
    const slug = c.req.param("slug") as string;
    const appId = c.req.param("appId") as string;
    const collection = await requireCollection(slug);

    await db
      .delete(editorialCollectionItems)
      .where(
        and(
          eq(editorialCollectionItems.collectionId, collection.id),
          eq(editorialCollectionItems.appId, appId),
        ),
      );
    await recordAdminAction({
      c,
      action: "collection.app.remove",
      targetType: "collection",
      targetId: slug,
      metadata: { appId },
    });
    return c.json({ success: true, appId });
  },
);

/**
 * POST /admin/collections/:slug/apps/reorder — reorder members.
 * Body: { items: [{ appId, position }, ...] }
 */
collectionsRouter.post(
  "/admin/collections/:slug/apps/reorder",
  requireAdmin,
  zValidator("json", reorderCollectionAppsSchema),
  async (c) => {
    const slug = c.req.param("slug") as string;
    const body = c.req.valid("json");
    const collection = await requireCollection(slug);

    await db.transaction(async (tx) => {
      for (const it of body.items) {
        await tx
          .update(editorialCollectionItems)
          .set({ position: it.position })
          .where(
            and(
              eq(editorialCollectionItems.collectionId, collection.id),
              eq(editorialCollectionItems.appId, it.appId),
            ),
          );
      }
    });
    await recordAdminAction({
      c,
      action: "collection.app.reorder",
      targetType: "collection",
      targetId: slug,
      metadata: { count: body.items.length },
    });
    return c.json({ success: true, updatedCount: body.items.length });
  },
);
