import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  apps,
  appPreviewVideos,
} from "@openmarket/db/schema";
import {
  previewVideoInputSchema,
  previewVideoPatchSchema,
} from "@openmarket/contracts/preview-videos";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import type { Variables } from "../lib/types";

export const previewVideosRouter = new Hono<{ Variables: Variables }>();

/**
 * Preview-video CRUD (P2-G).
 *
 *   GET    /apps/:id/preview-videos          → list (public)
 *   POST   /apps/:id/preview-videos          → add (developer+)
 *   PATCH  /apps/:id/preview-videos/:videoId → update (developer+)
 *   DELETE /apps/:id/preview-videos/:videoId → remove (developer+)
 *
 * The list is also surfaced inline on GET /apps/:id alongside
 * screenshots so the app-detail page can render both without an
 * extra round-trip.
 */

async function ensureOwnership(userEmail: string, appId: string) {
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

previewVideosRouter.get("/apps/:id/preview-videos", async (c) => {
  const appId = c.req.param("id") as string;
  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }
  const rows = await db
    .select()
    .from(appPreviewVideos)
    .where(eq(appPreviewVideos.appId, appId))
    .orderBy(asc(appPreviewVideos.sortOrder), asc(appPreviewVideos.createdAt));
  return c.json({ appId, previewVideos: rows });
});

previewVideosRouter.post(
  "/apps/:id/preview-videos",
  requireAuth,
  zValidator("json", previewVideoInputSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Adding preview videos requires developer role; you have ${ctx.role}`,
      });
    }

    const [row] = await db
      .insert(appPreviewVideos)
      .values({
        appId,
        videoUrl: body.videoUrl,
        posterUrl: body.posterUrl ?? null,
        label: body.label ?? null,
        durationSeconds: body.durationSeconds ?? null,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return c.json(row, 201);
  },
);

previewVideosRouter.patch(
  "/apps/:id/preview-videos/:videoId",
  requireAuth,
  zValidator("json", previewVideoPatchSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const videoId = c.req.param("videoId") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Editing preview videos requires developer role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.appPreviewVideos.findFirst({
      where: and(
        eq(appPreviewVideos.id, videoId),
        eq(appPreviewVideos.appId, appId),
      ),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Preview video not found" });
    }

    await db
      .update(appPreviewVideos)
      .set({
        videoUrl: body.videoUrl ?? existing.videoUrl,
        posterUrl:
          body.posterUrl === undefined ? existing.posterUrl : body.posterUrl,
        label: body.label === undefined ? existing.label : body.label,
        durationSeconds:
          body.durationSeconds === undefined
            ? existing.durationSeconds
            : body.durationSeconds,
        sortOrder: body.sortOrder ?? existing.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(appPreviewVideos.id, videoId));

    return c.json({ success: true });
  },
);

previewVideosRouter.delete(
  "/apps/:id/preview-videos/:videoId",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const videoId = c.req.param("videoId") as string;
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Deleting preview videos requires developer role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.appPreviewVideos.findFirst({
      where: and(
        eq(appPreviewVideos.id, videoId),
        eq(appPreviewVideos.appId, appId),
      ),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Preview video not found" });
    }

    await db
      .delete(appPreviewVideos)
      .where(eq(appPreviewVideos.id, videoId));

    return c.json({ success: true });
  },
);
