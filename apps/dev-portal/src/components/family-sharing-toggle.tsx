"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Props {
  appId: string;
  initialEnabled: boolean;
}

/**
 * Per-app family sharing toggle (P3-E).
 *
 * When enabled, members of the installing user's family group get a
 * shared library entry on install. Admin+ on the publisher account
 * is required server-side; the toggle surfaces any 403 inline.
 */
export function FamilySharingToggle({ appId, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const r = await api.patch<{ success: boolean; enabled: boolean }>(
        `/api/apps/${appId}/family-sharing`,
        { enabled: next },
      );
      setEnabled(r.enabled);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-om-surface rounded-xl border border-om-line p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-om-ink-mute">
            Family sharing
          </h2>
          <p className="text-xs text-om-ink-soft mt-1 max-w-md">
            When enabled, members of a user's family group will see this app
            in their library after the family owner installs it. Helpful for
            multi-user apps; disable for single-account / per-device apps.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(e) => void flip(e.target.checked)}
            className="h-4 w-4 rounded border-om-line text-om-primary focus:ring-om-primary"
          />
          <span className="text-sm font-medium text-om-ink-mute">
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </label>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
