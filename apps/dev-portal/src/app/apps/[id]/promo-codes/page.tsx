"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface PromoCode {
  id: string;
  code: string;
  label: string | null;
  grantsBeta: boolean;
  grantsPreRegistration: boolean;
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface ListResponse {
  appId: string;
  codes: PromoCode[];
}

const STOREFRONT_URL =
  process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3000";

/**
 * Promo-code management for one app (P3-C).
 *
 * Codes are server-generated; the dev picks effects (beta /
 * pre-registration) + optional limits. Revoke is soft so the audit
 * trail survives.
 */
export default function PromoCodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New-code form
  const [label, setLabel] = useState("");
  const [grantsBeta, setGrantsBeta] = useState(false);
  const [grantsPreRegistration, setGrantsPreRegistration] = useState(false);
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [creating, setCreating] = useState(false);
  const [copyHint, setCopyHint] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<ListResponse>(`/api/apps/${appId}/promo-codes`);
      setCodes(r.codes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function createCode() {
    setCreating(true);
    setError(null);
    try {
      await api.post(`/api/apps/${appId}/promo-codes`, {
        label: label.trim() || undefined,
        grantsBeta,
        grantsPreRegistration,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
      });
      setLabel("");
      setGrantsBeta(false);
      setGrantsPreRegistration(false);
      setMaxRedemptions("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this code? Pending redemptions will fail.")) return;
    setError(null);
    try {
      await api.delete(`/api/apps/${appId}/promo-codes/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Revoke failed");
    }
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint({ id, text: "Copied!" });
      setTimeout(() => setCopyHint(null), 2000);
    } catch {
      setCopyHint({ id, text: "Copy failed" });
      setTimeout(() => setCopyHint(null), 3000);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href={`/apps/${appId}`}
          className="text-xs text-blue-600 hover:underline"
        >
          ← Back to app
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Promo codes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Issue codes that grant beta access or pre-registration to launch
          partners. Each code is single-use per user; revoking kills future
          redemptions but keeps the audit log.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Create a code</h2>
        <input
          type="text"
          placeholder='Label — e.g. "Launch partners 2026"'
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="block w-full rounded-md border-gray-300 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={grantsBeta}
              onChange={(e) => setGrantsBeta(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Grants beta access
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={grantsPreRegistration}
              onChange={(e) => setGrantsPreRegistration(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Grants pre-registration
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">
            Max redemptions
          </span>
          <input
            type="number"
            min={1}
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
            placeholder="(leave blank for unlimited)"
            className="mt-1 block w-full rounded-md border-gray-300 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void createCode()}
          disabled={creating}
          className="rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
        >
          {creating ? "Creating…" : "Generate code"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          {loading
            ? "Loading…"
            : codes.length === 0
              ? "No codes yet"
              : `Codes (${codes.length})`}
        </h2>
        {codes.map((c) => {
          const redeemUrl = `${STOREFRONT_URL}/redeem?code=${c.code}`;
          const isActive = !c.revokedAt;
          return (
            <div
              key={c.id}
              className={`rounded-xl border bg-white p-4 space-y-2 ${isActive ? "border-gray-200" : "border-gray-200 opacity-60"}`}
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <code className="text-base font-mono font-semibold tracking-widest text-gray-900">
                  {c.code}
                </code>
                {isActive ? (
                  <button
                    type="button"
                    onClick={() => void revoke(c.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Revoke
                  </button>
                ) : (
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    revoked
                  </span>
                )}
              </div>
              {c.label ? (
                <p className="text-xs text-gray-600">{c.label}</p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {c.grantsBeta && (
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                    beta
                  </span>
                )}
                {c.grantsPreRegistration && (
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    pre-reg
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500">
                {c.redeemedCount.toLocaleString()} redemption
                {c.redeemedCount === 1 ? "" : "s"}
                {c.maxRedemptions != null
                  ? ` of ${c.maxRedemptions.toLocaleString()}`
                  : " (unlimited)"}
                {c.expiresAt
                  ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`
                  : ""}
              </p>
              {isActive && (
                <div className="flex items-center gap-2 rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs">
                  <code className="flex-1 truncate font-mono text-gray-700">
                    {redeemUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copy(c.id, redeemUrl)}
                    className="text-blue-600 hover:underline shrink-0"
                  >
                    {copyHint?.id === c.id ? copyHint.text : "Copy"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
