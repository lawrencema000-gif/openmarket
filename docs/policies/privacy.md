---
title: Privacy Policy
slug: privacy
version: v2026.04.30
effectiveDate: 2026-04-30
lastUpdated: 2026-04-30
status: DRAFT — pending lawyer review
---

# Privacy Policy

> **Status: DRAFT.** This policy must be reviewed by qualified legal counsel before OpenMarket goes live to real users. Sections marked **[REVIEW]** below have specific issues we need a lawyer to weigh in on.

This policy describes how OpenMarket ("we", "us") handles your personal information when you use openmarket.app, the OpenMarket developer portal, the OpenMarket Android client, and our APIs (collectively, the "Service").

We hold a single principle: collect the minimum information necessary to operate the Service, retain it for the shortest reasonable time, and never sell it.

## 1. What we collect

### 1.1 Information you give us

- **Account info.** Email address. Optionally: display name, avatar URL, OAuth provider identifier (GitHub, Google).
- **Developer info.** Email address, display name, optionally a verified domain or organization identity for higher trust tiers, optionally tax info for paid apps (future — Tier 4).
- **Reviews and reports.** Any text or rating you publish on the Service.
- **Support correspondence.** Anything you send to our support, trust & safety, or legal addresses.

### 1.2 Information we collect automatically

- **Install events.** When you install an app via the Android client or via the Service, we record the app, the version, anonymized device fingerprint hash, OS version, success/failure. We use this to compute install counts (shown to developers as anonymized totals) and to detect attacks.
- **Crash reports** (developer opt-in; Tier 2). If a developer opts into crash reporting and you accept the in-app prompt, we collect stack traces, OS version, device model, and the crashed version code.
- **Server logs.** IP address (truncated to /24 for IPv4 / /48 for IPv6 within 30 days), user-agent string, request path, response status, timestamp. Used to operate the service, detect abuse, and debug failures.
- **Pageview analytics.** We use [Plausible](https://plausible.io) — privacy-respecting, no cookies, no personal identifiers. Aggregated only.

### 1.3 What we do NOT collect

- We do not use Google Analytics or similar third-party trackers on user-facing pages.
- We do not embed Facebook pixels, ad networks, or fingerprinting libraries.
- We do not collect contacts, photos, location, microphone, or camera data from your device beyond what an app you install does on its own.

## 2. How we use your information

- **Operating the Service.** Authenticating you, showing you your library, processing reviews, delivering updates.
- **Trust & safety.** Detecting fraud, abuse, malware, and policy violations.
- **Aggregate analytics.** Counting installs, ranking apps in search, computing top charts.
- **Communications.** Transactional emails (verification, password reset, takedown notices). We do not send marketing emails by default; opt-in only.
- **Legal compliance.** Responding to lawful process.

## 3. Legal bases for processing (GDPR)

Where GDPR applies:
- **Contract** — processing necessary to provide the Service you signed up for (account, library, installs).
- **Legitimate interest** — fraud prevention, security, aggregate analytics that do not identify you.
- **Consent** — opt-in features such as crash reporting, marketing emails.
- **Legal obligation** — responding to lawful process.

## 4. How we share your information

- **With other users**, only what you publish (reviews, profile fields you set as public).
- **With developers**, only aggregated statistics about their own apps (anonymized install counts, country breakdowns at country level, rating averages). Reviews you post are visible to the developer with your display name.
- **With service providers** under contract:
  - Hosting & DB: Vercel, Neon, Cloudflare R2.
  - Email: Resend.
  - Error tracking: Sentry.
  - Each is bound by a Data Processing Agreement and only handles data necessary for their function.
- **For legal compliance** — see §8.
- **In the event of a corporate transaction** — successors take on the same obligations under this policy.
- **We do not sell your information.** Ever. **[REVIEW: confirm this language is acceptable as a "shall not sell" representation under CCPA.]**

## 5. Cookies and similar technologies

We use a small set of strictly-necessary first-party cookies for authentication and CSRF protection. We do not use advertising or cross-site tracking cookies.

## 6. Your rights

- **Access** — `mailto:privacy@openmarket.app` to request a JSON export of all data we hold tied to your account. We will respond within 30 days.
- **Erasure** — delete your account from the account settings page; data is soft-deleted for 30 days then hard-deleted.
- **Correction** — update profile fields directly, or email us for indirect data.
- **Portability** — included in the export under §6.1.
- **Object** — opt out of optional features (crash reporting, push notifications) at any time.
- **EU/UK residents** also have the right to lodge a complaint with their data protection authority.
- **California residents** under CCPA have the right to know, delete, and opt out of "sale" — we do not sell, and the opt-out request is honored automatically.

## 7. Children

OpenMarket is not directed to children under 13, and we do not knowingly collect data from children under 13. **[REVIEW: confirm COPPA stance — we may need explicit notices when adding family-sharing features in P3-E.]** If we learn we have collected data from a child under 13 we will delete it.

## 8. Legal requests

We require valid legal process before disclosing user data:
- Subpoena for non-content, court order or warrant for content, search warrant for stored communications, etc.
- We will, where legally permitted, notify you before complying.
- Request counts and types are published in the transparency report.

## 9. Data security

- TLS in transit, AES-256 at rest.
- Access to production systems is limited to a named on-call list and audited.
- Industry-standard incident response: detection, containment, notification within 72 hours where required.

## 10. International transfers

Data is processed in the United States (Neon, Vercel) and globally distributed via Cloudflare's edge for static assets. **[REVIEW: confirm SCCs and additional safeguards are in place where required for EU/UK transfers.]**

## 11. Retention

- **Account data** — for the life of your account; 30-day soft-delete then hard-delete on closure.
- **Server logs** — IP truncated within 30 days, full logs retained 90 days.
- **Install events** — retained 24 months for anti-abuse; aggregated indefinitely.
- **Crash reports** — retained 12 months.
- **Reviews and reports** — kept for the life of the account; published reviews remain visible until you remove them or close your account.
- **Transparency log entries** — kept indefinitely (the public log is permanent).

## 12. Changes

We will post any material change here and email registered users at least 30 days before it takes effect. Editorial changes go in immediately and are noted in the changelog.

## 13. Contact

- Privacy: `privacy@openmarket.app`
- General: `support@openmarket.app`
- Postal address: **[REVIEW: real address required before publication]**

## Changelog

- **v2026.04.30** — Initial draft, pending lawyer review.
