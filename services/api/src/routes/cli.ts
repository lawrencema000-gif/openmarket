import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { apps, releaseArtifacts, releases } from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireApiToken, requireScope } from "../middleware/api-token";
import {
  getSignedUploadUrl,
  isStorageConfigured,
  StorageNotConfiguredError,
  buildArtifactKey,
  headObject,
} from "../lib/storage";
import { ingestQueue } from "../lib/queue";
import { applyRolloutChange } from "./releases";
import type { Variables } from "../lib/types";

export const cliRouter = new Hono<{ Variables: Variables }>();

/**
 * POST /api/cli/releases
 *
 * Single-call CI upload-url request — minimum surface for a CLI to
 * use. Body shape mirrors what `pnpm release upload` would send:
 *   { packageName, versionCode, versionName, channel, releaseNotes?,
 *     sha256, fileSize }
 *
 * Returns the release ID + the presigned PUT URL + the artifact ID
 * the CLI will pass to /complete after the upload lands. Same
 * 3-step flow as the dev-portal, just initiated server-side from a
 * single payload.
 *
 * The CLI is responsible for:
 *   1. Hashing the APK (sha256, lowercase hex, 64 chars)
 *   2. POSTing to this endpoint
 *   3. PUT-ing the binary at uploadUrl with
 *      Content-Type: application/vnd.android.package-archive
 *   4. POSTing /api/cli/releases/:releaseId/complete with the
 *      same { sha256, fileSize }
 *
 * Auth: bearer API token with scope releases:write.
 */
cliRouter.post(
  "/cli/releases",
  requireApiToken,
  requireScope("releases:write"),
  zValidator(
    "json",
    z.object({
      packageName: z.string().min(1).max(255),
      versionCode: z.number().int().positive(),
      versionName: z.string().min(1).max(60),
      channel: z.enum(["stable", "beta", "canary"]).default("stable"),
      releaseNotes: z.string().max(8000).optional(),
      sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/i, "must be a 64-char hex SHA256"),
      fileSize: z.number().int().positive().max(500 * 1024 * 1024),
      artifactType: z.enum(["apk", "aab"]).default("apk"),
    }),
  ),
  async (c) => {
    if (!isStorageConfigured()) {
      throw new HTTPException(503, {
        message: "Object storage is not configured on this server",
      });
    }

    const developer = c.get("developer") as { id: string };
    const body = c.req.valid("json");

    // The token can only act on apps the owning developer owns.
    const app = await db.query.apps.findFirst({
      where: and(
        eq(apps.packageName, body.packageName),
        eq(apps.developerId, developer.id),
      ),
    });
    if (!app) {
      throw new HTTPException(404, {
        message: `No app with packageName "${body.packageName}" owned by this developer.`,
      });
    }

    // Idempotency-ish: if the developer already has a draft release
    // for this exact (app, versionCode, channel) we reuse it instead
    // of creating a duplicate. This makes CI retries safe.
    const existingDraft = await db.query.releases.findFirst({
      where: and(
        eq(releases.appId, app.id),
        eq(releases.versionCode, body.versionCode),
        eq(releases.channel, body.channel),
      ),
    });

    let releaseId: string;
    if (existingDraft) {
      if (existingDraft.status !== "draft" && existingDraft.status !== "scanning") {
        throw new HTTPException(409, {
          message: `Release v${body.versionCode} on ${body.channel} already exists with status="${existingDraft.status}". Bump versionCode.`,
        });
      }
      releaseId = existingDraft.id;
    } else {
      const [release] = await db
        .insert(releases)
        .values({
          appId: app.id,
          versionCode: body.versionCode,
          versionName: body.versionName,
          channel: body.channel,
          releaseNotes: body.releaseNotes ?? null,
          status: "draft",
        })
        .returning();
      releaseId = release!.id;
    }

    // Mint the presigned PUT URL.
    let signed;
    try {
      const key = buildArtifactKey({
        appId: app.id,
        releaseId,
        sha256: body.sha256,
        artifactType: body.artifactType,
      });
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

    // Pre-create the artifact row so /complete can find it. Same
    // shape the dev-portal upload-url path uses.
    const [artifact] = await db
      .insert(releaseArtifacts)
      .values({
        releaseId,
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
      releaseId,
      artifactId: artifact!.id,
      uploadUrl: signed.url,
      bucket: signed.bucket,
      key: signed.key,
      expiresAt: signed.expiresAt.toISOString(),
      // Echo back the convention so the CLI can validate before PUT.
      contentType:
        body.artifactType === "aab"
          ? "application/octet-stream"
          : "application/vnd.android.package-archive",
    });
  },
);

/**
 * POST /api/cli/releases/:releaseId/complete
 *
 * Mirrors the dev-portal /releases/:id/complete flow but with API
 * token auth. Verifies the binary actually landed in storage at the
 * expected size, marks the artifact uploaded, and enqueues the
 * ingest worker.
 *
 * Body: { sha256, fileSize } — same as the dev-portal endpoint, kept
 * separate so the dev-portal route doesn't have to widen its auth
 * surface to API tokens.
 */
cliRouter.post(
  "/cli/releases/:releaseId/complete",
  requireApiToken,
  requireScope("releases:write"),
  zValidator(
    "json",
    z.object({
      sha256: z.string().regex(/^[a-f0-9]{64}$/i),
      fileSize: z.number().int().positive().max(500 * 1024 * 1024),
    }),
  ),
  async (c) => {
    const releaseId = c.req.param("releaseId") as string;
    const body = c.req.valid("json");
    const developer = c.get("developer") as { id: string };

    // Ownership check: the release's app must belong to the token's
    // developer.
    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
      with: { app: true },
    });
    if (!release || (release.app as { developerId: string }).developerId !== developer.id) {
      throw new HTTPException(404, {
        message: "Release not found or not owned by this developer",
      });
    }

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

    // Verify object actually landed in storage.
    if (artifact.storageKey && artifact.storageBucket && isStorageConfigured()) {
      const head = await headObject({
        bucket: "artifacts",
        key: artifact.storageKey,
      });
      if (!head) {
        throw new HTTPException(409, {
          message:
            "Upload was not received by storage. Retry the PUT before calling complete.",
        });
      }
      if (head.size !== body.fileSize) {
        throw new HTTPException(409, {
          message: `Storage size (${head.size}) does not match declared size (${body.fileSize})`,
        });
      }
    }

    const [updated] = await db
      .update(releaseArtifacts)
      .set({
        fileSize: body.fileSize,
        sha256: body.sha256.toLowerCase(),
        uploadStatus: "uploaded",
        uploadedAt: new Date(),
      })
      .where(eq(releaseArtifacts.id, artifact.id))
      .returning();

    try {
      await ingestQueue.add("ingest", {
        releaseId,
        artifactId: updated!.id,
        developerId: developer.id,
        storageBucket: updated!.storageBucket,
        storageKey: updated!.storageKey,
      });
    } catch (err) {
      console.error("[cli] ingest enqueue failed:", err);
    }

    return c.json({
      success: true,
      releaseId,
      artifactId: updated!.id,
      // The CLI polls /api/releases/:id (no auth required for read)
      // for the band + findings outcome.
      pollUrl: `/api/releases/${releaseId}`,
    });
  },
);

/**
 * PATCH /api/cli/releases/:id/rollout
 *
 * CI-driven rollout control. Same semantics as
 * /releases/:id/rollout (dev-portal) — different auth path.
 *
 * Common usage from a CI runner:
 *   1. Pipeline kicks a new release at percentage=10
 *   2. Synthetic monitoring observes for 30 min, asserts crash-free
 *   3. Pipeline ramps to 50, then 100
 *   4. If a SEV-1 fires anywhere in the chain, the same pipeline
 *      hits this endpoint with { status: "halted", reason: "..." }
 *
 * The `halt` path is the load-bearing one — it's why scrape C4 made
 * "halt-rollout-via-API" a top-5 priority gap. Without it, ops teams
 * are stuck doing emergency rollouts via the dashboard at 3am.
 */
cliRouter.patch(
  "/cli/releases/:id/rollout",
  requireApiToken,
  requireScope("releases:write"),
  zValidator(
    "json",
    z.object({
      percentage: z.number().int().min(1).max(100).optional(),
      status: z.enum(["live", "paused", "halted", "completed"]).optional(),
      reason: z.string().max(500).optional(),
    }),
  ),
  async (c) => {
    const releaseId = c.req.param("id") as string;
    const body = c.req.valid("json");
    const developer = c.get("developer") as { id: string };

    const result = await applyRolloutChange({
      releaseId,
      developerId: developer.id,
      patch: body,
    });
    return c.json(result);
  },
);
