"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

interface BetaInfo {
  appId: string;
  enabled: boolean;
  testerCount: number;
  latestBeta: {
    id: string;
    versionCode: number;
    versionName: string;
    publishedAt: string | null;
    releaseNotes: string | null;
  } | null;
  viewerStatus: "active" | "former" | "none" | null;
}

/**
 * Storefront "Join the beta" CTA on the app detail page.
 *
 * Renders nothing if the developer hasn't enabled the program or
 * there's no published beta release to actually try. When enabled,
 * shows the join state for the current viewer (or a sign-in CTA when
 * unauthenticated).
 *
 * The component is intentionally chatty about *why* a button isn't
 * shown — "no beta release yet" is a different message from "you
 * already joined", so users + devs both understand the state.
 */
export function BetaJoinButton({ appId }: { appId: string }) {
  const { data: session, isPending } = useSession();
  const [info, setInfo] = useState<BetaInfo | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, session?.user?.id]);

  async function refresh() {
    try {
      const data = await apiFetch<BetaInfo>(`/api/apps/${appId}/beta`);
      setInfo(data);
    } catch {
      // Soft-fail — if the beta info endpoint is unreachable we just
      // hide the surface rather than block the rest of the page.
      setInfo(null);
    }
  }

  async function join() {
    setActing(true);
    setError(null);
    try {
      await apiFetch(`/api/apps/${appId}/beta/join`, { method: "POST" });
      await refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to join";
      setError(message);
    } finally {
      setActing(false);
    }
  }

  async function leave() {
    setActing(true);
    setError(null);
    try {
      await apiFetch(`/api/apps/${appId}/beta/leave`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to leave";
      setError(message);
    } finally {
      setActing(false);
    }
  }

  if (!info || !info.enabled) return null;

  // Program is enabled but the developer hasn't published a beta yet —
  // show a passive "available soon" message rather than a Join button
  // that would fail with a 404 on the artifact later.
  if (!info.latestBeta) {
    return (
      <section className="rounded-xl border border-purple-200 bg-purple-50 p-4">
        <h2 className="text-sm font-semibold text-purple-900">Beta program</h2>
        <p className="text-xs text-purple-700 mt-1">
          The developer has opened a beta program for this app, but
          hasn't published a beta release yet. Check back soon.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-purple-200 bg-purple-50 p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-purple-900">
          Beta program
        </h2>
        <span className="text-[11px] text-purple-700">
          {info.testerCount} {info.testerCount === 1 ? "tester" : "testers"}
        </span>
      </div>

      <p className="text-xs text-purple-800">
        Try v{info.latestBeta.versionName} (build {info.latestBeta.versionCode})
        before it ships to everyone. Beta builds may have rough edges —
        please report bugs to the developer.
      </p>

      <div className="pt-1 flex items-center gap-2 flex-wrap">
        {isPending ? null : !session ? (
          <Link
            href={`/sign-in?next=/apps/${appId}`}
            className="inline-flex items-center rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-100"
          >
            Sign in to join the beta
          </Link>
        ) : info.viewerStatus === "active" ? (
          <button
            type="button"
            onClick={leave}
            disabled={acting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            {acting ? "Leaving…" : "You're a beta tester — leave"}
          </button>
        ) : (
          <button
            type="button"
            onClick={join}
            disabled={acting}
            className="inline-flex items-center rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-100 disabled:opacity-60"
          >
            {acting
              ? "Joining…"
              : info.viewerStatus === "former"
                ? "Rejoin the beta"
                : "Join the beta"}
          </button>
        )}
      </div>

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </section>
  );
}
