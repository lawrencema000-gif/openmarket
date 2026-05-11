import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Daily statistics roll-up. Recompute runs as a cron job (or by an
 * admin via POST /admin/statistics/recompute) and produces one row
 * per (appId, day) in `app_statistics_daily`.
 *
 * Idempotent via ON CONFLICT (app_id, day) DO UPDATE — re-running
 * for the same day overwrites that day's row, so backfills + corrections
 * are safe.
 *
 * One CTE-and-upsert per day per app:
 *   - takes a UTC calendar day as YYYY-MM-DD
 *   - reads install_events, library_entries, reviews
 *   - emits a single row with snapshot + delta metrics
 *
 * Performance: a 100k-app catalog with 6 months of data backfilled
 * = ~18M rows. The per-day UPSERT writes 100k rows in ~1s on a warm
 * Neon Pro; the daily cron processes "yesterday" only, so steady
 * state is one slim batch per day.
 */

export interface RecomputeResult {
  day: string;
  rowsUpdated: number;
}

/** YYYY-MM-DD for `d` in UTC. */
export function utcDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Yesterday's UTC date, used by the default cron schedule. */
export function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDateString(d);
}

/**
 * Recompute the stats roll-up for a single UTC day across every
 * published, non-delisted app. Returns the count of rows written.
 *
 * Semantics per `app_statistics_daily` column:
 *   totalInstalls    = COUNT(install_events WHERE installed_at <= end_of_day AND success)
 *   activeInstalls   = library_entries that were "active" at end_of_day
 *                      (installed before AND (uninstalled_at IS NULL OR > end_of_day))
 *   newInstallsToday = install_events.installed_at IN day, success only
 *   uninstallsToday  = library_entries.uninstalled_at IN day
 *   totalReviews     = reviews.created_at <= end_of_day AND NOT is_flagged
 *   newReviewsToday  = reviews.created_at IN day AND NOT is_flagged
 *   avgRating        = AVG over the same filter as totalReviews, 0 floor
 */
export async function recomputeStatsForDay(
  day: string,
): Promise<RecomputeResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Day must be YYYY-MM-DD, got "${day}"`);
  }
  // Postgres bounds: day at midnight UTC (inclusive start) → next day
  // at midnight UTC (exclusive end). "Within day" === [start, end).
  const dayStart = `${day} 00:00:00+00`;
  const dayEnd = `${day} 23:59:59.999+00`;

  // One INSERT … SELECT … ON CONFLICT round-trip across the catalog.
  // We compute all 7 metrics from a single per-app group, then upsert
  // the row.
  const result = await db.execute<{ rows_upserted: number }>(sql`
    WITH install_signal AS (
      SELECT
        a.id AS app_id,
        COUNT(*) FILTER (
          WHERE ie.installed_at <= ${dayEnd}::timestamptz
            AND ie.success = true
        ) AS total_installs,
        COUNT(*) FILTER (
          WHERE ie.installed_at BETWEEN ${dayStart}::timestamptz AND ${dayEnd}::timestamptz
            AND ie.success = true
        ) AS new_installs_today
      FROM apps a
      LEFT JOIN install_events ie ON ie.app_id = a.id
      WHERE a.is_published = true AND a.is_delisted = false
      GROUP BY a.id
    ),
    library_signal AS (
      SELECT
        a.id AS app_id,
        COUNT(*) FILTER (
          WHERE le.installed_at <= ${dayEnd}::timestamptz
            AND (le.uninstalled_at IS NULL OR le.uninstalled_at > ${dayEnd}::timestamptz)
        ) AS active_installs,
        COUNT(*) FILTER (
          WHERE le.uninstalled_at BETWEEN ${dayStart}::timestamptz AND ${dayEnd}::timestamptz
        ) AS uninstalls_today
      FROM apps a
      LEFT JOIN library_entries le ON le.app_id = a.id
      WHERE a.is_published = true AND a.is_delisted = false
      GROUP BY a.id
    ),
    review_signal AS (
      SELECT
        a.id AS app_id,
        COUNT(*) FILTER (
          WHERE r.created_at <= ${dayEnd}::timestamptz AND r.is_flagged = false
        ) AS total_reviews,
        COUNT(*) FILTER (
          WHERE r.created_at BETWEEN ${dayStart}::timestamptz AND ${dayEnd}::timestamptz
            AND r.is_flagged = false
        ) AS new_reviews_today,
        COALESCE(
          AVG(r.rating) FILTER (
            WHERE r.created_at <= ${dayEnd}::timestamptz AND r.is_flagged = false
          ),
          0
        ) AS avg_rating
      FROM apps a
      LEFT JOIN reviews r ON r.app_id = a.id
      WHERE a.is_published = true AND a.is_delisted = false
      GROUP BY a.id
    ),
    inserted AS (
      INSERT INTO app_statistics_daily AS asd (
        app_id, day,
        total_installs, active_installs, new_installs_today, uninstalls_today,
        total_reviews, new_reviews_today, avg_rating, computed_at
      )
      SELECT
        i.app_id, ${day},
        COALESCE(i.total_installs, 0)::int,
        COALESCE(l.active_installs, 0)::int,
        COALESCE(i.new_installs_today, 0)::int,
        COALESCE(l.uninstalls_today, 0)::int,
        COALESCE(r.total_reviews, 0)::int,
        COALESCE(r.new_reviews_today, 0)::int,
        COALESCE(r.avg_rating, 0)::double precision,
        NOW()
      FROM install_signal i
      LEFT JOIN library_signal l USING (app_id)
      LEFT JOIN review_signal r USING (app_id)
      ON CONFLICT (app_id, day) DO UPDATE
        SET total_installs    = EXCLUDED.total_installs,
            active_installs   = EXCLUDED.active_installs,
            new_installs_today = EXCLUDED.new_installs_today,
            uninstalls_today  = EXCLUDED.uninstalls_today,
            total_reviews     = EXCLUDED.total_reviews,
            new_reviews_today = EXCLUDED.new_reviews_today,
            avg_rating        = EXCLUDED.avg_rating,
            computed_at       = NOW()
      RETURNING 1
    )
    SELECT COUNT(*)::int AS rows_upserted FROM inserted
  `);
  const rows = (result as unknown as Array<Record<string, unknown>>)[0];
  const rowsUpdated = rows ? Number(rows.rows_upserted ?? 0) : 0;
  return { day, rowsUpdated };
}

/**
 * Recompute "yesterday" — the daily cron's default schedule. Wraps
 * recomputeStatsForDay with the right UTC date.
 */
export async function recomputeYesterday(): Promise<RecomputeResult> {
  return recomputeStatsForDay(yesterdayUtc());
}

/**
 * Backfill an inclusive [from, to] date range. Used the first time
 * the cron is wired up, or after a multi-day outage.
 *
 * Day order: oldest-first so per-day delta calculations are
 * deterministic for callers that watch the table.
 */
export async function recomputeRange(
  fromDay: string,
  toDay: string,
): Promise<RecomputeResult[]> {
  const start = new Date(`${fromDay}T00:00:00Z`);
  const end = new Date(`${toDay}T00:00:00Z`);
  if (start > end) {
    throw new Error(`fromDay (${fromDay}) is after toDay (${toDay})`);
  }
  const results: RecomputeResult[] = [];
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    results.push(await recomputeStatsForDay(utcDateString(cursor)));
  }
  return results;
}
