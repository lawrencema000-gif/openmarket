# Week 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the OpenMarket monorepo with working auth, database, developer onboarding API, and core API routes — the foundation everything else builds on.

**Architecture:** pnpm + Turborepo monorepo. Hono API server with Drizzle ORM against PostgreSQL. Better Auth for authentication. Zod contracts shared between packages. Docker Compose for local Postgres + Redis.

**Tech Stack:** Node.js 24, TypeScript, pnpm, Turborepo, Hono, Drizzle ORM, PostgreSQL 17, Redis 7, Better Auth, Zod, Vitest

**Spec reference:** `docs/superpowers/specs/2026-04-12-openmarket-full-design.md`

---

## File Map

### Root configs
- Create: `package.json` — root workspace package
- Create: `pnpm-workspace.yaml` — workspace definitions
- Create: `turbo.json` — Turborepo pipeline config
- Create: `tsconfig.base.json` — shared TypeScript config
- Create: `.gitignore`
- Create: `.npmrc` — pnpm settings
- Create: `CLAUDE.md` — project-level Claude Code instructions
- Create: `.mcp.json` — MCP server connections

### packages/db/
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts` — Drizzle Kit config
- Create: `packages/db/src/index.ts` — DB client export
- Create: `packages/db/src/schema/developers.ts` — developers + identities + evidence + signing_keys tables
- Create: `packages/db/src/schema/apps.ts` — apps + listings + releases + artifacts + metadata tables
- Create: `packages/db/src/schema/security.ts` — scan_results + permissions + sdk_fingerprints tables
- Create: `packages/db/src/schema/users.ts` — users + install_events + reviews + reports tables
- Create: `packages/db/src/schema/moderation.ts` — moderation_actions + release_channels + categories tables
- Create: `packages/db/src/schema/index.ts` — re-export all schemas
- Create: `packages/db/src/seed.ts` — seed categories and test data

### packages/contracts/
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts` — re-export all contracts
- Create: `packages/contracts/src/developers.ts` — developer Zod schemas
- Create: `packages/contracts/src/apps.ts` — app/release Zod schemas
- Create: `packages/contracts/src/auth.ts` — auth request/response schemas
- Create: `packages/contracts/src/common.ts` — shared types (pagination, errors, enums)

### services/api/
- Create: `services/api/package.json`
- Create: `services/api/tsconfig.json`
- Create: `services/api/src/index.ts` — Hono app entry point
- Create: `services/api/src/routes/health.ts` — health check route
- Create: `services/api/src/routes/auth.ts` — Better Auth mount
- Create: `services/api/src/routes/developers.ts` — developer CRUD routes
- Create: `services/api/src/routes/signing-keys.ts` — signing key enrollment routes
- Create: `services/api/src/middleware/auth.ts` — auth middleware
- Create: `services/api/src/middleware/error-handler.ts` — error handling
- Create: `services/api/src/lib/db.ts` — database connection
- Create: `services/api/src/lib/auth.ts` — Better Auth instance

### Tests
- Create: `packages/db/src/__tests__/schema.test.ts`
- Create: `packages/contracts/src/__tests__/developers.test.ts`
- Create: `packages/contracts/src/__tests__/apps.test.ts`
- Create: `services/api/src/__tests__/health.test.ts`
- Create: `services/api/src/__tests__/developers.test.ts`
- Create: `services/api/src/__tests__/signing-keys.test.ts`

### Infrastructure
- Create: `infrastructure/docker/docker-compose.yml`
- Create: `infrastructure/docker/.env.example`

### Claude Code assets
- Create: `.claude/skills/scaffold-service/SKILL.md`
- Create: `.claude/agents/trust-and-safety-reviewer.md`
- Create: `.claude/hooks/post-edit-test.sh`

### Docs
- Create: `docs/mission.md`
- Create: `docs/publishability.md`
- Create: `docs/discoverability.md`
- Create: `docs/enforcement.md`

---

## Task 1: Initialize Monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.npmrc`

- [ ] **Step 1: Initialize git repo and create root package.json**

```bash
cd /c/Users/lmao/openmarket
git init
```

Create `package.json`:
```json
{
  "name": "openmarket",
  "private": true,
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "db:migrate": "pnpm --filter @openmarket/db migrate",
    "db:push": "pnpm --filter @openmarket/db push",
    "db:seed": "pnpm --filter @openmarket/db seed",
    "db:studio": "pnpm --filter @openmarket/db studio"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "services/*"
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2024"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.next/
.turbo/
*.tsbuildinfo
.env
.env.local
.env.*.local
.DS_Store
*.log
coverage/
.gradle/
build/
*.apk
*.aab
```

- [ ] **Step 6: Create .npmrc**

```ini
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 7: Install root dependencies**

Run: `cd /c/Users/lmao/openmarket && pnpm install`
Expected: lockfile created, turbo and typescript installed

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: initialize pnpm + turborepo monorepo"
```

---

## Task 2: Docker Compose for Local Dev

**Files:**
- Create: `infrastructure/docker/docker-compose.yml`
- Create: `infrastructure/docker/.env.example`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: openmarket-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: openmarket
      POSTGRES_USER: openmarket
      POSTGRES_PASSWORD: openmarket_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U openmarket"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: openmarket-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  meilisearch:
    image: getmeili/meilisearch:v1.12
    container_name: openmarket-meilisearch
    ports:
      - "7700:7700"
    environment:
      MEILI_MASTER_KEY: openmarket_dev_key
      MEILI_ENV: development
    volumes:
      - msdata:/meili_data

volumes:
  pgdata:
  msdata:
```

- [ ] **Step 2: Create .env.example**

```env
# Database
DATABASE_URL=postgresql://openmarket:openmarket_dev@localhost:5432/openmarket

# Redis
REDIS_URL=redis://localhost:6379

# Meilisearch
MEILI_URL=http://localhost:7700
MEILI_MASTER_KEY=openmarket_dev_key

# Auth
BETTER_AUTH_SECRET=openmarket-dev-secret-change-in-production
BETTER_AUTH_URL=http://localhost:3001

# GitHub OAuth (optional for dev)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Google OAuth (optional for dev)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 3: Start Docker services to verify**

Run: `cd /c/Users/lmao/openmarket/infrastructure/docker && docker compose up -d`
Expected: postgres, redis, meilisearch all healthy

Run: `docker compose ps`
Expected: all 3 services running

- [ ] **Step 4: Commit**

```bash
cd /c/Users/lmao/openmarket
git add infrastructure/docker/
git commit -m "chore: add docker compose for postgres, redis, meilisearch"
```

---

## Task 3: Database Package — Schema (Developer Identity)

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/schema/developers.ts`
- Create: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create packages/db/package.json**

```json
{
  "name": "@openmarket/db",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  },
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "push": "drizzle-kit push",
    "studio": "drizzle-kit studio",
    "seed": "tsx src/seed.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "drizzle-orm": "^0.39.0",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "vitest": "^3.1.0",
    "typescript": "^5.8.0",
    "dotenv": "^16.4.0"
  }
}
```

- [ ] **Step 2: Create packages/db/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create packages/db/drizzle.config.ts**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: Create packages/db/src/schema/developers.ts**

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const trustLevelEnum = pgEnum("trust_level", [
  "experimental",
  "verified",
  "audited",
  "suspended",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "verified",
  "rejected",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "accepted",
  "rejected",
]);

export const developers = pgTable("developers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  displayName: text("display_name").notNull(),
  legalEntityName: text("legal_entity_name"),
  country: text("country"),
  supportEmail: text("support_email"),
  supportUrl: text("support_url"),
  privacyPolicyUrl: text("privacy_policy_url"),
  trustLevel: trustLevelEnum("trust_level").default("experimental").notNull(),
  suspensionReason: text("suspension_reason"),
  authProvider: text("auth_provider"),
  authProviderId: text("auth_provider_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const identityTypeEnum = pgEnum("identity_type", [
  "email",
  "domain",
  "government_id",
  "play_console",
  "android_dev_console",
]);

export const developerIdentities = pgTable("developer_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  developerId: uuid("developer_id")
    .references(() => developers.id, { onDelete: "cascade" })
    .notNull(),
  identityType: identityTypeEnum("identity_type").notNull(),
  identityValue: text("identity_value").notNull(),
  verificationStatus: verificationStatusEnum("verification_status")
    .default("pending")
    .notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const developerVerificationEvidence = pgTable(
  "developer_verification_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    evidenceType: text("evidence_type").notNull(),
    fileUrl: text("file_url").notNull(),
    notes: text("notes"),
    reviewedBy: uuid("reviewed_by").references(() => developers.id),
    reviewStatus: reviewStatusEnum("review_status").default("pending").notNull(),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export const signingKeys = pgTable(
  "signing_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .references(() => developers.id, { onDelete: "cascade" })
      .notNull(),
    fingerprintSha256: text("fingerprint_sha256").notNull(),
    algorithm: text("algorithm").notNull(),
    certificatePem: text("certificate_pem"),
    keySize: integer("key_size"),
    isActive: boolean("is_active").default(true).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("signing_keys_developer_fingerprint_idx").on(
      table.developerId,
      table.fingerprintSha256
    ),
  ]
);
```

- [ ] **Step 5: Create packages/db/src/schema/index.ts (partial — just developers for now)**

```typescript
export * from "./developers";
```

- [ ] **Step 6: Create packages/db/src/index.ts**

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

export * from "./schema/index";
```

- [ ] **Step 7: Install dependencies**

Run: `cd /c/Users/lmao/openmarket && pnpm install`
Expected: @openmarket/db dependencies installed

- [ ] **Step 8: Verify typecheck passes**

Run: `cd /c/Users/lmao/openmarket/packages/db && pnpm typecheck`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
cd /c/Users/lmao/openmarket
git add packages/db/
git commit -m "feat(db): add developer identity schema — developers, identities, evidence, signing keys"
```

---

## Task 4: Database Package — Schema (Apps, Releases, Artifacts)

**Files:**
- Create: `packages/db/src/schema/apps.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create packages/db/src/schema/apps.ts**

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { developers } from "./developers";

export const trustTierEnum = pgEnum("trust_tier", [
  "standard",
  "enhanced",
  "experimental",
]);

export const releaseChannelEnum = pgEnum("release_channel", [
  "stable",
  "beta",
  "canary",
]);

export const releaseStatusEnum = pgEnum("release_status", [
  "draft",
  "scanning",
  "review",
  "staged_rollout",
  "published",
  "paused",
  "rolled_back",
  "delisted",
]);

export const artifactTypeEnum = pgEnum("artifact_type", ["apk", "aab"]);

export const uploadStatusEnum = pgEnum("upload_status", [
  "pending",
  "uploaded",
  "verified",
  "rejected",
]);

export const contentRatingEnum = pgEnum("content_rating", [
  "everyone",
  "teen",
  "mature",
]);

export const apps = pgTable("apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  packageName: text("package_name").unique().notNull(),
  developerId: uuid("developer_id")
    .references(() => developers.id, { onDelete: "cascade" })
    .notNull(),
  currentListingId: uuid("current_listing_id"),
  trustTier: trustTierEnum("trust_tier").default("standard").notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
  isDelisted: boolean("is_delisted").default(false).notNull(),
  delistReason: text("delist_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const appListings = pgTable("app_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id")
    .references(() => apps.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  shortDescription: text("short_description").notNull(),
  fullDescription: text("full_description").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  screenshots: text("screenshots").array(),
  iconUrl: text("icon_url").notNull(),
  featureGraphicUrl: text("feature_graphic_url"),
  privacyPolicyUrl: text("privacy_policy_url"),
  websiteUrl: text("website_url"),
  sourceCodeUrl: text("source_code_url"),
  isExperimental: boolean("is_experimental").default(false).notNull(),
  containsAds: boolean("contains_ads").default(false).notNull(),
  containsIap: boolean("contains_iap").default(false).notNull(),
  contentRating: contentRatingEnum("content_rating"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    versionCode: integer("version_code").notNull(),
    versionName: text("version_name").notNull(),
    channel: releaseChannelEnum("channel").default("stable").notNull(),
    status: releaseStatusEnum("status").default("draft").notNull(),
    rolloutPercentage: integer("rollout_percentage").default(100),
    releaseNotes: text("release_notes"),
    reviewedBy: uuid("reviewed_by").references(() => developers.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("releases_app_version_idx").on(table.appId, table.versionCode),
  ]
);

export const releaseArtifacts = pgTable("release_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  releaseId: uuid("release_id")
    .references(() => releases.id, { onDelete: "cascade" })
    .notNull(),
  artifactType: artifactTypeEnum("artifact_type").default("apk").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  uploadStatus: uploadStatusEnum("upload_status").default("pending").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const artifactMetadata = pgTable("artifact_metadata", {
  id: uuid("id").primaryKey().defaultRandom(),
  artifactId: uuid("artifact_id")
    .references(() => releaseArtifacts.id, { onDelete: "cascade" })
    .notNull(),
  minSdk: integer("min_sdk").notNull(),
  targetSdk: integer("target_sdk").notNull(),
  abis: text("abis").array(),
  nativeLibs: text("native_libs").array(),
  iconHash: text("icon_hash"),
  appLabel: text("app_label").notNull(),
  isDebugBuild: boolean("is_debug_build").default(false).notNull(),
  signingKeyFingerprint: text("signing_key_fingerprint").notNull(),
  signingSchemeVersions: integer("signing_scheme_versions").array(),
  components: jsonb("components"),
  exportedComponents: jsonb("exported_components"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Update packages/db/src/schema/index.ts**

```typescript
export * from "./developers";
export * from "./apps";
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd /c/Users/lmao/openmarket/packages/db && pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd /c/Users/lmao/openmarket
git add packages/db/src/schema/apps.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add apps, listings, releases, artifacts, metadata schema"
```

---

## Task 5: Database Package — Schema (Security, Users, Moderation)

**Files:**
- Create: `packages/db/src/schema/security.ts`
- Create: `packages/db/src/schema/users.ts`
- Create: `packages/db/src/schema/moderation.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create packages/db/src/schema/security.ts**

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { releaseArtifacts } from "./apps";

export const scanTypeEnum = pgEnum("scan_type", [
  "static",
  "dynamic",
  "diff",
  "identity",
]);

export const scanStatusEnum = pgEnum("scan_status", [
  "pending",
  "running",
  "passed",
  "failed",
  "flagged",
]);

export const sdkCategoryEnum = pgEnum("sdk_category", [
  "ads",
  "analytics",
  "social",
  "payment",
  "security",
  "other",
]);

export const scanResults = pgTable("scan_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  artifactId: uuid("artifact_id")
    .references(() => releaseArtifacts.id, { onDelete: "cascade" })
    .notNull(),
  scanType: scanTypeEnum("scan_type").default("static").notNull(),
  status: scanStatusEnum("status").default("pending").notNull(),
  riskScore: integer("risk_score"),
  findings: jsonb("findings"),
  summary: text("summary"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const permissionsDetected = pgTable("permissions_detected", {
  id: uuid("id").primaryKey().defaultRandom(),
  artifactId: uuid("artifact_id")
    .references(() => releaseArtifacts.id, { onDelete: "cascade" })
    .notNull(),
  permissionName: text("permission_name").notNull(),
  isDangerous: boolean("is_dangerous").default(false).notNull(),
  isNewSincePrevious: boolean("is_new_since_previous").default(false).notNull(),
  protectionLevel: text("protection_level"),
});

export const sdkFingerprints = pgTable("sdk_fingerprints", {
  id: uuid("id").primaryKey().defaultRandom(),
  artifactId: uuid("artifact_id")
    .references(() => releaseArtifacts.id, { onDelete: "cascade" })
    .notNull(),
  sdkName: text("sdk_name").notNull(),
  sdkVersion: text("sdk_version"),
  category: sdkCategoryEnum("category").default("other").notNull(),
  riskFlag: boolean("risk_flag").default(false).notNull(),
  riskReason: text("risk_reason"),
});
```

- [ ] **Step 2: Create packages/db/src/schema/users.ts**

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";

export const installSourceEnum = pgEnum("install_source", [
  "store_app",
  "web",
  "direct",
]);

export const reportTypeEnum = pgEnum("report_type", [
  "malware",
  "scam",
  "impersonation",
  "illegal",
  "spam",
  "broken",
  "other",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "open",
  "investigating",
  "resolved",
  "dismissed",
]);

export const reportTargetTypeEnum = pgEnum("report_target_type", [
  "app",
  "release",
  "developer",
  "review",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  displayName: text("display_name"),
  authProvider: text("auth_provider"),
  authProviderId: text("auth_provider_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const installEvents = pgTable("install_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id")
    .references(() => apps.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id"),
  deviceFingerprintHash: text("device_fingerprint_hash"),
  installedVersionCode: integer("installed_version_code").notNull(),
  source: installSourceEnum("source").default("store_app").notNull(),
  osVersion: text("os_version"),
  deviceModel: text("device_model"),
  success: boolean("success").default(true).notNull(),
  failureReason: text("failure_reason"),
  installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    rating: integer("rating").notNull(),
    title: text("title"),
    body: text("body"),
    versionCodeReviewed: integer("version_code_reviewed").notNull(),
    helpfulCount: integer("helpful_count").default(0).notNull(),
    isFlagged: boolean("is_flagged").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("reviews_app_user_idx").on(table.appId, table.userId),
  ]
);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: reportTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reporterId: uuid("reporter_id")
    .references(() => users.id)
    .notNull(),
  reportType: reportTypeEnum("report_type").notNull(),
  description: text("description").notNull(),
  status: reportStatusEnum("status").default("open").notNull(),
  resolutionNotes: text("resolution_notes"),
  resolvedBy: uuid("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 3: Create packages/db/src/schema/moderation.ts**

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { developers } from "./developers";
import { apps } from "./apps";

export const moderationTargetTypeEnum = pgEnum("moderation_target_type", [
  "app",
  "release",
  "developer",
]);

export const moderationActionEnum = pgEnum("moderation_action", [
  "warn",
  "delist_release",
  "freeze_updates",
  "suspend_developer",
  "reinstate",
]);

export const appealStatusEnum = pgEnum("appeal_status", [
  "none",
  "pending",
  "upheld",
  "overturned",
]);

export const moderationActions = pgTable("moderation_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: moderationTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  action: moderationActionEnum("action").notNull(),
  reason: text("reason").notNull(),
  moderatorId: uuid("moderator_id")
    .references(() => developers.id)
    .notNull(),
  appealStatus: appealStatusEnum("appeal_status").default("none").notNull(),
  appealNotes: text("appeal_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const releaseChannels = pgTable(
  "release_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .references(() => apps.id, { onDelete: "cascade" })
      .notNull(),
    channelName: text("channel_name").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("release_channels_app_channel_idx").on(
      table.appId,
      table.channelName
    ),
  ]
);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  icon: text("icon"),
  sortOrder: integer("sort_order").default(0).notNull(),
});
```

- [ ] **Step 4: Update packages/db/src/schema/index.ts**

```typescript
export * from "./developers";
export * from "./apps";
export * from "./security";
export * from "./users";
export * from "./moderation";
```

- [ ] **Step 5: Verify typecheck passes**

Run: `cd /c/Users/lmao/openmarket/packages/db && pnpm typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
cd /c/Users/lmao/openmarket
git add packages/db/src/schema/
git commit -m "feat(db): add security, users, moderation, categories schema"
```

---

## Task 6: Database — Migrations and Seed Data

**Files:**
- Create: `packages/db/src/seed.ts`
- Test: `packages/db/src/__tests__/schema.test.ts`

- [ ] **Step 1: Write the schema validation test**

Create `packages/db/src/__tests__/schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import * as schema from "../schema/index";

describe("Database Schema", () => {
  it("exports developers table", () => {
    expect(schema.developers).toBeDefined();
    expect(schema.developers.id).toBeDefined();
    expect(schema.developers.email).toBeDefined();
    expect(schema.developers.trustLevel).toBeDefined();
  });

  it("exports apps table", () => {
    expect(schema.apps).toBeDefined();
    expect(schema.apps.packageName).toBeDefined();
    expect(schema.apps.developerId).toBeDefined();
  });

  it("exports releases table with version uniqueness", () => {
    expect(schema.releases).toBeDefined();
    expect(schema.releases.versionCode).toBeDefined();
    expect(schema.releases.status).toBeDefined();
  });

  it("exports signing keys table", () => {
    expect(schema.signingKeys).toBeDefined();
    expect(schema.signingKeys.fingerprintSha256).toBeDefined();
    expect(schema.signingKeys.developerId).toBeDefined();
  });

  it("exports scan results table", () => {
    expect(schema.scanResults).toBeDefined();
    expect(schema.scanResults.riskScore).toBeDefined();
    expect(schema.scanResults.findings).toBeDefined();
  });

  it("exports categories table", () => {
    expect(schema.categories).toBeDefined();
    expect(schema.categories.slug).toBeDefined();
  });

  it("exports all expected tables", () => {
    const expectedTables = [
      "developers",
      "developerIdentities",
      "developerVerificationEvidence",
      "signingKeys",
      "apps",
      "appListings",
      "releases",
      "releaseArtifacts",
      "artifactMetadata",
      "scanResults",
      "permissionsDetected",
      "sdkFingerprints",
      "users",
      "installEvents",
      "reviews",
      "reports",
      "moderationActions",
      "releaseChannels",
      "categories",
    ];
    for (const table of expectedTables) {
      expect(schema).toHaveProperty(table);
    }
  });
});
```

- [ ] **Step 2: Create vitest config for db package**

Create `packages/db/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd /c/Users/lmao/openmarket/packages/db && pnpm test`
Expected: all tests pass — these are structural tests that don't need a DB connection

- [ ] **Step 4: Create packages/db/src/seed.ts**

```typescript
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { categories } from "./schema/moderation";

const CATEGORIES = [
  { slug: "art-design", name: "Art & Design", sortOrder: 1 },
  { slug: "books-reference", name: "Books & Reference", sortOrder: 2 },
  { slug: "business", name: "Business", sortOrder: 3 },
  { slug: "communication", name: "Communication", sortOrder: 4 },
  { slug: "education", name: "Education", sortOrder: 5 },
  { slug: "entertainment", name: "Entertainment", sortOrder: 6 },
  { slug: "finance", name: "Finance", sortOrder: 7 },
  { slug: "food-drink", name: "Food & Drink", sortOrder: 8 },
  { slug: "games-action", name: "Games: Action", sortOrder: 9 },
  { slug: "games-adventure", name: "Games: Adventure", sortOrder: 10 },
  { slug: "games-arcade", name: "Games: Arcade", sortOrder: 11 },
  { slug: "games-board", name: "Games: Board", sortOrder: 12 },
  { slug: "games-card", name: "Games: Card", sortOrder: 13 },
  { slug: "games-casino", name: "Games: Casino", sortOrder: 14 },
  { slug: "games-casual", name: "Games: Casual", sortOrder: 15 },
  { slug: "games-educational", name: "Games: Educational", sortOrder: 16 },
  { slug: "games-music", name: "Games: Music", sortOrder: 17 },
  { slug: "games-puzzle", name: "Games: Puzzle", sortOrder: 18 },
  { slug: "games-racing", name: "Games: Racing", sortOrder: 19 },
  { slug: "games-role-playing", name: "Games: Role Playing", sortOrder: 20 },
  { slug: "games-simulation", name: "Games: Simulation", sortOrder: 21 },
  { slug: "games-sports", name: "Games: Sports", sortOrder: 22 },
  { slug: "games-strategy", name: "Games: Strategy", sortOrder: 23 },
  { slug: "games-trivia", name: "Games: Trivia", sortOrder: 24 },
  { slug: "games-word", name: "Games: Word", sortOrder: 25 },
  { slug: "health-fitness", name: "Health & Fitness", sortOrder: 26 },
  { slug: "lifestyle", name: "Lifestyle", sortOrder: 27 },
  { slug: "maps-navigation", name: "Maps & Navigation", sortOrder: 28 },
  { slug: "medical", name: "Medical", sortOrder: 29 },
  { slug: "music-audio", name: "Music & Audio", sortOrder: 30 },
  { slug: "news-magazines", name: "News & Magazines", sortOrder: 31 },
  { slug: "parenting", name: "Parenting", sortOrder: 32 },
  { slug: "personalization", name: "Personalization", sortOrder: 33 },
  { slug: "photography", name: "Photography", sortOrder: 34 },
  { slug: "productivity", name: "Productivity", sortOrder: 35 },
  { slug: "shopping", name: "Shopping", sortOrder: 36 },
  { slug: "social", name: "Social", sortOrder: 37 },
  { slug: "sports", name: "Sports", sortOrder: 38 },
  { slug: "tools", name: "Tools", sortOrder: 39 },
  { slug: "travel-local", name: "Travel & Local", sortOrder: 40 },
  { slug: "video-players", name: "Video Players", sortOrder: 41 },
  { slug: "weather", name: "Weather", sortOrder: 42 },
];

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log("Seeding categories...");
  await db
    .insert(categories)
    .values(CATEGORIES)
    .onConflictDoNothing({ target: categories.slug });

  console.log(`Seeded ${CATEGORIES.length} categories`);

  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

- [ ] **Step 5: Generate migrations**

Run: `cd /c/Users/lmao/openmarket/packages/db && cp ../../infrastructure/docker/.env.example .env && pnpm generate`
Expected: migration files created in `packages/db/drizzle/` directory

- [ ] **Step 6: Push schema to local DB**

Run: `cd /c/Users/lmao/openmarket/packages/db && pnpm push`
Expected: all tables created in local PostgreSQL

- [ ] **Step 7: Run seed**

Run: `cd /c/Users/lmao/openmarket/packages/db && pnpm seed`
Expected: "Seeded 42 categories"

- [ ] **Step 8: Commit**

```bash
cd /c/Users/lmao/openmarket
git add packages/db/
git commit -m "feat(db): add migrations, seed data, schema tests"
```

---

## Task 7: Contracts Package

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/common.ts`
- Create: `packages/contracts/src/developers.ts`
- Create: `packages/contracts/src/apps.ts`
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/vitest.config.ts`
- Test: `packages/contracts/src/__tests__/developers.test.ts`
- Test: `packages/contracts/src/__tests__/apps.test.ts`

- [ ] **Step 1: Create packages/contracts/package.json**

```json
{
  "name": "@openmarket/contracts",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./developers": "./src/developers.ts",
    "./apps": "./src/apps.ts",
    "./auth": "./src/auth.ts",
    "./common": "./src/common.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "vitest": "^3.1.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create packages/contracts/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create packages/contracts/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 4: Create packages/contracts/src/common.ts**

```typescript
import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  });

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const trustLevels = ["experimental", "verified", "audited", "suspended"] as const;
export const trustLevelSchema = z.enum(trustLevels);
export type TrustLevel = z.infer<typeof trustLevelSchema>;

export const releaseStatuses = [
  "draft", "scanning", "review", "staged_rollout",
  "published", "paused", "rolled_back", "delisted",
] as const;
export const releaseStatusSchema = z.enum(releaseStatuses);

export const releaseChannels = ["stable", "beta", "canary"] as const;
export const releaseChannelSchema = z.enum(releaseChannels);

export const uuidSchema = z.string().uuid();
```

- [ ] **Step 5: Create packages/contracts/src/developers.ts**

```typescript
import { z } from "zod";
import { trustLevelSchema, uuidSchema } from "./common";

export const createDeveloperProfileSchema = z.object({
  displayName: z.string().min(2).max(100),
  legalEntityName: z.string().max(200).optional(),
  country: z.string().min(2).max(100).optional(),
  supportEmail: z.string().email().optional(),
  supportUrl: z.string().url().optional(),
  privacyPolicyUrl: z.string().url().optional(),
});

export type CreateDeveloperProfile = z.infer<typeof createDeveloperProfileSchema>;

export const updateDeveloperProfileSchema = createDeveloperProfileSchema.partial();

export type UpdateDeveloperProfile = z.infer<typeof updateDeveloperProfileSchema>;

export const developerResponseSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  legalEntityName: z.string().nullable(),
  country: z.string().nullable(),
  supportEmail: z.string().nullable(),
  supportUrl: z.string().nullable(),
  privacyPolicyUrl: z.string().nullable(),
  trustLevel: trustLevelSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type DeveloperResponse = z.infer<typeof developerResponseSchema>;

export const enrollSigningKeySchema = z.object({
  fingerprintSha256: z
    .string()
    .regex(/^[A-Fa-f0-9]{64}$/, "Must be a valid SHA-256 hex string"),
  algorithm: z.enum(["RSA", "EC", "DSA"]),
  certificatePem: z.string().optional(),
  keySize: z.number().int().positive().optional(),
});

export type EnrollSigningKey = z.infer<typeof enrollSigningKeySchema>;

export const signingKeyResponseSchema = z.object({
  id: uuidSchema,
  fingerprintSha256: z.string(),
  algorithm: z.string(),
  keySize: z.number().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});

export type SigningKeyResponse = z.infer<typeof signingKeyResponseSchema>;
```

- [ ] **Step 6: Create packages/contracts/src/apps.ts**

```typescript
import { z } from "zod";
import { releaseChannelSchema, releaseStatusSchema, uuidSchema } from "./common";

export const createAppSchema = z.object({
  packageName: z
    .string()
    .regex(
      /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){1,}$/,
      "Must be a valid Android package name (e.g., com.example.myapp)"
    )
    .min(3)
    .max(255),
  title: z.string().min(2).max(100),
  shortDescription: z.string().min(10).max(80),
  fullDescription: z.string().min(20).max(4000),
  category: z.string().min(1),
  iconUrl: z.string().url(),
  screenshots: z.array(z.string().url()).min(2).max(8),
  privacyPolicyUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  sourceCodeUrl: z.string().url().optional(),
  isExperimental: z.boolean().default(false),
  containsAds: z.boolean().default(false),
  contentRating: z.enum(["everyone", "teen", "mature"]).optional(),
});

export type CreateApp = z.infer<typeof createAppSchema>;

export const createReleaseSchema = z.object({
  appId: uuidSchema,
  versionCode: z.number().int().positive(),
  versionName: z.string().min(1).max(50),
  channel: releaseChannelSchema.default("stable"),
  releaseNotes: z.string().max(5000).optional(),
});

export type CreateRelease = z.infer<typeof createReleaseSchema>;

export const appResponseSchema = z.object({
  id: uuidSchema,
  packageName: z.string(),
  developerId: uuidSchema,
  title: z.string(),
  shortDescription: z.string(),
  category: z.string(),
  iconUrl: z.string(),
  isPublished: z.boolean(),
  isExperimental: z.boolean(),
  trustTier: z.string(),
  createdAt: z.string().datetime(),
});

export type AppResponse = z.infer<typeof appResponseSchema>;

export const releaseResponseSchema = z.object({
  id: uuidSchema,
  appId: uuidSchema,
  versionCode: z.number(),
  versionName: z.string(),
  channel: releaseChannelSchema,
  status: releaseStatusSchema,
  rolloutPercentage: z.number(),
  releaseNotes: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type ReleaseResponse = z.infer<typeof releaseResponseSchema>;
```

- [ ] **Step 7: Create packages/contracts/src/auth.ts**

```typescript
import { z } from "zod";

export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(100),
});

export type SignUp = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type SignIn = z.infer<typeof signInSchema>;
```

- [ ] **Step 8: Create packages/contracts/src/index.ts**

```typescript
export * from "./common";
export * from "./developers";
export * from "./apps";
export * from "./auth";
```

- [ ] **Step 9: Write contract tests**

Create `packages/contracts/src/__tests__/developers.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  createDeveloperProfileSchema,
  enrollSigningKeySchema,
} from "../developers";

describe("createDeveloperProfileSchema", () => {
  it("accepts valid developer profile", () => {
    const result = createDeveloperProfileSchema.safeParse({
      displayName: "Test Developer",
      country: "US",
      supportEmail: "dev@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects display name shorter than 2 chars", () => {
    const result = createDeveloperProfileSchema.safeParse({
      displayName: "A",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid support email", () => {
    const result = createDeveloperProfileSchema.safeParse({
      displayName: "Test Developer",
      supportEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts profile with all optional fields", () => {
    const result = createDeveloperProfileSchema.safeParse({
      displayName: "Full Profile Dev",
      legalEntityName: "Dev Corp LLC",
      country: "AU",
      supportEmail: "support@devcorp.com",
      supportUrl: "https://devcorp.com/support",
      privacyPolicyUrl: "https://devcorp.com/privacy",
    });
    expect(result.success).toBe(true);
  });
});

describe("enrollSigningKeySchema", () => {
  it("accepts valid SHA-256 fingerprint", () => {
    const result = enrollSigningKeySchema.safeParse({
      fingerprintSha256: "a".repeat(64),
      algorithm: "RSA",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid fingerprint length", () => {
    const result = enrollSigningKeySchema.safeParse({
      fingerprintSha256: "abc123",
      algorithm: "RSA",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid algorithm", () => {
    const result = enrollSigningKeySchema.safeParse({
      fingerprintSha256: "a".repeat(64),
      algorithm: "INVALID",
    });
    expect(result.success).toBe(false);
  });
});
```

Create `packages/contracts/src/__tests__/apps.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { createAppSchema, createReleaseSchema } from "../apps";

describe("createAppSchema", () => {
  const validApp = {
    packageName: "com.example.myapp",
    title: "My App",
    shortDescription: "A great app for everyone",
    fullDescription: "This is a full description of the app that is at least 20 chars",
    category: "tools",
    iconUrl: "https://example.com/icon.png",
    screenshots: [
      "https://example.com/s1.png",
      "https://example.com/s2.png",
    ],
  };

  it("accepts valid app", () => {
    const result = createAppSchema.safeParse(validApp);
    expect(result.success).toBe(true);
  });

  it("rejects invalid package name — no dots", () => {
    const result = createAppSchema.safeParse({
      ...validApp,
      packageName: "myapp",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid package name — starts with number", () => {
    const result = createAppSchema.safeParse({
      ...validApp,
      packageName: "1com.example.app",
    });
    expect(result.success).toBe(false);
  });

  it("rejects too few screenshots", () => {
    const result = createAppSchema.safeParse({
      ...validApp,
      screenshots: ["https://example.com/s1.png"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects too many screenshots", () => {
    const result = createAppSchema.safeParse({
      ...validApp,
      screenshots: Array(9).fill("https://example.com/s.png"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects short description over 80 chars", () => {
    const result = createAppSchema.safeParse({
      ...validApp,
      shortDescription: "x".repeat(81),
    });
    expect(result.success).toBe(false);
  });
});

describe("createReleaseSchema", () => {
  it("accepts valid release", () => {
    const result = createReleaseSchema.safeParse({
      appId: "550e8400-e29b-41d4-a716-446655440000",
      versionCode: 1,
      versionName: "1.0.0",
    });
    expect(result.success).toBe(true);
  });

  it("defaults channel to stable", () => {
    const result = createReleaseSchema.safeParse({
      appId: "550e8400-e29b-41d4-a716-446655440000",
      versionCode: 1,
      versionName: "1.0.0",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe("stable");
    }
  });

  it("rejects negative version code", () => {
    const result = createReleaseSchema.safeParse({
      appId: "550e8400-e29b-41d4-a716-446655440000",
      versionCode: -1,
      versionName: "1.0.0",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 10: Run contract tests**

Run: `cd /c/Users/lmao/openmarket/packages/contracts && pnpm install && pnpm test`
Expected: all tests pass

- [ ] **Step 11: Commit**

```bash
cd /c/Users/lmao/openmarket
git add packages/contracts/
git commit -m "feat(contracts): add zod schemas for developers, apps, releases, auth"
```

---

## Task 8: API Service — Setup and Health Route

**Files:**
- Create: `services/api/package.json`
- Create: `services/api/tsconfig.json`
- Create: `services/api/vitest.config.ts`
- Create: `services/api/src/index.ts`
- Create: `services/api/src/routes/health.ts`
- Create: `services/api/src/middleware/error-handler.ts`
- Create: `services/api/src/lib/db.ts`
- Test: `services/api/src/__tests__/health.test.ts`

- [ ] **Step 1: Create services/api/package.json**

```json
{
  "name": "@openmarket/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.7.0",
    "@hono/node-server": "^1.14.0",
    "@hono/zod-validator": "^0.5.0",
    "@openmarket/db": "workspace:*",
    "@openmarket/contracts": "workspace:*",
    "better-auth": "^1.2.0",
    "dotenv": "^16.4.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "vitest": "^3.1.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create services/api/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create services/api/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 4: Create services/api/src/middleware/error-handler.ts**

```typescript
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

export async function errorHandler(err: Error, c: Context) {
  if (err instanceof HTTPException) {
    return c.json(
      {
        error: {
          code: `HTTP_${err.status}`,
          message: err.message,
        },
      },
      err.status
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: err.flatten(),
        },
      },
      400
    );
  }

  console.error("Unhandled error:", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred",
      },
    },
    500
  );
}
```

- [ ] **Step 5: Create services/api/src/lib/db.ts**

```typescript
import { createDb } from "@openmarket/db";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const db = createDb(databaseUrl);
```

- [ ] **Step 6: Create services/api/src/routes/health.ts**

```typescript
import { Hono } from "hono";

export const healthRouter = new Hono();

healthRouter.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "openmarket-api",
    timestamp: new Date().toISOString(),
  });
});
```

- [ ] **Step 7: Create services/api/src/index.ts**

```typescript
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { healthRouter } from "./routes/health";
import { errorHandler } from "./middleware/error-handler";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
    ],
    credentials: true,
  })
);

app.onError(errorHandler);

app.route("/", healthRouter);

const port = parseInt(process.env.PORT ?? "3001", 10);

console.log(`OpenMarket API starting on port ${port}`);

serve({ fetch: app.fetch, port });

export default app;
export type AppType = typeof app;
```

- [ ] **Step 8: Write health route test**

Create `services/api/src/__tests__/health.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { healthRouter } from "../routes/health";

const app = new Hono();
app.route("/", healthRouter);

describe("GET /health", () => {
  it("returns status ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("openmarket-api");
    expect(body.timestamp).toBeDefined();
  });
});
```

- [ ] **Step 9: Install dependencies and run tests**

Run: `cd /c/Users/lmao/openmarket && pnpm install`
Run: `cd /c/Users/lmao/openmarket/services/api && pnpm test`
Expected: health test passes

- [ ] **Step 10: Commit**

```bash
cd /c/Users/lmao/openmarket
git add services/api/
git commit -m "feat(api): add hono api service with health route and error handling"
```

---

## Task 9: API Service — Auth Middleware

**Files:**
- Create: `services/api/src/lib/auth.ts`
- Create: `services/api/src/routes/auth.ts`
- Create: `services/api/src/middleware/auth.ts`

- [ ] **Step 1: Create services/api/src/lib/auth.ts**

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      enabled: !!process.env.GITHUB_CLIENT_ID,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      enabled: !!process.env.GOOGLE_CLIENT_ID,
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});
```

- [ ] **Step 2: Create services/api/src/routes/auth.ts**

```typescript
import { Hono } from "hono";
import { auth } from "../lib/auth";

export const authRouter = new Hono();

authRouter.all("/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});
```

- [ ] **Step 3: Create services/api/src/middleware/auth.ts**

```typescript
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../lib/auth";

export async function requireAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  c.set("session", session.session);
  c.set("user", session.user);
  await next();
}
```

- [ ] **Step 4: Mount auth routes in index.ts**

Update `services/api/src/index.ts` — add after `healthRouter`:
```typescript
import { authRouter } from "./routes/auth";
// ... after app.route("/", healthRouter);
app.route("/api", authRouter);
```

- [ ] **Step 5: Commit**

```bash
cd /c/Users/lmao/openmarket
git add services/api/src/
git commit -m "feat(api): add better-auth integration with email, github, google providers"
```

---

## Task 10: API Service — Developer CRUD Routes

**Files:**
- Create: `services/api/src/routes/developers.ts`
- Test: `services/api/src/__tests__/developers.test.ts`

- [ ] **Step 1: Write developer route tests**

Create `services/api/src/__tests__/developers.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock db module before importing routes
vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    query: {
      developers: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c, next) => {
    c.set("user", { id: "test-user-id", email: "dev@test.com" });
    c.set("session", { id: "test-session" });
    await next();
  }),
}));

import { developersRouter } from "../routes/developers";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", developersRouter);

describe("GET /api/developers/me", () => {
  it("returns 404 when developer profile not found", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(undefined);

    const res = await app.request("/api/developers/me");
    expect(res.status).toBe(404);
  });

  it("returns developer profile when found", async () => {
    const mockDev = {
      id: "dev-1",
      email: "dev@test.com",
      displayName: "Test Dev",
      trustLevel: "experimental",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce(mockDev as any);

    const res = await app.request("/api/developers/me");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.displayName).toBe("Test Dev");
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd /c/Users/lmao/openmarket/services/api && pnpm test -- developers`
Expected: FAIL — `developersRouter` not found

- [ ] **Step 3: Create services/api/src/routes/developers.ts**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db";
import { developers } from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import {
  createDeveloperProfileSchema,
  updateDeveloperProfileSchema,
} from "@openmarket/contracts/developers";

export const developersRouter = new Hono();

// Get current developer profile
developersRouter.get("/developers/me", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; email: string };

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  return c.json(developer);
});

// Create developer profile
developersRouter.post(
  "/developers",
  requireAuth,
  zValidator("json", createDeveloperProfileSchema),
  async (c) => {
    const user = c.get("user") as { id: string; email: string };
    const body = c.req.valid("json");

    const existing = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (existing) {
      throw new HTTPException(409, { message: "Developer profile already exists" });
    }

    const [developer] = await db
      .insert(developers)
      .values({
        email: user.email,
        displayName: body.displayName,
        legalEntityName: body.legalEntityName,
        country: body.country,
        supportEmail: body.supportEmail,
        supportUrl: body.supportUrl,
        privacyPolicyUrl: body.privacyPolicyUrl,
        authProvider: "email",
        authProviderId: user.id,
      })
      .returning();

    return c.json(developer, 201);
  }
);

// Update developer profile
developersRouter.patch(
  "/developers/me",
  requireAuth,
  zValidator("json", updateDeveloperProfileSchema),
  async (c) => {
    const user = c.get("user") as { id: string; email: string };
    const body = c.req.valid("json");

    const [updated] = await db
      .update(developers)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(developers.email, user.email))
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    return c.json(updated);
  }
);

// Get developer by ID (public)
developersRouter.get("/developers/:id", async (c) => {
  const id = c.req.param("id");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.id, id),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer not found" });
  }

  // Return public-safe fields only
  return c.json({
    id: developer.id,
    displayName: developer.displayName,
    trustLevel: developer.trustLevel,
    createdAt: developer.createdAt,
  });
});
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `cd /c/Users/lmao/openmarket/services/api && pnpm test -- developers`
Expected: all tests pass

- [ ] **Step 5: Mount developers routes in index.ts**

Update `services/api/src/index.ts`:
```typescript
import { developersRouter } from "./routes/developers";
// ... after app.route("/api", authRouter);
app.route("/api", developersRouter);
```

- [ ] **Step 6: Commit**

```bash
cd /c/Users/lmao/openmarket
git add services/api/src/
git commit -m "feat(api): add developer CRUD routes — create, read, update profile"
```

---

## Task 11: API Service — Signing Key Routes

**Files:**
- Create: `services/api/src/routes/signing-keys.ts`
- Test: `services/api/src/__tests__/signing-keys.test.ts`

- [ ] **Step 1: Write signing key route tests**

Create `services/api/src/__tests__/signing-keys.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    query: {
      developers: { findFirst: vi.fn() },
      signingKeys: { findMany: vi.fn(), findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c, next) => {
    c.set("user", { id: "test-user-id", email: "dev@test.com" });
    c.set("session", { id: "test-session" });
    await next();
  }),
}));

import { signingKeysRouter } from "../routes/signing-keys";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", signingKeysRouter);

describe("POST /api/signing-keys", () => {
  it("rejects invalid SHA-256 fingerprint", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-1",
    } as any);

    const res = await app.request("/api/signing-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fingerprintSha256: "too-short",
        algorithm: "RSA",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/signing-keys", () => {
  it("returns empty array when no keys enrolled", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-1",
    } as any);
    vi.mocked(db.query.signingKeys.findMany).mockResolvedValueOnce([]);

    const res = await app.request("/api/signing-keys");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd /c/Users/lmao/openmarket/services/api && pnpm test -- signing-keys`
Expected: FAIL — `signingKeysRouter` not found

- [ ] **Step 3: Create services/api/src/routes/signing-keys.ts**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db";
import { developers, signingKeys } from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { enrollSigningKeySchema } from "@openmarket/contracts/developers";

export const signingKeysRouter = new Hono();

// List signing keys for current developer
signingKeysRouter.get("/signing-keys", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; email: string };

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  const keys = await db.query.signingKeys.findMany({
    where: eq(signingKeys.developerId, developer.id),
  });

  return c.json(keys);
});

// Enroll a new signing key
signingKeysRouter.post(
  "/signing-keys",
  requireAuth,
  zValidator("json", enrollSigningKeySchema),
  async (c) => {
    const user = c.get("user") as { id: string; email: string };
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    // Check for duplicate fingerprint
    const existing = await db.query.signingKeys.findFirst({
      where: and(
        eq(signingKeys.developerId, developer.id),
        eq(signingKeys.fingerprintSha256, body.fingerprintSha256)
      ),
    });

    if (existing) {
      throw new HTTPException(409, { message: "Signing key already enrolled" });
    }

    const [key] = await db
      .insert(signingKeys)
      .values({
        developerId: developer.id,
        fingerprintSha256: body.fingerprintSha256,
        algorithm: body.algorithm,
        certificatePem: body.certificatePem,
        keySize: body.keySize,
      })
      .returning();

    return c.json(key, 201);
  }
);

// Revoke a signing key
signingKeysRouter.delete("/signing-keys/:id", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; email: string };
  const keyId = c.req.param("id");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  const [revoked] = await db
    .update(signingKeys)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revocationReason: "Revoked by developer",
    })
    .where(
      and(eq(signingKeys.id, keyId), eq(signingKeys.developerId, developer.id))
    )
    .returning();

  if (!revoked) {
    throw new HTTPException(404, { message: "Signing key not found" });
  }

  return c.json(revoked);
});
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `cd /c/Users/lmao/openmarket/services/api && pnpm test -- signing-keys`
Expected: all tests pass

- [ ] **Step 5: Mount signing keys routes in index.ts**

Update `services/api/src/index.ts`:
```typescript
import { signingKeysRouter } from "./routes/signing-keys";
// ... after developersRouter
app.route("/api", signingKeysRouter);
```

- [ ] **Step 6: Commit**

```bash
cd /c/Users/lmao/openmarket
git add services/api/src/
git commit -m "feat(api): add signing key enrollment, listing, and revocation routes"
```

---

## Task 12: Store Constitution Docs

**Files:**
- Create: `docs/mission.md`
- Create: `docs/publishability.md`
- Create: `docs/discoverability.md`
- Create: `docs/enforcement.md`

- [ ] **Step 1: Create docs/mission.md**

```markdown
# OpenMarket — Mission

OpenMarket is a viewpoint-neutral Android app marketplace.

We believe developers should be free to publish any lawful application without ideological gatekeeping. We also believe users deserve protection from malware, scams, and abusive software.

Our principle: **separate hosting from amplification.** Everything lawful can be published. Not everything gets equal ranking, featuring, or discoverability.

## Two Lanes

- **Verified Store** — full marketplace UX for identity-verified developers. Searchable, rankable, eligible for updates, charts, featured spots, and monetization.
- **Experimental Lab** — clearly labeled lane for unverified developers and hobbyist experiments. Reduced discoverability, power-user install path.

## What We Are Not

- We are not Google Play. We do not copy their brand, trade dress, or taxonomy.
- We are not a malware CDN. We run a real security pipeline.
- We are not a political censor. We evaluate behavior, not viewpoint.
```

- [ ] **Step 2: Create docs/publishability.md**

```markdown
# Publishability — What May Be Uploaded

## Allowed

Any application that does not violate the banned behaviors list below. This explicitly includes:

- Political apps (any political orientation)
- Controversial but lawful content
- Low-polish, hobbyist, or experimental apps
- Ad-supported applications (must declare)
- Crypto, finance, and wallet apps (subject to enhanced review)
- Apps also published on Google Play or other stores
- Apps with adult content (must declare, content-rated "mature")

## Banned Behaviors

Applications exhibiting any of the following are rejected and may result in developer suspension:

- **Malware** — code designed to harm user devices, exfiltrate data, or operate botnets
- **Scams** — deceptive apps designed to defraud users financially
- **Credential theft** — phishing, keylogging, or unauthorized credential harvesting
- **Impersonation** — apps that impersonate other apps, developers, or organizations
- **Illegal content** — content illegal in the developer's declared jurisdiction
- **Abusive surveillance** — spyware, stalkerware, or non-consensual tracking
- **Ransomware** — apps that encrypt or lock user data for ransom
- **Non-consensual abuse tools** — tools designed for harassment or abuse

## Enhanced Review Categories

These app types are allowed but undergo additional security scrutiny:

- Finance, banking, crypto, and wallet apps
- Apps requesting accessibility services
- Apps requesting device administrator privileges
- Apps targeting children (content rating: "everyone")
```

- [ ] **Step 3: Create docs/discoverability.md**

```markdown
# Discoverability — What Gets Ranked and Featured

## Ranking Signals

Apps are ranked by a weighted combination of:

| Signal | Weight | Direction |
|--------|--------|-----------|
| Search query relevance | High | Positive |
| Trust tier (audited > verified > experimental) | High | Positive |
| Crash-free device rate | Medium | Positive |
| Recent install success rate (30d) | Medium | Positive |
| Abuse report rate (per 1k installs) | High | Negative |
| Update freshness | Low | Positive |
| Review quality (rating + count) | Medium | Positive |
| 30-day retention estimate | Medium | Positive |

Experimental-lane apps receive a -30% ranking penalty in main search results. They appear at full weight in the Experimental Lab section.

## Trust Badges

| Badge | Condition |
|-------|-----------|
| Verified Developer | Identity confirmed |
| Experimental | Unverified developer |
| New | Published within 30 days |
| Recently Updated | Updated within 14 days |
| Security Reviewed | Risk score < 20 |
| High-Risk Permissions | Uses sensitive permission combinations |
| Ads/Trackers Declared | Developer declared ad content |
| Open Source | Source code URL provided |

## Featured Apps

Editorially curated. Must be from verified or audited developers. Selected for quality, utility, and category diversity.
```

- [ ] **Step 4: Create docs/enforcement.md**

```markdown
# Enforcement — How Policy is Applied

## Enforcement Ladder

Actions are applied in escalating order. Each action requires documented reason.

1. **Warning** — specific violation cited, developer notified, no app impact
2. **Delist release** — specific version removed from marketplace, app stays published with previous version
3. **Freeze updates** — app stays published but no new versions can be uploaded
4. **Suspend developer** — all apps frozen, no publishing activity allowed
5. **Appeal** — developer may appeal any action, human review within 5 business days

## Moderation Principles

- **Behavior, not viewpoint** — we evaluate what an app does, not what it says
- **Proportional response** — match the action to the severity
- **Documented reasons** — every moderation action logged with reason and moderator
- **Appeal rights** — every action is appealable
- **Transparency** — developers see exactly why an action was taken

## Emergency Actions

For critical malware findings, an emergency delist removes an app from all surfaces immediately. This bypasses the normal ladder and is logged as an emergency action. The developer is notified and may appeal.

## Audit Log

Every moderation action is recorded in an append-only audit log:
- Timestamp
- Moderator ID
- Action taken
- Target (app/release/developer)
- Reason
- Appeal status
```

- [ ] **Step 5: Commit**

```bash
cd /c/Users/lmao/openmarket
git add docs/
git commit -m "docs: add store constitution — mission, publishability, discoverability, enforcement"
```

---

## Task 13: CLAUDE.md and Project Config

**Files:**
- Create: `CLAUDE.md`
- Create: `.mcp.json`
- Create: `.claude/skills/scaffold-service/SKILL.md`
- Create: `.claude/agents/trust-and-safety-reviewer.md`
- Create: `.claude/hooks/post-edit-test.sh`

- [ ] **Step 1: Create CLAUDE.md**

```markdown
# OpenMarket — Claude Code Instructions

## Project Overview
OpenMarket is a viewpoint-neutral Android app marketplace. pnpm + Turborepo monorepo.

## Monorepo Structure
- `apps/` — Next.js web apps (market-web, dev-portal, admin)
- `services/api/` — Hono API server
- `services/*-worker/` — BullMQ async workers
- `packages/db/` — Drizzle ORM schema + migrations
- `packages/contracts/` — Zod schemas shared between packages
- `packages/ui/` — Shared React components

## Key Commands
- `pnpm dev` — start all services
- `pnpm test` — run all tests
- `pnpm typecheck` — typecheck all packages
- `pnpm db:push` — push schema to database
- `pnpm db:seed` — seed categories
- `pnpm db:studio` — open Drizzle Studio

## Development Rules
- All API changes start in `packages/contracts/` (Zod schema first)
- Database changes go in `packages/db/src/schema/` then run `pnpm db:generate`
- Write tests before implementation (TDD)
- Use Vitest for all tests
- Commit frequently with descriptive messages

## Database
- PostgreSQL 17 via Docker Compose or Neon
- Drizzle ORM — schema in `packages/db/src/schema/`
- Run `cd infrastructure/docker && docker compose up -d` for local DB

## API
- Hono framework at `services/api/`
- Better Auth for authentication
- Zod validation via `@hono/zod-validator`
- All routes require auth via `requireAuth` middleware (except public endpoints)

## File Conventions
- TypeScript everywhere (strict mode)
- ESM (`"type": "module"`)
- Barrel exports via `index.ts` files
- Tests in `__tests__/` directories next to source
```

- [ ] **Step 2: Create .mcp.json**

```json
{
  "mcpServers": {}
}
```

- [ ] **Step 3: Create .claude/skills/scaffold-service/SKILL.md**

```markdown
---
name: scaffold-service
description: Guide for adding a new service (worker or API module) to the OpenMarket monorepo
---

# Scaffold a New Service

## Steps

1. Create `services/<name>/package.json` with:
   - `@openmarket/db` and `@openmarket/contracts` as workspace dependencies
   - `tsx` for dev, `vitest` for tests
   - `dev`, `build`, `test`, `typecheck` scripts

2. Create `services/<name>/tsconfig.json` extending `../../tsconfig.base.json`

3. Create `services/<name>/src/index.ts` as entry point

4. For workers: add BullMQ dependency and create queue/worker setup:
   - Queue name: `openmarket:<service-name>`
   - Connection: `process.env.REDIS_URL`
   - Export processor function for testability

5. Add service to `infrastructure/docker/docker-compose.yml` if it needs its own container

6. Run `pnpm install` from root to link workspace dependencies
```

- [ ] **Step 4: Create .claude/agents/trust-and-safety-reviewer.md**

```markdown
---
name: trust-and-safety-reviewer
description: Reviews flagged apps and reports for policy violations. Checks scan data, report history, and recommends enforcement actions.
---

# Trust and Safety Reviewer

## Purpose
Review flagged content and reports against the OpenMarket content policy.

## Process
1. Read the report or scan finding
2. Cross-reference with `docs/publishability.md` for policy alignment
3. Check scan_results for risk score and findings
4. Check moderation_actions for prior enforcement on this developer
5. Recommend action per `docs/enforcement.md` enforcement ladder

## Outputs
- Recommended action (warn / delist / freeze / suspend)
- Specific policy violation cited
- Evidence summary
- Priority (critical / high / medium / low)
```

- [ ] **Step 5: Create .claude/hooks/post-edit-test.sh**

```bash
#!/bin/bash
# Run targeted tests for changed packages after file edits
CHANGED_FILE="$1"

if [[ "$CHANGED_FILE" == packages/db/* ]]; then
  cd packages/db && pnpm test
elif [[ "$CHANGED_FILE" == packages/contracts/* ]]; then
  cd packages/contracts && pnpm test
elif [[ "$CHANGED_FILE" == services/api/* ]]; then
  cd services/api && pnpm test
fi
```

- [ ] **Step 6: Commit**

```bash
cd /c/Users/lmao/openmarket
git add CLAUDE.md .mcp.json .claude/
git commit -m "chore: add CLAUDE.md, MCP config, Claude Code skills, agents, and hooks"
```

---

## Task 14: Create GitHub Repo and Push

**Files:** None — git operations only

- [ ] **Step 1: Create GitHub repo**

Run: `"/c/Program Files/GitHub CLI/gh.exe" repo create lawrencema000-gif/openmarket --public --source=/c/Users/lmao/openmarket --remote=origin --push`
Expected: repo created and code pushed

- [ ] **Step 2: Verify repo exists**

Run: `"/c/Program Files/GitHub CLI/gh.exe" repo view lawrencema000-gif/openmarket`
Expected: repo info displayed

- [ ] **Step 3: Verify all code pushed**

Run: `cd /c/Users/lmao/openmarket && git log --oneline`
Expected: all commits visible

---

## Task 15: Run Full Test Suite and Verify

**Files:** None — verification only

- [ ] **Step 1: Install all dependencies**

Run: `cd /c/Users/lmao/openmarket && pnpm install`
Expected: all workspace packages resolved

- [ ] **Step 2: Run typecheck across all packages**

Run: `cd /c/Users/lmao/openmarket && pnpm typecheck`
Expected: no type errors

- [ ] **Step 3: Run all tests**

Run: `cd /c/Users/lmao/openmarket && pnpm test`
Expected: all tests pass (schema tests, contract tests, health test, developer tests, signing key tests)

- [ ] **Step 4: Start Docker services and push schema**

Run: `cd /c/Users/lmao/openmarket/infrastructure/docker && docker compose up -d`
Run: `cd /c/Users/lmao/openmarket/packages/db && pnpm push`
Run: `cd /c/Users/lmao/openmarket/packages/db && pnpm seed`
Expected: schema pushed, 42 categories seeded

- [ ] **Step 5: Start API server and test health endpoint**

Run: `cd /c/Users/lmao/openmarket/services/api && pnpm dev &`
Wait 3 seconds, then:
Run: `curl http://localhost:3001/health`
Expected: `{"status":"ok","service":"openmarket-api","timestamp":"..."}`

- [ ] **Step 6: Stop dev server and commit any final fixes**

If all checks pass, Week 1 Foundation is complete.

---

*End of Week 1 plan. Week 2 (Upload, Ingest, Scan, Search, Listings) is a separate plan to be written after Week 1 ships.*
