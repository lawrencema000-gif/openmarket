import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface SimilarItem {
  id: string;
  packageName: string;
  trustTier: string;
  title: string;
  shortDescription: string;
  iconUrl: string | null;
  category: string;
}

async function getSimilar(appId: string): Promise<SimilarItem[]> {
  try {
    const r = await apiFetch<{ items: SimilarItem[] }>(
      `/api/apps/${appId}/similar?limit=8`,
    );
    return r.items;
  } catch {
    return [];
  }
}

/**
 * Server-rendered "Similar apps" rail. Pulled from
 * GET /apps/:id/similar — content-based ranking by category +
 * anti-feature overlap. v1's "looks reasonable" floor.
 */
export async function SimilarAppsRail({ appId }: { appId: string }) {
  const items = await getSimilar(appId);
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-lg font-semibold text-om-ink">Similar apps</h2>
        <p className="text-xs text-om-ink-soft">
          Same category · matched on{" "}
          <Link href="/anti-features" className="underline hover:text-om-ink">
            anti-feature
          </Link>{" "}
          overlap
        </p>
      </div>
      <div
        className="relative"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0, black 20px, black calc(100% - 40px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, black 20px, black calc(100% - 40px), transparent 100%)",
        }}
      >
        <ul className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory">
          {items.map((item) => (
            <li key={item.id} className="snap-start shrink-0 w-[220px]">
              <Link
                href={`/apps/${item.id}`}
                className="group flex flex-col h-full bg-om-surface border border-om-line hover:border-om-primary/40 hover:shadow-md rounded-xl p-3 transition-all"
              >
                <div className="flex items-start gap-3">
                  {item.iconUrl ? (
                    <img
                      src={item.iconUrl}
                      alt=""
                      className="w-12 h-12 rounded-xl object-cover shrink-0"
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-om-line-soft shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-om-ink text-sm truncate group-hover:text-om-primary transition-colors">
                      {item.title}
                    </p>
                    <p className="text-xs text-om-ink-soft truncate">
                      {item.packageName}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-om-ink-mute line-clamp-2 mt-2">
                  {item.shortDescription}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
