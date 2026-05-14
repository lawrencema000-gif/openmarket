import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  releaseArtifacts,
  releases,
} from "@openmarket/db/schema";
import { splitApkRequestSchema } from "@openmarket/contracts/aab";
import { db } from "../lib/db";
import {
  BundletoolNotConfiguredError,
  findCachedSplit,
  getBundletoolAdapter,
  recordGeneratedSplit,
} from "../lib/bundletool";
import type { Variables } from "../lib/types";

export const bundletoolRouter = new Hono<{ Variables: Variables }>();

/**
 * P3-G AAB endpoints.
 *
 *   POST /releases/:id/split-apk
 *     → Public. Caller is the OpenMarket installer running on a
 *       user's device. Body describes the device (abi, screenDensity,
 *       languages). Server checks for a cached split that matches;
 *       if none, invokes the bundletool adapter; returns the APK
 *       download pointer.
 *
 *       501 when the deploy has no bundletool driver configured.
 *       Storefront falls back to the parent AAB or the raw APK in
 *       that case — devs without bundletool support continue to
 *       distribute as APK.
 *
 *   GET  /releases/:id/artifacts
 *     → Public list of release_artifacts for a release. Includes
 *       artifactType + manifest so the storefront can pick the best
 *       split without invoking the bundletool path.
 */

bundletoolRouter.post(
  "/releases/:id/split-apk",
  zValidator("json", splitApkRequestSchema),
  async (c) => {
    const releaseId = c.req.param("id") as string;
    const request = c.req.valid("json");

    // The release must be published (or in staged rollout). We
    // DON'T expose split-APK generation for draft / review
    // releases — those go through the dev-portal download path.
    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
    });
    if (!release) {
      throw new HTTPException(404, { message: "Release not found" });
    }
    if (release.status !== "published" && release.status !== "staged_rollout") {
      throw new HTTPException(409, {
        message: `Release status is ${release.status} — split APKs are only generated for published / staged_rollout releases`,
      });
    }

    // Find a verified AAB parent on this release.
    const parents = await db
      .select()
      .from(releaseArtifacts)
      .where(
        and(
          eq(releaseArtifacts.releaseId, releaseId),
          eq(releaseArtifacts.artifactType, "aab"),
          eq(releaseArtifacts.uploadStatus, "verified"),
        ),
      );
    const parent = parents[0];
    if (!parent) {
      throw new HTTPException(404, {
        message: "No verified AAB on this release — generate splits from an AAB parent",
      });
    }

    // Cache hit?
    const cached = await findCachedSplit(parent.id, request);
    if (cached) {
      return c.json({
        artifactId: cached.id,
        cached: true,
        fileUrl: cached.fileUrl,
        sha256: cached.sha256,
        fileSize: cached.fileSize,
        manifest: cached.manifest,
      });
    }

    // Generate via adapter.
    const adapter = getBundletoolAdapter();
    try {
      const generated = await adapter.generateSplit({
        parentArtifactId: parent.id,
        parentBucket: parent.storageBucket,
        parentKey: parent.storageKey,
        request,
      });
      const id = await recordGeneratedSplit(releaseId, parent.id, generated);
      return c.json({
        artifactId: id,
        cached: false,
        fileUrl: generated.fileUrl,
        sha256: generated.sha256,
        fileSize: generated.fileSize,
        manifest: generated.manifest,
      }, 201);
    } catch (err) {
      if (err instanceof BundletoolNotConfiguredError) {
        throw new HTTPException(501, {
          message:
            "AAB split-APK generation isn't configured on this deploy. Use the raw APK fallback instead.",
        });
      }
      throw err;
    }
  },
);

/**
 * Public artifact list — both raw APK/AAB rows and any cached splits.
 * The storefront uses this to render "Available builds" + pick a
 * verified APK to link directly when no bundletool is configured.
 */
bundletoolRouter.get("/releases/:id/artifacts", async (c) => {
  const releaseId = c.req.param("id") as string;

  const rows = await db
    .select({
      id: releaseArtifacts.id,
      artifactType: releaseArtifacts.artifactType,
      parentArtifactId: releaseArtifacts.parentArtifactId,
      fileSize: releaseArtifacts.fileSize,
      sha256: releaseArtifacts.sha256,
      uploadStatus: releaseArtifacts.uploadStatus,
      manifest: releaseArtifacts.manifest,
      createdAt: releaseArtifacts.createdAt,
    })
    .from(releaseArtifacts)
    .where(eq(releaseArtifacts.releaseId, releaseId));

  return c.json({ releaseId, artifacts: rows });
});
