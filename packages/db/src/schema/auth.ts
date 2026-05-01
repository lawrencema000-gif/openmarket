// Better Auth tables.
//
// These are owned by Better Auth — schema dictated by the SDK. Our domain
// tables (`users`, `developers`) reference `auth_user.id` via FK so the same
// person can be both a storefront user and a developer with a single login.
//
// Why prefixed table names: our existing `users` table is the storefront
// profile, conceptually different from Better Auth's monolithic identity
// table. Prefixing Better Auth's tables avoids the name clash and makes
// the boundary obvious.
//
// Keep this file aligned with Better Auth's expected schema. If Better Auth
// is upgraded across a major version, regenerate via:
//   npx @better-auth/cli@latest generate --output packages/db/src/schema/auth.ts
// then merge by hand.

// Better Auth generates random 32-char string IDs by default (not Postgres
// UUIDs). We use `text` for the id columns instead of `uuid` to match.
// All FKs from our domain layer to these IDs must also be `text`.

import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const authUser = pgTable(
  "auth_user",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("auth_user_email_idx").on(t.email)],
);

export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => authUser.id, { onDelete: "cascade" })
      .notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("auth_session_token_idx").on(t.token),
    index("auth_session_user_idx").on(t.userId),
  ],
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => authUser.id, { onDelete: "cascade" })
      .notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("auth_account_user_idx").on(t.userId),
    uniqueIndex("auth_account_provider_account_idx").on(t.providerId, t.accountId),
  ],
);

export const authVerification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)],
);
