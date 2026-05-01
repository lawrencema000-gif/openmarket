# Feature flags runbook

OpenMarket uses **env-driven boolean feature flags** for v1. Anything more sophisticated (per-user, per-cohort, A/B) belongs in a dedicated tool (LaunchDarkly, GrowthBook) — we'll add that when we need it.

## Where flags live

Each app has its own `src/lib/features.ts` with the flags relevant to that surface. There is no cross-app shared flag set on purpose: a flag is contextual to where it gates UI.

| App | File | Current flags |
|---|---|---|
| `market-web` | `apps/market-web/src/lib/features.ts` | `userAccounts`, `library`, `wishlist`, `reviews`, `androidAutoUpdate`, `topCharts`, `collections`, `previewVideos` |
| `dev-portal` | `apps/dev-portal/src/lib/features.ts` | `betaChannels`, `stagedRollouts`, `crashReports`, `localizedListings`, `dataSafety`, `developerStats`, `teamMembers`, `apiTokens` |
| `admin` | `apps/admin/src/lib/features.ts` | `bulkModeration`, `dmcaWorkflow`, `transparencyEditor`, `appealsQueue` |

All flags default **off**. Each is gated to a specific Phase / Tier item in `docs/IMPLEMENTATION-PLAN.md`.

## Reading a flag

```ts
import { features } from "@/lib/features";

if (features.wishlist) {
  // show heart icon
}
```

The `features` object uses getter properties so each access reads fresh from `process.env`. There is no caching — turning a flag on/off requires a server restart in dev, a redeploy in prod (since these are build-time `NEXT_PUBLIC_*` vars on the storefronts and runtime envs on the API).

## Enabling a flag

Production (Vercel project settings):
- Set `NEXT_PUBLIC_FEATURE_<NAME>=1` (camelCase becomes SCREAMING_SNAKE — `wishlist` → `WISHLIST`, `userAccounts` → `USER_ACCOUNTS`).
- Redeploy.

Local:
- Set the same var in `.env`.
- Restart the dev server.

Accepted truthy values: `1`, `true` (case-insensitive). Anything else is treated as off.

## Adding a new flag

1. Add a getter to the relevant `features.ts` with `FLAG_DEFAULTS[name] = false`.
2. Reference the gating Tier/Phase item in a comment.
3. Wrap the surface code with `if (features.<name>) { ... }`.
4. When you ship the surface and want to enable it, flip the env var in Vercel.

## Removing a flag

Once a feature is fully shipped and you've decided not to roll it back:
1. Delete the flag from `FLAG_DEFAULTS`.
2. Remove the `if` guards in the codebase.
3. Remove the env var from Vercel.
4. Open a PR titled `chore: remove <name> feature flag (now permanent)`.

A flag should not live for more than 1–2 release cycles after it's fully on. Long-lived flags become forks; we don't want forks.

## ServiceUnavailable vs ComingSoon

The UI package exposes two related components:

- `<ServiceUnavailable />` — shown when the API is reachable in principle but currently down (network error, 5xx). Implies "try again." Used in `apps/<id>` and `developers/<id>` pages when API call fails.
- `<ComingSoon />` — shown when a feature is intentionally off via a flag. Implies "we haven't built this yet." Used to fill out roadmap surfaces with honest "not yet" placeholders.

Don't confuse them. A flagged-off surface should never show "Service is being deployed" — that implies a bug.

## Verification

Smoke test with the API completely down. Every URL on market-web should return 200 (no 500s):

```bash
# stop everything
docker compose down  # in infrastructure/docker
ps | grep "tsx watch" | awk '{print $2}' | xargs kill

# start only the frontend
pnpm --filter @openmarket/market-web dev

# then probe
for path in / /search /apps/some-id /developers/some-id /about /privacy /terms /dmca /content-policy /security /transparency-report; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000${path}")
  echo "$code $path"
done
```

Anything other than 200 (or 404 for paths that don't exist) is a P0-G regression.

## Why env-driven, not a UI toggle

A UI flag toggle requires:
- A backend store for flag state (DB column, KV, Redis).
- A flush mechanism so flag changes propagate.
- An audit log.
- Per-environment isolation.

For 8 boolean flags, all of that is overkill. When we have 50+ flags, per-cohort overrides, or A/B tests, we'll graduate to LaunchDarkly or GrowthBook.
