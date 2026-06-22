import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  appListings,
  apps,
  federatedApps,
  federationBlocklist,
  federationKeys,
  federationPeers,
  releaseArtifacts,
  releases,
} from "@openmarket/db/schema";
import {
  FEDERATION_INDEX_VERSION,
  federationBlockEntrySchema,
  federationIndexEnvelopeSchema,
  federationPeerAddSchema,
  type FederationIndexEnvelope,
  type FederationIndexPayload,
} from "@openmarket/contracts/federation";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { signPayload, verifyPayload } from "../lib/federation-sign";
import type { Variables } from "../lib/types";

export const federationRouter = new Hono<{ Variables: Variables }>();

const FEDERATION_ORIGIN =
  process.env.FEDERATION_ORIGIN ?? "http://localhost:3001";
const FEDERATION_DISPLAY_NAME =
  process.env.FEDERATION_DISPLAY_NAME ?? "OpenMarket (local)";

/**
 * Federation / decentralized index (P4-J).
 *
 * Outgoing surface (PUBLIC):
 *   GET  /federation/index            full signed catalog
 *   GET  /federation/keys             advertised public keys (for peer
 *                                     pinning)
 *
 * Admin surface:
 *   POST /admin/federation/peers      add a peer (pins their public key
 *                                     on first add — TOFU)
 *   POST /admin/federation/peers/:id/ingest
 *                                     pull + verify the peer's latest
 *                                     index, write rows to federated_apps
 *   POST /admin/federation/peers/:id/suspend
 *   POST /admin/federation/blocklist  globally hide a peer entry
 *   GET  /admin/federation/peers      list
 *
 * Public read surface:
 *   GET  /federation/peers            shape of who we federate with
 *   GET  /federation/catalog          paginated federated catalog,
 *                                     blocklist-filtered
 */

async function getOrMintActiveKey() {
  const existing = await db.query.federationKeys.findFirst({
    where: eq(federationKeys.isActive, true),
  });
  if (existing) return existing;

  // Mint a fresh keypair on first use. Pulled in lazily so test mocks
  // can stub the DB and not need a real key.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateKeyPairSync } = await import("node:crypto");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubPem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  const privPem = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  // Strip the PEM header and re-encode the raw 32-byte public key for
  // the wire format peers consume.
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const raw = pubDer.subarray(pubDer.length - 32);
  const pubB64u = raw
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const keyId = `key_${Date.now()}`;
  const [row] = await db
    .insert(federationKeys)
    .values({
      keyId,
      publicKey: pubB64u,
      privateKeyEncrypted: privPem,
      isActive: true,
    })
    .returning();
  // Stash the PEM on a non-persisted property so the signer in the same
  // request doesn't have to re-fetch + re-format.
  return Object.assign(row ?? { keyId, publicKey: pubB64u }, {
    privateKeyEncrypted: privPem,
  });
}

/* -------------------------------------------------------------------------
 *  OUTGOING — public signed feed
 * ----------------------------------------------------------------------- */

federationRouter.get("/federation/keys", async (c) => {
  const rows = await db
    .select({
      keyId: federationKeys.keyId,
      publicKey: federationKeys.publicKey,
      isActive: federationKeys.isActive,
    })
    .from(federationKeys)
    .orderBy(desc(federationKeys.createdAt))
    .limit(20);
  return c.json({ keys: rows });
});

federationRouter.get("/federation/index", async (c) => {
  const key = await getOrMintActiveKey();

  // Build the catalog: published apps that aren't delisted, joined with
  // their current listing + the artifact of their current release.
  //
  // The listing join is a LEFT JOIN, NOT inner: apps.currentListingId is
  // nullable and can be transiently null (e.g. mid-edit), and an INNER
  // JOIN would silently DROP an otherwise-published app from the entire
  // federated catalog. Release + artifact stay INNER — an app genuinely
  // can't federate without a published release+artifact, so excluding
  // those is correct rather than data-lossy.
  const rows = await db
    .select({
      app: apps,
      listing: appListings,
      release: releases,
      artifact: releaseArtifacts,
    })
    .from(apps)
    .leftJoin(appListings, eq(appListings.id, apps.currentListingId))
    .innerJoin(releases, eq(releases.appId, apps.id))
    .innerJoin(releaseArtifacts, eq(releaseArtifacts.releaseId, releases.id))
    .where(
      and(
        eq(apps.isPublished, true),
        eq(apps.isDelisted, false),
        eq(releases.status, "published"),
      ),
    )
    .orderBy(desc(releases.publishedAt))
    .limit(10_000);

  // Dedup: keep only the highest versionCode per app.
  const byApp = new Map<
    string,
    {
      app: typeof rows[number]["app"];
      listing: typeof rows[number]["listing"];
      release: typeof rows[number]["release"];
      artifact: typeof rows[number]["artifact"];
    }
  >();
  for (const r of rows) {
    const prev = byApp.get(r.app.id);
    if (!prev || prev.release.versionCode < r.release.versionCode) {
      byApp.set(r.app.id, r);
    }
  }

  // Fallback listing for any app whose currentListingId was null/missing.
  // Mirror GET /apps/:id: fall back to the most recent listing for the
  // app. One batched query covers all such apps.
  const missingListingAppIds = Array.from(byApp.values())
    .filter((r) => !r.listing)
    .map((r) => r.app.id);
  const fallbackListings = new Map<string, typeof appListings.$inferSelect>();
  if (missingListingAppIds.length > 0) {
    const fallbackRows = await db
      .select()
      .from(appListings)
      .where(inArray(appListings.appId, missingListingAppIds))
      .orderBy(desc(appListings.createdAt));
    for (const l of fallbackRows) {
      // ordered newest-first → first seen per app wins.
      if (!fallbackListings.has(l.appId)) fallbackListings.set(l.appId, l);
    }
  }

  const payload: FederationIndexPayload = {
    version: FEDERATION_INDEX_VERSION,
    origin: FEDERATION_ORIGIN,
    displayName: FEDERATION_DISPLAY_NAME,
    sequence: Date.now(),
    producedAt: new Date().toISOString(),
    apps: Array.from(byApp.values())
      .map(({ app, listing, release, artifact }) => {
        const resolvedListing = listing ?? fallbackListings.get(app.id) ?? null;
        // An app with zero listings of any kind genuinely has nothing to
        // advertise (no title) — skip it rather than emit an invalid
        // entry that fails the federation schema downstream.
        if (!resolvedListing) {
          console.warn(
            `[federation] skipping app ${app.id} (${app.packageName}) — ` +
              "published with a release but no listing of any kind.",
          );
          return null;
        }
        return {
          remoteAppId: app.id,
          packageName: app.packageName,
          title: resolvedListing.title,
          shortDescription: resolvedListing.shortDescription,
          iconUrl: resolvedListing.iconUrl,
          category: resolvedListing.category,
          versionCode: release.versionCode,
          versionName: release.versionName,
          apkSha256: artifact.sha256,
          downloadUrl: `${FEDERATION_ORIGIN}/apps/${app.id}/download`,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
  };

  const signature = signPayload(key.privateKeyEncrypted, payload);
  const envelope: FederationIndexEnvelope = {
    keyId: key.keyId,
    signature,
    payload,
  };
  return c.json(envelope);
});

/* -------------------------------------------------------------------------
 *  INCOMING — admin pairing + ingestion
 * ----------------------------------------------------------------------- */

federationRouter.post(
  "/admin/federation/peers",
  requireAuth,
  requireAdmin,
  zValidator("json", federationPeerAddSchema),
  async (c) => {
    const input = c.req.valid("json");
    const admin = c.get("admin") as { id: string };

    const existing = await db.query.federationPeers.findFirst({
      where: eq(federationPeers.origin, input.origin),
    });
    if (existing) {
      throw new HTTPException(409, {
        message: "Peer with this origin already registered",
      });
    }

    const [peer] = await db
      .insert(federationPeers)
      .values({
        origin: input.origin,
        displayName: input.displayName,
        publicKey: input.publicKey,
        status: "active",
        approvedBy: admin.id,
        approvedAt: new Date(),
      })
      .returning();
    return c.json({ peer }, 201);
  },
);

federationRouter.post(
  "/admin/federation/peers/:id/suspend",
  requireAuth,
  requireAdmin,
  async (c) => {
    const id = c.req.param("id") as string;
    const [updated] = await db
      .update(federationPeers)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(federationPeers.id, id))
      .returning();
    if (!updated) {
      throw new HTTPException(404, { message: "Peer not found" });
    }
    return c.json({ peer: updated });
  },
);

federationRouter.post(
  "/admin/federation/peers/:id/ingest",
  requireAuth,
  requireAdmin,
  zValidator("json", federationIndexEnvelopeSchema),
  async (c) => {
    const id = c.req.param("id") as string;
    const envelope = c.req.valid("json");

    const peer = await db.query.federationPeers.findFirst({
      where: eq(federationPeers.id, id),
    });
    if (!peer) {
      throw new HTTPException(404, { message: "Peer not found" });
    }
    if (peer.status !== "active") {
      throw new HTTPException(409, {
        message: `Peer is ${peer.status}; reactivate before ingest`,
      });
    }

    // Verify the signature against the peer's pinned public key. This
    // is the trust boundary — refuse anything we can't verify.
    const ok = verifyPayload(
      peer.publicKey,
      envelope.payload,
      envelope.signature,
    );
    if (!ok) {
      await db
        .update(federationPeers)
        .set({
          lastFetchError: "signature verification failed",
          lastFetchErrorAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(federationPeers.id, peer.id));
      throw new HTTPException(400, {
        message: "Signature verification failed against pinned peer key",
      });
    }
    if (envelope.payload.sequence <= peer.lastSequence) {
      throw new HTTPException(409, {
        message: "Stale or duplicate sequence",
      });
    }

    // Replace-on-ingest: simpler for v1 than fancy diffing.
    let inserted = 0;
    for (const entry of envelope.payload.apps) {
      await db
        .insert(federatedApps)
        .values({
          peerId: peer.id,
          remoteAppId: entry.remoteAppId,
          packageName: entry.packageName,
          title: entry.title,
          shortDescription: entry.shortDescription ?? null,
          iconUrl: entry.iconUrl ?? null,
          category: entry.category ?? null,
          signingKeyFingerprint: entry.signingKeyFingerprint ?? null,
          versionCode: entry.versionCode,
          versionName: entry.versionName,
          apkSha256: entry.apkSha256,
          downloadUrl: entry.downloadUrl,
          flags: entry.flags ?? null,
          seenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [federatedApps.peerId, federatedApps.remoteAppId],
          set: {
            packageName: entry.packageName,
            title: entry.title,
            shortDescription: entry.shortDescription ?? null,
            iconUrl: entry.iconUrl ?? null,
            category: entry.category ?? null,
            signingKeyFingerprint: entry.signingKeyFingerprint ?? null,
            versionCode: entry.versionCode,
            versionName: entry.versionName,
            apkSha256: entry.apkSha256,
            downloadUrl: entry.downloadUrl,
            flags: entry.flags ?? null,
            seenAt: new Date(),
            updatedAt: new Date(),
          },
        });
      inserted++;
    }

    await db
      .update(federationPeers)
      .set({
        lastFetchedAt: new Date(),
        lastFetchError: null,
        lastFetchErrorAt: null,
        lastSequence: envelope.payload.sequence,
        updatedAt: new Date(),
      })
      .where(eq(federationPeers.id, peer.id));

    return c.json({ ingested: inserted, sequence: envelope.payload.sequence });
  },
);

federationRouter.post(
  "/admin/federation/blocklist",
  requireAuth,
  requireAdmin,
  zValidator("json", federationBlockEntrySchema),
  async (c) => {
    const input = c.req.valid("json");
    const admin = c.get("admin") as { id: string };

    const peer = await db.query.federationPeers.findFirst({
      where: eq(federationPeers.id, input.peerId),
    });
    if (!peer) throw new HTTPException(404, { message: "Peer not found" });

    const [block] = await db
      .insert(federationBlocklist)
      .values({
        peerId: input.peerId,
        remoteAppId: input.remoteAppId ?? null,
        reason: input.reason,
        createdBy: admin.id,
      })
      .onConflictDoUpdate({
        target: [federationBlocklist.peerId, federationBlocklist.remoteAppId],
        set: { reason: input.reason, createdBy: admin.id },
      })
      .returning();
    return c.json({ block }, 201);
  },
);

federationRouter.get(
  "/admin/federation/peers",
  requireAuth,
  requireAdmin,
  async (c) => {
    const rows = await db
      .select()
      .from(federationPeers)
      .orderBy(desc(federationPeers.createdAt))
      .limit(200);
    return c.json({ peers: rows });
  },
);

/* -------------------------------------------------------------------------
 *  PUBLIC — federated catalog browse
 * ----------------------------------------------------------------------- */

federationRouter.get("/federation/peers", async (c) => {
  const rows = await db
    .select({
      id: federationPeers.id,
      origin: federationPeers.origin,
      displayName: federationPeers.displayName,
      status: federationPeers.status,
      lastFetchedAt: federationPeers.lastFetchedAt,
    })
    .from(federationPeers)
    .where(eq(federationPeers.status, "active"))
    .orderBy(desc(federationPeers.lastFetchedAt))
    .limit(50);
  return c.json({ peers: rows });
});

federationRouter.get("/federation/catalog", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const peerId = c.req.query("peerId") as string | undefined;

  // Load blocklist (full + per-app) to filter the returned catalog.
  const blocks = await db.select().from(federationBlocklist).limit(10_000);
  const blockedPeers = new Set(
    blocks.filter((b) => b.remoteAppId === null).map((b) => b.peerId),
  );
  const blockedPairs = new Set(
    blocks
      .filter((b) => b.remoteAppId !== null)
      .map((b) => `${b.peerId}::${b.remoteAppId}`),
  );

  const query = db
    .select({
      peer: federationPeers,
      entry: federatedApps,
    })
    .from(federatedApps)
    .innerJoin(federationPeers, eq(federationPeers.id, federatedApps.peerId))
    .where(
      and(
        eq(federationPeers.status, "active"),
        peerId ? eq(federatedApps.peerId, peerId) : undefined,
      ),
    )
    .orderBy(desc(federatedApps.seenAt))
    .limit(limit * 2);
  const rows = await query;

  const filtered = rows
    .filter(({ peer, entry }) => {
      if (blockedPeers.has(peer.id)) return false;
      if (blockedPairs.has(`${peer.id}::${entry.remoteAppId}`)) return false;
      return true;
    })
    .slice(0, limit);

  return c.json({
    catalog: filtered.map(({ peer, entry }) => ({
      peer: {
        id: peer.id,
        origin: peer.origin,
        displayName: peer.displayName,
      },
      app: {
        remoteAppId: entry.remoteAppId,
        packageName: entry.packageName,
        title: entry.title,
        shortDescription: entry.shortDescription,
        iconUrl: entry.iconUrl,
        category: entry.category,
        versionCode: entry.versionCode,
        versionName: entry.versionName,
        apkSha256: entry.apkSha256,
        downloadUrl: entry.downloadUrl,
        signingKeyFingerprint: entry.signingKeyFingerprint,
      },
    })),
  });
});
