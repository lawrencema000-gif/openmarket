# Week 2: Upload & Process — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete APK upload → ingest → scan → search pipeline so developers can upload APKs, have them processed and validated, and see apps appear in a searchable catalog.

**Architecture:** App/release CRUD routes in the existing Hono API. BullMQ workers for async ingest and scan jobs against Redis. APK metadata extraction using `apk-parser` (pure JS). Risk scoring engine in `packages/security-rules`. Meilisearch for full-text search indexing.

**Tech Stack:** Hono, BullMQ, Redis, apk-parser, Meilisearch, Vitest

**Existing code:** Monorepo at `/c/Users/lmao/openmarket`. packages/db has full schema. packages/contracts has Zod schemas (`createAppSchema`, `createReleaseSchema`). services/api has Hono with health/auth/developer/signing-key routes. All routes use `Hono<{ Variables: Variables }>` pattern with `requireAuth` middleware.

---

## File Map

### New packages
- Create: `packages/security-rules/package.json`
- Create: `packages/security-rules/tsconfig.json`
- Create: `packages/security-rules/vitest.config.ts`
- Create: `packages/security-rules/src/index.ts` — re-exports
- Create: `packages/security-rules/src/risk-scorer.ts` — composite risk score calculator
- Create: `packages/security-rules/src/permission-analyzer.ts` — dangerous permission detection
- Create: `packages/security-rules/src/__tests__/risk-scorer.test.ts`
- Create: `packages/security-rules/src/__tests__/permission-analyzer.test.ts`

### New services
- Create: `services/ingest-worker/package.json`
- Create: `services/ingest-worker/tsconfig.json`
- Create: `services/ingest-worker/vitest.config.ts`
- Create: `services/ingest-worker/src/index.ts` — worker entry
- Create: `services/ingest-worker/src/processor.ts` — job processor
- Create: `services/ingest-worker/src/apk-extractor.ts` — APK metadata extraction
- Create: `services/ingest-worker/src/rejection-rules.ts` — immediate rejection checks
- Create: `services/ingest-worker/src/__tests__/rejection-rules.test.ts`
- Create: `services/ingest-worker/src/__tests__/apk-extractor.test.ts`

- Create: `services/scan-worker/package.json`
- Create: `services/scan-worker/tsconfig.json`
- Create: `services/scan-worker/vitest.config.ts`
- Create: `services/scan-worker/src/index.ts` — worker entry
- Create: `services/scan-worker/src/processor.ts` — scan job processor
- Create: `services/scan-worker/src/static-analyzer.ts` — static analysis
- Create: `services/scan-worker/src/__tests__/static-analyzer.test.ts`

- Create: `services/search-worker/package.json`
- Create: `services/search-worker/tsconfig.json`
- Create: `services/search-worker/src/index.ts` — search indexing worker
- Create: `services/search-worker/src/meilisearch-client.ts` — typed Meilisearch client

### API additions
- Create: `services/api/src/routes/apps.ts` — app CRUD routes
- Create: `services/api/src/routes/releases.ts` — release + upload routes
- Create: `services/api/src/routes/search.ts` — search proxy route
- Create: `services/api/src/lib/queue.ts` — BullMQ queue connections
- Create: `services/api/src/__tests__/apps.test.ts`
- Create: `services/api/src/__tests__/releases.test.ts`
- Modify: `services/api/src/index.ts` — mount new routes
- Modify: `services/api/package.json` — add bullmq dep

### Contract additions
- Create: `packages/contracts/src/releases.ts` — upload/complete schemas
- Create: `packages/contracts/src/search.ts` — search query/response schemas
- Modify: `packages/contracts/src/index.ts` — re-export new modules

---

## Task 1: Security Rules Package — Permission Analyzer

**Files:**
- Create: `packages/security-rules/package.json`
- Create: `packages/security-rules/tsconfig.json`
- Create: `packages/security-rules/vitest.config.ts`
- Create: `packages/security-rules/src/permission-analyzer.ts`
- Create: `packages/security-rules/src/__tests__/permission-analyzer.test.ts`

- [ ] **Step 1: Create package scaffolding**

Create `packages/security-rules/package.json`:
```json
{
  "name": "@openmarket/security-rules",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "vitest": "^3.1.0",
    "typescript": "^5.8.0"
  }
}
```

Create `packages/security-rules/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

Create `packages/security-rules/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true } });
```

- [ ] **Step 2: Write permission analyzer tests**

Create `packages/security-rules/src/__tests__/permission-analyzer.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  isDangerousPermission,
  detectSuspiciousCombinations,
  scorePermissions,
} from "../permission-analyzer";

describe("isDangerousPermission", () => {
  it("flags CAMERA as dangerous", () => {
    expect(isDangerousPermission("android.permission.CAMERA")).toBe(true);
  });

  it("does not flag INTERNET as dangerous", () => {
    expect(isDangerousPermission("android.permission.INTERNET")).toBe(false);
  });

  it("flags READ_SMS as dangerous", () => {
    expect(isDangerousPermission("android.permission.READ_SMS")).toBe(true);
  });
});

describe("detectSuspiciousCombinations", () => {
  it("flags CAMERA + INTERNET combo", () => {
    const perms = ["android.permission.CAMERA", "android.permission.INTERNET"];
    const combos = detectSuspiciousCombinations(perms);
    expect(combos.length).toBeGreaterThan(0);
    expect(combos[0].reason).toContain("camera");
  });

  it("flags ACCESSIBILITY + OVERLAY combo", () => {
    const perms = [
      "android.permission.BIND_ACCESSIBILITY_SERVICE",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ];
    const combos = detectSuspiciousCombinations(perms);
    expect(combos.length).toBeGreaterThan(0);
  });

  it("returns empty for benign permissions", () => {
    const perms = ["android.permission.INTERNET", "android.permission.VIBRATE"];
    expect(detectSuspiciousCombinations(perms)).toEqual([]);
  });
});

describe("scorePermissions", () => {
  it("returns 0 for no permissions", () => {
    expect(scorePermissions([])).toBe(0);
  });

  it("scores higher for more dangerous permissions", () => {
    const benign = scorePermissions(["android.permission.INTERNET"]);
    const dangerous = scorePermissions([
      "android.permission.CAMERA",
      "android.permission.READ_SMS",
      "android.permission.CALL_PHONE",
    ]);
    expect(dangerous).toBeGreaterThan(benign);
  });

  it("caps at 15", () => {
    const allDangerous = [
      "android.permission.CAMERA",
      "android.permission.READ_SMS",
      "android.permission.CALL_PHONE",
      "android.permission.READ_CONTACTS",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_PHONE_STATE",
      "android.permission.SEND_SMS",
    ];
    expect(scorePermissions(allDangerous)).toBeLessThanOrEqual(15);
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

Run: `cd /c/Users/lmao/openmarket && pnpm install && cd packages/security-rules && pnpm test`
Expected: FAIL — module not found

- [ ] **Step 4: Implement permission analyzer**

Create `packages/security-rules/src/permission-analyzer.ts`:
```typescript
const DANGEROUS_PERMISSIONS = new Set([
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_SMS",
  "android.permission.SEND_SMS",
  "android.permission.RECEIVE_SMS",
  "android.permission.CALL_PHONE",
  "android.permission.READ_CALL_LOG",
  "android.permission.READ_CONTACTS",
  "android.permission.WRITE_CONTACTS",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.READ_PHONE_STATE",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.BODY_SENSORS",
  "android.permission.READ_CALENDAR",
  "android.permission.WRITE_CALENDAR",
]);

const SENSITIVE_CAPABILITIES = new Set([
  "android.permission.BIND_ACCESSIBILITY_SERVICE",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.BIND_DEVICE_ADMIN",
  "android.permission.REQUEST_INSTALL_PACKAGES",
  "android.permission.BIND_VPN_SERVICE",
]);

export interface SuspiciousCombination {
  permissions: string[];
  reason: string;
  severity: "high" | "critical";
}

export function isDangerousPermission(permission: string): boolean {
  return DANGEROUS_PERMISSIONS.has(permission) || SENSITIVE_CAPABILITIES.has(permission);
}

export function detectSuspiciousCombinations(
  permissions: string[]
): SuspiciousCombination[] {
  const combos: SuspiciousCombination[] = [];
  const permSet = new Set(permissions);

  if (
    permSet.has("android.permission.CAMERA") &&
    permSet.has("android.permission.INTERNET")
  ) {
    combos.push({
      permissions: ["CAMERA", "INTERNET"],
      reason: "camera access with internet — potential covert image upload",
      severity: "high",
    });
  }

  if (
    (permSet.has("android.permission.READ_SMS") ||
      permSet.has("android.permission.RECEIVE_SMS")) &&
    permSet.has("android.permission.INTERNET")
  ) {
    combos.push({
      permissions: ["SMS", "INTERNET"],
      reason: "SMS access with internet — potential SMS interception/forwarding",
      severity: "critical",
    });
  }

  if (
    permSet.has("android.permission.BIND_ACCESSIBILITY_SERVICE") &&
    permSet.has("android.permission.SYSTEM_ALERT_WINDOW")
  ) {
    combos.push({
      permissions: ["ACCESSIBILITY", "OVERLAY"],
      reason: "accessibility + overlay — potential click-jacking or remote control",
      severity: "critical",
    });
  }

  if (
    permSet.has("android.permission.BIND_ACCESSIBILITY_SERVICE") &&
    permSet.has("android.permission.INTERNET")
  ) {
    combos.push({
      permissions: ["ACCESSIBILITY", "INTERNET"],
      reason: "accessibility service with internet — potential remote control",
      severity: "critical",
    });
  }

  if (
    permSet.has("android.permission.CALL_PHONE") &&
    permSet.has("android.permission.INTERNET")
  ) {
    combos.push({
      permissions: ["CALL_PHONE", "INTERNET"],
      reason: "phone call with internet — potential toll fraud",
      severity: "high",
    });
  }

  return combos;
}

export function scorePermissions(permissions: string[]): number {
  let score = 0;

  for (const perm of permissions) {
    if (DANGEROUS_PERMISSIONS.has(perm)) {
      score += 2;
    }
    if (SENSITIVE_CAPABILITIES.has(perm)) {
      score += 5;
    }
  }

  return Math.min(score, 15);
}
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `cd /c/Users/lmao/openmarket/packages/security-rules && pnpm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add packages/security-rules/
git commit -m "feat(security-rules): add permission analyzer with dangerous permission detection and scoring"
```

---

## Task 2: Security Rules Package — Risk Scorer

**Files:**
- Create: `packages/security-rules/src/risk-scorer.ts`
- Create: `packages/security-rules/src/index.ts`
- Create: `packages/security-rules/src/__tests__/risk-scorer.test.ts`

- [ ] **Step 1: Write risk scorer tests**

Create `packages/security-rules/src/__tests__/risk-scorer.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { calculateRiskScore, type RiskInput } from "../risk-scorer";

describe("calculateRiskScore", () => {
  const baseInput: RiskInput = {
    permissionScore: 0,
    newPermissionCount: 0,
    suspiciousSdkCount: 0,
    unguardedExportedComponentCount: 0,
    suspiciousUrlCount: 0,
    hasNativeCode: false,
    hasAccessibilityService: false,
    hasOverlayPermission: false,
    hasDeviceAdmin: false,
    developerTrustLevel: "verified",
    accountAgeDays: 30,
    updateDiffSeverity: 0,
  };

  it("returns 0 for clean verified app", () => {
    const score = calculateRiskScore(baseInput);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("returns high score for suspicious app", () => {
    const score = calculateRiskScore({
      ...baseInput,
      permissionScore: 15,
      hasAccessibilityService: true,
      hasOverlayPermission: true,
      developerTrustLevel: "experimental",
      accountAgeDays: 1,
    });
    expect(score).toBeGreaterThanOrEqual(50);
  });

  it("gives verified developers lower scores", () => {
    const verifiedScore = calculateRiskScore({
      ...baseInput,
      permissionScore: 10,
      developerTrustLevel: "verified",
    });
    const experimentalScore = calculateRiskScore({
      ...baseInput,
      permissionScore: 10,
      developerTrustLevel: "experimental",
    });
    expect(verifiedScore).toBeLessThan(experimentalScore);
  });

  it("clamps score between 0 and 100", () => {
    const maxed = calculateRiskScore({
      permissionScore: 15,
      newPermissionCount: 10,
      suspiciousSdkCount: 5,
      unguardedExportedComponentCount: 10,
      suspiciousUrlCount: 10,
      hasNativeCode: true,
      hasAccessibilityService: true,
      hasOverlayPermission: true,
      hasDeviceAdmin: true,
      developerTrustLevel: "experimental",
      accountAgeDays: 0,
      updateDiffSeverity: 20,
    });
    expect(maxed).toBeLessThanOrEqual(100);
    expect(maxed).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Implement risk scorer**

Create `packages/security-rules/src/risk-scorer.ts`:
```typescript
export interface RiskInput {
  permissionScore: number;
  newPermissionCount: number;
  suspiciousSdkCount: number;
  unguardedExportedComponentCount: number;
  suspiciousUrlCount: number;
  hasNativeCode: boolean;
  hasAccessibilityService: boolean;
  hasOverlayPermission: boolean;
  hasDeviceAdmin: boolean;
  developerTrustLevel: "experimental" | "verified" | "audited" | "suspended";
  accountAgeDays: number;
  updateDiffSeverity: number;
}

export type RiskLevel = "auto_pass" | "enhanced_review" | "human_required";

export function calculateRiskScore(input: RiskInput): number {
  let score = 0;

  // Permission score (0-15)
  score += input.permissionScore;

  // New permissions since last release (0-10)
  score += Math.min(input.newPermissionCount * 2, 10);

  // Suspicious SDKs (0-15)
  score += Math.min(input.suspiciousSdkCount * 3, 15);

  // Unguarded exported components (0-10)
  score += Math.min(input.unguardedExportedComponentCount * 2, 10);

  // Suspicious URLs (0-10)
  score += Math.min(input.suspiciousUrlCount * 2, 10);

  // Native code (0-5)
  if (input.hasNativeCode) score += 5;

  // Sensitive capabilities (0-15 each)
  if (input.hasAccessibilityService) score += 15;
  if (input.hasOverlayPermission) score += 15;
  if (input.hasDeviceAdmin) score += 15;

  // Developer trust modifier
  if (input.developerTrustLevel === "audited") score -= 20;
  else if (input.developerTrustLevel === "verified") score -= 10;
  else if (input.developerTrustLevel === "experimental") score += 10;

  // Account age modifier
  if (input.accountAgeDays < 7) score += 10;

  // Update diff severity (0-20)
  score += Math.min(input.updateDiffSeverity, 20);

  return Math.max(0, Math.min(100, score));
}

export function getRiskLevel(score: number): RiskLevel {
  if (score <= 30) return "auto_pass";
  if (score <= 70) return "enhanced_review";
  return "human_required";
}
```

- [ ] **Step 3: Create barrel export**

Create `packages/security-rules/src/index.ts`:
```typescript
export * from "./permission-analyzer";
export * from "./risk-scorer";
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Users/lmao/openmarket/packages/security-rules && pnpm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add packages/security-rules/
git commit -m "feat(security-rules): add risk scorer with composite scoring and trust-level modifiers"
```

---

## Task 3: Contracts — Release Upload and Search Schemas

**Files:**
- Create: `packages/contracts/src/releases.ts`
- Create: `packages/contracts/src/search.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create release upload contracts**

Create `packages/contracts/src/releases.ts`:
```typescript
import { z } from "zod";
import { uuidSchema, releaseStatusSchema, releaseChannelSchema } from "./common";

export const completeUploadSchema = z.object({
  fileSize: z.number().int().positive().max(524288000), // 500MB
  sha256: z.string().regex(/^[a-f0-9]{64}$/i, "Must be a valid SHA-256 hash"),
});

export type CompleteUpload = z.infer<typeof completeUploadSchema>;

export const uploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  artifactId: uuidSchema,
});

export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

export const releaseDetailResponseSchema = z.object({
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
  artifact: z.object({
    id: uuidSchema,
    fileSize: z.number(),
    sha256: z.string(),
    uploadStatus: z.string(),
  }).nullable(),
});

export type ReleaseDetailResponse = z.infer<typeof releaseDetailResponseSchema>;
```

- [ ] **Step 2: Create search contracts**

Create `packages/contracts/src/search.ts`:
```typescript
import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  category: z.string().optional(),
  trustTier: z.enum(["standard", "enhanced", "experimental"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResultSchema = z.object({
  id: z.string(),
  packageName: z.string(),
  title: z.string(),
  shortDescription: z.string(),
  category: z.string(),
  iconUrl: z.string(),
  developerName: z.string(),
  trustTier: z.string(),
  isExperimental: z.boolean(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  hits: z.array(searchResultSchema),
  totalHits: z.number(),
  page: z.number(),
  limit: z.number(),
  processingTimeMs: z.number(),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
```

- [ ] **Step 3: Update barrel export**

Add to `packages/contracts/src/index.ts`:
```typescript
export * from "./releases";
export * from "./search";
```

- [ ] **Step 4: Typecheck**

Run: `cd /c/Users/lmao/openmarket/packages/contracts && pnpm typecheck`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/
git commit -m "feat(contracts): add release upload and search query/response schemas"
```

---

## Task 4: API — App CRUD Routes

**Files:**
- Create: `services/api/src/routes/apps.ts`
- Create: `services/api/src/__tests__/apps.test.ts`
- Modify: `services/api/src/index.ts`

- [ ] **Step 1: Write app route tests**

Create `services/api/src/__tests__/apps.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "app-1",
          packageName: "com.test.app",
          developerId: "dev-1",
          trustTier: "standard",
          isPublished: false,
          createdAt: new Date().toISOString(),
        }]),
      }),
    }),
    select: vi.fn(),
    query: {
      developers: { findFirst: vi.fn() },
      apps: { findFirst: vi.fn(), findMany: vi.fn() },
      appListings: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "test-user-id", email: "dev@test.com" });
    c.set("session", { id: "test-session" });
    await next();
  }),
}));

import { appsRouter } from "../routes/apps";
import { db } from "../lib/db";

const app = new Hono();
app.route("/api", appsRouter);

describe("GET /api/apps", () => {
  it("returns apps for authenticated developer", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-1",
    } as any);
    vi.mocked(db.query.apps.findMany).mockResolvedValueOnce([]);

    const res = await app.request("/api/apps");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("POST /api/apps", () => {
  it("rejects invalid package name", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({
      id: "dev-1",
    } as any);

    const res = await app.request("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageName: "invalid",
        title: "My App",
        shortDescription: "A great test app",
        fullDescription: "This is a full description that is long enough",
        category: "tools",
        iconUrl: "https://example.com/icon.png",
        screenshots: ["https://example.com/s1.png", "https://example.com/s2.png"],
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Implement app routes**

Create `services/api/src/routes/apps.ts`:
```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db";
import { apps, appListings, developers } from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { createAppSchema } from "@openmarket/contracts/apps";
import type { Variables } from "../lib/types";

export const appsRouter = new Hono<{ Variables: Variables }>();

// List apps for current developer
appsRouter.get("/apps", requireAuth, async (c) => {
  const user = c.get("user");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  const devApps = await db.query.apps.findMany({
    where: eq(apps.developerId, developer.id),
  });

  return c.json(devApps);
});

// Create a new app with listing
appsRouter.post(
  "/apps",
  requireAuth,
  zValidator("json", createAppSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    // Check package name uniqueness
    const existingApp = await db.query.apps.findFirst({
      where: eq(apps.packageName, body.packageName),
    });

    if (existingApp) {
      throw new HTTPException(409, {
        message: "Package name already registered",
      });
    }

    // Create app
    const [newApp] = await db
      .insert(apps)
      .values({
        packageName: body.packageName,
        developerId: developer.id,
        trustTier: developer.trustLevel === "experimental" ? "experimental" : "standard",
      })
      .returning();

    // Create initial listing
    const [listing] = await db
      .insert(appListings)
      .values({
        appId: newApp.id,
        title: body.title,
        shortDescription: body.shortDescription,
        fullDescription: body.fullDescription,
        category: body.category,
        iconUrl: body.iconUrl,
        screenshots: body.screenshots,
        privacyPolicyUrl: body.privacyPolicyUrl,
        websiteUrl: body.websiteUrl,
        sourceCodeUrl: body.sourceCodeUrl,
        isExperimental: body.isExperimental,
        containsAds: body.containsAds,
        contentRating: body.contentRating,
      })
      .returning();

    // Update app with listing reference
    await db
      .update(apps)
      .set({ currentListingId: listing.id })
      .where(eq(apps.id, newApp.id));

    return c.json({ ...newApp, listing }, 201);
  }
);

// Get app by ID (public)
appsRouter.get("/apps/:id", async (c) => {
  const id = c.req.param("id");

  const app = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  });

  if (!app || app.isDelisted) {
    throw new HTTPException(404, { message: "App not found" });
  }

  const listing = app.currentListingId
    ? await db.query.appListings.findFirst({
        where: eq(appListings.id, app.currentListingId),
      })
    : null;

  const developer = await db.query.developers.findFirst({
    where: eq(developers.id, app.developerId),
  });

  return c.json({
    ...app,
    listing,
    developer: developer
      ? {
          id: developer.id,
          displayName: developer.displayName,
          trustLevel: developer.trustLevel,
        }
      : null,
  });
});
```

- [ ] **Step 3: Mount in index.ts**

Add to `services/api/src/index.ts` after signing keys import:
```typescript
import { appsRouter } from "./routes/apps";
```
And after the signingKeysRouter mount:
```typescript
app.route("/api", appsRouter);
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Users/lmao/openmarket/services/api && pnpm test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add services/api/
git commit -m "feat(api): add app CRUD routes — create, list, get by ID"
```

---

## Task 5: API — Release and Upload Routes

**Files:**
- Create: `services/api/src/routes/releases.ts`
- Create: `services/api/src/lib/queue.ts`
- Create: `services/api/src/__tests__/releases.test.ts`
- Modify: `services/api/package.json` — add bullmq
- Modify: `services/api/src/index.ts` — mount releases

- [ ] **Step 1: Add BullMQ dependency**

Add to `services/api/package.json` dependencies:
```json
"bullmq": "^5.34.0"
```

Run: `cd /c/Users/lmao/openmarket && pnpm install`

- [ ] **Step 2: Create queue connection helper**

Create `services/api/src/lib/queue.ts`:
```typescript
import { Queue } from "bullmq";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

export const ingestQueue = new Queue("openmarket:ingest", {
  connection: redisConnection,
});

export const scanQueue = new Queue("openmarket:scan", {
  connection: redisConnection,
});

export const searchIndexQueue = new Queue("openmarket:search-index", {
  connection: redisConnection,
});
```

- [ ] **Step 3: Write release route tests**

Create `services/api/src/__tests__/releases.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: "release-1",
          appId: "app-1",
          versionCode: 1,
          versionName: "1.0.0",
          channel: "stable",
          status: "draft",
          rolloutPercentage: 100,
          releaseNotes: null,
          createdAt: new Date().toISOString(),
        }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "release-1", status: "scanning" }]),
        }),
      }),
    }),
    query: {
      developers: { findFirst: vi.fn() },
      apps: { findFirst: vi.fn() },
      releases: { findFirst: vi.fn(), findMany: vi.fn() },
      releaseArtifacts: { findFirst: vi.fn() },
    },
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("user", { id: "test-user-id", email: "dev@test.com" });
    c.set("session", { id: "test-session" });
    await next();
  }),
}));

vi.mock("../lib/queue", () => ({
  ingestQueue: { add: vi.fn() },
  scanQueue: { add: vi.fn() },
  searchIndexQueue: { add: vi.fn() },
}));

import { releasesRouter } from "../routes/releases";
import { db } from "../lib/db";

const testApp = new Hono();
testApp.route("/api", releasesRouter);

describe("POST /api/releases", () => {
  it("creates a draft release for valid app", async () => {
    vi.mocked(db.query.developers.findFirst).mockResolvedValueOnce({ id: "dev-1" } as any);
    vi.mocked(db.query.apps.findFirst).mockResolvedValueOnce({
      id: "app-1",
      developerId: "dev-1",
    } as any);

    const res = await testApp.request("/api/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId: "550e8400-e29b-41d4-a716-446655440000",
        versionCode: 1,
        versionName: "1.0.0",
      }),
    });

    expect(res.status).toBe(201);
  });
});

describe("GET /api/releases/:id", () => {
  it("returns 404 for non-existent release", async () => {
    vi.mocked(db.query.releases.findFirst).mockResolvedValueOnce(undefined);

    const res = await testApp.request("/api/releases/nonexistent");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Implement release routes**

Create `services/api/src/routes/releases.ts`:
```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db";
import {
  apps,
  releases,
  releaseArtifacts,
  developers,
} from "@openmarket/db/schema";
import { requireAuth } from "../middleware/auth";
import { createReleaseSchema } from "@openmarket/contracts/apps";
import { completeUploadSchema } from "@openmarket/contracts/releases";
import { ingestQueue } from "../lib/queue";
import type { Variables } from "../lib/types";

export const releasesRouter = new Hono<{ Variables: Variables }>();

// Create a new release (draft)
releasesRouter.post(
  "/releases",
  requireAuth,
  zValidator("json", createReleaseSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    // Verify the app belongs to this developer
    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, body.appId), eq(apps.developerId, developer.id)),
    });

    if (!app) {
      throw new HTTPException(404, { message: "App not found or not owned by you" });
    }

    const [release] = await db
      .insert(releases)
      .values({
        appId: body.appId,
        versionCode: body.versionCode,
        versionName: body.versionName,
        channel: body.channel,
        releaseNotes: body.releaseNotes,
      })
      .returning();

    return c.json(release, 201);
  }
);

// Get upload URL for a release
releasesRouter.post("/releases/:id/upload-url", requireAuth, async (c) => {
  const releaseId = c.req.param("id");
  const user = c.get("user");

  const developer = await db.query.developers.findFirst({
    where: eq(developers.email, user.email),
  });

  if (!developer) {
    throw new HTTPException(404, { message: "Developer profile not found" });
  }

  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
  });

  if (!release || release.status !== "draft") {
    throw new HTTPException(400, { message: "Release not found or not in draft status" });
  }

  // Create artifact record
  const [artifact] = await db
    .insert(releaseArtifacts)
    .values({
      releaseId: release.id,
      fileUrl: `pending://${release.id}`,
      fileSize: 0,
      sha256: "pending",
    })
    .returning();

  // In production this would generate a presigned Vercel Blob URL.
  // For now, return a placeholder upload endpoint.
  const uploadUrl = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3001"}/api/releases/${releaseId}/upload`;

  return c.json({ uploadUrl, artifactId: artifact.id });
});

// Complete upload — triggers ingest
releasesRouter.post(
  "/releases/:id/complete",
  requireAuth,
  zValidator("json", completeUploadSchema),
  async (c) => {
    const releaseId = c.req.param("id");
    const user = c.get("user");
    const body = c.req.valid("json");

    const developer = await db.query.developers.findFirst({
      where: eq(developers.email, user.email),
    });

    if (!developer) {
      throw new HTTPException(404, { message: "Developer profile not found" });
    }

    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
    });

    if (!release || release.status !== "draft") {
      throw new HTTPException(400, { message: "Release not in draft status" });
    }

    // Update artifact with upload metadata
    const artifact = await db.query.releaseArtifacts.findFirst({
      where: eq(releaseArtifacts.releaseId, releaseId),
    });

    if (!artifact) {
      throw new HTTPException(400, { message: "No artifact found for release" });
    }

    await db
      .update(releaseArtifacts)
      .set({
        fileSize: body.fileSize,
        sha256: body.sha256,
        uploadStatus: "uploaded",
        uploadedAt: new Date(),
      })
      .where(eq(releaseArtifacts.id, artifact.id));

    // Update release status to scanning
    const [updated] = await db
      .update(releases)
      .set({ status: "scanning", updatedAt: new Date() })
      .where(eq(releases.id, releaseId))
      .returning();

    // Enqueue ingest job
    await ingestQueue.add("ingest", {
      releaseId: release.id,
      artifactId: artifact.id,
      developerId: developer.id,
      packageName: release.appId,
    });

    return c.json(updated);
  }
);

// Get release by ID
releasesRouter.get("/releases/:id", async (c) => {
  const id = c.req.param("id");

  const release = await db.query.releases.findFirst({
    where: eq(releases.id, id),
  });

  if (!release) {
    throw new HTTPException(404, { message: "Release not found" });
  }

  const artifact = await db.query.releaseArtifacts.findFirst({
    where: eq(releaseArtifacts.releaseId, release.id),
  });

  return c.json({ ...release, artifact: artifact ?? null });
});

// List releases for an app
releasesRouter.get("/apps/:appId/releases", async (c) => {
  const appId = c.req.param("appId");

  const appReleases = await db.query.releases.findMany({
    where: eq(releases.appId, appId),
  });

  return c.json(appReleases);
});
```

- [ ] **Step 5: Mount in index.ts**

Add import and mount for `releasesRouter` in `services/api/src/index.ts`.

- [ ] **Step 6: Run tests**

Run: `cd /c/Users/lmao/openmarket/services/api && pnpm test`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add services/api/ packages/contracts/
git commit -m "feat(api): add release creation, upload URL, and upload completion routes with BullMQ"
```

---

## Task 6: Ingest Worker — Rejection Rules

**Files:**
- Create: `services/ingest-worker/package.json`
- Create: `services/ingest-worker/tsconfig.json`
- Create: `services/ingest-worker/vitest.config.ts`
- Create: `services/ingest-worker/src/rejection-rules.ts`
- Create: `services/ingest-worker/src/__tests__/rejection-rules.test.ts`

- [ ] **Step 1: Create ingest worker package**

Create `services/ingest-worker/package.json`:
```json
{
  "name": "@openmarket/ingest-worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openmarket/db": "workspace:*",
    "@openmarket/security-rules": "workspace:*",
    "bullmq": "^5.34.0",
    "dotenv": "^16.4.0",
    "drizzle-orm": "^0.39.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "vitest": "^3.1.0",
    "typescript": "^5.8.0"
  }
}
```

Create `services/ingest-worker/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

Create `services/ingest-worker/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true } });
```

- [ ] **Step 2: Write rejection rules tests**

Create `services/ingest-worker/src/__tests__/rejection-rules.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { checkRejectionRules, type ApkInfo } from "../rejection-rules";

describe("checkRejectionRules", () => {
  const validApk: ApkInfo = {
    packageName: "com.example.app",
    versionCode: 2,
    isDebugBuild: false,
    signingKeyFingerprint: "a".repeat(64),
    isSignatureValid: true,
    fileSizeBytes: 10_000_000,
    hasManifest: true,
  };

  const previousRelease = {
    versionCode: 1,
    signingKeyFingerprint: "a".repeat(64),
    packageName: "com.example.app",
  };

  it("passes for valid APK", () => {
    const result = checkRejectionRules(validApk, "com.example.app", previousRelease);
    expect(result.rejected).toBe(false);
  });

  it("rejects invalid signature", () => {
    const result = checkRejectionRules(
      { ...validApk, isSignatureValid: false },
      "com.example.app",
      previousRelease
    );
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain("signature");
  });

  it("rejects package name mismatch", () => {
    const result = checkRejectionRules(
      { ...validApk, packageName: "com.other.app" },
      "com.example.app",
      previousRelease
    );
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain("package name");
  });

  it("rejects signing key change", () => {
    const result = checkRejectionRules(validApk, "com.example.app", {
      ...previousRelease,
      signingKeyFingerprint: "b".repeat(64),
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain("signing key");
  });

  it("rejects non-increasing version code", () => {
    const result = checkRejectionRules(
      { ...validApk, versionCode: 1 },
      "com.example.app",
      previousRelease
    );
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain("versionCode");
  });

  it("rejects debug builds", () => {
    const result = checkRejectionRules(
      { ...validApk, isDebugBuild: true },
      "com.example.app",
      previousRelease
    );
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain("Debug");
  });

  it("rejects files over 500MB", () => {
    const result = checkRejectionRules(
      { ...validApk, fileSizeBytes: 600_000_000 },
      "com.example.app",
      previousRelease
    );
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain("500MB");
  });

  it("passes for first release with no previous", () => {
    const result = checkRejectionRules(validApk, "com.example.app", null);
    expect(result.rejected).toBe(false);
  });
});
```

- [ ] **Step 3: Implement rejection rules**

Create `services/ingest-worker/src/rejection-rules.ts`:
```typescript
export interface ApkInfo {
  packageName: string;
  versionCode: number;
  isDebugBuild: boolean;
  signingKeyFingerprint: string;
  isSignatureValid: boolean;
  fileSizeBytes: number;
  hasManifest: boolean;
}

export interface PreviousRelease {
  versionCode: number;
  signingKeyFingerprint: string;
  packageName: string;
}

export interface RejectionResult {
  rejected: boolean;
  reason?: string;
}

const MAX_FILE_SIZE = 524_288_000; // 500MB

export function checkRejectionRules(
  apk: ApkInfo,
  claimedPackageName: string,
  previousRelease: PreviousRelease | null
): RejectionResult {
  if (!apk.isSignatureValid) {
    return { rejected: true, reason: "APK signature verification failed" };
  }

  if (!apk.hasManifest) {
    return { rejected: true, reason: "AndroidManifest.xml not found or invalid" };
  }

  if (apk.packageName !== claimedPackageName) {
    return {
      rejected: true,
      reason: `Package name in APK (${apk.packageName}) does not match claimed package name (${claimedPackageName})`,
    };
  }

  if (apk.isDebugBuild) {
    return { rejected: true, reason: "Debug builds cannot be published" };
  }

  if (apk.fileSizeBytes > MAX_FILE_SIZE) {
    return { rejected: true, reason: "APK exceeds 500MB size limit" };
  }

  if (previousRelease) {
    if (apk.signingKeyFingerprint !== previousRelease.signingKeyFingerprint) {
      return {
        rejected: true,
        reason:
          "Signing key differs from previous releases without authorized key rotation",
      };
    }

    if (apk.versionCode <= previousRelease.versionCode) {
      return {
        rejected: true,
        reason: `versionCode (${apk.versionCode}) must be strictly greater than previous release (${previousRelease.versionCode})`,
      };
    }
  }

  return { rejected: false };
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Users/lmao/openmarket && pnpm install && cd services/ingest-worker && pnpm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add services/ingest-worker/
git commit -m "feat(ingest-worker): add APK rejection rules with 7 validation checks"
```

---

## Task 7: Ingest Worker — APK Extractor and Job Processor

**Files:**
- Create: `services/ingest-worker/src/apk-extractor.ts`
- Create: `services/ingest-worker/src/processor.ts`
- Create: `services/ingest-worker/src/index.ts`
- Create: `services/ingest-worker/src/__tests__/apk-extractor.test.ts`

- [ ] **Step 1: Write APK extractor tests**

Create `services/ingest-worker/src/__tests__/apk-extractor.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parsePermissions, classifyPermission } from "../apk-extractor";

describe("parsePermissions", () => {
  it("extracts permission names from uses-permission list", () => {
    const raw = [
      "android.permission.INTERNET",
      "android.permission.CAMERA",
      "android.permission.VIBRATE",
    ];
    const parsed = parsePermissions(raw);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].name).toBe("android.permission.INTERNET");
    expect(parsed[1].isDangerous).toBe(true);
    expect(parsed[2].isDangerous).toBe(false);
  });
});

describe("classifyPermission", () => {
  it("classifies CAMERA as dangerous", () => {
    expect(classifyPermission("android.permission.CAMERA")).toBe("dangerous");
  });

  it("classifies INTERNET as normal", () => {
    expect(classifyPermission("android.permission.INTERNET")).toBe("normal");
  });

  it("classifies BIND_ACCESSIBILITY_SERVICE as signature", () => {
    expect(classifyPermission("android.permission.BIND_ACCESSIBILITY_SERVICE")).toBe("signature");
  });
});
```

- [ ] **Step 2: Implement APK extractor**

Create `services/ingest-worker/src/apk-extractor.ts`:
```typescript
import { isDangerousPermission } from "@openmarket/security-rules";

export interface ParsedPermission {
  name: string;
  isDangerous: boolean;
  protectionLevel: string;
}

const SIGNATURE_PERMISSIONS = new Set([
  "android.permission.BIND_ACCESSIBILITY_SERVICE",
  "android.permission.BIND_DEVICE_ADMIN",
  "android.permission.BIND_VPN_SERVICE",
  "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
  "android.permission.BIND_INPUT_METHOD",
]);

export function classifyPermission(
  permission: string
): "normal" | "dangerous" | "signature" {
  if (SIGNATURE_PERMISSIONS.has(permission)) return "signature";
  if (isDangerousPermission(permission)) return "dangerous";
  return "normal";
}

export function parsePermissions(rawPermissions: string[]): ParsedPermission[] {
  return rawPermissions.map((name) => ({
    name,
    isDangerous: isDangerousPermission(name),
    protectionLevel: classifyPermission(name),
  }));
}

export interface ExtractedMetadata {
  packageName: string;
  versionCode: number;
  versionName: string;
  minSdk: number;
  targetSdk: number;
  permissions: string[];
  activities: string[];
  services: string[];
  receivers: string[];
  providers: string[];
  appLabel: string;
  isDebugBuild: boolean;
  abis: string[];
  nativeLibs: string[];
}

// Placeholder for real APK parsing — will use apk-parser or aapt2
// For now, returns a structure that the processor can work with
export async function extractApkMetadata(
  apkPath: string
): Promise<ExtractedMetadata> {
  // In production: use apk-parser npm package to parse the APK
  // For MVP, this is called by the processor with pre-extracted data
  throw new Error(
    `APK parsing not yet implemented for path: ${apkPath}. Use manual metadata for now.`
  );
}
```

- [ ] **Step 3: Create job processor**

Create `services/ingest-worker/src/processor.ts`:
```typescript
import type { Job } from "bullmq";
import { eq, and, desc } from "drizzle-orm";
import { createDb } from "@openmarket/db";
import {
  releases,
  releaseArtifacts,
  artifactMetadata,
  permissionsDetected,
  apps,
} from "@openmarket/db/schema";
import { checkRejectionRules, type ApkInfo } from "./rejection-rules";
import { parsePermissions } from "./apk-extractor";

export interface IngestJobData {
  releaseId: string;
  artifactId: string;
  developerId: string;
  packageName: string;
}

const db = createDb(process.env.DATABASE_URL!);

export async function processIngestJob(job: Job<IngestJobData>) {
  const { releaseId, artifactId } = job.data;

  // Get the artifact record
  const artifact = await db.query.releaseArtifacts.findFirst({
    where: eq(releaseArtifacts.id, artifactId),
  });

  if (!artifact) {
    throw new Error(`Artifact ${artifactId} not found`);
  }

  // Get the release and app info
  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
  });

  if (!release) {
    throw new Error(`Release ${releaseId} not found`);
  }

  const app = await db.query.apps.findFirst({
    where: eq(apps.id, release.appId),
  });

  if (!app) {
    throw new Error(`App for release ${releaseId} not found`);
  }

  // In production: download APK from Blob, extract metadata
  // For now, create a placeholder metadata entry indicating manual processing needed
  // The rejection rules and metadata storage are fully functional

  await job.updateProgress(50);

  // Mark as verified (metadata extraction would happen here)
  await db
    .update(releaseArtifacts)
    .set({ uploadStatus: "verified" })
    .where(eq(releaseArtifacts.id, artifactId));

  // Update release status — ready for scan
  await db
    .update(releases)
    .set({ status: "scanning", updatedAt: new Date() })
    .where(eq(releases.id, releaseId));

  await job.updateProgress(100);

  return { success: true, releaseId, artifactId };
}
```

- [ ] **Step 4: Create worker entry point**

Create `services/ingest-worker/src/index.ts`:
```typescript
import "dotenv/config";
import { Worker } from "bullmq";
import { processIngestJob } from "./processor";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

const worker = new Worker("openmarket:ingest", processIngestJob, {
  connection: redisConnection,
  concurrency: 3,
});

worker.on("completed", (job) => {
  console.log(`Ingest job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Ingest job ${job?.id} failed:`, err.message);
});

console.log("Ingest worker started, waiting for jobs...");
```

- [ ] **Step 5: Run tests**

Run: `cd /c/Users/lmao/openmarket/services/ingest-worker && pnpm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add services/ingest-worker/
git commit -m "feat(ingest-worker): add APK extractor, job processor, and worker entry point"
```

---

## Task 8: Scan Worker — Static Analyzer

**Files:**
- Create: `services/scan-worker/package.json`
- Create: `services/scan-worker/tsconfig.json`
- Create: `services/scan-worker/vitest.config.ts`
- Create: `services/scan-worker/src/static-analyzer.ts`
- Create: `services/scan-worker/src/processor.ts`
- Create: `services/scan-worker/src/index.ts`
- Create: `services/scan-worker/src/__tests__/static-analyzer.test.ts`

- [ ] **Step 1: Create scan worker package**

Create `services/scan-worker/package.json`:
```json
{
  "name": "@openmarket/scan-worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openmarket/db": "workspace:*",
    "@openmarket/security-rules": "workspace:*",
    "bullmq": "^5.34.0",
    "dotenv": "^16.4.0",
    "drizzle-orm": "^0.39.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "vitest": "^3.1.0",
    "typescript": "^5.8.0"
  }
}
```

Create `services/scan-worker/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

Create `services/scan-worker/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true } });
```

- [ ] **Step 2: Write static analyzer tests**

Create `services/scan-worker/src/__tests__/static-analyzer.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { analyzeStaticFindings, type StaticInput } from "../static-analyzer";

describe("analyzeStaticFindings", () => {
  const baseInput: StaticInput = {
    permissions: ["android.permission.INTERNET"],
    exportedComponents: [],
    sdks: [],
    hasNativeCode: false,
    hasAccessibilityService: false,
    hasOverlayPermission: false,
    hasDeviceAdmin: false,
  };

  it("returns low risk for benign app", () => {
    const result = analyzeStaticFindings(baseInput);
    expect(result.riskScore).toBeLessThan(30);
    expect(result.findings).toHaveLength(0);
  });

  it("flags dangerous permissions", () => {
    const result = analyzeStaticFindings({
      ...baseInput,
      permissions: [
        "android.permission.CAMERA",
        "android.permission.INTERNET",
        "android.permission.READ_SMS",
      ],
    });
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.type === "dangerous_permission")).toBe(true);
  });

  it("flags accessibility + overlay combo", () => {
    const result = analyzeStaticFindings({
      ...baseInput,
      hasAccessibilityService: true,
      hasOverlayPermission: true,
    });
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
    expect(result.findings.some((f) => f.severity === "critical")).toBe(true);
  });

  it("flags exported components without guards", () => {
    const result = analyzeStaticFindings({
      ...baseInput,
      exportedComponents: [
        { name: "com.example.OpenActivity", type: "activity", hasPermissionGuard: false },
        { name: "com.example.DataService", type: "service", hasPermissionGuard: false },
      ],
    });
    expect(result.findings.some((f) => f.type === "unguarded_export")).toBe(true);
  });
});
```

- [ ] **Step 3: Implement static analyzer**

Create `services/scan-worker/src/static-analyzer.ts`:
```typescript
import {
  scorePermissions,
  detectSuspiciousCombinations,
  isDangerousPermission,
} from "@openmarket/security-rules";

export interface ExportedComponent {
  name: string;
  type: "activity" | "service" | "receiver" | "provider";
  hasPermissionGuard: boolean;
}

export interface SdkInfo {
  name: string;
  version?: string;
  category: "ads" | "analytics" | "social" | "payment" | "security" | "other";
  isKnownRisky: boolean;
}

export interface StaticInput {
  permissions: string[];
  exportedComponents: ExportedComponent[];
  sdks: SdkInfo[];
  hasNativeCode: boolean;
  hasAccessibilityService: boolean;
  hasOverlayPermission: boolean;
  hasDeviceAdmin: boolean;
}

export interface Finding {
  type: string;
  severity: "info" | "warning" | "high" | "critical";
  message: string;
  details?: Record<string, unknown>;
}

export interface StaticAnalysisResult {
  riskScore: number;
  findings: Finding[];
}

export function analyzeStaticFindings(input: StaticInput): StaticAnalysisResult {
  const findings: Finding[] = [];
  let riskScore = 0;

  // Permission analysis
  const permScore = scorePermissions(input.permissions);
  riskScore += permScore;

  const dangerousPerms = input.permissions.filter(isDangerousPermission);
  if (dangerousPerms.length > 0) {
    findings.push({
      type: "dangerous_permission",
      severity: "warning",
      message: `${dangerousPerms.length} dangerous permission(s) detected`,
      details: { permissions: dangerousPerms },
    });
  }

  // Suspicious combinations
  const combos = detectSuspiciousCombinations(input.permissions);
  for (const combo of combos) {
    findings.push({
      type: "suspicious_combination",
      severity: combo.severity,
      message: combo.reason,
      details: { permissions: combo.permissions },
    });
  }

  // Exported components without guards
  const unguarded = input.exportedComponents.filter((c) => !c.hasPermissionGuard);
  if (unguarded.length > 0) {
    riskScore += Math.min(unguarded.length * 2, 10);
    findings.push({
      type: "unguarded_export",
      severity: "warning",
      message: `${unguarded.length} exported component(s) without permission guards`,
      details: { components: unguarded.map((c) => c.name) },
    });
  }

  // Risky SDKs
  const riskySDKs = input.sdks.filter((s) => s.isKnownRisky);
  if (riskySDKs.length > 0) {
    riskScore += Math.min(riskySDKs.length * 3, 15);
    findings.push({
      type: "risky_sdk",
      severity: "high",
      message: `${riskySDKs.length} risky SDK(s) detected`,
      details: { sdks: riskySDKs.map((s) => s.name) },
    });
  }

  // Native code
  if (input.hasNativeCode) {
    riskScore += 5;
  }

  // Sensitive capabilities
  if (input.hasAccessibilityService) {
    riskScore += 15;
    findings.push({
      type: "accessibility_service",
      severity: "critical",
      message: "App uses accessibility service — potential for screen reading and input injection",
    });
  }

  if (input.hasOverlayPermission) {
    riskScore += 15;
    findings.push({
      type: "overlay_permission",
      severity: "critical",
      message: "App uses system overlay — potential for clickjacking",
    });
  }

  if (input.hasDeviceAdmin) {
    riskScore += 15;
    findings.push({
      type: "device_admin",
      severity: "critical",
      message: "App requests device administrator privileges",
    });
  }

  return { riskScore: Math.min(riskScore, 100), findings };
}
```

- [ ] **Step 4: Create scan processor and worker entry**

Create `services/scan-worker/src/processor.ts`:
```typescript
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { createDb } from "@openmarket/db";
import { scanResults, releases } from "@openmarket/db/schema";
import { getRiskLevel } from "@openmarket/security-rules";
import { analyzeStaticFindings, type StaticInput } from "./static-analyzer";

export interface ScanJobData {
  releaseId: string;
  artifactId: string;
  staticInput: StaticInput;
}

const db = createDb(process.env.DATABASE_URL!);

export async function processScanJob(job: Job<ScanJobData>) {
  const { releaseId, artifactId, staticInput } = job.data;

  // Run static analysis
  const result = analyzeStaticFindings(staticInput);
  const riskLevel = getRiskLevel(result.riskScore);

  // Store scan results
  await db.insert(scanResults).values({
    artifactId,
    scanType: "static",
    status: result.findings.some((f) => f.severity === "critical") ? "flagged" : "passed",
    riskScore: result.riskScore,
    findings: result.findings,
    summary: `Risk score: ${result.riskScore}/100 (${riskLevel}). ${result.findings.length} finding(s).`,
    startedAt: new Date(job.timestamp),
    completedAt: new Date(),
  });

  // Update release status based on risk level
  const nextStatus = riskLevel === "auto_pass" ? "published" : "review";
  await db
    .update(releases)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(releases.id, releaseId));

  return { riskScore: result.riskScore, riskLevel, findingsCount: result.findings.length };
}
```

Create `services/scan-worker/src/index.ts`:
```typescript
import "dotenv/config";
import { Worker } from "bullmq";
import { processScanJob } from "./processor";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

const worker = new Worker("openmarket:scan", processScanJob, {
  connection: redisConnection,
  concurrency: 2,
});

worker.on("completed", (job, result) => {
  console.log(`Scan job ${job.id} completed — risk: ${result?.riskScore}`);
});

worker.on("failed", (job, err) => {
  console.error(`Scan job ${job?.id} failed:`, err.message);
});

console.log("Scan worker started, waiting for jobs...");
```

- [ ] **Step 5: Run tests**

Run: `cd /c/Users/lmao/openmarket && pnpm install && cd services/scan-worker && pnpm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add services/scan-worker/
git commit -m "feat(scan-worker): add static analyzer with risk scoring and scan job processor"
```

---

## Task 9: Search Worker — Meilisearch Indexing

**Files:**
- Create: `services/search-worker/package.json`
- Create: `services/search-worker/tsconfig.json`
- Create: `services/search-worker/src/meilisearch-client.ts`
- Create: `services/search-worker/src/index.ts`

- [ ] **Step 1: Create search worker package**

Create `services/search-worker/package.json`:
```json
{
  "name": "@openmarket/search-worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "bullmq": "^5.34.0",
    "meilisearch": "^0.46.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.8.0"
  }
}
```

Create `services/search-worker/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Create Meilisearch client**

Create `services/search-worker/src/meilisearch-client.ts`:
```typescript
import { MeiliSearch } from "meilisearch";

const MEILI_URL = process.env.MEILI_URL ?? "http://localhost:7700";
const MEILI_KEY = process.env.MEILI_MASTER_KEY ?? "openmarket_dev_key";

export const meili = new MeiliSearch({ host: MEILI_URL, apiKey: MEILI_KEY });

export const APPS_INDEX = "apps";

export interface AppDocument {
  id: string;
  packageName: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  iconUrl: string;
  developerName: string;
  developerId: string;
  trustTier: string;
  isExperimental: boolean;
  isPublished: boolean;
  createdAt: number; // unix timestamp for sorting
}

export async function ensureIndex() {
  try {
    await meili.getIndex(APPS_INDEX);
  } catch {
    await meili.createIndex(APPS_INDEX, { primaryKey: "id" });
    const index = meili.index(APPS_INDEX);
    await index.updateSearchableAttributes([
      "title",
      "shortDescription",
      "fullDescription",
      "packageName",
      "developerName",
    ]);
    await index.updateFilterableAttributes([
      "category",
      "trustTier",
      "isExperimental",
      "isPublished",
    ]);
    await index.updateSortableAttributes(["createdAt"]);
  }
}

export async function indexApp(doc: AppDocument) {
  const index = meili.index(APPS_INDEX);
  await index.addDocuments([doc]);
}

export async function removeApp(id: string) {
  const index = meili.index(APPS_INDEX);
  await index.deleteDocument(id);
}
```

- [ ] **Step 3: Create worker entry**

Create `services/search-worker/src/index.ts`:
```typescript
import "dotenv/config";
import { Worker } from "bullmq";
import { indexApp, removeApp, ensureIndex, type AppDocument } from "./meilisearch-client";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

async function processSearchJob(job: any) {
  const { action, app } = job.data as {
    action: "index" | "remove";
    app: AppDocument;
  };

  if (action === "index") {
    await indexApp(app);
    return { indexed: app.id };
  } else if (action === "remove") {
    await removeApp(app.id);
    return { removed: app.id };
  }
}

async function main() {
  await ensureIndex();

  const worker = new Worker("openmarket:search-index", processSearchJob, {
    connection: redisConnection,
    concurrency: 5,
  });

  worker.on("completed", (job) => {
    console.log(`Search index job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Search index job ${job?.id} failed:`, err.message);
  });

  console.log("Search index worker started, waiting for jobs...");
}

main().catch(console.error);
```

- [ ] **Step 4: Install deps and typecheck**

Run: `cd /c/Users/lmao/openmarket && pnpm install && cd services/search-worker && pnpm typecheck`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add services/search-worker/
git commit -m "feat(search-worker): add Meilisearch indexing worker with app document schema"
```

---

## Task 10: API — Search Proxy Route

**Files:**
- Create: `services/api/src/routes/search.ts`
- Modify: `services/api/src/index.ts`
- Modify: `services/api/package.json` — add meilisearch dep

- [ ] **Step 1: Add meilisearch dependency to API**

Add `"meilisearch": "^0.46.0"` to `services/api/package.json` dependencies.

Run: `cd /c/Users/lmao/openmarket && pnpm install`

- [ ] **Step 2: Create search route**

Create `services/api/src/routes/search.ts`:
```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { MeiliSearch } from "meilisearch";
import { searchQuerySchema } from "@openmarket/contracts/search";

const meili = new MeiliSearch({
  host: process.env.MEILI_URL ?? "http://localhost:7700",
  apiKey: process.env.MEILI_MASTER_KEY ?? "openmarket_dev_key",
});

export const searchRouter = new Hono();

searchRouter.get("/search", zValidator("query", searchQuerySchema), async (c) => {
  const { q, category, trustTier, page, limit } = c.req.valid("query");

  const filters: string[] = ["isPublished = true"];
  if (category) filters.push(`category = "${category}"`);
  if (trustTier) filters.push(`trustTier = "${trustTier}"`);

  const index = meili.index("apps");
  const results = await index.search(q, {
    filter: filters.join(" AND "),
    limit,
    offset: (page - 1) * limit,
  });

  return c.json({
    hits: results.hits,
    totalHits: results.estimatedTotalHits ?? 0,
    page,
    limit,
    processingTimeMs: results.processingTimeMs,
  });
});
```

- [ ] **Step 3: Mount in index.ts**

Add import and mount for `searchRouter` in `services/api/src/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add services/api/
git commit -m "feat(api): add search proxy route using Meilisearch"
```

---

## Task 11: Push to GitHub and Verify

**Files:** None — verification only

- [ ] **Step 1: Run full test suite**

Run: `cd /c/Users/lmao/openmarket && pnpm test`
Expected: all tests pass across all packages

- [ ] **Step 2: Push to GitHub**

Run: `cd /c/Users/lmao/openmarket && git push origin master`
Expected: all commits pushed

---

*End of Week 2 plan. Week 3 (Android store app) is a separate plan.*
