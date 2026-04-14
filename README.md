# OpenMarket

**The Open Android Marketplace**

A viewpoint-neutral Android app marketplace where developers can publish apps and users can discover, install, and review them — without the gatekeeping of traditional app stores.

---

## Live URLs

| Surface | URL |
|---|---|
| Marketplace | http://localhost:3000 (dev) |
| Developer Portal | http://localhost:3002 (dev) |
| Admin Panel | http://localhost:3003 (dev) |
| API | http://localhost:3001 (dev) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript 5.8 (strict, ESM) |
| Web Apps | Next.js 15 + React 19 + Tailwind CSS 4 |
| API Server | Hono 4 on Node.js |
| Authentication | Better Auth |
| Database | PostgreSQL 17 (Docker) / Neon (production) |
| ORM | Drizzle ORM |
| Job Queue | BullMQ + Redis 7 |
| Search | Meilisearch v1.12 |
| Validation | Zod |
| Testing | Vitest |
| Linting | ESLint 9 + TypeScript ESLint |

---

## Project Structure

```
openmarket/
├── apps/
│   ├── market-web/        # Public marketplace (Next.js, port 3000)
│   ├── dev-portal/        # Developer dashboard (Next.js, port 3002)
│   └── admin/             # Admin panel (Next.js, port 3003)
│
├── services/
│   ├── api/               # Hono REST API (port 3001)
│   ├── ingest-worker/     # APK ingestion + parsing (BullMQ)
│   ├── scan-worker/       # Security scanning (BullMQ)
│   ├── search-worker/     # Meilisearch indexing (BullMQ)
│   └── notify-worker/     # Email / push notifications (BullMQ)
│
├── packages/
│   ├── db/                # Drizzle ORM schema + migrations
│   ├── contracts/         # Zod schemas shared across packages
│   ├── ui/                # Shared React components (clsx + tailwind-merge)
│   └── security-rules/    # APK security rule definitions
│
└── infrastructure/
    └── docker/            # docker-compose.yml + .env.example
```

---

## Quick Start

### Prerequisites

- **Node.js 24+**
- **pnpm 9+** — `npm install -g pnpm`
- **Docker Desktop** (for local PostgreSQL, Redis, Meilisearch)

### 1. Clone and install dependencies

```bash
git clone https://github.com/lawrencema000-gif/openmarket.git
cd openmarket
pnpm install
```

### 2. Start infrastructure

```bash
cd infrastructure/docker
docker compose up -d
cd ../..
```

This starts:
- PostgreSQL 17 on port `5432`
- Redis 7 on port `6379`
- Meilisearch v1.12 on port `7700`

### 3. Create environment file

```bash
cp infrastructure/docker/.env.example .env
```

The defaults work out of the box with the Docker Compose setup. See the [Environment Variables](#environment-variables) section for details.

### 4. Push schema and seed database

```bash
pnpm db:push
pnpm db:seed
```

### 5. Start all dev servers

```bash
pnpm dev
```

Turborepo starts all apps and services in parallel:
- Marketplace: http://localhost:3000
- API: http://localhost:3001
- Developer Portal: http://localhost:3002
- Admin: http://localhost:3003

---

## Available Scripts

Run from the monorepo root with `pnpm <script>`:

| Script | Description |
|---|---|
| `dev` | Start all apps and services in development mode |
| `build` | Build all packages and apps |
| `test` | Run all tests across the monorepo |
| `lint` | Lint all packages |
| `typecheck` | TypeScript type-check all packages |
| `clean` | Remove build artifacts and Turbo cache |
| `format` | Prettier format all `.ts`, `.tsx`, `.json`, `.md` files |
| `validate` | Run typecheck + test + build (CI equivalent) |
| `db:migrate` | Run pending Drizzle migrations |
| `db:push` | Push schema directly to the database (dev only) |
| `db:seed` | Seed categories and initial data |
| `db:studio` | Open Drizzle Studio at http://local.drizzle.studio |

---

## Architecture

### Apps

All web apps are Next.js 15 with the App Router, React 19, and Tailwind CSS 4. They consume the `@openmarket/ui` shared component library.

- **market-web** — browsable app store, search, reviews, download/install flow
- **dev-portal** — developer account management, app publishing, release management, analytics
- **admin** — moderation queue, app approval/rejection, developer management, platform settings

### API Service

`services/api` is a Hono server that exposes a REST API consumed by all three apps. Route groups:

- `/api/auth` — Better Auth session management
- `/api/developers` — developer CRUD + signing keys
- `/api/apps` — app listing, publishing, search
- `/api/releases` — APK upload + release lifecycle
- `/api/reviews` — user reviews and ratings
- `/api/reports` — abuse/content reports
- `/api/categories` — app categories
- `/api/admin` — moderation and platform admin

All routes except public endpoints require authentication via the `requireAuth` middleware.

### Workers

Background jobs run as BullMQ consumers connected to Redis:

- **ingest-worker** — parses uploaded APKs (metadata, permissions, manifest)
- **scan-worker** — runs security rule checks against APK content
- **search-worker** — syncs app data to Meilisearch for full-text search
- **notify-worker** — sends email and push notifications for review status changes

### Packages

- **`@openmarket/db`** — Drizzle ORM schema (developers, apps, releases, users, moderation, security), seed script, and migration config
- **`@openmarket/contracts`** — Zod schemas for all request/response shapes, shared between the API and apps
- **`@openmarket/ui`** — headless React component primitives with Tailwind styling
- **`@openmarket/security-rules`** — rule definitions used by the scan-worker to evaluate APK safety

---

## Environment Variables

Copy `infrastructure/docker/.env.example` to `.env` at the repo root. All services read from this file via `dotenv`.

| Variable | Default (dev) | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://openmarket:openmarket_dev@localhost:5432/openmarket` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection for BullMQ job queues |
| `MEILI_URL` | `http://localhost:7700` | Meilisearch base URL |
| `MEILI_MASTER_KEY` | `openmarket_dev_key` | Meilisearch API master key |
| `BETTER_AUTH_SECRET` | `openmarket-dev-secret-change-in-production` | Secret for Better Auth session signing — **change in production** |
| `BETTER_AUTH_URL` | `http://localhost:3001` | Public URL of the API (used for OAuth callbacks) |
| `GITHUB_CLIENT_ID` | _(empty)_ | GitHub OAuth app client ID (optional in dev) |
| `GITHUB_CLIENT_SECRET` | _(empty)_ | GitHub OAuth app client secret (optional in dev) |
| `GOOGLE_CLIENT_ID` | _(empty)_ | Google OAuth client ID (optional in dev) |
| `GOOGLE_CLIENT_SECRET` | _(empty)_ | Google OAuth client secret (optional in dev) |

---

## Contributing

1. **Schema first** — all database changes go in `packages/db/src/schema/`, then run `pnpm db:push` (dev) or `pnpm db:generate` + `pnpm db:migrate` (production)
2. **Contracts first** — all new API endpoints start with a Zod schema in `packages/contracts/`
3. **TDD** — write Vitest tests before or alongside implementation
4. **TypeScript strict** — no `any`, no skipping type errors
5. **ESM only** — all packages use `"type": "module"` and ESM imports
6. **Barrel exports** — every package exposes its public API through `index.ts`
7. Commit frequently with descriptive messages; keep PRs focused

---

## License

MIT
