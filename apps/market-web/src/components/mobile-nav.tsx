"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UILocalePicker } from "./ui-locale-picker";

/**
 * Mobile-only navigation. On phones the header's Browse link and language
 * picker are hidden, leaving search as the only way to navigate off a deep
 * page. This hamburger opens a full-width panel with the primary discovery
 * links + the language picker. Hidden at sm+ where the inline nav shows.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Close on ANY navigation — the bottom tab bar sits above the scrim, so a
  // tab tap used to navigate while the drawer stayed open over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const links = [
    { href: "/search", label: "Browse all apps" },
    // "verified" is not a real tier (enum: standard|enhanced|experimental) —
    // this link 400'd and the page blamed the API. See /how-we-review#tiers.
    { href: "/search?trustTier=enhanced", label: "Enhanced-trust apps" },
    { href: "/collections", label: "Collections" },
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
          {/* Scrim — must sit ABOVE the bottom tab bar (z-40) so an outside
              tap closes the drawer instead of activating chrome beneath it. */}
          <div
            className="fixed inset-0 top-16 z-[55] bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <nav
            aria-label="Mobile navigation"
            className="fixed inset-x-0 top-16 z-[60] bg-om-surface border-b border-om-line px-4 py-3 space-y-1 shadow-xl"
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
