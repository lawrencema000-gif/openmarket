"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

type Resolution = "accept" | "reject";

export function AppealResolveDrawer({
  appealId,
  disabled,
}: {
  appealId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (disabled) {
    return <span className="text-xs text-gray-400 italic">resolved</span>;
  }

  async function submit() {
    if (!resolution) {
      setError("Pick accept or reject.");
      return;
    }
    if (notes.trim().length < 10) {
      setError("Notes are required (min 10 chars). They appear in the public transparency log.");
      return;
    }
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/appeals/${appealId}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, notes: notes.trim() }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Failed (HTTP ${res.status})`);
        return;
      }
      setOpen(false);
      setResolution(null);
      setNotes("");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-md border border-blue-200 hover:bg-blue-50 transition-colors shrink-0"
      >
        Review
      </button>
    );
  }

  return (
    <div className="w-full mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setResolution("accept")}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 ${
            resolution === "accept" ? "ring-2 ring-offset-1 ring-emerald-300" : ""
          }`}
        >
          Accept appeal
        </button>
        <button
          type="button"
          onClick={() => setResolution("reject")}
          className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 ${
            resolution === "reject" ? "ring-2 ring-offset-1 ring-rose-300" : ""
          }`}
        >
          Reject appeal
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Required: explain the decision. Public transparency log records this verbatim — including denials."
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        rows={4}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900"
          disabled={pending}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs font-semibold px-4 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Confirm decision"}
        </button>
      </div>
    </div>
  );
}
