import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
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

interface AppListing {
  id: string;
  name: string;
  shortDescription?: string;
  iconUrl?: string;
  category?: string;
  trustTier?: string;
  isExperimental?: boolean;
  rating?: number;
  developer?: {
    id: string;
    name: string;
  };
}

interface SearchResult {
  apps: AppListing[];
  total: number;
  page: number;
  limit: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

const TRUST_TIERS = [
  { value: "", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "experimental", label: "Experimental" },
  { value: "new", label: "New" },
];

async function searchApps(params: Record<string, string>): Promise<SearchResult> {
  const qs = new URLSearchParams(params).toString();
  return apiFetch<SearchResult>(`/api/search?${qs}`);
}

async function getCategories(): Promise<Category[]> {
  try {
    return await apiFetch<Category[]>("/api/categories");
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
  return {
    title: q ? `"${q}" — Search OpenMarket` : "Browse Apps — OpenMarket",
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

  // The search route requires a non-empty `q`, so when no query is given
  // we skip the API call and just render the empty-state. Filtering still
  // works via category + anti-feature URL params.
  const [categories, searchResult] = await Promise.allSettled([
    getCategories(),
    q
      ? searchApps({ ...baseParams, page, limit: "21" })
      : Promise.resolve({ apps: [], total: 0, page: 1, limit: 21 } as SearchResult),
  ]);

  const cats = categories.status === "fulfilled" ? categories.value : [];
  const result = searchResult.status === "fulfilled" ? searchResult.value : null;
  const apps = result?.apps ?? [];
  const total = result?.total ?? 0;
  const currentPage = result?.page ?? 1;
  const limit = result?.limit ?? 21;
  const totalPages = Math.ceil(total / limit);

  const pageTitle = q
    ? `Results for "${q}"`
    : category
    ? cats.find((c) => c.slug === category)?.name ?? "Browse Apps"
    : "Browse Apps";

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
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-1">Category:</span>
            <Link
              href={buildSearchUrl(baseParams, { category: "", page: "" })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                !category
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              All
            </Link>
            {cats.map((cat) => (
              <Link
                key={cat.id}
                href={buildSearchUrl(baseParams, { category: cat.slug, page: "" })}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                  category === cat.slug
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700"
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        )}

        {/* Trust tier chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-1">Trust:</span>
          {TRUST_TIERS.map((tier) => (
            <Link
              key={tier.value}
              href={buildSearchUrl(baseParams, { trustTier: tier.value, page: "" })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                trustTier === tier.value
                  ? tier.value === "experimental"
                    ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                    : "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              {tier.label}
            </Link>
          ))}
        </div>

        {/* Hide-by-anti-feature chips. NSFW is excluded by default at the
            API layer; surface the four common opt-outs here. Click toggles
            the slug in/out of the excludeAntiFeature comma list. */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-1">
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
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                  active
                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-rose-300 hover:text-rose-700"
                }`}
              >
                {active ? "✓ " : ""}
                {f.label}
              </Link>
            );
          })}
          <Link
            href="/anti-features"
            className="ml-1 text-xs text-blue-600 hover:text-blue-700"
          >
            What's this?
          </Link>
        </div>
      </div>

      {/* API error notice */}
      {searchResult.status === "rejected" && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <svg className="w-4 h-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          Could not load results — API may be unavailable. Please try again later.
        </div>
      )}

      {/* Results grid */}
      {apps.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <Link key={app.id} href={`/apps/${app.id}`} className="block">
              <AppCard
                id={app.id}
                title={app.name}
                iconUrl={app.iconUrl ?? ""}
                developerName={app.developer?.name ?? "Unknown Developer"}
                shortDescription={app.shortDescription ?? ""}
                category={app.category ?? ""}
                trustTier={app.trustTier ?? "new"}
                isExperimental={app.isExperimental}
                rating={app.rating}
                variant="grid"
              />
            </Link>
          ))}
        </div>
      ) : searchResult.status === "fulfilled" ? (
        <EmptyState
          icon={
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          }
          title="No apps found"
          description={
            q
              ? `No results for "${q}". Try a different search term or remove filters.`
              : "No apps match the current filters. Try adjusting your selection."
          }
          action={
            <Link
              href="/search"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Clear all filters
            </Link>
          }
        />
      ) : null}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-4">
          {/* Previous */}
          {currentPage > 1 ? (
            <Link
              href={buildSearchUrl(baseParams, { page: String(currentPage - 1) })}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 19.5-7.5-7.5 7.5-7.5" />
              </svg>
              Prev
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-gray-300 cursor-not-allowed">
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
                  ? "bg-blue-600 text-white shadow-sm"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300"
              }`}
            >
              {pageNum}
            </Link>
          ))}

          {/* Next */}
          {currentPage < totalPages ? (
            <Link
              href={buildSearchUrl(baseParams, { page: String(currentPage + 1) })}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              Next
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-gray-300 cursor-not-allowed">
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
