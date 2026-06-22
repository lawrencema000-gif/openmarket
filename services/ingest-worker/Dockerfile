# OpenMarket ingest-worker — Fly.io image.
#
# Runs from TypeScript source via tsx. The worker imports @openmarket/db
# and @openmarket/security-rules, which are SOURCE-ONLY workspace packages
# (no build/dist), so a compile-to-dist image can't resolve them at
# runtime — tsx resolves the workspace `exports` to .ts directly.
#
# NOTE: NODE_ENV is deliberately NOT set here — that would make pnpm skip
# devDependencies (tsx). Runtime NODE_ENV=production is set in fly.toml.

FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo

# Install the worker's dependency closure (worker + db + security-rules).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY services/ingest-worker/package.json ./services/ingest-worker/
COPY packages/db/package.json ./packages/db/
COPY packages/security-rules/package.json ./packages/security-rules/
RUN pnpm install --frozen-lockfile --filter "@openmarket/ingest-worker..."

# Source for the worker + its workspace deps.
COPY packages/db ./packages/db
COPY packages/security-rules ./packages/security-rules
COPY services/ingest-worker ./services/ingest-worker

RUN addgroup -g 10001 -S openmarket \
 && adduser -u 10001 -S openmarket -G openmarket
USER openmarket

WORKDIR /repo/services/ingest-worker
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
