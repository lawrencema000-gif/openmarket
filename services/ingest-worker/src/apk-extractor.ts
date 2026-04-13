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

export interface ExtractedMetadata {
  packageName: string;
  versionCode: number;
  versionName: string;
  minSdk: number;
  targetSdk: number;
  permissions: string[];
  activities: string[];
  services: string[];
  receivers: string[];
  providers: string[];
  appLabel: string;
  isDebugBuild: boolean;
  abis: string[];
  nativeLibs: string[];
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
 * Extract metadata from an APK file at the given path using adbkit-apkreader.
 */
export async function extractApkMetadata(
  apkPath: string
): Promise<ExtractedMetadata> {
  // Dynamic import to handle CommonJS/ESM interop for adbkit-apkreader
  let ApkReader: any;
  try {
    const mod = await import("adbkit-apkreader");
    ApkReader = mod.default ?? mod;
  } catch {
    throw new Error(
      "adbkit-apkreader is not installed. Run: pnpm add adbkit-apkreader"
    );
  }

  const reader = await ApkReader.open(apkPath);
  const manifest = await reader.readManifest();

  const permissions: string[] =
    manifest.usesPermissions?.map((p: any) => p.name) ?? [];

  const activities =
    manifest.application?.activities?.map((a: any) => a.name) ?? [];

  const services =
    manifest.application?.services?.map((s: any) => s.name) ?? [];

  const receivers =
    manifest.application?.receivers?.map((r: any) => r.name) ?? [];

  const providers =
    manifest.application?.providers?.map((p: any) => p.name) ?? [];

  return {
    packageName: manifest.package,
    versionCode: manifest.versionCode,
    versionName: manifest.versionName ?? "1.0.0",
    minSdk: manifest.usesSdk?.minSdkVersion ?? 21,
    targetSdk: manifest.usesSdk?.targetSdkVersion ?? 35,
    permissions,
    activities,
    services,
    receivers,
    providers,
    appLabel: manifest.application?.label ?? manifest.package,
    isDebugBuild: manifest.application?.debuggable ?? false,
    abis: [], // Would need to inspect lib/ directory inside the APK
    nativeLibs: [], // Would need to inspect lib/ directory inside the APK
  };
}
