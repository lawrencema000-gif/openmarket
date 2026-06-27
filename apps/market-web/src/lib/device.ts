/**
 * Stable, non-PII device identifier used for affiliate attribution.
 *
 * The SAME value must be sent when capturing an affiliate `?ref=` click
 * and later when recording the install — the server attributes a
 * conversion by matching the device hash of a recent click. We persist a
 * random hex token in the `om_device` cookie (1 year). It is not tied to
 * any account and carries no personal data.
 */
const COOKIE = "om_device";

export function getDeviceHash(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)om_device=([^;]+)/);
  if (match?.[1]) return match[1];

  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  document.cookie = `${COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  return id;
}
