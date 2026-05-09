# Two-factor authentication (deferred to Phase 2)

> **Status:** the Better Auth two-factor plugin ships in our `better-auth` dependency but is intentionally NOT enabled. This document describes the path to turning it on when we're ready.

## Why deferred

Per the original [implementation plan](../IMPLEMENTATION-PLAN.md) §P1-O, 2FA is "required for publishing privilege in v2 but optional in v1". Phase 1 close-out shipped the higher-leverage P1-O subset (sign-in rate limit, sign-out everywhere, account-merge by verified email, GitHub OAuth on the storefront) — 2FA waits for the v2 cycle when we can do it properly:

1. Schema migration adding `two_factor` (per Better Auth) + matching Drizzle types.
2. Dev-portal enrollment UI: TOTP secret display, QR-code render (otpauth URI), backup-code download flow.
3. Recovery flow: lost-device account-recovery via email-verified backup codes.
4. Storefront enrollment surface (lower priority — most storefront users are read-only).

Turning the plugin on without (2) and (3) leaves users in a state where they can enable 2FA but can't recover from a lost device, which is a worse UX than no 2FA.

## When to ship

The trigger is the v2 launch criteria:
- Real publisher revenue flowing (the `developers.isAdmin` and active-publisher accounts have something worth protecting).
- A documented account-recovery runbook in [`disaster-recovery.md`](./disaster-recovery.md).
- A designed enrollment + recovery UX in the dev-portal (3 screens minimum: enroll, verify, lost-device).

## How to ship (when the time comes)

```ts
// services/api/src/lib/auth.ts
import { twoFactor } from "better-auth/plugins/two-factor";

export const auth = betterAuth({
  // ...existing config
  plugins: [
    twoFactor({
      // Issuer label shown in authenticator apps
      issuer: "OpenMarket",
      // Backup codes: 10 single-use codes per enrollment
      backupCodes: {
        enabled: true,
      },
      // OTP window tolerance (default 1 = ±30s; bump to 2 in dev if needed)
      skipVerificationOnEnable: false,
    }),
  ],
});
```

Then:
1. `pnpm --filter @openmarket/db generate` — produces a migration adding `two_factor`.
2. `pnpm --filter @openmarket/db migrate` against `$DATABASE_URL_DIRECT`.
3. Update `services/api/src/middleware/admin.ts` to require 2FA-verified sessions for admin actions (Better Auth exposes `session.twoFactorVerified`).
4. Build the dev-portal enrollment flow (TOTP secret + QR + backup codes).
5. Add a Playwright spec covering enrollment + sign-in + lost-device recovery.

## What stays in Phase 1

- Sign-in rate limit (5/min/IP, 3/hr/IP for sign-up) — Block 2A. ✅
- Sign-out everywhere (`POST /users/me/sessions/revoke-all`) — Block 2E. ✅
- Account-merge by verified email — Better Auth's `databaseHooks.user.create.after` already merges on email match (see `services/api/src/lib/auth.ts:88-130`). Verified by the existing `users.test.ts` "creates a profile on first sign-in" test. ✅
- Storefront Google + GitHub OAuth — Block 4D. ✅

The four items above carry the load for Phase 1's account-security surface. 2FA is a v2 feature.
