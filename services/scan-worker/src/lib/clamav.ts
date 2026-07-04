import { createReadStream } from "node:fs";
import net from "node:net";

/**
 * Minimal clamd client — streams a file through the INSTREAM command.
 *
 * This is the marketplace's HARD malware gate: a FOUND response forces
 * the block band, and an unreachable/errored clamd throws
 * ClamUnavailableError so the scan job retries instead of silently
 * passing an unscanned APK (fail-closed).
 *
 * Config:
 *   CLAMD_HOST — required to enable AV scanning (e.g. "clamav.internal")
 *   CLAMD_PORT — default 3310
 *   CLAMD_TIMEOUT_MS — socket idle timeout, default 120s (big APKs)
 *
 * Protocol (https://linux.die.net/man/8/clamd): send "zINSTREAM\0", then
 * length-prefixed chunks (4-byte big-endian size + data), then a
 * zero-length chunk. clamd replies "stream: OK" or
 * "stream: <Signature> FOUND".
 */

export type ClamOutcome =
  | { status: "clean" }
  | { status: "infected"; signature: string }
  | { status: "unconfigured" }
  /**
   * clamd refused to scan the file for a DETERMINISTIC reason (most
   * commonly the APK exceeds StreamMaxLength). Retrying won't help, so
   * this is NOT thrown as ClamUnavailableError — it's a terminal outcome
   * the scanner converts into a mandatory-review finding.
   */
  | { status: "unscannable"; reason: string };

export class ClamUnavailableError extends Error {
  constructor(message: string) {
    super(`ClamAV unavailable: ${message}`);
    this.name = "ClamUnavailableError";
  }
}

export function isClamConfigured(): boolean {
  const host = process.env.CLAMD_HOST;
  return typeof host === "string" && host.length > 0;
}

export async function clamScanFile(filePath: string): Promise<ClamOutcome> {
  if (!isClamConfigured()) return { status: "unconfigured" };

  const host = process.env.CLAMD_HOST as string;
  const port = parseInt(process.env.CLAMD_PORT ?? "3310", 10);
  const timeoutMs = parseInt(process.env.CLAMD_TIMEOUT_MS ?? "120000", 10);

  return new Promise<ClamOutcome>((resolve, reject) => {
    const socket = net.connect({ host, port });
    let response = "";
    let settled = false;
    // Hoisted so the fail()/close handlers can always tear down the open
    // fd — a socket death while the stream is paused for backpressure
    // would otherwise leak it.
    let fileStream: ReturnType<typeof createReadStream> | null = null;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      fileStream?.destroy();
      socket.destroy();
      reject(new ClamUnavailableError(message));
    };

    socket.setTimeout(timeoutMs, () => fail("socket timeout"));
    socket.on("error", (err) => fail(err.message));

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");

      const stream = createReadStream(filePath, {
        highWaterMark: 64 * 1024,
      });
      fileStream = stream;
      stream.on("error", (err) => fail(`read error: ${err.message}`));
      stream.on("data", (chunk: string | Buffer) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(buf.length, 0);
        // Respect backpressure: pause the file stream when the socket
        // buffer is full, resume on drain.
        const ok = socket.write(Buffer.concat([size, buf]));
        if (!ok) {
          stream.pause();
          socket.once("drain", () => stream.resume());
        }
      });
      stream.on("end", () => {
        const zero = Buffer.alloc(4);
        zero.writeUInt32BE(0, 0);
        socket.write(zero);
      });
    });

    socket.on("data", (data) => {
      response += data.toString("utf8");
    });

    socket.on("close", () => {
      if (settled) return;
      settled = true;
      fileStream?.destroy();
      const text = response.replace(/\0/g, "").trim();
      if (text.endsWith("OK")) {
        resolve({ status: "clean" });
        return;
      }
      const found = text.match(/:\s*(.+)\s+FOUND$/);
      if (found) {
        resolve({ status: "infected", signature: found[1]!.trim() });
        return;
      }
      // Size-limit is DETERMINISTIC — retrying the same oversized APK
      // will always hit it. Resolve to a terminal "unscannable" outcome
      // (→ mandatory review) instead of throwing a retryable error and
      // spinning the job through its retry budget with no resolution.
      // Operators should raise clamd's StreamMaxLength above the 500MB
      // upload cap to avoid this path entirely.
      if (/size limit/i.test(text)) {
        resolve({
          status: "unscannable",
          reason: "APK exceeds clamd StreamMaxLength — raise it above the upload cap",
        });
        return;
      }
      // "ERROR", empty response, … → genuinely unexpected → retry.
      reject(new ClamUnavailableError(`unexpected clamd response: "${text}"`));
    });
  });
}
