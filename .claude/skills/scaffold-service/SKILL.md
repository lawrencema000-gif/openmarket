---
name: scaffold-service
description: Guide for adding a new service (worker or API module) to the OpenMarket monorepo
---

# Scaffold a New Service

## Steps

1. Create `services/<name>/package.json` with:
   - `@openmarket/db` and `@openmarket/contracts` as workspace dependencies
   - `tsx` for dev, `vitest` for tests
   - `dev`, `build`, `test`, `typecheck` scripts

2. Create `services/<name>/tsconfig.json` extending `../../tsconfig.base.json`

3. Create `services/<name>/src/index.ts` as entry point

4. For workers: add BullMQ dependency and create queue/worker setup:
   - Queue name: `openmarket:<service-name>`
   - Connection: `process.env.REDIS_URL`
   - Export processor function for testability

5. Add service to `infrastructure/docker/docker-compose.yml` if it needs its own container

6. Run `pnpm install` from root to link workspace dependencies
