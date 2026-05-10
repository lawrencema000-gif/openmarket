import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Charts — OpenMarket",
  description:
    "Top trending, top new, top free, and top rated apps on OpenMarket. Formulaic — not editorial.",
};

const CHARTS = [
  {
    slug: "top-trending",
    title: "Top trending",
    blurb: "Install velocity over the last 7 days, recency-weighted.",
    icon: "📈",
  },
  {
    slug: "top-new",
    title: "New on OpenMarket",
    blurb: "Apps whose first stable release landed in the last 30 days.",
    icon: "✨",
  },
  {
    slug: "top-free",
    title: "Top free",
    blurb: "Total installs over the chosen window.",
    icon: "⬇️",
  },
  {
    slug: "top-rated",
    title: "Top rated",
    blurb: "Bayesian-smoothed average rating with a global prior so a single 5-star review can't dominate.",
    icon: "⭐",
  },
];

export default function ChartsIndexPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Charts</h1>
        <p className="mt-2 text-gray-600 max-w-2xl">
          Reproducible rankings driven by public install + review data.
          OpenMarket does not curate. The ordering function for every
          chart is published in the{" "}
          <Link href="/content-policy" className="text-blue-600 hover:text-blue-700">
            content policy
          </Link>
          .
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CHARTS.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/charts/${c.slug}`}
              className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-md transition-all"
            >
              <span className="text-3xl flex-shrink-0">{c.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {c.title}
                </p>
                <p className="text-sm text-gray-600 mt-1">{c.blurb}</p>
              </div>
              <svg
                className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors shrink-0 mt-1"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
