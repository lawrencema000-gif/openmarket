# Database runbook

**Stack:** PostgreSQL 17, Drizzle ORM, postgres-js driver.

**Environments:**
- **local dev** — Docker Postgres via `infrastructure/docker/docker-compose.yml`. Used for everyday development.
- **production** — Neon (provisioning pending — needs `neonctl auth` from user). Will replace local for staging/prod.

## Quick reference

```bash
# Start local stack (Postgres + Redis + Meilisearch)
cd infrastructure/docker && docker compose up -d

# Push schema (dev — no migration files)
pnpm db:push

# Seed initial data (categories + admin developer)
pnpm db:seed

# Open Drizzle Studio GUI
pnpm db:studio

# Stop local stack
cd infrastructure/docker && docker compose down

# Reset local DB (DESTRUCTIVE)
cd infrastructure/docker && docker compose down -v && docker compose up -d
```

## Connection strings

Local Docker (default):
- Pooled: `postgresql://openmarket:openmarket_dev@localhost:5432/openmarket`
- Direct: `postgresql://openmarket:openmarket_dev@localhost:5432/openmarket` (same)

Neon (when provisioned):
- Pooled (for serverless API): `postgres://...neon.tech/neondb?sslmode=require&pgbouncer=true`
- Direct (for migrations + workers): `postgres://...neon.tech/neondb?sslmode=require`

The split matters: `drizzle.config.ts` uses the direct URL for migrations because pgBouncer transaction-mode pooling breaks `LISTEN/NOTIFY` and prepared statements that drizzle-kit emits. Application code uses the pooled URL.

## Where env vars live

- **Local:** `.env` at repo root **AND** `packages/db/.env`. The latter is read by `drizzle-kit` because it executes inside the package directory.
- **Production:** Vercel project settings (per-project: `openmarket`, `openmarket-dev-portal`, `openmarket-admin`, `openmarket-api`). Never committed.

## Schema changes

1. Edit files in `packages/db/src/schema/`.
2. Run `pnpm db:push` (dev) — applies directly without migration file.
3. For production: `pnpm db:generate` to write a migration file under `packages/db/drizzle/`, then `pnpm db:migrate` against the production URL.
4. Update `packages/contracts/` Zod schemas to match.

## Backups

Local: not backed up (it's a dev DB, just `db:reset`).

Neon (when provisioned):
- Auto point-in-time-restore (7 days on free tier, 30 days on Pro).
- Branching: create a snapshot branch with `neonctl branches create --name backup-YYYY-MM-DD --parent main`.
- Weekly mirror to Cloudflare R2 via cron (set up at end of P0-A or in P1-T).

## Restore from PITR (Neon)

```bash
# Create a recovery branch from a timestamp
neonctl branches create --name recovery --parent main --parent-timestamp "2026-04-30T10:00:00Z"

# Get its connection string
neonctl connection-string recovery

# Connect and copy needed data; or promote it as new main if full restore needed
```

## Switching local → production DB

Update both `.env` and `packages/db/.env`:

```bash
# .env
DATABASE_URL=<neon pooled url>
DATABASE_URL_DIRECT=<neon direct url>

# packages/db/.env (drizzle-kit uses this for migrations)
DATABASE_URL=<neon direct url>
```

Then:
```bash
pnpm db:generate         # creates migration files
pnpm db:migrate          # applies to Neon
pnpm db:seed             # seeds categories + admin (idempotent)
```

## Troubleshooting

**"Tenant or user not found"**
The Supabase pooler returns this for IPv4-only clients hitting an IPv6-only pooler. We're not on Supabase anymore — if you see this, you're somehow pointing at an old Supabase URL. Check both `.env` and `packages/db/.env`.

**"DATABASE_URL environment variable is required"**
The process didn't load the `.env`. The API loads it via `services/api/src/lib/env.ts` which searches multiple paths. Other services do `import "dotenv/config"` — for those, run from repo root or set `DOTENV_CONFIG_PATH=/abs/path/to/.env`.

**"connect ECONNREFUSED 127.0.0.1:5432"**
Local Postgres isn't running. `docker ps | grep openmarket-postgres` to check; `docker compose up -d` from `infrastructure/docker/` to start.

**Drizzle Studio won't open**
Tries port 4983 by default. If that's taken: `pnpm --filter @openmarket/db studio --port 4984`.

## Promoting from local → Neon (when ready)

1. User runs `neonctl auth` once (browser flow, ~10s).
2. Run `neonctl projects create --name openmarket --region-id aws-us-east-1`.
3. Capture pooled + direct URLs from `neonctl connection-string main` and `neonctl connection-string main --pooled`.
4. Update both `.env` files.
5. `pnpm db:generate && pnpm db:migrate && pnpm db:seed`.
6. Wire URLs into Vercel project envs (4 projects).
