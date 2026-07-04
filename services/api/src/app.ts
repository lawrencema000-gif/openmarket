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
import { wishlistRouter } from "./routes/wishlist";
import { developersRouter } from "./routes/developers";
import { signingKeysRouter } from "./routes/signing-keys";
import { appsRouter } from "./routes/apps";
import { releasesRouter } from "./routes/releases";
import { searchRouter } from "./routes/search";
import { categoriesRouter } from "./routes/categories";
import { reviewsRouter } from "./routes/reviews";
import { reportsRouter } from "./routes/reports";
import { appealsRouter } from "./routes/appeals";
import { chartsRouter } from "./routes/charts";
import { apiTokensRouter } from "./routes/api-tokens";
import { cliRouter } from "./routes/cli";
import { statisticsRouter } from "./routes/statistics";
import { dmcaRouter } from "./routes/dmca";
import { teamRouter } from "./routes/team";
import { dataSafetyRouter } from "./routes/data-safety";
import { betaRouter } from "./routes/beta";
import { translationsRouter } from "./routes/translations";
import { crashesRouter } from "./routes/crashes";
import { pushRouter } from "./routes/push";
import { previewVideosRouter } from "./routes/preview-videos";
import { preRegistrationRouter } from "./routes/pre-registration";
import { distributionRouter } from "./routes/distribution";
import { deviceRouter } from "./routes/device";
import { reviewHighlightsRouter } from "./routes/review-highlights";
import { promoCodesRouter } from "./routes/promo-codes";
import { listingExperimentsRouter } from "./routes/listing-experiments";
import { parentalControlsRouter } from "./routes/parental-controls";
import { familySharingRouter } from "./routes/family-sharing";
import { bundletoolRouter } from "./routes/bundletool";
import { pricingRouter } from "./routes/pricing";
import { stripeWebhookRouter } from "./routes/stripe-webhook";
import { iapRouter } from "./routes/iap";
import { revenueRouter } from "./routes/revenue";
import { appSubscriptionsRouter } from "./routes/app-subscriptions";
import { payoutsRouter } from "./routes/payouts";
import { liveAnalyticsRouter } from "./routes/live-analytics";
import { promotedListingsRouter } from "./routes/promoted-listings";
import { affiliatesRouter } from "./routes/affiliates";
import { enterpriseRouter } from "./routes/enterprise";
import { federationRouter } from "./routes/federation";
import { cronRouter } from "./routes/cron";
import { planRouter } from "./routes/plan";
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
app.route("/api", wishlistRouter);
app.route("/api", developersRouter);
app.route("/api", signingKeysRouter);
app.route("/api", appsRouter);
app.route("/api", releasesRouter);
app.route("/api", searchRouter);
app.route("/api", categoriesRouter);
app.route("/api", reviewsRouter);
app.route("/api", reportsRouter);
app.route("/api", appealsRouter);
app.route("/api", chartsRouter);
app.route("/api", apiTokensRouter);
app.route("/api", cliRouter);
app.route("/api", statisticsRouter);
app.route("/api", dmcaRouter);
app.route("/api", teamRouter);
app.route("/api", dataSafetyRouter);
app.route("/api", betaRouter);
app.route("/api", translationsRouter);
app.route("/api", crashesRouter);
app.route("/api", pushRouter);
app.route("/api", previewVideosRouter);
app.route("/api", preRegistrationRouter);
app.route("/api", distributionRouter);
app.route("/api", deviceRouter);
app.route("/api", reviewHighlightsRouter);
app.route("/api", promoCodesRouter);
app.route("/api", listingExperimentsRouter);
app.route("/api", parentalControlsRouter);
app.route("/api", familySharingRouter);
app.route("/api", bundletoolRouter);
app.route("/api", pricingRouter);
app.route("/api", stripeWebhookRouter);
app.route("/api", iapRouter);
app.route("/api", revenueRouter);
app.route("/api", appSubscriptionsRouter);
app.route("/api", payoutsRouter);
app.route("/api", liveAnalyticsRouter);
app.route("/api", promotedListingsRouter);
app.route("/api", affiliatesRouter);
app.route("/api", enterpriseRouter);
app.route("/api", federationRouter);
app.route("/api", cronRouter);
app.route("/api", planRouter);
app.route("/api", adminRouter);

export default app;
export type AppType = typeof app;
