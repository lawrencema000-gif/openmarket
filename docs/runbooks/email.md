# Email runbook

**Stack:** BullMQ queue (`openmarket-notify`) → notify-worker → React Email rendering → transport (Resend in prod, DevLog locally).

## Architecture

```
┌──────────┐    enqueue    ┌─────────────┐    consume     ┌─────────────────┐
│   API    │──────────────▶│  Redis/BullMQ│──────────────▶│  notify-worker  │
└──────────┘   EmailJob    │   queue     │                │  ┌──────────┐   │
                           └─────────────┘                │  │ render   │   │
                                                         │  │ (React   │   │
                                                         │  │  Email)  │   │
                                                         │  └────┬─────┘   │
                                                         │       ▼          │
                                                         │  ┌──────────┐   │
                                                         │  │ Transport│   │
                                                         │  │  Resend  │   │
                                                         │  │   or     │   │
                                                         │  │ DevLog   │   │
                                                         │  └──────────┘   │
                                                         └─────────────────┘
```

**Why queued:** every email goes through Redis so the request that triggered it doesn't block on network I/O. Retries (5 attempts, exponential backoff) and idempotency keys are handled by BullMQ. The API never imports the worker (or React Email) — it only enqueues a typed `EmailJob`.

**Why two transports:** local dev should never accidentally email a real user. `DevLogTransport` writes the rendered HTML + plaintext + metadata to `.email-log/` so you can preview in a browser. Production uses Resend.

## Type-safe enqueue

The contract types live in `packages/contracts/src/email.ts`. Adding a new email:

1. Add the props interface to `email.ts` and register it in `EmailTemplateMap`.
2. Create `services/notify-worker/src/templates/<name>.tsx` exporting a React component + `<Component>.subject` function.
3. Register the component in `services/notify-worker/src/templates/index.ts → TEMPLATES`.
4. Enqueue from anywhere with `enqueueEmail({ template: "<name>", to, props })`.

The compiler enforces that `props` matches the template — typos and missing fields fail at build, not at send time.

## Available templates (P0-D)

| Template | When | Props |
|---|---|---|
| `welcome` | New user signup (post email-verify) | name, ctaUrl |
| `verify-email` | Better Auth email verification | verifyUrl, expiryMinutes |
| `password-reset` | Better Auth password reset | resetUrl, expiryMinutes, ipAddress |
| `release-published` | Release approved + live | appName, version, releaseUrl, riskScore |
| `release-rejected` | Scan rejection | appName, version, reason, findings, fixUrl, appealUrl |
| `report-resolved` | Reporter notification | reportId, targetType, resolution, transparencyUrl |
| `developer-takedown` | App delisted (with appeal CTA) | appName, reason, ruleVersion, rulesUrl, appealUrl |
| `review-response` | Developer replied to user's review | appName, developerName, responseBody, reviewUrl |

## Local development

```bash
# Start the worker
pnpm --filter @openmarket/notify-worker dev

# In another terminal, send a test email via the admin endpoint
curl -X POST http://localhost:3001/api/admin/test-email \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin session cookie>" \
  -d '{"to":"you@example.com","template":"welcome"}'
```

Open `services/notify-worker/.email-log/*.html` in a browser to preview the rendered email.

## Production setup (Resend)

1. **Sign up at https://resend.com.**
2. Create an API key (Account → API Keys → Create). Save it.
3. Add a sending domain (e.g., `mail.openmarket.app`) and complete DNS verification:
   - SPF: `v=spf1 include:amazonses.com ~all`
   - DKIM: 3 CNAMEs Resend provides.
   - MX: optional but recommended for bounce handling.
4. Set env vars in Vercel project for the worker:
   - `RESEND_API_KEY=re_xxxxxxxxxxxx`
   - `EMAIL_FROM=OpenMarket <noreply@mail.openmarket.app>`
   - `EMAIL_REPLY_TO=support@openmarket.app` (optional)
5. Deploy worker (P0-B / Fly.io). Production transport switches automatically when `RESEND_API_KEY` is set.

## Idempotency

`enqueueEmail({ idempotencyKey })` deduplicates jobs in the queue: BullMQ uses the key as the job ID, so a second enqueue with the same key is a no-op while the first is still in-flight or in retention. Use this for any flow that might retry (Better Auth retries verification email sends, OAuth callbacks, webhook handlers).

The transport also passes the key as Resend's `Idempotency-Key` header, so even if the queue dedup fails, Resend won't double-send.

## Better Auth integration

Better Auth's `sendVerificationEmail` and `sendResetPassword` callbacks both enqueue jobs (in `services/api/src/lib/auth.ts`). Auth flows never block on email I/O.

## Troubleshooting

**"Email not arriving" (production)**
1. Check Resend dashboard logs (Account → Logs).
2. Check BullMQ queue with Bull-Board or `redis-cli`: `keys bull:openmarket-notify:*`.
3. Verify `RESEND_API_KEY` is set on the worker.
4. Verify the recipient domain isn't on Resend's bounce list.

**"Email never sent" (local)**
1. Worker not running. Check `pnpm --filter @openmarket/notify-worker dev`.
2. Worker can't reach Redis. `docker compose up -d redis` from `infrastructure/docker/`.

**Render error in worker logs**
Template threw during `renderTemplate`. Most common cause: missing required prop (TypeScript caught at build, but at runtime if the API and worker drift on `EmailTemplateMap`). Re-check `packages/contracts/src/email.ts`.

**HTML email looks broken in dev preview**
React Email Tailwind compilation only runs at render time. Open the `.html` file in a real browser, not in a text editor — most CSS is inlined.

## Tests

```bash
pnpm --filter @openmarket/notify-worker test
```

17 tests cover: every template renders both HTML and plaintext, subjects are dynamic, brand footer is consistent, transport selection from env vars, DevLog transport file output.
