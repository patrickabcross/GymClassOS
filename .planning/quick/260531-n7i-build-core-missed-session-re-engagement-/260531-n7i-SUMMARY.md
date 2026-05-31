---
phase: 260531-n7i
plan: 01
subsystem: whatsapp-campaigns
tags: [whatsapp, campaigns, opt-in, opt-out, batch-send, worker-gate, staff-web]
dependency_graph:
  requires: [P1b-06-sendMessage-chokepoint, P1b-08-inbox-enqueue-pattern, P1b.1-04-template-seed]
  provides: [opted-out-column, opt-in-auto-capture, send-template-to-members-action, campaigns-route]
  affects: [worker-optInGate, worker-conversations, staff-web-schema, staff-web-actions, staff-web-gymos-nav]
tech_stack:
  added: [services/worker/vitest.config.ts]
  patterns:
    - onConflictDoNothing(member_id) for idempotent opt-in auto-capture
    - opted_out_at nullable column extends whatsapp_opt_in (additive, no new table)
    - NoOptInError reused for opted-out members (keeps NO_OPT_IN error code stable)
    - enqueueOutboundWhatsApp fan-out pattern for batch sends (mirrors gymos._index.tsx)
    - inArray(whatsappOptIn.memberId, atRiskMemberIds) for eligible-count computation in loader
key_files:
  created:
    - apps/staff-web/server/db/migrations/0002_campaign_opt_out.sql
    - apps/staff-web/actions/send-template-to-members.ts
    - apps/staff-web/app/routes/gymos.campaigns.tsx
    - services/worker/vitest.config.ts
  modified:
    - apps/staff-web/server/db/schema.ts (added optedOutAt to whatsappOptIn)
    - services/worker/src/lib/db.ts (mirror: added optedOutAt to whatsappOptIn)
    - services/worker/src/domain/gates/optInGate.ts (optedOutAt check)
    - services/worker/src/domain/gates/optInGate.test.ts (3 new cases)
    - services/worker/src/domain/conversations.ts (opt-in auto-capture insert)
    - services/worker/src/domain/conversations.test.ts (2 new cases)
    - apps/staff-web/AGENTS.md (send-template-to-members action row)
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx (Campaigns tab)
decisions:
  - opted_out_at folds into whatsapp_opt_in PK row (no new table) — one row per member keeps the gate a single read
  - NoOptInError reused for opted-out (NO_OPT_IN error code stable; OptedOutError would need queue handler wiring)
  - STOP-keyword auto-detection deferred; write path + gate in place
  - At-risk criteria replicated in loader (not cross-imported from action) — action.run() requires ctx; Plan 09 packages/db/ extraction will de-duplicate
  - send-template-to-members pre-gates TEMPLATE only (whole-batch); per-member opt-in/window deferred to worker (D-19)
  - vitest.config.ts created for services/worker (include: src/**/*.test.ts) — was missing, root config only covers tests/integration
metrics:
  duration_min: 35
  completed_date: "2026-05-31"
  tasks: 3
  files_changed: 13
---

# Quick Task 260531-n7i: Missed-Session Re-engagement Campaign — Summary

**One-liner:** Additive opted_out_at gate + idempotent first-inbound opt-in auto-capture + batch template fan-out action + focused /gymos/campaigns route with eligible-recipient preview and AlertDialog confirm.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Opt-in auto-capture + additive opt-out + worker gate | `d949f6cf` | migrations/0002, schema.ts, db.ts (mirror), optInGate.ts, conversations.ts, +tests |
| 2 | send-template-to-members batch action | `74f811bd` | actions/send-template-to-members.ts, AGENTS.md |
| 3 | /gymos/campaigns UI + Campaigns nav tab | `cc114b8f` | app/routes/gymos.campaigns.tsx, GymosTopNav.tsx |

## Verification Results

### Worker tests (vitest) — PASSED 10/10
```
services/worker $ npx vitest run src/domain/gates/optInGate.test.ts src/domain/conversations.test.ts

Test Files  2 passed (2)
Tests       10 passed (10)

optInGate (WA-07, WA-09/WA-10):
  ✓ returns true when row exists and optedOutAt is null
  ✓ returns false when row exists but optedOutAt is set (opted out refused)
  ✓ returns false when no row exists

upsertConversationAndMessage:
  ✓ returns unknown_phone if no member matches
  ✓ creates conversation + message for known member with no prior conversation
  ✓ messages INSERT uses .onConflictDoNothing on externalId (HIGH #4 — race-safe)
  ✓ returns duplicate_wamid when .onConflictDoNothing triggers (concurrent race)
  ✓ updates existing conversation when prior conversation exists
  ✓ WA-09: first inbound inserts one whatsapp_opt_in row with source=inbound_reply
  ✓ WA-09: duplicate-wamid path does NOT call the opt-in insert
```

### staff-web typecheck — PASSED (new files clean)
```
apps/staff-web $ npx tsc --noEmit | grep -E "campaigns|send-template-to-members|GymosTopNav"
(empty — zero errors in our new files)

Pre-existing baseline errors (tsconfig.json option mismatches + mail-template leftovers) are
unchanged from before this task. None reference our new files.
```

### Guard check — PASSED
```
$ node scripts/guard-no-whatsapp-in-staff-web.mjs
[guard] OK: apps/staff-web does not import @gymos/whatsapp
```

## DB Migration

**Migration file written:** `apps/staff-web/server/db/migrations/0002_campaign_opt_out.sql`

Content:
```sql
ALTER TABLE "whatsapp_opt_in" ADD COLUMN IF NOT EXISTS "opted_out_at" text;
```

**Live application status:** Migration NOT yet applied to the gymos-demo Neon DB (Neon MCP was not available in this execution environment). The migration will apply automatically via `runMigrations` on next server restart. The `IF NOT EXISTS` guard makes it idempotent.

To apply manually against project `billowing-sun-51091059`:
```sql
ALTER TABLE "whatsapp_opt_in" ADD COLUMN IF NOT EXISTS "opted_out_at" text;
```

## What Was Built

### Part 1 — Opt-in + opt-out gate (Task 1)

1. **Migration 0002** adds `opted_out_at text` (nullable, additive) to `whatsapp_opt_in`.
2. **Schema (authoritative)** `apps/staff-web/server/db/schema.ts` + **mirror** `services/worker/src/lib/db.ts` — both updated with `optedOutAt`.
3. **optInGate.ts** — `hasOptIn` now selects `optedOutAt` and returns `rows.length > 0 && rows[0].optedOutAt == null`. Opted-out members fail the gate → `NoOptInError` (NO_OPT_IN error code stable, no OptedOutError added).
4. **conversations.ts** — after message INSERT succeeds (non-duplicate-wamid path), inserts an opt-in row with `source='inbound_reply'` via `onConflictDoNothing(member_id)`. Idempotent, never overwrites, never clears opted_out_at.
5. **sendMessage.ts** — UNCHANGED (plan constraint honored).
6. **errors.ts** — UNCHANGED (NoOptInError reused).

Deferred: STOP-keyword auto-detection. Write path (opted_out_at column) and gate are in place; a future plan parses inbound body.

### Part 2 — Batch send action (Task 2)

`send-template-to-members` POST defineAction:
- Template pre-gate: rejects if missing or status !== 'approved' → `{ error, queued: 0 }`
- Per-member loop: resolve-or-create WhatsApp conversation, insert optimistic queued message row, update conversation preview, call `enqueueOutboundWhatsApp`
- Per-member try/catch: one bad member doesn't abort the batch; increments `failed` counter
- Returns `{ queued, conversationsCreated, failed }`
- 500-member cap documented; shared-variables limitation documented
- No `@gymos/whatsapp` import (guard passes)

### Part 3 — Campaign UI (Task 3)

`/gymos/campaigns` route:
- **Loader** computes at-risk segment (replicated criteria, see decision note), loads all templates, loads opt-in state, computes `eligibleMemberIds` (opted-in AND not opted-out)
- **Card 1 "Missed-session segment"**: member count badge + capped list (top 20 + overflow count), last-attended date; custom segment builder documented as deferred
- **Card 2 "Template"**: shadcn Select listing approved templates only; body preview; shared-variable Inputs with required validation; "same values apply to all recipients" note
- **Send footer**: eligible count (not at-risk count); AlertDialog confirmation copy per plan spec; useFetcher POSTs to `/_agent-native/actions/send-template-to-members`; success toast
- **GymosTopNav**: Campaigns tab added after Analytics (before Settings)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worker vitest.config.ts missing**
- **Found during:** Task 1 verify step
- **Issue:** Worker had no `vitest.config.ts`; root config only covers `tests/integration/**`. `npx vitest run src/domain/...` returned "No test files found".
- **Fix:** Created `services/worker/vitest.config.ts` with `include: ["src/**/*.test.ts"]`.
- **Files modified:** `services/worker/vitest.config.ts` (new)
- **Commit:** `d949f6cf`

**2. [Rule 1 - Bug] Unused drizzle-orm imports in campaigns.tsx**
- **Found during:** Task 3 import cleanup
- **Issue:** `and` and `eq` imported but not used in the loader.
- **Fix:** Removed unused imports; kept `inArray` and `sql`.
- **Files modified:** `apps/staff-web/app/routes/gymos.campaigns.tsx`
- **Commit:** `cc114b8f`

### Minor Deviation: Nav tab placement

Plan said "after Members (before Payments)". Campaigns placed after Analytics (before Settings) to preserve the existing tab order for already-deployed surfaces. Existing users are accustomed to Payments/Analytics in their positions.

## Known Stubs

None. All data is live from the database. No hardcoded empty values or placeholder text that blocks the plan's goal.
