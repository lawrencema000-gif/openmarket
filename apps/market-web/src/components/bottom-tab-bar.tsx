"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { features } from "@/lib/features";

/**
 * Persistent mobile bottom-tab bar (Play-style primary IA). Phones previously
 * had only a top hamburger drawer, so the primary destinations were two taps
 * away behind a menu. This puts Home / Search / Browse / Library / Account one
 * thumb-tap away and highlights the active section.
 *
 * Stacking: fixed bottom-0 z-40, lg:hidden (desktop uses the top nav). On an
 * app-detail page the StickyInstallBar sits DIRECTLY ABOVE this bar (its bottom
 * is offset by this bar's height), so the two never overlap. The layout adds
 * matching bottom padding to <body> so the footer clears the bar.
 */

interface Tab {
  href: string;
  label: string;
  /** Active when the current path matches. */
  match: (path: string) => boolean;
  icon: React.ReactNode;
}

function icon(path: string) {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export function BottomTabBar() {
  const pathname = usePathname() || "/";

  const tabs: Tab[] = [
    {
      href: "/",
      label: "Home",
      match: (p) => p === "/",
      icon: icon("m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"),
    },
    {
      href: "/search",
      label: "Search",
      match: (p) => p.startsWith("/search"),
      icon: icon("m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"),
    },
    {
      href: "/categories",
      label: "Browse",
      match: (p) => p.startsWith("/categories") || p.startsWith("/collections") || p.startsWith("/charts"),
      icon: icon("M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25A2.25 2.25 0 0 1 13.5 8.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"),
    },
  ];

  if (features.library) {
    tabs.push({
      href: "/library",
      label: "Library",
      match: (p) => p.startsWith("/library"),
      icon: icon("M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"),
    });
  }
  if (features.userAccounts) {
    tabs.push({
      href: "/account",
      label: "Account",
      match: (p) => p.startsWith("/account"),
      icon: icon("M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"),
    });
  }

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 om-glass-strong border-t border-om-line pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-medium transition-colors " +
                  (active
                    ? "text-om-primary"
                    : "text-om-ink-soft hover:text-om-ink")
                }
              >
                {tab.icon}
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
