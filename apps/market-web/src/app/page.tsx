import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { SearchForm } from "@/components/search-form";
import { ChartRail } from "@/components/chart-rail";
import {
  SponsoredRail,
  type SponsoredPromotion,
} from "@/components/sponsored-rail";
import {
  Aurora,
  Eyebrow,
  FeatureIcon,
  GlassCard,
  GradientText,
  Marquee,
} from "@openmarket/ui";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  iconUrl?: string | null;
  appCount?: number;
  isFeatured?: boolean;
}

async function getFeaturedCategories(): Promise<Category[]> {
  try {
    return await apiFetch<Category[]>("/api/categories?featured=true");
  } catch {
    return [];
  }
}

interface ChartItem {
  position: number;
  deltaPosition: number | null;
  appId: string;
  packageName: string;
  trustTier: string;
  title: string;
  shortDescription: string;
  category: string;
  iconUrl: string | null;
}

async function getChart(
  slug: string,
  window: string,
  limit: number,
): Promise<ChartItem[]> {
  try {
    const r = await apiFetch<{ items: ChartItem[] }>(
      `/api/charts/${slug}?window=${window}&limit=${limit}`,
    );
    return r.items;
  } catch {
    return [];
  }
}

async function getPromoted(): Promise<SponsoredPromotion[]> {
  try {
    const r = await apiFetch<{ promotions: SponsoredPromotion[] }>(
      "/api/promoted/active?surface=home&limit=3",
    );
    return r.promotions ?? [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [categories, trending, topNew, promoted] = await Promise.all([
    getFeaturedCategories(),
    getChart("top-trending", "7d", 6),
    getChart("top-new", "30d", 6),
    getPromoted(),
  ]);

  return (
    <div className="om-bg-app">
      {/* ───────────── Hero ───────────── */}
      <section className="relative isolate overflow-hidden">
        <Aurora />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 sm:pt-28 sm:pb-24">
          <div className="max-w-3xl mx-auto text-center space-y-7">
            <Eyebrow tone="primary">
              Open · Verified · Transparent
            </Eyebrow>

            <h1 className="om-display text-5xl sm:text-7xl font-bold leading-[1.05] text-slate-900">
              Android apps,{" "}
              <GradientText as="span">
                without the gatekeepers.
              </GradientText>
            </h1>

            <p className="text-lg sm:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
              A viewpoint-neutral marketplace. Every developer verified, every
              build security-reviewed, every metric visible in the open.
            </p>

            <div className="max-w-xl mx-auto pt-3">
              <SearchForm
                size="lg"
                placeholder="Search 12,000+ apps, developers, categories…"
              />
            </div>

            {/* Trust strip — the four numbers that tell the marketplace
                story at a glance. */}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 max-w-2xl mx-auto pt-6">
              {[
                { label: "Apps reviewed", value: "12,400+" },
                { label: "Verified devs", value: "1,800+" },
                { label: "Open audits", value: "9,200" },
                { label: "Avg trust", value: "92 / 100" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <dt className="text-[11px] uppercase tracking-[0.12em] font-semibold text-slate-500">
                    {s.label}
                  </dt>
                  <dd className="text-xl sm:text-2xl font-bold om-display text-slate-900 mt-1">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Category chips below the search — quick taps into the
              most-requested verticals. */}
          {categories.length > 0 && (
            <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
              {categories.slice(0, 8).map((cat) => (
                <Link
                  key={cat.slug}
                  href={`/categories/${cat.slug}`}
                  className="om-tile om-glass om-glow-ring inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-slate-700 hover:text-violet-700 cursor-pointer"
                >
                  <span aria-hidden className="text-base">
                    {cat.icon ?? "▸"}
                  </span>
                  {cat.name}
                </Link>
              ))}
              <Link
                href="/search"
                className="om-tile om-glow-ring inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-semibold text-violet-700 hover:bg-violet-50 cursor-pointer"
              >
                All categories
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m8.25 4.5 7.5 7.5-7.5 7.5"
                  />
                </svg>
              </Link>
            </div>
          )}
        </div>

        {/* Live marquee — quietly signals "this thing has a heartbeat". */}
        {trending.length > 0 && (
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
            <div className="text-center mb-3">
              <span className="inline-flex items-center gap-2 text-xs text-slate-500 font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 animate-ping" />
                  <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Trending right now
              </span>
            </div>
            <Marquee>
              {trending.slice(0, 8).map((app) => (
                <Link
                  key={app.appId}
                  href={`/apps/${app.appId}`}
                  className="flex items-center gap-3 om-glass rounded-full pl-2 pr-5 py-1.5 om-tile cursor-pointer"
                >
                  <span className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-100 to-violet-50 flex items-center justify-center text-xs font-semibold text-violet-700 shrink-0">
                    {app.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={app.iconUrl}
                        alt=""
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      app.title.slice(0, 1)
                    )}
                  </span>
                  <span className="text-sm font-medium text-slate-800 truncate max-w-[12rem]">
                    {app.title}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide font-semibold text-emerald-600">
                    #{app.position}
                  </span>
                </Link>
              ))}
            </Marquee>
          </div>
        )}
      </section>

      {/* ───────────── Main content ───────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">

        {/* Sponsored (P4-G) — labeled placements; impressions + clicks
            tracked client-side. Hidden entirely when none are active. */}
        {promoted.length > 0 && <SponsoredRail promotions={promoted} />}

        {/* Categories */}
        {categories.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="om-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
                  Browse by category
                </h2>
                <p className="text-base text-slate-500 mt-1">
                  Apps organised by what they actually do.
                </p>
              </div>
              <Link
                href="/search"
                className="text-sm text-violet-700 hover:text-violet-900 font-semibold flex items-center gap-1"
              >
                View all
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m8.25 4.5 7.5 7.5-7.5 7.5"
                  />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {categories.map((cat, idx) => (
                <Link key={cat.id} href={`/categories/${cat.slug}`}>
                  <GlassCard
                    interactive
                    className="group flex flex-col items-center gap-3 p-5 text-center"
                  >
                    <FeatureIcon
                      tone={
                        (
                          [
                            "violet",
                            "emerald",
                            "sky",
                            "amber",
                            "rose",
                          ] as const
                        )[idx % 5]
                      }
                      size="md"
                    >
                      <span aria-hidden className="text-xl">
                        {cat.icon ?? "▸"}
                      </span>
                    </FeatureIcon>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 group-hover:text-violet-700 transition-colors leading-tight">
                        {cat.name}
                      </p>
                      {cat.appCount !== undefined && cat.appCount > 0 && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {cat.appCount}{" "}
                          {cat.appCount === 1 ? "app" : "apps"}
                        </p>
                      )}
                    </div>
                  </GlassCard>
                </Link>
              ))}
            </div>
          </section>
        )}

        {trending.length > 0 && (
          <ChartRail
            title="Top trending this week"
            subtitle="Ranked by install velocity over the last 7 days · refreshed hourly"
            items={trending}
            href="/charts/top-trending"
          />
        )}

        {topNew.length > 0 && (
          <ChartRail
            title="New on OpenMarket"
            subtitle="First stable release in the last 30 days"
            items={topNew}
            href="/charts/top-new"
          />
        )}

        {/* Developer CTA */}
        <section>
          <div className="relative overflow-hidden rounded-3xl p-10 sm:p-16 text-white shadow-2xl">
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-br from-violet-700 via-violet-600 to-violet-900"
            />
            <Aurora />
            <div
              aria-hidden
              className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-emerald-400/30 blur-3xl"
            />

            <div className="relative flex flex-col lg:flex-row items-start lg:items-end justify-between gap-8">
              <div className="space-y-4 max-w-2xl">
                <Eyebrow tone="cta" pulse={false} className="text-white">
                  For Developers
                </Eyebrow>
                <h2 className="om-display text-4xl sm:text-5xl font-bold tracking-tight">
                  Ship to a marketplace built like the open web.
                </h2>
                <p className="text-violet-100 text-lg leading-relaxed">
                  Free to publish. Honest metrics. Transparent moderation. A
                  community that values open over locked-down.
                </p>
                <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm text-violet-100">
                  {[
                    "Free to publish",
                    "No hidden fees",
                    "Open source platform",
                    "Verified developer program",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <svg
                        className="w-4 h-4 text-emerald-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-3 shrink-0">
                <a
                  href="https://openmarket-dev-portal.vercel.app/register"
                  className="om-glow-ring inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-7 py-3.5 rounded-2xl font-semibold shadow-lg shadow-emerald-500/30 transition-colors text-sm cursor-pointer"
                >
                  Start publishing
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m8.25 4.5 7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </a>
                <a
                  href="https://github.com/lawrencema000-gif/openmarket"
                  className="text-sm text-violet-200 hover:text-white transition-colors text-center"
                >
                  Read the docs →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Trust pillars */}
        <section>
          <div className="text-center mb-10">
            <Eyebrow tone="neutral">Why OpenMarket</Eyebrow>
            <h2 className="om-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mt-4">
              Three guarantees, every app.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                tone: "violet" as const,
                title: "Security reviews",
                description:
                  "Every release runs through static analysis, SDK fingerprinting, and a manual signature audit before listing.",
                icon: (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.75}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                    />
                  </svg>
                ),
              },
              {
                tone: "emerald" as const,
                title: "Verified developers",
                description:
                  "Two-factor identity verification, signing-key continuity, and a public track record on every publisher page.",
                icon: (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.75}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                ),
              },
              {
                tone: "sky" as const,
                title: "Transparent metrics",
                description:
                  "Install counts, declared permissions, anti-features, and moderation actions — all of it on the public record.",
                icon: (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.75}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25"
                    />
                  </svg>
                ),
              },
            ].map((item) => (
              <GlassCard
                key={item.title}
                className="p-7 flex flex-col gap-4 om-tile"
              >
                <FeatureIcon tone={item.tone} size="lg">
                  {item.icon}
                </FeatureIcon>
                <div className="space-y-1.5">
                  <h3 className="om-display font-bold text-slate-900 text-lg">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
