import { useEffect, useState } from "react";
import { createAuthClient } from "better-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Better Auth React client. Talks to the API at `${API_URL}/api/auth/*`.
 *
 * Cookies are first-party once the API is on `api.openmarket.app` (same
 * eTLD+1 as the storefront). Locally we cross-origin via fetch with
 * `credentials: include` — both API CORS and browser handle that.
 */
export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  fetchOptions: { credentials: "include" },
});

export const { signIn, signUp, signOut } = authClient;

type SessionState = ReturnType<typeof authClient.useSession>;

/**
 * Hydration-safe wrapper around Better Auth's useSession.
 *
 * During SSR the session is always pending, so components render their
 * pending branch into the HTML. But on the client the auth store can resolve
 * BEFORE React hydrates (no cookie → settled "signed out"), so the first
 * client render takes the signed-out branch instead — server and client HTML
 * disagree and React throws a hydration error, regenerating the whole tree
 * (seen first in WishlistHeart, but every useSession consumer that branches
 * on isPending is exposed). Reporting isPending=true until after mount makes
 * the first client render deterministically match SSR; the real session
 * state applies one effect-tick later.
 */
export function useSession(): SessionState {
  const state = authClient.useSession();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (!hydrated) {
    return { ...state, data: null, isPending: true, error: null } as SessionState;
  }
  return state;
}

// Better Auth's React client exposes password-reset / verification under
// .api on some versions; re-export typed wrappers that work consistently.
export const forgetPassword = (input: { email: string; redirectTo?: string }) =>
  (authClient as unknown as {
    forgetPassword: (i: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>;
  }).forgetPassword(input);

export const resetPassword = (input: { newPassword: string; token: string }) =>
  (authClient as unknown as {
    resetPassword: (i: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>;
  }).resetPassword(input);

export const sendVerificationEmail = (input: { email: string; callbackURL?: string }) =>
  (authClient as unknown as {
    sendVerificationEmail: (i: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>;
  }).sendVerificationEmail(input);
