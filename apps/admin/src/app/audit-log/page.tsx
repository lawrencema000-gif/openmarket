import { PageHeader, EmptyState } from "@openmarket/ui";
import { API_URL } from "@/lib/api";

interface AuditEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  requestPath: string | null;
  requestMethod: string | null;
  diff: unknown;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditResponse {
  page: number;
  limit: number;
  data: AuditEntry[];
}

async function getAuditLog(
  page: number,
  action: string | undefined,
): Promise<AuditResponse | null> {
  try {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("limit", "50");
    if (action) qs.set("action", action);
    const res = await fetch(`${API_URL}/api/admin/audit-log?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AuditResponse;
  } catch {
    return null;
  }
}

const ACTION_FILTERS: { value: string | "all"; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "report.resolve.delist", label: "Delistings" },
  { value: "report.resolve.warn", label: "Warnings" },
  { value: "report.resolve.dismiss", label: "Dismissals" },
  { value: "appeal.resolve.accept", label: "Appeals accepted" },
  { value: "appeal.resolve.reject", label: "Appeals rejected" },
  { value: "category.create", label: "Category created" },
  { value: "category.update", label: "Category updated" },
  { value: "category.delete", label: "Category deleted" },
  { value: "category.reorder", label: "Category reordered" },
  { value: "reviews.freeze", label: "Review freeze on" },
  { value: "reviews.unfreeze", label: "Review freeze off" },
  { value: "reviews.promote-due", label: "Review promotion run" },
];

function actionTone(action: string): string {
  if (action.startsWith("report.resolve.delist") || action.startsWith("appeal.resolve.reject")) {
    return "bg-red-100 text-red-700";
  }
  if (action.startsWith("appeal.resolve.accept") || action === "reviews.unfreeze") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (action.startsWith("category.")) return "bg-blue-100 text-blue-700";
  if (action.startsWith("reviews.")) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-700";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  const { page: pageParam, action: actionFilter } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const data = await getAuditLog(
    page,
    actionFilter && actionFilter !== "all" ? actionFilter : undefined,
  );

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit Log" description="Could not load audit log." />
        <EmptyState title="API unreachable" description="Sign in or retry." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description={`Page ${data.page} · ${data.data.length} entries shown · forensic trail of every admin mutation`}
      />

      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {ACTION_FILTERS.map((f) => {
          const active =
            (!actionFilter && f.value === "all") || actionFilter === f.value;
          return (
            <a
              key={f.value}
              href={`/audit-log?action=${f.value}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                active
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f.label}
            </a>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {data.data.length === 0 ? (
          <EmptyState
            title="No audit log entries"
            description="Admin mutations will appear here."
          />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Actor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Target
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Path / IP
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.data.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                      {new Date(entry.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-3 text-gray-700 text-xs font-medium">
                      {entry.actorEmail}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actionTone(entry.action)}`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600 text-xs">
                      {entry.targetType ? (
                        <span>
                          <span className="font-medium">{entry.targetType}</span>
                          {entry.targetId && (
                            <span className="ml-1 font-mono text-gray-400">
                              {entry.targetId.length > 12
                                ? entry.targetId.slice(0, 8) + "…"
                                : entry.targetId}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-500 font-mono">
                      <div>{entry.requestMethod} {entry.requestPath}</div>
                      {entry.ipAddress && (
                        <div className="text-gray-400">{entry.ipAddress}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Page {data.page}
              </p>
              <div className="flex gap-2">
                {data.page > 1 && (
                  <a
                    href={`/audit-log?page=${data.page - 1}${actionFilter ? `&action=${actionFilter}` : ""}`}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Previous
                  </a>
                )}
                {data.data.length === data.limit && (
                  <a
                    href={`/audit-log?page=${data.page + 1}${actionFilter ? `&action=${actionFilter}` : ""}`}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Next
                  </a>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
