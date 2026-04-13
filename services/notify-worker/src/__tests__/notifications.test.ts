import { describe, it, expect } from "vitest";
import { buildNotification } from "../notifications.js";

describe("buildNotification", () => {
  describe("release_approved", () => {
    it("includes app name and version in subject", () => {
      const result = buildNotification("release_approved", {
        appName: "MyApp",
        versionName: "2.1.0",
      });
      expect(result.subject).toContain("MyApp");
      expect(result.subject).toContain("2.1.0");
      expect(result.subject).toContain("approved");
    });

    it("includes app name and version in body", () => {
      const result = buildNotification("release_approved", {
        appName: "MyApp",
        versionName: "2.1.0",
      });
      expect(result.body).toContain("MyApp");
      expect(result.body).toContain("2.1.0");
      expect(result.body).toContain("published");
    });
  });

  describe("release_rejected", () => {
    it("includes app name, version, and reason in subject", () => {
      const result = buildNotification("release_rejected", {
        appName: "BadApp",
        versionName: "1.0.0",
        reason: "Contains malware",
      });
      expect(result.subject).toContain("BadApp");
      expect(result.subject).toContain("1.0.0");
      expect(result.subject).toContain("rejected");
    });

    it("includes rejection reason in body", () => {
      const result = buildNotification("release_rejected", {
        appName: "BadApp",
        versionName: "1.0.0",
        reason: "Contains malware",
      });
      expect(result.body).toContain("Contains malware");
    });
  });

  describe("developer_suspended", () => {
    it("includes suspension keyword in subject", () => {
      const result = buildNotification("developer_suspended", {
        reason: "Violation of TOS",
      });
      expect(result.subject).toContain("suspended");
    });

    it("includes reason and appeal info in body", () => {
      const result = buildNotification("developer_suspended", {
        reason: "Violation of TOS",
      });
      expect(result.body).toContain("Violation of TOS");
      expect(result.body).toContain("appeal");
    });
  });

  describe("developer_reinstated", () => {
    it("includes reinstated keyword in subject", () => {
      const result = buildNotification("developer_reinstated", {});
      expect(result.subject).toContain("reinstated");
    });

    it("mentions resuming publishing in body", () => {
      const result = buildNotification("developer_reinstated", {});
      expect(result.body).toContain("publishing");
    });
  });

  describe("report_submitted", () => {
    it("includes report type and target in body", () => {
      const result = buildNotification("report_submitted", {
        reportType: "spam",
        targetType: "app",
        targetId: "app-123",
      });
      expect(result.body).toContain("spam");
      expect(result.body).toContain("app");
      expect(result.body).toContain("app-123");
    });

    it("includes report keyword in subject", () => {
      const result = buildNotification("report_submitted", {
        reportType: "spam",
        targetType: "app",
        targetId: "app-123",
      });
      expect(result.subject).toContain("report");
    });
  });

  describe("report_resolved", () => {
    it("includes target type and resolution status in body", () => {
      const result = buildNotification("report_resolved", {
        targetType: "developer",
        status: "actioned",
      });
      expect(result.body).toContain("developer");
      expect(result.body).toContain("actioned");
    });

    it("includes resolved keyword in subject", () => {
      const result = buildNotification("report_resolved", {
        targetType: "developer",
        status: "dismissed",
      });
      expect(result.subject).toContain("resolved");
    });
  });

  describe("scan_complete", () => {
    it("includes app name and version in subject", () => {
      const result = buildNotification("scan_complete", {
        appName: "SecureApp",
        versionName: "3.0.0",
        riskScore: "12",
      });
      expect(result.subject).toContain("SecureApp");
      expect(result.subject).toContain("3.0.0");
    });

    it("includes risk score in body", () => {
      const result = buildNotification("scan_complete", {
        appName: "SecureApp",
        versionName: "3.0.0",
        riskScore: "42",
      });
      expect(result.body).toContain("42");
      expect(result.body).toContain("100");
    });
  });

  describe("review_posted", () => {
    it("includes app name in subject", () => {
      const result = buildNotification("review_posted", {
        appName: "MyApp",
        rating: "5",
      });
      expect(result.subject).toContain("MyApp");
    });

    it("includes rating in body", () => {
      const result = buildNotification("review_posted", {
        appName: "MyApp",
        rating: "3",
      });
      expect(result.body).toContain("3");
      expect(result.body).toContain("MyApp");
    });
  });
});
