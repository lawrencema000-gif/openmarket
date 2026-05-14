# Accessibility runbook (P3-L)

OpenMarket targets **WCAG 2.1 AA** across all three frontends. This runbook covers the audit baseline (what's been checked), the standing checklist for new code, and how the perf-budget CI flags regressions.

## TL;DR

- Lighthouse CI enforces **Accessibility category ≥ 0.90** on every PR (see `docs/runbooks/performance.md`). A11y regressions surface in the same check tab as perf.
- New UI components must pass the **Standing checklist** below before merge.
- Use `pnpm perf:budget:market-web` locally to run Lighthouse against the production build.

## Standing checklist (every new component / page)

### Structure
- [ ] One `<h1>` per page; heading levels nest without skipping (`h1 → h2 → h3`).
- [ ] Landmarks: `<header>`, `<main id="main-content">`, `<nav>`, `<footer>` — already wired in all three layouts.
- [ ] Skip-to-content link is the first focusable element on each page (already in all three layouts).

### Interactive
- [ ] Every `<button>` has either visible text OR `aria-label`.
- [ ] Toggle buttons (heart, beta join, etc.) use `aria-pressed`.
- [ ] Disclosure widgets use `aria-expanded` + `aria-haspopup` where relevant.
- [ ] Icon-only links + buttons set `aria-hidden="true"` on the SVG.

### Forms
- [ ] Every input has an associated `<label>` (`htmlFor` OR wrapping) OR a `aria-label` / visually hidden `<span class="sr-only">`.
- [ ] Required fields marked with `required` AND announced via `aria-required` or visible asterisk + legend.
- [ ] Error messages associated via `aria-describedby`.
- [ ] Save / error status surfaces in an `aria-live="polite"` (status) or `aria-live="assertive"` (alert) region.

### Modals / dialogs
- [ ] `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the visible heading.
- [ ] Escape key dismisses (see `PinUnlockDialog` for the pattern).
- [ ] Backdrop click cancels — but only when the click target IS the backdrop, never bubbled from the panel.
- [ ] Focus moves into the dialog on open (`autoFocus` on the first input is sufficient for v1).
- [ ] Focus returns to the trigger on close (the dialog stashes `document.activeElement` in a ref and `.focus()`s it on cleanup).

### Color + contrast
- [ ] Body text: contrast ratio ≥ 4.5:1 against background (`text-gray-700` on white is the floor we use).
- [ ] Large text (≥ 18pt / 14pt bold): contrast ≥ 3:1.
- [ ] Non-text indicators (focus ring, error border): don't rely on color alone — pair with an icon or text label.

### Focus
- [ ] Every interactive element has a visible focus ring. The Tailwind pattern is:
  ```html
  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1
  ```
- [ ] Custom buttons (rounded full, icon-only) get a `focus-visible:ring-2` variant matching their hover color.

### Reduced motion
- [ ] Animations longer than 200ms gate on `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) { /* skip the transform / shrink the duration */ }
  ```

## Audit log

This baseline was completed on the Phase 3 P3-L pass.

### market-web (public storefront)

**Verified clean** (already passing):
- Layout: skip-to-content link, semantic landmarks, `<html lang>` from i18n resolver.
- `<WishlistHeart>` — `aria-pressed`, contextual `aria-label`, SVG `aria-hidden`.
- `<LocalePicker>` and `<UILocalePicker>` — labels associated, focus rings.
- App detail page — single `<h1>`, proper `<h2>` sectioning, breadcrumb is a `<nav>`.

**Fixed this pass**:
- `<PinUnlockDialog>` — added `aria-labelledby`, Esc-to-close, backdrop-only cancel, focus return on close, `aria-live="polite"` error region, `sr-only` label on PIN input.
- `<UserMenu>` — added `aria-label` on the avatar trigger, `focus-visible:ring` for keyboard users.
- `<InstallBar>` — lock emoji marked `aria-hidden`, parent-PIN note wrapped in `role="note"`.
- Save-status banners on `/account`, `/account/notifications`, `/account/parental-controls` — now in `role="status" aria-live="polite"` regions so screen readers announce the save.

### dev-portal (developer console)

**Verified clean**:
- Layout: skip link, sidebar `<nav>` with `aria-label`, mobile bottom-nav labelled, `<main id="main-content">`.
- Per-app management cards (BetaToggle, PreRegistrationToggle, FamilySharingToggle) — checkbox `<input>` wrapped in `<label>`.

**Known gaps** (deferred to a Phase-3.5 polish pass):
- Some inputs in the experiment builder lack explicit `<label>` wrappers — placeholder serves as a visual label only. Add `aria-label` or sr-only labels.
- Distribution channel share-token copy button could announce "Copied!" via aria-live.

### admin (moderation console)

**Verified clean**:
- Layout: skip link, sidebar nav, mobile nav, main landmark.
- DMCA action buttons render distinct text labels rather than icons.
- Reports table has a `<caption>` (verified earlier in P2-K bulk moderation).

**Known gaps**:
- Source-code verification action buttons use color-only state (emerald = verified). Already paired with text ("Mark source verified" / "Clear source verified") so this passes — documented to track.

## Continuous enforcement

Lighthouse CI runs accessibility audits on every PR via `.github/workflows/perf-budget.yml`. The category threshold is `≥ 0.90` (warn) on market-web — bumps to `error` when we have full coverage. Specific axe rules that bust the budget include:

- `button-name` — buttons without an accessible name
- `label` — form controls without labels
- `aria-valid-attr-value` — invalid aria values
- `color-contrast` — text below the 4.5:1 / 3:1 threshold
- `landmark-one-main` — multiple `<main>` elements

When a PR fails an a11y rule, open the linked Lighthouse report and the failing audit names exactly which DOM nodes triggered.

## Manual testing

Before any major UI change, verify with:

1. **Keyboard only** — Tab through the page; every interactive element should be reachable + visibly focused.
2. **Screen reader smoke test** — VoiceOver (Mac: Cmd+F5) or NVDA (Windows). Walk the page top-to-bottom; check that headings, landmarks, and form labels read sensibly.
3. **Zoom to 200%** — page layout should still work; no horizontal scroll, no clipped text.
4. **`prefers-reduced-motion: reduce`** — toggle in OS settings; animations should be eliminated or under 200ms.

## Future work

- Full WCAG 2.2 audit (new criteria around focus management + dragging) — defer until Phase 4.
- Automated axe-core test runs in addition to Lighthouse — Lighthouse runs a subset; axe-core has wider coverage. Plan to add via `@axe-core/playwright` in the e2e suite.
- High-contrast mode test pass.
