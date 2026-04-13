import Link from "next/link";
import { PageHeader, StatusBadge, EmptyState } from "@openmarket/ui";
import { API_URL } from "@/lib/api";

type TrustLevel = "new" | "verified" | "trusted" | "experimental" | "suspended" | string;

interface Developer {
  id: string;
  name?: string;
  email?: string;
  trustLevel?: TrustLevel;
  appCount?: number;
  apps?: unknown[];
  createdAt?: string;
}

async function getDevelopers(): Promise<Developer[]> {
  try {
    const res = await fetch(`${API_URL}/api/admin/developers`, {
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

const TRUST_TABS = ["all", "verified", "experimental", "suspended"];

export default async function DevelopersPage({
  searchParams,
}: {
  searchParams: Promise<{ trust?: string }>;
}) {
  const { trust: filterTrust } = await searchParams;
  const developers = await getDevelopers();

  const filtered =
    !filterTrust || filterTrust === "all"
      ? developers
      : developers.filter((d) => d.trustLevel === filterTrust);

  const counts: Record<string, number> = {
    all: developers.length,
    verified: developers.filter((d) => d.trustLevel === "verified").length,
    experimental: developers.filter((d) => d.trustLevel === "experimental").length,
    suspended: developers.filter((d) => d.trustLevel === "suspended").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developers"
        description={`${developers.length} registered developer${developers.length !== 1 ? "s" : ""}`}
      />

      {/* Trust level filter */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TRUST_TABS.map((tab) => {
          const isActive = (!filterTrust && tab === "all") || filterTrust === tab;
          return (
            <a
              key={tab}
              href={`/developers?trust=${tab}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                isActive
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
              <span className="ml-1.5 opacity-60">{counts[tab] ?? 0}</span>
            </a>
          );
        })}
      </div>

      {/* Developer table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            title="No developers found"
            description="No developers match this filter."
            icon={
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Developer</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trust Level</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Apps</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((dev) => {
                const appCount =
                  dev.appCount ?? (Array.isArray(dev.apps) ? dev.apps.length : 0);
                return (
                  <tr key={dev.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{dev.name ?? "Unknown"}</p>
                      {dev.email && (
                        <p className="text-xs text-gray-400 mt-0.5">{dev.email}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={dev.trustLevel ?? "unknown"} />
                    </td>
                    <td className="px-6 py-4 text-gray-600">{appCount}</td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {dev.createdAt ? new Date(dev.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/developers/${dev.id}`}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        View
                      </Link>
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
