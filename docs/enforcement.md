# Enforcement — How Policy is Applied

## Enforcement Ladder

Actions are applied in escalating order. Each action requires documented reason.

1. **Warning** — specific violation cited, developer notified, no app impact
2. **Delist release** — specific version removed from marketplace, app stays published with previous version
3. **Freeze updates** — app stays published but no new versions can be uploaded
4. **Suspend developer** — all apps frozen, no publishing activity allowed
5. **Appeal** — developer may appeal any action, human review within 5 business days

## Moderation Principles

- **Behavior, not viewpoint** — we evaluate what an app does, not what it says
- **Proportional response** — match the action to the severity
- **Documented reasons** — every moderation action logged with reason and moderator
- **Appeal rights** — every action is appealable
- **Transparency** — developers see exactly why an action was taken

## Emergency Actions

For critical malware findings, an emergency delist removes an app from all surfaces immediately. This bypasses the normal ladder and is logged as an emergency action. The developer is notified and may appeal.

## Audit Log

Every moderation action is recorded in an append-only audit log:
- Timestamp
- Moderator ID
- Action taken
- Target (app/release/developer)
- Reason
- Appeal status
