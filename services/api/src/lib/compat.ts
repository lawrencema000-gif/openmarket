// Helpers for surfacing app compatibility on the storefront.

/**
 * Map an Android API level (a.k.a. SDK version, e.g., minSdk=26) to the
 * marketing version users recognize ("Android 8.0").
 *
 * Source: https://apilevels.com/. Kept as a small inline table — Android
 * API levels move slowly enough that hardcoding 19 entries is cheaper than
 * a runtime lookup or a third-party dep.
 */
const SDK_TO_VERSION: Record<number, string> = {
  16: "4.1",
  17: "4.2",
  18: "4.3",
  19: "4.4",
  20: "4.4W",
  21: "5.0",
  22: "5.1",
  23: "6.0",
  24: "7.0",
  25: "7.1",
  26: "8.0",
  27: "8.1",
  28: "9",
  29: "10",
  30: "11",
  31: "12",
  32: "12L",
  33: "13",
  34: "14",
  35: "15",
  36: "16",
};

export function androidVersionForSdk(sdk: number): string {
  const exact = SDK_TO_VERSION[sdk];
  if (exact) return exact;
  // Future-proof: if we get a release with an SDK newer than our table,
  // fall back to "API <n>" rather than crashing or saying "unknown".
  return `API ${sdk}`;
}

/**
 * Format a minSdk as the user-facing "Requires Android X.X+" string.
 */
export function requiresAndroidString(minSdk: number): string {
  return `Android ${androidVersionForSdk(minSdk)}+`;
}

/**
 * Map raw ABI strings (from APK lib/* directory names) to a stable label
 * that's safe to show to users.
 *
 * Order matters: we sort the output alphabetically so two apps with the
 * same physical ABIs always render the same string.
 */
export function abisToArchitectures(abis: string[] | null | undefined): string[] {
  if (!abis || abis.length === 0) return [];
  return [...new Set(abis)].sort();
}

/**
 * Format bytes as a human-readable string (e.g., 1466367 → "1.4 MB").
 *
 * Uses 1024-base since that's what Android Settings shows users.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
