"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

interface Notice {
  id: string;
  noticeNumber: string;
  appId: string | null;
  status:
    | "received"
    | "valid"
    | "invalid"
    | "processed"
    | "counter_noticed"
    | "restored"
    | "withdrawn";
}

/**
 * State-machine action bar for a single DMCA notice. Renders only
 * the buttons valid for the current status so a moderator never
 * triggers an impossible transition.
 *
 *   received       → [Mark valid + map to app] [Mark invalid]
 *   valid          → [Take down]               [Mark invalid]
 *   processed      → (no actions — wait for counter-notice or
 *                    moderator restore)
 *   counter_noticed → (nothing here — counter-notice has its own
 *                    /counter-notices admin view, future block)
 *   restored / invalid / withdrawn → terminal
 */
export function DmcaActions({ notice }: { notice: Notice }) {
  const [open, setOpen] = useState<null | "valid" | "invalid" | "takedown">(null);
  const [appId, setAppId] = useState(notice.appId ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function review(decision: "valid" | "invalid") {
    setError(null);
    if (decision === "valid" && appId.trim().length < 8) {
      setError("Map the notice to an app id first.");
      return;
    }
    if (notes.trim().length < 5) {
      setError("Review notes are required (min 5 chars).");
      return;
    }
    try {
      const res = await fetch(
        `${API_URL}/api/admin/dmca/notices/${notice.id}/review`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            notes: notes.trim(),
            appId: decision === "valid" ? appId.trim() : undefined,
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        setError(text || `HTTP ${res.status}`);
        return;
      }
      setOpen(null);
      setNotes("");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  async function takedown() {
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/dmca/notices/${notice.id}/takedown`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const text = await res.text();
        setError(text || `HTTP ${res.status}`);
        return;
      }
      setOpen(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  if (
    notice.status === "invalid" ||
    notice.status === "restored" ||
    notice.status === "withdrawn"
  ) {
    return null;
  }

  return (
    <div className="border-t border-om-line-soft pt-3 space-y-3">
      {notice.status === "received" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen("valid")}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          >
            Mark valid + map to app
          </button>
          <button
            type="button"
            onClick={() => setOpen("invalid")}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-om-line bg-om-surface text-om-ink-mute hover:bg-om-surface-tint"
          >
            Mark invalid
          </button>
        </div>
      )}

      {notice.status === "valid" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen("takedown")}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          >
            Execute takedown
          </button>
          <button
            type="button"
            onClick={() => setOpen("invalid")}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-om-line bg-om-surface text-om-ink-mute hover:bg-om-surface-tint"
          >
            Revoke validity
          </button>
        </div>
      )}

      {(open === "valid" || open === "invalid") && (
        <div className="rounded-md bg-om-surface-tint border border-om-line p-3 space-y-2">
          {open === "valid" && (
            <input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="App UUID this notice targets"
              className="w-full text-xs font-mono border border-om-line rounded-md px-2 py-1.5"
            />
          )}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={
              open === "valid"
                ? "Validation notes (kept on the record)"
                : "Reason for invalidating — sent to the claimant"
            }
            className="w-full text-sm border border-om-line rounded-md px-2 py-1.5"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(null);
                setError(null);
              }}
              className="text-xs px-2 py-1 text-om-ink-mute hover:text-om-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => review(open)}
              disabled={pending}
              className="text-xs font-semibold px-3 py-1 rounded-md bg-om-primary text-white hover:bg-om-primary-deep disabled:opacity-50"
            >
              Confirm {open}
            </button>
          </div>
        </div>
      )}

      {open === "takedown" && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 space-y-2 text-sm">
          <p className="text-red-800">
            This delists the app + writes a public transparency event citing
            17 USC 512(c). The developer receives an email with their
            counter-notice rights. Continue?
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(null);
                setError(null);
              }}
              className="text-xs px-2 py-1 text-om-ink-mute hover:text-om-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={takedown}
              disabled={pending}
              className="text-xs font-semibold px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirm takedown
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
