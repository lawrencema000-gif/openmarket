import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  doublePrecision,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";

/**
 * Chart positions, recomputed periodically by a cron worker.
 *
 * One row per (chartSlug, window, optional category, app) — denormalized
 * for fast read at the cost of write-amplification on recompute. With
 * ~5 chart slugs × 3 windows × ~30 categories × 100 ranked apps, the
 * table caps at ~45k rows; a full rebuild is < 1s on a warm DB.
 *
 * The cron writes new rows + truncates the previous generation in a
 * single txn so readers never see a half-rebuilt chart. `computedAt`
 * is the rebuild timestamp; the storefront caches against it.
 *
 * Chart slugs (each one is a separate ranking formula in
 * services/api/src/lib/charts.ts):
 *   - top-trending — install velocity over the window, weighted by
 *     recency. The most volatile chart; refreshes hourly.
 *   - top-new — apps whose first published-stable release landed
 *     inside the window, ranked by install count + rating.
 *   - top-free — install count over the window. (All apps are free
 *     in v1; the slug exists so the schema doesn't have to change
 *     when paid apps land in Tier 4.)
 *   - top-rated — average rating with a min-review-count floor (so
 *     a single 5-star review doesn't dominate).
 *
 * `category` is nullable: NULL means "across all categories" (the
 * top-level chart). Per-category rows shadow the global ones, which
 * means a single SELECT with `category IS NOT DISTINCT FROM $cat`
 * picks the right slice.
 *
 * `windowKey` is the rolling window the chart was computed over:
 *   - 24h, 7d, 30d
 */
export const appChartPositions = pgTable(
  "app_chart_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chartSlug: text("chart_slug").notNull(),
    windowKey: text("window_key").notNull(),
    category: text("category"),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").notNull(),
    /** Raw signal value (install count, velocity, rating × 100, ...). */
    score: doublePrecision("score").notNull(),
    /** Position delta vs the previous computation, for ▲▼ arrows. */
    deltaPosition: integer("delta_position"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Primary read path: "top 50 of <slug>/<window>/<category>".
    index("app_chart_positions_chart_idx").on(t.chartSlug, t.windowKey, t.category, t.position),
    // Used by the recompute cron's "what's the previous position?" lookup.
    uniqueIndex("app_chart_positions_unique_idx").on(
      t.chartSlug,
      t.windowKey,
      t.category,
      t.appId,
    ),
  ],
);
