// S3-compatible storage download for the ingest worker.
//
// Mirror of services/api/src/lib/storage.ts on the read side. Workers
// don't issue presigned URLs — they download artifacts directly to a
// local tempfile, parse them, and clean up.
//
// Same env shape: REDIS_URL/R2_* in production (Cloudflare R2), S3_*
// locally (MinIO). Empty strings count as unset.

import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

interface StorageConfig {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

let cachedClient: S3Client | null | undefined;

function getClient(): S3Client | null {
  if (cachedClient !== undefined) return cachedClient;
  const accessKeyId = env("R2_ACCESS_KEY_ID") ?? env("S3_ACCESS_KEY_ID");
  const secretAccessKey =
    env("R2_SECRET_ACCESS_KEY") ?? env("S3_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) {
    cachedClient = null;
    return null;
  }
  const accountId = env("R2_ACCOUNT_ID");
  const explicitEndpoint = env("S3_ENDPOINT") ?? env("R2_ENDPOINT");
  const endpoint =
    explicitEndpoint ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const forcePathStyle = endpoint
    ? /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(endpoint)
    : false;
  const region = env("S3_REGION") ?? (accountId ? "auto" : "us-east-1");

  const cfg: StorageConfig = {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
  };

  cachedClient = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: cfg.forcePathStyle,
  });
  return cachedClient;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Worker storage not configured. Set R2_*/S3_* env vars.");
    this.name = "StorageNotConfiguredError";
  }
}

/**
 * Download an artifact from object storage to a local temp file.
 * Returns the path; caller is responsible for cleanup (use cleanupTempDir).
 *
 * Uses streaming so we never hold the full APK in memory. Important — APKs
 * can be 500MB.
 */
export async function downloadArtifact(opts: {
  bucket: string;
  key: string;
  /** Optional cap; defaults to 600 MB so we always reject before disk fills. */
  maxBytes?: number;
}): Promise<{ path: string; cleanup: () => Promise<void>; size: number }> {
  const client = getClient();
  if (!client) throw new StorageNotConfiguredError();

  const head = await client.send(
    new HeadObjectCommand({ Bucket: opts.bucket, Key: opts.key }),
  );
  const size = head.ContentLength ?? 0;
  const cap = opts.maxBytes ?? 600 * 1024 * 1024;
  if (size > cap) {
    throw new Error(
      `Artifact size ${size} exceeds worker cap ${cap}. Storage must reject upstream.`,
    );
  }

  const tmpRoot = await mkdir(join(tmpdir(), `om-ingest-${Date.now()}-${Math.random().toString(36).slice(2)}`), {
    recursive: true,
  });
  const dir = tmpRoot ?? "";
  const filePath = join(dir, "artifact.apk");

  const obj = await client.send(
    new GetObjectCommand({ Bucket: opts.bucket, Key: opts.key }),
  );
  const body = obj.Body;
  if (!body) {
    throw new Error("Storage GET returned empty body");
  }

  // Body is a Readable in Node runtime. Stream to disk.
  await pipeline(body as Readable, createWriteStream(filePath));

  return {
    path: filePath,
    size,
    cleanup: async () => {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
    },
  };
}
