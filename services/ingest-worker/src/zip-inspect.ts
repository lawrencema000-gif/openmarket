import yauzl from "yauzl";

/**
 * Read the APK ZIP table-of-contents and pluck out:
 *   - native libs (entries under `lib/<abi>/...so`)
 *   - the unique ABI list (deduped)
 *   - whether AndroidManifest.xml is present at all
 *   - whether at least one v1/v2/v3 signing block is present
 *
 * We open the file but never extract — we only need the central directory
 * listing. Avoids unzipping multi-MB DEX files just to learn ABI names.
 */
export interface ZipFacts {
  hasManifest: boolean;
  hasMetaInfSignature: boolean;
  abis: string[];
  nativeLibs: string[];
  totalEntries: number;
}

export function inspectApkZip(path: string): Promise<ZipFacts> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error("Could not open APK as zip"));
        return;
      }

      let hasManifest = false;
      let hasMetaInfSignature = false;
      const abis = new Set<string>();
      const nativeLibs: string[] = [];
      let totalEntries = 0;

      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        totalEntries++;
        const name = entry.fileName;

        if (name === "AndroidManifest.xml") hasManifest = true;
        // v1: META-INF/*.RSA|.DSA|.EC. v2/v3 are detected via APK Signing
        // Block which is *not* a zip entry — that requires reading the
        // raw file. v1 detection here is a useful hint either way.
        if (/^META-INF\/.*\.(RSA|DSA|EC)$/.test(name)) hasMetaInfSignature = true;

        // lib/<abi>/<name>.so
        const libMatch = /^lib\/([^/]+)\/([^/]+\.so)$/.exec(name);
        if (libMatch) {
          abis.add(libMatch[1]!);
          nativeLibs.push(name);
        }

        zipfile.readEntry();
      });

      zipfile.on("end", () => {
        resolve({
          hasManifest,
          hasMetaInfSignature,
          abis: [...abis].sort(),
          nativeLibs,
          totalEntries,
        });
      });

      zipfile.on("error", (e) => reject(e));
    });
  });
}
