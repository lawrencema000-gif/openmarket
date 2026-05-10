import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { developers } from "./developers";

/**
 * Per-developer API tokens for CI/CD-driven release uploads.
 *
 * Storage discipline:
 *   - tokenHash: SHA-256 of the token. The plain token is shown ONCE
 *     at creation time, then never recoverable. We store the hash so a
 *     DB leak doesn't leak active tokens.
 *   - prefix: first 8 chars of the plaintext token, kept for visual
 *     identification in the dev-portal UI ("om_live_abcd…"). Safe to
 *     show — not enough material to brute-force.
 *
 * Lifecycle:
 *   - createdAt: token issued.
 *   - lastUsedAt: updated on each successful auth (no per-request
 *     write — we sample on the validation path with at-most-once-per-
 *     hour semantics to avoid hot-path writes).
 *   - expiresAt: optional hard expiry (nullable = never expires).
 *   - revokedAt: soft-delete. Revoked tokens reject every request
 *     immediately; the row stays for audit visibility.
 *
 * Scopes encode what the token is allowed to do — start narrow:
 *   - "releases:write"  — POST /api/cli/releases (upload + finalize)
 *   - "releases:read"   — GET /api/releases/* for THIS developer's apps
 *   - "apps:read"       — GET /api/apps for THIS developer's apps
 *
 * A token with "releases:write" implicitly carries "releases:read".
 * The narrow scopes exist so a CI runner can be limited to read-only
 * health checks if that's all it needs.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    /** Human label set by the developer at creation. e.g. "GitHub Actions main". */
    name: text("name").notNull(),
    /** SHA-256 hex of the plaintext token. Lookup key. */
    tokenHash: text("token_hash").notNull(),
    /** First 8 chars of the plaintext token (e.g., "om_live_abcd"). UI-visible. */
    prefix: text("prefix").notNull(),
    /** Scope strings. Validated against a server-side allowlist. */
    scopes: text("scopes").array().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("api_tokens_hash_idx").on(t.tokenHash),
    index("api_tokens_developer_idx").on(t.developerId),
  ],
);
