import { ReportStatusUpdater } from "./ReportStatusUpdater";

const API = "http://localhost:3001";

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
    const res = await fetch(`${API}/api/reports`, {
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

const STATUS_TABS: { value: ReportStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

function statusBadge(status?: string) {
  switch (status) {
    case "open":
      return "bg-red-100 text-red-700";
    case "investigating":
      return "bg-orange-100 text-orange-700";
    case "resolved":
      return "bg-green-100 text-green-700";
    case "dismissed":
      return "bg-gray-100 text-gray-500";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function reporterName(reporter: Report["reporter"]): string {
  if (!reporter) return "Anonymous";
  if (typeof reporter === "string") return reporter;
  return reporter.name ?? reporter.email ?? "Anonymous";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          {reports.length} total report{reports.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.value === "all"
              ? reports.length
              : reports.filter((r) => r.status === tab.value).length;
          const isActive =
            (!filterStatus && tab.value === "all") ||
            filterStatus === tab.value;
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
              <span className="ml-1.5 text-xs opacity-60">{count}</span>
            </a>
          );
        })}
      </div>

      {/* Reports list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
            No reports in this category
          </div>
        ) : (
          filtered.map((report) => (
            <div
              key={report.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(report.status)}`}
                    >
                      {report.status ?? "unknown"}
                    </span>
                    {report.type && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {report.type}
                      </span>
                    )}
                    {report.target && (
                      <span className="text-xs font-medium text-gray-700">
                        Target: {report.target}
                        {report.targetId ? ` (${report.targetId})` : ""}
                      </span>
                    )}
                  </div>
                  {report.description && (
                    <p className="mt-2 text-sm text-gray-700 leading-relaxed">
                      {report.description}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-gray-400">
                    Reported by {reporterName(report.reporter)}
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
          ))
        )}
      </div>
    </div>
  );
}
