"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UILocalePicker } from "./ui-locale-picker";

/**
 * Mobile-only navigation. On phones the header's Browse link and language
 * picker are hidden, leaving search as the only way to navigate off a deep
 * page. This hamburger opens a full-width panel with the primary discovery
 * links + the language picker. Hidden at sm+ where the inline nav shows.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const links = [
    { href: "/search", label: "Browse all apps" },
    { href: "/search?trustTier=verified", label: "Verified apps" },
    { href: "/categories", label: "Categories" },
    { href: "/transparency-report", label: "Transparency report" },
    { href: "/about", label: "About OpenMarket" },
  ];

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="p-2 -mr-1 rounded-lg text-om-ink hover:bg-om-line-soft transition-colors"
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        )}
      </button>

      {open && (
        <>
          {/* Scrim */}
          <div
            className="fixed inset-0 top-16 z-30 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <nav
            aria-label="Mobile navigation"
            className="fixed inset-x-0 top-16 z-40 bg-om-surface border-b border-om-line px-4 py-3 space-y-1 shadow-xl"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-3 rounded-lg text-sm font-medium text-om-ink-mute hover:text-om-primary hover:bg-om-surface-tint transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <div className="pt-3 mt-2 border-t border-om-line-soft">
              <UILocalePicker />
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
