import { describe, it, expect } from "vitest";
import { scrubPii } from "../lib/sentry";

describe("scrubPii", () => {
  it("redacts the canonical moderation prose keys at the top level", () => {
    const event = {
      notes: "User reported under their real name: Jane Doe, jane@example.com",
      description: "Has my address: 123 Main St",
      reason: "TOS §3.4 — see the takedown notice CC'd to legal@example.com",
      body: "Appeal — my company's product is not malware, here is our DUNS 12-345-6789",
    };
    scrubPii(event);
    expect(event.notes).toBe("[redacted]");
    expect(event.description).toBe("[redacted]");
    expect(event.reason).toBe("[redacted]");
    expect(event.body).toBe("[redacted]");
  });

  it("recurses into nested objects (Sentry's request.data shape)", () => {
    const event = {
      request: {
        url: "/api/admin/reports/abc/resolve",
        data: {
          resolution: "delist",
          notes: "Confirmed malware via Jane Doe @ acme.com call",
        },
      },
      extra: {
        appealBody: "ignore — different key, must NOT redact",
        report: { description: "PII goes here too" },
      },
    };
    scrubPii(event);
    expect(event.request.data.notes).toBe("[redacted]");
    expect(event.request.data.resolution).toBe("delist"); // non-PII keys untouched
    expect(event.extra.appealBody).toBe("ignore — different key, must NOT redact");
    expect(event.extra.report.description).toBe("[redacted]");
  });

  it("walks arrays of objects (e.g. bulk-resolve payloads)", () => {
    const event = {
      reports: [
        { id: "r-1", description: "containing pii one" },
        { id: "r-2", description: "containing pii two" },
      ],
    };
    scrubPii(event);
    expect(event.reports[0]?.description).toBe("[redacted]");
    expect(event.reports[1]?.description).toBe("[redacted]");
    expect(event.reports[0]?.id).toBe("r-1");
  });

  it("is depth-bounded so a circular ref can't blow the stack", () => {
    const a: Record<string, unknown> = { notes: "redact me" };
    const b: Record<string, unknown> = { parent: a };
    a.child = b;
    expect(() => scrubPii(a)).not.toThrow();
    expect(a.notes).toBe("[redacted]");
  });

  it("passes primitives + null + undefined through untouched", () => {
    expect(scrubPii(undefined)).toBeUndefined();
    expect(scrubPii(null)).toBeNull();
    expect(scrubPii("notes")).toBe("notes");
    expect(scrubPii(42)).toBe(42);
  });
});
