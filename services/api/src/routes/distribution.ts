import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { randomBytes } from "node:crypto";
import {
  apps,
  distributionChannels,
  distributionChannelReleases,
  releaseArtifacts,
  releases,
} from "@openmarket/db/schema";
import {
  distributionChannelInputSchema,
  distributionChannelPatchSchema,
  pinReleaseSchema,
} from "@openmarket/contracts/distribution";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  findEffectiveDeveloperContext,
  roleSatisfies,
} from "../lib/team";
import type { Variables } from "../lib/types";

export const distributionRouter = new Hono<{ Variables: Variables }>();

/**
 * Distribution channels (P3-H).
 *
 *   POST   /apps/:id/distribution-channels                           — developer+ create
 *   GET    /apps/:id/distribution-channels                           — developer+ list
 *   PATCH  /apps/:id/distribution-channels/:channelId                — developer+ rename/expire
 *   DELETE /apps/:id/distribution-channels/:channelId                — developer+ revoke
 *   POST   /apps/:id/distribution-channels/:channelId/releases       — developer+ pin a release
 *   DELETE /apps/:id/distribution-channels/:channelId/releases/:rId  — developer+ unpin
 *
 *   GET    /distribution/:token                                      — PUBLIC; token-gated
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

function generateShareToken(): string {
  return `om_dist_${randomBytes(32).toString("base64url")}`;
}

distributionRouter.post(
  "/apps/:id/distribution-channels",
  requireAuth,
  zValidator("json", distributionChannelInputSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Creating distribution channels requires developer role; you have ${ctx.role}`,
      });
    }

    const [row] = await db
      .insert(distributionChannels)
      .values({
        appId,
        name: body.name,
        description: body.description ?? null,
        shareToken: generateShareToken(),
        createdBy: ctx.developer.id,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning();

    return c.json(row, 201);
  },
);

distributionRouter.get(
  "/apps/:id/distribution-channels",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "viewer")) {
      throw new HTTPException(403, {
        message: "Listing distribution channels requires at least viewer role",
      });
    }

    const rows = await db
      .select({
        id: distributionChannels.id,
        name: distributionChannels.name,
        description: distributionChannels.description,
        shareToken: distributionChannels.shareToken,
        createdAt: distributionChannels.createdAt,
        expiresAt: distributionChannels.expiresAt,
        revokedAt: distributionChannels.revokedAt,
      })
      .from(distributionChannels)
      .where(eq(distributionChannels.appId, appId))
      .orderBy(desc(distributionChannels.createdAt));

    return c.json({ appId, channels: rows });
  },
);

distributionRouter.patch(
  "/apps/:id/distribution-channels/:channelId",
  requireAuth,
  zValidator("json", distributionChannelPatchSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const channelId = c.req.param("channelId") as string;
    const user = c.get("user");
    const body = c.req.valid("json");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Editing distribution channels requires developer role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.distributionChannels.findFirst({
      where: and(
        eq(distributionChannels.id, channelId),
        eq(distributionChannels.appId, appId),
      ),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Channel not found" });
    }

    await db
      .update(distributionChannels)
      .set({
        name: body.name ?? existing.name,
        description:
          body.description === undefined
            ? existing.description
            : body.description,
        expiresAt:
          body.expiresAt === undefined
            ? existing.expiresAt
            : body.expiresAt
              ? new Date(body.expiresAt)
              : null,
        updatedAt: new Date(),
      })
      .where(eq(distributionChannels.id, channelId));

    return c.json({ success: true });
  },
);

distributionRouter.delete(
  "/apps/:id/distribution-channels/:channelId",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const channelId = c.req.param("channelId") as string;
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Revoking distribution channels requires developer role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.distributionChannels.findFirst({
      where: and(
        eq(distributionChannels.id, channelId),
        eq(distributionChannels.appId, appId),
      ),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Channel not found" });
    }
    if (existing.revokedAt) {
      throw new HTTPException(409, { message: "Channel is already revoked" });
    }

    await db
      .update(distributionChannels)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(distributionChannels.id, channelId));

    return c.json({ success: true });
  },
);

distributionRouter.post(
  "/apps/:id/distribution-channels/:channelId/releases",
  requireAuth,
  zValidator("json", pinReleaseSchema),
  async (c) => {
    const appId = c.req.param("id") as string;
    const channelId = c.req.param("channelId") as string;
    const body = c.req.valid("json");
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Pinning releases requires developer role; you have ${ctx.role}`,
      });
    }

    const channel = await db.query.distributionChannels.findFirst({
      where: and(
        eq(distributionChannels.id, channelId),
        eq(distributionChannels.appId, appId),
      ),
    });
    if (!channel || channel.revokedAt) {
      throw new HTTPException(404, {
        message: "Channel not found or revoked",
      });
    }

    // The release must belong to this app — refusing cross-app pinning
    // keeps the model coherent (a channel is per-app).
    const release = await db.query.releases.findFirst({
      where: and(eq(releases.id, body.releaseId), eq(releases.appId, appId)),
    });
    if (!release) {
      throw new HTTPException(404, {
        message: "Release not found or doesn't belong to this app",
      });
    }

    // Idempotent — same pin twice is a no-op.
    const existing = await db.query.distributionChannelReleases.findFirst({
      where: and(
        eq(distributionChannelReleases.channelId, channelId),
        eq(distributionChannelReleases.releaseId, body.releaseId),
      ),
    });
    if (existing) {
      return c.json({ success: true, status: "already-pinned" });
    }

    await db
      .insert(distributionChannelReleases)
      .values({ channelId, releaseId: body.releaseId });

    return c.json({ success: true, status: "pinned" }, 201);
  },
);

distributionRouter.delete(
  "/apps/:id/distribution-channels/:channelId/releases/:releaseId",
  requireAuth,
  async (c) => {
    const appId = c.req.param("id") as string;
    const channelId = c.req.param("channelId") as string;
    const releaseId = c.req.param("releaseId") as string;
    const user = c.get("user");

    const { ctx } = await ensureOwnership(user.email, appId);
    if (!roleSatisfies(ctx.role, "developer")) {
      throw new HTTPException(403, {
        message: `Unpinning releases requires developer role; you have ${ctx.role}`,
      });
    }

    const existing = await db.query.distributionChannelReleases.findFirst({
      where: and(
        eq(distributionChannelReleases.channelId, channelId),
        eq(distributionChannelReleases.releaseId, releaseId),
      ),
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Release isn't pinned to this channel" });
    }

    await db
      .delete(distributionChannelReleases)
      .where(eq(distributionChannelReleases.id, existing.id));

    return c.json({ success: true });
  },
);

/**
 * Public token-gated channel page. Lives outside the /apps/:id namespace
 * so it can be linked from an external URL without leaking app id.
 *
 * Returns the channel + its pinned releases with download URLs from
 * the verified artifact rows. We deliberately DON'T list the app's
 * public name unless the channel description includes it — the dev
 * controls what shows to invitees.
 *
 * Access rules:
 *   - revokedAt non-null → 410 Gone (signals to clients that the URL
 *     is permanently gone, not a transient 404)
 *   - expiresAt past → 410 Gone
 *   - otherwise → 200 with the channel payload
 */
distributionRouter.get("/distribution/:token", async (c) => {
  const token = c.req.param("token");

  const channel = await db.query.distributionChannels.findFirst({
    where: eq(distributionChannels.shareToken, token),
  });
  if (!channel) {
    throw new HTTPException(404, { message: "Channel not found" });
  }
  if (channel.revokedAt) {
    throw new HTTPException(410, { message: "This share link has been revoked" });
  }
  if (channel.expiresAt && channel.expiresAt < new Date()) {
    throw new HTTPException(410, { message: "This share link has expired" });
  }

  // App summary — title from current listing.
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, channel.appId),
    with: { listings: true },
  });
  const listing =
    app?.listings?.find((l) => l.id === app.currentListingId) ??
    app?.listings?.[app?.listings.length - 1];

  // Pinned releases, joined to a verified APK artifact when available.
  // We return ALL pinned releases (no published-status filter) — the
  // whole point of a private channel is to distribute builds that
  // haven't passed public review.
  const rows = await db
    .select({
      release: releases,
      artifact: releaseArtifacts,
    })
    .from(distributionChannelReleases)
    .innerJoin(
      releases,
      eq(distributionChannelReleases.releaseId, releases.id),
    )
    .leftJoin(
      releaseArtifacts,
      and(
        eq(releaseArtifacts.releaseId, releases.id),
        eq(releaseArtifacts.uploadStatus, "verified"),
      ),
    )
    .where(eq(distributionChannelReleases.channelId, channel.id))
    .orderBy(desc(releases.versionCode));

  return c.json({
    channel: {
      id: channel.id,
      name: channel.name,
      description: channel.description,
      expiresAt: channel.expiresAt,
    },
    app: {
      id: channel.appId,
      title: listing?.title ?? app?.packageName ?? "App",
      packageName: app?.packageName ?? null,
      iconUrl: listing?.iconUrl ?? null,
    },
    releases: rows.map((r) => ({
      id: r.release.id,
      versionName: r.release.versionName,
      versionCode: r.release.versionCode,
      channel: r.release.channel,
      status: r.release.status,
      releaseNotes: r.release.releaseNotes,
      publishedAt: r.release.publishedAt,
      apkUrl: r.artifact?.fileUrl ?? null,
      apkSha256: r.artifact?.sha256 ?? null,
    })),
  });
});
