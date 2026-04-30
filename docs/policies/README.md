# Policies — canonical source

This directory holds the canonical text of every legal and product policy that
OpenMarket publishes. The pages under `apps/market-web/src/app/(legal)/` should
mirror this directory; if they drift, **the markdown here wins** for substance,
the rendered TSX wins for layout.

## How to edit

1. Edit the `.md` file here.
2. Update the corresponding TSX page under `apps/market-web/src/app/(legal)/`.
3. Bump the `version` and `effectiveDate` in both the markdown frontmatter and
   the TSX `<LegalLayout />` props.
4. Submit a PR. Tag a reviewer with both legal and product context.
5. After merge, take a snapshot:
   `git tag policies/<filename>@<version>` so we can reference exact rule
   versions in transparency-log entries (see §11 of the implementation plan).

## What's here

| File | Status | Lawyer-reviewed? |
|---|---|---|
| `privacy.md` | DRAFT | No — needs review before going live |
| `terms.md` | DRAFT | No — needs review before going live |
| `dmca.md` | DRAFT | No — needs review + designated agent registration |
| `content-policy.md` | DRAFT | Product policy, not legal advice; lawyer review still recommended |
| `security.md` | DRAFT | Optional lawyer review |

## What's NOT here (yet)

- Cookie policy (separate page or merged into privacy?)
- Acceptable use policy for developers (currently merged into terms)
- Children's privacy notice (COPPA — only if we add accounts under 13; we don't)
- California-specific notices (CCPA — we'll add when we hit threshold)
- EU-specific notices (DSA — we'll add when we hit threshold)

## Versioning

Every policy has a `version` (calver: `v2026.04.30` or semver-like `v1.0.0`)
and an `effectiveDate`. When we delist content under a specific rule version,
the transparency log records BOTH the rule URL and the version, so anyone
reading the log later can see what the rule said at the time of the action,
even if the rule has since changed.
