import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SendInput, SendResult, Transport } from "./transport.js";

export interface DevLogTransportOptions {
  logDir: string;
}

/**
 * Local development transport. Writes each email to the filesystem so you
 * can open the rendered HTML in a browser to preview, and the .txt to verify
 * the plaintext fallback. Never makes a network call.
 *
 * Filesystem layout:
 *   .email-log/
 *     2026-04-30T12-34-56_<id>_subject.html
 *     2026-04-30T12-34-56_<id>_subject.txt
 *     2026-04-30T12-34-56_<id>_meta.json
 */
export class DevLogTransport implements Transport {
  private logDir: string;

  constructor(opts: DevLogTransportOptions) {
    this.logDir = resolve(opts.logDir);
    mkdirSync(this.logDir, { recursive: true });
  }

  name(): "dev-log" {
    return "dev-log";
  }

  async send(input: SendInput): Promise<SendResult> {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safeSubject = input.subject
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .slice(0, 60);
    const stem = `${ts}_${id}_${safeSubject}`;

    const htmlPath = resolve(this.logDir, `${stem}.html`);
    const textPath = resolve(this.logDir, `${stem}.txt`);
    const metaPath = resolve(this.logDir, `${stem}_meta.json`);

    writeFileSync(htmlPath, input.html, "utf8");
    writeFileSync(textPath, input.text, "utf8");
    writeFileSync(
      metaPath,
      JSON.stringify(
        {
          id,
          to: input.to,
          from: input.from,
          subject: input.subject,
          replyTo: input.replyTo,
          tags: input.tags,
          idempotencyKey: input.idempotencyKey,
          renderedAt: ts,
        },
        null,
        2,
      ),
      "utf8",
    );

    console.log(
      `[email:dev-log] ${input.subject} → ${Array.isArray(input.to) ? input.to.join(",") : input.to}\n  html: ${htmlPath}`,
    );

    return { id, provider: "dev-log" };
  }
}
