---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 06
subsystem: whatsapp
tags: [whatsapp, pg-boss, drizzle, vitest, chokepoint, gates, opt-in, 24h-window, templates]

# Dependency graph
requires:
  - phase: P1b-03
    provides: "@gymos/whatsapp adapter (sendText, sendTemplate) + @gymos/queue OutboundWhatsAppPayload + QUEUE_NAMES.OUTBOUND_WHATSAPP"
  - phase: P1b-02
    provides: "whatsapp_opt_in, whatsapp_templates tables + partial UNIQUE on messages.external_id"
  - phase: P1b-05
    provides: "apps/worker bootstrap (boss.start + boss.work pattern), lib/db.ts schema mirror, lib/errors.ts typed errors (NoOptInError, WindowExpiredError, TemplateNotApprovedError)"
provides:
  - "apps/worker/src/domain/sendMessage.ts — THE single chokepoint for outbound WhatsApp (D-10, WA-05)"
  - "Three pure gate primitives in apps/worker/src/domain/gates/ (windowGate, optInGate, templateGate)"
  - "outbound-whatsapp pg-boss queue handler at concurrency=1 (D-14)"
  - "Status state machine: queued -> sent (2xx) | failed (4xx terminal) | retry (5xx transient)"
  - "Phone normalisation: strip leading + from E.164 before passing to Meta API"
affects: [P1b-08 staff-web Send action, P1b-09 validation cutover, P2 outbound reminders, P2 outbound notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chokepoint pattern: single function (sendMessage) composes three gates in order BEFORE adapter call"
    - "Pure-function gate where possible (windowGate is pure; optInGate / templateGate are pure reads)"
    - "Typed-error refusal: NoOptInError / WindowExpiredError / TemplateNotApprovedError carry a typed .code for UI mapping"
    - "Thenable Drizzle mock pattern: mockResolvedValueOnce on the terminal .limit(1) (or .where()) instead of mocking .then directly"
    - "Local schema mirror extension: add new tables to apps/worker/src/lib/db.ts alongside the carryover (whatsappOptIn, whatsappTemplates)"

key-files:
  created:
    - apps/worker/src/domain/sendMessage.ts
    - apps/worker/src/domain/sendMessage.test.ts
    - apps/worker/src/domain/gates/windowGate.ts
    - apps/worker/src/domain/gates/windowGate.test.ts
    - apps/worker/src/domain/gates/optInGate.ts
    - apps/worker/src/domain/gates/optInGate.test.ts
    - apps/worker/src/domain/gates/templateGate.ts
    - apps/worker/src/domain/gates/templateGate.test.ts
    - apps/worker/src/queues/outbound-whatsapp.ts
  modified:
    - apps/worker/src/index.ts (one-line import + one-line register call)
    - apps/worker/src/lib/db.ts (mirror added whatsappOptIn + whatsappTemplates)

key-decisions:
  - "Gate ordering locked: opt-in -> window -> template-approved. Window gate only consulted for free-text; templates bypass window."
  - "4xx-from-Meta is TERMINAL at the sendMessage layer (writes status='failed' + returns externalId=''). 5xx re-throws so pg-boss retries. The outer queue handler does not need a second 4xx path."
  - "Typed gate refusals at the queue layer are also terminal (no retry will succeed) — UPDATE messages.status='failed' with the typed .code, return normally to mark job complete."
  - "Language default 'en_US' applied at sendMessage call site (payload.language ?? 'en_US') instead of forwarding undefined — SendTemplateArgs output type requires string."
  - "pg-boss v12 concurrency=1 achieved via batchSize=1 + localConcurrency=1 (v12 dropped v11's teamSize/teamConcurrency, continued from P1b-05 deviation)."

patterns-established:
  - "Drizzle mock pattern (Plan 06): mock the terminal chain method (.limit, .where) with mockResolvedValueOnce — Drizzle's query builder is thenable, so awaiting calls the chain's .then(resolve) directly."
  - "Defence-in-depth gate ordering (D-19): worker re-checks all gates even when staff-web pre-gates, because UI state can be stale between staff click and worker pickup."
  - "Single chokepoint contract (D-10): exactly one function imports @gymos/whatsapp, every outbound flows through it. Guard enforced by scripts/guard-no-whatsapp-in-staff-web.mjs."

requirements-completed: [WA-05, WA-06, WA-07, WA-08, WA-09]

# Metrics
duration: 8min
completed: 2026-05-20
---

# Phase P1b Plan 06: Worker sendMessage Chokepoint Summary

**Single outbound-WhatsApp chokepoint with three ordered gates (opt-in -> 24h-window -> template-approved) wired into pg-boss outbound-whatsapp queue at concurrency=1 — every Meta API call now goes through this one function.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-20T17:04:34Z
- **Completed:** 2026-05-20T17:12:00Z
- **Tasks:** 3
- **Files created:** 9
- **Files modified:** 2
- **New tests:** 18 (7 windowGate + 2 optInGate + 2 templateGate + 9 sendMessage)
- **Total worker tests:** 32/32 green

## Accomplishments

- **sendMessage chokepoint (D-10, WA-05):** the SINGLE call site of `@gymos/whatsapp` in the worker. Composes the three gates in order, then calls `sendText` or `sendTemplate`. Writes the status state machine result back to `messages` + `conversations.last_outbound_at`.
- **Three pure gate primitives (Task 1):** `windowGate.ts` (pure function, no DB), `optInGate.ts` (reads `whatsapp_opt_in`), `templateGate.ts` (reads `whatsapp_templates WHERE status='approved'`). Each independently testable.
- **outbound-whatsapp queue (Task 3):** registered in `apps/worker/src/index.ts` next to the inbound handler. `batchSize=1 + localConcurrency=1` (D-14 concurrency=1).
- **All four P1b success-criteria gate scenarios** covered by unit tests:
  - WA-07: `throws NoOptInError + does NOT call adapter when opt-in missing` (success #4)
  - WA-06: `throws WindowExpiredError + does NOT call adapter for text outside window` (success #3)
  - WA-06 + WA-08: `allows template send OUTSIDE window` (template-bypass happy path)
  - WA-08: `throws TemplateNotApprovedError for unapproved template name`
- **Status state machine wired:** `queued -> sent` (2xx), `queued -> failed` (4xx terminal — `errorCode` populated, no retry), `queued -> {retry}` (5xx — re-throw, pg-boss retries).

## Task Commits

Each task was committed atomically with TDD red/green pairing where applicable:

1. **Task 1 (TDD RED):** failing tests for three gates — `a6cddf28` (test)
2. **Task 1 (TDD GREEN):** windowGate + optInGate + templateGate impl — `e195b272` (feat)
3. **Task 2 (TDD RED):** failing tests for sendMessage chokepoint — `01876319` (test)
4. **Task 2 (TDD GREEN):** sendMessage chokepoint with all 3 gates + status state machine — `96c69507` (feat)
5. **Task 3:** outbound-whatsapp queue handler wired into worker index — `1f2840d9` (feat)

**Plan metadata:** (to be added — docs commit follows SUMMARY)

## Files Created

- `apps/worker/src/domain/gates/windowGate.ts` — Pure `isInWindow(lastInboundAt, now)` + `WINDOW_HOURS = 24` constant
- `apps/worker/src/domain/gates/windowGate.test.ts` — 7 tests (null, just-now, 23h59m, 24h boundary, 24h01s, 48h, constant)
- `apps/worker/src/domain/gates/optInGate.ts` — `hasOptIn(memberId, db)` → reads `whatsapp_opt_in`
- `apps/worker/src/domain/gates/optInGate.test.ts` — 2 tests (hit + miss)
- `apps/worker/src/domain/gates/templateGate.ts` — `isTemplateApproved(name, db)` → reads `whatsapp_templates WHERE status='approved'`
- `apps/worker/src/domain/gates/templateGate.test.ts` — 2 tests (approved hit + missing)
- `apps/worker/src/domain/sendMessage.ts` — THE chokepoint: 3 gates -> adapter -> status update
- `apps/worker/src/domain/sendMessage.test.ts` — 9 tests covering all gates, status paths, phone normalisation, 4xx/5xx handling
- `apps/worker/src/queues/outbound-whatsapp.ts` — pg-boss handler at concurrency=1

## Files Modified

- `apps/worker/src/index.ts` — added `import { registerOutboundWhatsAppWorker }` + `await registerOutboundWhatsAppWorker(boss)` after the inbound registration
- `apps/worker/src/lib/db.ts` — extended local schema mirror with `whatsappOptIn` + `whatsappTemplates` (carryover pattern; Plan 09 extracts `packages/db/`)

## Concurrency Profile

After Plan 06:

| Queue                | batchSize | localConcurrency | Reasoning                                              |
| -------------------- | --------- | ---------------- | ------------------------------------------------------ |
| `inbound-whatsapp`   | 5         | 5                | D-14 inbound concurrency=5 (Plan 05)                   |
| `outbound-whatsapp`  | 1         | 1                | D-14 outbound concurrency=1 (rate-limit headroom)      |
| `stripe-event`       | (—)       | (—)              | Plan 07 will register                                  |

## End-to-End Outbound Trace (Behavioural Expectation)

Once Plan 08 ships the staff-web Send action, the trace looks like:

1. Staff clicks Send in `/gymos` inbox → staff-web action inserts `messages` row with `status='queued'`, then calls `enqueueOutbound({ messageId, memberId, payload })` (Plan 03 publish.ts uses `singletonKey: 'outbound-whatsapp:msg_<id>'` for D-13 dedup).
2. pg-boss assigns the job to the outbound-whatsapp worker (concurrency=1).
3. Handler calls `sendMessage()`. Inside:
   - `hasOptIn(memberId, db)` → if false, throw NoOptInError. Handler UPDATEs `status='failed', error_code='NO_OPT_IN'`. Job marked complete.
   - Member + conversation loaded.
   - `isInWindow(lastInboundAt)` for text → if false, throw WindowExpiredError. Handler UPDATEs `status='failed', error_code='WINDOW_EXPIRED'`.
   - `isTemplateApproved(name)` for templates → if false, throw TemplateNotApprovedError. Handler UPDATEs `status='failed', error_code='TEMPLATE_NOT_APPROVED'`.
   - Adapter called (`sendText` or `sendTemplate`). On 2xx → `messages.status='sent', external_id=<wamid>, sent_at=NOW()`. On 4xx → `messages.status='failed', error_code=<message>`. On 5xx → re-throw (pg-boss retries).
   - `conversations.last_outbound_at` bumped on success.
4. Inbound webhook (Plan 04 + Plan 05) later receives `delivered`/`read` status webhooks and ordinal-advances `messages.status` via `applyOrdinalStatusUpdate`.

## Notes for Plan 08 (staff-web Send action)

- **Enqueue target:** `QUEUE_NAMES.OUTBOUND_WHATSAPP` (string literal: `"outbound-whatsapp"`).
- **Payload shape:** `OutboundWhatsAppPayload` from `@gymos/queue` (already Zod-validated by the worker). Fields: `{ messageId, memberId, payload: { type: 'text'|'template', ... } }`.
- **SingletonKey format:** `outbound-whatsapp:msg_<id>` — already applied by `@gymos/queue/publish.ts` per D-13. Staff-web must NOT generate its own singletonKey.
- **Pre-flight checks (UX):** staff-web SHOULD pre-check opt-in + window state (read-only) to disable the Send button / nudge to template flow, but MUST NOT skip the worker layer. The worker re-checks (D-19 defence in depth) because the staff-web cache can be stale.
- **24h window UX:** the staff-web composer (per CONTEXT.md "Failed message bubble copy") should render the failed bubble when `messages.error_code IN ('WINDOW_EXPIRED', 'NO_OPT_IN', 'TEMPLATE_NOT_APPROVED')`. The typed `.code` values are stable: `NO_OPT_IN`, `WINDOW_EXPIRED`, `TEMPLATE_NOT_APPROVED`.

## Decisions Made

- **Gate order locked at sendMessage call site, not in queue handler.** This ensures the same gate semantics apply if any future caller (e.g. a cron-triggered class-reminder sender in P2) goes through the same chokepoint.
- **4xx-from-Meta is handled INSIDE sendMessage**, not in the queue handler. Reason: keeps the chokepoint contract simple — it returns successfully (with `externalId=''`) when the send is terminal-failed, throws only for transient errors. The queue handler only needs to wrap gate-error UPDATEs.
- **The queue handler catches typed gate errors and writes `status='failed'` itself**, even though sendMessage already writes `status='failed'` for the 4xx-from-Meta path. The split is intentional: sendMessage owns the post-Meta-call state; the queue owns the pre-Meta-call (gate-refusal) state. Cleaner than threading `errorCode` back through sendMessage's return value.
- **Drizzle mock pattern rewritten** from the plan's `.then` mock to `.limit(1).mockResolvedValueOnce(rows)` — Drizzle's query builder is a thenable, so awaiting calls `.then(resolve)` directly with the rows array. Mocking the terminal chain method matches the runtime shape.
- **`language` default applied at the chokepoint** (`payload.language ?? 'en_US'`) instead of forwarding undefined. SendTemplateArgs output type requires `string` (Zod `.default()` resolves on output type). One-line fix; runtime behaviour identical to the adapter's internal Zod parse.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pg-boss v12 WorkOptions keys (continued from P1b-05)**
- **Found during:** Task 3 (outbound-whatsapp handler registration)
- **Issue:** Plan literal `teamSize: 1, teamConcurrency: 1` doesn't compile against pg-boss v12 — those keys were dropped in the v11→v12 migration (already documented in P1b-05 SUMMARY).
- **Fix:** Used `{ batchSize: 1, localConcurrency: 1 }` matching the v12 surface. D-14 concurrency=1 semantic preserved.
- **Files modified:** `apps/worker/src/queues/outbound-whatsapp.ts`
- **Verification:** `pnpm --filter @gymos/worker typecheck` exits 0; `pnpm --filter @gymos/worker build` emits `dist/queues/outbound-whatsapp.js`.
- **Committed in:** `1f2840d9` (Task 3 commit)

**2. [Rule 3 - Blocking] `SendTemplateArgs.language` requires string (not string | undefined)**
- **Found during:** Task 2 (sendMessage typecheck)
- **Issue:** Plan example `language: payload.language` fails typecheck because `OutboundWhatsAppPayload.payload.template.language` is `string | undefined`, but `SendTemplateArgs.language` is the Zod `.default()` output type (resolved to required `string`).
- **Fix:** Applied explicit fallback `language: payload.language ?? "en_US"` matching the adapter's internal Zod default. Updated the matching test assertion from `language: undefined` to `language: "en_US"`.
- **Files modified:** `apps/worker/src/domain/sendMessage.ts`, `apps/worker/src/domain/sendMessage.test.ts`
- **Verification:** Typecheck clean; test still asserts the adapter received the correct shape.
- **Committed in:** `96c69507` (Task 2 commit)

**3. [Rule 2 - Missing Critical] Local schema mirror needed `whatsappOptIn` + `whatsappTemplates`**
- **Found during:** Task 1 (windowGate impl + gate tests)
- **Issue:** `apps/worker/src/lib/db.ts` is the local Postgres-dialect Drizzle mirror (carryover pattern from P1b-04/05 — see project decisions). It only mirrored `webhook_events`, `gym_members`, `conversations`, `messages`. The two new gates needed `whatsapp_opt_in` and `whatsapp_templates`.
- **Fix:** Extended the mirror with both tables (matching apps/staff-web schema) and added them to the exported `schema` object. Plan 09 will extract `packages/db/` and eliminate this duplication.
- **Files modified:** `apps/worker/src/lib/db.ts`
- **Verification:** Gate tests pass with the schema reference; typecheck clean.
- **Committed in:** `a6cddf28` (Task 1 RED commit — schema mirror change was prerequisite to gates compiling)

**4. [Rule 1 - Mock fidelity bug] Test mock pattern wrong against thenable Drizzle builder**
- **Found during:** Task 1 (initial RED for optInGate/templateGate tests)
- **Issue:** Plan example mocked `selectChain.then.mockResolvedValueOnce(row)`, but Drizzle's query builder is a Promise-like; awaiting the chain calls `.then(resolve, reject)` with the rows array. My impl uses `.limit(1)` as the terminal then awaits — so the `then` mock was bypassed and tests resolved with `undefined`.
- **Fix:** Mocked the terminal `.limit(1)` call directly via `mockResolvedValueOnce([row])`. Same pattern applied to sendMessage.test.ts.
- **Files modified:** `apps/worker/src/domain/gates/optInGate.test.ts`, `apps/worker/src/domain/gates/templateGate.test.ts`, `apps/worker/src/domain/sendMessage.test.ts`
- **Verification:** All 11 gate tests + 9 sendMessage tests pass.
- **Committed in:** `e195b272` (Task 1 GREEN — tests adjusted as part of the green pass; documented here as a deviation from the plan's literal test code)

---

**Total deviations:** 4 auto-fixed (1 missing critical mirror, 2 blocking type fixes, 1 mock-fidelity correction)
**Impact on plan:** All deviations preserve the plan's stated semantics. The pg-boss v12 rename was already documented as a P1b-05 carryover. The language type fix matches the adapter's runtime default. The schema mirror extension is a known Plan 09 cleanup target. No scope creep.

## Issues Encountered

- None beyond the four deviations above.

## User Setup Required

None — Plan 06 ships internal worker code only. No new env vars, no external service config. The `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` env vars consumed by `@gymos/whatsapp` were already validated by `getEnv()` (P1b-03 / P1b-05).

## Next Phase Readiness

**Ready for Plan P1b-07 (worker stripe-event reducer):**
- Same `apps/worker/` bootstrap; same pattern (register another `boss.work()` in `apps/worker/src/index.ts` after the outbound registration).
- Same local schema mirror pattern (Plan 07 will need `stripe_customers`, `stripe_subscriptions`, `payments` — those are already in apps/staff-web/schema; mirror them in apps/worker/src/lib/db.ts like this plan did for the WhatsApp tables).

**Ready for Plan P1b-08 (staff-web outbound rotation):**
- Send action enqueues `QUEUE_NAMES.OUTBOUND_WHATSAPP` with `OutboundWhatsAppPayload`.
- Pre-flight UX hints: read `whatsapp_opt_in` + `conversations.last_inbound_at` to render Send button state. But MUST NOT skip the worker chokepoint — it's the source of truth (D-19 defence in depth).
- Failed-bubble copy can map directly off `messages.error_code`:
  - `NO_OPT_IN` → "Member hasn't opted in to WhatsApp"
  - `WINDOW_EXPIRED` → "24h window closed — send an approved template instead"
  - `TEMPLATE_NOT_APPROVED` → "Template not approved by Meta"

**Blockers:** None.

## Self-Check: PASSED

**Files verified (12/12 FOUND):**
- apps/worker/src/domain/sendMessage.ts
- apps/worker/src/domain/sendMessage.test.ts
- apps/worker/src/domain/gates/{windowGate,optInGate,templateGate}.ts + .test.ts (6 files)
- apps/worker/src/queues/outbound-whatsapp.ts
- apps/worker/src/index.ts (modified)
- apps/worker/src/lib/db.ts (modified)
- .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-06-worker-sendmessage-chokepoint-SUMMARY.md (this file)

**Commits verified (5/5 FOUND):**
- a6cddf28 (test RED Task 1)
- e195b272 (feat GREEN Task 1)
- 01876319 (test RED Task 2)
- 96c69507 (feat GREEN Task 2)
- 1f2840d9 (feat Task 3)

---
*Phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks*
*Plan: 06*
*Completed: 2026-05-20*
