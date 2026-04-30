import { describe, it, expect } from "vitest";
import { renderTemplate } from "../render.js";

describe("renderTemplate", () => {
  it("renders welcome template with HTML, text and dynamic subject", async () => {
    const out = await renderTemplate("welcome", {
      recipientName: "Alex",
      ctaUrl: "https://openmarket.app",
    });
    expect(out.subject).toContain("Alex");
    // Check plain text — HTML has React's <!-- --> comments between text
    // expressions, so substring matches on the rendered HTML are brittle.
    // React Email's plaintext converter uppercases headings; do a case-
    // insensitive match.
    expect(out.text.toLowerCase()).toContain("welcome, alex");
    expect(out.html).toContain("https://openmarket.app");
    expect(out.text).toMatch(/alex/i);
    // No raw React markers leaked
    expect(out.html).not.toMatch(/\$\$typeof|<>$/);
  });

  it("renders welcome with no name (anonymous greeting)", async () => {
    const out = await renderTemplate("welcome", {
      ctaUrl: "https://openmarket.app",
    });
    expect(out.subject).toBe("Welcome to OpenMarket");
    expect(out.html).toContain("Welcome to OpenMarket");
  });

  it("renders verify-email with the verification URL prominent", async () => {
    const out = await renderTemplate("verify-email", {
      verifyUrl: "https://openmarket.app/verify?token=abc123",
      expiryMinutes: 15,
    });
    expect(out.subject).toContain("Confirm");
    expect(out.html).toContain("https://openmarket.app/verify?token=abc123");
    expect(out.text).toContain("15 minutes");
  });

  it("renders password-reset and includes IP when given", async () => {
    const out = await renderTemplate("password-reset", {
      resetUrl: "https://openmarket.app/reset?token=xyz",
      expiryMinutes: 30,
      ipAddress: "10.0.0.1",
    });
    expect(out.html).toContain("https://openmarket.app/reset?token=xyz");
    expect(out.html).toContain("10.0.0.1");
  });

  it("renders release-published with risk score when present", async () => {
    const out = await renderTemplate("release-published", {
      appName: "TestApp",
      versionName: "1.0.0",
      versionCode: 1,
      releaseUrl: "https://openmarket.app/apps/com.test",
      riskScore: 12,
    });
    expect(out.subject).toContain("TestApp");
    expect(out.subject).toContain("1.0.0");
    expect(out.text).toContain("12/100");
  });

  it("renders release-rejected with findings list", async () => {
    const out = await renderTemplate("release-rejected", {
      appName: "TestApp",
      versionName: "1.0.0",
      versionCode: 1,
      reason: "Permission ACCESS_FINE_LOCATION not declared in data safety form",
      findings: ["Missing data-safety entry", "SDK 21 below minimum (24)"],
      fixUrl: "https://dev.openmarket.app/apps/x",
      appealUrl: "https://dev.openmarket.app/apps/x/appeal",
    });
    expect(out.html).toContain("ACCESS_FINE_LOCATION");
    expect(out.html).toContain("Missing data-safety entry");
    expect(out.html).toContain("SDK 21 below minimum");
    expect(out.subject).toContain("TestApp");
    expect(out.subject).toContain("action needed");
  });

  it("renders report-resolved with the right human phrasing per resolution", async () => {
    const delisted = await renderTemplate("report-resolved", {
      reportId: "00000000-0000-0000-0000-000000000000",
      targetType: "app",
      resolution: "delisted",
      transparencyUrl: "https://openmarket.app/transparency-report",
    });
    expect(delisted.html).toContain("delisted");

    const dismissed = await renderTemplate("report-resolved", {
      reportId: "00000000-0000-0000-0000-000000000000",
      targetType: "app",
      resolution: "dismissed",
      transparencyUrl: "https://openmarket.app/transparency-report",
    });
    expect(dismissed.html).toContain("not to take action");
  });

  it("renders developer-takedown with appeal CTA + rule version", async () => {
    const out = await renderTemplate("developer-takedown", {
      appName: "BannedApp",
      reason: "Repackaged copy of an existing app under a different signing key",
      ruleVersion: "v2026-01",
      rulesUrl: "https://openmarket.app/content-policy",
      appealUrl: "https://dev.openmarket.app/appeals/new",
      effectiveAt: "2026-04-30",
    });
    expect(out.html).toContain("v2026-01");
    expect(out.html).toContain("File an appeal");
    expect(out.html).toContain("Repackaged");
    expect(out.subject).toContain("appeal available");
  });

  it("renders review-response", async () => {
    const out = await renderTemplate("review-response", {
      appName: "ChatApp",
      developerName: "Acme Inc.",
      responseBody: "Thanks for the feedback! We've shipped a fix in 2.0.",
      reviewUrl: "https://openmarket.app/apps/com.acme.chat#reviews",
    });
    expect(out.html).toContain("Acme Inc.");
    expect(out.html).toContain("ChatApp");
    expect(out.html).toContain("shipped a fix");
  });

  it("includes brand footer in every email", async () => {
    const out = await renderTemplate("welcome", {
      ctaUrl: "https://openmarket.app",
    });
    expect(out.html).toContain("OpenMarket");
    expect(out.html).toContain("Privacy");
    expect(out.html).toContain("Terms");
  });

  it("plain text and HTML are both non-empty for every template", async () => {
    const samples: Array<[string, () => Promise<{ html: string; text: string }>]> = [
      ["welcome", () => renderTemplate("welcome", { ctaUrl: "x" })],
      ["verify-email", () => renderTemplate("verify-email", { verifyUrl: "x" })],
      ["password-reset", () => renderTemplate("password-reset", { resetUrl: "x" })],
      [
        "release-published",
        () =>
          renderTemplate("release-published", {
            appName: "x",
            versionName: "1",
            versionCode: 1,
            releaseUrl: "x",
          }),
      ],
    ];
    for (const [name, fn] of samples) {
      const r = await fn();
      expect(r.html.length, `${name} html`).toBeGreaterThan(100);
      expect(r.text.length, `${name} text`).toBeGreaterThan(20);
    }
  });
});
