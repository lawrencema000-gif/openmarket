---
title: Content Policy
slug: content-policy
version: v2026.04.30
effectiveDate: 2026-04-30
lastUpdated: 2026-04-30
status: DRAFT
---

# Content Policy

This is what we will and won't host on OpenMarket, and how we make those decisions.

We hold ourselves to two non-negotiable principles:

1. **Viewpoint-neutrality.** We don't remove apps for being unpopular, controversial, or politically inconvenient. We remove for the categorical reasons listed below — nothing else.
2. **Transparency.** Every removal goes into a public log with the reason cited and the version of this policy that was applied. Every removal is appealable.

If you think we've crossed either line, **tell us** — and the public — using the appeal process at the end of this document.

---

## What we don't allow

These categories will get an app removed. Each has narrow, written criteria. We will cite a specific subsection when removing.

### 1. Malware and active harm to users

- Code that exfiltrates user data without consent.
- Code that attacks other systems (botnets, DDoS, RATs that aren't clearly labeled and consented).
- Cryptominers running without disclosure and consent.
- Persistent ads that can't be dismissed, or that masquerade as system UI.

How we determine: automated scans (permission analysis, signing-key checks, repackaging detection, native-lib reputation) plus manual review on any flag. False positives are appealable; we will reverse with public note in the transparency log when we get it wrong.

### 2. Illegal content

- Child sexual abuse material — reported to NCMEC, account permanently banned, no appeal.
- Material that is illegal in the developer's stated jurisdiction or the user's jurisdiction (we will geo-block where possible rather than remove globally).
- Apps directly facilitating crimes against persons (stalkerware, doxxing-as-a-service, swatting tools).

How we determine: written court order, NCMEC report, or a credible report investigated by our trust & safety team.

### 3. Sexual content involving minors or non-consent

Beyond the legal floor in §2: any sexual or sexualized depiction of a minor, regardless of medium (drawn, AI-generated, etc.). Non-consensual intimate imagery (NCII / "revenge porn") at the request of the depicted party.

### 4. Imminent, real-world harm to identifiable people

- Direct threats of violence with a credible target.
- Doxxing — publication of private personal information about an identifiable individual without consent (home address, workplace, phone).
- Coordinated harassment campaigns that use the platform as infrastructure.

This is a high bar on purpose. Generic political insults, criticism of public figures, satire, and parody are not in scope.

### 5. Deception that targets the user

- Apps that misrepresent what they are (e.g., "calculator" that's actually a stalkerware tool).
- Phishing apps that imitate banks, governments, or recognizable brands without authorization.
- Repackaged copies of other apps with malicious modifications.
- Fake reviews / reviews-for-pay rings.

### 6. Adult content not labeled as such

We host adult apps. We require they be labeled with the `mature` content rating and gated behind an age confirmation. Failure to label is the violation, not the content.

### 7. Spam

Mass-produced low-quality apps designed to game discovery (translation: thousands of identical "wallpaper" apps spammed by one developer to capture search terms).

---

## What we DO allow that some other stores don't

We're explicit about this because being unclear here is how viewpoint-discrimination starts.

- **Religious and political speech**, including controversial speech, edgy speech, satire, and speech that makes us personally uncomfortable.
- **Off-platform speech.** What you say outside OpenMarket is not our business unless it crosses into §1.4 (imminent harm) and the platform is being used as infrastructure for it.
- **Adult content**, properly labeled and rated.
- **Apps that compete with us, with Google, or with established players.** We will never remove an app for "competitive" reasons.
- **Federation, sideloading, alternative stores, decentralized apps, cryptocurrency apps** — full stop. These are software categories, not violations.
- **Modding tools, emulators, content-blockers, ad-blockers, privacy tools, root-related apps** — we host them with appropriate labeling.
- **Apps that some governments dislike.** Where a government order is involved we will geo-block in that jurisdiction (per §2) rather than remove globally, and we will note it in the transparency log.

If your app would be removed from another store on these grounds, that is not by itself a reason we will remove it.

---

## Trust signals (not gates)

We don't gate publication on editorial approval. Instead, we surface objective signals on every listing so users can make informed choices:

- Verified developer identity (email-only, domain-verified, audit-verified).
- Whether the app's signing key matches the developer's registered key.
- Permissions requested and what they imply.
- Whether source code is public.
- Risk score from automated scans, with the underlying findings linked.
- Reviews and install volume.

Trust tiers (`standard`, `enhanced`, `experimental`) appear next to each app. They affect ranking, not eligibility. New developers default to `standard`; `experimental` is opt-in for early-stage or unsigned-build apps with prominent warnings to users.

---

## Process

### Reporting an app

Anyone can file a report from the app detail page or via `mailto:trust@openmarket.app`. We respond to every report. Categorically out-of-scope reports get a polite no with a citation to this policy.

### Investigation

For Tier 1 violations (malware, illegal, CSAM, imminent harm) we act fast and explain after.

For everything else we act slow and explain first:
- Notice to the developer with a copy of the report and the rule we think applies.
- 7 days for response (3 days for time-sensitive matters).
- Decision with a written reason citing this policy + the rule version.

### Appeals

Every action is appealable. Appeals get a written response within 5 business days. If we cannot resolve your appeal, the final outcome and a written explanation go into the public transparency log so the community can audit our work.

Appeal at: dev portal → app → "File an appeal" (or `mailto:appeals@openmarket.app` if your account is suspended).

### Government / legal requests

We comply with valid legal process and we publish counts in the transparency report. We will not honor informal "requests" to remove content without a court order or DMCA-equivalent process. We will, where legal, notify the affected developer before complying.

---

## Changes to this policy

When this policy changes:

- Substantive changes get a 30-day notice period before they take effect, posted on this page and on the transparency report.
- Editorial / clarifying changes go in immediately and are noted in the changelog at the bottom of this page.
- Old versions are kept in git so the version cited in any transparency-log entry can be looked up.

---

## Contact

- General trust & safety: `trust@openmarket.app`
- Appeals: `appeals@openmarket.app`
- Legal / DMCA: `legal@openmarket.app` (see also our [DMCA policy](/dmca))
- Security disclosures: `security@openmarket.app` (see [Security](/security))
- Press: `press@openmarket.app`

---

## Changelog

- **v2026.04.30** — Initial publication. Draft, pending lawyer review of §1.2 (illegal content) and §3 (process).
