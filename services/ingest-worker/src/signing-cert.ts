import yauzl from "yauzl";
import { open } from "node:fs/promises";
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

/* -------------------------------------------------------------------------
 *  APK Signature Scheme v2 / v3 (the "APK Signing Block")
 *
 *  Modern APKs (minSdk >= 24, or apksigner with v1 disabled) ship NO
 *  META-INF/*.RSA — the signing cert lives in the APK Signing Block, a
 *  binary region just before the ZIP central directory:
 *
 *     [ uint64 sizeOfBlock ][ id-value pairs ][ uint64 sizeOfBlock ]
 *     [ 16-byte magic "APK Sig Block 42" ]
 *
 *  The v2 (id 0x7109871a) / v3 (id 0xf05368c0) value embeds the signer's
 *  X.509 certificate. All integers here are LITTLE-endian (per spec),
 *  unlike DER. We extract the first signer's first certificate — the same
 *  cert v1 carries when both are present, so the fingerprint matches.
 * ----------------------------------------------------------------------- */

const APK_SIG_BLOCK_MAGIC = "APK Sig Block 42";
const APK_SIG_V2_ID = 0x7109871a;
const APK_SIG_V3_ID = 0xf05368c0;

/** Read a length-prefixed (uint32 LE) chunk; returns [chunk, nextOffset]. */
function readLenPrefixed(buf: Buffer, offset: number): [Buffer, number] {
  if (offset + 4 > buf.length) throw new Error("sig block: truncated length");
  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + len;
  if (end > buf.length) throw new Error("sig block: chunk overruns");
  return [buf.subarray(start, end), end];
}

/**
 * Given the full APK Signing Block (leading size … trailing magic),
 * return the first signer's first certificate DER, or null. Exported for
 * unit testing the byte-walk independently of file I/O.
 */
export function extractCertFromSigningBlock(block: Buffer): Buffer | null {
  try {
    if (block.length < 32) return null;
    // pairs region sits between the leading uint64 size (8 bytes) and the
    // trailing uint64 size (8) + magic (16).
    const pairs = block.subarray(8, block.length - 24);

    let off = 0;
    let v2: Buffer | null = null;
    let v3: Buffer | null = null;
    while (off + 12 <= pairs.length) {
      const len = Number(pairs.readBigUInt64LE(off));
      off += 8;
      if (len < 4 || off + len > pairs.length) break;
      const id = pairs.readUInt32LE(off);
      const value = pairs.subarray(off + 4, off + len);
      off += len;
      if (id === APK_SIG_V3_ID) v3 = value;
      else if (id === APK_SIG_V2_ID) v2 = value;
    }

    const value = v3 ?? v2; // prefer v3
    if (!value) return null;

    // value = uint32-len signers; first signer; signer = signedData + …;
    // signedData = digests + certificates + attributes; first certificate.
    const [signers] = readLenPrefixed(value, 0);
    const [firstSigner] = readLenPrefixed(signers, 0);
    const [signedData] = readLenPrefixed(firstSigner, 0);
    // signedData: skip digests, then certificates.
    const [, afterDigests] = readLenPrefixed(signedData, 0);
    const [certificates] = readLenPrefixed(signedData, afterDigests);
    const [firstCert] = readLenPrefixed(certificates, 0);
    return firstCert.length > 0 ? Buffer.from(firstCert) : null;
  } catch {
    return null;
  }
}

/** Locate the ZIP central-directory offset via the End-of-Central-Directory. */
async function findCentralDirOffset(
  fh: Awaited<ReturnType<typeof open>>,
  fileSize: number,
): Promise<number | null> {
  // EOCD is within the last 22 bytes + up to 64KB of comment.
  const maxBack = Math.min(fileSize, 0xffff + 22);
  const buf = Buffer.alloc(maxBack);
  await fh.read(buf, 0, maxBack, fileSize - maxBack);
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      const cdOffset = buf.readUInt32LE(i + 16);
      // 0xFFFFFFFF signals Zip64 — not handled (rare for APKs).
      if (cdOffset === 0xffffffff) return null;
      return cdOffset;
    }
  }
  return null;
}

/** Read + parse the v2/v3 signing block from the APK file. */
async function extractV2V3CertDer(path: string): Promise<Buffer | null> {
  let fh: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fh = await open(path, "r");
    const { size } = await fh.stat();
    const cdOffset = await findCentralDirOffset(fh, size);
    if (cdOffset == null || cdOffset < 24) return null;

    // Footer: [uint64 sizeOfBlock][16-byte magic] immediately before the CD.
    const footer = Buffer.alloc(24);
    await fh.read(footer, 0, 24, cdOffset - 24);
    if (footer.toString("latin1", 8, 24) !== APK_SIG_BLOCK_MAGIC) return null;

    const blockSize = Number(footer.readBigUInt64LE(0));
    if (!Number.isSafeInteger(blockSize) || blockSize <= 16) return null;
    const blockStart = cdOffset - blockSize - 8;
    if (blockStart < 0) return null;
    const blockLen = cdOffset - blockStart;
    if (blockLen > 64 * 1024 * 1024) return null; // sanity ceiling

    const block = Buffer.alloc(blockLen);
    await fh.read(block, 0, blockLen, blockStart);
    return extractCertFromSigningBlock(block);
  } catch {
    return null;
  } finally {
    if (fh) await fh.close();
  }
}

/**
 * Read the APK at `path` and return its signing-certificate SHA-256
 * fingerprint (lowercase hex, no separators), or null when no signing
 * certificate can be read (no v1 block and no v2/v3 signing block).
 *
 * Tries v1 (META-INF/*.RSA) first, then falls back to the v2/v3 APK
 * Signing Block — both carry the same certificate, so the fingerprint is
 * identical regardless of which scheme is present.
 */
export async function extractSigningKeyFingerprint(
  path: string,
): Promise<string | null> {
  const block = await readZipEntry(path, /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i);
  let certDer = block ? extractFirstCertDer(block) : null;
  if (!certDer) {
    certDer = await extractV2V3CertDer(path);
  }
  if (!certDer) return null;
  try {
    const cert = new X509Certificate(certDer);
    return normalizeFingerprint(cert.fingerprint256);
  } catch {
    return null;
  }
}
