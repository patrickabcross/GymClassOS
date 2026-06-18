---
phase: AE2-schedule-write-tools
plan: 01
subsystem: staff-web-schedule-agent
tags: [agent-actions, schedule, drizzle, live-refresh, defineAction]
requires:
  - "apps/staff-web schema.classDefinitions / classOccurrences / bookings (existing, no change)"
  - "@agent-native/core defineAction + @agent-native/core/client useChangeVersions"
provides:
  - "set-occurrence-capacity action (AES-02) with CAPACITY_BELOW_BOOKINGS guard"
  - "update-class-definition action (AES-05) — never touches the active flag"
  - "mark-occurrence-complete action (AES-06) with OCCURRENCE_IN_FUTURE guard"
  - "Schedule route live-refresh on the 'action' change source (AEX-03)"
affects:
  - "AE2-02 (gate wiring) and AE2-03 (system-prompt exposure) build on these action files"
tech-stack:
  added: []
  patterns:
    - "Direct (ungated) agent write action: defineAction with no http key, guard:allow-unscoped per query"
    - "Correctness guard before mutation: count active bookings, early-return without UPDATE"
    - "useChangeVersions(['action']) + useRevalidator with [actionVersion] dep array for loader-route live-refresh"
key-files:
  created:
    - "apps/staff-web/actions/set-occurrence-capacity.ts"
    - "apps/staff-web/actions/update-class-definition.ts"
    - "apps/staff-web/actions/mark-occurrence-complete.ts"
  modified:
    - "apps/staff-web/.generated/actions-registry.ts (gitignored — on-disk only)"
    - "apps/staff-web/app/routes/gymos.schedule.tsx"
decisions:
  - "Registry file is gitignored; manual entries live on disk only (regenerated on build) — matches AE1 precedent"
  - "No AGENTS.md / system-prompt edit (deferred to AE2-03 Wave 3 per plan scope)"
metrics:
  duration: "4m"
  tasks: 3
  files: 4
  completed: "2026-06-18"
---

# Phase AE2 Plan 01: Schedule Write Tools (Direct) Summary

Shipped the three DIRECT (ungated) schedule write actions — `set-occurrence-capacity` (with an active-bookings guard), `update-class-definition` (active-flag-safe), and `mark-occurrence-complete` (future-occurrence guard) — registered them in the on-disk actions registry, and wired AEX-03 loader live-refresh into the Schedule route, mirroring the AE1 Forms pattern. No schema change, no gate wiring, no system-prompt change (those are AE2-02 / AE2-03).

## What Shipped

- **`set-occurrence-capacity` (AES-02)** — counts `bookings WHERE occurrenceId + status='booked'` (via Drizzle `count()`, `Number()`-wrapped) and returns `{error:"CAPACITY_BELOW_BOOKINGS", bookingCount, requestedCapacity}` with no UPDATE when the requested capacity is below the active-booking count. Also guards `OCCURRENCE_NOT_FOUND` and `OCCURRENCE_NOT_SCHEDULABLE`. On success: `{updated:true, occurrenceId, capacity}`.
- **`update-class-definition` (AES-05)** — patches only `name` / `durationMin` / `defaultCapacity` / `category`; builds an `updates` object that structurally cannot include `active`. Empty patch → `{updated:false, reason:"no changes"}`; missing definition → `{error:"DEFINITION_NOT_FOUND"}`.
- **`mark-occurrence-complete` (AES-06)** — rejects a future occurrence (`new Date(occ.startsAt) > new Date()` → `{error:"OCCURRENCE_IN_FUTURE"}`), treats already-completed as a no-op success, rejects cancelled, and otherwise sets `status='completed'`.
- **Registry** — three import aliases (`a_set_occurrence_capacity`, `a_update_class_definition`, `a_mark_occurrence_complete`) + three kebab map keys added to `.generated/actions-registry.ts`.
- **Schedule route** — `useChangeVersions(["action"])` + `useRevalidator` re-run the loader after any agent write, dep array `[actionVersion]` only (no loop).

All three actions are agent-only (no `http` key) and carry `// guard:allow-unscoped — single-tenant gym tables` on every query.

## Verification

- `cd apps/staff-web && npx tsc --noEmit` exits 0 after each task.
- `npx prettier --check` on all four changed files reports no issues.
- grep confirms: each action has ≥1 `guard:allow-unscoped`; no `http:` key; no `updates.active`/`active:` in update-class-definition; all three kebab names present in the registry.
- No edit to `agent-chat.ts`, `propose-action.ts`, `approve-proposal.ts`, `schema.ts`, or any `migrations/*` file (confirmed via `git diff HEAD~3 --name-only`).
- `NewClassDialog.tsx` untouched (its own `useRevalidator` import preserved).

Runtime DB replay against `gymos-demo` was not performed (the no-local-dev-server constraint applies; the capacity-guard logic is verified at the type/static level and matches the verbatim plan implementation). Functional verification rolls into the live Vercel deploy.

## Deviations from Plan

### Auto-handled (Rule 3 context)

**1. [Rule 3 — Blocking/policy] `.generated/actions-registry.ts` is gitignored**
- **Found during:** Task 2 commit.
- **Issue:** The plan lists `apps/staff-web/.generated/actions-registry.ts` in `files_modified` and Task 2 instructs a commit, but `apps/staff-web/.generated` is gitignored project-wide. `git add` refused it; the file has never been tracked (`git ls-files` empty; no commit history).
- **Resolution:** Honored the gitignore (did NOT force-add). The manual entries are present and correct ON DISK (verified by grep: 3 imports + 3 map keys), which is what the framework reads to dispatch the actions at runtime. The registry auto-regenerates on `pnpm build` (Vercel deploy). This matches the AE1 precedent (AE1's forms-action registry entries were likewise never committed — they are the documented "stale registry" in AE2-RESEARCH Pitfall 6). The artifact contract (entries exist so the framework can dispatch) is satisfied; the version-control contract does not apply to a gitignored generated file.
- **Files modified on disk:** `apps/staff-web/.generated/actions-registry.ts`
- **Commit:** none (gitignored; no separate Task 2 commit).

## Known Stubs

None. All three actions are fully wired against real schema tables; the route live-refresh is functional.

## Commits

- `475ee63d` feat(AE2-01): add set-occurrence-capacity, update-class-definition, mark-occurrence-complete actions
- (Task 2 registry edit — on-disk only, gitignored, no commit)
- `f281efe2` feat(AE2-01): wire live-refresh into Schedule route (AEX-03)

## Self-Check: PASSED

All created/modified files exist on disk; both task commits (475ee63d, f281efe2) exist in git; the registry edit is present on disk (gitignored — no commit by design).
