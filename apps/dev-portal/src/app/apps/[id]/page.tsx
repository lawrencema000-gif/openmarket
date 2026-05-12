"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RolloutControls } from "@/components/rollout-controls";
import { BetaToggle } from "@/components/beta-toggle";

interface App {
  id: string;
  packageName: string;
  title: string;
  shortDescription: string;
  category: string;
  trustTier: string;
  iconUrl?: string;
  websiteUrl?: string;
  betaTrackEnabled?: boolean;
}

interface BetaInfo {
  appId: string;
  enabled: boolean;
  testerCount: number;
}

interface Release {
  id: string;
  versionName: string;
  versionCode: number;
  channel: string;
  status: string;
  rolloutPercentage?: number | null;
  rolloutStatus?: "live" | "paused" | "halted" | "completed";
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
  const [beta, setBeta] = useState<BetaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [appData, releaseData, betaData] = await Promise.all([
          api.get<App>(`/api/apps/${id}`),
          api.get<Release[]>(`/api/apps/${id}/releases`).catch(() => []),
          api.get<BetaInfo>(`/api/apps/${id}/beta`).catch(() => null),
        ]);
        setApp(appData);
        setReleases(releaseData);
        setBeta(betaData);
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

      <BetaToggle
        appId={id}
        initialEnabled={beta?.enabled ?? app.betaTrackEnabled ?? false}
        testerCount={beta?.testerCount}
      />

      {/* Releases */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-700">Releases</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/apps/${id}/statistics`}
              className="bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              View statistics
            </Link>
            <Link
              href={`/apps/${id}/data-safety`}
              className="bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Data safety
            </Link>
            <Link
              href={`/apps/${id}/translations`}
              className="bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Translations
            </Link>
            <Link
              href={`/apps/${id}/releases/new`}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Create Release
            </Link>
          </div>
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
                className="bg-white rounded-xl border border-gray-200 px-5 py-4"
              >
                <div className="flex items-start justify-between gap-3">
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
                  <p className="text-xs text-gray-400 shrink-0">
                    {new Date(release.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <RolloutControls
                  releaseId={release.id}
                  initialPercentage={release.rolloutPercentage ?? 100}
                  initialStatus={release.rolloutStatus ?? "live"}
                  enabled={
                    release.status === "published" ||
                    release.status === "staged_rollout"
                  }
                  onUpdated={(next) => {
                    setReleases((prev) =>
                      prev.map((r) =>
                        r.id === release.id
                          ? {
                              ...r,
                              rolloutPercentage: next.percentage,
                              rolloutStatus:
                                next.status as Release["rolloutStatus"],
                            }
                          : r,
                      ),
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
