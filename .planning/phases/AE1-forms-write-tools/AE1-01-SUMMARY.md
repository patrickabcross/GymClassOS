---
phase: AE1-forms-write-tools
plan: "01"
subsystem: forms-agent-write-tools
tags: [forms, defineAction, agent-write, live-refresh, validation]
dependency_graph:
  requires: []
  provides:
    - create-form action (AEF-01)
    - update-form-fields action (AEF-02)
    - update-form-meta action (AEF-03)
    - unpublish-form action (AEF-05)
    - archive-form action (AEF-06)
    - restore-form action (AEF-06)
    - FormFieldSchema Zod schema
    - slugify shared utility
  affects:
    - apps/staff-web/app/routes/gymos.forms._index.tsx (live-refresh added)
tech_stack:
  added: []
  patterns:
    - defineAction with no http: key (agent-only mutations)
    - guard:allow-unscoped on all gym table queries
    - useChangeVersions(["action"]) + useRevalidator for RR v7 loader live-refresh
    - Zod + assertValidFields double-validation for XSS-critical field writes
    - shared slugify extracted so route action and create-form action stay in sync
key_files:
  created:
    - apps/staff-web/features/forms/lib/slugify.ts
    - apps/staff-web/features/forms/lib/form-field-schema.ts
    - apps/staff-web/actions/create-form.ts
    - apps/staff-web/actions/update-form-meta.ts
    - apps/staff-web/actions/unpublish-form.ts
    - apps/staff-web/actions/archive-form.ts
    - apps/staff-web/actions/restore-form.ts
    - apps/staff-web/actions/update-form-fields.ts
  modified:
    - apps/staff-web/app/routes/gymos.forms._index.tsx
decisions:
  - "Kept route's inline slugify function unchanged (plan says route refactor is out of scope); create-form imports from the shared lib; both implementations are now identical and backed by the same algorithm"
  - "update-form-fields allows field edits on published forms (mirrors existing route behavior per RESEARCH Pitfall 7 recommendation — no status gate at action level)"
  - "No http: key on any of the 6 write actions — agent-only mutations per AGENTS.md Adding a New Gym Action step 2"
  - "useEffect dependency array is [actionVersion] only — revalidator excluded to prevent infinite loop (RESEARCH Pitfall 5)"
metrics:
  duration: "4 minutes"
  completed_date: "2026-06-18"
  tasks_completed: 3
  tasks_total: 3
  files_created: 8
  files_modified: 1
---

# Phase AE1 Plan 01: Forms Write Tools (Wave 1 — Direct Actions) Summary

Six direct write actions for the full forms lifecycle plus live-refresh wiring in the Forms tab route, using Zod + assertValidFields double-validation for XSS-critical field writes.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add `slugify.ts` shared utility + `FormFieldSchema` Zod schema | 47d88845 |
| 2 | Add 5 direct write actions: create-form, update-form-meta, unpublish-form, archive-form, restore-form | 107da8f6 |
| 3 | Add `update-form-fields` (double-validation) + live-refresh in forms route (AEX-03) | 4fc188db |

## What Was Built

### Shared utilities (`features/forms/lib/`)

- **`slugify.ts`** — shared slug algorithm (exact copy of the route's inline function) so `create-form` and the route action can never drift apart and cause slug uniqueness conflicts.
- **`form-field-schema.ts`** — `FormFieldSchema` Zod object that is a field-for-field translation of the `FormField` TypeScript interface in `types.ts`. Imports `FIELD_ID_PATTERN` from `validate-fields.ts` so the XSS-critical id regex has a single source of truth.

### Actions (`actions/`)

| File | AEF | What it does |
|------|-----|--------------|
| `create-form.ts` | AEF-01 | INSERT draft form; slug-uniqueness while-loop mirrors route action |
| `update-form-fields.ts` | AEF-02 | Replace fields array; Zod-parse first then `assertValidFields` second pass; rejects archived forms |
| `update-form-meta.ts` | AEF-03 | PATCH title/description/settings only — `status` and `slug` are not writable via this action |
| `unpublish-form.ts` | AEF-05 | Revert published form to draft (direct, no gate) |
| `archive-form.ts` | AEF-06 | Soft-delete via `deletedAt=now()` (takes published form offline automatically) |
| `restore-form.ts` | AEF-06 | Clear `deletedAt` + bump `updatedAt` |

### Live-refresh (AEX-03)

`gymos.forms._index.tsx` now imports `useRevalidator` (react-router), `useEffect` (react), and `useChangeVersions` (@agent-native/core/client). Inside `GymosFormsList()`:
- `const actionVersion = useChangeVersions(["action"])` subscribes to the framework's agent-write change event.
- `useEffect(() => { if (actionVersion > 0) revalidator.revalidate(); }, [actionVersion])` re-runs the RR v7 loader after every agent write action without a manual reload.
- `revalidator` is intentionally excluded from the dependency array to prevent an infinite loop.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met.

## What's NOT in This Plan (Deferred to Later Waves)

- **AEF-04 (publish-form via propose→approve gate)** — Wave 2 (AE1-02)
- **AEX-02 (gate atomicity — ACTION_ALLOWLIST + Zod enum)** — Wave 2 (AE1-02)
- **AEX-01 (view-screen forms branch + per-tab system prompt)** — Wave 3 (AE1-03)
- **AEX-04 (two-exposure / agent-chat.ts system-prompt update)** — Wave 3 (AE1-03)
- **Actions-registry regen** — auto-generated on next `pnpm build` / Vercel deploy
- **Neon MCP optional DB replay** — skipped (no trivially available MCP session during execution; actions compile correctly and match the schema)

## Known Stubs

None. All 6 actions write directly to the database using the established Drizzle pattern.

## Self-Check: PASSED
