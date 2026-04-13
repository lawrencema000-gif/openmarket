# OpenMarket UI/UX Overhaul — Design Spec

**Date:** 2026-04-14
**Source:** Deep visual audit of all 3 web apps + shared UI package
**Goal:** Transform generic Tailwind templates into a distinctive, professional marketplace UI

---

## 1. Design System Foundation

### 1.1 Color Palette

Replace scattered blue-600/gray-500 usage with a branded, semantic palette defined as CSS custom properties in a shared globals file.

**Brand colors:**
- Primary: `#2563EB` (blue-600) → keep but name it `--color-primary`
- Primary hover: `#1D4ED8` (blue-700)
- Primary light: `#EFF6FF` (blue-50)
- Accent: `#8B5CF6` (violet-500) — for experimental/creative elements
- Surface: `#FFFFFF` — card backgrounds
- Background: `#F8FAFC` (slate-50) — page backgrounds
- Sidebar dark: `#0F172A` (slate-900) — admin/dev-portal sidebars

**Semantic colors (consistent across all apps):**
- Success/Verified: `#16A34A` bg `#F0FDF4`
- Warning/Pending: `#CA8A04` bg `#FEFCE8`
- Danger/Suspended: `#DC2626` bg `#FEF2F2`
- Info/New: `#2563EB` bg `#EFF6FF`
- Experimental: `#8B5CF6` bg `#F5F3FF`
- Neutral: `#6B7280` bg `#F3F4F6`

### 1.2 Typography Scale

Standardize on a consistent type ramp:
- Display: 36px/40px bold — hero headlines only
- H1: 30px/36px bold — page titles
- H2: 24px/32px semibold — section headers
- H3: 20px/28px semibold — card titles
- Body: 16px/24px regular — paragraphs
- Body small: 14px/20px regular — secondary text
- Caption: 12px/16px medium — badges, metadata
- Code: 14px/20px mono — package names, fingerprints

### 1.3 Spacing System

Use Tailwind's default scale but enforce consistency:
- Section gaps: `space-y-8` or `gap-8` (32px)
- Card internal padding: `p-6` (24px)
- Element gaps within cards: `space-y-4` (16px)
- Inline element gaps: `gap-2` (8px)
- Badge/chip padding: `px-2.5 py-1` (10px/4px)

### 1.4 Border Radius

- Cards/containers: `rounded-xl` (12px)
- Buttons: `rounded-lg` (8px)
- Badges/chips: `rounded-full` (9999px)
- App icons: `rounded-2xl` (16px)
- Inputs: `rounded-lg` (8px)

### 1.5 Shadows

- Card default: `shadow-sm`
- Card hover: `shadow-md` with `transition-shadow duration-200`
- Dropdown/modal: `shadow-lg`
- Sticky header: `shadow-sm border-b`

---

## 2. Expanded Component Library (@openmarket/ui)

### 2.1 New Components to Add

**AppCard** — Dedicated app listing card with icon, title, developer, description, category badge, trust badge. Used across marketplace search results, home page, developer profiles. Variants: `compact` (list row), `full` (grid card).

**StarRating** — Proper star rating display using filled/half/empty star SVGs. Props: `rating: number`, `count?: number`, `size?: "sm" | "md"`.

**StatusBadge** — Semantic status indicator for releases, reports, developers. Color-coded by status type. Props: `status: string`, maps to correct semantic color.

**Avatar** — Developer/user avatar with initials fallback. Props: `name: string`, `imageUrl?: string`, `size?: "sm" | "md" | "lg"`.

**Skeleton** — Loading placeholder with shimmer animation. Variants: `text`, `circle`, `card`, `image`.

**EmptyState** — Consistent empty state with icon, title, description, optional action button.

**ConfirmDialog** — Modal confirmation for destructive actions. Props: `title`, `description`, `confirmLabel`, `variant: "danger" | "default"`.

**SearchInput** — Search input with magnifying glass icon, clear button, and keyboard shortcut hint (Ctrl+K).

**DataTable** — Sortable, filterable table component for admin/dev-portal. Props: columns, data, sortable, onSort.

**Stat** — Dashboard stat card with icon, label, value, trend indicator.

**NavItem** — Sidebar navigation item with icon, label, active state indicator (left border accent).

**PageHeader** — Page title with optional breadcrumbs, description, and action buttons.

### 2.2 Component Improvements

**Button** — Add `loading` prop (shows spinner), `icon` prop (leading icon), ensure `cursor-not-allowed` on disabled.

**Card** — Add `interactive` variant with hover shadow + subtle scale transform.

**Badge** — Add semantic variant mappings: `verified`, `experimental`, `suspended`, `pending`.

**Input** — Add `icon` prop for leading icon, `error` prop for validation state.

---

## 3. Market-Web Overhaul

### 3.1 Layout

- **Header:** Sticky, white background, subtle border-b shadow. Logo (bold text + small icon/shield), centered search bar (SearchInput component with Ctrl+K hint), right-side nav links with subtle hover underline animation.
- **Footer:** Multi-column footer with sections: Discover (Browse, Categories, New), Developers (Dev Portal, Docs, API), About (Mission, Policy, Enforcement), Social (GitHub link). Copyright at bottom.

### 3.2 Home Page

- **Hero:** Clean gradient background (slate-50 to white), large bold headline "Discover Android Apps Built by Real People", subtitle about open marketplace, prominent SearchInput centered, category chips below search.
- **Categories:** Horizontal scrolling chip row (not grid) — more mobile-friendly, each chip has an emoji/icon + label. On click → navigates to /search?category=X.
- **Featured Apps section:** Replace disabled placeholder with real content or remove entirely. If no apps exist yet, show a compelling "Coming Soon" card or developer CTA.
- **New Arrivals:** Same — show real content or a "Be the first to publish" CTA card linking to dev-portal.

### 3.3 Search Page

- **Layout:** Full-width search bar at top, horizontal filter chips below (categories as scrollable chips, trust tier as toggle group), results below.
- **Remove sidebar layout** — filters as horizontal chips are more modern and mobile-friendly.
- **App cards:** Use AppCard component in grid (2 cols mobile, 3 cols tablet, 4 cols desktop).
- **Empty state:** Use EmptyState component with search illustration.
- **Pagination:** Replace Previous/Next text links with proper pagination component with page numbers.

### 3.4 App Detail Page

- **Header:** Large app icon (80px rounded-2xl), title, developer name (linked), StarRating, install count placeholder, category badge.
- **Action bar:** Prominent "Download APK" button (primary, large), version badge, size badge.
- **Screenshots:** Horizontal scroll with proper scroll snap, rounded corners, subtle shadow. Show scroll indicators (fade gradient on edges).
- **Tabs:** About | Reviews | Permissions | Release Notes — tabbed interface instead of stacking everything.
- **Permissions:** Grouped by protection level (Dangerous shown first with warning color, Normal collapsed by default).
- **Reviews:** StarRating component, proper review cards with avatar, date, helpful button.
- **Trust section:** Visual trust indicator bar showing verification status, security review status, developer history.

### 3.5 Developer Page

- **Header:** Avatar component, developer name, trust badge, member since, app count.
- **Apps grid:** AppCard components in grid layout.

---

## 4. Dev-Portal Overhaul

### 4.1 Layout

- **Sidebar:** Dark sidebar (slate-900) matching admin for visual consistency across internal tools. NavItem components with icons (Lucide icons via lucide-react). Active state: left blue border accent + lighter background.
- **Mobile:** Hamburger menu that opens sidebar as overlay.
- **Header area:** PageHeader component on each page with breadcrumbs.

### 4.2 Dashboard

- **Stats row:** 4 Stat cards — Total Apps, Published, Pending Review, Total Downloads (placeholder).
- **Verification status:** Prominent card showing current trust level with progress steps (Experimental → Verified → Audited).
- **Recent activity:** Replace placeholder with "Get started" checklist if new developer (Create profile, Register signing key, Create first app, Upload first release).
- **Quick actions:** Card with icon buttons for common actions.

### 4.3 App Management

- **Apps list:** AppCard components (compact variant) with status indicators, action menu (edit, view releases, delete).
- **Create app form:** Multi-step wizard (Step 1: Basic info, Step 2: Description & media, Step 3: Settings & review). Progress indicator at top.
- **App detail:** Tabbed view — Listing | Releases | Analytics (placeholder).

### 4.4 Release Upload

- **Upload flow:** 3-step visual progress (Create Release → Upload APK → Processing).
- **File upload:** Drag-and-drop zone with file type icon, progress bar during upload, checkmark on complete.
- **Status tracking:** Live status updates (draft → scanning → review → published) with timeline visualization.

### 4.5 Forms

- Use Input component from @openmarket/ui with proper validation states.
- Replace custom toggle with proper accessible Switch component.
- Add form-level error summary at top.
- Add character counts on description fields.

---

## 5. Admin Console Overhaul

### 5.1 Layout

- Keep dark sidebar (already good). Add NavItem components with icons and active state.
- Add collapsible sidebar for more screen real estate.
- Add breadcrumbs via PageHeader.

### 5.2 Dashboard

- **Stats row:** Stat components with color-coded icons and trend arrows.
- **Risk queue preview:** Show top 5 high-risk releases inline with risk score badges.
- **System health:** Simple green/yellow/red status indicators for workers, API, search.

### 5.3 Risk Queue

- **DataTable** component with sortable columns (risk score, app name, developer, date).
- **Risk score visualization:** Color gradient bar (green-yellow-orange-red) not just a number.
- **Inline actions:** Approve (green), Reject (red) buttons with ConfirmDialog.
- **Quick filters:** Tabs for All | High Risk (71+) | Medium (31-70) | Low (0-30).

### 5.4 Release Inspector

- **Split layout:** Left panel = metadata + actions, Right panel = scan findings.
- **Findings:** Collapsible sections by severity (Critical first, red header) with finding detail cards.
- **Permission diff:** Side-by-side comparison with previous release, new permissions highlighted in yellow.
- **Action buttons:** Approve/Reject with reason input in ConfirmDialog.

### 5.5 Developer Management

- **DataTable** with search, trust level filter tabs.
- **Developer detail:** Profile card + apps list + moderation history timeline + action buttons (Suspend/Reinstate with ConfirmDialog).

### 5.6 Audit Log

- **DataTable** with sortable columns, search by moderator/target.
- **Action badges:** Color-coded with proper StatusBadge component.

---

## 6. Cross-Cutting Improvements

### 6.1 Animations & Transitions

- Page transitions: Subtle fade-in on route change (CSS `animation: fadeIn 0.2s ease-in`).
- Card hover: `transform: translateY(-2px)` + shadow increase.
- Button press: `transform: scale(0.98)` active state.
- Loading: Skeleton shimmer animation for all loading states.
- Toast notifications: Slide in from top-right for success/error feedback.

### 6.2 Icons

Add `lucide-react` to @openmarket/ui and all apps. Use consistently:
- Navigation: Home, Search, Package, Key, User, Settings, Shield, AlertTriangle.
- Actions: Plus, Download, Trash, Edit, Check, X, ChevronRight.
- Status: CheckCircle, XCircle, AlertCircle, Clock, Eye.

### 6.3 Dark Mode (Foundation Only)

Don't implement full dark mode yet. But set up CSS custom properties so it's easy to add later. Use `bg-background`, `text-foreground` etc. instead of hardcoded colors.

### 6.4 Responsive Breakpoints

Enforce consistent breakpoints:
- Mobile: < 640px (1 column, bottom nav, stacked layouts)
- Tablet: 640-1024px (2 columns, sidebar collapses)
- Desktop: > 1024px (full layout, sidebar visible)

---

## 7. Priority Order

1. Expand @openmarket/ui with new components (AppCard, StarRating, StatusBadge, Skeleton, EmptyState, SearchInput, NavItem, PageHeader, Stat, ConfirmDialog)
2. Add lucide-react icons across all apps
3. Market-web overhaul (highest user-facing impact)
4. Dev-portal overhaul (developer-facing)
5. Admin overhaul (internal, lowest priority but still important)
6. Cross-cutting animations and transitions

---

*End of spec.*
