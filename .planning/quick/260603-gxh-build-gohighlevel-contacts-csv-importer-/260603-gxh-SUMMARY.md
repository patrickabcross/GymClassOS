---
phase: quick-260603-gxh
plan: "01"
subsystem: apps/staff-web/scripts
tags: [import, csv, gohighlevel, contacts, e164, whatsapp-opt-in]
dependency_graph:
  requires: [apps/staff-web/server/db/index.ts, schema.gymMembers, schema.whatsappOptIn]
  provides: [db:import-ghl CLI entrypoint]
  affects: [gym_members table, whatsapp_opt_in table]
tech_stack:
  added: [csv-parse@5.6.0]
  patterns: [chunked-idempotent-bulk-insert, e164-normalization, header-synonyms-map]
key_files:
  created: [apps/staff-web/scripts/import-ghl-contacts.ts]
  modified: [apps/staff-web/package.json, pnpm-lock.yaml]
decisions:
  - "bulkInsert callable only in --commit mode; dry-run uses read-only SELECT for DB dedup — no writes at all in default mode"
  - "email secondary dedup: tracks seen emails in a Set alongside phone primary dedup; if email already seen, row is counted as duplicate-in-file"
  - "DB dedup failure in dry-run is a warning (not fatal) since DATABASE_URL may be absent in CI; --commit mode re-throws"
  - "unsubscribed column is an INVERTED consent signal: truthy value means NOT consented; checked before marketingConsent column"
metrics:
  duration: "~8 min"
  completed: "2026-06-03"
  tasks: 2
  files: 3
---

# Quick Task 260603-gxh: GHL Contacts CSV Importer

One-shot CLI importer (`tsx scripts/import-ghl-contacts.ts`) that loads a GoHighLevel contacts CSV export into `gym_members` + `whatsapp_opt_in`, with dry-run default and `--commit` for actual writes.

## What Was Built

### `apps/staff-web/scripts/import-ghl-contacts.ts` (525 lines)

Full GHL CSV import pipeline:

**CLI entrypoint** — args parsed before any DB/CSV access. `process.exit(1)` with usage message if no path given or file not found.

**Header auto-detection** — `normalize(h)` strips to lowercase alphanumeric; synonyms map covers 7 canonical fields across common GHL and generic column name variations. Prints a detected-mapping table before any further processing. Hard exits with field names + raw headers if `firstName` or `phone` is not locatable.

**Phone normalization to E.164 (UK +44 default)**:
- `+` prefix — keep as-is (validate 8-15 digits after `+`)
- Leading `0` — UK national format, `+44` + rest
- Leading `44` — prepend `+`
- Anything else — null (skip row)

**Consent parsing** — `unsubscribed` column is an inverted signal (truthy = NOT consented); `marketingConsent` column checked next; no column found = false. `consentDate` parsed via `new Date(cell)` with ISO fallback.

**Deduplication**:
- Within-file: `Set<string>` of normalized phones + `Set<string>` of lowercased emails
- Against DB: single `SELECT phoneE164 FROM gym_members` before processing; skips + counts rows whose phone already exists

**Dry-run output** — mapping table, totals (parsed / importable / skip breakdown / opted-in count), 5 sample rows with opt-in flag, hint to re-run with `--commit`.

**Commit mode** — `bulkInsert(schema.gymMembers, ...)` then `bulkInsert(schema.whatsappOptIn, ...)`, both `onConflictDoNothing` for idempotency. Prints inserted/skipped counts. Members inserted before opt-ins to satisfy FK.

### `apps/staff-web/package.json`

- Added `"db:import-ghl": "tsx scripts/import-ghl-contacts.ts"` to `scripts`
- Added `"csv-parse": "^5.6.0"` to `devDependencies` (alphabetical position between `cmdk` and `date-fns`)

## Verification

- `tsc --noEmit` — 0 errors attributable to the new script (3 pre-existing workspace-level module errors unrelated to this task)
- No-arg smoke test: `npx tsx scripts/import-ghl-contacts.ts` exits 1 with usage message, no DB connection
- Bad-path smoke test: exits 1 with "file not found" message, no DB connection
- Executor did NOT run against Neon (constraint honored)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/staff-web/scripts/import-ghl-contacts.ts` — confirmed created (525 lines, prettier-formatted)
- `apps/staff-web/package.json` — confirmed `db:import-ghl` script and `csv-parse` devDependency present
- Commit `82ed1988` (package.json + lockfile) — confirmed in git log
- Commit `ece3c957` (importer script) — confirmed in git log
