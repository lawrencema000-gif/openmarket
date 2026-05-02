/**
 * Hand-curated blocklist of native lib SHA256s known to be malware.
 *
 * v1 keeps this in-repo so adding a new entry is a code review, not a DB
 * migration. When the list grows past ~100 entries we'll move it to a
 * dedicated table with a maintainer admin UI.
 *
 * Entries should always include:
 *   - sha256 (hex, lowercase)
 *   - shortName (matches what the entry would appear as inside lib/<abi>/)
 *   - reason (citation: VirusTotal hash, AV vendor name, GitHub issue, etc.)
 *   - addedAt (ISO date)
 */

export interface BlockedNativeLib {
  sha256: string;
  shortName: string;
  reason: string;
  addedAt: string;
}

export const BLOCKED_NATIVE_LIBS: BlockedNativeLib[] = [
  // Placeholder so the type-check stays happy. Real entries land via PR.
];

const blockedHashSet = new Set(BLOCKED_NATIVE_LIBS.map((b) => b.sha256.toLowerCase()));

export function isBlockedNativeLib(sha256: string): BlockedNativeLib | null {
  const normalized = sha256.toLowerCase();
  if (!blockedHashSet.has(normalized)) return null;
  return BLOCKED_NATIVE_LIBS.find((b) => b.sha256.toLowerCase() === normalized) ?? null;
}
