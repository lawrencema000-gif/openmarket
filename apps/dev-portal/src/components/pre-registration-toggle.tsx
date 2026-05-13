"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Props {
  appId: string;
  initialEnabled: boolean;
}

interface CountResponse {
  appId: string;
  count: number;
  enabled: boolean;
}

/**
 * Per-app pre-registration toggle (P3-A) — admin+ only.
 *
 * Surfaces the active waitlist count once the dev flips it on so the
 * publisher has a sense of momentum before they ship. Cosmetic
 * companion to the `BetaToggle` below on the app detail page.
 */
export function PreRegistrationToggle({ appId, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [count, setCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function load() {
    try {
      const r = await api.get<CountResponse>(
        `/api/apps/${appId}/pre-register/count`,
      );
      setEnabled(r.enabled);
      setCount(r.count);
    } catch {
      // Soft-fail — the toggle still works; count just stays blank.
    }
  }

  async function flip(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const r = await api.patch<{ success: boolean; enabled: boolean }>(
        `/api/apps/${appId}/pre-register`,
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
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">
            Pre-registration
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-md">
            Let users pre-register before your app launches. When you
            publish the first stable release, every active pre-registrant
            gets a push + email automatically.
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

      {enabled && count != null ? (
        <p className="text-xs text-gray-500">
          <strong className="font-mono text-gray-800">
            {count.toLocaleString()}
          </strong>{" "}
          {count === 1 ? "user is" : "users are"} pre-registered. They'll be
          notified automatically when you publish your first stable release.
        </p>
      ) : null}

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
