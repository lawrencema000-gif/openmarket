import { PageHeader, StatusBadge, EmptyState } from "@openmarket/ui";
import { ReportStatusUpdater } from "./ReportStatusUpdater";
import { API_URL } from "@/lib/api";

type ReportStatus = "open" | "investigating" | "resolved" | "dismissed";

interface Report {
  id: string;
  status?: ReportStatus;
  type?: string;
  description?: string;
  target?: string;
  targetId?: string;
  reporter?: string | { name?: string; email?: string };
  createdAt?: string;
}

async function getReports(): Promise<Report[]> {
  try {
    const res = await fetch(`${API_URL}/api/reports`, {
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

function reporterName(reporter: Report["reporter"]): string {
  if (!reporter) return "Anonymous";
  if (typeof reporter === "string") return reporter;
  return reporter.name ?? reporter.email ?? "Anonymous";
}

const STATUS_TABS: { value: ReportStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

function typeBadgeClass(type?: string): string {
  switch (type?.toLowerCase()) {
    case "malware": return "bg-red-100 text-red-700";
    case "spam": return "bg-orange-100 text-orange-700";
    case "privacy": return "bg-violet-100 text-violet-700";
    case "copyright": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;
  const reports = await getReports();

  const filtered =
    !filterStatus || filterStatus === "all"
      ? reports
      : reports.filter((r) => r.status === filterStatus);

  const counts: Record<string, number> = {
    all: reports.length,
    open: reports.filter((r) => r.status === "open").length,
    investigating: reports.filter((r) => r.status === "investigating").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
    dismissed: reports.filter((r) => r.status === "dismissed").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={`${reports.length} total report${reports.length !== 1 ? "s" : ""}`}
      />

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {STATUS_TABS.map((tab) => {
          const isActive = (!filterStatus && tab.value === "all") || filterStatus === tab.value;
          return (
            <a
              key={tab.value}
              href={`/reports?status=${tab.value}`}
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

      {/* Reports list */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No reports found"
          description="No reports match this filter."
          icon={
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((report) => (
            <div
              key={report.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <StatusBadge status={report.status ?? "open"} />
                    {report.type && (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeBadgeClass(report.type)}`}
                      >
                        {report.type}
                      </span>
                    )}
                    {report.target && (
                      <span className="text-xs text-gray-500">
                        Target:{" "}
                        <span className="font-medium text-gray-700">
                          {report.target}
                          {report.targetId ? ` (${report.targetId})` : ""}
                        </span>
                      </span>
                    )}
                  </div>
                  {report.description && (
                    <p className="text-sm text-gray-700 leading-relaxed mb-2">
                      {report.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    Reported by{" "}
                    <span className="font-medium text-gray-600">{reporterName(report.reporter)}</span>
                    {report.createdAt && (
                      <> &middot; {new Date(report.createdAt).toLocaleString()}</>
                    )}
                  </p>
                </div>
                <ReportStatusUpdater
                  reportId={report.id}
                  currentStatus={report.status ?? "open"}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
