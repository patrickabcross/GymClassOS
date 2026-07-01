---
phase: quick
plan: 260701-vob
subsystem: member-onboarding
tags: [parq, health-screening, booking-gate, mobile, neon-migration]
dependency-graph:
  requires: [gym_members, forms/submissions, api.m.bookings, api.m.profile]
  provides: [parq_completed_at, parq_flagged, PARQ_REQUIRED gate]
  affects: [member booking flow, mobile schedule tab]
tech-stack:
  added: []
  patterns:
    - raw SQL execute escape hatch for Drizzle (db as any).execute(sql`...`) on Neon columns not yet in Drizzle types
    - PARQ flagged logic — conditionsFlag | ynFlag | declarationFlag from form submission data
    - integer(mode:"boolean") for BOOLEAN columns in Drizzle schema (active-column gotcha avoidance)
key-files:
  created:
    - apps/staff-web/server/db/migrations/0009_parq_columns.sql
  modified:
    - apps/staff-web/server/db/schema.ts
    - apps/staff-web/server/plugins/db.ts
    - apps/staff-web/features/forms/handlers/submissions.ts
    - apps/staff-web/app/routes/api.m.bookings.tsx
    - apps/staff-web/app/routes/api.m.profile.tsx
    - packages/mobile-app/app/(tabs)/schedule.tsx
decisions:
  - parq_flagged uses integer(mode:"boolean") per active-column gotcha — emits Postgres BOOLEAN, not bigint
  - Single db.ts v38 entry with two ALTER statements (matches v31 multi-statement precedent)
  - Both ALTERs are ADD COLUMN IF NOT EXISTS — safe to re-run on a DB that already has the columns (HUSTLE prod already applied)
  - flagged logic: conditionsFlag = conditions.some(c => c && c !== "None"); ynFlag = any of five Y/N fields === "Yes"; declarationFlag = declaration !== "Yes"
  - Mobile client gates pre-flight on parqCompletedAt from /api/m/profile; server 403 PARQ_REQUIRED is the enforcement backstop
  - openParqForm invalidates ["profile"] query on browser return so parqCompletedAt updates automatically
metrics:
  duration: ~45 minutes
  completed: 2026-07-01
  tasks-completed: 3
  files-changed: 6
---

# Quick Task 260701-vob: PARQ v2 — PAR-Q Health Form Gate

PAR-Q completion stamped on `gym_members` at form submit; booking endpoint gates on it (403 `PARQ_REQUIRED`); mobile schedule shows an inline prompt with a deep-link to `/f/parq` before allowing any class booking.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | DB schema + durable migration | `da842136` | schema.ts, 0009_parq_columns.sql, db.ts |
| 2 | Backend — stamp on submit, gate booking, expose status | `452be963` | submissions.ts, api.m.bookings.tsx, api.m.profile.tsx |
| 3 | Mobile PARQ gate | `0ce20305` | packages/mobile-app/app/(tabs)/schedule.tsx |

## What Was Built

### Task 1 — Schema + Migration (da842136)

Added two columns to `gymMembers` in `schema.ts`:

- `parqCompletedAt: text("parq_completed_at")` — ISO timestamp; null = PARQ not completed
- `parqFlagged: integer("parq_flagged", { mode: "boolean" }).notNull().default(false)` — true if any health concern flagged

Created `0009_parq_columns.sql` with `ADD COLUMN IF NOT EXISTS` guards (safe to re-run on HUSTLE prod which already has the columns). Added version 38 to `db.ts` `runMigrations` array using the same multi-statement single-entry pattern as v31.

### Task 2 — Backend (452be963)

**submissions.ts** — step 9b after the member upsert, keyed on `form.slug === "parq"`. Evaluates flagged logic:
- `conditionsFlag` = conditions multiselect has any value other than "None"
- `ynFlag` = any of `mental_health / disability / bp_heart_medication / pregnant / other_reason` === "Yes"
- `declarationFlag` = `declaration` !== "Yes"

Writes `SET parq_completed_at = ${now}, parq_flagged = ${parqFlagged}` using the raw SQL escape hatch (`db as any as { execute }`) because `parqCompletedAt` is not yet in Drizzle's type output for Neon.

**api.m.bookings.tsx** — PARQ gate block immediately after `requireMemberOrDemo`, BEFORE `let occurrenceId`. Reads `parq_completed_at` via raw SQL; returns `jsonResponse({ error: "PARQ_REQUIRED" }, 403)` if null.

**api.m.profile.tsx** — Added `parqCompletedAt: member.parqCompletedAt ?? null` and `parqFlagged: member.parqFlagged ?? false` to the returned member object.

### Task 3 — Mobile (0ce20305)

**schedule.tsx** — Five changes:
1. Added `API_BASE_URL` to the `apiFetch` import.
2. After `passBalance`, reads `parqCompletedAt` from `profileData?.member?.parqCompletedAt`.
3. `openParqForm` callback opens `${API_BASE_URL}/f/parq?email=${...}` via `WebBrowser.openBrowserAsync` then invalidates `["profile"]` query on return.
4. `bookForSignedInMember` now short-circuits to `setParqPrompt(true)` if `!parqCompletedAt`, BEFORE the `passBalance` branch (correct ordering — no-pass member must not reach Stripe until PARQ is complete).
5. `bookMutation.onError` handles `PARQ_REQUIRED` first (before NO_PASS/402 branch).
6. PARQ prompt banner rendered (after purchaseInFlight, before bookError) with "Complete" and "Dismiss" buttons using existing `infoToast` style.

## Deviations from Plan

None — plan executed exactly as written.

## Deploy Notes

### Backend (staff-web on Vercel)

Deploy via `git push origin master`. Vercel picks up the commit automatically. The `runMigrations` v38 entry runs on first request after deploy — idempotent (`ADD COLUMN IF NOT EXISTS`) so harmless against HUSTLE prod which already has the columns.

### Mobile (Expo)

The `schedule.tsx` change requires a mobile rebuild. Options:
- `eas build --profile testflight --platform ios` for a new TestFlight build
- `eas build --profile development` for a dev-client update

The server-side 403 `PARQ_REQUIRED` enforcement is **already live** after the backend deploy. Members using the old mobile build will see a generic error if they try to book without completing PARQ — the UX prompt only appears after the mobile rebuild.

## Known Stubs

None. All data paths are wired end-to-end (form submit stamps the row; booking reads it; profile exposes it; mobile consumes profile). No placeholder values.

## Self-Check

### Files

- [x] `apps/staff-web/server/db/schema.ts` — `parqCompletedAt` at line 132
- [x] `apps/staff-web/server/db/migrations/0009_parq_columns.sql` — exists, IF NOT EXISTS guards
- [x] `apps/staff-web/server/plugins/db.ts` — v38 entry with two ALTERs
- [x] `apps/staff-web/features/forms/handlers/submissions.ts` — step 9b at line 395
- [x] `apps/staff-web/app/routes/api.m.bookings.tsx` — PARQ_REQUIRED at line 52
- [x] `apps/staff-web/app/routes/api.m.profile.tsx` — parqCompletedAt at line 127
- [x] `packages/mobile-app/app/(tabs)/schedule.tsx` — openBrowserAsync at line 283

### Commits

- [x] `da842136` — confirmed in git log
- [x] `452be963` — confirmed in git log
- [x] `0ce20305` — confirmed in git log

## Self-Check: PASSED
