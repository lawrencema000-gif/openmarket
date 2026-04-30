import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DevLogTransport } from "../transport/dev-log.js";
import { _resetTransportForTests, getTransport } from "../transport/index.js";

describe("DevLogTransport", () => {
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), "email-log-"));
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  it("writes html, text, and meta files for each send", async () => {
    const t = new DevLogTransport({ logDir });
    const result = await t.send({
      to: "test@example.com",
      subject: "Test subject",
      html: "<p>hello</p>",
      text: "hello",
      tags: [{ name: "template", value: "welcome" }],
    });

    expect(result.provider).toBe("dev-log");
    expect(result.id).toMatch(/^[a-z0-9-]+$/);

    const files = readdirSync(logDir);
    expect(files.length).toBe(3);
    const html = files.find((f) => f.endsWith(".html"))!;
    const text = files.find((f) => f.endsWith(".txt"))!;
    const meta = files.find((f) => f.endsWith("_meta.json"))!;

    expect(readFileSync(join(logDir, html), "utf8")).toBe("<p>hello</p>");
    expect(readFileSync(join(logDir, text), "utf8")).toBe("hello");
    const metaJson = JSON.parse(readFileSync(join(logDir, meta), "utf8"));
    expect(metaJson.to).toBe("test@example.com");
    expect(metaJson.subject).toBe("Test subject");
    expect(metaJson.tags).toEqual([{ name: "template", value: "welcome" }]);
  });

  it("sanitizes subject to a safe filename", async () => {
    const t = new DevLogTransport({ logDir });
    await t.send({
      to: "test@example.com",
      subject: "Subject with /slashes\\ and *stars*",
      html: "x",
      text: "x",
    });
    const files = readdirSync(logDir);
    for (const f of files) {
      expect(f).not.toMatch(/[\/\\\*]/);
    }
  });
});

describe("getTransport()", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    _resetTransportForTests();
  });

  it("uses DevLogTransport when RESEND_API_KEY is unset", () => {
    delete process.env.RESEND_API_KEY;
    _resetTransportForTests();
    const t = getTransport();
    expect(t.name()).toBe("dev-log");
  });

  it("uses DevLogTransport when RESEND_API_KEY is empty string", () => {
    process.env.RESEND_API_KEY = "";
    _resetTransportForTests();
    const t = getTransport();
    expect(t.name()).toBe("dev-log");
  });

  it("uses ResendTransport when RESEND_API_KEY is set", () => {
    process.env.RESEND_API_KEY = "re_test_xxxxx";
    process.env.EMAIL_FROM = "test@openmarket.app";
    _resetTransportForTests();
    const t = getTransport();
    expect(t.name()).toBe("resend");
  });

  it("caches the transport across calls", () => {
    delete process.env.RESEND_API_KEY;
    _resetTransportForTests();
    const a = getTransport();
    const b = getTransport();
    expect(a).toBe(b);
  });
});
