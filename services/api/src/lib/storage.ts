import { S3Client, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage abstraction for OpenMarket.
 *
 * Production:  Cloudflare R2 (S3-compatible, zero egress).
 * Local dev:   MinIO (S3-compatible, runs in Docker).
 *
 * Both use the same @aws-sdk/client-s3 — only env vars differ.
 *
 * Buckets:
 *   - artifacts: private, holds APK/AAB binaries. Access via short-lived signed URLs only.
 *   - media:     public-read, holds icons/screenshots/feature graphics. CDN-fronted.
 */

type StorageBucket = "artifacts" | "media";

interface StorageConfig {
  endpoint?: string;       // R2: https://<accountId>.r2.cloudflarestorage.com  | MinIO: http://localhost:9000
  region: string;          // R2: "auto" | MinIO: "us-east-1"
  accessKeyId: string;
  secretAccessKey: string;
  artifactsBucket: string;
  mediaBucket: string;
  publicBaseUrl?: string;  // CDN base URL for media (e.g., https://cdn.openmarket.app)
  forcePathStyle: boolean; // MinIO requires true; R2 supports both, virtual-host preferred
}

// Empty strings in .env should count as "not set" — `??` doesn't catch them.
const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

function loadConfig(): StorageConfig | null {
  const accessKeyId = env("R2_ACCESS_KEY_ID") ?? env("S3_ACCESS_KEY_ID");
  const secretAccessKey =
    env("R2_SECRET_ACCESS_KEY") ?? env("S3_SECRET_ACCESS_KEY");

  // No creds → storage disabled (graceful degradation for dev environments without object storage).
  if (!accessKeyId || !secretAccessKey) return null;

  const accountId = env("R2_ACCOUNT_ID");
  const explicitEndpoint = env("S3_ENDPOINT") ?? env("R2_ENDPOINT");
  const endpoint =
    explicitEndpoint ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  // MinIO heuristic: localhost endpoint → force path-style addressing (required by MinIO).
  const forcePathStyle = endpoint ? /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(endpoint) : false;

  return {
    endpoint,
    region: env("S3_REGION") ?? (accountId ? "auto" : "us-east-1"),
    accessKeyId,
    secretAccessKey,
    artifactsBucket: env("R2_BUCKET_ARTIFACTS") ?? "openmarket-artifacts",
    mediaBucket: env("R2_BUCKET_MEDIA") ?? "openmarket-media",
    publicBaseUrl: env("R2_PUBLIC_BASE_URL"),
    forcePathStyle,
  };
}

// Lazy: config + client are evaluated on first use, so tests / setup files
// can set env vars before storage is touched.
let cachedConfig: StorageConfig | null | undefined;
let cachedClient: S3Client | null | undefined;

function getConfig(): StorageConfig | null {
  if (cachedConfig === undefined) cachedConfig = loadConfig();
  return cachedConfig;
}

function getClient(): S3Client | null {
  if (cachedClient !== undefined) return cachedClient;
  const cfg = getConfig();
  cachedClient = cfg
    ? new S3Client({
        region: cfg.region,
        endpoint: cfg.endpoint,
        credentials: {
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        },
        forcePathStyle: cfg.forcePathStyle,
      })
    : null;
  return cachedClient;
}

/** Test-only: clear the cached config + client so the next call re-reads env. */
export function _resetStorageForTests(): void {
  cachedConfig = undefined;
  cachedClient = undefined;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Object storage is not configured. Set R2_* env vars (production) " +
        "or run `docker compose up minio` and set S3_* env vars (local).",
    );
    this.name = "StorageNotConfiguredError";
  }
}

function requireClient(): { client: S3Client; config: StorageConfig } {
  const client = getClient();
  const config = getConfig();
  if (!client || !config) throw new StorageNotConfiguredError();
  return { client, config };
}

function bucketName(bucket: StorageBucket, config: StorageConfig): string {
  return bucket === "artifacts" ? config.artifactsBucket : config.mediaBucket;
}

export interface SignedUploadUrl {
  url: string;
  bucket: string;
  key: string;
  expiresAt: Date;
}

/**
 * Generate a presigned PUT URL the browser can upload to directly.
 * Use for: APK uploads (browser → R2, no proxy through API).
 */
export async function getSignedUploadUrl(opts: {
  bucket: StorageBucket;
  key: string;
  contentType: string;
  contentLength?: number;
  expiresInSeconds?: number;
}): Promise<SignedUploadUrl> {
  const { client, config } = requireClient();
  const bucket = bucketName(opts.bucket, config);
  const expiresIn = opts.expiresInSeconds ?? 600; // 10 min default

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: opts.key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  return {
    url,
    bucket,
    key: opts.key,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

/**
 * Generate a short-lived presigned GET URL for downloading a private artifact.
 * Use for: APK installs from the Android client.
 */
export async function getSignedDownloadUrl(opts: {
  bucket: StorageBucket;
  key: string;
  expiresInSeconds?: number;
  contentDisposition?: string;
}): Promise<string> {
  const { client, config } = requireClient();
  const bucket = bucketName(opts.bucket, config);
  const expiresIn = opts.expiresInSeconds ?? 300; // 5 min default

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: opts.key,
    ResponseContentDisposition: opts.contentDisposition,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Resolve a public URL for a media object (icons, screenshots).
 * If R2_PUBLIC_BASE_URL is set, returns CDN URL. Otherwise returns the direct
 * S3-style URL (only useful for local dev with public MinIO bucket).
 */
export function getPublicMediaUrl(key: string): string {
  const cfg = getConfig();
  if (!cfg) throw new StorageNotConfiguredError();
  if (cfg.publicBaseUrl) {
    const base = cfg.publicBaseUrl.replace(/\/$/, "");
    return `${base}/${key}`;
  }
  // MinIO local fallback
  if (cfg.endpoint) {
    const base = cfg.endpoint.replace(/\/$/, "");
    return `${base}/${cfg.mediaBucket}/${key}`;
  }
  throw new Error("No public URL base configured for media bucket");
}

/**
 * Verify an object exists in storage and return its metadata (size, etag, contentType).
 * Used to confirm browser uploads landed before marking artifact as uploaded.
 */
export async function headObject(opts: {
  bucket: StorageBucket;
  key: string;
}): Promise<{ size: number; etag: string; contentType?: string } | null> {
  const { client, config } = requireClient();
  const bucket = bucketName(opts.bucket, config);

  try {
    const res = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: opts.key }),
    );
    return {
      size: res.ContentLength ?? 0,
      etag: (res.ETag ?? "").replace(/"/g, ""),
      contentType: res.ContentType,
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "$metadata" in err) {
      const md = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
      if (md?.httpStatusCode === 404) return null;
    }
    throw err;
  }
}

/**
 * Delete an object. Used by: artifact rejection, app delisting cleanup, GDPR data erasure.
 */
export async function deleteObject(opts: {
  bucket: StorageBucket;
  key: string;
}): Promise<void> {
  const { client, config } = requireClient();
  const bucket = bucketName(opts.bucket, config);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: opts.key }));
}

/**
 * Compose a deterministic, sortable storage key for an artifact.
 * Format: artifacts/{appId}/{releaseId}/{sha256-prefix}.apk
 *   - appId/releaseId give human-grokkable browsing in the dashboard
 *   - sha256-prefix prevents collisions if two artifacts share the same release
 */
export function buildArtifactKey(opts: {
  appId: string;
  releaseId: string;
  sha256: string;
  artifactType: "apk" | "aab";
}): string {
  const prefix = opts.sha256.slice(0, 16);
  return `artifacts/${opts.appId}/${opts.releaseId}/${prefix}.${opts.artifactType}`;
}

/**
 * Compose a deterministic key for an app media asset (icon, screenshot, feature graphic).
 * Format: apps/{appId}/{kind}/{contentHash}.{ext}
 *   - contentHash makes assets immutable: same image → same URL → infinite cache
 */
export function buildMediaKey(opts: {
  appId: string;
  kind: "icon" | "screenshot" | "feature-graphic" | "preview-poster";
  contentHash: string;
  ext: string;
}): string {
  return `apps/${opts.appId}/${opts.kind}/${opts.contentHash}.${opts.ext.replace(/^\./, "")}`;
}

export const isStorageConfigured = () => getClient() !== null;
