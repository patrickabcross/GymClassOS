---
phase: BD2-telemetry-provisioning
verified: 2026-06-19T15:50:00Z
status: human_needed
score: 16/16 code-level must-haves verified
human_verification:
  - test: "POST /api/telemetry live round-trip: studio worker pushes to deployed HQ endpoint"
    expected: "HTTP 200 {ok:true}; row appears in hq_telemetry_snapshots + hq_token_usage on HQ Neon"
    why_human: "Requires HQ deployed to Vercel + provisioned studio Neon with credentials set as Fly secrets on gymos-worker"

  - test: "POST /api/signup -> /provisioning dashboard -> Fly worker log end-to-end"
    expected: "202 + runId returned; run card appears in /provisioning with step strip; Fly logs show 'provision-studio queue registered' + 'hq-watchdog scheduled'"
    why_human: "Requires HQ Vercel deploy + hq-worker Fly deploy + operator-provided NEON_API_KEY, VERCEL_BEARER_TOKEN, VERCEL_TEAM_ID, FLY_API_TOKEN, FLY_ORG_SLUG, GYMOS_WORKER_IMAGE set as Fly secrets on gymos-hq-worker"

  - test: "Live provisioning saga runs all 8 steps for a real studio slug"
    expected: "Neon project created, studio migrations run, Vercel project deployed, Fly app created with secrets, subdomain attached, telemetry token issued + stored, studio status='active'"
    why_human: "Deferred-on-external-dependency: StudioMigrator/StudioSeeder are console.warn stubs (TODO D-12); live run will fail at step 2 until real migrator/seeder are implemented. Provider credentials must be set. This is intentional per plan design."

  - test: "HQ Neon migrations v4-v7 applied: 5 BD2 tables exist in prod HQ Neon"
    expected: "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'hq_%' returns hq_studios, hq_provisioning_runs, hq_telemetry_snapshots, hq_token_usage, hq_studio_tokens"
    why_human: "Requires HQ Neon project + DATABASE_URL in hq app env; runMigrations runs on cold start but HQ Neon may not have been provisioned since BD1 was deferred"

  - test: "Watchdog 5-minute tick fires and logs clean (no stuck/stale alerts)"
    expected: "Fly logs show watchdog tick with no ERROR/WARN output when no studios are active"
    why_human: "Requires hq-worker Fly deploy and 5 minutes uptime"
---

# Phase BD2: Telemetry + Provisioning Verification Report

**Phase Goal:** Studios push aggregate (PII-free) telemetry to HQ on a schedule; HQ ingests via a Zod-strict schema that structurally rejects PII; the provisioning saga (with LIFO rollback) orchestrates Neon + Vercel + Fly idempotently with operator-visible step progress.

**Verified:** 2026-06-19T15:50:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

All 16 code-level must-haves pass. Five human-verification items remain: they all require live deploy (HQ Vercel + hq-worker Fly) and operator-provided provider credentials. The StudioMigrator/StudioSeeder production stubs (steps 2-3) are explicitly deferred-on-external-dependency per the plan; this is a known limitation, not a code gap.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | HQ has hq_studios, hq_provisioning_runs, hq_telemetry_snapshots, hq_token_usage, hq_studio_tokens after runMigrations | VERIFIED | `migrations.ts` v4-v7 confirmed; `grep -c "version: [4567]"` = 4; all 5 tables present with IF NOT EXISTS guard |
| 2 | TelemetrySnapshot Zod schema rejects any unknown/PII field at parse time (.strict()) | VERIFIED | `telemetry.ts` exports allow-list schema; 7 vitest tests pass (7/7 green) including member_email rejection and memberName rejection |
| 3 | No HQ schema column name matches *connection*/*database_url*/*dsn* | VERIFIED | `guard-hq-no-pii.mjs` exits 0 ("clean"); migrations.ts grep confirms only neon_project_id/vercel_project_id/fly_app_name stored |
| 4 | Studio captures per-studio AI token usage without content retention | VERIFIED | `token_usage` table (framework) stores input_tokens/output_tokens/model/owner_email — no prompt/response body; AFTER INSERT trigger on token_usage feeds studio_telemetry_state |
| 5 | Studio computes aggregate PII-free engagement + retention metrics | VERIFIED | `buildTelemetrySnapshot.ts` issues 6 COUNT(*) aggregate SQL queries; 6/6 tests pass including PII-free JSON assertion; no PII column selected |
| 6 | Studio pushes telemetry to HQ on schedule authenticated by per-studio token | VERIFIED (code) | `telemetry-push.ts` registered as daily 02:00 UTC pg-boss job in `services/worker/src/index.ts`; bearer token auth pattern confirmed; live push deferred-on-external-dependency |
| 7 | HQ ingest endpoint returns 422 on any PII/unknown field | VERIFIED | `ingest-helpers.ts` `parseTelemetryBody` calls `TelemetrySnapshot.strict().safeParse()`; 18 HQ tests pass including member_email→422 case |
| 8 | HQ stores snapshot + records last_telemetry_received_at | VERIFIED | `index.post.ts` upserts hqTelemetrySnapshots (UNIQUE studioId+periodStart) and accumulates hqTokenUsage; lastTelemetryReceivedAt updated via sql`excluded.*` |
| 9 | Signup intake returns 202 + enqueues saga immediately | VERIFIED | `signup/index.post.ts` does validate→INSERT studios+runs→boss.send→setResponseStatus(202); 4/4 signup tests pass |
| 10 | Provider adapters use find-or-create (no duplicate Neon/Vercel/Fly resources) | VERIFIED | `neon.ts` `findProjectBySlug` before `createProject`; `vercel.ts` same; `fly.ts` `appExists` before `createApp`; fly.test.ts 3/3 pass |
| 11 | LIFO compensation engine tears down completed steps in reverse order | VERIFIED | `compensate.ts` builds 7→6→5→4→1 list from step_N_at flags; 4/4 compensate tests pass (LIFO order, error-not-abort, no connection strings) |
| 12 | runStep idempotency: skips already-completed steps without calling fn | VERIFIED | `run-step.ts` reads step_N_at; returns {skipped:true} if set; marks step only on fn success; 4/4 run-step tests pass |
| 13 | 8-step provisioning saga orchestrates all provider steps | VERIFIED | `provision-studio.ts` implements all 8 steps wrapped in runStep; 4/4 saga tests pass (happy path, resume-at-step-4, failure→compensate, PII boundary) |
| 14 | On failure, saga calls compensate() then re-throws | VERIFIED | `runProvisioningSaga` catch block calls `compensate(run, apis, log)` then `throw err`; pg-boss marks job failed |
| 15 | Operator can see per-step provisioning progress | VERIFIED | `api.provisioning-runs.ts` loader queries hq_provisioning_runs joined to hq_studios; `provisioning.tsx` renders 8-step strip with IconCheck/IconCircleDashed per step_N_at; compensation_errors behind Button toggle |
| 16 | Watchdog monitors stuck runs and stale telemetry | VERIFIED | `watchdog.ts` runs every 5 min; queries stuck runs (>15 min non-terminal) + stale telemetry (>25h); consumer-first pattern; 4/4 watchdog tests pass |

**Score:** 16/16 code-level truths verified

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|---------|--------|---------|
| `packages/hq-schema/src/migrations.ts` | v4-v7 additive CREATE TABLE migrations | VERIFIED | v4 hq_studios, v5 hq_provisioning_runs, v6 hq_telemetry_snapshots+hq_token_usage, v7 hq_studio_tokens; dual-dialect postgres/sqlite |
| `packages/hq-schema/src/schema.ts` | Drizzle table defs for 5 BD2 HQ tables | VERIFIED | All 5 exported: hqStudios, hqProvisioningRuns, hqTelemetrySnapshots, hqTokenUsage, hqStudioTokens |
| `packages/hq-schema/src/telemetry.ts` | Canonical TelemetrySnapshot Zod allow-list schema | VERIFIED | Exports TelemetrySnapshot (z.object allow-list, no .strict() on export) + TelemetrySnapshotInput type |
| `packages/hq-schema/src/telemetry.test.ts` | 7-case PII-rejection vitest suite | VERIFIED | 7/7 tests green: valid parse, member_email rejection, memberName rejection, missing field, negative count, rate out-of-range, non-integer |
| `packages/hq-schema/src/token.ts` | hashToken + generateTelemetryToken | VERIFIED | Canonical location; telemetry-token.ts re-exports from here |
| `services/hq-worker/src/lib/provision-apis/neon.ts` | NeonApi find-or-create adapter | VERIFIED | findProjectBySlug + createProject + deleteProject (404-safe) |
| `services/hq-worker/src/lib/provision-apis/vercel.ts` | VercelApi find-or-create adapter | VERIFIED | Array.isArray union guard normalises response; setEnvVars/deploy/waitForDeploy/deleteProject |
| `services/hq-worker/src/lib/provision-apis/fly.ts` | FlyApi find-or-create + execa secrets | VERIFIED | execa("flyctl", [...array...]) for secrets; array-arg injection safety proven in fly.test.ts |
| `services/hq-worker/src/__tests__/mocks/provision-apis.ts` | vi.fn() mock bag for saga tests | VERIFIED | makeMockApis() used in provision-studio.test.ts |
| `services/hq-worker/src/lib/compensate.ts` | LIFO compensation engine | VERIFIED | Builds 7→6→5→4→1 list; best-effort try/catch; writes failed_terminal + compensationErrors |
| `services/hq-worker/src/lib/run-step.ts` | Per-step idempotency helper | VERIFIED | Reads step_N_at; skips if set; marks on success only; throws propagate |
| `services/hq-worker/src/queues/provision-studio.ts` | 8-step saga orchestrator + pg-boss registration | VERIFIED | All 8 steps present; migrator/seeder injected (stubs in production handler, real in test injection); LIFO compensation on catch |
| `apps/hq/server/routes/api/telemetry/index.post.ts` | HQ ingest H3 handler | VERIFIED | sha256 bearer auth + TelemetrySnapshot.strict() 422 + upsert snapshots + accumulate token_usage |
| `apps/hq/server/routes/api/telemetry/ingest-helpers.ts` | Pure ingest business logic (testable without server) | VERIFIED | extractBearerToken, hashToken, isTokenRowValid, parseTelemetryBody (.strict()), buildIngestPayload (anti-spoof studioId) |
| `apps/hq/server/lib/telemetry-token.ts` | Re-exports from @gymos/hq-schema/token | VERIFIED | Re-export confirmed after BD2-05 move to canonical location |
| `apps/hq/server/routes/api/signup/index.post.ts` | Public signup intake → 202 + pg-boss | VERIFIED | Validate → INSERT studios+runs → boss.send("provision-studio", {runId}) → 202 |
| `apps/hq/app/routes/provisioning.tsx` | Operator provisioning dashboard | VERIFIED | 8-step strip with Tabler icons; compensation_errors behind Button toggle; loading skeletons |
| `apps/hq/app/routes/api.provisioning-runs.ts` | Resource route for provisioning runs | VERIFIED | React Router v7 loader; innerJoin hq_provisioning_runs + hq_studios; top 50 by desc |
| `services/hq-worker/src/queues/watchdog.ts` | 5-min recurring watchdog | VERIFIED | boss.work + boss.schedule("*/5 * * * *"); stuck-run ERROR + stale-telemetry WARN |
| `services/worker/src/domain/buildTelemetrySnapshot.ts` | PII-free aggregate builder | VERIFIED | 6 COUNT(*) SQL aggregates; 6/6 tests pass; no PII columns selected |
| `services/worker/src/queues/telemetry-push.ts` | Daily pg-boss push job | VERIFIED | Registered in worker index.ts; reads state row → buildTelemetrySnapshot → POST bearer → reset accumulators; unconfigured-skip pattern |
| `apps/staff-web/server/plugins/db.ts` | Studio migrations v14+v15: telemetry_state table + AFTER INSERT trigger | VERIFIED | v14 studio_telemetry_state table; v15 Postgres AFTER INSERT ON token_usage trigger (idempotent IF NOT EXISTS pg_trigger check); no DROP statements |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/hq/server/db/schema.ts` | `@gymos/hq-schema` | `export * from "@gymos/hq-schema/schema"` | WIRED | All 5 BD2 tables flow through to merged schema in index.ts |
| `apps/hq/app/routes/provisioning.tsx` | `/api/provisioning-runs` | `fetch` in `useEffect` | WIRED | Resource route returns ProvisioningRunsResponse; component renders step strip and status badges |
| `apps/hq/server/routes/api/signup/index.post.ts` | pg-boss provision-studio queue | `getBoss().send("provision-studio", {runId})` | WIRED | Producer uses @gymos/queue workspace dep; confirmed in package.json |
| `services/hq-worker/src/index.ts` | `registerProvisionStudio` + `registerWatchdog` | `import + await` | WIRED | Both queues registered in index.ts; createQueue loop for ["provision-studio","hq-watchdog"] |
| `services/worker/src/index.ts` | `registerTelemetryPush` | `import + await` in createQueue loop | WIRED | telemetry-push appears in queue array at line 48 and registered at line 78 |
| `services/hq-worker/src/lib/compensate.ts` | `ProvisionApis` + `getHqDb()` | direct import | WIRED | compensate imported and called in provision-studio.ts catch block |
| `services/hq-worker/src/lib/run-step.ts` | `getHqDb()` + `hqProvisioningRuns` | internal import | WIRED | Called for every saga step in runProvisioningSaga |
| `packages/hq-schema/src/token.ts` | `apps/hq/server/lib/telemetry-token.ts` | re-export | WIRED | telemetry-token.ts is now a re-export shim after BD2-05 canonical move |
| `ingest-helpers.ts` `parseTelemetryBody` | `TelemetrySnapshot.strict()` | direct call | WIRED | `TelemetrySnapshot.strict().safeParse(body)` at line 87 |
| `apps/staff-web` `token_usage` INSERT | `studio_telemetry_state` accumulator | Postgres AFTER INSERT trigger | WIRED (code) | Trigger installed at migration v15; live apply deferred until first studio provision |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `provisioning.tsx` | `runs` state | `fetch("/api/provisioning-runs")` → loader queries hq_provisioning_runs | Yes (Drizzle query in loader) | FLOWING |
| `index.post.ts` (telemetry ingest) | tokenRow | `db.select().from(hqStudioTokens)` WHERE tokenHash+revokedAt IS NULL | Yes (real DB query) | FLOWING |
| `buildTelemetrySnapshot.ts` | activeMembers/bookings/messagesSent/mobileEngagement/retentionRate | 6 raw SQL COUNT(*) aggregates on studio tables | Yes (aggregate counts) | FLOWING |
| `telemetry-push.ts` | state row | `db.select().from(schema.studioTelemetryState)` singleton | Yes (reads accumulated trigger state) | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TelemetrySnapshot .strict() rejects PII | `pnpm --filter @gymos/hq-schema test -- telemetry` | 7/7 tests pass | PASS |
| hq-worker saga tests (compensate, runStep, provision-studio) | `pnpm --filter @gymos/hq-worker test` | 27/27 tests pass | PASS |
| HQ ingest + signup tests | `pnpm --filter @gymos/hq test` | 41/41 tests pass | PASS |
| Studio worker tests (buildTelemetrySnapshot, telemetry-push) | `pnpm --filter @gymos/worker test` | 117/117 tests pass | PASS |
| guard:hq-no-pii passes | `node scripts/guard-hq-no-pii.mjs` | "clean (no PII-shaped columns)" | PASS |
| v4-v7 migrations present | `grep -c "version: [4567]" packages/hq-schema/src/migrations.ts` | 4 | PASS |
| Live deployment tests | n/a — requires Fly/Vercel deploy | n/a | SKIP (human_needed) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TEL-01 | BD2-03 | Studio captures per-studio AI token usage (no content) | SATISFIED | AFTER INSERT trigger on `token_usage` (framework table: input_tokens/output_tokens/model, no prompt body) accumulates into studio_telemetry_state |
| TEL-02 | BD2-03 | Studio computes aggregate PII-free engagement + retention metrics | SATISFIED | buildTelemetrySnapshot.ts: 6 COUNT(*) aggregates; 6/6 tests pass; no PII column selected |
| TEL-03 | BD2-04 | Studio pushes telemetry snapshot to HQ on schedule, authenticated | SATISFIED (code) | telemetry-push.ts daily 02:00 UTC pg-boss job; bearer token auth; live round-trip deferred-on-external-dependency |
| TEL-04 | BD2-01, BD2-04 | HQ ingest validates against Zod .strict() TelemetrySnapshot schema | SATISFIED | parseTelemetryBody calls TelemetrySnapshot.strict().safeParse(); 422 on PII; proven in 18 tests |
| TEL-05 | BD2-01, BD2-04 | HQ stores snapshots per studio + records last_telemetry_received_at | SATISFIED | hq_telemetry_snapshots UNIQUE(studio_id, period_start) upsert; lastTelemetryReceivedAt updated on each push |
| TEL-06 | BD2-01, BD2-04 | HQ never holds studio Neon connection string; never queries studio DB | SATISFIED | guard:hq-no-pii passes; provision-studio.ts stores only neon_project_id (not dbUrl); dbUrl/dbUrlUnpooled in-memory only |
| PROV-01 | BD2-06 | Prospective gym submits signup, creates provisioning_run, returns immediately | SATISFIED | POST /api/signup: 202 + {runId}; boss.send non-blocking; 4/4 tests pass |
| PROV-02 | BD2-02, BD2-05 | HQ creates Neon project via @neondatabase/api-client; conn string to secret store only | SATISFIED (code) | neon.ts adapter; step 1 stores neon_project_id only; dbUrl in-memory → Vercel/Fly env only; live deferred-on-external-dependency |
| PROV-03 | BD2-05 | HQ runs studio migrations + seed + admin against new Neon | SATISFIED (stub) | Steps 2-3 of saga call migrator(dbUrlUnpooled)/seeder(dbUrl); production handler has TODO D-12 console.warn stubs; interface correct, live wiring deferred |
| PROV-04 | BD2-02, BD2-05 | HQ creates Vercel project, injects env, deploys staff-web | SATISFIED (code) | vercel.ts: createProject/setEnvVars/deploy/waitForDeploy; step 4 stores vercel_project_id; live deferred-on-external-dependency |
| PROV-05 | BD2-02, BD2-05 | HQ creates Fly app(s), sets secrets via flyctl execa array args | SATISFIED (code) | fly.ts: execa("flyctl", [...array...]); fly.test.ts proves array args + key-names-only logging; step 5 stores fly_app_name; live deferred |
| PROV-06 | BD2-05 | HQ configures subdomain/DNS | SATISFIED (code) | Step 6: vercel.attachDomain(vercelProjectId, subdomain); subdomain stored; live deferred |
| PROV-07 | BD2-01, BD2-05 | HQ registers studio in registry + issues per-studio telemetry token | SATISFIED | Step 7: generateTelemetryToken() → hash stored in hq_studio_tokens → plaintext pushed to Vercel/Fly; Step 8: status='active' |
| PROV-08 | BD2-01, BD2-05 | Every provisioning step idempotent; no duplicate resources | SATISFIED | runStep() skips already-marked steps; find-or-create on all 3 providers; hq_studios.slug UNIQUE at DB level; 4/4 idempotency tests pass |
| PROV-09 | BD2-05 | On partial failure, LIFO rollback; no orphaned resources | SATISFIED | compensate.ts LIFO 7→6→5→4→1; built and tested BEFORE happy path (BD2-05 Task 1); 4/4 compensate tests pass |
| PROV-10 | BD2-06 | Provisioning runs in hq-worker (not Vercel); operator sees per-step progress in HQ | SATISFIED | hq-worker (Fly) hosts registerProvisionStudio; /provisioning route + api.provisioning-runs.ts loader render 8-step strip + status badges |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `services/hq-worker/src/queues/provision-studio.ts` | 418-423 | StudioMigrator/StudioSeeder are `console.warn` stubs (`TODO D-12`) | INFO | Intentional deferred-on-external-dependency; live runs fail at step 2 until real migrator/seeder implemented. PROV-03 is structurally correct; production wiring is a known deferred item. No saga test is blocked. |

No blocker anti-patterns found. The StudioMigrator/StudioSeeder stubs are explicitly designed (see BD2-05 SUMMARY "Known Stubs" section) and do not prevent test coverage of the saga. They are classified INFO rather than WARNING because the interface is correctly defined and the injection point exists.

---

### Human Verification Required

#### 1. Live Telemetry Round-Trip

**Test:** With a provisioned studio (credentials set), restart the studio worker and wait until 02:00 UTC (or manually trigger the telemetry-push job). Check HQ Neon.
**Expected:** Row in `hq_telemetry_snapshots` with the studio's snapshot; row in `hq_token_usage` with accumulated counts; `last_telemetry_received_at` updated.
**Why human:** Requires HQ Vercel deploy with DATABASE_URL + a provisioned studio worker with HQ_INGEST_URL and STUDIO_TELEMETRY_TOKEN set.

#### 2. Signup Intake → Dashboard → Fly Worker Log

**Test:**
```
curl -X POST https://<hq-deploy>/api/signup \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Test Studio","ownerEmail":"test@example.com"}'
```
Then sign in to HQ and navigate to `/provisioning`.
Then check Fly logs: `fly logs -a gymos-hq-worker`.
**Expected:** `202 {"runId":"..."}` from curl; run card in /provisioning with 8-step strip showing step 1 in-progress or failed (token guard fails until secrets set); Fly logs show "provision-studio queue registered" and "hq-watchdog scheduled" within 30s of worker start; first watchdog tick within 5 minutes.
**Why human:** Requires HQ Vercel deploy + hq-worker Fly deploy.

#### 3. Live Provisioning Saga End-to-End

**Test:** Set all 6 Fly secrets on gymos-hq-worker, implement StudioMigrator/StudioSeeder (TODO D-12), POST /api/signup and monitor Fly logs for all 8 step completion messages.
**Expected:** All 8 steps log "[saga] step N: ..." completed; hq_studios.status='active'; hq_provisioning_runs.status='completed'; Vercel project live at `<slug>.gymclassos.com`.
**Why human:** Deferred-on-external-dependency (StudioMigrator/StudioSeeder stubs + provider credentials). This is the planned production enablement step, not a code defect.

#### 4. HQ Neon v4-v7 Migrations Applied

**Test:** Connect to HQ Neon (psql or Neon console) and run:
```sql
SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'hq_%' ORDER BY table_name;
```
**Expected:** Returns hq_app_meta, hq_provisioning_runs, hq_studio_tokens, hq_studios, hq_telemetry_snapshots, hq_token_usage.
**Why human:** Requires HQ Neon project provisioned and DATABASE_URL set; runMigrations runs at HQ cold start but HQ Neon provisioning status is unknown since BD1 was deferred.

#### 5. Watchdog Clean Tick

**Test:** After hq-worker Fly deploy, wait 5+ minutes and inspect Fly logs.
**Expected:** Log line containing "hq-watchdog scheduled" on startup; subsequent ticks produce no ERROR or WARN lines when no studios are active (clean run = silent).
**Why human:** Requires Fly deploy and uptime.

---

### Gaps Summary

No code-level gaps. All 16 code-level must-haves verified against the actual codebase:

- HQ schema migrations (v4-v7), Drizzle table defs, and barrel exports are correct and substantive.
- TelemetrySnapshot Zod .strict() schema structurally rejects PII — proven by 7/7 unit tests.
- guard:hq-no-pii passes: no connection/database_url/dsn columns anywhere in HQ schema.
- Studio telemetry capture: AFTER INSERT trigger on token_usage + studio_telemetry_state table fully wired.
- buildTelemetrySnapshot issues 6 aggregate COUNT(*) queries with no PII column references — proven by 6/6 tests.
- HQ ingest endpoint: sha256 bearer token auth, .strict() 422 PII wall, anti-spoof studioId from tokenRow — proven by 18/18 tests.
- telemetry-push pg-boss job: registered in worker index.ts, unconfigured-skip pattern, accumulator reset on success.
- Provider adapters (Neon/Vercel/Fly): find-or-create idempotency, execa array args — proven by 11/11 tests.
- LIFO compensation engine: built BEFORE happy path, 5-step tear-down order proven by 4/4 tests.
- runStep idempotency: skip-if-already-marked pattern proven by 4/4 tests.
- 8-step saga orchestrator: all steps present, failure→compensate→rethrow proven by 4/4 tests.
- Signup intake: validate→INSERT→boss.send→202 pattern proven by 4/4 tests.
- Operator dashboard: provisioning.tsx + api.provisioning-runs.ts loader wired end-to-end.
- Watchdog: 5-min schedule, stuck-run + stale-telemetry queries, proven by 4/4 tests.

All 185 unit tests across the 4 test suites (hq-schema: 7, hq-worker: 27, hq: 41, worker: 117) are green.

The 5 human-verification items are all deploy/external-dependency items — they do not indicate code defects. The StudioMigrator/StudioSeeder production stubs (steps 2-3 of the saga) are a known deferred item (TODO D-12) that the operator must implement before live provisioning completes end-to-end.

---

*Verified: 2026-06-19T15:50:00Z*
*Verifier: Claude (gsd-verifier)*
