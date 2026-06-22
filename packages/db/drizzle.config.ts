import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations run DDL + advisory locks, which Neon's pooled (PgBouncer)
    // endpoint can break — prefer a direct/unpooled connection when one is
    // provided, falling back to DATABASE_URL for local dev. Accept both the
    // DIRECT_URL and DATABASE_URL_DIRECT spellings (the runbook used the
    // latter) so a misnamed var can't silently route DDL through the pooler.
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL_DIRECT ??
      process.env.DATABASE_URL!,
  },
});
