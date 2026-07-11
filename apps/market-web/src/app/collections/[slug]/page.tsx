import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { ServiceUnavailable } from "@openmarket/ui";
import { features } from "@/lib/features";
import { CuratorByline } from "@/components/collection-rail";

interface CollectionApp {
  id: string;
  packageName: string;
  trustTier: string;
  title: string;
  shortDescription: string | null;
  iconUrl: string | null;
  category: string | null;
  note: string | null;
}

interface CollectionDetail {
  collection: {
    id: string;
    slug: string;
    title: string;
    blurb: string | null;
    rationale: string | null;
    curatorName: string | null;
    icon: string | null;
  };
  apps: CollectionApp[];
}

type Result =
  | { kind: "ok"; data: CollectionDetail }
  | { kind: "not-found" }
  | { kind: "unavailable" };

async function getCollection(slug: string): Promise<Result> {
  try {
    const data = await apiFetch<CollectionDetail>(`/api/collections/${slug}`);
    return { kind: "ok", data };
  } catch (err) {
    if (err instanceof ApiError && err.isNotFound) return { kind: "not-found" };
    return { kind: "unavailable" };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await getCollection(slug);
  if (r.kind !== "ok") return { title: "Collection — OpenMarket" };
  const c = r.data.collection;
  return {
    title: `${c.title} — OpenMarket`,
    description: c.blurb ?? c.rationale ?? `A curated collection on OpenMarket.`,
  };
}

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!features.collections) notFound();

  const { slug } = await params;
  const result = await getCollection(slug);

  if (result.kind === "not-found") notFound();

  if (result.kind === "unavailable") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <ServiceUnavailable
          title="We can't load this collection right now"
          description="The OpenMarket API is temporarily unreachable. Try again in a minute."
        />
        <p className="mt-6 text-sm">
          <Link href="/collections" className="text-om-primary hover:text-om-primary-deep">
            ← All collections
          </Link>
        </p>
      </div>
    );
  }

  const { collection, apps } = result.data;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <nav className="text-sm text-om-ink-soft flex items-center gap-1.5">
        <Link href="/" className="hover:text-om-ink">
          Home
        </Link>
        <span>/</span>
        <Link href="/collections" className="hover:text-om-ink">
          Collections
        </Link>
        <span>/</span>
        <span className="text-om-ink font-medium">{collection.title}</span>
      </nav>

      <header className="flex items-start gap-4">
        {collection.icon ? (
          <span
            className="text-5xl flex-shrink-0 leading-none"
            role="img"
            aria-label={collection.title}
          >
            {collection.icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="om-display text-3xl sm:text-4xl font-bold tracking-tight text-om-ink">
            {collection.title}
          </h1>
          {collection.blurb ? (
            <p className="mt-2 text-om-ink-mute max-w-2xl">{collection.blurb}</p>
          ) : null}
          {collection.curatorName ? (
            <CuratorByline name={collection.curatorName} />
          ) : null}
        </div>
      </header>

      {/* The curator's rationale — the transparency payload that separates
          named human editorial from an anonymous algorithmic list. */}
      {collection.rationale ? (
        <section className="rounded-2xl border border-om-primary/20 bg-om-primary/5 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-om-primary">
            Why this collection
          </h2>
          <p className="mt-2 text-om-ink-mute leading-relaxed whitespace-pre-line">
            {collection.rationale}
          </p>
        </section>
      ) : null}

      {apps.length === 0 ? (
        <div className="rounded-xl border border-om-line bg-om-surface-tint px-6 py-12 text-center">
          <p className="text-base font-semibold text-om-ink">
            This collection is empty right now.
          </p>
          <Link
            href="/collections"
            className="mt-4 inline-block rounded-md bg-om-primary px-4 py-2 text-sm font-semibold text-white hover:bg-om-primary-deep"
          >
            All collections
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {apps.map((app) => (
            <li key={app.id}>
              <Link
                href={`/apps/${app.id}`}
                className="flex items-start gap-4 rounded-xl border border-om-line bg-om-surface p-4 hover:shadow hover:border-om-primary/40 transition-all"
              >
                {app.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={app.iconUrl}
                    alt={app.title}
                    className="h-14 w-14 rounded-xl object-cover bg-om-line-soft flex-shrink-0"
                  />
                ) : (
                  <span className="h-14 w-14 rounded-xl bg-gradient-to-br from-om-primary/15 to-om-primary/20 flex items-center justify-center text-om-primary font-semibold text-lg flex-shrink-0">
                    {app.title.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-om-ink truncate">{app.title}</p>
                  <p className="text-xs text-om-ink-soft truncate">{app.packageName}</p>
                  {app.shortDescription ? (
                    <p className="text-sm text-om-ink-mute mt-1 line-clamp-2">
                      {app.shortDescription}
                    </p>
                  ) : null}
                  {app.note ? (
                    <p className="mt-2 text-sm text-om-ink-mute border-l-2 border-om-primary/30 pl-3 italic">
                      {app.note}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
