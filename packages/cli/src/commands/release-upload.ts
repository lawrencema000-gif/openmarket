import { createReadStream, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

export interface ReleaseUploadOpts {
  apk: string;
  package: string;
  versionCode: number;
  versionName: string;
  channel: string;
  notes?: string;
  apiUrl: string;
  token?: string;
}

/**
 * `openmarket release upload` — three-step CI upload that mirrors the
 * dev-portal flow:
 *   1. POST /api/cli/releases  → creates the release row, mints a
 *      presigned PUT URL, pre-creates the artifact row.
 *   2. PUT to that URL with the APK as the request body.
 *   3. POST /api/cli/releases/:id/complete → API HEADs storage to
 *      verify size match, marks the artifact uploaded, enqueues the
 *      ingest worker.
 *
 * Returns when /complete succeeds. Polling for the final scan band
 * + outcome is left to the caller (CI scripts can poll
 * `${apiUrl}/api/releases/<id>` directly — no auth required for read).
 */
export async function releaseUpload(opts: ReleaseUploadOpts): Promise<void> {
  if (!opts.token) {
    throw new Error(
      "Missing --token (or set OPENMARKET_TOKEN). Generate one in the dev-portal under Account → API tokens.",
    );
  }

  const apkPath = resolve(opts.apk);
  const stats = statSync(apkPath);
  if (!stats.isFile()) {
    throw new Error(`APK path is not a file: ${apkPath}`);
  }
  const fileSize = stats.size;

  // Hash the APK in chunks. node:crypto's streaming API is happy with
  // a 4MB read buffer; this keeps RAM bounded to ~the chunk size for
  // multi-hundred-MB binaries.
  const sha256 = await sha256OfFile(apkPath);

  log(`Uploading ${apkPath} (${(fileSize / 1024 / 1024).toFixed(1)} MB) sha256=${sha256.slice(0, 12)}…`);

  // Step 1: create release + mint upload URL.
  const start = await postJson<{
    releaseId: string;
    artifactId: string;
    uploadUrl: string;
    contentType: string;
  }>(opts.apiUrl, "/api/cli/releases", opts.token, {
    packageName: opts.package,
    versionCode: opts.versionCode,
    versionName: opts.versionName,
    channel: opts.channel,
    releaseNotes: opts.notes,
    sha256,
    fileSize,
    artifactType: "apk",
  });

  log(`→ release ${start.releaseId} created`);

  // Step 2: PUT the binary at the presigned URL.
  // Node's undici accepts a Readable as `body` and requires `duplex:
  // "half"` when streaming a request body. Both are runtime-correct
  // but neither is on the standard RequestInit type yet — cast the
  // whole init bag to bypass the type mismatch without disabling
  // strictness elsewhere.
  const putInit: unknown = {
    method: "PUT",
    headers: {
      "Content-Type": start.contentType,
      "Content-Length": String(fileSize),
    },
    body: createReadStream(apkPath),
    duplex: "half",
  };
  const putRes = await fetch(start.uploadUrl, putInit as RequestInit);
  if (!putRes.ok) {
    throw new Error(`Storage PUT failed: HTTP ${putRes.status}`);
  }

  log(`→ binary uploaded to storage`);

  // Step 3: complete.
  const done = await postJson<{
    success: boolean;
    artifactId: string;
    pollUrl: string;
  }>(opts.apiUrl, `/api/cli/releases/${start.releaseId}/complete`, opts.token, {
    sha256,
    fileSize,
  });

  if (!done.success) throw new Error("Complete step did not succeed");

  log(`✓ Release ${start.releaseId} ready for scan.`);
  log(`  Poll for scan outcome at: ${opts.apiUrl}${done.pollUrl}`);
}

async function postJson<T>(
  base: string,
  path: string,
  token: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const parsed = (await res.json()) as { message?: string };
      if (parsed.message) detail = parsed.message;
    } catch {
      /* keep statusText */
    }
    throw new Error(`POST ${path} → HTTP ${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

async function sha256OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path, { highWaterMark: 4 * 1024 * 1024 });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function log(msg: string): void {
  console.log(`[openmarket] ${msg}`);
}
