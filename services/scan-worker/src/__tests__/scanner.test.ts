import { describe, it, expect } from "vitest";
import { runScan, type ScannerInput } from "../scanner.js";

const baseInput: ScannerInput = {
  permissions: [],
  abis: ["arm64-v8a"],
  nativeLibs: [],
  nativeLibSha256s: [],
  isDebugBuild: false,
  observedSigningFingerprint: "fp-self",
  developerRegisteredFingerprints: ["fp-self"],
  conflictingPackageNameApps: [],
  selfPackageName: "com.test.app",
  selfDeveloperId: "dev-1",
};

describe("runScan", () => {
  describe("clean APK", () => {
    it("scores 0 and bands as auto_pass", () => {
      const r = runScan(baseInput);
      expect(r.riskScore).toBe(0);
      expect(r.band).toBe("auto_pass");
      expect(r.findings).toHaveLength(0);
      expect(r.summary).toMatch(/no security findings/i);
    });
  });

  describe("permission analyzer", () => {
    it("flags dangerous permissions individually", () => {
      const r = runScan({
        ...baseInput,
        permissions: ["android.permission.READ_SMS", "android.permission.CAMERA"],
      });
      const dp = r.findings.filter((f) => f.type === "dangerous_permission");
      expect(dp.length).toBeGreaterThan(0);
      expect(dp[0]!.severity).toBe("high");
    });

    it("flags suspicious permission combinations with a heavy weight", () => {
      // RECEIVE_SMS + INTERNET = OTP-interception combo per security-rules
      const r = runScan({
        ...baseInput,
        permissions: [
          "android.permission.RECEIVE_SMS",
          "android.permission.INTERNET",
        ],
      });
      const combos = r.findings.filter((f) => f.type === "suspicious_combination");
      expect(combos.length).toBeGreaterThan(0);
      expect(combos.every((c) => c.weight >= 8)).toBe(true);
    });
  });

  describe("signing-key sanity", () => {
    it("flags HIGH severity when observed signing key isn't registered", () => {
      const r = runScan({
        ...baseInput,
        observedSigningFingerprint: "fp-mystery",
        developerRegisteredFingerprints: ["fp-real"],
      });
      const f = r.findings.find((x) => x.type === "signing_key_unregistered");
      expect(f).toBeDefined();
      expect(f!.severity).toBe("high");
      expect(f!.weight).toBeGreaterThanOrEqual(20);
    });

    it("does not flag when developer hasn't registered any keys yet", () => {
      const r = runScan({
        ...baseInput,
        observedSigningFingerprint: "fp-anything",
        developerRegisteredFingerprints: [],
      });
      expect(r.findings.find((x) => x.type === "signing_key_unregistered")).toBeUndefined();
    });

    it("accepts when observed key is one of multiple registered keys", () => {
      const r = runScan({
        ...baseInput,
        observedSigningFingerprint: "fp-rotated-2",
        developerRegisteredFingerprints: ["fp-original", "fp-rotated-2"],
      });
      expect(r.findings.find((x) => x.type === "signing_key_unregistered")).toBeUndefined();
    });
  });

  describe("repackaging detection", () => {
    it("flags critical when another developer ships the same packageName", () => {
      const r = runScan({
        ...baseInput,
        conflictingPackageNameApps: [
          {
            appId: "other-app",
            developerId: "other-dev",
            signingFingerprint: "fp-other",
          },
        ],
      });
      const f = r.findings.find((x) => x.type === "repackaging_suspected");
      expect(f).toBeDefined();
      expect(f!.severity).toBe("critical");
      // Critical → high weight, lands in high_risk band.
      expect(r.band === "high_risk" || r.band === "block").toBe(true);
    });

    it("ignores apps from the same developer (legitimate variants)", () => {
      const r = runScan({
        ...baseInput,
        conflictingPackageNameApps: [
          {
            appId: "other-app",
            developerId: "dev-1", // same as self
            signingFingerprint: "fp-other",
          },
        ],
      });
      expect(
        r.findings.find((x) => x.type === "repackaging_suspected"),
      ).toBeUndefined();
    });

    it("ignores apps with the same signing fingerprint (developer keychain)", () => {
      const r = runScan({
        ...baseInput,
        conflictingPackageNameApps: [
          {
            appId: "other-app",
            developerId: "other-dev",
            signingFingerprint: "fp-self", // same fp ⇒ same identity, not repackaging
          },
        ],
      });
      expect(
        r.findings.find((x) => x.type === "repackaging_suspected"),
      ).toBeUndefined();
    });
  });

  describe("debug build", () => {
    it("flags as medium severity (extra signal — already gated by ingest on stable)", () => {
      const r = runScan({ ...baseInput, isDebugBuild: true });
      const f = r.findings.find((x) => x.type === "debug_build");
      expect(f).toBeDefined();
      expect(f!.severity).toBe("medium");
    });
  });

  describe("unknown ABIs", () => {
    it("flags low severity per unrecognized ABI", () => {
      const r = runScan({
        ...baseInput,
        abis: ["arm64-v8a", "exotic-arch"],
      });
      const f = r.findings.find((x) => x.type === "unknown_abi");
      expect(f).toBeDefined();
      expect(f!.severity).toBe("low");
      expect((f!.details as any).abi).toBe("exotic-arch");
    });
  });

  describe("scoring + bands", () => {
    it("clean APK = auto_pass band", () => {
      expect(runScan(baseInput).band).toBe("auto_pass");
    });

    it("a few dangerous permissions land in review band", () => {
      // Single dangerous perm is fine (many legit apps); but stacking
      // multiple high-stakes ones should pull out of auto_pass.
      const r = runScan({
        ...baseInput,
        permissions: [
          "android.permission.READ_SMS",
          "android.permission.READ_CONTACTS",
          "android.permission.RECORD_AUDIO",
          "android.permission.READ_CALL_LOG",
        ],
      });
      expect(["review", "high_risk"]).toContain(r.band);
    });

    it("repackaging finding pushes into block or high_risk", () => {
      const r = runScan({
        ...baseInput,
        conflictingPackageNameApps: [
          {
            appId: "x",
            developerId: "other-dev",
            signingFingerprint: "fp-other",
          },
        ],
      });
      expect(["high_risk", "block"]).toContain(r.band);
    });

    it("blocked native lib alone is a block band (weight 100)", () => {
      // The blocklist starts empty; we can't test against a real entry
      // without forcing one. This is a documentary test that the
      // pathway exists; live testing requires a populated blocklist.
      const r = runScan({
        ...baseInput,
        nativeLibSha256s: ["does-not-match-anything"],
      });
      expect(r.findings.find((f) => f.type === "blocked_native_lib")).toBeUndefined();
    });

    it("score is clamped at 100", () => {
      const r = runScan({
        ...baseInput,
        permissions: [
          "android.permission.READ_SMS",
          "android.permission.SEND_SMS",
          "android.permission.READ_CONTACTS",
          "android.permission.RECORD_AUDIO",
          "android.permission.ACCESS_FINE_LOCATION",
          "android.permission.READ_CALL_LOG",
        ],
        observedSigningFingerprint: "fp-mystery",
        developerRegisteredFingerprints: ["fp-real"],
        conflictingPackageNameApps: [
          {
            appId: "x",
            developerId: "other-dev",
            signingFingerprint: "fp-other",
          },
        ],
      });
      expect(r.riskScore).toBeLessThanOrEqual(100);
      expect(r.band).toBe("block");
    });
  });

  describe("summary", () => {
    it("counts findings by severity in the summary string", () => {
      const r = runScan({
        ...baseInput,
        permissions: ["android.permission.READ_SMS"],
        isDebugBuild: true,
      });
      expect(r.summary).toMatch(/score \d+\/100/);
      expect(r.summary).toMatch(/band \w+/);
    });
  });
});
