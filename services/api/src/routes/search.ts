import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { MeiliSearch } from "meilisearch";
import { sql } from "drizzle-orm";
import { searchQuerySchema } from "@openmarket/contracts/search";
import { searchQueries } from "@openmarket/db/schema";
import { db } from "../lib/db";
import { rateLimit } from "../middleware/rate-limit";

export const searchRouter = new Hono();

const MEILI_URL = process.env.MEILI_URL ?? "http://localhost:7700";
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY ?? "openmarket_dev_key";
const APPS_INDEX = "apps";

const meiliClient = new MeiliSearch({
  host: MEILI_URL,
  apiKey: MEILI_MASTER_KEY,
});

searchRouter.get(
  "/search",
  // 60 searches / minute / IP. Honest users send a few per session; this
  // is generous-but-finite. Higher limit than reports/reviews because
  // search is read-only and idempotent.
  rateLimit({ windowSec: 60, max: 60, by: "ip", bucket: "search" }),
  zValidator("query", searchQuerySchema),
  async (c) => {
    const { q, category, trustTier, antiFeature, excludeAntiFeature, page, limit } =
      c.req.valid("query");

    const filters: string[] = ["isPublished = true"];

    if (category) {
      const sanitized = category.replace(/["\\]/g, "");
      filters.push(`category = "${sanitized}"`);
    }

    if (trustTier) {
      const sanitized = trustTier.replace(/["\\]/g, "");
      filters.push(`trustTier = "${sanitized}"`);
    }

    // antiFeature: comma-separated REQUIRE list — every label must be
    // present on the app. (`antiFeatures = "tracking" AND antiFeatures
    // = "ads"`).
    if (antiFeature) {
      for (const slug of antiFeature.split(",").map((s) => s.trim()).filter(Boolean)) {
        const sanitized = slug.replace(/["\\]/g, "");
        filters.push(`antiFeatures = "${sanitized}"`);
      }
    }

    // excludeAntiFeature: comma-separated EXCLUDE list — none of these
    // labels may be present. (`antiFeatures != "tracking" AND ...`).
    // NSFW is opt-in only — if the caller doesn't say "include nsfw"
    // explicitly via antiFeature, it stays out.
    const excludes = excludeAntiFeature
      ? excludeAntiFeature.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (!antiFeature?.includes("nsfw") && !excludes.includes("nsfw")) {
      excludes.push("nsfw");
    }
    for (const slug of excludes) {
      const sanitized = slug.replace(/["\\]/g, "");
      filters.push(`antiFeatures != "${sanitized}"`);
    }

    const filter = filters.join(" AND ");
    const offset = (page - 1) * limit;

    const index = meiliClient.index(APPS_INDEX);
    const result = await index.search(q, {
      filter,
      limit,
      offset,
    });

    // Best-effort query log. Only on the first page so multi-page
    // pagination doesn't multi-count a single user-intent search.
    if (page === 1) {
      const normalized = q.toLowerCase().normalize("NFC").trim().slice(0, 200);
      if (normalized.length > 0) {
        try {
          await db.insert(searchQueries).values({
            query: normalized,
            resultCount: result.estimatedTotalHits ?? result.hits.length,
          });
        } catch (err) {
          // Log-and-move-on: a search must never fail because we
          // couldn't write to the query-log table.
          console.warn("[search] query-log write failed:", err);
        }
      }
    }

    return c.json({
      hits: result.hits,
      totalHits: result.estimatedTotalHits ?? result.hits.length,
      page,
      limit,
      processingTimeMs: result.processingTimeMs,
    });
  }
);

/**
 * GET /search/popular?window=24h&limit=12
 *
 * Returns the top distinct queries from the search-query log within the
 * given time window. Surfaced on the storefront's empty-state /search
 * page so users without a query in mind see what others are looking for.
 *
 * Privacy floor: a query must have ≥3 distinct submitters to appear.
 * That keeps a single user typing their own name (or a one-off
 * accidental PII string) from ever showing up in the public panel.
 *
 * Anonymous searches don't have a user_id, so the "distinct submitters"
 * count uses the day-bucket of the row's created_at as a proxy when
 * user_id is null. This is an approximation and intentional — we'd
 * rather under-surface than ever surface a single-source query.
 */
searchRouter.get("/search/popular", async (c) => {
  const limitRaw = c.req.query("limit");
  const limit = Math.min(50, Math.max(1, parseInt(limitRaw ?? "12", 10)));

  const windowParam = c.req.query("window") ?? "24h";
  const sinceMs =
    windowParam === "7d"
      ? 7 * 24 * 60 * 60 * 1000
      : windowParam === "1h"
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - sinceMs);

  // distinct_submitters proxy: distinct user_id where present, else
  // distinct day-bucket of created_at. count_distinct on COALESCE keeps
  // the SQL simple.
  const rows = await db
    .select({
      query: searchQueries.query,
      hits: sql<number>`count(*)`.as("hits"),
      distinctSubmitters: sql<number>`count(distinct coalesce(${searchQueries.userId}::text, date_trunc('day', ${searchQueries.createdAt})::text))`.as(
        "distinct_submitters",
      ),
      lastResultCount: sql<number>`max(${searchQueries.resultCount})`.as(
        "last_result_count",
      ),
    })
    .from(searchQueries)
    .where(sql`${searchQueries.createdAt} >= ${since}`)
    .groupBy(searchQueries.query)
    .having(
      sql`count(distinct coalesce(${searchQueries.userId}::text, date_trunc('day', ${searchQueries.createdAt})::text)) >= 3`,
    )
    .orderBy(sql`count(*) desc`)
    .limit(limit);

  return c.json({
    window: windowParam,
    items: rows.map((r) => ({
      query: r.query,
      hits: Number(r.hits),
      lastResultCount:
        r.lastResultCount == null ? null : Number(r.lastResultCount),
    })),
  });
});
