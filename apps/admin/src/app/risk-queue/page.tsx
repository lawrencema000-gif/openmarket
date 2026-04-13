import Link from "next/link";
import { PageHeader, EmptyState } from "@openmarket/ui";
import { ApproveRejectButtons } from "./ApproveRejectButtons";
import { API_URL } from "@/lib/api";

interface ReleaseEntry {
  id: string;
  appName?: string;
  name?: string;
  version?: string;
  riskScore?: number;
  developerName?: string;
  developer?: { name?: string };
  submittedAt?: string;
  createdAt?: string;
}

async function getRiskQueue(): Promise<ReleaseEntry[]> {
  try {
    const res = await fetch(`${API_URL}/api/admin/risk-queue`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data?.data ?? []);
  } catch {
    return [];
  }
}

type RiskTier = "all" | "critical" | "high" | "low";

function getRiskTier(score?: number): "critical" | "high" | "medium" | "low" {
  if (score == null) return "low";
  if (score >= 71) return "critical";
  if (score >= 31) return "high";
  if (score >= 11) return "medium";
  return "low";
}

function riskBadgeClass(score?: number): string {
  if (score == null) return "bg-gray-100 text-gray-600";
  if (score >= 71) return "bg-red-100 text-red-700";
  if (score >= 31) return "bg-orange-100 text-orange-700";
  if (score >= 11) return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}

function riskBarClass(score?: number): string {
  if (score == null) return "bg-gray-300";
  if (score >= 71) return "bg-red-500";
  if (score >= 31) return "bg-orange-400";
  if (score >= 11) return "bg-yellow-400";
  return "bg-green-400";
}

const FILTER_TABS: { value: RiskTier; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical (71+)" },
  { value: "high", label: "High (31–70)" },
  { value: "low", label: "Low (0–30)" },
];

export default async function RiskQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const { tier: filterTier } = await searchParams;
  const releases = await getRiskQueue();

  const filtered = !filterTier || filterTier === "all"
    ? releases
    : releases.filter((r) => {
        const t = getRiskTier(r.riskScore);
        if (filterTier === "critical") return t === "critical";
        if (filterTier === "high") return t === "high";
        if (filterTier === "low") return t === "low" || t === "medium";
        return true;
      });

  const counts = {
    all: releases.length,
    critical: releases.filter((r) => getRiskTier(r.riskScore) === "critical").length,
    high: releases.filter((r) => getRiskTier(r.riskScore) === "high").length,
    low: releases.filter((r) => ["low", "medium"].includes(getRiskTier(r.riskScore))).length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk Queue"
        description={`${releases.length} release${releases.length !== 1 ? "s" : ""} pending review`}
      />

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {FILTER_TABS.map((tab) => {
          const isActive = (!filterTier && tab.value === "all") || filterTier === tab.value;
          return (
            <a
              key={tab.value}
              href={`/risk-queue?tier=${tab.value}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 opacity-60">{counts[tab.value]}</span>
            </a>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            title="Queue is clear"
            description="No releases match this filter. Check back later."
            icon={
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">App / Version</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Risk Score</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Developer</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => {
                const appName = r.appName ?? r.name ?? "Unknown App";
                const devName = r.developerName ?? r.developer?.name ?? "Unknown";
                const submitted = r.submittedAt ?? r.createdAt;
                const score = r.riskScore ?? 0;
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/releases/${r.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {appName}
                      </Link>
                      {r.version && (
                        <span className="ml-2 text-xs text-gray-400">v{r.version}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${riskBarClass(r.riskScore)}`}
                            style={{ width: `${Math.min(score, 100)}%` }}
                          />
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold min-w-[2.25rem] justify-center ${riskBadgeClass(r.riskScore)}`}
                        >
                          {r.riskScore != null ? r.riskScore : "N/A"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{devName}</td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {submitted ? new Date(submitted).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <ApproveRejectButtons releaseId={r.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
