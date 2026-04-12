import {
  scorePermissions,
  detectSuspiciousCombinations,
  isDangerousPermission,
} from "@openmarket/security-rules";

export interface ExportedComponent {
  name: string;
  type: string;
  hasPermissionGuard: boolean;
}

export interface DetectedSdk {
  name: string;
  version?: string;
  category: string;
  isKnownRisky: boolean;
}

export interface StaticInput {
  permissions: string[];
  exportedComponents: ExportedComponent[];
  sdks: DetectedSdk[];
  hasNativeCode: boolean;
  hasAccessibilityService: boolean;
  hasOverlayPermission: boolean;
  hasDeviceAdmin: boolean;
}

export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface Finding {
  type: string;
  severity: FindingSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface StaticAnalysisResult {
  riskScore: number;
  findings: Finding[];
}

export function analyzeStaticFindings(input: StaticInput): StaticAnalysisResult {
  const findings: Finding[] = [];
  let score = 0;

  // Score permissions via scorePermissions (0-15)
  const permScore = scorePermissions(input.permissions);
  score += permScore;

  // Flag each dangerous permission as an individual finding
  for (const perm of input.permissions) {
    if (isDangerousPermission(perm)) {
      findings.push({
        type: "dangerous_permission",
        severity: "high",
        message: `Dangerous permission declared: ${perm}`,
        details: { permission: perm },
      });
    }
  }

  // Detect suspicious permission combinations
  const combos = detectSuspiciousCombinations(input.permissions);
  for (const combo of combos) {
    findings.push({
      type: "suspicious_combination",
      severity: "high",
      message: combo.reason,
      details: { permissions: combo.permissions },
    });
  }

  // Unguarded exported components: +2 per, max 10
  const unguarded = input.exportedComponents.filter((c) => !c.hasPermissionGuard);
  const unguardedScore = Math.min(unguarded.length * 2, 10);
  score += unguardedScore;
  if (unguarded.length > 0) {
    findings.push({
      type: "unguarded_exported_components",
      severity: "medium",
      message: `${unguarded.length} exported component(s) lack permission guards`,
      details: {
        count: unguarded.length,
        components: unguarded.map((c) => ({ name: c.name, type: c.type })),
      },
    });
  }

  // Risky SDKs: +3 per, max 15
  const riskySDKs = input.sdks.filter((s) => s.isKnownRisky);
  const sdkScore = Math.min(riskySDKs.length * 3, 15);
  score += sdkScore;
  if (riskySDKs.length > 0) {
    findings.push({
      type: "risky_sdks",
      severity: "high",
      message: `${riskySDKs.length} known-risky SDK(s) detected`,
      details: {
        count: riskySDKs.length,
        sdks: riskySDKs.map((s) => ({ name: s.name, version: s.version, category: s.category })),
      },
    });
  }

  // Native code: +5
  if (input.hasNativeCode) {
    score += 5;
    findings.push({
      type: "native_code",
      severity: "medium",
      message: "APK contains native (.so) code which cannot be fully statically analyzed",
    });
  }

  // Accessibility service: +15, critical
  if (input.hasAccessibilityService) {
    score += 15;
    findings.push({
      type: "accessibility_service",
      severity: "critical",
      message: "App declares an accessibility service — high risk of UI data exfiltration or credential theft",
    });
  }

  // Overlay permission: +15, critical
  if (input.hasOverlayPermission) {
    score += 15;
    findings.push({
      type: "overlay_permission",
      severity: "critical",
      message: "App requests SYSTEM_ALERT_WINDOW (overlay) — can draw over other apps and intercept input",
    });
  }

  // Device admin: +15, critical
  if (input.hasDeviceAdmin) {
    score += 15;
    findings.push({
      type: "device_admin",
      severity: "critical",
      message: "App requests device administrator privileges — can enforce policies and prevent uninstallation",
    });
  }

  // Clamp 0-100
  const riskScore = Math.max(0, Math.min(score, 100));

  return { riskScore, findings };
}
