import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../lib/db";
import {
  apps,
  releases,
  releaseArtifacts,
  releaseEvents,
  developers,
  scanResults,
} from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { createReleaseSchema } from "@openmarket/contracts/apps";
import { completeUploadSchema } from "@openmarket/contracts/releases";
import { ingestQueue } from "../lib/queue";
import {
  buildArtifactKey,
  getSignedUploadUrl,
  getSignedDownloadUrl,
  headObject,
  isStorageConfigured,
  StorageNotConfiguredError,
} from "../lib/storage";
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

// Request a presigned upload URL for a release artifact.
// Body: { sha256, fileSize, artifactType?: "apk"|"aab" }
// Response: { artifactId, uploadUrl, bucket, key, expiresAt }
releasesRouter.post(
  "/releases/:id/upload-url",
  requireAuth,
  zValidator(
    "json",
    z.object({
      sha256: z.string().regex(/^[a-f0-9]{64}$/i, "must be a 64-char hex SHA256"),
      fileSize: z.number().int().positive().max(500 * 1024 * 1024, "max 500MB"),
      artifactType: z.enum(["apk", "aab"]).default("apk"),
    }),
  ),
  async (c) => {
    if (!isStorageConfigured()) {
      throw new HTTPException(503, {
        message:
          "Object storage is not configured on this server. Contact the operator.",
      });
    }

    const user = c.get("user");
    const releaseId = c.req.param("id");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });
    if (!developer) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    const release = (await db.query.releases.findFirst({
      where: eq(releases.id, releaseId as string),
      with: { app: true },
    })) as any;
    if (!release) {
      throw new HTTPException(404, { message: "Release not found" });
    }
    if (release.app.developerId !== developer.id) {
      throw new HTTPException(403, { message: "You do not own this release" });
    }

    const key = buildArtifactKey({
      appId: release.app.id,
      releaseId: release.id,
      sha256: body.sha256,
      artifactType: body.artifactType,
    });

    let signed;
    try {
      signed = await getSignedUploadUrl({
        bucket: "artifacts",
        key,
        contentType:
          body.artifactType === "aab"
            ? "application/octet-stream"
            : "application/vnd.android.package-archive",
        contentLength: body.fileSize,
        expiresInSeconds: 600,
      });
    } catch (err) {
      if (err instanceof StorageNotConfiguredError) {
        throw new HTTPException(503, { message: err.message });
      }
      throw err;
    }

    const [artifact] = await db
      .insert(releaseArtifacts)
      .values({
        releaseId: release.id,
        artifactType: body.artifactType,
        storageBucket: signed.bucket,
        storageKey: signed.key,
        fileUrl: `s3://${signed.bucket}/${signed.key}`,
        fileSize: body.fileSize,
        sha256: body.sha256.toLowerCase(),
        uploadStatus: "pending",
      })
      .returning();

    return c.json({
      artifactId: artifact!.id,
      uploadUrl: signed.url,
      bucket: signed.bucket,
      key: signed.key,
      expiresAt: signed.expiresAt.toISOString(),
    });
  },
);

// Generate a short-lived signed download URL for an artifact.
// Public-ish: requires auth (we'll loosen for the Android client via API token in P2-O).
releasesRouter.get(
  "/artifacts/:artifactId/download",
  requireAuth,
  async (c) => {
    if (!isStorageConfigured()) {
      throw new HTTPException(503, { message: "Object storage not configured" });
    }
    const artifactId = c.req.param("artifactId") as string;
    const artifact = await db.query.releaseArtifacts.findFirst({
      where: eq(releaseArtifacts.id, artifactId),
    });
    if (!artifact || !artifact.storageKey || !artifact.storageBucket) {
      throw new HTTPException(404, { message: "Artifact not found" });
    }
    if (artifact.uploadStatus !== "verified" && artifact.uploadStatus !== "uploaded") {
      throw new HTTPException(409, { message: "Artifact not yet available" });
    }

    const url = await getSignedDownloadUrl({
      bucket: "artifacts",
      key: artifact.storageKey,
      expiresInSeconds: 300,
      contentDisposition: `attachment; filename="${artifact.id}.${artifact.artifactType}"`,
    });

    return c.json({ url, expiresInSeconds: 300 });
  },
);

// Confirm an upload completed. Verifies the object landed in storage,
// matches the size we expected, and enqueues ingest+scan workers.
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

    const release = (await db.query.releases.findFirst({
      where: eq(releases.id, releaseId as string),
      with: { app: true },
    })) as any;
    if (!release) {
      throw new HTTPException(404, { message: "Release not found" });
    }
    if (release.app.developerId !== developer.id) {
      throw new HTTPException(403, { message: "You do not own this release" });
    }

    // Find the most recent pending artifact for this release.
    const artifact = await db.query.releaseArtifacts.findFirst({
      where: and(
        eq(releaseArtifacts.releaseId, releaseId),
        eq(releaseArtifacts.uploadStatus, "pending"),
      ),
    });
    if (!artifact) {
      throw new HTTPException(404, {
        message: "No pending artifact found for this release",
      });
    }

    // Verify object actually landed in storage (defense against client-side fakery).
    if (artifact.storageKey && artifact.storageBucket && isStorageConfigured()) {
      const head = await headObject({
        bucket: "artifacts",
        key: artifact.storageKey,
      });
      if (!head) {
        throw new HTTPException(409, {
          message:
            "Upload was not received by storage. Retry the upload before calling complete.",
        });
      }
      if (head.size !== body.fileSize) {
        throw new HTTPException(409, {
          message: `Storage size (${head.size}) does not match declared size (${body.fileSize})`,
        });
      }
    }

    const [updatedArtifact] = await db
      .update(releaseArtifacts)
      .set({
        fileSize: body.fileSize,
        sha256: body.sha256.toLowerCase(),
        uploadStatus: "uploaded",
        uploadedAt: new Date(),
      })
      .where(eq(releaseArtifacts.id, artifact.id))
      .returning();

    // Ingest worker takes over from here: parses APK, extracts manifest, runs scans.
    try {
      await ingestQueue.add("ingest", {
        releaseId: release.id,
        artifactId: updatedArtifact!.id,
        developerId: developer.id,
        storageBucket: updatedArtifact!.storageBucket,
        storageKey: updatedArtifact!.storageKey,
      });
    } catch (err) {
      // Non-fatal: release is saved; retry via admin tooling.
      console.error("Failed to enqueue ingest job:", err);
    }

    return c.json({ success: true, artifactId: updatedArtifact!.id });
  },
);

// Get release by ID (public). Includes the audit timeline so the
// dev-portal can render: uploaded → parsed → rejected/scanned/published.
releasesRouter.get("/releases/:id", async (c) => {
  const releaseId = c.req.param("id");

  const release = (await db.query.releases.findFirst({
    where: eq(releases.id, releaseId as string),
    with: {
      artifacts: true,
    },
  })) as any;

  if (!release) {
    throw new HTTPException(404, { message: "Release not found" });
  }

  const events = await db.query.releaseEvents.findMany({
    where: eq(releaseEvents.releaseId, releaseId as string),
    orderBy: [desc(releaseEvents.createdAt)],
    limit: 50,
  });

  const artifact = release.artifacts?.[0] ?? null;

  // Latest scan result for this artifact, if any (P1-J).
  let scan: {
    status: string;
    riskScore: number | null;
    band: string | null;
    summary: string | null;
    findings: unknown;
    completedAt: Date | null;
  } | null = null;
  if (artifact) {
    const [scanRow] = await db
      .select()
      .from(scanResults)
      .where(eq(scanResults.artifactId, artifact.id))
      .orderBy(desc(scanResults.completedAt))
      .limit(1);
    if (scanRow) {
      // Pull band off the latest "scan_complete" event details if present.
      const completeEvent = events.find((e) => e.eventType === "scan_complete");
      scan = {
        status: scanRow.status,
        riskScore: scanRow.riskScore,
        band: ((completeEvent?.details as { band?: string }) ?? null)?.band ?? null,
        summary: scanRow.summary,
        findings: scanRow.findings,
        completedAt: scanRow.completedAt,
      };
    }
  }

  const lastRejection = events.find((e) => e.eventType === "rejected");

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
    events,
    scan,
    rejectionReason: lastRejection
      ? {
          code: (lastRejection.details as any)?.code,
          reason: (lastRejection.details as any)?.reason,
          warnings: (lastRejection.details as any)?.warnings ?? [],
          at: lastRejection.createdAt,
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
