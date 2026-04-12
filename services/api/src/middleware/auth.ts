import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../lib/auth";
import type { Variables } from "../lib/types";

export async function requireAuth(c: Context<{ Variables: Variables }>, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  c.set("session", session.session);
  c.set("user", session.user);
  await next();
}
