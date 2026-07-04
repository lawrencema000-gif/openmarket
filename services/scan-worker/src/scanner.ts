/**
 * Composite security scanner. Pure function — takes loaded inputs (artifact
 * metadata, permissions, sibling apps with the same package name, developer's
 * registered signing keys) and produces a Findings list + 0-100 risk score.
 *
 * Pulled out of the worker so we can unit-test every scoring path without
 * spinning up Postgres.
 *
 * The scans:
 *   0. Malware engines — ClamAV verdict (hard gate; "no engine ran" can
 *      never auto-pass) + VirusTotal hash-lookup escalation
 *   1. Permission analyzer (already in @openmarket/security-rules)
 *   2. Signing-key sanity (vs developer's registered fingerprints)
 *   3. Native lib + dex hash scan (vs blocklist; hashes computed from
 *      the actual APK contents by lib/apk-contents.ts)
 *   4. Repackaging detection (other apps w/ same packageName, different fp)
 *   5. URL extraction — DEFERRED (string-extraction is heavy + noisy)
 *
 * Each finding has a `severity` and a `weight`. The risk score is the sum
 * of weights, clamped to [0, 100]. Categorical bands:
 *   0-20    auto_pass    → release auto-published
 *   21-50   review       → admin reviews before publish
 *   51-79   high_risk    → admin reviews; user-visible warning when published
 *   80-100  block        → release rejected outright
 */

import {
  isDangerousPermission,
  scorePermissions,
  detectSuspiciousCombinations,
} from "@openmarket/security-rules";
import { isBlockedNativeLib } from "./native-lib-blocklist.js";

export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface Finding {
  type: string;
  severity: FindingSeverity;
  message: string;
  /** Score weight added to the running total. */
  weight: number;
  details?: Record<string, unknown>;
}

export interface ScannerInput {
  /** Permissions extracted by ingest worker (permission_name strings). */
  permissions: string[];
  /** ABIs from the APK's lib/<abi>/ directory. */
  abis: string[];
  /** Native lib paths, e.g., ["lib/arm64-v8a/libapp.so", ...]. */
  nativeLibs: string[];
  /**
   * Native lib SHA256s when available (populated by future enrichment).
   * For v1 this is usually empty; the blocklist check no-ops cleanly.
   */
  nativeLibSha256s?: string[];
  /** Whether the APK declares debuggable=true. */
  isDebugBuild: boolean;
  /**
   * Signing-key fingerprint as observed in the APK. For v1 this is a
   * placeholder from ingest (sha256 prefix); P2 upgrades to real apksigner.
   */
  observedSigningFingerprint: string;
  /** Fingerprints registered for this developer. */
  developerRegisteredFingerprints: string[];
  /**
   * Sibling apps on the platform that share this app's packageName but
   * belong to a *different* signing-key fingerprint. Empty array if none.
   * One of these is the smoking gun for repackaging.
   */
  conflictingPackageNameApps: Array<{
    appId: string;
    developerId: string;
    signingFingerprint: string;
  }>;
  /** Self packageName + developerId so we don't flag ourselves. */
  selfPackageName: string;
  selfDeveloperId: string;
  /**
   * Antivirus verdict from ClamAV (the hard malware gate). When omitted
   * or "unconfigured", the scanner adds a review-band finding — an APK
   * that no AV engine has looked at must never auto-pass.
   */
  av?: { status: "clean" | "infected" | "unconfigured"; signature?: string };
  /**
   * VirusTotal hash-lookup escalation. "error" (rate limit / outage)
   * degrades to a low-weight visibility finding, never a hard failure.
   */
  vt?: {
    status: "unconfigured" | "unknown" | "error" | "known";
    malicious?: number;
    suspicious?: number;
    totalEngines?: number;
  };
}

export type ScanBand = "auto_pass" | "review" | "high_risk" | "block";

export interface ScanResult {
  riskScore: number;
  band: ScanBand;
  findings: Finding[];
  /** Concise human summary for the dev-portal "Security report" header. */
  summary: string;
}

export function runScan(input: ScannerInput): ScanResult {
  const findings: Finding[] = [];

  // 0. Malware engines ─────────────────────────────────────────────────
  // ClamAV verdict is the hard gate: infected → block band on its own.
  // No engine at all → force at least the review band; a marketplace
  // must never auto-publish an APK no scanner has actually inspected.
  const av = input.av ?? { status: "unconfigured" as const };
  if (av.status === "infected") {
    findings.push({
      type: "malware_detected",
      severity: "critical",
      message: `Antivirus engine detected malware: ${av.signature ?? "unknown signature"}`,
      weight: 100,
      details: { engine: "clamav", signature: av.signature },
    });
  } else if (av.status === "unconfigured") {
    findings.push({
      type: "av_not_configured",
      severity: "medium",
      message:
        "No antivirus engine scanned this APK — malware status is UNVERIFIED. Manual review required.",
      weight: 25,
    });
  }

  const vt = input.vt ?? { status: "unconfigured" as const };
  if (vt.status === "known") {
    const malicious = vt.malicious ?? 0;
    const suspicious = vt.suspicious ?? 0;
    if (malicious >= 3) {
      findings.push({
        type: "virustotal_flagged",
        severity: "critical",
        message: `${malicious} VirusTotal engines flag this file as malicious.`,
        weight: 100,
        details: { malicious, suspicious },
      });
    } else if (malicious >= 1) {
      findings.push({
        type: "virustotal_suspicious",
        severity: "high",
        message: `${malicious} VirusTotal engine(s) flag this file as malicious — needs human review.`,
        weight: 40,
        details: { malicious, suspicious },
      });
    }
  } else if (vt.status === "error") {
    findings.push({
      type: "virustotal_unavailable",
      severity: "low",
      message: "VirusTotal lookup failed — escalation layer was unavailable for this scan.",
      weight: 5,
    });
  }

  // 1. Permission analyzer ─────────────────────────────────────────────
  const permWeight = scorePermissions(input.permissions);
  if (permWeight > 0) {
    findings.push({
      type: "permission_score",
      severity: permWeight >= 12 ? "high" : permWeight >= 6 ? "medium" : "low",
      message: `Permission score: ${permWeight}/15`,
      weight: permWeight, // 0..15 — already roughly scaled
      details: { score: permWeight },
    });
  }

  for (const perm of input.permissions) {
    if (isDangerousPermission(perm)) {
      findings.push({
        type: "dangerous_permission",
        severity: "high",
        message: `Requests dangerous permission: ${perm}`,
        weight: 4,
        details: { permission: perm },
      });
    }
  }

  for (const combo of detectSuspiciousCombinations(input.permissions)) {
    findings.push({
      type: "suspicious_combination",
      severity: "high",
      message: combo.reason,
      weight: 8,
      details: { permissions: combo.permissions },
    });
  }

  // 2. Signing-key sanity ──────────────────────────────────────────────
  if (
    input.developerRegisteredFingerprints.length > 0 &&
    !input.developerRegisteredFingerprints.includes(input.observedSigningFingerprint)
  ) {
    findings.push({
      type: "signing_key_unregistered",
      severity: "high",
      message:
        "APK is signed with a key that is not registered to this developer.",
      weight: 25,
      details: {
        observed: input.observedSigningFingerprint,
        registered: input.developerRegisteredFingerprints,
      },
    });
  }

  // 3. Native lib blocklist ────────────────────────────────────────────
  for (const sha of input.nativeLibSha256s ?? []) {
    const blocked = isBlockedNativeLib(sha);
    if (blocked) {
      findings.push({
        type: "blocked_native_lib",
        severity: "critical",
        message: `Native lib matches a known-bad hash: ${blocked.shortName} (${blocked.reason})`,
        weight: 100, // any hit alone forces block band
        details: blocked as unknown as Record<string, unknown>,
      });
    }
  }

  // 4. Repackaging detection ───────────────────────────────────────────
  const conflicts = input.conflictingPackageNameApps.filter(
    (a) =>
      a.developerId !== input.selfDeveloperId &&
      a.signingFingerprint !== input.observedSigningFingerprint,
  );
  if (conflicts.length > 0) {
    findings.push({
      type: "repackaging_suspected",
      severity: "critical",
      message:
        `Package name "${input.selfPackageName}" is used by another developer ` +
        `with a different signing key. Possible repackaged copy.`,
      weight: 55, // pushes single-finding score into the high_risk band (51-79)
      details: {
        conflicts: conflicts.map((c) => ({
          appId: c.appId,
          developerId: c.developerId,
          fingerprint: c.signingFingerprint,
        })),
      },
    });
  }

  // 5. Debug build (already gated by ingest on stable, but still surface for visibility) ─
  if (input.isDebugBuild) {
    findings.push({
      type: "debug_build",
      severity: "medium",
      message: "APK is a debug build (typically not for end-user distribution).",
      weight: 5,
    });
  }

  // 6. Suspicious / unrecognized ABIs ──────────────────────────────────
  const KNOWN_ABIS = new Set([
    "armeabi-v7a", "arm64-v8a", "x86", "x86_64", "mips", "mips64",
  ]);
  for (const abi of input.abis) {
    if (!KNOWN_ABIS.has(abi)) {
      findings.push({
        type: "unknown_abi",
        severity: "low",
        message: `Native libs in unrecognized ABI: ${abi}`,
        weight: 1,
        details: { abi },
      });
    }
  }

  // Aggregate.
  const rawScore = findings.reduce((sum, f) => sum + f.weight, 0);
  const riskScore = Math.min(100, Math.max(0, rawScore));
  const band = bandFor(riskScore);
  const summary = summarize(findings, band, riskScore);

  return { riskScore, band, findings, summary };
}

function bandFor(score: number): ScanBand {
  if (score <= 20) return "auto_pass";
  if (score <= 50) return "review";
  if (score <= 79) return "high_risk";
  return "block";
}

function summarize(findings: Finding[], band: ScanBand, score: number): string {
  if (findings.length === 0) return `No security findings (score ${score}/100).`;
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<
    FindingSeverity,
    number
  >;
  for (const f of findings) counts[f.severity]++;
  const parts: string[] = [];
  if (counts.critical) parts.push(`${counts.critical} critical`);
  if (counts.high) parts.push(`${counts.high} high`);
  if (counts.medium) parts.push(`${counts.medium} medium`);
  if (counts.low) parts.push(`${counts.low} low`);
  return `${parts.join(", ") || "no severity findings"} · score ${score}/100 · band ${band}`;
}
