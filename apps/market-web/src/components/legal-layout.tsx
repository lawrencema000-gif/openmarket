import Link from "next/link";
import type { ReactNode } from "react";

export interface LegalLayoutProps {
  title: string;
  /** ISO date — e.g., "2026-04-30". Renders next to title. */
  effectiveDate: string;
  /** Version slug shown next to date (e.g., "v2026.04.30"). */
  version: string;
  /** Optional banner above the body — used to mark drafts. */
  banner?: ReactNode;
  /** Anchors for the in-page TOC. Each must match an `id` attribute on a heading in `children`. */
  toc?: Array<{ id: string; label: string }>;
  children: ReactNode;
}

const LEGAL_LINKS = [
  { href: "/about", label: "About" },
  { href: "/content-policy", label: "Content Policy" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/dmca", label: "DMCA" },
  { href: "/security", label: "Security" },
  { href: "/transparency-report", label: "Transparency Report" },
];

export function LegalLayout({
  title,
  effectiveDate,
  version,
  banner,
  toc,
  children,
}: LegalLayoutProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-12">
        {/* Sidebar nav */}
        <nav
          aria-label="Legal & policy pages"
          className="lg:sticky lg:top-24 self-start"
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Policies
          </h2>
          <ul className="space-y-1 text-sm">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="block px-2 py-1.5 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          {toc && toc.length > 0 ? (
            <>
              <h2 className="mt-8 text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                On this page
              </h2>
              <ul className="space-y-1 text-sm">
                {toc.map((t) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="block px-2 py-1 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    >
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </nav>

        {/* Main column */}
        <article className="min-w-0">
          <header className="mb-8 pb-6 border-b border-gray-200">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              {title}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              <span>Effective {effectiveDate}</span>
              <span className="mx-2">·</span>
              <span>Version {version}</span>
            </p>
          </header>
          {banner ? <div className="mb-8">{banner}</div> : null}
          <div className="prose prose-gray max-w-none prose-headings:scroll-mt-24 prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-xl prose-h2:font-semibold prose-h3:mt-6 prose-h3:text-lg prose-h3:font-semibold prose-a:text-blue-600 hover:prose-a:text-blue-800 prose-strong:text-gray-900">
            {children}
          </div>
        </article>
      </div>
    </div>
  );
}

export function DraftBanner({ note }: { note?: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold m-0">Draft — pending legal review</p>
      <p className="mt-1 m-0 text-amber-800">
        {note ??
          "This document is published in draft form. Do not rely on it as binding until it is reviewed by counsel and the draft notice is removed."}
      </p>
    </div>
  );
}
