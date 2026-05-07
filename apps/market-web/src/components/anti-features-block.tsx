import Link from "next/link";
import { ANTI_FEATURES } from "@openmarket/contracts/anti-features";

const TONE_BY_SLUG: Record<string, string> = {
  // High-trust-loss labels — red.
  tracking: "bg-red-50 text-red-700 border-red-200",
  ads: "bg-red-50 text-red-700 border-red-200",
  knownVuln: "bg-red-100 text-red-800 border-red-300",
  // Adult / deprecated — orange.
  nsfw: "bg-orange-50 text-orange-700 border-orange-200",
  disabledAlgorithm: "bg-orange-50 text-orange-700 border-orange-200",
  // "Not strictly free" labels — neutral amber.
  nonFreeNet: "bg-amber-50 text-amber-700 border-amber-200",
  nonFreeAdd: "bg-amber-50 text-amber-700 border-amber-200",
  nonFreeAssets: "bg-amber-50 text-amber-700 border-amber-200",
  nonFreeDep: "bg-amber-50 text-amber-700 border-amber-200",
  upstreamNonFree: "bg-amber-50 text-amber-700 border-amber-200",
  noSourceSince: "bg-amber-50 text-amber-700 border-amber-200",
};

/**
 * Anti-features chip block. Shown on app detail pages when the app has
 * any anti-feature labels attached. Each chip:
 *   - displays the human label
 *   - tooltip shows the one-line description from the registry
 *   - links to /search?antiFeature=<slug> so users can browse other
 *     apps with the same property
 *
 * The block is rendered in-line with the trust badges, but distinct
 * because anti-features are *opt-in disclosures*, not awards. They
 * answer "what should I know that might make me skip this app?"
 */
export function AntiFeaturesBlock({ slugs }: { slugs: string[] }) {
  if (!slugs || slugs.length === 0) return null;

  // Sort: scanner-source first (machine-derived, hardest evidence),
  // then developer, then moderator. Within each group, alphabetical.
  const SOURCE_ORDER: Record<string, number> = {
    scanner: 0,
    developer: 1,
    moderator: 2,
  };
  const sorted = [...slugs]
    .filter((s) => ANTI_FEATURES[s])
    .sort((a, b) => {
      const sa = ANTI_FEATURES[a]!.source;
      const sb = ANTI_FEATURES[b]!.source;
      if (sa !== sb) {
        return (SOURCE_ORDER[sa] ?? 99) - (SOURCE_ORDER[sb] ?? 99);
      }
      return a.localeCompare(b);
    });

  return (
    <section
      className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2"
      aria-label="Anti-features disclosures"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-900">
          Anti-features
        </h2>
        <Link
          href="/anti-features"
          className="text-xs text-blue-600 hover:text-blue-700"
        >
          What does this mean?
        </Link>
      </div>
      <p className="text-xs text-gray-600">
        Things you might want to know before installing. Hover or tap a chip
        for the full definition; click to find other apps with the same
        property.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {sorted.map((slug) => {
          const meta = ANTI_FEATURES[slug];
          if (!meta) return null;
          const tone =
            TONE_BY_SLUG[slug] ?? "bg-gray-100 text-gray-700 border-gray-200";
          return (
            <Link
              key={slug}
              href={`/search?antiFeature=${encodeURIComponent(slug)}`}
              title={meta.description}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${tone} hover:shadow-sm transition-shadow`}
            >
              {meta.label}
              <span className="opacity-60 text-[10px] font-normal">
                {sourceShort(meta.source)}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function sourceShort(source: "developer" | "scanner" | "moderator"): string {
  switch (source) {
    case "scanner":
      return "scan";
    case "developer":
      return "dev";
    case "moderator":
      return "mod";
  }
}
