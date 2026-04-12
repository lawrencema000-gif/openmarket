import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db";
import { developers, signingKeys } from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { enrollSigningKeySchema } from "@openmarket/contracts/developers";
import type { Variables } from "../lib/types";

export const signingKeysRouter = new Hono<{ Variables: Variables }>();

// List signing keys for current developer
signingKeysRouter.get("/signing-keys", requireAuth, async (c) => {
  const user = c.get("user");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  const keys = await db.query.signingKeys.findMany({
    where: eq(signingKeys.developerId, developer.id),
  });

  return c.json(keys);
});

// Enroll a new signing key
signingKeysRouter.post(
  "/signing-keys",
  requireAuth,
  zValidator("json", enrollSigningKeySchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    const existing = await db.query.signingKeys.findFirst({
      where: and(
        eq(signingKeys.developerId, developer.id),
        eq(signingKeys.fingerprintSha256, body.fingerprintSha256)
      ),
    });

    if (existing) {
      throw new HTTPException(409, { message: "Signing key already enrolled" });
    }

    const [key] = await db
      .insert(signingKeys)
      .values({
        developerId: developer.id,
        fingerprintSha256: body.fingerprintSha256,
        algorithm: body.algorithm,
        certificatePem: body.certificatePem,
        keySize: body.keySize,
      })
      .returning();

    return c.json(key, 201);
  }
);

// Revoke a signing key
signingKeysRouter.delete("/signing-keys/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const keyId = c.req.param("id") as string;

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  const [revoked] = await db
    .update(signingKeys)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revocationReason: "Revoked by developer",
    })
    .where(
      and(eq(signingKeys.id, keyId), eq(signingKeys.developerId, developer.id))
    )
    .returning();

  if (!revoked) {
    throw new HTTPException(404, { message: "Signing key not found" });
  }

  return c.json(revoked);
});
