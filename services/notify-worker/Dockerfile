# OpenMarket notify-worker — Fly.io image.
#
# Multi-stage build:
#   1. base: pnpm + corepack + node 22.
#   2. build: install all monorepo deps, build the worker (tsc → dist/).
#   3. runtime: copy production-only deps + dist, run as unprivileged user.
#
# Heads up: pnpm workspaces means we copy the whole monorepo at install time
# but only ship the worker's deps in the final image. Final image stays small
# because pnpm hardlinks deps and we use --prod --frozen-lockfile.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo

# ----- build stage -----
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY services/notify-worker/package.json ./services/notify-worker/
COPY packages/contracts/package.json ./packages/contracts/
RUN pnpm install --frozen-lockfile --filter "@openmarket/notify-worker..."

COPY packages/contracts ./packages/contracts
COPY services/notify-worker ./services/notify-worker

RUN pnpm --filter @openmarket/contracts build || true
RUN pnpm --filter @openmarket/notify-worker build

# ----- runtime stage -----
FROM base AS runtime
ENV NODE_ENV=production
ENV NPM_CONFIG_PRODUCTION=true

# Prod-only deps for the worker.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/notify-worker/package.json ./services/notify-worker/
COPY packages/contracts/package.json ./packages/contracts/
RUN pnpm install --frozen-lockfile --prod --filter "@openmarket/notify-worker..."

# Built artifacts.
COPY --from=build /repo/services/notify-worker/dist ./services/notify-worker/dist
COPY --from=build /repo/packages/contracts/dist ./packages/contracts/dist

# Run as non-root.
RUN addgroup -g 10001 -S openmarket \
 && adduser -u 10001 -S openmarket -G openmarket
USER openmarket

WORKDIR /repo/services/notify-worker
CMD ["node", "dist/index.js"]
