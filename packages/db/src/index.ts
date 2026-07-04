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
 *
 * Prepared statements are DISABLED when the connection string points at
 * a transaction-mode pooler (PgBouncer / Neon or Supabase pooled
 * endpoints), which breaks named prepares. Detection covers Neon
 * (`-pooler.`), Supabase (`.pooler.` / port 6543), a `pgbouncer=true`
 * query param, or the explicit DB_DISABLE_PREPARE=1 override.
 *
 * NOTE: we deliberately do NOT set `statement_timeout` as a client
 * startup parameter. PgBouncer-based transaction poolers reject unknown
 * startup parameters, which would kill every connection in exactly the
 * pooled serverless deployment this tuning targets. Set the query
 * timeout at the database/role level instead (works through any pooler):
 *   ALTER ROLE <app_role> SET statement_timeout = '30s';
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
    /pooler\./.test(connectionString) || // Neon -pooler. + Supabase .pooler.
    /[?&]pgbouncer=true/.test(connectionString) ||
    /:6543(\/|\?|$)/.test(connectionString) || // Supabase transaction-pooler port
    process.env.DB_DISABLE_PREPARE === "1";

  const client = postgres(connectionString, {
    max: int("DB_POOL_MAX", isServerless ? 5 : 10),
    idle_timeout: int("DB_IDLE_TIMEOUT_SEC", 20),
    connect_timeout: int("DB_CONNECT_TIMEOUT_SEC", 10),
    prepare: !viaPooler,
  });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

export * from "./schema/index";
