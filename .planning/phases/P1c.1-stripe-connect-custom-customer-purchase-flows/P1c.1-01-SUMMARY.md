---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: 01
subsystem: payments
tags: [stripe, stripe-connect, neon, drizzle, pg-boss, queue, typescript]

# Dependency graph
requires:
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
    provides: queue package with StripeEventPayload, pg-boss infrastructure, Neon schema
provides:
  - connected_accounts table live in gymos-demo Neon (9 columns + boolean defaults)
  - connectedAccounts Drizzle export in apps/staff-web/server/db/schema.ts
  - StripeEventPayload.stripeAccount optional field (acct_-prefixed)
  - enqueueStripeEvent threads stripeAccount through to boss.send data
affects:
  - P1c.1-02 (Connect webhook receiver — reads stripeAccount from payload)
  - P1c.1-03 (account.updated reducer — reads/writes connected_accounts via Drizzle)
  - P1c.1-04 through P1c.1-07 (all downstream plans that read connectedAccounts or thread stripeAccount)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct-to-Neon migration via @neondatabase/serverless neon() tagged template (not runMigrations/drizzle-kit push)"
    - "integer({ mode: 'boolean' }) dialect-agnostic boolean (NOT pgBoolean directly) for boolean columns in schema.ts"
    - "vi.hoisted() for shared mock factories in Vitest to avoid TDZ ReferenceError (P1b-04 pattern)"
    - "StripeEventPayload optional field: backward-compat optional Zod field on an existing payload schema"

key-files:
  created:
    - apps/staff-web/server/db/migrations/0006_p1c1_connected_accounts.sql
  modified:
    - apps/staff-web/server/db/schema.ts
    - packages/queue/src/types.ts
    - packages/queue/src/publish.test.ts

key-decisions:
  - "Used integer({ mode: 'boolean' }) convention (not boolean from pgBoolean) for chargesEnabled/payoutsEnabled — matches all other boolean columns in schema.ts; the @agent-native/core/db/schema helper maps this to pgBoolean when dialect=postgres"
  - "stripeAccount regex /^acct_/ validated at queue boundary — ensures only valid Stripe connected account IDs enter the job queue"
  - "singletonKey unchanged: stripe-event:stripe_${eventId} only — a Stripe replay of the same event must still dedup regardless of which account endpoint received it"
  - "No changes to publish.ts needed: data (not a hand-picked subset) is already passed to boss.send, so the new field flows through automatically"

patterns-established:
  - "Plan 01 convention: direct-to-Neon apply for gymos migrations (MCP or @neondatabase/serverless); never runMigrations or drizzle-kit push"

requirements-completed: [STR-01]

# Metrics
duration: 5min
completed: 2026-06-12
---

# Phase P1c.1 Plan 01: Connected Accounts Foundation Summary

**`connected_accounts` table live in gymos-demo Neon + Drizzle export; `StripeEventPayload` extended with optional `acct_`-prefixed `stripeAccount` field threading through `enqueueStripeEvent` to boss.send**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-12T13:08:56Z
- **Completed:** 2026-06-12T13:14:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Additive `connected_accounts` DDL (9 columns, boolean defaults) applied directly to gymos-demo Neon — verified via `to_regclass` + test row insert/select/delete
- `connectedAccounts` Drizzle table exported from `schema.ts` using `integer({ mode: 'boolean' })` convention (dialect-agnostic via core helper, maps to Postgres `boolean`)
- `StripeEventPayload` extended with `stripeAccount: z.string().regex(/^acct_/).optional()` — platform events parse unchanged, Connect events carry the acct_-prefixed id
- `enqueueStripeEvent` threads `stripeAccount` automatically (passes `data` whole to `boss.send`); `singletonKey` unchanged (dedup on `eventId` only)
- All 23 `@gymos/queue` tests pass; 83 `@gymos/worker` + 27 `edge-webhooks` regression tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Create + apply connected_accounts migration; export Drizzle table** - `b36aac8a` (feat)
2. **Task 2 RED: Failing tests for stripeAccount field + enqueueStripeEvent threading** - `6d083413` (test)
3. **Task 2 GREEN: Extend StripeEventPayload with optional stripeAccount** - `8504dabc` (feat)

**Plan metadata:** (docs commit — see final commit hash)

_Note: Task 2 used TDD — RED commit (failing tests) + GREEN commit (implementation). No REFACTOR commit needed (code already minimal and clean)._

## Files Created/Modified

- `apps/staff-web/server/db/migrations/0006_p1c1_connected_accounts.sql` — Additive DDL for connected_accounts (9 columns, boolean defaults, applied to Neon)
- `apps/staff-web/server/db/schema.ts` — Added `connectedAccounts` Drizzle export after `dashboardProposals`
- `packages/queue/src/types.ts` — Extended `StripeEventPayload` with `stripeAccount` optional field
- `packages/queue/src/publish.test.ts` — Added TDD tests: 3 schema tests + 3 enqueueStripeEvent mock tests; added `vi.hoisted` mock factory for `startBoss`/`boss.send`

## Decisions Made

- **`integer({ mode: 'boolean' })` not `boolean` from `drizzle-orm/pg-core`** — The `@agent-native/core/db/schema` helper's `integer` with `{ mode: 'boolean' }` is the project-wide convention for boolean columns (every other boolean in `schema.ts` uses it). It maps to `pgBoolean` at runtime when the dialect is postgres. Importing `boolean` directly would skip the dialect-agnostic helper.
- **`singletonKey` unchanged** — The Stripe event dedup key is `stripe-event:stripe_${eventId}`. Including `stripeAccount` would cause a re-delivered Connect event (same `eventId`) to bypass dedup and process twice. The key correctly stays eventId-only.
- **No changes to `publish.ts`** — `enqueueStripeEvent` already passes the full parsed `data` object to `boss.send`, so the new field flows through automatically. The plan confirmed this; no modification needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Used `integer({ mode: 'boolean' })` instead of `boolean` in Drizzle export**
- **Found during:** Task 1 (schema.ts export)
- **Issue:** Plan suggested `boolean("charges_enabled")` but project convention is `integer("col_name", { mode: "boolean" })` — the core schema helper maps this to `pgBoolean` at runtime. Using `boolean` directly would require importing `pgBoolean` separately and bypass the dialect-agnostic helper.
- **Fix:** Changed both `chargesEnabled` and `payoutsEnabled` to use `integer({ mode: "boolean" })` consistent with all other boolean columns in schema.ts
- **Files modified:** apps/staff-web/server/db/schema.ts
- **Verification:** Schema export consistent with project convention; Neon table already uses native Postgres `boolean` (DDL is unchanged — this is a Drizzle layer decision only)
- **Committed in:** b36aac8a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical / convention alignment)
**Impact on plan:** Necessary correction for consistency with existing schema.ts patterns. No behavior change — the Drizzle helper maps both to Postgres `boolean` at runtime.

## Issues Encountered

None — migration applied cleanly, tests passed on first GREEN run, regression suites all green.

## User Setup Required

None - no external service configuration required for this plan. The connected_accounts table is live in gymos-demo Neon. Stripe account creation (the row that populates this table) is handled by Plan 02 (webhook receiver) and Plan 03 (account.updated reducer).

## Next Phase Readiness

- `connected_accounts` table is live and Drizzle-exported — Plan 02 (Connect webhook receiver) and Plan 03 (account.updated reducer) can read/write it
- `StripeEventPayload.stripeAccount` is threading-ready — Plan 02's edge-webhooks receiver can enqueue Connect events with the `stripeAccount` field populated
- All regression suites green — no existing functionality affected by the optional field addition

## Self-Check: PASSED

- apps/staff-web/server/db/migrations/0006_p1c1_connected_accounts.sql: FOUND
- apps/staff-web/server/db/schema.ts: FOUND (connectedAccounts export verified)
- packages/queue/src/types.ts: FOUND (stripeAccount field verified)
- packages/queue/src/publish.test.ts: FOUND (23 tests verified)
- .planning/phases/P1c.1-.../P1c.1-01-SUMMARY.md: FOUND
- Commits b36aac8a / 6d083413 / 8504dabc / c1e42782: all present in git log

---
*Phase: P1c.1-stripe-connect-custom-customer-purchase-flows*
*Completed: 2026-06-12*
