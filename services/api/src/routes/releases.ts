import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db";
import { apps, releases, releaseArtifacts, developers } from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { createReleaseSchema } from "@openmarket/contracts/apps";
import { completeUploadSchema } from "@openmarket/contracts/releases";
import { ingestQueue } from "../lib/queue";
import type { Variables } from "../lib/types";

export const releasesRouter = new Hono<{ Variables: Variables }>();

// Create draft release
releasesRouter.post(
  "/releases",
  requireAuth,
  zValidator("json", createReleaseSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    // Verify app ownership
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, body.appId),
    });

    if (!app) {
      throw new HTTPException(404, { message: "App not found" });
    }

    if (app.developerId !== developer.id) {
      throw new HTTPException(403, {
        message: "You do not own this app",
      });
    }

    const [release] = await db
      .insert(releases)
      .values({
        appId: body.appId,
        versionCode: body.versionCode,
        versionName: body.versionName,
        channel: body.channel,
        releaseNotes: body.releaseNotes,
      })
      .returning();

    return c.json(release, 201);
  }
);

// Get upload URL for a release
releasesRouter.post("/releases/:id/upload-url", requireAuth, async (c) => {
  const user = c.get("user");
  const releaseId = c.req.param("id");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId as string),
    with: {
      app: true,
    },
  }) as any;

  if (!release) {
    throw new HTTPException(404, { message: "Release not found" });
  }

  if (release.app.developerId !== developer.id) {
    throw new HTTPException(403, { message: "You do not own this release" });
  }

  // Create artifact record (placeholder upload URL)
  const [artifact] = await db
    .insert(releaseArtifacts)
    .values({
      releaseId: release.id,
      artifactType: "apk",
      fileUrl: `pending://${release.id}`,
      fileSize: 0,
      sha256: "0".repeat(64),
      uploadStatus: "pending",
    })
    .returning();

  const uploadUrl = `https://storage.openmarket.example/uploads/${artifact!.id}`;

  return c.json({ uploadUrl, artifactId: artifact!.id });
});

// Complete upload
releasesRouter.post(
  "/releases/:id/complete",
  requireAuth,
  zValidator("json", completeUploadSchema),
  async (c) => {
    const user = c.get("user");
    const releaseId = c.req.param("id");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId as string),
      with: {
        app: true,
      },
    }) as any;

    if (!release) {
      throw new HTTPException(404, { message: "Release not found" });
    }

    if (release.app.developerId !== developer.id) {
      throw new HTTPException(403, { message: "You do not own this release" });
    }

    // Find the pending artifact
    const artifact = await db.query.releaseArtifacts.findFirst({
      where: eq(releaseArtifacts.releaseId, releaseId),
    });

    if (!artifact) {
      throw new HTTPException(404, { message: "No artifact found for this release" });
    }

    // Update artifact with real data
    const [updatedArtifact] = await db
      .update(releaseArtifacts)
      .set({
        fileSize: body.fileSize,
        sha256: body.sha256,
        uploadStatus: "uploaded",
        uploadedAt: new Date(),
      })
      .where(eq(releaseArtifacts.id, artifact.id))
      .returning();

    // Enqueue ingest job
    await ingestQueue.add("ingest", {
      releaseId: release.id,
      artifactId: updatedArtifact!.id,
      developerId: developer.id,
    });

    return c.json({ success: true, artifactId: updatedArtifact!.id });
  }
);

// Get release by ID (public)
releasesRouter.get("/releases/:id", async (c) => {
  const releaseId = c.req.param("id");

  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId as string),
    with: {
      artifacts: true,
    },
  }) as any;

  if (!release) {
    throw new HTTPException(404, { message: "Release not found" });
  }

  const artifact = release.artifacts?.[0] ?? null;

  return c.json({
    ...release,
    artifact: artifact
      ? {
          id: artifact.id,
          fileSize: artifact.fileSize,
          sha256: artifact.sha256,
          uploadStatus: artifact.uploadStatus,
        }
      : null,
  });
});

// List releases for app (public)
releasesRouter.get("/apps/:appId/releases", async (c) => {
  const appId = c.req.param("appId");

  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
  });

  if (!app) {
    throw new HTTPException(404, { message: "App not found" });
  }

  const appReleases = await db.query.releases.findMany({
    where: eq(releases.appId, appId),
  });

  return c.json(appReleases);
});

// Cancel draft release
releasesRouter.delete("/releases/:id", requireAuth, async (c) => {
  const releaseId = c.req.param("id") as string;
  const user = c.get("user");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });
  if (!developer) throw new HTTPException(404, { message: "Developer not found" });

  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
  }) as any;

  if (!release || release.status !== "draft") {
    throw new HTTPException(400, { message: "Can only cancel draft releases" });
  }

  // Verify ownership through app
  const app = await db.query.apps.findFirst({
    where: and(eq(apps.id, release.appId), eq(apps.developerId, developer.id)),
  });
  if (!app) throw new HTTPException(403, { message: "Not your app" });

  await db.delete(releases).where(eq(releases.id, releaseId));

  return c.json({ success: true });
});
