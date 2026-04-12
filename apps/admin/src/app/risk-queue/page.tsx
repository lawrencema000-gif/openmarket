import Link from "next/link";
import { ApproveRejectButtons } from "./ApproveRejectButtons";

const API = "http://localhost:3001";

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
    const res = await fetch(`${API}/api/admin/risk-queue`, {
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

function riskColor(score?: number) {
  if (score == null) return "text-gray-500 bg-gray-100";
  if (score >= 75) return "text-red-700 bg-red-100";
  if (score >= 50) return "text-orange-700 bg-orange-100";
  if (score >= 25) return "text-yellow-700 bg-yellow-100";
  return "text-green-700 bg-green-100";
}

export default async function RiskQueuePage() {
  const releases = await getRiskQueue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Risk Queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          {releases.length} release{releases.length !== 1 ? "s" : ""} pending
          review
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                App / Version
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Risk Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Developer
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Submitted
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {releases.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-sm text-gray-400"
                >
                  No releases in the risk queue
                </td>
              </tr>
            ) : (
              releases.map((r) => {
                const appName = r.appName ?? r.name ?? "Unknown App";
                const devName =
                  r.developerName ?? r.developer?.name ?? "Unknown";
                const submitted = r.submittedAt ?? r.createdAt;
                return (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/releases/${r.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {appName}
                      </Link>
                      {r.version && (
                        <span className="ml-2 text-xs text-gray-400">
                          v{r.version}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${riskColor(r.riskScore)}`}
                      >
                        {r.riskScore != null ? r.riskScore : "N/A"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{devName}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {submitted
                        ? new Date(submitted).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <ApproveRejectButtons releaseId={r.id} />
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
