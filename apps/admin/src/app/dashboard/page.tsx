import { PageHeader, Stat, StatusBadge, Card, CardHeader, CardTitle, CardContent } from "@openmarket/ui";
import { API_URL } from "@/lib/api";

interface BombSignal {
  appId: string;
  recentLowStarCount: number;
  recentAvg: number;
  baselineAvg: number;
  drop: number;
}

async function getDashboardData() {
  try {
    const [queueRes, reportsRes, auditRes, bombRes] = await Promise.all([
      fetch(`${API_URL}/api/admin/risk-queue`, { credentials: "include", cache: "no-store" }),
      fetch(`${API_URL}/api/reports`, { credentials: "include", cache: "no-store" }),
      fetch(`${API_URL}/api/admin/audit-log`, { credentials: "include", cache: "no-store" }),
      fetch(`${API_URL}/api/admin/reviews/bomb-signals`, { credentials: "include", cache: "no-store" }),
    ]);

    const queue = queueRes.ok ? await queueRes.json() : [];
    const reports = reportsRes.ok ? await reportsRes.json() : [];
    const audit = auditRes.ok ? await auditRes.json() : [];
    const bombSignals = bombRes.ok ? await bombRes.json() : { items: [] };

    return { queue, reports, audit, bombSignals };
  } catch {
    return { queue: [], reports: [], audit: [], bombSignals: { items: [] } };
  }
}

function riskScoreColor(score: number): string {
  if (score >= 71) return "text-red-600 bg-red-100";
  if (score >= 31) return "text-orange-600 bg-orange-100";
  if (score >= 11) return "text-yellow-600 bg-yellow-100";
  return "text-green-600 bg-green-100";
}

interface ReleaseEntry {
  id: string;
  appName?: string;
  name?: string;
  version?: string;
  riskScore?: number;
  developerName?: string;
  developer?: { name?: string };
}

interface AuditEntry {
  id?: string;
  action?: string;
  target?: string;
  moderator?: string;
  createdAt?: string;
  timestamp?: string;
}

export default async function DashboardPage() {
  const { queue, reports, audit, bombSignals } = await getDashboardData();

  const queueList: ReleaseEntry[] = Array.isArray(queue) ? queue : (queue?.data ?? []);
  const reportsList: { status?: string }[] = Array.isArray(reports) ? reports : (reports?.data ?? []);
  const auditList: AuditEntry[] = Array.isArray(audit) ? audit : (audit?.data ?? []);
  const bombList: BombSignal[] = bombSignals?.items ?? [];

  const queueCount = queueList.length;
  const openReports = reportsList.filter((r) => r.status === "open").length;
  const recentActions = auditList.slice(0, 5);

  const highPriority = [...queueList]
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Moderation command center — overview of risk queue, reports, and recent actions."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Stat
          label="Risk Queue"
          value={queueCount}
          color="amber"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          }
        />
        <Stat
          label="Open Reports"
          value={openReports}
          color="red"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
            </svg>
          }
        />
        <Stat
          label="Recent Actions"
          value={recentActions.length}
          color="blue"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
        />
        <Stat
          label="System Health"
          value="Operational"
          color="green"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
            </svg>
          }
        />
      </div>

      {/* Review-bomb watch list — only shown when something is on it.
          Early-warning signals (half the auto-freeze threshold + ≥0.5
          average drop). The auto-freezer flips at the full threshold;
          this is the "look at me before I trip" panel. */}
      {bombList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Review-bomb watch list
              <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                {bombList.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-gray-50">
              {bombList.map((b) => (
                <li
                  key={b.appId}
                  className="px-6 py-3.5 flex items-center justify-between"
                >
                  <div>
                    <p className="font-mono text-xs text-gray-700">
                      app · {b.appId.slice(0, 8)}…
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {b.recentLowStarCount} low-star reviews in the last hour
                      · avg {b.recentAvg.toFixed(2)} (was {b.baselineAvg.toFixed(2)})
                    </p>
                  </div>
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                      b.drop >= 1.5
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    ▼ {b.drop.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* High Priority */}
        <Card>
          <CardHeader>
            <CardTitle>High Priority Queue</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {highPriority.length === 0 ? (
              <p className="px-6 py-8 text-sm text-gray-400 text-center">Queue is clear</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {highPriority.map((r) => {
                  const appName = r.appName ?? r.name ?? "Unknown App";
                  const devName = r.developerName ?? r.developer?.name ?? "Unknown";
                  const score = r.riskScore ?? 0;
                  return (
                    <div key={r.id} className="px-6 py-3.5 flex items-center justify-between">
                      <div>
                        <a
                          href={`/releases/${r.id}`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          {appName}
                        </a>
                        {r.version && (
                          <span className="ml-2 text-xs text-gray-400">v{r.version}</span>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{devName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${score >= 71 ? "bg-red-500" : score >= 31 ? "bg-orange-400" : score >= 11 ? "bg-yellow-400" : "bg-green-400"}`}
                            style={{ width: `${Math.min(score, 100)}%` }}
                          />
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold min-w-[2.5rem] justify-center ${riskScoreColor(score)}`}
                        >
                          {score}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Moderation Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Moderation Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentActions.length === 0 ? (
              <p className="px-6 py-8 text-sm text-gray-400 text-center">No recent actions</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentActions.map((action, i) => {
                  const ts = action.createdAt ?? action.timestamp;
                  return (
                    <div key={action.id ?? i} className="px-6 py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <StatusBadge status={action.action ?? "unknown"} />
                        <span className="text-sm text-gray-500">
                          {action.target ?? "—"}
                        </span>
                      </div>
                      <div className="text-right text-xs text-gray-400 shrink-0 ml-4">
                        <p className="font-medium">{action.moderator ?? "—"}</p>
                        <p>{ts ? new Date(ts).toLocaleString() : "—"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
