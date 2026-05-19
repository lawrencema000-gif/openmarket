import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

/**
 * Federation signing helpers (P4-J).
 *
 * We sign the canonical JSON encoding of the index payload with the
 * instance's Ed25519 private key. Canonical form: keys sorted
 * recursively, no whitespace. Peers re-canonicalize on receive to
 * verify, so the layouts don't depend on JS-engine key order.
 */

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Non-finite number cannot be canonicalized");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys
        .filter((k) => obj[k] !== undefined)
        .map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]))
        .join(",") +
      "}"
    );
  }
  throw new Error(
    `Unsupported value type for canonicalization: ${typeof value}`,
  );
}

function base64urlToBuffer(b64u: string): Buffer {
  const pad = b64u.length % 4 === 0 ? 0 : 4 - (b64u.length % 4);
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(b64, "base64");
}

function bufferToBase64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Signs the canonical JSON of `payload` with the given Ed25519 private
 * key (PKCS#8 PEM). Returns the base64url signature.
 */
export function signPayload(
  privateKeyPem: string,
  payload: unknown,
): string {
  const key = createPrivateKey({ key: privateKeyPem, format: "pem" });
  const signature = sign(null, Buffer.from(canonicalize(payload)), key);
  return bufferToBase64url(signature);
}

export function verifyPayload(
  publicKeyB64u: string,
  payload: unknown,
  signatureB64u: string,
): boolean {
  try {
    const raw = base64urlToBuffer(publicKeyB64u);
    // DER prefix for Ed25519 SubjectPublicKeyInfo
    const derPrefix = Buffer.from(
      "302a300506032b6570032100",
      "hex",
    );
    const der = Buffer.concat([derPrefix, raw]);
    const key = createPublicKey({
      key: der,
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(canonicalize(payload)),
      key,
      base64urlToBuffer(signatureB64u),
    );
  } catch {
    return false;
  }
}
