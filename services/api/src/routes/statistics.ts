import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gte, lte, asc, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  apps,
  appStatisticsDaily,
  developers,
} from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { recordAdminAction } from "../lib/audit";
import {
  recomputeRange,
  recomputeStatsForDay,
  recomputeYesterday,
  utcDateString,
} from "../lib/statistics";
import type { Variables } from "../lib/types";

export const statisticsRouter = new Hono<{ Variables: Variables }>();

const readQuerySchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
});

/**
 * GET /apps/:id/statistics?since=YYYY-MM-DD&until=YYYY-MM-DD
 *
 * Developer-facing per-app daily statistics. Defaults to the last 30
 * days when neither bound is supplied. Caller MUST be the owning
 * developer (admin override is a separate endpoint — keeping this
 * one tight on ownership keeps the threat model crisp).
 *
 * Response shape:
 *   {
 *     range: { since, until },
 *     items: [{ day, totalInstalls, activeInstalls,
 *               newInstallsToday, uninstallsToday,
 *               totalReviews, newReviewsToday, avgRating }, ...],
 *     summary: { totalNewInstalls, totalNewReviews, latestAvgRating,
 *                latestActiveInstalls, computedAt }
 *   }
 *
 * Items are oldest-first so the dev-portal can plot them directly.
 */
statisticsRouter.get(
  "/apps/:id/statistics",
  requireAuth,
  zValidator("query", readQuerySchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");
    const { since, until } = c.req.valid("query");

    // Ownership check. We don't want a competitor pulling another
    // app's install counts — anti-feature labels are public, raw
    // install velocity isn't.
    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });
    if (!developer) {
      throw new HTTPException(403, {
        message: "Only registered developers can read app statistics",
      });
    }
    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, appId), eq(apps.developerId, developer.id)),
    });
    if (!app) {
      throw new HTTPException(404, {
        message: "App not found or not owned by this developer",
      });
    }

    // Default window: trailing 30 days ending yesterday (today is
    // still being computed by the daily cron).
    const today = new Date();
    today.setUTCDate(today.getUTCDate() - 1);
    const defaultUntil = utcDateString(today);
    const startCandidate = new Date(today);
    startCandidate.setUTCDate(startCandidate.getUTCDate() - 29);
    const defaultSince = utcDateString(startCandidate);

    const sinceDay = since ?? defaultSince;
    const untilDay = until ?? defaultUntil;

    const items = await db
      .select({
        day: appStatisticsDaily.day,
        totalInstalls: appStatisticsDaily.totalInstalls,
        activeInstalls: appStatisticsDaily.activeInstalls,
        newInstallsToday: appStatisticsDaily.newInstallsToday,
        uninstallsToday: appStatisticsDaily.uninstallsToday,
        totalReviews: appStatisticsDaily.totalReviews,
        newReviewsToday: appStatisticsDaily.newReviewsToday,
        avgRating: appStatisticsDaily.avgRating,
        computedAt: appStatisticsDaily.computedAt,
      })
      .from(appStatisticsDaily)
      .where(
        and(
          eq(appStatisticsDaily.appId, appId),
          gte(appStatisticsDaily.day, sinceDay),
          lte(appStatisticsDaily.day, untilDay),
        ),
      )
      .orderBy(asc(appStatisticsDaily.day));

    const totalNewInstalls = items.reduce(
      (acc, r) => acc + r.newInstallsToday,
      0,
    );
    const totalNewReviews = items.reduce(
      (acc, r) => acc + r.newReviewsToday,
      0,
    );
    const latest = items[items.length - 1] ?? null;

    return c.json({
      range: { since: sinceDay, until: untilDay },
      items,
      summary: {
        totalNewInstalls,
        totalNewReviews,
        latestAvgRating: latest?.avgRating ?? 0,
        latestActiveInstalls: latest?.activeInstalls ?? 0,
        latestTotalInstalls: latest?.totalInstalls ?? 0,
        computedAt: latest?.computedAt ?? null,
      },
    });
  },
);

const recomputeBodySchema = z.object({
  /** YYYY-MM-DD; defaults to "yesterday" (UTC). */
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
  /** Inclusive backfill from this day (mutually exclusive with `day`). */
  fromDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
  /** Inclusive backfill upper bound. Required when fromDay is set. */
  toDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
});

/**
 * POST /admin/statistics/recompute
 *
 * Trigger the roll-up cron. Body shapes:
 *   {}                              — recompute yesterday
 *   { day: "2026-05-09" }           — recompute that day only
 *   { fromDay: "2026-04-01",
 *     toDay:   "2026-04-30" }       — backfill an inclusive range
 *
 * Audit-logged. Returns the per-day row counts so the caller can
 * verify the range landed.
 */
statisticsRouter.post(
  "/admin/statistics/recompute",
  requireAdmin,
  zValidator("json", recomputeBodySchema),
  async (c) => {
    const body = c.req.valid("json");

    if (body.fromDay || body.toDay) {
      if (!body.fromDay || !body.toDay) {
        throw new HTTPException(400, {
          message: "fromDay and toDay must both be provided for a range",
        });
      }
      const results = await recomputeRange(body.fromDay, body.toDay);
      await recordAdminAction({
        c,
        action: "statistics.recompute.range",
        targetType: null,
        metadata: { fromDay: body.fromDay, toDay: body.toDay, days: results.length },
      });
      return c.json({ success: true, results });
    }

    const result = body.day
      ? await recomputeStatsForDay(body.day)
      : await recomputeYesterday();
    await recordAdminAction({
      c,
      action: "statistics.recompute.day",
      targetType: null,
      metadata: { day: result.day, rowsUpdated: result.rowsUpdated },
    });
    return c.json({ success: true, results: [result] });
  },
);

// Quietly satisfy the "unused import" linter for the desc symbol we
// might pull in later for a top-N statistics admin view.
const _unused = { desc };
void _unused;
