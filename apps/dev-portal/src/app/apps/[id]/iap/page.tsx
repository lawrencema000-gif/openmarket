"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface IapProduct {
  id: string;
  sku: string;
  type: "consumable" | "non_consumable" | "subscription";
  name: string;
  description: string | null;
  subscriptionInterval: "day" | "week" | "month" | "year" | null;
  subscriptionIntervalCount: number | null;
  trialDays: number | null;
  active: boolean;
  price: {
    priceCents: number;
    currency: string;
    countryCode: string;
  } | null;
}

interface ListResponse {
  appId: string;
  products: IapProduct[];
}

interface DraftProduct {
  sku: string;
  type: "consumable" | "non_consumable" | "subscription";
  name: string;
  description: string;
  subscriptionInterval: "month" | "year" | "week" | "day";
  subscriptionIntervalCount: string;
  trialDays: string;
}

const EMPTY_DRAFT: DraftProduct = {
  sku: "",
  type: "consumable",
  name: "",
  description: "",
  subscriptionInterval: "month",
  subscriptionIntervalCount: "1",
  trialDays: "0",
};

export default function IapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [products, setProducts] = useState<IapProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftProduct>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<ListResponse>(`/api/apps/${appId}/iap-products`);
      setProducts(r.products);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    setError(null);
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        sku: draft.sku.trim(),
        type: draft.type,
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
      };
      if (draft.type === "subscription") {
        payload.subscriptionInterval = draft.subscriptionInterval;
        payload.subscriptionIntervalCount = Number(draft.subscriptionIntervalCount) || 1;
        if (Number(draft.trialDays) > 0) {
          payload.trialDays = Number(draft.trialDays);
        }
      }
      await api.post(`/api/apps/${appId}/iap-products`, payload);
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this product? Existing purchases remain valid.")) return;
    setError(null);
    try {
      await api.delete(`/api/apps/${appId}/iap-products/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href={`/apps/${appId}`}
          className="text-xs text-om-primary hover:underline"
        >
          ← Back to app
        </Link>
        <h1 className="text-2xl font-bold text-om-ink mt-2">In-app products</h1>
        <p className="text-sm text-om-ink-soft mt-1">
          Consumables (repurchasable), one-time unlocks, and subscriptions.
          Per-country pricing per product lives on its own page (open a
          product to manage prices).
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="bg-om-surface rounded-xl border border-om-line p-5 space-y-3">
        <h2 className="text-sm font-semibold text-om-ink-mute">Create product</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-om-ink-mute">SKU</span>
            <input
              type="text"
              value={draft.sku}
              onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
              placeholder="com.example.app.coins.100"
              className="mt-1 block w-full rounded-md border-om-line text-sm font-mono"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-om-ink-mute">Type</span>
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  type: e.target.value as DraftProduct["type"],
                }))
              }
              className="mt-1 block w-full rounded-md border-om-line text-sm"
            >
              <option value="consumable">Consumable</option>
              <option value="non_consumable">Non-consumable (one-time)</option>
              <option value="subscription">Subscription</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-om-ink-mute">Name</span>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="100 coins"
            className="mt-1 block w-full rounded-md border-om-line text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-om-ink-mute">Description</span>
          <textarea
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            rows={2}
            className="mt-1 block w-full rounded-md border-om-line text-sm"
          />
        </label>
        {draft.type === "subscription" && (
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-om-ink-mute">Interval</span>
              <select
                value={draft.subscriptionInterval}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    subscriptionInterval: e.target.value as DraftProduct["subscriptionInterval"],
                  }))
                }
                className="mt-1 block w-full rounded-md border-om-line text-sm"
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-om-ink-mute">Every</span>
              <input
                type="number"
                min={1}
                max={12}
                value={draft.subscriptionIntervalCount}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    subscriptionIntervalCount: e.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border-om-line text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-om-ink-mute">Trial (days)</span>
              <input
                type="number"
                min={0}
                max={30}
                value={draft.trialDays}
                onChange={(e) => setDraft((d) => ({ ...d, trialDays: e.target.value }))}
                className="mt-1 block w-full rounded-md border-om-line text-sm"
              />
            </label>
          </div>
        )}
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating || !draft.sku || !draft.name}
          className="rounded-md bg-om-primary hover:bg-om-primary-deep disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
        >
          {creating ? "Creating…" : "Create product"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-om-ink-mute">
          {loading
            ? "Loading…"
            : products.length === 0
              ? "No products yet"
              : `Products (${products.length})`}
        </h2>
        {products.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl border bg-om-surface p-4 space-y-2 ${p.active ? "border-om-line" : "border-om-line opacity-60"}`}
          >
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-om-ink">{p.name}</p>
                <p className="text-xs text-om-ink-soft font-mono mt-0.5">{p.sku}</p>
              </div>
              <span className="text-[10px] uppercase font-semibold text-om-ink-soft tracking-wider">
                {p.type === "non_consumable"
                  ? "one-time"
                  : p.type === "subscription"
                    ? `${p.subscriptionIntervalCount ?? 1} ${p.subscriptionInterval}`
                    : "consumable"}
              </span>
            </div>
            {p.description ? (
              <p className="text-xs text-om-ink-mute">{p.description}</p>
            ) : null}
            <p className="text-[11px] text-om-ink-soft">
              {p.price
                ? `${(p.price.priceCents / 100).toFixed(2)} ${p.price.currency} (${p.price.countryCode})`
                : "No pricing rows yet"}
            </p>
            {p.active && (
              <button
                type="button"
                onClick={() => void deactivate(p.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Deactivate
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
