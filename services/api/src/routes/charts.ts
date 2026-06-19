import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sql, isNull, desc, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../lib/db";
import {
  appChartPositions,
  apps,
  appListings,
} from "@openmarket/db/schema";
import { requireAdmin } from "../middleware/admin";
import { recordAdminAction } from "../lib/audit";
import {
  CHART_SLUGS,
  CHART_WINDOWS,
  recomputeAllCharts,
  type ChartSlug,
} from "../lib/charts";
import type { Variables } from "../lib/types";

export const chartsRouter = new Hono<{ Variables: Variables }>();

const listQuerySchema = z.object({
  window: z.enum(["24h", "7d", "30d"]).default("7d"),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * GET /charts/:slug?window=7d&category=&limit=50
 *
 * Public, anonymous-friendly. Returns the prebuilt ranking from
 * app_chart_positions joined with the app row + current listing so the
 * storefront can render rails without a second round-trip.
 *
 * Slugs: top-trending | top-new | top-free | top-rated.
 *
 * Performance note: serves entirely off the prebuilt table; the join to
 * apps + listings is a small in-memory hash for the top-50. No
 * recomputation per request.
 */
chartsRouter.get(
  "/charts/:slug",
  zValidator("query", listQuerySchema),
  async (c) => {
    const slug = c.req.param("slug");
    if (!CHART_SLUGS.includes(slug as ChartSlug)) {
      return c.json(
        {
          error: "Unknown chart",
          allowedSlugs: CHART_SLUGS,
        },
        404,
      );
    }
    const { window, category, limit } = c.req.valid("query");

    const items = await db
      .select({
        position: appChartPositions.position,
        deltaPosition: appChartPositions.deltaPosition,
        score: appChartPositions.score,
        appId: apps.id,
        packageName: apps.packageName,
        trustTier: apps.trustTier,
        antiFeatures: apps.antiFeatures,
        title: appListings.title,
        shortDescription: appListings.shortDescription,
        category: appListings.category,
        iconUrl: appListings.iconUrl,
      })
      .from(appChartPositions)
      .innerJoin(apps, eq(apps.id, appChartPositions.appId))
      .innerJoin(appListings, eq(appListings.id, apps.currentListingId))
      .where(
        and(
          eq(appChartPositions.chartSlug, slug),
          eq(appChartPositions.windowKey, window),
          // category-aware filter: NULL means "global chart". Match
          // exact category when given, NULL when omitted.
          category
            ? eq(appChartPositions.category, category)
            : isNull(appChartPositions.category),
        ),
      )
      .orderBy(asc(appChartPositions.position))
      .limit(limit);

    const [meta] = await db
      .select({ computedAt: appChartPositions.computedAt })
      .from(appChartPositions)
      .where(
        and(
          eq(appChartPositions.chartSlug, slug),
          eq(appChartPositions.windowKey, window),
        ),
      )
      .orderBy(desc(appChartPositions.computedAt))
      .limit(1);

    return c.json({
      slug,
      window,
      category: category ?? null,
      computedAt: meta?.computedAt ?? null,
      items,
    });
  },
);

/**
 * GET /apps/:id/similar?limit=8
 *
 * Public. Content-based similar-apps: same category, anti-features
 * overlap, plus rating proximity. v1 doesn't ship a recommender; this
 * is the "looks reasonable" floor.
 *
 * Algorithm:
 *   1. Fetch the source app's category + antiFeatures.
 *   2. Score every other published, non-delisted app with the same
 *      category by: |intersect(antiFeatures)| - 0.5 × |symdiff|.
 *   3. Tiebreak by recency.
 *   4. Cap at the requested limit (default 8).
 *
 * Cached by the API edge for 5 minutes (Cache-Control header set
 * here; production CDN respects it).
 */
chartsRouter.get(
  "/apps/:id/similar",
  zValidator("query", z.object({ limit: z.coerce.number().int().min(1).max(24).default(8) })),
  async (c) => {
    const appId = c.req.param("id") as string;
    const { limit } = c.req.valid("query");

    const source = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });
    // Moderation gate: a delisted or unpublished app must not act as a
    // discovery source. Returning items here would both confirm the
    // hidden app's existence and provide a live rail away from it.
    if (!source || !source.isPublished || source.isDelisted) {
      return c.json({ items: [] });
    }

    const sourceListing = source.currentListingId
      ? await db.query.appListings.findFirst({
          where: eq(appListings.id, source.currentListingId),
        })
      : null;
    if (!sourceListing) return c.json({ items: [] });

    const sourceAFs = source.antiFeatures ?? [];

    // Pull candidate apps in the same category. The candidate-set
    // size is bounded by the catalog's per-category app count; we
    // keep the score-and-sort in app code so the formula is easy to
    // tune without a SQL rewrite.
    const candidates = await db
      .select({
        id: apps.id,
        packageName: apps.packageName,
        trustTier: apps.trustTier,
        antiFeatures: apps.antiFeatures,
        title: appListings.title,
        shortDescription: appListings.shortDescription,
        iconUrl: appListings.iconUrl,
        category: appListings.category,
        updatedAt: apps.updatedAt,
      })
      .from(apps)
      .innerJoin(appListings, eq(appListings.id, apps.currentListingId))
      .where(
        and(
          eq(apps.isPublished, true),
          eq(apps.isDelisted, false),
          eq(appListings.category, sourceListing.category),
          // exclude the source app itself
          sql`${apps.id} <> ${appId}`,
        ),
      )
      .limit(200);

    const sourceAFSet = new Set(sourceAFs);
    const scored = candidates
      .map((c) => {
        const cAFSet = new Set(c.antiFeatures ?? []);
        let intersection = 0;
        for (const x of cAFSet) if (sourceAFSet.has(x)) intersection++;
        const union = cAFSet.size + sourceAFSet.size - intersection;
        const symdiff = union - intersection;
        const score = intersection - 0.5 * symdiff;
        return { ...c, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // recency tiebreak
        const at = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
        const bt = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
        return bt - at;
      })
      .slice(0, limit);

    c.header("Cache-Control", "public, max-age=300");
    return c.json({ items: scored });
  },
);

/**
 * POST /admin/charts/recompute
 *
 * Admin-triggered or cron-triggered recompute of every (slug, window)
 * pair. Idempotent — overwrites the previous generation atomically per
 * pair. Returns the per-pair insert counts for visibility.
 *
 * Suggested cron: hourly for top-trending; daily for the rest. v1
 * runs the whole thing on a single hourly cron because the entire
 * recompute fits in <2s on a warm DB with our Phase 1 catalog size.
 */
chartsRouter.post("/admin/charts/recompute", requireAdmin, async (c) => {
  const result = await recomputeAllCharts();
  await recordAdminAction({
    c,
    action: "charts.recompute",
    targetType: null,
    targetId: null,
    metadata: {
      results: result.results,
      windowsKnown: Object.keys(CHART_WINDOWS),
    },
  });
  return c.json({ success: true, ...result });
});
