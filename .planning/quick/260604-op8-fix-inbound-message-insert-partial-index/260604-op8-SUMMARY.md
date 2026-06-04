---
quick_id: 260604-op8
description: Fix inbound message insert (partial-index ON CONFLICT) + promote conversation to open on inbound
date: 2026-06-04
status: complete
commit: 6f70e2a1
---

# Quick Task 260604-op8 — Summary

## Problem (evidence)

After the pg-boss publisher fix (260604-nwb), real inbound reached the worker but
failed. pg-boss `inbound-whatsapp` jobs (16:34:12, 16:34:55) → `state=failed,
retry_count=5`, error `42P10: there is no unique or exclusion constraint matching
the ON CONFLICT specification`.

`conversations.ts` inserted the message with
`onConflictDoNothing({ target: messages.externalId })` → `ON CONFLICT
(external_id) DO NOTHING`, but the unique index is **partial**
(`... (external_id) WHERE external_id IS NOT NULL`). Postgres can't infer a
partial index without the predicate → throws every time. Step 2 (conversation
counter bump) commits before the failing insert, so 5 retries inflated
`unread_count` to 12 while **zero** message rows were written.

Visibility: the test number is a `status='lead'` conversation (06-02 Schedule
Enquiry form); inbox loader defaults to `ne(status,'lead')`, hiding it. Locked
decision: promote to inbox.

## Fix (commit 6f70e2a1)

`services/worker/src/domain/conversations.ts`:
1. Import `sql` from `drizzle-orm`.
2. Message insert now supplies the partial-index predicate:
   `onConflictDoNothing({ target: messages.externalId, where: sql\`${messages.externalId} is not null\` })`
   → `ON CONFLICT (external_id) WHERE external_id is not null DO NOTHING` → matches
   the index, no 42P10. (Drizzle 0.45.2 maps `where` to the conflict-target predicate.)
3. Existing-conversation inbound update sets `status: "open"` — any inbound
   promotes a `lead` (and reactivates closed/snoozed) into the working inbox. The
   new-conversation branch already created status `open`.

## Verification

- `services/worker`: `tsc --noEmit` clean; prettier applied.
- Existing `conversations.test.ts` still green: target assertion checks
  `args?.target` (still defined with `{target, where}`); update assertion checks
  only `unreadCount` (unaffected by adding `status`).

## Deploy + post-deploy check

`fly deploy --config services/edge-webhooks/fly.toml --dockerfile Dockerfile --remote-only .`
(redeploys web + worker; worker carries the fix).

Re-send a real inbound (the earlier 12 failed jobs are dead — never stored; only
new inbound after deploy works). Confirm: a `messages` row (direction='in') for
the sender, conversation `status='open'`, appears in `/gymos/inbox`, and the
pg-boss `inbound-whatsapp` job is `completed`.

## Follow-ups (not in this fix)

- Two identical partial unique indexes on `messages.external_id`
  (`idx_messages_external_id` + `messages_external_id_unique`) — baseline/migration
  drift; prune one later (non-destructive).
- The lead conversation `QQlzCss2O_L-c9dMbUM-g` has a stale inflated
  `unread_count` (12) from the failed retries; optional cosmetic reset.

## Commit

- `6f70e2a1` — fix(worker): inbound message insert ON CONFLICT partial-index predicate + promote conversation to open
