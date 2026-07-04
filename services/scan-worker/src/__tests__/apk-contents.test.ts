import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import zlib from "node:zlib";
import { hashApkContents } from "../lib/apk-contents.js";

/**
 * Builds a minimal STORED (no compression) zip by hand — an APK is just
 * a zip — and verifies we hash exactly the executable payloads:
 * lib/<abi>/*.so and classes*.dex, nothing else.
 */

interface ZipEntry {
  name: string;
  data: Buffer;
}

function crc32(buf: Buffer): number {
  // node:zlib.crc32 exists on Node ≥ 20.15 / 22.
  return (zlib as unknown as { crc32: (b: Buffer) => number }).crc32(buf) >>> 0;
}

function buildStoredZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header sig
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18); // compressed
    local.writeUInt32LE(entry.data.length, 22); // uncompressed
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central dir sig
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10); // stored
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset

    localParts.push(local, nameBuf, entry.data);
    centralParts.push(central, nameBuf);
    offset += 30 + nameBuf.length + entry.data.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("hashApkContents", () => {
  let dir: string;
  let apkPath: string;
  const soBytes = Buffer.from("ELF-native-lib-bytes");
  const dexBytes = Buffer.from("dex-035-bytecode");
  const dex2Bytes = Buffer.from("dex-035-bytecode-secondary");

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "apk-contents-"));
    apkPath = join(dir, "test.apk");
    writeFileSync(
      apkPath,
      buildStoredZip([
        { name: "AndroidManifest.xml", data: Buffer.from("<manifest/>") },
        { name: "classes.dex", data: dexBytes },
        { name: "classes2.dex", data: dex2Bytes },
        { name: "lib/arm64-v8a/libapp.so", data: soBytes },
        { name: "res/drawable/icon.png", data: Buffer.from("png") },
        // Similar-looking paths that must NOT be hashed:
        { name: "assets/lib/arm64-v8a/decoy.so", data: Buffer.from("decoy") },
        { name: "classesX.dex.bak", data: Buffer.from("bak") },
      ]),
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("hashes native libs and dex files, skipping everything else", async () => {
    const result = await hashApkContents(apkPath);

    expect(result.nativeLibs).toHaveLength(1);
    expect(result.nativeLibs[0]).toEqual({
      path: "lib/arm64-v8a/libapp.so",
      sha256: sha256(soBytes),
    });

    expect(result.dexFiles).toHaveLength(2);
    expect(result.dexFiles.map((d) => d.sha256).sort()).toEqual(
      [sha256(dexBytes), sha256(dex2Bytes)].sort(),
    );
  });

  it("rejects a file that isn't a zip", async () => {
    const bogus = join(dir, "not-a-zip.apk");
    writeFileSync(bogus, "definitely not a zip archive");
    await expect(hashApkContents(bogus)).rejects.toThrow();
  });
});
