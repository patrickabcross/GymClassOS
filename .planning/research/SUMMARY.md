# Project Research Summary

**Project:** GymClassOS v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher
**Domain:** Multi-cloud SaaS operator control plane + per-customer AI agent deployment
**Researched:** 2026-06-19
**Confidence:** HIGH overall (framework layer, PII controls, pitfall patterns); MEDIUM for provisioning API runtime behaviour

> Prior research summary (v1.2 Agentic Tab Editing) archived as SUMMARY-v1.0-archived.md.

---

## Executive Summary
GymClassOS v2.0 introduces three qualitatively new things on top of the shipped v1 foundation: (1) an operator HQ control plane (apps/hq) sitting above all per-studio deployments, (2) zero-touch self-serve provisioning that orchestrates three external cloud APIs in sequence, and (3) a two-tier brain/dispatcher where both the operator and each gym-owner get their own AI knowledge base and outbound communication engine. The research converges on a clean four-phase delivery sequence under the BD prefix. All four researchers agree on the phase grouping: BD1 (HQ Foundation) -> BD2 (Telemetry + Provisioning) -> BD3 (HQ Brain + Dispatcher) -> BD4 (Studio Brain + Dispatcher).

The dominant architectural decision confirmed across all four research files is that provisioning must run in a dedicated Fly worker (services/hq-worker), not in a Vercel serverless function. The 8-step saga exceeds Vercel's 300-second timeout and requires idempotent per-step retry that Vercel functions cannot provide. A provisioning_runs state-machine table in HQ Neon drives forward steps and LIFO-ordered rollback compensations. This is the highest-risk deliverable and must be tackled early in BD2, with rollback code written before the happy path is shipped. The three new dependencies are @neondatabase/api-client, @vercel/sdk, and execa (for shelling out to flyctl, since Fly's REST API does not support secrets management as of June 2026).

The second structural constraint is the PII-up boundary: member data must never reach HQ Neon, structurally rather than by policy. HQ has no studio DB credentials. The telemetry payload is enforced by a Zod .strict() schema at the HQ ingest endpoint, any extra field causes a 422. The ai_token_usage table at the studio level stores only counts, never prompt content or session references. A CI guard blocks any HQ schema migration that adds columns named *connection*, *database_url*, or *dsn*. These three mechanisms (no credentials, strict schema, CI guard) are non-negotiable and must ship together in BD1/BD2. The HQ Dispatcher also requires its own separate WhatsApp Business Account. Reusing a studio WABA for B2B owner communications is a Meta compliance violation confirmed by all four research streams.

---

## Key Findings

### Recommended Stack

The base stack (React Router v7, Drizzle 0.45.x, Better-auth, Neon, pg-boss 12.x, Hono, Vercel, Fly.io, Anthropic SDK) is locked and unchanged. v2.0 adds exactly three new packages to apps/hq. Everything else is already present in the pnpm workspace and requires copy-in discipline rather than new installs.

**New v2.0 dependencies (install in apps/hq only):**
- @neondatabase/api-client ^10.x: typed Neon Management API client; creates/deletes Neon projects; returns connection URIs
- @vercel/sdk ^1.27.0 (published 2026-06-16; verify at install): creates Vercel projects, sets env vars, triggers deployments, attaches domains; ESM only
- execa ^9.x: promise-native subprocess wrapper for flyctl secrets set; use array-arg form to prevent shell injection; ESM only, Node 18+

**Critical version and runtime notes:**
- Fly secrets CANNOT be set via the Machines REST API (restricted to Fly KMS, not GA for general secrets as of June 2026). flyctl CLI is the only working path. The provisioner must be a Fly machine where flyctl is installed in the container.
- Use an org-scoped Fly token (fly tokens create org -o slug -x 999999h), not a deploy-scoped token. Deploy tokens cannot create new apps.
- Tiptap 3.x (@tiptap/core ^3.22.x) and @tailwindcss/typography needed for HQD content editing; copy from templates/content/ pattern.
- Remotion must NOT be added to apps/hq in v2.0. Requires a separate render cluster and adds 15+ heavyweight packages.
- pg-boss 12.x cron scheduling with IANA timezone support is already proven in production (housekeeping.ts). No alternative queue library needed.
- No Redis, no BullMQ for HQ. pg-boss on HQ Neon is sufficient.

**Explicitly excluded from v2.0:** Remotion, @react-three/fiber, y-websocket in apps/hq, studio_id columns anywhere, Inngest/Trigger.dev for provisioning.

### Expected Features

Research identifies seven requirement categories (HQ-FND, PROV, TEL, HQB, HQD, GOB, GOD).

**Must ship for v2.0 launch:**
- HQ-FND: apps/hq shell with HQ Neon + Better-auth super-admin + HQ org seed row (so accessFilter returns data, not empty results)
- PROV: 8-step saga with LIFO rollback; slug UNIQUE constraint as first DB write; email-verification gate; watchdog alert on stuck jobs; telemetry token at Step 7; per-studio Better Stack log space as a provisioning step
- TEL: TelemetrySnapshot Zod strict schema; studio singleton accumulator; daily push cron; last_telemetry_received_at on HQ studios (prevents false at-risk from push failures)
- HQB: Health score from TEL data; cohort segmentation; at-risk list with last_telemetry_received_at exclusion
- HQD: Onboarding nudge sequence to owners via HQ WABA (never studio WABA); Meta-approved templates with 2-7 day lead time before HQD can send
- GOB: Brain shell in staff-web; class catalog auto-ingestion; brand voice document
- GOD: Dormant member detection; heartbeat via existing unchanged chokepoint; suppression table (3-attempt/90-day); daily owner digest (propose->approve); whatsapp_opt_out_immediate sync write

**Defer to v2.x:** GOD time-of-day personalisation + three-attempt cadence; HQD AI-generated Content + Video; PROV custom domain support; GOB auto brain re-index.

**Defer to v3+:** Multi-channel member campaigns; self-service billing; multi-user HQ; ML-based health scoring.

### Architecture Approach

The architecture is a strict three-tier topology: Tier 1 (operator HQ: one Vercel deploy + one Fly hq-worker), Tier 2 (per-studio: one Vercel staff-web + one Fly worker), Tier 3 (gym members via existing mobile + WhatsApp). The only cross-tier data flow is Studio -> HQ telemetry push over HTTPS (aggregate data only, no PII). HQ cannot reach studio Neons — structurally prevented by the absence of studio DB credentials in HQ environment.

**Major new components:**

1. apps/hq (Vercel): operator control plane with own Neon, own Better-auth, own agent-chat; forked from Dispatch + Brain + Content + Video templates (copy-out only, templates/ untouched)
2. packages/hq-schema (pnpm workspace): Drizzle schema for HQ Neon (hq_studios, hq_provisioning_runs, hq_studio_tokens, hq_telemetry_snapshots, hq_token_usage); exports TelemetrySnapshot Zod schema shared with worker
3. services/hq-worker (Fly, new app): pg-boss against HQ Neon; provision-studio saga + brain-ingest queue; holds NEON_API_KEY, VERCEL_API_TOKEN, FLY_API_TOKEN; flyctl installed in container
4. apps/staff-web/server/lib/anthropic.ts (new): wraps anthropic.messages.create; intercepts response.usage.*; calls accumulator on studio_telemetry_state singleton; exact call-site needs BD1 audit of createAgentChatPlugin internals
5. services/worker (per-studio, extended): 3 new pg-boss cron queues: telemetry-push (02:00 UTC), daily-owner-digest (06:00 studio-tz), heartbeat-reactivate (09:00 studio-tz); all GOD sends flow through unchanged sendMessage chokepoint
6. apps/staff-web/app/routes/gymos.brain.tsx + Brain action copies: GOB studio knowledge base + ask-brain tool in staff agent

**Key patterns:**
- Provisioning: 8-step saga; step_N_at timestamps as idempotency markers; Neon 409 -> read existing ID; Vercel 409 -> fetch by name; Fly 400 -> treat as success
- Telemetry ingest: sha256(token) lookup -> TelemetrySnapshot.strict().parse(body) -> upsert -> enqueue brain-ingest
- GOD: query at-risk members -> INSERT messages -> enqueue outbound-whatsapp -> chokepoint handles the rest (UNCHANGED, sendMessage.ts not modified)
- HQ org seed in runMigrations so accessFilter has an orgId from first boot
- Fork boundary: two-commit sequence (copy first, modify second); git diff upstream/main HEAD -- templates/ must return empty after both commits

### Critical Pitfalls

1. **Non-idempotent provisioning creates orphaned cloud resources (P-01, CRITICAL):** Neon POST /projects has no idempotency key; every retry creates a new project. Prevention: check GET /projects for existing project by name before creating; write step_N_at before API call; build LIFO rollback before the happy path.

2. **Partial failure leaves mismatched resources (P-02, CRITICAL):** Neon + Vercel succeed but Fly times out; studio appears provisioned but worker never started. Prevention: every step registers its rollback_action; rollback_provisioning_run executes compensations in reverse; use direct Vercel deploy URL (not subdomain) for healthchecks to avoid DNS propagation false-rollbacks.

3. **Telemetry payload carries PII via insufficiently scoped queries (T-01, CRITICAL):** aggregate query returns GROUP BY coach_id or a debug field. Prevention: TelemetrySnapshot.strict().parse(body) at HQ ingest (422 on unknown fields); no names, emails, phones, IDs, or free-text in schema; ai_token_usage table has no prompt or session columns; Vitest test asserts member_email field returns 422.

4. **HQ receives studio DB credentials (T-03, CRITICAL):** storing Neon connection string in HQ studios lets HQ query member data. Prevention: HQ studios stores only provider resource IDs (neon_project_id, vercel_project_id, fly_app_name), never connection strings; CI guard fails build if HQ schema contains *connection*, *database_url*, or *dsn* columns.

5. **HQ Dispatcher routes owner messages through studio WABAs (W-03, CRITICAL):** reusing studio send path for B2B owner communications is a Meta compliance violation. Prevention: HQD uses a completely separate WABA registered to GymClassOS business account; no HQD code references services/worker or services/edge-webhooks; owner opt-ins in HQ Neon hq_whatsapp_opt_in.

6. **HQ Brain + Dispatch return empty due to missing org seed (F-02, HIGH):** accessFilter scopes to orgId; with no HQ org, every query returns zero rows. Prevention: create fixed HQ org + super-admin row in runMigrations; do not replace accessFilter with allow-unscoped.

7. **Anthropic token instrumentation call-site not confirmed (MEDIUM, BD1 audit required):** createAgentChatPlugin internals must be audited in BD1 to confirm the wrapper intercepts every Anthropic call path.

---

## Implications for Roadmap

Based on combined research, all four researchers converged on a four-phase BD-prefixed structure. The ordering is driven by hard dependency chains: HQ foundation first; provisioning (highest-risk) early in BD2; HQ Brain/Dispatcher need telemetry flowing; studio-side additions close the milestone.

### Phase BD1: HQ Foundation

**Rationale:** apps/hq, HQ Neon, and services/hq-worker are the substrate all other phases build on. PII boundary controls (CI guard, HQ org seed) must exist before any other work touches HQ.

**Delivers:**
- apps/hq scaffolded from Dispatch + Brain + Content template copies (templates/ untouched, two-commit discipline)
- packages/hq-schema with all HQ table definitions
- services/hq-worker skeleton (pg-boss boot, env.ts, healthz on port 3003)
- HQ Neon provisioned manually; runMigrations seeds HQ org + super-admin row
- Single super-admin Better-auth login with email allowlist
- CI guards: fork boundary + HQ schema (*connection*/*database_url*/*dsn* column names blocked)
- BD1 audit of createAgentChatPlugin to identify exact Anthropic SDK call-site for token wrapper
- pnpm-workspace.yaml updated with packages/hq-schema and services/hq-worker

**Pitfalls addressed:** T-03 (CI guard), F-01 (fork boundary), F-02 (org seed), Anthropic call-site audit
**Research flag:** Standard — identical patterns to apps/staff-web already in production. Skip research-phase.

### Phase BD2: Telemetry + Provisioning

**Rationale:** TEL and PROV are independent of each other (both depend only on BD1) and run as parallel plans within one phase. PROV is the highest-risk deliverable — ship early to discover API gotchas. Rollback code ships before happy-path code.

**Delivers (TEL plan):**
- TelemetrySnapshot Zod strict schema in packages/hq-schema/src/telemetry.ts
- studio_telemetry_state singleton table + additive migration
- apps/staff-web/server/lib/anthropic.ts wrapper + telemetry-accumulator.ts (call-site determined in BD1)
- services/worker/queues/telemetry-push.ts (02:00 UTC cron, pg-boss retry with backoff)
- HQ ingest endpoint (POST /api/telemetry: sha256 token auth -> strict parse -> upsert)
- last_telemetry_received_at column on hq_studios
- Vitest test: member_email field in telemetry payload -> 422

**Delivers (PROV plan):**
- Saga state machine (services/hq-worker/src/queues/provision-studio.ts) with all 8 steps + LIFO rollback registered per step
- provision-apis/ wrappers: neon.ts, vercel.ts, fly.ts
- Public signup endpoint with slug UNIQUE constraint as first DB write (slug race prevention)
- Email-verification gate before provisioning enqueues
- Watchdog job (every 5 min) alerting on stuck/failed provisioning jobs; operator email alert on failure
- Per-studio Better Stack log space as a provisioning step
- Provisioning healthcheck uses direct Vercel deploy URL, not subdomain (avoids DNS propagation false-rollbacks)
- Fly auto_stop_machines = stop in fly.toml template for edge-webhooks; Fly org budget alerts configured

**Pitfalls addressed:** P-01 through P-06, T-01, T-02, T-04, O-01, O-03, O-04
**Research flag:** PROV plan needs /gsd:research-phase for: (a) Fly machine deploy sequencing and flyctl secrets set timing relative to machine creation; (b) Vercel async deployment polling with @vercel/sdk 1.27.0; (c) Neon 409 error response body shape for idempotent step-1. TEL plan is standard — skip research-phase for TEL.

### Phase BD3: HQ Brain + Dispatcher

**Rationale:** HQB needs BD2 telemetry snapshots flowing. HQD can overlap (depends only on BD1) but HQ WABA Meta-approved templates must be submitted at BD2 completion (2-7 day lead time). Both run as parallel plans within one phase.

**Delivers (HQB plan):**
- Brain template action copies in apps/hq/actions/brain-*.ts; Brain route in apps/hq/app/routes/hq.brain.tsx
- brain-ingest pg-boss queue in services/hq-worker
- HQB system prompt in HQ agent-chat; list-at-risk-studios agent action
- Health score from TEL data; cohort segmentation (new/activating/healthy/at-risk)
- last_telemetry_received_at exclusion in at-risk queries (false-positive prevention)
- Brain source allowlist (GymClassOS internal docs + HQ telemetry aggregate only); CSV upload rejection (email/phone/name/member column names blocked)

**Delivers (HQD plan):**
- Dispatch template action copies; Dispatch route in apps/hq/app/routes/hq.dispatch.tsx
- HQD system prompt constraint: never reference member PII, never send about specific members
- HQ WABA credentials stored in HQ Neon vault (separate from any studio WABA)
- Owner opt-in captured at signup, stored in HQ hq_whatsapp_opt_in
- Onboarding nudge sequence (day 1/3/7/14) as pg-boss jobs scheduled at provisioning time
- Meta-approved templates for owner-comms on HQ WABA (calendar prerequisite: submit at BD2 completion)
- Content editing surface: apps/hq/app/routes/hq.content.tsx; @tiptap/core ^3.22.x + extensions + @tailwindcss/typography installed

**Pitfalls addressed:** W-03 (HQ WABA separation), W-04 (Meta template approval lead time), F-03 (Brain PII ingestion guard), O-02 (telemetry gap -> false at-risk)
**Research flag:** HQD plan needs /gsd:research-phase to confirm HQ WABA second phone number registration in Meta Business Manager. HQB plan is standard — skip research-phase for HQB.

### Phase BD4: Studio Brain + Dispatcher

**Rationale:** GOB and GOD are additive to the per-studio deploy. Both depend on BD1 (fork boundary) and BD2 (anthropic.ts wrapper; PROV seeds studio_owner_config). GOD reuses the existing sendMessage chokepoint without modification — lowest risk of all four phases. Run as parallel plans.

**Delivers (GOB plan):**
- apps/staff-web/app/routes/gymos.brain.tsx (Brain template copy)
- apps/staff-web/actions/brain-*.ts (action copies, brain- prefixed to avoid collisions)
- Brain template tables additive migration (brain_sources, brain_raw_captures, brain_knowledge, brain_proposals, brain_sync_runs, brain_ingest_queue)
- ask-brain tool in staff agent; GOB section in agent-chat.ts system prompt
- Class catalog auto-ingested from class_definitions on Brain init; brand voice document UI

**Delivers (GOD plan):**
- studio_owner_config additive migration (owner phone, timezone, digest/heartbeat toggles, batch size)
- services/worker/queues/daily-owner-digest.ts (06:00 studio-tz cron; propose->approve flow)
- services/worker/queues/heartbeat-reactivate.ts (09:00 studio-tz cron; staggered: 09:00 + hash(studio_id) % 60min to avoid send storms)
- heartbeat_sends table (attempt tracking); heartbeat_suppression table (3-attempt/90-day)
- whatsapp_opt_out_immediate synchronous write in opt-out webhook handler (race-free opt-out)
- member_reactivation and owner_daily_digest WhatsApp templates with meta_approval_status check; campaigns blocked if not approved; submit templates at BD3 completion
- All GOD sends: INSERT messages -> enqueue outbound-whatsapp -> unchanged sendMessage chokepoint (sendMessage.ts NOT modified)

**Pitfalls addressed:** W-01 (whatsapp_opt_out_immediate sync write), W-02 (staggered heartbeat start times), W-04 (GOD template approval gate in campaign runner)
**Research flag:** Standard — GOB is a direct Brain template copy-in; GOD reuses proven pg-boss + chokepoint patterns. Skip research-phase.

### Phase Ordering Rationale

- BD1 before all: HQ app + HQ Neon + hq-worker skeleton are prerequisites for everything; HQ org seed is prerequisite for BD3 Brain/Dispatch to return data
- BD2 before BD3: HQB needs real telemetry snapshots; PROV must validate API sequences early (failure modes expensive to discover late); PROV seeds studio_owner_config that GOD (BD4) reads
- BD2 TEL anthropic.ts wrapper must be in place before BD4 GOD instrumentation works correctly
- BD3 and BD4 can technically overlap (no cross-dependency) but HQD templates submit at BD2 completion, GOD templates at BD3 completion — each gets 2-7 day approval runway
- HQD video generation (Remotion) deferred to v2.x — HQD in BD3 covers onboarding nudges and owner-comms only

### Research Flags

**Needs /gsd:research-phase during planning:**
- BD2 PROV plan: Fly machine deploy sequencing (flyctl secrets set timing vs. machine creation; machine-is-serving polling pattern); Vercel async deployment polling with @vercel/sdk 1.27.0; Neon 409 response body shape for idempotent step-1.
- BD3 HQD plan: HQ WABA second phone number registration in Meta Business Manager; confirm dispatchDestinations table format for gym-owner contact info.

**Standard patterns, skip research-phase:**
- BD1: React Router v7 scaffold + Better-auth + Drizzle migrations — identical to production apps/staff-web.
- BD2 TEL plan: TelemetrySnapshot Zod schema, pg-boss cron push, HQ ingest endpoint — standard patterns already in codebase.
- BD3 HQB plan: Brain template copy-in and action wiring — identical fork-boundary discipline already used.
- BD4 GOB + GOD: Additive Brain copy-in + pg-boss queue additions — entirely within existing codebase conventions.

### Cross-Cutting Watch-Out Items (Milestone-Level)

1. Provisioning idempotency and rollback before happy path: state machine schema and rollback function ship in BD2 before any real API calls are wired. Test by deliberately failing at each step in a staging environment.
2. HQ org seed for accessFilter: confirm in BD1 that Brain and Dispatch return content (not empty) when logged in as super-admin. This is the canary for all BD3 functionality.
3. Watchdog and alerting for unattended systems: BD2 PROV watchdog job (stuck provisioning) and studio worker heartbeat mechanism (Pitfall O-04) must ship with the respective systems, not as post-launch hardening.
4. Token-usage instrumentation call-site audit (BD1): confirm exactly where createAgentChatPlugin calls the Anthropic SDK so the anthropic.ts wrapper intercepts every call. This audit gates the TEL plan in BD2.
5. Meta template approval lead times: HQD owner-comms templates submit at BD2 completion (2-7 day wait before BD3 HQD goes live). GOD member reactivation templates submit at BD3 completion (2-7 day wait before BD4 GOD goes live). Calendar dependencies, not engineering tasks.
6. B2B / B2C WABA split: HQ owns its own WABA for owner-comms; per-studio WABA is for member-comms only. Structural (different env scopes) + system prompt constraint in HQD. Never mixed.
7. Fly secrets via flyctl subprocess: services/hq-worker Dockerfile must include flyctl. Decide base image and version pinning in BD2 PROV planning.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (new deps) | HIGH | @neondatabase/api-client, @vercel/sdk, execa verified via official docs; Fly secrets via CLI confirmed by community thread (June 2026) |
| Stack (base platform) | HIGH | All base stack deps verified by direct repo inspection |
| Features (HQ-FND, TEL, HQB, GOB) | HIGH | Directly maps to existing agent-native template capabilities; additive patterns well-understood |
| Features (PROV) | MEDIUM | API capabilities confirmed; exact runtime sequencing (Fly deploy timing, Vercel async polling) unverified in prod |
| Features (HQD, GOD) | HIGH | Meta compliance pattern well-understood; GOD reuses existing chokepoint; HQD WABA separation is clear |
| Architecture (component topology) | HIGH | From direct codebase inspection; all components located, file paths confirmed |
| Architecture (provisioning saga) | MEDIUM | Saga pattern correct; individual API idempotency contracts (Neon 409 body, Vercel 409 fetch-by-name, Fly 400) need validation in BD2 |
| Architecture (Anthropic wrapper call-site) | MEDIUM | response.usage.* fields documented and stable; exact integration point in createAgentChatPlugin needs BD1 audit |
| Pitfalls | HIGH | CRITICAL pitfalls derived from direct PROJECT.md constraints + verified provider API behaviour; not inference |

**Overall confidence: HIGH** — architecture is clear, phase ordering is unambiguous, critical risks are identified with concrete prevention steps. The two MEDIUM items (provisioning API runtime behaviour, Anthropic call-site) are bounded and addressable in BD1/BD2 planning.

### Gaps to Address

- Fly machine image for provisioner: services/hq-worker Dockerfile must include flyctl. Exact base image and version pinning to decide in BD2 PROV planning.
- Vercel SDK createDeployment async polling: exact SDK method and recommended poll interval for status: complete should be validated against a test project in BD2 before it is in the saga.
- HQ WABA registration procedure: Meta Business Manager setup steps for a second phone number under GymClassOS account are not detailed. Resolve before BD3 HQD planning.
- GOD template content: member_reactivation and owner_daily_digest template text must be drafted and submitted for Meta approval. Content work, not engineering, but it gates BD4 GOD. Draft at BD3 completion.
- Neon 409 response body shape: assumed to include project_id in the error response body. Confirm against Neon API docs before writing saga step-1 idempotency code.

---

## Sources

### Primary (HIGH confidence)

- Direct inspection of C:/Users/dimet/hustle working tree on master (2026-06-19): apps/staff-web/server/db/schema.ts, services/worker/src/index.ts, services/worker/src/queues/outbound-whatsapp.ts, services/worker/src/domain/sendMessage.ts, services/worker/src/queues/housekeeping.ts, services/worker/src/lib/env.ts, packages/queue/src/types.ts, templates/brain/server/db/schema.ts, templates/dispatch/server/db/schema.ts, templates/content/package.json, templates/videos/package.json, apps/staff-web/server/plugins/agent-chat.ts, pnpm-workspace.yaml
- Neon Management API reference (api-docs.neon.tech/reference/createproject) — endpoint shape, region IDs, pg_version
- Neon TypeScript SDK docs (neon.com/docs/reference/typescript-sdk) — @neondatabase/api-client, createApiClient, project CRUD
- Vercel SDK GitHub repo (github.com/vercel/sdk) — @vercel/sdk 1.27.0 (2026-06-16); new Vercel({ bearerToken }); createProject, createProjectEnv, createDeployment, addProjectDomain
- Fly Machines API docs (fly.io/docs/machines/api/) — POST /v1/apps, POST /v1/apps/{name}/machines, bearer token auth
- Fly community thread — REST API secrets endpoints confirmed restricted to Fly KMS (June 2026); flyctl secrets set is the only working path
- Fly tokens docs (fly.io/docs/flyctl/tokens-create-deploy/) — org-scoped token required for cross-app provisioning
- Anthropic TypeScript SDK docs — response.usage.input_tokens, response.usage.output_tokens documented and stable
- pg-boss v12 cron scheduling (DeepWiki) — boss.schedule(name, cron, data, { tz }), IANA timezone support; proven in services/worker/src/queues/housekeeping.ts
- Meta WhatsApp Cloud API docs — template approval timeline (24-72h); template_not_approved error; per-WABA rate limits; opt-in requirements
- .planning/PROJECT.md — all locked constraints, BD phase prefix, solo-dev constraint, fork-boundary discipline, no breaking DB changes rule
- AGENTS.md — accessFilter + ownableColumns() model, no-unscoped-queries guard, no-drizzle-push guard, integration-webhooks queue pattern

### Secondary (MEDIUM confidence)

- Fitness-industry WhatsApp reactivation research — 18% reactivation rate targeted vs 2% cold; 3-5 touch suppression ceiling; 90-day cutoff (Keepme, Cloudstudio Manager, Hashmeta)
- B2B SaaS churn indicators — DAU trend, sticky-feature adoption, login frequency as health score inputs (buildmvpfast, SaaS Hero, ChurnBuster)
- Saga compensation pattern — LIFO rollback, best-effort compensation, terminal failure handling

### Tertiary (LOW confidence / validate at planning time)

- Neon 409 response body shape on duplicate project name — assumed standard error object with project_id; must validate before saga step-1 idempotency code is written
- Vercel async deployment polling interval — exact SDK method and recommended interval need confirmation in BD2
- Fly machine image base for services/hq-worker including flyctl — no specific image verified; resolve in BD2 PROV planning

---
*Research completed: 2026-06-19*
*Ready for roadmap: yes*
