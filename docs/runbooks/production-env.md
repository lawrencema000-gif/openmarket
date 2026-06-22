# Production environment variables — the authoritative checklist

Single source of truth for every env var each deployable reads. Set these
per-service: the **API** + **3 frontends** on Vercel, the **4 workers** on
Fly.io. A missing REQUIRED var fails closed or silently breaks a feature —
this list exists to make that impossible to get wrong.

Legend: **R** = required, **O** = optional / feature-gated.

> **Naming footguns (read first):**
> - **`REDIS_URL` must be the TCP `rediss://` URL, not the Upstash REST URL** — BullMQ blocks on it; the REST URL silently no-ops.
> - The **API** reads storage as `R2_*`; the **ingest-worker** accepts `R2_*` **or** `S3_*` (R2 wins). Use `R2_*` everywhere.
> - Migrations use `DIRECT_URL` (also accepts `DATABASE_URL_DIRECT`) — a direct/unpooled Neon URL. Runtime uses the pooled `DATABASE_URL`.
> - **`MEILI_MASTER_KEY` is required in production** — the resolver fails closed (refuses to boot) without it on NODE_ENV=production.
> - **`OPENMARKET_TEST_MODE` must be UNSET in production** — it's an auth bypass for tests (already double-guarded to NODE_ENV≠production, but never set it).
> - All four workers must share the **same `REDIS_URL` as the API**, or queues never connect producer→consumer.

---

## API — `services/api` (Vercel)

| Var | R/O | Notes |
|---|---|---|
| `DATABASE_URL` | **R** | Neon **pooled** connection string (runtime). |
| `DIRECT_URL` | **R** | Neon **direct/unpooled** URL — used by `db:migrate` on prod builds. (`DATABASE_URL_DIRECT` also accepted.) |
| `REDIS_URL` | **R** | Upstash TCP `rediss://…:6379`. Shared with all workers. |
| `BETTER_AUTH_SECRET` | **R** | 32+ char random (`openssl rand -base64 32`). |
| `BETTER_AUTH_URL` | **R** | Public API origin, e.g. `https://api.openmarket.app`. |
| `CORS_ORIGINS` | **R** | Comma-separated storefront/dev-portal/admin origins. |
| `CRON_SECRET` | **R** | Long random string; gates `GET /api/cron/*`. Required for the 5 scheduled jobs. |
| `R2_ACCOUNT_ID` | **R** | Cloudflare account id. |
| `R2_ACCESS_KEY_ID` | **R** | R2 token. |
| `R2_SECRET_ACCESS_KEY` | **R** | R2 token secret. |
| `R2_BUCKET_ARTIFACTS` | **R** | e.g. `openmarket-artifacts`. |
| `R2_BUCKET_MEDIA` | **R** | e.g. `openmarket-media`. |
| `R2_ENDPOINT` | O | Derived from `R2_ACCOUNT_ID` if unset. |
| `R2_PUBLIC_BASE_URL` | O | Public CDN base for media (e.g. `https://cdn.openmarket.app`). |
| `MEILI_URL` | **R** for search | Meilisearch host. |
| `MEILI_MASTER_KEY` | **R** for search | Fails closed in prod if unset. |
| `STOREFRONT_URL` | **R** | Used in Stripe redirect + email links. |
| `DEV_PORTAL_URL` / `DEV_PORTAL_BASE_URL` | O | Payout/team links back to dev-portal. |
| `WEB_BASE_URL` | O | Canonical web origin for absolute links. |
| `STRIPE_DRIVER` | O | `noop` (default — **free launch**) or `stripe` to enable payments. |
| `STRIPE_SECRET_KEY` | **R** if `STRIPE_DRIVER=stripe` | `sk_live_…`. |
| `STRIPE_WEBHOOK_SECRET` | **R** if Stripe | `whsec_…`; verifies `/api/stripe/webhook`. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | O | GitHub OAuth provider. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | O | Google OAuth provider. |
| `FEDERATION_ORIGIN` / `FEDERATION_DISPLAY_NAME` | O | Federated index identity. |
| `WEB_PUSH_DRIVER`, `WEB_BUNDLETOOL_DRIVER` | O | Adapter selectors (default = noop/stub). |
| `SENTRY_DSN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`) | O | Error tracking; no-op without DSN. |

## notify-worker — `services/notify-worker` (Fly.io)

| Var | R/O | Notes |
|---|---|---|
| `DATABASE_URL` | **R** | Pooled Neon. |
| `REDIS_URL` | **R** | Same instance as the API. |
| `RESEND_API_KEY` | **R** | Production email send. |
| `EMAIL_FROM` | **R** | e.g. `OpenMarket <noreply@openmarket.app>`. |
| `EMAIL_REPLY_TO` | O | Reply-to address. |
| `WEB_BASE_URL` | O | Link base in emails. |
| `WORKER_CONCURRENCY` | O | Default 5. |
| `SENTRY_DSN` | O | Error tracking. |

## ingest-worker — `services/ingest-worker` (Fly.io)

| Var | R/O | Notes |
|---|---|---|
| `DATABASE_URL` | **R** | Pooled Neon. |
| `REDIS_URL` | **R** | Same instance as the API. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | **R** | Artifact download. (`S3_*` aliases accepted.) |
| `R2_ENDPOINT` | O | Derived from account id if unset. |
| `WORKER_CONCURRENCY` | O | Default 5. |
| `SENTRY_DSN` | O | Error tracking. |

(The artifact bucket is not an env var here — it arrives in each ingest job.)

## scan-worker — `services/scan-worker` (Fly.io)

| Var | R/O | Notes |
|---|---|---|
| `DATABASE_URL` | **R** | Pooled Neon. |
| `REDIS_URL` | **R** | Same instance as the API. |
| `WORKER_CONCURRENCY` | O | Default 5. |
| `SENTRY_DSN` | O | Error tracking. |

## search-worker — `services/search-worker` (Fly.io)

| Var | R/O | Notes |
|---|---|---|
| `REDIS_URL` | **R** | Same instance as the API (consumes the API's index jobs). |
| `MEILI_URL` | **R** | Meilisearch host. |
| `MEILI_MASTER_KEY` | **R** | Fails closed in prod if unset. |
| `WORKER_CONCURRENCY` | O | Default 5. |
| `SENTRY_DSN` | O | Error tracking. |

## Frontends — market-web / dev-portal / admin (Vercel)

| Var | R/O | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **R** (all 3) | Deployed API origin. |
| `NEXT_PUBLIC_WEB_BASE_URL` | O | Canonical web origin. |
| `NEXT_PUBLIC_STOREFRONT_URL` | O | Cross-app links. |
| `NEXT_PUBLIC_SITE_URL` | O (market-web) | Canonical for SEO/sitemap. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (+ `NEXT_PUBLIC_PLAUSIBLE_HOST`) | O (market-web) | Analytics; no script without it. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | O (market-web) | Web push subscribe. |
| `NEXT_PUBLIC_SENTRY_DSN` | O | Browser error tracking. |

## Platform-managed — DO NOT set by hand

`NODE_ENV`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `NEXT_RUNTIME`,
`PORT`, `HOSTNAME`, `FLY_APP_NAME`, `FLY_MACHINE_ID`,
`FLY_MACHINE_VERSION`, `NEXT_PUBLIC_VERCEL_*` — injected by Vercel/Fly.

## Test/dev only — MUST be absent in production

`OPENMARKET_TEST_MODE` (auth bypass), `INTEGRATION_DB_URL`,
`DOTENV_CONFIG_PATH`, `EMAIL_LOG_DIR`, `VITEST`. The CLI uses
`OPENMARKET_TOKEN` + `OPENMARKET_API_URL` (developer machines, not deploys).

---

## Minimum set for a FREE-marketplace launch

The smallest config that boots a working free store (no payments):

- **API:** `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `CORS_ORIGINS`, `CRON_SECRET`, `R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ARTIFACTS`,
  `R2_BUCKET_MEDIA`, `MEILI_URL`, `MEILI_MASTER_KEY`, `STOREFRONT_URL`.
  (Leave `STRIPE_DRIVER` unset → `noop`.)
- **notify-worker:** `DATABASE_URL`, `REDIS_URL`, `RESEND_API_KEY`,
  `EMAIL_FROM`.
- **ingest-worker:** `DATABASE_URL`, `REDIS_URL`, `R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- **scan-worker:** `DATABASE_URL`, `REDIS_URL`.
- **search-worker:** `REDIS_URL`, `MEILI_URL`, `MEILI_MASTER_KEY`.
- **frontends:** `NEXT_PUBLIC_API_URL`.

Add the Stripe + OAuth + Sentry/Plausible groups when enabling
monetization + observability.
