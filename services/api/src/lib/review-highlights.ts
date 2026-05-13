import { and, eq, isNotNull } from "drizzle-orm";
import {
  appReviewHighlights,
  reviews,
} from "@openmarket/db/schema";
import {
  computeReviewHighlights,
  type ReviewHighlights,
} from "@openmarket/contracts/review-highlights";
import { db } from "./db";

/**
 * Recompute the review-highlights cache for a single app (P3-D).
 *
 * Idempotent — calling it twice in a row produces the same row.
 * Called from:
 *   - the review-promote cron when a review crosses publishedAt
 *   - manual admin recompute endpoint (future)
 *   - lazy on-demand when GET /apps/:id/review-highlights finds no row
 *
 * Returns the computed highlights so callers can avoid an extra round
 * trip to read what they just wrote.
 */
export async function recomputeReviewHighlightsForApp(
  appId: string,
): Promise<ReviewHighlights> {
  const rows = await db
    .select({
      rating: reviews.rating,
      body: reviews.body,
    })
    .from(reviews)
    .where(
      and(
        eq(reviews.appId, appId),
        isNotNull(reviews.publishedAt),
        eq(reviews.isFlagged, false),
      ),
    );

  const highlights = computeReviewHighlights(rows);

  const existing = await db.query.appReviewHighlights.findFirst({
    where: eq(appReviewHighlights.appId, appId),
  });

  if (existing) {
    await db
      .update(appReviewHighlights)
      .set({
        highlights: { positives: highlights.positives, negatives: highlights.negatives },
        reviewsConsidered: highlights.reviewsConsidered,
        computedAt: new Date(),
      })
      .where(eq(appReviewHighlights.id, existing.id));
  } else {
    await db.insert(appReviewHighlights).values({
      appId,
      highlights: { positives: highlights.positives, negatives: highlights.negatives },
      reviewsConsidered: highlights.reviewsConsidered,
    });
  }

  return highlights;
}

/**
 * Read the cached row. Returns null when no row exists yet (the
 * route falls back to an on-demand recompute the first time).
 */
export async function loadCachedReviewHighlights(
  appId: string,
): Promise<{
  highlights: { positives: unknown[]; negatives: unknown[] };
  reviewsConsidered: number;
  computedAt: Date;
} | null> {
  const row = await db.query.appReviewHighlights.findFirst({
    where: eq(appReviewHighlights.appId, appId),
  });
  if (!row) return null;
  return {
    highlights: row.highlights as { positives: unknown[]; negatives: unknown[] },
    reviewsConsidered: row.reviewsConsidered,
    computedAt: row.computedAt,
  };
}
