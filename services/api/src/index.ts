// Local-dev entry point. Boots the Hono app on a Node server.
// In production, the same `app` is wrapped by hono/vercel in `api/[[...slug]].ts`.

import { serve } from "@hono/node-server";
import { app } from "./app";

const port = parseInt(process.env.PORT ?? "3001", 10);

console.log(`OpenMarket API starting on port ${port}`);

serve({ fetch: app.fetch, port });

export { app };
export type { AppType } from "./app";
