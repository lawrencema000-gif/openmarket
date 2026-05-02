import { Job } from "bullmq";
import { and, eq, ne } from "drizzle-orm";
import type { Database } from "@openmarket/db";
import {
  apps,
  artifactMetadata,
  permissionsDetected,
  releaseArtifacts,
  releaseEvents,
  releases,
  scanResults,
  signingKeys,
} from "@openmarket/db";
import { runScan, type ScanBand, type ScanResult } from "./scanner.js";

export interface ScanJobData {
  releaseId: string;
  artifactId: string;
}

export interface ProcessedScanResult {
  status: "completed" | "skipped";
  releaseId: string;
  artifactId: string;
  result?: ScanResult;
  newReleaseStatus?: string;
}

/**
 * Orchestrate the security scan for a single artifact.
 *
 * Reads the artifact + metadata + permissions written by the ingest
 * worker, plus context for repackaging detection (sibling apps with the
 * same packageName) and signing-key sanity (developer's registered keys),
 * then writes a scan_results row + advances the release status:
 *   auto_pass / review / high_risk → release.status = "review"
 *                                    (admin reviews high_risk; auto_pass
 *                                    promotes immediately in P2 once we
 *                                    add the autopromote cron)
 *   block                          → release.status = "draft", artifact
 *                                    rejected
 */
export async function processScanJob(
  job: Job<ScanJobData>,
  db: Database,
): Promise<ProcessedScanResult> {
  const { releaseId, artifactId } = job.data;

  console.log(`[scan-worker] job=${job.id} release=${releaseId} artifact=${artifactId}`);

  // 1. Pull the artifact + its parsed metadata.
  const [artifact] = await db
    .select()
    .from(releaseArtifacts)
    .where(eq(releaseArtifacts.id, artifactId))
    .limit(1);
  if (!artifact) {
    throw new Error(`Artifact ${artifactId} not found`);
  }
  if (artifact.uploadStatus !== "verified") {
    console.log(
      `[scan-worker] artifact ${artifactId} is not verified (status=${artifact.uploadStatus}); skipping scan`,
    );
    return { status: "skipped", releaseId, artifactId };
  }

  const [metadata] = await db
    .select()
    .from(artifactMetadata)
    .where(eq(artifactMetadata.artifactId, artifactId))
    .limit(1);
  if (!metadata) {
    throw new Error(`Artifact ${artifactId} has no metadata; ingest must run first`);
  }

  // 2. Pull release + app for context.
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

  // 3. Pull the permissions we recorded in ingest.
  const permRows = await db
    .select({ name: permissionsDetected.permissionName })
    .from(permissionsDetected)
    .where(eq(permissionsDetected.artifactId, artifactId));
  const permissions = permRows.map((p) => p.name);

  // 4. Developer's registered signing-key fingerprints.
  const devKeys = await db
    .select({ fp: signingKeys.fingerprintSha256 })
    .from(signingKeys)
    .where(
      and(
        eq(signingKeys.developerId, app.developerId),
        eq(signingKeys.isActive, true),
      ),
    );
  const developerRegisteredFingerprints = devKeys.map((k) => k.fp);

  // 5. Repackaging detection: any other app on the platform that shares
  // our packageName but lives under a different developer/signing key.
  // Join apps → artifactMetadata via releaseArtifacts to get the
  // observed signing fingerprint of the sibling app's most recent
  // verified artifact.
  const conflictRows = await db
    .select({
      appId: apps.id,
      developerId: apps.developerId,
      signingFingerprint: artifactMetadata.signingKeyFingerprint,
    })
    .from(apps)
    .innerJoin(releaseArtifacts, eq(releaseArtifacts.releaseId, releases.id))
    .innerJoin(releases, eq(releases.appId, apps.id))
    .innerJoin(
      artifactMetadata,
      eq(artifactMetadata.artifactId, releaseArtifacts.id),
    )
    .where(
      and(
        eq(apps.packageName, app.packageName),
        ne(apps.id, app.id),
        eq(releaseArtifacts.uploadStatus, "verified"),
      ),
    );

  // 6. Run the scanner.
  const result = runScan({
    permissions,
    abis: metadata.abis ?? [],
    nativeLibs: metadata.nativeLibs ?? [],
    nativeLibSha256s: [], // upgraded when scan-worker hashes lib/*.so itself
    isDebugBuild: metadata.isDebugBuild,
    observedSigningFingerprint: metadata.signingKeyFingerprint,
    developerRegisteredFingerprints,
    conflictingPackageNameApps: conflictRows.map((c) => ({
      appId: c.appId,
      developerId: c.developerId,
      signingFingerprint: c.signingFingerprint,
    })),
    selfPackageName: app.packageName,
    selfDeveloperId: app.developerId,
  });

  // 7. Persist scan_results.
  const scanStatusForBand: Record<ScanBand, "passed" | "flagged" | "failed"> = {
    auto_pass: "passed",
    review: "flagged",
    high_risk: "flagged",
    block: "failed",
  };

  await db.insert(scanResults).values({
    artifactId,
    scanType: "static",
    status: scanStatusForBand[result.band],
    riskScore: result.riskScore,
    findings: result.findings as unknown as object,
    summary: result.summary,
    startedAt: job.processedOn ? new Date(job.processedOn) : new Date(),
    completedAt: new Date(),
  });

  // 8. Advance release status based on band.
  let newReleaseStatus: string;
  if (result.band === "block") {
    newReleaseStatus = "draft";
    await db
      .update(releaseArtifacts)
      .set({ uploadStatus: "rejected" })
      .where(eq(releaseArtifacts.id, artifactId));
  } else {
    // auto_pass + review + high_risk all land in "review" for v1; an
    // autopromote cron in P2 will move auto_pass straight to "published".
    newReleaseStatus = "review";
  }

  await db
    .update(releases)
    .set({ status: newReleaseStatus as never, updatedAt: new Date() })
    .where(eq(releases.id, releaseId));

  // 9. Audit event.
  try {
    await db.insert(releaseEvents).values({
      releaseId,
      eventType: result.band === "block" ? "rejected" : "scan_complete",
      details: {
        artifactId,
        riskScore: result.riskScore,
        band: result.band,
        summary: result.summary,
        findingCount: result.findings.length,
      },
    });
  } catch (err) {
    console.error("[scan-worker] failed to write release_event:", err);
  }

  return {
    status: "completed",
    releaseId,
    artifactId,
    result,
    newReleaseStatus,
  };
}
