import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  apps,
  crashGroups,
  crashEvents,
} from "@openmarket/db/schema";
import {
  crashSubmissionSchema,
  crashGroupPatchSchema,
} from "@openmarket/contracts/crashes";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import { recordCrash, findAppForCrashSubmission } from "../lib/crashes";
import type { Variables } from "../lib/types";

export const crashesRouter = new Hono<{ Variables: Variables }>();

/**
 * POST /apps/:id/crashes — public, unauthenticated.
 *
 * The device SDK calls this after a crash; we DO NOT require auth
 * because users haven't signed in to the storefront from inside the
 * crashed app. Rate-limit is delegated to the global rate-limit
 * middleware (per-IP). Returns 202 — the report is durably stored
 * but downstream effects (alerting, aggregation) are async.
 */
crashesRouter.post(
  "/apps/:id/crashes",
  zValidator("json", crashSubmissionSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const submission = c.req.valid("json");

    const app = await findAppForCrashSubmission(appId);
    if (!app || app.isDelisted) {
      // Returning 404 leaks whether the app exists, but the alternative
      // (silent 202) would mask SDK-config errors during integration.
      throw new HTTPException(404, { message: "App not found" });
    }

    const result = await recordCrash(appId, submission);
    return c.json(result, 202);
  },
);

async function ensurePublisherAccess(userEmail: string, appId: string) {
  const ctx = await findEffectiveDeveloperContext(userEmail);
  if (!ctx) {
    throw new HTTPException(403, {
      message: "No publisher account associated with this user",
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
  return { ctx, app };
}

/**
 * GET /apps/:id/crashes — developer-only.
 *
 * Lists crash groups for the app, newest-lastSeen first. Filter by
 * status via `?status=open|ignored|resolved` (default: open).
 */
crashesRouter.get(
  "/apps/:id/crashes",
  requireAuth,
  zValidator(
    "query",
    z.object({
      status: z.enum(["open", "ignored", "resolved", "all"]).default("open"),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
  ),
  async (c) => {
    const appId = c.req.param("id") as string;
    const { status, limit } = c.req.valid("query");
    const user = c.get("user");

    await ensurePublisherAccess(user.email, appId);

    const where = status === "all"
      ? eq(crashGroups.appId, appId)
      : and(eq(crashGroups.appId, appId), eq(crashGroups.status, status));

    const rows = await db
      .select({
        id: crashGroups.id,
        fingerprint: crashGroups.fingerprint,
        exceptionType: crashGroups.exceptionType,
        exceptionMessage: crashGroups.exceptionMessage,
        status: crashGroups.status,
        occurrenceCount: crashGroups.occurrenceCount,
        affectedUserCount: crashGroups.affectedUserCount,
        firstSeenAt: crashGroups.firstSeenAt,
        lastSeenAt: crashGroups.lastSeenAt,
      })
      .from(crashGroups)
      .where(where)
      .orderBy(desc(crashGroups.lastSeenAt))
      .limit(limit);

    return c.json({ appId, status, groups: rows });
  },
);

/**
 * GET /apps/:id/crashes/:groupId — developer-only.
 *
 * Single group + the most recent N events (default 20) for the
 * developer to inspect on the triage page.
 */
crashesRouter.get(
  "/apps/:id/crashes/:groupId",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const groupId = c.req.param("groupId") as string;
    const user = c.get("user");

    await ensurePublisherAccess(user.email, appId);

    const group = await db.query.crashGroups.findFirst({
      where: and(
        eq(crashGroups.id, groupId),
        eq(crashGroups.appId, appId),
      ),
    });
    if (!group) {
      throw new HTTPException(404, { message: "Crash group not found" });
    }

    const events = await db
      .select({
        id: crashEvents.id,
        appVersionCode: crashEvents.appVersionCode,
        appVersionName: crashEvents.appVersionName,
        deviceModel: crashEvents.deviceModel,
        osVersion: crashEvents.osVersion,
        occurredAt: crashEvents.occurredAt,
        createdAt: crashEvents.createdAt,
      })
      .from(crashEvents)
      .where(eq(crashEvents.groupId, groupId))
      .orderBy(desc(crashEvents.createdAt))
      .limit(20);

    return c.json({ group, recentEvents: events });
  },
);

/**
 * PATCH /apps/:id/crashes/:groupId — developer+.
 *
 * Triage actions: flip status to ignored or resolved (with a release
 * pointer for future regression detection). Going back to `open` is
 * also allowed for completeness.
 */
crashesRouter.patch(
  "/apps/:id/crashes/:groupId",
  requireAuth,
  zValidator("json", crashGroupPatchSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const groupId = c.req.param("groupId") as string;
    const user = c.get("user");
    const body = c.req.valid("json");

    const { ctx } = await ensurePublisherAccess(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Triaging crashes requires developer role; you have ${ctx.role}`,
      });
    }

    if (body.status === "resolved" && !body.resolvedAtReleaseId) {
      throw new HTTPException(400, {
        message:
          "resolvedAtReleaseId is required when marking a group resolved (used for regression auto-flip)",
      });
    }

    const existing = await db.query.crashGroups.findFirst({
      where: and(
        eq(crashGroups.id, groupId),
        eq(crashGroups.appId, appId),
      ),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Crash group not found" });
    }

    await db
      .update(crashGroups)
      .set({
        status: body.status,
        resolvedAtReleaseId:
          body.status === "resolved" ? body.resolvedAtReleaseId ?? null : null,
        updatedAt: new Date(),
      })
      .where(eq(crashGroups.id, groupId));

    return c.json({ success: true, status: body.status });
  },
);
