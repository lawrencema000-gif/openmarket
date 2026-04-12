export type RiskLevel = "auto_pass" | "enhanced_review" | "human_required";

export interface RiskInput {
  /** Output of scorePermissions() — 0 to 15 */
  permissionScore: number;
  /** Number of newly added permissions compared to previous version */
  newPermissionCount: number;
  /** Number of flagged/suspicious SDKs detected */
  suspiciousSdkCount: number;
  /** Number of exported components without permission guards */
  unguardedExportedComponentCount: number;
  /** Number of suspicious URLs / domains found in the APK */
  suspiciousUrlCount: number;
  /** Whether the APK contains native (.so) code */
  hasNativeCode: boolean;
  /** Whether the app declares an accessibility service */
  hasAccessibilityService: boolean;
  /** Whether SYSTEM_ALERT_WINDOW (overlay) is declared */
  hasOverlayPermission: boolean;
  /** Whether device-admin privileges are requested */
  hasDeviceAdmin: boolean;
  /** Trust level assigned to the developer account */
  developerTrustLevel: "audited" | "verified" | "unverified" | "experimental";
  /** How many days the developer account has existed */
  accountAgeDays: number;
  /** Severity of diff from last published version: 0-20 */
  updateDiffSeverity: number;
}

export function calculateRiskScore(input: RiskInput): number {
  let score = 0;

  // Permission score: 0-15 (already capped by scorePermissions)
  score += Math.min(input.permissionScore, 15);

  // New permissions: 2 pts each, max 10
  score += Math.min(input.newPermissionCount * 2, 10);

  // Suspicious SDKs: 3 pts each, max 15
  score += Math.min(input.suspiciousSdkCount * 3, 15);

  // Unguarded exported components: 2 pts each, max 10
  score += Math.min(input.unguardedExportedComponentCount * 2, 10);

  // Suspicious URLs: 2 pts each, max 10
  score += Math.min(input.suspiciousUrlCount * 2, 10);

  // Native code flat bonus
  if (input.hasNativeCode) score += 5;

  // Accessibility service flat bonus
  if (input.hasAccessibilityService) score += 15;

  // Overlay permission flat bonus
  if (input.hasOverlayPermission) score += 15;

  // Device admin flat bonus
  if (input.hasDeviceAdmin) score += 15;

  // Developer trust level modifier
  switch (input.developerTrustLevel) {
    case "audited":
      score -= 20;
      break;
    case "verified":
      score -= 10;
      break;
    case "unverified":
      // no modifier
      break;
    case "experimental":
      score += 10;
      break;
  }

  // Young account penalty (< 7 days old)
  if (input.accountAgeDays < 7) {
    score += 10;
  }

  // Update diff severity: already 0-20, used directly
  score += Math.min(input.updateDiffSeverity, 20);

  return Math.max(0, Math.min(score, 100));
}

export function getRiskLevel(score: number): RiskLevel {
  if (score <= 30) return "auto_pass";
  if (score <= 70) return "enhanced_review";
  return "human_required";
}
