import { z } from "zod";
import { pricingRowInputSchema } from "./pricing";

/**
 * In-app product contracts (P4-B).
 *
 * Three product kinds + per-product pricing rows that mirror the
 * app-level pricing model from P4-A. SKU is the developer-facing
 * identifier — ASCII, dot-separated, max 80 chars.
 */

export const IAP_PRODUCT_TYPES = [
  "consumable",
  "non_consumable",
  "subscription",
] as const;

export type IapProductType = (typeof IAP_PRODUCT_TYPES)[number];

export const SUBSCRIPTION_INTERVALS = ["day", "week", "month", "year"] as const;
export type SubscriptionInterval = (typeof SUBSCRIPTION_INTERVALS)[number];

const skuSchema = z
  .string()
  .min(3, "SKU must be at least 3 chars")
  .max(80, "SKU must be 80 chars or fewer")
  .regex(
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/,
    "SKU must be lowercase alphanumeric with dots/hyphens/underscores, no leading/trailing separators",
  );

export const iapProductInputSchema = z
  .object({
    sku: skuSchema,
    type: z.enum(IAP_PRODUCT_TYPES),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    /** Required when type === "subscription". */
    subscriptionInterval: z.enum(SUBSCRIPTION_INTERVALS).optional(),
    subscriptionIntervalCount: z.number().int().min(1).max(12).optional(),
    /** 0–30 days; null/0 means no free trial. */
    trialDays: z.number().int().min(0).max(30).optional(),
    active: z.boolean().default(true),
  })
  .refine(
    (v) =>
      v.type !== "subscription" ||
      (v.subscriptionInterval !== undefined),
    {
      message: "subscription products require subscriptionInterval",
      path: ["subscriptionInterval"],
    },
  )
  .refine(
    (v) =>
      v.type === "subscription" ||
      (v.subscriptionInterval === undefined && v.trialDays === undefined),
    {
      message:
        "subscriptionInterval / trialDays only valid for type=subscription",
      path: ["subscriptionInterval"],
    },
  );

export type IapProductInput = z.infer<typeof iapProductInputSchema>;

export const iapProductPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
  trialDays: z.number().int().min(0).max(30).nullable().optional(),
});

export const iapPricingPatchSchema = z.object({
  rows: z.array(pricingRowInputSchema).min(1).max(120),
});

export const iapPurchaseInputSchema = z.object({
  countryCode: z.string().length(2).optional(),
});

export type IapPurchaseInput = z.infer<typeof iapPurchaseInputSchema>;
