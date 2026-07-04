import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

/**
 * Shared Postgres client factory.
 *
 * Serverless-safe by default. On Vercel every warm function instance
 * holds its own client, so an unbounded per-instance pool exhausts
 * Postgres connection slots under modest traffic — the most likely
 * first production outage. Defaults are tuned for that topology and
 * overridable per-deployment:
 *
 *   DB_POOL_MAX             max connections per client (default: 5 on
 *                           serverless, 10 elsewhere)
 *   DB_IDLE_TIMEOUT_SEC     release idle connections (default 20s)
 *   DB_CONNECT_TIMEOUT_SEC  fail fast when the DB is unreachable (10s)
 *   DB_STATEMENT_TIMEOUT_MS server-side kill for runaway queries (30s)
 *
 * Prepared statements are DISABLED when the connection string points at
 * a transaction-mode pooler (PgBouncer/Neon pooled endpoints), which
 * breaks named prepares. Detection: `-pooler` in the host (Neon
 * convention), a `pgbouncer=true` query param, or DB_DISABLE_PREPARE=1.
 */
export function createDb(connectionString: string) {
  const int = (name: string, fallback: number): number => {
    const raw = process.env[name];
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const isServerless =
    !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  const viaPooler =
    /-pooler\./.test(connectionString) ||
    /[?&]pgbouncer=true/.test(connectionString) ||
    process.env.DB_DISABLE_PREPARE === "1";

  const client = postgres(connectionString, {
    max: int("DB_POOL_MAX", isServerless ? 5 : 10),
    idle_timeout: int("DB_IDLE_TIMEOUT_SEC", 20),
    connect_timeout: int("DB_CONNECT_TIMEOUT_SEC", 10),
    prepare: !viaPooler,
    connection: {
      statement_timeout: int("DB_STATEMENT_TIMEOUT_MS", 30_000),
    },
  });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

export * from "./schema/index";
