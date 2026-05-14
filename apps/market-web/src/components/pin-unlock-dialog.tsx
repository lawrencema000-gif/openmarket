"use client";

import { useState } from "react";
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
      className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Parent PIN required
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            <strong>{appTitle}</strong> is above your allowed rating. Ask
            your parent to enter their PIN to continue.
          </p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="••••"
          autoFocus
          className="w-full text-center text-2xl tracking-widest font-mono rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
        />
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-sm font-medium px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || pin.length < 4}
            className="text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
