# OpenMarket — Major Improvements Spec

**Date:** 2026-04-12
**Source:** Deep codebase audit across all 11 packages
**Scope:** Critical + High severity issues only (20 items). Medium issues deferred.

---

## 1. Security Hardening

### 1.1 Admin Authorization Middleware

**Problem:** All `/admin/*` and `/reports/*` endpoints only use `requireAuth` — any logged-in user can approve releases, suspend developers, and view audit logs.

**Fix:** Create `requireAdmin` middleware that checks the developer's trust_level. For MVP, "admin" = trust_level of "audited". Add an `isAdmin` boolean column to developers table for explicit admin role.

**Changes:**
- Add `isAdmin` boolean column to `developers` table schema
- Create `services/api/src/middleware/admin.ts` with `requireAdmin` middleware
- Apply to all routes in `admin.ts` and sensitive routes in `reports.ts`
- Update seed to create a default admin developer

### 1.2 Meilisearch Filter Injection Fix

**Problem:** Search route interpolates user input directly into Meilisearch filter strings: `filters.push(\`category = "${category}"\`)` — allows filter injection.

**Fix:** Sanitize filter values by escaping quotes, or use Meilisearch's array filter syntax which is injection-safe.

**Changes:**
- Rewrite `services/api/src/routes/search.ts` filter construction
- Use array filter format: `["category = tools", "isPublished = true"]`
- Add validation that category/trustTier values match allowed enums

### 1.3 Web App Auth Protection

**Problem:** dev-portal and admin apps have login pages but no middleware preventing unauthenticated access to protected routes.

**Fix:** Add `middleware.ts` to both apps that checks for session cookie and redirects to `/login` if missing. Since we use Better Auth, check for the session cookie presence.

**Changes:**
- Create `apps/dev-portal/src/middleware.ts`
- Create `apps/admin/src/middleware.ts`
- Both redirect to `/login` for protected routes

### 1.4 Admin App Environment Variables

**Problem:** All 11 admin pages hardcode `http://localhost:3001`.

**Fix:** Create `apps/admin/src/lib/api.ts` matching the pattern in market-web and dev-portal, using `NEXT_PUBLIC_API_URL`.

**Changes:**
- Create `apps/admin/src/lib/api.ts`
- Update all page files to import from centralized API helper

---

## 2. Database Improvements

### 2.1 Drizzle Relations File

**Problem:** No relations definitions prevent using `.with()` relational queries, causing N+1 query patterns throughout the API.

**Fix:** Create `packages/db/src/schema/relations.ts` defining all table relationships.

**Relations to define:**
- developers → apps (one-to-many)
- developers → signingKeys (one-to-many)
- developers → developerIdentities (one-to-many)
- developers → developerVerificationEvidence (one-to-many)
- apps → appListings (one-to-many)
- apps → releases (one-to-many)
- apps → releaseChannels (one-to-many)
- releases → releaseArtifacts (one-to-many)
- releaseArtifacts → artifactMetadata (one-to-one)
- releaseArtifacts → scanResults (one-to-many)
- releaseArtifacts → permissionsDetected (one-to-many)
- releaseArtifacts → sdkFingerprints (one-to-many)
- apps → reviews (one-to-many)
- apps → installEvents (one-to-many)
- users → reviews (one-to-many)
- users → reports (one-to-many)

### 2.2 Missing Indexes

**Problem:** FK columns queried frequently lack indexes, causing full table scans.

**Fix:** Add indexes to:
- `install_events(user_id)`
- `install_events(app_id, user_id)`
- `reviews(user_id)`
- `permissions_detected(artifact_id)`
- `sdk_fingerprints(artifact_id)`
- `scan_results(artifact_id)`
- `moderation_actions(target_type, target_id)`
- `reports(target_type, target_id)`
- `reports(status)`

### 2.3 Text-to-Enum Conversions

**Problem:** `evidence_type`, `protection_level`, and `algorithm` stored as TEXT, allowing invalid values.

**Fix:** Create proper pgEnum definitions and update column types.

### 2.4 Admin Role Column

**Problem:** No way to distinguish admin users from regular developers.

**Fix:** Add `isAdmin` boolean default false to developers table.

---

## 3. Worker Reliability

### 3.1 Ingest Worker — Real Processing

**Problem:** `processIngestJob` is a stub that marks artifacts as "verified" without validation. The rejection rules and APK extractor exist but are never called.

**Fix:** Wire up the rejection rules in the processor. For MVP (no real APK parsing yet), accept metadata as job data and run validation rules against it. The real APK parsing (using apk-parser or aapt2) is a future task, but the validation pipeline should be functional.

**Changes:**
- Update `IngestJobData` to include metadata fields
- Call `checkRejectionRules()` in the processor
- Update release status to "rejected" on failure with reason
- Enqueue scan job on success

### 3.2 Job Retry Configuration

**Problem:** No retry logic — failed jobs are permanently lost.

**Fix:** Configure retry at both enqueue time and worker level.

**Queue enqueue config:**
```
attempts: 3
backoff: { type: "exponential", delay: 2000 }
removeOnComplete: { count: 100 }
removeOnFail: false
```

**Worker config:**
```
lockDuration: 60000
stalledInterval: 30000
```

### 3.3 Graceful Shutdown

**Problem:** Ingest and search workers don't handle SIGTERM/SIGINT.

**Fix:** Add shutdown handlers matching scan-worker's existing pattern.

### 3.4 DB Connection Fix

**Problem:** Scan worker creates a new DB connection per job.

**Fix:** Move `createDb()` to module level (matching ingest-worker's pattern).

### 3.5 Worker Concurrency

**Problem:** Scan and search workers default to concurrency 1.

**Fix:** Set concurrency to 3 for scan, 5 for search (configurable via env).

---

## 4. API Completeness

### 4.1 Missing Contract Files

**Problem:** No Zod schemas for reviews, reports, or moderation actions.

**Create:**
- `packages/contracts/src/reviews.ts` — createReviewSchema (rating 1-5, title, body, versionCodeReviewed), updateReviewSchema
- `packages/contracts/src/reports.ts` — createReportSchema (targetType, targetId, reportType, description), updateReportStatusSchema
- `packages/contracts/src/moderation.ts` — moderationActionSchema, approveReleaseSchema, rejectReleaseSchema (with reason), suspendDeveloperSchema (with reason)

### 4.2 Missing API Tests

**Problem:** 4 route files have no tests: admin, auth, reports, search.

**Fix:** Create test files for all 4. Focus on:
- admin: risk-queue returns array, approve changes status, reject changes status, suspend changes trust_level
- reports: create report, list reports, update status
- search: returns results shape, handles empty query

### 4.3 Pagination on List Endpoints

**Problem:** GET /apps, GET /signing-keys, GET /apps/:id/reviews return all records with no limit.

**Fix:** Add pagination using the existing `paginationSchema` from contracts/common.ts. Apply to all list endpoints. Return `{ items, total, page, limit, totalPages }`.

### 4.4 Missing CRUD Endpoints

Add:
- `PATCH /api/apps/:id` — update app listing
- `DELETE /api/apps/:id` — soft-delete (set isDelisted = true)
- `PATCH /api/releases/:id` — update release notes, rollout percentage
- `DELETE /api/releases/:id` — cancel draft release

---

## 5. Web App Quality

### 5.1 Error Boundaries

**Fix:** Add `error.tsx` and `loading.tsx` to root `app/` directory in all three apps. Error boundary shows friendly message with retry button. Loading shows skeleton.

### 5.2 Basic Accessibility

**Fix:**
- Add `aria-label` to all icon-only buttons
- Add `role="navigation"` to nav elements
- Add `scope` to table headers
- Ensure all form inputs have labels
- Add skip-to-content link in layouts

### 5.3 SEO Metadata

**Fix:** Add `generateMetadata` functions to dynamic pages:
- market-web: `/apps/[id]` (app title + description), `/search` (query in title), `/developers/[id]`
- dev-portal: `/dashboard`, `/apps`
- admin: less important (internal tool)

---

## 6. Developer Experience

### 6.1 ESLint + Prettier

**Fix:** Add minimal ESLint config with TypeScript plugin. Add Prettier for formatting. Add `lint` and `format` scripts to root package.json.

### 6.2 CI Workflow Improvements

**Fix:** Update `.github/workflows/ci.yml`:
- Add pnpm cache
- Add `pnpm build` step (catches tsc errors)
- Add `pnpm lint` step (when ESLint added)

### 6.3 Stricter TypeScript

**Fix:** Add to `tsconfig.base.json`:
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`

Note: Only add settings that don't break existing code. Test incrementally.

---

## Out of Scope (Deferred to Next Audit)

- Rate limiting (needs Redis middleware design)
- Client-side form validation with Zod (needs shared validation layer)
- Server component conversion in dev-portal (needs auth strategy change)
- Duplicate component extraction to @openmarket/ui (needs design review)
- Risk scoring edge cases (needs policy discussion)
- Mobile responsive admin nav
- Pre-commit hooks (add after ESLint is configured)
- Dead-letter queues (add after retry logic is proven)

---

*End of spec. 20 critical+high issues addressed across 6 categories.*
