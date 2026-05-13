import { z } from "zod";

/**
 * Distribution channel wire schemas (P3-H).
 *
 * Devs create channels then pin specific releases. The share token is
 * server-generated and never accepted from the client — it's the
 * access secret and would defeat the point if the caller could pick it.
 */

export const distributionChannelInputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000).optional(),
  /** ISO timestamp; absent = no expiry. */
  expiresAt: z.string().datetime().optional(),
});

export type DistributionChannelInput = z.infer<
  typeof distributionChannelInputSchema
>;

export const distributionChannelPatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(1000).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export const pinReleaseSchema = z.object({
  releaseId: z.string().uuid(),
});

/**
 * Server-only helper — generate a share token. Lives in contracts
 * so the API + any future SDK use the same prefix + length policy.
 * Devices never see this implementation; the value is just a string
 * over the wire.
 *
 * Format: `om_dist_<43-char base64url>` — matches the `om_live_` /
 * `om_test_` shape used by api-tokens.
 */
export function isValidShareTokenFormat(token: string): boolean {
  return /^om_dist_[A-Za-z0-9_-]{40,}$/.test(token);
}
