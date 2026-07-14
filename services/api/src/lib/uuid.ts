/**
 * Cheap UUID shape check for path params that feed uuid columns.
 *
 * Postgres throws (→ 500) when a non-UUID string is compared against a uuid
 * column, so /apps/not-a-uuid surfaced as "internal error" and the storefront
 * told users the API was down. A malformed id is a client mistake — routes
 * should treat it exactly like an unknown id: 404.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
