---
phase: BD2-telemetry-provisioning
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - services/hq-worker/src/lib/provision-apis/types.ts
  - services/hq-worker/src/lib/provision-apis/neon.ts
  - services/hq-worker/src/lib/provision-apis/vercel.ts
  - services/hq-worker/src/lib/provision-apis/fly.ts
  - services/hq-worker/src/lib/provision-apis/index.ts
  - services/hq-worker/src/__tests__/mocks/provision-apis.ts
  - services/hq-worker/src/lib/provision-apis/fly.test.ts
  - services/hq-worker/src/lib/env.ts
  - services/hq-worker/package.json
  - services/hq-worker/.env.example
autonomous: true
requirements: [PROV-02, PROV-04, PROV-05, PROV-06, PROV-08]
user_setup:
  - service: neon
    why: "Live Neon project creation during provisioning Step 1"
    env_vars:
      - name: NEON_API_KEY
        source: "Neon Console -> Account Settings -> API Keys (deferred-on-external-dependency; mocks used until set)"
  - service: vercel
    why: "Live Vercel project + deploy during Step 4"
    env_vars:
      - name: VERCEL_BEARER_TOKEN
        source: "Vercel Dashboard -> Settings -> Tokens"
      - name: VERCEL_TEAM_ID
        source: "Vercel Dashboard -> Team Settings -> General"
  - service: fly
    why: "Live Fly app create + secrets via flyctl during Step 5"
    env_vars:
      - name: FLY_API_TOKEN
        source: "fly tokens create org -n gymos-provisioner -o <org> (MUST be org-scoped, NOT deploy token)"
      - name: FLY_ORG_SLUG
        source: "fly orgs list"
      - name: GYMOS_WORKER_IMAGE
        source: "registry.fly.io/<image>:latest built by CI"
must_haves:
  truths:
    - "NeonApi, VercelApi, FlyApi interfaces exist and each concrete adapter implements find-or-create (GET-before-POST)"
    - "Every adapter is mockable — the saga can be unit-tested with vi.fn() mocks and no live credentials"
    - "Fly secrets are set via execa flyctl array-args (never template strings; never logged as values)"
  artifacts:
    - path: "services/hq-worker/src/lib/provision-apis/types.ts"
      provides: "NeonApi/VercelApi/FlyApi TS interfaces (the mock seam)"
      exports: ["NeonApi", "VercelApi", "FlyApi", "ProvisionApis"]
    - path: "services/hq-worker/src/__tests__/mocks/provision-apis.ts"
      provides: "vi.fn()-backed mock implementations of all three adapters"
      exports: ["mockNeonApi", "mockVercelApi", "mockFlyApi"]
  key_links:
    - from: "services/hq-worker/src/lib/provision-apis/fly.ts"
      to: "flyctl subprocess"
      via: "execa array args with FLY_API_TOKEN in env, key names logged not values"
      pattern: "execa\\(\\s*[\"']flyctl"
---

<objective>
Build the three provider adapters (Neon / Vercel / Fly) behind thin TS interfaces, plus their mock implementations, so the provisioning saga (BD2-05) can be fully unit-tested with no live cloud credentials (D-12). Each adapter implements find-or-create (GET-before-POST) idempotency because none of the three providers support idempotency keys (D-09, Pitfalls P-01/P-02).

Purpose: Isolating every external call behind an interface is what makes the saga + rollback + idempotency testable. Live runs are deferred-on-external-dependency until the operator provides tokens; the code ships now and is mock-tested.
Output: `provision-apis/{types,neon,vercel,fly,index}.ts`, mocks, a real flyctl-execa test (the one piece testable without cloud creds), env-schema activation of the provider tokens, and the new deps installed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD2-telemetry-provisioning/BD2-CONTEXT.md
@.planning/phases/BD2-telemetry-provisioning/BD2-RESEARCH.md

<interfaces>
<!-- The canonical adapter interfaces are in BD2-RESEARCH.md "Pattern 9: Mock-First Test Strategy" — use them VERBATIM. -->
<!-- API call shapes are in BD2-RESEARCH Patterns 1 (Neon), 2 (Vercel), 3 (Fly). Use the exact method names + endpoints documented there. -->

From services/hq-worker/src/lib/env.ts — provider token placeholders are commented out; this plan activates them as OPTIONAL (live runs deferred). Existing pattern:
```typescript
// NEON_API_KEY: z.string().min(8).optional(),
// VERCEL_API_TOKEN: z.string().min(8).optional(),
// FLY_API_TOKEN: z.string().min(8).optional(),
```

From services/hq-worker/src/lib/logger.ts — getLogger() (Pino) is the structured logger. Fly secret SET calls MUST log key NAMES only (Pitfall P-04): `log.info({ keys: pairs.map(p => p.split("=")[0]) }, "...")`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install provider deps + activate env schema + define adapter interfaces</name>
  <read_first>services/hq-worker/package.json, services/hq-worker/src/lib/env.ts (the commented BD2 placeholders), services/hq-worker/.env.example (existing flyctl/token guidance), BD2-RESEARCH.md "Standard Stack" (exact versions + `npm view` verification) and "Pattern 9" (interface definitions).</read_first>
  <files>services/hq-worker/package.json, services/hq-worker/src/lib/env.ts, services/hq-worker/.env.example, services/hq-worker/src/lib/provision-apis/types.ts</files>
  <action>
    1. `cd services/hq-worker && pnpm add @neondatabase/api-client @vercel/sdk execa` — pin to the lines in BD2-RESEARCH Standard Stack (`@neondatabase/api-client ^10.x`, `@vercel/sdk ^1.27.x`, `execa ^9.x`); run `npm view <pkg> version` first to confirm current and pin the exact caret major found.
    2. In `env.ts`, uncomment + ADD (keep OPTIONAL — live runs deferred per D-12): `NEON_API_KEY: z.string().min(8).optional()`, `VERCEL_BEARER_TOKEN: z.string().min(8).optional()`, `VERCEL_TEAM_ID: z.string().min(1).optional()`, `FLY_API_TOKEN: z.string().min(8).optional()`, `FLY_ORG_SLUG: z.string().min(1).optional()`, `GYMOS_WORKER_IMAGE: z.string().min(1).optional()`. Add a comment that BD2-05's saga throws a clear "deferred-on-external-dependency" error if a live run starts with any of these unset.
    3. Update `.env.example` to list the six vars under a "BD2 PROV (operator-provided, live runs only)" block, reusing the existing flyctl org-token guidance already present.
    4. Create `services/hq-worker/src/lib/provision-apis/types.ts` with `NeonApi`, `VercelApi`, `FlyApi` interfaces VERBATIM from BD2-RESEARCH Pattern 9, plus `export interface ProvisionApis { neon: NeonApi; vercel: VercelApi; fly: FlyApi; }`.
  </action>
  <acceptance_criteria>
    - `grep -E "@neondatabase/api-client|@vercel/sdk|execa" services/hq-worker/package.json` shows all three deps with pinned versions.
    - `grep -E "NEON_API_KEY|VERCEL_BEARER_TOKEN|FLY_API_TOKEN|FLY_ORG_SLUG|GYMOS_WORKER_IMAGE" services/hq-worker/src/lib/env.ts` shows all six (all `.optional()`).
    - `grep -E "NeonApi|VercelApi|FlyApi|ProvisionApis" services/hq-worker/src/lib/provision-apis/types.ts` shows all four exports.
    - `pnpm --filter @gymos/hq-worker exec tsc --noEmit` passes.
  </acceptance_criteria>
  <done>Deps installed, env tokens activated as optional, adapter interfaces defined; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Implement Neon + Vercel concrete adapters with find-or-create idempotency</name>
  <read_first>BD2-RESEARCH.md Pattern 1 (Neon: createApiClient, createProject, getConnectionUri pooled, listProjects({search}) find-or-create, deleteProject) and Pattern 2 (Vercel: getProject-before-createProject, createProjectEnv upsert, createDeployment, getDeployment readyState polling, addProjectDomain, deleteProject). Also Pitfalls P-01 (Neon no idempotency key — GET first), P-05 (poll deploy via vercel.app URL not custom domain).</read_first>
  <files>services/hq-worker/src/lib/provision-apis/neon.ts, services/hq-worker/src/lib/provision-apis/vercel.ts</files>
  <action>
    `neon.ts`: export `createNeonApi(env): NeonApi` using `createApiClient({ apiKey: env.NEON_API_KEY })`. Implement:
    - `findProjectBySlug(slug)` → `neon.listProjects({ search: "gymos-"+slug })`, return `{projectId}` if a project's `name === "gymos-"+slug` else null (Pitfall P-01: GET before POST — names are NOT unique).
    - `createProject(slug)` → `neon.createProject({ project: { name: "gymos-"+slug, region_id: pick one (e.g. aws-eu-west-2), pg_version: 16 } })`; capture `project.id` and `connection_uris[0].connection_uri` as `dbUrlUnpooled`; then `getPooledConnectionUri(projectId)` → `neon.getConnectionUri({ projectId, database_name:"neondb", role_name:"neondb_owner", pooled:true })` for `dbUrl`. Return `{projectId, dbUrl, dbUrlUnpooled}`.
    - `deleteProject(projectId)` → `neon.deleteProject({ projectId })`; treat 404 as success (idempotent rollback).
    `vercel.ts`: export `createVercelApi(env): VercelApi` using `new Vercel({ bearerToken: env.VERCEL_BEARER_TOKEN })`. Implement findProjectBySlug (getProject try/catch 404 → null), createProject (framework "react-router", gitRepository), setEnvVars (createProjectEnv with `upsert:"true"` — idempotent, type "encrypted" for secrets / "plain" for non-secrets), deploy (createDeployment), waitForDeploy (poll getDeployment until readyState READY; throw on ERROR/CANCELED; deadline guard ~600s; poll the deploy URL NOT the custom subdomain — Pitfall P-05), attachDomain (addProjectDomain), deleteProject. All calls thread `teamId: env.VERCEL_TEAM_ID`.
    CRITICAL D-13: neither adapter persists a connection string to HQ — `createProject` RETURNS the dbUrl to the caller (the saga passes it straight to Vercel/Fly env), it is never written to an HQ column.
  </action>
  <acceptance_criteria>
    - `grep -n "listProjects\|getConnectionUri\|deleteProject" services/hq-worker/src/lib/provision-apis/neon.ts` confirms find-or-create + pooled URI + delete.
    - `grep -n "getProject\|readyState\|upsert" services/hq-worker/src/lib/provision-apis/vercel.ts` confirms GET-before-create, readiness polling, and idempotent env upsert.
    - `grep -niE "hqProvisioningRuns|insert.*neon_project|database_url.*INSERT" services/hq-worker/src/lib/provision-apis/*.ts` returns NOTHING (adapters never write HQ rows).
    - `pnpm --filter @gymos/hq-worker exec tsc --noEmit` passes.
  </acceptance_criteria>
  <done>Neon + Vercel adapters implement the NeonApi/VercelApi interfaces with GET-before-POST idempotency and never persist connection strings to HQ.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Fly adapter (REST + flyctl execa secrets) + adapter factory + mocks + flyctl test</name>
  <read_first>BD2-RESEARCH.md Pattern 3 (Fly: POST /v1/apps create, GET /v1/apps/{name} existence, flyctl secrets set --stage via execa array args, POST machines, /wait?state=started, DELETE app) and Pattern 9 (mock impls). Pitfalls P-02 (app-before-secrets-before-machine ordering), P-04 (NEVER log secret values — log key names only). services/hq-worker/src/lib/logger.ts.</read_first>
  <files>services/hq-worker/src/lib/provision-apis/fly.ts, services/hq-worker/src/lib/provision-apis/index.ts, services/hq-worker/src/__tests__/mocks/provision-apis.ts, services/hq-worker/src/lib/provision-apis/fly.test.ts</files>
  <behavior>
    - `setSecrets` builds an args array of the form `["secrets","set","--app",appName,"--stage", "KEY=value", ...]` and invokes `execa("flyctl", args, { env: { ...process.env, FLY_API_TOKEN } })` — NEVER a shell string, NEVER interpolated into a single command string.
    - The logger receives ONLY key names (`["DATABASE_URL","BETTER_AUTH_SECRET",...]`), never values (Pitfall P-04). Assert the log call args contain no "=value" substrings.
    - A secret value containing a shell metacharacter (e.g. `;rm -rf` ) is passed as a single array element and not split — proves array-arg injection safety.
  </behavior>
  <action>
    `fly.ts`: export `createFlyApi(env): FlyApi`. Implement against `https://api.machines.dev`:
    - `appExists(slug)` → GET `/v1/apps/gymos-{slug}-worker` (200 true / 404 false / else throw).
    - `createApp(slug)` → POST `/v1/apps` `{ app_name, org_slug: env.FLY_ORG_SLUG }`.
    - `setSecrets(slug, secrets)` → import `{ execa } from "execa"`; build `pairs = Object.entries(secrets).map(([k,v]) => k+"="+v)`; `log.info({ app, keys: pairs.map(p=>p.split("=")[0]) }, "[fly] setting secrets")` (KEY NAMES ONLY); `await execa("flyctl", ["secrets","set","--app", "gymos-"+slug+"-worker", "--stage", ...pairs], { env: { ...process.env, FLY_API_TOKEN: env.FLY_API_TOKEN } })`.
    - `createMachine(slug, image)` → POST `/v1/apps/{name}/machines` with config { image, guest shared/1cpu/512mb, auto_destroy:false }; return `{machineId}`.
    - `waitForMachineStart(slug, machineId)` → GET `/v1/apps/{name}/machines/{id}/wait?state=started&timeout=60`.
    - `deleteApp(slug)` → DELETE `/v1/apps/{name}`; 404 treated as success.
    Create `index.ts` exporting `createProvisionApis(env): ProvisionApis` that wires the three live adapters.
    Create `__tests__/mocks/provision-apis.ts` with `mockNeonApi`, `mockVercelApi`, `mockFlyApi` (vi.fn() per Pattern 9) plus a `makeMockApis()` helper returning a fresh `ProvisionApis` of mocks for the saga tests in BD2-05.
    Create `fly.test.ts` (vitest) mocking `execa` (`vi.mock("execa")`) and `getLogger`, implementing the three behaviors above. This is the one adapter behavior testable without cloud creds.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/hq-worker test -- fly</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gymos/hq-worker test -- fly` passes (3 behavior cases green).
    - `grep -nE "execa\(\s*[\"']flyctl[\"']\s*,\s*\[" services/hq-worker/src/lib/provision-apis/fly.ts` confirms array-arg form (NOT a template string).
    - `grep -n "p.split(\"=\")\[0\]\|keys:" services/hq-worker/src/lib/provision-apis/fly.ts` confirms key-name-only logging.
    - `grep -E "mockNeonApi|mockVercelApi|mockFlyApi|makeMockApis" services/hq-worker/src/__tests__/mocks/provision-apis.ts` shows all mock exports.
    - `pnpm --filter @gymos/hq-worker exec tsc --noEmit` passes.
  </acceptance_criteria>
  <done>Fly adapter uses execa array-args (injection-safe, key-name-only logging), the factory + mocks exist, and a passing test proves the flyctl secret-set behavior.</done>
</task>

</tasks>

<verification>
- All three adapters implement their interfaces; tsc clean across hq-worker.
- `pnpm --filter @gymos/hq-worker test` passes (fly.test green).
- No adapter writes an HQ row or persists a connection string (grep clean).
- Provider tokens are optional in env (live deferred); mocks enable BD2-05 saga tests.
</verification>

<success_criteria>
- Provider clients are behind mockable interfaces (D-12).
- Find-or-create idempotency present on every provider (PROV-08).
- Fly secrets via execa array-args, no value logging (D-11, Pitfall P-04).
</success_criteria>

<output>
After completion, create `.planning/phases/BD2-telemetry-provisioning/BD2-02-SUMMARY.md`
</output>
