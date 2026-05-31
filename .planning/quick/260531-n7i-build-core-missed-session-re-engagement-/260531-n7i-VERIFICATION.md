---
phase: 260531-n7i
verified: 2026-05-31T17:13:30Z
status: passed
score: 5/5 must-haves verified
---

# Quick Task 260531-n7i: Missed-Session Re-engagement Campaign — Verification Report

**Task Goal:** Build the core missed-session re-engagement campaign — (1) opt-in auto-capture + additive opt-out gate, (2) `send-template-to-members` batch action via existing `enqueueOutboundWhatsApp` path, (3) minimal `/gymos/campaigns` UI.
**Verified:** 2026-05-31T17:13:30Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | First-inbound creates exactly one whatsapp_opt_in row (source='inbound_reply') idempotently via onConflictDoNothing | VERIFIED | conversations.ts lines 136-144; conversations.test.ts WA-09 cases pass |
| 2 | Opted-out member refused by worker gate even when opt-in row exists | VERIFIED | optInGate.ts line 40: `rows[0].optedOutAt == null`; test case "returns false when opted out" passes |
| 3 | Coach can fire one outbound job per member through enqueueOutboundWhatsApp with no @gymos/whatsapp import, no Meta call | VERIFIED | send-template-to-members.ts line 29 imports queue-client; line 148 calls enqueueOutboundWhatsApp; guard passes |
| 4 | Coach can open Campaigns, see at-risk segment, pick approved template, see eligible-recipient count, confirm via AlertDialog, send | VERIFIED | gymos.campaigns.tsx: loader computes eligibleMemberIds (lines 163-176); AlertDialog (lines 452-481) shows counts.eligible |
| 5 | Batch send inserts one optimistic queued message row per recipient so inbox/threads reflect campaign | VERIFIED | send-template-to-members.ts lines 128-137: db.insert(schema.messages) per member with status='queued' |

**Score:** 5/5 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/staff-web/server/db/migrations/0002_campaign_opt_out.sql` | Strictly additive — ADD COLUMN IF NOT EXISTS, nullable, no drop/rename | VERIFIED | Single statement: `ALTER TABLE "whatsapp_opt_in" ADD COLUMN IF NOT EXISTS "opted_out_at" text;` with CLAUDE.md guard comment |
| `services/worker/src/domain/gates/optInGate.ts` | hasOptIn refuses opted-out members (optedOutAt != null returns false) | VERIFIED | Line 40: `rows.length > 0 && rows[0].optedOutAt == null`; selects optedOutAt in the query |
| `apps/staff-web/actions/send-template-to-members.ts` | defineAction, enqueueOutboundWhatsApp fan-out, no @gymos/whatsapp import | VERIFIED | 173 lines; `http: { method: "POST" }`; imports queue-client only; template pre-gate at lines 67-83; per-member loop lines 91-168 |
| `apps/staff-web/app/routes/gymos.campaigns.tsx` | At-risk segment + approved template picker + eligible count + AlertDialog confirm | VERIFIED | 489 lines (well over 120 minimum); loader computes atRisk/templates/eligibleMemberIds; AlertDialog shows counts.eligible |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `conversations.ts` | whatsapp_opt_in | `onConflictDoNothing(memberId)` on first inbound | VERIFIED | Lines 136-144: `db.insert(schema.whatsappOptIn).values({...}).onConflictDoNothing({ target: schema.whatsappOptIn.memberId })` |
| `optInGate.ts` | sendMessage chokepoint | hasOptIn returns false for opted-out → NoOptInError | VERIFIED | Gate line 40 checks `optedOutAt == null`; sendMessage.ts line 58-60 throws NoOptInError on false — sendMessage.ts is UNCHANGED |
| `send-template-to-members.ts` | @gymos/queue enqueueOutboundWhatsApp | per-member fan-out, singletonKey by messageId inside publisher | VERIFIED | Line 29 imports from `queue-client.js`; line 148 calls `enqueueOutboundWhatsApp({ messageId, memberId, payload: {type:"template",...} })` |
| `gymos.campaigns.tsx` | list-at-risk-members + send-template-to-members | loader replicates at-risk criteria; AlertDialog fires POST to action endpoint | VERIFIED | Loader lines 109-151 compute atRisk; useFetcher line 248 posts to `/_agent-native/actions/send-template-to-members` |

---

## Schema Mirror Verification

Both schema definitions updated with `optedOutAt`:

- `apps/staff-web/server/db/schema.ts` line 351: `optedOutAt: text("opted_out_at"),` with WA-09/WA-10 comment
- `services/worker/src/lib/db.ts` line 80: `optedOutAt: text("opted_out_at"),` with sync comment

---

## Behavioral Spot-Checks (Automated Commands)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| optInGate: opted-out member refused | `cd services/worker && npx vitest run src/domain/gates/optInGate.test.ts` | 3/3 tests pass | PASS |
| conversations: first-inbound inserts opt-in row idempotently | `cd services/worker && npx vitest run src/domain/conversations.test.ts` | 7/7 tests pass (incl. WA-09 cases) | PASS |
| Total worker tests | Both files | 10/10 passed (2 test files) | PASS |
| staff-web typecheck (new files clean) | `cd apps/staff-web && npx tsc --noEmit` | Zero output — zero errors | PASS |
| @gymos/whatsapp isolation guard | `node scripts/guard-no-whatsapp-in-staff-web.mjs` | `[guard] OK: apps/staff-web does not import @gymos/whatsapp` | PASS |

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| WA-07 | Opt-in gate — refuse outbound without opt-in row | SATISFIED | optInGate.ts unchanged gate logic + hasOptIn called by sendMessage.ts |
| WA-09 | Opt-in auto-capture on first inbound; opt-out write path | SATISFIED | conversations.ts insert + opted_out_at column migration |
| WA-10 | Opted-out member refused at chokepoint | SATISFIED | optInGate.ts `optedOutAt == null` check |
| RET-01 | Re-engagement campaign send surface for at-risk members | SATISFIED | /gymos/campaigns route + send-template-to-members action |

---

## Anti-Patterns Found

None blocking goal achievement. Observations only:

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `gymos.campaigns.tsx` lines 265-268 | `actionData?.error` branch body is empty (comment only) | Info | Error IS displayed at lines 484-486 in the JSX; the if-block comment is dead code that could be cleaned up, but the error display works |
| `gymos.campaigns.tsx` loader | At-risk criteria replicated inline rather than imported from list-at-risk-members action | Info | Documented in file comments and SUMMARY as a known deviation; plan explicitly approved this approach |

---

## Deviations from Plan — Verified

| Plan Specification | Actual | Assessment |
|-------------------|--------|------------|
| Campaigns tab "after Members (before Payments)" | Placed after Analytics (before Settings) | Acceptable — SUMMARY documented this; existing user tab order preserved |
| `atRiskAction.run()` import approach for loader | Criteria replicated inline (plan-approved fallback) | Acceptable — plan explicitly provided this fallback and it's documented |
| Neon MCP live migration | Migration NOT applied via MCP; will apply via runMigrations on next server restart | Acceptable — IF NOT EXISTS makes it idempotent; no data risk |

---

## Human Verification Required

### 1. /gymos/campaigns end-to-end flow

**Test:** Boot staff-web, visit `/gymos/campaigns`, confirm: at-risk member list renders, approved-template picker shows only approved templates, eligible count is at or below at-risk count, AlertDialog copy mentions the eligible number, Send fires the action.
**Expected:** Page renders without JS errors; eligible count <= atRisk count; AlertDialog body reads "This will queue a WhatsApp template to N members."
**Why human:** Requires running server + real Neon DB with seeded data.

### 2. First-inbound opt-in live capture

**Test:** Send a WhatsApp inbound message from a member with no existing opt-in row; check gymos-demo `whatsapp_opt_in` table for a new row with `source='inbound_reply'` and `opted_out_at IS NULL`.
**Expected:** Exactly one row inserted.
**Why human:** Requires live worker + Meta webhook + Neon DB.

### 3. Opted-out member gate on batch send

**Test:** Manually set `opted_out_at` on a member's opt-in row, trigger a batch campaign send that includes that member, confirm their queued message lands with status='failed' and errorCode contains the NO_OPT_IN indicator.
**Expected:** Worker refuses the opted-out member's job; other members' jobs proceed.
**Why human:** Requires live pg-boss worker + Neon DB mutation.

---

## Summary

All 5 must-have truths verified against actual codebase. All 4 artifacts exist, are substantive (not stubs), and are wired. All 4 key links confirmed by direct code inspection. Worker tests run 10/10 green. Staff-web typecheck is clean (zero errors). @gymos/whatsapp isolation guard passes. No compliance gates removed or bypassed — sendMessage.ts is unchanged, worker opt-in + window + template-approved gates remain authoritative. Migration is strictly additive (one ADD COLUMN IF NOT EXISTS, no drops or renames).

---

_Verified: 2026-05-31T17:13:30Z_
_Verifier: Claude (gsd-verifier)_
