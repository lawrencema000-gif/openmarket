import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { MeiliSearch } from "meilisearch";
import { and, arrayContains, arrayOverlaps, desc, eq, inArray, not, sql } from "drizzle-orm";
import { searchQuerySchema, type SearchQuery } from "@openmarket/contracts/search";
import { appListings, apps, developers, searchQueries } from "@openmarket/db/schema";
import { db } from "../lib/db";
import { rateLimit } from "../middleware/rate-limit";

export const searchRouter = new Hono();

const MEILI_URL = process.env.MEILI_URL ?? "http://localhost:7700";
const APPS_INDEX = "apps";

/**
 * Resolve the Meilisearch API key. In production the key MUST come from
 * the environment — silently falling back to a public "dev key" would
 * leave a production index world-writable behind a guessable secret.
 * Outside production we allow the well-known local-dev key so the Docker
 * stack works out of the box.
 */
function resolveMeiliKey(): string {
  const key = process.env.MEILI_MASTER_KEY;
  if (key && key.length > 0) return key;
  // Fail-CLOSED: only fall back to the public dev key when NODE_ENV is
  // EXPLICITLY a known non-prod value. An unset, misspelled, or
  // staging-style NODE_ENV refuses to boot rather than silently running
  // the index behind a source-visible key. (Local dev + Docker set
  // MEILI_MASTER_KEY in .env, so this fallback is a safety net, not the
  // normal path.) Mirrors the allowlist convention in middleware/auth.ts.
  const env = process.env.NODE_ENV;
  if (env === "development" || env === "test") return "openmarket_dev_key";
  throw new Error(
    "MEILI_MASTER_KEY must be set — refusing to start with the public dev key " +
      `(NODE_ENV=${env ?? "unset"}).`,
  );
}

const meiliClient = new MeiliSearch({
  host: MEILI_URL,
  apiKey: resolveMeiliKey(),
});

/** Split a comma-separated filter param into trimmed non-empty slugs. */
function splitSlugs(csv: string | undefined): string[] {
  return csv ? csv.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * BROWSE mode — the no-query path. Served straight from Postgres (newest
 * first) so "Browse all apps", category chips, trust-tier chips, and the
 * anti-features "browse apps with this label" links all work even when the
 * Meilisearch index is cold or empty. Same filter semantics and response
 * shape as the Meili path, deterministic ordering, no personalization.
 */
async function browseApps(params: Omit<SearchQuery, "q">) {
  const { category, trustTier, antiFeature, excludeAntiFeature, page, limit } =
    params;
  const startedAt = Date.now();

  const conditions = [eq(apps.isPublished, true), eq(apps.isDelisted, false)];
  if (category) conditions.push(eq(appListings.category, category));
  if (trustTier) conditions.push(eq(apps.trustTier, trustTier));

  // REQUIRE list: every label must be present.
  const requires = splitSlugs(antiFeature);
  if (requires.length > 0) {
    conditions.push(arrayContains(apps.antiFeatures, requires));
  }

  // EXCLUDE list: none may be present. NSFW stays out unless explicitly
  // requested — the same default the Meili path applies.
  const excludes = splitSlugs(excludeAntiFeature);
  if (!requires.includes("nsfw") && !excludes.includes("nsfw")) {
    excludes.push("nsfw");
  }
  if (excludes.length > 0) {
    conditions.push(not(arrayOverlaps(apps.antiFeatures, excludes)));
  }

  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: apps.id,
        packageName: apps.packageName,
        title: appListings.title,
        shortDescription: appListings.shortDescription,
        category: appListings.category,
        iconUrl: appListings.iconUrl,
        developerName: developers.displayName,
        trustTier: apps.trustTier,
        isExperimental: appListings.isExperimental,
      })
      .from(apps)
      .innerJoin(appListings, eq(appListings.id, apps.currentListingId))
      .innerJoin(developers, eq(developers.id, apps.developerId))
      .where(where)
      .orderBy(desc(apps.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(apps)
      .innerJoin(appListings, eq(appListings.id, apps.currentListingId))
      .where(where),
  ]);

  return {
    hits: rows.map((r) => ({
      ...r,
      shortDescription: r.shortDescription ?? "",
      iconUrl: r.iconUrl ?? "",
      developerName: r.developerName ?? "",
      isExperimental: r.isExperimental ?? false,
    })),
    totalHits: Number(countRows[0]?.count ?? 0),
    page,
    limit,
    processingTimeMs: Date.now() - startedAt,
  };
}

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

    // No text query → BROWSE mode from Postgres. Filters still apply.
    const query = q?.trim() ?? "";
    if (query.length === 0) {
      return c.json(
        await browseApps({
          category,
          trustTier,
          antiFeature,
          excludeAntiFeature,
          page,
          limit,
        }),
      );
    }

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
    const result = await index.search(query, {
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
      const normalized = query.toLowerCase().normalize("NFC").trim().slice(0, 200);
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
