import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, TrustBadge, Badge } from "@openmarket/ui";
import type { TrustBadgeType } from "@openmarket/ui";

interface AppListing {
  id: string;
  name: string;
  shortDescription?: string;
  iconUrl?: string;
  category?: string;
  trustBadges?: TrustBadgeType[];
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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const category = params.category ?? "";
  const trustTier = params.trustTier ?? "";
  const page = params.page ?? "1";

  const [categories, searchResult] = await Promise.allSettled([
    getCategories(),
    searchApps({ ...(q && { q }), ...(category && { category }), ...(trustTier && { trustTier }), page, limit: "20" }),
  ]);

  const cats = categories.status === "fulfilled" ? categories.value : [];
  const result = searchResult.status === "fulfilled" ? searchResult.value : null;
  const apps = result?.apps ?? [];
  const total = result?.total ?? 0;
  const currentPage = result?.page ?? 1;
  const limit = result?.limit ?? 20;

  return (
    <div className="flex gap-8">
      {/* Sidebar filters */}
      <aside className="w-56 shrink-0 space-y-6">
        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-2 uppercase tracking-wide">Category</h3>
          <div className="space-y-1">
            <Link
              href={`/search?${new URLSearchParams({ ...(q && { q }), ...(trustTier && { trustTier }) }).toString()}`}
              className={`block text-sm px-2 py-1 rounded hover:bg-gray-100 ${!category ? "font-medium text-blue-600 bg-blue-50" : "text-gray-600"}`}
            >
              All Categories
            </Link>
            {cats.map((cat) => (
              <Link
                key={cat.id}
                href={`/search?${new URLSearchParams({ ...(q && { q }), category: cat.slug, ...(trustTier && { trustTier }) }).toString()}`}
                className={`block text-sm px-2 py-1 rounded hover:bg-gray-100 ${category === cat.slug ? "font-medium text-blue-600 bg-blue-50" : "text-gray-600"}`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-2 uppercase tracking-wide">Trust Tier</h3>
          <div className="space-y-1">
            <Link
              href={`/search?${new URLSearchParams({ ...(q && { q }), ...(category && { category }) }).toString()}`}
              className={`block text-sm px-2 py-1 rounded hover:bg-gray-100 ${!trustTier ? "font-medium text-blue-600 bg-blue-50" : "text-gray-600"}`}
            >
              All
            </Link>
            {TRUST_TIERS.map((tier) => (
              <Link
                key={tier.value}
                href={`/search?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), trustTier: tier.value }).toString()}`}
                className={`block text-sm px-2 py-1 rounded hover:bg-gray-100 ${trustTier === tier.value ? "font-medium text-blue-600 bg-blue-50" : "text-gray-600"}`}
              >
                {tier.label}
              </Link>
            ))}
          </div>
        </div>
      </aside>

      {/* Results */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            {q ? `Results for "${q}"` : "Browse Apps"}
            {total > 0 && <span className="text-sm font-normal text-gray-500 ml-2">{total} apps</span>}
          </h1>
        </div>

        {searchResult.status === "rejected" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            Could not load results — API may be unavailable. Please try again later.
          </div>
        )}

        {apps.length === 0 && searchResult.status === "fulfilled" && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No apps found.</p>
            <p className="text-sm mt-1">Try a different search term or remove filters.</p>
          </div>
        )}

        <div className="space-y-3">
          {apps.map((app) => (
            <Link key={app.id} href={`/apps/${app.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-4">
                    {app.iconUrl ? (
                      <img src={app.iconUrl} alt={app.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 bg-gray-200 rounded-xl shrink-0 flex items-center justify-center text-gray-400 text-xs">
                        APK
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-semibold text-gray-900">{app.name}</h2>
                        {app.category && (
                          <Badge variant="secondary" className="text-xs">{app.category}</Badge>
                        )}
                      </div>
                      {app.developer && (
                        <p className="text-sm text-gray-500">{app.developer.name}</p>
                      )}
                      {app.shortDescription && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{app.shortDescription}</p>
                      )}
                      {app.trustBadges && app.trustBadges.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {app.trustBadges.map((badge) => (
                            <TrustBadge key={badge} type={badge} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="flex gap-2 pt-4">
            {currentPage > 1 && (
              <Link
                href={`/search?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(trustTier && { trustTier }), page: String(currentPage - 1) }).toString()}`}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            <span className="px-4 py-2 text-sm text-gray-600">
              Page {currentPage} of {Math.ceil(total / limit)}
            </span>
            {currentPage * limit < total && (
              <Link
                href={`/search?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(trustTier && { trustTier }), page: String(currentPage + 1) }).toString()}`}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
