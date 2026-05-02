import { Job } from "bullmq";
import { and, desc, eq, ne } from "drizzle-orm";
import type { Database } from "@openmarket/db";
import {
  apps,
  artifactMetadata,
  permissionsDetected,
  releaseArtifacts,
  releaseEvents,
  releases,
} from "@openmarket/db";
import { extractApkMetadata } from "./apk-extractor.js";
import { inspectApkZip } from "./zip-inspect.js";
import { downloadArtifact } from "./storage.js";
import {
  type ApkInfo,
  checkRejectionRules,
  type PreviousRelease,
  type RejectionResult,
} from "./rejection-rules.js";

/**
 * Job payload sent by `services/api/src/routes/releases.ts → /complete`.
 *
 * `apkInfo` is an escape hatch for tests that pre-extract metadata.
 * In production, the worker downloads the artifact from storage and
 * extracts apkInfo itself.
 */
export interface IngestJobData {
  releaseId: string;
  artifactId: string;
  developerId: string;
  /** Storage location of the uploaded APK. Required for prod. */
  storageBucket?: string | null;
  storageKey?: string | null;
  /** Optional pre-extracted info — bypasses storage download for tests. */
  apkInfo?: Partial<ApkInfo> & {
    permissions?: string[];
    activities?: string[];
    services?: string[];
    receivers?: string[];
    providers?: string[];
    appLabel?: string;
    nativeLibs?: string[];
    minSdk?: number;
    targetSdk?: number;
  };
}

interface AcceptedResult {
  status: "accepted";
  artifactId: string;
  releaseId: string;
  warnings: RejectionResult["warnings"];
}
interface RejectedResult {
  status: "rejected";
  artifactId: string;
  releaseId: string;
  code: string;
  reason: string;
  warnings: RejectionResult["warnings"];
}
type IngestResult = AcceptedResult | RejectedResult;

export async function processIngestJob(
  job: Job<IngestJobData>,
  db: Database,
): Promise<IngestResult> {
  const { releaseId, artifactId, storageBucket, storageKey } = job.data;

  console.log(
    `[ingest-worker] job=${job.id} release=${releaseId} artifact=${artifactId}`,
  );

  const [artifact] = await db
    .select()
    .from(releaseArtifacts)
    .where(eq(releaseArtifacts.id, artifactId))
    .limit(1);
  if (!artifact) throw new Error(`Artifact ${artifactId} not found`);

  const [release] = await db
    .select()
    .from(releases)
    .where(eq(releases.id, releaseId))
    .limit(1);
  if (!release) throw new Error(`Release ${releaseId} not found`);

  const [app] = await db
    .select()
    .from(apps)
    .where(eq(apps.id, release.appId))
    .limit(1);
  if (!app) throw new Error(`App ${release.appId} not found`);

  // Previous release on the same app for sig/version checks.
  const [previous] = await db
    .select({
      versionCode: releases.versionCode,
      signingKeyFingerprint: artifactMetadata.signingKeyFingerprint,
    })
    .from(releases)
    .innerJoin(releaseArtifacts, eq(releaseArtifacts.releaseId, releases.id))
    .innerJoin(artifactMetadata, eq(artifactMetadata.artifactId, releaseArtifacts.id))
    .where(
      and(
        eq(releases.appId, app.id),
        ne(releases.id, releaseId),
        eq(releaseArtifacts.uploadStatus, "verified"),
      ),
    )
    .orderBy(desc(releases.versionCode))
    .limit(1);

  const previousRelease: PreviousRelease | undefined = previous
    ? {
        versionCode: previous.versionCode,
        signingKeyFingerprint: previous.signingKeyFingerprint,
      }
    : undefined;

  let apkInfo: ApkInfo;
  let extracted: Awaited<ReturnType<typeof extractApkMetadata>> | null = null;
  let cleanup: (() => Promise<void>) | null = null;

  if (job.data.apkInfo && job.data.apkInfo.packageName) {
    apkInfo = {
      hasValidSignature: job.data.apkInfo.hasValidSignature ?? true,
      hasManifest: job.data.apkInfo.hasManifest ?? true,
      packageName: job.data.apkInfo.packageName,
      isDebugBuild: job.data.apkInfo.isDebugBuild ?? false,
      fileSizeBytes: job.data.apkInfo.fileSizeBytes ?? artifact.fileSize,
      signingKeyFingerprint:
        job.data.apkInfo.signingKeyFingerprint ?? "test-fp",
      versionCode: job.data.apkInfo.versionCode ?? release.versionCode,
      abis: job.data.apkInfo.abis,
      channel: release.channel as "stable" | "beta" | "canary",
    };
  } else {
    if (!storageBucket || !storageKey) {
      throw new Error(
        "Job missing storageBucket/storageKey — can't locate APK to ingest",
      );
    }
    const dl = await downloadArtifact({
      bucket: storageBucket,
      key: storageKey,
    });
    cleanup = dl.cleanup;
    try {
      const [zip, parsed] = await Promise.all([
        inspectApkZip(dl.path),
        extractApkMetadata(dl.path),
      ]);
      extracted = { ...parsed, abis: zip.abis, nativeLibs: zip.nativeLibs };
      apkInfo = {
        // signing-key fingerprint + verified-signature both belong to the
        // scan-worker (P1-J runs apksigner). Until then we use weak hints
        // from the zip + a placeholder fingerprint derived from sha256.
        hasValidSignature: zip.hasMetaInfSignature,
        hasManifest: zip.hasManifest,
        packageName: parsed.packageName,
        isDebugBuild: parsed.isDebugBuild,
        fileSizeBytes: dl.size,
        signingKeyFingerprint: artifact.sha256.slice(0, 16),
        versionCode: parsed.versionCode,
        abis: zip.abis,
        channel: release.channel as "stable" | "beta" | "canary",
      };
    } catch (err) {
      await recordEvent(db, releaseId, "rejected", {
        code: "CORRUPTED_APK",
        reason: err instanceof Error ? err.message : "APK parser threw",
        artifactId,
      });
      await db
        .update(releaseArtifacts)
        .set({ uploadStatus: "rejected" })
        .where(eq(releaseArtifacts.id, artifactId));
      if (cleanup) await cleanup();
      return {
        status: "rejected",
        artifactId,
        releaseId,
        code: "CORRUPTED_APK",
        reason: err instanceof Error ? err.message : "APK parser threw",
        warnings: [],
      };
    }
  }

  const result = checkRejectionRules(apkInfo, app.packageName, previousRelease);

  if (result.rejected) {
    await recordEvent(db, releaseId, "rejected", {
      code: result.code,
      reason: result.reason,
      warnings: result.warnings,
      artifactId,
    });
    await db
      .update(releaseArtifacts)
      .set({ uploadStatus: "rejected" })
      .where(eq(releaseArtifacts.id, artifactId));
    await db
      .update(releases)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(releases.id, releaseId));

    if (cleanup) await cleanup();
    return {
      status: "rejected",
      artifactId,
      releaseId,
      code: result.code!,
      reason: result.reason!,
      warnings: result.warnings,
    };
  }

  // Accept: write metadata, permissions, mark verified, audit.
  if (extracted) {
    await db.insert(artifactMetadata).values({
      artifactId,
      minSdk: extracted.minSdk,
      targetSdk: extracted.targetSdk,
      abis: extracted.abis,
      nativeLibs: extracted.nativeLibs,
      appLabel: extracted.appLabel,
      isDebugBuild: extracted.isDebugBuild,
      signingKeyFingerprint: apkInfo.signingKeyFingerprint,
      components: {
        activities: extracted.activities,
        services: extracted.services,
        receivers: extracted.receivers,
        providers: extracted.providers,
      },
    });

    if (extracted.permissions.length > 0) {
      await db.insert(permissionsDetected).values(
        extracted.permissions.map((name) => ({
          artifactId,
          permissionName: name,
        })),
      );
    }
  }

  await db
    .update(releaseArtifacts)
    .set({ uploadStatus: "verified", uploadedAt: new Date() })
    .where(eq(releaseArtifacts.id, artifactId));

  await recordEvent(db, releaseId, "parsed", {
    artifactId,
    versionCode: apkInfo.versionCode,
    packageName: apkInfo.packageName,
    abis: apkInfo.abis,
    warnings: result.warnings,
  });

  if (cleanup) await cleanup();
  return {
    status: "accepted",
    artifactId,
    releaseId,
    warnings: result.warnings,
  };
}

async function recordEvent(
  db: Database,
  releaseId: string,
  eventType: string,
  details: unknown,
): Promise<void> {
  try {
    await db.insert(releaseEvents).values({
      releaseId,
      eventType,
      details: details as object,
    });
  } catch (err) {
    console.error(`[ingest-worker] failed to record release_event:`, err);
  }
}
