import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenMarket Developer Console",
  description: "Manage your apps and releases on OpenMarket.",
};

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/apps", label: "My Apps" },
  { href: "/signing-keys", label: "Signing Keys" },
  { href: "/profile", label: "Profile" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <header role="banner" className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
            <Link href="/dashboard" className="font-bold text-xl text-blue-600 shrink-0">
              OpenMarket Developer Console
            </Link>
          </div>
        </header>

        <div className="flex flex-1 max-w-7xl mx-auto w-full">
          {/* Sidebar */}
          <aside className="w-56 shrink-0 border-r border-gray-200 bg-white px-4 py-6 hidden md:block">
            <nav role="navigation" aria-label="Developer console navigation" className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Main content */}
          <main id="main-content" className="flex-1 px-4 sm:px-8 py-8 min-w-0">
            {children}
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav role="navigation" aria-label="Mobile navigation" className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex-1 py-3 text-xs text-center text-gray-600 hover:text-blue-600"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </body>
    </html>
  );
}
