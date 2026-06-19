import { Hono } from "hono";
import { and, eq, gte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  apps,
  installEvents,
} from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import type { Variables } from "../lib/types";

export const liveAnalyticsRouter = new Hono<{ Variables: Variables }>();

/**
 * Real-time analytics dashboard (P4-F).
 *
 * Live install counter + currently-active-users for the developer's
 * apps. Privacy-respecting — we aggregate from install_events using
 * a coarse 5-minute rolling window. The "currently-active-users"
 * metric uses install_events.deviceFingerprintHash COUNT DISTINCT
 * (which is already a salted, non-PII hash) so we never expose
 * per-user identity, just an approximate concurrency number.
 *
 *   GET /apps/:id/live                    developer+ on owning publisher
 *                                         { now,
 *                                           installsLast5m,
 *                                           installsLast1h,
 *                                           activeDevicesLast5m,
 *                                           perMinute: [{minute, count}],
 *                                         }
 *
 * Caching: this endpoint is intentionally NOT cached at the CDN —
 * dev-portal calls it on a 5-second interval and we trust Postgres
 * to handle the load for v1. If install volume gets huge, swap
 * install_events COUNT for a Redis ZINCRBY pattern that the
 * install-record path bumps in real time.
 */

async function ensureOwnership(userEmail: string, appId: string) {
  const ctx = await findEffectiveDeveloperContext(userEmail);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }
  if (!roleSatisfies(ctx.role, "developer")) {
    throw new HTTPException(403, {
      message: `Viewing analytics requires developer role; you have ${ctx.role}`,
    });
  }
  const app = await db.query.apps.findFirst({
    where: and(eq(apps.id, appId), eq(apps.developerId, ctx.developer.id)),
  });
  if (!app) {
    throw new HTTPException(404, {
      message: "App not found or not owned by this publisher",
    });
  }
}

liveAnalyticsRouter.get(
  "/apps/:id/live",
  requireAuth,
  // The dev-portal polls this every 5s and each call runs two non-trivial
  // aggregates over install_events. A stuck or duplicated dashboard tab
  // could storm Postgres. Cap per user at ~1 req/2s, well above the 5s
  // poll cadence so normal use never trips it.
  rateLimit({ windowSec: 60, max: 30, by: "user", bucket: "live-analytics" }),
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");
    await ensureOwnership(user.email, appId);

    const now = new Date();
    const fiveMin = new Date(now.getTime() - 5 * 60 * 1000);
    const oneHour = new Date(now.getTime() - 60 * 60 * 1000);

    // Three aggregates in two round-trips. Keep them small enough
    // that the dev-portal can poll every 5s without straining the
    // db.
    const [scalars, perMinuteResult] = await Promise.all([
      db
        .select({
          installsLast5m: sql<number>`COUNT(*) FILTER (WHERE ${installEvents.installedAt} >= ${fiveMin})::int`,
          installsLast1h: sql<number>`COUNT(*) FILTER (WHERE ${installEvents.installedAt} >= ${oneHour})::int`,
          activeDevicesLast5m: sql<number>`COUNT(DISTINCT CASE WHEN ${installEvents.installedAt} >= ${fiveMin} THEN ${installEvents.deviceFingerprintHash} END)::int`,
        })
        .from(installEvents)
        .where(
          and(
            eq(installEvents.appId, appId),
            eq(installEvents.success, true),
            gte(installEvents.installedAt, oneHour),
          ),
        ),
      // Per-minute buckets over the last hour. date_trunc('minute', …)
      // collapses to a clean 60-row series.
      db.execute(sql`
        SELECT
          date_trunc('minute', installed_at)::timestamptz AS minute,
          COUNT(*)::int AS count
        FROM install_events
        WHERE app_id = ${appId}
          AND success = true
          AND installed_at >= ${oneHour}
        GROUP BY minute
        ORDER BY minute ASC
      `),
    ]);

    const summary = scalars[0] ?? {
      installsLast5m: 0,
      installsLast1h: 0,
      activeDevicesLast5m: 0,
    };
    const perMinute = (
      (perMinuteResult as { rows?: Array<Record<string, unknown>> }).rows ??
      (perMinuteResult as unknown as Array<Record<string, unknown>>) ??
      []
    ).map((r) => ({
      minute:
        r.minute instanceof Date
          ? r.minute.toISOString()
          : String(r.minute),
      count: Number(r.count ?? 0),
    }));

    return c.json({
      appId,
      now: now.toISOString(),
      ...summary,
      perMinute,
    });
  },
);
