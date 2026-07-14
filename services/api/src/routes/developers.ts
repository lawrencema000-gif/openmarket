import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db";
import { appListings, apps, developers } from "@openmarket/db/schema";
import { isUuid } from "../lib/uuid";
import { requireAuth, requireAuthVerified } from "../middleware/auth";
import {
  createDeveloperProfileSchema,
  updateDeveloperProfileSchema,
} from "@openmarket/contracts/developers";
import type { Variables } from "../lib/types";

export const developersRouter = new Hono<{ Variables: Variables }>();

// Get current developer profile
developersRouter.get("/developers/me", requireAuth, async (c) => {
  const user = c.get("user");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  return c.json(developer);
});

// Create developer profile — gated on a verified email so an unverified
// account can't claim publisher status before proving it controls the
// inbox.
developersRouter.post(
  "/developers",
  requireAuthVerified,
  zValidator("json", createDeveloperProfileSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const existing = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (existing) {
      throw new HTTPException(409, { message: "Developer profile already exists" });
    }

    const [developer] = await db
      .insert(developers)
      .values({
        email: user.email,
        displayName: body.displayName,
        legalEntityName: body.legalEntityName,
        country: body.country,
        supportEmail: body.supportEmail,
        supportUrl: body.supportUrl,
        privacyPolicyUrl: body.privacyPolicyUrl,
        authProvider: "email",
        authProviderId: user.id,
      })
      .returning();

    return c.json(developer, 201);
  }
);

// Update developer profile
developersRouter.patch(
  "/developers/me",
  requireAuth,
  zValidator("json", updateDeveloperProfileSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const [updated] = await db
      .update(developers)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(developers.email, user.email))
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    return c.json(updated);
  }
);

// Get developer by ID (public). Answers the storefront's "who made this and
// what else did they make?" — profile basics plus the developer's PUBLISHED,
// non-delisted apps (public listing fields only).
developersRouter.get("/developers/:id", async (c) => {
  const id = c.req.param("id");
  // Malformed uuid would make Postgres throw (→ 500); treat like unknown.
  if (!isUuid(id)) {
    throw new HTTPException(404, { message: "Developer not found" });
  }

  const developer = await db.query.developers.findFirst({
    where: eq(developers.id, id),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer not found" });
  }

  const publishedApps = await db
    .select({
      id: apps.id,
      packageName: apps.packageName,
      trustTier: apps.trustTier,
      title: appListings.title,
      shortDescription: appListings.shortDescription,
      iconUrl: appListings.iconUrl,
      category: appListings.category,
      isExperimental: appListings.isExperimental,
    })
    .from(apps)
    .innerJoin(appListings, eq(appListings.id, apps.currentListingId))
    .where(
      and(
        eq(apps.developerId, developer.id),
        eq(apps.isPublished, true),
        eq(apps.isDelisted, false),
      ),
    )
    .orderBy(desc(apps.createdAt))
    .limit(50);

  return c.json({
    id: developer.id,
    displayName: developer.displayName,
    trustLevel: developer.trustLevel,
    createdAt: developer.createdAt,
    memberSince: developer.createdAt,
    apps: publishedApps,
  });
});
