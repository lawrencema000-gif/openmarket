"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

type Resolution = "dismiss" | "warn" | "delist";

/**
 * Sticky bottom-of-viewport action bar shown when 1+ reports are
 * checked. Three buttons (dismiss / warn / delist), each opening
 * an inline reason field. Delist requires confirmation + min-10-
 * char notes — same gates as the per-report drawer.
 *
 * Posts to /admin/reports/bulk-resolve and refreshes the queue on
 * success.
 */
export function BulkActionBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [notes, setNotes] = useState("");
  const [confirmDelist, setConfirmDelist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (selectedIds.length === 0) return null;

  async function submit() {
    if (!resolution) {
      setError("Pick dismiss / warn / delist first.");
      return;
    }
    if (resolution === "delist" && !confirmDelist) {
      setError("Tick the confirm-delist checkbox.");
      return;
    }
    if (resolution !== "dismiss" && notes.trim().length < 10) {
      setError("Notes are required (min 10 chars) for delist / warn.");
      return;
    }
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/reports/bulk-resolve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportIds: selectedIds,
          resolution,
          notes: notes.trim() || undefined,
          ...(resolution === "delist" ? { confirmDelist } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `HTTP ${res.status}`);
        return;
      }
      onClear();
      setNotes("");
      setResolution(null);
      setConfirmDelist(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 shadow-xl">
      <div className="max-w-5xl mx-auto p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold text-gray-900">
            {selectedIds.length} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setResolution("dismiss")}
              className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                resolution === "dismiss"
                  ? "bg-gray-100 text-gray-900 border-gray-300 ring-2 ring-offset-1 ring-blue-300"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => setResolution("warn")}
              className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                resolution === "warn"
                  ? "bg-amber-50 text-amber-700 border-amber-200 ring-2 ring-offset-1 ring-amber-300"
                  : "bg-white text-amber-700 border-amber-200 hover:bg-amber-50"
              }`}
            >
              Warn
            </button>
            <button
              type="button"
              onClick={() => setResolution("delist")}
              className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                resolution === "delist"
                  ? "bg-red-50 text-red-700 border-red-200 ring-2 ring-offset-1 ring-red-300"
                  : "bg-white text-red-700 border-red-200 hover:bg-red-50"
              }`}
            >
              Delist
            </button>
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-gray-500 hover:text-gray-700 px-2"
            >
              Clear
            </button>
          </div>
        </div>

        {resolution && (
          <>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                resolution === "dismiss"
                  ? "Optional notes — sent to every reporter as 'we reviewed and dismissed'"
                  : resolution === "warn"
                    ? "Required: explain the warning. Sent to the developer."
                    : "Required (≥10 chars): public takedown reason. Appears in the transparency log for every delisted target."
              }
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {resolution === "delist" && (
              <label className="flex items-center gap-2 text-sm text-red-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmDelist}
                  onChange={(e) => setConfirmDelist(e.target.checked)}
                  className="h-4 w-4 rounded border-red-300 text-red-600"
                />
                I have reviewed every selected report and confirm bulk delist.
              </label>
            )}
          </>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {resolution && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="text-xs font-semibold px-4 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending
                ? "Resolving…"
                : `Confirm ${resolution} on ${selectedIds.length} report${selectedIds.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
