---
phase: BD2-telemetry-provisioning
plan: 05
type: execute
wave: 2
depends_on: ["01", "02"]
files_modified:
  - services/hq-worker/src/lib/db.ts
  - services/hq-worker/src/lib/compensate.ts
  - services/hq-worker/src/lib/compensate.test.ts
  - services/hq-worker/src/lib/run-step.ts
  - services/hq-worker/src/lib/run-step.test.ts
  - services/hq-worker/src/queues/provision-studio.ts
  - services/hq-worker/src/queues/provision-studio.test.ts
autonomous: true
requirements: [PROV-02, PROV-03, PROV-04, PROV-05, PROV-06, PROV-08, PROV-09]
must_haves:
  truths:
    - "LIFO compensation (rollback) is implemented and tested BEFORE the happy path; a failure at step N tears down steps N-1..1 in reverse, leaving no orphaned resources"
    - "Each forward step is idempotent: a step whose step_N_at is already set is skipped on retry (no duplicate Neon/Vercel/Fly resources)"
    - "The full 8-step saga runs end-to-end against mocked adapters; a deliberate mid-saga failure triggers compensation"
    - "The studio Neon connection string flows adapter->Vercel/Fly env only; it is never written to an hq_provisioning_runs column"
  artifacts:
    - path: "services/hq-worker/src/lib/compensate.ts"
      provides: "LIFO compensation engine driven by step_N_at flags + provider resource IDs"
      exports: ["compensate"]
    - path: "services/hq-worker/src/lib/run-step.ts"
      provides: "Per-step idempotency helper (skip if step_N_at set; mark complete after fn)"
      exports: ["runStep"]
    - path: "services/hq-worker/src/queues/provision-studio.ts"
      provides: "The 8-step provisioning saga orchestrator (pg-boss job handler)"
      exports: ["runProvisioningSaga", "registerProvisionStudio"]
  key_links:
    - from: "provision-studio saga step failure"
      to: "compensate (LIFO teardown)"
      via: "try/catch around the forward steps invoking compensate(run, apis, log)"
      pattern: "compensate\\("
---

<objective>
Build the provisioning SAGA CORE in services/hq-worker — and per the non-negotiable D-10, build + TEST the LIFO rollback BEFORE the happy-path forward steps. Then add the per-step idempotency helper (`runStep`), then the 8-step orchestrator that calls the BD2-02 adapters (mocked in tests), with a deliberate-failure test proving compensation tears down completed steps in reverse with no orphaned resources.

Purpose: orphaned Neon/Vercel/Fly resources are the highest-blast-radius failure (costly + hard to detect). Rollback-first guarantees the teardown exists before any forward call. All of this is unit-tested with the BD2-02 mocks — live runs are deferred-on-external-dependency (D-12).
Output: hq-worker pg mirror of provisioning tables, `compensate` + test, `runStep` + test, `provision-studio` saga + an end-to-end mocked test including a mid-saga failure → compensation.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD2-telemetry-provisioning/BD2-CONTEXT.md
@.planning/phases/BD2-telemetry-provisioning/BD2-RESEARCH.md
@.planning/phases/BD2-telemetry-provisioning/BD2-01-PLAN.md
@.planning/phases/BD2-telemetry-provisioning/BD2-02-PLAN.md

<interfaces>
<!-- Canonical: BD2-RESEARCH.md "Pattern 4" (runStep + compensate reference impls + step list) and "Pattern 9" (mocks + what-CAN-be-tested list). -->

From services/hq-worker/src/lib/db.ts (BD1) — currently re-exports getBoss. This plan ADDS a Drizzle getDb against the HQ Neon (DATABASE_URL_UNPOOLED) with a pg-core mirror of hq_provisioning_runs + hq_studios + hq_studio_tokens (mirror pattern from services/worker/src/lib/db.ts). NOTE: BD1 services/hq-worker/src/boss.ts re-exports getBoss from @gymos/queue; do NOT collide — add db.ts as a NEW concern. If a db.ts already exists check first; the listed file is the target.

From services/hq-worker/src/__tests__/mocks/provision-apis.ts (BD2-02): makeMockApis()/mockNeonApi/mockVercelApi/mockFlyApi — the ProvisionApis the saga consumes.

From services/hq-worker/src/lib/provision-apis/types.ts (BD2-02): NeonApi/VercelApi/FlyApi/ProvisionApis — the saga depends on these interfaces, never on the concrete adapters directly (so tests inject mocks).

The 8 steps (D-09, BD2-RESEARCH Pattern 4):
1 Neon project (find-or-create) → store neon_project_id; get dbUrl/dbUrlUnpooled (held in-memory, NOT persisted to HQ — D-13)
2 Run studio migrations against new Neon (installs the BD2-03 token_usage trigger)
3 Seed + studio admin user
4 Vercel project + env (DATABASE_URL etc.) + deploy + wait READY → store vercel_project_id
5 Fly apps (edge-webhooks + worker) + flyctl secrets --stage + machine + wait → store fly_app_name
6 Subdomain/DNS (attachDomain)
7 Issue telemetry token (generateTelemetryToken; store sha256 hash in hq_studio_tokens; set plaintext as STUDIO_TELEMETRY_TOKEN on Vercel + Fly env)
8 Register studio in HQ registry (hq_studios.status='active', provisioned_at)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: hq-worker HQ-Neon db handle + LIFO compensation engine (ROLLBACK FIRST) + test</name>
  <read_first>BD2-RESEARCH.md "Pattern 4" compensate reference impl + the per-step compensation map (step7 revoke_token, 6 remove_dns, 5 delete_fly_app, 4 delete_vercel, 1 delete_neon; steps 2/3 have no compensation — project deletion covers them), BD2-02 mocks (delete* methods), services/worker/src/lib/db.ts (pg-core mirror + getDb pattern), services/hq-worker/src/lib/env.ts (DATABASE_URL_UNPOOLED), D-10 (rollback before happy path).</read_first>
  <files>services/hq-worker/src/lib/db.ts, services/hq-worker/src/lib/compensate.ts, services/hq-worker/src/lib/compensate.test.ts</files>
  <behavior>
    - Given a run row with step_1_at..step_5_at set (6,7,8 null), `compensate(run, mockApis, log)` calls: fly.deleteApp(fly_app_name), vercel.deleteProject(vercel_project_id), neon.deleteProject(neon_project_id) — IN THAT ORDER (LIFO: 5,4,1; 2/3 no-op) — and NOT remove_dns / revoke_token (steps 6/7 not completed).
    - Given a run with all 8 steps set, compensation order is exactly 7(revoke token)→6(remove dns)→5(fly)→4(vercel)→1(neon).
    - A compensation step that THROWS does not abort the rest — remaining compensations still run; the error is recorded into compensation_errors and the run status set to 'failed_terminal'.
    - compensate never references a connection string (only resource IDs from the run row).
  </behavior>
  <action>
    1. `db.ts`: add `getHqDb()` (drizzle neon-serverless against DATABASE_URL_UNPOOLED, like services/worker/src/lib/db.ts) with a pg-core mirror of hqProvisioningRuns + hqStudios + hqStudioTokens + hqStudios columns needed; export `schema` + `getHqDb` + `_resetDbForTests`. Keep the existing getBoss re-export intact (do not remove).
    2. `compensate.ts`: implement `compensate(run, apis: ProvisionApis, log)` per Pattern 4 — build the LIFO list from which step_N_at are set, map each to its teardown (7→revoke token = update hq_studio_tokens.revoked_at; 6→apis.vercel.attachDomain reverse / remove DNS; 5→apis.fly.deleteApp(run.flyAppName); 4→apis.vercel.deleteProject(run.vercelProjectId); 1→apis.neon.deleteProject(run.neonProjectId)). Wrap each in try/catch, collect errors into a record, NEVER re-raise (best-effort). Finally update the run: status='failed_terminal', compensationErrors=JSON.stringify(errors), updatedAt=now.
    3. `compensate.test.ts`: vitest using makeMockApis() + a fake run row + a mocked getHqDb; implement the four behaviors (assert call order via mock.invocationCallOrder or sequential expect; assert a throwing mock does not stop the rest; assert no connection string referenced).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/hq-worker test -- compensate</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gymos/hq-worker test -- compensate` passes (4 behaviors green; LIFO order asserted).
    - `grep -n "deleteApp\|deleteProject\|revoked\|compensationErrors\|failed_terminal" services/hq-worker/src/lib/compensate.ts` confirms the teardown set.
    - `grep -niE "connection|database_url|dsn" services/hq-worker/src/lib/compensate.ts` returns NOTHING.
    - `grep -n "getHqDb" services/hq-worker/src/lib/db.ts` confirms the HQ db handle exists; existing getBoss export still present.
  </acceptance_criteria>
  <done>LIFO compensation engine exists and is tested BEFORE any forward step; teardown is best-effort, ordered, resource-ID-only.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Per-step idempotency helper (runStep) + test</name>
  <read_first>BD2-RESEARCH.md "Pattern 4" runStep reference impl (read run; if step_N_at set → skip; else run fn; mark step_N_at), BD2-01 hqProvisioningRuns columns (step_1_at..step_8_at), Pitfall P-01/P-02 (per-step tracking is the idempotency mechanism since providers have no idempotency keys).</read_first>
  <files>services/hq-worker/src/lib/run-step.ts, services/hq-worker/src/lib/run-step.test.ts</files>
  <behavior>
    - `runStep(db, runId, 3, fn)` when step_3_at is null → calls fn(), then updates step_3_at to an ISO timestamp, returns fn's output.
    - `runStep(db, runId, 3, fn)` when step_3_at is already set → does NOT call fn() (skip), returns a skipped marker.
    - If fn() throws, step_3_at is NOT marked (so a retry re-runs the step; the saga catch triggers compensation).
    - run not found → throws.
  </behavior>
  <action>
    Implement `runStep<T>(db, runId, stepNum: 1..8, fn)` per Pattern 4: select the run; throw if missing; compute `stepCol = "step_"+stepNum+"_at"`; if the run's value for that column is non-null → return `{ skipped: true } as T` WITHOUT calling fn; else `const out = await fn()`; update the run setting that column to `new Date().toISOString()` + updatedAt; return out. (Single pg-boss worker per runId makes the read-then-write safe — note this in a comment; expireInSeconds/retryLimit are set by the saga's boss.send in Task 3 per Pitfall P-07.)
    `run-step.test.ts`: mock getHqDb; implement the four behaviors.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/hq-worker test -- run-step</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gymos/hq-worker test -- run-step` passes (4 behaviors green; the skip-on-already-set and no-mark-on-throw cases explicitly present).
    - `grep -n "skipped\|step_\|toISOString" services/hq-worker/src/lib/run-step.ts` confirms skip logic + completion marking.
  </acceptance_criteria>
  <done>runStep gives every forward step idempotent skip-on-retry semantics; tested.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 8-step provisioning saga orchestrator + end-to-end mocked test (incl. mid-saga failure → compensation)</name>
  <read_first>BD2-RESEARCH.md "Pattern 4" (step list), Pattern 1/2/3 (what each step calls), Pattern 9 (mocks + testable list), Pitfall P-07 (boss.send with expireInSeconds:600, retryLimit:3), apps/hq/server/lib/telemetry-token.ts (generateTelemetryToken + hashToken from BD2-04 — import for step 7), services/hq-worker/src/__tests__/mocks/provision-apis.ts, services/hq-worker/src/lib/compensate.ts + run-step.ts (Tasks 1-2).</read_first>
  <files>services/hq-worker/src/queues/provision-studio.ts, services/hq-worker/src/queues/provision-studio.test.ts</files>
  <behavior>
    - `runProvisioningSaga(runId, apis, db, log)` against all-success mocks runs steps 1-8 in order, calling neon.findProjectBySlug→createProject, runs studio migrations (step 2 stub/injected migrator), seed (step 3 stub), vercel create/env/deploy/wait, fly create/secrets/machine/wait, attachDomain, issues token (hashToken stored in hq_studio_tokens, plaintext set as Vercel+Fly env), registers studio (status='active') — and marks step_1_at..step_8_at.
    - Re-running a saga where step_1_at..step_3_at are already set SKIPS Neon create/migrate/seed (findProjectBySlug/createProject NOT called again) and resumes at step 4 — proving PROV-08 (Success-Criteria #3).
    - A deliberate failure injected at step 6 (mock attachDomain throws) causes the saga catch to invoke `compensate(...)`, which (per Task 1) tears down steps 5,4,1 — asserting fly.deleteApp + vercel.deleteProject + neon.deleteProject are called and the run ends 'failed_terminal' (Success-Criteria #4).
    - The dbUrl/dbUrlUnpooled returned by neon.createProject is passed to vercel.setEnvVars / fly.setSecrets but is NEVER written to any hqProvisioningRuns update (D-13) — assert no update call includes a URL value.
    - `registerProvisionStudio(boss, apis)`: boss.work("provision-studio", handler) FIRST, createQueue, and document the producer contract `boss.send("provision-studio", {runId}, { expireInSeconds:600, retryLimit:3 })` (P-07).
  </action>
  <action>
    Implement `runProvisioningSaga` wrapping each step in `runStep(db, runId, N, async () => { ... })`, persisting provider resource IDs (neon_project_id after step1, vercel_project_id after step4, fly_app_name after step5, subdomain after step6) via db.update — resource IDs ONLY, never URLs. Steps 2 & 3 (studio migrations + seed) accept an injected migrator/seeder function (so tests stub them; real wiring uses the studio runMigrations + a seed call — note that running studio migrations against the freshly created Neon installs the BD2-03 trigger). Step 7 uses generateTelemetryToken()+hashToken() and pushes plaintext to vercel.setEnvVars + fly.setSecrets as STUDIO_TELEMETRY_TOKEN. Wrap steps 1-8 in try/catch → on error call `compensate(run, apis, log)` then rethrow (so pg-boss marks the job failed). At entry, if a live run is requested and the BD2-02 provider tokens are unset, throw a clear "deferred-on-external-dependency: set NEON_API_KEY/VERCEL_BEARER_TOKEN/FLY_API_TOKEN" error (tests use mocks so this path is not hit). Add `registerProvisionStudio(boss, apis)`.
    Write `provision-studio.test.ts` implementing the four behaviors with makeMockApis() + mocked getHqDb + stubbed migrator/seeder.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/hq-worker test -- provision-studio</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gymos/hq-worker test -- provision-studio` passes (all 4 behaviors green; resume-at-step-4 and fail-at-step-6→compensation both explicitly tested).
    - `grep -n "compensate(" services/hq-worker/src/queues/provision-studio.ts` confirms the catch wires rollback.
    - `grep -n "runStep" services/hq-worker/src/queues/provision-studio.ts` shows every step wrapped.
    - `grep -n "generateTelemetryToken\|hashToken\|STUDIO_TELEMETRY_TOKEN" services/hq-worker/src/queues/provision-studio.ts` confirms step-7 token issue + propagation.
    - `grep -n "expireInSeconds\|retryLimit" services/hq-worker/src/queues/provision-studio.ts` confirms P-07 producer-contract documentation.
    - `pnpm --filter @gymos/hq-worker exec tsc --noEmit` passes.
  </acceptance_criteria>
  <done>The 8-step saga runs end-to-end on mocks, resumes idempotently mid-way, and on a mid-saga failure compensates LIFO with no orphaned resources; connection strings never persist to HQ.</done>
</task>

</tasks>

<verification>
- compensate + run-step + provision-studio tests all green; `pnpm --filter @gymos/hq-worker exec tsc --noEmit` clean.
- Rollback was built + tested in Task 1, before the forward saga in Task 3 (D-10 honored).
- Idempotent resume (skip completed steps) and mid-saga-failure compensation both proven.
- No connection string written to any hq_provisioning_runs column (grep + test assertion).
- Live-run deferral throws a clear error when provider tokens are unset (D-12).
</verification>

<success_criteria>
- PROV-09 LIFO rollback shipped before happy path; no orphaned resources on partial failure.
- PROV-08 per-step idempotency + find-or-create (adapters) — retry never duplicates.
- PROV-02..06 the 8 provider steps are orchestrated (mock-tested; live deferred).
</success_criteria>

<output>
After completion, create `.planning/phases/BD2-telemetry-provisioning/BD2-05-SUMMARY.md`
</output>
