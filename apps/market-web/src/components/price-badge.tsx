import { formatPrice } from "@openmarket/contracts/pricing";

interface PriceBadgeProps {
  price: {
    priceCents: number;
    currency: string;
    countryCode: string;
  } | null;
  refundWindowHours: number | null;
}

/**
 * Storefront price + refund-window affordance (P4-A start, P3-I).
 *
 * Renders nothing when the app is free (price === null). For paid
 * apps shows the localized price string + a small refund-window
 * note when the developer has configured one. Stripe Checkout
 * integration ships in a follow-up block; until then the price
 * is informational and the install button still routes through
 * the regular APK download flow.
 */
export function PriceBadge({ price, refundWindowHours }: PriceBadgeProps) {
  if (!price) return null;
  const formatted = formatPrice(price.priceCents, price.currency);
  return (
    <div className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-sm font-semibold text-emerald-800">
        {formatted}
        <span className="text-[10px] font-normal text-emerald-600 uppercase tracking-wider">
          {price.countryCode === "default" ? "global" : price.countryCode}
        </span>
      </span>
      {refundWindowHours && refundWindowHours > 0 ? (
        <span className="text-[10px] text-om-ink-soft">
          {refundWindowHours}h refund window
        </span>
      ) : null}
    </div>
  );
}
