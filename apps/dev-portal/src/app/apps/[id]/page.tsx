"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RolloutControls } from "@/components/rollout-controls";
import { BetaToggle } from "@/components/beta-toggle";
import { PreRegistrationToggle } from "@/components/pre-registration-toggle";
import { FamilySharingToggle } from "@/components/family-sharing-toggle";

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
  preRegistrationEnabled?: boolean;
  familySharingEnabled?: boolean;
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

  if (loading) return <div className="text-sm text-om-ink-soft">Loading…</div>;
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
            className="w-16 h-16 rounded-xl border border-om-line object-cover shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-om-ink truncate">{app.title}</h1>
          <p className="text-sm text-om-ink-soft mt-0.5">{app.packageName}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs capitalize text-om-ink-mute bg-om-line-soft rounded-full px-2 py-0.5">
              {app.category.replace(/_/g, " ")}
            </span>
            <span className="text-xs font-medium capitalize text-om-primary bg-om-primary/10 border border-om-primary/25 rounded-full px-2 py-0.5">
              {app.trustTier}
            </span>
          </div>
        </div>
      </div>

      {/* Listing info */}
      <div className="bg-om-surface rounded-xl border border-om-line p-5 space-y-3">
        <h2 className="text-sm font-semibold text-om-ink-mute">Listing Info</h2>
        {app.shortDescription && (
          <p className="text-sm text-om-ink-mute">{app.shortDescription}</p>
        )}
        {app.websiteUrl && (
          <a
            href={app.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-om-primary hover:underline"
          >
            {app.websiteUrl}
          </a>
        )}
      </div>

      <PreRegistrationToggle
        appId={id}
        initialEnabled={app.preRegistrationEnabled ?? false}
      />

      <BetaToggle
        appId={id}
        initialEnabled={beta?.enabled ?? app.betaTrackEnabled ?? false}
        testerCount={beta?.testerCount}
      />

      <FamilySharingToggle
        appId={id}
        initialEnabled={app.familySharingEnabled ?? false}
      />

      {/* Releases */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-om-ink-mute">Releases</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/apps/${id}/live`}
              className="bg-om-surface border border-om-line hover:border-violet-300 text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors inline-flex items-center gap-1.5"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 animate-ping" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </Link>
            <Link
              href={`/apps/${id}/statistics`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              View statistics
            </Link>
            <Link
              href={`/apps/${id}/data-safety`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Data safety
            </Link>
            <Link
              href={`/apps/${id}/translations`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Translations
            </Link>
            <Link
              href={`/apps/${id}/crashes`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Crashes
            </Link>
            <Link
              href={`/apps/${id}/preview-videos`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Preview videos
            </Link>
            <Link
              href={`/apps/${id}/distribution`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Distribution
            </Link>
            <Link
              href={`/apps/${id}/promo-codes`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Promo codes
            </Link>
            <Link
              href={`/apps/${id}/experiments`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Experiments
            </Link>
            <Link
              href={`/apps/${id}/pricing`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Pricing
            </Link>
            <Link
              href={`/apps/${id}/subscription`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Subscription
            </Link>
            <Link
              href={`/apps/${id}/iap`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              In-app products
            </Link>
            <Link
              href={`/apps/${id}/revenue`}
              className="bg-om-surface border border-om-line hover:border-om-line text-om-ink-mute text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Revenue
            </Link>
            <Link
              href={`/apps/${id}/releases/new`}
              className="bg-om-primary hover:bg-om-primary-deep text-white text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              Create Release
            </Link>
          </div>
        </div>

        {releases.length === 0 ? (
          <div className="bg-om-surface rounded-xl border border-dashed border-om-line p-8 text-center">
            <p className="text-sm text-om-ink-soft mb-3">No releases yet.</p>
            <Link
              href={`/apps/${id}/releases/new`}
              className="text-sm text-om-primary hover:underline"
            >
              Upload your first release
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {releases.map((release) => (
              <li
                key={release.id}
                className="bg-om-surface rounded-xl border border-om-line px-5 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm text-om-ink">
                      v{release.versionName}{" "}
                      <span className="text-xs text-om-ink-soft">
                        (code {release.versionCode})
                      </span>
                    </p>
                    <p className="text-xs text-om-ink-soft mt-0.5 capitalize">
                      {release.channel} · {release.status}
                    </p>
                  </div>
                  <p className="text-xs text-om-ink-soft shrink-0">
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
