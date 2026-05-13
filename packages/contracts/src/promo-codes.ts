import { z } from "zod";

/**
 * Promo-code contracts (P3-C).
 *
 * Codes are 8 chars from a 32-character Crockford-ish alphabet
 * (uppercase letters minus I/O, digits 2-9). At 32^8 the namespace
 * is ~1.1 × 10^12 entries — collisions are statistically negligible
 * but we still UNIQUE-index on code at the schema layer.
 */

export const PROMO_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PROMO_CODE_LENGTH = 8;

/**
 * Normalize whatever the user pasted/typed before comparing or
 * storing. Strips spaces, dashes, underscores; uppercases everything.
 */
export function normalizePromoCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, "");
}

/**
 * Returns true if `code` is well-formed (correct length + alphabet).
 * The schema also enforces this at the API boundary; the helper is
 * here so dev-portal and storefront can give early feedback.
 */
export function isValidPromoCodeShape(code: string): boolean {
  if (code.length !== PROMO_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!PROMO_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export const promoCodeInputSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  grantsBeta: z.boolean().default(false),
  grantsPreRegistration: z.boolean().default(false),
  maxRedemptions: z.number().int().positive().max(1_000_000).optional(),
  expiresAt: z.string().datetime().optional(),
});

export type PromoCodeInput = z.infer<typeof promoCodeInputSchema>;

export const promoCodeRedeemSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(40)
    .transform(normalizePromoCode)
    .refine(isValidPromoCodeShape, { message: "Code format is invalid" }),
});

export type PromoCodeRedeemInput = z.infer<typeof promoCodeRedeemSchema>;

/**
 * Returned by /redeem/preview — non-authenticated callers can see
 * what a code unlocks before claiming it. Lets the storefront render
 * a "this code grants X and Y" confirmation page.
 */
export const promoCodePreviewSchema = z.object({
  appId: z.string().uuid(),
  appTitle: z.string(),
  appIconUrl: z.string().nullable(),
  grantsBeta: z.boolean(),
  grantsPreRegistration: z.boolean(),
  remainingRedemptions: z.number().int().nullable(),
  expiresAt: z.string().nullable(),
});

export type PromoCodePreview = z.infer<typeof promoCodePreviewSchema>;

/**
 * Effects that actually applied during a redeem call. The route
 * returns this so the storefront can show "you're now in the beta
 * track + on the launch waitlist" instead of guessing.
 */
export const promoCodeRedeemResultSchema = z.object({
  appId: z.string().uuid(),
  betaJoined: z.boolean(),
  preRegistered: z.boolean(),
});

export type PromoCodeRedeemResult = z.infer<typeof promoCodeRedeemResultSchema>;
