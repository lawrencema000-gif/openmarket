import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

export async function errorHandler(err: Error, c: Context) {
  if (err instanceof HTTPException) {
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

  console.error("Unhandled error:", err);
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
