import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db";
import { developers } from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
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

// Create developer profile
developersRouter.post(
  "/developers",
  requireAuth,
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

// Get developer by ID (public)
developersRouter.get("/developers/:id", async (c) => {
  const id = c.req.param("id");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.id, id),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer not found" });
  }

  return c.json({
    id: developer.id,
    displayName: developer.displayName,
    trustLevel: developer.trustLevel,
    createdAt: developer.createdAt,
  });
});
