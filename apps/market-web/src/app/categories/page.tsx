import type { Metadata } from "next";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { ServiceUnavailable } from "@openmarket/ui";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  iconUrl: string | null;
  isFeatured: boolean;
  appCount: number;
}

export const metadata: Metadata = {
  title: "Browse categories — OpenMarket",
  description:
    "Every category on OpenMarket. Featured first, then the long tail.",
};

async function getAllCategories(): Promise<{
  items: Category[];
  unavailable: boolean;
}> {
  try {
    const items = await apiFetch<Category[]>("/api/categories");
    return { items, unavailable: false };
  } catch (err) {
    if (err instanceof ApiError && err.isUnreachable) {
      return { items: [], unavailable: true };
    }
    return { items: [], unavailable: false };
  }
}

export default async function CategoriesIndexPage() {
  const { items, unavailable } = await getAllCategories();

  if (unavailable) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <ServiceUnavailable
          title="Categories temporarily unavailable"
          description="The OpenMarket API is unreachable. Try again in a minute."
        />
      </div>
    );
  }

  const featured = items.filter((c) => c.isFeatured);
  const longTail = items.filter((c) => !c.isFeatured);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-om-ink">
          Categories
        </h1>
        <p className="mt-1 text-om-ink-soft">
          {items.length} categories · {items.reduce((sum, c) => sum + c.appCount, 0).toLocaleString()} apps total.
        </p>
      </header>

      {featured.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold text-om-ink mb-4">Featured</h2>
          <CategoryGrid items={featured} accent />
        </section>
      ) : null}

      {longTail.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold text-om-ink mb-4">Everything else</h2>
          <CategoryGrid items={longTail} />
        </section>
      ) : null}
    </div>
  );
}

function CategoryGrid({
  items,
  accent = false,
}: {
  items: Category[];
  accent?: boolean;
}) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            href={`/categories/${c.slug}`}
            className={`group flex items-start gap-3 rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${
              accent
                ? "border-om-primary/25 bg-om-primary/10/30 hover:border-om-primary/40"
                : "border-om-line bg-om-surface hover:border-om-primary/40"
            }`}
          >
            <span className="text-2xl flex-shrink-0" aria-hidden>
              {c.icon ?? "📦"}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-om-ink group-hover:text-om-primary truncate">
                {c.name}
              </p>
              <p className="text-xs text-om-ink-soft mt-0.5">
                {c.appCount} {c.appCount === 1 ? "app" : "apps"}
              </p>
              {c.description ? (
                <p className="text-xs text-om-ink-mute mt-1 line-clamp-2">
                  {c.description}
                </p>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
