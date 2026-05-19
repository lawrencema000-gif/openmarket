import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { apps } from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import {
  aggregateAppRevenue,
  aggregateDeveloperRevenue,
} from "../lib/revenue";
import type { Variables } from "../lib/types";

export const revenueRouter = new Hono<{ Variables: Variables }>();

/**
 * Revenue endpoints (Block EE).
 *
 *   GET /apps/:id/revenue          developer+ on owning publisher;
 *                                  per-app breakdown by currency,
 *                                  by product, and daily series
 *   GET /developers/me/revenue     auth; cross-app summary for the
 *                                  caller's publisher
 *
 * Date params:
 *   ?from=ISO-8601&to=ISO-8601
 * Both default to last 30 days. Window is inclusive on both ends —
 * the underlying SQL uses gte/lte so a developer-typed end-of-day
 * inclusive range matches intuition.
 *
 * Pricing rationale: viewer-role gates aren't relevant here because
 * pricing data is sensitive — only developer+ roles see revenue.
 */

const rangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function resolveRange(query: { from?: string; to?: string }): {
  from: Date;
  to: Date;
} {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new HTTPException(400, { message: "invalid date range" });
  }
  if (from >= to) {
    throw new HTTPException(400, { message: "from must be earlier than to" });
  }
  return { from, to };
}

revenueRouter.get(
  "/apps/:id/revenue",
  requireAuth,
  zValidator("query", rangeSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");
    const query = c.req.valid("query");

    const ctx = await findEffectiveDeveloperContext(user.email);
    if (!ctx) {
      throw new HTTPException(403, {
        message: "No publisher account associated with this user",
      });
    }
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Viewing revenue requires developer role; you have ${ctx.role}`,
      });
    }
    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, appId), eq(apps.developerId, ctx.developer.id)),
    });
    if (!app) {
      throw new HTTPException(404, {
        message: "App not found or not owned by this publisher",
      });
    }

    const { from, to } = resolveRange(query);
    const summary = await aggregateAppRevenue({ appId, from, to });
    return c.json(summary);
  },
);

revenueRouter.get(
  "/developers/me/revenue",
  requireAuth,
  zValidator("query", rangeSchema),
  async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");

    const ctx = await findEffectiveDeveloperContext(user.email);
    if (!ctx) {
      throw new HTTPException(403, {
        message: "No publisher account associated with this user",
      });
    }
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Viewing revenue requires developer role; you have ${ctx.role}`,
      });
    }

    const { from, to } = resolveRange(query);
    const summary = await aggregateDeveloperRevenue(
      ctx.developer.id,
      from,
      to,
    );
    return c.json({
      developerId: ctx.developer.id,
      from: from.toISOString(),
      to: to.toISOString(),
      ...summary,
    });
  },
);
