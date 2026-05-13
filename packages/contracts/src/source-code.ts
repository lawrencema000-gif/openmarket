import { z } from "zod";

/**
 * Source-code transparency tier (P3-O).
 *
 * Three escalating trust signals — the storefront renders the highest
 * tier the app qualifies for. Tiers are bottom-up additive:
 *
 *   "available"    → app_listings.sourceCodeUrl is set
 *   "verified"     → an admin has eyeballed the repo and confirmed
 *                    it hosts the source for the published binary
 *   "reproducible" → the reproducible-builds verifier rebuilt the
 *                    source and matched SHA256 against the artifact
 *
 * Tier `available` is dev-attested (anyone can paste a URL). Tier
 * `verified` is admin-attested. Tier `reproducible` is machine-
 * attested (future verifier worker).
 *
 * The badge surface uses these:
 *   available    → no badge (URL is just a link in the App Info card)
 *   verified     → "source-verified"
 *   reproducible → "reproducible-build" (also implies source-verified)
 */
export const sourceCodeTierSchema = z.enum([
  "none",
  "available",
  "verified",
  "reproducible",
]);
export type SourceCodeTier = z.infer<typeof sourceCodeTierSchema>;

/**
 * Admin verification PATCH body. Both flags independently settable
 * so admins can clear one without churning the other.
 */
export const sourceCodeVerificationPatchSchema = z.object({
  sourceCodeVerified: z.boolean().optional(),
  reproducibleVerified: z.boolean().optional(),
});

export type SourceCodeVerificationPatch = z.infer<
  typeof sourceCodeVerificationPatchSchema
>;

/**
 * Compute the storefront tier from the three input signals. Pure;
 * keeps the resolution rule in one place (consumed by GET /apps/:id
 * + the storefront badge component + tests).
 *
 * Order of precedence is intentional:
 *   - `reproducible` outranks `verified` outranks `available` outranks
 *     `none`. A `reproducibleVerified=true` row implicitly carries the
 *     `verified` signal — we don't require an admin to flip both flags.
 */
export function computeSourceCodeTier(input: {
  sourceCodeUrl?: string | null;
  sourceCodeVerified?: boolean;
  reproducibleVerified?: boolean;
}): SourceCodeTier {
  if (input.reproducibleVerified) return "reproducible";
  if (input.sourceCodeVerified) return "verified";
  if (input.sourceCodeUrl && input.sourceCodeUrl.length > 0) return "available";
  return "none";
}
