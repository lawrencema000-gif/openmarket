import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@openmarket/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Custom loader resolves variant URLs against the storefront's
    // /_next/image route OR a Cloudflare Image Transformations endpoint
    // depending on env. See src/lib/image-loader.ts for the convention.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    // Allowlisted CDN origins. Both the OpenMarket media bucket and
    // (for legacy seed data) raw external URLs are allowed via
    // remotePatterns; the loader normalizes everything else.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.openmarket.app", pathname: "/**" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com", pathname: "/**" },
      { protocol: "https", hostname: "**.cloudfront.net", pathname: "/**" },
      // Dev / seed data
      { protocol: "https", hostname: "via.placeholder.com", pathname: "/**" },
      { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "9000", pathname: "/**" },
    ],
    // 64 / 192 / 512 are the variants ingest-worker generates (deferred).
    // 1024 is the cap for high-DPI app-detail hero shots.
    deviceSizes: [64, 192, 320, 512, 768, 1024],
    imageSizes: [64, 96, 128, 192, 256, 384, 512],
    formats: ["image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 7, // a week — variants are content-hashed
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
