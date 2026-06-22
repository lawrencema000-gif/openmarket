import { describe, it, expect } from "vitest";
import { extractFirstCertDer } from "../signing-cert.js";

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
