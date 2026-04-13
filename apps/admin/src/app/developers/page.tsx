import Link from "next/link";
import { API_URL } from "@/lib/api";

type TrustLevel = "new" | "verified" | "trusted" | "suspended" | string;

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

const TRUST_TABS = ["all", "new", "verified", "trusted", "suspended"];

function trustBadge(level?: string) {
  switch (level) {
    case "trusted":
      return "bg-green-100 text-green-700";
    case "verified":
      return "bg-blue-100 text-blue-700";
    case "new":
      return "bg-gray-100 text-gray-600";
    case "suspended":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Developers</h1>
        <p className="text-sm text-gray-500 mt-1">
          {developers.length} registered developer
          {developers.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Trust level filter */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TRUST_TABS.map((tab) => {
          const count =
            tab === "all"
              ? developers.length
              : developers.filter((d) => d.trustLevel === tab).length;
          const isActive =
            (!filterTrust && tab === "all") || filterTrust === tab;
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
              <span className="ml-1.5 opacity-60">{count}</span>
            </a>
          );
        })}
      </div>

      {/* Developer table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Developer
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Trust Level
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Apps
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Detail
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-sm text-gray-400"
                >
                  No developers found
                </td>
              </tr>
            ) : (
              filtered.map((dev) => {
                const appCount =
                  dev.appCount ?? (Array.isArray(dev.apps) ? dev.apps.length : 0);
                return (
                  <tr
                    key={dev.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">
                        {dev.name ?? "Unknown"}
                      </p>
                      {dev.email && (
                        <p className="text-xs text-gray-400">{dev.email}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${trustBadge(dev.trustLevel)}`}
                      >
                        {dev.trustLevel ?? "unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{appCount}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {dev.createdAt
                        ? new Date(dev.createdAt).toLocaleDateString()
                        : "—"}
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
