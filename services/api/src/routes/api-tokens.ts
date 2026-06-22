import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { apiTokens, developers } from "@openmarket/db/schema";
import { db } from "../lib/db";
import { requireAuth, requireAuthVerified } from "../middleware/auth";
import { hashToken, ALLOWED_SCOPES } from "../middleware/api-token";
import type { Variables } from "../lib/types";

export const apiTokensRouter = new Hono<{ Variables: Variables }>();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(ALLOWED_SCOPES)).min(1),
  /** Optional ISO 8601 timestamp for hard expiry. */
  expiresAt: z.string().datetime().optional(),
});

/**
 * Generates an `om_live_<24-hex>` token. The "live" segment is
 * forward-looking — when we add a sandbox tier we'll mint
 * `om_test_<24-hex>` tokens that hit a separate auth path.
 */
function mintToken(): { plaintext: string; prefix: string } {
  const random = randomBytes(18).toString("base64url"); // 24 chars
  const plaintext = `om_live_${random}`;
  return { plaintext, prefix: plaintext.slice(0, 12) };
}

async function getCallerDeveloper(email: string) {
  const dev = await db.query.developers.findFirst({
    where: eq(developers.email, email),
  });
  if (!dev) {
    throw new HTTPException(403, {
      message: "Only registered developers can manage API tokens",
    });
  }
  return dev;
}

/**
 * POST /developers/me/api-tokens
 *
 * Mints a new token. Returns the plaintext ONCE — the dev-portal must
 * surface a copy-it-now warning. Subsequent reads return only the
 * prefix + metadata.
 */
apiTokensRouter.post(
  "/developers/me/api-tokens",
  // Minting a long-lived API credential is exactly the kind of action an
  // unverified account must not take. Listing/revoking stay on requireAuth.
  requireAuthVerified,
  zValidator("json", createSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const developer = await getCallerDeveloper(user.email);

    const { plaintext, prefix } = mintToken();
    const tokenHash = hashToken(plaintext);

    const [created] = await db
      .insert(apiTokens)
      .values({
        developerId: developer.id,
        name: body.name,
        tokenHash,
        prefix,
        scopes: body.scopes,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning();

    return c.json(
      {
        id: created!.id,
        name: created!.name,
        prefix: created!.prefix,
        scopes: created!.scopes,
        expiresAt: created!.expiresAt,
        createdAt: created!.createdAt,
        // ONLY returned on creation. Never recoverable.
        token: plaintext,
      },
      201,
    );
  },
);

/** GET /developers/me/api-tokens — list active + revoked, no plaintext. */
apiTokensRouter.get(
  "/developers/me/api-tokens",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const developer = await getCallerDeveloper(user.email);
    const items = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        scopes: apiTokens.scopes,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
        revokedAt: apiTokens.revokedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.developerId, developer.id))
      .orderBy(desc(apiTokens.createdAt));
    return c.json({ items });
  },
);

/** DELETE /developers/me/api-tokens/:id — soft-revoke. */
apiTokensRouter.delete(
  "/developers/me/api-tokens/:id",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const tokenId = c.req.param("id") as string;
    const developer = await getCallerDeveloper(user.email);

    const result = await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiTokens.id, tokenId),
          eq(apiTokens.developerId, developer.id),
          isNull(apiTokens.revokedAt),
        ),
      )
      .returning({ id: apiTokens.id });

    if (result.length === 0) {
      throw new HTTPException(404, {
        message: "Token not found, not owned by you, or already revoked",
      });
    }
    return c.json({ success: true, revoked: result[0]!.id });
  },
);
