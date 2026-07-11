import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { features } from "@/lib/features";
import { CuratorByline, type CollectionRailData } from "@/components/collection-rail";

export const metadata: Metadata = {
  title: "Collections — OpenMarket",
  description:
    "Hand-picked editorial app collections. Every list is chosen by a named curator with a written rationale — human curation you can audit, never paid placement.",
};

async function getCollections(): Promise<CollectionRailData[]> {
  try {
    const r = await apiFetch<{ collections: CollectionRailData[] }>("/api/collections");
    return r.collections ?? [];
  } catch {
    return [];
  }
}

export default async function CollectionsIndexPage() {
  // /collections shares the P2-C flag with the home rails.
  if (!features.collections) notFound();

  const collections = await getCollections();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <nav className="text-sm text-om-ink-soft flex items-center gap-1.5">
        <Link href="/" className="hover:text-om-ink">
          Home
        </Link>
        <span>/</span>
        <span className="text-om-ink font-medium">Collections</span>
      </nav>

      <header className="max-w-2xl">
        <h1 className="om-display text-3xl sm:text-4xl font-bold tracking-tight text-om-ink">
          Editorial collections
        </h1>
        <p className="mt-2 text-om-ink-mute">
          Hand-picked lists, each chosen by a named curator with a written
          rationale. Human curation you can audit — never algorithmic, never
          paid placement.
        </p>
      </header>

      {collections.length === 0 ? (
        <div className="rounded-xl border border-om-line bg-om-surface-tint px-6 py-12 text-center">
          <p className="text-base font-semibold text-om-ink">
            No collections published yet.
          </p>
          <p className="mt-2 text-sm text-om-ink-mute max-w-md mx-auto">
            Curated lists are on the way. In the meantime, browse the charts and
            categories.
          </p>
          <Link
            href="/search"
            className="mt-4 inline-block rounded-md bg-om-primary px-4 py-2 text-sm font-semibold text-white hover:bg-om-primary-deep"
          >
            Browse all apps
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {collections.map((col) => (
            <li key={col.slug}>
              <Link
                href={`/collections/${col.slug}`}
                className="group flex flex-col h-full rounded-2xl border border-om-line bg-om-surface p-6 hover:border-om-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-2.5">
                  {col.icon ? (
                    <span aria-hidden className="text-2xl leading-none">
                      {col.icon}
                    </span>
                  ) : null}
                  <h2 className="text-xl font-bold text-om-ink tracking-tight group-hover:text-om-primary transition-colors">
                    {col.title}
                  </h2>
                </div>
                {col.blurb ? (
                  <p className="mt-1.5 text-sm text-om-ink-soft">{col.blurb}</p>
                ) : null}
                {col.curatorName ? <CuratorByline name={col.curatorName} /> : null}

                {/* Stacked app-icon preview. */}
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {col.apps.slice(0, 5).map((app) =>
                      app.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={app.id}
                          src={app.iconUrl}
                          alt=""
                          className="w-9 h-9 rounded-lg object-cover ring-2 ring-om-surface"
                        />
                      ) : (
                        <span
                          key={app.id}
                          className="w-9 h-9 rounded-lg bg-gradient-to-br from-om-primary/15 to-om-primary/20 ring-2 ring-om-surface flex items-center justify-center text-xs font-semibold text-om-primary"
                        >
                          {app.title.charAt(0).toUpperCase()}
                        </span>
                      ),
                    )}
                  </div>
                  <span className="text-xs text-om-ink-soft">
                    {col.apps.length} {col.apps.length === 1 ? "app" : "apps"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
