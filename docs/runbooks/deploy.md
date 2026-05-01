# Production deployment runbook

**Goal:** Get the OpenMarket API + workers + frontends running with real DNS, real env vars, and real upstream services. End state: a user can hit `https://openmarket.app`, sign up, install an app, leave a review, and the data lands in production.

**Time estimate (when you start):** ~30 min of clicks across 5 dashboards. I'll narrate each.

## What's already done in code

Everything below is scaffolded and waiting for credentials:

| Concern | Code state | Activate by |
|---|---|---|
| API on Vercel | `services/api/api/index.ts` + `vercel.json` | `vercel link` + env vars + push |
| API/Hono split | `src/app.ts` (pure) + `src/index.ts` (local Node server) | already merged |
| Workers on Fly.io | `services/notify-worker/Dockerfile` + `fly.toml` | `fly launch` + secrets + `fly deploy` |
| Upstash Redis | `services/api/src/lib/redis-connection.ts` reads `REDIS_URL` | set env var |
| Cloudflare R2 | `services/api/src/lib/storage.ts` reads `R2_*` | set env vars |
| Resend | notify-worker `transport/resend.ts` reads `RESEND_API_KEY` | set env var |
| Sentry | All 5 services pre-wired, no-op without DSN | set DSNs in Vercel + Fly secrets |
| Plausible | market-web layout reads `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | set env var |
| Frontend → API URL | All 3 apps read `NEXT_PUBLIC_API_URL` | set env var to deployed API URL |

## Order of operations (strict)

The dependencies dictate this order. Don't skip ahead.

1. **Domain** — register `openmarket.app` (or your final choice) at any registrar, point DNS at Cloudflare.
2. **Cloudflare DNS zone** — add the domain.
3. **Upstash Redis** — provision the database.
4. **Cloudflare R2** — create buckets + API token.
5. **Resend** — verify a sending domain.
6. **Sentry** — create org + projects.
7. **Plausible** — add the site.
8. **Better Stack** — uptime monitors.
9. **Vercel API project** — deploy with all env vars from steps 3–6.
10. **Fly.io workers** — deploy with all secrets.
11. **Vercel frontend env vars** — point at the deployed API.
12. **DNS** — `api.openmarket.app` → Vercel, `cdn.openmarket.app` → R2, `openmarket.app` → market-web Vercel project, etc.
13. **Verification sweep** — sign up flow, upload flow, install flow.

---

## 1. Domain

Pick one and register it. Recommendations from the plan: `openmarket.app` (best for an Android marketplace), `openmarket.dev` as fallback. Point nameservers at Cloudflare during registration.

After: in Cloudflare dashboard, the zone should show "Active". Test:
```bash
dig +short NS openmarket.app
# expect: <something>.ns.cloudflare.com.
```

## 2. Cloudflare DNS records (placeholders for now)

Wait until later steps tell you what to point each record at. Reserved names:

| Record | Purpose |
|---|---|
| `openmarket.app` | market-web (A/CNAME → Vercel) |
| `dev.openmarket.app` | dev-portal (CNAME → Vercel) |
| `admin.openmarket.app` | admin (CNAME → Vercel) |
| `api.openmarket.app` | API (CNAME → Vercel) |
| `cdn.openmarket.app` | media bucket (CNAME → R2) |
| `mail.openmarket.app` | sending domain (records from Resend) |
| `status.openmarket.app` | Better Stack status page (optional) |

## 3. Upstash Redis

1. https://console.upstash.com → "Create database".
2. Name: `openmarket-prod`. Type: Regional. Region: `us-east-1`. Eviction: disabled. TLS: on.
3. After creation, click into the database → "Connect" → "Node.js". Copy the **TCP URL** that starts with `rediss://default:...@<host>:6379`.
4. Save this URL as `REDIS_URL` for later (Vercel API + Fly.io workers).

**Important:** Do NOT use the REST URL (`https://...upstash.io`). BullMQ requires TCP for blocking commands. Workers will silently no-op against the REST URL.

## 4. Cloudflare R2 buckets + API token

1. https://dash.cloudflare.com → Workers & Pages → R2 → "Subscribe" (free tier).
2. Create bucket `openmarket-artifacts`. Settings: private (default).
3. Create bucket `openmarket-media`. Settings: private at first; we'll add public access via custom domain in step 12.
4. R2 → "Manage R2 API Tokens" → "Create API token":
   - Token name: `openmarket-prod`
   - Permission: "Object Read & Write"
   - Buckets: select both
   - TTL: forever (rotate quarterly)
5. Copy the **Access Key ID** and **Secret Access Key**. Save them as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
6. Note your **Cloudflare Account ID** (visible top-right of the R2 dashboard). Save as `R2_ACCOUNT_ID`.

## 5. Resend (email)

1. https://resend.com → sign up.
2. "Domains" → "Add domain" → `openmarket.app`.
3. Resend gives you DNS records (SPF, DKIM x3, optionally MX). Add them to Cloudflare.
4. Wait for verification (~5 min usually).
5. "API Keys" → "Create API key" → permission "Sending access" → save as `RESEND_API_KEY`.

## 6. Sentry

1. https://sentry.io → sign up. Create org `openmarket`.
2. Create 5 projects (one per service):
   - `openmarket-web` (Next.js)
   - `openmarket-dev-portal` (Next.js)
   - `openmarket-admin` (Next.js)
   - `openmarket-api` (Node.js)
   - `openmarket-notify-worker` (Node.js)
3. Each project gives you a DSN. Save them — they go into different services' env vars.
4. (Optional) Account settings → API Auth Tokens → create one with `project:write` + `org:read`. Save as `SENTRY_AUTH_TOKEN` for source-map upload from Vercel builds.

## 7. Plausible

1. https://plausible.io (paid; or self-host community edition).
2. Add site `openmarket.app`.
3. No env-var generation; the script tag uses your domain as the only ID. Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=openmarket.app` on the market-web Vercel project later.

## 8. Better Stack (uptime + log aggregation)

1. https://betterstack.com → "Better Uptime" workspace.
2. Create monitors (after DNS is wired in step 12 — can come back to this):
   - `https://openmarket.app` — keyword `OpenMarket`
   - `https://api.openmarket.app/health` — JSON `status === "ok"`
   - `https://dev.openmarket.app` — keyword check
   - `https://admin.openmarket.app/login` — HTTP 200
3. Set on-call rotation. Email is fine to start. Add Telegram or Slack later.
4. (Optional) Better Stack Logs ("Logtail") — install Vercel-Logtail integration on each project for long-term log retention.

## 9. Deploy the API to Vercel

Run from repo root.

```bash
cd services/api

# Link this directory to a new Vercel project
vercel link
# Choose: Set up and deploy → "openmarket-api" → existing scope or new
# Confirm directory: ./

# Set production env vars (use --sensitive on secrets)
vercel env add DATABASE_URL production
# paste: <Neon pooled URL — already provisioned in P0-A>
vercel env add DATABASE_URL_DIRECT production
# paste: <Neon direct URL>
vercel env add REDIS_URL production --sensitive
# paste: <Upstash rediss:// URL from step 3>
vercel env add BETTER_AUTH_SECRET production --sensitive
# paste: a 32+ char random string (openssl rand -base64 32)
vercel env add BETTER_AUTH_URL production
# paste: https://api.openmarket.app
vercel env add CORS_ORIGINS production
# paste: https://openmarket.app,https://dev.openmarket.app,https://admin.openmarket.app
vercel env add R2_ACCOUNT_ID production
vercel env add R2_ACCESS_KEY_ID production --sensitive
vercel env add R2_SECRET_ACCESS_KEY production --sensitive
vercel env add R2_BUCKET_ARTIFACTS production
# value: openmarket-artifacts
vercel env add R2_BUCKET_MEDIA production
# value: openmarket-media
vercel env add R2_PUBLIC_BASE_URL production
# value: https://cdn.openmarket.app
vercel env add SENTRY_DSN production --sensitive
# paste: <openmarket-api DSN from Sentry>
vercel env add WEB_BASE_URL production
# value: https://openmarket.app

# Deploy
vercel deploy --prod
```

After the first prod deploy, test:
```bash
curl https://<your-vercel-url>/health
# expect: {"status":"ok",...}
```

## 10. Deploy workers to Fly.io

Workers can't run on Vercel serverless — they need long-running processes. Fly.io is the call.

Install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/

```bash
fly auth login

# notify-worker
cd services/notify-worker
fly launch --config fly.toml --no-deploy --copy-config
# answer "no" to setting up Postgres + Redis (we use Upstash + Neon)
fly secrets set \
  DATABASE_URL="<neon pooled url>" \
  REDIS_URL="<upstash rediss url>" \
  RESEND_API_KEY="<resend api key>" \
  SENTRY_DSN="<openmarket-notify-worker dsn>"
fly deploy
fly logs  # watch the worker boot
# expect: [notify-worker] listening on openmarket-notify (Redis ...:6379, transport=resend)
```

Repeat the same pattern for `ingest-worker`, `scan-worker`, `search-worker` once their Dockerfiles are in (they're stubs in v1; deferred until P1-I/J/M).

## 11. Wire frontend env vars on Vercel

For each of the 3 frontend Vercel projects (`openmarket`, `openmarket-dev-portal`, `openmarket-admin`):

```bash
cd apps/<each>
vercel env add NEXT_PUBLIC_API_URL production
# value: https://api.openmarket.app
vercel env add NEXT_PUBLIC_SENTRY_DSN production --sensitive
# value: <project DSN from Sentry>
vercel env add SENTRY_DSN production --sensitive
# value: same DSN
vercel env add NEXT_PUBLIC_WEB_BASE_URL production
# value: https://openmarket.app

# market-web only:
vercel env add NEXT_PUBLIC_PLAUSIBLE_DOMAIN production
# value: openmarket.app

# All 3, redeploy:
vercel deploy --prod
```

## 12. Final DNS wiring

In Cloudflare DNS:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | openmarket.app | `cname.vercel-dns.com` | DNS-only (Vercel handles TLS) |
| CNAME | dev | `cname.vercel-dns.com` | DNS-only |
| CNAME | admin | `cname.vercel-dns.com` | DNS-only |
| CNAME | api | `cname.vercel-dns.com` | DNS-only |
| CNAME | cdn | `<bucket>.<account>.r2.cloudflarestorage.com` | Proxied (Cloudflare CDN) |

For each Vercel project, add the custom domain in the Vercel dashboard ("Settings" → "Domains") so Vercel issues the TLS cert.

For R2 public bucket access (`cdn.openmarket.app`):
- R2 → `openmarket-media` bucket → Settings → "Custom Domains" → add `cdn.openmarket.app`. Cloudflare auto-issues the cert.

## 13. Verification sweep

Run through the user-facing happy path. Each step must work end-to-end:

1. **Storefront**: `curl -I https://openmarket.app` → 200, server `Vercel`.
2. **API health**: `curl https://api.openmarket.app/health` → `{"status":"ok"}`.
3. **CDN**: upload a small file to `openmarket-media` via R2 dashboard, fetch via `https://cdn.openmarket.app/<key>` → 200.
4. **Sign up flow** (when P1-A user accounts ship): sign up via market-web, verify email arrives within 60s.
5. **Developer registration**: register via dev-portal, verify email, log in.
6. **APK upload**: from dev-portal, upload a small test APK, verify it lands in `openmarket-artifacts` (check R2 dashboard), verify the ingest worker on Fly logs picks it up.
7. **Install flow** (when Android client + P1-F ships): install the test app, verify install_event row appears in DB, verify the user shows up in the developer's stats.
8. **Sentry**: throw a test error from any service, confirm it lands in the corresponding Sentry project within 30s.
9. **Plausible**: load `https://openmarket.app` in a private browser tab, confirm Plausible dashboard shows a live visitor.
10. **Better Stack**: confirm all 4 monitors are green.

If any step fails: the runbook for that subsystem (`docs/runbooks/<name>.md`) has troubleshooting.

## Rollback

Each component is independently rollbackable:

- **Vercel**: `vercel rollback` or click any prior deployment in the dashboard → "Promote to Production".
- **Fly.io**: `fly releases list` → `fly deploy --image <prior-image>` or `fly machine update --image <prior-image>`.
- **Database**: Neon point-in-time-restore (see `docs/runbooks/database.md`).
- **DNS**: TTL is short on Cloudflare; revert the record.

## Cost guardrails (so this doesn't bankrupt you in v1)

| Service | Free-tier ceiling | Plan to handle overage |
|---|---|---|
| Neon | 0.5 GB / branch, 1 compute | Upgrade to Pro ($19/mo) at ~50k reviews. |
| Vercel | 100 GB bandwidth/mo, 100 function-hrs | Upgrade to Pro at ~50k MAU. |
| Cloudflare R2 | 10 GB storage, zero egress always | Upgrade to paid R2 above 10 GB. |
| Upstash | 10k commands/day | Upgrade Pay-as-you-go (~$0.20/100k cmds). |
| Resend | 100 emails/day, 3000/mo | Upgrade to $20/mo at ~100k emails. |
| Fly.io | 3 shared-cpu-1x machines free | Pay machine-hours when scaling beyond 3. |
| Sentry | 5k events/mo | Upgrade Team ($26/mo) at ~50k events. |
| Plausible | $9/mo (no free tier on Cloud) | Self-host community edition for free. |
| Better Stack | 10 monitors free | Upgrade at ~30 monitors. |

Total fixed cost at v1 launch: **~$0–9/mo** (just Plausible if you go Cloud).

## Pending after this runbook

- **DMCA designated agent** registration with copyright.gov.
- **Lawyer review** of `/privacy` and `/terms`.
- **PGP key** publication for `/security`.

These don't block deployment but they DO block claiming the platform is "production" in any meaningful sense.
