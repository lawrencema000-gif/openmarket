import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { apiTokens, developers } from "@openmarket/db/schema";
import { db } from "../lib/db";

/**
 * Bearer-token auth for the CLI / CI/CD upload endpoints.
 *
 * Wire format: `Authorization: Bearer om_live_<random>`. We hash the
 * plaintext token with SHA-256 and look it up by `token_hash`.
 *
 * On match we set:
 *   c.get("apiToken") — the apiTokens row
 *   c.get("developer") — the owning developer row
 *   c.get("user") — synthetic { id, email, emailVerified: true } so
 *     downstream code that consults c.get("user") (e.g. recordAdminAction
 *     or the existing email-derived developer lookup) keeps working
 *
 * `requireScope(scope)` is a separate middleware factory that guards
 * specific endpoints. Pure ergonomic — every `requireApiToken` user
 * should follow up with at least one `requireScope` so we get
 * compile-time visibility into what each route needs.
 *
 * lastUsedAt is updated at most once per hour per token to avoid hot-
 * path writes. The skew is fine for the dashboard's "Last used" hint.
 */

const LAST_USED_REFRESH_MS = 60 * 60 * 1000;

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export async function requireApiToken(c: Context, next: Next) {
  const auth = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    throw new HTTPException(401, {
      message: "Missing or malformed Authorization header",
    });
  }
  const plaintext = auth.slice(7).trim();
  if (!plaintext) {
    throw new HTTPException(401, { message: "Empty bearer token" });
  }

  const tokenHash = hashToken(plaintext);
  const token = await db.query.apiTokens.findFirst({
    where: eq(apiTokens.tokenHash, tokenHash),
  });

  if (!token) {
    throw new HTTPException(401, { message: "Invalid API token" });
  }
  if (token.revokedAt) {
    throw new HTTPException(401, { message: "API token has been revoked" });
  }
  if (token.expiresAt && token.expiresAt.getTime() < Date.now()) {
    throw new HTTPException(401, { message: "API token has expired" });
  }

  const developer = await db.query.developers.findFirst({
    where: eq(developers.id, token.developerId),
  });
  if (!developer) {
    throw new HTTPException(401, {
      message: "Developer for this token no longer exists",
    });
  }

  // Best-effort lastUsedAt update. Sampled to once per hour so we
  // don't write on every request.
  if (
    !token.lastUsedAt ||
    Date.now() - token.lastUsedAt.getTime() > LAST_USED_REFRESH_MS
  ) {
    db.update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, token.id))
      .catch((err) => console.warn("[api-token] lastUsedAt update failed:", err));
  }

  c.set("apiToken", token);
  c.set("developer", developer);
  c.set("user", {
    id: developer.id,
    email: developer.email,
    emailVerified: true,
  });
  await next();
}

/**
 * `requireScope("releases:write")` — middleware factory. Compose with
 * `requireApiToken` first.
 *
 * Implicit upgrades: a token with "releases:write" implicitly carries
 * "releases:read" + "apps:read"; a token with "apps:write" implicitly
 * carries "apps:read". Keeps the developer-side mental model simple
 * (no need to tick three boxes when one is enough).
 */
export function requireScope(scope: string) {
  return async function requireScopeMiddleware(c: Context, next: Next) {
    const token = c.get("apiToken") as { scopes: string[] } | undefined;
    if (!token) {
      throw new HTTPException(401, {
        message: "API token required (call requireApiToken first)",
      });
    }
    if (hasScope(token.scopes, scope)) {
      await next();
      return;
    }
    throw new HTTPException(403, {
      message: `API token is missing scope "${scope}"`,
    });
  };
}

export function hasScope(granted: string[], required: string): boolean {
  if (granted.includes(required)) return true;
  // Implicit upgrades.
  if (required === "releases:read" && granted.includes("releases:write")) return true;
  if (required === "apps:read" && granted.includes("apps:write")) return true;
  if (required === "apps:read" && granted.includes("releases:write")) return true;
  return false;
}

export const ALLOWED_SCOPES = [
  "releases:read",
  "releases:write",
  "apps:read",
  "apps:write",
] as const;
export type ApiTokenScope = (typeof ALLOWED_SCOPES)[number];
