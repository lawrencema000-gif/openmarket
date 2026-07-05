import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from "@/lib/site";
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
import { ReviewHighlights } from "@/components/review-highlights";
import { AntiFeaturesBlock } from "@/components/anti-features-block";
import { SimilarAppsRail } from "@/components/similar-apps-rail";
import { DataSafetyBlock } from "@/components/data-safety-block";
import { BetaJoinButton } from "@/components/beta-join-button";
import { PreRegisterButton } from "@/components/pre-register-button";
import { ExperimentEvents } from "@/components/experiment-events";
import { AffiliateRefCapture } from "@/components/affiliate-ref-capture";
import { InstallBar } from "@/components/install-bar";
import { PriceBadge } from "@/components/price-badge";
import { PurchaseButton } from "@/components/purchase-button";
import { IapRail } from "@/components/iap-rail";
import { LocalePicker } from "@/components/locale-picker";
import { PreviewVideosRail } from "@/components/preview-videos-rail";
import { getUIT } from "@/i18n/server";

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
  antiFeatures?: string[];
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
  // P2-H localization
  locale?: {
    requested: string | null;
    resolved: string;
    defaultLocale: string;
    available: string[];
  };
  // P2-G preview videos
  previewVideos?: Array<{
    id: string;
    videoUrl: string;
    posterUrl: string | null;
    label: string | null;
    durationSeconds: number | null;
  }>;
  // P3-O source-code transparency
  sourceCode?: {
    url: string | null;
    verified: boolean;
    verifiedAt: string | null;
    reproducibleVerified: boolean;
    reproducibleVerifiedAt: string | null;
    tier: "none" | "available" | "verified" | "reproducible";
  };
  // P3-B listing experiment
  experiment?: {
    experimentId: string;
    variantId: string;
    variantLabel: string;
  } | null;
  // P3-F parental controls (signed-in viewer only)
  parental?: {
    role: "child" | "parent";
    maxContentRating: "everyone" | "teen" | "mature";
    requiresPinUnlock: boolean;
  } | null;
  // P4-A pricing
  pricing?: {
    isPaid: boolean;
    price: {
      priceCents: number;
      currency: string;
      countryCode: string;
    } | null;
    refundWindowHours: number | null;
  } | null;
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

async function getApp(id: string, locale?: string): Promise<AppFetchResult> {
  try {
    const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
    const raw = await apiFetch<ApiAppResponse>(`/api/apps/${id}${query}`);
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
      <dt className="text-xs uppercase tracking-wide text-om-ink-soft font-semibold">
        {label}
      </dt>
      <dd className="mt-0.5 text-om-ink-mute">{value}</dd>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const raw = await apiFetch<ApiAppResponse>(`/api/apps/${id}`);
    const app = flattenApp(raw);
    const title = `${app.name ?? "App"} — ${SITE_NAME}`;
    const description =
      app.shortDescription ??
      `Android app ${app.packageName ?? "on OpenMarket"} — full transparency about permissions, security review, and developer track record.`;
    const canonical = `${SITE_URL}/apps/${id}`;
    const ogImage = app.iconUrl ?? DEFAULT_OG_IMAGE;
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        type: "website",
        url: canonical,
        siteName: SITE_NAME,
        title,
        description,
        images: [{ url: ogImage }],
      },
      twitter: {
        card: "summary",
        title,
        description,
        images: [ogImage],
      },
    };
  } catch {
    return { title: `App — ${SITE_NAME}` };
  }
}

export default async function AppDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const search = (await searchParams) ?? {};
  const locale = typeof search.locale === "string" ? search.locale : undefined;
  const [appResult, { t }] = await Promise.all([
    getApp(id, locale),
    getUIT(),
  ]);

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
        <p className="mt-6 text-sm text-om-ink-soft">
          <Link href="/" className="text-om-primary hover:text-om-primary">
            ← Back home
          </Link>
        </p>
      </div>
    );
  }

  const app = appResult.app;
  const dangerousPerms = app.dangerousPermissions ?? [];
  const normalPerms = (app.permissions ?? []).filter((p) => !dangerousPerms.includes(p));

  // Schema.org SoftwareApplication JSON-LD. Lets Google + Bing surface
  // rich results (icon, rating, version, OS) in search. Schema validates
  // against schema.org/SoftwareApplication.
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: app.name,
    description: app.shortDescription ?? app.description ?? undefined,
    operatingSystem: "Android",
    applicationCategory: app.category ?? "Mobile App",
    url: `${SITE_URL}/apps/${id}`,
    image: app.iconUrl ?? undefined,
    softwareVersion: app.version ?? app.latestRelease?.versionName ?? undefined,
    fileSize: app.latestArtifact?.fileSizeFormatted ?? undefined,
    offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
    author: app.developer
      ? {
          "@type": "Organization",
          name: app.developer.name,
        }
      : undefined,
    aggregateRating:
      app.rating && app.reviewCount
        ? {
            "@type": "AggregateRating",
            ratingValue: app.rating,
            reviewCount: app.reviewCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* P3-B: experiment view-event hook. Renders nothing; fires
          a POST on mount + sets the visitor cookie. */}
      {app.experiment ? (
        <ExperimentEvents appId={app.id} experiment={app.experiment} />
      ) : null}
      {/* P4-H: affiliate ?ref= capture. Suspense-wrapped because it reads
          useSearchParams. Renders nothing. */}
      <Suspense fallback={null}>
        <AffiliateRefCapture appId={app.id} />
      </Suspense>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
        <nav className="flex items-center gap-1.5 text-sm text-om-ink-soft">
          <Link href="/" className="hover:text-om-ink transition-colors">Home</Link>
          <svg className="w-4 h-4 text-om-line" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          <Link href="/search" className="hover:text-om-ink transition-colors">Browse</Link>
          <svg className="w-4 h-4 text-om-line" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-om-ink font-medium truncate max-w-[200px]">{app.name}</span>
        </nav>
        {app.locale && app.locale.available.length > 0 && (
          <LocalePicker
            defaultLocale={app.locale.defaultLocale}
            resolved={app.locale.resolved}
            available={app.locale.available}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-10">
        {/* Main content */}
        <div className="space-y-8">

          {/* App header */}
          <div className="flex items-start gap-6">
            {app.iconUrl ? (
              <img
                src={app.iconUrl}
                alt={app.name}
                className="w-20 h-20 rounded-2xl object-cover shadow-md shrink-0 border border-om-line-soft"
              />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-om-primary/10 to-om-primary/20 rounded-2xl shrink-0 flex items-center justify-center border border-om-primary/20">
                <svg className="w-8 h-8 text-om-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3h3m-3 3h3" />
                </svg>
              </div>
            )}

            <div className="flex-1 min-w-0 space-y-2">
              <h1 className="text-3xl font-bold text-om-ink tracking-tight leading-tight">{app.name}</h1>

              <div className="flex items-center gap-1.5 text-sm text-om-ink-soft">
                <span>by</span>
                <Link
                  href={`/developers/${app.developer.id}`}
                  className="text-om-primary hover:text-om-primary hover:underline font-medium"
                >
                  {app.developer.name}
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {app.category && (
                  <Badge variant="secondary">{app.category}</Badge>
                )}
                {app.version && (
                  <span className="text-xs text-om-ink-soft font-mono bg-om-surface-tint border border-om-line px-2 py-0.5 rounded-md">
                    v{app.version}
                  </span>
                )}
                {app.trustBadges && app.trustBadges.length > 0 && app.trustBadges.map((badge) => (
                  <TrustBadge key={badge} type={badge} />
                ))}
                {/* Source-code transparency tier (P3-O). Rendered alongside
                    other trust badges. `available` (URL only) stays as a
                    link in the App Info card and gets no badge here. */}
                {app.sourceCode?.tier === "reproducible" && (
                  <TrustBadge type="reproducible-build" />
                )}
                {app.sourceCode?.tier === "verified" && (
                  <TrustBadge type="source-verified" />
                )}
              </div>

              {(app.rating !== undefined) && (
                <div className="flex items-center gap-2">
                  <StarRating rating={app.rating} count={app.reviewCount} size="sm" />
                </div>
              )}
            </div>
          </div>

          {/* Anti-features disclosure block — only shown when present.
              Lives BETWEEN the app header and the download action bar so
              the user sees the disclosure before they install. */}
          {app.antiFeatures && app.antiFeatures.length > 0 && (
            <AntiFeaturesBlock slugs={app.antiFeatures} />
          )}

          {/* Data safety declaration. Always rendered — the component
              handles "not yet declared" + "no data collected" states
              internally. Pairs with anti-features as the two trust
              surfaces above the install button. */}
          <DataSafetyBlock appId={app.id} />

          {/* Pre-registration CTA — only when the developer has flipped
              preRegistrationEnabled. Mutually exclusive with the regular
              install bar in practice. */}
          <PreRegisterButton appId={app.id} />

          {/* Beta program join CTA. Renders nothing when the developer
              hasn't enabled the program or there's no beta release yet. */}
          <BetaJoinButton appId={app.id} />

          {/* Price badge + purchase button (P4-A / P4-A-2). Renders
              only when the app has an active pricing row for the
              viewer's country / default. PurchaseButton talks to
              Stripe via the adapter — when the adapter is the Noop
              default, the API returns a note and the button shows
              the "Stripe not configured" hint inline. */}
          {app.pricing?.isPaid && app.pricing.price ? (
            <div className="flex flex-wrap items-end gap-4">
              <PriceBadge
                price={app.pricing.price}
                refundWindowHours={app.pricing.refundWindowHours}
              />
              <PurchaseButton appId={app.id} price={app.pricing.price} />
            </div>
          ) : null}

          {/* Download action bar — P3-F gates installs through a
              parental PIN dialog when the API flags requiresPinUnlock. */}
          <InstallBar
            appId={app.id}
            appTitle={app.name}
            apkUrl={app.apkUrl}
            sizeLabel={app.sizeBytes ? formatBytes(app.sizeBytes) : null}
            packageName={app.packageName ?? null}
            parental={app.parental ?? null}
          >
            <div className="ml-auto flex items-center gap-2">
              <WishlistHeart appId={app.id} variant="labeled" />
              <LibraryButton appId={app.id} />
            </div>
          </InstallBar>

          {/* In-app purchases rail (P4-B) — fetched client-side; renders
              nothing when the app has no active IAP products. */}
          <IapRail appId={app.id} />

          {/* Preview videos — rendered above screenshots when present. */}
          {app.previewVideos && app.previewVideos.length > 0 && (
            <PreviewVideosRail videos={app.previewVideos} />
          )}

          {/* Screenshots */}
          {app.screenshots && app.screenshots.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-om-ink mb-4">{t("appDetail.screenshots")}</h2>
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
                      className="h-60 w-auto rounded-xl object-cover shrink-0 snap-start border border-om-line shadow-sm"
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
              <h2 className="text-lg font-semibold text-om-ink mb-3 pb-2 border-b border-om-line-soft">{t("appDetail.about")}</h2>
              {app.description ? (
                <p className="text-om-ink-mute whitespace-pre-wrap leading-relaxed text-[15px]">{app.description}</p>
              ) : app.shortDescription ? (
                <p className="text-om-ink-mute leading-relaxed">{app.shortDescription}</p>
              ) : (
                <p className="text-om-ink-soft text-sm italic">No description provided.</p>
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
                      value={<code className="text-xs font-mono text-om-ink-mute">{app.packageName}</code>}
                    />
                  ) : null}
                </dl>
              )}
            </section>

            {/* What's new (P1-E) */}
            {app.latestRelease?.releaseNotes ? (
              <section>
                <h2 className="text-lg font-semibold text-om-ink mb-3 pb-2 border-b border-om-line-soft">
                  What's new in {app.latestRelease.versionName}
                </h2>
                <ReleaseNotes markdown={app.latestRelease.releaseNotes} />
                {app.recentReleases && app.recentReleases.length > 1 ? (
                  <details className="mt-4 text-sm">
                    <summary className="cursor-pointer text-om-primary hover:text-om-primary font-medium">
                      Version history
                    </summary>
                    <ul className="mt-3 space-y-4 border-l-2 border-om-line-soft pl-4">
                      {app.recentReleases.slice(1).map((r) => (
                        <li key={r.id}>
                          <p className="font-medium text-om-ink">
                            v{r.versionName} <span className="text-om-ink-soft font-normal text-xs">· {fmtRelative(r.publishedAt ?? r.createdAt)}</span>
                          </p>
                          {r.releaseNotes ? (
                            <div className="mt-1">
                              <ReleaseNotes markdown={r.releaseNotes} />
                            </div>
                          ) : (
                            <p className="text-om-ink-soft italic text-xs mt-1">No notes for this release.</p>
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
                <h2 className="text-lg font-semibold text-om-ink mb-3 pb-2 border-b border-om-line-soft">
                  {t("appDetail.permissions")}
                </h2>
                <div className="space-y-4">
                  {dangerousPerms.length > 0 && (
                    <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                        <h3 className="text-sm font-semibold text-red-700">{t("appDetail.dangerousPermissions")}</h3>
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
                    <div className="rounded-xl bg-om-surface-tint border border-om-line p-4">
                      <h3 className="text-sm font-semibold text-om-ink-mute mb-3">{t("appDetail.standardPermissions")}</h3>
                      <ul className="space-y-1.5">
                        {normalPerms.map((perm) => (
                          <li key={perm} className="flex items-center gap-2 text-sm text-om-ink-mute">
                            <span className="w-1.5 h-1.5 rounded-full bg-om-ink-soft shrink-0" />
                            <code className="font-mono text-xs">{perm}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Review highlights (P3-D) — auto-extracted chips above
                the full reviews surface. Renders nothing if there
                aren't enough mentions to clear the threshold. */}
            <ReviewHighlights appId={app.id} />

            {/* Reviews — full P1-G surface (histogram, sort, filter, helpful, report, write) */}
            <ReviewsSection appId={app.id} />

            {/* Similar apps — content-based recommendations driven by
                category + anti-feature overlap. Reproducible from the
                app's own metadata (no opaque ML). */}
            <SimilarAppsRail appId={app.id} />
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Developer card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-om-ink-soft uppercase tracking-wider">
                Developer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link
                href={`/developers/${app.developer.id}`}
                className="flex items-center gap-3 group"
              >
                <div className="w-10 h-10 rounded-xl bg-om-primary/10 border border-om-primary/20 flex items-center justify-center text-om-primary font-bold text-base">
                  {app.developer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-om-ink group-hover:text-om-primary transition-colors text-sm">
                    {app.developer.name}
                  </p>
                  {app.developer.trustLevel && (
                    <p className="text-xs text-om-ink-soft">{app.developer.trustLevel}</p>
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
                className="block text-sm text-om-primary hover:text-om-primary font-medium"
              >
                View all apps →
              </Link>
            </CardContent>
          </Card>

          {/* App info card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-om-ink-soft uppercase tracking-wider">
                App Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {app.version && (
                  <div className="flex justify-between items-center">
                    <dt className="text-om-ink-soft">Version</dt>
                    <dd className="font-medium text-om-ink font-mono text-xs bg-om-surface-tint px-2 py-0.5 rounded">v{app.version}</dd>
                  </div>
                )}
                {app.category && (
                  <div className="flex justify-between items-center">
                    <dt className="text-om-ink-soft">Category</dt>
                    <dd className="font-medium text-om-ink">{app.category}</dd>
                  </div>
                )}
                {app.sizeBytes && (
                  <div className="flex justify-between items-center">
                    <dt className="text-om-ink-soft">Size</dt>
                    <dd className="font-medium text-om-ink">{formatBytes(app.sizeBytes)}</dd>
                  </div>
                )}
                {app.packageName && (
                  <div className="pt-2 border-t border-om-line-soft">
                    <dt className="text-om-ink-soft mb-1">Package</dt>
                    <dd className="font-mono text-xs text-om-ink-mute break-all bg-om-surface-tint px-2 py-1.5 rounded-lg">
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
