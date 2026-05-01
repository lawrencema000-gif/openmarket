"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";

export function UserMenu() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Don't flicker between states while session resolves.
  if (isPending) {
    return <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />;
  }

  if (!session) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/sign-in"
          className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700"
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
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex items-center gap-2 rounded-full p-1 hover:bg-gray-100 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name ?? user.email}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
            {initial}
          </span>
        )}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden z-50"
        >
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.name ?? user.email.split("@")[0]}
            </p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
          <div className="py-1">
            <Link
              href="/library"
              role="menuitem"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onMouseDown={(e) => e.preventDefault()}
            >
              My library
            </Link>
            <Link
              href="/account"
              role="menuitem"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onMouseDown={(e) => e.preventDefault()}
            >
              Account settings
            </Link>
          </div>
          <div className="py-1 border-t border-gray-100">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              onMouseDown={(e) => e.preventDefault()}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
