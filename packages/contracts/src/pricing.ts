import { z } from "zod";

/**
 * Paid-apps pricing + refund eligibility contracts (P4-A start, P3-I).
 *
 * Pricing model:
 *   - per-app, per-country rows
 *   - resolution: exact country match → "default" → no price (free)
 *   - priceCents is the ISO 4217 minor-unit amount; currency is the
 *     ISO 4217 code. We store currency per-row (not per-app) so a dev
 *     can price natively in each region.
 *
 * The Stripe wire-up is deferred; these schemas validate the
 * developer-facing inputs + the user-facing purchase + refund flows.
 */

const ISO_CURRENCY = z
  .string()
  .length(3, "Currency must be a 3-letter ISO 4217 code (e.g. USD, EUR)")
  .regex(/^[A-Z]{3}$/, "Currency code must be uppercase letters");

const COUNTRY_CODE = z
  .string()
  .min(2)
  .max(8)
  .regex(/^([A-Z]{2}|default)$/, "Country code must be ISO alpha-2 or 'default'");

export const pricingRowInputSchema = z.object({
  countryCode: COUNTRY_CODE,
  priceCents: z.number().int().min(0).max(1_000_000_00),
  currency: ISO_CURRENCY,
  active: z.boolean().default(true),
});

export type PricingRowInput = z.infer<typeof pricingRowInputSchema>;

export const pricingPatchSchema = z.object({
  rows: z.array(pricingRowInputSchema).min(1).max(120),
  /** Hours buyers can self-refund. null = manual review; 0 = refunds off. */
  refundWindowHours: z.number().int().min(0).max(24 * 30).nullable().optional(),
});

export type PricingPatchInput = z.infer<typeof pricingPatchSchema>;

/**
 * Resolve the price a particular caller should see.
 *
 *   1. Exact country match (active row only) wins.
 *   2. Otherwise the "default" row wins.
 *   3. Otherwise → null (app is free).
 *
 * Pure — no I/O. The route runs the DB query and hands the rows
 * here. Tests can exercise the resolver directly.
 */
export interface PricingRow {
  countryCode: string;
  priceCents: number;
  currency: string;
  active: boolean;
}

export interface ResolvedPrice {
  priceCents: number;
  currency: string;
  countryCode: string;
}

export function resolvePriceForCountry(
  rows: PricingRow[],
  countryCode: string | null | undefined,
): ResolvedPrice | null {
  const active = rows.filter((r) => r.active);
  if (countryCode) {
    const norm = countryCode.toUpperCase();
    const exact = active.find((r) => r.countryCode === norm);
    if (exact) {
      return {
        priceCents: exact.priceCents,
        currency: exact.currency,
        countryCode: exact.countryCode,
      };
    }
  }
  const fallback = active.find((r) => r.countryCode === "default");
  if (fallback) {
    return {
      priceCents: fallback.priceCents,
      currency: fallback.currency,
      countryCode: fallback.countryCode,
    };
  }
  return null;
}

/**
 * Format a minor-unit amount for display. Defers to Intl when
 * available so locale rules (decimal separator, currency symbol
 * position, JPY no-decimals) come for free.
 *
 * Falls back to a manual format on Intl misses so the helper works
 * in non-browser environments without crashing.
 */
export function formatPrice(
  priceCents: number,
  currency: string,
  locale = "en-US",
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(priceCents / 100);
  } catch {
    return `${currency} ${(priceCents / 100).toFixed(2)}`;
  }
}

/**
 * Purchase request body. Storefront will eventually wire this to
 * Stripe Checkout; the v1 stub records a `pending` purchase row.
 */
export const purchaseInputSchema = z.object({
  /** ISO alpha-2 country at checkout time. Lets the server resolve the price the buyer actually saw. */
  countryCode: z.string().length(2).optional(),
});

export type PurchaseInput = z.infer<typeof purchaseInputSchema>;

/**
 * Refund eligibility (P3-I).
 *
 * A purchase is auto-refund-eligible when ALL of:
 *   - status is "completed" (we don't refund pending or already-failed)
 *   - app has a non-null refundWindowHours
 *   - refundWindowHours > 0 (zero means refunds are off)
 *   - (now - purchasedAt) < refundWindowHours
 *
 * Outside the window, a refund request goes to manual review (a
 * future endpoint) rather than auto-approving.
 */
export interface RefundEligibilityInput {
  status: "pending" | "completed" | "refunded" | "failed";
  purchasedAt: Date;
  refundWindowHours: number | null;
  now?: Date;
}

export interface RefundEligibility {
  eligible: boolean;
  reason:
    | "auto-eligible"
    | "not-completed"
    | "already-refunded"
    | "refunds-disabled"
    | "no-refund-policy"
    | "window-expired";
  windowExpiresAt: Date | null;
}

export function computeRefundEligibility(
  input: RefundEligibilityInput,
): RefundEligibility {
  const now = input.now ?? new Date();
  if (input.status === "refunded") {
    return { eligible: false, reason: "already-refunded", windowExpiresAt: null };
  }
  if (input.status !== "completed") {
    return { eligible: false, reason: "not-completed", windowExpiresAt: null };
  }
  if (input.refundWindowHours == null) {
    return { eligible: false, reason: "no-refund-policy", windowExpiresAt: null };
  }
  if (input.refundWindowHours <= 0) {
    return { eligible: false, reason: "refunds-disabled", windowExpiresAt: null };
  }
  const expiresAt = new Date(
    input.purchasedAt.getTime() + input.refundWindowHours * 60 * 60 * 1000,
  );
  if (now > expiresAt) {
    return { eligible: false, reason: "window-expired", windowExpiresAt: expiresAt };
  }
  return { eligible: true, reason: "auto-eligible", windowExpiresAt: expiresAt };
}

export const refundRequestSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});
