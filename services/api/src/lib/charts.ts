import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Chart computation. Pure-SQL implementations of every chart slug,
 * each emitting an array of (appId, score, optional category) rows.
 *
 * The cron caller (POST /admin/charts/recompute or a Vercel cron) wraps
 * the computed rows into app_chart_positions inserts; this library
 * stays signal-only and easy to unit-test.
 *
 * Windows expressed in hours so callers can pass arbitrary periods if
 * we ever want a "12h trending" or similar.
 */

export const CHART_WINDOWS: Record<string, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

export const CHART_SLUGS = [
  "top-trending",
  "top-new",
  "top-free",
  "top-rated",
] as const;
export type ChartSlug = (typeof CHART_SLUGS)[number];

export interface ChartRow {
  appId: string;
  score: number;
  category: string | null;
}

/**
 * "Top trending" — install count over the window with a recency
 * weight that biases toward installs in the second half of the
 * window. The exact formula doesn't matter much; the key property
 * is that an app installed 100× yesterday outranks an app
 * installed 100× a week ago in the 24h chart.
 */
export async function computeTopTrending(
  windowHours: number,
  limitPerCategory = 100,
): Promise<ChartRow[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const halfwayPoint = new Date(Date.now() - (windowHours / 2) * 60 * 60 * 1000);

  const rows = await db.execute<{
    app_id: string;
    category: string | null;
    score: number;
  }>(sql`
    WITH event_signal AS (
      SELECT
        i.app_id,
        l.category,
        SUM(
          CASE
            WHEN i.installed_at >= ${halfwayPoint} THEN 2.0
            ELSE 1.0
          END
        ) AS score
      FROM install_events i
      LEFT JOIN apps a ON a.id = i.app_id
      LEFT JOIN app_listings l ON l.id = a.current_listing_id
      WHERE i.installed_at >= ${since}
        AND i.success = true
        AND a.is_published = true
        AND a.is_delisted = false
      GROUP BY i.app_id, l.category
    ),
    ranked AS (
      SELECT
        app_id,
        category,
        score,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY score DESC) AS rn
      FROM event_signal
    )
    SELECT app_id, category, score
    FROM ranked
    WHERE rn <= ${limitPerCategory}
    ORDER BY category NULLS FIRST, score DESC
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    appId: String(r.app_id),
    category: r.category == null ? null : String(r.category),
    score: Number(r.score),
  }));
}

/**
 * "Top new" — apps whose first published-stable release landed
 * inside the window. Score is install count to break ties.
 */
export async function computeTopNew(
  windowHours: number,
  limitPerCategory = 100,
): Promise<ChartRow[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const rows = await db.execute<{
    app_id: string;
    category: string | null;
    score: number;
  }>(sql`
    WITH first_release AS (
      SELECT
        r.app_id,
        MIN(r.published_at) AS first_at
      FROM releases r
      WHERE r.status = 'published'
        AND r.channel = 'stable'
        AND r.published_at IS NOT NULL
      GROUP BY r.app_id
      HAVING MIN(r.published_at) >= ${since}
    ),
    install_counts AS (
      SELECT app_id, COUNT(*) AS n
      FROM install_events
      WHERE success = true
      GROUP BY app_id
    ),
    ranked AS (
      SELECT
        a.id AS app_id,
        l.category,
        COALESCE(ic.n, 0)::float AS score,
        ROW_NUMBER() OVER (PARTITION BY l.category ORDER BY COALESCE(ic.n, 0) DESC) AS rn
      FROM first_release fr
      JOIN apps a ON a.id = fr.app_id
      LEFT JOIN app_listings l ON l.id = a.current_listing_id
      LEFT JOIN install_counts ic ON ic.app_id = a.id
      WHERE a.is_published = true AND a.is_delisted = false
    )
    SELECT app_id, category, score
    FROM ranked
    WHERE rn <= ${limitPerCategory}
    ORDER BY category NULLS FIRST, score DESC
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    appId: String(r.app_id),
    category: r.category == null ? null : String(r.category),
    score: Number(r.score),
  }));
}

/**
 * "Top free" — install count over the window. v1 has only free apps;
 * the slug exists so we don't have to migrate when paid apps land.
 */
export async function computeTopFree(
  windowHours: number,
  limitPerCategory = 100,
): Promise<ChartRow[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const rows = await db.execute<{
    app_id: string;
    category: string | null;
    score: number;
  }>(sql`
    WITH install_counts AS (
      SELECT
        i.app_id,
        l.category,
        COUNT(*)::float AS n
      FROM install_events i
      LEFT JOIN apps a ON a.id = i.app_id
      LEFT JOIN app_listings l ON l.id = a.current_listing_id
      WHERE i.installed_at >= ${since}
        AND i.success = true
        AND a.is_published = true
        AND a.is_delisted = false
      GROUP BY i.app_id, l.category
    ),
    ranked AS (
      SELECT
        app_id,
        category,
        n AS score,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY n DESC) AS rn
      FROM install_counts
    )
    SELECT app_id, category, score
    FROM ranked
    WHERE rn <= ${limitPerCategory}
    ORDER BY category NULLS FIRST, score DESC
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    appId: String(r.app_id),
    category: r.category == null ? null : String(r.category),
    score: Number(r.score),
  }));
}

/**
 * "Top rated" — average rating over the window with a Bayesian floor
 * so a single 5-star review doesn't dominate. Specifically: the
 * smoothed score is `(R + C·m) / (n + C)` where R is the sum of
 * ratings, n is the count, m is a global prior (3.5 — slightly above
 * average), C is a confidence weight (10 reviews).
 */
export async function computeTopRated(
  windowHours: number,
  limitPerCategory = 100,
): Promise<ChartRow[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const PRIOR = 3.5;
  const CONFIDENCE = 10;

  const rows = await db.execute<{
    app_id: string;
    category: string | null;
    score: number;
  }>(sql`
    WITH rating_signal AS (
      SELECT
        r.app_id,
        l.category,
        SUM(r.rating)::float AS rating_sum,
        COUNT(*)::float AS rating_count
      FROM reviews r
      LEFT JOIN apps a ON a.id = r.app_id
      LEFT JOIN app_listings l ON l.id = a.current_listing_id
      WHERE r.created_at >= ${since}
        AND r.is_flagged = false
        AND r.published_at IS NOT NULL
        AND a.is_published = true
        AND a.is_delisted = false
      GROUP BY r.app_id, l.category
    ),
    ranked AS (
      SELECT
        app_id,
        category,
        (rating_sum + ${CONFIDENCE} * ${PRIOR}) / (rating_count + ${CONFIDENCE}) AS score,
        ROW_NUMBER() OVER (
          PARTITION BY category
          ORDER BY (rating_sum + ${CONFIDENCE} * ${PRIOR}) / (rating_count + ${CONFIDENCE}) DESC
        ) AS rn
      FROM rating_signal
    )
    SELECT app_id, category, score
    FROM ranked
    WHERE rn <= ${limitPerCategory}
    ORDER BY category NULLS FIRST, score DESC
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    appId: String(r.app_id),
    category: r.category == null ? null : String(r.category),
    score: Number(r.score),
  }));
}

/**
 * Given a fresh set of (chartSlug, windowKey) ranked rows, atomically
 * replace the previous generation in app_chart_positions.
 *
 * Algorithm:
 *   1. Look up the previous (appId → position) map for delta arrows.
 *   2. Open a SERIALIZABLE txn:
 *      a. DELETE prior rows for (chartSlug, windowKey).
 *      b. INSERT new rows with computed deltaPosition + position.
 *
 * Readers always see either the old or new generation, never a partial.
 */
export async function persistChart(
  chartSlug: ChartSlug,
  windowKey: string,
  rows: ChartRow[],
): Promise<{ inserted: number }> {
  const { appChartPositions } = await import("@openmarket/db/schema");

  // Load previous positions keyed by (category, appId). Used for delta
  // arrows; defaults to 0 when there's no previous row.
  const prior = await db
    .select({
      appId: appChartPositions.appId,
      category: appChartPositions.category,
      position: appChartPositions.position,
    })
    .from(appChartPositions)
    .where(
      sql`${appChartPositions.chartSlug} = ${chartSlug}
          AND ${appChartPositions.windowKey} = ${windowKey}`,
    );
  const priorByKey = new Map<string, number>();
  for (const r of prior) {
    priorByKey.set(`${r.category ?? ""}|${r.appId}`, r.position);
  }

  // Compute new positions: rank within (category) by score-desc.
  type Pending = {
    chartSlug: string;
    windowKey: string;
    category: string | null;
    appId: string;
    position: number;
    score: number;
    deltaPosition: number | null;
  };

  const grouped = new Map<string, ChartRow[]>();
  for (const r of rows) {
    const k = r.category ?? "";
    const arr = grouped.get(k) ?? [];
    arr.push(r);
    grouped.set(k, arr);
  }

  const pending: Pending[] = [];
  for (const [, group] of grouped) {
    group.sort((a, b) => b.score - a.score);
    group.forEach((row, i) => {
      const newPos = i + 1;
      const priorPos = priorByKey.get(`${row.category ?? ""}|${row.appId}`);
      const deltaPosition =
        priorPos === undefined ? null : priorPos - newPos; // ↑ if positive
      pending.push({
        chartSlug,
        windowKey,
        category: row.category,
        appId: row.appId,
        position: newPos,
        score: row.score,
        deltaPosition,
      });
    });
  }

  await db.transaction(
    async (tx) => {
      await tx.execute(sql`
        DELETE FROM app_chart_positions
         WHERE chart_slug = ${chartSlug}
           AND window_key = ${windowKey}
      `);
      if (pending.length > 0) {
        // Drizzle insert with VALUES of N rows is fine up to a few
        // thousand; chart writes top out at ~3k per (slug, window).
        await tx.insert(appChartPositions).values(pending);
      }
    },
    { isolationLevel: "serializable" },
  );

  return { inserted: pending.length };
}

/** Recompute every (slug, window) pair. Designed for the cron caller. */
export async function recomputeAllCharts(): Promise<{
  results: Array<{ slug: ChartSlug; windowKey: string; inserted: number }>;
}> {
  const results: Array<{ slug: ChartSlug; windowKey: string; inserted: number }> = [];
  for (const [windowKey, hours] of Object.entries(CHART_WINDOWS)) {
    for (const slug of CHART_SLUGS) {
      const rows = await computeFor(slug, hours);
      const out = await persistChart(slug, windowKey, rows);
      results.push({ slug, windowKey, inserted: out.inserted });
    }
  }
  return { results };
}

async function computeFor(slug: ChartSlug, hours: number): Promise<ChartRow[]> {
  switch (slug) {
    case "top-trending":
      return computeTopTrending(hours);
    case "top-new":
      return computeTopNew(hours);
    case "top-free":
      return computeTopFree(hours);
    case "top-rated":
      return computeTopRated(hours);
  }
}
