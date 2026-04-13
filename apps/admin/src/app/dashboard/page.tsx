import { API_URL } from "@/lib/api";

async function getDashboardData() {
  try {
    const [queueRes, reportsRes, auditRes] = await Promise.all([
      fetch(`${API_URL}/api/admin/risk-queue`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`${API_URL}/api/reports`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`${API_URL}/api/admin/audit-log`, {
        credentials: "include",
        cache: "no-store",
      }),
    ]);

    const queue = queueRes.ok ? await queueRes.json() : [];
    const reports = reportsRes.ok ? await reportsRes.json() : [];
    const audit = auditRes.ok ? await auditRes.json() : [];

    return { queue, reports, audit };
  } catch {
    return { queue: [], reports: [], audit: [] };
  }
}

export default async function DashboardPage() {
  const { queue, reports, audit } = await getDashboardData();

  const queueCount = Array.isArray(queue) ? queue.length : (queue?.data?.length ?? 0);
  const openReports = Array.isArray(reports)
    ? reports.filter((r: { status?: string }) => r.status === "open").length
    : 0;
  const recentActions = Array.isArray(audit) ? audit.slice(0, 5) : (audit?.data ?? []).slice(0, 5);

  const cards = [
    {
      label: "Risk Queue",
      value: queueCount,
      sub: "releases pending review",
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      label: "Open Reports",
      value: openReports,
      sub: "awaiting action",
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Moderations Today",
      value: recentActions.length,
      sub: "recent actions",
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "System Health",
      value: "OK",
      sub: "all services nominal",
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Overview of moderation activity
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm`}
          >
            <div
              className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${card.bg} mb-3`}
            >
              <span className={`text-lg font-bold ${card.color}`}>
                {typeof card.value === "number" ? card.value : "✓"}
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm font-medium text-gray-700 mt-0.5">
              {card.label}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Recent Actions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            Recent Moderation Actions
          </h2>
        </div>
        <div className="divide-y divide-gray-50">
          {recentActions.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">
              No recent actions
            </p>
          ) : (
            recentActions.map(
              (
                action: {
                  id?: string;
                  action?: string;
                  target?: string;
                  moderator?: string;
                  createdAt?: string;
                  timestamp?: string;
                },
                i: number
              ) => (
                <div
                  key={action.id ?? i}
                  className="px-6 py-3 flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-800">
                      {action.action ?? "action"}
                    </span>
                    <span className="text-gray-400">on</span>
                    <span className="text-gray-600">
                      {action.target ?? "—"}
                    </span>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    <p>{action.moderator ?? "moderator"}</p>
                    <p>
                      {action.createdAt || action.timestamp
                        ? new Date(
                            action.createdAt ?? action.timestamp!
                          ).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}
