import { z } from "zod";

/**
 * Promoted listings (P4-G).
 *
 * Strict editorial constraints baked into the API surface:
 *  - Promotions never bypass moderation. The storefront query joins
 *    `apps.isDelisted=false` + `apps.reviewFreeze=false`.
 *  - Sponsored cards MUST be labeled at render time. The storefront
 *    contract here only carries the data; the badge is a UI rule.
 *  - Daily budget hard-caps spend. CPC v1; auction logic ships later.
 */

export const PROMOTION_STATUSES = [
  "draft",
  "pending_review",
  "active",
  "paused_budget",
  "paused_policy",
  "ended",
] as const;

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

const ISO_COUNTRY = /^[A-Z]{2}$/;
const SLUG = /^[a-z0-9-]+$/;

export const promotedListingInputSchema = z
  .object({
    appId: z.string().uuid(),
    bidCentsPerClick: z.number().int().min(1).max(50_00),
    dailyBudgetCents: z.number().int().min(100).max(10_000_00),
    currency: z
      .string()
      .length(3)
      .transform((c) => c.toLowerCase()),
    targetCountries: z
      .array(z.string().regex(ISO_COUNTRY, "expected ISO-3166 alpha-2"))
      .max(50)
      .optional(),
    targetCategories: z
      .array(z.string().regex(SLUG, "expected slug"))
      .max(20)
      .optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
  })
  .refine(
    (v) =>
      !v.startAt || !v.endAt || new Date(v.endAt) > new Date(v.startAt),
    { message: "endAt must be after startAt", path: ["endAt"] },
  )
  .refine(
    // Crude sanity: daily budget must allow at least one click.
    (v) => v.dailyBudgetCents >= v.bidCentsPerClick,
    { message: "dailyBudgetCents must be >= bidCentsPerClick", path: ["dailyBudgetCents"] },
  );

export type PromotedListingInput = z.infer<typeof promotedListingInputSchema>;

export const promotedListingPatchSchema = z
  .object({
    bidCentsPerClick: z.number().int().min(1).max(50_00).optional(),
    dailyBudgetCents: z.number().int().min(100).max(10_000_00).optional(),
    targetCountries: z
      .array(z.string().regex(ISO_COUNTRY))
      .max(50)
      .nullable()
      .optional(),
    targetCategories: z
      .array(z.string().regex(SLUG))
      .max(20)
      .nullable()
      .optional(),
    startAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "patch must include at least one field",
  });

export type PromotedListingPatch = z.infer<typeof promotedListingPatchSchema>;

/**
 * Admin moderation surface — approve or reject a pending promotion.
 * Rejection requires a reason so the developer sees something useful
 * in their dev-portal queue.
 */
export const promotedListingModerationSchema = z.discriminatedUnion(
  "decision",
  [
    z.object({ decision: z.literal("approve") }),
    z.object({
      decision: z.literal("reject"),
      reason: z.string().min(4).max(500),
    }),
  ],
);

export type PromotedListingModeration = z.infer<
  typeof promotedListingModerationSchema
>;

export const promotedImpressionSchema = z.object({
  promotionId: z.string().uuid(),
  surface: z.enum(["home", "category", "search"]),
});

export type PromotedImpression = z.infer<typeof promotedImpressionSchema>;

export const promotedClickSchema = z.object({
  promotionId: z.string().uuid(),
  surface: z.enum(["home", "category", "search"]),
});

export type PromotedClick = z.infer<typeof promotedClickSchema>;
