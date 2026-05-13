import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { apps } from "@openmarket/db/schema";
import { db } from "../lib/db";
import {
  loadCachedReviewHighlights,
  recomputeReviewHighlightsForApp,
} from "../lib/review-highlights";
import type { Variables } from "../lib/types";

export const reviewHighlightsRouter = new Hono<{ Variables: Variables }>();

/**
 * GET /apps/:id/review-highlights — public.
 *
 * Reads the cached row. On a cache miss (app has never been computed)
 * we recompute synchronously then return — that's a one-time cost
 * per app, the cron + review-publish hooks keep it warm thereafter.
 *
 * Stale-cache policy: the route DOES NOT recompute on every read.
 * If the cache is hours out of date, callers see the slightly old
 * highlights — that's intentional, recomputation is moderately
 * expensive and the chips don't need to be real-time.
 */
reviewHighlightsRouter.get("/apps/:id/review-highlights", async (c) => {
  const appId = c.req.param("id") as string;

  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }

  const cached = await loadCachedReviewHighlights(appId);
  if (cached) {
    return c.json({
      appId,
      ...cached.highlights,
      reviewsConsidered: cached.reviewsConsidered,
      computedAt: cached.computedAt,
    });
  }

  // First-ever read for this app — compute synchronously then return.
  const fresh = await recomputeReviewHighlightsForApp(appId);
  return c.json({
    appId,
    positives: fresh.positives,
    negatives: fresh.negatives,
    reviewsConsidered: fresh.reviewsConsidered,
    computedAt: new Date(),
  });
});
