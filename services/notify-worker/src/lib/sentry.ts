// Sentry init for the notify-worker. No-op when SENTRY_DSN is unset.

import * as Sentry from "@sentry/node";

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

const dsn = env("SENTRY_DSN");

if (dsn) {
  Sentry.init({
    dsn,
    environment: env("FLY_APP_NAME") ? "production" : env("NODE_ENV") ?? "development",
    release: env("GIT_COMMIT_SHA") ?? env("FLY_MACHINE_VERSION"),
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    serverName: env("FLY_MACHINE_ID") ?? env("HOSTNAME"),
  });
}

export { Sentry };
export const sentryEnabled = Boolean(dsn);
