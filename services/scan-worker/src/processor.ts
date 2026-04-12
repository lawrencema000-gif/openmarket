import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { getRiskLevel } from "@openmarket/security-rules";
import { createDb, scanResults, releases } from "@openmarket/db";
import { analyzeStaticFindings, type StaticInput } from "./static-analyzer.js";

export interface ScanJobData {
  releaseId: string;
  artifactId: string;
  staticInput: StaticInput;
}

export async function processScanJob(job: Job<ScanJobData>): Promise<void> {
  const { releaseId, artifactId, staticInput } = job.data;

  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const db = createDb(connectionString);

  // Run static analysis
  const result = analyzeStaticFindings(staticInput);
  const riskLevel = getRiskLevel(result.riskScore);

  // Insert scan result
  await db.insert(scanResults).values({
    artifactId,
    scanType: "static",
    status: result.riskScore <= 30 ? "passed" : "flagged",
    riskScore: result.riskScore,
    findings: result.findings,
    startedAt: job.processedOn ? new Date(job.processedOn) : new Date(),
    completedAt: new Date(),
  });

  // Update release status based on risk level
  const newStatus = riskLevel === "auto_pass" ? "published" : "review";

  await db
    .update(releases)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(releases.id, releaseId));
}
