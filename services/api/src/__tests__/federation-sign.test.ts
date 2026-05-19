import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  canonicalize,
  signPayload,
  verifyPayload,
} from "../lib/federation-sign";

describe("canonicalize", () => {
  it("sorts object keys", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("recurses into nested objects", () => {
    expect(canonicalize({ a: { z: 1, y: 2 } })).toBe('{"a":{"y":2,"z":1}}');
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("omits undefined entries", () => {
    expect(canonicalize({ a: 1, b: undefined as unknown })).toBe('{"a":1}');
  });

  it("escapes strings via JSON.stringify", () => {
    expect(canonicalize('hello "world"')).toBe('"hello \\"world\\""');
  });
});

describe("Ed25519 sign + verify round-trip", () => {
  it("verifies a signature produced by signPayload", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privPem = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();
    const pubDer = publicKey.export({ type: "spki", format: "der" });
    const raw = pubDer.subarray(pubDer.length - 32);
    const pubB64u = raw
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const payload = {
      origin: "https://example.org",
      sequence: 42,
      apps: [{ id: "abc", versionCode: 1 }],
    };
    const sig = signPayload(privPem, payload);
    expect(verifyPayload(pubB64u, payload, sig)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privPem = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();
    const pubDer = publicKey.export({ type: "spki", format: "der" });
    const raw = pubDer.subarray(pubDer.length - 32);
    const pubB64u = raw
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const sig = signPayload(privPem, { sequence: 1 });
    expect(verifyPayload(pubB64u, { sequence: 2 }, sig)).toBe(false);
  });

  it("rejects a signature from a different key", () => {
    const { privateKey: priv1 } = generateKeyPairSync("ed25519");
    const { publicKey: pub2 } = generateKeyPairSync("ed25519");
    const privPem = priv1.export({ type: "pkcs8", format: "pem" }).toString();
    const pub2Der = pub2.export({ type: "spki", format: "der" });
    const raw = pub2Der.subarray(pub2Der.length - 32);
    const pub2B64u = raw
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const sig = signPayload(privPem, { a: 1 });
    expect(verifyPayload(pub2B64u, { a: 1 }, sig)).toBe(false);
  });
});
