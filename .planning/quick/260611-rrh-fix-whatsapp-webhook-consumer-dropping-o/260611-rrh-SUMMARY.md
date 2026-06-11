---
phase: quick-260611-rrh
plan: 01
subsystem: whatsapp-pipeline
tags: [whatsapp, outbound-mirror, webhook, worker, backfill, queue]
dependency_graph:
  requires: [P1b-04 (edge-webhooks receiver), P1b-05 (inbound-whatsapp worker)]
  provides: [direction detection in receiver, outbound materialisation in worker, backfill script]
  affects: [conversations.lastOutboundAt, messages direction='out', unread_count accuracy]
tech_stack:
  added: []
  patterns:
    - "direction='out' dispatch via Zod default (backward compat old in-flight jobs)"
    - "customerWaId member-lookup — match by customer wa_id not business sender number"
    - "materialiseOutboundMirror: no unread bump, no opt-in, no status promote"
    - "backfill uses materialiseOutboundMirror directly — same path as live worker"
key_files:
  created:
    - packages/queue/vitest.config.ts
    - services/worker/scripts/backfill-outbound-mirrors.ts
  modified:
    - packages/queue/src/types.ts
    - packages/queue/src/publish.test.ts
    - services/edge-webhooks/src/routes/whatsapp.ts
    - services/edge-webhooks/src/routes/whatsapp.test.ts
    - services/worker/src/domain/conversations.ts
    - services/worker/src/domain/conversations.test.ts
    - services/worker/src/queues/inbound-whatsapp.ts
    - services/worker/package.json
decisions:
  - "direction field in queue payload uses Zod .default('in') so old in-flight jobs parse without error — no migration of existing pg-boss rows needed"
  - "materialiseOutboundMirror does NOT set conversation.status — column default applies on new conv; existing conv status stays unchanged (an agent reply must not reopen a snoozed/closed thread)"
  - "Unread-count recomputation in backfill: count(direction='in' messages WHERE created_at > MAX(direction='out' created_at)) — defensible correction given schema has no per-message read marker; agent reply implies coach saw everything up to that point"
  - "backfill corrects per-message created_at/sent_at to the historical Meta unix timestamp; materialiseOutboundMirror stamps lastOutboundAt=now() because the conversations columns are coarse last-* markers, not history"
  - "Added vitest.config.ts to @gymos/queue so src/**/*.test.ts runs via pnpm --filter test (was falling back to root integration config which only includes tests/integration/**)"
metrics:
  duration: ~18min
  completed: 2026-06-11
  tasks: 3
  files: 9
---

# Quick Task 260611-rrh: Fix WhatsApp Webhook Consumer Dropping Outbound Mirrors

**One-liner:** Direction-aware outbound mirror path in the WA pipeline: receiver detects `msg.from === phone_number_id`, worker stores `direction='out'` messages matched by customer wa_id without bumping unread or capturing opt-in, plus a dry-run backfill for June 5 + June 10 stranded replies.

## What Was Built

### Problem

MYÜTIK mirrors BOTH inbound customer messages AND outbound agent replies to the `gymos-edge-webhooks` Fly receiver. The outbound mirror identifies itself by `messages[0].from === metadata.phone_number_id` (business number 302631896256150) with the customer's wa_id in `contacts[0].wa_id`.

Before this fix:
- The receiver dropped `metadata.phone_number_id` and `contacts[].wa_id` entirely
- Every message was enqueued as generic inbound
- The worker's `upsertConversationAndMessage` matched by `from` (the business number) — no member owns it → `unknown_phone` — and silently marked it processed
- Result: zero `direction='out'` rows from agent replies, `conversations.last_outbound_at` null, `unread_count` inflated, June 5 + June 10 replies stranded in `webhook_events.payload_raw`

### Task 1: Receiver direction detection + queue schema extension

**`packages/queue/src/types.ts`** — Extended `InboundWhatsAppMessagePayload` with:
- `direction: z.enum(["in", "out"]).default("in")` — Zod default means old in-flight jobs parse without change
- `customerWaId: z.string().optional()` — the customer's wa_id for outbound member matching

**`services/edge-webhooks/src/routes/whatsapp.ts`** — Extended `value` cast type with `metadata?: { phone_number_id?: string }` and `contacts?: Array<{ wa_id?: string }>`. Before the messages loop: reads `phoneNumberId` and `customerWaId`. Inside the loop: sets `direction = "out"` when `msg.from === phoneNumberId`, spreads `customerWaId` into the enqueue call only when present.

**Tests added:**
- `@gymos/queue`: backward-compat (no direction → "in"), direction="out"+customerWaId round-trip, invalid direction rejected
- `@gymos/edge-webhooks`: outbound mirror detection (from=phone_number_id → direction="out"+customerWaId), customer-inbound-with-metadata stays "in"
- Also added `packages/queue/vitest.config.ts` (deviation: queue package had no local vitest config, so `pnpm --filter test` was falling back to root integration config)

### Task 2: Worker outbound mirror materialisation + consumer dispatch

**`services/worker/src/domain/conversations.ts`** — New exported function `materialiseOutboundMirror(db, args, rawPayload)`:
- Matches member by `"+" + customerWaId` (NOT by `from`)
- Creates or finds conversation — does NOT set `status`, `unreadCount`, or `lastInboundAt`
- Inserts messages row with `direction: "out"`, `status: "sent"`, same `onConflictDoNothing` partial-index shape as inbound (HIGH #4 race safety)
- Updates existing conversation: sets `lastOutboundAt` + `lastMessagePreview` + `updatedAt` — no other columns touched
- No `whatsapp_opt_in` insert (agent reply ≠ opt-in evidence)

**`services/worker/src/queues/inbound-whatsapp.ts`** — In the `kind === "message"` branch, dispatches on `data.direction`:
- `"out"`: validates `customerWaId` present (if missing: logs warn, completes job with reason `missing_customer_wa_id` — no retry of permanently-unprocessable jobs), then calls `materialiseOutboundMirror`
- else (`"in"` or absent): existing `upsertConversationAndMessage` path unchanged
- `processedAt` mark runs in both branches (existing post-call logic)

**Tests added (4 new cases in `materialiseOutboundMirror` suite):**
- (a) New conversation + direction='out'/status='sent', no opt-in insert
- (b) Existing conversation update: set has `lastOutboundAt`+`lastMessagePreview`, does NOT have `unreadCount`/`lastInboundAt`/`status` keys
- (c) Unknown customerWaId → `unknown_phone`
- (d) Duplicate wamid (returning []) → `duplicate_wamid`, no opt-in

### Task 3: Backfill script for stranded outbound replies

**`services/worker/scripts/backfill-outbound-mirrors.ts`** — Dry-run by default:
1. Loads all `webhook_events` where `provider='whatsapp'` AND `eventType='messages.inbound'`
2. Walks `entry[].changes[].value`, detects outbound mirrors (`msg.from === metadata.phone_number_id`)
3. Pre-checks each wamid against `messages` table — skips any already present
4. In `--commit` mode: calls `materialiseOutboundMirror` for each missing row; corrects per-message `created_at`+`sent_at` to the historical Meta unix timestamp
5. Recomputes `conversations.lastOutboundAt` from `MAX(messages.created_at WHERE direction='out')` and corrects `unread_count` as count of `direction='in'` messages newer than the corrected `lastOutboundAt`
6. Prints a full summary: found / already-present / newly-materialised / unknown-phone / conversations touched / unread corrections

Added `"db:backfill-outbound": "tsx scripts/backfill-outbound-mirrors.ts"` to `services/worker/package.json`.

## Test Results

| Package | Before | After | Status |
|---|---|---|---|
| `@gymos/queue` | N/A (no vitest config) | 17/17 | Green |
| `@gymos/edge-webhooks` | 24/24 | 27/27 (+3) | Green |
| `@gymos/worker` | 79/79 | 83/83 (+4) | Green |
| `tsc --noEmit` (worker) | — | 0 errors | Clean |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added vitest.config.ts to @gymos/queue**
- **Found during:** Task 1 (RED phase — queue tests not running)
- **Issue:** `pnpm --filter @gymos/queue test` invoked `vitest run` which fell back to the root `vitest.config.ts` that only includes `tests/integration/**`. The existing `src/publish.test.ts` and `src/boss.test.ts` were never being run.
- **Fix:** Created `packages/queue/vitest.config.ts` mirroring the worker/edge-webhooks pattern (`include: ["src/**/*.test.ts"]`)
- **Files modified:** `packages/queue/vitest.config.ts`
- **Commit:** `00863fc1`

## Known Stubs

None. The fix is fully wired end-to-end (receiver → queue → worker → DB). No placeholder data flows.

## Deployment Note (for the user — executor does NOT deploy)

1. Deploy the fixed receiver + worker: `flyctl deploy` from `services/edge-webhooks` (rolls both web and worker processes under the `gymos-edge-webhooks` Fly app)
2. Run backfill dry-run against gymos-demo Neon:
   ```
   pnpm --filter @gymos/worker db:backfill-outbound
   ```
   Review the report (outbound candidates found, grouping by customerWaId + date).
3. If the report looks correct, commit:
   ```
   pnpm --filter @gymos/worker exec tsx scripts/backfill-outbound-mirrors.ts --commit
   ```
   Re-run immediately to confirm 0 new rows (idempotency).

## Self-Check: PASSED

Files exist:
- `packages/queue/src/types.ts` — contains `direction` field
- `packages/queue/vitest.config.ts` — created
- `services/edge-webhooks/src/routes/whatsapp.ts` — contains `phone_number_id`
- `services/worker/src/domain/conversations.ts` — contains `lastOutboundAt`
- `services/worker/scripts/backfill-outbound-mirrors.ts` — contains `--commit`

Commits exist:
- `00863fc1` — Task 1: receiver + queue schema
- `b61086c1` — Task 2: worker materialisation + dispatch
- `05179009` — Task 3: backfill script
