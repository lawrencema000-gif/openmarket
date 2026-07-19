import Link from "next/link";

export interface ChartRailItem {
  position: number;
  deltaPosition: number | null;
  appId: string;
  packageName: string;
  trustTier: string;
  title: string;
  shortDescription: string;
  category: string;
  iconUrl: string | null;
  developerName?: string | null;
}

/**
 * Horizontal rail of chart-ranked apps. Position pill on each card —
 * the rank is the load-bearing UI signal here, distinct from a
 * curated list.
 *
 * Delta arrows: ▲ when an app moved up vs the previous compute, ▼
 * when down, • for unchanged, nothing for first-time entries.
 */
export function ChartRail({
  title,
  subtitle,
  items,
  href,
}: {
  title: string;
  subtitle: string;
  items: ChartRailItem[];
  href: string;
}) {
  return (
    <section>
      <div className="flex items-end justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-om-ink tracking-tight">{title}</h2>
          <p className="text-sm text-om-ink-soft mt-0.5">{subtitle}</p>
        </div>
        <Link
          href={href}
          className="text-sm text-om-primary hover:text-om-primary-deep font-medium flex items-center gap-1"
        >
          View full chart
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
          {items.map((item) => (
            <li key={item.appId} className="snap-start shrink-0 w-[260px]">
              <Link
                href={`/apps/${item.appId}`}
                className="group flex flex-col h-full bg-om-surface border border-om-line hover:border-om-primary/40 hover:shadow-md rounded-xl p-4 transition-all"
              >
                <div className="flex items-start gap-3">
                  <PositionPill
                    position={item.position}
                    delta={item.deltaPosition}
                  />
                  {item.iconUrl ? (
                    <img
                      src={item.iconUrl}
                      alt={`${item.title} icon`}
                      className="w-12 h-12 rounded-xl object-cover shadow-sm"
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-om-line-soft shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-om-ink truncate group-hover:text-om-primary transition-colors">
                      {item.title}
                    </p>
                    <p className="text-xs text-om-ink-soft truncate">
                      {item.developerName || item.packageName}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-om-ink-mute line-clamp-2 mt-3">
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

function PositionPill({
  position,
  delta,
}: {
  position: number;
  delta: number | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center w-9 shrink-0">
      <span className="text-lg font-bold text-om-ink leading-none">{position}</span>
      <DeltaArrow delta={delta} />
    </div>
  );
}

function DeltaArrow({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="text-[9px] text-om-ink-soft mt-0.5">new</span>;
  }
  if (delta === 0) {
    return <span className="text-[9px] text-om-ink-soft mt-0.5">·</span>;
  }
  if (delta > 0) {
    return (
      <span className="text-[9px] text-om-cta mt-0.5 font-mono">
        ▲{delta}
      </span>
    );
  }
  return (
    <span className="text-[9px] text-om-danger mt-0.5 font-mono">
      ▼{Math.abs(delta)}
    </span>
  );
}
