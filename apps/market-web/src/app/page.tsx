import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { SearchForm } from "@/components/search-form";
import { ChartRail } from "@/components/chart-rail";
import {
  CollectionRail,
  type CollectionRailData,
} from "@/components/collection-rail";
import {
  SponsoredRail,
  type SponsoredPromotion,
} from "@/components/sponsored-rail";
import { features } from "@/lib/features";
import { DEV_PORTAL_URL, REPO_URL } from "@/lib/site";
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

async function getCollections(): Promise<CollectionRailData[]> {
  if (!features.collections) return [];
  try {
    const r = await apiFetch<{ collections: CollectionRailData[] }>(
      "/api/collections",
    );
    return r.collections ?? [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [categories, trending, topNew, promoted, collections] =
    await Promise.all([
      getFeaturedCategories(),
      getChart("top-trending", "7d", 6),
      getChart("top-new", "30d", 6),
      getPromoted(),
      getCollections(),
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

            <h1 className="om-display text-5xl sm:text-7xl font-bold leading-[1.05] text-om-ink">
              Android apps,{" "}
              <GradientText as="span">
                without the gatekeepers.
              </GradientText>
            </h1>

            {/* Process claims, not absolute ones — "every developer verified,
                every build security-reviewed" read as marketing overreach next
                to the app pages' honest "no reviewed release yet" states. */}
            <p className="text-lg sm:text-xl text-om-ink-soft max-w-2xl mx-auto leading-relaxed">
              A{" "}
              <Link href="/about" className="underline decoration-om-primary/40 underline-offset-2 hover:text-om-ink">
                neutral marketplace
              </Link>
              : every app goes through{" "}
              <Link href="/how-we-review" className="underline decoration-om-primary/40 underline-offset-2 hover:text-om-ink">
                security review
              </Link>{" "}
              before listing, and the results are public.
            </p>

            <div className="max-w-xl mx-auto pt-3">
              <SearchForm
                size="lg"
                placeholder="Search apps, developers, categories…"
              />
            </div>
          </div>
        </div>

        {/* Live marquee — quietly signals "this thing has a heartbeat". */}
        {trending.length > 0 && (
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
            <div className="text-center mb-3">
              <span className="inline-flex items-center gap-2 text-xs text-om-ink-soft font-medium">
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
                  <span className="h-7 w-7 rounded-full bg-gradient-to-br from-om-primary/15 to-om-primary/10 flex items-center justify-center text-xs font-semibold text-om-primary shrink-0">
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
                  <span className="text-sm font-medium text-om-ink-mute truncate max-w-[12rem]">
                    {app.title}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide font-semibold text-om-cta">
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

        {/* Editorial collections lead — HUMAN curation before the algorithmic
            charts. Each rail carries a named-curator byline; unlike the
            sponsored rail above, no slot here can be bought. */}
        {collections.map((col) => (
          <CollectionRail key={col.slug} collection={col} />
        ))}

        {/* Ranked app rails — real apps above the category directory,
            so the homepage reads as a store, not a manifesto. */}
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

        {/* Categories */}
        {categories.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="om-display text-3xl sm:text-4xl font-bold text-om-ink tracking-tight">
                  Browse by category
                </h2>
                <p className="text-base text-om-ink-soft mt-1">
                  Apps organised by what they actually do.
                </p>
              </div>
              <Link
                href="/search"
                className="text-sm text-om-primary hover:text-om-primary-deep font-semibold flex items-center gap-1"
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
                      <p className="text-sm font-semibold text-om-ink group-hover:text-om-primary transition-colors leading-tight">
                        {cat.name}
                      </p>
                      {cat.appCount !== undefined && cat.appCount > 0 && (
                        <p className="text-[11px] text-om-ink-soft mt-0.5">
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

        {/* How installing works — the answer to the first-time visitor's
            unasked question: "how does an app get from here onto my phone?"
            No app store knowledge assumed. */}
        <section aria-labelledby="how-installing">
          <div className="rounded-3xl border border-om-line bg-om-surface p-8 sm:p-10">
            <div className="flex items-end justify-between gap-3 flex-wrap mb-8">
              <div>
                <h2 id="how-installing" className="om-display text-2xl sm:text-3xl font-bold text-om-ink tracking-tight">
                  How installing works
                </h2>
                <p className="text-sm text-om-ink-soft mt-1">
                  No account needed. Three steps, right from your Android phone.
                </p>
              </div>
              <Link
                href="/how-we-review#installing"
                className="text-sm text-om-primary hover:text-om-primary-deep font-medium"
              >
                Full guide →
              </Link>
            </div>
            <ol className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                {
                  step: "1",
                  title: "Find an app",
                  body: "Search or browse, then check its security review, permissions, and reviews — everything is on the listing.",
                },
                {
                  step: "2",
                  title: "Download it on your phone",
                  body: "Press “Download APK” — the APK is the Android app file, the same build we security-reviewed.",
                },
                {
                  step: "3",
                  title: "Allow the install",
                  body: "Android asks once to allow installs from your browser. Approve it and the app installs like any other.",
                },
              ].map((s) => (
                <li key={s.step} className="flex gap-4">
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-om-primary/10 text-om-primary font-bold">
                    {s.step}
                  </span>
                  <div>
                    <h3 className="font-semibold text-om-ink">{s.title}</h3>
                    <p className="text-sm text-om-ink-soft mt-1 leading-relaxed">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

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
                  href={`${DEV_PORTAL_URL}/register`}
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
                  href={REPO_URL}
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
            <h2 className="om-display text-3xl sm:text-4xl font-bold text-om-ink tracking-tight mt-4">
              Three guarantees, every app.
            </h2>
          </div>
          {/* Plain-language cards, each linking to the page that PROVES the
              guarantee — trust claims a reader can't decode or verify are
              just marketing. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                tone: "violet" as const,
                title: "Security reviews",
                href: "/how-we-review",
                linkLabel: "How we review →",
                description:
                  "Every app is malware-scanned, checked for hidden trackers, and signature-verified before it can be listed. Risky ones get human review.",
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
                href: "/how-we-review#developers",
                linkLabel: "What verified means →",
                description:
                  "Publishers prove who they are, updates must carry the developer's original signature, and every publisher page shows their track record.",
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
                title: "Everything on the record",
                href: "/transparency-report",
                linkLabel: "See the public log →",
                description:
                  "What data an app collects, what permissions it asks for, and every moderation action we take — published for anyone to check.",
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
              <Link key={item.title} href={item.href} className="block group">
                <GlassCard
                  interactive
                  className="p-7 flex flex-col gap-4 om-tile h-full"
                >
                  <FeatureIcon tone={item.tone} size="lg">
                    {item.icon}
                  </FeatureIcon>
                  <div className="space-y-1.5">
                    <h3 className="om-display font-bold text-om-ink text-lg group-hover:text-om-primary transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-sm text-om-ink-soft leading-relaxed">
                      {item.description}
                    </p>
                    <p className="text-sm font-medium text-om-primary pt-1">
                      {item.linkLabel}
                    </p>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
