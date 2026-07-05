import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { ServiceUnavailable } from "@openmarket/ui";

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  iconUrl: string | null;
  isFeatured: boolean;
  position: number;
}

interface AppRow {
  id: string;
  packageName: string;
  trustTier: string;
  title: string | null;
  shortDescription: string | null;
  iconUrl: string | null;
  latestReleaseAt: string | null;
}

interface CategoryDetail {
  category: Category;
  apps: AppRow[];
}

type Result =
  | { kind: "ok"; data: CategoryDetail }
  | { kind: "not-found" }
  | { kind: "unavailable" };

async function getCategory(slug: string): Promise<Result> {
  try {
    const data = await apiFetch<CategoryDetail>(`/api/categories/${slug}`);
    return { kind: "ok", data };
  } catch (err) {
    if (err instanceof ApiError && err.isNotFound) return { kind: "not-found" };
    if (err instanceof ApiError && err.isUnreachable) return { kind: "unavailable" };
    return { kind: "unavailable" };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await getCategory(slug);
  if (r.kind !== "ok") return { title: "Category — OpenMarket" };
  const c = r.data.category;
  return {
    title: `${c.name} — OpenMarket`,
    description:
      c.description ?? `Browse ${c.name} apps on OpenMarket.`,
  };
}

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getCategory(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  if (result.kind === "unavailable") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <ServiceUnavailable
          title="We can't load this category right now"
          description="The OpenMarket API is temporarily unreachable. Try again in a minute."
        />
        <p className="mt-6 text-sm">
          <Link href="/" className="text-om-primary hover:text-om-primary">
            ← Back home
          </Link>
        </p>
      </div>
    );
  }

  const { category, apps } = result.data;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <nav className="text-sm text-om-ink-soft flex items-center gap-1.5">
        <Link href="/" className="hover:text-om-ink">Home</Link>
        <span>/</span>
        <Link href="/categories" className="hover:text-om-ink">Categories</Link>
        <span>/</span>
        <span className="text-om-ink font-medium">{category.name}</span>
      </nav>

      <header className="flex items-start gap-4">
        <span
          className="text-5xl flex-shrink-0 leading-none"
          role="img"
          aria-label={category.name}
        >
          {category.icon ?? "📦"}
        </span>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-om-ink">
            {category.name}
          </h1>
          {category.description ? (
            <p className="mt-2 text-om-ink-mute max-w-2xl">{category.description}</p>
          ) : null}
        </div>
      </header>

      {apps.length === 0 ? (
        <div className="rounded-xl border border-om-line bg-om-surface-tint px-6 py-12 text-center">
          <p className="text-base font-semibold text-om-ink">
            No published apps in this category yet.
          </p>
          <p className="mt-2 text-sm text-om-ink-mute max-w-md mx-auto">
            Be the first — or browse another category.
          </p>
          <Link
            href="/categories"
            className="mt-4 inline-block rounded-md bg-om-primary px-4 py-2 text-sm font-semibold text-white hover:bg-om-primary-deep"
          >
            All categories
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <li key={app.id}>
              <Link
                href={`/apps/${app.id}`}
                className="flex items-start gap-3 rounded-xl border border-om-line bg-om-surface p-4 hover:shadow hover:border-om-primary/40 transition-all"
              >
                {app.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={app.iconUrl}
                    alt={app.title ?? app.packageName}
                    className="h-14 w-14 rounded-xl object-cover bg-om-line-soft flex-shrink-0"
                  />
                ) : (
                  <span className="h-14 w-14 rounded-xl bg-gradient-to-br from-om-primary/15 to-om-primary/20 flex items-center justify-center text-om-primary font-semibold text-lg flex-shrink-0">
                    {(app.title ?? app.packageName).charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-om-ink truncate">
                    {app.title ?? app.packageName}
                  </p>
                  <p className="text-xs text-om-ink-soft truncate">
                    {app.packageName}
                  </p>
                  {app.shortDescription ? (
                    <p className="text-sm text-om-ink-mute mt-1 line-clamp-2">
                      {app.shortDescription}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="text-center">
        <Link
          href={`/search?category=${category.slug}`}
          className="text-sm text-om-primary hover:text-om-primary"
        >
          Browse more {category.name} →
        </Link>
      </div>
    </div>
  );
}
