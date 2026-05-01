// Vercel serverless entry point.
//
// Vercel auto-detects files under api/ as serverless functions and routes
// requests to them. We export a single function and use vercel.json rewrites
// to route every path here, then let Hono do its own internal routing.
//
// Why nodejs runtime (not edge):
//   - postgres-js (Drizzle driver) needs Node.
//   - Better Auth uses Node crypto APIs.
//   - @aws-sdk/client-s3 needs Node.
//   - Cold starts on Fluid Compute keep DB connections warm enough.

import { handle } from "hono/vercel";
import { app } from "../src/app";

export const config = {
  runtime: "nodejs22.x",
  // Allow longer execution for ingest finalize, signed-URL bursts.
  maxDuration: 60,
};

export default handle(app);
