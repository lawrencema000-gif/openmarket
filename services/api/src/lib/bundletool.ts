import { and, eq } from "drizzle-orm";
import {
  releaseArtifacts,
} from "@openmarket/db/schema";
import type {
  SplitApkManifest,
  SplitApkRequest,
} from "@openmarket/contracts/aab";
import { db } from "./db";

/**
 * BundletoolAdapter — P3-G integration seam.
 *
 * Production implementations call the Bundletool JAR (or a wrapper
 * service) to convert an AAB plus a device descriptor into a slim
 * split-APK set, then upload the resulting APK to object storage and
 * return its bucket/key/sha. The API persists a child row in
 * release_artifacts with parentArtifactId set + manifest carrying
 * the targeting descriptor + the storage pointer.
 *
 * v1 ships the NoopBundletoolAdapter (returns "not implemented") so
 * the endpoint surfaces a 501 cleanly without crashing. Real
 * implementations swap in via WEB_BUNDLETOOL_DRIVER env (see
 * scripts/perf for the analogous pattern in push).
 */

export interface GeneratedSplitApk {
  storageBucket: string;
  storageKey: string;
  fileUrl: string;
  fileSize: number;
  sha256: string;
  manifest: SplitApkManifest;
}

export interface BundletoolAdapter {
  name(): string;
  /**
   * Generate a device-specific APK from a parent AAB.
   *
   * Throws an Error subclass when bundletool is not configured in
   * this deploy; the route maps that to HTTP 501.
   */
  generateSplit(args: {
    parentArtifactId: string;
    parentBucket: string | null;
    parentKey: string | null;
    request: SplitApkRequest;
  }): Promise<GeneratedSplitApk>;
}

export class BundletoolNotConfiguredError extends Error {
  constructor() {
    super("Bundletool driver is not configured on this deploy");
    this.name = "BundletoolNotConfiguredError";
  }
}

export class NoopBundletoolAdapter implements BundletoolAdapter {
  name() {
    return "noop";
  }
  async generateSplit(): Promise<GeneratedSplitApk> {
    throw new BundletoolNotConfiguredError();
  }
}

let driverSingleton: BundletoolAdapter | null = null;

export function getBundletoolAdapter(): BundletoolAdapter {
  if (driverSingleton) return driverSingleton;
  const which = (process.env.WEB_BUNDLETOOL_DRIVER ?? "noop").toLowerCase();
  if (which === "noop") {
    driverSingleton = new NoopBundletoolAdapter();
    return driverSingleton;
  }
  // Future: dynamic import of a bundletool-backed adapter. Until
  // then, an unrecognized driver name should fail loudly during
  // boot rather than silently fall back.
  throw new Error(`Unknown WEB_BUNDLETOOL_DRIVER=${which}`);
}

/** Test seam — clear cached adapter between tests. */
export function resetBundletoolAdapter(): void {
  driverSingleton = null;
}

/**
 * Look up an already-generated split that matches a device request.
 * Used by the storefront BEFORE invoking the adapter — if a previous
 * device asked for the same descriptor we hand back the cached split
 * rather than re-running bundletool.
 *
 * Matching uses exact equality on abi + density, and "any-overlap"
 * on languages (a split that includes "en" or "en-US" satisfies a
 * request for either).
 */
export async function findCachedSplit(
  parentArtifactId: string,
  request: SplitApkRequest,
): Promise<typeof releaseArtifacts.$inferSelect | undefined> {
  const siblings = await db
    .select()
    .from(releaseArtifacts)
    .where(
      and(
        eq(releaseArtifacts.parentArtifactId, parentArtifactId),
        eq(releaseArtifacts.artifactType, "apk"),
        eq(releaseArtifacts.uploadStatus, "verified"),
      ),
    );

  return siblings.find((row) => {
    const m = (row.manifest ?? {}) as SplitApkManifest;
    if (m.abi !== request.abi) return false;
    if (m.screenDensity !== request.screenDensity) return false;
    const langs = m.languages ?? [];
    return request.languages.some((req) =>
      langs.some(
        (have) =>
          have.toLowerCase() === req.toLowerCase() ||
          have.toLowerCase().startsWith(`${req.toLowerCase()}-`) ||
          req.toLowerCase().startsWith(`${have.toLowerCase()}-`),
      ),
    );
  });
}

/**
 * Persist a generated split as a child release_artifacts row pointing
 * back at the parent AAB. Returns the new row id.
 */
export async function recordGeneratedSplit(
  releaseId: string,
  parentArtifactId: string,
  generated: GeneratedSplitApk,
): Promise<string> {
  const [row] = await db
    .insert(releaseArtifacts)
    .values({
      releaseId,
      artifactType: "apk",
      parentArtifactId,
      manifest: generated.manifest,
      storageBucket: generated.storageBucket,
      storageKey: generated.storageKey,
      fileUrl: generated.fileUrl,
      fileSize: generated.fileSize,
      sha256: generated.sha256,
      uploadStatus: "verified",
      uploadedAt: new Date(),
    })
    .returning({ id: releaseArtifacts.id });
  return row!.id;
}
