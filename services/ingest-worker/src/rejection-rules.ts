export interface ApkInfo {
  hasValidSignature: boolean;
  hasManifest: boolean;
  packageName: string;
  isDebugBuild: boolean;
  fileSizeBytes: number;
  signingKeyFingerprint: string;
  versionCode: number;
}

export interface PreviousRelease {
  signingKeyFingerprint: string;
  versionCode: number;
}

export interface RejectionResult {
  rejected: boolean;
  reason?: string;
}

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

export function checkRejectionRules(
  apk: ApkInfo,
  claimedPackageName: string,
  previousRelease?: PreviousRelease
): RejectionResult {
  if (!apk.hasValidSignature) {
    return { rejected: true, reason: "APK has an invalid or missing signature" };
  }

  if (!apk.hasManifest) {
    return { rejected: true, reason: "APK is missing AndroidManifest.xml" };
  }

  if (apk.packageName !== claimedPackageName) {
    return {
      rejected: true,
      reason: `Package name mismatch: APK declares "${apk.packageName}" but submission claims "${claimedPackageName}"`,
    };
  }

  if (apk.isDebugBuild) {
    return { rejected: true, reason: "Debug builds are not allowed in the marketplace" };
  }

  if (apk.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      rejected: true,
      reason: `File size ${apk.fileSizeBytes} bytes exceeds the 500 MB limit`,
    };
  }

  if (previousRelease) {
    if (apk.signingKeyFingerprint !== previousRelease.signingKeyFingerprint) {
      return {
        rejected: true,
        reason: "Signing key has changed from the previous release",
      };
    }

    if (apk.versionCode <= previousRelease.versionCode) {
      return {
        rejected: true,
        reason: `versionCode ${apk.versionCode} must be greater than previous versionCode ${previousRelease.versionCode}`,
      };
    }
  }

  return { rejected: false };
}
