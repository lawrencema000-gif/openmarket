# Observability runbook

**Stack:**

| Concern | Tool | Where |
|---|---|---|
| Errors + perf | **Sentry** | All 3 frontends + API + workers |
| User analytics | **Plausible** | market-web only (privacy-respecting; no cookies) |
| Uptime + log aggregation | **Better Stack** | configured in dashboard, not code |
| Runtime logs | **Vercel Logs** (frontends + API), **Fly.io logs** (workers) | auto, no setup |

All SDKs are **no-op when env vars are unset** — local dev sees no Sentry traffic, no Plausible script tag, nothing leaving the machine.

## Sentry

### What's instrumented

**Client (browser):**
- Unhandled errors (window.onerror)
- Unhandled promise rejections
- React error boundaries
- Replay on errors only (sessionSampleRate=0, errorSampleRate=1) — no full-session recording.
- All text masked, all media blocked in replays — privacy by default.

**Server (Next.js):**
- Server component errors via `instrumentation.ts → onRequestError`.
- API route errors.
- Edge runtime errors (middleware).

**API (Hono):**
- All unhandled exceptions caught by `errorHandler` middleware → `Sentry.captureException`.
- Request path + method tagged on every event.
- 4xx HTTPExceptions (client errors) and ZodError (validation) **NOT** sent — those aren't actionable.
- `/health` events filtered.
- Profiling: not enabled in v1 (the native `@sentry/profiling-node` binary doesn't install cleanly across all our build environments). Add back later if traces aren't enough.

**Workers:**
- Job failure events captured with template + job ID tags.
- Worker-level errors captured.

### Per-app config files

```
apps/<name>/
  sentry.client.config.ts   # browser bundle
  sentry.server.config.ts   # nodejs runtime
  sentry.edge.config.ts     # edge runtime
  src/instrumentation.ts    # Next.js entry hook + onRequestError
  next.config.ts            # withSentryConfig wrap (only when SENTRY_AUTH_TOKEN set)
```

```
services/api/src/lib/sentry.ts            # init, must be 2nd import after env
services/notify-worker/src/lib/sentry.ts  # same pattern
```

### Sample rates

| App | tracesSampleRate (prod) | Why |
|---|---|---|
| market-web | 0.1 | High-traffic, sample for cost. |
| dev-portal | 0.1 | Lower traffic, but still external users. |
| admin | 1.0 | Low-volume, internal — full visibility. |
| API | 0.1 | High-traffic, sample for cost. |
| notify-worker | 0.1 | Job-level — if a single template breaks, 10% of failures will catch it. |

### Production setup

1. Sign up at https://sentry.io.
2. Create org `openmarket` (or pick existing).
3. Create projects: `openmarket-web`, `openmarket-dev-portal`, `openmarket-admin`, `openmarket-api`, `openmarket-notify-worker`. Each gets its own DSN.
4. Copy each DSN into the corresponding Vercel project env:
   - For Next.js apps: set both `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client) — typically the same value.
   - For API: `SENTRY_DSN`.
5. (Optional, for source-map upload at build time) Create an internal-integration auth token with `project:write` + `org:read` permissions: https://sentry.io/settings/account/api/auth-tokens/. Add to Vercel env:
   - `SENTRY_AUTH_TOKEN`
   - `SENTRY_ORG=openmarket`
   - `SENTRY_PROJECT=openmarket-web` (etc., per project)
6. Verify: throw a test error — `throw new Error("sentry-test-" + Date.now())` from a route — and confirm it shows in the Sentry dashboard within 30s.

### Privacy notes (per §2 principle 6 of the implementation plan)

- `sendDefaultPii: false` everywhere → IPs and user-agents not auto-attached.
- `maskAllText` and `blockAllMedia` on Replay → no user-typed text or screenshots leaked.
- `/health` route filtered → no probe spam.
- `beforeSend` callback in API drops trivially-recognizable noise.

## Plausible

Privacy-respecting analytics: no cookies, no personal IDs, GDPR/PECR-compliant out of the box. **Replaces Google Analytics.**

### Where it runs

market-web only — admin and dev-portal are authenticated tools, no need for traffic analytics.

### Setup

1. Sign up at https://plausible.io (Cloud, ~$9/mo) OR self-host the community edition (free, instructions at https://github.com/plausible/community-edition).
2. Add site `openmarket.app`.
3. Set Vercel env on the market-web project:
   - `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=openmarket.app`
   - `NEXT_PUBLIC_PLAUSIBLE_HOST=https://plausible.io` (Cloud) or your self-host URL.
4. Verify: load the site in a private tab, then check the Plausible dashboard for a live visitor.

### What we track

By default: pageviews + outbound link clicks (custom events can be added later for "install clicked", "review submitted", etc.).

By design we do **not** track: cross-site behavior, fingerprints, IPs after geolocation lookup, anything that could re-identify users.

## Better Stack (uptime + log aggregation)

**Why:** Vercel and Fly logs are great for forensics but slow to alert on. Better Stack pages an on-call human within ~30s of an outage.

### Setup

1. Sign up at https://betterstack.com.
2. Create monitors:
   - `https://openmarket.app` — keyword check for "OpenMarket" in HTML.
   - `https://api.openmarket.app/health` — JSON status check `status === "ok"`.
   - `https://dev.openmarket.app` — keyword check.
   - `https://admin.openmarket.app/login` — HTTP 200.
3. Configure on-call rotation + alert channels (email at minimum; Telegram or Slack ideally).
4. Set incident SLA: page after 2 consecutive failures within 60s.
5. Optional: enable status page at `status.openmarket.app`.

### Log aggregation (Better Stack Logs / Logtail)

For long-term log retention beyond Vercel's 1-hour window:

1. Create a "source" per service (api, notify-worker, market-web).
2. For Vercel projects: install the [Vercel-Logtail integration](https://vercel.com/integrations/logtail) — auto-forwards logs.
3. For Fly.io workers: add Logtail as a destination in `fly.toml` log shipper config.

## Vercel-side observability (free, automatic)

Already on by default once the apps are deployed:
- **Vercel Logs** (1h retention, longer with Better Stack).
- **Vercel Web Analytics** — turn this OFF on market-web (we use Plausible instead — having both is redundant and Vercel Analytics doesn't meet our privacy bar).
- **Vercel Speed Insights** — turn ON for Core Web Vitals trending.

## Local dev

You don't need any of this locally:

- Sentry: SDKs no-op without DSN. To test reporting locally, set `SENTRY_DSN=<dev-only DSN>` in `.env`.
- Plausible: script tag isn't injected if `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is unset.
- Better Stack: not relevant locally.

## Verification checklist (P0-F DoD)

- [ ] Throw a deliberate `new Error("sentry-test-" + Date.now())` from a market-web route → appears in Sentry within 30s.
- [ ] Same from dev-portal, admin, API, notify-worker (one each).
- [ ] Plausible dashboard shows pageviews on market-web home.
- [ ] Better Stack monitors all green for the 3 frontends + API health.
- [ ] At least one alert channel (email or Telegram) wired up.

Until each of these is checked, the corresponding tool is "scaffolded but not active." That's fine for now — none of it blocks development.
