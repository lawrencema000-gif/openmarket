"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

interface Promotion {
  id: string;
  appId: string;
  developerId: string;
  bidCentsPerClick: number;
  dailyBudgetCents: number;
  currency: string;
  targetCountries: string[] | null;
  targetCategories: string[] | null;
  status: string;
  createdAt: string;
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}

export default function AdminPromotionsPage() {
  const [pending, setPending] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/promoted-listings/pending`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setPending(data.promotions ?? []);
    } catch {
      setError("Could not load the moderation queue. Are you signed in as an admin?");
    } finally {
      setLoading(false);
    }
  }

  async function decide(id: string, decision: "approve" | "reject") {
    let reason: string | null = null;
    if (decision === "reject") {
      reason = window.prompt(
        "Rejection reason (shown to the developer, min 4 chars):",
      );
      if (reason === null) return; // cancelled
      if (reason.trim().length < 4) {
        setError("Rejection reason must be at least 4 characters.");
        return;
      }
    }
    setBusy(id);
    setError(null);
    try {
      const body =
        decision === "approve"
          ? { decision: "approve" }
          : { decision: "reject", reason };
      const res = await fetch(
        `${API_URL}/api/admin/promoted-listings/${id}/decision`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Action failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Promoted listings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Editorial review queue. Approve only labeled, policy-compliant
          campaigns — promotions never bump established trust signals.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-slate-500">Nothing pending review. 🎉</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <p className="font-mono text-xs text-slate-400">app {p.appId}</p>
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">
                    {money(p.bidCentsPerClick, p.currency)}
                  </span>{" "}
                  / click ·{" "}
                  <span className="font-semibold">
                    {money(p.dailyBudgetCents, p.currency)}
                  </span>{" "}
                  / day
                </p>
                <p className="text-xs text-slate-400">
                  {p.targetCountries?.length
                    ? `Countries: ${p.targetCountries.join(", ")} · `
                    : ""}
                  {p.targetCategories?.length
                    ? `Categories: ${p.targetCategories.join(", ")}`
                    : "All surfaces"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => decide(p.id, "reject")}
                  disabled={busy === p.id}
                  className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => decide(p.id, "approve")}
                  disabled={busy === p.id}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy === p.id ? "…" : "Approve"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
