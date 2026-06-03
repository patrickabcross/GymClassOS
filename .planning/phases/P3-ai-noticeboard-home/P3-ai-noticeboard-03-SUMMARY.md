---
phase: P3-ai-noticeboard-home
plan: "03"
subsystem: actions
tags: [actions, defineAction, drizzle, proposals, security, whatsapp, stripe]
dependency_graph:
  requires: [P3-ai-noticeboard-01]
  provides: [propose-action, approve-proposal, reject-proposal]
  affects:
    - apps/staff-web/actions/propose-action.ts
    - apps/staff-web/actions/approve-proposal.ts
    - apps/staff-web/actions/reject-proposal.ts
tech_stack:
  added: []
  patterns:
    - dynamic-import-re-validation
    - action-allowlist-guard
    - guard-allow-unscoped-single-tenant
decisions:
  - "approve-proposal uses dynamic import + mod.default.schema.safeParse() before run() — Pitfall 2 prevention: stored JSON is never trusted"
  - "ACTION_ALLOWLIST hardcoded in approve-proposal — only two actions may ever execute via a proposal; new actions require explicit code change"
  - "No @gymos/whatsapp import in staff-web — execution flows through send-template-to-members -> enqueueOutboundWhatsApp -> worker sendMessage() chokepoint; worker gates (opt-in + 24h window + template-approved) stay in force"
  - "reject-proposal UPDATE guarded by AND status='pending' — prevents double-reject race condition"
key_files:
  created:
    - apps/staff-web/actions/propose-action.ts
    - apps/staff-web/actions/approve-proposal.ts
    - apps/staff-web/actions/reject-proposal.ts
  modified: []
metrics:
  duration_seconds: 519
  completed_date: "2026-06-03"
  tasks_completed: 3
  files_changed: 3
---

# Phase P3 Plan 03: Propose-Approve Handshake Summary

Three `defineAction` POST mutations implementing the propose->approve->execute handshake. The security-critical invariant — that approving a proposal still routes WhatsApp sends through the worker chokepoint — is enforced by construction: `approve-proposal` dynamically imports and calls the existing gated action, never calling Meta or Stripe directly.

## What Was Built

### `apps/staff-web/actions/propose-action.ts`

Agent-callable POST action. Accepts `taskId` (optional), `actionName` (enum: `send-template-to-members` | `create-checkout-link`), `params` (record), and `rationale`. Inserts a `dashboard_proposals` row with `status='pending'`. Returns `{ proposalId }`.

Key details:
- `actionName` enum is the first gate — rejects unknown action names at Zod parse time
- `paramsJson` stored as `JSON.stringify(params)` — the raw JSON is re-validated at approve time, not here
- `guard:allow-unscoped` on INSERT (single-tenant gym table)

### `apps/staff-web/actions/approve-proposal.ts`

Coach-callable POST action. The most security-sensitive file in the plan.

```
proposalId
  -> SELECT ... WHERE id=? AND status='pending'
  -> allowlist check (ACTION_ALLOWLIST)
  -> JSON.parse(paramsJson)
  -> dynamic import of target action module
  -> mod.default.schema.safeParse(rawParams)   ← Pitfall 2 re-validation
  -> mod.default.run(parsed.data)              ← existing gated action
  -> UPDATE status='executed' + executedAt + resultJson
```

**Hardcoded `ACTION_ALLOWLIST`:** `['send-template-to-members', 'create-checkout-link']`

**Dynamic import + re-validation pattern:** The target action's own Zod schema (`mod.default.schema`) validates the stored params before `run()`. This means invalid params stored by a buggy propose-action call are caught before execution, not silently passed to the action.

**No `@gymos/whatsapp` import:** Guard chain confirmed no such import in `apps/staff-web/`. Execution routes:

```
approve-proposal
  -> import("./send-template-to-members.js")
     -> enqueueOutboundWhatsApp (pg-boss)
        -> worker sendMessage()
           -> opt-in gate
           -> 24h-window gate (bypassed for templates)
           -> template-approved gate
           -> Meta Cloud API call
```

### `apps/staff-web/actions/reject-proposal.ts`

Coach-callable POST action. Flips a pending proposal to `status='rejected'` and stamps `rejectedAt`. The UPDATE filter `AND status='pending'` prevents double-reject creating duplicate state. Returns `{ rejected: true }`.

## Security Invariant Verification

| Check | Result |
|---|---|
| `ACTION_ALLOWLIST` hardcoded in approve-proposal.ts | PASS |
| `mod.default.schema.safeParse` before `run()` | PASS |
| `import("./send-template-to-members.js")` in approve | PASS |
| `import("./create-checkout-link.js")` in approve | PASS |
| No `@gymos/whatsapp` import in `apps/staff-web/actions/approve-proposal.ts` | PASS |
| No `@gymos/whatsapp` import anywhere in `apps/staff-web/` (not in imports, only in comments/forbiddenDeps list) | PASS |

## Guard Chain

The guard script `scripts/guard-no-whatsapp-in-staff-web.mjs` (wired into `pnpm guards`) uses Node-native recursive readdirSync walk. Running it post-merge will confirm no `@gymos/whatsapp` import crept into `apps/staff-web/`. This was verified by grep during execution — no actual import statement found.

## Neon Replay Results

**Task 1 (propose-action):**
```
INSERT dashboard_proposals id='dprop_test_p303', action_name='send-template-to-members', status='pending' -> OK
SELECT: {"id":"dprop_test_p303","action_name":"send-template-to-members","status":"pending"} -> verified
DELETE -> 0 remaining
```

**Task 3 (reject-proposal):**
```
INSERT id='dprop_test_reject', status='pending' -> OK
UPDATE status='rejected', rejected_at=now() WHERE status='pending' -> OK
SELECT: status='rejected', rejected_at non-null -> verified
DELETE -> 0 remaining
```

Note: approve-proposal's SQL was not replayed directly against Neon because it invokes `send-template-to-members.run()` which requires pg-boss, queue-client, and the full stack. The SQL substance (SELECT + UPDATE) is identical in shape to the verified reject-proposal UPDATE. Full propose->approve->execute round-trip is deferred to Plan 06 e2e smoke on the live Vercel deploy.

## Commits

| Commit | Task | Description |
|---|---|---|
| `f6074d24` | Task 1 | feat(P3-03): add propose-action — agent queues a pending dashboard_proposal |
| `e3bcd0a7` | Task 2 | feat(P3-03): add approve-proposal — allowlist + re-validate + execute via gated action |
| `c64518f4` | Task 3 | feat(P3-03): add reject-proposal — coach dismisses pending proposal |

## Deviations from Plan

None — plan executed exactly as written.

The three action files match the plan's code blueprints. The `.js` ESM extension on dynamic imports (`./send-template-to-members.js`, `./create-checkout-link.js`) matches the sibling action import convention. Prettier reformatted the `z.enum([...])` call onto a separate line from `z` — this is a formatting-only change, not a semantic deviation.

## Known Stubs

None. All three actions are fully wired:
- `propose-action`: inserts a real row into `dashboard_proposals`
- `approve-proposal`: reads the row, re-validates, calls the gated action, and updates the row
- `reject-proposal`: updates the row to rejected

The approve->execute path depends on `send-template-to-members` and `create-checkout-link` being callable, which they are (both ship as compiled `defineAction` exports). The worker chokepoint is not stubbed here — it was fully built in P1b-06.

## Self-Check: PASSED

| Check | Result |
|---|---|
| `apps/staff-web/actions/propose-action.ts` exists | FOUND |
| `apps/staff-web/actions/approve-proposal.ts` exists | FOUND |
| `apps/staff-web/actions/reject-proposal.ts` exists | FOUND |
| Commit `f6074d24` exists | FOUND |
| Commit `e3bcd0a7` exists | FOUND |
| Commit `c64518f4` exists | FOUND |
| `tsc --noEmit` exits 0 | PASSED |
| `ACTION_ALLOWLIST` in approve-proposal | FOUND |
| `mod.default.schema.safeParse` in approve-proposal | FOUND |
| No `@gymos/whatsapp` import in approve-proposal | VERIFIED |
| Neon Task 1 replay: pending row inserted + cleaned up | VERIFIED |
| Neon Task 3 replay: rejected row with non-null rejected_at | VERIFIED |
