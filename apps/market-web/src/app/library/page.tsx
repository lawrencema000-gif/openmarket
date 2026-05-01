"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { Badge, ServiceUnavailable } from "@openmarket/ui";

type Status = "installed" | "updates" | "uninstalled";

interface LibraryEntry {
  id: string;
  installedAt: string;
  uninstalledAt: string | null;
  lastOpenedAt: string | null;
  installedVersionCode: number | null;
  latestVersionCode: number | null;
  hasUpdate: boolean;
  isOwned: boolean;
  source: string;
  app: {
    id: string;
    packageName: string;
    trustTier: string;
    listing: {
      title: string;
      shortDescription: string;
      iconUrl: string | null;
      category: string;
      contentRating: string | null;
    } | null;
  };
}

interface LibraryResponse {
  page: number;
  limit: number;
  total: number;
  entries: LibraryEntry[];
}

const TABS: Array<{ key: Status; label: string }> = [
  { key: "installed", label: "Installed" },
  { key: "updates", label: "Updates available" },
  { key: "uninstalled", label: "Uninstalled" },
];

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export default function LibraryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initialTab = (params.get("status") as Status) || "installed";
  const { data: session, isPending: sessionPending } = useSession();
  const [tab, setTab] = useState<Status>(initialTab);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  useEffect(() => {
    if (sessionPending) return;
    if (!session) {
      router.push("/sign-in?next=/library");
      return;
    }
    void load(tab);
  }, [sessionPending, session, tab, router]);

  async function load(s: Status) {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const data = await apiFetch<LibraryResponse>(
        `/api/users/me/library?status=${s}`,
      );
      setEntries(data.entries);
    } catch (err) {
      if (err instanceof ApiError && err.isUnreachable) {
        setUnavailable(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load library");
      }
    } finally {
      setLoading(false);
    }
  }

  async function uninstall(entry: LibraryEntry) {
    setActingOn(entry.id);
    try {
      await apiFetch(`/api/users/me/library/${entry.app.id}`, {
        method: "DELETE",
      });
      // Optimistic: remove from "installed" / "updates", or move to "uninstalled".
      setEntries((es) => es.filter((e) => e.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not uninstall");
    } finally {
      setActingOn(null);
    }
  }

  async function reinstall(entry: LibraryEntry) {
    setActingOn(entry.id);
    try {
      await apiFetch(`/api/users/me/library/${entry.app.id}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setEntries((es) => es.filter((e) => e.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reinstall");
    } finally {
      setActingOn(null);
    }
  }

  function switchTab(next: Status) {
    setTab(next);
    const sp = new URLSearchParams(params.toString());
    sp.set("status", next);
    router.replace(`/library?${sp.toString()}`);
  }

  if (sessionPending) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Your library
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Apps you've installed via OpenMarket.
        </p>
      </header>

      <div className="border-b border-gray-200">
        <nav className="flex gap-1" aria-label="Library tabs">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => switchTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {unavailable ? (
        <ServiceUnavailable
          title="Couldn't load your library"
          description="The OpenMarket API is temporarily unreachable. Try again in a minute."
        />
      ) : loading ? (
        <ul className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </ul>
      ) : entries.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <LibraryRow
              key={entry.id}
              entry={entry}
              tab={tab}
              acting={actingOn === entry.id}
              onUninstall={() => uninstall(entry)}
              onReinstall={() => reinstall(entry)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LibraryRow({
  entry,
  tab,
  acting,
  onUninstall,
  onReinstall,
}: {
  entry: LibraryEntry;
  tab: Status;
  acting: boolean;
  onUninstall: () => void;
  onReinstall: () => void;
}) {
  const listing = entry.app.listing;
  const title = listing?.title ?? entry.app.packageName;

  return (
    <li className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow transition-shadow">
      <Link
        href={`/apps/${entry.app.id}`}
        className="flex-shrink-0"
        aria-label={`Open ${title}`}
      >
        {listing?.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.iconUrl}
            alt={`${title} icon`}
            className="h-14 w-14 rounded-xl object-cover bg-gray-100"
          />
        ) : (
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-blue-700 font-semibold text-lg">
            {title.charAt(0).toUpperCase()}
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/apps/${entry.app.id}`}
          className="block text-sm font-semibold text-gray-900 hover:text-blue-700 truncate"
        >
          {title}
        </Link>
        <p className="text-xs text-gray-500 truncate">
          {entry.app.packageName}
          {listing?.category ? <> · {listing.category}</> : null}
        </p>
        <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-gray-500">
          {entry.hasUpdate ? (
            <Badge>
              Update v
              {entry.installedVersionCode}→v{entry.latestVersionCode}
            </Badge>
          ) : entry.installedVersionCode ? (
            <span>v{entry.installedVersionCode}</span>
          ) : null}
          {entry.lastOpenedAt ? (
            <span>· last opened {fmtRelative(entry.lastOpenedAt)}</span>
          ) : null}
          <span>· installed {fmtRelative(entry.installedAt)}</span>
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center gap-2">
        {tab === "uninstalled" ? (
          <button
            type="button"
            onClick={onReinstall}
            disabled={acting}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {acting ? "…" : "Reinstall"}
          </button>
        ) : tab === "updates" ? (
          <Link
            href={`/apps/${entry.app.id}`}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Update
          </Link>
        ) : (
          <>
            <Link
              href={`/apps/${entry.app.id}`}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Open
            </Link>
            <button
              type="button"
              onClick={onUninstall}
              disabled={acting}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              {acting ? "…" : "Uninstall"}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function EmptyState({ tab }: { tab: Status }) {
  const messages: Record<Status, { title: string; body: string; cta: string }> =
    {
      installed: {
        title: "Nothing installed yet",
        body: "Apps you install via OpenMarket appear here. Browse the catalog to find your first one.",
        cta: "Browse apps",
      },
      updates: {
        title: "Everything's up to date",
        body: "When developers ship a new release for an app you have installed, it'll show up here.",
        cta: "Browse apps",
      },
      uninstalled: {
        title: "No uninstalled apps",
        body: "If you remove an app you can find it here to reinstall it later.",
        cta: "Browse apps",
      },
    };
  const m = messages[tab];
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-6 py-12 text-center">
      <p className="text-base font-semibold text-gray-900">{m.title}</p>
      <p className="text-sm text-gray-600 max-w-md">{m.body}</p>
      <Link
        href="/search"
        className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
      >
        {m.cta}
      </Link>
    </div>
  );
}
