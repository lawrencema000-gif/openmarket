# In-app products (IAP) runbook (P4-B)

OpenMarket apps can sell three kinds of in-app products on top of the base app purchase price (P4-A):

- **consumable** — repurchasable. Each successful purchase records a new `iap_purchases` row. No uniqueness across `(user, product)`. Examples: coin packs, extra-life unlocks.
- **non_consumable** — buy-once entitlement. Purchase endpoint refuses a second buy while a `completed` row exists for the same `(user, product)`. Examples: "remove ads", "pro tier unlock".
- **subscription** — recurring Stripe subscription. Lifecycle (trialing → active → canceled etc.) mirrored onto the `iap_purchases` row by the `customer.subscription.*` webhooks.

## Schema

| Table             | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `app_iap_products`| One row per product. Unique SKU per app. Soft-deleted via `active`. |
| `iap_pricing`     | Per-country price rows, mirror of `app_pricing`. Same resolver (`resolvePriceForCountry`). |
| `iap_purchases`   | One row per attempt. Carries `stripeSubscriptionId` + subscription lifecycle fields when `type=subscription`. |

Migration: `packages/db/drizzle/0025_*.sql`.

## Product lifecycle

```bash
# Developer creates a product (status='pending' until pricing exists)
POST /api/apps/:id/iap-products
{
  "sku": "com.example.app.coins.100",
  "type": "consumable",
  "name": "100 coins",
  "description": "Top up your wallet."
}

# Developer sets per-country pricing
PATCH /api/apps/:id/iap-products/:productId/pricing
{
  "rows": [
    { "countryCode": "default", "priceCents": 99, "currency": "USD", "active": true },
    { "countryCode": "BR",      "priceCents": 499, "currency": "BRL", "active": true }
  ]
}

# Public lists active products with resolved per-country prices
GET /api/apps/:id/iap-products?country=DE
→ { products: [{ id, sku, name, type, price: { priceCents, currency, countryCode }, ... }] }

# User purchases — routes through Stripe Checkout when adapter is live
POST /api/iap-products/:productId/purchase
{ "countryCode": "DE" }
→ { purchase: { id }, checkout: { url } | null, note? }
```

## Subscription specifics

When `type=subscription`, the product also carries:

| Field                       | Notes                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `subscriptionInterval`      | `day` / `week` / `month` / `year`. Required by zod refinement.|
| `subscriptionIntervalCount` | 1–12. "Every N intervals" (1 month, 6 months, 12 months…).  |
| `trialDays`                 | 0–30. Free-trial length before first charge.                |

The Checkout Session is created in `mode: "subscription"` by the future `StripeBackedAdapter` (the Noop adapter throws `StripeNotConfiguredError`). Stripe then issues `customer.subscription.created` + `invoice.payment_succeeded` after the trial ends — the webhook handlers we shipped flip the `iap_purchases` row through the lifecycle.

### Webhook events handled

| Event                            | Effect on `iap_purchases`                                  |
| -------------------------------- | ---------------------------------------------------------- |
| `checkout.session.completed`     | flips `status=completed` + sets `completedAt` + captures `stripeSubscriptionId` from `session.subscription` |
| `customer.subscription.created`  | mirrors `subscriptionStatus`, `currentPeriodEnd`, `cancelAtPeriodEnd` (idempotent with `updated`) |
| `customer.subscription.updated`  | same as created                                            |
| `customer.subscription.deleted`  | flips `subscriptionStatus=canceled`                        |
| `payment_intent.payment_failed`  | flips `status=failed` on the matching app or IAP row       |
| `charge.refunded`                | flips `status=refunded` (covers out-of-band Stripe refunds) |

All handlers are idempotent — a re-delivered event finds the row already in the target state and 200s with `applied: false`.

## Storefront UX

The `<IapRail>` component (`apps/market-web/src/components/iap-rail.tsx`) renders nothing when an app has no active products. For apps with products it shows a list of cards — per-product name + description + type badge (consumable / one-time / subscription with interval) + price + buy button. Subscription cards also surface the free-trial length when set.

Buy-button paths:
- **Signed-out** → sign-in link
- **Signed-in + Stripe live** → POST purchase, redirect to `checkout.url`
- **Signed-in + Stripe Noop** → API note rendered inline ("Stripe Checkout not configured on this deploy")

## Dev-portal UX

`apps/dev-portal/src/app/apps/[id]/iap/page.tsx`:
- Create form with SKU + type + name + description, plus conditional subscription fields
- Product list with deactivate action (soft-delete)
- Per-product pricing is a follow-up screen (same pattern as app pricing)

## Operational notes

- **Consumable refund**: refunding a consumable purchase doesn't restore the consumed entitlement automatically — the app's own ledger handles that. Document this in the dev-facing API spec when the docs site ships.
- **Subscription dunning**: `past_due` → `unpaid` → `canceled` is Stripe-driven. We mirror state but don't decide; the app can read `iap_purchases.subscriptionStatus` to gate features.
- **Currency mixing**: pricing rows carry their own currency. A single product can quote USD globally and BRL locally — the resolver picks per request.
- **Webhook lag**: there's a sub-second window between `checkout.session.completed` and the first `customer.subscription.created`. If the latter arrives first (rare), the handler 200s with `applied: false` and Stripe retries; the row gets populated by the .completed event then the next .updated.

## Verification

```bash
pnpm --filter @openmarket/contracts test -- iap
# 13 tests: schema validation + SKU rules + subscription refinements

pnpm --filter @openmarket/api test -- iap
# 13 tests: GET/POST/PATCH/DELETE routes + purchase path edges

# End-to-end with Stripe CLI
stripe listen --forward-to localhost:3001/api/stripe/webhook
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```
