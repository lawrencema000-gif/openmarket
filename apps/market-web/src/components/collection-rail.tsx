import Link from "next/link";

export interface CollectionRailApp {
  id: string;
  packageName: string;
  trustTier: string;
  title: string;
  shortDescription: string | null;
  iconUrl: string | null;
  category?: string | null;
  developerName?: string | null;
}

export interface CollectionRailData {
  slug: string;
  title: string;
  blurb?: string | null;
  rationale?: string | null;
  curatorName?: string | null;
  icon?: string | null;
  apps: CollectionRailApp[];
}

/**
 * Horizontal rail of a HAND-CURATED editorial collection. Unlike ChartRail
 * (which leads each card with an algorithmic rank pill), this leads with a
 * named-curator byline — the honest-curation signal: a human vouched for this
 * list and you can see who. No rank pills; the order is the curator's, not a
 * ranking formula's.
 */
export function CollectionRail({ collection }: { collection: CollectionRailData }) {
  const { slug, title, blurb, curatorName, icon, apps } = collection;
  if (apps.length === 0) return null;

  return (
    <section aria-labelledby={`collection-${slug}`}>
      <div className="flex items-end justify-between mb-4 gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? (
              <span aria-hidden className="text-xl leading-none">
                {icon}
              </span>
            ) : null}
            <h2
              id={`collection-${slug}`}
              className="text-2xl font-bold text-om-ink tracking-tight"
            >
              {title}
            </h2>
          </div>
          {blurb ? (
            <p className="text-sm text-om-ink-soft mt-0.5">{blurb}</p>
          ) : null}
          {curatorName ? <CuratorByline name={curatorName} /> : null}
        </div>
        <Link
          href={`/collections/${slug}`}
          className="text-sm text-om-primary hover:text-om-primary-deep font-medium flex items-center gap-1 shrink-0"
        >
          View collection
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </Link>
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
          {apps.map((app) => (
            <li key={app.id} className="snap-start shrink-0 w-[260px]">
              <Link
                href={`/apps/${app.id}`}
                className="group flex flex-col h-full bg-om-surface border border-om-line hover:border-om-primary/40 hover:shadow-md rounded-xl p-4 transition-all"
              >
                <div className="flex items-start gap-3">
                  {app.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={app.iconUrl}
                      alt={`${app.title} icon`}
                      className="w-12 h-12 rounded-xl object-cover shadow-sm shrink-0"
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-om-primary/15 to-om-primary/20 flex items-center justify-center text-om-primary font-semibold text-lg shrink-0">
                      {app.title.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-om-ink truncate group-hover:text-om-primary transition-colors">
                      {app.title}
                    </p>
                    {/* Developer name, not the raw package id — a novice
                        expects "who made this" here. Package names live on
                        the app detail page where they're explained. */}
                    <p className="text-xs text-om-ink-soft truncate">
                      {app.developerName || app.packageName}
                    </p>
                  </div>
                </div>
                {app.shortDescription ? (
                  <p className="text-sm text-om-ink-mute line-clamp-2 mt-3">
                    {app.shortDescription}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** "Curated by <name>" chip — the named-human-accountability signal. */
export function CuratorByline({ name }: { name: string }) {
  return (
    <p className="mt-1.5">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-om-primary/10 text-om-primary px-2.5 py-0.5 text-xs font-medium">
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 19.5a7.5 7.5 0 0 1 15 0v.75H4.5v-.75Z"
          />
        </svg>
        Curated by {name}
      </span>
    </p>
  );
}
