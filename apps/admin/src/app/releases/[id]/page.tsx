import { PageHeader, StatusBadge, Card, CardContent, Badge } from "@openmarket/ui";
import { ReleaseActions } from "./ReleaseActions";
import { API_URL } from "@/lib/api";

interface ScanFinding {
  severity?: string;
  message?: string;
  type?: string;
  description?: string;
  isNew?: boolean;
  isDangerous?: boolean;
}

interface Release {
  id: string;
  appName?: string;
  name?: string;
  packageName?: string;
  version?: string;
  channel?: string;
  status?: string;
  riskScore?: number;
  developerName?: string;
  developer?: { id?: string; name?: string; email?: string };
  submittedAt?: string;
  createdAt?: string;
  description?: string;
  permissions?: string[];
  scanResults?: {
    findings?: ScanFinding[];
    riskBreakdown?: Record<string, number>;
    summary?: string;
  };
}

async function getRelease(id: string): Promise<Release | null> {
  try {
    const res = await fetch(`${API_URL}/api/admin/releases/${id}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function riskScoreClass(score?: number): string {
  if (score == null) return "text-gray-600";
  if (score >= 71) return "text-red-600";
  if (score >= 31) return "text-orange-500";
  if (score >= 11) return "text-yellow-600";
  return "text-green-600";
}

function riskBarClass(score?: number): string {
  if (score == null) return "bg-gray-300";
  if (score >= 71) return "bg-red-500";
  if (score >= 31) return "bg-orange-400";
  if (score >= 11) return "bg-yellow-400";
  return "bg-green-400";
}

function riskLabel(score?: number): string {
  if (score == null) return "Unknown";
  if (score >= 71) return "Human Required";
  if (score >= 31) return "Enhanced Review";
  return "Auto Pass";
}

function severityHeaderClass(sev?: string): string {
  switch (sev?.toLowerCase()) {
    case "critical": return "bg-red-50 border-red-200 text-red-700";
    case "high": return "bg-orange-50 border-orange-200 text-orange-700";
    case "medium": return "bg-yellow-50 border-yellow-200 text-yellow-700";
    case "low": return "bg-blue-50 border-blue-200 text-blue-700";
    default: return "bg-gray-50 border-gray-200 text-gray-600";
  }
}

function groupFindingsBySeverity(findings: ScanFinding[]) {
  const order = ["critical", "high", "medium", "low", "info"];
  const groups: Record<string, ScanFinding[]> = {};
  for (const f of findings) {
    const sev = (f.severity ?? "info").toLowerCase();
    if (!groups[sev]) groups[sev] = [];
    groups[sev].push(f);
  }
  return order.filter((s) => groups[s]?.length).map((s) => ({ severity: s, items: groups[s] }));
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
  const grouped = groupFindingsBySeverity(findings);
  const score = release.riskScore;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title={appName}
        breadcrumbs={[
          { label: "Risk Queue", href: "/risk-queue" },
          { label: "Release Details" },
        ]}
        actions={<ReleaseActions releaseId={release.id} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left panel — metadata */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              {release.packageName && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Package</p>
                  <code className="text-sm font-mono text-gray-800 bg-gray-50 px-2 py-1 rounded">
                    {release.packageName}
                  </code>
                </div>
              )}
              {release.version && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Version</p>
                  <p className="text-sm text-gray-800 font-medium">v{release.version}</p>
                </div>
              )}
              {release.channel && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Channel</p>
                  <StatusBadge status={release.channel} />
                </div>
              )}
              {release.status && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Status</p>
                  <StatusBadge status={release.status} />
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Developer</p>
                {release.developer?.id ? (
                  <a
                    href={`/developers/${release.developer.id}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {devName}
                  </a>
                ) : (
                  <p className="text-sm text-gray-800">{devName}</p>
                )}
                {release.developer?.email && (
                  <p className="text-xs text-gray-400 mt-0.5">{release.developer.email}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Submitted</p>
                <p className="text-sm text-gray-800">
                  {submitted ? new Date(submitted).toLocaleString() : "—"}
                </p>
              </div>
              {release.description && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Description</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{release.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Risk score card */}
          <Card>
            <CardContent className="p-6">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Risk Score</p>
              <div className="flex items-end gap-3 mb-3">
                <span className={`text-5xl font-black ${riskScoreClass(score)}`}>
                  {score != null ? score : "—"}
                </span>
                <span className="text-sm text-gray-500 mb-1.5">/ 100</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all ${riskBarClass(score)}`}
                  style={{ width: `${Math.min(score ?? 0, 100)}%` }}
                />
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  score != null && score >= 71
                    ? "bg-red-100 text-red-700"
                    : score != null && score >= 31
                    ? "bg-orange-100 text-orange-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {riskLabel(score)}
              </span>

              {Object.keys(breakdown).length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase">Breakdown</p>
                  {Object.entries(breakdown).map(([key, val]) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-gray-500 capitalize">{key.replace(/_/g, " ")}</span>
                      <span className="font-semibold text-gray-800">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Permissions */}
          {release.permissions && release.permissions.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Permissions</p>
                <div className="flex flex-wrap gap-1.5">
                  {release.permissions.map((perm) => {
                    const isDangerous = /CAMERA|RECORD_AUDIO|READ_CONTACTS|ACCESS_FINE_LOCATION|READ_CALL_LOG|READ_SMS/i.test(perm);
                    return (
                      <span
                        key={perm}
                        className={`text-xs px-2 py-0.5 rounded font-mono ${
                          isDangerous
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {perm}
                      </span>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right panel — scan findings */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Scan Findings</h2>
                  {release.scanResults?.summary && (
                    <p className="text-sm text-gray-500 mt-0.5">{release.scanResults.summary}</p>
                  )}
                </div>
                <Badge variant="secondary">{findings.length} finding{findings.length !== 1 ? "s" : ""}</Badge>
              </div>

              {grouped.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No scan findings</div>
              ) : (
                <div className="space-y-4">
                  {grouped.map(({ severity, items }) => (
                    <div key={severity} className={`rounded-xl border overflow-hidden ${severityHeaderClass(severity)}`}>
                      <div className={`px-4 py-2.5 flex items-center justify-between border-b ${severityHeaderClass(severity)}`}>
                        <span className="text-xs font-bold uppercase tracking-wide capitalize">{severity}</span>
                        <span className="text-xs font-semibold opacity-70">{items.length}</span>
                      </div>
                      <div className="divide-y divide-gray-100 bg-white">
                        {items.map((f, i) => (
                          <div key={i} className="px-4 py-3 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              {f.type && (
                                <p className="text-xs font-semibold text-gray-500 mb-0.5">{f.type}</p>
                              )}
                              <p className="text-sm text-gray-700">
                                {f.message ?? f.description ?? "No details"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {f.isNew && (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">NEW</span>
                              )}
                              {f.isDangerous && (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">!</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
