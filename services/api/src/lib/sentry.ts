// Sentry init for the API. Must be the first import in services/api/src/index.ts
// (before any other module that we want to be instrumented).
//
// No-op when SENTRY_DSN is unset.

import * as Sentry from "@sentry/node";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

const dsn = env("SENTRY_DSN");

if (dsn) {
  Sentry.init({
    dsn,
    environment: env("VERCEL_ENV") ?? env("NODE_ENV") ?? "development",
    release: env("VERCEL_GIT_COMMIT_SHA"),
    tracesSampleRate: env("NODE_ENV") === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    // Filter known noise.
    ignoreErrors: [
      // Better Auth's standard 401/403 throws aren't worth alerting on.
      /HTTPException.*40[13]/,
    ],
    beforeSend(event) {
      // Don't capture events for /health checks.
      const path = event.request?.url ?? "";
      if (path.endsWith("/health")) return null;
      return event;
    },
  });
}

export { Sentry };
export const sentryEnabled = Boolean(dsn);
