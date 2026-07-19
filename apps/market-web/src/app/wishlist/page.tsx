"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { ServiceUnavailable } from "@openmarket/ui";
import { WishlistHeart } from "@/components/wishlist-heart";

interface WishlistEntry {
  id: string;
  createdAt: string;
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

interface WishlistResponse {
  page: number;
  limit: number;
  total: number;
  entries: WishlistEntry[];
}

export default function WishlistPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const [entries, setEntries] = useState<WishlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (sessionPending) return;
    if (!session) {
      router.push("/sign-in?next=/wishlist");
      return;
    }
    void load();
  }, [sessionPending, session, router]);

  async function load() {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const data = await apiFetch<WishlistResponse>("/api/users/me/wishlist");
      setEntries(data.entries);
    } catch (err) {
      if (err instanceof ApiError && err.isUnreachable) {
        setUnavailable(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load wishlist");
      }
    } finally {
      setLoading(false);
    }
  }

  // Optimistic remove from grid when heart is unticked.
  function onLocalRemove(appId: string) {
    setEntries((es) => es.filter((e) => e.app.id !== appId));
  }

  // Also gate on !session: after the session resolves signed-out we're
  // about to redirect, but the client-side push can take seconds in a slow
  // tab — without this the full page UI flashed first, so a signed-out user
  // briefly "had" a library before being yanked to sign-in.
  if (sessionPending || !session) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-3">
        <div className="h-32 animate-pulse rounded-xl bg-om-line-soft" />
        {!sessionPending && (
          <p className="text-sm text-om-ink-soft text-center">
            Taking you to sign in…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-om-ink">
          Saved
        </h1>
        <p className="mt-1 text-sm text-om-ink-soft">
          Apps you've heart-saved for later.
        </p>
      </header>

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {unavailable ? (
        <ServiceUnavailable
          title="Couldn't load your wishlist"
          description="The OpenMarket API is temporarily unreachable. Try again in a minute."
        />
      ) : loading ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="h-28 rounded-xl bg-om-line-soft animate-pulse" />
          ))}
        </ul>
      ) : entries.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((entry) => (
            <WishlistCard
              key={entry.id}
              entry={entry}
              onRemoved={() => onLocalRemove(entry.app.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function WishlistCard({
  entry,
  onRemoved,
}: {
  entry: WishlistEntry;
  onRemoved: () => void;
}) {
  const listing = entry.app.listing;
  const title = listing?.title ?? entry.app.packageName;
  const [removing, setRemoving] = useState(false);

  async function remove() {
    setRemoving(true);
    try {
      await apiFetch(`/api/users/me/wishlist/${entry.app.id}`, {
        method: "DELETE",
      });
      onRemoved();
    } catch {
      setRemoving(false);
    }
  }

  return (
    <li className="relative rounded-xl border border-om-line bg-om-surface p-4 shadow-sm hover:shadow transition-shadow group">
      <button
        type="button"
        onClick={remove}
        disabled={removing}
        aria-label="Remove from wishlist"
        className="absolute top-2 right-2 p-1.5 rounded-full text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      <Link href={`/apps/${entry.app.id}`} className="flex items-start gap-3">
        {listing?.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.iconUrl}
            alt={`${title} icon`}
            className="h-14 w-14 rounded-xl object-cover bg-om-line-soft flex-shrink-0"
          />
        ) : (
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-rose-700 font-semibold text-lg flex-shrink-0">
            {title.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-om-ink group-hover:text-om-primary truncate">
            {title}
          </p>
          {listing?.category ? (
            <p className="text-xs text-om-ink-soft truncate">{listing.category}</p>
          ) : null}
          {listing?.shortDescription ? (
            <p className="mt-1 text-xs text-om-ink-mute line-clamp-2">
              {listing.shortDescription}
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-om-line bg-om-surface-tint px-6 py-12 text-center">
      <p className="text-base font-semibold text-om-ink">No saved apps yet</p>
      <p className="text-sm text-om-ink-mute max-w-md">
        Tap the heart on any app to save it here. Useful when you want to come
        back to something later.
      </p>
      <Link
        href="/search"
        className="mt-2 rounded-md bg-om-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-om-primary-deep"
      >
        Browse apps
      </Link>
    </div>
  );
}
