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

export async function hashApkContents(
  apkPath: string,
): Promise<ApkContentHashes> {
  return new Promise((resolve, reject) => {
    const result: ApkContentHashes = { nativeLibs: [], dexFiles: [] };

    yauzl.open(apkPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error("Failed to open APK as zip"));
        return;
      }

      zipfile.on("error", reject);
      zipfile.on("end", () => resolve(result));

      zipfile.on("entry", (entry) => {
        const name: string = entry.fileName;
        const isLib = NATIVE_LIB_RE.test(name);
        const isDex = DEX_RE.test(name);
        if (!isLib && !isDex) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            reject(streamErr ?? new Error(`Failed to read ${name}`));
            return;
          }
          const hash = createHash("sha256");
          stream.on("data", (chunk) => hash.update(chunk));
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
