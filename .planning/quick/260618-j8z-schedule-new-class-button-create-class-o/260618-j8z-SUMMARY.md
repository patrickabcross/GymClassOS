---
phase: quick-260618-j8z
plan: 01
subsystem: staff-web / schedule
tags: [schedule, defineAction, dialog, AE2-prep]
requires: [class_definitions, class_occurrences, useActionMutation, useRevalidator]
provides:
  - create-class-definition (defineAction)
  - create-class-occurrence (defineAction)
  - NewClassDialog component
  - schedule loader classTypes query
affects:
  - apps/staff-web/app/routes/gymos.schedule.tsx
  - apps/staff-web/AGENTS.md
tech-stack:
  added: []
  patterns:
    - two-step UI orchestration of atomic agent-reusable actions
    - optimistic close-then-revalidate (no spinner-block)
key-files:
  created:
    - apps/staff-web/app/components/gymos/NewClassDialog.tsx
  modified:
    - apps/staff-web/app/routes/gymos.schedule.tsx
    - apps/staff-web/AGENTS.md
  pre-existing (Task 1, committed 95e1f0da):
    - apps/staff-web/actions/create-class-definition.ts
    - apps/staff-web/actions/create-class-occurrence.ts
decisions:
  - two-step orchestration over inline newDefinition
  - studio-local datetime-local semantics; startsAt stored verbatim, endsAt UTC
  - optimistic close-then-revalidate middle-ground
  - AE2 deferral of agent/system-prompt exposure
metrics:
  duration: ~20m
  completed: 2026-06-18
---

# Phase quick-260618-j8z Plan 01: Schedule "New Class" button + create-class actions Summary

Adds a UI "New Class" capability to `/gymos/schedule` backed by two atomic, agent-reusable `defineAction`s (`create-class-definition`, `create-class-occurrence`) that AE2's agent tool will later reuse unchanged.

## What Shipped

- **Task 1 (pre-existing, commit `95e1f0da`):** `create-class-definition.ts` and `create-class-occurrence.ts`. Verified against the PLAN spec — both are Zod-validated POST `defineAction`s with `guard:allow-unscoped` markers; `create-class-occurrence` resolves the definition, computes `endsAt` via `addMinutes`, defaults capacity from the definition, and rejects `DEFINITION_NOT_FOUND` / `INVALID_STARTS_AT`. **Left untouched** — they matched the spec exactly.
- **Task 2 (commit `d626ea38`):** `NewClassDialog.tsx` (new) + `gymos.schedule.tsx` loader Query D (active class definitions) + a "New Class" header button placed as the first child of the header control cluster, prefilled with the selected day via `selectedKey`.
- **Task 3 (commit `436e38e0`):** Both actions documented in `apps/staff-web/AGENTS.md` Agent Actions table with the AE2-deferral note; `agent-chat.ts` untouched.

## Decisions Made

### Two-step orchestration (no inline newDefinition)
The dialog calls `create-class-definition` first (only when "+ New class type…" is chosen) to obtain a `definitionId`, then calls `create-class-occurrence`. Each action stays atomic and independently reusable as an agent tool in AE2 — the UI is the only orchestrator. `create-class-occurrence` never accepts an inline definition payload.

### Timezone assumption
`<input type="datetime-local">` has no timezone, so `new Date(value).toISOString()` interprets the value in the **browser's local zone** — which is the studio operator's local time, the intended studio-local semantic. The resulting ISO is passed to `create-class-occurrence` and stored **verbatim**; `endsAt` is computed from the parsed instant via `addMinutes(...).toISOString()` and therefore serialised in UTC ("Z"). Both render correctly through `new Date(iso)` in the calendar, consistent with the route's existing UTC day-bucketing. Production IANA-TZ alignment remains deferred to SCH-07.

### Optimistic UI: close-then-revalidate (middle-ground)
On submit the dialog closes immediately + toasts "Scheduling class…", then runs the async orchestration and calls `revalidator.revalidate()` so the new occurrence appears on the calendar — no spinner-block. We do **not** optimistically insert into loader state; rollback is automatic because nothing was optimistically rendered (a failed schedule simply never appears, and the catch toasts the error). This satisfies the CLAUDE.md optimistic-UI mandate without a fragile client-side calendar-cache mutation.

### AE2 deferral
The two actions ship now as UI-driven `defineAction`s but are deliberately NOT added to the agent system prompt (`agent-chat.ts`). The two-exposure rule is documented in AGENTS.md: action file now, system-prompt bullet in AE2.

## Deviations from Plan

None of substance. Minor adaptations:
- The PLAN said header button could go "left of the Today button"; placed it as the first child of the header `<div className="flex items-center gap-2">` (before the "this month" Badge) so it reads as the primary action, per the PLAN's preference.
- The `shadcn Label` primitive **is** present (`app/components/ui/label.tsx`), so the dialog uses `<Label>` rather than a styled `<label>` fallback.
- Mutation params are cast with the established `as Record<string, unknown> as Parameters<typeof m.mutateAsync>[0]` pattern (matching `CheckoutLinkButton.tsx`).

## Verification

- `cd apps/staff-web && npx tsc --noEmit` — **clean (exit 0)** across all changed files, run after prettier reformatting.
- `npx prettier --write` run on `NewClassDialog.tsx`, `gymos.schedule.tsx`, and `AGENTS.md`.
- No local dev-server walkthrough (NitroViteError prevents `pnpm dev`) — verified via tsc per the PLAN's standard.
- **Optional Neon SQL replay: SKIPPED.** The action insert/select logic is unchanged from Task 1 (already committed in `95e1f0da` and unchanged here); this plan only added the UI + loader query + docs, so the replay would re-test already-shipped action code. Skipped as non-trivial relative to its marginal value.

## Self-Check: PASSED

- `apps/staff-web/app/components/gymos/NewClassDialog.tsx` — FOUND
- Commit `d626ea38` (Task 2) — FOUND
- Commit `436e38e0` (Task 3) — FOUND
- AGENTS.md contains both action names — verified (node check OK)
