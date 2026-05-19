import { z } from "zod";

/**
 * Federation contracts (P4-J).
 *
 * Two shapes matter:
 *  - the OUTGOING signed index this instance publishes
 *  - the INCOMING peer-published index this instance ingests
 *
 * Both share the same schema; we sign the canonical JSON form (sorted
 * keys, no whitespace) with the instance's Ed25519 private key.
 */

export const FEDERATION_INDEX_VERSION = 1 as const;

/**
 * One entry in the signed index — a single app at a single release.
 * Federated catalogs are flat lists of these; release history is not
 * exchanged in v1.
 */
export const federationAppEntrySchema = z.object({
  remoteAppId: z.string().min(1).max(128),
  packageName: z.string().min(1).max(255),
  title: z.string().min(1).max(200),
  shortDescription: z.string().max(400).optional(),
  iconUrl: z.string().url().optional(),
  category: z.string().max(80).optional(),
  signingKeyFingerprint: z.string().min(40).max(128).optional(),
  versionCode: z.number().int().min(1),
  versionName: z.string().min(1).max(40),
  apkSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  downloadUrl: z.string().url(),
  flags: z.record(z.unknown()).optional(),
});

export type FederationAppEntry = z.infer<typeof federationAppEntrySchema>;

/**
 * The payload signed by the instance. Sequence + producedAt let peers
 * detect replay + skipped indices.
 */
export const federationIndexPayloadSchema = z.object({
  version: z.literal(FEDERATION_INDEX_VERSION),
  origin: z.string().url(),
  displayName: z.string().min(1).max(120),
  sequence: z.number().int().min(0),
  producedAt: z.string().datetime(),
  apps: z.array(federationAppEntrySchema).max(50_000),
});

export type FederationIndexPayload = z.infer<
  typeof federationIndexPayloadSchema
>;

export const federationIndexEnvelopeSchema = z.object({
  /** keyId of the signing key for clean rotation across snapshots. */
  keyId: z.string().min(1).max(128),
  /** Ed25519 signature, base64url. */
  signature: z.string().min(64).max(256),
  payload: federationIndexPayloadSchema,
});

export type FederationIndexEnvelope = z.infer<
  typeof federationIndexEnvelopeSchema
>;

export const federationPeerAddSchema = z.object({
  origin: z.string().url(),
  displayName: z.string().min(1).max(120),
  publicKey: z.string().min(32).max(256),
});
export type FederationPeerAdd = z.infer<typeof federationPeerAddSchema>;

export const federationBlockEntrySchema = z.object({
  peerId: z.string().uuid(),
  remoteAppId: z.string().min(1).max(128).nullable().optional(),
  reason: z.string().min(4).max(500),
});
export type FederationBlockEntry = z.infer<typeof federationBlockEntrySchema>;
