import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

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
      <body className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
            <Link href="/" className="font-bold text-xl text-blue-600 shrink-0">
              OpenMarket
            </Link>
            <form action="/search" method="GET" className="flex-1 max-w-lg">
              <input
                type="search"
                name="q"
                placeholder="Search apps..."
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </form>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/search" className="text-gray-600 hover:text-gray-900">
                Browse
              </Link>
              <Link href="/search?trustTier=verified" className="text-gray-600 hover:text-gray-900">
                Verified
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-sm text-gray-500 flex gap-6">
            <span>© 2025 OpenMarket</span>
            <Link href="/search" className="hover:text-gray-700">Browse All Apps</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
