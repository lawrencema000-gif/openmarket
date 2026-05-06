import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { developers } from "@openmarket/db/schema";

export async function requireAdmin(c: Context, next: Next) {
  const user = c.get("user") as
    | { id: string; email: string; emailVerified?: boolean }
    | undefined;

  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  // Privilege escalation guard: admin status is keyed off `developers.email`,
  // so an unverified-email session whose email happens to match an admin
  // developer row must not pass. Better Auth populates `emailVerified` on
  // the session user; in environments where the field is absent we treat
  // it as not verified and refuse.
  if (user.emailVerified !== true) {
    throw new HTTPException(403, {
      message: "Verified email required for admin access",
    });
  }

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(403, { message: "Developer profile required for admin access" });
  }
  if (!developer.isAdmin) {
    throw new HTTPException(403, { message: "Admin access required" });
  }

  c.set("admin", developer);
  await next();
}
