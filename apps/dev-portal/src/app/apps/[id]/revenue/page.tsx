"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { formatPrice } from "@openmarket/contracts/pricing";

interface CurrencyTotal {
  currency: string;
  grossCents: number;
  refundedCents: number;
  netCents: number;
  completedCount: number;
  refundedCount: number;
}

interface ProductRow {
  source: "app" | "iap";
  productId: string | null;
  productName: string | null;
  currency: string;
  grossCents: number;
  refundedCents: number;
  netCents: number;
  completedCount: number;
  refundedCount: number;
}

interface DailyRow {
  day: string;
  currency: string;
  netCents: number;
  completedCount: number;
}

interface RevenueResponse {
  appId: string;
  from: string;
  to: string;
  byCurrency: CurrencyTotal[];
  byProduct: ProductRow[];
  daily: DailyRow[];
}

const RANGE_PRESETS: Array<{ label: string; days: number }> = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default function RevenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, days]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const qs = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const r = await api.get<RevenueResponse>(
        `/api/apps/${appId}/revenue?${qs.toString()}`,
      );
      setData(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // Group daily series by currency so we render one chart per currency.
  const dailyByCurrency = useMemo(() => {
    if (!data) return new Map<string, DailyRow[]>();
    const map = new Map<string, DailyRow[]>();
    for (const row of data.daily) {
      const bucket = map.get(row.currency) ?? [];
      bucket.push(row);
      map.set(row.currency, bucket);
    }
    return map;
  }, [data]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href={`/apps/${appId}`}
          className="text-xs text-blue-600 hover:underline"
        >
          ← Back to app
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Revenue</h1>
        <p className="text-sm text-gray-500 mt-1">
          Completed minus refunded — both app sales and in-app product
          purchases. Per-currency rollups; we don't FX-convert because
          per-country pricing means buyers pay in their local currency.
        </p>
      </div>

      <div className="flex gap-2">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setDays(p.days)}
            className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
              days === p.days
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : !data ? null : data.byCurrency.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm text-gray-600">
            No revenue in this window. Once buyers complete a checkout,
            their purchases land here.
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.byCurrency.map((c) => (
              <div
                key={c.currency}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Net · {c.currency}
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatPrice(c.netCents, c.currency)}
                </p>
                <p className="text-[11px] text-gray-500 mt-2">
                  Gross {formatPrice(c.grossCents, c.currency)} · refunded{" "}
                  {formatPrice(c.refundedCents, c.currency)}
                </p>
                <p className="text-[11px] text-gray-500">
                  {c.completedCount.toLocaleString()} completed ·{" "}
                  {c.refundedCount.toLocaleString()} refunded
                </p>
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Daily net revenue
            </h2>
            {Array.from(dailyByCurrency.entries()).map(([currency, rows]) => (
              <DailyChart key={currency} currency={currency} rows={rows} />
            ))}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">
              Per-product breakdown
            </h2>
            <table className="w-full text-xs">
              <thead className="text-gray-500 text-left">
                <tr>
                  <th className="py-1 font-medium">Product</th>
                  <th className="py-1 font-medium">Currency</th>
                  <th className="py-1 font-medium text-right">Net</th>
                  <th className="py-1 font-medium text-right">Completed</th>
                  <th className="py-1 font-medium text-right">Refunded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.byProduct.map((p, i) => (
                  <tr key={i}>
                    <td className="py-1.5">
                      {p.source === "app" ? (
                        <span className="text-gray-700">App download</span>
                      ) : (
                        <span className="text-gray-700">
                          {p.productName ?? "Unknown product"}
                          <span className="ml-1 text-[9px] uppercase font-semibold text-emerald-700">
                            iap
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 font-mono">{p.currency}</td>
                    <td className="py-1.5 text-right">
                      {formatPrice(p.netCents, p.currency)}
                    </td>
                    <td className="py-1.5 text-right">
                      {p.completedCount.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right text-gray-500">
                      {p.refundedCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function DailyChart({ currency, rows }: { currency: string; rows: DailyRow[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.netCents)), 1);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-700 mb-2">{currency}</p>
      <div className="flex items-end gap-0.5 h-32">
        {rows.map((r) => {
          const heightPct = (Math.abs(r.netCents) / max) * 100;
          const positive = r.netCents >= 0;
          return (
            <div
              key={r.day}
              className="flex-1 flex items-end"
              title={`${r.day} · ${formatPrice(r.netCents, currency)} · ${r.completedCount} completed`}
            >
              <div
                className={`w-full rounded-sm ${positive ? "bg-emerald-500" : "bg-red-400"}`}
                style={{ height: `${Math.max(2, heightPct)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>{rows[0]?.day}</span>
        <span>{rows[rows.length - 1]?.day}</span>
      </div>
    </div>
  );
}
