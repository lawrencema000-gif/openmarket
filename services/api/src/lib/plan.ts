import { and, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { apps, developers, installEvents } from "@openmarket/db/schema";
import { db } from "./db";

/**
 * Free-until-threshold monetization model.
 *
 * A developer is free until their usage crosses EITHER cap (apps or total
 * installs — whichever first). Crossing starts a grace window; after it
 * expires, publishing (new apps / new releases) is gated until they're on
 * the paid plan. The paid plan is a flat monthly fee PLUS the revenue
 * share already taken at payout (payouts.platformFeeBps).
 *
 * All thresholds are env-tunable so the final numbers ship without a code
 * change:
 *   FREE_TIER_MAX_APPS       (default 10)
 *   FREE_TIER_MAX_INSTALLS   (default 100000)
 *   PLAN_GRACE_PERIOD_DAYS   (default 14)
 */

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const APPROACH_RATIO = 0.8;

export type PlanStatus =
  | "free"
  | "approaching"
  | "over_grace"
  | "enforced"
  | "paid";

export interface PlanResult {
  plan: "free" | "paid";
  status: PlanStatus;
  usage: { apps: number; installs: number };
  limits: { maxApps: number; maxInstalls: number };
  over: { apps: boolean; installs: boolean };
  thresholdCrossedAt: string | null;
  graceEndsAt: string | null;
  /** True when publishing should be blocked (over + grace expired + not paid). */
  enforced: boolean;
}

/**
 * Compute a developer's plan + usage status. Lazily stamps
 * thresholdCrossedAt the first time usage crosses a cap, and clears it if
 * the developer drops back under (or upgrades).
 */
export async function computePlanStatus(developerId: string): Promise<PlanResult> {
  const maxApps = intEnv("FREE_TIER_MAX_APPS", 10);
  const maxInstalls = intEnv("FREE_TIER_MAX_INSTALLS", 100_000);
  const graceDays = intEnv("PLAN_GRACE_PERIOD_DAYS", 14);

  const dev = await db.query.developers.findFirst({
    where: eq(developers.id, developerId),
  });
  const isPaid = dev?.platformPlan === "paid";

  const ownedApps = await db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.developerId, developerId));
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

  // Lazy-stamp / clear the crossing timestamp so the grace window has an
  // anchor. Only mutate when the state actually changes.
  let crossedAt = dev?.thresholdCrossedAt ?? null;
  if (over && !crossedAt) {
    const now = new Date();
    crossedAt = now;
    await db
      .update(developers)
      .set({ thresholdCrossedAt: now, updatedAt: now })
      .where(eq(developers.id, developerId));
  } else if (!over && crossedAt) {
    crossedAt = null;
    await db
      .update(developers)
      .set({ thresholdCrossedAt: null, updatedAt: new Date() })
      .where(eq(developers.id, developerId));
  }

  const graceEndsAt =
    crossedAt instanceof Date
      ? new Date(crossedAt.getTime() + graceDays * 24 * 60 * 60 * 1000)
      : crossedAt
        ? new Date(new Date(crossedAt).getTime() + graceDays * 24 * 60 * 60 * 1000)
        : null;

  const graceExpired = graceEndsAt !== null && Date.now() > graceEndsAt.getTime();
  const enforced = over && graceExpired && !isPaid;

  const approaching =
    !over &&
    (appsCount >= maxApps * APPROACH_RATIO ||
      installs >= maxInstalls * APPROACH_RATIO);

  const status: PlanStatus = isPaid
    ? "paid"
    : enforced
      ? "enforced"
      : over
        ? "over_grace"
        : approaching
          ? "approaching"
          : "free";

  return {
    plan: isPaid ? "paid" : "free",
    status,
    usage: { apps: appsCount, installs },
    limits: { maxApps, maxInstalls },
    over: { apps: overApps, installs: overInstalls },
    thresholdCrossedAt:
      crossedAt instanceof Date
        ? crossedAt.toISOString()
        : crossedAt
          ? new Date(crossedAt).toISOString()
          : null,
    graceEndsAt: graceEndsAt ? graceEndsAt.toISOString() : null,
    enforced,
  };
}

/**
 * Guard for publishing actions (create app / create release). Throws a
 * 402 once a developer is over a free-tier cap, past the grace window, and
 * not on the paid plan. Existing apps keep running — only NEW publishing
 * is gated, so a developer can always recover by upgrading.
 */
export async function assertPublishingAllowed(developerId: string): Promise<void> {
  const plan = await computePlanStatus(developerId);
  if (plan.enforced) {
    throw new HTTPException(402, {
      message:
        "You've passed the free tier and the grace period has ended. " +
        "Subscribe to the paid plan to publish new apps or releases — your " +
        "existing apps keep running.",
    });
  }
}
