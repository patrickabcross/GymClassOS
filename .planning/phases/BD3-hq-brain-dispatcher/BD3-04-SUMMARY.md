---
phase: BD3
plan: "04"
subsystem: hqd-owner-send-action
tags:
  - hqd
  - whatsapp
  - zod-strict
  - member-exclusion
  - pg-boss
  - agent-chat
  - copy-out-fork
dependency_graph:
  requires:
    - BD3-03 (sendOwnerMessage orchestrator, HqWabaClient, mockHqWabaClient)
    - BD2-06 (getBoss() in apps/hq via @gymos/queue)
    - BD2-05 (hq-worker boot pattern, provision-studio queue model)
  provides:
    - send-owner-whatsapp defineAction (member-excluded .strict() schema)
    - OwnerSendSchema export (unit-testable without getBoss/getHqDb)
    - HQD system-prompt constraint in apps/hq agent-chat.ts
    - hq-owner-send pg-boss queue handler (registerOwnerSend)
    - HQ_WABA_PHONE_NUMBER_ID + HQ_WABA_API_TOKEN optional env vars
  affects:
    - BD3-05 (HQB console builds on same hq-worker)
    - BD4 (GOD pattern mirrors HQD producer/consumer split)
tech_stack:
  added: []
  patterns:
    - .strict() Zod schema structural member exclusion (D-08)
    - TDD RED->GREEN for action schema tests
    - Copy-out fork of Nitro plugin (dispatchAgentChatPlugin has no suffix option)
    - Injected HqWabaClient + deferred-on-external-dependency mock (D-13)
    - Terminal vs transient error classification in queue handler (gate errors: swallow; others: re-raise)
key_files:
  created:
    - apps/hq/actions/send-owner-whatsapp.ts
    - apps/hq/actions/send-owner-whatsapp.test.ts
    - services/hq-worker/src/queues/hq-owner-send.ts
  modified:
    - apps/hq/server/plugins/agent-chat.ts (copy-out fork, HQD_CONSTRAINT appended)
    - apps/hq/MODIFICATIONS.md (BD3-04 copy-out ledger entry)
    - apps/hq/vitest.config.ts (include: actions/**/*.test.ts added)
    - services/hq-worker/src/index.ts (hq-owner-send in createQueue loop + registerOwnerSend)
    - services/hq-worker/src/lib/env.ts (HQ_WABA_PHONE_NUMBER_ID + HQ_WABA_API_TOKEN optional)
decisions:
  - "vitest.config.ts extended to include actions/**/*.test.ts: existing config only covered server/**/*.test.ts; action schema tests have no server/DB dependency and fit naturally under actions/"
  - "agent-chat.ts copy-out fork (not wrapper): dispatchAgentChatPlugin is a pre-instantiated Nitro plugin object; createAgentChatPlugin accepts systemPrompt but the re-exported plugin does not. Only copy-out allows injecting HQD_CONSTRAINT into the assembled system prompt."
  - "DISPATCH_BASE_PROMPT copied verbatim from packages/dispatch/src/server/plugins/agent-chat.ts to preserve upstream systemPrompt; HQD_CONSTRAINT appended after. MODIFICATIONS.md records the origin path and merge guidance."
  - "Terminal gate errors (OwnerNoOptInError / OwnerWindowExpiredError / OwnerTemplateNotApprovedError) are swallowed in the queue handler (logged + return without re-raise). These are operator-config errors, not transient failures — wasting pg-boss retries on them would spam logs and delay legitimate retry capacity."
  - "crypto.randomUUID() used for messageId in action run (matches BD2-06 decision; nanoid not in @gymos/hq deps)."
metrics:
  duration: 397s
  completed: "2026-06-19"
  tasks: 3
  files: 8
---

# Phase BD3 Plan 04: HQD Owner-Send Action Summary

HQD dispatcher action (`send-owner-whatsapp`) with `.strict()` structural member exclusion, 16-test schema proof, HQD system-prompt constraint copy-out forked into `agent-chat.ts`, and the `hq-owner-send` pg-boss queue registered in hq-worker — all using the gate-ordered `sendOwnerMessage` orchestrator from BD3-03 with the mock WABA client (deferred-on-external-dependency, D-13).

## What Was Built

### Task 1: send-owner-whatsapp action + .strict() schema test (c8d6ba71)

`apps/hq/actions/send-owner-whatsapp.ts` — `defineAction` exporting `OwnerSendSchema` (named const for test imports) and `default` (the action).

**Schema shape (D-08 structural member exclusion):**

```typescript
export const OwnerSendSchema = z.object({
  studioId: z.string().min(1),        // HQ registry ID → owner contact in hq_whatsapp_opt_in
  topic: z.enum([...5 B2B topics...]), // system/product only
  payload: z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), body: z.string().min(1).max(4096) }),
    z.object({ type: z.literal("template"), name: z.string().min(1),
                vars: z.record(z.string(), z.string()), language: z.string().default("en_US") }),
  ]),
}).strict(); // ANY unknown field (e.g. memberId) → ZodError at parse time
```

**run**: generates `messageId = crypto.randomUUID()`, enqueues `{ studioId, messageId, payload }` to `"hq-owner-send"` via `getBoss().send(...)` with `expireInSeconds: 600, retryLimit: 3`.

`apps/hq/actions/send-owner-whatsapp.test.ts` — 16 tests covering:

- Happy-path: text payload, template payload, language default, all 5 topic enum values
- Structural member exclusion (D-08 proof): `memberId`, `memberEmail`, `memberPhone`, `to`, any extra field → ZodError
- Topic enum enforcement (invalid, empty string)
- Discriminated union enforcement (text without body, template without name, unknown type)
- Required field validation (empty studioId, missing studioId)

`apps/hq/vitest.config.ts` — `include` extended to `["server/**/*.test.ts", "actions/**/*.test.ts"]`.

### Task 2: HQD system-prompt constraint — agent-chat.ts copy-out fork (673c8540)

`apps/hq/server/plugins/agent-chat.ts` — copy-out fork of `packages/dispatch/src/server/plugins/agent-chat.ts`. The `dispatchAgentChatPlugin` is a pre-instantiated Nitro plugin with no `systemPromptSuffix` option. The fork calls `createAgentChatPlugin` directly with:

- `appId: "dispatch"`, `resolveOrgId`, `actions: dispatchActions` (unchanged from upstream)
- `systemPrompt: DISPATCH_BASE_PROMPT + HQD_CONSTRAINT`

**HQD_CONSTRAINT text:**

```
HQD CONSTRAINT: You may only send messages to gym-owners about GymClassOS
product features, system updates, onboarding guidance, or aggregate performance
insights (never quoting specific member counts from a studio's data unless
derived from their own telemetry snapshot). You MUST NEVER send a message that
references, implies knowledge of, or derives from any specific gym member,
booking, conversation, or any PII. HQ Neon contains only aggregate telemetry
and studio registry data — never member records.
```

`apps/hq/MODIFICATIONS.md` updated with BD3-04 copy-out ledger entry including origin path and upstream merge guidance.

### Task 3: hq-owner-send queue handler + worker registration (6bc32482)

`services/hq-worker/src/queues/hq-owner-send.ts` — exports `registerOwnerSend(boss, client)`:

- Mirrors `registerProvisionStudio` pattern exactly
- Calls `sendOwnerMessage({ studioId, messageId, payload, db, client })` from BD3-03
- Terminal gate error classification: `OwnerNoOptInError / OwnerWindowExpiredError / OwnerTemplateNotApprovedError` → logged + swallowed (no retry)
- All other errors → re-raised for pg-boss retry (transient)

`services/hq-worker/src/index.ts`:

- `"hq-owner-send"` added to `createQueue` loop
- WABA client selection: `env.HQ_WABA_PHONE_NUMBER_ID && env.HQ_WABA_API_TOKEN ? createHqWabaClient(...) : mockHqWabaClient`
- `registerOwnerSend(boss, wabaClient)` called after watchdog registration

`services/hq-worker/src/lib/env.ts`:

- `HQ_WABA_PHONE_NUMBER_ID: z.string().min(1).optional()` — set after Meta WABA registration
- `HQ_WABA_API_TOKEN: z.string().min(1).optional()` — set after Meta WABA registration

## Verification Results

- `pnpm -F @gymos/hq exec vitest run send-owner-whatsapp`: **16/16 tests pass**
- `pnpm -F @gymos/hq exec tsc --noEmit`: **CLEAN**
- `pnpm -F @gymos/hq-worker exec tsc --noEmit`: **CLEAN**
- `guard:hqd-no-worker-import`: **PASSED** — no HQ code imports from services/worker
- `guard:hq-fork-boundary`: **PASSED** — no apps/hq imports reach into templates/

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Extended vitest.config.ts to include actions/**/*.test.ts**
- **Found during:** Task 1 (RED phase)
- **Issue:** Plan places the test at `apps/hq/actions/send-owner-whatsapp.test.ts` but vitest.config.ts only covered `server/**/*.test.ts`. The test would be discovered by the plan's verify command but silently skipped by `pnpm -F @gymos/hq test`.
- **Fix:** Added `"actions/**/*.test.ts"` to the `include` array.
- **Files modified:** `apps/hq/vitest.config.ts`
- **Commit:** c8d6ba71

### Agent-chat.ts: Path (a) unavailable — copy-out fork performed

Open Question 1 in the research (inspection of `dispatchAgentChatPlugin` options) resolved:

- `dispatchAgentChatPlugin` is a pre-instantiated Nitro plugin object exported directly from `packages/dispatch/src/server/index.ts`. There is no `systemPromptSuffix`, `additionalInstructions`, or similar option available.
- `createAgentChatPlugin` (the factory) accepts `systemPrompt?: string` but calling it directly requires replicating the `appId`, `resolveOrgId`, and `actions` arguments from the upstream plugin.
- Result: copy-out fork performed (Path b from plan). MODIFICATIONS.md updated per plan requirements.

## Known Stubs

- **`createHqWabaClient`** in `services/hq-worker/src/lib/hq-waba-client.ts`: throws `deferred-on-external-dependency` (carried from BD3-03). Live HQD sends are blocked on Meta WABA registration. The worker defaults to `mockHqWabaClient` when `HQ_WABA_PHONE_NUMBER_ID` / `HQ_WABA_API_TOKEN` are absent.

## Live WABA Send Status

DEFERRED-ON-EXTERNAL-DEPENDENCY (D-13) — carried from BD3-03:
- Requires HQ second phone number registration in Meta Business Manager
- Requires Meta approval of HQ owner-comms templates (2-7 day lead time)
- `hq-owner-send` queue: built, registered, and mock-tested; live sends enabled by setting `HQ_WABA_PHONE_NUMBER_ID` + `HQ_WABA_API_TOKEN` as Fly secrets

## Requirements Fulfilled

- HQD-02: The dispatcher agent can request an owner send through `send-owner-whatsapp` — a `defineAction` whose Zod schema `.strict()` structurally excludes any member-target field. 16 unit tests prove the exclusion.
- HQD-03: The send routes through the BD3-03 gate-ordered chokepoint (`sendOwnerMessage`) via the `hq-owner-send` pg-boss queue. The system-prompt constraint (defense-in-depth) reinforces the operator-comms boundary.

## Self-Check: PASSED

Files exist:
- apps/hq/actions/send-owner-whatsapp.ts — FOUND
- apps/hq/actions/send-owner-whatsapp.test.ts — FOUND
- apps/hq/server/plugins/agent-chat.ts — FOUND (contains HQD CONSTRAINT)
- services/hq-worker/src/queues/hq-owner-send.ts — FOUND (exports registerOwnerSend)
- services/hq-worker/src/index.ts — FOUND (contains hq-owner-send in createQueue loop + registerOwnerSend)

Commits exist:
- c8d6ba71 — Task 1: send-owner-whatsapp action + .strict() schema + test
- 673c8540 — Task 2: HQD system-prompt constraint (agent-chat.ts copy-out fork)
- 6bc32482 — Task 3: hq-owner-send queue handler + worker registration
