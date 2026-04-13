import { PageHeader, StatusBadge, Card, CardHeader, CardTitle, CardContent } from "@openmarket/ui";
import { DeveloperActions } from "./DeveloperActions";
import { API_URL } from "@/lib/api";

interface App {
  id: string;
  name?: string;
  status?: string;
  version?: string;
  createdAt?: string;
}

interface ModerationEntry {
  id?: string;
  action?: string;
  reason?: string;
  moderator?: string;
  createdAt?: string;
}

interface Developer {
  id: string;
  name?: string;
  email?: string;
  trustLevel?: string;
  status?: string;
  createdAt?: string;
  apps?: App[];
  moderationHistory?: ModerationEntry[];
}

async function getDeveloper(id: string): Promise<Developer | null> {
  try {
    const res = await fetch(`${API_URL}/api/admin/developers/${id}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function actionDotClass(action?: string): string {
  const a = action?.toLowerCase() ?? "";
  if (a.includes("approve") || a.includes("reinstate")) return "bg-emerald-400";
  if (a.includes("suspend") || a.includes("reject") || a.includes("ban")) return "bg-red-400";
  if (a.includes("warn") || a.includes("flag")) return "bg-orange-400";
  return "bg-gray-300";
}

export default async function DeveloperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dev = await getDeveloper(id);

  if (!dev) {
    return (
      <div className="text-center py-20 text-gray-400">
        Developer not found or API unavailable.
      </div>
    );
  }

  const apps = dev.apps ?? [];
  const history = dev.moderationHistory ?? [];
  const isSuspended = dev.trustLevel === "suspended" || dev.status === "suspended";

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={dev.name ?? "Unknown Developer"}
        breadcrumbs={[
          { label: "Developers", href: "/developers" },
          { label: dev.name ?? "Developer" },
        ]}
        actions={
          <DeveloperActions developerId={dev.id} isSuspended={isSuspended} />
        }
      />

      {/* Profile card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900">{dev.name ?? "Unknown"}</h2>
                {dev.trustLevel && <StatusBadge status={dev.trustLevel} />}
                {dev.status && dev.status !== dev.trustLevel && (
                  <StatusBadge status={dev.status} />
                )}
              </div>
              {dev.email && (
                <p className="text-sm text-gray-500">{dev.email}</p>
              )}
              {dev.createdAt && (
                <p className="text-xs text-gray-400">
                  Member since {new Date(dev.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Apps list */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>
                Published Apps
                <span className="ml-2 text-sm font-normal text-gray-400">({apps.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {apps.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-400">No published apps</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">App</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Version</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {apps.map((app) => (
                      <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 font-medium text-gray-800">{app.name ?? app.id}</td>
                        <td className="px-6 py-3 text-gray-500 text-xs">
                          {app.version ? `v${app.version}` : "—"}
                        </td>
                        <td className="px-6 py-3">
                          {app.status ? (
                            <StatusBadge status={app.status} />
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Moderation history timeline */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                Moderation History
                <span className="ml-2 text-sm font-normal text-gray-400">({history.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-400">No moderation history</p>
              ) : (
                <div className="px-6 py-4">
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-200" />
                    <div className="space-y-5">
                      {history.map((entry, i) => (
                        <div key={entry.id ?? i} className="relative pl-7">
                          {/* Dot */}
                          <div
                            className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-white ${actionDotClass(entry.action)}`}
                            style={{ boxShadow: "0 0 0 1px #e5e7eb" }}
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <StatusBadge status={entry.action ?? "unknown"} />
                              {entry.createdAt && (
                                <span className="text-xs text-gray-400">
                                  {new Date(entry.createdAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {entry.reason && (
                              <p className="text-xs text-gray-600 mt-1 leading-relaxed">{entry.reason}</p>
                            )}
                            {entry.moderator && (
                              <p className="text-xs text-gray-400 mt-0.5">by {entry.moderator}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
