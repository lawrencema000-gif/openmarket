import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { Database } from "@openmarket/db";
import { releaseArtifacts, releases, artifactMetadata, permissionsDetected } from "@openmarket/db";
import { checkRejectionRules } from "./rejection-rules.js";

export interface IngestJobData {
  releaseId: string;
  artifactId: string;
  developerId: string;
  packageName: string;
  // APK metadata (provided by upload completion or extracted)
  apkInfo?: {
    extractedPackageName: string;
    versionCode: number;
    isDebugBuild: boolean;
    signingKeyFingerprint: string;
    isSignatureValid: boolean;
    fileSizeBytes: number;
    hasManifest: boolean;
    permissions: string[];
    minSdk: number;
    targetSdk: number;
    appLabel: string;
  };
}

export async function processIngestJob(
  job: Job<IngestJobData>,
  db: Database
): Promise<{ success: boolean; reason?: string }> {
  const { releaseId, artifactId, packageName, apkInfo } = job.data;

  console.log(`[ingest-worker] Processing job ${job.id} — artifact ${artifactId}, release ${releaseId}`);

  // Look up artifact
  const [artifact] = await db
    .select()
    .from(releaseArtifacts)
    .where(eq(releaseArtifacts.id, artifactId))
    .limit(1);

  if (!artifact) {
    throw new Error(`Artifact ${artifactId} not found`);
  }

  // Look up release
  const [release] = await db
    .select()
    .from(releases)
    .where(eq(releases.id, releaseId))
    .limit(1);

  if (!release) {
    throw new Error(`Release ${releaseId} not found`);
  }

  // If apkInfo is provided, run rejection rules
  if (apkInfo) {
    const apkForRules = {
      hasValidSignature: apkInfo.isSignatureValid,
      hasManifest: apkInfo.hasManifest,
      packageName: apkInfo.extractedPackageName,
      isDebugBuild: apkInfo.isDebugBuild,
      fileSizeBytes: apkInfo.fileSizeBytes,
      signingKeyFingerprint: apkInfo.signingKeyFingerprint,
      versionCode: apkInfo.versionCode,
    };

    const result = checkRejectionRules(apkForRules, packageName);

    if (result.rejected) {
      // Mark artifact as rejected
      await db
        .update(releaseArtifacts)
        .set({ uploadStatus: "rejected", uploadedAt: new Date() })
        .where(eq(releaseArtifacts.id, artifactId));

      // Revert release back to draft
      await db
        .update(releases)
        .set({ status: "draft", updatedAt: new Date() })
        .where(eq(releases.id, releaseId));

      console.log(
        `[ingest-worker] Job ${job.id} — artifact ${artifactId} rejected: ${result.reason}`
      );

      return { success: false, reason: result.reason };
    }

    // Passed — store metadata in artifact_metadata
    await db.insert(artifactMetadata).values({
      artifactId,
      minSdk: apkInfo.minSdk,
      targetSdk: apkInfo.targetSdk,
      appLabel: apkInfo.appLabel,
      isDebugBuild: apkInfo.isDebugBuild,
      signingKeyFingerprint: apkInfo.signingKeyFingerprint,
    });

    // Store permissions in permissions_detected
    if (apkInfo.permissions.length > 0) {
      await db.insert(permissionsDetected).values(
        apkInfo.permissions.map((permissionName) => ({
          artifactId,
          permissionName,
          isDangerous: false,
          isNewSincePrevious: false,
        }))
      );
    }

    // Mark artifact as verified
    await db
      .update(releaseArtifacts)
      .set({ uploadStatus: "verified", uploadedAt: new Date() })
      .where(eq(releaseArtifacts.id, artifactId));

    // Advance release to scanning
    await db
      .update(releases)
      .set({ status: "scanning", updatedAt: new Date() })
      .where(eq(releases.id, releaseId));

    console.log(
      `[ingest-worker] Job ${job.id} complete — artifact verified, release ${releaseId} → scanning`
    );

    return { success: true };
  }

  // Fallback: no apkInfo — just mark as verified (for manual testing)
  await db
    .update(releaseArtifacts)
    .set({
      uploadStatus: "verified",
      uploadedAt: new Date(),
    })
    .where(eq(releaseArtifacts.id, artifactId));

  await db
    .update(releases)
    .set({ status: "scanning", updatedAt: new Date() })
    .where(eq(releases.id, releaseId));

  console.log(
    `[ingest-worker] Job ${job.id} complete — artifact verified (no apkInfo), release ${releaseId} → scanning`
  );

  return { success: true };
}
