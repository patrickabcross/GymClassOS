---
phase: BD2-telemetry-provisioning
plan: 06
type: execute
wave: 3
depends_on: ["04", "05"]
files_modified:
  - apps/hq/server/routes/api/signup/index.post.ts
  - apps/hq/server/routes/api/signup/index.post.test.ts
  - apps/hq/server/plugins/auth.ts
  - apps/hq/app/routes/provisioning.tsx
  - apps/hq/app/routes/api.provisioning-runs.ts
  - services/hq-worker/src/queues/watchdog.ts
  - services/hq-worker/src/queues/watchdog.test.ts
  - services/hq-worker/src/index.ts
autonomous: false
requirements: [PROV-01, PROV-07, PROV-10]
must_haves:
  truths:
    - "A public signup POST inserts a hq_studios + hq_provisioning_runs row and enqueues the saga, returning 202 immediately (does not block on provisioning)"
    - "The operator can see each provisioning run's per-step status/progress and failures in an HQ dashboard"
    - "A watchdog job flags stuck runs (>15m active) and studios with missing telemetry (>25h) and alerts the operator"
    - "The provisioning saga + watchdog are registered and running in services/hq-worker (not a Vercel function)"
  artifacts:
    - path: "apps/hq/server/routes/api/signup/index.post.ts"
      provides: "Public signup intake: validate, insert studio+run, enqueue saga, return 202"
      contains: "provision-studio"
    - path: "apps/hq/app/routes/provisioning.tsx"
      provides: "Operator dashboard listing runs with per-step status"
      contains: "step"
    - path: "services/hq-worker/src/queues/watchdog.ts"
      provides: "5-min recurring job: stuck runs + missing-telemetry alerts"
      exports: ["registerWatchdog"]
  key_links:
    - from: "apps/hq/server/routes/api/signup/index.post.ts"
      to: "provision-studio pg-boss queue (hq-worker)"
      via: "boss.send('provision-studio', {runId}, {expireInSeconds:600, retryLimit:3})"
      pattern: "boss.send|enqueue"
    - from: "services/hq-worker/src/index.ts"
      to: "registerProvisionStudio + registerWatchdog"
      via: "createQueue + register calls in main()"
      pattern: "registerProvisionStudio|registerWatchdog"
---

<objective>
Close the provisioning track: the public SIGNUP intake (integration-webhook queue pattern — insert run + enqueue + return 202, never block; PROV-01), the operator DASHBOARD showing per-step run status (PROV-10), the WATCHDOG recurring job for stuck runs + missing telemetry (O-01/O-02), and the hq-worker REGISTRATION that actually boots the saga + watchdog (D-07). This wave also confirms step-7 token issue + step-8 registry registration (built in BD2-05) are reachable from a real signup → run row.

Purpose: makes provisioning operator-driven and observable end-to-end. Depends on BD2-04 (token-hash table/helper + ingest wired) and BD2-05 (the saga + registerProvisionStudio).
Output: signup route (public path) + test, dashboard route + runs API, watchdog + test, and the hq-worker index registration. Includes a human-verify checkpoint for the dashboard (no local dev server — verified on the HQ Vercel deploy).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD2-telemetry-provisioning/BD2-CONTEXT.md
@.planning/phases/BD2-telemetry-provisioning/BD2-RESEARCH.md
@.planning/phases/BD2-telemetry-provisioning/BD2-04-PLAN.md
@.planning/phases/BD2-telemetry-provisioning/BD2-05-PLAN.md

<interfaces>
<!-- Signup intake = integration-webhook queue pattern (verify→enqueue→202→process). Watchdog = BD2-RESEARCH "Pattern 8". -->

From apps/hq/server/routes/api/_agent-native/brain/ingest.post.ts — H3 route + readBody + getDb pattern. Route naming `<name>.post.ts`; place signup at apps/hq/server/routes/api/signup/index.post.ts.

From apps/hq/server/plugins/auth.ts — add "/api/signup" to createAuthPlugin publicPaths (the signup form is public — a prospective gym, not a logged-in user). (Discretion D: form may live on marketing site; this plan puts the intake endpoint on apps/hq.)

From @gymos/queue getBoss / @gymos/hq-schema (BD2-01) hqStudios + hqProvisioningRuns. The producer enqueues to the SAME pg-boss queue the hq-worker consumes ("provision-studio"). Use getBoss() against the HQ Neon (DATABASE_URL_UNPOOLED). Insert hq_studios (slug UNIQUE — a duplicate slug signup must 409, not create a dup; PROV-08 at the DB level) + hq_provisioning_runs (status 'started'), then boss.send.

From services/hq-worker/src/queues/provision-studio.ts (BD2-05): registerProvisionStudio(boss, apis). From provision-apis/index.ts (BD2-02): createProvisionApis(env). From services/hq-worker/src/index.ts (BD1): the createQueue loop + register pattern (mirror services/worker/src/index.ts).

Dashboard: apps/hq/app/routes/ uses React Router v7 (loader/CSR). Mirror an existing route e.g. apps/hq/app/routes/metrics.tsx or overview.tsx for the page shell + how it reads server data (loader or a client fetch to a /api route). Use shadcn/ui primitives (apps/hq/app/components/ui) + Tabler icons (no emojis). Show: slug, status, started_at, and per-step badges (step_1_at..step_8_at → done/pending) + compensation_errors on failure.

Watchdog reference: BD2-RESEARCH "Pattern 8" (boss.work("hq-watchdog") + the two SQL queries: stuck runs WHERE status NOT IN (completed,failed_terminal) AND started_at < NOW()-15min; stale telemetry via hq_studios LEFT JOIN hq_telemetry_snapshots WHERE last_telemetry_received_at IS NULL OR < NOW()-25h). Schedule "*/5 * * * *".
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Public signup intake (insert run + enqueue saga + 202) + public path + test</name>
  <read_first>apps/hq/server/routes/api/_agent-native/brain/ingest.post.ts (H3 route + readBody + getDb), apps/hq/server/plugins/auth.ts (publicPaths), AGENTS.md "integration-webhook queue pattern" (verify→enqueue→202→process; NEVER do the work inline), BD2-01 hqStudios/hqProvisioningRuns shapes, @gymos/queue getBoss, BD2-05 the "provision-studio" queue name + producer contract (expireInSeconds:600, retryLimit:3, Pitfall P-07).</read_first>
  <files>apps/hq/server/routes/api/signup/index.post.ts, apps/hq/server/plugins/auth.ts, apps/hq/server/routes/api/signup/index.post.test.ts</files>
  <behavior>
    - POST a valid signup `{ displayName, ownerEmail, slug? }` (slug derived from displayName if omitted, lowercased/hyphenated) → inserts hq_studios (status 'pending') + hq_provisioning_runs (status 'started') + calls boss.send("provision-studio", { runId }, { expireInSeconds:600, retryLimit:3 }) → returns 202 with `{ runId }`. The handler does NOT await any provider work.
    - POST with a slug that already exists in hq_studios → 409 (DB UNIQUE on slug; do NOT create a duplicate — PROV-08 at intake).
    - POST with invalid body (missing ownerEmail / bad email) → 400 via a Zod schema.
    - The handler never calls any provider adapter (the saga does that in hq-worker).
  </behavior>
  <action>
    Implement `index.post.ts` (defineEventHandler): Zod-validate body (displayName min1, ownerEmail email, optional slug; derive+slugify slug if absent); generate ids (nanoid); INSERT hq_studios — catch the UNIQUE(slug) violation → 409; INSERT hq_provisioning_runs (status 'started', studio_id FK, started_at now); `await getBoss().send("provision-studio", { runId }, { expireInSeconds: 600, retryLimit: 3 })`; `setResponseStatus(event, 202)`; return `{ runId }`. guard:allow-unscoped comment (HQ tables are operator-scoped, no ownableColumns). Add `"/api/signup"` to auth publicPaths.
    Test: vitest mocking getDb + getBoss; implement the four behaviors (assert boss.send called with the P-07 options; assert NO provider adapter import is invoked; assert 409 on duplicate slug).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/hq test -- signup</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gymos/hq test -- signup` passes (4 behaviors green; 202 + enqueue + 409-on-dup-slug explicitly present).
    - `grep -n "provision-studio\|boss.*send\|expireInSeconds" apps/hq/server/routes/api/signup/index.post.ts` confirms enqueue + P-07 options.
    - `grep -n "202" apps/hq/server/routes/api/signup/index.post.ts` confirms immediate-return.
    - `grep -n "/api/signup" apps/hq/server/plugins/auth.ts` confirms public path.
    - `pnpm --filter @gymos/hq exec tsc --noEmit` passes.
  </acceptance_criteria>
  <done>Signup intake inserts a run + enqueues the saga + returns 202 without blocking; duplicate slug 409s; saga work stays in hq-worker.</done>
</task>

<task type="auto">
  <name>Task 2: Watchdog recurring job + saga/watchdog registration in hq-worker + test</name>
  <read_first>BD2-RESEARCH.md "Pattern 8: Watchdog Recurring Job" (the two SQL queries + */5 schedule), services/hq-worker/src/index.ts (BD1 — the boot sequence; ADD createQueue + registerProvisionStudio + registerWatchdog mirroring services/worker/src/index.ts), services/worker/src/queues/housekeeping.ts (boss.work + boss.schedule + consumer-first), BD2-05 registerProvisionStudio(boss, apis), BD2-02 createProvisionApis(env), services/hq-worker/src/lib/db.ts (getHqDb from BD2-05).</read_first>
  <files>services/hq-worker/src/queues/watchdog.ts, services/hq-worker/src/queues/watchdog.test.ts, services/hq-worker/src/index.ts</files>
  <behavior>
    - `registerWatchdog(boss)` registers boss.work("hq-watchdog") + boss.schedule("hq-watchdog","*/5 * * * *",{},{tz:"UTC"}).
    - The handler queries stuck runs (status NOT IN ('completed','failed_terminal') AND started_at < NOW()-15min) and logs an ERROR alert when any are found.
    - The handler queries stale-telemetry active studios (last_telemetry_received_at NULL or < NOW()-25h) and logs a WARN alert when any are found.
    - When both queries return empty, no alert is logged (clean tick).
  </behavior>
  <action>
    1. `watchdog.ts`: implement `registerWatchdog(boss)` per Pattern 8 — consumer first, then schedule */5. Handler uses getHqDb() + the two raw SQL queries; on non-empty results `log.error(...)` / `log.warn(...)` (operator alert; leave a `// TODO BD3: Postmark email` marker — actual email send is out of BD2 scope, the alert is the log surface for now, "no silent caps" per research). 
    2. `index.ts` (hq-worker main): after boss.start(), add a createQueue loop for `["provision-studio","hq-watchdog"]` (idempotent, mirror services/worker), then `const apis = createProvisionApis(getEnv())`, `await registerProvisionStudio(boss, apis)`, `await registerWatchdog(boss)`, with log lines. Keep the /healthz contract + boot order identical to BD1.
    3. `watchdog.test.ts`: vitest mocking getHqDb (canned rows) + getLogger; implement the four behaviors (assert error logged on stuck rows, warn on stale telemetry, silent on empty, schedule registered).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/hq-worker test -- watchdog</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gymos/hq-worker test -- watchdog` passes (4 behaviors green).
    - `grep -n "registerProvisionStudio\|registerWatchdog\|provision-studio\|hq-watchdog" services/hq-worker/src/index.ts` confirms both registrations + queue creation.
    - `grep -n "15 minutes\|25 hours\|\*/5" services/hq-worker/src/queues/watchdog.ts` confirms the two thresholds + cadence.
    - `pnpm --filter @gymos/hq-worker exec tsc --noEmit` passes.
  </acceptance_criteria>
  <done>The saga + watchdog are registered in hq-worker (D-07); watchdog flags stuck runs + missing telemetry on a 5-min cadence; tested.</done>
</task>

<task type="auto">
  <name>Task 3: Operator provisioning dashboard (per-step status) + runs API route</name>
  <read_first>apps/hq/app/routes/metrics.tsx or overview.tsx (page shell + how it reads server data — loader vs client fetch to a /api route), apps/hq/app/components/ui (shadcn primitives — Badge, Card, Table), AGENTS.md frontend rules (shadcn mandatory, Tabler icons, no emojis, progressive disclosure), BD2-01 hqProvisioningRuns columns (step_1_at..step_8_at, status, compensation_errors), how apps/hq routes/api/*.ts are exposed (an existing api.*.ts route if present, else a server route).</read_first>
  <files>apps/hq/app/routes/provisioning.tsx, apps/hq/app/routes/api.provisioning-runs.ts</files>
  <action>
    `api.provisioning-runs.ts`: a React Router resource route (loader/action) — session-authenticated (operator only; NOT public) — returning recent hq_provisioning_runs joined to hq_studios (slug, display_name, status, started_at, step_1_at..step_8_at, compensation_errors). Use getDb()/schema. guard:allow-unscoped (operator-scoped HQ table).
    `provisioning.tsx`: a route rendering the runs — each run a Card/row showing slug + status + an 8-step progress strip (Badge per step: filled/Tabler check when step_N_at set, muted/pending otherwise) + started_at; failures show compensation_errors behind a Collapsible/Popover (progressive disclosure). Fetch via the resource route (TanStack Query or loader). Add the route to the HQ nav/sidebar if there's a central nav list (grep for the existing nav component; add a "Provisioning" entry with a Tabler icon). Use ONLY shadcn/ui + Tabler icons.
  </action>
  <acceptance_criteria>
    - `grep -n "step\|Badge\|status\|compensation" apps/hq/app/routes/provisioning.tsx` confirms per-step status rendering.
    - `grep -n "hqProvisioningRuns\|provisioning_runs\|hq_provisioning_runs" apps/hq/app/routes/api.provisioning-runs.ts` confirms the data source.
    - `grep -niE "emoji|window.confirm|window.alert" apps/hq/app/routes/provisioning.tsx` returns NOTHING; `grep -n "@tabler/icons-react" apps/hq/app/routes/provisioning.tsx` present if icons used.
    - `pnpm --filter @gymos/hq exec tsc --noEmit` passes.
  </acceptance_criteria>
  <done>The operator dashboard lists provisioning runs with per-step status badges + failure details, using shadcn + Tabler; data via an operator-only resource route.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Checkpoint: Verify signup -> dashboard -> worker registration on the deploy</name>
  <action>Deploy apps/hq (Vercel) + services/hq-worker (Fly), then run the manual verification steps below. No code is written in this task — it gates on the operator confirming the end-to-end path works on the live deploy (no local dev server per the NitroViteError constraint).</action>
  <verify>
    <automated>MISSING — manual deploy verification (no local dev server; NitroViteError blocks pnpm dev). Operator confirms via the curl + dashboard + Fly-log steps below.</automated>
  </verify>
  <what-built>Signup intake (POST /api/signup → 202 + enqueued saga), the operator provisioning dashboard (per-step status), and the watchdog — all wired into the HQ Vercel deploy + hq-worker Fly app. (No local dev server — NitroViteError; verify on the deploy.)</what-built>
  <how-to-verify>
    1. Deploy apps/hq to Vercel and services/hq-worker to Fly (or confirm CI auto-deploy on master).
    2. POST a test signup: `curl -X POST https://<hq-deploy>/api/signup -H "Content-Type: application/json" -d '{"displayName":"Test Studio","ownerEmail":"test@example.com"}'` → expect HTTP 202 + `{ runId }`.
    3. Sign in to HQ as the operator, open the new "Provisioning" page → the run appears with per-step status. (Because provider tokens are deferred-on-external-dependency, the saga will throw the "deferred" error and the dashboard should show the run as failed/started with the step strip — that is EXPECTED until live tokens are set; the point is the run row + dashboard + enqueue path work end-to-end.)
    4. Confirm the hq-worker logs (Fly) show "provision-studio queue registered" + "hq-watchdog scheduled" + a watchdog tick within 5 minutes.
  </how-to-verify>
  <resume-signal>Type "approved" once the 202 + dashboard row + worker registration logs are confirmed, or describe what failed.</resume-signal>
</task>

</tasks>

<verification>
- signup + watchdog tests green; `pnpm --filter @gymos/hq exec tsc --noEmit` and `pnpm --filter @gymos/hq-worker exec tsc --noEmit` clean.
- Signup returns 202 + enqueues (never blocks); duplicate slug 409.
- hq-worker boots provision-studio + hq-watchdog (D-07); dashboard renders per-step status (PROV-10).
- Human-verify confirms the end-to-end intake → dashboard → worker-registration path on the deploy.
</verification>

<success_criteria>
- PROV-01 signup creates a run + returns immediately.
- PROV-10 operator sees per-step status; orchestrator runs in hq-worker not Vercel.
- PROV-07 step-7 token issue reachable from a real run (built in BD2-05, exercised here).
- O-01/O-02 watchdog flags stuck runs + missing telemetry.
</success_criteria>

<output>
After completion, create `.planning/phases/BD2-telemetry-provisioning/BD2-06-SUMMARY.md`
</output>
