"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";

export function UserMenu() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close only when focus actually leaves the whole menu (keyboard Tab
  // through the items keeps it open); the old blur-timeout closed the
  // menu before a keyboard user could reach any item.
  function onContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  function onContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && open) {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  // Don't flicker between states while session resolves.
  if (isPending) {
    return <div className="w-9 h-9 rounded-full bg-om-line-soft animate-pulse" />;
  }

  if (!session) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/sign-in"
          className="px-3 py-2 rounded-lg text-sm font-medium text-om-ink-mute hover:bg-om-line-soft"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-om-primary hover:bg-om-primary-deep"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const user = session.user;
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative" onBlur={onContainerBlur} onKeyDown={onContainerKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full p-1 hover:bg-om-line-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-om-primary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name ?? user.email}`}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name ?? user.email}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <span className="w-8 h-8 rounded-full bg-om-primary text-white flex items-center justify-center text-sm font-semibold">
            {initial}
          </span>
        )}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-lg border border-om-line bg-om-surface shadow-lg overflow-hidden z-50"
        >
          <div className="px-4 py-3 border-b border-om-line-soft">
            <p className="text-sm font-medium text-om-ink truncate">
              {user.name ?? user.email.split("@")[0]}
            </p>
            <p className="text-xs text-om-ink-soft truncate">{user.email}</p>
          </div>
          <div className="py-1">
            <Link
              href="/library"
              role="menuitem"
              className="block px-4 py-2 text-sm text-om-ink-mute hover:bg-om-surface-tint"
            >
              My library
            </Link>
            <Link
              href="/wishlist"
              role="menuitem"
              className="block px-4 py-2 text-sm text-om-ink-mute hover:bg-om-surface-tint"
            >
              Saved
            </Link>
            <Link
              href="/account"
              role="menuitem"
              className="block px-4 py-2 text-sm text-om-ink-mute hover:bg-om-surface-tint"
            >
              Account settings
            </Link>
          </div>
          <div className="py-1 border-t border-om-line-soft">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="block w-full text-left px-4 py-2 text-sm text-om-ink-mute hover:bg-om-surface-tint"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
