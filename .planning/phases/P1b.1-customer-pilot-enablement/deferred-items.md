# Phase P1b.1 — Deferred Items (out-of-scope discoveries)

## Out-of-scope typecheck error discovered by Plan 06 verification

**File:** `apps/staff-web/app/routes/gymos._index.tsx:47`
**Error:** `TS2307: Cannot find module '~/components/gymos/TemplatesDialog'`
**Owner:** Plan 05 (TemplatesDialog) — see parallel_execution context: "Plan 05 owns apps/staff-web/app/components/gymos/TemplatesDialog.tsx and apps/staff-web/app/routes/gymos._index.tsx".
**Notes:**
- The import uses `~/components/...`, but `apps/staff-web/tsconfig.json` only defines `@/*` aliases (no `~/*`). Plan 05 needs to switch the import to `@/components/gymos/TemplatesDialog` (matching every other staff-web import).
- Plan 06's own file (`gymos.analytics.tsx`) typechecks cleanly; the only error is in Plan 05's territory.
- Not fixed here because the file is owned by the sibling Plan 05 in the same wave; cross-agent file edits would race.
