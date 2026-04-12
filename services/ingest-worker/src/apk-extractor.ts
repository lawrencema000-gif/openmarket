import { isDangerousPermission } from "@openmarket/security-rules";

export interface ParsedPermission {
  name: string;
  isDangerous: boolean;
}

export interface ApkMetadata {
  packageName: string;
  versionCode: number;
  versionName: string;
  minSdk: number;
  targetSdk: number;
  isDebugBuild: boolean;
  hasValidSignature: boolean;
  hasManifest: boolean;
  signingKeyFingerprint: string;
  fileSizeBytes: number;
  permissions: string[];
}

/**
 * Parse a list of raw permission strings and classify each one.
 */
export function parsePermissions(rawPermissions: string[]): ParsedPermission[] {
  return rawPermissions.map((permission) => ({
    name: permission,
    isDangerous: isDangerousPermission(permission),
  }));
}

/**
 * Classify a single permission string.
 * Returns "dangerous" if the permission is in the dangerous/sensitive set,
 * otherwise returns "normal".
 */
export function classifyPermission(permission: string): "dangerous" | "normal" {
  return isDangerousPermission(permission) ? "dangerous" : "normal";
}

/**
 * Extract metadata from an APK file at the given path.
 * NOTE: Real APK parsing is not yet implemented — this is a placeholder.
 */
export async function extractApkMetadata(_apkPath: string): Promise<ApkMetadata> {
  throw new Error(
    "extractApkMetadata is not yet implemented. Real APK parsing will be added in a future task."
  );
}
