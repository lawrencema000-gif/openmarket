"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface PricingRow {
  countryCode: string;
  priceCents: number;
  currency: string;
  active: boolean;
}

interface PricingResponse {
  appId: string;
  isPaid: boolean;
  price: PricingRow | null;
  refundWindowHours: number | null;
  rows: PricingRow[];
}

interface EditableRow {
  countryCode: string;
  priceMajor: string; // user-facing — major units (e.g. "9.99")
  currency: string;
  active: boolean;
}

const COMMON_COUNTRIES = [
  { code: "default", label: "Default (all other countries)" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "BR", label: "Brazil" },
  { code: "JP", label: "Japan" },
  { code: "IN", label: "India" },
  { code: "MX", label: "Mexico" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
];

const COMMON_CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "BRL", "INR", "MXN", "CAD", "AUD",
];

function rowToEditable(r: PricingRow): EditableRow {
  return {
    countryCode: r.countryCode,
    priceMajor: (r.priceCents / 100).toFixed(2),
    currency: r.currency,
    active: r.active,
  };
}

function emptyRow(): EditableRow {
  return {
    countryCode: "default",
    priceMajor: "0.99",
    currency: "USD",
    active: true,
  };
}

export default function PricingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [refundWindow, setRefundWindow] = useState<string>("");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<PricingResponse>(`/api/apps/${appId}/pricing`);
      setRows(r.rows.length > 0 ? r.rows.map(rowToEditable) : [emptyRow()]);
      setRefundWindow(
        r.refundWindowHours == null ? "" : String(r.refundWindowHours),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(i: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { ...emptyRow(), countryCode: "" },
    ]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, j) => j !== i));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Convert major → minor units before send.
      const parsedRows = rows
        .filter((r) => r.countryCode.trim().length > 0)
        .map((r) => {
          const major = Number(r.priceMajor);
          if (!Number.isFinite(major) || major < 0) {
            throw new Error(`Invalid price for ${r.countryCode}`);
          }
          return {
            countryCode: r.countryCode.toUpperCase() === "DEFAULT"
              ? "default"
              : r.countryCode.toUpperCase(),
            priceCents: Math.round(major * 100),
            currency: r.currency.toUpperCase(),
            active: r.active,
          };
        });
      if (parsedRows.length === 0) {
        throw new Error("At least one row required");
      }
      await api.patch(`/api/apps/${appId}/pricing`, {
        rows: parsedRows,
        refundWindowHours:
          refundWindow.trim() === "" ? null : Number(refundWindow),
      });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save failed",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href={`/apps/${appId}`}
          className="text-xs text-blue-600 hover:underline"
        >
          ← Back to app
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Pricing</h1>
        <p className="text-sm text-gray-500 mt-1">
          Set per-country prices. Use <code className="text-xs bg-gray-100 px-1 rounded">default</code>{" "}
          as a fallback for unlisted countries. Leaving this empty makes the
          app free. Stripe Checkout integration ships in a follow-up — until
          then prices are informational only.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Pricing rows</h2>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_120px_100px_80px_auto] gap-2 items-center"
            >
              <select
                value={r.countryCode}
                onChange={(e) => updateRow(i, { countryCode: e.target.value })}
                className="rounded-md border-gray-300 text-sm"
              >
                {COMMON_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({c.code})
                  </option>
                ))}
                <option value={r.countryCode}>{r.countryCode}</option>
              </select>
              <input
                type="number"
                step="0.01"
                min={0}
                value={r.priceMajor}
                onChange={(e) => updateRow(i, { priceMajor: e.target.value })}
                placeholder="9.99"
                className="rounded-md border-gray-300 text-sm font-mono"
              />
              <select
                value={r.currency}
                onChange={(e) => updateRow(i, { currency: e.target.value })}
                className="rounded-md border-gray-300 text-sm"
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={r.active}
                  onChange={(e) => updateRow(i, { active: e.target.checked })}
                />
                active
              </label>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="text-xs text-blue-600 hover:underline"
        >
          + Add country
        </button>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Refund window
        </h2>
        <p className="text-xs text-gray-500">
          Hours after purchase during which a buyer can self-refund. Leave
          blank for manual review; set <code>0</code> to disable auto-
          refunds entirely. Common values: 2 (Play Store), 24 (generous),
          48 (Steam).
        </p>
        <input
          type="number"
          min={0}
          max={24 * 30}
          value={refundWindow}
          onChange={(e) => setRefundWindow(e.target.value)}
          placeholder="leave blank for manual review"
          className="block w-32 rounded-md border-gray-300 text-sm font-mono"
        />
      </section>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
      >
        {saving ? "Saving…" : "Save pricing"}
      </button>
    </div>
  );
}
