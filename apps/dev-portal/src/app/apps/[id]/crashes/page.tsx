"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface CrashGroup {
  id: string;
  fingerprint: string;
  exceptionType: string;
  exceptionMessage: string | null;
  status: "open" | "ignored" | "resolved";
  occurrenceCount: number;
  affectedUserCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface CrashListResponse {
  appId: string;
  status: string;
  groups: CrashGroup[];
}

type StatusFilter = "open" | "ignored" | "resolved" | "all";

/**
 * Triage list for crash groups on a single app. Default filter is
 * `open` (newly reported, not yet triaged). Status pills switch
 * between filters; clicking a row drills into the group detail.
 */
export default function CrashesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [data, setData] = useState<CrashListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, status]);

  async function load(s: StatusFilter) {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<CrashListResponse>(
        `/api/apps/${appId}/crashes?status=${s}`,
      );
      setData(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href={`/apps/${appId}`}
          className="text-xs text-om-primary hover:underline"
        >
          ← Back to app
        </Link>
        <h1 className="text-2xl font-bold text-om-ink mt-2">Crashes</h1>
        <p className="text-sm text-om-ink-soft mt-1">
          Crash reports submitted by devices running this app. Reports
          are grouped by stack-trace fingerprint so related crashes
          aggregate.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {(["open", "resolved", "ignored", "all"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
              status === s
                ? "bg-om-primary border-om-primary text-white"
                : "bg-om-surface border-om-line text-om-ink-mute hover:border-om-line"
            }`}
          >
            {s[0]!.toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-om-ink-soft">Loading…</div>
      ) : !data || data.groups.length === 0 ? (
        <div className="rounded-xl bg-om-surface border border-dashed border-om-line p-8 text-center">
          <p className="text-sm text-om-ink-soft">No {status} crashes.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/apps/${appId}/crashes/${g.id}`}
                className="block bg-om-surface rounded-xl border border-om-line hover:border-om-line px-5 py-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-red-700 truncate">
                      {g.exceptionType}
                    </p>
                    {g.exceptionMessage ? (
                      <p className="text-sm text-om-ink-mute mt-1 truncate">
                        {g.exceptionMessage}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded shrink-0 ${
                      g.status === "open"
                        ? "bg-red-100 text-red-700"
                        : g.status === "resolved"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-om-line-soft text-om-ink-mute"
                    }`}
                  >
                    {g.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-om-ink-soft">
                  <span>
                    {g.occurrenceCount.toLocaleString()} event
                    {g.occurrenceCount === 1 ? "" : "s"}
                  </span>
                  <span>
                    {g.affectedUserCount.toLocaleString()} user
                    {g.affectedUserCount === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto">
                    last {new Date(g.lastSeenAt).toLocaleString()}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
