---
phase: BD1-hq-foundation
plan: 04
type: execute
wave: 3
depends_on: ["02"]
files_modified:
  - services/hq-worker/package.json
  - services/hq-worker/tsconfig.json
  - services/hq-worker/src/index.ts
  - services/hq-worker/src/boss.ts
  - services/hq-worker/src/lib/env.ts
  - services/hq-worker/src/lib/logger.ts
  - services/hq-worker/src/lib/env.test.ts
  - services/hq-worker/fly.toml
  - services/hq-worker/Dockerfile
  - services/hq-worker/.dockerignore
  - services/hq-worker/.env.example
autonomous: true
requirements: [HQ-FND-05]
user_setup:
  - service: fly
    why: "services/hq-worker deploys to Fly as a NEW app. Claude scaffolds the config + image; the operator runs the one-time fly app create + secrets set. flyctl is baked into the image for BD2 provisioning."
    env_vars:
      - name: DATABASE_URL_UNPOOLED
        source: "HQ Neon UNPOOLED connection string (no -pooler) — pg-boss requires LISTEN/NOTIFY. Set via: fly secrets set DATABASE_URL_UNPOOLED=... -a gymos-hq-worker"

must_haves:
  truths:
    - "services/hq-worker exists as a pg-boss worker mirroring services/worker, bootstrapping pg-boss against the HQ Neon (UNPOOLED) and exposing /healthz"
    - "The hq-worker container image bakes in flyctl at a pinned version so BD2 PROV can shell out to flyctl secrets set (Fly secrets cannot be set via the Machines REST API)"
    - "hq-worker is a member of the pnpm workspace and typechecks cleanly"
    - "Its Fly config follows the existing services/edge-webhooks/fly.toml precedent (always-on machine, /healthz check)"
  artifacts:
    - path: "services/hq-worker/src/index.ts"
      provides: "pg-boss bootstrap + /healthz HTTP server"
      contains: "healthz"
    - path: "services/hq-worker/Dockerfile"
      provides: "Image with flyctl baked in (pinned)"
      contains: "flyctl"
    - path: "services/hq-worker/fly.toml"
      provides: "Fly app config (always-on, /healthz check)"
      contains: "healthz"
  key_links:
    - from: "services/hq-worker/src/boss.ts"
      to: "DATABASE_URL_UNPOOLED (HQ Neon)"
      via: "pg-boss connection (unpooled — LISTEN/NOTIFY)"
      pattern: "DATABASE_URL_UNPOOLED"
    - from: "services/hq-worker/Dockerfile"
      to: "flyctl"
      via: "baked-in CLI for BD2 provisioning"
      pattern: "flyctl"
---

<objective>
Stand up `services/hq-worker` as a Fly app skeleton that mirrors `services/worker`: it boots pg-boss against the HQ Neon (unpooled) and exposes `/healthz`. The container image bakes in `flyctl` (pinned) NOW so BD2's provisioning saga can shell out to `flyctl secrets set` without reshaping the image (Fly secrets cannot be set via the Machines REST API).

Purpose: HQ-FND-05 — a hq-worker skeleton ready to host the provisioning saga (BD2) + scheduled jobs. Building it in BD1 (with flyctl pre-baked) means BD2 PROV adds queues, not infrastructure.
Output: services/hq-worker/ (src + lib/env + boss + /healthz) + fly.toml + Dockerfile with flyctl + .env.example, in the workspace, typechecking clean.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD1-hq-foundation/BD1-CONTEXT.md
@.planning/research/SUMMARY.md
@.planning/research/STACK.md
@CLAUDE.md
@AGENTS.md

<read_first>
Bounding decisions (BD1-CONTEXT.md):
- D-11: services/hq-worker mirrors services/worker structure (pg-boss bootstrap + /healthz on its own port). Hosts the provisioning saga (BD2) + scheduled jobs.
- D-12: BAKE flyctl into the hq-worker container image in BD1 (base image + pinned version), because Fly secrets cannot be set via the Machines REST API — BD2 PROV will shell out to flyctl via execa. Doing it now means PROV doesn't reshape the image.
- D-13: Fly config follows the existing services/edge-webhooks/fly.toml single-app precedent; exact topology finalized here.

Stack notes (SUMMARY.md / STACK.md): pg-boss 12.x on HQ Neon is sufficient (no Redis). Use an org-scoped Fly token for BD2 (NOT a deploy token) — out of BD1 scope but note it in .env.example. flyctl is the only working path for Fly secrets. Node 22+ required.

Precedent to mirror EXACTLY:
- services/worker/src/index.ts — the boot sequence: getEnv() -> getLogger() -> getBoss() -> boss.start() -> createQueue(...) loop -> register workers -> Hono admin server with GET /healthz on env.PORT. For BD1, hq-worker has NO domain queues yet (BD2 adds provision-studio + brain-ingest); the boot creates pg-boss, ensures ZERO domain queues (or a single placeholder), and serves /healthz. Keep the /healthz contract identical so the Fly check passes on deploy.
- services/worker/src/boss.ts — re-exports getBoss from @gymos/queue (which reads DATABASE_URL_UNPOOLED and throws on -pooler hostnames, PITFALL #1). hq-worker connects to the HQ Neon: it must use the HQ DATABASE_URL_UNPOOLED. Decide whether to reuse @gymos/queue's getBoss (if it reads the same env name, the HQ deploy simply sets DATABASE_URL_UNPOOLED to the HQ Neon) or create a thin HQ-local boss factory. Reusing @gymos/queue is fine — the env var is deploy-scoped, so the HQ Fly app's DATABASE_URL_UNPOOLED points at the HQ Neon. Document this in .env.example.
- services/worker/src/lib/env.ts — the Zod env schema (DATABASE_URL_UNPOOLED refined to reject -pooler; PORT default; GIT_SHA; NODE_ENV; LOG_LEVEL). hq-worker needs a TRIMMED version: DATABASE_URL_UNPOOLED + PORT + GIT_SHA + NODE_ENV + LOG_LEVEL. Do NOT carry the studio-only secrets (WHATSAPP_*, STRIPE_*, PGCRYPTO_*) — HQ-FND-06's PII guard and the PII-up boundary mean hq-worker must NOT hold studio credentials. The Fly/Neon/Vercel provisioning tokens (NEON_API_KEY, VERCEL_API_TOKEN, FLY_API_TOKEN) are BD2 additions — leave a commented placeholder in env.ts + .env.example noting they arrive in BD2.
- services/worker/src/lib/logger.ts — pino logger; copy.
- services/edge-webhooks/fly.toml — app config: app name, primary_region, [build] dockerfile, [env] PORT/NODE_ENV, [http_service] with /healthz check, [[vm]]. Mirror for hq-worker as app 'gymos-hq-worker'. Since hq-worker is worker-only (no public web service), it can be a single process exposing /healthz on its PORT with an http check (mirror the worker-process health-check service block in edge-webhooks/fly.toml).
- Root Dockerfile — the multi-stage pnpm build for the Fly services (deps -> build -> runtime). hq-worker needs its OWN Dockerfile (services/hq-worker/Dockerfile) because it must additionally install flyctl into the runtime stage. Mirror the root Dockerfile's stages but: filter to @gymos/hq-worker, build @gymos/hq-schema + @gymos/queue + @agent-native/core as needed, and in the runtime stage install flyctl at a PINNED version (e.g. via the official install script with a fixed FLYCTL_VERSION, or copy the binary) and put it on PATH. Set CMD to node services/hq-worker/dist/index.js.

Constraints: TypeScript only; Node 22 engine; no-local-dev-server (verify via tsc/typecheck, env unit test, and Dockerfile grep — do NOT run the worker or docker build as an acceptance gate unless trivially fast). The workspace globs (services/*) already include hq-worker.
</read_first>

<interfaces>
From services/worker/src/index.ts (boot shape to mirror, minus domain queues):
```
const env = getEnv(); const log = getLogger();
const boss = getBoss(); boss.on("error", ...); await boss.start();
// BD1: no domain queues yet (BD2 adds provision-studio + brain-ingest)
const admin = new Hono();
admin.get("/healthz", (c) => c.json({ ok: true, version: env.GIT_SHA, app: "hq-worker" }));
serve({ fetch: admin.fetch, port: env.PORT }, ...);
```
From services/worker/src/lib/env.ts (trimmed for HQ):
```
DATABASE_URL_UNPOOLED: z.string().url().refine((u) => !u.includes("-pooler"), {...}),
PORT: z.coerce.number().int().positive().default(3003),
GIT_SHA: z.string().optional().default("dev"),
NODE_ENV: z.enum(["development","production","test"]).default("development"),
LOG_LEVEL: z.enum([...]).default("info"),
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold the hq-worker pg-boss skeleton + trimmed env + /healthz</name>
  <read_first>services/worker/src/index.ts, services/worker/src/boss.ts, services/worker/src/lib/env.ts, services/worker/src/lib/logger.ts, services/worker/package.json, services/worker/tsconfig.json</read_first>
  <files>services/hq-worker/package.json, services/hq-worker/tsconfig.json, services/hq-worker/src/index.ts, services/hq-worker/src/boss.ts, services/hq-worker/src/lib/env.ts, services/hq-worker/src/lib/logger.ts, services/hq-worker/.env.example</files>
  <action>
Create services/hq-worker mirroring services/worker but trimmed to the HQ skeleton:
- package.json: name "@gymos/hq-worker", "type":"module", "private":true, engines node >=22. Scripts: dev (tsx watch src/index.ts), build (tsc -p tsconfig.json), start (node dist/index.js), typecheck (tsc --noEmit), test (vitest run). Dependencies: @gymos/queue (workspace:*) for getBoss, @gymos/hq-schema (workspace:*), @hono/node-server, hono, pg, pg-boss ^12.18.0, pino, zod. devDependencies: @types/node, @types/pg, tsx (catalog:), typescript (catalog:), vitest, dotenv. Do NOT depend on @gymos/whatsapp or stripe (studio-only — and HQ must not hold studio credentials).
- tsconfig.json: copy services/worker/tsconfig.json.
- src/lib/env.ts: trimmed Zod schema (DATABASE_URL_UNPOOLED with the -pooler refine, PORT default 3003, GIT_SHA, NODE_ENV, LOG_LEVEL). Add a clearly-commented BD2 placeholder block for NEON_API_KEY / VERCEL_API_TOKEN / FLY_API_TOKEN (.optional() or commented out) noting they are added in BD2 PROV. Mirror the cached getEnv() + _resetEnvForTests() pattern.
- src/lib/logger.ts: copy the pino logger.
- src/boss.ts: re-export getBoss from @gymos/queue (the HQ deploy sets DATABASE_URL_UNPOOLED to the HQ Neon). Add a comment that the env is deploy-scoped to the HQ Neon.
- src/index.ts: mirror the worker boot but with NO domain queues (BD2 adds them). Sequence: getEnv -> getLogger -> getBoss -> boss.on("error") -> boss.start() -> Hono admin with GET /healthz returning { ok:true, app:"hq-worker", version: env.GIT_SHA } -> serve on env.PORT. main().catch(process.exit(1)).
- .env.example: document DATABASE_URL_UNPOOLED (HQ Neon, no -pooler), PORT (3003), and a BD2-placeholder note for NEON_API_KEY/VERCEL_API_TOKEN/FLY_API_TOKEN (org-scoped Fly token, NOT deploy token). Note: hq-worker MUST NOT hold any studio credential or studio connection string (PII-up boundary).
  </action>
  <verify>
    <automated>grep -q "healthz" services/hq-worker/src/index.ts && grep -q "DATABASE_URL_UNPOOLED" services/hq-worker/src/lib/env.ts && node -e "const p=require('./services/hq-worker/package.json'); if(p.name!=='@gymos/hq-worker') process.exit(1); if(p.dependencies['@gymos/whatsapp']||p.dependencies['stripe']) process.exit(1); console.log('ok')"</automated>
  </verify>
  <acceptance_criteria>
    - services/hq-worker/package.json name is @gymos/hq-worker; it does NOT depend on @gymos/whatsapp or stripe (the node check above exits 0).
    - src/index.ts serves GET /healthz on env.PORT (grep "healthz").
    - src/lib/env.ts enforces DATABASE_URL_UNPOOLED with a -pooler rejection and defaults PORT to 3003 (grep "DATABASE_URL_UNPOOLED" + "3003").
    - .env.example notes hq-worker must NOT hold studio credentials/connection strings (grep: "must not" + "studio" or "PII").
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: hq-worker Dockerfile with flyctl baked in (pinned) + fly.toml</name>
  <read_first>Dockerfile (root multi-stage pnpm build for Fly services), services/edge-webhooks/fly.toml, services/edge-webhooks/.dockerignore</read_first>
  <files>services/hq-worker/Dockerfile, services/hq-worker/fly.toml, services/hq-worker/.dockerignore</files>
  <action>
Create the hq-worker image + Fly config:
- services/hq-worker/Dockerfile: mirror the root Dockerfile's multi-stage pattern (base node:22-bookworm-slim + corepack pnpm pinned; deps stage with --frozen-lockfile --ignore-scripts filtered to "@gymos/hq-worker..."; build stage building @agent-native/core + @gymos/queue + @gymos/hq-schema + @gymos/hq-worker; runtime stage). In the RUNTIME stage, install flyctl at a PINNED version and put it on PATH — use a fixed version arg (e.g. ARG FLYCTL_VERSION=<pin a specific release, do NOT use "latest">) and the official installer (curl -L https://fly.io/install.sh | FLYCTL_VERSION=$FLYCTL_VERSION sh) OR copy the binary from the flyio/flyctl image at a pinned tag. Add a comment citing D-12: flyctl baked in now because Fly secrets cannot be set via the Machines REST API; BD2 PROV shells out via execa. CMD: node services/hq-worker/dist/index.js. Ensure curl/ca-certificates are installed in the runtime stage if using the install script.
- services/hq-worker/fly.toml: app 'gymos-hq-worker', primary_region matching edge-webhooks (iad). [build] dockerfile = 'Dockerfile' (the hq-worker-local one). [env] NODE_ENV='production', PORT='3003'. A single worker process exposing /healthz: mirror the edge-webhooks worker-process health-check service block (internal_port = 3003, http_checks GET /healthz, auto_start_machines, min_machines_running = 1, auto_stop_machines = 'off'). [[vm]] shared-cpu-1x, 512mb.
- services/hq-worker/.dockerignore: copy services/edge-webhooks/.dockerignore (ignore node_modules, dist, .env, etc.).
  </action>
  <verify>
    <automated>grep -qi "flyctl" services/hq-worker/Dockerfile && grep -qi "FLYCTL_VERSION\|flyio/flyctl:" services/hq-worker/Dockerfile && grep -q "healthz" services/hq-worker/fly.toml && grep -q "gymos-hq-worker" services/hq-worker/fly.toml && echo ok</automated>
  </verify>
  <acceptance_criteria>
    - services/hq-worker/Dockerfile installs flyctl at a PINNED version (grep: "flyctl" AND a pinned version reference FLYCTL_VERSION or a flyio/flyctl:<tag> — NOT "latest").
    - The Dockerfile has a comment citing D-12 / "Fly secrets ... REST API" rationale (grep: "REST API" or "D-12").
    - services/hq-worker/fly.toml targets app gymos-hq-worker with a /healthz http check on PORT 3003 (grep "gymos-hq-worker" + "healthz" + "3003").
    - .dockerignore exists.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Unit-test hq-worker env + typecheck the service</name>
  <read_first>services/worker/src/lib/env.ts + any worker env test, services/hq-worker/src/lib/env.ts (from Task 1)</read_first>
  <files>services/hq-worker/src/lib/env.test.ts</files>
  <action>
Write a Vitest unit test for services/hq-worker/src/lib/env.ts (no server boot):
- A valid env (DATABASE_URL_UNPOOLED without -pooler, valid PORT) parses successfully.
- A pooled URL (containing -pooler) is REJECTED (encodes PITFALL #1).
- PORT defaults to 3003 when unset.
- Assert the schema does NOT require any studio credential (parsing succeeds WITHOUT WHATSAPP_*/STRIPE_*/PGCRYPTO_* present) — encodes the PII-up boundary that hq-worker holds no studio secrets.
Mock + reset process.env per test (use _resetEnvForTests). Then run typecheck for the whole service.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/hq-worker test && pnpm --filter @gymos/hq-worker typecheck</automated>
  </verify>
  <acceptance_criteria>
    - services/hq-worker/src/lib/env.test.ts exists and asserts a -pooler URL is rejected and PORT defaults to 3003.
    - There is a test asserting the env parses WITHOUT any studio credential present (grep the test for the no-studio-secrets assertion).
    - pnpm --filter @gymos/hq-worker test exits 0.
    - pnpm --filter @gymos/hq-worker typecheck exits 0.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- services/hq-worker boots pg-boss against HQ Neon (unpooled) and serves /healthz, mirroring services/worker (verified by typecheck + env unit test; /healthz contract identical for the Fly check).
- The Dockerfile bakes flyctl at a pinned version for BD2 provisioning (D-12).
- fly.toml configures gymos-hq-worker as an always-on worker with a /healthz check (edge-webhooks precedent).
- hq-worker holds NO studio credentials/connection strings (PII-up boundary) — enforced by the trimmed env schema + test.
- Workspace member; typecheck + tests pass without a dev server.
</verification>

<success_criteria>
HQ-FND-05 satisfied: a services/hq-worker Fly app skeleton exists (pg-boss against HQ Neon, /healthz), with flyctl baked into its image, ready to host the BD2 provisioning saga + scheduled jobs. The /healthz endpoint will respond 200 on its Fly deploy (operator runs fly deploy as the one-time setup step).
</success_criteria>

<output>
After completion, create `.planning/phases/BD1-hq-foundation/BD1-04-SUMMARY.md`
</output>
