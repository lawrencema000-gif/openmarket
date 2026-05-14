"use client";

import { useState } from "react";
import { PinUnlockDialog } from "./pin-unlock-dialog";

interface InstallBarProps {
  appId: string;
  appTitle: string;
  apkUrl?: string;
  sizeLabel?: string | null;
  packageName?: string | null;
  parental?: {
    role: "child" | "parent";
    requiresPinUnlock: boolean;
  } | null;
  experimentReport?: () => void;
  children?: React.ReactNode;
}

/**
 * Install-button wrapper (P3-F).
 *
 * When the API says the signed-in user is a child AND the app's rating
 * exceeds their parent's ceiling, intercept the click and show a PIN
 * dialog. On unlock we trigger the same anchor via `window.location`
 * so we don't have to re-implement the download flow.
 *
 * Also calls experimentReport on the click path so the install event
 * lands regardless of which gate fires.
 */
export function InstallBar({
  appId: _appId,
  appTitle,
  apkUrl,
  sizeLabel,
  packageName,
  parental,
  experimentReport,
  children,
}: InstallBarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const gated = parental?.role === "child" && parental.requiresPinUnlock;

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    experimentReport?.();
    if (gated && apkUrl) {
      e.preventDefault();
      setDialogOpen(true);
    }
  }

  function onUnlock() {
    setDialogOpen(false);
    if (apkUrl) {
      window.location.href = apkUrl;
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
        <a
          href={apkUrl ?? "#"}
          download={apkUrl ? true : undefined}
          onClick={onClick}
          className={`inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm text-sm ${!apkUrl ? "opacity-50 pointer-events-none" : ""}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Download APK
        </a>
        {sizeLabel && (
          <span className="text-sm text-blue-600 font-medium">{sizeLabel}</span>
        )}
        {packageName && (
          <code className="text-xs text-blue-500 font-mono bg-blue-100/60 px-2 py-1 rounded-md">
            {packageName}
          </code>
        )}
        {!apkUrl && (
          <span className="text-xs text-amber-600 font-medium">APK not yet available</span>
        )}
        {gated && apkUrl ? (
          <span
            className="text-[11px] text-amber-700 font-medium ml-2"
            role="note"
          >
            <span aria-hidden="true">🔒</span> Parent PIN required
          </span>
        ) : null}
        {children}
      </div>
      <PinUnlockDialog
        open={dialogOpen}
        appTitle={appTitle}
        onUnlock={onUnlock}
        onCancel={() => setDialogOpen(false)}
      />
    </>
  );
}
