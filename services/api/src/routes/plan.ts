import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { apps, installEvents } from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { findEffectiveDeveloperContext } from "../lib/team";
import type { Variables } from "../lib/types";

export const planRouter = new Hono<{ Variables: Variables }>();

/**
 * Developer plan / usage status (free-until-threshold monetization model).
 *
 * OpenMarket launches free, then charges a developer once they cross a
 * usage threshold (published apps and/or total installs). This endpoint
 * computes a developer's current usage against the configurable free-tier
 * limits and reports where they stand. The dev-portal renders a banner
 * from it; enforcement (what happens when `over`) is a deliberate,
 * separate decision — this surfaces the signal without acting on it yet.
 *
 * Free-tier limits are env-tunable so the exact numbers can change without
 * a code deploy:
 *   FREE_TIER_MAX_APPS      (default 10)
 *   FREE_TIER_MAX_INSTALLS  (default 100000)
 */

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const APPROACH_RATIO = 0.8; // flag "approaching" at 80% of either limit

planRouter.get("/developers/me/plan", requireAuth, async (c) => {
  const user = c.get("user");
  const ctx = await findEffectiveDeveloperContext(user.email);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
    });
  }

  const maxApps = intEnv("FREE_TIER_MAX_APPS", 10);
  const maxInstalls = intEnv("FREE_TIER_MAX_INSTALLS", 100_000);

  // Count the developer's apps, then total successful installs across them.
  const ownedApps = await db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.developerId, ctx.developer.id));
  const appIds = ownedApps.map((a) => a.id);

  let installs = 0;
  if (appIds.length > 0) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(installEvents)
      .where(
        and(inArray(installEvents.appId, appIds), eq(installEvents.success, true)),
      );
    installs = row?.count ?? 0;
  }

  const appsCount = appIds.length;
  const overApps = appsCount > maxApps;
  const overInstalls = installs > maxInstalls;
  const over = overApps || overInstalls;
  const approaching =
    !over &&
    (appsCount >= maxApps * APPROACH_RATIO ||
      installs >= maxInstalls * APPROACH_RATIO);

  const status: "free" | "approaching" | "over" = over
    ? "over"
    : approaching
      ? "approaching"
      : "free";

  return c.json({
    // v1 everyone is on the free plan; the paid tier ships with enforcement.
    plan: "free" as const,
    status,
    usage: { apps: appsCount, installs },
    limits: { maxApps, maxInstalls },
    over: { apps: overApps, installs: overInstalls },
  });
});
