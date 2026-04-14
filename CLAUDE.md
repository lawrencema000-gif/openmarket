# OpenMarket — Claude Code Instructions

> Full project documentation: see `/c/Users/lmao/openmarket/README.md`

## Project Overview
OpenMarket is a viewpoint-neutral Android app marketplace. pnpm + Turborepo monorepo.

## Monorepo Structure
- `apps/` — Next.js web apps (market-web, dev-portal, admin)
- `services/api/` — Hono API server
- `services/*-worker/` — BullMQ async workers
- `packages/db/` — Drizzle ORM schema + migrations
- `packages/contracts/` — Zod schemas shared between packages
- `packages/ui/` — Shared React components

## Key Commands
- `pnpm dev` — start all services
- `pnpm test` — run all tests
- `pnpm typecheck` — typecheck all packages
- `pnpm db:push` — push schema to database
- `pnpm db:seed` — seed categories
- `pnpm db:studio` — open Drizzle Studio

## Development Rules
- All API changes start in `packages/contracts/` (Zod schema first)
- Database changes go in `packages/db/src/schema/` then run `pnpm db:generate`
- Write tests before implementation (TDD)
- Use Vitest for all tests
- Commit frequently with descriptive messages

## Database
- PostgreSQL 17 via Docker Compose or Neon
- Drizzle ORM — schema in `packages/db/src/schema/`
- Schema tables: `developers`, `apps`, `releases`, `users`, `moderation`, `security`

### Local DB Setup (step by step)
```bash
# 1. Start Docker services (Postgres + Redis + Meilisearch)
cd infrastructure/docker && docker compose up -d && cd ../..

# 2. Copy environment variables
cp infrastructure/docker/.env.example .env

# 3. Push schema to database (dev — no migration files)
pnpm db:push

# 4. Seed categories and initial data
pnpm db:seed

# 5. (Optional) Open Drizzle Studio GUI
pnpm db:studio
```

### Schema changes
1. Edit files in `packages/db/src/schema/`
2. Run `pnpm db:push` (dev) or `pnpm db:generate` + `pnpm db:migrate` (production)
3. Update `packages/contracts/` Zod schemas to match

## API
- Hono framework at `services/api/`
- Better Auth for authentication
- Zod validation via `@hono/zod-validator`
- All routes require auth via `requireAuth` middleware (except public endpoints)

## File Conventions
- TypeScript everywhere (strict mode)
- ESM (`"type": "module"`)
- Barrel exports via `index.ts` files
- Tests in `__tests__/` directories next to source
