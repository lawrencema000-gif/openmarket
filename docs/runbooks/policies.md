# Policies & legal-page runbook

## What's on the site

Seven public pages on market-web:

| Path | Purpose | Lawyer review needed before launch? |
|---|---|---|
| `/about` | Mission, principles, contact | No |
| `/content-policy` | Substantive moderation rules | Recommended; this is product policy |
| `/privacy` | GDPR/CCPA-aware privacy policy | **Yes** |
| `/terms` | Terms of service | **Yes** |
| `/dmca` | DMCA notice + counter-notice | **Yes** + designated agent registration |
| `/security` | Vulnerability disclosure | Optional |
| `/transparency-report` | Public moderation log | No (placeholder until P1-K wires the data) |

Plus:

- `/.well-known/security.txt` — RFC 9116 contact discovery.
- `/robots.txt` — sitemap pointer + permissive crawl.

## Single source of truth

Canonical text lives in `docs/policies/*.md` with frontmatter (title, slug, version, effectiveDate, status). React pages under `apps/market-web/src/app/(legal)/<slug>/page.tsx` mirror it.

When you change a policy:

1. Edit the `.md` in `docs/policies/`.
2. Edit the corresponding `page.tsx`.
3. Bump `version` (calver: `vYYYY.MM.DD`) and `effectiveDate` in BOTH places.
4. Note the change in the page's Changelog section.
5. After merge, tag the commit: `git tag policies/<slug>@<version>`.

Why two copies: the markdown is portable (lawyers can read it; we can publish to PDF; transparency-log entries can cite a stable version), and the TSX is what users actually see. Some drift is expected; the markdown wins for substance, the TSX wins for layout.

## Adding a new policy page

1. Create `docs/policies/<slug>.md` with frontmatter.
2. Create `apps/market-web/src/app/(legal)/<slug>/page.tsx` using `<LegalLayout />`.
3. Add the slug to `LEGAL_LINKS` in `apps/market-web/src/components/legal-layout.tsx` (sidebar nav).
4. Add a footer link in `apps/market-web/src/app/layout.tsx`.
5. If the page is operationally important (privacy, content-policy, dmca), add it to the dev-portal + admin sidebar footer link group too.

## Required before going live

These items block real user launch. They cannot be filled in by code:

| Item | Where | Who fills |
|---|---|---|
| DMCA designated agent name + address + phone | `docs/policies/dmca.md` + `apps/market-web/src/app/(legal)/dmca/page.tsx` | Real person — must also be registered with U.S. Copyright Office at copyright.gov/dmca-directory/ |
| Privacy policy lawyer review | `docs/policies/privacy.md` + page | Lawyer |
| Terms of service lawyer review | `docs/policies/terms.md` + page | Lawyer |
| Security PGP key fingerprint | `docs/policies/security.md` + page | Generate + publish at `https://openmarket.app/.well-known/pgp-key.asc` |
| Real postal address for legal notices | privacy + terms pages | Real address |
| Sending domain DNS for `openmarket.app` | n/a | DNS — required for email + canonical URLs |

Until each of these is filled in, the corresponding page renders a `DraftBanner` so visitors see the policy isn't binding yet.

## Versioning + transparency log

Every moderation action (P1-K) records the version of `content-policy.md` that applied at the time of the action. Old versions are kept in git history; a future tooling pass will surface them at `/content-policy/v<version>` URLs so transparency-log entries link directly to the rule as it was written when the action was taken.

This is the heart of "transparency" — without versioned rules, "we removed it under our policy" is unverifiable. With versioned rules + a public log, it's auditable.

## Changelog

| Date | Change |
|---|---|
| 2026-04-30 | P0-E initial publication. All 7 pages live in DRAFT form. |
