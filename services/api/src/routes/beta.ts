import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  apps,
  betaTesters,
  releases,
  users,
} from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import type { Variables } from "../lib/types";

export const betaRouter = new Hono<{ Variables: Variables }>();

/**
 * Lazy profile lookup that mirrors what other routes do — finds the
 * storefront-side `users` row keyed off the auth_user email.
 * Inlined rather than imported because the helper isn't exported
 * from any single place.
 */
async function findProfile(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
}

/**
 * GET /apps/:id/beta — public.
 *
 * Returns:
 *   - enabled:           whether the developer has opened the program
 *   - latestBeta:        the most recent published beta release (or null)
 *   - testerCount:       how many active beta testers
 *   - viewerStatus:      when called with a session, says whether the
 *                        caller is an active beta tester
 *
 * Storefront's "Join the beta" CTA reads this once per app detail
 * render — visible only when enabled and there's a published beta
 * release for users to actually try.
 */
betaRouter.get("/apps/:id/beta", async (c) => {
  const appId = c.req.param("id") as string;

  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }

  const [latestBeta] = await db
    .select({
      id: releases.id,
      versionCode: releases.versionCode,
      versionName: releases.versionName,
      publishedAt: releases.publishedAt,
      releaseNotes: releases.releaseNotes,
    })
    .from(releases)
    .where(
      and(
        eq(releases.appId, appId),
        eq(releases.channel, "beta"),
        eq(releases.status, "published"),
      ),
    )
    .orderBy(desc(releases.versionCode))
    .limit(1);

  const [{ active } = { active: 0 }] = await db
    .select({
      active: sql<number>`count(*) FILTER (WHERE ${betaTesters.revertedAt} IS NULL)`.as("active"),
    })
    .from(betaTesters)
    .where(eq(betaTesters.appId, appId));

  // Viewer status — best-effort. No auth required to read this
  // endpoint, but if we happen to have a session, surface the user's
  // status so the dashboard can render "You're already in" instead
  // of "Join".
  let viewerStatus: "active" | "former" | "none" | null = null;
  try {
    const { auth } = await import("../lib/auth");
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user?.email) {
      const profile = await findProfile(session.user.email);
      if (profile) {
        const row = await db.query.betaTesters.findFirst({
          where: and(
            eq(betaTesters.appId, appId),
            eq(betaTesters.userId, profile.id),
          ),
        });
        viewerStatus = row
          ? row.revertedAt == null
            ? "active"
            : "former"
          : "none";
      }
    }
  } catch {
    // Best-effort — viewerStatus stays null if anything goes wrong.
  }

  return c.json({
    appId,
    enabled: app.betaTrackEnabled,
    testerCount: Number(active),
    latestBeta: latestBeta ?? null,
    viewerStatus,
  });
});

/**
 * POST /apps/:id/beta/join — auth required.
 *
 * Idempotent: re-joining after leaving clears revertedAt; re-joining
 * while already active is a no-op. Requires the developer to have
 * enabled the program first.
 */
betaRouter.post("/apps/:id/beta/join", requireAuth, async (c) => {
  const appId = c.req.param("id") as string;
  const user = c.get("user");

  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }
  if (!app.betaTrackEnabled) {
    throw new HTTPException(409, {
      message:
        "This app's beta program isn't open. Ask the developer to enable it.",
    });
  }

  const profile = await findProfile(user.email);
  if (!profile) {
    throw new HTTPException(403, { message: "Account not found" });
  }

  // Insert-or-clear-reverted upsert.
  const existing = await db.query.betaTesters.findFirst({
    where: and(
      eq(betaTesters.appId, appId),
      eq(betaTesters.userId, profile.id),
    ),
  });
  if (existing) {
    if (existing.revertedAt == null) {
      // Already a member — return 200 idempotent.
      return c.json({ success: true, status: "active", joinedAt: existing.joinedAt });
    }
    await db
      .update(betaTesters)
      .set({ revertedAt: null, joinedAt: new Date() })
      .where(eq(betaTesters.id, existing.id));
    return c.json({ success: true, status: "rejoined" });
  }

  await db
    .insert(betaTesters)
    .values({ appId, userId: profile.id });
  return c.json({ success: true, status: "joined" }, 201);
});

/**
 * DELETE /apps/:id/beta/leave — auth required.
 *
 * Soft-delete via revertedAt. The next storefront render of the app
 * detail page falls back to the stable channel; we don't try to
 * forcibly uninstall the beta APK from the user's device.
 */
betaRouter.delete("/apps/:id/beta/leave", requireAuth, async (c) => {
  const appId = c.req.param("id") as string;
  const user = c.get("user");

  const profile = await findProfile(user.email);
  if (!profile) {
    throw new HTTPException(403, { message: "Account not found" });
  }

  const existing = await db.query.betaTesters.findFirst({
    where: and(
      eq(betaTesters.appId, appId),
      eq(betaTesters.userId, profile.id),
      isNull(betaTesters.revertedAt),
    ),
  });
  if (!existing) {
    throw new HTTPException(404, {
      message: "You're not currently a beta tester for this app",
    });
  }

  await db
    .update(betaTesters)
    .set({ revertedAt: new Date() })
    .where(eq(betaTesters.id, existing.id));
  return c.json({ success: true });
});

/**
 * PATCH /apps/:id/beta — developer (role admin+).
 *
 * Toggles `apps.betaTrackEnabled`. Refused when caller isn't part
 * of the publisher account (via findEffectiveDeveloperContext).
 *
 * Disabling the program does NOT auto-revert existing testers —
 * their rows stay active but the storefront stops surfacing the
 * Join CTA and won't expose new beta releases. This is intentional:
 * a dev who toggles off + on again shouldn't lose their existing
 * tester roster.
 */
betaRouter.patch(
  "/apps/:id/beta",
  requireAuth,
  zValidator("json", z.object({ enabled: z.boolean() })),
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");
    const body = c.req.valid("json");

    const ctx = await findEffectiveDeveloperContext(user.email);
    if (!ctx) {
      throw new HTTPException(403, {
        message: "No publisher account associated with this user",
      });
    }
    if (!roleSatisfies(ctx.role, "admin")) {
      throw new HTTPException(403, {
        message: `Toggling the beta program requires admin role; you have ${ctx.role}`,
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

    await db
      .update(apps)
      .set({ betaTrackEnabled: body.enabled, updatedAt: new Date() })
      .where(eq(apps.id, appId));

    return c.json({ success: true, enabled: body.enabled });
  },
);
