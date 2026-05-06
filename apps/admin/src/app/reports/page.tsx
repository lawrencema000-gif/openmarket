import { PageHeader, StatusBadge, EmptyState } from "@openmarket/ui";
import { ReportResolveDrawer } from "./ReportResolveDrawer";
import { API_URL } from "@/lib/api";

type ReportStatus = "open" | "investigating" | "resolved" | "dismissed";

interface AdminReport {
  id: string;
  status: ReportStatus;
  reportType?: string;
  description?: string | null;
  targetType?: string;
  targetId?: string;
  reporterId?: string;
  resolutionNotes?: string | null;
  createdAt?: string;
  resolvedAt?: string | null;
}

interface ReportsResponse {
  items: AdminReport[];
  page: number;
  limit: number;
  counts: Record<ReportStatus, number>;
}

async function getReports(status: string | undefined): Promise<ReportsResponse | null> {
  try {
    const qs = new URLSearchParams();
    if (status && status !== "all") qs.set("status", status);
    qs.set("limit", "50");
    const res = await fetch(`${API_URL}/api/admin/reports?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ReportsResponse;
  } catch {
    return null;
  }
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
    case "scam": return "bg-orange-100 text-orange-700";
    case "impersonation": return "bg-fuchsia-100 text-fuchsia-700";
    case "illegal": return "bg-rose-100 text-rose-700";
    case "spam": return "bg-amber-100 text-amber-700";
    case "broken": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;
  const data = await getReports(filterStatus);

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Could not load admin queue." />
        <EmptyState
          title="API unreachable"
          description="The admin reports queue requires a working API session. Sign in or retry."
        />
      </div>
    );
  }

  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const counts: Record<string, number> = { all: total, ...data.counts };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={`${total} total · ${data.counts.open} open · ${data.counts.investigating} investigating`}
      />

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {STATUS_TABS.map((tab) => {
          const isActive = (!filterStatus && tab.value === "all") || filterStatus === tab.value;
          return (
            <a
              key={tab.value}
              href={`/reports?status=${tab.value}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                isActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 opacity-60">{counts[tab.value] ?? 0}</span>
            </a>
          );
        })}
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No reports match this filter."
        />
      ) : (
        <div className="space-y-3">
          {data.items.map((report) => {
            const isResolved = report.status === "resolved" || report.status === "dismissed";
            return (
              <div
                key={report.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <StatusBadge status={report.status} />
                      {report.reportType && (
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeBadgeClass(
                            report.reportType,
                          )}`}
                        >
                          {report.reportType}
                        </span>
                      )}
                      {report.targetType && (
                        <span className="text-xs text-gray-500">
                          Target:{" "}
                          <span className="font-medium text-gray-700">
                            {report.targetType}
                            {report.targetId ? ` · ${report.targetId.slice(0, 8)}` : ""}
                          </span>
                        </span>
                      )}
                    </div>
                    {report.description && (
                      <p className="text-sm text-gray-700 leading-relaxed mb-2 whitespace-pre-line">
                        {report.description}
                      </p>
                    )}
                    {report.resolutionNotes && (
                      <p className="text-xs text-gray-500 mt-1 italic">
                        Resolution: {report.resolutionNotes}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      {report.createdAt
                        ? new Date(report.createdAt).toLocaleString()
                        : "—"}
                      {report.resolvedAt && (
                        <> &middot; resolved {new Date(report.resolvedAt).toLocaleString()}</>
                      )}
                    </p>
                  </div>
                  <ReportResolveDrawer reportId={report.id} disabled={isResolved} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
