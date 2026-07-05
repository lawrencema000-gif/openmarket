"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Stat,
} from "@openmarket/ui";

interface LiveData {
  appId: string;
  now: string;
  installsLast5m: number;
  installsLast1h: number;
  activeDevicesLast5m: number;
  perMinute: Array<{ minute: string; count: number }>;
}

const POLL_MS = 5000;

export default function LiveAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const d = await api.get<LiveData>(`/api/apps/${appId}/live`);
        if (!cancelled) {
          setData(d);
          setStale(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          // Keep showing the last good data; just flag it stale. Only
          // surface a hard error on the first load.
          setStale(true);
          if (!data && err instanceof ApiError) {
            setError(
              err.status === 403
                ? "You don't have access to this app's analytics."
                : err.message,
            );
          }
        }
      }
    }

    void tick();
    timer.current = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  const maxCount = Math.max(1, ...(data?.perMinute.map((p) => p.count) ?? [0]));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/apps/${appId}`}
            className="text-sm text-om-ink-soft hover:text-om-ink-mute"
          >
            ← App
          </Link>
          <h1 className="text-2xl font-bold text-om-ink">Live analytics</h1>
        </div>
        <span className="inline-flex items-center gap-2 text-xs font-medium text-om-ink-soft">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inset-0 rounded-full ${stale ? "bg-amber-400" : "bg-emerald-500"} opacity-60 animate-ping`}
            />
            <span
              className={`relative h-2.5 w-2.5 rounded-full ${stale ? "bg-amber-400" : "bg-emerald-500"}`}
            />
          </span>
          {stale ? "Reconnecting…" : "Live · updates every 5s"}
        </span>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!data && !error ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-om-line-soft animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="Installs · last 5 min" value={data.installsLast5m} color="green" />
            <Stat label="Installs · last hour" value={data.installsLast1h} color="blue" />
            <Stat
              label="Active devices · 5 min"
              value={data.activeDevicesLast5m}
              color="violet"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Installs per minute — last hour</CardTitle>
            </CardHeader>
            <CardContent>
              {data.perMinute.length === 0 ? (
                <p className="text-sm text-om-ink-soft">
                  No installs in the last hour yet.
                </p>
              ) : (
                <div className="flex items-end gap-0.5 h-32">
                  {data.perMinute.map((p) => (
                    <div
                      key={p.minute}
                      className="flex-1 bg-violet-500/80 hover:bg-violet-600 rounded-t transition-colors"
                      style={{
                        height: `${Math.max(4, (p.count / maxCount) * 100)}%`,
                      }}
                      title={`${new Date(p.minute).toLocaleTimeString()}: ${p.count}`}
                    />
                  ))}
                </div>
              )}
              <p className="text-[11px] text-om-ink-soft mt-2">
                Privacy-respecting — active devices is a salted, non-PII count.
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
