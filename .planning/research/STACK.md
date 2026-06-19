# Stack Research — GymClassOS v2.0 (Self-Serve Platform + Two-Tier Brain/Dispatcher)

**Domain:** Operator HQ app + zero-touch provisioning + two-tier AI brain/dispatcher
**Researched:** 2026-06-19
**Confidence:** HIGH for provisioning clients (API docs verified); MEDIUM for Fly secrets workaround (community-confirmed); HIGH for template deps (direct codebase inspection)

> **Scope.** This file covers ONLY what is new or changed for v2.0. The base platform stack (React Router v7, Drizzle 0.45.x, Better-auth, Neon, pg-boss 12.x, Hono, Vercel, Fly.io, WhatsApp via MYÜTIK, Stripe, @anthropic-ai/sdk) is locked and not re-researched. Every table below labels NEW vs. ALREADY PRESENT. The goal is a complete, version-pinned answer to "what do we actually install?"

---

## The Single Most Important Finding

**Three new provisioning API clients are needed; everything else is already in the workspace.** The templates for Brain and Dispatch ship as forkable standard React Router v7 apps whose deps (Drizzle, Zod, TanStack Query, Radix, etc.) are already in the workspace. The one risky dependency is video/Remotion — it is NOT needed for v2.0 and should be explicitly excluded from `apps/hq`. pg-boss already supports cron scheduling with IANA timezones (proven pattern in `services/worker/src/queues/housekeeping.ts`). Fly secrets cannot be set via the Machines REST API (not GA); the provisioner must shell out to `flyctl`.

---

## New Dependencies by Category

### 1. Provisioning Clients

Three external API clients are needed to drive zero-touch provisioning from `apps/hq`. All three authenticate via bearer tokens stored as HQ env vars.

| Library | Version | Purpose | Auth model | Install in |
|---------|---------|---------|-----------|-----------|
| `@neondatabase/api-client` | `^10.x` (verify exact at install: `npm view @neondatabase/api-client version`) | Neon project CRUD — create project, create role, get connection URI | `NEON_API_KEY` header via `createApiClient({ apiKey })` | `apps/hq` |
| `@vercel/sdk` | `^1.27.0` (published 2026-06-16; verify at install) | Vercel project CRUD, env var management, deployment trigger, domain attach | `VERCEL_BEARER_TOKEN` via `new Vercel({ bearerToken })` | `apps/hq` |
| `execa` | `^9.x` | Shell out to `flyctl` for app create + secrets set (Machines API secrets are not GA — see PITFALLS) | N/A — wraps CLI that uses `FLY_API_TOKEN` env | `apps/hq` |

**Why `execa` instead of raw Node `child_process`:** It is promise-based, handles stderr/stdout streams, exposes exit codes cleanly, and prevents shell injection if you pass args as an array (use `execa('flyctl', ['secrets', 'set', '--app', appName, `KEY=${val}`])` — never template strings). Already a transitive dep in many workspaces; install explicitly to pin it.

**Why NOT a typed Fly TypeScript SDK:** There is no official Fly TypeScript SDK. The two community SDKs (`usedatabrew/fly-machines-sdk`, `supabase/fly-admin`) are unmaintained or scoped to Supabase's own use. The Machines REST API is fully documented and adequate for app/machine creation via `fetch`, but secrets management requires `flyctl` anyway, so `execa` + CLI is the consistent choice for all Fly provisioning steps.

#### Neon API: what it can do
- `POST /projects` — creates a new Neon project with `name`, `region_id`, `pg_version: 17`; returns project ID + connection URI
- `POST /projects/{id}/branches/{branchId}/roles` — creates a database role
- `GET /projects/{id}/connection_uri` — returns pooled + unpooled connection strings
- Response time: sub-second; Neon creates projects in under 1 second (confirmed in docs)
- Base URL: `https://console.neon.tech/api/v2`
- Auth: `Authorization: Bearer {NEON_API_KEY}`

#### Vercel SDK: what it can do
- `vercel.projects.createProject({ requestBody: { name, framework } })` — create a new Vercel project
- `vercel.projects.createProjectEnv({ idOrName, requestBody: [{ key, value, type, target }] })` — set env vars per environment (`production`, `preview`, `development`)
- `vercel.deployments.createDeployment({ requestBody: { name, gitSource: { type: 'github', repoId, ref } } })` — trigger a deployment from a git SHA/ref
- `vercel.projects.addProjectDomain({ idOrName, requestBody: { name: 'subdomain.gymclassos.com' } })` — attach a subdomain
- Auth: `Authorization: Bearer {VERCEL_BEARER_TOKEN}` — generate a long-lived token from Vercel account settings (not an OAuth flow); store as HQ secret

#### Fly provisioning via flyctl
The Machines REST API (`https://api.machines.dev/v1`) handles app creation (`POST /v1/apps`) and machine creation (`POST /v1/apps/{name}/machines`) via authenticated fetch. However, secrets cannot be set via that API (endpoints exist but are restricted to Fly KMS, not yet GA for general app secrets as of June 2026 — confirmed in community thread). The only supported programmatic secret-setting path is:

```
flyctl secrets set --app {appName} KEY=VALUE [KEY2=VALUE2 ...]
```

Use `execa('flyctl', ['secrets', 'set', '--app', appName, ...secretPairs], { env: { FLY_API_TOKEN } })` where `secretPairs` is an array of `KEY=VALUE` strings. `flyctl` must be installed on the machine running `apps/hq` (Vercel build container or a local runner — see PITFALLS).

For app creation and machine creation, use direct `fetch` against `api.machines.dev` — it is clean and does not require `execa`. Only secrets require the CLI detour.

Fly auth token: use `fly tokens create org -o {orgSlug} -x 999999h` to generate a long-lived org-scoped token and store it as `FLY_API_TOKEN` in HQ env. A deploy-scoped token (`fly tokens create deploy -a {appName}`) is scoped to a single existing app and cannot create new apps.

---

### 2. apps/hq Template Foundation

`apps/hq` is forked from `templates/dispatch` + `templates/brain` (copy-in, not a workspace reference). The Content and Video templates are consulted for the HQD feature (marketing content + video generation) but the Remotion rendering stack from Video is NOT added to `apps/hq` in v2.0.

#### What each template ships (verified by direct codebase inspection)

**`templates/dispatch`** — workspace control plane app
- Vault (workspace-wide secrets with per-app grants): `vault_secrets`, `vault_grants`, `vault_requests`, `vault_audit_log` tables
- Workspace resources (shared skills/instructions/agents/knowledge): `workspace_resources`, `workspace_resource_grants`
- Dispatch destinations (Slack/Telegram/WhatsApp thread refs): `dispatch_destinations`, `dispatch_identity_links`, `dispatch_link_tokens`
- Approval flow: `dispatch_approval_requests`, `dispatch_audit_events`
- "Dreams" (agent-driven insight proposals): `dispatch_dreams`, `dispatch_dream_proposals`
- Actions: `list-workspace-connections`, `upsert-workspace-connection`, `apply-workspace-connection-setup`, `set-workspace-connection-grant`, `list-dispatch-usage-metrics`
- The `@agent-native/dispatch` package (`packages/dispatch`) is the reusable library; the `templates/dispatch` app is the deployable shell that imports from it

**`templates/brain`** — company knowledge graph app
- Sources (Slack, GitHub, Granola, Clips, generic): `brain_sources`, `brain_source_shares`
- Raw captures (ingested text): `brain_raw_captures`
- Knowledge (reviewed, cited facts): `brain_knowledge`, `brain_knowledge_shares`
- Proposals (LLM-drafted knowledge, awaiting review): `brain_proposals`, `brain_proposal_shares`
- Sync runs: `brain_sync_runs`
- Ingest queue (in-Postgres distillation queue): `brain_ingest_queue`
- Text search only (no vector DB required in V1); agentic query expansion handles semantic retrieval
- Actions: full CRUD on sources/knowledge/proposals + distillation queue management + eval tooling

**`templates/content`** — Notion-like document editor
- Tiptap 3.x rich text with collaborative editing (Yjs + Y-WebSocket)
- Uses `@tailwindcss/typography` for prose rendering
- Relevant to HQD: copy in the document editor surface for marketing content generation
- Key extra deps vs. what's in the workspace: `@tiptap/core@^3.22.x`, all `@tiptap/*` extension packages, `yjs@^13.6.x`, `y-protocols@^1.0.x`, `prosemirror-markdown`, `tiptap-markdown`, `highlight.js`, `lowlight`, `@tailwindcss/typography`

**`templates/videos`** — Remotion animation studio
- Remotion `^4.0.434` + `@remotion/player` + `@remotion/transitions` — heavyweight renderer; requires a separate Remotion render cluster or Lambda for production rendering
- `@react-three/fiber` + `@react-three/drei` for 3D compositions
- `@agent-native/pinpoint` (the workspace analytics/observability package)
- **DO NOT add Remotion to `apps/hq` in v2.0.** See "What NOT to Add" below.

#### New packages needed for `apps/hq` that are NOT already in the workspace

| Package | Version | Why needed | Template source |
|---------|---------|------------|----------------|
| `@neondatabase/api-client` | `^10.x` | Provisioning: create Neon projects | New for hq |
| `@vercel/sdk` | `^1.27.0` | Provisioning: create Vercel projects + envs + deploys | New for hq |
| `execa` | `^9.x` | Provisioning: shell out to flyctl for secrets | New for hq |
| `@tiptap/core` | `^3.22.x` | HQD content editing surface (from content template) | content template |
| `@tiptap/extension-*` (starter-kit + specific extensions) | `^3.22.x` | Tiptap extensions for content editing | content template |
| `yjs` | `^13.6.x` | Collaborative editing (content template) — needed only if real-time collab is in v2.0 scope; can be deferred | content template |
| `@tailwindcss/typography` | `^0.5.x` | Prose rendering for generated content (already in some templates) | content template |

**Already present in the workspace (do NOT re-add):** `@agent-native/core`, `@agent-native/dispatch`, `drizzle-orm`, `h3`, `react`, `react-dom`, `react-router`, `vite`, `tailwindcss`, `zod`, `@tanstack/react-query`, `@tabler/icons-react`, `better-auth`, `@neondatabase/serverless`, `@anthropic-ai/sdk`, `nanoid`, `sonner`, `Radix UI primitives`, `shadcn/ui` (copy-in components).

---

### 3. Telemetry Push Pipeline

Each studio deploy pushes aggregate telemetry (token counts + engagement metrics) up to HQ on a schedule. No new infrastructure is needed.

| Component | Implementation | Why |
|-----------|---------------|-----|
| **Sender** (per-studio worker) | `pg-boss schedule` + plain `fetch` to HQ HTTPS endpoint | pg-boss 12.x already ships with `boss.schedule(name, cron, data, { tz })` — proven in production (`housekeeping.ts`); one cron job per studio, daily or hourly aggregation |
| **Auth** | Per-studio `TELEMETRY_TOKEN` (a secret set at provision time via `flyctl secrets set`); sent as `Authorization: Bearer` on each push | HQ verifies with a constant-time `crypto.timingSafeEqual` check; no JWT overhead needed for a server-to-server call |
| **Receiver** (HQ) | A new Hono route in `apps/hq` (or a React Router v7 action at a public path) that accepts `POST /api/telemetry`, verifies the token, writes to HQ Neon | No new framework; same Hono/RR v7 pattern |
| **Schema** (HQ Neon) | Two additive tables: `studio_installs` (one row per provisioned studio, holds `telemetry_token_hash`, metadata), `telemetry_events` (time-series rows: `studio_id`, `date`, `token_count_input`, `token_count_output`, `dau`, `wau`, `classes_booked`) | Token hash is stored; plain token lives only in the studio's Fly secrets. HQ never holds the plain token after provisioning |

No new npm packages are needed for telemetry. The sender is `fetch` + pg-boss cron. The receiver is standard Hono/RR v7 + Drizzle.

---

### 4. Recurring Scheduling for Heartbeat Campaigns

The gym-owner dispatcher (GOD) needs daily digest + daily heartbeat reactivation sends. These are per-studio, running in each studio's `services/worker`.

| Requirement | Solution | Rationale |
|-------------|---------|-----------|
| Daily owner digest at studio-configured time | `boss.schedule('owner-digest', cronExpr, {}, { tz: studioTimezone })` | pg-boss 12.x supports IANA timezone cron scheduling (`tz` option). Pattern verified in `housekeeping.ts` |
| Daily heartbeat reactivation (member sends) | `boss.schedule('heartbeat-reactivation', '0 9 * * *', {}, { tz: studioTz })` | Same mechanism; the worker job queries at-risk members and enqueues individual `outbound-whatsapp` jobs per member |
| Per-class reminders (existing) | Already implemented via `CLASS_REMINDER` queue | No change |
| Rate limiting on reactivation batch | `boss.send('outbound-whatsapp', payload, { startAfter: delayMs })` with spread delays per member | pg-boss `startAfter` option staggers sends without a separate rate-limiter |

**pg-boss is sufficient. No alternative queue library is needed.** The only constraint is that `boss.schedule()` is idempotent — calling it with the same name and different cron expression updates the schedule without error (pg-boss 12 confirmed behavior). The studio-specific timezone should be stored in HQ's `studio_installs` table and injected at provision time as a `STUDIO_TIMEZONE` Fly secret, which the worker reads on boot.

---

### 5. AI SDK Usage in apps/hq (Brain + Dispatcher)

`apps/hq` will run its own agent powered by the shared `ANTHROPIC_API_KEY`. No new AI SDK is needed.

| Component | Implementation | Notes |
|-----------|---------------|-------|
| HQ Brain agent | `@anthropic-ai/sdk` `^0.90.x` (already in `@agent-native/core`) | Brain template uses the same agent-chat infrastructure via `createAgentChatPlugin` |
| HQ Dispatcher agent | Same | Dispatch template is already wired to `createAgentChatPlugin` via `@agent-native/dispatch` |
| Token usage instrumentation (TEL) | Intercept Anthropic SDK response metadata (`usage.input_tokens`, `usage.output_tokens`) in the agent-chat plugin's response handler | Already surfaced in Anthropic SDK response objects; no additional SDK needed |

---

## Installation

```bash
# In apps/hq (new app, forked from dispatch+brain templates)
pnpm add @neondatabase/api-client @vercel/sdk execa

# Tiptap for HQD content editing (copy from content template pattern)
pnpm add @tiptap/core @tiptap/starter-kit @tiptap/react @tiptap/pm \
  @tiptap/extension-placeholder @tiptap/extension-link @tiptap/extension-image \
  @tiptap/extension-table @tiptap/extension-table-cell @tiptap/extension-table-header \
  @tiptap/extension-table-row @tiptap/extension-task-item @tiptap/extension-task-list \
  @tiptap/extension-bubble-menu @tiptap/extension-horizontal-rule \
  @tiptap/extension-code-block-lowlight @tailwindcss/typography highlight.js lowlight \
  prosemirror-markdown tiptap-markdown

# Only if real-time collab is in v2.0 scope (can defer):
# pnpm add yjs y-protocols @tiptap/extension-collaboration @tiptap/extension-collaboration-caret
```

```bash
# Fly token for provisioning — one-time setup, stored as HQ env var
fly tokens create org -o YOUR_ORG_SLUG -x 999999h
# → store output as VERCEL_BEARER_TOKEN equivalent: FLY_API_TOKEN in apps/hq env
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@neondatabase/api-client` | Raw `fetch` against `https://console.neon.tech/api/v2` | `api-client` ships full TypeScript types for all request/response shapes; raw fetch requires hand-typing everything; the SDK is thin and adds no runtime overhead |
| `@vercel/sdk` | Raw `fetch` against `https://api.vercel.com` | Vercel REST API shapes are complex; SDK reduces boilerplate for createProject + createProjectEnv + createDeployment + addProjectDomain; same auth model either way |
| `execa` for Fly secrets | `child_process.execFile` from Node stdlib | `execa` is promise-native, handles stderr properly, prevents shell injection via array args; execFile works but is callback-style and more error-prone |
| `execa` for Fly secrets | Fly Machines API secrets endpoint via `fetch` | Fly Machines API secrets endpoints are restricted to Fly KMS (not general app secrets) as of June 2026 — they return empty arrays even for existing secrets. CLI is the only working path. |
| pg-boss cron scheduling | External cron service (Railway Cron, Vercel Cron, etc.) | pg-boss is already running in every studio worker; adding an external cron adds a vendor + a billing relationship per studio. pg-boss cron is sub-minute-accurate enough for daily digest/heartbeat. |
| pg-boss cron scheduling | `node-cron` or `cron` npm package | pg-boss schedule is cluster-safe (only one machine fires per cron tick across replicas because Postgres provides the locking); raw cron packages fire on every replica |
| HQ as a separate Vercel deployment | HQ hosted on Fly | HQ is a React Router v7 SSR app — identical to `apps/staff-web`; Vercel hosting matches the existing pattern; Fly is for always-on workers, not SSR apps in this architecture |
| Forking content template for HQD | Building a new document editor from scratch | Content template already ships Tiptap 3.x + full extension set + collaboration; copying it avoids reinventing the editor |
| Deferring Remotion video rendering to post-v2.0 | Adding Remotion to apps/hq now | Remotion requires a render cluster or Lambda; adds significant ops complexity; the Video template's deps alone add 15+ packages; defer until the HQD use case is validated |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Remotion (`remotion`, `@remotion/player`, etc.)** | Requires a separate render cluster or Remotion Lambda for production use; not needed for v2.0 HQD which focuses on text content + AI-generated copy, not animated video | Defer to v2.1 when video generation is validated as a real feature; the Video template can be forked then |
| **`@react-three/fiber` / `@react-three/drei`** | Part of the Video template; not needed for any v2.0 feature | Not applicable in v2.0 |
| **`y-websocket` / real-time collab in `apps/hq`** | HQ is single super-admin in v2.0; no concurrent editors means Yjs is unnecessary overhead | Single-user content editing with Tiptap works fine without Yjs; add Yjs if/when HQ becomes multi-user |
| **Inngest / Trigger.dev for provisioning workflows** | Adds a third-party SaaS vendor; provisioning is a short sequential workflow (10–15 steps), not a long multi-day workflow; pg-boss job + retry handles idempotent retries at the required scale | pg-boss `send` with retry count for each provisioning step; HQ tracks the step in a `provisioning_runs` table |
| **Separate Redis / BullMQ for HQ** | HQ has a small, predictable job load (provisioning runs + telemetry ingestion); Neon + pg-boss is sufficient and consistent with the existing architecture decision | pg-boss on HQ Neon (same pattern as studio workers) |
| **Multi-tenant `studio_id` columns in any table** | Locked by architecture decision — single-tenant code, multi-tenant deploy. HQ identifies studios by `studio_installs.id` (a HQ-internal record), not by injecting an ID into studio Neons | One Neon project per studio; HQ has its own Neon; no cross-database queries |
| **Fly GraphQL API for provisioning** | Underdocumented; community reports inconsistency; the Machines REST API + flyctl CLI covers all provisioning needs without the GraphQL overhead | Machines REST API (`fetch` to `api.machines.dev`) for app/machine creation; `flyctl` (via `execa`) for secrets |
| **Vercel Deploy Hooks / webhooks as the deploy trigger** | Deploy Hooks do not support passing env vars or git SHAs; the SDK's `createDeployment` gives full control over what deploys | `vercel.deployments.createDeployment()` from the SDK |
| **`@agent-native/dispatch` workspace package as a direct dep of `apps/hq`** | It is already a dep — `templates/dispatch` already declares `"@agent-native/dispatch": "workspace:*"`. Copying the template into `apps/hq` preserves this dep. Do not re-add it as a new dep. | Fork `templates/dispatch` into `apps/hq` following the same fork-boundary pattern as `apps/staff-web` |
| **Stripe in `apps/hq`** | HQ does not process payments; payments live in per-studio deploys | No Stripe dep in `apps/hq` |

---

## Stack Patterns for v2.0 Apps

### apps/hq (new)

- Fork base: `templates/dispatch` (for vault, integrations, approval flow, workspace resources) + `templates/brain` (for knowledge graph/distillation surfaces) + feature directories from `templates/content` (for HQD content editing)
- New features in `apps/hq/features/provisioning/` (the provisioner orchestrator), `apps/hq/features/telemetry/` (HQ telemetry ingestion + HQB cohort views)
- Auth: single super-admin Better-auth login (email/password); no org model in v2.0
- DB: its own Neon project (`gymos-hq`); schema = framework tables + dispatch tables + brain tables + new `studio_installs` + `provisioning_runs` + `telemetry_events`
- Deployment: Vercel (same adapter as `apps/staff-web`: `@vercel/react-router`)
- The provisioning orchestrator runs as an HQ server action (not a background worker) for v2.0; if provisioning needs to be async later, move to pg-boss job on HQ's own Neon

### services/worker additions (per-studio)

- New pg-boss queues: `owner-digest`, `heartbeat-reactivation`
- New action: `GOD` (gym-owner dispatcher) logic that reads GOB brain state + sends via existing `outbound-whatsapp` chokepoint
- New action: `GOB` brain update (called by agent when studio data changes — classes, brand)
- Telemetry cron: new pg-boss schedule `telemetry-push` (daily or hourly) that aggregates and POSTs to HQ

### Provisioning idempotency pattern

Track each provisioning step as a row in HQ's `provisioning_runs` table (`step_name`, `status: pending|complete|failed`, `output_json`). On retry, skip steps with `status='complete'`. This gives idempotent retries without needing Inngest or a saga framework.

```typescript
// Pattern in apps/hq/features/provisioning/run-step.ts
async function runStep(runId: string, stepName: string, fn: () => Promise<unknown>) {
  const existing = await db.query.provisioningRunSteps.findFirst({
    where: and(eq(t.runId, runId), eq(t.stepName, stepName), eq(t.status, 'complete'))
  });
  if (existing) return existing.outputJson; // idempotent skip
  const output = await fn();
  await db.insert(t).values({ runId, stepName, status: 'complete', outputJson: output });
  return output;
}
```

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@neondatabase/api-client` latest | Node 22+ | HQ runs on Vercel (Node 20 LTS in Vercel's default runtime — verify; if needed, set `nodeVersion: 22` in `vercel.json`) |
| `@vercel/sdk@1.27.x` | ESM only | Matches the `"type": "module"` pattern in all workspace apps |
| `execa@9.x` | ESM only, Node 18+ | Must use `import { execa } from 'execa'`; CommonJS is not supported |
| `@tiptap/core@3.22.x` | React 19.x, Vite 8.x | Content template already verified on this combo |
| `pg-boss@12.18.x` | Neon Postgres 16/17 | Confirmed: `pgboss.*` schema auto-migrated on `boss.start()`; works on Neon WebSocket driver |
| `@agent-native/dispatch@0.8.x` | `@agent-native/core@>=0.8.0`, React 18+/19+ | Verified in `packages/dispatch/package.json` peerDeps |
| `better-auth@1.6.x` | React Router v7 + H3 | Same combo used by `apps/staff-web` and all templates |
| Fly Machines API `api.machines.dev` | `flyctl` latest | App creation via REST; secrets via flyctl; both require `FLY_API_TOKEN` |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|-----------|-------|
| Neon API client (`@neondatabase/api-client`) | HIGH | Official Neon docs; verified endpoint shapes; auth model documented |
| Vercel SDK (`@vercel/sdk`) | HIGH | Official SDK docs + GitHub repo verified; version 1.27.0 confirmed (npm, 2026-06-16) |
| Fly app/machine creation via Machines REST API | HIGH | Official Machines API docs; endpoint shape for `POST /v1/apps` + `POST /v1/apps/{name}/machines` confirmed |
| Fly secrets via flyctl (not REST API) | MEDIUM–HIGH | REST API secrets are NOT GA (community-confirmed June 2026); flyctl CLI path is the only working option; requires flyctl installed in provisioner runtime |
| `execa` for flyctl subprocess | HIGH | Standard Node.js pattern; well-maintained package; array-arg form prevents injection |
| pg-boss cron for heartbeat/digest scheduling | HIGH | Pattern proven in production in `services/worker/src/queues/housekeeping.ts`; pg-boss 12.18.x in worker's package.json |
| Brain template deps | HIGH | Direct inspection of `templates/brain/package.json` and `server/db/schema.ts` |
| Dispatch template deps | HIGH | Direct inspection of `templates/dispatch/package.json` and `packages/dispatch/src/db/schema.ts` |
| Content template deps (Tiptap 3.x) | HIGH | Direct inspection of `templates/content/package.json` |
| Remotion exclusion | HIGH | Direct inspection of `templates/videos/package.json`; render cluster requirement documented |
| Telemetry push (pg-boss + fetch) | HIGH | Uses only existing primitives; no new tech risk |

---

## Sources

- `templates/dispatch/package.json` + `packages/dispatch/src/db/schema.ts` — dispatch template deps and schema (direct inspection, 2026-06-19)
- `templates/brain/package.json` + `templates/brain/server/db/schema.ts` — brain template deps and schema (direct inspection, 2026-06-19)
- `templates/content/package.json` — content template Tiptap 3.x + Yjs deps (direct inspection, 2026-06-19)
- `templates/videos/package.json` — Remotion 4.x dep list; excluded from v2.0 (direct inspection, 2026-06-19)
- `services/worker/src/queues/housekeeping.ts` — production pg-boss `boss.schedule()` + `boss.work()` cron pattern (direct inspection, 2026-06-19)
- `services/worker/package.json` — pg-boss `^12.18.0`, execa not yet present (direct inspection, 2026-06-19)
- [Neon TypeScript SDK docs](https://neon.com/docs/reference/typescript-sdk) — `@neondatabase/api-client`, `createProject()`, `createProjectBranchRole()`, `getConnectionUri()`, auth model
- [Neon Create Project API](https://api-docs.neon.tech/reference/createproject) — `region_id`, `pg_version: 17`, response shape
- [Vercel SDK GitHub repo](https://github.com/vercel/sdk) — `@vercel/sdk`, `new Vercel({ bearerToken })`, `vercel.projects.createProject()`, `createProjectEnv()`, `createDeployment()`, `addProjectDomain()` — version 1.27.0 confirmed
- [Fly Apps Resource API](https://fly.io/docs/machines/api/apps-resource/) — `POST /v1/apps`, `org_slug`, bearer token auth
- [Fly Machines Resource API](https://fly.io/docs/machines/api/machines-resource/) — `POST /v1/apps/{name}/machines`, `config.image`, `config.env`, `config.guest`
- [Fly Machines API secrets — community thread](https://community.fly.io/t/manage-secrets-via-machines-api/24845) — confirmed: REST secrets endpoints return empty arrays; restricted to Fly KMS (not GA for general secrets)
- [Fly tokens docs](https://fly.io/docs/flyctl/tokens-create-deploy/) — deploy token scope; org token (`fly tokens create org`) for provisioning cross-app
- [pg-boss cron scheduling (DeepWiki)](https://deepwiki.com/timgit/pg-boss/10.1-cron-based-scheduling) — `boss.schedule(name, cron, data, { tz })` signature; IANA timezone support confirmed; pg-boss 12.18.x

---

*Stack research for: GymClassOS v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher*
*Researched: 2026-06-19*
*Confidence: HIGH overall — provisioning APIs verified against official docs; template deps from direct codebase inspection; one MEDIUM item (Fly secrets via CLI workaround)*
