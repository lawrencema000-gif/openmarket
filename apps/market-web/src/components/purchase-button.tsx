"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { formatPrice } from "@openmarket/contracts/pricing";
import { useSession } from "@/lib/auth-client";

interface PurchaseButtonProps {
  appId: string;
  price: {
    priceCents: number;
    currency: string;
    countryCode: string;
  };
}

interface PurchaseResponse {
  purchase: { id: string };
  checkout: { url: string } | null;
  note?: string;
}

/**
 * Storefront "Buy" affordance (P4-A-2).
 *
 * Behavior:
 *   - signed-out viewer → sign-in link with `next=` set
 *   - signed-in viewer + Stripe live → button POSTs /apps/:id/purchase
 *     and redirects to `checkout.url`
 *   - signed-in viewer + Stripe Noop → button shows the "Stripe not
 *     configured" note returned by the API; future block ships the
 *     real flow without touching the storefront
 *
 * The PriceBadge above already renders the formatted amount; this
 * component is purely the action.
 */
export function PurchaseButton({ appId, price }: PurchaseButtonProps) {
  const { data: session, isPending } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isPending) return null;

  if (!session) {
    return (
      <Link
        href={`/sign-in?next=/apps/${appId}`}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
      >
        Sign in to buy · {formatPrice(price.priceCents, price.currency)}
      </Link>
    );
  }

  async function buy() {
    setSubmitting(true);
    setError(null);
    setNote(null);
    try {
      const r = await apiFetch<PurchaseResponse>(
        `/api/apps/${appId}/purchase`,
        {
          method: "POST",
          body: JSON.stringify({ countryCode: price.countryCode === "default" ? undefined : price.countryCode }),
        },
      );
      if (r.checkout?.url) {
        window.location.href = r.checkout.url;
        return;
      }
      setNote(
        r.note ??
          "Purchase recorded as pending. Stripe Checkout is not configured on this deploy yet.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Purchase failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void buy()}
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-1"
      >
        {submitting
          ? "Redirecting…"
          : `Buy · ${formatPrice(price.priceCents, price.currency)}`}
      </button>
      {note ? <p className="text-[11px] text-amber-700 max-w-xs">{note}</p> : null}
      {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}
