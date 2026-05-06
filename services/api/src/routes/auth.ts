import { Hono } from "hono";
import type { Context, Next } from "hono";
import { auth } from "../lib/auth";
import { rateLimit } from "../middleware/rate-limit";

export const authRouter = new Hono();

/**
 * Better Auth mounts everything at /auth/* via a single handler. We
 * still want different rate limits on the abusive paths (sign-in /
 * sign-up) than on the common ones (session refresh). This dispatcher
 * inspects the path and applies the correct limiter before handing off.
 *
 * Limits:
 *   - /auth/sign-in/email   → 5 / min / IP   (brute-force protection)
 *   - /auth/sign-up/email   → 3 / hour / IP  (account-creation flood)
 *   - /auth/forget-password → 3 / hour / IP  (enumeration protection)
 *   - everything else       → no specific limit (Better Auth has its
 *                             own internals + the API edge has a
 *                             coarse default)
 */
const signInLimit = rateLimit({
  windowSec: 60,
  max: 5,
  by: "ip",
  bucket: "auth-sign-in",
});

const signUpLimit = rateLimit({
  windowSec: 3600,
  max: 3,
  by: "ip",
  bucket: "auth-sign-up",
});

const forgetPasswordLimit = rateLimit({
  windowSec: 3600,
  max: 3,
  by: "ip",
  bucket: "auth-forget-pw",
});

async function authDispatch(c: Context, next: Next) {
  const path = c.req.path;
  // Only POST is sensitive; GET requests on /auth/session etc. shouldn't
  // be rate-limited the same way.
  if (c.req.method === "POST") {
    if (path.startsWith("/auth/sign-in")) return signInLimit(c, next);
    if (path.startsWith("/auth/sign-up")) return signUpLimit(c, next);
    if (path.startsWith("/auth/forget-password")) return forgetPasswordLimit(c, next);
  }
  await next();
}

authRouter.all("/auth/*", authDispatch, async (c) => {
  return auth.handler(c.req.raw);
});
