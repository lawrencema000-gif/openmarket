"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { formatPrice } from "@openmarket/contracts/pricing";
import { useSession } from "@/lib/auth-client";

interface IapProduct {
  id: string;
  sku: string;
  type: "consumable" | "non_consumable" | "subscription";
  name: string;
  description: string | null;
  subscriptionInterval: "day" | "week" | "month" | "year" | null;
  subscriptionIntervalCount: number | null;
  trialDays: number | null;
  price: {
    priceCents: number;
    currency: string;
    countryCode: string;
  } | null;
}

interface IapResponse {
  appId: string;
  products: IapProduct[];
}

interface PurchaseResponse {
  purchase: { id: string };
  checkout: { url: string } | null;
  note?: string;
}

/**
 * Storefront in-app products rail (P4-B).
 *
 * Renders nothing when an app has no active IAP products. Each
 * product card carries a per-region price + buy button. Subscriptions
 * additionally show interval + trial-day hints. The buy button
 * routes through Stripe Checkout when the adapter is live; otherwise
 * surfaces the API's note inline (same UX pattern as PurchaseButton).
 */
export function IapRail({ appId }: { appId: string }) {
  const [products, setProducts] = useState<IapProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<IapResponse>(`/api/apps/${appId}/iap-products`)
      .then((r) => setProducts(r.products))
      .catch(() => setProducts([]));
  }, [appId]);

  if (!products || products.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
      <header>
        <h2 className="text-sm font-semibold text-gray-900">
          In-app purchases
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Optional add-ons sold by the developer. Per-country pricing
          shown in your local currency when available.
        </p>
      </header>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
      <ul className="divide-y divide-gray-100">
        {products.map((p) => (
          <ProductRow
            key={p.id}
            product={p}
            onError={(m) => setError(m)}
          />
        ))}
      </ul>
    </section>
  );
}

function ProductRow({
  product,
  onError,
}: {
  product: IapProduct;
  onError: (m: string) => void;
}) {
  const { data: session, isPending } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function buy() {
    setSubmitting(true);
    setNote(null);
    try {
      const r = await apiFetch<PurchaseResponse>(
        `/api/iap-products/${product.id}/purchase`,
        {
          method: "POST",
          body: JSON.stringify({
            countryCode:
              product.price?.countryCode &&
              product.price.countryCode !== "default"
                ? product.price.countryCode
                : undefined,
          }),
        },
      );
      if (r.checkout?.url) {
        window.location.href = r.checkout.url;
        return;
      }
      setNote(r.note ?? "Purchase recorded. Stripe Checkout not configured yet.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Purchase failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-900">{product.name}</p>
          <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">
            {product.type === "non_consumable"
              ? "one-time"
              : product.type === "subscription"
                ? `${product.subscriptionIntervalCount ?? 1} ${product.subscriptionInterval ?? ""}`
                : "consumable"}
          </span>
          {product.trialDays && product.trialDays > 0 ? (
            <span className="text-[10px] font-semibold text-emerald-700">
              {product.trialDays}d trial
            </span>
          ) : null}
        </div>
        {product.description ? (
          <p className="text-xs text-gray-600 mt-0.5">{product.description}</p>
        ) : null}
        {note ? (
          <p className="text-[11px] text-amber-700 mt-1">{note}</p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {product.price ? (
          <span className="text-sm font-semibold text-gray-900">
            {formatPrice(product.price.priceCents, product.price.currency)}
          </span>
        ) : (
          <span className="text-xs italic text-gray-400">Not in your region</span>
        )}
        {product.price ? (
          isPending ? null : !session ? (
            <Link
              href={`/sign-in?next=/apps/${product.id}`}
              className="text-xs text-blue-600 hover:underline"
            >
              Sign in to buy
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void buy()}
              disabled={submitting}
              className="text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-3 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-1"
            >
              {submitting ? "…" : "Buy"}
            </button>
          )
        ) : null}
      </div>
    </li>
  );
}
