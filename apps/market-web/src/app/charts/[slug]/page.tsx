import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";

const CHART_META: Record<string, { title: string; subtitle: string }> = {
  "top-trending": {
    title: "Top trending",
    subtitle:
      "Ranked by install velocity over the chosen window. Refreshed hourly. Recency-weighted: a 100-install spike yesterday outranks a 100-install week.",
  },
  "top-new": {
    title: "New on OpenMarket",
    subtitle:
      "Apps whose first stable release landed inside the chosen window, ranked by install count.",
  },
  "top-free": {
    title: "Top free",
    subtitle: "Total install count over the chosen window. (All apps on OpenMarket are free in v1.)",
  },
  "top-rated": {
    title: "Top rated",
    subtitle:
      "Bayesian-smoothed average rating over the chosen window. Weights the global prior so a single 5-star review can't dominate.",
  },
};

const WINDOWS: Array<{ value: "24h" | "7d" | "30d"; label: string }> = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

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

interface ChartResponse {
  slug: string;
  window: string;
  category: string | null;
  computedAt: string | null;
  items: ChartItem[];
}

async function getChart(slug: string, window: string): Promise<ChartResponse | null> {
  try {
    return await apiFetch<ChartResponse>(`/api/charts/${slug}?window=${window}&limit=100`);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = CHART_META[slug];
  if (!meta) return { title: "Charts — OpenMarket" };
  return {
    title: `${meta.title} — OpenMarket`,
    description: meta.subtitle,
  };
}

export default async function ChartDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const { slug } = await params;
  const { window: rawWindow } = await searchParams;
  const window = WINDOWS.find((w) => w.value === rawWindow)?.value ?? "7d";

  const meta = CHART_META[slug];
  if (!meta) notFound();

  const data = await getChart(slug, window);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <nav className="text-sm text-om-ink-soft flex items-center gap-1.5">
        <Link href="/" className="hover:text-om-ink">Home</Link>
        <span>/</span>
        <Link href="/charts" className="hover:text-om-ink">Charts</Link>
        <span>/</span>
        <span className="text-om-ink font-medium">{meta.title}</span>
      </nav>

      <header>
        <h1 className="text-3xl font-bold text-om-ink tracking-tight">{meta.title}</h1>
        <p className="mt-2 text-om-ink-mute max-w-3xl">{meta.subtitle}</p>
      </header>

      <div className="flex gap-1 bg-om-line-soft p-1 rounded-lg w-fit">
        {WINDOWS.map((w) => {
          const active = window === w.value;
          return (
            <Link
              key={w.value}
              href={`/charts/${slug}?window=${w.value}`}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                active
                  ? "bg-om-surface text-om-ink shadow-sm"
                  : "text-om-ink-soft hover:text-om-ink"
              }`}
            >
              {w.label}
            </Link>
          );
        })}
      </div>

      {data?.computedAt && (
        <p className="text-xs text-om-ink-soft">
          Last refreshed {new Date(data.computedAt).toLocaleString()}.
        </p>
      )}

      {!data || data.items.length === 0 ? (
        <div className="rounded-xl border border-om-line bg-om-surface-tint px-6 py-10 text-center">
          <p className="text-om-ink-mute font-medium">No data yet.</p>
          <p className="text-sm text-om-ink-soft mt-1">
            Charts repopulate hourly via the recompute job. Once the API
            sees install + review traffic in this window, this list fills
            in.
          </p>
        </div>
      ) : (
        <ol className="bg-om-surface border border-om-line rounded-xl divide-y divide-gray-100 overflow-hidden">
          {data.items.map((item) => (
            <li key={item.appId}>
              <Link
                href={`/apps/${item.appId}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-om-surface-tint transition-colors"
              >
                <span className="w-10 text-2xl font-bold text-om-line text-right tabular-nums">
                  {item.position}
                </span>
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
                  <p className="font-semibold text-om-ink truncate">{item.title}</p>
                  <p className="text-sm text-om-ink-soft truncate">{item.shortDescription}</p>
                </div>
                <Delta value={item.deltaPosition} />
              </Link>
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-om-ink-soft max-w-3xl">
        These rankings are <strong>formulaic, not editorial</strong>. The
        ordering function is published in our{" "}
        <Link href="/content-policy" className="text-om-primary hover:text-om-primary">
          content policy
        </Link>{" "}
        and reproducible from the public install + review data.
      </p>
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-xs text-om-line">new</span>;
  }
  if (value === 0) {
    return <span className="text-xs text-om-line">·</span>;
  }
  if (value > 0) {
    return (
      <span className="text-xs font-mono text-emerald-600 shrink-0">▲ {value}</span>
    );
  }
  return (
    <span className="text-xs font-mono text-rose-600 shrink-0">▼ {Math.abs(value)}</span>
  );
}
