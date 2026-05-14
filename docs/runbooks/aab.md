# Android App Bundle (AAB) integration runbook (P3-G)

OpenMarket accepts both raw `.apk` uploads and Android App Bundle (`.aab`) uploads in the existing release-artifact pipeline. v1 ships the data model + adapter contract + endpoint surface; the bundletool integration that actually generates per-device splits is gated behind the `WEB_BUNDLETOOL_DRIVER` env and the `BundletoolAdapter` interface.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Developer uploads release.aab via existing CI/dev-portal flow  │
│    → release_artifacts row { artifactType: "aab" }              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼  (at install time, per device)
┌─────────────────────────────────────────────────────────────────┐
│  POST /api/releases/:id/split-apk                               │
│    body: { abi, screenDensity, languages }                      │
│                                                                  │
│  1. findCachedSplit(parentArtifactId, request)                  │
│     → look for an existing child APK row with matching          │
│       manifest (cheap; typical hit on second device w/ same     │
│       descriptor)                                               │
│                                                                  │
│  2. if miss: adapter.generateSplit(parent, request)             │
│     → real impl runs bundletool, uploads slim APK to R2/S3,     │
│       returns { storageBucket, storageKey, fileUrl, sha256,     │
│                  fileSize, manifest }                           │
│                                                                  │
│  3. recordGeneratedSplit() persists child release_artifacts row │
│     pointing back at the parent via parentArtifactId            │
└─────────────────────────────────────────────────────────────────┘
```

## Schema

`release_artifacts` has carried `artifactType ∈ {apk, aab}` from day one. P3-G added two columns:

- `parentArtifactId UUID` — for generated APK splits, points at the parent AAB row. Null on raw uploads.
- `manifest JSONB` — bundletool device-target descriptor for generated splits. Shape:
  ```json
  {
    "abi": "arm64-v8a",
    "screenDensity": 480,
    "languages": ["en-US"],
    "bundletoolVersion": "1.17.0"
  }
  ```

Migration: `packages/db/drizzle/0022_*.sql`.

## Adapter contract

```ts
// services/api/src/lib/bundletool.ts
export interface BundletoolAdapter {
  name(): string;
  generateSplit(args: {
    parentArtifactId: string;
    parentBucket: string | null;
    parentKey: string | null;
    request: SplitApkRequest;
  }): Promise<GeneratedSplitApk>;
}
```

The default `NoopBundletoolAdapter` throws `BundletoolNotConfiguredError`; the route catches it and returns HTTP 501 so storefront / installer clients know to fall back to the raw APK rather than retrying.

## Driver selection

Set `WEB_BUNDLETOOL_DRIVER` in the API env:

- `noop` (default) — returns 501 from the split endpoint.
- `bundletool` — TODO: shipping this driver is the next step. Sketch:
  1. New worker service `services/bundletool-worker/`
  2. Pulls the parent AAB from R2, runs `bundletool build-apks --device-spec=spec.json --bundle=app.aab --output=splits.apks`
  3. Extracts the master APK from `splits.apks`, uploads to R2
  4. Returns the storage pointer back to the API caller (via internal HTTP or BullMQ queue)

The API doesn't need to know HOW the bundletool runs — only that the adapter resolves it. That keeps the API service stateless + dependency-free of the JDK.

## v1 storefront UX

Until the bundletool driver ships:

- Devs uploading an AAB get a working `release_artifacts` row but the storefront's install button continues to use the verified APK artifact (if one exists alongside the AAB) or shows "Install not yet available" (if only an AAB exists).
- The dev-portal release detail labels each artifact row with its type so the dev sees both their AAB and any companion APK.
- Storefront app detail's `latestArtifact` block carries `artifactType` for future UI to react to.

## When the bundletool driver lands

1. Implement `BundletoolBackedAdapter` in `services/api/src/lib/bundletool.ts` (or a `services/bundletool-worker/` companion + a wrapper adapter that enqueues work).
2. Update `getBundletoolAdapter()` to dispatch on `WEB_BUNDLETOOL_DRIVER=bundletool`.
3. Add a smoke test under `services/api/src/__tests__/bundletool.smoke.test.ts` that runs against a real AAB fixture.
4. Storefront installer (Android client, P3-J/K territory) calls `POST /api/releases/:id/split-apk` with the device descriptor and installs the returned APK.
5. Browser fallback: storefront detects mobile UA + lacks installer, links to the parent AAB OR a single-arch universal APK (bundletool can produce one).

## Operational notes

- **Cache lifetime**: generated splits stay in `release_artifacts` forever. The disk cost is ~10MB per split per device-target combination. For a popular app with 5 ABIs × 5 density buckets × 50 languages, that's a theoretical 1250 splits × 10MB = 12GB. In practice the long tail of devices clusters tightly so the working set is much smaller. Add a TTL cron only if storage cost becomes a real concern.
- **Concurrency**: the route has no idempotency key. Two near-simultaneous device requests with the same descriptor could both trigger bundletool. The cache check is the second-best line of defense; if it becomes a real problem, gate generation on a Redis lock.
- **Failures**: bundletool failures bubble up as HTTP 500. Storefront should retry once then fall back to the parent AAB or refuse the install with a clear error message.

## Verification today

```bash
# Adapter contract + endpoint stub
pnpm --filter @openmarket/api test -- bundletool

# Contract schemas
pnpm --filter @openmarket/contracts test -- aab
```

Expected: 14 tests pass; the 501 path is exercised end-to-end.
