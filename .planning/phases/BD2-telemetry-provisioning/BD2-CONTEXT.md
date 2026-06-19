# Phase BD2: Telemetry + Provisioning - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Mode:** Auto (`--auto`) — recommended defaults grounded in `.planning/research/` + BD1 artifacts.

<domain>
## Phase Boundary

Two parallel tracks on top of the BD1 HQ foundation:

**TEL (TEL-01..06):** Each studio deploy captures PII-free telemetry — aggregate engagement/retention metrics + AI token usage — and pushes it to HQ on a schedule, authenticated by a per-studio token. HQ ingests via a Zod `.strict()` schema that structurally rejects PII, recording `last_telemetry_received_at`. HQ never queries a studio DB.

**PROV (PROV-01..10):** A signup on the GymClassOS site creates a `provisioning_run` and returns immediately; a saga in `services/hq-worker` orchestrates Neon + Vercel + Fly to stand up a fully independent studio system — idempotently, with LIFO rollback on partial failure, and operator-visible per-step progress. Provisioning issues the per-studio telemetry token (links PROV → TEL).

NOT in BD2: HQ Brain cohorts/console (BD3 HQB), HQ dispatcher sends (BD3 HQD), studio-tier Brain/Dispatcher (BD4). Live cloud execution depends on operator-provided provider credentials (deferred-on-external-dependency where unavailable).
</domain>

<decisions>
## Implementation Decisions

### Telemetry capture (TEL-01, TEL-02)
- **D-01:** Token usage captured studio-side using the BD1-05 audit seam. Per `BD1-ANTHROPIC-AUDIT.md`, the clean fork-safe path is a studio-side `token_usage` table written at the `recordUsage` path (`packages/core` `production-agent.ts:2654`) + a Postgres `AFTER INSERT` trigger that accumulates counts into a `studio_telemetry_pending`/rollup table. NO modification to `@agent-native/core`. (Exact wiring confirmed in BD2 research/plan.)
- **D-02:** Engagement + retention metrics are aggregates only (counts, rates, timestamps) computed by SQL in the studio deploy — e.g. active members, bookings, messages sent, mobile-app engagement proxy, retention rate over a window. No names/emails/phones/message content ever.

### Telemetry transport + ingest (TEL-03, TEL-04, TEL-05, TEL-06)
- **D-03:** A scheduled pg-boss job in the existing `services/worker` (studio side) builds a `TelemetrySnapshot` and POSTs it to HQ `POST /api/telemetry` with a per-studio bearer token. Reuses the established studio worker + recurring-job pattern.
- **D-04:** HQ ingest endpoint (in `apps/hq`) validates with a Zod `.strict()` `TelemetrySnapshot` schema (counts/rates/timestamps allow-list) — any unknown/PII field → HTTP 422. Persists snapshot + `last_telemetry_received_at` per studio in `packages/hq-schema`.
- **D-05:** Per-studio token stored in HQ as a sha256 hash (`hq_studio_tokens`, follows the existing `secrets` table precedent); issued during provisioning (PROV-07). HQ holds the hash, the studio holds the plaintext (set as a studio secret).
- **D-06:** PII-up boundary stays structural: HQ ingest never accepts a connection string; `guard:hq-no-pii` (BD1) already blocks connection/dsn columns in hq-schema; the new HQ telemetry tables must pass it.

### Provisioning saga (PROV-01..10)
- **D-07:** The saga runs as a pg-boss job in `services/hq-worker` (NOT a Vercel function — 8 external API calls exceed Vercel's timeout).
- **D-08:** Signup intake = a public `POST` (on `apps/hq` or the marketing site) that inserts a `hq_provisioning_runs` row and enqueues the saga, returning immediately. Operator sees per-step status/progress in the HQ dashboard.
- **D-09:** 8 forward steps, each idempotent via per-step tracking (`step_N_at` / status columns on `hq_provisioning_runs`) + find-or-create (GET-before-POST) semantics, because Neon/Vercel/Fly have NO idempotency keys: (1) Neon project → (2) run studio migrations → (3) seed + studio admin → (4) Vercel project + env + deploy → (5) Fly apps (edge-webhooks + worker) + secrets → (6) subdomain/DNS → (7) issue telemetry token → (8) register studio in HQ registry.
- **D-10:** **Rollback/compensation (LIFO) is implemented BEFORE the happy path** (highest-blast-radius pitfall). A deliberate failure at any step compensates all completed steps in reverse order, leaving no orphaned Neon/Vercel/Fly resources.
- **D-11:** New deps live in `services/hq-worker` (and/or a shared `packages/provisioning`): `@neondatabase/api-client` (pin at install via `npm view`), `@vercel/sdk` (^1.27.x), `execa` (^9.x). Fly secrets set via `flyctl` subprocess (NOT Machines REST — restricted) using an **org-scoped** `FLY_API_TOKEN` (`fly tokens create org`) + `execa` array args (no shell injection). flyctl already baked into the hq-worker image (BD1-04).
- **D-12:** Provider API tokens (Neon API key, Vercel token, org-scoped Fly token) are operator-provided HQ secrets (env). Where unavailable in-repo, live provisioning runs are deferred-on-external-dependency; the saga code + idempotency + rollback are still built and unit-tested with provider clients mocked.

### Studio-secret handling (PII boundary)
- **D-13:** The provisioned studio's Neon connection string is set as a **studio-side secret** (Vercel/Fly env on the new deploy), NEVER stored in HQ schema. HQ keeps only registry metadata (studio id, name, owner contact, URLs, telemetry-token hash, provisioning status).

### Claude's Discretion
- Exact saga step interface, provisioning_runs column shape, snapshot schema field list, retry/backoff policy, and where the signup form lives (apps/hq public route vs marketing site) are at Claude's discretion guided by BD2 research + existing patterns.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone + phase
- `.planning/REQUIREMENTS.md` — TEL-01..06, PROV-01..10 acceptance
- `.planning/ROADMAP.md` — BD2 goal + 6 success criteria
- `.planning/research/SUMMARY.md`, `.planning/research/STACK.md` (deps + flyctl-not-REST + org token), `.planning/research/ARCHITECTURE.md` §V2 (saga state machine, telemetry contract, PII mechanisms), `.planning/research/PITFALLS.md` (provisioning idempotency/rollback, PII-up vectors, watchdog)

### BD1 artifacts to build on
- `.planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md` — token-usage seam (TEL-01)
- `packages/hq-schema/src/schema.ts`, `migrations.ts`, `constants.ts` — extend additively for telemetry + provisioning_runs + studio registry + token tables
- `services/hq-worker/src/` — host the saga + (optionally) telemetry ingest worker side
- `apps/hq/server/` — telemetry ingest endpoint + signup intake + provisioning dashboard
- `apps/hq/.env.example`, `services/hq-worker/.env.example` — add provider API token placeholders (operator-provided)

### Studio-side patterns to mirror
- `services/worker/src/` (pg-boss recurring job for the telemetry push)
- `.agents/skills/recurring-jobs` and `.agents/skills/integration-webhooks` (queue patterns)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- BD1 `services/hq-worker` skeleton (pg-boss + flyctl baked in) — host the saga here.
- BD1 `packages/hq-schema` additive-migration pattern — extend for BD2 tables.
- `services/worker` recurring-job + pg-boss patterns — clone for the studio telemetry push.
- `secrets` table precedent (pgcrypto/sha256) for the per-studio token hash.

### Established Patterns
- Additive-only migrations (runMigrations, ON CONFLICT idempotent) — both HQ and studio.
- Zod `.strict()` structural exclusion (same pattern used for member-consent in v1.2) — apply to TelemetrySnapshot.
- Integration-webhook queue pattern (verify → enqueue → 200 → process) — mirror for signup intake.

### Integration Points
- HQ: `POST /api/telemetry` (ingest), signup intake route, provisioning dashboard route.
- Studio: recurring pg-boss job pushing the snapshot.
- New provider-client deps in services/hq-worker (or packages/provisioning).
</code_context>

<specifics>
## Specific Ideas
- Build rollback first, then happy path (non-negotiable — orphaned cloud resources are costly + hard to detect).
- All provider calls behind a thin adapter so they can be mocked in unit tests (live runs deferred until operator tokens exist).
- A watchdog/alert for stuck provisioning runs + missing telemetry (research "no silent caps" — surface it).
</specifics>

<deferred>
## Deferred Ideas
- Live provisioning execution against real Neon/Vercel/Fly — needs operator-provided API tokens (deferred-on-external-dependency); code + idempotency + rollback built and mock-tested now.
- HQ Brain consumption of telemetry (BD3 HQB).
- Billing/trial gating at signup (PROV-FUT-01).
</deferred>

---

*Phase: BD2-telemetry-provisioning*
*Context gathered: 2026-06-19*
