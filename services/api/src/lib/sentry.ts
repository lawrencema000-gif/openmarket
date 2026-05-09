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

      // PII scrubbing. Moderation routes (reports, appeals) carry the
      // moderator's verbatim notes + the developer's appeal body; both
      // can contain the developer's legal name, address, or other
      // user-supplied context that we don't want in third-party error
      // tracking. Redact the keys regardless of which route fired.
      // (sendDefaultPii is already false; this catches the application-
      // layer fields that aren't on Sentry's default scrub list.)
      scrubPii(event.request?.data);
      scrubPii(event.extra);
      scrubPii(event.contexts);

      return event;
    },
  });
}

/**
 * Application-layer PII scrubber. Walks an arbitrary object/value tree
 * and replaces the contents of any field whose key looks like
 * user-supplied moderation prose with `[redacted]`. We only walk
 * objects + arrays; primitives at the root just pass through.
 *
 * Exported for unit tests.
 */
const PII_KEYS = new Set([
  "notes",            // moderator resolution notes
  "resolutionNotes",  // ditto, server-side rename
  "body",             // appeal body
  "description",      // report description
  "appealNotes",      // moderation_actions
  "reason",           // takedown / appeal reasons can include identifying context
]);

export function scrubPii(value: unknown, depth = 0): unknown {
  if (depth > 6) return value; // bound recursion to keep beforeSend hot
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) scrubPii(item, depth + 1);
    return value;
  }
  const obj = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEYS.has(k) && typeof v === "string") {
      obj[k] = "[redacted]";
    } else if (v && typeof v === "object") {
      scrubPii(v, depth + 1);
    }
  }
  return value;
}

export { Sentry };
export const sentryEnabled = Boolean(dsn);
