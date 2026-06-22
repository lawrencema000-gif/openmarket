import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { timingSafeEqual } from "node:crypto";

/**
 * Authorize a scheduled (cron) request.
 *
 * Vercel Cron invokes the configured path with a GET request carrying
 * `Authorization: Bearer <CRON_SECRET>` (it injects the CRON_SECRET env
 * var automatically). We verify that shared secret with a timing-safe
 * compare so the otherwise-public cron routes can't be triggered by
 * anyone who guesses the path.
 *
 * Fail-closed: if CRON_SECRET is unset the route is unreachable (503)
 * rather than open.
 */
export async function requireCron(c: Context, next: Next) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length === 0) {
    throw new HTTPException(503, {
      message: "Cron is not configured on this deploy (CRON_SECRET unset).",
    });
  }

  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new HTTPException(401, { message: "Invalid cron credentials" });
  }

  await next();
}
