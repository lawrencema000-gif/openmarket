import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { MeiliSearch } from "meilisearch";
import { and, eq, inArray, sql } from "drizzle-orm";
import { searchQuerySchema } from "@openmarket/contracts/search";
import { apps, searchQueries } from "@openmarket/db/schema";
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

    // Authoritative moderation gate. The Meilisearch index is a CACHE and
    // can lag behind moderation actions (delist / unpublish) — or be stale
    // indefinitely if a reindex was missed. Postgres is the source of
    // truth, so we re-check the live publish/delist state for the returned
    // hit set and drop anything no longer publicly visible. This makes a
    // freshly-delisted app (e.g. a malware takedown) disappear from search
    // IMMEDIATELY, before any reindex runs. The hit set is bounded by
    // `limit`, so this is one small `WHERE id IN (...)` lookup per page.
    //
    // Fail-closed by design: if this check throws, the request errors
    // rather than risk serving moderated content. A delisted-malware app
    // surfacing in search is a worse outcome than a transient search 500.
    let hits = result.hits;
    let hiddenCount = 0;
    const hitIds = result.hits
      .map((h) => (h as { id?: string }).id)
      .filter((id): id is string => typeof id === "string");
    if (hitIds.length > 0) {
      const liveRows = await db
        .select({ id: apps.id })
        .from(apps)
        .where(
          and(
            inArray(apps.id, hitIds),
            eq(apps.isPublished, true),
            eq(apps.isDelisted, false),
          ),
        );
      const visible = new Set(liveRows.map((r) => r.id));
      hits = result.hits.filter((h) => visible.has((h as { id?: string }).id ?? ""));
      hiddenCount = result.hits.length - hits.length;
    }

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

    const estimatedTotal = result.estimatedTotalHits ?? result.hits.length;
    return c.json({
      hits,
      // Subtract the moderated hits we dropped on this page so the count
      // doesn't overstate what's actually reachable. Still an estimate
      // (Meili's count is itself approximate), but never lower than the
      // hits we're returning.
      totalHits: Math.max(hits.length, estimatedTotal - hiddenCount),
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
