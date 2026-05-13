import {
  pgTable,
  uuid,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";

/**
 * Cached review-highlights per app (P3-D).
 *
 * One row per app. The contents are recomputed when:
 *   - a new review crosses publishedAt (review-promotion cron hook)
 *   - on demand via a manual admin endpoint (future)
 *
 * Why cache vs compute on read:
 *   - The pure helper walks every published review and bucket-scores
 *     terms. On apps with >100 reviews that's noticeable per-render.
 *   - Highlights move slowly — the chips don't need to be live to the
 *     second. Stale by a few minutes is fine.
 *
 * Why a separate table vs a JSONB column on `apps`:
 *   - keeps `apps` slim — every storefront SELECT pulls that row, no
 *     need to drag the highlights blob along
 *   - lets us add per-polarity row counts + a per-term tally without
 *     re-migrating the apps table
 */
export const appReviewHighlights = pgTable(
  "app_review_highlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /**
     * Per-polarity term arrays. Shape:
     *   { positives: [{ term, mentions }], negatives: [...] }
     * Capped to 5 terms per polarity at compute time.
     */
    highlights: jsonb("highlights").notNull(),
    /** How many reviews were considered in this computation. */
    reviewsConsidered: integer("reviews_considered").default(0).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("app_review_highlights_app_idx").on(t.appId)],
);
