import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { Database } from "@openmarket/db";
import { releaseArtifacts, releases } from "@openmarket/db";

export interface IngestJobData {
  releaseId: string;
  artifactId: string;
  developerId: string;
  packageName: string;
}

export async function processIngestJob(
  job: Job<IngestJobData>,
  db: Database
): Promise<void> {
  const { releaseId, artifactId } = job.data;

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

  // Mark artifact as verified
  await db
    .update(releaseArtifacts)
    .set({
      uploadStatus: "verified",
      uploadedAt: new Date(),
    })
    .where(eq(releaseArtifacts.id, artifactId));

  // Advance release status to "scanning"
  await db
    .update(releases)
    .set({ status: "scanning", updatedAt: new Date() })
    .where(eq(releases.id, releaseId));

  console.log(
    `[ingest-worker] Job ${job.id} complete — artifact verified, release ${releaseId} → scanning`
  );
}
