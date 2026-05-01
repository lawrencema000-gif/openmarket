import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { Sentry, sentryEnabled } from "../lib/sentry";

export async function errorHandler(err: Error, c: Context) {
  if (err instanceof HTTPException) {
    // 4xx are client errors — don't page Sentry on those.
    return c.json(
      {
        error: {
          code: `HTTP_${err.status}`,
          message: err.message,
        },
      },
      err.status
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: err.flatten(),
        },
      },
      400
    );
  }

  // Unhandled — capture to Sentry + log.
  console.error("Unhandled error:", err);
  if (sentryEnabled) {
    Sentry.withScope((scope) => {
      scope.setTag("path", new URL(c.req.url).pathname);
      scope.setTag("method", c.req.method);
      scope.setLevel("error");
      Sentry.captureException(err);
    });
  }
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred",
      },
    },
    500
  );
}
