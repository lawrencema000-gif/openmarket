import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import { reviews, users, apps } from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import type { Variables } from "../lib/types";

export const reviewsRouter = new Hono<{ Variables: Variables }>();

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  body: z.string().optional(),
  versionCodeReviewed: z.number().int().positive(),
});

const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().optional(),
  body: z.string().optional(),
});

// Helper: find or create user record by auth user email
async function findOrCreateUser(email: string, authUserId: string) {
  let user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    const [created] = await db
      .insert(users)
      .values({ email, authProvider: "better-auth", authProviderId: authUserId })
      .returning();
    user = created;
  }

  return user;
}

// GET /apps/:appId/reviews — list reviews for an app (public)
reviewsRouter.get("/apps/:appId/reviews", async (c) => {
  const appId = c.req.param("appId");

  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
  });

  if (!app) {
    throw new HTTPException(404, { message: "App not found" });
  }

  const appReviews = await db.query.reviews.findMany({
    where: eq(reviews.appId, appId),
    orderBy: [desc(reviews.createdAt)],
  });

  return c.json(appReviews);
});

// POST /apps/:appId/reviews — create a review (auth required)
reviewsRouter.post(
  "/apps/:appId/reviews",
  requireAuth,
  zValidator("json", createReviewSchema),
  async (c) => {
    const authUser = c.get("user");
    const appId = c.req.param("appId");
    const body = c.req.valid("json");

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      throw new HTTPException(404, { message: "App not found" });
    }

    const user = await findOrCreateUser(authUser.email, authUser.id);

    // Check for existing review (unique constraint: appId + userId)
    const existing = await db.query.reviews.findFirst({
      where: and(eq(reviews.appId, appId), eq(reviews.userId, user.id)),
    });

    if (existing) {
      throw new HTTPException(409, {
        message: "You have already reviewed this app",
      });
    }

    const [review] = await db
      .insert(reviews)
      .values({
        appId,
        userId: user.id,
        rating: body.rating,
        title: body.title,
        body: body.body,
        versionCodeReviewed: body.versionCodeReviewed,
      })
      .returning();

    return c.json(review, 201);
  }
);

// PATCH /reviews/:id — update own review (auth required)
reviewsRouter.patch(
  "/reviews/:id",
  requireAuth,
  zValidator("json", updateReviewSchema),
  async (c) => {
    const authUser = c.get("user");
    const reviewId = c.req.param("id");
    const body = c.req.valid("json");

    const user = await findOrCreateUser(authUser.email, authUser.id);

    const review = await db.query.reviews.findFirst({
      where: eq(reviews.id, reviewId as string),
    });

    if (!review) {
      throw new HTTPException(404, { message: "Review not found" });
    }

    if (review.userId !== user.id) {
      throw new HTTPException(403, {
        message: "You do not own this review",
      });
    }

    const [updated] = await db
      .update(reviews)
      .set({
        ...(body.rating !== undefined && { rating: body.rating }),
        ...(body.title !== undefined && { title: body.title }),
        ...(body.body !== undefined && { body: body.body }),
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, reviewId as string))
      .returning();

    return c.json(updated);
  }
);

// DELETE /reviews/:id — delete own review (auth required)
reviewsRouter.delete("/reviews/:id", requireAuth, async (c) => {
  const authUser = c.get("user");
  const reviewId = c.req.param("id");

  const user = await findOrCreateUser(authUser.email, authUser.id);

  const review = await db.query.reviews.findFirst({
    where: eq(reviews.id, reviewId as string),
  });

  if (!review) {
    throw new HTTPException(404, { message: "Review not found" });
  }

  if (review.userId !== user.id) {
    throw new HTTPException(403, { message: "You do not own this review" });
  }

  await db.delete(reviews).where(eq(reviews.id, reviewId as string));

  return c.json({ success: true });
});
