import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  apps,
  preRegistrations,
  users,
} from "@openmarket/db/schema";
import {
  preRegistrationInputSchema,
} from "@openmarket/contracts/pre-registration";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import {
  countActivePreRegistrations,
  preRegistrationStatusFor,
} from "../lib/pre-registration";
import type { Variables } from "../lib/types";

export const preRegistrationRouter = new Hono<{ Variables: Variables }>();

/**
 * Pre-registration endpoints (P3-A).
 *
 *   GET    /apps/:id/pre-register/status   — public; viewer state if signed in
 *   POST   /apps/:id/pre-register          — auth required; idempotent
 *   DELETE /apps/:id/pre-register          — auth required; soft-delete
 *   PATCH  /apps/:id/pre-register          — admin+; toggle enabled flag
 *   GET    /apps/:id/pre-register/count    — developer+; current waitlist size
 */

async function findProfile(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
}

preRegistrationRouter.get("/apps/:id/pre-register/status", async (c) => {
  const appId = c.req.param("id") as string;
  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }

  // Best-effort viewer lookup — no auth required to read the public
  // count, but if a session is present we surface whether the viewer
  // is on the list so the storefront button can render correctly.
  let viewerUserId: string | null = null;
  try {
    const { auth } = await import("../lib/auth");
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user?.email) {
      const profile = await findProfile(session.user.email);
      viewerUserId = profile?.id ?? null;
    }
  } catch {
    // viewer stays anonymous
  }

  const status = await preRegistrationStatusFor(appId, viewerUserId);
  return c.json({ appId, ...status });
});

preRegistrationRouter.post(
  "/apps/:id/pre-register",
  requireAuth,
  zValidator("json", preRegistrationInputSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app || app.isDelisted) {
      throw new HTTPException(404, { message: "App not found" });
    }
    if (!app.preRegistrationEnabled) {
      throw new HTTPException(409, {
        message:
          "Pre-registration isn't open for this app. Ask the developer to enable it.",
      });
    }

    const profile = await findProfile(user.email);
    if (!profile) {
      throw new HTTPException(403, { message: "Account not found" });
    }

    const existing = await db.query.preRegistrations.findFirst({
      where: and(
        eq(preRegistrations.appId, appId),
        eq(preRegistrations.userId, profile.id),
      ),
    });
    if (existing) {
      if (existing.unregisteredAt == null) {
        // Idempotent — already registered. Update channel in case the
        // user changed their mind about how to be notified.
        if (existing.channel !== body.channel) {
          await db
            .update(preRegistrations)
            .set({ channel: body.channel })
            .where(eq(preRegistrations.id, existing.id));
        }
        return c.json({
          success: true,
          status: "active",
          channel: body.channel,
        });
      }
      // Re-register a previously unregistered user.
      await db
        .update(preRegistrations)
        .set({
          unregisteredAt: null,
          registeredAt: new Date(),
          channel: body.channel,
          // Clear notifiedAt so a re-registered user who unregistered
          // BEFORE launch and re-registered AFTER launch still gets
          // notified on a subsequent re-launch (rare but possible).
          notifiedAt: null,
        })
        .where(eq(preRegistrations.id, existing.id));
      return c.json({
        success: true,
        status: "rejoined",
        channel: body.channel,
      });
    }

    await db.insert(preRegistrations).values({
      appId,
      userId: profile.id,
      channel: body.channel,
    });
    return c.json({ success: true, status: "joined", channel: body.channel }, 201);
  },
);

preRegistrationRouter.delete(
  "/apps/:id/pre-register",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");
    const profile = await findProfile(user.email);
    if (!profile) {
      throw new HTTPException(403, { message: "Account not found" });
    }

    const existing = await db.query.preRegistrations.findFirst({
      where: and(
        eq(preRegistrations.appId, appId),
        eq(preRegistrations.userId, profile.id),
      ),
    });
    if (!existing || existing.unregisteredAt != null) {
      throw new HTTPException(404, {
        message: "You're not currently pre-registered for this app",
      });
    }

    await db
      .update(preRegistrations)
      .set({ unregisteredAt: new Date() })
      .where(eq(preRegistrations.id, existing.id));
    return c.json({ success: true });
  },
);

preRegistrationRouter.patch(
  "/apps/:id/pre-register",
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
        message: `Toggling pre-registration requires admin role; you have ${ctx.role}`,
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
      .set({ preRegistrationEnabled: body.enabled, updatedAt: new Date() })
      .where(eq(apps.id, appId));

    return c.json({ success: true, enabled: body.enabled });
  },
);

preRegistrationRouter.get(
  "/apps/:id/pre-register/count",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");

    const ctx = await findEffectiveDeveloperContext(user.email);
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

    const count = await countActivePreRegistrations(appId);
    return c.json({ appId, count, enabled: app.preRegistrationEnabled });
  },
);
