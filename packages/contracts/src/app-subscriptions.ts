import { z } from "zod";
import { SUBSCRIPTION_INTERVALS } from "./iap";

/**
 * App-level subscription contracts (P4-C).
 *
 * The whole app requires an active subscription to install. Distinct
 * from per-IAP subscriptions which add capability to an otherwise
 * free or one-time-paid app. Reuses the SUBSCRIPTION_INTERVALS const
 * from `./iap` so the lookup tables stay in lockstep.
 */

/**
 * Patch shape for the app subscription mode. The dev-portal pricing
 * page sends this alongside the regular per-country pricing rows
 * (or independently to flip mode without touching prices).
 */
export const appSubscriptionPatchSchema = z
  .object({
    enabled: z.boolean(),
    interval: z.enum(SUBSCRIPTION_INTERVALS).optional(),
    intervalCount: z.number().int().min(1).max(12).optional(),
    trialDays: z.number().int().min(0).max(30).nullable().optional(),
  })
  .refine(
    (v) => !v.enabled || v.interval !== undefined,
    {
      message: "enabling subscription requires an interval",
      path: ["interval"],
    },
  );

export type AppSubscriptionPatch = z.infer<typeof appSubscriptionPatchSchema>;

/**
 * Receipt verification — devs call this from their app to confirm a
 * user has an active subscription before unlocking features. Lookup
 * keyed by appId + userId; the server reads app_subscriptions and
 * returns the active row if any.
 */
export const receiptVerifySchema = z.object({
  userId: z.string().uuid(),
});

export type ReceiptVerifyInput = z.infer<typeof receiptVerifySchema>;

export const receiptVerifyResponseSchema = z.object({
  appId: z.string().uuid(),
  userId: z.string().uuid(),
  active: z.boolean(),
  status: z
    .enum([
      "trialing",
      "active",
      "past_due",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "unpaid",
      "paused",
    ])
    .nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
});

export type ReceiptVerifyResponse = z.infer<typeof receiptVerifyResponseSchema>;
