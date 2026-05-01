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

export const { signIn, signUp, signOut, useSession } = authClient;

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
