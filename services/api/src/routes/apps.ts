import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db";
import { apps, appListings, developers } from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { createAppSchema } from "@openmarket/contracts/apps";
import { paginationSchema } from "@openmarket/contracts/common";
import type { Variables } from "../lib/types";

export const appsRouter = new Hono<{ Variables: Variables }>();

// List apps for authenticated developer
appsRouter.get("/apps", requireAuth, zValidator("query", paginationSchema), async (c) => {
  const user = c.get("user");
  const { page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  const developerApps = await db.query.apps.findMany({
    where: eq(apps.developerId, developer.id),
    with: {
      listings: true,
    },
    limit,
    offset,
  });

  return c.json({ items: developerApps, page, limit });
});

// Create app + initial listing
appsRouter.post(
  "/apps",
  requireAuth,
  zValidator("json", createAppSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    // Check package name uniqueness
    const existingApp = await db.query.apps.findFirst({
      where: eq(apps.packageName, body.packageName),
    });

    if (existingApp) {
      throw new HTTPException(409, {
        message: "An app with this package name already exists",
      });
    }

    // Create app
    const [app] = await db
      .insert(apps)
      .values({
        packageName: body.packageName,
        developerId: developer.id,
      })
      .returning();

    // Create initial listing
    const [listing] = await db
      .insert(appListings)
      .values({
        appId: app.id,
        title: body.title,
        shortDescription: body.shortDescription,
        fullDescription: body.fullDescription,
        category: body.category,
        iconUrl: body.iconUrl,
        screenshots: body.screenshots,
        privacyPolicyUrl: body.privacyPolicyUrl,
        websiteUrl: body.websiteUrl,
        sourceCodeUrl: body.sourceCodeUrl,
        isExperimental: body.isExperimental,
        containsAds: body.containsAds,
        contentRating: body.contentRating,
      })
      .returning();

    return c.json({ ...app, listing }, 201);
  }
);

// Get app by ID (public)
appsRouter.get("/apps/:id", async (c) => {
  const id = c.req.param("id");

  const app = await db.query.apps.findFirst({
    where: and(eq(apps.id, id), eq(apps.isDelisted, false)),
    with: {
      listings: true,
      developer: {
        columns: {
          id: true,
          displayName: true,
          trustLevel: true,
        },
      },
    },
  });

  if (!app) {
    throw new HTTPException(404, { message: "App not found" });
  }

  return c.json(app);
});

// Update app listing
appsRouter.patch("/apps/:id", requireAuth, async (c) => {
  const appId = c.req.param("id") as string;
  const user = c.get("user");
  const body = await c.req.json();

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });
  if (!developer) throw new HTTPException(404, { message: "Developer not found" });

  const app = await db.query.apps.findFirst({
    where: and(eq(apps.id, appId), eq(apps.developerId, developer.id)),
  });
  if (!app) throw new HTTPException(404, { message: "App not found or not owned by you" });

  if (app.currentListingId) {
    await db.update(appListings).set({
      ...body,
      updatedAt: new Date(),
    }).where(eq(appListings.id, app.currentListingId));
  }

  return c.json({ success: true });
});

// Soft-delete app
appsRouter.delete("/apps/:id", requireAuth, async (c) => {
  const appId = c.req.param("id") as string;
  const user = c.get("user");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });
  if (!developer) throw new HTTPException(404, { message: "Developer not found" });

  const [updated] = await db.update(apps).set({
    isDelisted: true,
    delistReason: "Deleted by developer",
    updatedAt: new Date(),
  }).where(and(eq(apps.id, appId), eq(apps.developerId, developer.id))).returning();

  if (!updated) throw new HTTPException(404, { message: "App not found" });

  return c.json(updated);
});
