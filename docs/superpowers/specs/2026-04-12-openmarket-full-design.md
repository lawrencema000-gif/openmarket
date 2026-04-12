# OpenMarket — Full Design Specification

**Date:** 2026-04-12
**Author:** Claude (Opus 4.6) + lawrencema000-gif
**Status:** Draft — awaiting user review

---

## 1. Mission & Identity

OpenMarket is a viewpoint-neutral Android app marketplace. It separates hosting from amplification: everything lawful can be published, but not everything gets equal ranking, featuring, or discoverability.

### Two Lanes

- **Verified Store** — full marketplace UX, searchable, rankable, installable through the store app, eligible for updates, charts, featured spots, and future monetization. Requires developer identity verification.
- **Experimental Lab** — clearly labeled, reduced discoverability, power-user install path, fewer ranking boosts. Open to unverified developers and hobbyist experiments.

### Content Policy (Behavior-Based)

**Allowed:** political apps, conflict-of-interest apps, weird experiments, low-polish vibe-coded apps, controversial but lawful content, ad-supported apps, crypto/finance (with extra review).

**Banned:** malware, scams, credential theft, impersonation, illegal content, abusive surveillance, ransomware, non-consensual abuse tools, spyware.

### Trust Levels

| Level | Description |
|-------|-------------|
| Verified | Identity confirmed, signing key enrolled, package names registered |
| Audited | Verified + passed enhanced security review |
| Experimental | Unverified developer, clearly labeled, reduced discoverability |
| Suspended | Policy violation, pending appeal |

### Enforcement Ladder

1. Warning with specific violation cited
2. Delist specific release (app stays, bad version removed)
3. Freeze updates (app stays published, no new versions)
4. Suspend developer account
5. Appeal process (human review, 5 business day SLA)

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Monorepo | pnpm + Turborepo | Fast on Windows, workspace support, build caching |
| Runtime | Node.js 24 LTS | Current default, long-term support |
| Web framework | Next.js 16 App Router | SSR for SEO, RSC for performance, Vercel deployment |
| API framework | Hono | Lightweight, typed, OpenAPI generation, runs anywhere |
| ORM | Drizzle | Type-safe, SQL-first, excellent migrations, zero runtime overhead |
| Database | PostgreSQL via Neon (Vercel Marketplace) | Serverless-friendly, scales to zero, branching |
| Search | Meilisearch (self-hosted) | Fast, typo-tolerant, faceted, easy local dev |
| File storage | Vercel Blob (private) | Presigned uploads, CDN delivery for APK artifacts |
| Auth | Better Auth | Self-hosted, full control, OAuth + email |
| Validation | Zod | Shared schemas across frontend/backend/contracts |
| UI | shadcn/ui + Tailwind CSS | Composable, no vendor lock, rapid iteration |
| Queue | BullMQ + Redis | Job queues for async workers |
| Android | Kotlin + Jetpack Compose + Ktor + Hilt + Room | Modern Android stack |

---

## 3. Monorepo Structure

```
openmarket/
├── apps/
│   ├── market-web/          # Public marketplace — Next.js 16 App Router
│   ├── dev-portal/          # Developer console — Next.js 16 App Router
│   ├── admin/               # Moderation/ops console — Next.js 16 App Router
│   └── android-store/       # Kotlin + Jetpack Compose installer app
│
├── services/
│   ├── api/                 # Core API — Hono on Node.js
│   ├── ingest-worker/       # APK processing, metadata extraction
│   ├── scan-worker/         # Static/dynamic analysis orchestration
│   ├── search-worker/       # Meilisearch indexing
│   └── notify-worker/       # Email, push, webhooks
│
├── packages/
│   ├── db/                  # Drizzle ORM schema + migrations
│   ├── contracts/           # Zod schemas + OpenAPI types
│   ├── ui/                  # Shared React UI components
│   ├── security-rules/      # Policy rules, risk scoring logic
│   └── sdk/                 # Typed client SDKs
│
├── infrastructure/
│   ├── docker/              # Docker Compose for local dev
│   ├── terraform/           # Cloud provisioning (future)
│   └── github/              # CI/CD workflow files
│
├── docs/
│   ├── mission.md
│   ├── publishability.md
│   ├── discoverability.md
│   └── enforcement.md
│
├── .claude/
│   ├── skills/
│   │   ├── scaffold-service/SKILL.md
│   │   ├── android-installer/SKILL.md
│   │   └── security-review/SKILL.md
│   ├── agents/
│   │   ├── android-release-auditor.md
│   │   └── trust-and-safety-reviewer.md
│   └── hooks/
│       └── post-edit-test.sh
│
├── CLAUDE.md
├── .mcp.json
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. Database Schema

### 4.1 Developer Identity

**developers**
- `id` UUID PK
- `email` TEXT UNIQUE NOT NULL
- `display_name` TEXT NOT NULL
- `legal_entity_name` TEXT
- `country` TEXT
- `support_email` TEXT
- `support_url` TEXT
- `privacy_policy_url` TEXT
- `trust_level` ENUM('experimental', 'verified', 'audited', 'suspended') DEFAULT 'experimental'
- `suspension_reason` TEXT
- `auth_provider` TEXT — 'email', 'github', 'google'
- `auth_provider_id` TEXT
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**developer_identities**
- `id` UUID PK
- `developer_id` UUID FK → developers
- `identity_type` ENUM('email', 'domain', 'government_id', 'play_console', 'android_dev_console')
- `identity_value` TEXT NOT NULL
- `verification_status` ENUM('pending', 'verified', 'rejected') DEFAULT 'pending'
- `verified_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**developer_verification_evidence**
- `id` UUID PK
- `developer_id` UUID FK → developers
- `evidence_type` TEXT NOT NULL — 'id_document', 'domain_verification', 'play_console_screenshot', 'signed_apk_challenge'
- `file_url` TEXT NOT NULL
- `notes` TEXT
- `reviewed_by` UUID FK → developers (admin)
- `review_status` ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending'
- `review_notes` TEXT
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**signing_keys**
- `id` UUID PK
- `developer_id` UUID FK → developers
- `fingerprint_sha256` TEXT NOT NULL
- `algorithm` TEXT NOT NULL — 'RSA', 'EC', 'DSA'
- `certificate_pem` TEXT
- `key_size` INTEGER
- `is_active` BOOLEAN DEFAULT true
- `revoked_at` TIMESTAMPTZ
- `revocation_reason` TEXT
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- UNIQUE(`developer_id`, `fingerprint_sha256`)

### 4.2 Apps & Releases

**apps**
- `id` UUID PK
- `package_name` TEXT UNIQUE NOT NULL
- `developer_id` UUID FK → developers
- `current_listing_id` UUID FK → app_listings (nullable)
- `trust_tier` ENUM('standard', 'enhanced', 'experimental') DEFAULT 'standard'
- `is_published` BOOLEAN DEFAULT false
- `is_delisted` BOOLEAN DEFAULT false
- `delist_reason` TEXT
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**app_listings**
- `id` UUID PK
- `app_id` UUID FK → apps
- `title` TEXT NOT NULL
- `short_description` TEXT NOT NULL — max 80 chars
- `full_description` TEXT NOT NULL — max 4000 chars
- `category` TEXT NOT NULL
- `subcategory` TEXT
- `screenshots` TEXT[] — URLs, 2-8 required
- `icon_url` TEXT NOT NULL
- `feature_graphic_url` TEXT
- `privacy_policy_url` TEXT
- `website_url` TEXT
- `source_code_url` TEXT — optional, earns "Open Source" badge
- `is_experimental` BOOLEAN DEFAULT false
- `contains_ads` BOOLEAN DEFAULT false
- `contains_iap` BOOLEAN DEFAULT false
- `content_rating` TEXT — 'everyone', 'teen', 'mature'
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**releases**
- `id` UUID PK
- `app_id` UUID FK → apps
- `version_code` INTEGER NOT NULL
- `version_name` TEXT NOT NULL
- `channel` ENUM('stable', 'beta', 'canary') DEFAULT 'stable'
- `status` ENUM('draft', 'scanning', 'review', 'staged_rollout', 'published', 'paused', 'rolled_back', 'delisted') DEFAULT 'draft'
- `rollout_percentage` INTEGER DEFAULT 100 — 1, 5, 25, 100
- `release_notes` TEXT
- `reviewed_by` UUID FK → developers (admin, nullable)
- `reviewed_at` TIMESTAMPTZ
- `published_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- UNIQUE(`app_id`, `version_code`)

**release_artifacts**
- `id` UUID PK
- `release_id` UUID FK → releases
- `artifact_type` ENUM('apk', 'aab') DEFAULT 'apk'
- `file_url` TEXT NOT NULL
- `file_size` BIGINT NOT NULL — bytes
- `sha256` TEXT NOT NULL
- `upload_status` ENUM('pending', 'uploaded', 'verified', 'rejected') DEFAULT 'pending'
- `uploaded_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**artifact_metadata**
- `id` UUID PK
- `artifact_id` UUID FK → release_artifacts
- `min_sdk` INTEGER NOT NULL
- `target_sdk` INTEGER NOT NULL
- `abis` TEXT[] — 'arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'
- `native_libs` TEXT[]
- `icon_hash` TEXT
- `app_label` TEXT NOT NULL
- `is_debug_build` BOOLEAN DEFAULT false
- `signing_key_fingerprint` TEXT NOT NULL
- `signing_scheme_versions` INTEGER[] — [1, 2, 3, 4]
- `components` JSONB — {activities: [], services: [], receivers: [], providers: []}
- `exported_components` JSONB — subset of components with exported=true
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### 4.3 Security

**scan_results**
- `id` UUID PK
- `artifact_id` UUID FK → release_artifacts
- `scan_type` ENUM('static', 'dynamic', 'diff', 'identity') DEFAULT 'static'
- `status` ENUM('pending', 'running', 'passed', 'failed', 'flagged') DEFAULT 'pending'
- `risk_score` INTEGER — 0 to 100
- `findings` JSONB — structured findings array
- `summary` TEXT
- `started_at` TIMESTAMPTZ
- `completed_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**permissions_detected**
- `id` UUID PK
- `artifact_id` UUID FK → release_artifacts
- `permission_name` TEXT NOT NULL
- `is_dangerous` BOOLEAN DEFAULT false
- `is_new_since_previous` BOOLEAN DEFAULT false
- `protection_level` TEXT — 'normal', 'dangerous', 'signature', 'privileged'

**sdk_fingerprints**
- `id` UUID PK
- `artifact_id` UUID FK → release_artifacts
- `sdk_name` TEXT NOT NULL
- `sdk_version` TEXT
- `category` ENUM('ads', 'analytics', 'social', 'payment', 'security', 'other') DEFAULT 'other'
- `risk_flag` BOOLEAN DEFAULT false
- `risk_reason` TEXT

### 4.4 User-Facing

**users** (marketplace end-users, separate from developers)
- `id` UUID PK
- `email` TEXT UNIQUE NOT NULL
- `display_name` TEXT
- `auth_provider` TEXT
- `auth_provider_id` TEXT
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**install_events**
- `id` UUID PK
- `app_id` UUID FK → apps
- `user_id` UUID FK → users (nullable — anonymous installs allowed)
- `device_fingerprint_hash` TEXT
- `installed_version_code` INTEGER NOT NULL
- `source` ENUM('store_app', 'web', 'direct') DEFAULT 'store_app'
- `os_version` TEXT
- `device_model` TEXT
- `success` BOOLEAN DEFAULT true
- `failure_reason` TEXT
- `installed_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**reviews**
- `id` UUID PK
- `app_id` UUID FK → apps
- `user_id` UUID FK → users
- `rating` INTEGER NOT NULL CHECK (1-5)
- `title` TEXT
- `body` TEXT
- `version_code_reviewed` INTEGER NOT NULL
- `helpful_count` INTEGER DEFAULT 0
- `is_flagged` BOOLEAN DEFAULT false
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- UNIQUE(`app_id`, `user_id`) — one review per user per app

**reports**
- `id` UUID PK
- `target_type` ENUM('app', 'release', 'developer', 'review')
- `target_id` UUID NOT NULL
- `reporter_id` UUID FK → users
- `report_type` ENUM('malware', 'scam', 'impersonation', 'illegal', 'spam', 'broken', 'other')
- `description` TEXT NOT NULL
- `status` ENUM('open', 'investigating', 'resolved', 'dismissed') DEFAULT 'open'
- `resolution_notes` TEXT
- `resolved_by` UUID FK → developers (admin, nullable)
- `resolved_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### 4.5 Moderation

**moderation_actions**
- `id` UUID PK
- `target_type` ENUM('app', 'release', 'developer')
- `target_id` UUID NOT NULL
- `action` ENUM('warn', 'delist_release', 'freeze_updates', 'suspend_developer', 'reinstate')
- `reason` TEXT NOT NULL
- `moderator_id` UUID FK → developers (admin)
- `appeal_status` ENUM('none', 'pending', 'upheld', 'overturned') DEFAULT 'none'
- `appeal_notes` TEXT
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**release_channels**
- `id` UUID PK
- `app_id` UUID FK → apps
- `channel_name` TEXT NOT NULL — 'stable', 'beta', 'canary'
- `is_default` BOOLEAN DEFAULT false
- UNIQUE(`app_id`, `channel_name`)

### 4.6 Categories

**categories**
- `id` UUID PK
- `slug` TEXT UNIQUE NOT NULL
- `name` TEXT NOT NULL
- `icon` TEXT
- `sort_order` INTEGER DEFAULT 0

Seed categories: art-design, books-reference, business, communication, education, entertainment, finance, food-drink, games-action, games-adventure, games-arcade, games-board, games-card, games-casino, games-casual, games-educational, games-music, games-puzzle, games-racing, games-role-playing, games-simulation, games-sports, games-strategy, games-trivia, games-word, health-fitness, lifestyle, maps-navigation, medical, music-audio, news-magazines, parenting, personalization, photography, productivity, shopping, social, sports, tools, travel-local, video-players, weather.

---

## 5. Authentication & Developer Onboarding

### 5.1 Auth System

Better Auth with three providers:
- Email/password (with email verification)
- GitHub OAuth
- Google OAuth

Two account types sharing auth but with separate role flags:
- **Developer** — can publish apps
- **User** — can install, review, report (lighter signup)

Developers can also act as users. Users can upgrade to developer by completing the developer profile.

### 5.2 Developer Onboarding Flow

1. Sign up via email or OAuth
2. Complete developer profile form:
   - Display name (public)
   - Legal entity name (optional for experimental, required for verified)
   - Country/jurisdiction
   - Support email
   - Support URL
   - Privacy policy URL
3. Choose lane:
   - **Experimental** — publish immediately, "Experimental" badge on all apps, reduced search ranking
   - **Verified** — submit identity evidence, wait for manual review (5 business day SLA), full marketplace access on approval
4. For Verified path:
   - Upload identity evidence (government ID, business registration, or domain ownership proof)
   - Optional: link Play Console or Android Developer Console account
   - Manual review by admin
   - Approval → trust_level set to 'verified'
   - Rejection → feedback provided, can resubmit
5. Register signing keys:
   - Upload signing certificate (extract SHA-256 fingerprint)
   - Multiple keys allowed (for different apps)
   - Key rotation requires re-verification
6. Register package names:
   - Enter intended package name
   - System checks for conflicts with existing registered packages
   - For disputed names: ownership challenge flow (upload signed APK with that package name)
7. Dashboard unlocks: create apps, upload releases, manage listings

### 5.3 Developer Portal Pages

- **Dashboard** — apps overview, recent activity, alerts, verification status
- **Apps** — create new app, edit listing, manage screenshots/description
- **Releases** — upload APK, select channel, write release notes, manage rollout percentage
- **Signing Keys** — view enrolled keys, add new, revoke old
- **Analytics** — installs, updates, reviews, ratings over time (future)
- **Profile** — edit developer info, verification status, re-submit evidence
- **API Keys** — generate API tokens for CI/CD upload automation (future)

---

## 6. Artifact Upload & Ingestion

### 6.1 Upload Flow

```
Developer                  API                    Blob Storage          Ingest Worker
    │                       │                         │                      │
    ├─ POST /releases ─────►│                         │                      │
    │  (create draft)       │                         │                      │
    │◄── release_id ────────┤                         │                      │
    │                       │                         │                      │
    ├─ POST /releases/      │                         │                      │
    │  {id}/upload-url ────►│                         │                      │
    │◄── presigned URL ─────┤                         │                      │
    │                       │                         │                      │
    ├─ PUT (upload APK) ───────────────────────────►│                      │
    │◄── 200 OK ───────────────────────────────────┤                      │
    │                       │                         │                      │
    ├─ POST /releases/      │                         │                      │
    │  {id}/complete ──────►│                         │                      │
    │                       ├─ enqueue job ──────────────────────────────►│
    │                       │                         │                      │
    │◄── status: scanning ──┤                         │    ┌─ verify sig ─┤
    │                       │                         │    ├─ extract meta │
    │                       │                         │    ├─ check dups   │
    │                       │                         │    └─ reject/pass  │
    │                       │◄── update status ──────────────────────────┤
    │                       │                         │                      │
```

### 6.2 Ingest Worker Processing Steps

1. Download APK from Blob storage to temp directory
2. Compute SHA-256, compare against upload record
3. Verify APK signature (v1 JAR, v2/v3/v4 APK Signature Scheme)
4. Extract AndroidManifest.xml via aapt2 or custom parser
5. Extract from manifest:
   - package name
   - versionCode
   - versionName
   - minSdkVersion
   - targetSdkVersion
   - all `<uses-permission>` declarations
   - all components (activity, service, receiver, provider) with exported flags
   - application label and icon reference
6. Extract ABIs from lib/ directory
7. Extract native library names from lib/*/*.so
8. Extract signing certificate fingerprint from APK signing block
9. Check for debug build flag (android:debuggable)
10. Persist all metadata to artifact_metadata table
11. Persist permissions to permissions_detected table
12. Compare signing key to previous releases of same package name
13. Compare versionCode to previous releases
14. Run rejection rules (see 6.3)
15. If passed: update release status to 'scanning', enqueue scan-worker job
16. If rejected: update release status with rejection reason, notify developer

### 6.3 Immediate Rejection Rules

| Rule | Rejection Reason |
|------|-----------------|
| Invalid APK signature | "APK signature verification failed" |
| Package name mismatch | "Package name in APK does not match claimed app" |
| Signing key changed | "Signing key differs from previous releases without authorized key rotation" |
| versionCode not increasing | "versionCode must be strictly greater than previous release" |
| Package name conflict | "Package name is registered to another developer" |
| Debug build | "Debug builds cannot be published" |
| Critical malware hash | "APK matches known malware signature" |
| File too large | "APK exceeds 500MB size limit" |
| Missing manifest | "AndroidManifest.xml not found or invalid" |

---

## 7. Security Pipeline

### 7.1 Layer A — Identity & Key Binding

Runs during ingest, before any code analysis:
- Developer has valid account in good standing
- Package name is registered to this developer
- Signing key matches enrolled key for this developer
- Signing key is consistent with previous releases
- Rate limit: max 10 release uploads per developer per 24 hours
- Fraud signals: account age < 24h with high-risk permissions, multiple accounts from same IP

### 7.2 Layer B — Static Inspection

Runs by scan-worker after ingest passes:
- **Permission analysis**: flag dangerous permissions, highlight new permissions since last release, detect suspicious combinations (CAMERA+INTERNET, SMS+INTERNET, ACCESSIBILITY+OVERLAY)
- **Exported component audit**: find activities/services/receivers/providers with exported=true and no permission guard
- **SDK inventory**: identify known ad networks, analytics SDKs, suspicious SDKs from signature database
- **URL/domain extraction**: extract hardcoded URLs from DEX and resources, check against domain reputation lists
- **Native library analysis**: identify native libs, check against known-malicious library signatures
- **Accessibility/overlay/device-admin detection**: flag apps requesting these sensitive capabilities
- **Known-bad hash lookup**: compare APK hash and certificate fingerprint against malware databases

### 7.3 Layer C — Dynamic Sandbox (Post-MVP)

Not in initial build. Planned for Phase 2:
- Android emulator farm (Firebase Test Lab or self-hosted)
- Automated install and launch
- Network traffic monitoring via proxy
- Permission prompt monitoring
- Background behavior profiling
- Screenshot capture for review

### 7.4 Layer D — Update Diffing

Runs on every non-first release for a package:
- New permissions compared to last published version
- New SDKs detected
- New domains/URLs found
- New native code introduced
- Signing key changes
- Privacy policy URL changed or removed
- Significant code size increase (>50% growth)

Each new finding adds to risk score. Developers can pre-declare changes in release notes to reduce friction.

### 7.5 Layer E — Human Escalation

Automatic escalation to admin review queue when:
- Risk score > 70
- High-risk permission combinations detected
- App category is finance/crypto/wallet/banking
- Remote-control behaviors (accessibility + overlay + internet)
- Unverified developer + sensitive permissions
- 3+ reports on same developer in 30 days
- Mass reuploads (same developer, many packages, short timeframe)
- SDK associated with past policy violations

### 7.6 Risk Scoring

Composite score 0-100:

| Score Range | Action |
|-------------|--------|
| 0-30 | Auto-pass. Publish immediately (verified developers) or after brief hold (experimental) |
| 31-70 | Enhanced automated review. Additional scan passes. 24-hour hold before publishing |
| 71-100 | Human review required. Added to admin risk queue. Cannot publish until cleared |

Score inputs (weighted):
- Dangerous permissions count (0-15 points)
- New permissions since last release (0-10 points)
- Suspicious SDK presence (0-15 points)
- Exported components without guards (0-10 points)
- Suspicious URLs/domains (0-10 points)
- Native code presence (0-5 points)
- Accessibility/overlay/device-admin (0-15 points each)
- Developer trust level modifier (-20 for audited, -10 for verified, +10 for experimental)
- Account age modifier (+10 for < 7 days)
- Update diff severity (0-20 points)

---

## 8. Public Marketplace (market-web)

### 8.1 Pages

**Landing page:**
- Hero with search bar
- Featured apps (editorially curated)
- Trending this week (by install velocity)
- New arrivals (last 14 days, verified developers only in main feed)
- Categories grid
- "Experimental Lab" section link

**Category page:**
- Filterable app grid
- Sort by: relevance, rating, newest, most installed
- Filter by: trust tier, free/paid (future), rating threshold
- Trust badges visible on each card

**Search results:**
- Full-text search via Meilisearch
- Faceted filtering: category, trust tier, permissions, rating, update recency
- Typo tolerance
- Results weighted by ranking algorithm (see 8.2)

**App detail page:**
- App icon, title, developer name (linked to developer page)
- Trust badges row
- Screenshots carousel (2-8 images)
- Short description
- Install button (deep-link to Android store app, or direct APK download fallback)
- Tabs: About (full description), Release Notes, Reviews, Permissions
- Permissions section: grouped by protection level, dangerous permissions highlighted
- Developer info card
- Report button
- "Also by this developer" section

**Developer page:**
- Developer display name, verification badge
- All published apps
- Member since date
- Support links

**Report abuse page:**
- Target selector (which app/review/developer)
- Report type dropdown
- Description field
- Submit → creates report in queue

### 8.2 Ranking Algorithm

Inputs (weighted, not a simple formula — tuned over time):

| Signal | Weight | Direction |
|--------|--------|-----------|
| Search query relevance | High | Positive |
| Trust tier (audited > verified > experimental) | High | Positive |
| Crash-free device rate | Medium | Positive |
| Recent install success rate (30d) | Medium | Positive |
| Abuse report rate (per 1k installs) | High | Negative |
| Update freshness (days since last release) | Low | Positive (fresher = better) |
| Review quality (avg rating, review count) | Medium | Positive |
| 30-day retention estimate | Medium | Positive |
| Category match | Medium | Positive |

Experimental apps receive a -30% ranking penalty in main search. They appear normally in the Experimental Lab section.

### 8.3 Trust Badges

| Badge | Condition |
|-------|-----------|
| Verified Developer | developer.trust_level = 'verified' or 'audited' |
| Experimental | app_listing.is_experimental = true |
| New | app.created_at within last 30 days |
| Recently Updated | latest release.published_at within last 14 days |
| Security Reviewed | latest scan risk_score < 20 and scan_type includes 'static' |
| High-Risk Permissions | app has CAMERA+INTERNET, SMS, CALL_PHONE, SYSTEM_ALERT_WINDOW, ACCESSIBILITY, or DEVICE_ADMIN |
| Ads/Trackers Declared | app_listing.contains_ads = true |
| Open Source | app_listing.source_code_url is not null |

---

## 9. Android Store App

### 9.1 Tech Stack

- **Language:** Kotlin
- **UI:** Jetpack Compose + Material 3
- **HTTP:** Ktor client
- **DI:** Hilt
- **Local storage:** Room (installed apps cache), DataStore (preferences)
- **Image loading:** Coil
- **Target SDK:** 35
- **Min SDK:** 26 (Android 8.0 — where per-source install permissions exist)

### 9.2 Screens

- **Splash / Onboarding** — first-run explanation of what OpenMarket is, permission explanation
- **Login / Register** — email or OAuth, same auth system as web
- **Home** — featured apps, categories, trending
- **Search** — real-time search with filters
- **Category** — app grid for selected category
- **App Detail** — screenshots, description, reviews, permissions, install/update button
- **My Apps** — installed apps managed by OpenMarket, update available indicators, batch update button
- **Downloads** — active downloads queue with progress
- **Settings** — account, notifications, storage management, auto-update toggle

### 9.3 Install Flow (Critical Path)

```
User taps "Install"
    │
    ├─ Check canRequestPackageInstalls()
    │   ├─ false → Launch ACTION_MANAGE_UNKNOWN_APP_SOURCES for our package
    │   │          User enables → returns to app → retry
    │   └─ true → Continue
    │
    ├─ Start foreground service for download
    │
    ├─ Download APK to app-private storage (Context.getExternalFilesDir)
    │   ├─ Show progress notification
    │   ├─ Support resume on network interruption
    │   └─ Verify SHA-256 against server-provided hash
    │
    ├─ Create PackageInstaller.Session
    │   ├─ session.openWrite("base.apk") → write APK bytes → close stream
    │   └─ For split APKs: openWrite for each split
    │
    ├─ session.commit(statusReceiver)
    │   ├─ STATUS_PENDING_USER_ACTION → launch confirmation intent
    │   ├─ STATUS_SUCCESS → record install event to API
    │   └─ STATUS_FAILURE → show error with specific reason
    │
    └─ Post-install:
        ├─ Record as installer of record
        ├─ Request update ownership (Android 14+)
        ├─ Cache installed app metadata in Room
        └─ Clean up downloaded APK
```

### 9.4 Update Flow

- **Background check:** WorkManager periodic task (every 6 hours) queries API for updates on all installed apps
- **Update available:** Badge on "My Apps" tab, notification if enabled
- **One-tap update:** Same PackageInstaller flow
- **Silent update conditions (Android 14+):**
  - App is update owner
  - Same signing key
  - No new dangerous permissions
  - User has not disabled auto-updates for this app
- **Batch update:** "Update All" button processes queue sequentially
- **Rollback awareness:** If a release is rolled back server-side, show "Update available" with the rolled-back-to version

### 9.5 Platform-Specific Handling

- **Developer verification enforcement (Sept 30, 2026):** Handle `INSTALL_FAILED_VERIFICATION_FAILURE` gracefully. Show explanation: "This app's developer needs to complete verification for your region. Contact the developer or try the advanced install flow."
- **Battery optimization:** Exempt download service from Doze if user approves
- **Storage management:** Show total storage used by cached APKs, allow clearing
- **Deep links:** Handle `openmarket://app/{packageName}` for web-to-app handoff

---

## 10. Release Channels & Updates

### 10.1 Channel Definitions

| Channel | Audience | Discoverability | Auto-update |
|---------|----------|-----------------|-------------|
| Stable | All users | Full marketplace visibility | Yes (default) |
| Beta | Opted-in users | Visible on app detail page, "Join Beta" button | Yes for opted-in |
| Canary | Developer-shared link only | Not searchable, direct link access | No |

### 10.2 Release State Machine

```
draft
  └─► scanning (ingest worker processing)
        ├─► review (risk score > 30 OR experimental developer)
        │     ├─► staged_rollout (approved)
        │     └─► rejected (back to draft with feedback)
        └─► staged_rollout (risk score ≤ 30 AND verified developer)
              ├─► published (rollout reaches 100%)
              └─► paused (developer or admin action)
                    ├─► staged_rollout (resumed)
                    └─► rolled_back (reverted)

published
  └─► delisted (admin action or developer request)
```

### 10.3 Staged Rollout

- Developer controls advancement: 1% → 5% → 25% → 100%
- Rollout target stored on release record
- Store app and API use deterministic hash of (user_id + release_id) % 100 to decide eligibility
- Developer can pause at any percentage
- Crash reports and user feedback monitored during rollout
- Admin can force-halt a rollout if issues are detected

### 10.4 Invariants

- Signing key MUST match all previous releases for the same package name
- versionCode MUST be strictly monotonically increasing within a channel
- Cross-channel: stable versionCode should be ≤ beta ≤ canary
- A rolled-back release is removed from new installs but NOT uninstalled from existing devices
- Delisted apps return 410 Gone for new install attempts

---

## 11. Admin / Moderation Console

### 11.1 Dashboard

- **Risk queue:** Releases with risk_score > 30, sorted highest first, showing key findings
- **Report queue:** Open reports grouped by target, sorted by report count
- **Verification queue:** Pending developer verification requests, ordered by submission date
- **System health:** Scan queue depth, average turnaround time, error rate, worker status

### 11.2 Tools

**Release inspector:**
- Full metadata view (all artifact_metadata fields)
- Scan results with findings detail
- Permission diff vs. previous release
- Risk score breakdown (which factors contributed)
- SDK inventory
- Exported component list
- Side-by-side comparison with previous release

**Developer profile view:**
- Developer info, verification evidence, trust tier history
- All published apps with current status
- Reports filed against this developer
- Moderation action history

**Actions:**
- **Approve release** — moves from review → staged_rollout/published
- **Reject release** — moves back to draft with feedback message
- **Delist release** — removes specific version, reason required, logged
- **Freeze updates** — blocks new uploads for app, reason required
- **Suspend developer** — freezes all apps, blocks all activity, reason required
- **Emergency delist** — one-click remove app from all surfaces immediately
- **Reinstate** — reverse suspension/delist with notes

**Appeal management:**
- View appeal submission from developer
- Attach investigation notes
- Uphold or overturn with explanation
- Notify developer of decision

**Audit log:**
- Every moderation action logged with: timestamp, moderator_id, action, target, reason
- Searchable and filterable
- Immutable (append-only)

---

## 12. Payments (Deferred)

**MVP:** Free apps only.

App listings can include:
- `external_purchase_url` — link to developer's own purchase page
- `license_instructions` — free-text explaining how to get a license

**Phase 2 (not in first build):**
- Stripe Connect for developer payouts
- In-app purchase entitlement service
- Refund management
- Tax/VAT via Stripe Tax
- 15% platform commission
- KYC requirements for paid developers
- Payout dashboard in dev-portal

---

## 13. CI/CD & DevOps

### 13.1 GitHub Actions

**ci.yml** — runs on every PR:
- pnpm install
- Turborepo lint (ESLint + Biome)
- Turborepo typecheck (tsc --noEmit)
- Turborepo test (Vitest)
- Drizzle schema validation
- Contract schema validation (Zod parse tests)

**deploy-preview.yml** — runs on PR open/update:
- Vercel preview deployment for market-web, dev-portal, admin
- Comment PR with preview URLs

**deploy-prod.yml** — runs on merge to main:
- Vercel production deployment
- Run database migrations
- Invalidate Meilisearch indexes if schema changed

**android-build.yml** — runs on android-store/ changes:
- Gradle build
- APK signing (debug for PRs, release for main)
- Upload APK artifact to GitHub release

**db-migrate.yml** — manual trigger or on packages/db/ changes:
- Run Drizzle migrations against target environment
- Dry-run on PR, apply on merge

### 13.2 Branch Protection

- `main` branch:
  - Require 1 PR review (can be @claude)
  - Require CI pass
  - No force pushes
  - No direct commits

### 13.3 Claude Code GitHub Actions

- @claude can be assigned to issues and will implement small features
- @claude reviews PRs with context from CLAUDE.md and .claude/ skills
- Post-merge: Claude can be triggered to update docs or run follow-up tasks

---

## 14. Claude Code Project Assets

### 14.1 CLAUDE.md

Project-level instructions for Claude Code sessions working on OpenMarket:
- Monorepo navigation guide
- Database schema location and migration workflow
- API contract workflow (edit contracts → generate → implement)
- Testing requirements (Vitest for unit, Playwright for e2e)
- Android build instructions
- Deployment workflow

### 14.2 Skills

**scaffold-service/SKILL.md** — guide for adding a new service to the monorepo (worker or API module). Covers: directory structure, package.json, tsconfig, Docker integration, BullMQ queue setup, health check endpoint.

**android-installer/SKILL.md** — guide for working on the Android PackageInstaller integration. Covers: session lifecycle, error handling, permission flows, update ownership, split APK support.

**security-review/SKILL.md** — guide for reviewing scan results and risk scores. Covers: what each risk factor means, how to interpret findings, when to escalate.

### 14.3 Agents

**android-release-auditor.md** — autonomous agent that reviews new Android releases. Checks: metadata completeness, permission reasonableness for category, signing key continuity, previous scan history.

**trust-and-safety-reviewer.md** — autonomous agent for reviewing flagged content. Checks: report validity, cross-references with scan data, recommends enforcement action.

### 14.4 Hooks

**post-edit-test.sh** — after file edits, runs targeted tests for the changed package. Uses Turborepo's `--filter` to only test affected packages.

### 14.5 .mcp.json

Connect Claude Code to:
- GitHub (already connected via gh CLI)
- PostgreSQL read replica (for querying live data during development)
- Sentry (error tracking, once deployed)

---

## 15. Local Development Setup

### 15.1 Docker Compose Services

```yaml
services:
  postgres:
    image: postgres:17
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: openmarket
      POSTGRES_USER: openmarket
      POSTGRES_PASSWORD: openmarket_dev

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  meilisearch:
    image: getmeili/meilisearch:v1.12
    ports: ["7700:7700"]
    environment:
      MEILI_MASTER_KEY: openmarket_dev_key
```

### 15.2 Dev Commands

- `pnpm install` — install all dependencies
- `pnpm dev` — start all web apps + API + workers (Turborepo)
- `pnpm db:migrate` — run Drizzle migrations
- `pnpm db:seed` — seed development data
- `pnpm db:studio` — open Drizzle Studio
- `pnpm test` — run all tests
- `pnpm lint` — lint all packages
- `pnpm typecheck` — typecheck all packages

---

## 16. Launch Plan

### Phase Alpha (Internal)

- 10 developers (team + friends)
- 25 apps (mix of real and test)
- 50 devices
- Metrics: install success rate, update success rate, scan turnaround
- Duration: 2 weeks
- Gate: >95% install success rate

### Phase Beta (Closed)

- 50 developers (invited)
- 200 apps
- Search, reviews, reporting enabled
- Trust badges visible
- Moderation SLA: 48 hours
- Duration: 4 weeks
- Gate: <5% false-positive scan rate, <24h moderation turnaround

### Phase Public Beta

- Open developer registration
- Featured charts
- Full developer pages
- Staged rollouts
- Moderation SLA: 24 hours
- Marketing push

### Metrics Tracked from Day One

| Metric | Target |
|--------|--------|
| Install success rate | >95% |
| Update success rate | >98% |
| Scan turnaround time | <5 minutes |
| False-positive scan rate | <5% |
| Crash-free devices | >99% |
| Abuse reports per 1k installs | <2 |
| Verified developer conversion rate | >40% |
| Median time to moderation decision | <24 hours |

---

## 17. Implementation Phases

### Week 1: Foundation
- Monorepo scaffold (all directories, configs, workspaces)
- Docker Compose local dev
- Database schema + migrations
- Auth system (Better Auth)
- Developer signup + profile
- Core API routes (health, auth, developers)

### Week 2: Upload & Process
- APK upload flow (presigned URLs → Blob)
- Ingest worker (metadata extraction, validation, rejection rules)
- Scan worker (static analysis — permissions, SDKs, exported components)
- Risk scoring engine
- Admin risk queue (basic)
- App listing CRUD
- Search indexing (Meilisearch)

### Week 3: Android App
- Android project setup (Kotlin + Compose + Hilt + Ktor)
- Login / register screens
- Home / search / category screens
- App detail screen
- Download manager with foreground service
- PackageInstaller integration (install + update)
- Install source permission handling

### Week 4: Polish & Operations
- Update checking (WorkManager)
- Reviews and ratings
- Report abuse flow
- Developer portal release management UI
- Admin moderation tools (delist, suspend, appeal)
- Audit log
- CI/CD workflows
- End-to-end testing with real signed APKs
- Vercel deployment for all web apps

---

*End of specification.*
