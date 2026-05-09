import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  users,
} from "@openmarket/db/schema";
import { db } from "./db";
import { enqueueEmail } from "./email";

// BullMQ rejects ":" in job IDs. Hash any user-supplied content before
// using it as part of an idempotency key.
const fingerprint = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 16);

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

const WEB_BASE_URL = env("WEB_BASE_URL") ?? "http://localhost:3000";

/**
 * Account-merge by verified email. Called from Better Auth's
 * `databaseHooks.user.create.after` after a new auth_user row lands.
 *
 * Behavior:
 *   - email already maps to a `users` row WITHOUT auth_user_id
 *     (e.g., the user was first registered as a developer or via a
 *     manual import) → backfill auth_user_id, displayName, avatarUrl.
 *     No welcome email — they were already a user.
 *   - email already maps to a `users` row WITH auth_user_id (this is
 *     a re-signup attempt or a provider-merge — Better Auth handles
 *     the auth side; we keep the existing profile as-is).
 *   - no existing row → create one + send the welcome email.
 *
 * Exported for unit-test isolation. The Better Auth config below is
 * the only production caller.
 */
export async function mergeOrCreateProfileForAuthUser(
  authUserRecord: { id: string; email: string; name?: string | null; image?: string | null },
  deps: {
    db: typeof db;
    enqueueEmail: typeof enqueueEmail;
    welcomeCtaUrl: string;
  } = { db, enqueueEmail, welcomeCtaUrl: WEB_BASE_URL },
): Promise<{ outcome: "merged" | "preserved" | "created" }> {
  const email = authUserRecord.email.toLowerCase();
  const existing = await deps.db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    if (!existing.authUserId) {
      await deps.db
        .update(users)
        .set({
          authUserId: authUserRecord.id,
          displayName: existing.displayName ?? authUserRecord.name,
          avatarUrl: existing.avatarUrl ?? authUserRecord.image,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
      return { outcome: "merged" };
    }
    return { outcome: "preserved" };
  }
  await deps.db.insert(users).values({
    authUserId: authUserRecord.id,
    email,
    displayName: authUserRecord.name,
    avatarUrl: authUserRecord.image,
  });
  await deps.enqueueEmail({
    template: "welcome",
    to: email,
    props: {
      recipientName: authUserRecord.name ?? undefined,
      ctaUrl: deps.welcomeCtaUrl,
    },
    idempotencyKey: `welcome_${authUserRecord.id}`,
    tags: [{ name: "category", value: "auth" }],
  });
  return { outcome: "created" };
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // Map Better Auth's default model names to our prefixed tables. Our domain
    // `users` table is a separate concept (storefront profile); we keep that
    // distinct from Better Auth's identity record by namespacing auth tables.
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await enqueueEmail({
        template: "password-reset",
        to: user.email,
        props: {
          resetUrl: url,
          expiryMinutes: 30,
        },
        idempotencyKey: `password-reset_${user.id}_${fingerprint(url)}`,
        tags: [{ name: "category", value: "auth" }],
      });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await enqueueEmail({
        template: "verify-email",
        to: user.email,
        props: {
          verifyUrl: url,
          expiryMinutes: 60,
        },
        idempotencyKey: `verify-email_${user.id}_${fingerprint(url)}`,
        tags: [{ name: "category", value: "auth" }],
      });
    },
    autoSignInAfterVerification: true,
    sendOnSignUp: true,
  },
  socialProviders: {
    github: {
      clientId: env("GITHUB_CLIENT_ID") ?? "",
      clientSecret: env("GITHUB_CLIENT_SECRET") ?? "",
      enabled: Boolean(env("GITHUB_CLIENT_ID")),
    },
    google: {
      clientId: env("GOOGLE_CLIENT_ID") ?? "",
      clientSecret: env("GOOGLE_CLIENT_SECRET") ?? "",
      enabled: Boolean(env("GOOGLE_CLIENT_ID")),
    },
  },
  secret: env("BETTER_AUTH_SECRET"),
  baseURL: env("BETTER_AUTH_URL"),
  trustedOrigins: [WEB_BASE_URL],
  databaseHooks: {
    user: {
      create: {
        // Auto-create the storefront profile row right after Better Auth
        // inserts the auth_user record. The merge logic is in
        // `mergeOrCreateProfileForAuthUser` so it's unit-testable.
        async after(authUserRecord) {
          await mergeOrCreateProfileForAuthUser(authUserRecord);
        },
      },
    },
  },
});
