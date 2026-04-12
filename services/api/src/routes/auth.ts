import { Hono } from "hono";
import { auth } from "../lib/auth";

export const authRouter = new Hono();

authRouter.all("/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});
