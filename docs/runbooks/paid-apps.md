# Paid apps + refund window runbook (P4-A start, P3-I)

OpenMarket supports per-country app pricing + a self-serve refund window. This block ships the data model + the developer pricing CRUD + the public price-resolution + the refund-eligibility helper. Stripe Checkout / webhook integration is the follow-up block — until it ships, the purchase endpoint records `pending` rows and there's no actual payment flow.

## TL;DR

```bash
# Dev sets per-country pricing + refund window
PATCH /api/apps/:id/pricing
{
  "rows": [
    { "countryCode": "default", "priceCents": 999, "currency": "USD", "active": true },
    { "countryCode": "DE", "priceCents": 899, "currency": "EUR", "active": true },
    { "countryCode": "JP", "priceCents": 95000, "currency": "JPY", "active": true }
  ],
  "refundWindowHours": 24
}

# Storefront resolves the right price per viewer
GET /api/apps/:id/pricing?country=DE
→ { isPaid: true, price: { priceCents: 899, currency: "EUR", countryCode: "DE" }, ... }

# User requests refund — auto-approves inside the window
POST /api/purchases/:id/refund
{ "reason": "didn't run on my device" }
→ { autoApproved: true, eligibility: { reason: "auto-eligible", ... } }
```

## Schema

### app_pricing

One row per (app, country). The `default` country code is the catch-all when no exact match exists.

| Column        | Type    | Notes                                                          |
| ------------- | ------- | -------------------------------------------------------------- |
| id            | uuid    | pk                                                             |
| appId         | uuid    | FK apps, cascade delete                                        |
| countryCode   | text    | ISO 3166-1 alpha-2 OR the literal `default`                    |
| priceCents    | int     | minor units; cents for USD, ¢ for JPY (modelled × 100 uniformly) |
| currency      | text    | ISO 4217 ("USD", "EUR", "JPY", ...)                            |
| active        | bool    | soft-disable; inactive rows ignored by resolver                |
| createdAt     | tz      | —                                                              |
| updatedAt     | tz      | —                                                              |

Unique index on `(appId, countryCode)` — devs update in place, not by piling up duplicate rows.

### purchases

One row per purchase attempt. v1 stub creates rows with `status='pending'`; the future Stripe webhook flips to `completed` / `failed` / `refunded`.

| Column                   | Type    | Notes                                                          |
| ------------------------ | ------- | -------------------------------------------------------------- |
| id                       | uuid    | pk                                                             |
| userId                   | uuid    | FK users                                                       |
| appId                    | uuid    | FK apps                                                        |
| priceCents               | int     | minor units, frozen at purchase time                           |
| currency                 | text    | frozen at purchase time                                        |
| countryAtPurchase        | text    | nullable; preserved so relocation doesn't change refund math   |
| status                   | enum    | `pending` / `completed` / `refunded` / `failed`                |
| stripePaymentIntentId    | text    | nullable; populated by the Stripe block                        |
| purchasedAt              | tz      | row creation time                                              |
| completedAt              | tz      | nullable                                                       |
| refundedAt               | tz      | nullable                                                       |
| refundReason             | text    | nullable                                                       |

Indexes:
- `(userId, purchasedAt)` — user's purchase history
- `(appId, purchasedAt)` — dev-portal revenue page
- `(stripePaymentIntentId)` — webhook correlation

### apps.refundWindowHours

Nullable integer. Hours after purchase during which a buyer can self-refund.

| Value      | Meaning                                                 |
| ---------- | ------------------------------------------------------- |
| `null`     | Manual review only — no auto-refund                     |
| `0`        | Refunds disabled entirely                               |
| `2`        | Play Store standard                                     |
| `24`       | Generous (most paid apps default here)                  |
| `48`       | Steam-style                                             |

## Pricing resolution

The pure helper `resolvePriceForCountry(rows, country)` lives in `packages/contracts/src/pricing.ts`:

1. **Exact country match (active rows only)** — wins.
2. **`default` row (active)** — fallback when no exact match.
3. **null** — app is free.

The route runs the DB query then hands rows to the helper, so tests can exercise resolution without a DB:

```ts
import { resolvePriceForCountry } from "@openmarket/contracts/pricing";

resolvePriceForCountry([
  { countryCode: "US", priceCents: 999, currency: "USD", active: true },
  { countryCode: "default", priceCents: 999, currency: "USD", active: true },
], "JP");
// → { priceCents: 999, currency: "USD", countryCode: "default" }
```

## Refund eligibility

`computeRefundEligibility({ status, purchasedAt, refundWindowHours, now })` is the single source of truth:

| Result                                       | Auto-approve? | Reason            |
| -------------------------------------------- | ------------- | ----------------- |
| status=completed AND now < window            | ✅            | `auto-eligible`   |
| status=completed AND now ≥ window            | ❌            | `window-expired`  |
| status=pending or failed                     | ❌            | `not-completed`   |
| status=refunded                              | ❌            | `already-refunded`|
| refundWindowHours = null                     | ❌            | `no-refund-policy`|
| refundWindowHours = 0                        | ❌            | `refunds-disabled`|

The route auto-approves when `eligible: true` (flips status to `refunded`); otherwise it returns the eligibility result for the storefront to render a "we'll review this" message. Manual-review queue UI lands with the Stripe block.

## Stripe wire-up (next block)

When Stripe is added:

1. POST /apps/:id/purchase creates a Stripe Checkout Session, returns the URL.
2. `purchases.stripePaymentIntentId` populated on session create.
3. Webhook `checkout.session.completed` flips `status=completed` + sets `completedAt`.
4. Webhook `payment_intent.payment_failed` flips `status=failed`.
5. POST /purchases/:id/refund: when `autoApproved: true`, the route calls `stripe.refunds.create()` before flipping `status=refunded`.
6. Manual-review queue (dev-portal page) lists `eligibility.reason !== auto-eligible` requests; resolves via the same refund API with a moderator override flag.

## Operational notes

- **Decimal currencies**: priceCents is the minor unit for the row's currency. ¥9,500 stored as `priceCents=950000 currency=JPY`. Don't shortcut to "JPY has no decimals so store 9500" — the uniform scale keeps math simple and matches Stripe's API model.
- **Country resolution**: viewer country comes from `users.country` (set at signup from IP geolocation). Storefront takes a `?country=` override for testing + admin debugging.
- **Soft-delete pricing**: the PATCH endpoint flips inactive any row not in the incoming set rather than hard-deleting. Keeps audit + revert easy.

## Verification

```bash
pnpm --filter @openmarket/contracts test -- pricing
pnpm --filter @openmarket/api test -- pricing
```

Suite covers: country resolution edges, decimal-currency formatting, refund eligibility for all 6 reasons, route 403/404/409/200/201 paths.
