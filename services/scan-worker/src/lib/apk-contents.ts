import { createHash } from "node:crypto";
import yauzl from "yauzl";

/**
 * Hash the executable payloads inside an APK: every native library
 * (lib/&lt;abi&gt;/*.so) and every dex file (classes*.dex).
 *
 * These hashes feed the known-bad blocklist check in the scanner —
 * the first time the pipeline actually looks INSIDE the archive
 * instead of scoring metadata about it.
 */

export interface ApkContentHashes {
  /** sha256 (lowercase hex) per native lib, keyed by zip entry path. */
  nativeLibs: Array<{ path: string; sha256: string }>;
  /** sha256 per dex file. */
  dexFiles: Array<{ path: string; sha256: string }>;
}

const NATIVE_LIB_RE = /^lib\/[^/]+\/[^/]+\.so$/;
const DEX_RE = /^classes\d*\.dex$/;

// Zip-bomb defenses. A malicious APK can declare a modest compressed
// size but decompress to gigabytes, or pack tens of thousands of tiny
// matching entries. We only need to hash real .so/.dex payloads, so cap:
//   - per-entry decompressed bytes (skip + flag anything larger),
//   - number of payload entries hashed,
//   - total decompressed bytes across the whole APK.
const MAX_ENTRY_BYTES = 256 * 1024 * 1024; // 256MB per lib/dex
const MAX_PAYLOAD_ENTRIES = 512;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1GB decompressed total
const MAX_ENTRIES_SCANNED = 100_000; // central-directory entry ceiling

export async function hashApkContents(
  apkPath: string,
): Promise<ApkContentHashes> {
  return new Promise((resolve, reject) => {
    const result: ApkContentHashes = { nativeLibs: [], dexFiles: [] };
    let payloadCount = 0;
    let totalBytes = 0;
    let entriesSeen = 0;

    yauzl.open(apkPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error("Failed to open APK as zip"));
        return;
      }

      zipfile.on("error", reject);
      zipfile.on("end", () => resolve(result));

      zipfile.on("entry", (entry) => {
        if (++entriesSeen > MAX_ENTRIES_SCANNED) {
          zipfile.close();
          reject(new Error("APK has too many zip entries (possible zip bomb)"));
          return;
        }

        const name: string = entry.fileName;
        const isLib = NATIVE_LIB_RE.test(name);
        const isDex = DEX_RE.test(name);
        // Skip non-payload entries, oversized single entries, and anything
        // past the payload-count cap — without opening a read stream.
        if (
          (!isLib && !isDex) ||
          entry.uncompressedSize > MAX_ENTRY_BYTES ||
          payloadCount >= MAX_PAYLOAD_ENTRIES
        ) {
          zipfile.readEntry();
          return;
        }

        payloadCount++;
        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            reject(streamErr ?? new Error(`Failed to read ${name}`));
            return;
          }
          const hash = createHash("sha256");
          let entryBytes = 0;
          stream.on("data", (chunk: Buffer) => {
            entryBytes += chunk.length;
            totalBytes += chunk.length;
            // Guard against a lying uncompressedSize header.
            if (entryBytes > MAX_ENTRY_BYTES || totalBytes > MAX_TOTAL_BYTES) {
              stream.destroy();
              zipfile.close();
              reject(new Error("APK decompressed size cap exceeded (possible zip bomb)"));
              return;
            }
            hash.update(chunk);
          });
          stream.on("error", reject);
          stream.on("end", () => {
            const sha256 = hash.digest("hex");
            if (isLib) result.nativeLibs.push({ path: name, sha256 });
            else result.dexFiles.push({ path: name, sha256 });
            zipfile.readEntry();
          });
        });
      });

      zipfile.readEntry();
    });
  });
}
