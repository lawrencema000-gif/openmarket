import yauzl from "yauzl";
import { X509Certificate } from "node:crypto";

/**
 * Extract the APK's signing-certificate fingerprint (P1-I / audit #10).
 *
 * Why this matters: the SIGNING_KEY_CHANGED rejection rule compares this
 * fingerprint against the previous release's. It MUST be the fingerprint
 * of the actual signing certificate — which is STABLE across every build
 * signed with the same key — not a per-build value. The previous code
 * used `sha256(apk).slice(0,16)`, which changes on every build, so it
 * both (a) failed to detect a genuine key swap and (b) rejected every
 * legitimate update as a "key change".
 *
 * Approach: read the v1 (JAR) signature block at META-INF/*.{RSA,DSA,EC}.
 * That file is a PKCS#7 SignedData whose `certificates [0]` field embeds
 * the DER X.509 signing certificate. We walk the DER to the first
 * embedded certificate and hand it to Node's X509Certificate, whose
 * `fingerprint256` getter gives the canonical SHA-256 cert fingerprint
 * (the same value `keytool`/`apksigner` report).
 *
 * v2/v3-only APKs (no META-INF/*.RSA) return null — the caller stores
 * null and the rule skips the comparison rather than inventing a value.
 * Parsing the v2/v3 APK Signing Block is a documented follow-up.
 */

interface Tlv {
  tag: number;
  contentStart: number;
  end: number;
}

function readTlv(buf: Buffer, pos: number): Tlv {
  if (pos + 2 > buf.length) throw new Error("DER: truncated TLV header");
  const tag = buf[pos]!;
  let p = pos + 1;
  let len = buf[p++]!;
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    if (numBytes === 0 || numBytes > 4) {
      throw new Error("DER: unsupported length encoding");
    }
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      if (p >= buf.length) throw new Error("DER: truncated length");
      len = (len << 8) | buf[p++]!;
    }
  }
  const end = p + len;
  if (end > buf.length) throw new Error("DER: content overruns buffer");
  return { tag, contentStart: p, end };
}

const SEQUENCE = 0x30;
const OID = 0x06;
const CONTEXT_0 = 0xa0;

/**
 * Given the bytes of a PKCS#7 SignedData (a .RSA/.DSA/.EC file), return
 * the DER of the first embedded X.509 certificate, or null if the shape
 * doesn't match what we expect.
 */
export function extractFirstCertDer(pkcs7: Buffer): Buffer | null {
  try {
    // ContentInfo ::= SEQUENCE { contentType OID, content [0] EXPLICIT }
    const contentInfo = readTlv(pkcs7, 0);
    if (contentInfo.tag !== SEQUENCE) return null;

    let pos = contentInfo.contentStart;
    const contentType = readTlv(pkcs7, pos);
    if (contentType.tag !== OID) return null;
    pos = contentType.end;

    const explicit = readTlv(pkcs7, pos); // [0] EXPLICIT
    if (explicit.tag !== CONTEXT_0) return null;

    const signedData = readTlv(pkcs7, explicit.contentStart);
    if (signedData.tag !== SEQUENCE) return null;

    // Walk SignedData's children to the certificates [0] IMPLICIT field.
    // Order: version, digestAlgorithms, encapContentInfo, [0] certificates?
    let child = signedData.contentStart;
    let certificatesField: Tlv | null = null;
    while (child < signedData.end) {
      const tlv = readTlv(pkcs7, child);
      if (tlv.tag === CONTEXT_0) {
        certificatesField = tlv;
        break;
      }
      child = tlv.end;
    }
    if (!certificatesField) return null;

    // certificates [0] IMPLICIT SET OF Certificate — the content is the
    // concatenated Certificate SEQUENCEs. Take the first.
    const firstCert = readTlv(pkcs7, certificatesField.contentStart);
    if (firstCert.tag !== SEQUENCE) return null;
    return pkcs7.subarray(certificatesField.contentStart, firstCert.end);
  } catch {
    return null;
  }
}

/** Normalize Node's "AB:CD:.." fingerprint to lowercase colon-free hex. */
function normalizeFingerprint(fp: string): string {
  return fp.replace(/:/g, "").toLowerCase();
}

function readZipEntry(path: string, matcher: RegExp): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error("Could not open APK as zip"));
        return;
      }
      let settled = false;
      const done = (v: Buffer | null) => {
        if (settled) return;
        settled = true;
        zipfile.close();
        resolve(v);
      };
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (!matcher.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            zipfile.readEntry();
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => done(Buffer.concat(chunks)));
          stream.on("error", () => {
            zipfile.readEntry();
          });
        });
      });
      zipfile.on("end", () => done(null));
      zipfile.on("error", (e) => {
        if (!settled) {
          settled = true;
          reject(e);
        }
      });
    });
  });
}

/**
 * Read the APK at `path` and return its signing-certificate SHA-256
 * fingerprint (lowercase hex, no separators), or null when the APK has
 * no v1 signature block we can read.
 */
export async function extractSigningKeyFingerprint(
  path: string,
): Promise<string | null> {
  const block = await readZipEntry(path, /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i);
  if (!block) return null;
  const certDer = extractFirstCertDer(block);
  if (!certDer) return null;
  try {
    const cert = new X509Certificate(certDer);
    return normalizeFingerprint(cert.fingerprint256);
  } catch {
    return null;
  }
}
