import { z } from "zod";

/**
 * Affiliate / referral program (P4-H).
 *
 * Same Crockford-32 alphabet as promo codes for visual consistency
 * across short codes in the system.
 */

export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 8;

export function normalizeReferralCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, "");
}

export function isValidReferralCodeShape(code: string): boolean {
  if (code.length !== REFERRAL_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!REFERRAL_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export function generateReferralCode(): string {
  let out = "";
  const chars = REFERRAL_CODE_ALPHABET;
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const affiliateAccountEnrollSchema = z.object({
  handle: z.string().min(2).max(40).optional(),
  payoutEmail: z.string().email().optional(),
});

export type AffiliateAccountEnroll = z.infer<
  typeof affiliateAccountEnrollSchema
>;

export const appAffiliateProgramSchema = z
  .object({
    enabled: z.boolean(),
    commissionBps: z.number().int().min(0).max(10_000).nullable().optional(),
    flatCommissionCents: z
      .number()
      .int()
      .min(0)
      .max(50_00)
      .nullable()
      .optional(),
    attributionWindowDays: z.number().int().min(1).max(90).default(30),
    dailyCapPerAffiliateCents: z
      .number()
      .int()
      .min(0)
      .nullable()
      .optional(),
  })
  .refine(
    (v) => {
      if (!v.enabled) return true;
      const hasBps = v.commissionBps !== null && v.commissionBps !== undefined;
      const hasFlat =
        v.flatCommissionCents !== null && v.flatCommissionCents !== undefined;
      return hasBps || hasFlat;
    },
    {
      message: "enabling program requires commissionBps OR flatCommissionCents",
      path: ["commissionBps"],
    },
  )
  .refine(
    (v) => {
      const hasBps = v.commissionBps !== null && v.commissionBps !== undefined;
      const hasFlat =
        v.flatCommissionCents !== null && v.flatCommissionCents !== undefined;
      return !(hasBps && hasFlat);
    },
    {
      message: "set commissionBps OR flatCommissionCents, not both",
      path: ["flatCommissionCents"],
    },
  );

export type AppAffiliateProgram = z.infer<typeof appAffiliateProgramSchema>;

/**
 * Click recording is unauthenticated — the storefront posts it on
 * page-load when ?ref=<code> is present. The only validation is shape;
 * the route handles attribution + dedup.
 */
export const affiliateClickSchema = z.object({
  referralCode: z
    .string()
    .transform(normalizeReferralCode)
    .refine(isValidReferralCodeShape, "invalid referral code shape"),
  appId: z.string().uuid(),
  deviceFingerprintHash: z.string().min(8).max(128).optional(),
  countryCode: z
    .string()
    .length(2)
    .transform((c) => c.toUpperCase())
    .optional(),
  surface: z.enum(["pdp", "search", "home", "external"]).optional(),
});

export type AffiliateClickInput = z.infer<typeof affiliateClickSchema>;
