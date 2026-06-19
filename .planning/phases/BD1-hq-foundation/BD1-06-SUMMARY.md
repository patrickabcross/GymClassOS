---
phase: BD1-hq-foundation
plan: "06"
subsystem: infra
tags: [ci-guards, fork-boundary, pii, hq-schema, scripts]

# Dependency graph
requires:
  - phase: BD1-hq-foundation/BD1-01
    provides: apps/hq scaffold (copied-out fork of Dispatch + Brain templates)
  - phase: BD1-hq-foundation/BD1-02
    provides: packages/hq-schema with hq_app_meta table

provides:
  - scripts/guard-hq-fork-boundary.mjs — fails CI if apps/hq imports templates/ in place
  - scripts/guard-hq-no-pii.mjs — fails CI if HQ schema column name matches *connection*/*database_url*/*dsn*, or a real postgres URI is committed to HQ env/config
  - package.json guards chain extended with both HQ guards (guard:hq-fork-boundary + guard:hq-no-pii)

affects: [BD2-telemetry, BD2-provisioning, BD3-hq-brain, BD3-hq-dispatcher, BD4-studio-brain, BD4-studio-dispatcher]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Node-native async walk (readdir withFileTypes) with SKIP_DIRS + Windows-safe replaceAll("\\\\", "/") normalization — matches existing guard-no-env-credentials.mjs + guard-no-unscoped-queries.mjs precedent
    - Two-rule PII guard pattern: column-name regex scan + env-config literal scan with placeholder exclusions
    - Opt-out markers with required reason phrase (guard:allow-hq-template-import, guard:allow-hq-pii)

key-files:
  created:
    - scripts/guard-hq-fork-boundary.mjs
    - scripts/guard-hq-no-pii.mjs
  modified:
    - package.json (guard:hq-fork-boundary + guard:hq-no-pii scripts + guards chain)

key-decisions:
  - "guard-hq-no-pii RULE B excludes postgres URIs containing <angle-bracket> tokens — services/hq-worker/.env.example uses postgres://user:password@<hq-neon-host>.neon.tech/neondb which is safe"
  - "pnpm guards chain appends both new guards at the END so pre-existing guard ordering is preserved"
  - "No git shell-out in guard-hq-fork-boundary — pure file scan for determinism and Windows safety (D-14 compliance)"
  - "guard-hq-no-pii scans both string-literal column names AND JS property names to catch both text('database_url') and studioConnection: text(...) forms"

patterns-established:
  - "HQ CI guard pattern: targeted directory filter (startsWith 'apps/hq/') prevents false positives on other apps"
  - "PII column guard pattern: skip comment lines before pattern match so schema.ts docstrings documenting the rule do not self-trip"
  - "Placeholder URI exclusion heuristic: angle-brackets + user:password + YOUR_ + changeme/example/placeholder/your- suffice to distinguish example values from real credentials"

requirements-completed: [HQ-FND-06]

# Metrics
duration: ~12min
completed: 2026-06-19
---

# Phase BD1 Plan 06: CI Guards (Fork Boundary + PII-Up) Summary

**Two Node-native CI guards added and wired into pnpm guards chain: fork-boundary guard blocks any apps/hq import reaching into templates/, and PII guard blocks column names matching *connection*/*database_url*/*dsn* plus real postgres URIs in HQ env/config.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-19T11:36:00Z (approx)
- **Completed:** 2026-06-19T11:48:00Z (approx)
- **Tasks:** 3 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `scripts/guard-hq-fork-boundary.mjs` created: scans apps/hq/ for any import/require/dynamic-import whose specifier contains a `templates/` path segment; exits 1 with clear fork-boundary guidance + fix instructions
- `scripts/guard-hq-no-pii.mjs` created: two-rule guard — Rule A scans packages/hq-schema/ + apps/hq/server/db/ for PII-shaped column names; Rule B scans HQ env/config files for real postgres URIs; skips comment lines + placeholder URIs to avoid false positives
- Both guards wired into package.json as `guard:hq-fork-boundary` + `guard:hq-no-pii` named scripts, and appended to the `"guards"` chain; `prep` already calls `pnpm guards`, so D-15 is satisfied
- **Negative cases exercised and reverted:**
  - Fork boundary: added `import something from "../../templates/dispatch/app/root"` to a temp file in apps/hq → guard exited 1 → file deleted → guard exits 0
  - PII column: added `connectionString: text("database_url")` to a temp file in packages/hq-schema → guard exited 1 (caught BOTH the string literal AND the JS property name) → file deleted → guard exits 0

## Task Commits

1. **Task 1: guard-hq-fork-boundary.mjs** — `f1db2f18` (feat)
2. **Task 2: guard-hq-no-pii.mjs** — `cf452a15` (feat)
3. **Task 3: Wire guards into package.json + verify negative cases** — `76e6a54e` (chore)

## Files Created/Modified

- `scripts/guard-hq-fork-boundary.mjs` — Node-native guard: apps/hq must not import templates/ in place. Opt-out: `// guard:allow-hq-template-import — reason`
- `scripts/guard-hq-no-pii.mjs` — Node-native guard: no PII-shaped columns in hq-schema + no real postgres URIs in HQ env/config. Opt-out: `// guard:allow-hq-pii — reason`
- `package.json` — Added `guard:hq-fork-boundary` + `guard:hq-no-pii` named scripts; appended both to end of `"guards"` chain

## Decisions Made

- `guard-hq-no-pii` Rule B uses a placeholder-exclusion heuristic for postgres URIs: angle-brackets (`<...>`), literal `user:password` credentials, `YOUR_` prefix, `changeme`/`example`/`placeholder`/`your-` substrings. The existing `services/hq-worker/.env.example` file contains `postgres://user:password@<hq-neon-host>.neon.tech/neondb` which correctly passes the guard (both `user:password` and `<hq-neon-host>` are placeholder indicators).
- No git shell-out in either guard — pure file scan per D-14 for determinism and Windows safety.
- Both guards scan comment lines but SKIP flagging on them, so the PII boundary documentation already written in `packages/hq-schema/src/schema.ts` does not false-trip the guard.

## Deviations from Plan

### Pre-existing issue (out of scope — deferred)

`pnpm guards` exits 1 at the `guard:db-tool-scoping` step due to stale raw-DB denylist entries (60+ template tables). This failure pre-dates BD1-06 and is unrelated to the HQ guards. Verified by `git stash` + `pnpm guard:db-tool-scoping` before any BD1-06 changes — same failure. Logged to `deferred-items.md`.

The two new HQ guards (`pnpm guard:hq-fork-boundary && pnpm guard:hq-no-pii`) both pass independently. The full `pnpm guards` chain cannot be verified as exits-0 until `guard:db-tool-scoping` is fixed in a separate task.

**Total deviations:** 0 auto-fixes in BD1-06 scope. 1 pre-existing out-of-scope failure deferred.

## Issues Encountered

- `services/hq-worker/.env.example` contains a non-empty postgres URI (`postgres://user:password@<hq-neon-host>.neon.tech/neondb`) that Rule B initially needed to handle correctly. The placeholder-exclusion heuristic (angle-brackets + literal `user:password`) correctly classifies it as safe. Guard passed without false positive.

## Known Stubs

None — both guard scripts are fully functional. The HQ-FND-06 success criterion holds: adding a `database_url` column to packages/hq-schema causes `pnpm guard:hq-no-pii` to exit 1 (verified via reverted negative case).

## Next Phase Readiness

- BD1-06 complete: HQ-FND-06 satisfied. Both fork-boundary and PII-up invariants are mechanically enforced at CI time and locally via `pnpm prep`.
- BD1 phase is now fully complete (all 6 plans executed): HQ scaffold + auth + schema + migrations + hq-worker skeleton + CI guards + Anthropic audit.
- BD2 (Telemetry + Provisioning) can proceed. See STATE.md for the three research-needed items before BD2 PROV planning.

---
*Phase: BD1-hq-foundation*
*Completed: 2026-06-19*
