/**
 * APK rejection rules per implementation plan §5 P1-I edge cases.
 *
 * Each rule produces a stable error code so the frontend can render a
 * user-friendly message keyed off the code (and i18n later) rather than
 * matching on the English string.
 */

export interface ApkInfo {
  hasValidSignature: boolean;
  hasManifest: boolean;
  packageName: string;
  isDebugBuild: boolean;
  fileSizeBytes: number;
  /**
   * Signing-certificate SHA-256 fingerprint. Null when the APK has no
   * readable v1 signature block (e.g. v2/v3-only signing) — in that case
   * the SIGNING_KEY_CHANGED check is skipped rather than compared against
   * a fabricated value.
   */
  signingKeyFingerprint: string | null;
  versionCode: number;
  /** ABIs found in lib/<abi>/. Optional — empty for pure-Java APKs. */
  abis?: string[];
  /** Release channel this artifact is going into. Drives debug-build policy. */
  channel?: "stable" | "beta" | "canary";
}

export interface PreviousRelease {
  signingKeyFingerprint: string | null;
  versionCode: number;
}

export type RejectionCode =
  | "INVALID_SIGNATURE"
  | "MISSING_MANIFEST"
  | "PACKAGE_NAME_MISMATCH"
  | "DEBUG_BUILD_NOT_ALLOWED"
  | "FILE_TOO_LARGE"
  | "SIGNING_KEY_CHANGED"
  | "VERSION_CODE_NOT_HIGHER"
  | "VERSION_CODE_DUPLICATE";

export interface RejectionResult {
  rejected: boolean;
  reason?: string;
  code?: RejectionCode;
  /** Non-blocking warnings (e.g., unusual ABI). Always present even when not rejected. */
  warnings: Array<{ code: string; reason: string; details?: unknown }>;
}

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * A real signing-cert fingerprint is a canonical SHA-256: 64 lowercase
 * hex chars. Null (no v1 cert) and legacy 16-char apk-hash slices both
 * fail this and cause the key-continuity check to be skipped.
 */
function isRealFingerprint(fp: string | null): fp is string {
  return typeof fp === "string" && /^[0-9a-f]{64}$/.test(fp);
}

/**
 * The ABI strings Android officially recognizes for the lib/<abi>/ layout.
 * Any other ABI under lib/ generates a warning (not a rejection) — we want
 * to log when developers ship apps with surprise ABIs without breaking
 * exotic-but-valid uploads.
 */
const KNOWN_ABIS = new Set([
  "armeabi-v7a",
  "arm64-v8a",
  "x86",
  "x86_64",
  "mips",
  "mips64",
]);

export function checkRejectionRules(
  apk: ApkInfo,
  claimedPackageName: string,
  previousRelease?: PreviousRelease,
): RejectionResult {
  const warnings: RejectionResult["warnings"] = [];

  if (!apk.hasValidSignature) {
    return rejection("INVALID_SIGNATURE", "APK is unsigned or signature is invalid", warnings);
  }

  if (!apk.hasManifest) {
    return rejection("MISSING_MANIFEST", "APK is missing AndroidManifest.xml", warnings);
  }

  if (apk.packageName !== claimedPackageName) {
    return rejection(
      "PACKAGE_NAME_MISMATCH",
      `Package name mismatch: APK declares "${apk.packageName}" but submission claims "${claimedPackageName}"`,
      warnings,
    );
  }

  // Debug builds: rejected on stable, allowed on beta/canary.
  if (apk.isDebugBuild) {
    if ((apk.channel ?? "stable") === "stable") {
      return rejection(
        "DEBUG_BUILD_NOT_ALLOWED",
        "Debug builds are not allowed on the stable channel",
        warnings,
      );
    }
    warnings.push({
      code: "DEBUG_BUILD_ON_PRERELEASE",
      reason: "Debug build accepted on a pre-release channel",
    });
  }

  if (apk.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return rejection(
      "FILE_TOO_LARGE",
      `File size ${apk.fileSizeBytes} bytes exceeds the ${MAX_FILE_SIZE_BYTES} byte (500 MB) limit`,
      warnings,
    );
  }

  if (apk.abis) {
    for (const abi of apk.abis) {
      if (!KNOWN_ABIS.has(abi)) {
        warnings.push({
          code: "UNKNOWN_ABI",
          reason: `Native libs in unrecognized ABI: ${abi}`,
          details: { abi },
        });
      }
    }
  }

  if (previousRelease) {
    // Only enforce key continuity when BOTH fingerprints are real cert
    // fingerprints (canonical SHA-256 = 64 hex chars). A null means we
    // couldn't read a v1 cert (v2/v3-only signing); a non-64-char value
    // is legacy data from before real extraction landed (the old code
    // stored a 16-char apk-hash slice). In either case we skip rather
    // than fabricate a mismatch, and warn so the gap is visible.
    if (
      isRealFingerprint(apk.signingKeyFingerprint) &&
      isRealFingerprint(previousRelease.signingKeyFingerprint)
    ) {
      if (apk.signingKeyFingerprint !== previousRelease.signingKeyFingerprint) {
        return rejection(
          "SIGNING_KEY_CHANGED",
          "Signing key fingerprint differs from the previous release of this app. " +
            "If you intentionally rotated keys, contact admin to escalate.",
          warnings,
        );
      }
    } else {
      warnings.push({
        code: "SIGNING_KEY_UNVERIFIED",
        reason:
          "Could not read a v1 signing certificate for this or the previous " +
          "release; signing-key continuity was not verified.",
      });
    }
    if (apk.versionCode === previousRelease.versionCode) {
      return rejection(
        "VERSION_CODE_DUPLICATE",
        `versionCode ${apk.versionCode} is already used by the previous release`,
        warnings,
      );
    }
    if (apk.versionCode < previousRelease.versionCode) {
      return rejection(
        "VERSION_CODE_NOT_HIGHER",
        `versionCode ${apk.versionCode} is lower than previous versionCode ${previousRelease.versionCode}`,
        warnings,
      );
    }
  }

  return { rejected: false, warnings };
}

function rejection(
  code: RejectionCode,
  reason: string,
  warnings: RejectionResult["warnings"],
): RejectionResult {
  return { rejected: true, code, reason, warnings };
}
