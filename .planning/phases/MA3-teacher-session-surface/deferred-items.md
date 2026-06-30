# MA3 — Deferred Items (out of scope, logged not fixed)

## Pre-existing tsc errors in `apps/staff-web/actions/mark-booking-attended.ts`

- **Discovered during:** MA3-02 final full `tsc --noEmit` (the per-file scoped checks for the six new teacher files were all clean).
- **Errors:**
  - `actions/mark-booking-attended.ts(88,16): TS2339: Property 'execute' does not exist on type 'LibSQLDatabase<...>'`
  - `actions/mark-booking-attended.ts(95,33): TS2339: Property 'execute' does not exist on type 'LibSQLDatabase<...>'`
- **Why out of scope:** `mark-booking-attended.ts` is byte-identical to its MC3-01 state (commit `6f753b27`) — it was NOT modified by MA3-02. The errors are a Drizzle type-inference quirk (`getDb()` widening to `LibSQLDatabase` instead of the Neon driver type, so `db.execute(sql\`...\`)` is unrecognised). The file ships and runs in production (it is the live attendance chokepoint). This is a type-only annotation gap, not a runtime defect.
- **Action:** Logged, not fixed (scope boundary: only auto-fix issues directly caused by the current task's changes). MA3-02's own surface (`api.m.teacher.*` + Nitro delegators) is fully tsc-clean.
- **Suggested future fix:** narrow `getDb()`'s return type to the Neon driver (which exposes `.execute`) or cast at the call site; touches the DB-layer typing, not this phase.
