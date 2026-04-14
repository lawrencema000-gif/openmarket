import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { SearchForm } from "@/components/search-form";

interface Category {
  id: string;
  name: string;
  slug: string;
  appCount?: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  productivity: "⚡",
  tools: "🔧",
  communication: "💬",
  media: "🎬",
  games: "🎮",
  finance: "💰",
  health: "❤️",
  education: "📚",
  security: "🔒",
  utilities: "🛠️",
  social: "👥",
  travel: "✈️",
};

const FEATURED_CHIPS = [
  { label: "Productivity", slug: "productivity" },
  { label: "Tools", slug: "tools" },
  { label: "Communication", slug: "communication" },
  { label: "Media", slug: "media" },
  { label: "Games", slug: "games" },
  { label: "Security", slug: "security" },
];

async function getCategories(): Promise<Category[]> {
  try {
    return await apiFetch<Category[]>("/api/categories");
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const categories = await getCategories();

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-white to-slate-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="relative z-10 max-w-3xl mx-auto text-center space-y-6">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-semibold text-blue-700 tracking-wide uppercase">Open Source Marketplace</span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 tracking-tight leading-tight">
              The Open Android{" "}
              <span className="text-blue-600">Marketplace</span>
            </h1>

            <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
              Discover apps with full transparency — verified developers, security reviews, and honest trust ratings. No hidden agendas.
            </p>

            {/* Search */}
            <div className="max-w-xl mx-auto">
              <SearchForm
                size="lg"
                placeholder="Search for apps, categories, developers..."
              />
            </div>

            {/* Category chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {FEATURED_CHIPS.map((chip) => (
                <Link
                  key={chip.slug}
                  href={`/search?category=${chip.slug}`}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-gray-200 bg-white text-sm text-gray-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-all duration-150 shadow-sm"
                >
                  <span>{CATEGORY_ICONS[chip.slug] ?? "📦"}</span>
                  {chip.label}
                </Link>
              ))}
              <Link
                href="/search"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-gray-200 bg-white text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-all duration-150 shadow-sm"
              >
                All categories
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">

        {/* Categories grid */}
        {categories.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Browse by Category</h2>
                <p className="text-sm text-gray-500 mt-0.5">Find apps organized by what they do</p>
              </div>
              <Link
                href="/search"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View all
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {categories.map((cat) => (
                <Link key={cat.id} href={`/search?category=${cat.slug}`}>
                  <div className="group flex flex-col items-center gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer text-center">
                    <span className="text-2xl" role="img" aria-label={cat.name}>
                      {CATEGORY_ICONS[cat.slug] ?? "📦"}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">
                        {cat.name}
                      </p>
                      {cat.appCount !== undefined && (
                        <p className="text-xs text-gray-400 mt-0.5">{cat.appCount} apps</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Developer CTA — shown instead of placeholder grids */}
        <section>
          <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-600 to-blue-700 p-10 sm:p-14">
            {/* Background decoration */}
            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-blue-500/30 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />

            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="space-y-3 max-w-xl">
                <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1">
                  <span className="text-xs font-semibold text-blue-100 uppercase tracking-wide">For Developers</span>
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">
                  Build for OpenMarket
                </h2>
                <p className="text-blue-100 text-base leading-relaxed">
                  Publish your Android app to a marketplace that respects developers — transparent review process, honest metrics, and a community that values openness.
                </p>
                <div className="flex flex-wrap gap-3 pt-1">
                  {["Free to publish", "No hidden fees", "Open source"].map((feat) => (
                    <div key={feat} className="flex items-center gap-1.5 text-sm text-blue-100">
                      <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      {feat}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 shrink-0">
                <a
                  href="https://openmarket-dev-portal.vercel.app/register"
                  className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 px-6 py-3 rounded-xl font-semibold hover:bg-blue-50 transition-colors shadow-md text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Start Publishing
                </a>
                <a
                  href="https://github.com/lawrencema000-gif/openmarket"
                  className="inline-flex items-center justify-center text-sm text-blue-200 hover:text-white transition-colors"
                >
                  Read the docs →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Trust indicators */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                ),
                title: "Security Reviews",
                description: "Every app undergoes a structured security analysis before listing.",
                color: "text-blue-600 bg-blue-50",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                ),
                title: "Verified Developers",
                description: "Developers are verified and rated based on their track record.",
                color: "text-emerald-600 bg-emerald-50",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                  </svg>
                ),
                title: "Transparent Metrics",
                description: "Download counts, permissions, and ratings — all open to inspect.",
                color: "text-violet-600 bg-violet-50",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 p-6 rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                  {item.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">{item.title}</h3>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
