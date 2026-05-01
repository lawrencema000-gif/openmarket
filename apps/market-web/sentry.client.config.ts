// Sentry browser-side init.
// Loaded automatically by `@sentry/nextjs` for client bundles.
// No-op when NEXT_PUBLIC_SENTRY_DSN is unset (local dev) — SDK is fully tree-shaken.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // 10% of transactions traced in prod; 100% in dev when DSN is set.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Replay only on errors — don't record sessions to save quota.
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    // Don't send personally-identifying data by default.
    sendDefaultPii: false,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    // Filter known noise.
    ignoreErrors: [
      // Browser extensions
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // Network blips that aren't actionable
      "Network request failed",
      "Failed to fetch",
      // Hydration mismatches caused by browser extensions
      /hydration.*mismatch/i,
    ],
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
