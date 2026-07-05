"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface Group {
  id: string;
  fingerprint: string;
  exceptionType: string;
  exceptionMessage: string | null;
  stackTrace: string;
  status: "open" | "ignored" | "resolved";
  resolvedAtReleaseId: string | null;
  occurrenceCount: number;
  affectedUserCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface Event {
  id: string;
  appVersionCode: number | null;
  appVersionName: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  occurredAt: string | null;
  createdAt: string;
}

interface Detail {
  group: Group;
  recentEvents: Event[];
}

interface Release {
  id: string;
  versionName: string;
  versionCode: number;
}

/**
 * Crash group detail — stack trace, recent events list, triage
 * controls (ignore / resolve / reopen).
 *
 * Resolving requires picking a release as the "fixed-in" pointer.
 * The recordCrash regression detector uses this to auto-flip back to
 * `open` if events arrive on a higher versionCode later.
 */
export default function CrashDetailPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id: appId, groupId } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolveReleaseId, setResolveReleaseId] = useState<string>("");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, groupId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [d, rs] = await Promise.all([
        api.get<Detail>(`/api/apps/${appId}/crashes/${groupId}`),
        api.get<Release[]>(`/api/apps/${appId}/releases`).catch(() => []),
      ]);
      setDetail(d);
      setReleases(rs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(
    status: "open" | "ignored" | "resolved",
    extra?: { resolvedAtReleaseId: string },
  ) {
    setUpdating(true);
    setError(null);
    try {
      await api.patch(`/api/apps/${appId}/crashes/${groupId}`, {
        status,
        ...(extra ?? {}),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) return <div className="text-sm text-om-ink-soft">Loading…</div>;
  if (error && !detail)
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  if (!detail) return null;

  const { group, recentEvents } = detail;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href={`/apps/${appId}/crashes`}
          className="text-xs text-om-primary hover:underline"
        >
          ← Back to crashes
        </Link>
        <div className="flex items-baseline gap-3 mt-2 flex-wrap">
          <h1 className="text-xl font-bold text-om-ink font-mono">
            {group.exceptionType}
          </h1>
          <span
            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
              group.status === "open"
                ? "bg-red-100 text-red-700"
                : group.status === "resolved"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-om-line-soft text-om-ink-mute"
            }`}
          >
            {group.status}
          </span>
        </div>
        {group.exceptionMessage ? (
          <p className="text-sm text-om-ink-mute mt-2">{group.exceptionMessage}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-om-ink-soft">
          <span>
            {group.occurrenceCount.toLocaleString()} events ·{" "}
            {group.affectedUserCount.toLocaleString()} users
          </span>
          <span>First seen {new Date(group.firstSeenAt).toLocaleString()}</span>
          <span>Last seen {new Date(group.lastSeenAt).toLocaleString()}</span>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Triage actions */}
      <section className="bg-om-surface rounded-xl border border-om-line p-5 space-y-3">
        <h2 className="text-sm font-semibold text-om-ink-mute">Triage</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {group.status !== "open" && (
            <button
              type="button"
              onClick={() => void setStatus("open")}
              disabled={updating}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-om-line hover:border-om-line disabled:opacity-50"
            >
              Reopen
            </button>
          )}
          {group.status !== "ignored" && (
            <button
              type="button"
              onClick={() => void setStatus("ignored")}
              disabled={updating}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-om-line hover:border-om-line disabled:opacity-50"
            >
              Ignore
            </button>
          )}
          {group.status !== "resolved" && (
            <div className="flex items-center gap-2">
              <select
                value={resolveReleaseId}
                onChange={(e) => setResolveReleaseId(e.target.value)}
                className="text-xs rounded-md border border-om-line px-2 py-1.5"
                disabled={updating || releases.length === 0}
              >
                <option value="">Pick fixed-in release…</option>
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    v{r.versionName} ({r.versionCode})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  void setStatus("resolved", {
                    resolvedAtReleaseId: resolveReleaseId,
                  })
                }
                disabled={updating || !resolveReleaseId}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
              >
                Mark resolved
              </button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-om-ink-soft">
          Resolving binds the fix to a specific release — new events on a
          higher versionCode will auto-reopen the group.
        </p>
      </section>

      {/* Stack trace */}
      <section className="bg-om-surface rounded-xl border border-om-line p-5 space-y-2">
        <h2 className="text-sm font-semibold text-om-ink-mute">Stack trace</h2>
        <pre className="text-xs font-mono bg-om-surface-tint border border-om-line rounded-lg p-3 overflow-x-auto whitespace-pre">
          {group.stackTrace}
        </pre>
      </section>

      {/* Recent events */}
      <section className="bg-om-surface rounded-xl border border-om-line p-5 space-y-3">
        <h2 className="text-sm font-semibold text-om-ink-mute">
          Recent events ({recentEvents.length})
        </h2>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-om-ink-soft italic">No event detail rows.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentEvents.map((ev) => (
              <li key={ev.id} className="py-2.5 text-xs text-om-ink-mute grid grid-cols-1 sm:grid-cols-4 gap-2">
                <span className="text-om-ink-soft">
                  {new Date(ev.occurredAt ?? ev.createdAt).toLocaleString()}
                </span>
                <span>{ev.deviceModel ?? "—"}</span>
                <span>{ev.osVersion ?? "—"}</span>
                <span className="font-mono">
                  {ev.appVersionName
                    ? `v${ev.appVersionName} (${ev.appVersionCode ?? "?"})`
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
