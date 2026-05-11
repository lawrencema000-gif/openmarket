"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface DailyRow {
  day: string;
  totalInstalls: number;
  activeInstalls: number;
  newInstallsToday: number;
  uninstallsToday: number;
  totalReviews: number;
  newReviewsToday: number;
  avgRating: number;
  computedAt: string;
}

interface StatsResponse {
  range: { since: string; until: string };
  items: DailyRow[];
  summary: {
    totalNewInstalls: number;
    totalNewReviews: number;
    latestAvgRating: number;
    latestActiveInstalls: number;
    latestTotalInstalls: number;
    computedAt: string | null;
  };
}

const WINDOW_PRESETS: Array<{ label: string; days: number }> = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export default function StatisticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(30);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const today = new Date();
        today.setUTCDate(today.getUTCDate() - 1);
        const until = today.toISOString().slice(0, 10);
        const start = new Date(today);
        start.setUTCDate(start.getUTCDate() - (windowDays - 1));
        const since = start.toISOString().slice(0, 10);
        const r = await api.get<StatsResponse>(
          `/api/apps/${id}/statistics?since=${since}&until=${until}`,
        );
        setData(r);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, windowDays]);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Daily installs, library state, and review trends for this app.
            Recomputed every night UTC; the latest day shown is yesterday.
          </p>
        </div>
        <Link
          href={`/apps/${id}`}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          ← Back to app
        </Link>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {WINDOW_PRESETS.map((p) => {
          const active = windowDays === p.days;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => setWindowDays(p.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                active
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Last {p.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-10 text-center">
          <p className="text-gray-700 font-medium">No statistics yet.</p>
          <p className="text-sm text-gray-500 mt-1">
            Daily stats land overnight UTC. If your app was published less
            than a day ago, check back tomorrow.
          </p>
        </div>
      ) : (
        <>
          <SummaryCards summary={data.summary} windowDays={windowDays} />
          <ChartCard
            title="New installs per day"
            subtitle={`Total over window: ${data.summary.totalNewInstalls.toLocaleString()}`}
            color="#2563eb"
            points={data.items.map((r) => ({ day: r.day, value: r.newInstallsToday }))}
            format={(v) => v.toLocaleString()}
          />
          <ChartCard
            title="Active installs (snapshot)"
            subtitle="Library entries still active at end of day"
            color="#059669"
            points={data.items.map((r) => ({ day: r.day, value: r.activeInstalls }))}
            format={(v) => v.toLocaleString()}
          />
          <ChartCard
            title="Average rating"
            subtitle={`Latest: ${data.summary.latestAvgRating.toFixed(2)} ★`}
            color="#d97706"
            points={data.items.map((r) => ({ day: r.day, value: r.avgRating }))}
            yMax={5}
            yMin={0}
            format={(v) => v.toFixed(2)}
          />
          <ChartCard
            title="New reviews per day"
            subtitle={`Total over window: ${data.summary.totalNewReviews.toLocaleString()}`}
            color="#7c3aed"
            points={data.items.map((r) => ({ day: r.day, value: r.newReviewsToday }))}
            format={(v) => v.toLocaleString()}
          />

          {data.summary.computedAt && (
            <p className="text-xs text-gray-400">
              Computed {new Date(data.summary.computedAt).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCards({
  summary,
  windowDays,
}: {
  summary: StatsResponse["summary"];
  windowDays: number;
}) {
  const cards = [
    {
      label: "Total installs",
      value: summary.latestTotalInstalls.toLocaleString(),
      sub: `+${summary.totalNewInstalls.toLocaleString()} in ${windowDays}d`,
    },
    {
      label: "Active installs",
      value: summary.latestActiveInstalls.toLocaleString(),
      sub: "library entries not uninstalled",
    },
    {
      label: "Avg rating",
      value: summary.latestAvgRating > 0 ? summary.latestAvgRating.toFixed(2) : "—",
      sub: `${summary.totalNewReviews.toLocaleString()} new reviews in ${windowDays}d`,
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white border border-gray-200 rounded-xl p-4"
        >
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
            {c.label}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{c.value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

interface ChartPoint {
  day: string;
  value: number;
}

function ChartCard({
  title,
  subtitle,
  color,
  points,
  yMin,
  yMax,
  format,
}: {
  title: string;
  subtitle: string;
  color: string;
  points: ChartPoint[];
  yMin?: number;
  yMax?: number;
  format: (n: number) => string;
}) {
  const W = 720;
  const H = 160;
  const PAD = { left: 44, right: 12, top: 12, bottom: 24 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = points.map((p) => p.value);
  const lo = yMin != null ? yMin : Math.min(0, Math.min(...values));
  const hiRaw = yMax != null ? yMax : Math.max(...values, 1);
  const hi = hiRaw === lo ? lo + 1 : hiRaw;

  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;

  // Build the path. Move-to first, line-to the rest.
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  // Three Y-axis ticks: lo, mid, hi.
  const yTicks = [lo, (lo + hi) / 2, hi];

  // X-axis ticks: first, middle, last.
  const xTickIndices =
    points.length <= 3
      ? points.map((_, i) => i)
      : [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={title}
      >
        {/* Y gridlines + labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="#e5e7eb"
              strokeDasharray={i === 0 || i === yTicks.length - 1 ? "" : "2 3"}
            />
            <text
              x={PAD.left - 6}
              y={y(t) + 3}
              textAnchor="end"
              fontSize={10}
              fill="#6b7280"
            >
              {format(t)}
            </text>
          </g>
        ))}
        {/* X labels */}
        {xTickIndices.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - PAD.bottom + 14}
            textAnchor="middle"
            fontSize={10}
            fill="#6b7280"
          >
            {fmtDayLabel(points[i]!.day)}
          </text>
        ))}
        {/* Line */}
        <path d={path} stroke={color} strokeWidth={2} fill="none" />
        {/* Last-point dot */}
        <circle
          cx={x(points.length - 1)}
          cy={y(values[values.length - 1] ?? 0)}
          r={3.5}
          fill={color}
        />
      </svg>
    </div>
  );
}

function fmtDayLabel(day: string): string {
  // YYYY-MM-DD → "May 9"
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
