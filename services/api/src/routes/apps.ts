import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db";
import { apps, appListings, developers } from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { createAppSchema } from "@openmarket/contracts/apps";
import type { Variables } from "../lib/types";

export const appsRouter = new Hono<{ Variables: Variables }>();

// List apps for authenticated developer
appsRouter.get("/apps", requireAuth, async (c) => {
  const user = c.get("user");

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
  });

  return c.json(developerApps);
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
