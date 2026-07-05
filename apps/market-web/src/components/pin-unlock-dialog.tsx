"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

interface PinUnlockDialogProps {
  open: boolean;
  appTitle: string;
  onUnlock: () => void;
  onCancel: () => void;
}

/**
 * Modal that asks a signed-in child user for the parent's PIN before
 * proceeding to install (P3-F). The verify endpoint is server-rate-
 * limited + locks out after PIN_LOCKOUT_THRESHOLD misses; the dialog
 * just surfaces the resulting error string verbatim.
 *
 * Accessibility (P3-L):
 *   - role="dialog" + aria-modal="true" + aria-labelledby pointing at
 *     the visible heading so screen readers announce the modal context
 *   - Escape key dismisses the dialog
 *   - returns focus to the previously focused element on close so the
 *     install button regains focus rather than the page <body>
 *   - error region uses aria-live="polite" so retries get spoken back
 */
export function PinUnlockDialog({
  open,
  appTitle,
  onUnlock,
  onCancel,
}: PinUnlockDialogProps) {
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Stash the element that opened us so we can restore focus on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  // Escape key dismisses.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/users/me/parental-controls/verify-pin", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      setPin("");
      onUnlock();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "PIN check failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onClick={(e) => {
        // Backdrop click cancels — only when the click is on the
        // backdrop itself, not bubbled up from the panel.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-om-surface rounded-2xl shadow-lg max-w-sm w-full p-6 space-y-4">
        <div>
          <h2 id={headingId} className="text-lg font-semibold text-om-ink">
            Parent PIN required
          </h2>
          <p className="text-sm text-om-ink-soft mt-1">
            <strong>{appTitle}</strong> is above your allowed rating. Ask
            your parent to enter their PIN to continue.
          </p>
        </div>
        <label className="block">
          <span className="sr-only">Parent PIN</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="••••"
            autoFocus
            className="w-full text-center text-2xl tracking-widest font-mono rounded-lg border border-om-line px-4 py-3 focus:border-om-primary focus:ring-2 focus:ring-om-primary/20 focus:outline-none"
            aria-describedby={error ? `${headingId}-error` : undefined}
          />
        </label>
        <div
          role="status"
          aria-live="polite"
          className="min-h-[1.25rem]"
        >
          {error ? (
            <div
              id={`${headingId}-error`}
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              {error}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-sm font-medium px-4 py-2 rounded-md border border-om-line text-om-ink-mute hover:bg-om-surface-tint disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-om-primary focus-visible:ring-offset-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || pin.length < 4}
            className="text-sm font-medium px-4 py-2 rounded-md bg-om-primary text-white hover:bg-om-primary-deep disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-om-primary/40 focus-visible:ring-offset-1"
          >
            {submitting ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
