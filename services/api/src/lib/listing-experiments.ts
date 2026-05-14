import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  listingExperiments,
  listingExperimentVariants,
} from "@openmarket/db/schema";
import {
  bucketForSubject,
  pickVariantByBucket,
} from "@openmarket/contracts/listing-experiments";
import { db } from "./db";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Resolve the running experiment for an app + pick a variant for
 * this subject (P3-B). Returns null when there's no running
 * experiment — caller falls through to the baseline listing.
 *
 * `subjectKey` is a stable identifier for the visitor: prefer the
 * user.id when signed in; the storefront sets a visitor cookie and
 * passes its value otherwise. Anonymous viewers without a cookie get
 * a per-request salt — they're not stable across page loads, which
 * means their conversion lift is noisier but never poisons the
 * sticky-assignment property for cookie'd or signed-in users.
 */
export async function resolveRunningExperiment(
  appId: string,
  subjectKey: string,
): Promise<{
  experimentId: string;
  variant: typeof listingExperimentVariants.$inferSelect;
} | null> {
  const experiment = await db.query.listingExperiments.findFirst({
    where: and(
      eq(listingExperiments.appId, appId),
      eq(listingExperiments.status, "running"),
    ),
  });
  if (!experiment) return null;

  const variants = await db
    .select()
    .from(listingExperimentVariants)
    .where(eq(listingExperimentVariants.experimentId, experiment.id))
    .orderBy(asc(listingExperimentVariants.createdAt));

  if (variants.length === 0) return null;

  const bucket = bucketForSubject(experiment.id, subjectKey, sha256Hex);
  const variant = pickVariantByBucket(variants, bucket);
  if (!variant) return null;
  return { experimentId: experiment.id, variant };
}

/**
 * Bump a denormalized counter on a variant. The route validates the
 * (experimentId, variantId) pair before calling so this is just a
 * cheap SQL UPDATE. Fire-and-forget from the caller's point of view —
 * we don't gate the user-facing response on the write succeeding.
 */
export async function recordExperimentEvent(
  experimentId: string,
  variantId: string,
  type: "view" | "install",
): Promise<void> {
  // Defense-in-depth: verify the variant actually belongs to the
  // experiment before bumping. Cheap; avoids cross-experiment
  // counter mutation from a spoofed body.
  const variant = await db.query.listingExperimentVariants.findFirst({
    where: and(
      eq(listingExperimentVariants.id, variantId),
      eq(listingExperimentVariants.experimentId, experimentId),
    ),
  });
  if (!variant) return;

  if (type === "view") {
    await db
      .update(listingExperimentVariants)
      .set({
        viewsCount: variant.viewsCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(listingExperimentVariants.id, variantId));
  } else {
    await db
      .update(listingExperimentVariants)
      .set({
        installsCount: variant.installsCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(listingExperimentVariants.id, variantId));
  }
}
