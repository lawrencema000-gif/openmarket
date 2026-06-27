"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export interface SponsoredPromotion {
  id: string;
  appId: string;
  title: string;
  iconUrl: string | null;
  shortDescription: string | null;
  sponsored: true;
}

/**
 * Sponsored placements row (P4-G). Clearly labeled per the editorial
 * policy — every card carries a "Sponsored" tag and the section is
 * headed as such. Fires a one-time impression beacon per promotion on
 * mount and a click beacon on tap (the click also debits the campaign's
 * daily budget server-side). Both are fire-and-forget — the UX never
 * waits on them.
 */
export function SponsoredRail({ promotions }: { promotions: SponsoredPromotion[] }) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || promotions.length === 0) return;
    fired.current = true;
    for (const p of promotions) {
      void apiFetch(`/api/promoted/${p.id}/impression`, {
        method: "POST",
        body: JSON.stringify({ surface: "home" }),
      }).catch(() => {});
    }
  }, [promotions]);

  if (promotions.length === 0) return null;

  function onCardClick(p: SponsoredPromotion, e: React.MouseEvent) {
    e.preventDefault();
    // Beacon the click (debits budget); navigate regardless of its result.
    void apiFetch(`/api/promoted/${p.id}/click`, {
      method: "POST",
      body: JSON.stringify({ surface: "home" }),
    }).catch(() => {});
    router.push(`/apps/${p.appId}`);
  }

  return (
    <section aria-label="Sponsored apps">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="om-display text-xl font-bold text-slate-900">
          Sponsored
        </h2>
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-400 border border-slate-200 rounded-full px-2 py-0.5">
          Ad
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {promotions.map((p) => (
          <a
            key={p.id}
            href={`/apps/${p.appId}`}
            onClick={(e) => onCardClick(p, e)}
            className="om-tile om-glass om-glow-ring group flex items-center gap-3 p-4 rounded-2xl cursor-pointer"
          >
            <span className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 flex items-center justify-center text-violet-700 font-semibold shrink-0 overflow-hidden">
              {p.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.iconUrl}
                  alt=""
                  className="h-12 w-12 object-cover"
                />
              ) : (
                p.title.slice(0, 1)
              )}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate group-hover:text-violet-700 transition-colors">
                {p.title}
              </p>
              {p.shortDescription && (
                <p className="text-sm text-slate-500 truncate">
                  {p.shortDescription}
                </p>
              )}
              <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                Sponsored
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
