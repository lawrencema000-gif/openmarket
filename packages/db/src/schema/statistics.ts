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
 * Daily roll-up of per-app metrics. One row per (appId, day).
 *
 * Populated by a recompute cron that aggregates install_events,
 * library_entries, and reviews into a small wide row per app per
 * day. The wide-table choice (vs a key/value EAV) is deliberate —
 * the metric set is fixed, the dashboard reads multiple metrics in
 * the same query, and the SUM/AVG over a date range is a single
 * indexed scan instead of a join-and-group.
 *
 * `day` is stored as a calendar date string (YYYY-MM-DD) in UTC, NOT
 * a timestamp. Aggregations are always day-bucketed and we never
 * care about the hour-of-day for these metrics. The string form
 * also makes the unique constraint trivial — `(app_id, day)` with no
 * timezone foot-guns.
 *
 * Compute semantics:
 *   - totalInstalls    = COUNT(install_events WHERE installed_at <= end_of_day AND success)
 *   - activeInstalls   = COUNT(library_entries WHERE uninstalled_at IS NULL
 *                                              OR uninstalled_at > end_of_day)
 *                        (snapshot — what was active AT end-of-day)
 *   - newInstallsToday = COUNT(install_events WHERE installed_at WITHIN day)
 *   - uninstallsToday  = COUNT(library_entries WHERE uninstalled_at WITHIN day)
 *   - totalReviews     = COUNT(reviews WHERE created_at <= end_of_day AND NOT flagged)
 *   - newReviewsToday  = COUNT(reviews WHERE created_at WITHIN day AND NOT flagged)
 *   - avgRating        = AVG(rating) over the same filter as totalReviews
 *                        (0 when totalReviews == 0)
 *
 * Daily-velocity metrics (newInstallsToday / newReviewsToday / etc.)
 * make the chart deltas trivial. Snapshot metrics (totalInstalls /
 * activeInstalls / avgRating) make "where am I today" queries a
 * single row lookup.
 *
 * Backfill strategy: cron caller computes for a specific day; ON
 * CONFLICT (app_id, day) DO UPDATE so re-running is idempotent.
 */
export const appStatisticsDaily = pgTable(
  "app_statistics_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    /** UTC calendar date as YYYY-MM-DD. */
    day: text("day").notNull(),
    /** Cumulative count of successful installs as of end-of-day. */
    totalInstalls: integer("total_installs").default(0).notNull(),
    /** Currently-active library entries as of end-of-day. */
    activeInstalls: integer("active_installs").default(0).notNull(),
    /** Successful installs landing inside this calendar day. */
    newInstallsToday: integer("new_installs_today").default(0).notNull(),
    /** library_entries.uninstalledAt landing inside this day. */
    uninstallsToday: integer("uninstalls_today").default(0).notNull(),
    /** Cumulative non-flagged reviews as of end-of-day. */
    totalReviews: integer("total_reviews").default(0).notNull(),
    /** Reviews created (non-flagged) inside this day. */
    newReviewsToday: integer("new_reviews_today").default(0).notNull(),
    /** Average rating over `totalReviews`. 0 when count is 0. */
    avgRating: doublePrecision("avg_rating").default(0).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("app_statistics_daily_unique_idx").on(t.appId, t.day),
    // Range queries: "last 30 days for app X" walks the day index in order.
    index("app_statistics_daily_app_day_idx").on(t.appId, t.day),
  ],
);
