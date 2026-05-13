"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

interface PreRegisterStatus {
  appId: string;
  enabled: boolean;
  registered: boolean;
  registeredCount: number;
}

interface PreRegisterButtonProps {
  appId: string;
}

/**
 * Storefront "Pre-register" CTA (P3-A).
 *
 * Renders nothing when the developer hasn't enabled pre-registration
 * on the app. When enabled, swaps in for the standard install button
 * — they're mutually exclusive in v1 (pre-registration is intended
 * for apps that aren't yet launchable).
 *
 * Anonymous viewers see the count + a "Sign in to pre-register"
 * link. Signed-in viewers see a join/leave toggle and channel
 * picker (push / email / both).
 */
export function PreRegisterButton({ appId }: PreRegisterButtonProps) {
  const { data: session, isPending } = useSession();
  const [info, setInfo] = useState<PreRegisterStatus | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<"push" | "email" | "both">("both");

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, session?.user?.id]);

  async function refresh() {
    try {
      const data = await apiFetch<PreRegisterStatus>(
        `/api/apps/${appId}/pre-register/status`,
      );
      setInfo(data);
    } catch {
      setInfo(null);
    }
  }

  async function register() {
    setActing(true);
    setError(null);
    try {
      await apiFetch(`/api/apps/${appId}/pre-register`, {
        method: "POST",
        body: JSON.stringify({ channel }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to pre-register");
    } finally {
      setActing(false);
    }
  }

  async function unregister() {
    setActing(true);
    setError(null);
    try {
      await apiFetch(`/api/apps/${appId}/pre-register`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to unregister");
    } finally {
      setActing(false);
    }
  }

  if (!info || !info.enabled) return null;

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-indigo-900">
          Coming soon — pre-register
        </h2>
        <span className="text-[11px] text-indigo-700">
          {info.registeredCount.toLocaleString()} pre-registered
        </span>
      </div>
      <p className="text-xs text-indigo-800">
        Get notified the moment this app launches. We'll send you a push
        and/or email when the first stable release ships.
      </p>

      {isPending ? null : !session ? (
        <Link
          href={`/sign-in?next=/apps/${appId}`}
          className="inline-flex items-center rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
        >
          Sign in to pre-register
        </Link>
      ) : info.registered ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            You're on the launch list
          </span>
          <button
            type="button"
            onClick={() => void unregister()}
            disabled={acting}
            className="text-xs text-indigo-700 hover:underline disabled:opacity-60"
          >
            {acting ? "…" : "Unregister"}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as typeof channel)}
            className="text-xs rounded-md border border-indigo-200 px-2 py-1.5 bg-white text-indigo-900"
          >
            <option value="both">Push + email</option>
            <option value="push">Push only</option>
            <option value="email">Email only</option>
          </select>
          <button
            type="button"
            onClick={() => void register()}
            disabled={acting}
            className="inline-flex items-center rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white"
          >
            {acting ? "Saving…" : "Pre-register"}
          </button>
        </div>
      )}

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </section>
  );
}
