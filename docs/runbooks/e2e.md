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

The **upload-flow** spec uses the API's test-mode auth bypass (Block 4D) so it doesn't need a real Better Auth session. To enable:

```bash
# 1. Boot the stack with test-mode on. The bypass refuses to engage
#    when NODE_ENV=production, so this is safe to leave in your dev
#    .env.local but never in production env.
OPENMARKET_TEST_MODE=1 NODE_ENV=test pnpm dev

# 2. Pick a real auth_user.id + email from your dev DB (must own at
#    least one app). Drizzle Studio makes this easy:
pnpm db:studio   # → auth_user table → copy id + email
# Or via psql:
#   select id, email from auth_user limit 5;

# 3. Run the spec with the env vars set:
OPENMARKET_TEST_USER_ID=<paste-id> \
OPENMARKET_TEST_USER_EMAIL=<paste-email> \
  pnpm e2e
```

The bypass is a single-purpose hatch: requests that carry both
`x-test-user-id` and `x-test-user-email` headers are accepted as that
user without a Better Auth session lookup. It is gated by
`OPENMARKET_TEST_MODE=1` on the API process AND a non-production
`NODE_ENV`. Production deploys run with `NODE_ENV=production` and
`OPENMARKET_TEST_MODE` unset; the code path is dead in prod.

For end-to-end coverage of the OAuth + email-verification login UI
itself (which the bypass intentionally skips), use the storage-state
pattern:

```bash
# Sign in once manually, then save the cookie jar:
npx playwright codegen --save-storage=tests/e2e/.auth/dev.json http://localhost:3002
# Then in a separate spec, use storageState: "tests/e2e/.auth/dev.json"
```

The `.auth/` directory is gitignored.

### What's still deferred

1. A fixture APK at `tests/e2e/fixtures/sample.apk` — minimal valid APK signed with a test key. Without one, the upload-flow spec only verifies the form structure renders with the new step machine; it doesn't drive the file picker through to a complete upload. Generating a real APK requires `aapt2` + `apksigner` from the Android build-tools — a Block 5 chore.

2. CI orchestration that boots Docker Compose + the dev stack and runs `pnpm e2e` as a gating check on every PR. Today the spec is a developer-facing smoke; the runbook is the contract for how to drive it locally.

---

## What's still NOT verified

The following items in [§3.3](../MASTER-PLAN.md#33-what-phase-1-done-means-after-this-sequence) require either a multi-step manual walk-through or production-level tooling (CI orchestration, real OAuth endpoints, etc.) and are NOT yet automated:

- End-to-end signup → install → review → report → resolve → appeal → relist with **real Better Auth email verification** (we exercise the chain via direct DB inserts in the integration test)
- OG card validation in the **Meta debugger** (third-party tool; manual)
- `/admin/audit-log` UI walk-through with screenshots (manual)

These will move into the automated set during Block 4's CI orchestration work.
