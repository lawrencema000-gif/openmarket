# E2E and integration verification

The "code-level (verified)" half of the [Phase 1 DoD checklist](../MASTER-PLAN.md#33-what-phase-1-done-means-after-this-sequence) is green via unit tests. This runbook is for the other half — the items that require a running stack to prove.

There are four pieces. Each one runs independently; you don't need all four every time.

| Piece | Time | Stack required | What it proves |
|---|---|---|---|
| **Smoke: rate-limit** | ~10s | API only | `/search` actually 429s after the configured threshold under real network conditions |
| **Smoke: sitemap** | ~1s | market-web only | `/sitemap.xml` parses, contains every required static path, and points at the correct origin |
| **API integration: moderation chain** | ~3s | API + Postgres | The `report → delist → appeal → relist` chain works end-to-end against a real DB and the transparency hash chain stays intact |
| **Playwright: storefront + upload smoke** | ~30s | Full stack (api + market-web + dev-portal + Postgres + Redis + MinIO + Meilisearch) | The actual user-facing pages load without 500s; the dev-portal upload form has the new step machine wired |

---

## Prereqs (one-time)

```bash
# 1. Bring infra up (Postgres + Redis + Meilisearch + MinIO).
cd infrastructure/docker && docker compose up -d && cd ../..

# 2. Push schema + seed.
pnpm db:push
pnpm db:seed
```

---

## Smoke: rate-limit

```bash
# Boot just the API in another terminal:
pnpm --filter @openmarket/api dev

# In this terminal:
pnpm smoke:rate-limit
```

What it does: 70 quick requests against `/api/search?q=…`, asserts ≥1 returns 429, ≥1 carries `Retry-After`, and the count of 200s is within ±5 of the configured limit (60).

Pass output ends with: `[smoke] PASS — rate limit enforced at ~60 req/window.`

---

## Smoke: sitemap

```bash
# Boot the storefront:
pnpm --filter @openmarket/market-web dev

# In this terminal:
pnpm smoke:sitemap
```

What it does: GETs `/sitemap.xml`, asserts the response is XML, contains a `<urlset>`, every `<loc>` is absolute and on the expected origin, and every required static path (`/`, `/about`, `/anti-features`, `/content-policy`, `/transparency-report`, `/dmca`, `/privacy`, `/terms`, `/security`) is present. Counts apps + categories for visibility (not asserted — depends on DB seed).

---

## API integration: moderation chain

This is the load-bearing proof that the moderation backend works against a real DB. Skipped silently when `INTEGRATION_DB_URL` is unset.

```bash
# Use a scratch schema if you don't want it mixing with dev seed:
export DATABASE_URL=postgresql://openmarket:openmarket@localhost:5432/openmarket_test
export INTEGRATION_DB_URL=$DATABASE_URL
pnpm --filter @openmarket/db push        # against the scratch DB
pnpm --filter @openmarket/api test src/__tests__/integration/
```

Or in one line if your dev DB is fine to TRUNCATE between runs:

```bash
pnpm test:integration
```

What the test does: registers an admin + developer + reporter, creates a published app, reports it, resolves with `delist` (asserts `apps.isDelisted` flipped, transparency event written, audit log row recorded), files an appeal, accepts it (asserts re-list, second transparency event linking to the first via hash chain, second audit row), then runs `verifyChain()` to confirm the chain is intact across both events.

The test TRUNCATEs every table it touches between runs — do not point it at a database with anything you want to keep.

---

## Playwright: storefront + upload smoke

```bash
# Bring the full stack up:
pnpm dev            # boots api + market-web + dev-portal + admin

# Install browsers once:
pnpm --filter @openmarket/e2e install-browsers

# Run:
pnpm e2e
```

The storefront-smoke spec is fully automated — it self-skips if the dev server isn't responding.

The **upload-flow** spec needs an authenticated session because Better Auth's email-verification gating makes the login flow flaky in a smoke. To enable it:

```bash
# 1. Sign in to the dev-portal once at http://localhost:3002 with a
#    verified developer account. Make sure that account already owns
#    at least one app.
# 2. Save the storage state:
npx playwright codegen --save-storage=tests/e2e/.auth/dev.json http://localhost:3002
# 3. Run with the state file:
PLAYWRIGHT_DEV_STATE=tests/e2e/.auth/dev.json pnpm e2e
```

The `.auth/` directory is gitignored — the state file contains a valid session cookie and must never be committed.

### Block 3B follow-up — auth bypass

The upload-flow spec is currently a structure-only test (asserts the form renders with the new step machine). To exercise the full happy path (file pick → hash → upload → poll → outcome) we need:

1. A small `services/api` test-mode auth bypass that accepts an `x-test-user-id` header when `NODE_ENV=test`. Trivially gated; ships with Block 4.
2. A fixture APK at `tests/e2e/fixtures/sample.apk` — minimal valid APK signed with a test key. Generation script: `tools/make-test-apk.sh` (TODO).

Until both land, the upload spec asserts the form structure only. The new flow is also covered indirectly by the API integration test above.

---

## What's still NOT verified

The following items in [§3.3](../MASTER-PLAN.md#33-what-phase-1-done-means-after-this-sequence) require either a multi-step manual walk-through or production-level tooling (CI orchestration, real OAuth endpoints, etc.) and are NOT yet automated:

- End-to-end signup → install → review → report → resolve → appeal → relist with **real Better Auth email verification** (we exercise the chain via direct DB inserts in the integration test)
- OG card validation in the **Meta debugger** (third-party tool; manual)
- `/admin/audit-log` UI walk-through with screenshots (manual)

These will move into the automated set during Block 4's CI orchestration work.
