# OpenMarket search-worker — Fly.io image.
#
# Runs from TypeScript source via tsx. The search-worker has no internal
# @openmarket/* deps (just meilisearch + bullmq), so this is the leanest
# of the worker images.
#
# NODE_ENV is intentionally NOT set here (it would make pnpm skip tsx);
# runtime NODE_ENV=production comes from fly.toml. Note: with
# NODE_ENV=production the worker REQUIRES MEILI_MASTER_KEY to be set
# (resolveMeiliKey fails closed) — set it as a secret.

FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY services/search-worker/package.json ./services/search-worker/
RUN pnpm install --frozen-lockfile --filter "@openmarket/search-worker..."

COPY services/search-worker ./services/search-worker

RUN addgroup -g 10001 -S openmarket \
 && adduser -u 10001 -S openmarket -G openmarket
USER openmarket

WORKDIR /repo/services/search-worker
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
