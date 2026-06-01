---
phase: P1c-public-site-integrations
plan: 01
subsystem: database
tags: [postgres, neon, drizzle, migration, lead-funnel, forms, conversations]

# Dependency graph
requires:
  - phase: P1b-customer-pilot-enablement
    provides: "gym_members / conversations / messages base schema applied directly to gymos-demo Neon"
provides:
  - "conversations.status CHECK extended to allow 'lead' (lead funnel state)"
  - "Partial unique indexes on gym_members.email and gym_members.phone_e164 (NULLs allowed, dupes rejected)"
  - "Unique index on conversations (member_id, channel) for idempotent lead upsert via ON CONFLICT"
  - "form_submissions table for the forms builder to query public form/enquiry responses"
  - "Drizzle schema updated additively: 'lead' enum value + formSubmissions table export"
affects: [P1c-02-forms-fork-lead-submission, P1c-04-forms-builder-and-leads-inbox, P1c-07-e2e-smoke-test]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gym migrations applied DIRECTLY to Neon via Neon MCP (statement-by-statement), NOT through runMigrations — mirrors P1b-02"
    - "Drizzle text-enum on Postgres = CHECK constraint, not PG ENUM type; widening = DROP/ADD the CHECK (additive at the data level)"
    - "Partial unique indexes (WHERE col IS NOT NULL) to allow many NULLs while enforcing uniqueness on present values"

key-files:
  created:
    - apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql
  modified:
    - apps/staff-web/server/db/schema.ts

key-decisions:
  - "conversations had NO pre-existing CHECK constraint on status (plain text column) — statement 1 ADDED a new conversations_status_check rather than extending one"
  - "Dedup DELETE removed 0 rows — no duplicate emails existed in the gymos-demo seed"

patterns-established:
  - "Lead funnel state stored as conversations.status='lead' (not a separate table)"
  - "Idempotent lead upsert keyed on (member_id, channel) unique index"

requirements-completed: [FORMS-01]

# Metrics
duration: ~25min
completed: 2026-06-01
---

# Phase P1c Plan 01: Public Site Lead Funnel Schema Summary

**Additive 0003 migration applied to gymos-demo Neon: conversations.status gains 'lead', partial unique indexes on gym_members email/phone, a unique (member_id, channel) for idempotent lead upsert, and a new form_submissions table — all reflected in the Drizzle schema.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-06-01
- **Tasks:** 3 (Task 3 was a blocking human-verify checkpoint, applied + verified live by the orchestrator)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Wrote a strictly-additive 0003 migration (no DROP TABLE/COLUMN, no RENAME, no TRUNCATE; the only DELETE is bounded by a `WHERE id IN (... rn > 1)` dedup clause).
- Extended `conversations.status` to allow `'lead'` (CHECK + Drizzle enum).
- Added partial unique indexes on `gym_members.email` and `gym_members.phone_e164` (NULLs allowed, present values unique).
- Added a unique index on `conversations (member_id, channel)` so the P1c-02 lead-upsert handler can use `ON CONFLICT` safely.
- Added an explicit `form_submissions` table + `form_submissions_form_id_idx` for the forms builder to query responses unambiguously.
- Applied the migration statement-by-statement to the live gymos-demo Neon DB via the Neon MCP and verified every change landed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the additive migration SQL file** - `b0e03271` (feat)
2. **Task 2: Update Drizzle schema to match the migration** - `b7694c04` (feat)
3. **Task 3: Apply + verify the 0003 migration on Neon** - no code change (live DB write via Neon MCP; verified by orchestrator)

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified
- `apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql` - Additive lead-funnel migration: lead CHECK, partial unique indexes, conversations uniqueness, form_submissions table, bounded email dedup.
- `apps/staff-web/server/db/schema.ts` - Drizzle: `conversations.status` enum now includes `'lead'`; added `formSubmissions` table export.

## Live Migration Application (Neon MCP)

Applied directly to gymos-demo Neon (project id `billowing-sun-51091059`) via `mcp__Neon__run_sql_transaction`, statement-by-statement — the same pattern documented for P1b-02 (gym migrations are NOT run through `runMigrations`, which only tracks the inherited Mail framework tables).

**Audit — dedup DELETE row count:** `0 rows`. No duplicate emails (or phones) existed in the seed, so the `DELETE FROM gym_members WHERE id IN (... ROW_NUMBER() ... rn > 1)` dedup statement removed nothing — a clean no-op as expected.

**Verification results (all passed):**
- `'lead'` status INSERT succeeded against `conversations` with no CHECK violation (test row inserted then cleaned up).
- All four indexes present: `gym_members_email_unique`, `gym_members_phone_unique`, `conversations_member_channel_unique`, `form_submissions_form_id_idx`.
- `form_submissions` table exists (`to_regclass('public.form_submissions')` non-null).
- `conversations_status_check` constraint created and accepts `open` / `closed` / `snoozed` / `lead`.

## Decisions Made

- **No pre-existing CHECK constraint on conversations.status.** The Open Question #1 verification (`SELECT conname FROM pg_constraint WHERE conrelid = 'conversations'::regclass AND contype = 'c'`) returned no constraint — `status` was a plain text column with no CHECK. Therefore statement 1's `ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check` was a no-op (nothing to drop), and the subsequent `ADD CONSTRAINT` **created a brand-new** `conversations_status_check` rather than widening an existing one. All existing rows already held `open`/`closed`/`snoozed`, so the new constraint applied cleanly with zero violations. The migration's `IF EXISTS` guard made this nuance harmless — no plan change was needed.

## Deviations from Plan

None - plan executed exactly as written. The "no pre-existing CHECK constraint" finding (above) is a documented schema nuance, not a deviation: the migration's `DROP CONSTRAINT IF EXISTS` handled it correctly without modification.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The Wave 0 schema everything in P1c depends on is now live. P1c-02 (forms fork + lead submission) can safely `ON CONFLICT (member_id, channel)` upsert conversations and `ON CONFLICT (email)/(phone_e164)` upsert members.
- `form_submissions` is ready for P1c-04 (forms builder + leads inbox) to read responses.
- No blockers.

## Self-Check: PASSED
- FOUND: apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql
- FOUND commit: b0e03271 (Task 1)
- FOUND commit: b7694c04 (Task 2)

---
*Phase: P1c-public-site-integrations*
*Completed: 2026-06-01*
