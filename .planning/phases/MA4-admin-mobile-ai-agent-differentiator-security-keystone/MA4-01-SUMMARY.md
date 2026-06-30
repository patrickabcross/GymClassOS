---
phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone
plan: 01
subsystem: security
tags: [allow-list, gated-actions, vitest, agent-tools, mobile-admin]

# Dependency graph
requires:
  - phase: v1.2 Agentic Tab Editing (AE-series)
    provides: "gated Tier-3 verbs (send-template-to-members, create-checkout-link, publish-form, cancel-occurrence, reschedule-occurrence) + propose/approve gate"
provides:
  - "GATED_ACTION_LIST tuple + GATED_ACTIONS Set — single source of truth for the five gated verbs"
  - "MOBILE_ADMIN_ALLOWLIST — explicit 12-verb read+dashboard allow-list for the phone admin agent"
  - "buildAdminToolList(registry, allowlist?) — pure builder with a defensive GATED_ACTIONS filter"
  - "AI-02 keystone unit test proving no gated/mutating verb can reach the mobile admin tool list"
affects: [MA4-02 (admin SSE endpoint consumes MOBILE_ADMIN_ALLOWLIST + buildAdminToolList), MA4-03 (client whoami gating)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single exported constant re-imported by every consumer (collapses the v1.2 gate-atomicity 'update both files' rule into one edit point)"
    - "Pure dependency-free helper + stub-registry unit test under vitest.unit.config.ts (no @agent-native/core import — BD4-01 ESM/CJS caveat)"
    - "Explicit allow-list + defensive structural filter (belt-and-suspenders) instead of ALL−GATED subtraction"

key-files:
  created:
    - apps/staff-web/server/lib/gated-actions.ts
    - apps/staff-web/server/lib/mobile-admin-tools.ts
    - apps/staff-web/server/lib/mobile-admin-tools.test.ts
  modified:
    - apps/staff-web/actions/approve-proposal.ts
    - apps/staff-web/actions/propose-action.ts

key-decisions:
  - "Gated verbs live in exactly one file (gated-actions.ts); approve-proposal + propose-action import it so they can never drift"
  - "MOBILE_ADMIN_ALLOWLIST is an explicit 12-verb list, NOT ALL−GATED (the ~80-action registry has upstream Mail + staff-only verbs subtraction would leak)"
  - "buildAdminToolList runs a defensive .filter(!GATED_ACTIONS.has) on top of the allow-list — a gated verb wrongly added is still structurally stripped"
  - "Test uses a hand-written stub registry, never imports @agent-native/core or the generated actions-registry (would pull CJS React → break under vitest.unit.config.ts)"

patterns-established:
  - "Pattern: one source-of-truth constant module (pure, zero-import) for any list duplicated across action files"
  - "Pattern: pure(registry, allowlist) builder so allow-list security is unit-testable without the framework runtime"

requirements-completed: [AI-02]

# Metrics
duration: 4min
completed: 2026-06-30
---

# Phase MA4 Plan 01: Security Keystone (AI-02) Summary

**Single-source-of-truth GATED_ACTIONS + explicit 12-verb MOBILE_ADMIN_ALLOWLIST + pure buildAdminToolList with a defensive gated filter, proven by a 5-assertion vitest unit test that no gated or mutating verb can ever reach the mobile admin tool list.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-30T19:55:59Z
- **Completed:** 2026-06-30T19:59:35Z
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 edited)

## Accomplishments
- Extracted the five gated Tier-3 verbs into one pure module (`gated-actions.ts`) re-imported by both `approve-proposal.ts` (`ACTION_ALLOWLIST`) and `propose-action.ts` (Zod enum) — the v1.2 "update both files" gate-atomicity rule is now structurally a single edit point.
- Built the explicit `MOBILE_ADMIN_ALLOWLIST` (9 Tier-1 reads + 3 Tier-2 board-authoring verbs) and a pure, testable `buildAdminToolList(registry, allowlist?)` that defensively strips any gated verb.
- Wrote the AI-02 keystone unit test (5 assertions) — gated set integrity, exact 12-verb allow-list, no gated/mutating verb present, built-list excludes injected gated verbs, defensive filter strips a polluted allow-list. All green under `vitest.unit.config.ts` with no `@agent-native/core` import.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract GATED_ACTIONS to one source of truth; re-import in both action files** - `785d9c44` (feat)
2. **Task 2: MOBILE_ADMIN_ALLOWLIST + pure buildAdminToolList + AI-02 unit test** - `8b7459db` (feat)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified
- `apps/staff-web/server/lib/gated-actions.ts` (new) - Pure module: `GATED_ACTION_LIST` tuple, `GatedActionName` type, `GATED_ACTIONS` Set. Zero imports (vitest-safe).
- `apps/staff-web/server/lib/mobile-admin-tools.ts` (new) - `MOBILE_ADMIN_ALLOWLIST` (12 verbs), `AdminTool` type, pure `buildAdminToolList()` with defensive `GATED_ACTIONS.has` filter.
- `apps/staff-web/server/lib/mobile-admin-tools.test.ts` (new) - AI-02 keystone proof (5 assertions, stub registry).
- `apps/staff-web/actions/approve-proposal.ts` (edit) - `ACTION_ALLOWLIST` now imports `GATED_ACTION_LIST`; dynamic-import/revalidate logic untouched.
- `apps/staff-web/actions/propose-action.ts` (edit) - Zod enum now `z.enum(GATED_ACTION_LIST)`.

## Verification Results
- **AI-02 unit test:** `npx vitest run --config vitest.unit.config.ts server/lib/mobile-admin-tools.test.ts` → **1 file passed, 5/5 tests passed** (747ms).
- **tsc:** `npx tsc --noEmit` clean for all four touched source files (`gated-actions.ts`, `mobile-admin-tools.ts`, `approve-proposal.ts`, `propose-action.ts`) — grep for those filenames in tsc output returned no errors.
- **Prettier:** run on all 5 files (all reported unchanged — already conformant).

## Decisions Made
None beyond the plan — followed the plan as specified. (Claude's discretion items in CONTEXT.md — exact file/module names — were already fixed by the plan's task spec.)

## Deviations from Plan

None - plan executed exactly as written.

Note on an acceptance-criterion false positive: the helper-purity check `! grep -q "agent-native/core" mobile-admin-tools.ts` initially flagged because the literal token `@agent-native/core` appeared in an explanatory code comment (not an import). The comment was reworded to "the core framework runtime" so the file is genuinely free of the token; the helper never imported the framework. No functional change.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. TypeScript-only, no DB migration.

## Next Phase Readiness
- AI-02 keystone foundation complete: `MOBILE_ADMIN_ALLOWLIST` + `buildAdminToolList` are ready for MA4-02 to consume in the admin SSE endpoint (`api.m.admin.agent.stream.tsx`), executing tools via `registry[name].run(input)` with `entry.tool.parameters` as `input_schema`.
- `requireAdmin` (AI-03) and the `whoami` route are still to be built in MA4-02 / MA4-03 per the phase plan.
- No blockers.

## Self-Check: PASSED

All created files present on disk; both task commits (`785d9c44`, `8b7459db`) exist in git history.

---
*Phase: MA4-admin-mobile-ai-agent-differentiator-security-keystone*
*Completed: 2026-06-30*
