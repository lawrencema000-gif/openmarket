import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Federation / decentralized index (P4-J).
 *
 * Inspired by F-Droid repo index + ActivityPub-style signed feeds:
 *  - This instance publishes a signed `index.json` at /federation/index
 *    listing every app's pubkey-signed metadata. Each app entry pins
 *    its current release sha256, so a peer can verify integrity even
 *    when fetching the artifact from someone else's mirror.
 *  - This instance subscribes to other federated instances. Their
 *    signed feeds are fetched on a cron and ingested into the
 *    `federated_apps` table — a read-only mirror, never the apps
 *    table. The storefront can opt into showing federated results
 *    behind a "federated" tab.
 *
 * Trust model:
 *  - Each peer instance has a long-lived Ed25519 public key. We pin
 *    the key on first add (TOFU-ish) and refuse rotation unless an
 *    admin clears it. Reduces blast radius if a peer is compromised.
 *  - Per-app entries inside a peer's feed must additionally be
 *    signed by the developer's signing key fingerprint (already part
 *    of the apps schema) — the binary identity stays portable across
 *    instances.
 *
 * Out of v1 scope:
 *  - Push notifications between peers (we'll add ActivityPub-style
 *    /inbox + Linked Data Signatures in v2).
 *  - Cross-instance auth / install delivery (federation v1 = read-
 *    only catalog merging, downloads still go to the host instance).
 */

export const federationPeerStatusEnum = pgEnum("federation_peer_status", [
  "pending",
  "active",
  "suspended",
  "removed",
]);

export const federationPeers = pgTable(
  "federation_peers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Origin URL of the peer's federation root (e.g. https://store.example.org). */
    origin: text("origin").notNull(),
    displayName: text("display_name").notNull(),
    /** Ed25519 public key in base64url. Pinned on first add. */
    publicKey: text("public_key").notNull(),
    status: federationPeerStatusEnum("status").default("pending").notNull(),
    /** Soft-trust score 0-100. Reserved for v2 reputation system. */
    trustScore: integer("trust_score").default(50).notNull(),
    /** Last successful index fetch. */
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    /** Last error from a failed fetch + when. Useful for the admin dashboard. */
    lastFetchError: text("last_fetch_error"),
    lastFetchErrorAt: timestamp("last_fetch_error_at", { withTimezone: true }),
    /** Sequence number of the last successfully-processed index. */
    lastSequence: integer("last_sequence").default(0).notNull(),
    /** Admin who approved the pairing. */
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("federation_peers_origin_idx").on(t.origin),
  ],
);

/**
 * Cached, signature-verified app entries from a remote peer. Read-
 * only mirror; the storefront federation tab queries this table
 * directly. We never link federated apps to our own apps/releases
 * tables — keeps the federation surface fundamentally isolated from
 * the moderation surface and lets us drop a whole peer's data in a
 * single DELETE if it misbehaves.
 */
export const federatedApps = pgTable(
  "federated_apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    peerId: uuid("peer_id")
      .references(() => federationPeers.id, { onDelete: "cascade" })
      .notNull(),
    /** Stable identifier the peer assigns to the app within its catalog. */
    remoteAppId: text("remote_app_id").notNull(),
    packageName: text("package_name").notNull(),
    title: text("title").notNull(),
    shortDescription: text("short_description"),
    iconUrl: text("icon_url"),
    category: text("category"),
    /** Developer-attested signing-key fingerprint that signed the binary. */
    signingKeyFingerprint: text("signing_key_fingerprint"),
    /** Current release version. */
    versionCode: integer("version_code").notNull(),
    versionName: text("version_name").notNull(),
    /** APK sha256 the peer attests for this release. */
    apkSha256: text("apk_sha256").notNull(),
    /** Direct fetch URL on the peer. Storefront opens this in-app. */
    downloadUrl: text("download_url").notNull(),
    /**
     * Cross-instance moderation flags the peer surfaced. We don't auto-
     * trust these — they're advisory until an admin reviews them.
     */
    flags: jsonb("flags"),
    /** Last time we saw this entry in the peer's index. */
    seenAt: timestamp("seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** When this entry was first ingested. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("federated_apps_peer_remote_idx").on(t.peerId, t.remoteAppId),
    index("federated_apps_package_idx").on(t.packageName),
  ],
);

/**
 * Tracks an admin's manual decision to globally hide a federated entry
 * (or a whole peer). Drives the "shadow-blocklist" used by the
 * storefront query so a bad federated entry doesn't keep popping back
 * after each re-fetch.
 */
export const federationBlocklist = pgTable(
  "federation_blocklist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    peerId: uuid("peer_id")
      .references(() => federationPeers.id, { onDelete: "cascade" })
      .notNull(),
    /** Null = block the whole peer. */
    remoteAppId: text("remote_app_id"),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("federation_blocklist_peer_app_idx").on(
      t.peerId,
      t.remoteAppId,
    ),
  ],
);

/**
 * The instance's own Ed25519 keypair (single row in practice). We store
 * the private key encrypted at rest by the platform-level KMS; for v1
 * we store it as a base64 blob and let deploy-time secret management
 * worry about its protection.
 *
 * Rotation is supported but rare: write a new row with isActive=true
 * and flip the previous to false. The signed feed's outer envelope
 * embeds keyId so peers can resolve historical signatures.
 */
export const federationKeys = pgTable(
  "federation_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable, immutable identifier emitted in signed envelopes. */
    keyId: text("key_id").notNull(),
    publicKey: text("public_key").notNull(),
    /**
     * Wrapped private key. v1 expects raw base64; v2 should encrypt
     * with KMS and prefix the version. The storefront process is the
     * only consumer.
     */
    privateKeyEncrypted: text("private_key_encrypted").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("federation_keys_key_id_idx").on(t.keyId),
    // At most ONE active signing key may exist at a time. Peers pin the
    // active public key; two active keys would make signature
    // verification non-deterministic. This partial unique index turns the
    // TOCTOU in getOrMintActiveKey() into a hard DB guarantee — a racing
    // second mint fails with 23505 and falls back to the winner's key.
    uniqueIndex("federation_keys_one_active_idx")
      .on(t.isActive)
      .where(sql`is_active = true`),
  ],
);
