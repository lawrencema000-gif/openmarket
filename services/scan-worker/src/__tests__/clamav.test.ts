import { describe, it, expect, beforeEach, afterEach } from "vitest";
import net from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clamScanFile,
  ClamUnavailableError,
  isClamConfigured,
} from "../lib/clamav.js";

/**
 * Exercises the INSTREAM client against a fake clamd speaking the real
 * wire protocol. Pins the three behaviors that make the AV gate safe:
 * clean passes, FOUND is surfaced with its signature, and any protocol
 * error is a THROW (fail-closed), never a silent pass.
 */

function startFakeClamd(reply: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let received = Buffer.alloc(0);
      let sawTerminator = false;
      socket.on("data", (buf: Buffer) => {
        received = Buffer.concat([received, buf]);
        // The zero-length chunk (4 zero bytes) is always the client's
        // final write, so the accumulated tail marks end-of-stream.
        if (
          !sawTerminator &&
          received.length >= 4 &&
          received.subarray(received.length - 4).equals(Buffer.alloc(4))
        ) {
          sawTerminator = true;
          socket.end(reply);
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

describe("clamScanFile", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clam-test-"));
    file = join(dir, "sample.apk");
    writeFileSync(file, "not really an apk but bytes are bytes");
    delete process.env.CLAMD_HOST;
    delete process.env.CLAMD_PORT;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.CLAMD_HOST;
    delete process.env.CLAMD_PORT;
  });

  it("reports unconfigured when CLAMD_HOST is unset", async () => {
    expect(isClamConfigured()).toBe(false);
    const outcome = await clamScanFile(file);
    expect(outcome).toEqual({ status: "unconfigured" });
  });

  it("returns clean on stream: OK", async () => {
    const fake = await startFakeClamd("stream: OK\0");
    process.env.CLAMD_HOST = "127.0.0.1";
    process.env.CLAMD_PORT = String(fake.port);
    try {
      const outcome = await clamScanFile(file);
      expect(outcome).toEqual({ status: "clean" });
    } finally {
      fake.close();
    }
  });

  it("surfaces the signature on FOUND", async () => {
    const fake = await startFakeClamd("stream: Win.Test.EICAR_HDB-1 FOUND\0");
    process.env.CLAMD_HOST = "127.0.0.1";
    process.env.CLAMD_PORT = String(fake.port);
    try {
      const outcome = await clamScanFile(file);
      expect(outcome).toEqual({
        status: "infected",
        signature: "Win.Test.EICAR_HDB-1",
      });
    } finally {
      fake.close();
    }
  });

  it("returns a deterministic 'unscannable' outcome on the size limit (not a retryable throw)", async () => {
    const fake = await startFakeClamd("INSTREAM size limit exceeded. ERROR\0");
    process.env.CLAMD_HOST = "127.0.0.1";
    process.env.CLAMD_PORT = String(fake.port);
    try {
      const outcome = await clamScanFile(file);
      expect(outcome.status).toBe("unscannable");
    } finally {
      fake.close();
    }
  });

  it("throws (fail-closed) on a genuinely unexpected response", async () => {
    const fake = await startFakeClamd("SOME GARBAGE\0");
    process.env.CLAMD_HOST = "127.0.0.1";
    process.env.CLAMD_PORT = String(fake.port);
    try {
      await expect(clamScanFile(file)).rejects.toThrow(ClamUnavailableError);
    } finally {
      fake.close();
    }
  });

  it("throws (fail-closed) when clamd is unreachable", async () => {
    process.env.CLAMD_HOST = "127.0.0.1";
    process.env.CLAMD_PORT = "1"; // nothing listens here
    await expect(clamScanFile(file)).rejects.toThrow(ClamUnavailableError);
  });
});
