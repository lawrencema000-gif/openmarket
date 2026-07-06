"use client";

import { useEffect, useRef, useState } from "react";

interface StickyInstallBarProps {
  /** id of the in-flow install bar to observe. */
  targetId: string;
  appTitle: string;
  iconUrl?: string | null;
  apkUrl?: string | null;
  /** e.g. "$9.99"; null/omitted = free. */
  priceLabel?: string | null;
  /** Parental gate active — don't offer a direct download link. */
  gated?: boolean;
}

/**
 * Mobile-only sticky install bar (Play-style). The primary install action
 * is otherwise in-flow near the top of a very long page, so on a phone it
 * scrolls away and the user can't install without scrolling back up. This
 * reveals a fixed bottom bar once the in-flow InstallBar leaves the top of
 * the viewport.
 *
 * It does NOT re-implement the parental-PIN gate: when the app is gated (or
 * has no APK yet) the button scrolls to the real InstallBar rather than
 * bypassing it; only the plain, non-gated case gets a direct download link.
 * Hidden at lg+ where the sidebar install card is always visible.
 */
export function StickyInstallBar({
  targetId,
  appTitle,
  iconUrl,
  apkUrl,
  priceLabel,
  gated,
}: StickyInstallBarProps) {
  const [show, setShow] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // Reveal once the in-flow bar has scrolled ABOVE the viewport top.
        setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  const scrollToInstall = () =>
    document
      .getElementById(targetId)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });

  const btnClass =
    "shrink-0 bg-om-cta text-white px-5 py-2 rounded-lg font-semibold text-sm hover:bg-om-cta-deep transition-colors";

  return (
    <div
      ref={barRef}
      aria-hidden={!show}
      className={
        "lg:hidden fixed inset-x-0 bottom-0 z-40 om-glass-strong border-t border-om-line " +
        "px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] transition-transform duration-200 " +
        (show ? "translate-y-0" : "translate-y-full pointer-events-none")
      }
    >
      <div className="flex items-center gap-3 max-w-3xl mx-auto">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconUrl}
            alt=""
            className="w-9 h-9 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-om-surface-tint shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-om-ink truncate">
            {appTitle}
          </p>
          <p className="text-xs text-om-ink-soft">{priceLabel ?? "Free"}</p>
        </div>
        {apkUrl && !gated ? (
          <a href={apkUrl} download className={btnClass}>
            Download
          </a>
        ) : (
          <button type="button" onClick={scrollToInstall} className={btnClass}>
            {apkUrl ? "Download" : "View"}
          </button>
        )}
      </div>
    </div>
  );
}
