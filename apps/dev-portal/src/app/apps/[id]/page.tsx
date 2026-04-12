"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface App {
  id: string;
  packageName: string;
  title: string;
  shortDescription: string;
  category: string;
  trustTier: string;
  iconUrl?: string;
  websiteUrl?: string;
}

interface Release {
  id: string;
  versionName: string;
  versionCode: number;
  channel: string;
  status: string;
  createdAt: string;
}

export default function AppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [app, setApp] = useState<App | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [appData, releaseData] = await Promise.all([
          api.get<App>(`/api/apps/${id}`),
          api.get<Release[]>(`/api/apps/${id}/releases`).catch(() => []),
        ]);
        setApp(appData);
        setReleases(releaseData);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load app");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;
  if (error)
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  if (!app) return null;

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        {app.iconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.iconUrl}
            alt={`${app.title} icon`}
            className="w-16 h-16 rounded-xl border border-gray-200 object-cover shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{app.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{app.packageName}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs capitalize text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
              {app.category.replace(/_/g, " ")}
            </span>
            <span className="text-xs font-medium capitalize text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
              {app.trustTier}
            </span>
          </div>
        </div>
      </div>

      {/* Listing info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Listing Info</h2>
        {app.shortDescription && (
          <p className="text-sm text-gray-600">{app.shortDescription}</p>
        )}
        {app.websiteUrl && (
          <a
            href={app.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            {app.websiteUrl}
          </a>
        )}
      </div>

      {/* Releases */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Releases</h2>
          <Link
            href={`/apps/${id}/releases/new`}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg px-3 py-2 transition-colors"
          >
            Create Release
          </Link>
        </div>

        {releases.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-500 mb-3">No releases yet.</p>
            <Link
              href={`/apps/${id}/releases/new`}
              className="text-sm text-blue-600 hover:underline"
            >
              Upload your first release
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {releases.map((release) => (
              <li
                key={release.id}
                className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-sm text-gray-900">
                    v{release.versionName}{" "}
                    <span className="text-xs text-gray-400">
                      (code {release.versionCode})
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">
                    {release.channel} · {release.status}
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(release.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
