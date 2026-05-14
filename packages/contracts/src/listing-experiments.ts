import { z } from "zod";

/**
 * Listing experiment contracts (P3-B).
 *
 * Experiments are created by the developer; variants are children of
 * one experiment. Status transitions are linear: draft → running →
 * concluded (no back-edge from concluded; devs make a new experiment).
 *
 * The hash-split helper is pure and lives here so storefront + API +
 * any future SDK pick the same variant for the same subject.
 */

export const experimentVariantInputSchema = z.object({
  label: z.string().min(1).max(40),
  isControl: z.boolean().default(false),
  trafficWeight: z.number().int().min(1).max(100).default(50),
  title: z.string().max(200).nullable().optional(),
  shortDescription: z.string().max(500).nullable().optional(),
  fullDescription: z.string().max(20000).nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  screenshots: z.array(z.string().url()).max(20).nullable().optional(),
});

export type ExperimentVariantInput = z.infer<typeof experimentVariantInputSchema>;

export const experimentInputSchema = z.object({
  name: z.string().min(1).max(120),
  hypothesis: z.string().max(2000).optional(),
  variants: z
    .array(experimentVariantInputSchema)
    .min(2, "At least two variants required")
    .max(6, "At most six variants"),
});

export type ExperimentInput = z.infer<typeof experimentInputSchema>;

export const experimentEventSchema = z.object({
  experimentId: z.string().uuid(),
  variantId: z.string().uuid(),
  type: z.enum(["view", "install"]),
});

export type ExperimentEvent = z.infer<typeof experimentEventSchema>;

/**
 * Deterministic hash split.
 *
 * Maps (experimentId, subjectKey) → integer in [0, 99]. Same subject
 * always lands in the same bucket for the same experiment. Different
 * experiments get different bucket sequences because the experiment
 * id is mixed into the digest.
 *
 * Implementation note: we accept the hash function as a parameter
 * (rather than calling crypto directly) so the device-side SDK can
 * pass a synchronous WebCrypto or Node crypto digest and tests can
 * inject a deterministic stub.
 */
export function bucketForSubject(
  experimentId: string,
  subjectKey: string,
  digestHex: (input: string) => string,
): number {
  const hex = digestHex(`${experimentId}:${subjectKey}`);
  // First 8 hex chars → uint32. Modulo 100 for the bucket.
  const slice = hex.slice(0, 8);
  const n = Number.parseInt(slice, 16);
  return n % 100;
}

/**
 * Pick a variant by walking variants in trafficWeight order until
 * cumulative weight exceeds the subject's bucket. Variants must be
 * passed in deterministic order (the caller is expected to sort by
 * createdAt asc) so the picker is stable across calls.
 *
 * Returns null when the variant set is empty or weights don't add up
 * to a value > bucket — both indicate misconfiguration that the
 * caller should treat as "no experiment" and fall back to baseline.
 */
export interface PickableVariant {
  id: string;
  trafficWeight: number;
}

export function pickVariantByBucket<V extends PickableVariant>(
  variants: V[],
  bucket: number,
): V | null {
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.trafficWeight;
    if (bucket < cumulative) return v;
  }
  // Bucket fell off the end — weights summed < 100. Return the last
  // variant as a best-effort fallback so the storefront still gets
  // SOMETHING rather than a baseline-overlay mismatch.
  return variants[variants.length - 1] ?? null;
}

/**
 * Conclusion summary helper for the dev-portal results panel.
 * Computes per-variant install rate and the lift vs the control row.
 * Pure — drives the chart without an extra round trip.
 */
export interface VariantResultInput {
  id: string;
  label: string;
  isControl: boolean;
  viewsCount: number;
  installsCount: number;
}

export interface VariantResultRow extends VariantResultInput {
  installRate: number;
  liftVsControl: number | null;
}

export function computeExperimentResults(
  variants: VariantResultInput[],
): VariantResultRow[] {
  const control = variants.find((v) => v.isControl);
  const controlRate =
    control && control.viewsCount > 0
      ? control.installsCount / control.viewsCount
      : null;
  return variants.map((v) => {
    const rate = v.viewsCount > 0 ? v.installsCount / v.viewsCount : 0;
    const lift =
      controlRate && controlRate > 0 && !v.isControl
        ? (rate - controlRate) / controlRate
        : null;
    return { ...v, installRate: rate, liftVsControl: lift };
  });
}
