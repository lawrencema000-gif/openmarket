---
title: Security Disclosure Policy
slug: security
version: v2026.04.30
effectiveDate: 2026-04-30
lastUpdated: 2026-04-30
status: DRAFT
---

# Security Disclosure Policy

We welcome reports from security researchers. The fastest way to keep OpenMarket users safe is to make it easy and rewarding to tell us when something is wrong.

## How to report

- **Email:** `security@openmarket.app`
- **Encrypted:** PGP key fingerprint **[REVIEW: publish a real key fingerprint before going live]**, full key at `https://openmarket.app/.well-known/pgp-key.asc`.
- **Direct response time:** within 1 business day for triage; substantive update within 5 business days.

In your report please include:
- A clear description of the vulnerability.
- Steps to reproduce, ideally with a non-destructive proof of concept.
- Impact assessment.
- Any related public references.
- Whether you'd like public credit when we publish a fix (we ask first).

## Scope

**In scope:**
- `*.openmarket.app` and all subdomains.
- The OpenMarket API (`api.openmarket.app`).
- The OpenMarket Android client (`com.openmarket.store`).
- Our developer SDK and CLI.

**Out of scope:**
- Third-party services we use (Vercel, Neon, Cloudflare, Resend) — please report directly to them.
- Apps **published by other developers** on OpenMarket. Report those via the in-product abuse-report flow.
- Volumetric DDoS or rate-limiting bypass without other impact.
- Reports requiring physical access to a victim device.
- Self-XSS without a way to deliver to other users.
- Banner / version disclosure, missing security headers without proof of impact.

## Safe-harbor commitment

If you make a good-faith effort to comply with this policy when researching a security issue, we will:

- **Not pursue or support legal action** against you for the research.
- **Not report you** to law enforcement for the research.
- **Work with you** to understand and resolve the issue quickly.

A "good-faith effort" means:
- Don't access user data beyond what's needed to demonstrate the issue.
- Don't degrade service availability or modify other users' data.
- Stop and report once you've established the issue.
- Give us a reasonable opportunity to fix before public disclosure (we suggest 90 days; we will negotiate if you need longer or shorter).

## Recognition

We don't operate a paid bug bounty (yet). What we do offer:

- Public credit (with your permission) on a hall-of-fame page once your finding is fixed.
- A dated, signed acknowledgement letter for your portfolio.
- For high-impact findings, swag and a personal thank-you from the team.

Once we ship paid bounties (post Tier 1) we will publish a separate page with the rules; that page will not retroactively change the safe-harbor protections in this one.

## Coordinated disclosure

We will:
- Acknowledge your report within 1 business day.
- Confirm or dispute the issue within 5 business days.
- Aim to fix critical issues within 14 days, high within 30, medium within 60, low at our discretion.
- Notify you when a fix is shipped.
- Publish an advisory + your credit (if you accept) within 7 days of the fix.

## Out-of-scope behavior we will pursue

- **Extortion** ("pay us or we publish") — we will not pay, we will publish first, and we may pursue legal action.
- **Selling vulnerabilities to third parties** before reporting to us.
- **Accessing or copying user data** beyond proof-of-concept volume.

## Changelog

- **v2026.04.30** — Initial draft.
