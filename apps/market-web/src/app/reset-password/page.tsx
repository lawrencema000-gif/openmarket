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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            We'll email you a link to set a new one.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-8 sm:px-8">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-gray-700 text-sm leading-relaxed">
                If <strong>{email}</strong> has an account, a reset email is on
                its way. The link expires in 30 minutes.
              </p>
              <Link href="/sign-in" className="text-blue-600 underline text-sm">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
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
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
              <p className="text-center text-sm text-gray-600">
                Remembered it?{" "}
                <Link href="/sign-in" className="text-blue-600 hover:text-blue-700 font-medium">
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
