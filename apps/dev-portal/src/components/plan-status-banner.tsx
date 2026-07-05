"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface PlanStatus {
  plan: "free" | "paid";
  status: "free" | "approaching" | "over_grace" | "enforced" | "paid";
  usage: { apps: number; installs: number };
  limits: { maxApps: number; maxInstalls: number };
  over: { apps: boolean; installs: boolean };
  thresholdCrossedAt: string | null;
  graceEndsAt: string | null;
  enforced: boolean;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Free-tier usage banner (free-until-threshold model). Shows usage vs the
 * caps and, once a developer crosses one, the grace countdown → an
 * upgrade CTA → an "enforced" notice. Paid developers see a compact badge.
 */
export function PlanStatusBanner() {
  const [data, setData] = useState<PlanStatus | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<PlanStatus>("/api/developers/me/plan").then(setData).catch(() => {});
  }, []);

  async function upgrade() {
    setUpgrading(true);
    setErr(null);
    try {
      const { url } = await api.post<{ url: string }>(
        "/api/developers/me/plan/subscribe",
      );
      window.location.href = url;
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 503
          ? "Paid plans aren't enabled on this deployment yet."
          : e instanceof ApiError
            ? e.message
            : "Could not start checkout",
      );
      setUpgrading(false);
    }
  }

  if (!data) return null;

  if (data.status === "paid") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-emerald-800">Paid plan active</span>
        <span className="text-xs text-emerald-600">
          · Unlimited apps + installs · {data.usage.installs.toLocaleString()} installs
        </span>
      </div>
    );
  }

  const appsPct = pct(data.usage.apps, data.limits.maxApps);
  const installsPct = pct(data.usage.installs, data.limits.maxInstalls);
  const graceDays = daysUntil(data.graceEndsAt);

  const tone =
    data.status === "enforced"
      ? "border-rose-300 bg-rose-50"
      : data.status === "over_grace"
        ? "border-violet-300 bg-violet-50"
        : data.status === "approaching"
          ? "border-amber-300 bg-amber-50"
          : "border-om-line bg-om-surface";

  return (
    <div className={`rounded-2xl border ${tone} p-5`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-om-ink">
            {data.status === "enforced"
              ? "Free tier exceeded — publishing is paused"
              : data.status === "over_grace"
                ? "You've passed the free tier"
                : data.status === "approaching"
                  ? "Approaching the free-tier limit"
                  : "Free plan"}
          </p>
          <p className="text-xs text-om-ink-soft max-w-md">
            {data.status === "enforced"
              ? "Your existing apps keep running, but new apps and releases are paused until you upgrade. Upgrade to a flat monthly plan (plus the standard revenue share) to resume."
              : data.status === "over_grace"
                ? graceDays !== null
                  ? `Grace period: ${graceDays} day${graceDays === 1 ? "" : "s"} left before new apps/releases require the paid plan.`
                  : "Upgrade to keep publishing without interruption."
                : data.status === "approaching"
                  ? "Publish and grow for free up to the limits below."
                  : "Publish and grow for free up to the limits below."}
          </p>
        </div>
        {(data.status === "over_grace" || data.status === "enforced") && (
          <button
            onClick={upgrade}
            disabled={upgrading}
            className="shrink-0 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-2 disabled:opacity-60"
          >
            {upgrading ? "…" : "Upgrade"}
          </button>
        )}
      </div>

      {err && <p className="text-xs text-rose-600 mb-2">{err}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UsageBar label="Apps" used={data.usage.apps} max={data.limits.maxApps} percent={appsPct} over={data.over.apps} />
        <UsageBar label="Installs" used={data.usage.installs} max={data.limits.maxInstalls} percent={installsPct} over={data.over.installs} />
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  max,
  percent,
  over,
}: {
  label: string;
  used: number;
  max: number;
  percent: number;
  over: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-om-ink-mute">{label}</span>
        <span className={over ? "text-violet-700 font-semibold" : "text-om-ink-soft"}>
          {used.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-om-line-soft overflow-hidden">
        <div
          className={`h-full rounded-full ${
            over ? "bg-violet-500" : percent >= 80 ? "bg-amber-400" : "bg-emerald-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
