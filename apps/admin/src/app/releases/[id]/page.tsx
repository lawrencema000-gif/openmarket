import { ReleaseActions } from "./ReleaseActions";

const API = "http://localhost:3001";

interface ScanFinding {
  severity?: string;
  message?: string;
  type?: string;
  description?: string;
}

interface Release {
  id: string;
  appName?: string;
  name?: string;
  version?: string;
  status?: string;
  riskScore?: number;
  developerName?: string;
  developer?: { id?: string; name?: string; email?: string };
  submittedAt?: string;
  createdAt?: string;
  description?: string;
  scanResults?: {
    findings?: ScanFinding[];
    riskBreakdown?: Record<string, number>;
    summary?: string;
  };
}

async function getRelease(id: string): Promise<Release | null> {
  try {
    const res = await fetch(`${API}/api/admin/releases/${id}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function riskColor(score?: number) {
  if (score == null) return "text-gray-500 bg-gray-100";
  if (score >= 75) return "text-red-700 bg-red-100";
  if (score >= 50) return "text-orange-700 bg-orange-100";
  if (score >= 25) return "text-yellow-700 bg-yellow-100";
  return "text-green-700 bg-green-100";
}

function severityColor(sev?: string) {
  switch (sev?.toLowerCase()) {
    case "critical":
      return "text-red-700 bg-red-100";
    case "high":
      return "text-orange-700 bg-orange-100";
    case "medium":
      return "text-yellow-700 bg-yellow-100";
    case "low":
      return "text-blue-700 bg-blue-100";
    default:
      return "text-gray-700 bg-gray-100";
  }
}

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const release = await getRelease(id);

  if (!release) {
    return (
      <div className="text-center py-20 text-gray-400">
        Release not found or API unavailable.
      </div>
    );
  }

  const appName = release.appName ?? release.name ?? "Unknown App";
  const devName = release.developerName ?? release.developer?.name ?? "Unknown";
  const submitted = release.submittedAt ?? release.createdAt;
  const findings = release.scanResults?.findings ?? [];
  const breakdown = release.scanResults?.riskBreakdown ?? {};

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{appName}</h1>
          <div className="flex items-center gap-3 mt-1">
            {release.version && (
              <span className="text-sm text-gray-500">v{release.version}</span>
            )}
            {release.status && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                {release.status}
              </span>
            )}
            {release.riskScore != null && (
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${riskColor(release.riskScore)}`}
              >
                Risk: {release.riskScore}
              </span>
            )}
          </div>
        </div>
        <ReleaseActions releaseId={release.id} />
      </div>

      {/* Metadata */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-400 uppercase font-semibold mb-1">
            Developer
          </p>
          <p className="text-gray-800">{devName}</p>
          {release.developer?.email && (
            <p className="text-gray-500">{release.developer.email}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase font-semibold mb-1">
            Submitted
          </p>
          <p className="text-gray-800">
            {submitted ? new Date(submitted).toLocaleString() : "—"}
          </p>
        </div>
        {release.description && (
          <div className="col-span-2">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">
              Description
            </p>
            <p className="text-gray-700">{release.description}</p>
          </div>
        )}
      </div>

      {/* Scan Results */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            Scan Results
          </h2>
          {release.scanResults?.summary && (
            <p className="text-sm text-gray-500 mt-0.5">
              {release.scanResults.summary}
            </p>
          )}
        </div>

        {/* Risk Breakdown */}
        {Object.keys(breakdown).length > 0 && (
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">
              Risk Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(breakdown).map(([key, val]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-gray-600 capitalize">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="font-semibold text-gray-800">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Findings */}
        <div className="divide-y divide-gray-50">
          {findings.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">
              No scan findings
            </p>
          ) : (
            findings.map((f, i) => (
              <div key={i} className="px-6 py-3 flex items-start gap-3">
                <span
                  className={`mt-0.5 text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${severityColor(f.severity)}`}
                >
                  {f.severity ?? "info"}
                </span>
                <div>
                  {f.type && (
                    <p className="text-xs font-medium text-gray-500">
                      {f.type}
                    </p>
                  )}
                  <p className="text-sm text-gray-700">
                    {f.message ?? f.description ?? "No details"}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
