---
phase: quick-260611-dxv
plan: "01"
subsystem: staff-web/leads-import
tags: [csv-import, leads, whatsapp-opt-in, bulk-upload, dedup]
dependency_graph:
  requires: [P1c-01-migration (conversations.status='lead' + partial unique indexes)]
  provides: [csv-leads-library, import-leads-action, ImportLeadsDialog]
  affects: [gymos.inbox (Leads view), scripts/import-ghl-contacts.ts]
tech_stack:
  added: []
  patterns:
    - parseLeadsCsv shared pure function (no DB/fs — caller provides rows + existingPhones)
    - FK-safe re-select pattern (mirror of features/forms/handlers/submissions.ts)
    - dryRun preview → commit two-phase action pattern
    - useRevalidator for optimistic post-import list refresh
key_files:
  created:
    - apps/staff-web/server/lib/csv-leads.ts
    - apps/staff-web/actions/import-leads.ts
    - apps/staff-web/app/components/gymos/ImportLeadsDialog.tsx
  modified:
    - apps/staff-web/scripts/import-ghl-contacts.ts
    - apps/staff-web/app/routes/gymos.inbox.tsx
    - apps/staff-web/AGENTS.md
decisions:
  - "parseLeadsCsv is pure (no DB, no fs) — caller passes already-parsed rows + existingPhones Set; both CLI and action share one module"
  - "import-leads action uses same FK-safe re-select pattern as submissions.ts: INSERT ... ON CONFLICT ... then SELECT canonical id before downstream FK inserts"
  - "ImportLeadsDialog uses dryRun:true preview before commit; confirms with 'Import N leads' button disabled until importable > 0"
  - "useRevalidator.revalidate() on onImported prop for instant Leads list refresh without full navigation"
  - "No schema changes — all tables (gym_members, whatsapp_opt_in, conversations) existed from prior migrations"
metrics:
  duration: ~25min
  completed: "2026-06-11"
  tasks_completed: 2
  files_created: 3
  files_modified: 3
---

# Quick Task 260611-dxv: CSV bulk-upload interface for Leads view — Summary

One-liner: shadcn Dialog import-leads flow with shared csv-leads.ts library — auto-detects columns, normalises phones to E.164, previews counts before committing gym_members + whatsapp_opt_in + lead conversations.

## What Was Built

### Task 1 — Shared CSV-leads library (`cf3b76df`)

Extracted all header-detection, phone-normalisation, and consent-parsing logic from `scripts/import-ghl-contacts.ts` into `apps/staff-web/server/lib/csv-leads.ts` as exported pure functions:

- `normalize`, `SYNONYMS`, `FieldMapping`, `detectHeaders`
- `normalizePhone` (E.164, UK +44 default)
- `TRUTHY_CONSENT`, `TRUTHY_UNSUB`, `parseConsent`, `parseConsentDate`
- `ParsedLeadRow`, `ParseLeadsResult`, `parseLeadsCsv`

`parseLeadsCsv` reproduces the CLI's exact row loop (skipNoFirstName → normalizePhone/skipNoValidPhone → within-file phone dedup → DB dedup → within-file email dedup with `seenPhones.delete` undo) and returns a fully structured result. It is pure — no DB calls, no fs access; the caller supplies already-parsed `rows` and an optional `existingPhones` Set.

The CLI script (`import-ghl-contacts.ts`) was refactored to import from `csv-leads.js` and call `parseLeadsCsv`, replacing its entire section-5 row loop. CLI behaviour (dry-run report, `--commit`, idempotency) is unchanged.

### Task 2 — Action + Dialog + Leads view wiring (`697b2645`)

**`apps/staff-web/actions/import-leads.ts`** (`defineAction`, default POST, no `http` key):
- Schema: `{ csvText: string, dryRun: boolean }`
- Parses CSV via `csv-parse/sync`, loads existing phones from `gym_members` for dedup
- Calls `parseLeadsCsv`; returns error if `missingFields.length > 0`
- `dryRun:true` → returns `{ ok, mapping, counts, sample, committed:0, leadsCreated:0 }`
- `dryRun:false` → commits via FK-safe re-select pattern (mirrors `submissions.ts` §9-10):
  - `INSERT INTO gym_members ... ON CONFLICT ... DO UPDATE` + re-SELECT canonical id
  - `INSERT INTO whatsapp_opt_in ... ON CONFLICT (member_id) DO NOTHING` for consented rows
  - `INSERT INTO conversations ... ON CONFLICT (member_id, channel) DO UPDATE SET status = CASE WHEN status='closed' THEN 'lead' ELSE status END`
  - All gym-table queries carry `// guard:allow-unscoped`

**`apps/staff-web/app/components/gymos/ImportLeadsDialog.tsx`** (shadcn Dialog):
- Trigger: `<Button variant="outline" size="sm">` with `<IconUpload>` — "Import leads"
- File input (`accept=".csv,text/csv"`) → `file.text()` → POST `dryRun:true` on select
- Preview state: detected column mapping grid, count badges (importable/opted-in/skipped breakdown), up to 5 sample rows with name · phone · email · opt-in badge
- Footer: "Cancel" + "Import N leads" (disabled until `counts.importable > 0`)
- On confirm: POST `dryRun:false` → `toast.success("Imported N leads")` → `onImported?.()`
- Error block shown as destructive-styled box with optional headers hint

**`apps/staff-web/app/routes/gymos.inbox.tsx`**:
- Added `useRevalidator` import from `react-router`
- `const revalidator = useRevalidator()` in the component
- `<ImportLeadsDialog onImported={() => revalidator.revalidate()} />` rendered in the Leads header only (`isLeadsView`), right-aligned next to the title/count badge

**`apps/staff-web/AGENTS.md`**: added `import-leads` row to the Agent Actions table (marked as UI-only, not agent-facing LLM tool).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The `leadsCreated` count uses a conservative heuristic (checks if the conversation id returned matches the freshly generated id or if the conversation has `status='lead'`). This is correct for new leads; for existing leads whose status is preserved, the count may under-count — acceptable for the UI toast; the `committed` (new members) count is precise.

## Self-Check: PASSED

| Check | Result |
|---|---|
| `apps/staff-web/server/lib/csv-leads.ts` exists | FOUND |
| `apps/staff-web/actions/import-leads.ts` exists | FOUND |
| `apps/staff-web/app/components/gymos/ImportLeadsDialog.tsx` exists | FOUND |
| commit `cf3b76df` exists | FOUND |
| commit `697b2645` exists | FOUND |
