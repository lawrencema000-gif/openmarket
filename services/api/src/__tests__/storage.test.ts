import "../lib/env";
import { describe, it, expect, beforeAll } from "vitest";
import {
  buildArtifactKey,
  buildMediaKey,
  getPublicMediaUrl,
  getSignedDownloadUrl,
  getSignedUploadUrl,
  headObject,
  isStorageConfigured,
} from "../lib/storage";

const SHA = "a".repeat(64);

describe("storage: key builders", () => {
  it("produces deterministic artifact keys with sha256 prefix", () => {
    const key = buildArtifactKey({
      appId: "app-1",
      releaseId: "rel-1",
      sha256: SHA,
      artifactType: "apk",
    });
    expect(key).toBe("artifacts/app-1/rel-1/aaaaaaaaaaaaaaaa.apk");
  });

  it("supports AAB artifacts", () => {
    const key = buildArtifactKey({
      appId: "app-1",
      releaseId: "rel-1",
      sha256: SHA,
      artifactType: "aab",
    });
    expect(key.endsWith(".aab")).toBe(true);
  });

  it("builds media keys keyed by content hash for cache immutability", () => {
    const key = buildMediaKey({
      appId: "app-1",
      kind: "icon",
      contentHash: "deadbeef",
      ext: "webp",
    });
    expect(key).toBe("apps/app-1/icon/deadbeef.webp");
  });

  it("strips a leading dot in extensions", () => {
    const key = buildMediaKey({
      appId: "app-1",
      kind: "screenshot",
      contentHash: "x",
      ext: ".png",
    });
    expect(key).toBe("apps/app-1/screenshot/x.png");
  });
});

describe("storage: env-gated presence", () => {
  it("reports configuration state from env", () => {
    // Whether configured depends on whether MinIO/R2 envs are set in the test env.
    // We just assert the boolean is well-typed.
    expect(typeof isStorageConfigured()).toBe("boolean");
  });

});

// Live integration tests — only run when MinIO is reachable.
const minioReachable = await fetch("http://localhost:9000/minio/health/ready", {
  signal: AbortSignal.timeout(500),
})
  .then((r) => r.ok)
  .catch(() => false);

const itLive = minioReachable ? it : it.skip;

describe("storage: live MinIO integration (skipped if MinIO not running)", () => {
  beforeAll(() => {
    if (!minioReachable) {
      console.warn("MinIO not reachable on localhost:9000 — skipping live tests");
    }
  });

  itLive("generates a presigned PUT URL that uploads successfully", async () => {
    const key = `tests/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    const signed = await getSignedUploadUrl({
      bucket: "artifacts",
      key,
      contentType: "text/plain",
      contentLength: 11,
      expiresInSeconds: 60,
    });
    expect(signed.url).toMatch(/^http/);
    expect(signed.bucket).toBe("openmarket-artifacts");
    expect(signed.key).toBe(key);

    const body = "hello world";
    const putRes = await fetch(signed.url, {
      method: "PUT",
      body,
      headers: { "Content-Type": "text/plain" },
    });
    expect(putRes.ok).toBe(true);

    const head = await headObject({ bucket: "artifacts", key });
    expect(head).not.toBeNull();
    expect(head!.size).toBe(body.length);
  });

  itLive("generates a presigned GET URL that downloads the same content", async () => {
    const key = `tests/${Date.now()}-roundtrip.txt`;
    const signed = await getSignedUploadUrl({
      bucket: "artifacts",
      key,
      contentType: "text/plain",
      expiresInSeconds: 60,
    });
    await fetch(signed.url, { method: "PUT", body: "round-trip" });

    const downloadUrl = await getSignedDownloadUrl({
      bucket: "artifacts",
      key,
      expiresInSeconds: 60,
    });
    const getRes = await fetch(downloadUrl);
    expect(getRes.ok).toBe(true);
    expect(await getRes.text()).toBe("round-trip");
  });

  itLive("headObject returns null for missing keys instead of throwing", async () => {
    const head = await headObject({
      bucket: "artifacts",
      key: "definitely-does-not-exist-" + Date.now(),
    });
    expect(head).toBeNull();
  });

  itLive("getPublicMediaUrl resolves a media object URL", () => {
    const key = buildMediaKey({
      appId: "x",
      kind: "icon",
      contentHash: "h",
      ext: "png",
    });
    const url = getPublicMediaUrl(key);
    expect(url).toMatch(/openmarket-media/);
    expect(url).toMatch(/icon/);
  });
});
