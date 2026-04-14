# Week 3: Web Apps + Remaining Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three Next.js web apps (public marketplace, developer portal, admin console), remaining API routes (reviews, reports, admin moderation), CI/CD workflows, and deploy to Vercel.

**Architecture:** Next.js 16 App Router for all web apps sharing `@openmarket/ui` components. Remaining API routes added to existing Hono service. GitHub Actions for CI. Vercel for deployment.

**Tech Stack:** Next.js 16, React, Tailwind CSS, shadcn/ui, Hono, Vitest, GitHub Actions, Vercel

---

## Task 1: Shared UI Package

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/tailwind.config.ts`
- Create: `packages/ui/src/components/badge.tsx`
- Create: `packages/ui/src/components/button.tsx`
- Create: `packages/ui/src/components/card.tsx`
- Create: `packages/ui/src/components/input.tsx`
- Create: `packages/ui/src/components/trust-badge.tsx`

Create the shared UI package with basic shadcn-style components plus a custom TrustBadge component that renders the marketplace trust badges (Verified Developer, Experimental, New, Security Reviewed, etc.).

All components should be React Server Component compatible. Use Tailwind for styling.

Commit: "feat(ui): add shared UI package with badge, button, card, input, and trust badge components"

---

## Task 2: Public Marketplace Web App (market-web)

**Files:**
- Create: `apps/market-web/` — full Next.js 16 app

Create a Next.js 16 App Router application with:

**Pages:**
- `/` — Landing page with search bar, featured section (placeholder), categories grid, "new arrivals" section
- `/search` — Search results with filters (category, trust tier), powered by the API's `/api/search` endpoint
- `/apps/[id]` — App detail page showing icon, title, developer, description, screenshots, permissions, trust badges, install button (links to APK download)
- `/developers/[id]` — Developer profile page showing display name, trust level, published apps

**Layout:**
- Shared header with logo, search bar, navigation
- Footer with links to docs (mission, publishability, etc.)
- Responsive design with Tailwind

**Data fetching:**
- Server components fetch from the API service (`http://localhost:3001/api/...`)
- Use `NEXT_PUBLIC_API_URL` env var for API base URL
- Categories fetched from API (add a `GET /api/categories` route)

Commit: "feat(market-web): add public marketplace with landing, search, app detail, and developer pages"

---

## Task 3: Developer Portal Web App (dev-portal)

**Files:**
- Create: `apps/dev-portal/` — full Next.js 16 app

Create a Next.js 16 App Router application with:

**Pages:**
- `/` — redirect to `/dashboard`
- `/login` — login form (email + password)
- `/register` — registration form
- `/dashboard` — overview of developer's apps, recent activity, verification status
- `/apps` — list of developer's apps with "Create App" button
- `/apps/new` — create app form (all fields from createAppSchema)
- `/apps/[id]` — app management (edit listing, view releases)
- `/apps/[id]/releases/new` — create release form (upload APK, set version, channel, notes)
- `/signing-keys` — manage signing keys (list, enroll new, revoke)
- `/profile` — edit developer profile

**Auth:**
- Client-side auth state using Better Auth client SDK
- Protected routes redirect to /login if not authenticated
- API calls include session cookie

Commit: "feat(dev-portal): add developer console with dashboard, app management, and release upload"

---

## Task 4: Admin Console Web App (admin)

**Files:**
- Create: `apps/admin/` — full Next.js 16 app

Create a Next.js 16 App Router application with:

**Pages:**
- `/` — redirect to `/dashboard`
- `/dashboard` — risk queue summary, report counts, verification queue, system health
- `/risk-queue` — releases sorted by risk score (highest first), click to inspect
- `/releases/[id]` — release inspector with metadata, scan results, permission diff, approve/reject actions
- `/reports` — open reports grouped by target, with status filters
- `/developers` — developer list with trust level filters, click for detail
- `/developers/[id]` — developer profile with moderation actions (warn, freeze, suspend)
- `/audit-log` — moderation action history (append-only, searchable)

**Auth:**
- Same Better Auth, but require admin role (add `isAdmin` boolean to developers table or check for audited trust level)

Commit: "feat(admin): add moderation console with risk queue, reports, developer management, and audit log"

---

## Task 5: API — Reviews, Reports, and Categories Routes

**Files:**
- Create: `services/api/src/routes/reviews.ts`
- Create: `services/api/src/routes/reports.ts`
- Create: `services/api/src/routes/categories.ts`
- Create: `services/api/src/routes/admin.ts`
- Create: `services/api/src/__tests__/reviews.test.ts`
- Create: `services/api/src/__tests__/categories.test.ts`
- Modify: `services/api/src/index.ts`

**Reviews routes:**
- `GET /api/apps/:appId/reviews` — list reviews for an app (public)
- `POST /api/apps/:appId/reviews` — create review (auth required, one per user per app)
- `PATCH /api/reviews/:id` — update own review
- `DELETE /api/reviews/:id` — delete own review

**Reports routes:**
- `POST /api/reports` — submit abuse report (auth required)
- `GET /api/reports` — list reports (admin only)
- `PATCH /api/reports/:id` — update report status (admin only)

**Categories routes:**
- `GET /api/categories` — list all categories (public, cached)

**Admin routes:**
- `GET /api/admin/risk-queue` — releases with risk score > 30, sorted desc
- `POST /api/admin/releases/:id/approve` — approve release (move to published)
- `POST /api/admin/releases/:id/reject` — reject release (move back to draft with reason)
- `POST /api/admin/developers/:id/suspend` — suspend developer
- `POST /api/admin/developers/:id/reinstate` — reinstate developer
- `GET /api/admin/audit-log` — list moderation actions

Commit: "feat(api): add reviews, reports, categories, and admin moderation routes"

---

## Task 6: CI/CD Workflows

**Files:**
- Create: `infrastructure/github/workflows/ci.yml`
- Create: `infrastructure/github/workflows/deploy-preview.yml`

**ci.yml** — runs on every PR:
- Checkout, setup Node 24, setup pnpm
- `pnpm install`
- `pnpm typecheck`
- `pnpm test`

**deploy-preview.yml** — runs on PR open/update:
- Deploy market-web, dev-portal, admin to Vercel preview

Commit: "chore: add CI and Vercel preview deployment workflows"

---

## Task 7: Vercel Deployment

Deploy all three web apps to Vercel with live URLs:
- market-web → openmarket.vercel.app (or similar)
- dev-portal → openmarket-dev.vercel.app
- admin → openmarket-admin.vercel.app

Commit: "chore: deploy all web apps to Vercel"

---

## Task 8: Push and Verify

Push all commits to GitHub. Run full test suite. Verify Vercel deployments.

---

*End of Week 3 plan.*
