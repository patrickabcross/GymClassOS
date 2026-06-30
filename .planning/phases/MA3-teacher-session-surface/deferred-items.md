# MA3 — Deferred Items (out of scope, logged not fixed)

## Pre-existing tsc errors in `apps/staff-web/actions/mark-booking-attended.ts`

- **Discovered during:** MA3-02 final full `tsc --noEmit` (the per-file scoped checks for the six new teacher files were all clean).
- **Errors:**
  - `actions/mark-booking-attended.ts(88,16): TS2339: Property 'execute' does not exist on type 'LibSQLDatabase<...>'`
  - `actions/mark-booking-attended.ts(95,33): TS2339: Property 'execute' does not exist on type 'LibSQLDatabase<...>'`
- **Why out of scope:** `mark-booking-attended.ts` is byte-identical to its MC3-01 state (commit `6f753b27`) — it was NOT modified by MA3-02. The errors are a Drizzle type-inference quirk (`getDb()` widening to `LibSQLDatabase` instead of the Neon driver type, so `db.execute(sql\`...\`)` is unrecognised). The file ships and runs in production (it is the live attendance chokepoint). This is a type-only annotation gap, not a runtime defect.
- **Action:** Logged, not fixed (scope boundary: only auto-fix issues directly caused by the current task's changes). MA3-02's own surface (`api.m.teacher.*` + Nitro delegators) is fully tsc-clean.
- **Suggested future fix:** narrow `getDb()`'s return type to the Neon driver (which exposes `.execute`) or cast at the call site; touches the DB-layer typing, not this phase.

## Pre-existing tsc error in `packages/mobile-app/app/(tabs)/index.tsx`

- **Discovered during:** MA3-03 final full mobile `tsc --noEmit` (the per-file scoped checks for the five MA3-03 files were all clean).
- **Error:** `app/(tabs)/index.tsx(546,15): TS2769: No overload matches this call.` — a `fontVariant: readonly ["tabular-nums"]` literal in a `StyleSheet` Text style is `readonly` and not assignable to RN's mutable `FontVariant[]`.
- **Why out of scope:** `index.tsx` (member Home tab) was NOT touched by MA3-03. The error is a `as const`/readonly-tuple vs RN type quirk, runtime-safe (the value is a valid font variant). All five MA3-03 files (`lib/use-role.ts`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/teacher-schedule.tsx`, `app/teacher-roster.tsx`) are fully tsc-clean.
- **Action:** Logged, not fixed (scope boundary).
- **Suggested future fix:** drop the `as const` / write `fontVariant: ["tabular-nums"]` without the readonly annotation, or cast the style.
- **RESOLVED 2026-06-30 (MA2-02):** Fixed while editing `index.tsx` for the MEM-05 Home list (the file is now in-scope). Changed `fontVariant: ["tabular-nums"] as const` → `fontVariant: ["tabular-nums" as const]` (element-level const → `"tabular-nums"[]`, a mutable array assignable to RN's `FontVariant[]`). Full `packages/mobile-app` `tsc --noEmit` now exits 0.
