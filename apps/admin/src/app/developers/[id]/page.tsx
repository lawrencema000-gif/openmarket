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

function trustBadge(level?: string) {
  switch (level) {
    case "trusted":
      return "bg-green-100 text-green-700";
    case "verified":
      return "bg-blue-100 text-blue-700";
    case "new":
      return "bg-gray-100 text-gray-600";
    case "suspended":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-500";
  }
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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {dev.name ?? "Unknown Developer"}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            {dev.email && (
              <span className="text-sm text-gray-500">{dev.email}</span>
            )}
            {dev.trustLevel && (
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${trustBadge(dev.trustLevel)}`}
              >
                {dev.trustLevel}
              </span>
            )}
            {dev.status && dev.status !== dev.trustLevel && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                {dev.status}
              </span>
            )}
          </div>
          {dev.createdAt && (
            <p className="text-xs text-gray-400 mt-1">
              Joined {new Date(dev.createdAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <DeveloperActions
          developerId={dev.id}
          isSuspended={
            dev.trustLevel === "suspended" || dev.status === "suspended"
          }
        />
      </div>

      {/* Published Apps */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            Published Apps
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({apps.length})
            </span>
          </h2>
        </div>
        {apps.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">
            No published apps
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                  App
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                  Version
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {apps.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-800">
                    {app.name ?? app.id}
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {app.version ? `v${app.version}` : "—"}
                  </td>
                  <td className="px-6 py-3">
                    {app.status && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {app.status}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {app.createdAt
                      ? new Date(app.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Moderation History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            Moderation History
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({history.length})
            </span>
          </h2>
        </div>
        {history.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">
            No moderation history
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {history.map((entry, i) => (
              <div key={entry.id ?? i} className="px-6 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800 capitalize">
                    {entry.action ?? "action"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {entry.createdAt
                      ? new Date(entry.createdAt).toLocaleString()
                      : "—"}
                  </span>
                </div>
                {entry.reason && (
                  <p className="text-gray-500 mt-0.5">{entry.reason}</p>
                )}
                {entry.moderator && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    by {entry.moderator}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
