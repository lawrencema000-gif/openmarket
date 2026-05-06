import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, asc, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import {
  apps,
  developers,
  libraryEntries,
  reports,
  reviews,
  reviewHelpfulVotes,
  reviewResponses,
  users,
} from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { paginationSchema } from "@openmarket/contracts/common";
import { enqueueEmail } from "../lib/email";
import { auth } from "../lib/auth";
import type { Variables } from "../lib/types";

export const reviewsRouter = new Hono<{ Variables: Variables }>();

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().max(4000).optional(),
});

const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(120).optional(),
  body: z.string().max(4000).optional(),
});

const listQuerySchema = paginationSchema.extend({
  sort: z.enum(["helpful", "recent", "rating-high", "rating-low"]).default("helpful"),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  /** "true" filters to reviews that have a developer response. */
  with_response: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const responseBodySchema = z.object({
  body: z.string().min(1).max(2000),
});

const reportBodySchema = z.object({
  reportType: z.enum([
    "malware",
    "scam",
    "impersonation",
    "illegal",
    "spam",
    "broken",
    "other",
  ]),
  description: z.string().min(1).max(2000),
});

async function findOrCreateProfile(authUserId: string, email: string) {
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

/**
 * GET /apps/:appId/reviews — public list with sort + filter + histogram.
 *
 * Response shape:
 *   {
 *     items: [{ ...review, author, response, viewerHasMarkedHelpful }],
 *     page, limit, total,
 *     summary: { average, total, distribution: { 1, 2, 3, 4, 5 } }
 *   }
 */
reviewsRouter.get(
  "/apps/:appId/reviews",
  zValidator("query", listQuerySchema),
  async (c) => {
    const appId = c.req.param("appId") as string;
    const { page, limit, sort, rating, with_response } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app) throw new HTTPException(404, { message: "App not found" });

    // Hold-back: a review is publicly visible only when publishedAt
    // is set AND <= now(). New reviews start at NULL; the promotion
    // job (POST /admin/reviews/promote-due) flips them after a 24h
    // cool-off, except for apps under suspicious-activity freeze.
    const baseWhere = and(
      eq(reviews.appId, appId),
      eq(reviews.isFlagged, false),
      isNotNull(reviews.publishedAt),
      lte(reviews.publishedAt, sql`now()`),
      ...(rating !== undefined ? [eq(reviews.rating, rating)] : []),
    );

    const orderBy =
      sort === "recent"
        ? [desc(reviews.createdAt)]
        : sort === "rating-high"
          ? [desc(reviews.rating), desc(reviews.helpfulCount), desc(reviews.createdAt)]
          : sort === "rating-low"
            ? [asc(reviews.rating), desc(reviews.helpfulCount), desc(reviews.createdAt)]
            : [desc(reviews.helpfulCount), desc(reviews.createdAt)];

    let rows = await db
      .select({
        review: reviews,
        author: {
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
        response: reviewResponses,
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .leftJoin(reviewResponses, eq(reviewResponses.reviewId, reviews.id))
      .where(baseWhere)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    if (with_response) {
      rows = rows.filter((r) => r.response !== null);
    }

    // Distribution + average over the full (unfiltered-by-rating) set.
    const distRows = await db
      .select({
        rating: reviews.rating,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.appId, appId),
          eq(reviews.isFlagged, false),
          isNotNull(reviews.publishedAt),
          lte(reviews.publishedAt, sql`now()`),
        ),
      )
      .groupBy(reviews.rating);

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
    };
    let totalCount = 0;
    let sumRatings = 0;
    for (const r of distRows) {
      const k = r.rating as 1 | 2 | 3 | 4 | 5;
      distribution[k] = Number(r.count);
      totalCount += Number(r.count);
      sumRatings += Number(r.count) * r.rating;
    }
    const average = totalCount > 0 ? sumRatings / totalCount : 0;

    // Best-effort viewer detection (don't force auth on a public endpoint).
    let viewerProfile: { id: string } | null = null;
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (session?.user) {
        viewerProfile = await findOrCreateProfile(
          session.user.id,
          session.user.email,
        );
      }
    } catch {
      // ignore
    }

    let helpfulSet = new Set<string>();
    if (viewerProfile && rows.length > 0) {
      const reviewIds = rows.map((r) => r.review.id);
      const myVotes = await db
        .select({ reviewId: reviewHelpfulVotes.reviewId })
        .from(reviewHelpfulVotes)
        .where(
          and(
            eq(reviewHelpfulVotes.userId, viewerProfile.id),
            sql`${reviewHelpfulVotes.reviewId} = ANY(${reviewIds})`,
          ),
        );
      helpfulSet = new Set(myVotes.map((m) => m.reviewId));
    }

    return c.json({
      items: rows.map((r) => ({
        id: r.review.id,
        appId: r.review.appId,
        rating: r.review.rating,
        title: r.review.title,
        body: r.review.body,
        versionCodeReviewed: r.review.versionCodeReviewed,
        helpfulCount: r.review.helpfulCount,
        createdAt: r.review.createdAt,
        updatedAt: r.review.updatedAt,
        author: r.author,
        response: r.response
          ? {
              id: r.response.id,
              body: r.response.body,
              createdAt: r.response.createdAt,
              updatedAt: r.response.updatedAt,
              developerId: r.response.developerId,
            }
          : null,
        viewerHasMarkedHelpful: helpfulSet.has(r.review.id),
      })),
      page,
      limit,
      total: totalCount,
      summary: {
        average,
        total: totalCount,
        distribution,
      },
    });
  },
);

/**
 * POST /apps/:appId/reviews — submit a review.
 * Gating: signed in + active library_entries row for this app. No
 * install → no review (slashes review-bombing without touching content
 * moderation).
 */
reviewsRouter.post(
  "/apps/:appId/reviews",
  requireAuth,
  zValidator("json", createReviewSchema),
  async (c) => {
    const authUser = c.get("user");
    const appId = c.req.param("appId") as string;
    const body = c.req.valid("json");

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app || app.isDelisted) {
      throw new HTTPException(404, { message: "App not found" });
    }

    const profile = await findOrCreateProfile(authUser.id, authUser.email);
    if (profile.deletedAt) {
      throw new HTTPException(410, { message: "Account pending deletion" });
    }

    const libraryEntry = await db.query.libraryEntries.findFirst({
      where: and(
        eq(libraryEntries.userId, profile.id),
        eq(libraryEntries.appId, appId),
        isNull(libraryEntries.uninstalledAt),
      ),
    });
    if (!libraryEntry) {
      throw new HTTPException(403, {
        message:
          "You can only review apps you've installed. Add to library first.",
      });
    }

    const existing = await db.query.reviews.findFirst({
      where: and(eq(reviews.appId, appId), eq(reviews.userId, profile.id)),
    });
    if (existing) {
      throw new HTTPException(409, {
        message: "You have already reviewed this app — edit your existing review.",
      });
    }

    const [review] = await db
      .insert(reviews)
      .values({
        appId,
        userId: profile.id,
        rating: body.rating,
        title: body.title,
        body: body.body,
        versionCodeReviewed: libraryEntry.installedVersionCode ?? 0,
      })
      .returning();

    return c.json(review, 201);
  },
);

/** GET /users/me/reviews — list own reviews. */
reviewsRouter.get("/users/me/reviews", requireAuth, async (c) => {
  const authUser = c.get("user");
  const profile = await findOrCreateProfile(authUser.id, authUser.email);

  const rows = await db
    .select({ review: reviews, app: apps })
    .from(reviews)
    .innerJoin(apps, eq(apps.id, reviews.appId))
    .where(eq(reviews.userId, profile.id))
    .orderBy(desc(reviews.createdAt));

  return c.json({
    items: rows.map((r) => ({
      id: r.review.id,
      appId: r.review.appId,
      packageName: r.app.packageName,
      rating: r.review.rating,
      title: r.review.title,
      body: r.review.body,
      helpfulCount: r.review.helpfulCount,
      createdAt: r.review.createdAt,
      updatedAt: r.review.updatedAt,
    })),
  });
});

/** PATCH /reviews/:id — own only. */
reviewsRouter.patch(
  "/reviews/:id",
  requireAuth,
  zValidator("json", updateReviewSchema),
  async (c) => {
    const authUser = c.get("user");
    const reviewId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const profile = await findOrCreateProfile(authUser.id, authUser.email);

    const review = await db.query.reviews.findFirst({
      where: eq(reviews.id, reviewId),
    });
    if (!review) throw new HTTPException(404, { message: "Review not found" });
    if (review.userId !== profile.id) {
      throw new HTTPException(403, { message: "You do not own this review" });
    }

    const [updated] = await db
      .update(reviews)
      .set({
        ...(body.rating !== undefined && { rating: body.rating }),
        ...(body.title !== undefined && { title: body.title }),
        ...(body.body !== undefined && { body: body.body }),
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, reviewId))
      .returning();
    return c.json(updated);
  },
);

/** DELETE /reviews/:id — own only. Cascades helpful_votes + response. */
reviewsRouter.delete("/reviews/:id", requireAuth, async (c) => {
  const authUser = c.get("user");
  const reviewId = c.req.param("id") as string;
  const profile = await findOrCreateProfile(authUser.id, authUser.email);

  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
  if (!review) throw new HTTPException(404, { message: "Review not found" });
  if (review.userId !== profile.id) {
    throw new HTTPException(403, { message: "You do not own this review" });
  }
  await db.delete(reviews).where(eq(reviews.id, reviewId));
  return c.json({ success: true });
});

/** POST /reviews/:id/helpful — idempotent helpful vote. */
reviewsRouter.post("/reviews/:id/helpful", requireAuth, async (c) => {
  const authUser = c.get("user");
  const reviewId = c.req.param("id") as string;
  const profile = await findOrCreateProfile(authUser.id, authUser.email);

  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
  if (!review) throw new HTTPException(404, { message: "Review not found" });
  if (review.userId === profile.id) {
    throw new HTTPException(400, { message: "You can't mark your own review helpful" });
  }

  await db
    .insert(reviewHelpfulVotes)
    .values({ reviewId, userId: profile.id })
    .onConflictDoNothing({
      target: [reviewHelpfulVotes.reviewId, reviewHelpfulVotes.userId],
    });

  const countRows = await db
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(reviewHelpfulVotes)
    .where(eq(reviewHelpfulVotes.reviewId, reviewId));
  const count = Number(countRows[0]?.count ?? 0);
  await db
    .update(reviews)
    .set({ helpfulCount: count, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId));

  return c.json({ helpfulCount: count, viewerHasMarkedHelpful: true });
});

/** DELETE /reviews/:id/helpful — undo helpful. */
reviewsRouter.delete("/reviews/:id/helpful", requireAuth, async (c) => {
  const authUser = c.get("user");
  const reviewId = c.req.param("id") as string;
  const profile = await findOrCreateProfile(authUser.id, authUser.email);

  await db
    .delete(reviewHelpfulVotes)
    .where(
      and(
        eq(reviewHelpfulVotes.reviewId, reviewId),
        eq(reviewHelpfulVotes.userId, profile.id),
      ),
    );

  const countRows = await db
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(reviewHelpfulVotes)
    .where(eq(reviewHelpfulVotes.reviewId, reviewId));
  const count = Number(countRows[0]?.count ?? 0);
  await db
    .update(reviews)
    .set({ helpfulCount: count, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId));

  return c.json({ helpfulCount: count, viewerHasMarkedHelpful: false });
});

/** POST /reviews/:id/report — file an abuse report on a review. */
reviewsRouter.post(
  "/reviews/:id/report",
  requireAuth,
  zValidator("json", reportBodySchema),
  async (c) => {
    const authUser = c.get("user");
    const reviewId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const profile = await findOrCreateProfile(authUser.id, authUser.email);

    const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
    if (!review) throw new HTTPException(404, { message: "Review not found" });

    const [report] = await db
      .insert(reports)
      .values({
        targetType: "review",
        targetId: reviewId,
        reporterId: profile.id,
        reportType: body.reportType,
        description: body.description,
      })
      .returning();
    return c.json({ success: true, reportId: report!.id });
  },
);

// ─────────── Developer responses (P1-H) ───────────

async function requireDeveloperOwningReview(
  authUserEmail: string,
  reviewId: string,
): Promise<{
  developer: { id: string; email: string; displayName: string | null };
  review: typeof reviews.$inferSelect;
  appName: string;
}> {
  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, authUserEmail),
  });
  if (!developer) {
    throw new HTTPException(403, { message: "Only developers can respond to reviews" });
  }
  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
  if (!review) throw new HTTPException(404, { message: "Review not found" });

  const app = await db.query.apps.findFirst({ where: eq(apps.id, review.appId) });
  if (!app) throw new HTTPException(404, { message: "App not found" });
  if (app.developerId !== developer.id) {
    throw new HTTPException(403, {
      message: "You can only respond to reviews of your own apps",
    });
  }
  return {
    developer: {
      id: developer.id,
      email: developer.email,
      displayName: developer.displayName,
    },
    review,
    appName: app.packageName,
  };
}

reviewsRouter.post(
  "/reviews/:id/response",
  requireAuth,
  zValidator("json", responseBodySchema),
  async (c) => {
    const authUser = c.get("user");
    const reviewId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const { developer, review, appName } = await requireDeveloperOwningReview(
      authUser.email,
      reviewId,
    );

    const existing = await db.query.reviewResponses.findFirst({
      where: eq(reviewResponses.reviewId, reviewId),
    });
    if (existing) {
      throw new HTTPException(409, {
        message: "You've already responded to this review — edit instead.",
      });
    }

    const [response] = await db
      .insert(reviewResponses)
      .values({
        reviewId,
        developerId: developer.id,
        body: body.body,
      })
      .returning();

    // Best-effort: notify the reviewer.
    try {
      const reviewer = await db.query.users.findFirst({
        where: eq(users.id, review.userId),
      });
      if (reviewer) {
        await enqueueEmail({
          template: "review-response",
          to: reviewer.email,
          props: {
            appName,
            developerName: developer.displayName ?? "The developer",
            responseBody: body.body,
            reviewUrl: `https://openmarket.app/apps/${review.appId}#reviews`,
          },
          tags: [{ name: "category", value: "review-response" }],
        });
      }
    } catch (err) {
      console.error("Failed to enqueue review-response email:", err);
    }

    return c.json(response, 201);
  },
);

reviewsRouter.patch(
  "/reviews/:id/response",
  requireAuth,
  zValidator("json", responseBodySchema),
  async (c) => {
    const authUser = c.get("user");
    const reviewId = c.req.param("id") as string;
    const body = c.req.valid("json");
    await requireDeveloperOwningReview(authUser.email, reviewId);

    const existing = await db.query.reviewResponses.findFirst({
      where: eq(reviewResponses.reviewId, reviewId),
    });
    if (!existing) throw new HTTPException(404, { message: "No response to edit" });

    const [updated] = await db
      .update(reviewResponses)
      .set({ body: body.body, updatedAt: new Date() })
      .where(eq(reviewResponses.id, existing.id))
      .returning();
    return c.json(updated);
  },
);

reviewsRouter.delete("/reviews/:id/response", requireAuth, async (c) => {
  const authUser = c.get("user");
  const reviewId = c.req.param("id") as string;
  await requireDeveloperOwningReview(authUser.email, reviewId);

  await db.delete(reviewResponses).where(eq(reviewResponses.reviewId, reviewId));
  return c.json({ success: true });
});
