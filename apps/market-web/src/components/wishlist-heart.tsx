"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

export interface WishlistHeartProps {
  appId: string;
  /** Optional initial state to skip the lookup roundtrip. */
  initiallyWishlisted?: boolean;
  /** "icon" = heart only; "labeled" = heart + "Save" label (used on app detail). */
  variant?: "icon" | "labeled";
}

/**
 * Heart toggle for wishlist. Optimistic on click — flips state immediately
 * and rolls back if the API rejects. Soft-fails when API is unreachable so
 * the button never blocks rendering.
 *
 * Signed-out users see a heart that links to /sign-in?next=… so the click
 * still feels productive.
 */
export function WishlistHeart({
  appId,
  initiallyWishlisted,
  variant = "icon",
}: WishlistHeartProps) {
  const { data: session, isPending } = useSession();
  const [wishlisted, setWishlisted] = useState<boolean | null>(
    initiallyWishlisted ?? null,
  );
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (isPending || !session) return;
    if (wishlisted !== null) return;
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, session]);

  async function check() {
    try {
      const data = await apiFetch<{ appIds: string[] }>(
        "/api/users/me/wishlist?shape=ids",
      );
      setWishlisted(data.appIds.includes(appId));
    } catch {
      setWishlisted(false);
    }
  }

  async function toggle() {
    if (!session) return;
    const next = !wishlisted;
    setWishlisted(next); // optimistic
    setActing(true);
    try {
      await apiFetch(`/api/users/me/wishlist/${appId}`, {
        method: next ? "PUT" : "DELETE",
      });
    } catch (err) {
      // rollback
      setWishlisted(!next);
      if (!(err instanceof ApiError) || !err.isUnreachable) {
        // Only surface a real error if it wasn't a network blip.
        console.error("wishlist toggle failed", err);
      }
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
        aria-label="Sign in to save to wishlist"
        className={
          variant === "icon"
            ? "p-2 rounded-full text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
            : "inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        }
      >
        <Heart filled={false} />
        {variant === "labeled" ? <span>Save</span> : null}
      </Link>
    );
  }

  const filled = wishlisted === true;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={acting || wishlisted === null}
      aria-pressed={filled}
      aria-label={filled ? "Remove from wishlist" : "Save to wishlist"}
      className={
        variant === "icon"
          ? `p-2 rounded-full transition-colors ${
              filled
                ? "text-rose-500 hover:bg-rose-50"
                : "text-gray-400 hover:text-rose-500 hover:bg-rose-50"
            } disabled:opacity-50`
          : `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              filled
                ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`
      }
    >
      <Heart filled={filled} />
      {variant === "labeled" ? <span>{filled ? "Saved" : "Save"}</span> : null}
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
