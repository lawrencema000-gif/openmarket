import "./lib/env";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
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

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
    ],
    credentials: true,
  })
);

app.onError(errorHandler);

app.route("/", healthRouter);
app.route("/api", authRouter);
app.route("/api", developersRouter);
app.route("/api", signingKeysRouter);
app.route("/api", appsRouter);
app.route("/api", releasesRouter);
app.route("/api", searchRouter);
app.route("/api", categoriesRouter);
app.route("/api", reviewsRouter);
app.route("/api", reportsRouter);
app.route("/api", adminRouter);

const port = parseInt(process.env.PORT ?? "3001", 10);

console.log(`OpenMarket API starting on port ${port}`);

serve({ fetch: app.fetch, port });

export default app;
export type AppType = typeof app;
