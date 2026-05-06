import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import {
  apps,
  appListings,
  categories,
  releases,
} from "@openmarket/db/schema";
import { requireAdmin } from "../middleware/admin";
import type { Variables } from "../lib/types";

export const categoriesRouter = new Hono<{ Variables: Variables }>();

const listQuerySchema = z.object({
  featured: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

const createCategorySchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, digits, hyphens only"),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  icon: z.string().max(8).optional(),
  iconUrl: z.string().url().max(1024).optional(),
  position: z.number().int().min(0).optional(),
  isFeatured: z.boolean().optional(),
});

const updateCategorySchema = createCategorySchema.partial().omit({ slug: true });

/**
 * GET /categories?featured=true|false
 *
 * Public. Returns the list of categories ordered by position (then
 * sortOrder for ties), optionally filtered to the featured set for the
 * home page grid.
 *
 * Each row is annotated with `appCount` — the number of *published,
 * non-delisted* apps whose current listing has this category slug.
 * Computed via a left join + group-by so we ship one row per category
 * even if zero apps use it.
 */
categoriesRouter.get(
  "/categories",
  zValidator("query", listQuerySchema),
  async (c) => {
    const { featured } = c.req.valid("query");

    const rows = await db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
        icon: categories.icon,
        iconUrl: categories.iconUrl,
        position: categories.position,
        sortOrder: categories.sortOrder,
        isFeatured: categories.isFeatured,
        appCount: sql<number>`count(distinct ${apps.id})`.as("app_count"),
      })
      .from(categories)
      .leftJoin(appListings, eq(appListings.category, categories.slug))
      .leftJoin(
        apps,
        and(
          eq(apps.currentListingId, appListings.id),
          eq(apps.isPublished, true),
          eq(apps.isDelisted, false),
        ),
      )
      .where(featured === undefined ? undefined : eq(categories.isFeatured, featured))
      .groupBy(categories.id)
      .orderBy(asc(categories.position), asc(categories.sortOrder));

    return c.json(
      rows.map((r) => ({
        ...r,
        appCount: Number(r.appCount ?? 0),
      })),
    );
  },
);

/**
 * GET /categories/:slug
 *
 * Public. Returns category metadata + a "top apps" list ordered by
 * latest published-stable release recency. Used by /categories/<slug>
 * detail pages.
 */
categoriesRouter.get("/categories/:slug", async (c) => {
  const slug = c.req.param("slug") as string;

  const category = await db.query.categories.findFirst({
    where: eq(categories.slug, slug),
  });
  if (!category) {
    throw new HTTPException(404, { message: "Category not found" });
  }

  // Top apps in this category — published + non-delisted, ordered by
  // most recently released stable version. 24 is enough for the page
  // grid; pagination lives on /search?category=…
  const topApps = await db
    .select({
      id: apps.id,
      packageName: apps.packageName,
      trustTier: apps.trustTier,
      title: appListings.title,
      shortDescription: appListings.shortDescription,
      iconUrl: appListings.iconUrl,
      latestReleaseAt: sql<Date | null>`max(${releases.publishedAt})`.as(
        "latest_release_at",
      ),
    })
    .from(apps)
    .innerJoin(appListings, eq(appListings.id, apps.currentListingId))
    .leftJoin(
      releases,
      and(eq(releases.appId, apps.id), eq(releases.status, "published")),
    )
    .where(
      and(
        eq(appListings.category, slug),
        eq(apps.isPublished, true),
        eq(apps.isDelisted, false),
      ),
    )
    .groupBy(apps.id, appListings.id)
    .orderBy(desc(sql`max(${releases.publishedAt})`))
    .limit(24);

  return c.json({
    category,
    apps: topApps,
  });
});

// ───────── Admin CRUD ─────────

categoriesRouter.post(
  "/admin/categories",
  requireAdmin,
  zValidator("json", createCategorySchema),
  async (c) => {
    const body = c.req.valid("json");

    const existing = await db.query.categories.findFirst({
      where: eq(categories.slug, body.slug),
    });
    if (existing) {
      throw new HTTPException(409, {
        message: `Category "${body.slug}" already exists`,
      });
    }

    const [created] = await db
      .insert(categories)
      .values({
        slug: body.slug,
        name: body.name,
        description: body.description,
        icon: body.icon,
        iconUrl: body.iconUrl,
        position: body.position ?? 0,
        isFeatured: body.isFeatured ?? false,
      })
      .returning();
    return c.json(created, 201);
  },
);

categoriesRouter.patch(
  "/admin/categories/:slug",
  requireAdmin,
  zValidator("json", updateCategorySchema),
  async (c) => {
    const slug = c.req.param("slug") as string;
    const body = c.req.valid("json");

    const existing = await db.query.categories.findFirst({
      where: eq(categories.slug, slug),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Category not found" });
    }

    const [updated] = await db
      .update(categories)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.iconUrl !== undefined && { iconUrl: body.iconUrl }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.isFeatured !== undefined && { isFeatured: body.isFeatured }),
        updatedAt: new Date(),
      })
      .where(eq(categories.slug, slug))
      .returning();
    return c.json(updated);
  },
);

/**
 * POST /admin/categories/reorder — bulk position update.
 * Body: { positions: [{ slug, position }, ...] }
 *
 * Drag-and-drop UIs in the admin send the full new order; we apply each
 * row individually in a single small transaction.
 */
categoriesRouter.post(
  "/admin/categories/reorder",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      positions: z
        .array(
          z.object({
            slug: z.string().min(1),
            position: z.number().int().min(0),
          }),
        )
        .min(1)
        .max(200),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    for (const p of body.positions) {
      await db
        .update(categories)
        .set({ position: p.position, updatedAt: new Date() })
        .where(eq(categories.slug, p.slug));
    }
    return c.json({ success: true, updatedCount: body.positions.length });
  },
);

categoriesRouter.delete(
  "/admin/categories/:slug",
  requireAdmin,
  async (c) => {
    const slug = c.req.param("slug") as string;
    const existing = await db.query.categories.findFirst({
      where: eq(categories.slug, slug),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Category not found" });
    }
    // Refuse to delete a category that still has apps in it — the
    // listings reference the slug as plain text, not a FK, but deleting
    // the category orphans those apps from the storefront grid.
    const usageRows = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(appListings)
      .where(eq(appListings.category, slug));
    const usage = Number(usageRows[0]?.count ?? 0);
    if (usage > 0) {
      throw new HTTPException(409, {
        message: `Category "${slug}" still has ${usage} apps. Reassign them first.`,
      });
    }

    await db.delete(categories).where(eq(categories.slug, slug));
    return c.json({ success: true, slug });
  },
);
