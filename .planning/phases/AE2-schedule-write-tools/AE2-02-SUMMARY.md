---
phase: AE2-schedule-write-tools
plan: 02
subsystem: staff-web-schedule-agent
tags: [agent-actions, schedule, drizzle, transaction, propose-approve, gate]
requires:
  - "apps/staff-web schema.classOccurrences / classDefinitions / bookings / passDebits (existing, no change)"
  - "apps/staff-web/actions/approve-proposal.ts + propose-action.ts (AE1 propose->approve chokepoint)"
  - "@agent-native/core defineAction; drizzle-orm db.transaction (neon-serverless Pool driver)"
provides:
  - "cancel-occurrence gated action (AES-03) — atomic bookings->cancelled + negative pass_debit refunds + occurrence->cancelled in ONE db.transaction; idempotent"
  - "reschedule-occurrence gated action (AES-04) — updates startsAt + recomputes endsAt from definition.durationMin"
  - "Both gated action names wired ATOMICALLY across all three gate sites (AEX-02) + on-disk registry"
affects:
  - "AE2-03 (Wave 3) — system-prompt exposure: names the propose->cancel / propose->reschedule workflows in agent-chat.ts"
tech-stack:
  added: []
  patterns:
    - "Gated agent write action: defineAction with NO http key; reached only via propose-action -> approve-proposal dynamic import"
    - "Atomic cancel-with-refund: ONE db.transaction wrapping booking batch-update + per-pass negative pass_debit insert + occurrence update"
    - "Transaction-internal idempotency: re-read status inside the tx, early-return on already-cancelled (no duplicate refunds on double-approve)"
    - "Drizzle text() enum extension is additive TS-only — plain TEXT column, no Postgres migration"
key-files:
  created:
    - "apps/staff-web/actions/cancel-occurrence.ts"
    - "apps/staff-web/actions/reschedule-occurrence.ts"
  modified:
    - "apps/staff-web/actions/approve-proposal.ts"
    - "apps/staff-web/actions/propose-action.ts"
    - "apps/staff-web/server/db/schema.ts"
    - "apps/staff-web/.generated/actions-registry.ts (gitignored — on-disk only)"
decisions:
  - "Registry file is gitignored; manual entries live on disk only (regenerated on build) — matches AE2-01 precedent"
  - "No Postgres migration: dashboardProposals.actionName is a Drizzle text() enum = plain TEXT column, additive TS-only validation"
  - "No AGENTS.md / system-prompt edit (deferred to AE2-03 Wave 3 per plan scope)"
metrics:
  duration: "5m"
  tasks: 3
  files: 6
  completed: "2026-06-18"
---

# Phase AE2 Plan 02: Schedule Write Tools (Gated) Summary

Shipped the two GATED schedule actions — `cancel-occurrence` (atomic cancel-with-refund) and `reschedule-occurrence` (recompute endsAt) — and wired both through the propose->approve chokepoint ATOMICALLY across all three gate sites in one commit. These are the only AE2 actions that route through human approval before they run. No system-prompt change (Wave 3, AE2-03). No Postgres migration (Drizzle text enum is TS-only additive).

## What Shipped

- **`cancel-occurrence` (AES-03)** — GATED defineAction (no `http` key). On approval it runs ONE `db.transaction`: (1) re-reads `classOccurrences.status` inside the tx and early-returns if already `cancelled` (idempotency — no duplicate refunds on double-click); (2) fetches active `bookings` (`status='booked'`) with their `passId`; (3) batch-updates them to `status='cancelled'` + `cancelledAt` via `inArray`; (4) inserts a negative `pass_debit` (`amount:-1`, `reason:'cancellation_refund'`, `bookingId` set) ONLY for bookings with a non-null `passId` (null-passId bookings are cancelled but get no refund row → no NOT NULL violation); (5) sets the occurrence `status='cancelled'`. All-or-nothing: a thrown error mid-way rolls everything back. Returns `{cancelled:true, bookingsCancelled, creditsRefunded}` / `{cancelled:true, alreadyCancelled:true}` / `{error:"OCCURRENCE_NOT_FOUND"}`.
- **`reschedule-occurrence` (AES-04)** — GATED defineAction (no `http` key). Validates `startsAt` parses (`{error:"INVALID_STARTS_AT"}` before any DB read), rejects `OCCURRENCE_NOT_FOUND` and non-scheduled occurrences (`{error:"OCCURRENCE_NOT_SCHEDULABLE", status}`), fetches the definition's `durationMin`, recomputes `endsAt = addMinutes(start, def.durationMin).toISOString()`, and UPDATEs both `startsAt` (verbatim, studio-local) and `endsAt` (UTC instant). Returns `{rescheduled:true, startsAt, endsAt}`.
- **Atomic gate wiring (AEX-02)** — in ONE commit: `approve-proposal.ts` ACTION_ALLOWLIST + two `else if` dispatch branches (dynamic `import("./cancel-occurrence.js")` / `"./reschedule-occurrence.js"` before the final `else`); `propose-action.ts` Zod `actionName` enum (now 5 members) + description string; `schema.ts` `dashboardProposals.actionName` Drizzle text enum (now 5 members, plain TEXT, no migration).
- **Registry** — two import aliases (`a_cancel_occurrence`, `a_reschedule_occurrence`) + two kebab map keys added to `.generated/actions-registry.ts` on disk so `approve-proposal` can dynamically import them.

Both new actions are gated (no `http` key) and carry `// guard:allow-unscoped — single-tenant gym tables` on every query.

## Verification

- `cd apps/staff-web && npx tsc --noEmit` exits 0 after each task and at the end (all 2 new actions + 3 gate-site edits + registry edits compile).
- `npx prettier --write` on all six changed files reports no remaining changes.
- grep confirms both `cancel-occurrence` AND `reschedule-occurrence` appear in all FOUR gate files (approve-proposal.ts, propose-action.ts, schema.ts, .generated/actions-registry.ts) — counts 3/3, 2/2, 1/1, 2/2 respectively.
- grep confirms `db.transaction(` appears once in cancel-occurrence.ts (bookings-update, passDebits-insert, occurrence-update all inside the callback) and `addMinutes` appears in reschedule-occurrence.ts with the UPDATE setting both startsAt and endsAt.
- `git status --short apps/staff-web/server/db/migrations/` is empty — NO Postgres migration created (Drizzle text enum is additive TS-only).
- No edit to `agent-chat.ts` or `AGENTS.md` in this plan (system-prompt exposure is Wave 3, AE2-03).

Runtime DB replay against `gymos-demo` Neon was not performed (the no-local-dev-server constraint applies project-wide; the transaction + idempotency + null-passId logic is verified at the type/static level and matches the verbatim plan implementation, mirroring the AE2-01 precedent). Functional verification rolls into the live Vercel deploy and Wave 3 system-prompt exposure.

## Deviations from Plan

### Auto-handled (Rule 3 context)

**1. [Rule 3 — Blocking/policy] `.generated/actions-registry.ts` is gitignored**
- **Found during:** Task 3.
- **Issue:** The plan lists `apps/staff-web/.generated/actions-registry.ts` in `files_modified` and instructs registry edits in the Task 3 commit, but `apps/staff-web/.generated` is gitignored project-wide (`git check-ignore` confirms).
- **Resolution:** Honored the gitignore (did NOT force-add). The two import aliases + two map keys are present and correct ON DISK (verified by grep: lines 42-43 imports, 115-116 map entries), which is what the framework reads to dispatch the actions at runtime. The file auto-regenerates on `pnpm build` (Vercel deploy). This matches the AE2-01 precedent (the three direct schedule actions were likewise registered on-disk only) and AE2-RESEARCH Pitfall 6 ("stale registry"). The artifact contract (entries exist so approve-proposal can dynamically import them) is satisfied; the version-control contract does not apply to a gitignored generated file. The Task 3 commit therefore contains the three tracked gate files; the registry edit is on-disk only.
- **Files modified on disk:** `apps/staff-web/.generated/actions-registry.ts`
- **Commit:** none for the registry file (gitignored); the three tracked gate files committed in `8d0bef13`.

## Known Stubs

None. Both gated actions are fully wired against real schema tables; the propose->approve dispatch chain reaches them via dynamic import.

## Commits

- `dc05f42c` feat(AE2-02): add cancel-occurrence gated action (atomic cancel+refund)
- `8925c302` feat(AE2-02): add reschedule-occurrence gated action (recompute endsAt)
- `8d0bef13` feat(AE2-02): wire cancel/reschedule-occurrence through propose->approve gate
- (registry edit — on-disk only, gitignored, no commit by design)

## Self-Check: PASSED

All created/modified files exist on disk; all three task commits (dc05f42c, 8925c302, 8d0bef13) exist in git; the registry edit is present on disk (gitignored — no commit by design).
