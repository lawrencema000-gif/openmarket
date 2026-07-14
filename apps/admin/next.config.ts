import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Pin file tracing to the monorepo root. Without this Next infers the
  // HOME directory as workspace root (a stray package-lock.json lives
  // there) and warns on every build.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@openmarket/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

const sentryOptions = {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT ?? "openmarket-admin",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  disableLogger: true,
  telemetry: false,
};

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig;
