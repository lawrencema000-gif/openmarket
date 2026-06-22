import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { apps, reviews, users } from "@openmarket/db/schema";
import { db } from "./db";
import { recomputeReviewHighlightsForApp } from "./review-highlights";

/**
 * Two layers of automated review moderation:
 *
 *  1. Cheap synchronous pre-check on submit (`evaluateReviewOnSubmit`).
 *     Catches the obvious cases:
 *       - duplicate text from the same user on the same app in the
 *         last 24h (re-submission spam)
 *       - body length below a threshold (drive-by 1-star spam)
 *       - matches a static low-effort bad-word list
 *     Verdict surfaces as `flag` (write the row but mark isFlagged,
 *     hide from public) or `pass` (write normally).
 *
 *  2. Scheduled bomb detection (`detectReviewBombs`).
 *     Aggregates recent low-star reviews per app; when the count in
 *     a short window crosses a threshold AND the app's rolling
 *     average drops sharply, flips `apps.reviewFreeze = true` so the
 *     promote-due cron stops promoting from that app's queue until a
 *     moderator clears the freeze.
 *
 * Both layers are deliberately conservative — false positives cost
 * less than false negatives because a flagged review still goes into
 * the moderator queue and can be unflagged. The bomb detector
 * specifically uses a high threshold (>= 25 fresh 1-stars in 60min)
 * so it only fires on coordinated bombing, not natural high-traffic
 * apps.
 */

// ────── 1. Synchronous pre-check ──────

const BAD_WORDS = [
  // Minimal, narrowly-scoped list. We don't try to do real
  // hate-speech detection here — that lives in a Phase-3 ML pass.
  // The list is the "obvious slurs + threat keywords" floor.
  "kys",
  "kill yourself",
  "[redacted-slur-1]", // placeholder — fill in production
  "[redacted-slur-2]",
];

const MIN_BODY_LENGTH = 10;

export interface PreCheckVerdict {
  verdict: "pass" | "flag";
  reasons: string[];
}

export async function evaluateReviewOnSubmit(input: {
  appId: string;
  userId: string;
  rating: number;
  title?: string | null;
  body?: string | null;
}): Promise<PreCheckVerdict> {
  const reasons: string[] = [];

  // 1a. Body length floor. Drive-by 1-star spam often comes with an
  // empty body or a single emoji. Allow empty bodies on 4-5 star
  // reviews (lots of "great app!" with no comment) but require >=10
  // chars on negative reviews where context matters more.
  const body = (input.body ?? "").trim();
  if (input.rating <= 2 && body.length > 0 && body.length < MIN_BODY_LENGTH) {
    reasons.push("low-rating review with body shorter than min");
  }

  // 1b. Bad-word match. Lowercase + simple substring; we don't try
  // to defeat l33t-speak here.
  const haystack = `${input.title ?? ""}\n${input.body ?? ""}`.toLowerCase();
  for (const w of BAD_WORDS) {
    if (haystack.includes(w)) {
      reasons.push(`matches bad-word list: ${w}`);
      break;
    }
  }

  // 1c. Same-user duplicate text in the last 24h on this app or any
  // other. Catches the "post the same 1-star on every app" pattern.
  if (body.length > 0) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dup = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(
        and(
          eq(reviews.userId, input.userId),
          eq(reviews.body, input.body!),
          gte(reviews.createdAt, dayAgo),
        ),
      )
      .limit(1);
    if (dup.length > 0) {
      reasons.push("duplicate body from same user in last 24h");
    }
  }

  return {
    verdict: reasons.length > 0 ? "flag" : "pass",
    reasons,
  };
}

// ────── 2. Scheduled bomb detection ──────

export interface BombDetectionConfig {
  /** Minimum number of low-star reviews in the window to consider a bomb. */
  minLowStarCount: number;
  /** Window in minutes. */
  windowMinutes: number;
  /** Stars at or below which a review counts toward the bomb signal. */
  lowStarThreshold: number;
  /**
   * Minimum DROP in rolling average (last `windowMinutes` vs the prior
   * 30 days) for a bomb verdict. Prevents a small spike from triggering
   * on apps that are already-1-star-avg.
   */
  minAverageDrop: number;
}

export const DEFAULT_BOMB_CONFIG: BombDetectionConfig = {
  minLowStarCount: 25,
  windowMinutes: 60,
  lowStarThreshold: 2,
  minAverageDrop: 1.0,
};

export interface BombVerdict {
  appId: string;
  recentLowStarCount: number;
  recentAvg: number;
  baselineAvg: number;
  drop: number;
}

/**
 * Returns every app currently exhibiting a review-bomb pattern.
 * Used by both the detect-bombs cron (which auto-freezes) and the
 * admin dashboard (which surfaces the data even when the freeze is
 * already on).
 */
export async function findReviewBombs(
  cfg: BombDetectionConfig = DEFAULT_BOMB_CONFIG,
): Promise<BombVerdict[]> {
  const windowStart = new Date(Date.now() - cfg.windowMinutes * 60 * 1000);
  const baselineStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Pull the candidate apps: those with ≥ minLowStarCount low-star
  // reviews inside the window. We don't filter to is_flagged=false
  // here — even already-flagged reviews count as bombing signal so
  // partial flagging by the pre-check doesn't hide the pattern.
  const rows = await db.execute<{
    app_id: string;
    recent_low_count: number;
    recent_avg: number;
    baseline_avg: number;
  }>(sql`
    WITH recent AS (
      SELECT app_id,
             AVG(rating)::float AS avg_rating,
             COUNT(*) FILTER (WHERE rating <= ${cfg.lowStarThreshold}) AS low_count
        FROM reviews
       WHERE created_at >= ${windowStart}
       GROUP BY app_id
       HAVING COUNT(*) FILTER (WHERE rating <= ${cfg.lowStarThreshold}) >= ${cfg.minLowStarCount}
    ),
    baseline AS (
      SELECT app_id, AVG(rating)::float AS avg_rating
        FROM reviews
       WHERE created_at >= ${baselineStart}
         AND created_at < ${windowStart}
       GROUP BY app_id
    )
    SELECT recent.app_id,
           recent.low_count    AS recent_low_count,
           recent.avg_rating   AS recent_avg,
           COALESCE(baseline.avg_rating, 5.0) AS baseline_avg
      FROM recent
      LEFT JOIN baseline USING (app_id)
  `);

  return (rows as unknown as Array<Record<string, unknown>>)
    .map((r) => {
      const recentAvg = Number(r.recent_avg);
      const baselineAvg = Number(r.baseline_avg);
      return {
        appId: String(r.app_id),
        recentLowStarCount: Number(r.recent_low_count),
        recentAvg,
        baselineAvg,
        drop: baselineAvg - recentAvg,
      };
    })
    .filter((v) => v.drop >= cfg.minAverageDrop);
}

/**
 * Run findReviewBombs() and flip `apps.reviewFreeze = true` on any
 * app that matches. Returns the set of apps that were freshly frozen
 * (already-frozen apps are excluded so the cron's audit trail isn't
 * noisy).
 *
 * Idempotent. Safe to run as often as every minute.
 */
export async function runBombDetectionAndFreeze(
  cfg: BombDetectionConfig = DEFAULT_BOMB_CONFIG,
): Promise<BombVerdict[]> {
  const bombs = await findReviewBombs(cfg);
  if (bombs.length === 0) return [];

  // Pull current freeze state in one query to avoid an UPDATE storm
  // when every bomb-detection run hits the same already-frozen apps.
  const ids = bombs.map((b) => b.appId);
  const current = await db
    .select({ id: apps.id, reviewFreeze: apps.reviewFreeze })
    .from(apps)
    .where(sql`${apps.id} = ANY(${ids})`);
  const alreadyFrozen = new Set(
    current.filter((r) => r.reviewFreeze).map((r) => r.id),
  );

  const toFreeze = bombs.filter((b) => !alreadyFrozen.has(b.appId));
  if (toFreeze.length > 0) {
    const freezeIds = toFreeze.map((b) => b.appId);
    await db
      .update(apps)
      .set({ reviewFreeze: true, updatedAt: new Date() })
      .where(sql`${apps.id} = ANY(${freezeIds})`);
  }
  return toFreeze;
}

/**
 * Promote all reviews past their 24h cool-off into the public set.
 * Idempotent sweep, safe to run on a cron or trigger from the admin
 * endpoint. Context-free so both callers share it. Recomputes review
 * highlights for each affected app (fire-and-forget).
 *
 * A review goes public when: publishedAt IS NULL, not flagged, older than
 * 24h, and its app is not under review-freeze.
 */
export async function promoteDueReviews(): Promise<{
  promoted: number;
  affectedApps: number;
}> {
  const now = new Date();
  const result = await db.execute(sql`
    UPDATE reviews
       SET published_at = ${now}, updated_at = ${now}
     WHERE published_at IS NULL
       AND is_flagged = false
       AND created_at <= ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}
       AND app_id NOT IN (SELECT id FROM apps WHERE review_freeze = true)
     RETURNING app_id
  `);
  const resultAsUnknown = result as unknown as {
    rows?: Array<{ app_id: string }>;
  };
  const promotedRows: Array<{ app_id: string }> = Array.isArray(
    resultAsUnknown.rows,
  )
    ? resultAsUnknown.rows
    : Array.isArray(result)
      ? (result as unknown as Array<{ app_id: string }>)
      : [];
  const affectedApps = new Set(
    promotedRows.map((r) => r.app_id).filter(Boolean),
  );
  const promoted =
    (result as { rowCount?: number | null }).rowCount ??
    (result as { rowsAffected?: number }).rowsAffected ??
    promotedRows.length;

  for (const appId of affectedApps) {
    void recomputeReviewHighlightsForApp(appId).catch((err) => {
      console.error("[reviews] highlights recompute failed", { appId }, err);
    });
  }

  return { promoted, affectedApps: affectedApps.size };
}

/** Used in tests + the admin dashboard. */
export function hashReviewBody(body: string | null | undefined): string {
  if (!body) return "";
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

// Avoid an unused-import warning for `users` in environments that
// tree-shake. It's exported so the admin dashboard's "who submitted"
// join can import it from this file in a follow-up.
export const _internal = { users };
