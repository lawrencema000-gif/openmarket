# Storage runbook

**Stack:** S3-compatible object storage. Production = Cloudflare R2 (zero egress). Local dev = MinIO via Docker.

**Buckets:**
- `openmarket-artifacts` — private, holds APK/AAB binaries. Access via short-lived signed URLs (5 min default for downloads, 10 min for uploads).
- `openmarket-media` — public-read, holds icons/screenshots/feature graphics. CDN-fronted in production.

The same code path works against both — it's plain `@aws-sdk/client-s3`. Only env vars differ.

## Quick reference

```bash
# Local: spin up MinIO + auto-create buckets
cd infrastructure/docker && docker compose up -d minio minio-init

# Local: MinIO console (browser)
open http://localhost:9001
# Login: openmarket / openmarket_dev

# Verify storage lib config from CLI
pnpm --filter @openmarket/api test -- src/__tests__/storage.test.ts
```

## Env vars

| Var | Local | Production |
|---|---|---|
| `S3_ENDPOINT` | `http://localhost:9000` | unset (R2 derives endpoint from `R2_ACCOUNT_ID`) |
| `S3_ACCESS_KEY_ID` | `openmarket` | unset (use `R2_ACCESS_KEY_ID`) |
| `S3_SECRET_ACCESS_KEY` | `openmarket_dev` | unset (use `R2_SECRET_ACCESS_KEY`) |
| `S3_REGION` | `us-east-1` | `auto` (R2) |
| `R2_ACCOUNT_ID` | unset | `<cloudflare account id>` |
| `R2_ACCESS_KEY_ID` | unset | `<r2 token id>` |
| `R2_SECRET_ACCESS_KEY` | unset | `<r2 token secret>` |
| `R2_BUCKET_ARTIFACTS` | `openmarket-artifacts` | `openmarket-artifacts` |
| `R2_BUCKET_MEDIA` | `openmarket-media` | `openmarket-media` |
| `R2_PUBLIC_BASE_URL` | `http://localhost:9000/openmarket-media` | `https://cdn.openmarket.app` |

The storage lib treats `R2_*` and `S3_*` as fallbacks: `R2_*` is checked first, then `S3_*`. Empty strings count as "not set."

## Provisioning Cloudflare R2 (when ready for production)

1. Sign up at https://dash.cloudflare.com.
2. Workers & Pages → R2 Object Storage → "Subscribe" (free tier: 10 GB stored, zero egress, 1M ops/mo).
3. Create bucket `openmarket-artifacts` (private).
4. Create bucket `openmarket-media` (private — public access via Worker, see below).
5. R2 → "Manage R2 API Tokens" → "Create API token":
   - Permission: "Object Read & Write"
   - Buckets: both
   - Save the Access Key ID + Secret Access Key
6. Note your Account ID (visible in the R2 dashboard URL).
7. Set `R2_*` env vars in Vercel project settings (for API service).

### Public media bucket

R2 doesn't expose buckets publicly by default. Two options:
- **Custom domain** (recommended): R2 → bucket → Settings → "Custom domains" → add `cdn.openmarket.app`. Cloudflare auto-issues TLS. Set `R2_PUBLIC_BASE_URL=https://cdn.openmarket.app`.
- **r2.dev URL** (testing only): R2 → bucket → Settings → "Allow Access" → enable r2.dev subdomain. Note: rate-limited.

## Upload flow (developer side)

Browser-direct upload, no proxy through API:

1. Browser → API: `POST /api/releases/{id}/upload-url` with `{ sha256, fileSize, artifactType }`.
2. API verifies developer owns the release, builds storage key, calls `getSignedUploadUrl()`. Returns `{ uploadUrl, bucket, key, expiresAt, artifactId }`.
3. Browser → R2/MinIO: `PUT uploadUrl` with the APK as body. Direct upload, doesn't transit the API server.
4. Browser → API: `POST /api/releases/{id}/complete` with `{ sha256, fileSize }`. API HEADs the object to verify it landed and matches the declared size, then enqueues an `ingest` BullMQ job.
5. Ingest worker takes over: downloads from storage, parses APK with `adbkit-apkreader`, writes `artifact_metadata` and `permissions_detected`, enqueues `scan` job.

## Download flow (Android client)

1. Android client → API: `GET /api/artifacts/{artifactId}/download`. Requires API token.
2. API generates a 5-min signed GET URL.
3. Android downloads APK directly from R2/MinIO via the signed URL.
4. R2 serves with zero egress cost (within Cloudflare network).

## Object key conventions

- Artifacts: `artifacts/{appId}/{releaseId}/{sha256-prefix-16}.{apk|aab}`
  - Deterministic, sortable in dashboard, sha256 prefix prevents collisions if two artifacts share the same release.
- Media: `apps/{appId}/{kind}/{contentHash}.{ext}` where `kind` ∈ `icon | screenshot | feature-graphic | preview-poster`.
  - Content-hashed → immutable URLs → infinite browser cache.

## Cleanup / GC

- Rejected uploads (artifact `uploadStatus = 'rejected'`) are deleted by a daily worker job.
- Delisted apps: artifacts and media kept for 90 days (legal hold for DMCA appeals), then hard-deleted.
- Media for deleted developers: hard-deleted within 30 days of account deletion (GDPR Right to Erasure).

## Backups

- Production: weekly mirror of `openmarket-artifacts` to a backup R2 bucket in a different region. Configured in P1-T.
- Media bucket: not backed up — it's regenerable from artifacts.
- Local MinIO: ephemeral, no backups.

## Troubleshooting

**"Object storage is not configured"**
The `loadConfig()` returned null because no `accessKeyId` could be derived. Check that either `R2_ACCESS_KEY_ID`+`R2_SECRET_ACCESS_KEY` (production) or `S3_ACCESS_KEY_ID`+`S3_SECRET_ACCESS_KEY` (local) are set as **non-empty** strings. Empty strings in `.env` count as unset.

**"SignatureDoesNotMatch" on PUT**
The presigned URL was generated for a different `Content-Type` than the browser sent. Make sure the `Content-Type` header on the PUT matches what was passed to `getSignedUploadUrl({ contentType })`.

**"BucketAlreadyOwnedByYou" on first run**
Harmless — the minio-init container tries to create buckets that may already exist. The compose `restart: "no"` setting prevents loops.

**MinIO console can't reach the API**
The container name `openmarket-minio` is only resolvable from within the docker network. From your host: use `localhost:9001` for the console and `localhost:9000` for the S3 API.

## Test verification

```bash
# Smoke test — uploads a 11-byte file, downloads it back
pnpm --filter @openmarket/api test -- src/__tests__/storage.test.ts
```

Live tests are skipped automatically if MinIO isn't reachable on `localhost:9000`.

---

## Image variants (P1-P)

The storefront expects three icon variants per app, content-hashed for cache immutability. Convention:

```
apps/<appId>/icon/<sha256-hex>@64.webp
apps/<appId>/icon/<sha256-hex>@192.webp
apps/<appId>/icon/<sha256-hex>@512.webp
```

The same convention applies to screenshots (`apps/<appId>/screenshot/<sha>@<width>.webp`) and feature graphics. The `@<width>` suffix is the load-bearing pattern — it lets the storefront request a specific size by URL without needing a runtime resizer to be online.

### Storefront consumption — already shipped

- [`apps/market-web/next.config.ts`](../../apps/market-web/next.config.ts) declares the variant widths via `deviceSizes` + `imageSizes` and points images at a custom loader.
- [`apps/market-web/src/lib/image-loader.ts`](../../apps/market-web/src/lib/image-loader.ts) implements the loader. For URLs that already encode a variant size in the path (`<sha>@512.webp`), it passes through. For URLs that point at the OpenMarket media bucket without a variant suffix, it appends `?w=<width>` so a future Cloudflare Image Transformations endpoint (or our own resizer worker) can serve a width-specific variant.
- [`packages/ui/src/components/app-card.tsx`](../../packages/ui/src/components/app-card.tsx) renders icons with native `width`/`height` (no CLS), `loading="lazy"`, and `decoding="async"`.

The loader is **safe to ship before the resizer is deployed** — today the `?w=<n>` query parameter is a no-op the bucket ignores; tomorrow when a worker is on `cdn.openmarket.app` it reads it.

### Producer side — deferred

Generating the actual `@64`, `@192`, `@512` icon files is the ingest-worker's job: when the developer uploads an icon to the listing, the worker decodes the source, resizes to each target width with `sharp`, and PUTs the variants under the deterministic key. That requires:

1. `sharp` as a dep on `services/ingest-worker` (native binary; ships with prebuilt artifacts for arm64/x64 Linux which covers Fly.io's runtime).
2. A new `processIconUpload` job type in `notify-worker`/`ingest-worker` triggered by the listing PATCH that sets a new `iconUrl`.
3. Atomicity: only update `appListings.iconUrl` to the variant URL after every variant has landed in the bucket. A partial write would leave the storefront pointing at a missing variant.

Tracked as a Phase-2 producer-side task. Until it lands, the storefront serves the original icon at every requested width — no perf regression vs. the prior plain-`<img>` baseline; we're just paying the byte cost of the largest icon at every render size.

### Cloudflare configuration (production only)

When the CDN sits in front of `openmarket-media`:

1. Bind a custom domain `cdn.openmarket.app` to the bucket.
2. Enable [Cloudflare Image Transformations](https://developers.cloudflare.com/images/transform-images/) on the zone.
3. The loader's `?w=<width>` query parameter is the standard CF Transformations input — no further config needed once the feature is on.
4. Set the bucket's `Cache-Control` on object PUT to `public, max-age=31536000, immutable` — variants are content-hashed so they can be cached forever without invalidation.

In dev, the loader passes through to the unmodified MinIO URL — Cloudflare Transformations isn't available locally and isn't needed because dev traffic is small.
