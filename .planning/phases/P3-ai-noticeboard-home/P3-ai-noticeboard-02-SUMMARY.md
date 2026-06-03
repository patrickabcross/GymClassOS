---
phase: P3-ai-noticeboard-home
plan: "02"
subsystem: actions
tags: [actions, drizzle, neon, noticeboard, inbox, dashboard, defineAction]
dependency_graph:
  requires: [dashboard_notes, dashboard_tasks, dashboardNotes, dashboardTasks]
  provides: [list-inbox-summary, upsert-section-note, create-task, complete-task]
  affects:
    - apps/staff-web/actions/list-inbox-summary.ts
    - apps/staff-web/actions/upsert-section-note.ts
    - apps/staff-web/actions/create-task.ts
    - apps/staff-web/actions/complete-task.ts
tech_stack:
  added: []
  patterns: [defineAction-GET-read, defineAction-POST-mutation, onConflictDoUpdate-by-unique-key, guard-allow-unscoped-single-tenant, nanoid-prefixed-id]
key_files:
  created:
    - apps/staff-web/actions/list-inbox-summary.ts
    - apps/staff-web/actions/upsert-section-note.ts
    - apps/staff-web/actions/create-task.ts
    - apps/staff-web/actions/complete-task.ts
  modified: []
decisions:
  - "conversations.unreadCount Drizzle export name confirmed (integer column unread_count) — used in FILTER (WHERE unreadCount > 0) aggregate"
  - "upsert-section-note uses deterministic id=dnote_{section} so the ON CONFLICT (section) target is unambiguous and never creates ghost rows"
  - "create-task uses dtask_{nanoid()} prefix pattern (matches dtask convention from Plan 01 schema column name)"
  - "complete-task updates by taskId only — no ownership check needed (single-tenant; guard:allow-unscoped)"
metrics:
  duration_seconds: 440
  completed_date: "2026-06-03"
  tasks_completed: 3
  files_changed: 4
---

# Phase P3 Plan 02: Authoring Actions Summary

Four `defineAction` files for the AI noticeboard: one read action (Inbox card metric) and three authoring mutations (section note upsert, task create, task complete). These are the Tier 2 actions that back SC-2 (real computed Inbox metric) and SC-3/SC-4 (persisted agent-authored notes + tasks). All auto-register into `.generated/actions-registry.js` on next dev/build restart.

## What Was Built

### list-inbox-summary (GET read action)

`apps/staff-web/actions/list-inbox-summary.ts`

Computes unread conversation count and total open (non-lead) conversation count from the `conversations` table. Uses a PostgreSQL `COUNT(*) FILTER (WHERE unread_count > 0)` aggregate for efficiency (single scan). Returns `{ unreadConversations, openConversations, asOf }`.

Key details:
- Drizzle column name confirmed: `schema.conversations.unreadCount` maps to SQL `unread_count` (integer, line 144 of schema.ts)
- Both queries exclude `status='lead'` via `ne(schema.conversations.status, "lead")`
- `http: { method: "GET" }` — read action
- Two `guard:allow-unscoped` markers (one per query)

### upsert-section-note (POST mutation)

`apps/staff-web/actions/upsert-section-note.ts`

Writes or replaces the AI-authored note for a named dashboard section. Uses `onConflictDoUpdate` targeting `schema.dashboardNotes.section` (the UNIQUE constraint established in migration 0005). Calling twice with the same section replaces, never appends.

Key details:
- Deterministic id: `dnote_{section}` (e.g. `dnote_members`) — prevents ghost rows on conflict
- Sections enum: `["inbox", "schedule", "members", "revenue", "ai_today"]`
- Body max 2000 chars (z.string().max(2000))
- POST mutation (no `http` key)

### create-task (POST mutation)

`apps/staff-web/actions/create-task.ts`

Inserts a new prioritized open task into `dashboard_tasks`. Priority 1=high / 2=medium / 3=low (default 2 via `z.coerce.number().int().min(1).max(3).optional().default(2)`). Optional `proposalId` FK links to a pending one-click proposal.

Key details:
- Id pattern: `dtask_${nanoid()}` — unique per call unlike the deterministic note id
- `status: "open"` hardcoded on insert
- Optional `body` for detail text under the title
- POST mutation (no `http` key)

### complete-task (POST mutation)

`apps/staff-web/actions/complete-task.ts`

Marks an existing task as `status='completed'` and stamps `completedAt` with the current ISO timestamp. Called by the coach (Mark done button in Plan 04 UI) or by the agent after executing the task's work.

Key details:
- Single parameter: `taskId` (string, min 1)
- Uses `eq(schema.dashboardTasks.id, taskId)` WHERE clause
- POST mutation (no `http` key)

## Neon Verification Results

All SQL was replayed against gymos-demo Neon (project id `billowing-sun-51091059`). No test rows were left behind.

### list-inbox-summary

```
unreadConversations: 0
openConversations: 0
sanity check (unread <= open): true
```

The demo database has conversations but all currently have `unread_count = 0` and/or all are leads — both are valid states. The SQL executes without error and returns integer counts. The FILTER aggregate pattern is confirmed working against the live Postgres instance.

### upsert-section-note (ON CONFLICT verification)

```
First insert done
Second upsert done
Row count after upsert: 1  (expected 1)
Body value: verify2        (expected verify2 — second call won)
Upsert test PASSED: true
Remaining rows after cleanup: 0
```

Single row per section confirmed. `ON CONFLICT (section) DO UPDATE` replaced the body atomically.

### create-task + complete-task (lifecycle verification)

```
INSERT task done
After INSERT — status: open (expected open), priority: 1 (expected 1)
UPDATE to completed done
After UPDATE — status: completed (expected completed)
completed_at non-null: true
Task lifecycle PASSED: true
Remaining rows after cleanup: 0
```

Full open → completed lifecycle verified. `completed_at` is populated on complete.

## Commits

| Commit | Description |
|---|---|
| `1e687c11` | feat(P3-02): add list-inbox-summary GET action (Inbox card metric) |
| `a474c71d` | feat(P3-02): add upsert-section-note POST action (dashboard note authoring) |
| `2e4ae4b2` | feat(P3-02): add create-task and complete-task POST actions (dashboard task authoring) |

## Deviations from Plan

None — plan executed exactly as written.

The `conversations.unreadCount` Drizzle export name was confirmed by reading `apps/staff-web/server/db/schema.ts` line 144 before writing the action. The plan's snippet was accurate; no column name correction was needed.

## Known Stubs

None. These are pure compute + mutation actions. They write to and read from real SQL tables that were populated (or left empty) by the demo seed. The Neon verification confirmed the SQL executes correctly against real data.

## Self-Check: PASSED

| Check | Result |
|---|---|
| `apps/staff-web/actions/list-inbox-summary.ts` exists | FOUND |
| `apps/staff-web/actions/upsert-section-note.ts` exists | FOUND |
| `apps/staff-web/actions/create-task.ts` exists | FOUND |
| `apps/staff-web/actions/complete-task.ts` exists | FOUND |
| Commit `1e687c11` exists | FOUND |
| Commit `a474c71d` exists | FOUND |
| Commit `2e4ae4b2` exists | FOUND |
| `tsc --noEmit` exits 0 (all 3 tasks) | PASSED |
| list-inbox-summary: contains "FILTER (WHERE" + ne(status, "lead") | VERIFIED |
| upsert-section-note: contains "onConflictDoUpdate" | VERIFIED |
| create-task: contains "dtask_${nanoid()}" | VERIFIED |
| complete-task: contains status "completed" + completedAt | VERIFIED |
| All four files contain "guard:allow-unscoped" | VERIFIED |
| No http GET on mutations (upsert/create/complete) | VERIFIED |
| Neon upsert: 1 row after 2 section='members' inserts | VERIFIED |
| Neon task lifecycle: open → completed + completedAt non-null | VERIFIED |
| All test rows cleaned up | VERIFIED |
