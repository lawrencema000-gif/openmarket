import type { Metadata } from "next";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import {
  PageHeader,
  AppCard,
  AppCardSkeleton,
  EmptyState,
  Badge,
} from "@openmarket/ui";
import { ANTI_FEATURES } from "@openmarket/contracts/anti-features";

// Storefront filter UX: only the labels users typically want to *exclude*.
// The full taxonomy is on /anti-features.
const EXCLUDABLE_FILTERS: Array<{ slug: string; label: string }> = [
  { slug: "tracking", label: "Tracking" },
  { slug: "ads", label: "Ads" },
  { slug: "knownVuln", label: "Vulnerable" },
  { slug: "nonFreeNet", label: "Closed network" },
];

/**
 * One Meilisearch document as returned by GET /api/search — the shape
 * indexed in services/api/src/lib/search-index.ts. Field names must
 * track that doc builder, not an imagined REST resource.
 */
interface SearchHit {
  id: string;
  packageName: string;
  title: string;
  shortDescription?: string;
  iconUrl?: string;
  category?: string;
  developerName?: string;
  trustTier?: string;
  isExperimental?: boolean;
  /** avgRating × 100 (e.g. 437 = 4.37 stars); 0 when unrated. */
  ratingScore?: number;
}

interface SearchResult {
  hits: SearchHit[];
  totalHits: number;
  page: number;
  limit: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

// Values MUST match the API's trustTier enum (standard | enhanced |
// experimental) — the old chips sent "verified"/"new", which the API
// rejected with a 400, so those filters always showed "No apps found".
// Tier meanings are defined on /how-we-review.
const TRUST_TIERS = [
  { value: "", label: "All" },
  { value: "enhanced", label: "Enhanced trust" },
  { value: "standard", label: "Standard" },
  { value: "experimental", label: "Experimental" },
];

async function searchApps(params: Record<string, string>): Promise<SearchResult> {
  const qs = new URLSearchParams(params).toString();
  return apiFetch<SearchResult>(`/api/search?${qs}`);
}

async function getCategories(): Promise<Category[]> {
  try {
    // Featured set only. The full 40+ taxonomy (including the granular
    // "Games: X" subcategories) overwhelmed the chip row with two
    // overlapping category systems side by side; the complete directory
    // lives at /categories.
    return await apiFetch<Category[]>("/api/categories?featured=true");
  } catch {
    return [];
  }
}

interface PopularQuery {
  query: string;
  hits: number;
  lastResultCount: number | null;
}

async function getPopularQueries(): Promise<PopularQuery[]> {
  try {
    const r = await apiFetch<{ items: PopularQuery[] }>(
      "/api/search/popular?window=24h&limit=12",
    );
    return r.items;
  } catch {
    return [];
  }
}

function buildSearchUrl(base: Record<string, string>, overrides: Record<string, string>) {
  const merged = { ...base, ...overrides };
  // Remove empty strings
  Object.keys(merged).forEach((k) => { if (!merged[k]) delete merged[k]; });
  const qs = new URLSearchParams(merged).toString();
  return `/search${qs ? `?${qs}` : ""}`;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q } = await searchParams;
  // Bare titles — the root layout's template appends "— OpenMarket".
  return {
    title: q ? `Search: "${q}"` : "All apps",
    description: "Search and discover Android apps on OpenMarket",
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const category = params.category ?? "";
  const trustTier = params.trustTier ?? "";
  const excludeAntiFeature = params.excludeAntiFeature ?? "";
  const page = params.page ?? "1";

  const excludedSet = new Set(
    excludeAntiFeature
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const baseParams = {
    ...(q && { q }),
    ...(category && { category }),
    ...(trustTier && { trustTier }),
    ...(excludeAntiFeature && { excludeAntiFeature }),
  };

  // Always call the API: with a query it's full-text search (Meilisearch);
  // without one the API serves BROWSE mode straight from Postgres (newest
  // first, same filters), so category/trust/anti-feature entry points work
  // even before the search index has ever been built.
  const [categories, searchResult, popularQueries] = await Promise.allSettled([
    getCategories(),
    searchApps({ ...baseParams, page, limit: "21" }),
    !q ? getPopularQueries() : Promise.resolve([] as PopularQuery[]),
  ]);

  const cats = categories.status === "fulfilled" ? categories.value : [];
  // The chip row shows the FEATURED set; if the active category filter came
  // from elsewhere (a category page link), append it so the active filter is
  // always visible and removable.
  if (category && !cats.some((c) => c.slug === category)) {
    cats.push({
      id: `active-${category}`,
      slug: category,
      name: category
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    });
  }
  const popular =
    popularQueries.status === "fulfilled" ? popularQueries.value : [];
  const result = searchResult.status === "fulfilled" ? searchResult.value : null;
  const apps = result?.hits ?? [];
  const total = result?.totalHits ?? 0;
  const currentPage = result?.page ?? 1;
  const limit = result?.limit ?? 21;
  const totalPages = Math.ceil(total / limit);

  const pageTitle = q
    ? `Results for "${q}"`
    : category
    ? cats.find((c) => c.slug === category)?.name ?? "All apps"
    : "All apps";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title={pageTitle}
        description={total > 0 ? `${total.toLocaleString()} app${total !== 1 ? "s" : ""} found` : undefined}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: q ? "Search" : "Browse" },
        ]}
      />

      {/* Filter chips row */}
      <div className="space-y-3">
        {/* Category chips */}
        {cats.length > 0 && (
          <div className="flex flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-visible gap-2 items-center pb-1 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
            <span className="text-xs font-semibold text-om-ink-soft uppercase tracking-wider mr-1">Category:</span>
            <Link
              href={buildSearchUrl(baseParams, { category: "", page: "" })}
              aria-current={!category ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-medium border transition-all duration-150 ${
                !category
                  ? "bg-om-primary text-white border-om-primary shadow-sm"
                  : "bg-om-surface text-om-ink-mute border-om-line hover:border-om-primary/40 hover:text-om-primary"
              }`}
            >
              All
            </Link>
            {cats.map((cat) => (
              <Link
                key={cat.id}
                href={buildSearchUrl(baseParams, { category: cat.slug, page: "" })}
                aria-current={category === cat.slug ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-medium border transition-all duration-150 ${
                  category === cat.slug
                    ? "bg-om-primary text-white border-om-primary shadow-sm"
                    : "bg-om-surface text-om-ink-mute border-om-line hover:border-om-primary/40 hover:text-om-primary"
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        )}

        {/* Trust tier chips */}
        <div className="flex flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-visible gap-2 items-center pb-1 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
          <span className="text-xs font-semibold text-om-ink-soft uppercase tracking-wider mr-1">Trust:</span>
          {TRUST_TIERS.map((tier) => (
            <Link
              key={tier.value}
              href={buildSearchUrl(baseParams, { trustTier: tier.value, page: "" })}
              aria-current={trustTier === tier.value ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-medium border transition-all duration-150 ${
                trustTier === tier.value
                  ? "bg-om-primary text-white border-om-primary shadow-sm"
                  : "bg-om-surface text-om-ink-mute border-om-line hover:border-om-primary/40 hover:text-om-primary"
              }`}
            >
              {tier.label}
            </Link>
          ))}
        </div>

        {/* Hide-by-anti-feature chips. NSFW is excluded by default at the
            API layer; surface the four common opt-outs here. Click toggles
            the slug in/out of the excludeAntiFeature comma list. */}
        <div className="flex flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-visible gap-2 items-center pb-1 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
          <span className="text-xs font-semibold text-om-ink-soft uppercase tracking-wider mr-1">
            Hide:
          </span>
          {EXCLUDABLE_FILTERS.map((f) => {
            const active = excludedSet.has(f.slug);
            const next = active
              ? [...excludedSet].filter((s) => s !== f.slug)
              : [...excludedSet, f.slug];
            const meta = ANTI_FEATURES[f.slug];
            return (
              <Link
                key={f.slug}
                href={buildSearchUrl(baseParams, {
                  excludeAntiFeature: next.join(","),
                  page: "",
                })}
                title={meta?.description ?? f.label}
                className={`shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-medium border transition-all duration-150 ${
                  active
                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                    : "bg-om-surface text-om-ink-mute border-om-line hover:border-rose-300 hover:text-rose-700"
                }`}
              >
                {active ? "✓ " : ""}
                {f.label}
              </Link>
            );
          })}
          <Link
            href="/anti-features"
            className="ml-1 text-xs text-om-primary hover:text-om-primary"
          >
            What's this?
          </Link>
        </div>
      </div>

      {/* API error notice — distinguish "you followed a stale/bad filter
          link" (400) from a real outage so the copy never blames the API for
          a bad URL. */}
      {searchResult.status === "rejected" && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <svg className="w-4 h-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {searchResult.reason instanceof ApiError &&
          searchResult.reason.status === 400 ? (
            <span>
              That filter isn&apos;t valid (this can happen via an outdated
              link).{" "}
              <Link href="/search" className="underline font-medium">
                Clear filters and browse all apps
              </Link>
              .
            </span>
          ) : (
            <span>
              Could not load results — the API may be unavailable. Please try
              again later.
            </span>
          )}
        </div>
      )}

      {/* Results grid */}
      {apps.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <Link key={app.id} href={`/apps/${app.id}`} className="block">
              <AppCard
                id={app.id}
                title={app.title}
                iconUrl={app.iconUrl ?? ""}
                developerName={app.developerName || "Unknown Developer"}
                shortDescription={app.shortDescription ?? ""}
                category={app.category ?? ""}
                trustTier={app.trustTier ?? "new"}
                isExperimental={app.isExperimental}
                rating={app.ratingScore ? app.ratingScore / 100 : undefined}
                variant="grid"
              />
            </Link>
          ))}
        </div>
      ) : searchResult.status === "fulfilled" ? (
        <>
          <EmptyState
            icon={
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            }
            title="No apps found"
            description={
              q
                ? `No results for "${q}". Try a different word, or browse by category instead.`
                : category || trustTier || excludeAntiFeature
                  ? "No apps match these filters. Try removing one."
                  : "The catalog is just getting started — nothing has been published yet. Check back soon."
            }
            action={
              <Link
                href={
                  category || trustTier || excludeAntiFeature || q
                    ? "/search"
                    : "/categories"
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-om-line bg-om-surface text-sm font-medium text-om-ink-mute hover:bg-om-surface-tint transition-colors"
              >
                {category || trustTier || excludeAntiFeature || q
                  ? "Clear all filters"
                  : "Browse categories"}
              </Link>
            }
          />

          {/* Popular queries panel — only shown on the bare empty state
              (no q in URL) so we don't push it on a user who's
              actively searching for something. Privacy floor: queries
              with fewer than 3 distinct submitters are filtered out
              server-side, so a one-off accidental PII string never
              surfaces here. */}
          {!q && popular.length > 0 && (
            <div className="mt-4">
              <h2 className="text-sm font-semibold text-om-ink mb-3">
                What others are searching for
              </h2>
              <div className="flex flex-wrap gap-2">
                {popular.map((p) => (
                  <Link
                    key={p.query}
                    href={`/search?q=${encodeURIComponent(p.query)}`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-om-surface border border-om-line text-sm text-om-ink-mute hover:border-om-primary/40 hover:text-om-primary transition-colors"
                  >
                    <span>{p.query}</span>
                    {p.lastResultCount != null && (
                      <span className="text-xs text-om-ink-soft">
                        {p.lastResultCount} result{p.lastResultCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
              <p className="text-xs text-om-ink-soft mt-2">
                Last 24 hours · only queries with multiple submitters appear
              </p>
            </div>
          )}
        </>
      ) : null}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-4">
          {/* Previous */}
          {currentPage > 1 ? (
            <Link
              href={buildSearchUrl(baseParams, { page: String(currentPage - 1) })}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-om-line bg-om-surface text-sm text-om-ink-mute hover:bg-om-surface-tint hover:border-om-line transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 19.5-7.5-7.5 7.5-7.5" />
              </svg>
              Prev
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-om-line cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 19.5-7.5-7.5 7.5-7.5" />
              </svg>
              Prev
            </span>
          )}

          {/* Page numbers */}
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i + 1;
            } else if (currentPage <= 4) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 3) {
              pageNum = totalPages - 6 + i;
            } else {
              pageNum = currentPage - 3 + i;
            }
            return pageNum;
          }).map((pageNum) => (
            <Link
              key={pageNum}
              href={buildSearchUrl(baseParams, { page: String(pageNum) })}
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                pageNum === currentPage
                  ? "bg-om-primary text-white shadow-sm"
                  : "border border-om-line bg-om-surface text-om-ink-mute hover:bg-om-surface-tint hover:border-om-line"
              }`}
            >
              {pageNum}
            </Link>
          ))}

          {/* Next */}
          {currentPage < totalPages ? (
            <Link
              href={buildSearchUrl(baseParams, { page: String(currentPage + 1) })}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-om-line bg-om-surface text-sm text-om-ink-mute hover:bg-om-surface-tint hover:border-om-line transition-colors"
            >
              Next
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-om-line cursor-not-allowed">
              Next
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
