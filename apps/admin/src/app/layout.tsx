import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenMarket Admin",
  description: "OpenMarket moderation console",
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/risk-queue", label: "Risk Queue" },
  { href: "/reports", label: "Reports" },
  { href: "/developers", label: "Developers" },
  { href: "/audit-log", label: "Audit Log" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
            <div className="px-5 py-5 border-b border-gray-700">
              <h1 className="text-base font-semibold tracking-wide text-white">
                OpenMarket
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">Admin Console</p>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center px-3 py-2 text-sm rounded-md text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="px-5 py-4 border-t border-gray-700">
              <p className="text-xs text-gray-500">Moderator Session</p>
            </div>
          </aside>

          {/* Main area */}
          <div className="flex-1 flex flex-col min-w-0">
            <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">
                OpenMarket Admin
              </h2>
              <span className="text-xs text-gray-400">
                {new Date().toLocaleDateString()}
              </span>
            </header>
            <main className="flex-1 p-8 overflow-auto">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
