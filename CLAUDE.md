# OpenMarket — Claude Code Instructions

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
- Run `cd infrastructure/docker && docker compose up -d` for local DB

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
