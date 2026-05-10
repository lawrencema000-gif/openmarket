"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";

interface RolloutControlsProps {
  releaseId: string;
  initialPercentage: number;
  initialStatus: "live" | "paused" | "halted" | "completed";
  /** Only render when the release is in a state that supports rollout (`published` or `staged_rollout`). */
  enabled: boolean;
  /** Called after a successful PATCH so the parent can refresh. */
  onUpdated?: (next: { percentage: number; status: string }) => void;
}

/**
 * Three-button + slider rollout control. Pinned semantics:
 *   - The slider (1-100) commits on release; intermediate drags don't
 *     fire requests. The displayed value updates live; the actual
 *     rollout doesn't change until the user lets go.
 *   - "Halt" requires a reason — opens a small inline textarea. Keeps
 *     the audit trail honest.
 *   - "Resume" sends `{ status: "live" }` and keeps the prior
 *     percentage.
 *
 * Disabled when `enabled` is false (release is in draft/scanning/
 * review). The dashboard up the tree should hide this entirely in
 * those states; we still gate here as defense in depth.
 */
export function RolloutControls({
  releaseId,
  initialPercentage,
  initialStatus,
  enabled,
  onUpdated,
}: RolloutControlsProps) {
  const [pct, setPct] = useState(initialPercentage);
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [haltOpen, setHaltOpen] = useState(false);
  const [haltReason, setHaltReason] = useState("");

  if (!enabled) return null;

  async function patch(body: {
    percentage?: number;
    status?: "live" | "paused" | "halted" | "completed";
    reason?: string;
  }) {
    setPending(true);
    setError(null);
    try {
      const result = await api.patch<{
        rolloutPercentage: number;
        rolloutStatus: "live" | "paused" | "halted" | "completed";
      }>(`/api/releases/${releaseId}/rollout`, body);
      setPct(result.rolloutPercentage);
      setStatus(result.rolloutStatus);
      onUpdated?.({
        percentage: result.rolloutPercentage,
        status: result.rolloutStatus,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  async function commitHalt() {
    if (haltReason.trim().length < 5) {
      setError("Halt reason is required (min 5 chars).");
      return;
    }
    await patch({ status: "halted", reason: haltReason.trim() });
    setHaltOpen(false);
    setHaltReason("");
  }

  return (
    <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <StatusChip status={status} />
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <input
            type="range"
            min={1}
            max={100}
            value={pct}
            disabled={pending || status === "halted" || status === "completed"}
            onChange={(e) => setPct(parseInt(e.target.value, 10))}
            onMouseUp={(e) => {
              const next = parseInt((e.target as HTMLInputElement).value, 10);
              if (next !== initialPercentage) patch({ percentage: next });
            }}
            onTouchEnd={(e) => {
              const next = parseInt((e.target as HTMLInputElement).value, 10);
              if (next !== initialPercentage) patch({ percentage: next });
            }}
            className="flex-1 disabled:opacity-50"
          />
          <span className="text-sm font-mono text-gray-700 w-10 text-right">
            {pct}%
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {status !== "halted" ? (
          <button
            type="button"
            onClick={() => setHaltOpen((v) => !v)}
            disabled={pending}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          >
            Halt
          </button>
        ) : (
          <button
            type="button"
            onClick={() => patch({ status: "live" })}
            disabled={pending}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            Resume rollout
          </button>
        )}
        {status === "live" && (
          <button
            type="button"
            onClick={() => patch({ status: "paused" })}
            disabled={pending}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Pause
          </button>
        )}
        {status === "paused" && (
          <button
            type="button"
            onClick={() => patch({ status: "live" })}
            disabled={pending}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Resume
          </button>
        )}
      </div>

      {haltOpen && (
        <div className="bg-rose-50/50 border border-rose-200 rounded-md p-3 space-y-2">
          <textarea
            value={haltReason}
            onChange={(e) => setHaltReason(e.target.value)}
            placeholder="Why are you halting? Visible in the rollout timeline."
            rows={2}
            className="w-full text-sm border border-rose-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setHaltOpen(false);
                setHaltReason("");
                setError(null);
              }}
              disabled={pending}
              className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitHalt}
              disabled={pending}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? "Halting…" : "Confirm halt"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function StatusChip({
  status,
}: {
  status: "live" | "paused" | "halted" | "completed";
}) {
  const tone =
    status === "live"
      ? "bg-emerald-100 text-emerald-700"
      : status === "paused"
        ? "bg-amber-100 text-amber-700"
        : status === "halted"
          ? "bg-rose-100 text-rose-700"
          : "bg-gray-100 text-gray-700";
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${tone}`}
    >
      {status}
    </span>
  );
}
