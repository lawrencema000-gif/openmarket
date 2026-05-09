# Disaster Recovery (P1-T)

> **Audience:** OpenMarket on-call. **Trigger:** any incident classified SEV-1 (data loss or storefront down) per [`MASTER-PLAN.md` §4.1](../MASTER-PLAN.md#41-incident-response). **Authoritative file:** this one — keep it green.

OpenMarket's blast-radius primitives:

| Layer | Loss surface | Recovery floor |
|---|---|---|
| **Postgres** (Neon) | Apps, releases, users, moderation log, transparency log | Neon point-in-time restore (PITR) — 7d on free, 30d on Pro |
| **Object storage** (R2) — `openmarket-artifacts` | APK / AAB binaries | Cross-region mirror (TODO) + immutable upload-key naming (sha256 in path) makes re-upload safe |
| **Object storage** (R2) — `openmarket-media` | Icons, screenshots, OG images | Same mirror; deterministic content-hash keys mean a clean re-render reproduces the same URLs |
| **Search index** (Meilisearch) | Search queries | Rebuildable from Postgres in under 10 min — no backups needed |
| **Queue** (Upstash Redis / BullMQ) | In-flight jobs | Re-run the source commit's enqueue call after a wipe; no persistence promise |
| **Email queue** (Resend / DevLog) | Outbound transactional emails | Resend provides 30d log + replay; no local state |

The two surfaces with real recovery work are Postgres and R2. Everything else is rebuildable from Postgres.

---

## Postgres — point-in-time restore

### What Neon gives us by default
- **Free tier:** PITR over the last 7 days. One default branch (`main`).
- **Pro tier (recommended for prod):** PITR over the last 30 days. Branching is unlimited and instant.
- **Backups are automatic.** Neon snapshots the storage layer continuously; "restore" is creating a new branch off a timestamp.

### The drill (do this every quarter)
1. From the [Neon console](https://console.neon.tech), select project `steep-lake-46221364`.
2. Branches → **Create branch** → "Branch from a point in time" → pick a timestamp ~24h ago.
3. The new branch gets its own `DATABASE_URL`. Note both the pooled and direct strings.
4. From a fresh shell:
   ```bash
   export DATABASE_URL_DIRECT="<the-new-direct-url>"
   pnpm --filter @openmarket/db studio
   ```
5. Confirm tables exist + row counts roughly match prod's snapshot. **Do not** point the API at this branch — it's a sanity-check artifact only.
6. Delete the branch when done.

A successful drill is a SEV-3 win; a failed one means we shipped a schema change without a migration file (see Migration baseline below) and the restored branch's schema is out of sync with the code in main. **In that case you stop everything and run `pnpm --filter @openmarket/db generate` against main.**

### When prod is actually broken

#### Scenario: a query mutated rows it shouldn't have
1. Page on-call. Open a SEV-2.
2. Identify the timestamp of the bad query from `admin_actions` + Vercel Function logs.
3. Branch from 5 minutes BEFORE that timestamp.
4. Compare the two branches with [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview) side-by-side or write a one-shot SQL script that diffs the affected tables.
5. Apply the corrected rows back to main as a normal `UPDATE`. Document in a postmortem.

**Do NOT** repoint `DATABASE_URL` at the recovery branch. Rolling back the entire DB to a 5-minute-old state would lose every legitimate write that happened in between. Surgical row-level repair only.

#### Scenario: someone dropped a table
1. Same as above, branch from before the drop.
2. `pg_dump --table=<name>` from the recovery branch.
3. `pg_restore` into main.

---

## Object storage — cross-region mirror (TODO)

### Current state
- Bucket `openmarket-artifacts` is single-region. R2 replicates within a region for durability but does not mirror across regions automatically.
- Object keys are **content-addressable**: `artifacts/{appId}/{releaseId}/{sha256-prefix}.apk`. Re-uploading the same APK lands at the same key — no orphaned artifacts.

### What ships when this section turns green
1. **Cross-region replication.** A scheduled job in `services/notify-worker` (or a Cloudflare Worker on a cron) replicates `openmarket-artifacts` to a second R2 region (us-east → eu-central is the proposed pair).
2. **Replication audit.** Daily check writes a row to `admin_actions` with action `dr.replication.audit` and metadata `{ delta, oldestUnreplicated }`. Alerts when `delta > 100` or `oldestUnreplicated > 6h`.
3. **Failover runbook.** When the primary region is down: change the R2 binding in API env (one Vercel env var update + a redeploy ~2 min) to point at the mirror. Signed URLs will hit the new region transparently.

### Until then
The only data we can't reconstitute is APK binaries. Mitigation: developers **always** keep a local copy of every APK they upload (the dev-portal explicitly tells them this on the upload page — TODO copy update). If we lose `openmarket-artifacts`, the practical recovery is to email every active developer asking them to re-upload their latest stable release. The transparency log + scan history reconstruct from Postgres regardless.

---

## Migration baseline

Drizzle migrations live under [`packages/db/drizzle/`](../../packages/db/drizzle/). The baseline (`0000_*.sql`) was generated 2026-05-07 against the schema as it stood after Block 1.5. Every schema change from here on **must** ship as a generated migration:

```bash
# After editing files under packages/db/src/schema/:
pnpm --filter @openmarket/db generate    # writes a new 000N_*.sql
pnpm --filter @openmarket/db migrate     # applies pending migrations to $DATABASE_URL_DIRECT
```

`db:push` remains the dev-loop convenience for local Docker DBs; **do not** use it against Neon. A push against Neon that disagrees with the latest committed migration is the exact incident this runbook is designed to recover from.

---

## Drill cadence

| Drill | Cadence | Owner |
|---|---|---|
| Postgres PITR (create branch + verify schema) | Quarterly | On-call |
| Storage replication delta read | Weekly (auto via cron) + monthly manual | On-call |
| Migration baseline regen-and-diff (`pnpm --filter @openmarket/db generate` against current schema; should produce no changes) | Per-release | Engineer shipping the release |

---

## Open work tracked elsewhere

- The cross-region R2 mirror cron — Block 4C scope.
- Upstash → secondary Redis failover — out of Phase 1 scope; queue jobs are idempotent and can re-run.
- Backup of Better Auth `auth_session` table to enable account-recovery on prod loss — covered by Postgres PITR (auth tables live in the same DB).
