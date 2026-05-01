"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

export function LibraryButton({ appId }: { appId: string }) {
  const { data: session, isPending } = useSession();
  const [inLibrary, setInLibrary] = useState<boolean | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !session) return;
    void check();
  }, [isPending, session, appId]);

  async function check() {
    try {
      const data = await apiFetch<{ entries: Array<{ app: { id: string }; uninstalledAt: string | null }> }>(
        "/api/users/me/library?status=all&limit=100",
      );
      const entry = data.entries.find((e) => e.app.id === appId);
      setInLibrary(Boolean(entry && !entry.uninstalledAt));
    } catch {
      // Soft fail — don't block the page on library lookup.
      setInLibrary(false);
    }
  }

  async function add() {
    if (!session) return;
    setActing(true);
    setError(null);
    try {
      await apiFetch(`/api/users/me/library/${appId}`, {
        method: "POST",
        body: JSON.stringify({ source: "web" }),
      });
      setInLibrary(true);
    } catch (err) {
      if (err instanceof ApiError && err.isUnreachable) {
        setError("Couldn't reach the API. Try again.");
      } else {
        setError(err instanceof Error ? err.message : "Could not add to library");
      }
    } finally {
      setActing(false);
    }
  }

  async function remove() {
    setActing(true);
    setError(null);
    try {
      await apiFetch(`/api/users/me/library/${appId}`, { method: "DELETE" });
      setInLibrary(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setActing(false);
    }
  }

  if (isPending) {
    return null;
  }

  if (!session) {
    return (
      <Link
        href={`/sign-in?next=/apps/${appId}`}
        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
      >
        Sign in to track
      </Link>
    );
  }

  if (inLibrary === null) {
    return (
      <span className="inline-block w-32 h-9 rounded-lg bg-blue-100 animate-pulse" />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {inLibrary ? (
        <button
          type="button"
          onClick={remove}
          disabled={acting}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          aria-label="Remove from library"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          {acting ? "Removing…" : "In your library"}
        </button>
      ) : (
        <button
          type="button"
          onClick={add}
          disabled={acting}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
          aria-label="Add to library"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {acting ? "Adding…" : "Add to library"}
        </button>
      )}
      {error ? (
        <p className="text-xs text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
