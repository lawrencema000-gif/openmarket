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
  if (action.startsWith("category.")) return "bg-om-primary/15 text-om-primary";
  if (action.startsWith("reviews.")) return "bg-amber-100 text-amber-700";
  return "bg-om-line-soft text-om-ink-mute";
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

      <div className="flex flex-wrap gap-1 bg-om-line-soft p-1 rounded-lg w-fit">
        {ACTION_FILTERS.map((f) => {
          const active =
            (!actionFilter && f.value === "all") || actionFilter === f.value;
          return (
            <a
              key={f.value}
              href={`/audit-log?action=${f.value}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                active
                  ? "bg-om-surface text-om-ink shadow-sm"
                  : "text-om-ink-soft hover:text-om-ink"
              }`}
            >
              {f.label}
            </a>
          );
        })}
      </div>

      <div className="bg-om-surface rounded-xl border border-om-line shadow-sm overflow-hidden">
        {data.data.length === 0 ? (
          <EmptyState
            title="No audit log entries"
            description="Admin mutations will appear here."
          />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-om-surface-tint border-b border-om-line">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-om-ink-soft uppercase tracking-wide whitespace-nowrap">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-om-ink-soft uppercase tracking-wide">
                    Actor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-om-ink-soft uppercase tracking-wide">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-om-ink-soft uppercase tracking-wide">
                    Target
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-om-ink-soft uppercase tracking-wide">
                    Path / IP
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.data.map((entry) => (
                  <tr key={entry.id} className="hover:bg-om-surface-tint transition-colors">
                    <td className="px-6 py-3 text-xs text-om-ink-soft whitespace-nowrap font-mono">
                      {new Date(entry.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-3 text-om-ink-mute text-xs font-medium">
                      {entry.actorEmail}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actionTone(entry.action)}`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-om-ink-mute text-xs">
                      {entry.targetType ? (
                        <span>
                          <span className="font-medium">{entry.targetType}</span>
                          {entry.targetId && (
                            <span className="ml-1 font-mono text-om-ink-soft">
                              {entry.targetId.length > 12
                                ? entry.targetId.slice(0, 8) + "…"
                                : entry.targetId}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-om-line">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs text-om-ink-soft font-mono">
                      <div>{entry.requestMethod} {entry.requestPath}</div>
                      {entry.ipAddress && (
                        <div className="text-om-ink-soft">{entry.ipAddress}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-6 py-4 border-t border-om-line-soft flex items-center justify-between">
              <p className="text-xs text-om-ink-soft">
                Page {data.page}
              </p>
              <div className="flex gap-2">
                {data.page > 1 && (
                  <a
                    href={`/audit-log?page=${data.page - 1}${actionFilter ? `&action=${actionFilter}` : ""}`}
                    className="px-3 py-1.5 text-xs font-medium border border-om-line rounded-lg text-om-ink-mute hover:bg-om-surface-tint transition-colors"
                  >
                    Previous
                  </a>
                )}
                {data.data.length === data.limit && (
                  <a
                    href={`/audit-log?page=${data.page + 1}${actionFilter ? `&action=${actionFilter}` : ""}`}
                    className="px-3 py-1.5 text-xs font-medium border border-om-line rounded-lg text-om-ink-mute hover:bg-om-surface-tint transition-colors"
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
