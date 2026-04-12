const API = "http://localhost:3001";

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
    const res = await fetch(`${API}/api/admin/audit-log`, {
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

function actionBadge(action?: string) {
  const a = action?.toLowerCase() ?? "";
  if (a.includes("approve") || a.includes("reinstate"))
    return "bg-green-100 text-green-700";
  if (a.includes("reject") || a.includes("suspend") || a.includes("ban"))
    return "bg-red-100 text-red-700";
  if (a.includes("warn") || a.includes("flag"))
    return "bg-orange-100 text-orange-700";
  return "bg-gray-100 text-gray-600";
}

export default async function AuditLogPage() {
  const entries = await getAuditLog();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          {entries.length} moderation action{entries.length !== 1 ? "s" : ""}{" "}
          recorded
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Moderator
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Target
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-sm text-gray-400"
                >
                  No audit log entries
                </td>
              </tr>
            ) : (
              entries.map((entry, i) => {
                const ts = entry.createdAt ?? entry.timestamp;
                const target = [entry.targetType, entry.target ?? entry.targetId]
                  .filter(Boolean)
                  .join(": ");
                return (
                  <tr
                    key={entry.id ?? i}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {ts ? new Date(ts).toLocaleString() : "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-700">
                      {entry.moderator ?? entry.moderatorId ?? "—"}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${actionBadge(entry.action)}`}
                      >
                        {entry.action ?? "—"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {target || "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs max-w-xs truncate">
                      {entry.reason ?? "—"}
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
