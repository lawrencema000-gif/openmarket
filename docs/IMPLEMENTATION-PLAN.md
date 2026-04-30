# OpenMarket — Complete Implementation Plan

**Status:** Active
**Last updated:** 2026-04-30
**Owner:** lawrencema000-gif
**Working principle:** Quality over speed. We tackle one item at a time, fully, before moving to the next.

---

## How to use this document

- This plan is the single source of truth for what we're building, in what order, and why.
- Every section has a self-contained item: schema, API, frontend, infra, acceptance criteria. Read top to bottom for the first time, then jump to the active item.
- Items are numbered (`P0-A`, `P1-A`, `P1-B`, …). When we finish one we mark it `DONE` here and commit the change with the same identifier in the message.
- Tier 0 = unblock the platform. Tiers 1–4 = build out features.
- Order inside a tier is dependency-ordered: don't skip forward.
- Whenever requirements change, edit *this file* before writing code.

---

## 1. Executive summary

**What OpenMarket is.**
A viewpoint-neutral Android app marketplace. Web storefront for users, developer portal for publishers, admin console for moderation, Android client for installs. Hono API + Postgres + Meilisearch + BullMQ worker pool, deployed via Vercel for web and (TBD) for API.

**What's working today.**
- Monorepo (pnpm + Turborepo) builds cleanly. 141 tests pass across 7 packages.
- Three Next.js apps deployed to Vercel and serving 200 OK on shell pages.
- Zod contracts shared between API/web/admin via `@openmarket/contracts`.
- Drizzle schema covers developers, apps, releases, artifacts, users, reviews, reports, moderation, signing keys.
- Hono API has routes for auth, apps, releases, signing-keys, reviews, reports, search, admin. ~2000 lines of route code.
- Android Compose client scaffolded with Hilt + Room + Ktor + Coil.
- Five workers wired up (ingest, scan, search, notify) — but most are skeletons.

**What's blocking.**
- Database is unreachable from this machine (Supabase pooler is IPv6-only, this network is IPv4-only).
- Hono API is not deployed anywhere. All web frontends call `localhost:3001`, which doesn't exist in production.
- No real binary storage. APK uploads have a `fileUrl` column but no S3/R2/Supabase Storage integration.
- No transactional email. No push notifications. No CDN for icons/screenshots.
- No legal pages (privacy policy, ToS, DMCA, content policy).

**What's missing functionally.**
~120 features behind Play Store / App Store parity, organized into Tier 1–4 below. The big buckets:
- User: library, install history, wishlist, top charts, what's new, similar apps, app preview videos, data safety labels.
- Developer: stats dashboard, crash reports, A/B testing, staged rollouts (schema exists, no UX), country pricing, AAB support, in-app products.
- Admin: bulk moderation, DMCA workflow, repackaged-app detection, multi-moderator approval, region bans, featured curation tooling.
- Infra: real APK storage, CDN, email, push, sitemap, analytics, GDPR tools, status page.

**Path forward.**
Phase 0 unblocks production (database + API deploy + storage). Phase 1 ships a credible v1 marketplace. Phase 2 brings parity on the marketplace features users expect. Phase 3 polishes growth surfaces. Phase 4 is monetization.

We tackle items strictly in order. Each item has a "Definition of Done" — we don't move on until that's met.

---

## 2. Guiding principles

These are non-negotiable and override any individual feature decision below.

1. **Viewpoint-neutral by default.** Moderation removes only what violates published, narrowly-scoped rules (malware, illegality, content-rating). We don't remove apps for being controversial. Every removal has a written reason published to a transparency log.
2. **Transparency log is public.** Every delisting, every account ban, every policy change is written to a public, append-only log with the rule cited and the version of the rule applied.
3. **Developer due process.** No takedown without notice (except imminent harm: active malware, legal order). All takedowns are appealable with a written response within a published SLA.
4. **No editorial favoritism in core ranking.** Featured/curated surfaces are clearly labeled as such; default search and Top Charts use objective signals (downloads, retention, reviews, trust tier).
5. **Trust through signals, not gatekeeping.** Apps surface real signals (verified developer, signed by known key, source code linked, scan results) instead of being gated by editorial approval.
6. **Privacy by default.** No third-party trackers in the storefront. User accounts are optional for browsing/installing. Telemetry is minimum-necessary and opt-in for anything beyond install success/failure.
7. **Boring tech.** Postgres, Drizzle, Hono, Next.js, BullMQ, Meilisearch. We don't add a new core dependency unless we can name three reasons why we need it.
8. **Schema-first, contract-first.** Drizzle schema → Zod contract → API → frontend. Never the other way round.
9. **TDD for every API change.** A failing test in `services/api/src/__tests__/` before the route changes.

---

## 3. Current state — honest assessment

### 3.1 What ships today (Tier 0 baseline)

| Surface | State |
|---|---|
| `market-web` | Home, search, app detail, developer detail, 404. Static and serves 200. No real data — calls fail because API isn't deployed. |
| `dev-portal` | Login, register, dashboard, apps list, app create, signing keys, profile. Same caveat. |
| `admin` | Login, dashboard, developers, releases, reports, risk queue, audit log. Same caveat. |
| `services/api` | Hono server with 11 routes. Builds and runs locally. ~50 endpoints. Better Auth wired up. |
| `services/ingest-worker` | Skeleton — APK reader imported but not used. No queue consumers wired up end-to-end. |
| `services/scan-worker` | Skeleton — risk scorer exists but doesn't run real scanning. |
| `services/search-worker` | Skeleton — Meilisearch indexer scaffolded. |
| `services/notify-worker` | Skeleton — no email/push provider wired. |
| `apps/android-store` | Compose UI scaffolded, Hilt + Ktor + Room set up. Doesn't actually install APKs. |
| `packages/db` | 7 schema files, ~150 tables/columns. Migrations not pushed. |
| `packages/contracts` | Zod schemas for developers, apps, releases, auth. |
| `packages/ui` | AppCard, StarRating, StatusBadge, Skeleton, EmptyState, SearchInput, Stat, PageHeader, ConfirmDialog. |
| `packages/security-rules` | Permission analyzer + risk scorer. |

### 3.2 What's blocking right now

1. **Database unreachable.** `cvyujkjlibajmtwtzeaf.pooler.supabase.com` returns "Tenant or user not found" because pooler is IPv6-only and this network is IPv4-only. Direct host (`db.<ref>.supabase.co`) only has AAAA DNS. Until we resolve this, no `db:push`, no `db:seed`, no API serving real data.
2. **API not deployed.** Hono server runs locally only. Vercel projects are frontend-only. All `fetch` calls in production hit `localhost:3001`.
3. **No file storage.** `releaseArtifacts.fileUrl` is a string column with no upload pipeline, no signed URLs, no virus scanning of uploaded blobs.
4. **No email provider.** Better Auth's email verification, password reset, and notification emails have no transport.
5. **No push provider.** Notify-worker can't actually notify.

### 3.3 Schema gaps to address by tier

The schema is solid for v1 but is missing:
- User library (installed/owned apps), wishlist, install history at the user level.
- App size, last-updated, supported languages, supported locales.
- Beta tester groups and pre-registration tables.
- Crash reports (collection + dedup).
- Featured collections / editorial curation.
- DMCA notice storage.
- Country availability and pricing.
- In-app products and subscriptions (Tier 4 only).

We will add these incrementally inside the relevant tier sections.

---

## 4. Phase 0 — Unblock production (Tier 0)

**Goal:** by end of Phase 0, a real user can hit a production URL, the page calls a real API, the API talks to a real database, and a developer can upload an APK that lands in real storage.

This is the only phase that has *no optional items*. Everything below is required.

### P0-A. Restore database connectivity — **Neon**

**Why first.** Nothing else works until we can run `db:push`.

**Decision (locked):** Neon. IPv4-native (immediately unblocks), better long-term scaling story (compute/storage separation, autoscale, instant branching for staging), Drizzle-native, free tier generous. Existing Supabase project `cvyujkjlibajmtwtzeaf` will be retired after migration.

**Architecture:**
- One Neon project: `openmarket`.
- Two branches: `main` (production) and `dev` (developer machines, ephemeral).
- Per-PR branches in CI (Tier 2): preview deploys get their own DB branch, auto-cleaned after merge.
- Region: `aws-us-east-1` (matches Vercel default region; minimizes round-trip latency).
- Pooled connection (pgBouncer transaction mode) used by serverless API; direct connection used by workers and migrations.

**Steps:**
1. Install `neonctl` CLI globally (`pnpm add -g neonctl` or `npx`).
2. User authenticates: `neonctl auth` opens browser → GitHub login.
3. Create project: `neonctl projects create --name openmarket --region-id aws-us-east-1`.
4. Capture two connection strings: pooled (for API) and direct (for migrations/workers).
5. Update `.env` with `DATABASE_URL` (pooled) and `DATABASE_URL_DIRECT` (direct).
6. Update `packages/db/drizzle.config.ts` to use `DATABASE_URL_DIRECT` for migrations.
7. `pnpm db:push` — verify schema lands.
8. `pnpm db:seed` — verify categories load.
9. `pnpm db:studio` — verify visual confirmation of all tables.
10. Add both URLs to Vercel env for all three projects (when API is deployed in P0-B).
11. Update `infrastructure/docker/docker-compose.yml` — local Postgres remains for fully-offline dev, but `.env` defaults to Neon dev branch.

**Definition of Done:**
- `pnpm db:studio` opens and shows all tables and seeded categories.
- A throwaway script in the API runs `select * from developers` and returns successfully.
- Both connection strings are in Vercel env (not committed to repo).
- `docs/runbooks/database.md` documents how to create a new branch, rollback a migration, restore from a point in time.

### P0-B. Deploy the Hono API

**Why.** Web frontends are useless without an API.

**Decision:** deploy to **Vercel as a serverless function** (single fluid-compute fly-by-night) for parity with the rest of the stack. Acceptable alternatives: Fly.io (longer-lived, better for workers), Railway. Avoid Render free tier (cold starts kill UX).

**Steps:**
1. Add `services/api/api/index.ts` Vercel handler that wraps the Hono app.
2. Add `services/api/vercel.json` with `framework: null`, runtime `nodejs22.x`, region matching the DB region.
3. Add `services/api` to the Vercel projects list (4th Vercel project: `openmarket-api`).
4. Configure env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (= deployed API URL), `MEILI_URL`, `MEILI_MASTER_KEY`, `REDIS_URL` (Upstash for serverless).
5. Hook up Upstash Redis (free tier) — replace local Redis with `redis://...upstash.io:6379` connection string.
6. Add a smoke test: `curl https://openmarket-api.vercel.app/health` returns `{"status":"ok"}`.
7. Update all three frontends' `NEXT_PUBLIC_API_URL` to the deployed URL.
8. Update CORS in `services/api/src/index.ts` to allow the three frontend origins.

**Definition of Done:**
- All three frontend Vercel projects can hit a real API endpoint and get real JSON.
- Better Auth `/auth/sign-up` works end-to-end (account in DB, session cookie set).
- Worker queues are reachable (Upstash Redis is accessible from API and from a workers process — workers can run on Fly.io or as a Vercel cron + queue consumer).

### P0-C. Real binary storage — **Cloudflare R2**

**Why.** APK uploads are the core of the marketplace. Currently the `fileUrl` column has no storage backing it.

**Decision (locked):** **Cloudflare R2.** S3-compatible API, **zero egress costs**, integrates natively with Cloudflare CDN/Workers. APKs are 50–500 MB each — at 10k installs/month of an average 80 MB app, that's ~800 GB egress. Supabase Storage / S3 would cost real money at that scale; R2 stays free up to 10 GB stored + zero egress always. This decision compounds: every Tier 2 feature (top charts, featured collections, search promotion) drives more downloads.

**Buckets:**
- `openmarket-artifacts` (private) — APK and AAB binaries. Access only via signed URLs from the API.
- `openmarket-media` (public, behind CDN) — icons, screenshots, feature graphics, preview video posters.

**Why two buckets:** different access patterns, different cache strategies, different lifecycle policies. Artifacts get versioned + retained forever; media gets aggressive CDN caching with content-hashed filenames.

**Architecture:**
1. Developer initiates upload from `dev-portal`. API issues a presigned S3 PUT URL via R2's S3-compatible API (`@aws-sdk/s3-request-presigner` against R2 endpoint).
2. Browser PUTs APK directly to R2. No proxy through API server (avoids serverless body-size limits and saves bandwidth).
3. On upload complete, browser POSTs `{ artifactId, sha256, size }` to API.
4. API verifies SHA256 by issuing a HEAD against R2 and reading the `etag` (R2 returns multipart-aware checksums); if matches, enqueues `ingest:apk` job.
5. Ingest worker (on Fly.io) downloads from R2 to local tmpfs, parses with `adbkit-apkreader`, writes `artifactMetadata`, enqueues `scan:apk` job, deletes tmpfs file.
6. Scan worker runs permission analyzer + risk scorer + signing key check + repackaging check, writes `securityScans`, marks artifact as `verified` or `rejected`.
7. On `verified`, search-worker enqueued to index the app.
8. End users download via signed URL (5-min expiry) generated by API; R2 serves directly with zero egress cost on Cloudflare network.

**Schema additions:** `releaseArtifacts.storageKey` (R2 object key, e.g., `artifacts/{artifactId}/{sha256}.apk`). Keep `fileUrl` as legacy field; deprecate after migration.

**Steps:**
1. Create R2 buckets: `openmarket-artifacts` (private), `openmarket-media` (public, with custom domain `cdn.openmarket.app`).
2. Generate R2 API token with read/write on both buckets.
3. Add `services/api/src/lib/storage.ts`:
   - `getSignedUploadUrl(artifactId, sha256)` returning presigned PUT.
   - `getSignedDownloadUrl(artifactId, expiresIn)` returning presigned GET.
   - `getMediaUrl(key)` returning `https://cdn.openmarket.app/{key}` (no signing, public).
4. Add `POST /releases/:releaseId/artifacts/upload-url` returning presigned URL.
5. Add `POST /artifacts/:artifactId/finalize` — verify SHA256, mark uploaded, enqueue ingest job.
6. Add `GET /artifacts/:artifactId/download` returning short-lived signed URL (auth required).
7. Wire ingest worker (services/ingest-worker) to actually download + parse + extract icon and feature graphic to `openmarket-media` with content-hashed keys.
8. Add Cloudflare Worker (later, in P1-P) on `cdn.openmarket.app` to serve from R2 with image transformations.

**Definition of Done:**
- A developer in dev-portal can upload an APK; it lands in `openmarket-artifacts/artifacts/{id}/{sha}.apk`.
- Ingest worker parses it and writes `artifactMetadata` to the DB.
- Scan worker writes a security scan record.
- Market-web renders the app's icon from `cdn.openmarket.app/apps/{id}/icon@512.webp`.
- Signed download URLs expire after 5 minutes and are not cacheable.

### P0-D. Email transport

**Why.** Better Auth needs email for verification + password reset. Notify worker needs email for receipts.

**Decision:** **Resend**. React Email for templates. Free tier covers all of v1. Alternative: Postmark (better deliverability, paid).

**Steps:**
1. Add `RESEND_API_KEY` to env.
2. `pnpm add -F notify-worker resend @react-email/components react-email`.
3. Create `services/notify-worker/src/templates/` with `welcome.tsx`, `verify-email.tsx`, `password-reset.tsx`, `app-published.tsx`, `report-resolved.tsx`.
4. Wire Better Auth's email transport to Resend.
5. Add a `POST /admin/test-email` endpoint (admin-only) for sanity testing.
6. Configure DKIM/SPF for `mail.openmarket.example` (or whatever domain we use).

**Definition of Done:**
- A new dev-portal signup receives a verification email within 30s.
- Password reset emails arrive and the link works.
- Email is sent from a real domain with passing DKIM/SPF.

### P0-E. Legal pages and policies

**Why.** Required for app store hosting (DMCA safe-harbor depends on a published agent), required for GDPR/CCPA, blocks Google sign-in OAuth verification.

**Pages required (in `apps/market-web/src/app/(legal)`):**
- `/privacy` — privacy policy (what data we collect, why, how to delete).
- `/terms` — terms of service.
- `/dmca` — DMCA notice and counter-notice procedure with named agent.
- `/content-policy` — what we do/don't allow on the platform; ties to moderation rules.
- `/transparency-report` — placeholder for now; auto-populated in Tier 2.
- `/security` — vulnerability disclosure (security.txt).
- `/about` — mission, team, contact.

**Decision:** Use a lawyer-reviewed template (Termly, iubenda, or hand-rolled from EFF templates) and customize. **Do not generate legal text from scratch.** Save final text to `docs/policies/` as the canonical source; render via MDX in market-web.

**Definition of Done:**
- All seven pages exist and are linked from the footer of all three apps.
- `/.well-known/security.txt` resolves and lists a real contact.
- `/dmca` lists a registered DMCA agent (real person, real address — required by 17 USC 512(c)(2)).

### P0-F. Production observability

**Why.** As soon as real users hit the platform we need to know what's failing.

**Stack:**
- **Sentry** for error tracking (client + server). Free tier sufficient for v1.
- **Vercel Logs** for runtime logs.
- **Better Stack** or **UptimeRobot** for uptime/synthetic checks.
- **Plausible** or **Umami** (self-hosted) for privacy-respecting analytics on market-web. **Not Google Analytics.**

**Steps:**
1. Add Sentry SDK to all three apps and the API.
2. Add Plausible script to market-web only (dev-portal and admin don't need analytics).
3. Add uptime monitor for: market-web home, API `/health`, dev-portal home.
4. Add Sentry release tracking via Vercel build hook.

**Definition of Done:**
- An intentional thrown error in any app shows up in Sentry within 30s.
- Uptime dashboard shows green for all three frontends + API.
- Plausible shows pageviews on market-web home.

### P0-G. Disable broken paths until fixed

**Why.** We currently link to features that don't work (e.g., "Install" button when there's no APK).

**Steps:**
1. Audit all three apps for buttons/links that hit endpoints that don't return real data.
2. Replace with `EmptyState` or "Coming soon" placeholders that don't 500.
3. Add a feature-flag pattern (`process.env.NEXT_PUBLIC_FEATURE_X`) so we can light up surfaces as Tier 1 ships.

**Definition of Done:**
- No clickable element on market-web returns a 500 or shows a stack trace.
- No silent failures — every broken-by-design surface either works or shows an explicit "not yet available."

---

## 5. Phase 1 — Foundation (Tier 1, must-have)

**Goal:** A real user installs a real app from a real developer, and a real moderator can take action. By end of Phase 1 the platform is *credible* — small but coherent.

### P1-A. User accounts (storefront)

**What.** Today only developers and admins have accounts. Users browsing market-web can't sign in, so wishlist/library/reviews can't work.

**Schema:** `users` already exists (`packages/db/src/schema/users.ts`). Needs:
- `avatarUrl` text
- `locale` text default 'en-US'
- `country` text (from IP at signup)
- `notificationPreferences` jsonb default '{"email":true,"push":false}'
- `deletedAt` timestamp (soft delete for GDPR Right to Erasure)

**Auth.** Better Auth with email+password and Google OAuth. (GitHub OAuth already wired for dev-portal — reuse the provider list.)

**API:**
- `POST /users/sign-up`, `POST /users/sign-in`, `POST /users/sign-out` via Better Auth.
- `GET /users/me`, `PATCH /users/me`, `DELETE /users/me` (soft-delete).
- `POST /users/me/avatar` — signed upload URL.

**Frontend (market-web):**
- `/sign-in`, `/sign-up`, `/account` pages.
- Header: avatar dropdown when signed in.
- All previously gated features (wishlist, library, reviews) now check auth state.

**Definition of Done:**
- A user can sign up, verify email, sign in, set avatar, change display name, delete account.
- Account deletion soft-deletes for 30 days then a daily cron hard-deletes (with audit log entry).

### P1-B. Library / installed apps page

**What.** "My apps" — what the user has installed via OpenMarket. Mirror of Play Store's Library.

**Schema additions** (`packages/db/src/schema/users.ts`):
```ts
export const libraryEntries = pgTable("library_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  appId: uuid("app_id").references(() => apps.id, { onDelete: "cascade" }).notNull(),
  installedVersionCode: integer("installed_version_code"),
  installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow().notNull(),
  uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  isOwned: boolean("is_owned").default(true).notNull(),  // for paid apps in Tier 4
  source: installSourceEnum("source").default("store_app").notNull(),
}, (t) => [uniqueIndex("library_user_app_idx").on(t.userId, t.appId)]);
```

**API:**
- `GET /users/me/library?status=installed|uninstalled|all` — paginated.
- `POST /users/me/library/:appId` — record install (called by Android client).
- `DELETE /users/me/library/:appId` — record uninstall.

**Frontend:**
- `/library` page with three tabs: Installed, Updates Available, Uninstalled.
- Each entry shows: icon, name, last opened, current version vs available version, "Update" / "Open" / "Reinstall" actions.

**Definition of Done:**
- A signed-in user who installs from the Android client sees the app in `/library` within 5s.
- Updates badge reflects real version diff (current installed `versionCode` < latest published `versionCode`).

### P1-C. Wishlist

**What.** Save for later.

**Schema additions:**
```ts
export const wishlistEntries = pgTable("wishlist_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  appId: uuid("app_id").references(() => apps.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("wishlist_user_app_idx").on(t.userId, t.appId)]);
```

**API:**
- `GET /users/me/wishlist`
- `PUT /users/me/wishlist/:appId` (idempotent add)
- `DELETE /users/me/wishlist/:appId`

**Frontend:**
- Heart icon on `AppCard` and app detail page; toggles wishlist.
- `/wishlist` page.

**Definition of Done:**
- Heart toggles instantly (optimistic), persists across reloads, syncs to Android.

### P1-D. App size, last-updated, compatibility surfacing

**What.** Play Store shows: download size, last updated, current version, supported Android versions, supported architectures. We have all this data in `releaseArtifacts` and `artifactMetadata` but never display it.

**Schema:** add `installSize` (post-install size estimated from APK + assets) to `artifactMetadata` if not present.

**API:** include in `GET /apps/:idOrPackageName` response:
- `latestRelease.versionName`, `versionCode`, `releasedAt`
- `latestArtifact.fileSize`, `installSize`, `minSdk`, `targetSdk`, `abis`
- `compatibility` — derived: `requiresAndroid` text (e.g., "Android 8.0+"), `architectures` array.

**Frontend:**
- App detail page: "About this app" section with these fields rendered as a definition list.

**Definition of Done:**
- App detail shows real size in MB, real "Last updated 3 days ago", real "Requires Android X.X+".
- Sizes are formatted (1.4 MB, not 1466367).

### P1-E. What's new / release notes per release

**What.** `releases.releaseNotes` already exists. Surface it.

**Frontend:**
- App detail: "What's new" section showing latest release's `releaseNotes` (markdown allowed, sanitized).
- Expandable to show prior 5 release notes.

**Definition of Done:**
- Release notes render with basic markdown (paragraphs, lists, links — no images, no scripts).
- Old releases are accessible via a "Version history" disclosure.

### P1-F. Update-all + auto-update (Android client)

**What.** Core marketplace UX. The Android client polls for updates and either (a) shows a badge (auto-update off) or (b) downloads + installs in background (auto-update on).

**Schema:** none new — `library_entries.installedVersionCode` is the source of truth.

**API:**
- `POST /users/me/library/check-updates` — body `[{packageName, versionCode}, ...]` → response `[{packageName, latestVersionCode, downloadUrl, releaseNotes}, ...]`.

**Android:**
- `WorkManager` periodic worker, default 6h interval, runs only on unmetered network unless user overrides.
- Notification when updates are available (auto-update off).
- Silent background install via `PackageInstaller` API (auto-update on, requires user to grant `REQUEST_INSTALL_PACKAGES`).
- "Update all" button on `/library` updates tab.

**Definition of Done:**
- Test scenario: install app v1, push v2, observe Android client picks it up within next worker cycle, shows update notification.
- "Update all" updates everything in one tap.

### P1-G. Reviews + ratings (real surface)

**What.** `reviews` table already exists. Need to actually let users post and read them.

**API (already in `services/api/src/routes/reviews.ts`):**
- `GET /apps/:id/reviews?sort=helpful|recent&rating=1..5`
- `POST /apps/:id/reviews` (signed-in users with `library_entries` for this app — i.e., must have installed)
- `PATCH /reviews/:id` (own only)
- `DELETE /reviews/:id` (own or admin)
- `POST /reviews/:id/helpful` (one per user)
- `POST /reviews/:id/report` (creates `reports` row)

**Verification rule:** must have `library_entries` row for that app to post a review. (Prevents review-bombing by non-users.)

**Frontend:**
- App detail: rating distribution histogram, sort/filter, paginated list.
- "Write a review" CTA only shows when user has installed.
- My reviews page (`/account/reviews`).

**Definition of Done:**
- A user with no install attempt cannot post a review (API returns 403).
- Sort by helpful, recent, by rating works.
- Average rating updates within 60s of a new review (cached recompute).

### P1-H. Developer responses to reviews

**What.** Developer can reply to reviews on their own apps. Single threaded reply.

**Schema additions:**
```ts
export const reviewResponses = pgTable("review_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewId: uuid("review_id").references(() => reviews.id, { onDelete: "cascade" }).unique().notNull(),
  developerId: uuid("developer_id").references(() => developers.id).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**API:**
- `POST /reviews/:id/response` (developer of the app only).
- `PATCH /reviews/:id/response`.
- `DELETE /reviews/:id/response`.

**Frontend (dev-portal):**
- `/apps/:id/reviews` page listing reviews with reply UI.
- Email notification to developer when new review posted (notify-worker).

**Definition of Done:**
- Developer replies show on app detail under the original review with "Developer response" label.

### P1-I. Real APK ingest pipeline (verification)

**What.** P0-C built the storage. Now make sure the ingest pipeline actually works end-to-end with edge cases.

**Edge cases to handle:**
- Corrupted APK → reject with clear error.
- APK missing `AndroidManifest.xml` → reject.
- `versionCode` already exists → reject (uniqueIndex on `app_id, version_code`).
- Signing key fingerprint differs from prior release → reject (or escalate to admin if first release of an established app).
- Debug build → reject for stable channel, allow on canary.
- File size > 500 MB → reject (configurable).
- Native libs in unexpected ABI → flag but don't reject.

**API:** `POST /releases/:id/artifacts/finalize` returns rich error codes.

**Worker:** `services/ingest-worker/src/processors/apk.ts` handles each rejection deterministically, writes a `releaseEvents` row with reason.

**New schema:**
```ts
export const releaseEvents = pgTable("release_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  releaseId: uuid("release_id").references(() => releases.id, { onDelete: "cascade" }).notNull(),
  eventType: text("event_type").notNull(),  // 'uploaded', 'parsed', 'scanned', 'rejected', 'published', etc.
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**Definition of Done:**
- All eight edge cases above produce predictable, debuggable outcomes (test in `services/ingest-worker/src/__tests__/`).
- Developer sees the rejection reason in dev-portal release detail.

### P1-J. Real security scan pipeline

**What.** Today `scan-worker` is a skeleton. Need real scans.

**Scans to run:**
1. **Permission analyzer** (already in `packages/security-rules/`) — flag dangerous permissions, output a permission risk score.
2. **Signing-key sanity** — verify APK is signed with v2/v3 signing scheme, fingerprint matches developer's registered fingerprint for this app.
3. **Native lib scan** — list native libs, flag known-bad SHA256s (maintain a small in-repo blocklist for v1).
4. **Repackaging detection** (basic) — extract package name + signing key fingerprint; if package name is associated with a *different* signing fingerprint elsewhere on the platform, flag for admin review.
5. **VirusTotal integration (optional, free tier)** — submit hash, retrieve verdict; cache.
6. **Embedded URL extraction** — extract URLs from APK strings, flag against a domain reputation list.

**Schema:** `securityScans` table (already in `packages/db/src/schema/security.ts` — verify and extend).

**Output:**
- Risk score 0–100.
- Categorical flags (high/medium/low for each category).
- Detailed findings list.

**Frontend:**
- Dev-portal: "Security report" tab on each release.
- Admin: scan results in risk-queue.
- Market-web: "Data safety" section showing user-readable summary (not raw scan data).

**Definition of Done:**
- Every uploaded APK gets a security scan within 5 min.
- Admins can drill into findings.
- Repackaging detection flags real cases (test with deliberately different signing key).

### P1-K. Reports / takedowns workflow (real)

**What.** `reports` table exists; admin route exists. Need a usable workflow.

**API additions:**
- `POST /reports` — anyone (signed-in) can report any target type.
- `GET /admin/reports?status=open&type=malware` — paginated, filterable.
- `POST /admin/reports/:id/resolve` — body: `{ resolution: 'delist'|'warn'|'dismiss', notes }`.

**Workflow:**
1. User submits report → `reports` row, status `open`.
2. Notify-worker emails moderation queue.
3. Admin investigates, resolves with action.
4. If `delist`: app gets `isDelisted=true`, `delistReason=<notes>`, public transparency log entry created.
5. Reporter gets resolution email.
6. Developer gets takedown notice (with appeal link).

**New schema for transparency:**
```ts
export const transparencyEvents = pgTable("transparency_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),  // 'app_delisted', 'developer_banned', 'review_removed', etc.
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason").notNull(),
  ruleVersion: text("rule_version").notNull(),  // pointer to which version of /content-policy
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**Frontend:**
- Market-web: `/transparency-report` lists `transparencyEvents` with filters (last 30 days, by category).
- Admin: report queue with bulk actions (resolve N at once, common dismissal reasons).

**Definition of Done:**
- A reported app moves through the queue and lands as a public transparency log entry.
- Reporter and developer both get email notifications.
- Public transparency report renders the last 1000 events.

### P1-L. Developer appeals

**What.** Per Principle 3, no takedown without due process.

**Schema:**
```ts
export const appeals = pgTable("appeals", {
  id: uuid("id").primaryKey().defaultRandom(),
  developerId: uuid("developer_id").references(() => developers.id).notNull(),
  targetType: text("target_type").notNull(),  // 'app_delisting', 'developer_ban'
  targetId: uuid("target_id").notNull(),
  body: text("body").notNull(),
  status: text("status").default("open").notNull(),  // open, in_review, accepted, rejected
  resolution: text("resolution"),
  resolvedBy: uuid("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**API:** `POST /developers/me/appeals`, `GET /admin/appeals`, `POST /admin/appeals/:id/resolve`.

**Frontend:**
- Dev-portal: when a developer's app is delisted, the app detail page shows "Appeal this decision" form.
- Admin: appeals queue, separate from reports.

**Definition of Done:**
- A delisted developer can submit an appeal; admin can accept (un-delist + transparency event) or reject (close with reason).

### P1-M. Search hardening

**What.** Search currently scaffolded but not robust.

**Improvements:**
- Index updates on every release publish (search-worker subscribes to `releases.published` events).
- Multi-language tokenization (Meilisearch supports it natively, ensure config is right).
- Synonyms config (e.g., "calc" → "calculator", "sms" → "messaging").
- Result ranking: name match > description match > tags match. Boost by recent activity, downloads, rating.
- Filters: category, content rating, contains-ads, contains-IAP, free/paid, min-rating, last-updated within X days.
- Typo tolerance (Meilisearch default).
- Suggested searches / popular queries (track in `searchQueries` table).

**Schema:**
```ts
export const searchQueries = pgTable("search_queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  query: text("query").notNull(),
  userId: uuid("user_id"),
  resultCount: integer("result_count"),
  clickedAppId: uuid("clicked_app_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("search_queries_query_idx").on(t.query)]);
```

**Definition of Done:**
- Search "calculator" returns calculator apps with name match first.
- Filtering by category + rating + free works.
- Typo: "calcuator" still returns calculator apps.
- Top searches are visible on `/search` empty state.

### P1-N. Categorization curation

**What.** Categories table is seeded but apps need to actually belong to them and we need editorial control over the canonical category list.

**Schema:** `categories` table (already in seed) needs:
- `iconUrl`
- `description`
- `position` (sort order)
- `isFeatured` boolean

**API:**
- `GET /categories?featured=true`
- `GET /apps?category=games&subcategory=puzzle`
- `GET /categories/:slug` — category detail with featured apps.

**Frontend:**
- Market-web: home page categories grid.
- `/categories/:slug` category page.
- Admin: categories CRUD + featured toggle.

**Definition of Done:**
- Categories grid on home renders 12 categories with icons.
- Each category page shows top apps in that category.

### P1-O. Better Auth: hardening

**What.** Better Auth is set up but a few production necessities are missing.

**Items:**
- Rate limiting on sign-in (3/min per IP, 10/hr per email).
- Session timeout / refresh.
- "Sign out everywhere" endpoint.
- 2FA via TOTP (developer accounts only — required for publishing privilege in v2 but optional in v1).
- OAuth: Google + GitHub for both users and developers.
- Account merge: one user record across providers (don't fork on email).

**Definition of Done:**
- Brute-force password attempts get rate-limited.
- "Sign out everywhere" invalidates all sessions for that user.
- Google sign-in works on all three apps.

### P1-P. CDN for media

**What.** Icons, screenshots, feature graphics need CDN delivery, not direct Supabase URLs.

**Decision:** Supabase Storage CDN is already a CDN (Fastly). For higher control, Cloudflare in front of the public bucket. v1 = Supabase native CDN.

**Image optimization:**
- Next.js `<Image>` with the Supabase URL as `loader` (custom transformation).
- Pre-resize on upload: ingest worker generates 64x64, 192x192, 512x512 icon variants, 320x568 and 1080x1920 screenshot variants. Store all under structured paths (`apps/{appId}/icon@512.webp`).
- WebP + AVIF outputs.

**Definition of Done:**
- A loaded app detail page transfers <500 KB of image data on first paint (verified with Lighthouse).

### P1-Q. Sitemap + SEO + structured data

**What.** Market-web needs to be discoverable.

**Items:**
- `/sitemap.xml` lists all published apps.
- `/robots.txt`.
- Per-app structured data (JSON-LD: `SoftwareApplication`).
- OpenGraph + Twitter Card meta tags on app detail.
- Dynamic OG image generation per app (`@vercel/og`).
- Canonical URLs (`https://openmarket.example/apps/com.example.app`).

**Definition of Done:**
- Sitemap renders 1 entry per published app, regenerated daily.
- Sharing an app URL on Twitter/Slack shows a card with icon + title.

### P1-R. Audit log + admin trail

**What.** `audit_log` table exists. Make sure every admin action writes to it.

**Items:**
- Middleware in `services/api/src/middleware/admin.ts` writes audit entry on any mutating admin endpoint.
- Diff capture: store before/after JSON for the affected row.
- Frontend: `/admin/audit-log` (already exists) renders entries with filters (admin user, action type, date range).

**Definition of Done:**
- Every delisting, every developer ban, every review removal has an audit log entry with the actor.
- Audit log is read-only — no API to mutate.

### P1-S. Rate limiting + abuse controls

**What.** Public APIs need rate limits. v1: per-IP token bucket on critical endpoints.

**Decision:** Upstash Ratelimit (works with Upstash Redis). Tiers:
- Anonymous: 60 req/min on `/apps`, `/search`, `/categories`. 5 req/hr on `/reports`.
- Signed-in user: 300 req/min generally, 30/hr on `POST /reviews`.
- Developer: 600 req/min, 10/min on uploads.

**Definition of Done:**
- Hitting `/search` 200 times in 60s returns 429 after the limit.
- 429 response includes `Retry-After` header.

### P1-T. Backups + disaster recovery

**What.** Production data needs backups.

**Items:**
- Supabase auto-daily backups enabled (default on Pro tier; verify on free).
- Weekly full export to a separate region (Cloudflare R2).
- Storage backups: weekly mirror of `apk-artifacts` to R2.
- Documented recovery runbook in `docs/runbooks/disaster-recovery.md`.

**Definition of Done:**
- A test restore from 24h-old backup brings up a parallel staging DB with the same data.

---

## 6. Phase 2 — Core marketplace parity (Tier 2, should-have)

**Goal:** Stop being "v1 missing things" and start being "small but legit Play Store alternative."

### P2-A. Top Charts

Free, paid, top-grossing (placeholder for Tier 4), top-new. Per category and overall. Per country (by user IP / preference).

**Schema:** materialized view `app_chart_positions` recomputed hourly by a cron worker. Stores 24h, 7d, 30d windows.
- Signals: install velocity (delta installs per period), retention (returning users / total installs), rating, recency-decay.

**API:** `GET /charts/{top-free|top-new|top-trending}?category=&country=`.

**Frontend:** market-web `/charts` page; home page includes "Top free apps" and "Trending" rails.

**DoD:** Charts repopulate hourly; admin can see ranking signals on each app.

### P2-B. "Similar apps" / recommendations

**v1 approach:** content-based — same category + similar permission set + similar tag overlap.

**Schema:** none new; computed at query time with a per-app cache (5-min TTL).

**API:** `GET /apps/:id/similar`.

**Frontend:** "Similar apps" rail on app detail page, "You might also like" on library page.

**DoD:** Looks reasonable for 20 hand-picked test apps. Not Spotify-quality, but not random.

### P2-C. Featured collections / Editor's Choice

**Schema:**
```ts
export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique().notNull(),
  title: text("title").notNull(),
  description: text("description"),
  heroImageUrl: text("hero_image_url"),
  curator: text("curator"),  // "OpenMarket Editorial" etc.
  isPublished: boolean("is_published").default(false).notNull(),
  position: integer("position").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const collectionApps = pgTable("collection_apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id").references(() => collections.id, { onDelete: "cascade" }).notNull(),
  appId: uuid("app_id").references(() => apps.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").default(0),
  blurb: text("blurb"),
});
```

**Admin:** drag-and-drop curation UI. Featured collections render labeled "Curated by OpenMarket Editorial" — not algorithmic.

**Frontend:** market-web home page renders top 3 collections. `/collections/:slug` shows full collection.

**DoD:** Admin can create a collection, add 10 apps, publish, see it on home.

### P2-D. Beta / canary tracks per app

**Schema:** `releases.channel` already exists (`stable`, `beta`, `canary`).

**Need:**
```ts
export const betaTesters = pgTable("beta_testers", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id").references(() => apps.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("beta_testers_app_user_idx").on(t.appId, t.userId)]);
```

**API:** `POST /apps/:id/beta/join`, `DELETE /apps/:id/beta/leave`.

**Frontend (market-web):** "Join the beta" button on app detail when developer has enabled it.

**Frontend (dev-portal):** beta-track release UI; can promote canary → beta → stable.

**Android:** beta channel users get beta releases via update check.

**DoD:** A user joins beta, gets the beta version on next update check, can leave beta and reverts to stable on next stable release.

### P2-E. Staged rollouts (developer side)

**Schema:** `releases.rolloutPercentage` already exists.

**Need:**
- `releaseRollouts` table tracking rollout history per release.
- Update-check API factors rollout percentage by user-id hash modulo.

**API:** `PATCH /releases/:id/rollout` body `{ percentage }`.

**Frontend (dev-portal):** rollout slider 1% → 100%. Recent install/crash stats for staged users to inform decisions.

**DoD:** A release set to 10% rollout is delivered to ~10% of update checks.

### P2-F. Crash reports

**What.** Minimal crash collection so developers can debug. Not a full Sentry replacement; just enough.

**Schema:**
```ts
export const crashReports = pgTable("crash_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id").references(() => apps.id, { onDelete: "cascade" }).notNull(),
  versionCode: integer("version_code").notNull(),
  userId: uuid("user_id"),  // nullable if user opted out
  stackTraceHash: text("stack_trace_hash").notNull(),  // for dedup
  stackTrace: text("stack_trace").notNull(),
  threadName: text("thread_name"),
  exceptionClass: text("exception_class"),
  exceptionMessage: text("exception_message"),
  osVersion: text("os_version"),
  deviceModel: text("device_model"),
  abi: text("abi"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("crash_reports_app_version_idx").on(t.appId, t.versionCode),
  index("crash_reports_hash_idx").on(t.stackTraceHash),
]);
```

**Android client:** `Thread.setDefaultUncaughtExceptionHandler` writes a crash file, syncs on next launch over Wi-Fi only. User opt-in at first launch.

**Dev-portal:** `/apps/:id/crashes` page with grouped-by-hash table, version filter, frequency chart.

**DoD:** A deliberate crash in a test app shows up in the developer's crash report within 5 min of next launch. Crashes group by stack trace hash.

### P2-G. App preview videos

**Schema:** `appListings.previewVideoUrl` text (single URL — YouTube embed allowed for v1, native upload to Storage in v2).

**Frontend:** Hero on app detail page plays the preview video (poster = featureGraphic).

**Dev-portal:** form field for preview video URL with validation (YouTube/Vimeo only initially).

**DoD:** A developer adds a YouTube URL; user sees the embedded preview on app detail.

### P2-H. Localized listings

**What.** Per-locale title, description, screenshots.

**Schema:**
```ts
export const appListingLocales = pgTable("app_listing_locales", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").references(() => appListings.id, { onDelete: "cascade" }).notNull(),
  locale: text("locale").notNull(),  // 'en-US', 'es-ES', etc.
  title: text("title"),
  shortDescription: text("short_description"),
  fullDescription: text("full_description"),
  screenshots: text("screenshots").array(),
  releaseNotes: text("release_notes"),  // per-locale release notes
}, (t) => [uniqueIndex("listing_locale_idx").on(t.listingId, t.locale)]);
```

**API:** locale-aware app fetch — `Accept-Language` header drives locale, falls back to default.

**Dev-portal:** "Translations" tab on each app listing.

**Market-web:** locale switcher in footer; respects browser locale by default.

**DoD:** A Spanish-locale user sees Spanish listing for an app that has a Spanish translation.

### P2-I. Data safety labels

**What.** Play Store-style "what data does this app collect?" panel.

**Schema:**
```ts
export const dataSafetyDeclarations = pgTable("data_safety_declarations", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id").references(() => apps.id, { onDelete: "cascade" }).unique().notNull(),
  collectsData: boolean("collects_data").notNull(),
  sharesData: boolean("shares_data").notNull(),
  dataEncryptedInTransit: boolean("data_encrypted_in_transit"),
  dataDeletionRequestUrl: text("data_deletion_request_url"),
  dataTypes: jsonb("data_types"),  // { "location": { collected, shared, optional, purpose: [] }, ... }
  privacyPolicyUrl: text("privacy_policy_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**Admin verification flow:** scan-worker compares declared collected data types against detected permissions; flag discrepancies.

**Dev-portal:** form-driven declaration UI matching Play Store's questionnaire.

**Market-web:** "Data safety" accordion on app detail.

**DoD:** A developer fills the form, the data shows on app detail, the admin sees a flag if declared "doesn't collect location" but APK has `ACCESS_FINE_LOCATION`.

### P2-J. Review filters and review moderation

**Items:**
- Sort: helpful, newest, oldest, highest rating, lowest rating.
- Filter: by version, by device type, with developer response only.
- Admin: review removal with reason → public transparency event.
- Auto-detection of: review bombs (sudden 1-star spike), spam reviews (duplicates, very short), hate speech (basic ML or perspective-API integration).

**DoD:** A 1-star review bomb (>50 1-star in <1h) auto-flags for moderator review.

### P2-K. Moderation tooling — bulk actions + saved filters

**Frontend (admin):**
- Multi-select on report queue.
- Bulk actions: "Resolve as dismissed", "Resolve as delist", "Assign to me".
- Saved filters: "high-priority malware reports", "old open reports", etc.
- Keyboard shortcuts (j/k for next/prev, e for resolve, etc.).

**DoD:** Moderator can resolve 50 reports in under 5 min if they're all the same disposition.

### P2-L. DMCA workflow

**Schema:**
```ts
export const dmcaNotices = pgTable("dmca_notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  noticeNumber: text("notice_number").unique().notNull(),  // human-readable, e.g., DMCA-2026-00042
  claimantName: text("claimant_name").notNull(),
  claimantEmail: text("claimant_email").notNull(),
  claimantAddress: text("claimant_address").notNull(),
  copyrightedWork: text("copyrighted_work").notNull(),
  infringingUrl: text("infringing_url").notNull(),
  goodFaithStatement: boolean("good_faith_statement").notNull(),
  accuracyStatement: boolean("accuracy_statement").notNull(),
  signature: text("signature").notNull(),
  status: text("status").default("received").notNull(),  // received, valid, invalid, processed, counter-noticed
  resolution: text("resolution"),
  appId: uuid("app_id").references(() => apps.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});
export const dmcaCounterNotices = pgTable("dmca_counter_notices", { /* mirrors */ });
```

**Frontend:** market-web `/dmca` form for notice submission. Admin queue for processing.

**Workflow per 17 USC 512:**
1. Notice received → admin reviews → if valid, take down within "expeditiously" (interpreted as 24h).
2. Notify alleged infringer with notice copy.
3. Counter-notice workflow with 10–14 day waiting period.

**DoD:** Full notice → takedown → counter-notice → restore cycle works.

### P2-M. Developer statistics dashboard

**What.** Real numbers per app per developer.

**Metrics:**
- Total installs, active installs (library entries with no `uninstalledAt`).
- Daily/weekly install velocity.
- Rating + review count over time.
- Crash-free rate per version.
- Country breakdown.
- Search impression count, store listing visit count.

**Schema:** `app_statistics_daily` aggregation table populated by a daily cron.

**Frontend (dev-portal):** `/apps/:id/statistics` with line charts (Recharts), date-range picker.

**DoD:** Developer sees real install numbers updated within 24h.

### P2-N. Developer team management

**Schema:**
```ts
export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  developerId: uuid("developer_id").references(() => developers.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull(),  // 'owner', 'admin', 'developer', 'viewer'
  invitedBy: uuid("invited_by"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("team_dev_user_idx").on(t.developerId, t.userId)]);
```

**API + UI:** invite by email; permissions enforced in middleware.

**DoD:** Owner invites a teammate; teammate gets email; teammate accepts and can publish releases.

### P2-O. CI/CD upload API

**What.** Programmatic release uploads — required for any serious developer.

**API:**
- `POST /api/cli/releases` — multipart upload, requires API token.
- API tokens managed via `/account/api-tokens` (generate, scope, revoke).

**CLI:** small `openmarket-cli` package (`@openmarket/cli`) — `openmarket release upload --apk path.apk --channel beta --notes "..."`.

**Schema:**
```ts
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  developerId: uuid("developer_id").references(() => developers.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),  // SHA256
  prefix: text("prefix").notNull(),  // first 8 chars for identification
  scopes: text("scopes").array().notNull(),  // ['releases:write', 'apps:read', ...]
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**DoD:** A developer generates a token, runs `openmarket release upload`, and the release shows up in dev-portal as if uploaded via UI.

### P2-P. Push notifications (web + Android)

**Web push:** Service worker + VAPID keys. User opt-in.

**Android:** FCM (Firebase Cloud Messaging) — only place we touch Google services on the device side. Optional — users can opt out of FCM and rely on polling.

**Use cases:**
- Update available for installed app.
- Developer reply to your review.
- Wishlist app released a new version.
- Report you filed was resolved.

**Schema:**
```ts
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  platform: text("platform").notNull(),  // 'web', 'android'
  endpoint: text("endpoint").notNull(),
  keys: jsonb("keys"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**DoD:** A user with web push enabled gets a notification when a wishlisted app releases an update.

---

## 7. Phase 3 — Growth & polish (Tier 3, nice-to-have)

### P3-A. Pre-registration / pre-launch
Developer marks an app as "coming soon"; users can pre-register to be notified at launch.

### P3-B. A/B testing on store listings
Listing variants (title, screenshots, description) with traffic split. Win measured by install rate.

### P3-C. Promo codes
Developer generates codes that grant install (Tier 4: free purchase, here just preferred install track).

### P3-D. Review highlights
Auto-extracted "what users love" / "what users dislike" — keyword extraction from review bodies.

### P3-E. Family/household sharing
A user shares apps with up to 5 family members. Per-app developer opt-in.

### P3-F. Parental controls
Account type "child" with content rating filter and PIN gate on installs. Linked to a parent account.

### P3-G. AAB (Android App Bundle) support
Generate APKs from AAB at install time per device. Requires `bundletool`.

### P3-H. Custom app distribution channels
Developer creates an unlisted channel + share link, distributes to internal testers / beta waitlist outside the public store.

### P3-I. Refund window (Tier 4 + 3 hybrid)
For paid apps: 2-hour refund window automatic. For free apps: N/A.

### P3-J. Storage management UI on Android client
Show installed app sizes, "free up X MB" recommendations.

### P3-K. Offline mode
Cache app metadata locally; show installed apps + last-cached store browse when offline.

### P3-L. Accessibility audit + fixes
WCAG 2.1 AA compliance pass on all three frontends.

### P3-M. Performance budget enforcement
Lighthouse CI in PR checks. Budget: LCP < 2.5s, CLS < 0.1, JS bundle < 200KB on home.

### P3-N. Internationalization (i18n) of UI
All three apps with `next-intl`. v1 locales: en-US, es-ES, pt-BR, de-DE.

### P3-O. Source code transparency badge
Apps that link a public repo get a "Source available" badge. Bonus: build reproducibility verification (matches stored APK SHA256).

---

## 8. Phase 4 — Monetization & advanced (Tier 4)

### P4-A. Paid apps
Stripe-powered checkout. App pricing in `appPricing` table per-country. Refund window.

### P4-B. In-app products
Inventory + purchase API. Stripe-powered. Revenue share configured at developer level (default 88/12).

### P4-C. Subscriptions
Recurring billing via Stripe. Receipt verification API for developers.

### P4-D. Developer payouts
Stripe Connect for developer accounts. Monthly payouts. Tax form collection (W-9, W-8BEN).

### P4-E. Country pricing matrix
Per-country price overrides; auto-conversion suggestions.

### P4-F. Real-time analytics dashboard
Live install counter, currently-active-users (privacy-respecting — aggregated only).

### P4-G. Promoted listings (ads)
Sponsored search results, clearly labeled. Editorial policy: only labeled, never bumping established trust signals.

### P4-H. Affiliate program
Referral links to apps; pay-per-install commission for affiliates.

### P4-I. Enterprise / private store
White-label store for an organization with policy controls and managed app distribution.

### P4-J. Federation / decentralized index
Allow other instances to host catalogs; cross-index via signed metadata feeds. Inspired by F-Droid + ActivityPub.

---

## 9. Cross-cutting concerns

These run alongside every phase. Each has a single owner section above for implementation but is tracked here for visibility.

- **Security & secrets management.** All keys in Vercel env / 1Password. Quarterly rotation. Pre-commit hook for secret scanning (`gitleaks`).
- **Compliance.** GDPR (right to access, erasure, portability), CCPA (do-not-sell), COPPA (no users under 13), PIPEDA. Data export endpoint (`POST /users/me/export`) returns a downloadable JSON of all user data within 30 days of request.
- **Accessibility.** WCAG 2.1 AA for v1; AAA where reasonable. Manual + axe-core CI tests.
- **Performance.** Web Vitals tracked per route. Worst route tracked weekly.
- **Observability.** Sentry + Plausible + Better Stack. Per-route latency dashboards.
- **Testing.** Vitest for API, Playwright for e2e on all three apps. Run on every PR. Coverage target: 70% lines on packages, 50% on apps.
- **Documentation.** Every new endpoint added to `/docs/api/openapi.yaml`. Every new schema table to `/docs/data-model.md`.

---

## 10. Implementation sequencing (dependency graph)

Phase 0 must complete before any Phase 1 item starts. Within a phase, items can sometimes parallelize but the listed order is the recommended single-track order.

**Hard dependencies:**

- P1-A → P1-B, P1-C, P1-G, P1-H (user accounts → library/wishlist/reviews)
- P0-C → P1-I, P1-J (storage → ingest → scan)
- P0-D → P1-G (email → review notification)
- P1-I → P1-D, P1-E (real ingest → real metadata to surface)
- P1-K → P1-L (reports → appeals)
- P1-N → P2-A, P2-B (categories → charts/similar)
- P0-D → P2-P (email → push as channel of last resort)
- P2-A → most of Phase 3 marketing surfaces

**Recommended single-track order (the path I'll follow unless told otherwise):**
P0-A → P0-B → P0-C → P0-D → P0-E → P0-F → P0-G → P1-A → P1-B → P1-C → P1-D → P1-E → P1-G → P1-H → P1-I → P1-J → P1-K → P1-L → P1-N → P1-Q → P1-O → P1-P → P1-R → P1-S → P1-F → P1-T → P2-A → P2-C → P2-B → P2-I → P2-J → P2-K → P2-L → P2-M → P2-D → P2-E → P2-F → P2-G → P2-H → P2-N → P2-O → P2-P → Phase 3 items → Phase 4 items.

(P1-F = Android update-all is sequenced late because it depends on the API ingest+library being solid.)

---

## 11. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Supabase IPv4 add-on cost balloons | Low | Med | Plan B: migrate to Neon (already considered in P0-A). |
| 2 | APK ingest worker times out on large APKs | Med | High | Run worker on Fly.io with 8GB RAM; chunked download from Storage; size cap at 500 MB initially. |
| 3 | Malicious APK gets through scan | Med | High | Defense in depth: permission analyzer + sig check + repackaging detection + VirusTotal + user reports + admin review. Public security@ contact. |
| 4 | DMCA notices used to censor competitors | Low | Med | Counter-notice flow + transparency report of all takedowns + 24h human review. |
| 5 | Review bombs by ideological opponents | Med | Med | Detection (P2-J) + temporal weighting + verified-installer requirement. |
| 6 | Better Auth session handling has a vulnerability | Low | High | Pin to specific version, monitor advisories, run penetration test before P4. |
| 7 | Vercel serverless hits CPU limits on API | Med | Med | Move heavy paths (search, ingest) off Vercel to Fly.io workers. |
| 8 | Developer abuse: spam apps to game charts | High | Med | Trust tier system already in schema; new developers default to "experimental"; rate-limit publishes per developer; chart signals weight by trust tier. |
| 9 | Single point of failure: Supabase | Low | High | Daily backups to R2; documented restore runbook. |
| 10 | Legal exposure from hosting copyrighted apps | Med | High | DMCA agent registered; 24h takedown SLA; counter-notice flow; published content policy. |
| 11 | OAuth client_id loss (already happened) | Low | Low | Document `~/.claude` MCP auth flow in `docs/runbooks/`. |
| 12 | Scope creep into Tier 4 before Tier 1 ships | High | High | This document. We don't start Tier 2 items before Tier 1 closes. |

---

## 12. Definition of "Tier 1 done"

This is the milestone we hold ourselves to before Tier 2 starts. All of these must be true:

- [ ] DB connection works in production.
- [ ] API deployed and called by all three frontends.
- [ ] APK upload → storage → ingest → scan → publish pipeline works end-to-end with a real test app.
- [ ] User can: sign up, install (via Android), see in library, leave review, wishlist, get notification on update.
- [ ] Developer can: sign up, register an app, upload release, get reviewed, publish, see basic stats (install count from `library_entries`).
- [ ] Admin can: see reports, resolve them, delist apps, see audit log, see public transparency report rendered from real data.
- [ ] All seven legal pages live.
- [ ] Sentry receiving errors. Plausible receiving pageviews. Uptime monitor green.
- [ ] At least one full disaster-recovery drill completed.
- [ ] No clickable element returns 500.

---

## 13. Success metrics (we measure these from launch onward)

### Marketplace health
- Time-to-install (first visit → tap install): target < 60s.
- Search NDCG@10 (eval set of 50 hand-rated queries): target > 0.7.
- Search abandon rate (search → no click): target < 30%.
- Review-to-install ratio (reviews / installs): target 1–10% (proxy for engagement vs spam).

### Developer health
- Time-to-first-publish (signup → first release published): target < 24h.
- Release rejection rate: target < 30% on first attempt.
- Developer NPS (quarterly survey): target > 40.

### Trust & safety
- Time from report to first response: target < 24h.
- Time from valid takedown notice to action: target < 24h.
- Counter-notice rate: track but don't optimize.
- Re-publication rate on appeal: track to detect over-takedown.

### Platform
- p95 API latency: target < 300ms.
- Web Vitals on market-web home: LCP < 2.5s, CLS < 0.1.
- Error rate (Sentry): < 0.5% of sessions.
- Uptime: 99.5% in v1, 99.9% by end of Phase 2.

### Growth (only relevant from Phase 2 onward)
- WAU.
- Apps published.
- Developer signups.
- Funnels: home → search → app detail → install.

---

## 14. Decision log

Live document of "we decided X over Y because Z." Updated as decisions are made.

| Date | Decision | Reason |
|---|---|---|
| 2026-04-30 | Plan written before any Phase 0 work | User explicit request; quality > speed. |
| 2026-04-30 | **DB: Neon** (over Supabase + IPv4 add-on) | IPv4-native (unblocks immediately), separation of compute/storage scales further than Supabase, instant branching gives free per-PR staging DBs, generous free tier, Drizzle-native. |
| 2026-04-30 | **Storage: Cloudflare R2** (over Supabase Storage) | **Zero egress costs** — critical for an APK marketplace where files are 50–500 MB and traffic scales linearly with installs. S3-compatible (no SDK lock-in). Long-term economics dominate; Supabase Storage egress would cost real money by 10k installs/mo. |
| 2026-04-30 | **API deploy: Vercel serverless (Fluid Compute)** for HTTP, **Fly.io for workers** | Vercel for the user-facing API (already deploying frontends there, fluid compute keeps DB connections warm). Workers (ingest, scan, search-indexer, notify) need long-running processes — Fly.io with autoscale-to-zero is the cleanest fit. |
| 2026-04-30 | **Redis: Upstash** | Serverless-friendly (HTTP API + pooled TCP), edge-replicated, free tier generous. Required because Vercel serverless can't hold a long-lived Redis connection. |
| 2026-04-30 | **Email: Resend** + React Email templates | Best-in-class DX, React-component templates, generous free tier, native domain verification. Postmark is the alternative if deliverability ever becomes a problem. |
| 2026-04-30 | **CDN/DNS: Cloudflare** in front of everything | Free, fastest global edge, integrates with R2 (zero internal egress), DDoS protection, Workers for edge logic later. |
| 2026-04-30 | **Observability: Sentry + Plausible + Better Stack** | Sentry for errors (industry standard, free tier sufficient), Plausible for privacy-respecting analytics (no GA — violates §2 principle 6), Better Stack for uptime + log aggregation. |
| 2026-04-30 | **Brand: OpenMarket** | Confirmed by repo name + product mission. Logo deferred — text-mark for now, design pass after Phase 1 ships. |
| 2026-04-30 | **Tier 4 (monetization) deferred** until "Tier 1 done" §12 + Tier 2 ship | Explicit user agreement to favor coherent free-tier marketplace before adding payment complexity. Revisit after Tier 2 closes. |
| 2026-04-30 | **Domain: open question** | Will register at start of P0-E. Recommendation: `openmarket.app` (specific to Android), fallback `openmarket.dev`. User to confirm or suggest alternative when we get to P0-E. |
| 2026-04-30 | **DMCA agent: pending real-person info** | Cannot scaffold — must be a real person, real address per 17 USC 512(c)(2)(A). User provides at P0-E. |

---

## 15. Open questions for the user

These need user input before we start the relevant item.

1. **P0-A:** Neon, Supabase IPv4, or Supabase MCP? (Recommend Neon.)
2. **P0-B:** Deploy API to Vercel serverless or Fly.io? (Recommend Vercel for v1; revisit after Tier 1 closes.)
3. **P0-D:** Use Resend for email, or do you have a preferred provider?
4. **P0-E:** Do we have a real domain (e.g., openmarket.app) for legal pages, DMCA agent, security.txt? Or do we run on the placeholder Vercel domains until launch?
5. **P0-E:** Who is the registered DMCA agent? (Required to be a real person with real address.)
6. **Brand:** What's the canonical brand name + logo? (Affects footer, OG tags, email templates.)
7. **Tier 4 ETA:** Are we monetizing in v1, or is paid apps strictly post-Tier-3? (Recommend post-Tier-3.)

---

## 16. How we'll work this plan together

1. I'll pause after each item is complete and report what changed (commit hash, DoD verification, screenshots/curl outputs as relevant).
2. You confirm before I move to the next item.
3. If the plan needs to change mid-flight, we edit *this document first*, then act.
4. I won't start Phase 1 until Phase 0 is fully done. I won't start Phase 2 until "Tier 1 done" §12 is checked off.
5. Memory updates (`MEMORY.md`) happen at every phase boundary.

---

*End of plan.*
