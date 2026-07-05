"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { forgetPassword } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await forgetPassword({
        email,
        redirectTo: "/sign-in?reset=1",
      });
      if (res.error) {
        setError(res.error.message ?? "Could not send reset email");
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-om-ink">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-om-ink-mute">
            We'll email you a link to set a new one.
          </p>
        </div>
        <div className="bg-om-surface rounded-2xl border border-om-line shadow-sm px-6 py-8 sm:px-8">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-om-ink-mute text-sm leading-relaxed">
                If <strong>{email}</strong> has an account, a reset email is on
                its way. The link expires in 30 minutes.
              </p>
              <Link href="/sign-in" className="text-om-primary underline text-sm">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-om-ink-mute mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-om-line px-3 py-2 text-sm shadow-sm focus:border-om-primary focus:ring-2 focus:ring-om-primary/20 focus:outline-none"
                  autoFocus
                  autoComplete="email"
                />
              </div>
              {error ? (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-om-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-om-primary-deep disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
              <p className="text-center text-sm text-om-ink-mute">
                Remembered it?{" "}
                <Link href="/sign-in" className="text-om-primary hover:text-om-primary font-medium">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
