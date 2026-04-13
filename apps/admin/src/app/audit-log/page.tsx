import { PageHeader, StatusBadge, EmptyState } from "@openmarket/ui";
import { API_URL } from "@/lib/api";

interface AuditEntry {
  id?: string;
  action?: string;
  target?: string;
  targetId?: string;
  targetType?: string;
  moderator?: string;
  moderatorId?: string;
  reason?: string;
  createdAt?: string;
  timestamp?: string;
}

async function getAuditLog(): Promise<AuditEntry[]> {
  try {
    const res = await fetch(`${API_URL}/api/admin/audit-log`, {
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

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const entries = await getAuditLog();

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paged = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description={`${entries.length} moderation action${entries.length !== 1 ? "s" : ""} recorded`}
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {paged.length === 0 ? (
          <EmptyState
            title="No audit log entries"
            description="Moderation actions will appear here."
            icon={
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
              </svg>
            }
          />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Timestamp</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Moderator</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map((entry, i) => {
                  const ts = entry.createdAt ?? entry.timestamp;
                  const target = [entry.targetType, entry.target ?? entry.targetId]
                    .filter(Boolean)
                    .join(": ");
                  return (
                    <tr key={entry.id ?? i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                        {ts
                          ? new Date(ts).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-6 py-3 text-gray-700 text-xs font-medium">
                        {entry.moderator ?? entry.moderatorId ?? "—"}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={entry.action ?? "unknown"} />
                      </td>
                      <td className="px-6 py-3 text-gray-600 text-xs">{target || "—"}</td>
                      <td className="px-6 py-3 text-xs max-w-xs">
                        {entry.reason ? (
                          <span
                            className="text-gray-500 truncate block max-w-[200px]"
                            title={entry.reason}
                          >
                            {entry.reason}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Page {page} of {totalPages} &middot; {entries.length} total entries
                </p>
                <div className="flex gap-2">
                  {page > 1 && (
                    <a
                      href={`/audit-log?page=${page - 1}`}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Previous
                    </a>
                  )}
                  {page < totalPages && (
                    <a
                      href={`/audit-log?page=${page + 1}`}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Next
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
