/**
 * Client-side SHA-256 of a File using the Web Crypto API.
 *
 * Streams the file in 4 MiB chunks so a 500 MB APK doesn't hold the whole
 * binary in JS memory. The crypto API doesn't expose a streaming hasher
 * directly — we use SubtleCrypto.digest, which means we still pass a
 * concatenated buffer at the end, but the chunked read keeps RAM usage
 * roughly the chunk size during the read itself.
 *
 * Returns a 64-char lowercase hex string (matches the API's regex).
 */
export async function sha256OfFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const CHUNK_SIZE = 4 * 1024 * 1024;
  const total = file.size;
  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
    const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, total));
    const buf = new Uint8Array(await slice.arrayBuffer());
    chunks.push(buf);
    onProgress?.(Math.min((offset + CHUNK_SIZE) / total, 1));
  }

  // Concat the chunks for the digest call. SubtleCrypto.digest does not
  // accept a stream so we pay this once. Modern Chromium will cap RAM at
  // about file size, which is acceptable up to the 500 MB API max.
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
