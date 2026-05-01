"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";

export type AuthMode = "sign-in" | "sign-up";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  const isSignUp = mode === "sign-up";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSignUp) {
        const res = await signUp.email({
          email,
          password,
          name: name || email.split("@")[0]!,
        });
        if (res.error) {
          setError(humanizeError(res.error));
          return;
        }
        setNeedsVerification(true);
        return;
      }
      const res = await signIn.email({ email, password });
      if (res.error) {
        setError(humanizeError(res.error));
        return;
      }
      router.push("/account");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function withGoogle() {
    setError(null);
    try {
      await signIn.social({ provider: "google", callbackURL: "/account" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    }
  }

  if (needsVerification) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Check your email</h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          We sent a verification link to <strong>{email}</strong>. Click it to
          finish setting up your OpenMarket account. The link expires in 60
          minutes.
        </p>
        <p className="text-xs text-gray-500">
          Didn't get it? Check spam, or{" "}
          <Link href="/sign-in" className="text-blue-600 underline">
            sign in
          </Link>{" "}
          to resend.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {isSignUp ? (
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Display name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional — shown on your reviews"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
            autoComplete="name"
          />
        </div>
      ) : null}

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
          autoComplete="email"
          autoFocus={!isSignUp}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          {!isSignUp ? (
            <Link href="/reset-password" className="text-xs text-blue-600 hover:text-blue-700">
              Forgot?
            </Link>
          ) : null}
        </div>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
          autoComplete={isSignUp ? "new-password" : "current-password"}
        />
        {isSignUp ? (
          <p className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting
          ? isSignUp
            ? "Creating account…"
            : "Signing in…"
          : isSignUp
          ? "Create account"
          : "Sign in"}
      </button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-gray-500">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={withGoogle}
        className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.5 12.27c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 0 1-2.2 3.32v2.76h3.55c2.08-1.92 3.27-4.74 3.27-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.55-2.76c-.99.66-2.25 1.05-3.73 1.05-2.87 0-5.3-1.94-6.16-4.55H2.18v2.85A11 11 0 0 0 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.08a6.6 6.6 0 0 1 0-4.16V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.85z"/>
          <path fill="#EA4335" d="M12 5.5c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.16 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.85C6.7 7.44 9.13 5.5 12 5.5z"/>
        </svg>
        Continue with Google
      </button>

      <p className="text-center text-sm text-gray-600 mt-4">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-blue-600 hover:text-blue-700 font-medium">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to OpenMarket?{" "}
            <Link href="/sign-up" className="text-blue-600 hover:text-blue-700 font-medium">
              Create an account
            </Link>
          </>
        )}
      </p>

      <p className="text-center text-xs text-gray-500 mt-2">
        By continuing you agree to our{" "}
        <Link href="/terms" className="underline">Terms</Link> and{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </form>
  );
}

function humanizeError(err: { message?: string; code?: string } | unknown): string {
  if (!err || typeof err !== "object") return "Something went wrong";
  const e = err as { message?: string; code?: string };
  if (e.code === "USER_ALREADY_EXISTS") return "An account with that email already exists.";
  if (e.code === "INVALID_EMAIL_OR_PASSWORD") return "Email or password is incorrect.";
  if (e.code === "EMAIL_NOT_VERIFIED")
    return "Please verify your email before signing in. Check your inbox.";
  return e.message ?? "Something went wrong";
}
