import type { Transport } from "./transport.js";
import { ResendTransport } from "./resend.js";
import { DevLogTransport } from "./dev-log.js";

export type { Transport, SendInput, SendResult } from "./transport.js";
export { ResendTransport, DevLogTransport };

let cached: Transport | null = null;

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

/**
 * Pick a transport based on env. Cached for the lifetime of the worker.
 *
 * Production: Resend (RESEND_API_KEY set).
 * Local dev:  DevLogTransport — writes rendered HTML+text to `.email-log/`
 *             so you can preview emails in a browser without sending real ones.
 */
export function getTransport(): Transport {
  if (cached) return cached;
  const apiKey = env("RESEND_API_KEY");
  if (apiKey) {
    cached = new ResendTransport({
      apiKey,
      defaultFrom: env("EMAIL_FROM") ?? "OpenMarket <noreply@openmarket.app>",
      replyTo: env("EMAIL_REPLY_TO"),
    });
  } else {
    cached = new DevLogTransport({
      logDir: env("EMAIL_LOG_DIR") ?? ".email-log",
    });
  }
  return cached;
}

/** Test-only: reset the cached transport so the next call re-reads env. */
export function _resetTransportForTests(): void {
  cached = null;
}
