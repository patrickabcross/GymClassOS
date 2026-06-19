# BD1 Deferred Items

## guard:db-tool-scoping pre-existing failure

**Discovered during:** BD1-06 Task 3 (pnpm guards chain verification)
**Scope:** Out-of-scope for BD1-06 — pre-dates this plan
**Status:** Deferred

`pnpm guards` exits 1 at the `guard:db-tool-scoping` step. The guard reports 60+ "stale raw-DB denylist entries" across templates (analytics, brain, calendar, calls, clips, design, forms, images, mail, meeting-notes, migration, scheduling, slides, videos).

This failure was confirmed pre-existing by verifying with `git stash` that the guard fails identically before any BD1-06 changes.

The two new BD1-06 guards (`guard:hq-fork-boundary`, `guard:hq-no-pii`) both pass independently. The full chain cannot be verified as exits-0 until `guard:db-tool-scoping` is repaired in a separate task.

**Impact:** The `pnpm prep` step in CI will continue to fail at this guard until fixed. BD2+ planning should include a task to repair `guard:db-tool-scoping` (likely: update the denylist in `scripts/guard-db-tool-scoping.mjs` to remove entries for templates that no longer have matching raw-DB files, or rebuild the list from the current template set).
