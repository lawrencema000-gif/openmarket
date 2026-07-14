import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Link from "next/link";
import { SearchForm } from "@/components/search-form";
import { UserMenu } from "@/components/user-menu";
import { UILocalePicker } from "@/components/ui-locale-picker";
import { MobileNav } from "@/components/mobile-nav";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { I18nProvider } from "@/i18n/provider";
import { getUIT } from "@/i18n/server";
import {
  DEV_PORTAL_URL,
  IMPLEMENTATION_PLAN_URL,
  REPO_URL,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const PLAUSIBLE_HOST =
  process.env.NEXT_PUBLIC_PLAUSIBLE_HOST ?? "https://plausible.io";

const ROOT_TITLE = `${SITE_NAME} — Android App Marketplace`;
const ROOT_DESCRIPTION =
  "Discover, evaluate, and download Android apps with full transparency. Verified developers, security reviews, and an open transparency log.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: ROOT_TITLE,
    template: `%s — ${SITE_NAME}`,
  },
  description: ROOT_DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: ROOT_TITLE,
    description: ROOT_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: ROOT_TITLE, description: ROOT_DESCRIPTION },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale, messages, t } = await getUIT();
  return (
    <html lang={locale}>
      <body className="min-h-screen om-bg-app text-om-ink flex flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
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

        <I18nProvider locale={locale} messages={messages}>
        <a href="#main-content" className="om-skip-link text-sm">
          Skip to content
        </a>

        <header
          role="banner"
          className="om-glass-strong border-b border-om-line sticky top-0 z-40"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-2 shrink-0 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/30 group-hover:shadow-violet-500/50 transition-shadow">
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
              <span className="om-display font-bold text-xl text-om-ink tracking-tight">OpenMarket</span>
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
                className="px-3 py-2 rounded-lg text-om-ink-mute hover:text-om-primary hover:bg-om-primary/10 font-medium transition-colors hidden sm:block"
              >
                {t("nav.browse")}
              </Link>
              <div className="hidden md:block">
                <UILocalePicker />
              </div>
              <UserMenu />
              <MobileNav />
            </nav>
          </div>

          {/* Mobile search bar */}
          <div className="sm:hidden border-t border-om-line-soft px-4 py-2">
            <SearchForm size="sm" placeholder="Search apps..." />
          </div>
        </header>

        <main
          id="main-content"
          className="flex-1 w-full"
        >
          {children}
        </main>

        <footer className="om-glass border-t border-om-line mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {/* Discover */}
              <div>
                <h3 className="text-xs font-semibold text-om-ink uppercase tracking-[0.12em] mb-4">
                  Discover
                </h3>
                <ul className="space-y-2.5 text-sm text-om-ink-soft">
                  <li><Link href="/search" className="hover:text-om-primary transition-colors">Browse All Apps</Link></li>
                  {/* "verified" isn't a real tier — the API enum is
                      standard|enhanced|experimental; the old link 400'd. */}
                  <li><Link href="/search?trustTier=enhanced" className="hover:text-om-primary transition-colors">Enhanced-trust Apps</Link></li>
                  <li><Link href="/collections" className="hover:text-om-primary transition-colors">Collections</Link></li>
                  <li><Link href="/charts" className="hover:text-om-primary transition-colors">Top Charts</Link></li>
                  <li><Link href="/categories" className="hover:text-om-primary transition-colors">Categories</Link></li>
                </ul>
              </div>

              {/* Developers */}
              <div>
                <h3 className="text-xs font-semibold text-om-ink uppercase tracking-[0.12em] mb-4">
                  Developers
                </h3>
                <ul className="space-y-2.5 text-sm text-om-ink-soft">
                  <li><a href={DEV_PORTAL_URL} className="hover:text-om-primary transition-colors">Developer Portal</a></li>
                  <li><a href={`${DEV_PORTAL_URL}/apps/new`} className="hover:text-om-primary transition-colors">Publish an App</a></li>
                  <li><a href={IMPLEMENTATION_PLAN_URL} className="hover:text-om-primary transition-colors">Implementation plan</a></li>
                  <li><span className="text-om-ink-soft cursor-not-allowed" title="Tier 2 — coming after Tier 1 ships">API Reference (planned)</span></li>
                </ul>
              </div>

              {/* About */}
              <div>
                <h3 className="text-xs font-semibold text-om-ink uppercase tracking-[0.12em] mb-4">
                  {t("footer.about")}
                </h3>
                <ul className="space-y-2.5 text-sm text-om-ink-soft">
                  <li><Link href="/about" className="hover:text-om-primary transition-colors">About OpenMarket</Link></li>
                  <li><Link href="/how-we-review" className="hover:text-om-primary transition-colors">How We Review Apps</Link></li>
                  <li><Link href="/anti-features" className="hover:text-om-primary transition-colors">Anti-Features</Link></li>
                  <li><Link href="/content-policy" className="hover:text-om-primary transition-colors">Content Policy</Link></li>
                  <li><Link href="/transparency-report" className="hover:text-om-primary transition-colors">Transparency Report</Link></li>
                  <li><a href={REPO_URL} className="hover:text-om-primary transition-colors">GitHub</a></li>
                </ul>
              </div>

              {/* Legal */}
              <div>
                <h3 className="text-xs font-semibold text-om-ink uppercase tracking-[0.12em] mb-4">
                  {t("footer.legal")}
                </h3>
                <ul className="space-y-2.5 text-sm text-om-ink-soft">
                  <li><Link href="/privacy" className="hover:text-om-primary transition-colors">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="hover:text-om-primary transition-colors">Terms of Service</Link></li>
                  <li><Link href="/dmca" className="hover:text-om-primary transition-colors">DMCA</Link></li>
                  <li><Link href="/security" className="hover:text-om-primary transition-colors">Security</Link></li>
                </ul>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-om-line flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-600 to-violet-700 flex items-center justify-center shadow-sm shadow-violet-500/40">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <span className="om-display text-sm font-semibold text-om-ink">OpenMarket</span>
              </div>
              <p className="text-xs text-om-ink-soft">© 2026 OpenMarket. Open source, transparent, yours.</p>
            </div>
          </div>
        </footer>

        {/* Mobile primary navigation. Fixed bottom, lg:hidden. On app-detail
            pages the StickyInstallBar stacks directly above this bar. */}
        <BottomTabBar />
        </I18nProvider>
      </body>
    </html>
  );
}
