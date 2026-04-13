import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { developers } from "@openmarket/db/schema";

export async function requireAdmin(c: Context, next: Next) {
  const user = c.get("user") as { id: string; email: string } | undefined;

  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer || !developer.isAdmin) {
    throw new HTTPException(403, { message: "Admin access required" });
  }

  c.set("admin", developer);
  await next();
}
