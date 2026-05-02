import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import {
  Card, CardHeader, CardTitle, CardContent,
  TrustBadge, Badge, Button, StarRating,
  ServiceUnavailable,
} from "@openmarket/ui";
import type { TrustBadgeType } from "@openmarket/ui";
import { LibraryButton } from "@/components/library-button";
import { WishlistHeart } from "@/components/wishlist-heart";
import { ReleaseNotes } from "@/components/release-notes";
import { ReviewsSection } from "@/components/reviews-section";

interface Developer {
  id: string;
  name: string;
  trustLevel?: string;
  trustBadges?: TrustBadgeType[];
}

interface ReleaseSummary {
  id: string;
  versionCode: number;
  versionName: string;
  channel: string;
  releaseNotes: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface ArtifactSummary {
  id: string;
  fileSize: number;
  fileSizeFormatted: string;
  sha256: string;
  minSdk: number;
  targetSdk: number;
  abis: string[];
}

interface AppDetail {
  id: string;
  name: string;
  description?: string;
  shortDescription?: string;
  iconUrl?: string;
  screenshots?: string[];
  permissions?: string[];
  dangerousPermissions?: string[];
  trustBadges?: TrustBadgeType[];
  version?: string;
  packageName?: string;
  apkUrl?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  sizeBytes?: number;
  developer: Developer;
  // P1-D / P1-E enrichments
  latestRelease?: ReleaseSummary | null;
  latestArtifact?: ArtifactSummary | null;
  compatibility?: { requiresAndroid: string; architectures: string[] } | null;
  recentReleases?: ReleaseSummary[];
  updatedAt?: string;
}


type AppFetchResult =
  | { kind: "ok"; app: AppDetail }
  | { kind: "not-found" }
  | { kind: "unavailable"; reason: string };

/**
 * The API returns the raw apps row + a `currentListing` sub-object.
 * Our page renders flattened fields (`app.name`, `app.iconUrl`, etc.).
 * Map the API shape to the view shape here in one place.
 */
interface ApiAppResponse extends AppDetail {
  currentListing?: {
    title: string;
    shortDescription: string;
    fullDescription: string;
    category: string;
    iconUrl: string | null;
    screenshots: string[] | null;
    contentRating: string | null;
  } | null;
}

function flattenApp(raw: ApiAppResponse): AppDetail {
  const listing = raw.currentListing;
  const dev = raw.developer as Developer & { displayName?: string };
  return {
    ...raw,
    name: raw.name ?? listing?.title ?? raw.packageName ?? "",
    description: raw.description ?? listing?.fullDescription,
    shortDescription: raw.shortDescription ?? listing?.shortDescription,
    iconUrl: raw.iconUrl ?? listing?.iconUrl ?? undefined,
    screenshots: raw.screenshots ?? listing?.screenshots ?? undefined,
    category: raw.category ?? listing?.category,
    developer: {
      ...dev,
      name: dev?.name ?? dev?.displayName ?? "Unknown developer",
    },
  };
}

async function getApp(id: string): Promise<AppFetchResult> {
  try {
    const raw = await apiFetch<ApiAppResponse>(`/api/apps/${id}`);
    return { kind: "ok", app: flattenApp(raw) };
  } catch (err) {
    if (err instanceof ApiError && err.isUnreachable) {
      return { kind: "unavailable", reason: err.message };
    }
    if (err instanceof ApiError && err.isNotFound) {
      return { kind: "not-found" };
    }
    return { kind: "unavailable", reason: "Unknown error fetching app" };
  }
}

// Reviews are fetched client-side by <ReviewsSection> for live sort/filter.


function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function FactItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
        {label}
      </dt>
      <dd className="mt-0.5 text-gray-800">{value}</dd>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const raw = await apiFetch<ApiAppResponse>(`/api/apps/${id}`);
    const app = flattenApp(raw);
    return {
      title: `${app.name ?? "App"} — OpenMarket`,
      description: app.shortDescription ?? "Android app on OpenMarket",
    };
  } catch {
    return { title: "App — OpenMarket" };
  }
}

export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appResult = await getApp(id);

  if (appResult.kind === "not-found") {
    notFound();
  }

  if (appResult.kind === "unavailable") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <ServiceUnavailable
          title="We can't load this app right now"
          description="The OpenMarket API is temporarily unreachable. The page itself is fine — refresh in a minute, or check the status page if you're curious."
        />
        <p className="mt-6 text-sm text-gray-500">
          <Link href="/" className="text-blue-600 hover:text-blue-700">
            ← Back home
          </Link>
        </p>
      </div>
    );
  }

  const app = appResult.app;
  const dangerousPerms = app.dangerousPermissions ?? [];
  const normalPerms = (app.permissions ?? []).filter((p) => !dangerousPerms.includes(p));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-gray-900 transition-colors">Home</Link>
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <Link href="/search" className="hover:text-gray-900 transition-colors">Browse</Link>
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-gray-900 font-medium truncate max-w-[200px]">{app.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-10">
        {/* Main content */}
        <div className="space-y-8">

          {/* App header */}
          <div className="flex items-start gap-6">
            {app.iconUrl ? (
              <img
                src={app.iconUrl}
                alt={app.name}
                className="w-20 h-20 rounded-2xl object-cover shadow-md shrink-0 border border-gray-100"
              />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl shrink-0 flex items-center justify-center border border-blue-100">
                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3h3m-3 3h3" />
                </svg>
              </div>
            )}

            <div className="flex-1 min-w-0 space-y-2">
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-tight">{app.name}</h1>

              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <span>by</span>
                <Link
                  href={`/developers/${app.developer.id}`}
                  className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
                >
                  {app.developer.name}
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {app.category && (
                  <Badge variant="secondary">{app.category}</Badge>
                )}
                {app.version && (
                  <span className="text-xs text-gray-400 font-mono bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md">
                    v{app.version}
                  </span>
                )}
                {app.trustBadges && app.trustBadges.length > 0 && app.trustBadges.map((badge) => (
                  <TrustBadge key={badge} type={badge} />
                ))}
              </div>

              {(app.rating !== undefined) && (
                <div className="flex items-center gap-2">
                  <StarRating rating={app.rating} count={app.reviewCount} size="sm" />
                </div>
              )}
            </div>
          </div>

          {/* Download action bar */}
          <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
            <a
              href={app.apkUrl ?? "#"}
              download={app.apkUrl ? true : undefined}
              className={`inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm text-sm ${!app.apkUrl ? "opacity-50 pointer-events-none" : ""}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download APK
            </a>
            {app.sizeBytes && (
              <span className="text-sm text-blue-600 font-medium">{formatBytes(app.sizeBytes)}</span>
            )}
            {app.packageName && (
              <code className="text-xs text-blue-500 font-mono bg-blue-100/60 px-2 py-1 rounded-md">
                {app.packageName}
              </code>
            )}
            {!app.apkUrl && (
              <span className="text-xs text-amber-600 font-medium">APK not yet available</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <WishlistHeart appId={app.id} variant="labeled" />
              <LibraryButton appId={app.id} />
            </div>
          </div>

          {/* Screenshots */}
          {app.screenshots && app.screenshots.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Screenshots</h2>
              <div
                className="relative"
                style={{
                  maskImage: "linear-gradient(to right, transparent 0, black 20px, black calc(100% - 40px), transparent 100%)",
                  WebkitMaskImage: "linear-gradient(to right, transparent 0, black 20px, black calc(100% - 40px), transparent 100%)",
                }}
              >
                <div className="flex gap-3 overflow-x-auto pb-3 scroll-smooth snap-x snap-mandatory">
                  {app.screenshots.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Screenshot ${i + 1}`}
                      className="h-60 w-auto rounded-xl object-cover shrink-0 snap-start border border-gray-200 shadow-sm"
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Tabbed sections — About / What's new / Permissions / Reviews */}
          <div className="space-y-6">
            {/* About */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-100">About</h2>
              {app.description ? (
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-[15px]">{app.description}</p>
              ) : app.shortDescription ? (
                <p className="text-gray-700 leading-relaxed">{app.shortDescription}</p>
              ) : (
                <p className="text-gray-400 text-sm italic">No description provided.</p>
              )}

              {/* About this app — facts table (P1-D) */}
              {(app.latestRelease || app.latestArtifact) && (
                <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {app.latestRelease ? (
                    <>
                      <FactItem
                        label="Version"
                        value={`${app.latestRelease.versionName} (build ${app.latestRelease.versionCode})`}
                      />
                      <FactItem
                        label="Last updated"
                        value={fmtRelative(app.latestRelease.publishedAt ?? app.latestRelease.createdAt)}
                      />
                    </>
                  ) : null}
                  {app.latestArtifact ? (
                    <>
                      <FactItem
                        label="Download size"
                        value={app.latestArtifact.fileSizeFormatted}
                      />
                      {app.compatibility ? (
                        <FactItem
                          label="Requires"
                          value={app.compatibility.requiresAndroid}
                        />
                      ) : null}
                      <FactItem
                        label="Target SDK"
                        value={`API ${app.latestArtifact.targetSdk}`}
                      />
                      {app.compatibility && app.compatibility.architectures.length > 0 ? (
                        <FactItem
                          label="Architectures"
                          value={app.compatibility.architectures.join(", ")}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {app.packageName ? (
                    <FactItem
                      label="Package"
                      value={<code className="text-xs font-mono text-gray-700">{app.packageName}</code>}
                    />
                  ) : null}
                </dl>
              )}
            </section>

            {/* What's new (P1-E) */}
            {app.latestRelease?.releaseNotes ? (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-100">
                  What's new in {app.latestRelease.versionName}
                </h2>
                <ReleaseNotes markdown={app.latestRelease.releaseNotes} />
                {app.recentReleases && app.recentReleases.length > 1 ? (
                  <details className="mt-4 text-sm">
                    <summary className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">
                      Version history
                    </summary>
                    <ul className="mt-3 space-y-4 border-l-2 border-gray-100 pl-4">
                      {app.recentReleases.slice(1).map((r) => (
                        <li key={r.id}>
                          <p className="font-medium text-gray-900">
                            v{r.versionName} <span className="text-gray-500 font-normal text-xs">· {fmtRelative(r.publishedAt ?? r.createdAt)}</span>
                          </p>
                          {r.releaseNotes ? (
                            <div className="mt-1">
                              <ReleaseNotes markdown={r.releaseNotes} />
                            </div>
                          ) : (
                            <p className="text-gray-400 italic text-xs mt-1">No notes for this release.</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>
            ) : null}

            {/* Permissions */}
            {((app.permissions && app.permissions.length > 0) || dangerousPerms.length > 0) && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-100">
                  Permissions
                </h2>
                <div className="space-y-4">
                  {dangerousPerms.length > 0 && (
                    <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                        <h3 className="text-sm font-semibold text-red-700">Dangerous Permissions</h3>
                      </div>
                      <ul className="space-y-1.5">
                        {dangerousPerms.map((perm) => (
                          <li key={perm} className="flex items-center gap-2 text-sm text-red-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            <code className="font-mono text-xs">{perm}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {normalPerms.length > 0 && (
                    <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Standard Permissions</h3>
                      <ul className="space-y-1.5">
                        {normalPerms.map((perm) => (
                          <li key={perm} className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                            <code className="font-mono text-xs">{perm}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Reviews — full P1-G surface (histogram, sort, filter, helpful, report, write) */}
            <ReviewsSection appId={app.id} />
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Developer card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Developer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link
                href={`/developers/${app.developer.id}`}
                className="flex items-center gap-3 group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold text-base">
                  {app.developer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-sm">
                    {app.developer.name}
                  </p>
                  {app.developer.trustLevel && (
                    <p className="text-xs text-gray-400">{app.developer.trustLevel}</p>
                  )}
                </div>
              </Link>
              {app.developer.trustBadges && app.developer.trustBadges.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {app.developer.trustBadges.map((badge) => (
                    <TrustBadge key={badge} type={badge} />
                  ))}
                </div>
              )}
              <Link
                href={`/developers/${app.developer.id}`}
                className="block text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View all apps →
              </Link>
            </CardContent>
          </Card>

          {/* App info card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                App Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {app.version && (
                  <div className="flex justify-between items-center">
                    <dt className="text-gray-500">Version</dt>
                    <dd className="font-medium text-gray-900 font-mono text-xs bg-gray-50 px-2 py-0.5 rounded">v{app.version}</dd>
                  </div>
                )}
                {app.category && (
                  <div className="flex justify-between items-center">
                    <dt className="text-gray-500">Category</dt>
                    <dd className="font-medium text-gray-900">{app.category}</dd>
                  </div>
                )}
                {app.sizeBytes && (
                  <div className="flex justify-between items-center">
                    <dt className="text-gray-500">Size</dt>
                    <dd className="font-medium text-gray-900">{formatBytes(app.sizeBytes)}</dd>
                  </div>
                )}
                {app.packageName && (
                  <div className="pt-2 border-t border-gray-100">
                    <dt className="text-gray-500 mb-1">Package</dt>
                    <dd className="font-mono text-xs text-gray-700 break-all bg-gray-50 px-2 py-1.5 rounded-lg">
                      {app.packageName}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
