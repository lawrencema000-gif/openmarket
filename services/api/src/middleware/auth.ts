import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../lib/auth";
import type { Variables } from "../lib/types";

/**
 * Test-mode auth bypass.
 *
 * When OPENMARKET_TEST_MODE === "1" AND the request carries the
 * required headers, requireAuth/requireAdmin trust the headers and
 * skip the Better Auth session lookup. This unblocks Playwright + the
 * API integration suite from depending on a real signed-in browser
 * session.
 *
 * Defense in depth: TEST_MODE is rejected on every NODE_ENV other
 * than "test" / "development". Production deploys run with
 * NODE_ENV=production and OPENMARKET_TEST_MODE unset; this code path
 * is dead in prod even if a forwarded header sneaks through a proxy.
 */
const TEST_MODE_HEADER_USER_ID = "x-test-user-id";
const TEST_MODE_HEADER_USER_EMAIL = "x-test-user-email";

function testModeAllowed(): boolean {
  if (process.env.OPENMARKET_TEST_MODE !== "1") return false;
  const env = process.env.NODE_ENV;
  return env === "test" || env === "development" || env === undefined;
}

function readTestModeUser(c: Context):
  | { id: string; email: string; emailVerified: true }
  | null {
  if (!testModeAllowed()) return null;
  const id = c.req.header(TEST_MODE_HEADER_USER_ID);
  const email = c.req.header(TEST_MODE_HEADER_USER_EMAIL);
  if (!id || !email) return null;
  return { id, email, emailVerified: true };
}

/**
 * Resolve the caller into `c.get("user")` / `c.get("session")`, honoring
 * test-mode headers. Throws 401 if there is no valid session. Shared by
 * requireAuth and requireAuthVerified so the session-resolution logic
 * lives in exactly one place.
 */
async function resolveSession(c: Context<{ Variables: Variables }>) {
  const testUser = readTestModeUser(c);
  if (testUser) {
    c.set("session", { id: `test-${testUser.id}` } as never);
    c.set("user", testUser as never);
    return;
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  c.set("session", session.session);
  c.set("user", session.user);
}

export async function requireAuth(c: Context<{ Variables: Variables }>, next: Next) {
  await resolveSession(c);
  await next();
}

/**
 * Like requireAuth, but additionally requires a VERIFIED email.
 *
 * Use on endpoints where an unverified account could cause real harm by
 * acting before proving control of its email: claiming developer status,
 * inviting/removing team members, minting API tokens, onboarding for
 * payouts. Mirrors the emailVerified gate already enforced by
 * requireAdmin. Better Auth populates `emailVerified` on the session
 * user; absent/false is treated as unverified and refused.
 */
export async function requireAuthVerified(
  c: Context<{ Variables: Variables }>,
  next: Next,
) {
  await resolveSession(c);
  const user = c.get("user") as { emailVerified?: boolean } | undefined;
  if (user?.emailVerified !== true) {
    throw new HTTPException(403, {
      message:
        "A verified email is required for this action. Check your inbox for the verification link.",
    });
  }
  await next();
}
