---
phase: BD3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/hq-schema/src/constants.ts
  - apps/hq/server/lib/studio-health.ts
  - apps/hq/server/lib/studio-health.test.ts
  - apps/hq/actions/list-studios.ts
  - apps/hq/app/routes/api.studios.ts
autonomous: true
requirements: [HQB-01, HQB-02, HQB-03, HQB-04]
must_haves:
  truths:
    - "classifyStudioHealth returns status 'stale' when last_telemetry_received_at is null or older than TELEMETRY_STALENESS_HOURS, regardless of snapshot data"
    - "classifyStudioHealth returns the correct at-risk signal (dormant / under-messaging / low-retention) per threshold"
    - "GET /api/studios returns one row per studio with latest snapshot aggregates, 30-day token spend, and a computed health classification"
    - "at-risk cohort = dormant OR under-messaging OR low-retention OR stale; power-user cohort = high engagement + healthy retention + active messaging"
  artifacts:
    - path: "apps/hq/server/lib/studio-health.ts"
      provides: "Deterministic classifyStudioHealth() classification engine (no LLM)"
      exports: ["classifyStudioHealth", "HealthStatus", "CohortMembership", "StudioHealthSignals"]
    - path: "apps/hq/server/lib/studio-health.test.ts"
      provides: "Unit coverage for staleness gate, signals, cohorts"
    - path: "apps/hq/actions/list-studios.ts"
      provides: "list-studios action returning studio rows + classification"
    - path: "apps/hq/app/routes/api.studios.ts"
      provides: "GET /api/studios resource route (DISTINCT ON latest snapshot + 30d token spend)"
    - path: "packages/hq-schema/src/constants.ts"
      provides: "Tunable threshold constants"
      contains: "TELEMETRY_STALENESS_HOURS"
  key_links:
    - from: "apps/hq/app/routes/api.studios.ts"
      to: "apps/hq/server/lib/studio-health.ts"
      via: "import classifyStudioHealth"
      pattern: "classifyStudioHealth"
    - from: "apps/hq/server/lib/studio-health.ts"
      to: "packages/hq-schema/src/constants.ts"
      via: "import threshold constants"
      pattern: "TELEMETRY_STALENESS_HOURS"
---

<objective>
Build the HQB deterministic health-classification engine and the read model that powers the operator console. No LLM in the trust path (D-01) — pure threshold rules over the telemetry tables BD2 already populates. Staleness is a first-class state (D-02 / HQB-03): a studio with missing or stale telemetry is NEVER classified healthy.

Purpose: HQB-01/02/03/04 — the operator can see every studio's health + cohort derived from telemetry aggregates, with stale studios visibly excluded from "healthy".
Output: `classifyStudioHealth()` engine + unit tests, threshold constants, a `list-studios` action, and a `GET /api/studios` resource route returning rows + classification.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/BD3-hq-brain-dispatcher/BD3-CONTEXT.md
@.planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md

<interfaces>
TelemetrySnapshot fields (from packages/hq-schema/src/telemetry.ts) — the classification signals:
```typescript
{
  studioId: string; periodStart: string; periodEnd: string;
  llmInputTokens: number; llmOutputTokens: number; llmRequestCount: number;
  activeMembers: number;     // dormant signal
  bookings: number;          // engagement signal
  messagesSent: number;      // under-messaging signal
  mobileEngagement: number;
  retentionRate: number;     // low-retention signal (0..1)
}
```
Import the existing type: `import type { TelemetrySnapshotInput } from "@gymos/hq-schema/telemetry";`

HQ db handle + schema (from apps/hq/server/db/index.ts): `import { getDb, schema } from "../../server/db/index.js";` — relative depth from `apps/hq/app/routes/` is `../../server/db/index.js`. Tables: `schema.hqStudios`, `schema.hqTelemetrySnapshots`, `schema.hqTokenUsage`.

Existing resource-route pattern (apps/hq/app/routes/api.provisioning-runs.ts): uses `data<T>(...)` from "react-router", `loader(args)`, `getDb()`, raw drizzle select; carries `// guard:allow-unscoped -- HQ tables are operator-scoped` comment.

`last_telemetry_received_at` lives on hq_telemetry_snapshots (NOT hq_studios). watchdog.ts gets the latest per studio via the DISTINCT ON (studio_id) ORDER BY received_at DESC pattern.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Threshold constants + classifyStudioHealth engine (RED→GREEN)</name>
  <files>packages/hq-schema/src/constants.ts, apps/hq/server/lib/studio-health.ts, apps/hq/server/lib/studio-health.test.ts</files>
  <read_first>
    - packages/hq-schema/src/constants.ts (append constants here — existing HQ_ORG_ID pattern)
    - packages/hq-schema/src/telemetry.ts (TelemetrySnapshotInput type)
    - services/hq-worker/src/queues/watchdog.ts (STALE_TELEMETRY_THRESHOLD_HOURS = 25 — the existing staleness baseline)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 213-320, 761-815 (classification skeleton, verbatim)
  </read_first>
  <behavior>
    - Test: lastTelemetryReceivedAt === null → status "stale", cohort "unknown", isStale true, signals ["No telemetry received"]
    - Test: lastTelemetryReceivedAt older than TELEMETRY_STALENESS_HOURS → status "stale" even if snapshot has great numbers (staleness FIRST, HQB-03)
    - Test: snapshot === null but recent timestamp → status "stale", signals ["No snapshot data"]
    - Test: activeMembers < DORMANT_ACTIVE_MEMBERS_THRESHOLD → isDormant true, status "at-risk", cohort "at-risk"
    - Test: messagesSent < UNDER_MESSAGING_THRESHOLD → isUnderMessaging true, status "at-risk"
    - Test: retentionRate < LOW_RETENTION_THRESHOLD → isLowRetention true, status "at-risk"
    - Test: retentionRate >= POWER_USER_RETENTION_THRESHOLD AND activeMembers >= POWER_USER_ACTIVE_MEMBERS_THRESHOLD AND messagesSent >= POWER_USER_MESSAGES_THRESHOLD AND no at-risk signal → cohort "power-user", status "healthy"
    - Test: healthy-but-not-power-user → status "healthy", cohort "healthy"
    - Test: signals array contains a human-readable reason string for each tripped signal (operator auditability, D-01)
  </behavior>
  <action>
    Append to `packages/hq-schema/src/constants.ts` (additive — same export style as HQ_ORG_ID):
    ```typescript
    /** Studios with last_telemetry_received_at older than this are classified 'stale'. 25h watchdog threshold + 1h buffer. */
    export const TELEMETRY_STALENESS_HOURS = 26;
    /** activeMembers below which a studio is 'dormant'. */
    export const DORMANT_ACTIVE_MEMBERS_THRESHOLD = 5;
    /** messagesSent below which a studio is 'under-messaging'. */
    export const UNDER_MESSAGING_THRESHOLD = 10;
    /** retentionRate below which a studio is 'low-retention' (< 50%). */
    export const LOW_RETENTION_THRESHOLD = 0.5;
    /** Power-user thresholds. */
    export const POWER_USER_RETENTION_THRESHOLD = 0.75;
    export const POWER_USER_ACTIVE_MEMBERS_THRESHOLD = 20;
    export const POWER_USER_MESSAGES_THRESHOLD = 50;
    /** Total token spend (input+output) above which is notable. */
    export const HIGH_TOKEN_SPEND_THRESHOLD = 10000;
    ```
    Create `apps/hq/server/lib/studio-health.ts` implementing the classification function with the exact signature and body from RESEARCH.md lines 761-815. Export types `HealthStatus = "healthy" | "dormant" | "under-messaging" | "low-retention" | "stale" | "at-risk"`, `CohortMembership = "power-user" | "at-risk" | "healthy" | "unknown"`, and `StudioHealthSignals` (status, cohort, isStale, isDormant, isUnderMessaging, isLowRetention, signals: string[]). Signature:
    ```typescript
    export function classifyStudioHealth(
      snapshot: TelemetrySnapshotInput | null,
      lastTelemetryReceivedAt: string | null,
      now?: Date,
    ): StudioHealthSignals
    ```
    CRITICAL ordering: the staleness checks (null timestamp → age > TELEMETRY_STALENESS_HOURS → null snapshot) MUST all return `stale` BEFORE any engagement check runs (Pitfall 3). Import constants from `@gymos/hq-schema/constants`.
    Write `apps/hq/server/lib/studio-health.test.ts` covering every bullet in <behavior>. Use vitest. The test imports `classifyStudioHealth` directly (pure function, no DB, no framework — unit-testable without a dev server, per the P1c constraint).
    Run prettier on all three files.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq test --run studio-health</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/server/lib/studio-health.ts` contains `export function classifyStudioHealth`
    - `packages/hq-schema/src/constants.ts` contains `TELEMETRY_STALENESS_HOURS`
    - `apps/hq/server/lib/studio-health.test.ts` exists with a test asserting a stale-but-high-numbers snapshot returns status `"stale"`
    - `pnpm -F @gymos/hq test --run studio-health` exits 0
    - `pnpm -F @gymos/hq-schema build` exits 0 (constants compile)
  </acceptance_criteria>
  <done>classifyStudioHealth is implemented, staleness gate runs first, all behavior tests green, threshold constants exported from hq-schema.</done>
</task>

<task type="auto">
  <name>Task 2: list-studios action + GET /api/studios resource route</name>
  <files>apps/hq/actions/list-studios.ts, apps/hq/app/routes/api.studios.ts</files>
  <read_first>
    - apps/hq/app/routes/api.provisioning-runs.ts (resource-route pattern to mirror: loader + data<T>() + getDb + guard:allow-unscoped comment)
    - apps/hq/server/db/index.ts (getDb + schema barrel; hqStudios/hqTelemetrySnapshots/hqTokenUsage)
    - apps/hq/actions/ask-brain.ts (defineAction shape used in apps/hq)
    - apps/hq/server/lib/studio-health.ts (created in Task 1 — classifyStudioHealth)
    - services/hq-worker/src/queues/watchdog.ts (DISTINCT ON subquery shape)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 278-319 (SQL read-model query, verbatim)
  </read_first>
  <action>
    Create `apps/hq/app/routes/api.studios.ts` — a React Router v7 resource route exposing `GET /api/studios`. Mirror `api.provisioning-runs.ts` exactly: `loader(_args: LoaderFunctionArgs)`, `getDb()` from `../../server/db/index.js`, `data<StudiosResponse>({ studios })` from "react-router", carry the `// guard:allow-unscoped -- HQ tables are operator-scoped (single super-admin)` comment.
    Use the SQL read-model from RESEARCH.md lines 280-317 via `db.execute<Row>(sql\`...\`)` (raw SQL is acceptable here — the DISTINCT ON subquery is not expressible in the drizzle query builder; watchdog.ts uses the same `db.execute` raw pattern). The query: LEFT JOIN hq_studios to the DISTINCT ON (studio_id) ORDER BY received_at DESC latest snapshot (payload_json, last_telemetry_received_at, period_start, period_end), LEFT JOIN to a 30-day SUM of hq_token_usage (total_input, total_output), ORDER BY s.created_at DESC.
    For each row: parse `payload_json` (JSON.parse, null-safe) into a TelemetrySnapshotInput, call `classifyStudioHealth(snapshot, lastTelemetryReceivedAt)`, and return an exported `StudioConsoleRow` interface: { id, slug, displayName, ownerEmail, status, provisionedAt, lastTelemetryReceivedAt, periodStart, periodEnd, totalInputTokens, totalOutputTokens, activeMembers, bookings, messagesSent, retentionRate, health: StudioHealthSignals }. Export `StudiosResponse { studios: StudioConsoleRow[] }`.
    Define raw-row interfaces that `extends Record<string, unknown>` (drizzle execute<T> requires this — see STATE.md BD2-06 decision).
    Create `apps/hq/actions/list-studios.ts` using `defineAction` (mirror ask-brain.ts): empty/optional Zod schema (e.g. `z.object({}).strict()`), `run` calls `getDb()` and runs the same read-model + classification, returning `{ studios }` so the HQD/HQB agent can also list studios. Factor the shared query+classification into a helper in studio-health.ts or a new `apps/hq/server/lib/list-studios.ts` so both the route and action call it (no duplication). Add `list-studios` to the actions barrel if apps/hq has one (check `apps/hq/actions/run.ts` — note it only re-exports dispatchActions; HQ-local actions are auto-mounted by the action loader — follow whatever ask-brain.ts does for registration).
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/app/routes/api.studios.ts` exists and contains `export async function loader` and `classifyStudioHealth`
    - `api.studios.ts` contains `DISTINCT ON` (latest-snapshot subquery) and `INTERVAL '30 days'` (token-spend window)
    - `apps/hq/actions/list-studios.ts` exists and contains `defineAction`
    - `apps/hq/app/routes/api.studios.ts` contains the literal `guard:allow-unscoped`
    - `pnpm -F @gymos/hq exec tsc --noEmit` exits 0
    - `pnpm guard:hq-no-pii` exits 0 (no new offending column names introduced)
  </acceptance_criteria>
  <done>GET /api/studios and the list-studios action both return one row per studio with latest aggregates, 30-day token spend, and a classifyStudioHealth result; typecheck clean.</done>
</task>

</tasks>

<verification>
- `pnpm -F @gymos/hq test --run` green (studio-health suite)
- `pnpm -F @gymos/hq exec tsc --noEmit` clean
- `pnpm guard:hq-no-pii` passes (no PII-shaped columns added)
- No live HTTP walkthrough (P1c constraint) — route verified by typecheck + the pure-function tests; live row return is confirmed against Neon on deploy.
</verification>

<success_criteria>
- HQB-02/03/04 classification logic is deterministic, auditable (signals[]), and staleness-first.
- HQB-01 read model (`/api/studios`) returns rows ready for the console UI in BD3-02.
- All thresholds are named constants in hq-schema (no magic literals in the engine).
</success_criteria>

<output>
After completion, create `.planning/phases/BD3-hq-brain-dispatcher/BD3-01-SUMMARY.md`
</output>
