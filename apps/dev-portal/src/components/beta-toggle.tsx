"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";

interface BetaToggleProps {
  appId: string;
  initialEnabled: boolean;
  /** Cached count from the most recent GET — informational only. */
  testerCount?: number;
}

/**
 * Per-app developer toggle for the beta program.
 *
 * PATCH /apps/:id/beta requires admin+ on the publisher account
 * (enforced server-side via findEffectiveDeveloperContext). The
 * component renders nothing about that gate — if the role check fails
 * we surface the API error inline, which is good enough for the
 * relatively rare "viewer tried to flip beta" case.
 *
 * Disabling does NOT auto-revert existing testers; that's deliberate
 * (toggle off + on shouldn't lose the tester roster).
 */
export function BetaToggle({
  appId,
  initialEnabled,
  testerCount,
}: BetaToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const result = await api.patch<{ success: boolean; enabled: boolean }>(
        `/api/apps/${appId}/beta`,
        { enabled: next },
      );
      setEnabled(result.enabled);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Beta program</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-md">
            Let users opt into a separate beta channel. When enabled, the
            storefront shows a "Join the beta" button and beta testers
            receive your beta releases (channel=beta) instead of stable.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(e) => void flip(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </label>
      </div>

      {testerCount != null && testerCount > 0 ? (
        <p className="text-xs text-gray-500">
          {testerCount} active beta {testerCount === 1 ? "tester" : "testers"}.
          {!enabled && (
            <>
              {" "}
              Disabling pauses the join CTA but keeps existing testers on
              the beta channel.
            </>
          )}
        </p>
      ) : null}

      {error ? (
        <p className="text-xs text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
