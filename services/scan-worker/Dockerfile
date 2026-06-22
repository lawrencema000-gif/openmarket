# OpenMarket scan-worker — Fly.io image.
#
# Runs from TypeScript source via tsx. Imports @openmarket/db and
# @openmarket/security-rules (source-only workspace packages with no
# build/dist), which tsx resolves directly from .ts.
#
# NODE_ENV is intentionally NOT set here (it would make pnpm skip tsx);
# runtime NODE_ENV=production comes from fly.toml.

FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY services/scan-worker/package.json ./services/scan-worker/
COPY packages/db/package.json ./packages/db/
COPY packages/security-rules/package.json ./packages/security-rules/
RUN pnpm install --frozen-lockfile --filter "@openmarket/scan-worker..."

COPY packages/db ./packages/db
COPY packages/security-rules ./packages/security-rules
COPY services/scan-worker ./services/scan-worker

RUN addgroup -g 10001 -S openmarket \
 && adduser -u 10001 -S openmarket -G openmarket
USER openmarket

WORKDIR /repo/services/scan-worker
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
