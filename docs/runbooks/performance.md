# Performance budget runbook (P3-M)

Lighthouse CI enforces a per-app perf budget on every PR. This runbook covers what the budget is, how to run it locally, and what to do when it fails.

## TL;DR

```bash
# All three frontends, sequential
pnpm perf:budget

# Or one at a time
pnpm perf:budget:market-web
pnpm perf:budget:dev-portal
pnpm perf:budget:admin
```

CI runs the same command per-app in parallel (matrix strategy in `.github/workflows/perf-budget.yml`). Reports auto-upload to Lighthouse's temporary-public-storage so reviewers can open them from the PR check tab.

## The budget

Per-app `lighthouserc.json` files at:

- `apps/market-web/lighthouserc.json` — strictest, public storefront
- `apps/dev-portal/lighthouserc.json` — moderate, developer tool
- `apps/admin/lighthouserc.json` — loosest, internal staff tool

### Storefront (market-web) — strictest

| Metric                    | Threshold      | Severity |
| ------------------------- | -------------- | -------- |
| Largest Contentful Paint  | < 2.5s         | error    |
| Cumulative Layout Shift   | < 0.1          | error    |
| First Contentful Paint    | < 1.8s         | warn     |
| Total Blocking Time       | < 300ms        | warn     |
| Speed Index               | < 3.4s         | warn     |
| Total byte weight         | < 1.2 MB       | warn     |
| Unused JS                 | < 60 KB        | warn     |
| Performance category      | ≥ 0.80         | warn     |
| Accessibility             | ≥ 0.90         | warn     |
| Best practices            | ≥ 0.90         | warn     |
| SEO                       | ≥ 0.90         | warn     |

`error` busts the build. `warn` shows up in the PR comment but doesn't fail CI.

### dev-portal / admin — looser

LCP < 3.0s (3.5s for admin), CLS still < 0.1 (0.15 for admin), perf score ≥ 0.7 (0.65 for admin). Rationale: these surfaces are used by signed-in devs/staff on desktop, not first-time visitors on flaky mobile — the cost/benefit of squeezing every kB doesn't hit as hard.

## When a check fails

1. Open the PR's "Performance Budget" check tab.
2. Click into the failing matrix row (e.g. `market-web`).
3. The job log links to the Lighthouse temporary-public-storage report. Open it.
4. The flagged assertion is in the "Audits" view — sort by impact.

### Common offenders

- **LCP regression** — usually a new above-the-fold image without `width`/`height` or a synchronous script blocking the render. Fix:
  - add explicit dimensions to images
  - move third-party `<script>` tags to `next/script` with `strategy="lazyOnload"`
  - check that the API call powering the page is not blocking the SSR path

- **CLS regression** — content jumping during hydration. Fix:
  - reserve space for images and embeds (`aspect-ratio` or explicit dims)
  - avoid client-only re-renders that flip layout (e.g. don't conditionally render based on `useEffect` if the missing element changes layout)

- **Total byte weight bust** — usually a new dependency. Check the bundle analyzer:
  ```bash
  cd apps/market-web
  ANALYZE=true pnpm build
  ```
  and look for the largest new contributors.

- **Unused JS** — tree-shake the import. If you imported `import * as X from "library"` and use only one function, switch to named imports.

## Adding a new asserted route

Edit the relevant `lighthouserc.json` and add to the `url` array. Each URL adds ~30s to the CI run (Lighthouse takes 3 collections by default).

## Adjusting thresholds

If a threshold genuinely needs to loosen — e.g. you're shipping a hero video that pushes byte weight legitimately past the limit — open the matching `lighthouserc.json` and document the why in the same PR.

DO NOT loosen thresholds to silence a CI failure caused by an actual regression. The budget is the line, not a hint.

## Optional: register a Lighthouse CI GitHub App

For richer status checks per audit (instead of one pass/fail per app), [install the Lighthouse CI GitHub App](https://github.com/apps/lighthouse-ci) and add `LHCI_GITHUB_APP_TOKEN` to repo secrets. Already wired in the workflow — it's a no-op when the secret is unset.
