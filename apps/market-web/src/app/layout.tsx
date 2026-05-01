import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Link from "next/link";
import { SearchForm } from "@/components/search-form";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const PLAUSIBLE_HOST =
  process.env.NEXT_PUBLIC_PLAUSIBLE_HOST ?? "https://plausible.io";

export const metadata: Metadata = {
  title: "OpenMarket — Android App Marketplace",
  description: "Discover, evaluate, and download Android apps with full transparency.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50/50 text-gray-900 flex flex-col">
        {/* Plausible — privacy-respecting analytics. No cookies, no personal IDs.
            Active only when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set in env. */}
        {PLAUSIBLE_DOMAIN ? (
          <Script
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src={`${PLAUSIBLE_HOST}/js/script.js`}
            strategy="afterInteractive"
          />
        ) : null}

        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>

        <header
          role="banner"
          className="bg-white border-b border-gray-200/80 sticky top-0 z-40 shadow-sm"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-2 shrink-0 group">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm group-hover:bg-blue-700 transition-colors">
                <svg
                  className="w-4 h-4 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span className="font-bold text-xl text-gray-900 tracking-tight">OpenMarket</span>
            </Link>

            {/* Center search */}
            <div className="flex-1 max-w-xl hidden sm:block">
              <SearchForm size="md" shortcut="⌘K" placeholder="Search apps, developers..." />
            </div>

            {/* Nav links */}
            <nav
              role="navigation"
              aria-label="Main navigation"
              className="flex items-center gap-1 text-sm shrink-0"
            >
              <Link
                href="/search"
                className="px-3 py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 font-medium transition-colors"
              >
                Browse
              </Link>
              <Link
                href="/search"
                className="px-3 py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 font-medium transition-colors"
              >
                Developers
              </Link>
            </nav>
          </div>

          {/* Mobile search bar */}
          <div className="sm:hidden border-t border-gray-100 px-4 py-2">
            <SearchForm size="sm" placeholder="Search apps..." />
          </div>
        </header>

        <main
          id="main-content"
          className="flex-1 w-full"
        >
          {children}
        </main>

        <footer className="bg-gray-50 border-t border-gray-200/80 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {/* Discover */}
              <div>
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-widest mb-4">
                  Discover
                </h3>
                <ul className="space-y-2.5 text-sm text-gray-500">
                  <li><Link href="/search" className="hover:text-gray-900 transition-colors">Browse All Apps</Link></li>
                  <li><Link href="/search?trustTier=verified" className="hover:text-gray-900 transition-colors">Verified Apps</Link></li>
                  <li><Link href="/search?category=productivity" className="hover:text-gray-900 transition-colors">Productivity</Link></li>
                  <li><Link href="/search?category=tools" className="hover:text-gray-900 transition-colors">Tools</Link></li>
                </ul>
              </div>

              {/* Developers */}
              <div>
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-widest mb-4">
                  Developers
                </h3>
                <ul className="space-y-2.5 text-sm text-gray-500">
                  <li><a href="https://openmarket-dev-portal.vercel.app" className="hover:text-gray-900 transition-colors">Developer Portal</a></li>
                  <li><a href="https://openmarket-dev-portal.vercel.app/apps/new" className="hover:text-gray-900 transition-colors">Publish an App</a></li>
                  <li><a href="#" title="Coming Soon" className="hover:text-gray-900 transition-colors">API Reference</a></li>
                  <li><a href="#" title="Coming Soon" className="hover:text-gray-900 transition-colors">Trust Framework</a></li>
                </ul>
              </div>

              {/* About */}
              <div>
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-widest mb-4">
                  About
                </h3>
                <ul className="space-y-2.5 text-sm text-gray-500">
                  <li><Link href="/about" className="hover:text-gray-900 transition-colors">About OpenMarket</Link></li>
                  <li><Link href="/content-policy" className="hover:text-gray-900 transition-colors">Content Policy</Link></li>
                  <li><Link href="/transparency-report" className="hover:text-gray-900 transition-colors">Transparency Report</Link></li>
                  <li><a href="https://github.com/lawrencema000-gif/openmarket" className="hover:text-gray-900 transition-colors">GitHub</a></li>
                </ul>
              </div>

              {/* Legal */}
              <div>
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-widest mb-4">
                  Legal
                </h3>
                <ul className="space-y-2.5 text-sm text-gray-500">
                  <li><Link href="/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="hover:text-gray-900 transition-colors">Terms of Service</Link></li>
                  <li><Link href="/dmca" className="hover:text-gray-900 transition-colors">DMCA</Link></li>
                  <li><Link href="/security" className="hover:text-gray-900 transition-colors">Security</Link></li>
                </ul>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-gray-900">OpenMarket</span>
              </div>
              <p className="text-xs text-gray-400">© 2026 OpenMarket. Open source, transparent, yours.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
