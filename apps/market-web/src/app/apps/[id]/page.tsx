import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Card, CardHeader, CardTitle, CardContent,
  TrustBadge, Badge, Button, StarRating,
} from "@openmarket/ui";
import type { TrustBadgeType } from "@openmarket/ui";

interface Developer {
  id: string;
  name: string;
  trustLevel?: string;
  trustBadges?: TrustBadgeType[];
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
}

interface Review {
  id: string;
  rating: number;
  comment?: string;
  author?: string;
  createdAt?: string;
}

async function getApp(id: string): Promise<AppDetail | null> {
  try {
    return await apiFetch<AppDetail>(`/api/apps/${id}`);
  } catch {
    return null;
  }
}

async function getReviews(appId: string): Promise<Review[]> {
  try {
    return await apiFetch<Review[]>(`/api/apps/${appId}/reviews`);
  } catch {
    return [];
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const app = await apiFetch<AppDetail>(`/api/apps/${id}`);
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
  const [app, reviews] = await Promise.all([getApp(id), getReviews(id)]);

  if (!app) {
    notFound();
  }

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

          {/* Tabbed sections — About / Reviews / Permissions */}
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
            </section>

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

            {/* Reviews */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-100">
                Reviews
                {reviews.length > 0 && (
                  <span className="text-base font-normal text-gray-400 ml-2">({reviews.length})</span>
                )}
              </h2>

              {reviews.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                  </svg>
                  No reviews yet — be the first to review this app.
                </div>
              ) : (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <div key={review.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-500">
                            {(review.author ?? "A").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{review.author ?? "Anonymous"}</p>
                            <StarRating rating={review.rating} size="sm" />
                          </div>
                        </div>
                        {review.createdAt && (
                          <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                            {new Date(review.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                      </div>
                      {review.comment && (
                        <p className="text-sm text-gray-700 leading-relaxed">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
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
