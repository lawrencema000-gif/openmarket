# OpenMarket — Master Plan ("Make It Perfect")

> **Companion to `docs/IMPLEMENTATION-PLAN.md`.** That document enumerates everything that needs to be built. This document defines what "perfect" means, where we are honestly, and the shortest path from here to there.
>
> Maintained: 2026-05-07. Owner: lawrencema000-gif. Updated as state changes.

---

## 0. Why this document exists

The implementation plan answers *"what do we build?"*. This master plan answers three questions the implementation plan deliberately avoids:

1. **What does "perfect" actually look like?** (the bar — measurable, opinionated, honest)
2. **Where is the gap between perfect and now?** (current state vs. that bar — no aspiration)
3. **What is the shortest path to close that gap?** (the close-out sequence — already-decided, dependency-ordered)

It also reserves a slot for an external **Play Store / App Store scrape** so we periodically refresh our assumptions about what an Android marketplace must do to feel real, and which features we are intentionally *not* shipping (and why).

---

## 1. What "perfect" means

OpenMarket is a viewpoint-neutral Android app marketplace. "Perfect" is not feature parity with the Play Store — that is neither possible nor desirable. "Perfect" is a sharp, opinionated stance against the Play Store's worst behaviors, executed without bugs.

### 1.1 The bar — five hard numbers

| Dimension | Bar |
|---|---|
| **Time-to-trust for end users** | A first-time visitor lands on `/apps/com.foo.bar` and can decide whether to install in **<10 seconds** without leaving the page. (Icon, screenshots, permissions, signing fingerprint, scan verdict, latest review, all above the fold.) |
| **Time-to-publish for developers** | A new developer goes from `/register` to "release in review" in **<30 minutes** for their first APK. No support ticket required. |
| **Moderator effectiveness** | A moderator reaches a final decision on any open report in **<3 minutes** without leaving the admin app. Resolve-and-explain-and-notify is one click. |
| **Public auditability** | 100% of takedowns, reinstatements, and appeal outcomes appear in the public transparency report **within 60 seconds** of the action, with a hash chain that anyone can verify. |
| **Safety floor** | 0% of apps with our `block`-band scan verdict can reach a published listing. Every published listing carries a visible scan verdict from a release in the last 90 days. |

If any of those numbers slips, we are not perfect, regardless of how many features we have shipped.

### 1.2 The principles — non-negotiable

1. **Viewpoint-neutral, rule-bound.** We enforce written rules. We do not curate by editorial taste. ([content-policy.md](policies/content-policy.md))
2. **Due process by default.** No takedown without a written reason and an appeal channel. Every decision — including denials — is part of the public record.
3. **Open by construction.** Source is open. Policies are versioned. Transparency log is hash-chained and publicly verifiable.
4. **Cost discipline.** Architecture choices that compound (R2 zero-egress, Neon branching, queue + storage separation) over choices that look cheap month one but bleed at month twelve.
5. **Explicit over implicit.** No silent failures. No hidden fallbacks. Every error has a code, a user-facing message, and a transparency event when it touches moderation.

### 1.3 What we are intentionally **not** building (and why)

- **Editorial collections / featured staff picks.** Conflicts with viewpoint neutrality. Categories + objective ranking (downloads, recency, rating) only.
- **Promoted placements / paid search ranking.** Same reason. Ads erode trust faster than they generate revenue.
- **In-app purchases / billing rails.** v1+v2 scope is *distribution and trust*. Billing is a separate problem and has incumbents (RevenueCat, Stripe) that solve it better than a marketplace can.
- **Closed-source moderation models.** Any classifier we run for malware/policy decisions must be inspectable from the source tree. No vendor black-boxes between a developer and a takedown.
- **Personalization on first visit.** Cookies + recommendation engines = legal surface area. The home page is the same for everyone until they sign in.

These exclusions are load-bearing. They turn "we are smaller than the Play Store" from a weakness into a positioning advantage.

---

## 2. Current state — honest assessment (2026-05-07)

### 2.1 What works end-to-end (verified by tests + code, not vibes)

| Surface | Status | Evidence |
|---|---|---|
| Database (Neon + local Postgres) | ✅ | `pnpm db:push` clean, 249 tests pass |
| API service (Hono on Vercel) | ✅ | Smoke route `/health` passes |
| Frontends (3 Next.js apps) | ✅ | Build clean, 0 P0-G "broken paths" |
| Storefront accounts (P1-A) | ✅ | Sign-up / sign-in / library / wishlist |
| App metadata + What's New (P1-D/E) | ✅ | Markdown release notes, rich detail page |
| Reviews + dev responses (P1-G/H) | ✅ | One-review-per-user gate, threaded replies |
| APK ingest (P1-I) | ✅ | yauzl ZIP inspect → adbkit-apkreader → 8 stable rejection codes |
| Security scan (P1-J) | ✅ | 6 scanners, 4 risk bands, repackaging detection |
| Reports + transparency log (P1-K) | ✅ | Hash-chained events, public report renders chain |
| Developer appeals (P1-L) | ✅ | Submit-gated-on-ownership, accept/reject side-effected |
| Categories + curation API (P1-N) | ✅ | Featured grid, slug pages, admin CRUD endpoints |

**249 tests passing across api, scan-worker, ingest-worker, db, contracts.**

### 2.2 What is shipped in code but NOT usable end-to-end (the honest gap)

This is the load-bearing section. These are bugs, not features.

| Gap | Severity | Where |
|---|---|---|
| **Admin app does not consume the new moderation APIs.** `/reports` calls public `GET /reports` (which doesn't exist as a list) and a status-only updater that doesn't match the new `resolve` flow. | 🔴 P1-stopper | `apps/admin/src/app/reports/page.tsx`, `ReportStatusUpdater.tsx` |
| **No admin appeals queue.** Backend at `services/api/src/routes/appeals.ts` exposes `GET /admin/appeals` with status counts; admin app has no `/appeals` route. Moderators cannot triage appeals. | 🔴 P1-stopper | `apps/admin/src/app/` (no `appeals/`) |
| **No admin categories editor.** Backend supports CRUD + reorder + featured-toggle; admin app has no `/categories` route. Editorial control lives only in the seed file. | 🟠 P1-incomplete | `apps/admin/src/app/` (no `categories/`) |
| **Dev-portal upload happy path not wired to new ingest pipeline.** P0-C scaffolded presigned URL flow; P1-I built the worker; the dev-portal upload form does not yet call `POST /releases/:id/artifacts/upload-url` and the post-upload `finalize`. | 🟠 P1-incomplete | `apps/dev-portal/src/app/.../release/upload` |
| **No rate limiting in front of public endpoints.** P1-S unbuilt. Anyone can flood `/reports`, `/reviews`, `/search`. | 🟠 abuse risk |  |
| **No audit-log middleware on admin mutations.** P1-R unbuilt. `audit_log` table exists; nothing writes to it automatically. | 🟠 governance hole |  |
| **No sitemap / OG cards / structured data.** P1-Q unbuilt. Storefront is invisible to search and unshareable. | 🟡 reach hole |  |
| **No backup runbook beyond Neon defaults.** P1-T unbuilt. R2 buckets have no scheduled cross-region mirror. | 🟡 DR hole |  |
| **Better Auth hardening incomplete.** P1-O unbuilt. No sign-in rate limit, no "sign out everywhere," no 2FA, no Google OAuth on storefront. | 🟡 trust hole |  |
| **Search is scaffolded but not hardened.** P1-M unbuilt. Synonyms, ranking boosts, top-queries panel missing. | 🟡 polish hole |  |

The pattern is clear: **the back-of-house is real; the front-of-house for moderators is not, and the public-internet hardening is not**.

### 2.3 What is *deferred and acknowledged*, not "missing"

- **P1-F installer client** — needs the Android side-load companion app, which is a separate product. Plan: leave manual download via signed URL until the companion app is in scope.
- **Phase 2+ items** (top charts, recommendations, etc.) — explicitly out of scope until Phase 1 is sealed.

---

## 3. Path to perfect — the close-out sequence

The right move is **not** to start Phase 2. The right move is to make Phase 1 *complete* — every endpoint usable end-to-end, every public surface hardened, every governance promise enforceable. Anything else is feature-debt acquisition.

### 3.1 The next work blocks (in order)

#### Block 1 — **Phase 1 close-out: admin moderation surfaces** + review hold-back

Goal: a moderator can do their job entirely inside the admin app. No psql, no API curl. Coordinated review-bombing is structurally prevented.

1. **`/admin/reports` rewrite** — list filtered by status (open / investigating / resolved / dismissed) + type. Each row has a one-click resolve drawer with `delist | warn | dismiss` + required notes. Wired to `POST /admin/reports/:id/resolve`. Bulk-dismiss via checkbox + footer action.
2. **`/admin/appeals`** — new route. List with status counts (open / accepted / rejected). Detail drawer shows the linked target (app or review), the developer's body, the original takedown reason, accept/reject buttons with required notes. Wired to `GET /admin/appeals` + `POST /admin/appeals/:id/resolve`.
3. **`/admin/categories`** — new route. Table with drag-to-reorder (HTML5 DnD, no library dependency), featured-toggle, edit modal, delete-with-usage-check. Wired to all four admin endpoints.
4. **`/admin/transparency-log`** — new (admin-side mirror of the public report) with raw hash columns visible for spot-verification.
5. **C7. Review hold-back + suspicious-activity freeze.** Schema: `reviews.publishedAt` nullable timestamp. New reviews land with `publishedAt = null`; a 24h cron promotes them. Public review endpoint filters by `publishedAt is not null`. Admin per-app freeze toggle pauses promotion for apps under investigation.

Definition of done: a moderator sees a fresh report, resolves it, an appeal arrives, and they accept it — all in the admin app, with both events showing in the public transparency report, and audit log entries written for each. New reviews don't appear publicly for 24 hours.

#### Block 1.5 — **Anti-Features taxonomy** (the cheapest unlock for §5 differentiation)

Goal: every published listing carries machine-checkable trust labels users can filter on.

1. **Schema:** `apps.antiFeatures` text[] with values from a versioned enum: `tracking`, `ads`, `nonFreeNet`, `nonFreeAdd`, `nonFreeAssets`, `nonFreeDep`, `noSourceSince`, `upstreamNonFree`, `disabledAlgorithm`, `knownVuln`, `nsfw`. Reserve `reproducible:verified` for Phase 2.
2. **Scanner emitters:** existing scan-worker derives `tracking` (SDK fingerprints in known-tracker list), `ads` (ad-SDK fingerprints), `knownVuln` (CVE-pinned dependencies). Other labels are developer-attested.
3. **Dev-portal:** developer-attestation form on release submission for `nonFreeNet`, `nonFreeAdd`, `nonFreeAssets`, `nonFreeDep`, `nsfw`.
4. **Storefront:** chip block on app detail page; filter on `/search?antiFeature=tracking`.
5. **Public taxonomy page:** `/policies/anti-features` documents each label with the criteria.

Definition of done: every published app has at least machine-derived labels populated; storefront shows them; users can filter.

#### Block 2 — **Phase 1 close-out: public hardening** + DSA-shape transparency

Goal: hostile internet doesn't break us, search engines find us, browsers and Slack render us correctly, and our transparency report is DSA-shaped before we cross the threshold.

1. **P1-S rate limiting** — Upstash Ratelimit middleware on `/search`, `/reports`, `/reviews`, `/auth/sign-in`, `/auth/sign-up`. Tiers per §5 of IMPLEMENTATION-PLAN.
2. **P1-R audit log middleware** — `withAudit()` wrapper for every admin mutating endpoint. Captures actor, action, target, before/after diff. Backfill `auditLog` writes for the existing P1-K and P1-L resolve handlers (they currently write transparency events but not audit log).
3. **P1-Q sitemap + SEO** — `/sitemap.xml`, `/robots.txt`, JSON-LD `SoftwareApplication` per app, OG meta + dynamic OG image via `@vercel/og`, canonical URLs.
4. **P1-O auth hardening (subset)** — sign-in rate limit (3/min/IP, 10/hr/email), "sign out everywhere," account-merge by verified email. 2FA + OAuth deferred to a follow-up since they don't unblock the launch bar.
5. **C6. DSA-shape transparency** — schema additions: `transparencyEvents.jurisdiction` (ISO country code), `legalBasis` (free text — "DSA Art. 16", "DMCA 17 USC 512", "ToS §3.4", etc.), `responseTimeMs`. Public report adds aggregate panel: takedowns by jurisdiction, appeals filed/overturned counts, p50/p95 response times.

#### Block 3 — **Phase 1 close-out: dev-portal upload happy path**

Goal: a developer can publish a release end-to-end.

1. Wire the dev-portal upload form to the presigned-URL flow.
2. Show ingest + scan progress (poll `/releases/:id` every 3s, render the band + findings).
3. On `block` band, show the rejection reason with a deep link to the policy section that triggered it.
4. On `auto_pass`, show "Ready to publish" CTA.

#### Block 4 — **Quality + DR + observability tightening**

1. **P1-T backups** — runbook + cron mirror to a second R2 region. Monthly restore drill (documented, not yet automated).
2. **P1-P CDN + image optimization** — Cloudflare in front of public bucket; ingest-worker generates 64/192/512 icon variants + 320x568 / 1080x1920 screenshots; Next.js `<Image>` with custom loader.
3. **P1-M search hardening** — synonyms, ranking boosts, popular-queries panel, typo tolerance verification.

### 3.2 Sequencing rationale

- **Block 1 first** because the back-end is dead weight without it: every recent commit (P1-K through P1-N) is partially shipped until moderators can use it.
- **Block 2 second** because hostile traffic shows up the day we have a public URL, and we already have a public URL.
- **Block 3 third** because without a working upload happy path, we have no apps to test moderation against beyond seed data.
- **Block 4 last** because backups, CDN, and search ranking are *invisible* improvements — they matter, but they don't change what is possible.

### 3.3 What "Phase 1 done" means after this sequence

A clean checklist, lifted and sharpened from §12 of IMPLEMENTATION-PLAN:

- [ ] User signs up → email verifies → installs an app → reviews it.
- [ ] Developer signs up → uploads an APK → it lands → ingest parses it → scan runs → it shows up on the storefront.
- [ ] User reports the app → moderator resolves with `delist` → developer gets an email + appeal link → developer appeals → moderator accepts → app is relisted → the public transparency report shows both events with intact hash chain.
- [ ] All five surfaces (storefront, dev-portal, admin) pass an end-to-end smoke test with zero 500s.
- [ ] Sitemap renders all published apps; OG cards render; structured data validates against Schema.org.
- [ ] Hitting `/search` 200 times in 60s gets a 429.
- [ ] Every admin mutation appears in `/admin/audit-log`.

Until that checklist is green, we are not Phase 2-ready, and adding Phase 2 features is debt.

---

## 4. Operational excellence — the track no one writes plans for

The implementation plan covers shipped features. This section covers everything that keeps a shipped product alive.

### 4.1 Incident response

- **On-call rotation.** Single-person on-call until v2; pager via Better Stack → email + SMS. Document at [`docs/runbooks/oncall.md`](runbooks/oncall.md) (TODO).
- **Severity ladder.** SEV-1 (storefront down or data-loss event) → SEV-2 (single critical surface broken) → SEV-3 (degraded UX, no data risk). Each has a target ack time and a postmortem requirement.
- **Postmortem template.** Blameless, in `docs/postmortems/YYYY-MM-DD-slug.md`. Required for SEV-1 and SEV-2.

### 4.2 Performance budgets

Lighthouse on `apps/market-web` home + apps detail page, run weekly via CI:

| Metric | Budget |
|---|---|
| LCP (mobile, slow-4G) | <2.5s |
| TTI | <3.5s |
| CLS | <0.1 |
| First-paint image transfer | <500 KB |
| API p99 latency | <300ms (excludes scan/ingest jobs) |

Budget breach → CI red → cannot merge to main.

### 4.3 Test discipline

- **Unit + integration tests are not optional.** Current bar: 249 tests across api/db/contracts/scan-worker/ingest-worker. Floor: any new endpoint adds at least one happy-path + one failure-path test before merge.
- **E2E gap is acknowledged.** Phase 1 close-out adds Playwright smoke tests for: sign-up flow, upload flow, report-and-resolve flow. These run on PR + nightly.
- **No mocking the database in integration tests.** Drizzle + Vitest can hit a local Postgres; we use that for the moderation flows specifically because mock/prod divergence has burned us before in adjacent projects.

### 4.4 Security baseline

- **All admin endpoints require `requireAdmin` middleware** — already enforced.
- **All mutating endpoints are CSRF-safe** — Better Auth handles for auth routes; verify our route additions inherit. Add a CSRF middleware audit task.
- **No PII in logs.** Sentry scrubbing config audited; verify on every new error path.
- **Vulnerability disclosure.** `/.well-known/security.txt` already live; first triage SLO = 24 hours.
- **Secrets management.** Vercel + Fly env only; never `.env.local` committed; `pnpm exec gitleaks` in CI (TODO).
- **Dependency hygiene.** `pnpm audit` in CI weekly. Renovate or Dependabot on a quiet cadence.

### 4.5 Cost monitoring

- **Monthly burn target through v1:** <$50/mo (excluding domain). Today: ~$0 (free tiers).
- **Alarms:** Neon storage >50% of free tier, R2 storage >50% of free tier, Resend >70% of free tier, Vercel function invocations >70% of free tier. Plumb to Slack/email.

---

## 5. Differentiation track — what makes this not just "Play Store but smaller"

The Play/App Store scrape (Section 6) tells us what we *must* match. This track is what we *must do better*.

| Theme | What we ship that they cannot |
|---|---|
| **Hash-chained transparency** | Every takedown, reinstatement, and appeal outcome is a public, verifiable hash-chain entry with `previousHash` + `contentHash`. Anyone can re-verify the entire log. — Already shipped (P1-K). |
| **Visible scan verdict per release** | The risk band, score, and full findings list are visible on the public app page. Play Store shows nothing; we show everything. — Already shipped (P1-J), pending front-of-house exposure. |
| **Visible signing fingerprint per release** | App detail surfaces the developer's signing key fingerprint with an "if this changes, you'll be warned" note. — Schema exists, UI surface deferred to Block 3. |
| **Versioned content policy** | Every transparency event is stamped with the policy version that triggered it. A user can trace any takedown to the *exact policy text* that justified it. — Already shipped (P1-K). |
| **No editorial bias surface** | No "Editor's Picks." No "Today's Top Pick." Ranking is public, formulaic, and reproducible from the dataset. — Already shipped (P1-N: `position` + `isFeatured` is editorial-light, not editorial-heavy). |
| **Repackaging detection** | We refuse to publish an APK that is a repackaging of someone else's signed app. Play Store relies on takedown after the fact; we block at ingest. — Already shipped (P1-J scanner #6). |
| **Developer appeals are mandatory and public** | Every appeal outcome — including denials — is in the transparency log. — Already shipped (P1-L). |
| **No closed moderation models** | All scanners are in-tree, inspectable, deterministic. No vendor black-box. — Already shipped (P1-J). |
| **Open-source platform** | The thing scanning your app *is* the thing you can read on GitHub. — Repo public; license decision is a TODO. |

The list above is the answer to "why would anyone trust you over the Play Store?" It is also the list of things we cannot weaken in pursuit of growth.

---

## 6. Play Store / App Store scrape — 2026-05-07 findings

Background research run on 2026-05-07 against live Play Console docs, App Store Connect Help, the Android Developers Blog, F-Droid docs, and 2025-2026 alt-store reporting yielded **118 distinct features** across the five buckets. Full raw catalog is preserved in the conversation transcript and reflected below as decisions, not as a copy of the source list.

### 6.1 Catch-up list — must ship

These are features whose absence makes OpenMarket *categorically incomplete*, not just thinner. They are sequenced by impact + dependency.

| Cluster | Why it's must-ship | Where it lands |
|---|---|---|
| **C1. F-Droid Anti-Features taxonomy** (Tracking, Ads, NonFreeNet, KnownVuln, NonFreeAdd, NonFreeAssets, NonFreeDep, NoSourceSince, UpstreamNonFree, DisabledAlgorithm, NSFW) | Single highest trust signal a viewpoint-neutral marketplace can offer. Without it, our "transparency" claim is one-dimensional (only takedowns). With it, every listing carries machine-checkable trust labels users can filter on. | New Phase 1.5 work block — schema (`apps.antiFeatures` text[]), scanner emitters (KnownVuln + Tracking + Ads can derive from existing scan data), listing-page chips, search filter |
| **C2. Reproducible builds verification** | The structurally strongest claim a store can make: "the binary you download = source on GitHub, byte-identical." Validates everything in §5. | Phase 2 work block — build farm + verifier worker. Out of scope for Phase 1 close-out, but Anti-Features schema must reserve `reproducible:verified` slot now. |
| **C3. Android Developer Verifier compliance** | As of 2026, Google is closing sideloading on certified devices unless the developer is verified or the store is on Google's compliant-alt-store allow-list. Without enrolling, OpenMarket users literally cannot install on stock Android. | OPS task — apply for Google's Developer Console verification + third-party-store carve-out. Parallel to engineering. Track in [`docs/runbooks/google-compliance.md`](runbooks/google-compliance.md) (TODO). |
| **C4. Staged rollouts + halt-rollout-via-API** | Table stakes for any production-grade developer console. Single-knob "release to 1% → 10% → 100% with pause/halt at any percentage" is the safety net every CI/CD pipeline assumes. | Phase 2 work block — schema (`releases.rolloutPercent`, `releases.rolloutStatus: 'paused'|'live'|'halted'`), scheduled increment job, dev-portal slider UI. |
| **C5. Webhook-first publisher API** (build state, review feedback, scan verdict, takedown) | App Store Connect 2025 webhooks are now table stakes for CI integrators. Easy to publish a tiny webhook spec from day one; expensive to retrofit later. | Phase 2 work block — `webhooks` table (developerId, url, secret, events[], lastDeliveryAt). HMAC-signed POSTs with retry. |
| **C6. Public transparency report — DSA-shaped** | We already have a hash-chained log. What's missing for DSA readiness: takedowns by jurisdiction + cited law, appeals-filed-vs-overturned counts, response-time percentiles. Build the schema now; cross the 50M-MAU threshold later. | Phase 1 close-out — schema additions to `transparencyEvents` (`jurisdiction`, `legalBasis`, `responseTimeMs`), report-page aggregation. |
| **C7. Review hold-back + suspicious-activity rating freeze** | Play holds new ratings for ~24h to detect coordinated abuse and freezes per-app ratings during investigation. Without this, OpenMarket is review-bombable on day one. | Phase 1 close-out — new `reviews.publishedAt` column (initially NULL, set 24h after `createdAt`), public review queries filter by `publishedAt is not null`. Admin per-app freeze toggle. |
| **C8. Per-app multi-channel publishing** (internal / closed / open / production) | Already a parity expectation. Schema-only addition since release pipeline already exists. | Phase 2 — `releases.track` enum + filtered queries. |
| **C9. Form-factor dedicated tracks** (phone / tablet / Wear / TV / Auto / ChromeOS / XR) | Schema reservation, not full implementation. Avoid painting ourselves into a phone-only corner. | Phase 2 — `releases.targetFormFactor` text[]. |
| **C10. Open-source repo + license decision** | Repo is public; license is unset. Without a license, "open by construction" is a slogan, not an enforceable property. | This week — pick AGPL-3.0 or Apache-2.0 + add `LICENSE` at repo root. |

### 6.2 Catch-up list — fast follows (high signal, low cost)

| # | Feature | Effort | Lands |
|---|---|---|---|
| F1 | Apple-style **Privacy Nutrition Labels** (data collected, linked to identity, used for tracking) per app | Schema (`apps.privacyLabels jsonb`) + dev-portal form + listing chip block. Low effort. | Phase 2 |
| F2 | Apple-style **Accessibility Nutrition Labels** (VoiceOver, Larger Text, Sufficient Contrast, Reduced Motion, captions) | Same shape. Low effort. | Phase 2 |
| F3 | **App auto-archive** (mark unused apps, restorable on tap) — storefront-side, not Android-OS-side | Storefront `last_opened_at` heuristic + UI; doesn't require OS hooks. | Phase 3 |
| F4 | **Per-app downgrade** (Aptoide-style — keep historical APKs reachable) | Already retained in storage; surface via `/apps/:id/versions` page. | Phase 1 close-out (cheap) |
| F5 | **F-Droid privileged-extension-style silent updates** for OEM partnerships | Speculative; design schema-ready, ship later. | Phase 4 |
| F6 | **Google Play SDK Index** mirror — public registry of SDK risk, OpenMarket-curated | Maintain `docs/sdk-index/` + scanner emits SDK names already; index is content. | Phase 2 |
| F7 | **Pre-launch automated UI crawl** (Robo-style) — could leverage Cuttlefish or BrowserStack-on-Android | Heavy infra; reserve scope, defer. | Phase 3 |
| F8 | **Multi-language tokenization + auto-translate** for listing copy (Gemini / local LLM) | i18n track; pure dev-portal feature. | Phase 2 |
| F9 | **Per-repo signing keys** (federation primitive — even if we don't federate yet) | Schema (`repos` table) + signature chain stub. Cheap. | Phase 2 |
| F10 | **AAB acceptance** (in addition to APK) | yauzl already inspects ZIPs; AAB is a ZIP variant. Add detection + extract base APK. | Phase 2 |

### 6.3 Skip list — intentionally not shipping (with rationale)

| Feature | Why we skip |
|---|---|
| Editorial "You" tab / personalized hub | Conflicts with §1.2 principle 5 (no personalization on first visit) and §1.3 (no editorial bias). |
| Play Games Sidekick / in-game overlay | Not a game store. |
| App Trials / Game Trials | Out of scope without billing rails. |
| Custom store listings (CSL) — A/B testing variants | Erodes deterministic discovery. We refuse to ship "you saw a different listing than your neighbor." |
| AI-generated listing descriptions | Trust collapse: every listing must be developer-attested copy, not LLM hallucination. |
| Family Library / family purchase approvals | Out of scope — no billing in v1/v2. |
| Aurora "spoofed device geo-bypass" / country spoof | Editorial decision: respect developer's distribution choice. We do not help users circumvent geo restrictions. |
| AppCoins / blockchain-rewarded purchases | Out of scope and aesthetically misaligned. |
| Apple Retention Messaging API (cancel-subscription flow) | Out of scope — no subscriptions. |
| Promoted placements / paid search ranking | §1.3. Hard line. |

### 6.4 Watch list — revisit at end of Phase 1

| Feature | What we're watching for |
|---|---|
| **Hardware-backed Android Key Attestation** (Feb 2026 root rotation) | Whether OpenMarket's anti-fraud needs a real attestation signal vs. relying on developer reputation. Decide post-launch. |
| **MEETS_STRONG_INTEGRITY** signal | Same — wait until we have real install-failure data before requiring it. |
| **F-Droid IPFS / Filecoin mirror support** | Federation question. Decide once Phase 2 federation track is scoped. |
| **Per-form-factor binary variants** (Galaxy Store style) | Decide once we have non-phone form-factor demand. |
| **Inclusion How-To document** (F-Droid pattern) | Today this lives implicitly in `docs/policies/content-policy.md` + `publishability.md`. Decide if an explicit "Inclusion Guide" doc reduces support load. |
| **User-perceived crash rate / ANR rate gating** (Play vitals model) | Decide once crash reporting from a meaningful number of installs is flowing. |

### 6.5 What this scrape changes about §3

Two adjustments to the close-out sequence:

1. **Block 1 (admin moderation surfaces) gains "review hold-back + freeze" (C7).** It belongs with the moderation work since both are review-system concerns.
2. **Block 2 (public hardening) gains "DSA-shaped transparency schema additions" (C6).** It's a schema + report-page change, fits naturally with the rate-limit + audit-log + sitemap work.
3. **A new Block 1.5 — "Anti-Features taxonomy" (C1) — slots in between Block 1 and Block 2.** It's a cross-cutting trust feature that is dramatically higher-value than rate limiting, the cheapest way to make our differentiation track (§5) visible to users, and unblocks the F-Droid-style positioning.

The license decision (C10) and the Google Developer Verifier ops task (C3) run **in parallel** with engineering work as they are not coding tasks.

### 6.6 Re-baselining cadence

Re-run the scrape at end of Phase 1, end of Phase 2, and quarterly thereafter. The point is not to copy them — it is to make sure we know what we are deliberately *not* doing.

---

## 7. Definition of done for "perfect"

OpenMarket is "perfect" — by the bar in §1.1 — when all of the following are simultaneously true:

1. Phase 1 close-out checklist (§3.3) is green.
2. The five hard numbers in §1.1 hold under load.
3. The differentiation list in §5 is complete and visible to end users on the public site (not just present in code).
4. The §6 catch-up list is empty (or every remaining item has an explicit "skip" rationale).
5. Operational excellence baseline (§4) holds: on-call exists, performance budgets are enforced in CI, secrets and dependency hygiene are automated, cost alarms are wired.
6. Phase 2 has not started yet — because starting it before any of 1–5 is feature debt.

When all six hold, OpenMarket is ready to begin Phase 2 *and* ready to ask its first 1,000 real users to trust it.

---

## 8. Workflow — how this plan stays honest

- **After every shipped block,** update §2.2 (the gap table) and §3.3 (the checklist).
- **After every external event** (scrape refresh, security disclosure, regulatory shift), revise §1 (the bar) and §5 (differentiation).
- **Never let a "stretch" item creep into Phase 1 close-out.** If it doesn't move us toward §1.1, it is Phase 2.
- **Pause-and-confirm cadence stays:** finish a block, report DoD verification, await "continue."
