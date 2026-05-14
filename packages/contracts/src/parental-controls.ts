import { z } from "zod";

/**
 * Parental controls contracts (P3-F).
 *
 * Rating ladder (matches content_rating on app_listings):
 *   everyone < teen < mature
 *
 * `everyone` is the most restrictive setting from the child's POV
 * — only apps rated "everyone" can be installed without PIN unlock.
 * `mature` is the most permissive — any rating goes through.
 */

export const parentalControlRatingSchema = z.enum([
  "everyone",
  "teen",
  "mature",
]);
export type ParentalControlRating = z.infer<
  typeof parentalControlRatingSchema
>;

const RATING_ORDER: ParentalControlRating[] = ["everyone", "teen", "mature"];

/**
 * Returns true when an app with rating `appRating` is allowed
 * without PIN unlock for a child whose ceiling is `maxAllowed`.
 *
 * Apps with no declared content rating are treated as "mature" so
 * the safe default is to gate them — devs who haven't declared get
 * the strictest treatment.
 */
export function isInstallAllowedWithoutPin(
  appRating: ParentalControlRating | null | undefined,
  maxAllowed: ParentalControlRating,
): boolean {
  const effective = appRating ?? "mature";
  return (
    RATING_ORDER.indexOf(effective) <= RATING_ORDER.indexOf(maxAllowed)
  );
}

/**
 * PIN schema. We accept 4-8 digits; UIs typically settle on 4 but
 * allowing 8 lets paranoid parents stretch the entropy.
 */
export const pinSchema = z
  .string()
  .min(4, "PIN must be at least 4 digits")
  .max(8, "PIN can be at most 8 digits")
  .regex(/^\d+$/, "PIN must be digits only");

export const setParentalControlsSchema = z.object({
  pin: pinSchema.optional(),
  maxContentRating: parentalControlRatingSchema.optional(),
});

export type SetParentalControlsInput = z.infer<
  typeof setParentalControlsSchema
>;

export const verifyPinSchema = z.object({
  pin: pinSchema,
  childUserId: z.string().uuid().optional(),
});

export type VerifyPinInput = z.infer<typeof verifyPinSchema>;

export const inviteChildSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const acceptLinkSchema = z.object({
  token: z.string().min(8).max(200),
});
