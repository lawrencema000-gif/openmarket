import { createHash } from "node:crypto";

/**
 * Deterministic cohort assignment for staged rollouts.
 *
 * Given a stable identity (a userId, or a deviceFingerprintHash for
 * anonymous installs) and a release id, returns whether this user is
 * in the rollout cohort at the given percentage.
 *
 * Properties we want:
 *   1. Stable per (subjectId, releaseId): the same user always gets
 *      the same answer for the same release. No flapping.
 *   2. Independent across releases: a user who's in the 10% cohort
 *      of release A is not biased toward also being in the 10% of
 *      release B (otherwise rolling out two releases at 10% would
 *      hit the same 10% of users every time).
 *   3. Uniform: a 10% rollout reaches ~10% of distinct users.
 *
 * Mechanism: SHA-256(subjectId + ":" + releaseId), take the first 8
 * hex chars (32 bits) as an unsigned integer, modulo 10000 (basis
 * points), compare to (percentage * 100). 8 hex chars = 4-byte
 * uniform unsigned which is plenty of entropy for the 0–10000 modulo.
 *
 * Edge cases:
 *   - percentage == 100 → always true (avoids the modulo entirely so
 *     a hash collision can't accidentally exclude someone from a
 *     fully-rolled-out release).
 *   - percentage <= 0  → always false.
 *   - subjectId == ""  → always false. We never roll out to anonymous
 *     callers without a stable identity; the ingest path requires the
 *     storefront to send either a userId or a deviceFingerprintHash.
 */
export function isInCohort(
  subjectId: string,
  releaseId: string,
  percentage: number,
): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  if (!subjectId) return false;

  const digest = createHash("sha256")
    .update(`${subjectId}:${releaseId}`)
    .digest("hex");
  const bucket = parseInt(digest.slice(0, 8), 16) % 10000;
  return bucket < percentage * 100;
}

/**
 * Given a list of candidate releases for an app + a subject, return
 * the release the subject should receive on its update check.
 *
 * Ordering rule:
 *   1. Highest versionCode wins, BUT only if the subject is in the
 *      rollout cohort AND the release is not halted.
 *   2. Otherwise, walk down to the next-highest released-stable
 *      candidate the subject is qualified for.
 *
 * Returns null if no candidate qualifies (the install just shows the
 * "no update available" response).
 *
 * Pre-conditions: callers should pre-filter to (status="published",
 * channel matching the subject's track, isPublished+notDelisted on
 * the parent app) — this function deals only with rollout selection
 * within the candidate set.
 */
export function pickRelease<
  R extends {
    id: string;
    versionCode: number;
    rolloutPercentage: number | null;
    rolloutStatus: "live" | "paused" | "halted" | "completed";
  },
>(candidates: R[], subjectId: string): R | null {
  // Highest versionCode first.
  const sorted = [...candidates].sort((a, b) => b.versionCode - a.versionCode);
  for (const r of sorted) {
    if (r.rolloutStatus === "halted") continue;
    const pct =
      r.rolloutStatus === "completed" ? 100 : r.rolloutPercentage ?? 100;
    if (isInCohort(subjectId, r.id, pct)) return r;
  }
  return null;
}
