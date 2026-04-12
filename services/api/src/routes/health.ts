import { Hono } from "hono";

export const healthRouter = new Hono();

healthRouter.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "openmarket-api",
    timestamp: new Date().toISOString(),
  });
});
