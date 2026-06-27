"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface PlanStatus {
  plan: "free";
  status: "free" | "approaching" | "over";
  usage: { apps: number; installs: number };
  limits: { maxApps: number; maxInstalls: number };
  over: { apps: boolean; installs: boolean };
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0;
}

/**
 * Free-tier usage banner (free-until-threshold model). Shows the
 * developer where they stand against the free-tier limits. Purely
 * informational for now — enforcement + the paid tier ship separately.
 */
export function PlanStatusBanner() {
  const [data, setData] = useState<PlanStatus | null>(null);

  useEffect(() => {
    api
      .get<PlanStatus>("/api/developers/me/plan")
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  const appsPct = pct(data.usage.apps, data.limits.maxApps);
  const installsPct = pct(data.usage.installs, data.limits.maxInstalls);

  const tone =
    data.status === "over"
      ? "border-violet-300 bg-violet-50"
      : data.status === "approaching"
        ? "border-amber-300 bg-amber-50"
        : "border-slate-200 bg-white";

  return (
    <div className={`rounded-2xl border ${tone} p-5`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {data.status === "over"
              ? "You've passed the free tier"
              : data.status === "approaching"
                ? "Approaching the free-tier limit"
                : "Free plan"}
          </p>
          <p className="text-xs text-slate-500">
            {data.status === "over"
              ? "A paid plan is coming soon — your apps keep running in the meantime."
              : "Publish and grow for free up to the limits below."}
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-400 border border-slate-200 rounded-full px-2.5 py-1">
          {data.plan}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UsageBar
          label="Apps"
          used={data.usage.apps}
          max={data.limits.maxApps}
          percent={appsPct}
          over={data.over.apps}
        />
        <UsageBar
          label="Installs"
          used={data.usage.installs}
          max={data.limits.maxInstalls}
          percent={installsPct}
          over={data.over.installs}
        />
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
        <span className="font-medium text-slate-600">{label}</span>
        <span className={over ? "text-violet-700 font-semibold" : "text-slate-400"}>
          {used.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
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
