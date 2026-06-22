import { describe, it, expect } from "vitest";
import {
  extractCertFromSigningBlock,
  extractFirstCertDer,
} from "../signing-cert.js";

/** Encode a DER TLV with short-form length (content < 128 bytes). */
function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag, content.length]), content]);
}

describe("extractFirstCertDer (PKCS#7 cert navigation)", () => {
  it("returns the first embedded Certificate SEQUENCE from a SignedData", () => {
    const cert1 = tlv(0x30, Buffer.from([0x02, 0x01, 0x2a])); // Certificate #1
    const cert2 = tlv(0x30, Buffer.from([0x02, 0x01, 0x2b])); // Certificate #2
    const certificates = tlv(0xa0, Buffer.concat([cert1, cert2])); // [0] IMPLICIT
    const version = tlv(0x02, Buffer.from([0x01]));
    const digestAlgs = tlv(0x31, Buffer.alloc(0));
    const encap = tlv(0x30, Buffer.alloc(0));
    const signedData = tlv(
      0x30,
      Buffer.concat([version, digestAlgs, encap, certificates]),
    );
    const explicit0 = tlv(0xa0, signedData); // [0] EXPLICIT
    const oid = tlv(
      0x06,
      Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]),
    ); // signedData OID
    const contentInfo = tlv(0x30, Buffer.concat([oid, explicit0]));

    const result = extractFirstCertDer(contentInfo);
    expect(result).not.toBeNull();
    // Must be the FIRST certificate's full TLV, byte-for-byte.
    expect(result!.equals(cert1)).toBe(true);
  });

  it("returns null when there is no certificates field", () => {
    const version = tlv(0x02, Buffer.from([0x01]));
    const digestAlgs = tlv(0x31, Buffer.alloc(0));
    const encap = tlv(0x30, Buffer.alloc(0));
    const signedData = tlv(0x30, Buffer.concat([version, digestAlgs, encap]));
    const explicit0 = tlv(0xa0, signedData);
    const oid = tlv(0x06, Buffer.from([0x2a, 0x86, 0x48]));
    const contentInfo = tlv(0x30, Buffer.concat([oid, explicit0]));

    expect(extractFirstCertDer(contentInfo)).toBeNull();
  });

  it("returns null on garbage input", () => {
    expect(extractFirstCertDer(Buffer.from([0xff, 0x00, 0x01]))).toBeNull();
    expect(extractFirstCertDer(Buffer.alloc(0))).toBeNull();
  });
});

describe("extractCertFromSigningBlock (APK Signing Block v2/v3)", () => {
  // Little-endian length-prefixed helper (uint32).
  function lp(content: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32LE(content.length, 0);
    return Buffer.concat([len, content]);
  }

  // Build a full APK Signing Block wrapping a single v2/v3 id-value pair.
  function buildBlock(id: number, certDer: Buffer): Buffer {
    // signedData = lp(digests) + lp(certificates) + lp(attributes)
    const digests = lp(Buffer.from([0x01, 0x02])); // opaque
    const certificates = lp(lp(certDer)); // sequence with one cert
    const attributes = lp(Buffer.alloc(0));
    const signedData = lp(Buffer.concat([digests, certificates, attributes]));
    const signatures = lp(Buffer.alloc(0));
    const publicKey = lp(Buffer.alloc(0));
    const signer = lp(Buffer.concat([signedData, signatures, publicKey]));
    const signers = lp(signer);
    const value = signers; // v2/v3 value = uint32-len signers sequence

    // id-value pair: [uint64 len][uint32 id][value]
    const idBuf = Buffer.alloc(4);
    idBuf.writeUInt32LE(id, 0);
    const pairBody = Buffer.concat([idBuf, value]);
    const pairLen = Buffer.alloc(8);
    pairLen.writeBigUInt64LE(BigInt(pairBody.length), 0);
    const pairs = Buffer.concat([pairLen, pairBody]);

    // block = [uint64 size][pairs][uint64 size][magic16]
    const magic = Buffer.from("APK Sig Block 42", "latin1");
    const sizeOfBlock = pairs.length + 8 + magic.length; // trailing size + magic
    const sizeBuf = Buffer.alloc(8);
    sizeBuf.writeBigUInt64LE(BigInt(sizeOfBlock), 0);
    return Buffer.concat([sizeBuf, pairs, sizeBuf, magic]);
  }

  const FAKE_CERT = Buffer.from("FAKE-CERT-DER-BYTES");

  it("extracts the first cert from a v3 block", () => {
    const block = buildBlock(0xf05368c0, FAKE_CERT);
    const cert = extractCertFromSigningBlock(block);
    expect(cert).not.toBeNull();
    expect(cert!.equals(FAKE_CERT)).toBe(true);
  });

  it("extracts the first cert from a v2 block", () => {
    const block = buildBlock(0x7109871a, FAKE_CERT);
    const cert = extractCertFromSigningBlock(block);
    expect(cert!.equals(FAKE_CERT)).toBe(true);
  });

  it("returns null when no v2/v3 pair is present", () => {
    const block = buildBlock(0x12345678, FAKE_CERT); // unknown id
    expect(extractCertFromSigningBlock(block)).toBeNull();
  });

  it("returns null on garbage / truncated input", () => {
    expect(extractCertFromSigningBlock(Buffer.alloc(0))).toBeNull();
    expect(extractCertFromSigningBlock(Buffer.alloc(40))).toBeNull();
  });
});
