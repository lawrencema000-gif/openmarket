import { z } from "zod";

/**
 * AAB (Android App Bundle) contracts (P3-G).
 *
 * A developer can upload an `.aab` to the existing release-artifact
 * pipeline. The bundle is the parent artifact; at install time we
 * generate a per-device APK "split" using bundletool. Each split is
 * a child row in `release_artifacts` keyed back via `parentArtifactId`
 * with the targeting descriptor in `manifest`.
 *
 * Bundletool integration is left behind an adapter — v1 ships the
 * data model + adapter contract + endpoint stub; production deploys
 * swap in a real `BundletoolAdapter` implementation via WEB_BUNDLETOOL_DRIVER.
 */

export const ANDROID_ABIS = [
  "arm64-v8a",
  "armeabi-v7a",
  "x86_64",
  "x86",
] as const;

export type AndroidAbi = (typeof ANDROID_ABIS)[number];

/**
 * Device descriptor sent by the OpenMarket installer when requesting
 * a split APK. We only carry the fields bundletool actually uses for
 * split selection.
 *
 *   abi             — ARM/x86 architecture
 *   screenDensity   — DPI bucket (ldpi=120, mdpi=160, hdpi=240,
 *                     xhdpi=320, xxhdpi=480, xxxhdpi=640)
 *   languages       — BCP 47 codes the device will install language
 *                     splits for. Caller MAY pass multiple; the
 *                     adapter typically picks the first match.
 */
export const splitApkRequestSchema = z.object({
  abi: z.enum(ANDROID_ABIS),
  screenDensity: z.number().int().min(120).max(640),
  languages: z.array(z.string().min(2).max(8)).min(1).max(10),
});

export type SplitApkRequest = z.infer<typeof splitApkRequestSchema>;

/**
 * Manifest stored on a generated split-APK row. Returned by the
 * adapter when bundletool finishes, persisted on the child artifact
 * row, surfaced on GET /releases/:id so the storefront can pick the
 * best-fit split without recomputing.
 */
export const splitApkManifestSchema = z.object({
  abi: z.enum(ANDROID_ABIS).optional(),
  screenDensity: z.number().int().optional(),
  languages: z.array(z.string()).optional(),
  bundletoolVersion: z.string().optional(),
});

export type SplitApkManifest = z.infer<typeof splitApkManifestSchema>;
