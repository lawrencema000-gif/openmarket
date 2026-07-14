"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useSession } from "@/lib/auth-client";

/**
 * Landing page for the emailed verification link. Better Auth verifies the
 * token on the API, auto-signs the user in (autoSignInAfterVerification),
 * and redirects here; on a bad/expired token it appends ?error=….
 */
function VerifyEmailInner() {
  const params = useSearchParams();
  const error = params.get("error");
  const { data: session, isPending } = useSession();

  if (error) {
    return (
      <>
        <h1 className="text-2xl font-bold text-om-ink">
          This verification link didn't work
        </h1>
        <p className="text-om-ink-mute text-sm leading-relaxed">
          The link is invalid or has expired (links last 60 minutes). Sign in
          with your email and password and we'll offer to send a fresh one.
        </p>
        <Link
          href="/sign-in"
          className="inline-block rounded-md bg-om-primary px-4 py-2 text-sm font-semibold text-white hover:bg-om-primary-deep"
        >
          Go to sign in
        </Link>
      </>
    );
  }

  if (isPending) {
    return <p className="text-sm text-om-ink-soft">Checking your account…</p>;
  }

  if (session) {
    return (
      <>
        <h1 className="text-2xl font-bold text-om-ink">Email verified 🎉</h1>
        <p className="text-om-ink-mute text-sm leading-relaxed">
          You're signed in and ready to go. Save apps to your wishlist, keep a
          library of what you install, and write reviews.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-om-primary px-4 py-2 text-sm font-semibold text-white hover:bg-om-primary-deep"
          >
            Browse apps
          </Link>
          <Link
            href="/account"
            className="rounded-md border border-om-line bg-om-surface px-4 py-2 text-sm font-medium text-om-ink-mute hover:bg-om-surface-tint"
          >
            Your account
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-om-ink">Almost there</h1>
      <p className="text-om-ink-mute text-sm leading-relaxed">
        If you just clicked a verification link, your email should be
        confirmed — sign in to continue.
      </p>
      <Link
        href="/sign-in"
        className="inline-block rounded-md bg-om-primary px-4 py-2 text-sm font-semibold text-white hover:bg-om-primary-deep"
      >
        Sign in
      </Link>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center space-y-5">
      <Suspense
        fallback={<p className="text-sm text-om-ink-soft">Loading…</p>}
      >
        <VerifyEmailInner />
      </Suspense>
    </div>
  );
}
