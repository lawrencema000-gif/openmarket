// Pure Hono application — no listening, no node-server.
//
// Imported by:
//   - src/index.ts        → boots a node server on $PORT (local dev)
//   - api/[[...slug]].ts  → wrapped by hono/vercel for serverless deploy
//
// Keep this file free of Node-specific runtime code so the same module
// works on both Node and Edge runtimes if we ever want to switch.

import "./lib/env";
import "./lib/sentry"; // Must come right after env so DSN is loaded.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { libraryRouter } from "./routes/library";
import { developersRouter } from "./routes/developers";
import { signingKeysRouter } from "./routes/signing-keys";
import { appsRouter } from "./routes/apps";
import { releasesRouter } from "./routes/releases";
import { searchRouter } from "./routes/search";
import { categoriesRouter } from "./routes/categories";
import { reviewsRouter } from "./routes/reviews";
import { reportsRouter } from "./routes/reports";
import { adminRouter } from "./routes/admin";
import { errorHandler } from "./middleware/error-handler";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

/**
 * Build the list of allowed CORS origins.
 *
 * Local dev:   localhost:3000-3002 (market-web, dev-portal, admin).
 * Production:  driven by CORS_ORIGINS env var (comma-separated).
 *
 * We never use `*` for origins because Better Auth sets cookies with
 * credentials: include, which requires explicit origin allow-list.
 */
function allowedOrigins(): string[] {
  const explicit = env("CORS_ORIGINS")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    ...explicit,
  ];
}

export const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: allowedOrigins(),
    credentials: true,
  }),
);

app.onError(errorHandler);

app.route("/", healthRouter);
app.route("/api", authRouter);
app.route("/api", usersRouter);
app.route("/api", libraryRouter);
app.route("/api", developersRouter);
app.route("/api", signingKeysRouter);
app.route("/api", appsRouter);
app.route("/api", releasesRouter);
app.route("/api", searchRouter);
app.route("/api", categoriesRouter);
app.route("/api", reviewsRouter);
app.route("/api", reportsRouter);
app.route("/api", adminRouter);

export default app;
export type AppType = typeof app;
