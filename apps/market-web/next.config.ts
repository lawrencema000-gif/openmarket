import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@openmarket/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

// Wrap with Sentry. When SENTRY_DSN is unset (local dev) the wrapper is a
// passthrough; no source maps are uploaded, no auth token is required.
const sentryOptions = {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT ?? "openmarket-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Upload source maps only when we have credentials.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Remove logger statements from production bundle.
  disableLogger: true,
  // Keep build output clean unless we're actively debugging.
  telemetry: false,
};

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig;
