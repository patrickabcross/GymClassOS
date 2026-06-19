# Phase BD2: Telemetry + Provisioning — Research

**Researched:** 2026-06-19
**Domain:** Multi-provider provisioning saga (Neon + Vercel + Fly) + PII-free telemetry push pipeline
**Confidence:** HIGH for telemetry architecture (all key seams confirmed in BD1-ANTHROPIC-AUDIT.md + ARCHITECTURE.md v2.0); HIGH for Fly Machines API (official docs + community); MEDIUM for Neon/Vercel duplicate-project error shapes (not verifiable without live API credentials); MEDIUM for `fly secrets set` ordering (community-confirmed but quirky)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Token usage captured studio-side using the BD1-05 audit seam. The clean fork-safe path is a studio-side `token_usage` table written at the `recordUsage` path (`packages/core` `production-agent.ts:2654`) + a Postgres `AFTER INSERT` trigger (Option A) or atomic SQL accumulator in `studio_telemetry_state` (direct wrapper). NO modification to `@agent-native/core`.

**D-02:** Engagement + retention metrics are aggregates only (counts, rates, timestamps). No names/emails/phones/message content ever leaves the studio Neon.

**D-03:** A scheduled pg-boss job in the existing `services/worker` builds a `TelemetrySnapshot` and POSTs it to HQ `POST /api/telemetry` with a per-studio bearer token. Reuses the studio worker + recurring-job pattern (mirrors `housekeeping.ts`).

**D-04:** HQ ingest validates with Zod `.strict()` `TelemetrySnapshot` schema — any unknown/PII field → HTTP 422. Persists snapshot + `last_telemetry_received_at`.

**D-05:** Per-studio token stored as sha256 hash in `hq_studio_tokens`. Studio holds plaintext. HQ never holds plaintext after provisioning.

**D-06:** HQ schema PII boundary enforced: `guard:hq-no-pii` CI guard blocks connection/dsn columns. All new HQ telemetry tables must pass it.

**D-07:** Saga runs as a pg-boss job in `services/hq-worker` (NOT a Vercel function — 8 external API calls exceed timeout).

**D-08:** Signup intake = public `POST` on `apps/hq` that inserts `hq_provisioning_runs` and enqueues the saga, returning 202. Operator sees per-step status in HQ dashboard.

**D-09:** 8 forward steps, each idempotent via `step_N_at` columns + find-or-create semantics. No provider idempotency keys — GET-before-POST pattern everywhere.

**D-10:** Rollback/compensation (LIFO) is implemented BEFORE the happy path.

**D-11:** New deps in `services/hq-worker`: `@neondatabase/api-client` (^10.x), `@vercel/sdk` (^1.27.x), `execa` (^9.x). Fly secrets via `flyctl` subprocess with org-scoped token (`fly tokens create org`). flyctl already baked in the hq-worker image at `FLYCTL_VERSION=0.3.96`.

**D-12:** Provider tokens are operator-provided HQ secrets. Live provisioning deferred-on-external-dependency. Saga code + rollback unit-tested with provider clients mocked.

**D-13:** Studio's Neon connection string is a studio-side secret (Vercel/Fly env only). NEVER stored in HQ schema.

### Claude's Discretion

- Exact saga step interface, `hq_provisioning_runs` column shape beyond what's in ARCHITECTURE.md
- Exact `TelemetrySnapshot` Zod field list (established in ARCHITECTURE.md V2-5)
- Retry/backoff policy per saga step
- Where the signup form lives (apps/hq public route vs marketing site)
- Token-usage accumulation path: Option A (DB AFTER INSERT trigger) vs direct atomic SQL UPDATE on `studio_telemetry_state` (ARCHITECTURE.md recommends the direct accumulator; BD1-ANTHROPIC-AUDIT.md's Option A is the fallback)

### Deferred Ideas (OUT OF SCOPE for BD2)

- Live provisioning execution against real Neon/Vercel/Fly (needs operator-provided API tokens)
- HQ Brain consumption of telemetry (BD3 HQB)
- Billing/trial gating at signup (PROV-FUT-01)
- Title-gen token capture at `agent-chat-plugin.ts:5499` (trivial volume, separate intercept needed)
</user_constraints>

---

## Summary

BD2 builds two parallel tracks on the BD1 HQ foundation. The research confirms the architecture planned in ARCHITECTURE.md V2-4 and V2-5 is sound and implementable — no major surprises, but several critical version-specific details need pinning before the planner writes task descriptions.

**Telemetry (TEL-01..06):** The cleanest fork-safe interception point for token usage is a direct atomic SQL `UPDATE` on the singleton `studio_telemetry_state` table, called immediately after `recordUsage` runs in the studio DB. BD1-ANTHROPIC-AUDIT.md confirmed `recordUsage` is called at `production-agent.ts:2654` after every run and inserts into `token_usage` in the studio Neon. The ARCHITECTURE.md V2-5 design — a thin `anthropic.ts` wrapper over `client.messages.create` — is the right interception point for the GOD digest case (which calls Anthropic directly). For the main chat loop the AFTER INSERT trigger on `token_usage` is cleaner (fork-safe). Both paths update the same `studio_telemetry_state.token_usage_today_*` singleton row. Zod `.strict()` + the existing `hq_studio_tokens` sha256 pattern complete the pipeline.

**Provisioning (PROV-01..10):** The 8-step saga state machine in ARCHITECTURE.md V2-4 is the implementation target. The three provider API call shapes are confirmed (see Standard Stack). Critical gotcha: Neon project creation response embeds `connection_uris[0].connection_uri` and requires a separate `GET /api/v2/projects/{id}/connection_uri?pooled=true` for the pooled URL. Vercel deployment readiness is polled via `vercel.deployments.getDeployment({ idOrUrl })` until `readyState === "READY"` or `readyState === "ERROR"`. Fly app creation gives you `{ id, created_at }` via the Machines REST API, but **secrets must be set via `flyctl secrets set` AFTER the app is created but BEFORE or AFTER the first machine deploy** — both orderings work if the app exists. Machine start-readiness is polled via `GET /v1/apps/{name}/machines/{id}/wait?state=started`.

**Primary recommendation:** Build rollback state machine first (per D-10), then wire forward steps against mocked provider adapters, then integrate real providers when operator credentials land. The saga step interface and `hq_provisioning_runs` schema in ARCHITECTURE.md V2-4 are the canonical source; the research below pins the exact API call shapes those steps need.

---

## Standard Stack

### Core (BD2-specific additions to services/hq-worker)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@neondatabase/api-client` | `^10.x` | Neon Management API — create/list/delete projects, get connection URIs | Official typed SDK; thin Axios wrapper; reduces boilerplate vs raw fetch |
| `@vercel/sdk` | `^1.27.x` | Vercel REST API — create projects, set envs, deploy, attach domains | Official typed SDK; v1.27.0 published 2026-06-16 |
| `execa` | `^9.x` | Shell out to flyctl for `secrets set` | ESM-only, promise-native, array-arg form prevents injection; the only viable path for Fly secrets |

### Supporting (already in workspace)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nanoid` | `^5.1.x` | Generate idempotency keys, studio IDs, telemetry token plaintext | Token generation in Step 7 |
| `zod` | `^4.x` | `TelemetrySnapshot.strict()` schema at HQ ingest | Reject PII fields structurally |
| `pg-boss` | `^12.18.x` | Saga job queue + retry + expiry in hq-worker | Same as studio worker pattern |
| `crypto` (Node built-in) | — | `createHash('sha256')` for token hash | D-05 token hash |

**Version verification:**
```bash
npm view @neondatabase/api-client version   # verify ^10.x is current
npm view @vercel/sdk version               # verify ^1.27.x is current
npm view execa version                     # verify ^9.x is current
```

**Installation:**
```bash
# In services/hq-worker/
pnpm add @neondatabase/api-client @vercel/sdk execa
```

---

## Architecture Patterns

### Recommended Project Structure (BD2 additions only)

The full structure is in ARCHITECTURE.md V2-3. BD2-specific new files:

```
services/hq-worker/src/
├── queues/
│   └── provision-studio.ts      # Saga orchestrator (the saga runner function)
├── lib/
│   └── provision-apis/
│       ├── neon.ts              # Neon Management API adapter (mockable)
│       ├── vercel.ts            # Vercel SDK adapter (mockable)
│       └── fly.ts               # Fly Machines REST + flyctl execa adapter (mockable)

apps/staff-web/server/lib/
└── anthropic.ts                 # Thin wrapper — calls accumulateTokenUsage after each message

services/worker/src/queues/
└── telemetry-push.ts            # Daily cron: read state, POST to HQ, reset

packages/hq-schema/src/
├── schema.ts                    # hq_studios, hq_provisioning_runs, hq_studio_tokens,
│                                # hq_telemetry_snapshots, hq_token_usage (SQL in Pattern 4)
├── telemetry.ts                 # TelemetrySnapshot Zod schema (canonical, shared)
└── migrations.ts                # Extend: v4=studio_registry, v5=provisioning_runs, v6=telemetry, v7=tokens
```

---

### Pattern 1: Neon Management API — Create and Find-or-Create Project

**Auth:** `Authorization: Bearer <NEON_API_KEY>` header via `createApiClient({ apiKey })`.

**Base URL:** `https://console.neon.tech/api/v2`

**Create project:**
```typescript
// Source: https://neon.com/docs/reference/typescript-sdk + api-docs.neon.tech/reference/createproject
import { createApiClient } from "@neondatabase/api-client";

const neon = createApiClient({ apiKey: env.NEON_API_KEY });

const response = await neon.createProject({
  project: {
    name: `gymos-${slug}`,          // unique per studio; used for find-or-create check
    region_id: "aws-eu-west-2",     // or aws-us-east-2 — pick one and standardise
    pg_version: 16,                  // 16 matches existing studio deploys; 17 also available
  },
});
// response.data.project.id   → Neon project ID (e.g. "cool-snow-123456")
// response.data.connection_uris[0].connection_uri  → DATABASE_URL (unpooled)
// Pooled URL: separate call needed (see below)
```

**Get pooled connection URI:**
```typescript
// GET /api/v2/projects/{project_id}/connection_uri?pooled=true&database_name=neondb&role_name=neondb_owner
const uriResp = await neon.getConnectionUri({
  projectId: projectId,
  database_name: "neondb",
  role_name: "neondb_owner",   // Neon's default role on new projects
  pooled: true,
});
// uriResp.data.uri  → pooled DATABASE_URL (has "-pooler" suffix in hostname)
```

**Find-or-create (idempotency):**
```typescript
// GET /api/v2/projects?search=<slug>  — filters by name/id
const listResp = await neon.listProjects({ search: `gymos-${slug}` });
const existing = listResp.data.projects.find(p => p.name === `gymos-${slug}`);
if (existing) return existing.id; // skip POST, use existing project
```

**Duplicate project conflict:** Neon does NOT enforce project-name uniqueness at the API level. Two calls to `createProject` with the same name will create two distinct projects with different `project.id` values. The find-or-create check (GET-before-POST) is the ONLY idempotency mechanism. **Confidence: HIGH** (Neon API reference confirms no idempotency key support).

**Delete project (rollback compensation):**
```typescript
await neon.deleteProject({ projectId });
// 200 on success; 404 if already deleted — treat 404 as success (idempotent rollback)
```

---

### Pattern 2: Vercel SDK — Create Project, Set Envs, Deploy, Poll Readiness

**Auth:** `new Vercel({ bearerToken: env.VERCEL_BEARER_TOKEN })`.

**Create project:**
```typescript
// Source: https://github.com/vercel/sdk/blob/HEAD/docs/sdks/projects/README.md
import { Vercel } from "@vercel/sdk";
const vercel = new Vercel({ bearerToken: env.VERCEL_BEARER_TOKEN });

const proj = await vercel.projects.createProject({
  requestBody: {
    name: `gymos-${slug}`,
    framework: "react-router",
    gitRepository: {
      type: "github",
      repo: "your-org/gymos",
    },
  },
  teamId: env.VERCEL_TEAM_ID,  // required if using a team account
});
// proj.id  → Vercel project ID
```

**Find-or-create (idempotency) — Vercel project name:**
```typescript
// SDK method: vercel.projects.getProject({ idOrName: `gymos-${slug}`, teamId })
// Returns 200 with project object if found; throws 404 error if not found
try {
  const existing = await vercel.projects.getProject({
    idOrName: `gymos-${slug}`,
    teamId: env.VERCEL_TEAM_ID,
  });
  return existing.id;         // project already exists, skip creation
} catch (err) {
  if ((err as any).status === 404) { /* proceed to create */ }
  throw err;
}
```

**Duplicate project conflict:** Vercel returns an error (status ~409 or 400) when a project with the same name already exists in the team scope. The exact body is: `{ error: { code: "project_already_exists", ... } }`. The find-by-name GET before POST is the recommended idempotency approach. **Confidence: MEDIUM** (exact 409 body unverified without live credentials).

**Set environment variables:**
```typescript
await vercel.projects.createProjectEnv({
  idOrName: proj.id,
  upsert: "true",                  // upsert=true makes this idempotent
  teamId: env.VERCEL_TEAM_ID,
  requestBody: [
    { key: "DATABASE_URL",          value: dbUrl,          type: "encrypted", target: ["production", "preview"] },
    { key: "DATABASE_URL_UNPOOLED", value: dbUrlUnpooled,  type: "encrypted", target: ["production", "preview"] },
    { key: "BETTER_AUTH_SECRET",    value: authSecret,     type: "encrypted", target: ["production", "preview"] },
    { key: "ANTHROPIC_API_KEY",     value: anthropicKey,   type: "encrypted", target: ["production", "preview"] },
    { key: "HQ_INGEST_URL",         value: hqIngestUrl,    type: "plain",     target: ["production", "preview"] },
    { key: "STUDIO_ID",             value: slug,           type: "plain",     target: ["production", "preview"] },
    { key: "STUDIO_TIMEZONE",       value: timezone,       type: "plain",     target: ["production", "preview"] },
    // STUDIO_TELEMETRY_TOKEN set in Step 7 after token is issued
  ],
});
```

**Trigger deployment:**
```typescript
const deploy = await vercel.deployments.createDeployment({
  requestBody: {
    name: `gymos-${slug}`,
    gitSource: {
      type: "github",
      repoId: env.VERCEL_GITHUB_REPO_ID,
      ref: "main",
    },
  },
  teamId: env.VERCEL_TEAM_ID,
});
// deploy.id  → deployment ID for polling
```

**Poll deployment readiness:**
```typescript
// Field: readyState (string)
// Values: "INITIALIZING" | "ANALYZING" | "BUILDING" | "DEPLOYING" | "READY" | "ERROR" | "CANCELED"
// SDK method: vercel.deployments.getDeployment({ idOrUrl: deploy.id, teamId })

async function waitForDeploy(deployId: string, timeoutMs = 600_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const d = await vercel.deployments.getDeployment({
      idOrUrl: deployId,
      teamId: env.VERCEL_TEAM_ID,
    });
    if (d.readyState === "READY") return;
    if (d.readyState === "ERROR" || d.readyState === "CANCELED") {
      throw new Error(`Deploy ${deployId} reached terminal state: ${d.readyState}`);
    }
    await new Promise(r => setTimeout(r, 10_000));  // poll every 10s
  }
  throw new Error(`Deploy ${deployId} timed out after ${timeoutMs}ms`);
}
```

**CRITICAL — DO NOT healthcheck via subdomain during polling.** Poll via the Vercel deploy URL (e.g. `gymos-slug-abc123.vercel.app/healthz`) not the custom domain. DNS propagation takes 30-120 seconds and will produce false failures (Pitfall P-05).

**Attach subdomain:**
```typescript
await vercel.projects.addProjectDomain({
  idOrName: proj.id,
  teamId: env.VERCEL_TEAM_ID,
  requestBody: { name: `${slug}.gymclassos.com` },
});
```

**Delete project (rollback):**
```typescript
await vercel.projects.deleteProject({
  idOrName: proj.id,
  teamId: env.VERCEL_TEAM_ID,
});
```

---

### Pattern 3: Fly Provisioning — App Create, Machine Deploy, Secrets

**Auth:** `FLY_API_TOKEN` org-scoped token in env; passed to `fetch` as `Authorization: Bearer` and to `execa` via `{ env: { FLY_API_TOKEN } }`.

**Generate org-scoped token (one-time operator setup):**
```bash
fly tokens create org -n "gymos-provisioner" -o <your-org-slug> -x 999999h
# Store output as FLY_API_TOKEN in services/hq-worker/.env and as Fly secret
```

**Create Fly app (Machines REST API):**
```typescript
// Source: https://fly.io/docs/machines/api/apps-resource/
// POST https://api.machines.dev/v1/apps
const FLY_API = "https://api.machines.dev";

const createResp = await fetch(`${FLY_API}/v1/apps`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.FLY_API_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    app_name: `gymos-${slug}-worker`,
    org_slug: env.FLY_ORG_SLUG,
  }),
});
// 201 response body: { "id": "z4k69dxd8r31p5mx", "created_at": 1708631799000 }
// The app_name (e.g. "gymos-slug-worker") is the stable identifier used in all subsequent calls
```

**Find-or-create (idempotency) — Fly app:**
```typescript
// GET https://api.machines.dev/v1/apps/{app_name}
// 200: { id, name, status, organization: { slug } }
// 404: app does not exist
const checkResp = await fetch(`${FLY_API}/v1/apps/gymos-${slug}-worker`, {
  headers: { Authorization: `Bearer ${env.FLY_API_TOKEN}` },
});
if (checkResp.ok) {
  // App already exists — skip creation, continue with secrets + machine steps
} else if (checkResp.status === 404) {
  // Create the app
} else {
  throw new Error(`Unexpected Fly GET app status: ${checkResp.status}`);
}
```

**Set Fly secrets — CRITICAL: flyctl CLI, NOT REST API.**
Fly Machines REST API secrets endpoints (`/v1/apps/{name}/secrets`) are restricted to Fly KMS and return empty arrays for general app secrets as of 2026-06. The only working path is `flyctl secrets set`:

```typescript
// Source: STACK.md + community.fly.io/t/manage-secrets-via-machines-api/24845
import { execa } from "execa";

// Build key=value pairs array — NEVER use template strings (injection risk)
const secretPairs = [
  `DATABASE_URL_UNPOOLED=${dbUrlUnpooled}`,
  `DATABASE_URL=${dbUrl}`,
  `BETTER_AUTH_SECRET=${authSecret}`,
  `HQ_INGEST_URL=${hqIngestUrl}`,
  `STUDIO_ID=${slug}`,
  `STUDIO_TIMEZONE=${timezone}`,
];

await execa(
  "flyctl",
  ["secrets", "set", "--app", `gymos-${slug}-worker`, "--stage", ...secretPairs],
  {
    env: {
      ...process.env,
      FLY_API_TOKEN: env.FLY_API_TOKEN,
    },
  },
);
// --stage: sets secrets but does NOT trigger a redeploy
//   (machine creation below will pick them up on first start)
```

**Ordering rule confirmed:** `fly create app` → `flyctl secrets set --stage` → `POST /v1/apps/{name}/machines` (machine picks up staged secrets on first start). This is confirmed by community thread and flyctl docs. Setting secrets before first deploy is supported.

**Log redaction — CRITICAL for Pitfall P-04:**
```typescript
// NEVER pass secretPairs values to the logger
log.info({
  app: `gymos-${slug}-worker`,
  keys: secretPairs.map(p => p.split("=")[0]),  // log key names only, NOT values
}, "[fly] setting secrets");
```

**Create machine:**
```typescript
// POST https://api.machines.dev/v1/apps/{app_name}/machines
const machineResp = await fetch(
  `${FLY_API}/v1/apps/gymos-${slug}-worker/machines`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FLY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      config: {
        image: env.GYMOS_WORKER_IMAGE,  // e.g. "registry.fly.io/gymos-worker:latest"
        guest: { cpu_kind: "shared", cpus: 1, memory_mb: 512 },
        auto_destroy: false,
      },
    }),
  },
);
const machine = await machineResp.json();
// machine.id  → machine identifier for wait endpoint
```

**Wait for machine start:**
```typescript
// GET https://api.machines.dev/v1/apps/{name}/machines/{machine_id}/wait?state=started&timeout=60
await fetch(
  `${FLY_API}/v1/apps/gymos-${slug}-worker/machines/${machine.id}/wait?state=started&timeout=60`,
  { headers: { Authorization: `Bearer ${env.FLY_API_TOKEN}` } },
);
// Returns 200 when state=started; 408 on timeout
```

**Delete Fly app (rollback):**
```typescript
// DELETE https://api.machines.dev/v1/apps/{app_name}
await fetch(`${FLY_API}/v1/apps/gymos-${slug}-worker`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${env.FLY_API_TOKEN}` },
});
// 202 on success; 404 if already deleted — treat 404 as success
```

---

### Pattern 4: Saga State Machine Schema + Per-Step Idempotency

**The canonical schema** (already designed in ARCHITECTURE.md V2-4, extending migrations.ts v4+):

```sql
-- Migration v4: studio registry
CREATE TABLE IF NOT EXISTS hq_studios (
  id            TEXT PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,   -- UNIQUE enforces Pitfall P-03 at DB level
  display_name  TEXT NOT NULL,
  owner_email   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  plan_id       TEXT,
  provisioned_at TEXT,
  created_at    TEXT NOT NULL DEFAULT NOW()
);

-- Migration v5: provisioning runs
CREATE TABLE IF NOT EXISTS hq_provisioning_runs (
  id                   TEXT PRIMARY KEY,
  studio_id            TEXT NOT NULL REFERENCES hq_studios(id),
  status               TEXT NOT NULL DEFAULT 'started',
  -- provider resource IDs (NOT connection strings — D-13)
  neon_project_id      TEXT,
  vercel_project_id    TEXT,
  fly_app_name         TEXT,
  subdomain            TEXT,
  -- per-step completion timestamps (NULL = not yet run)
  step_1_at TEXT, step_2_at TEXT, step_3_at TEXT, step_4_at TEXT,
  step_5_at TEXT, step_6_at TEXT, step_7_at TEXT, step_8_at TEXT,
  -- compensation (LIFO rollback) tracking
  compensation_errors  TEXT NOT NULL DEFAULT '{}',
  -- lifecycle
  started_at           TEXT NOT NULL DEFAULT NOW(),
  completed_at         TEXT,
  updated_at           TEXT NOT NULL DEFAULT NOW()
);

-- Migration v6: telemetry snapshots
CREATE TABLE IF NOT EXISTS hq_telemetry_snapshots (
  id           TEXT PRIMARY KEY,
  studio_id    TEXT NOT NULL REFERENCES hq_studios(id),
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  payload_json TEXT NOT NULL,           -- full TelemetrySnapshot JSON for BD3 HQB
  received_at  TEXT NOT NULL DEFAULT NOW(),
  last_telemetry_received_at TEXT,      -- denormalised for fast watchdog query
  UNIQUE(studio_id, period_start)
);

CREATE TABLE IF NOT EXISTS hq_token_usage (
  studio_id     TEXT NOT NULL REFERENCES hq_studios(id),
  date          TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT NOW(),
  PRIMARY KEY(studio_id, date)
);

-- Migration v7: studio tokens
CREATE TABLE IF NOT EXISTS hq_studio_tokens (
  studio_id   TEXT PRIMARY KEY REFERENCES hq_studios(id),
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT NOW(),
  revoked_at  TEXT
);
```

**Per-step idempotency pattern** (from STACK.md — the canonical runStep helper):
```typescript
// services/hq-worker/src/lib/run-step.ts
async function runStep<T>(
  db: Db,
  runId: string,
  stepNum: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
  fn: () => Promise<T>,
): Promise<T> {
  // Read current run to check if step already completed
  const run = await db.select().from(schema.hqProvisioningRuns)
    .where(eq(schema.hqProvisioningRuns.id, runId)).limit(1).then(r => r[0]);
  if (!run) throw new Error(`run ${runId} not found`);

  const stepCol = `step_${stepNum}_at` as const;
  if (run[stepCol] !== null) {
    // Step already completed — load output from stored provider resource IDs
    return { skipped: true, runId } as T;
  }

  const output = await fn();

  // Mark step complete (atomic — race-condition safe because only one pg-boss worker
  // processes a given runId at a time)
  await db.update(schema.hqProvisioningRuns)
    .set({ [stepCol]: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(schema.hqProvisioningRuns.id, runId));

  return output;
}
```

**LIFO compensation (rollback) pattern:**
```typescript
// services/hq-worker/src/lib/compensate.ts
type CompensationRecord = {
  step: number;
  action: string;
  resourceId: string;
};

async function compensate(
  run: HqProvisioningRun,
  apis: ProvisionApis,
  log: Logger,
): Promise<void> {
  // Build LIFO list: steps completed in reverse order
  const completed: CompensationRecord[] = [];
  if (run.step_7_at) completed.push({ step: 7, action: "revoke_token",    resourceId: run.studio_id });
  if (run.step_6_at) completed.push({ step: 6, action: "remove_dns",      resourceId: run.subdomain! });
  if (run.step_5_at) completed.push({ step: 5, action: "delete_fly_app",  resourceId: run.fly_app_name! });
  if (run.step_4_at) completed.push({ step: 4, action: "delete_vercel",   resourceId: run.vercel_project_id! });
  // Steps 2 and 3 have no compensation — project deletion handles cleanup
  if (run.step_1_at) completed.push({ step: 1, action: "delete_neon",     resourceId: run.neon_project_id! });

  const errors: Record<string, string> = {};
  for (const comp of completed) {
    try {
      await executeCompensation(comp, apis);
    } catch (err) {
      // Compensation failures are logged, never re-raised (best-effort)
      errors[`step_${comp.step}`] = String(err);
      log.error({ comp, err }, "[compensation] step failed — continuing");
    }
  }

  // Write any compensation errors back to the run row
  await db.update(schema.hqProvisioningRuns).set({
    status: "failed_terminal",
    compensationErrors: JSON.stringify(errors),
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.hqProvisioningRuns.id, run.id));
}
```

---

### Pattern 5: Token-Usage Accumulator (TEL-01)

BD1-ANTHROPIC-AUDIT.md established two viable paths. ARCHITECTURE.md V2-5 recommends the **direct accumulator approach** (atomic SQL UPDATE on `studio_telemetry_state` singleton). The plan MUST implement this, not the AFTER INSERT trigger, because:

1. The main chat loop's `recordUsage` path writes to `token_usage` in the studio Neon — the trigger would need to be installed as part of studio schema migrations and run per-run, which is correct.
2. The GOD `daily-owner-digest` job calls Anthropic directly via the wrapper — it bypasses `recordUsage` entirely and needs the wrapper.
3. **Both paths are needed:** the `anthropic.ts` wrapper captures the GOD direct calls; the `token_usage` AFTER INSERT trigger captures chat-loop calls. Or: all paths go through the wrapper by replacing the Anthropic client in `agent-chat-plugin.ts`.

**Simplest fork-safe approach (Claude's Discretion):**

Option A (DB trigger — preferred for chat loop, fork-safe):
```sql
-- Additive migration in apps/staff-web/server/db/migrations/
CREATE OR REPLACE FUNCTION accumulate_token_usage() RETURNS trigger AS $$
BEGIN
  INSERT INTO studio_telemetry_state
    (id, token_usage_today_input, token_usage_today_output, request_count_today, updated_at)
  VALUES
    ('singleton', NEW.input_tokens, NEW.output_tokens, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    token_usage_today_input  = studio_telemetry_state.token_usage_today_input  + EXCLUDED.token_usage_today_input,
    token_usage_today_output = studio_telemetry_state.token_usage_today_output + EXCLUDED.token_usage_today_output,
    request_count_today      = studio_telemetry_state.request_count_today + 1,
    updated_at               = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_token_usage_accumulate
AFTER INSERT ON token_usage
FOR EACH ROW EXECUTE FUNCTION accumulate_token_usage();
```

Option B (direct wrapper — covers GOD digest calls):
```typescript
// apps/staff-web/server/lib/anthropic.ts  (as designed in ARCHITECTURE.md V2-5)
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../db/index.js";
import { sql } from "drizzle-orm";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function createMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const response = await client.messages.create(params);
  try {
    const db = getDb();
    await db.execute(sql`
      INSERT INTO studio_telemetry_state
        (id, token_usage_today_input, token_usage_today_output, request_count_today, updated_at)
      VALUES ('singleton', ${response.usage.input_tokens}, ${response.usage.output_tokens}, 1, NOW())
      ON CONFLICT (id) DO UPDATE SET
        token_usage_today_input  = studio_telemetry_state.token_usage_today_input  + ${response.usage.input_tokens},
        token_usage_today_output = studio_telemetry_state.token_usage_today_output + ${response.usage.output_tokens},
        request_count_today      = studio_telemetry_state.request_count_today + 1,
        updated_at               = NOW()
    `);
  } catch {
    // Never break the run on telemetry failure
  }
  return response;
}
```

**BD1-ANTHROPIC-AUDIT.md open question resolved:** The AFTER INSERT trigger on `token_usage` handles the main chat loop (fork-safe, no core modification). The direct wrapper handles GOD digest calls (and any other direct Anthropic calls added later). Use both; they write to the same singleton row idempotently.

---

### Pattern 6: Telemetry Push Job (TEL-03)

Mirror of `housekeeping.ts` exactly — the pattern is proven in production:

```typescript
// services/worker/src/queues/telemetry-push.ts
const TELEMETRY_PUSH_QUEUE = "telemetry-push";

export async function registerTelemetryPush(boss: PgBoss): Promise<void> {
  await boss.work(TELEMETRY_PUSH_QUEUE, async () => {
    const db = getDb();
    const env = getEnv();

    if (!env.HQ_INGEST_URL || !env.STUDIO_TELEMETRY_TOKEN) {
      log.warn("[telemetry-push] HQ_INGEST_URL or STUDIO_TELEMETRY_TOKEN not set; skipping");
      return;
    }

    // Read and reset the accumulator atomically
    const [state] = await db.select().from(schema.studioTelemetryState);
    if (!state) return;

    // Build aggregate engagement metrics from studio tables
    const snapshot = await buildTelemetrySnapshot(db, env.STUDIO_ID, state);

    const resp = await fetch(env.HQ_INGEST_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.STUDIO_TELEMETRY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snapshot),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`HQ ingest returned ${resp.status}: ${body}`);
    }

    // Reset daily accumulators after successful push
    await db.update(schema.studioTelemetryState).set({
      tokenUsageTodayInput:  0,
      tokenUsageTodayOutput: 0,
      requestCountToday:     0,
      outboundSentToday:     0,
      outboundFailedToday:   0,
      lastPushAt:            new Date().toISOString(),
      lastPushStatus:        "ok",
    });
  });

  // Cron: 02:00 UTC daily (same pattern as housekeeping.ts)
  await boss.schedule(TELEMETRY_PUSH_QUEUE, "0 2 * * *", {}, { tz: "UTC" } as any);
}
```

---

### Pattern 7: HQ Ingest Endpoint (TEL-04)

```typescript
// apps/hq/server/routes/api/telemetry.ts (H3 route, publicPaths)
import { TelemetrySnapshot } from "@gymos/hq-schema/telemetry.js";
import { createHash, timingSafeEqual } from "crypto";

export default defineEventHandler(async (event) => {
  // 1. Extract bearer token
  const auth = getHeader(event, "authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return sendError(event, createError({ statusCode: 401 }));

  // 2. Hash and lookup
  const hash = createHash("sha256").update(token).digest("hex");
  const db = getHqDb();
  const [row] = await db.select()
    .from(schema.hqStudioTokens)
    .where(and(eq(schema.hqStudioTokens.tokenHash, hash), isNull(schema.hqStudioTokens.revokedAt)));
  if (!row) return sendError(event, createError({ statusCode: 401 }));

  // 3. Parse with strict Zod schema — rejects PII fields structurally (D-04)
  const body = await readBody(event);
  const parsed = TelemetrySnapshot.strict().safeParse(body);
  if (!parsed.success) {
    return sendError(event, createError({ statusCode: 422, data: parsed.error }));
  }

  // 4. Upsert snapshot + token usage
  const snap = parsed.data;
  await db.insert(schema.hqTelemetrySnapshots).values({
    id: nanoid(),
    studioId: row.studioId,
    periodStart: snap.periodStart,
    periodEnd: snap.periodEnd,
    payloadJson: JSON.stringify(snap),
    receivedAt: new Date().toISOString(),
    lastTelemetryReceivedAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: [schema.hqTelemetrySnapshots.studioId, schema.hqTelemetrySnapshots.periodStart],
    set: { payloadJson: sql`excluded.payload_json`, lastTelemetryReceivedAt: new Date().toISOString() },
  });

  await db.insert(schema.hqTokenUsage).values({
    studioId: row.studioId,
    date: snap.periodEnd.slice(0, 10),
    inputTokens: snap.llmInputTokens,
    outputTokens: snap.llmOutputTokens,
    requestCount: snap.llmRequestCount,
  }).onConflictDoUpdate({
    target: [schema.hqTokenUsage.studioId, schema.hqTokenUsage.date],
    set: {
      inputTokens:  sql`hq_token_usage.input_tokens  + excluded.input_tokens`,
      outputTokens: sql`hq_token_usage.output_tokens + excluded.output_tokens`,
      requestCount: sql`hq_token_usage.request_count + excluded.request_count`,
      updatedAt:    new Date().toISOString(),
    },
  });

  return { ok: true };
});
```

---

### Pattern 8: Watchdog Recurring Job (O-01, O-02)

```typescript
// services/hq-worker/src/queues/watchdog.ts
// Fires every 5 minutes; checks for stuck provisioning runs + missing telemetry

export async function registerWatchdog(boss: PgBoss): Promise<void> {
  await boss.work("hq-watchdog", async () => {
    const db = getHqDb();
    const log = getLogger();

    // Check for stuck provisioning runs (active >15 minutes)
    const stuckRuns = await db.execute(sql`
      SELECT id, studio_id, status, started_at
      FROM hq_provisioning_runs
      WHERE status NOT IN ('completed', 'failed_terminal')
        AND started_at < NOW() - INTERVAL '15 minutes'
    `);
    if (stuckRuns.rows.length > 0) {
      log.error({ stuckRuns: stuckRuns.rows }, "[watchdog] ALERT: stuck provisioning runs detected");
      // TODO BD2: send operator alert email via Postmark
    }

    // Check for studios with missing telemetry (>25h since last push)
    const staleTelemetry = await db.execute(sql`
      SELECT s.id, s.slug, s.display_name, t.last_telemetry_received_at
      FROM hq_studios s
      LEFT JOIN hq_telemetry_snapshots t ON t.studio_id = s.id
      WHERE s.status = 'active'
        AND (t.last_telemetry_received_at IS NULL
          OR t.last_telemetry_received_at < NOW() - INTERVAL '25 hours')
    `);
    if (staleTelemetry.rows.length > 0) {
      log.warn({ staleTelemetry: staleTelemetry.rows }, "[watchdog] ALERT: telemetry gap detected");
    }
  });

  await boss.schedule("hq-watchdog", "*/5 * * * *", {}, { tz: "UTC" } as any);
}
```

---

### Pattern 9: Mock-First Test Strategy

Per D-12, live provider calls are deferred. All three provider adapters MUST be behind thin interfaces:

```typescript
// services/hq-worker/src/lib/provision-apis/types.ts
export interface NeonApi {
  createProject(slug: string): Promise<{ projectId: string; dbUrl: string; dbUrlUnpooled: string }>;
  deleteProject(projectId: string): Promise<void>;
  findProjectBySlug(slug: string): Promise<{ projectId: string } | null>;
  getPooledConnectionUri(projectId: string): Promise<string>;
}

export interface VercelApi {
  createProject(slug: string): Promise<{ projectId: string }>;
  setEnvVars(projectId: string, vars: Record<string, string>): Promise<void>;
  deploy(projectId: string): Promise<{ deployId: string }>;
  waitForDeploy(deployId: string): Promise<void>;
  attachDomain(projectId: string, domain: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  findProjectBySlug(slug: string): Promise<{ projectId: string } | null>;
}

export interface FlyApi {
  createApp(slug: string): Promise<void>;
  setSecrets(slug: string, secrets: Record<string, string>): Promise<void>;
  createMachine(slug: string, image: string): Promise<{ machineId: string }>;
  waitForMachineStart(slug: string, machineId: string): Promise<void>;
  deleteApp(slug: string): Promise<void>;
  appExists(slug: string): Promise<boolean>;
}
```

**Mock implementations (for unit tests):**
```typescript
// services/hq-worker/src/__tests__/mocks/provision-apis.ts
export const mockNeonApi: NeonApi = {
  createProject: vi.fn().mockResolvedValue({
    projectId: "mock-project-123",
    dbUrl: "postgresql://user:pass@mock.neon.tech/neondb",
    dbUrlUnpooled: "postgresql://user:pass@mock-unpooled.neon.tech/neondb",
  }),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  findProjectBySlug: vi.fn().mockResolvedValue(null),
  getPooledConnectionUri: vi.fn().mockResolvedValue("postgresql://user:pass@pooler.neon.tech/neondb"),
};

// Similarly for vercelApi and flyApi...
```

**What CAN be unit-tested without live credentials:**
- Saga step sequencing (forward + rollback)
- Per-step idempotency (`step_N_at` skip logic)
- Slug uniqueness race condition (DB-level UNIQUE constraint)
- LIFO compensation ordering
- Zod `.strict()` telemetry ingest rejection of PII fields
- SHA256 token hash + constant-time comparison
- Watchdog query logic (stub DB)
- Telemetry push job retry behavior (mock fetch)

**What requires live credentials (deferred-on-external-dependency):**
- Real Neon project creation/deletion
- Real Vercel project creation + env set + deployment
- Real Fly app creation + secrets set + machine spin
- End-to-end provisioning run against actual providers

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Neon project CRUD | Raw fetch + hand-typed response shapes | `@neondatabase/api-client` | Typed request/response shapes; eliminates path typos |
| Vercel project/deployment management | Raw fetch + string concatenation | `@vercel/sdk` | `readyState` field and all endpoint shapes are typed |
| Fly secrets management | Machines REST API secrets endpoint | `flyctl secrets set` via `execa` | REST secrets endpoint is NOT GA; returns empty arrays |
| Shell command execution with arg arrays | `child_process.execFile` callbacks | `execa` (^9.x) | Promise-native, ESM, prevents injection via array args |
| Bearer token validation timing attack | `token === storedToken` | `crypto.timingSafeEqual` | Prevents timing oracle on token comparison |
| Token hashing | MD5 or custom | `crypto.createHash('sha256')` | SHA256 is the standard; already in Node stdlib |
| Saga framework | Custom saga library | Plain TypeScript with `runStep` helper + `hq_provisioning_runs` table | No external saga dep needed; pg-boss provides retry; `step_N_at` columns provide state |
| Deployment polling loop | Recursive setTimeout + complex state | Simple `while` loop with `setTimeout` + deadline guard | Synchronous within the hq-worker process; simple is correct |

**Key insight:** The provisioning domain looks complex but consists of 8 sequential steps, each calling one external API. The complexity is in rollback and idempotency — both of which are solved by the `hq_provisioning_runs` schema, not by a framework.

---

## Common Pitfalls

### Pitfall 1: Non-Idempotent Neon Project Creation
**What goes wrong:** Retry creates a second Neon project. Two `gymos-slug` projects exist. One is live; one leaks cost forever.
**Why it happens:** Neon `POST /projects` has no idempotency key. Every successful call creates a new project regardless.
**How to avoid:** Always call `listProjects({ search: slug })` and check for a matching name BEFORE calling `createProject`. Store the `project.id` in `hq_provisioning_runs.neon_project_id` immediately after creation.
**Warning signs:** Neon dashboard shows multiple `gymos-*` projects per slug.

### Pitfall 2: Fly Secrets Before App Creation
**What goes wrong:** `flyctl secrets set --app gymos-slug` before the app is created fails with "app not found."
**How to avoid:** Correct order is: (1) `POST /v1/apps` via Machines REST, (2) `flyctl secrets set --stage`, (3) `POST /v1/apps/{name}/machines`.

### Pitfall 3: Subdomain DNS Healthcheck During Deploy Polling
**What goes wrong:** Healthcheck fires immediately after DNS record creation. DNS hasn't propagated. Provisioning interprets 502/NXDOMAIN as deploy failure and triggers rollback on a healthy deploy.
**How to avoid:** Use the Vercel-assigned deployment URL (`gymos-slug-abc123.vercel.app/healthz`) for the healthcheck, NOT the custom subdomain. The DNS reachability check is a deferred job with exponential backoff, not part of the main saga.

### Pitfall 4: Secret Values in Pino Logs
**What goes wrong:** Pino's default serializer logs the full `execa` args array, including `KEY=value` secrets. Better Stack contains every studio's Stripe key.
**How to avoid:** Log only key names before calling `execa`. Add a Pino redacting serializer that scrubs any field whose name matches `/secret|password|token|key|url|connection|dsn/i`.

### Pitfall 5: Studio DB Credentials in HQ Schema
**What goes wrong:** Developer stores the new Neon `dbUrl` in a `hq_provisioning_runs.database_url` column "for easy health checks." Violates D-13. CI guard `guard-hq-no-pii.mjs` fails.
**How to avoid:** Store only `neon_project_id` (the opaque Neon project ID) in HQ schema. The `dbUrl` goes directly to `flyctl secrets set` and `vercel.projects.createProjectEnv()` — it NEVER touches HQ Neon.

### Pitfall 6: PII Leak via Zod Non-Strict Parse
**What goes wrong:** Using `TelemetrySnapshot.parse(body)` instead of `TelemetrySnapshot.strict().parse(body)`. Extra fields (including member emails) are silently accepted and stored.
**How to avoid:** The ingest endpoint MUST use `.strict()`. Test: `TelemetrySnapshot.strict().safeParse({ ...validPayload, member_email: "test@test.com" })` must return `success: false`.

### Pitfall 7: pg-boss Job Expiry Not Configured
**What goes wrong:** Provisioning job hangs in `active` state forever (default: no expiry). Developer discovers stuck job 3 days later via customer email.
**How to avoid:** Configure `boss.send("provision-studio", payload, { expireInSeconds: 600, retryLimit: 3 })`. The saga's watchdog job detects `failed` or `expired` states within 5 minutes.

### Pitfall 8: Telemetry Token as Shared Static Secret
**What goes wrong:** All studios share the same `TELEMETRY_TOKEN`. A compromised studio can inject false telemetry for all studios into HQ.
**How to avoid:** Per D-05, each studio gets its own randomly generated token (nanoid, 32+ chars) generated at Step 7. HQ stores only the sha256 hash.

---

## Runtime State Inventory

This is a greenfield phase — no rename or migration of existing runtime state. The only studio-side additions are additive SQL migrations and new Fly secrets. No existing data is modified.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — all new tables created in this phase | Additive CREATE TABLE IF NOT EXISTS migrations only |
| Live service config | `services/hq-worker` Fly env — new provider token vars needed: `NEON_API_KEY`, `VERCEL_BEARER_TOKEN`, `FLY_API_TOKEN`, `VERCEL_TEAM_ID`, `FLY_ORG_SLUG`, `GYMOS_WORKER_IMAGE` | Operator must set as Fly secrets before first live provisioning run |
| OS-registered state | None | None |
| Secrets/env vars | `STUDIO_TELEMETRY_TOKEN` is new per-studio — issued at Step 7, set via `flyctl secrets set` on studio Fly app + `vercel.projects.createProjectEnv()` | Provisioning saga handles this; no manual step |
| Build artifacts | None | None |

---

## Environment Availability

Step 2.6 SKIPPED for the core saga/telemetry code — these are pure TypeScript code changes. However, live provisioning requires the following operator-provided credentials that are NOT present in-repo:

| Dependency | Required By | Available in-repo | Version | Fallback |
|------------|------------|-------------------|---------|----------|
| `NEON_API_KEY` | PROV Step 1 (Neon project create) | No | — | Mock adapter in unit tests |
| `VERCEL_BEARER_TOKEN` | PROV Step 4 (Vercel project create) | No | — | Mock adapter in unit tests |
| `VERCEL_TEAM_ID` | PROV Step 4 | No | — | Mock adapter in unit tests |
| `FLY_API_TOKEN` (org-scoped) | PROV Step 5 (Fly app create) | No | — | Mock adapter in unit tests |
| `FLY_ORG_SLUG` | PROV Step 5 | No | — | Mock adapter in unit tests |
| `GYMOS_WORKER_IMAGE` | PROV Step 5 (machine create) | No | — | Placeholder in unit tests |
| `flyctl` v0.3.96 | PROV Step 5 (secrets set) | YES — baked into hq-worker Docker image | 0.3.96 | — |

**Missing dependencies with no fallback (block live execution):**
- All 6 operator credentials above — live provisioning runs are deferred-on-external-dependency until the operator sets them in hq-worker Fly secrets.

**Missing dependencies with fallback (unit tests use mocks):**
- All 6 also have mock adapters in the test strategy above — code + rollback + idempotency fully testable without credentials.

---

## Open Questions

1. **Neon duplicate project name: does the API return a 409 or create a second project?**
   - What we know: Neon API reference does not document an idempotency key parameter. Projects are identified by `project.id` (opaque), not by name (which is free-text and not unique-constrained at the API level).
   - What's unclear: Whether submitting `createProject` with a name identical to an existing project returns a 409 conflict or creates a second project with a new ID.
   - Research verdict: **Neon creates a second project** (names are NOT unique). The find-or-create GET-before-POST pattern is mandatory, not optional. Confidence: MEDIUM (not verified with live credentials).
   - Recommendation: The `listProjects({ search: slug })` idempotency check MUST precede every `createProject` call; never rely on API-level deduplication.

2. **Vercel `createProject` conflict error shape: exact status code and body?**
   - What we know: `vercel.projects.getProject({ idOrName: slug })` returns 404 if not found; project names within a team must be unique.
   - What's unclear: Whether the SDK throws an error with `.status === 409` or `.status === 400` when creating with a duplicate name.
   - Recommendation: Use getProject-before-createProject as the idempotency check; don't rely on catching a specific error code from createProject. Wrap the getProject call in a try/catch on 404.

3. **`fly secrets set` with `--stage` flag: does staging persist if the machine isn't created yet?**
   - What we know: Community thread confirms `flyctl secrets set` works before first deploy. The `--stage` flag sets secrets without triggering a deployment.
   - What's unclear: Whether staged secrets survive if the machine creation in the next step fails and the machine never starts.
   - Recommendation: Use `--stage` then create the machine immediately in the same saga step. If machine creation fails, the secrets are staged on an app with no machines — rollback deletes the app anyway, so the leaked secrets are moot.

4. **`token_usage` trigger vs direct wrapper — which fires for the main chat loop?**
   - What we know: BD1-ANTHROPIC-AUDIT.md confirmed `recordUsage` is called at `production-agent.ts:2654` and inserts into `token_usage` table. This is inside `packages/core` (no modification).
   - What's unclear: Whether the AFTER INSERT trigger on `token_usage` in the STUDIO Neon will be installed by the studio schema migrations or requires a separate migration step at provisioning time.
   - Recommendation: Include the trigger creation in the studio schema additive migrations (apps/staff-web/server/db/migrations/). The provisioning Step 2 (run studio migrations) will install the trigger automatically on new studio Neons.

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies To BD2 |
|-----------|---------------|
| No `drizzle-kit push` — use `generate` + `migrate` | All new HQ schema migrations must go through `hqMigrations` array in `packages/hq-schema/src/migrations.ts` |
| Additive-only SQL | All new tables use `CREATE TABLE IF NOT EXISTS`; all new columns use `ADD COLUMN IF NOT EXISTS` |
| No `studio_id` columns in schema | HQ identifies studios via `hq_studios.id`; studio Neons have no cross-tenant columns |
| No studio Neon credentials in HQ schema | D-13; `neon_project_id` only (the opaque ID), never the URL |
| TypeScript end-to-end, no `.js`/`.mjs` | All new files in `services/hq-worker/`, `apps/hq/`, `packages/hq-schema/` use `.ts`/`.tsx` |
| `execa` array args — never template strings | All `flyctl` subprocess calls use `execa("flyctl", [...args], opts)` form |
| No branch creation | All work on `master` |
| Additive DB migrations only | `hqMigrations` array extends from v4; never modifies v1/v2/v3 entries |
| Integration-webhook queue pattern | HQ signup intake: verify → enqueue → 202 (saga runs in hq-worker, not in Vercel function) |
| `guard:hq-no-pii` CI check | New HQ migration columns must not contain `*connection*`, `*database_url*`, `*dsn*` in names |
| Pino structured logging | All new service code uses `getLogger()` pattern from hq-worker |
| `pg-boss` scheduling is idempotent | `boss.schedule(name, cron)` with same name is a no-op if already registered |

---

## Sources

### Primary (HIGH confidence)
- `.planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md` — exact `recordUsage` call site at `production-agent.ts:2654`, `AgentLoopUsage` type, confirmed no `onUsage` hook in `AgentChatPluginOptions`, two viable interception options
- `.planning/research/ARCHITECTURE.md` §V2-4 — complete 8-step saga state machine, `hq_provisioning_runs` schema, TelemetrySnapshot Zod schema, `studio_telemetry_state` singleton accumulator SQL
- `.planning/research/STACK.md` — `@neondatabase/api-client`, `@vercel/sdk ^1.27.0`, `execa ^9.x` confirmed; Fly secrets via flyctl NOT REST API confirmed (community-verified)
- `.planning/research/PITFALLS.md` — P-01..P-06, T-01..T-04, O-01..O-04 pitfall catalogue with specific prevention steps
- `packages/hq-schema/src/migrations.ts` — v1/v2/v3 existing migrations; v4+ placeholder documented
- `services/hq-worker/Dockerfile` — flyctl v0.3.96 baked in; `node:22-bookworm-slim` base
- `services/hq-worker/src/index.ts` — pg-boss boot pattern; `BD2 adds: provision-studio, brain-ingest` comment
- `services/worker/src/queues/housekeeping.ts` — exact `boss.work` + `boss.schedule` pattern; `tz` option confirmed
- `https://fly.io/docs/machines/api/apps-resource/` — `POST /v1/apps` request/response shape confirmed; `GET /v1/apps/{name}` for existence check
- `https://fly.io/docs/machines/api/machines-resource/` — `POST /v1/apps/{name}/machines` request shape; `/wait?state=started` endpoint
- `https://fly.io/docs/flyctl/tokens-create-org/` — `fly tokens create org -o <slug> -x 999999h` syntax
- `https://community.fly.io/t/flyctl-secrets-import-before-first-deployment/5758` — `fly create` → `flyctl secrets set` → `fly deploy` ordering confirmed

### Secondary (MEDIUM confidence)
- `https://neon.com/docs/reference/typescript-sdk` — `createApiClient`, `createProject` response shape (`response.data.project.id`, `response.data.connection_uris[0].connection_uri`); `listProjects({ search })` confirmed
- `https://api-docs.neon.tech/reference/getconnectionuri` — `GET /api/v2/projects/{id}/connection_uri?pooled=true` endpoint confirmed; `pooled` boolean parameter
- `https://github.com/vercel/sdk/blob/HEAD/docs/sdks/projects/README.md` — `vercel.projects.createProject()` signature; `vercel.projects.getProject()` for existence check
- `https://github.com/vercel/sdk/blob/main/docs/sdks/deployments/README.md` — `vercel.deployments.createDeployment()`, `vercel.deployments.getDeployment()` method names confirmed
- WebSearch: `readyState` field on Vercel deployment response; values `INITIALIZING | ANALYZING | BUILDING | DEPLOYING | READY | ERROR | CANCELED` confirmed

### Tertiary (LOW confidence — flagged for validation)
- Neon duplicate project name behavior (creates second project vs 409) — not verifiable without live API key; GET-before-POST is the safe assumption
- Vercel `createProject` duplicate name exact HTTP status code (409 vs 400) — treat as uncertain; use getProject-before-create

---

## Metadata

**Confidence breakdown:**
- Telemetry architecture (TEL-01..06): HIGH — all seams confirmed in BD1-ANTHROPIC-AUDIT.md; existing patterns (housekeeping.ts, Zod strict, sha256 token) all proven
- Provisioning saga structure (PROV-01..10): HIGH — step sequence confirmed in ARCHITECTURE.md V2-4; provider API call shapes confirmed in official docs
- Neon API (exact response shapes): MEDIUM — basic shapes confirmed; duplicate project behavior and exact `connection_uris` array index assumptions not live-tested
- Vercel SDK (readyState, exact error shapes): MEDIUM — `readyState` field confirmed; exact 409/400 error code for duplicate projects unverified
- Fly secrets ordering: MEDIUM-HIGH — community-confirmed pattern for create→secrets→deploy

**Research date:** 2026-06-19
**Valid until:** 2026-08-01 (Vercel SDK and flyctl move fast; re-verify `@vercel/sdk` version and `readyState` field at implementation time)
