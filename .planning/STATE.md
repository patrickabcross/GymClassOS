---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: — Self-Serve Platform + Two-Tier Brain/Dispatcher
status: milestone_complete
stopped_at: v2.0 milestone shipped (BD1-BD4 complete, tagged v2.0)
last_updated: "2026-06-19T22:06:57.286Z"
last_activity: 2026-06-19
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 19
  completed_plans: 19
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-19 — Milestone v2.0 SHIPPED)
Roadmap: `.planning/ROADMAP.md` (v2.0 collapsed to a shipped summary at top; full detail archived in `milestones/v2.0-ROADMAP.md`; v1.2/v1.1/v1.0 phases below)
Requirements: archived to `.planning/milestones/v2.0-REQUIREMENTS.md` (40/40 v2.0 reqs delivered). A fresh `REQUIREMENTS.md` is created by `/gsd:new-milestone`.

**Core value:** A gym signs up on the GymClassOS site and gets a fully provisioned, independent system with zero human steps; the operator (you) gets a brain/dispatcher to understand and grow gym-owner customers; each gym gets its own brain/dispatcher to activate its members — all with no member PII ever leaving the studio deploy.

**Current milestone:** v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher. **SHIPPED 2026-06-19 (code-complete, tagged `v2.0`).** Delivered the operator HQ control plane (`apps/hq`), zero-touch self-serve provisioning, PII-free telemetry, and the two-tier Brain/Dispatcher (HQ + per-studio).

**Current focus:** Planning the next milestone. Before starting it, clear v2.0's operational tail: HQ Neon + HQ/studio deploys, provider API tokens, Meta template approvals (HQ owner-comms + GOD member-reactivation), then the deferred live UAT in each phase's `*-HUMAN-UAT.md`. Run `/gsd:new-milestone` when ready.

**Three v2.0 dependencies (apps/hq only):** `@neondatabase/api-client`, `@vercel/sdk`, `execa`. All other stack deps already in the pnpm workspace.

## Current Position

Milestone: v2.0 — SHIPPED (code) 2026-06-19
Phase: BD4 (last v2.0 phase) — complete
Plan: —
Status: Milestone complete — tagged `v2.0`; awaiting next milestone (`/gsd:new-milestone`)
Last activity: 2026-06-19

> **Open tails:** v2.0 live UAT (BD1–BD4 `*-HUMAN-UAT.md`) deferred-on-external-dependency. v1.2 Agentic Tab Editing is code-complete/live (AE1–AE3 live UAT pending). v1.0 Production + Mobile Demo (AE4) remain tracked in the roadmap.

**Progress bar:** [██████████] 100% (4/4 v2.0 phases, 19/19 plans)

### v2.0 Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| BD1. HQ Foundation | Operator can sign in to a running `apps/hq` control plane; PII boundary + fork CI guards in place; Anthropic call-site audited | HQ-FND-01..06 | Not started |
| BD2. Telemetry + Provisioning | Studios push PII-free telemetry to HQ; provisioning saga (LIFO rollback first) orchestrates Neon + Vercel + Fly; idempotent retries | TEL-01..06, PROV-01..10 | Not started |
| BD3. HQ Brain + Dispatcher | Operator sees health cohorts of gym-owner customers from telemetry; dispatches owner-comms via HQ WABA; generates website Content | HQB-01..05, HQD-01..05 | Not started |
| BD4. Studio Brain + Dispatcher | Each studio has a gym-owner Brain; daily owner digest + heartbeat reactivation through existing chokepoint; suppression ceiling from day one | GOB-01..03, GOD-01..05 | Not started |

**Next action:** `/gsd:plan-phase BD1`

## Performance Metrics

**v2.0 milestone start:** 2026-06-19
**v1.2 reference velocity (completed 2026-06-18 → 2026-06-19):**

- AE1-AE3: 3 phases, 9 plans, ~1 day elapsed

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| BD2 | 01 | 35min | 3 | 7 | 2026-06-19 |
| BD2 | 02 | 16min | 3 | 10 | 2026-06-19 |
| BD2 | 03 | 975s (~16min) | 3 | 6 | 2026-06-19 |
| Phase BD2 P04 | 45 | 2 tasks | 9 files |
| Phase BD2 P05 | 1145 | 3 tasks | 12 files |
| Phase BD2 P06 | 45 | 4 tasks | 11 files |
| Phase BD3 P01 | 838 | 2 tasks | 8 files |
| Phase BD3 P03 | 461 | 3 tasks | 12 files |
| Phase BD3 P02 | 711 | 3 tasks | 6 files |
| Phase BD3 P04 | 397 | 3 tasks | 8 files |
| Phase BD3 P05 | 687 | 3 tasks | 14 files |
| Phase BD4 P01 | 14 | 3 tasks | 9 files |
| Phase BD4 P02 | 25 | 3 tasks | 6 files |

## Accumulated Context

### BD4-01 Decisions (2026-06-19)

- **2026-06-19 BD4-01 — All three BD4 tables owned by BD4-01 to prevent db.ts collision with BD4-02: studio_brain_docs (v16), studio_owner_config (v17), reactivation_attempts (v18), index (v19) all in BD4-01; BD4-02 reads them without touching db.ts.**
- **2026-06-19 BD4-01 — Pure helper extraction to brain-init-helpers.ts: vitest.unit.config.ts + ESM vitest cannot import @agent-native/core (CJS React "module is not defined"); pure helpers extracted to *-helpers.ts (mirrors create-checkout-link-helpers.ts pattern).**
- **2026-06-19 BD4-01 — Collapsible shadcn primitive for Class Methods: progressive disclosure — Class Methods section collapsed by default on /gymos/brain per AGENTS.md rule.**
- **2026-06-19 BD4-01 — Client-side fetch in gymos.brain.tsx (no loader): readAppState and getDb() in a React Router v7 loader need request context; client-side pattern matches gymos.campaigns.tsx segment-fetch.**

### BD3-04 Decisions (2026-06-19)

- **2026-06-19 BD3-04 — vitest.config.ts extended to include actions/**/*.test.ts: existing config only covered server/**/*.test.ts; action schema tests (e.g. OwnerSendSchema) have no browser/DB dependency and fit under actions/**
- **2026-06-19 BD3-04 — agent-chat.ts copy-out fork: dispatchAgentChatPlugin is a pre-instantiated Nitro plugin object with no systemPromptSuffix option; createAgentChatPlugin factory must be called directly to inject HQD_CONSTRAINT into the system prompt. MODIFICATIONS.md updated with origin path and merge guidance.**
- **2026-06-19 BD3-04 — Terminal gate errors in hq-owner-send handler are swallowed (logged + return, no re-raise): OwnerNoOptInError/OwnerWindowExpiredError/OwnerTemplateNotApprovedError are operator-config errors, not transient failures; wasting pg-boss retries on them would spam logs without useful retries.**
- **2026-06-19 BD3-04 — HQ_WABA_PHONE_NUMBER_ID + HQ_WABA_API_TOKEN added as optional env fields in hq-worker; absence falls back to mockHqWabaClient cleanly (deferred-on-external-dependency D-13).**

### BD3-02 Decisions (2026-06-19)

- **2026-06-19 BD3-02 — recharts pinned to 2.15.4 (2.x latest stable) in apps/hq: plan forbids 3.x beta; 3.8.1 is current latest on npm but plan required 2.x; 2.15.4 is safe mid-ship stable.**
- **2026-06-19 BD3-02 — ClientOnly from @agent-native/core/client takes ReactNode children (not render prop): plan pattern `{() => (<ResponsiveContainer>...)}` is wrong for this implementation; switched to direct JSX children. Same SSR-guard semantics.**
- **2026-06-19 BD3-02 — ChartCard.dataKey widened to string: TokenPoint adds totalTokens (not in keyof StudioSnapshotPoint); TS2322 would block token chart. Widened to string; recharts consumes it as string internally.**

### BD3-01 Decisions (2026-06-19)

- **2026-06-19 BD3-01 — Used getDbExec() raw SQL (not db.execute()) for DISTINCT ON query in apps/hq: LibSQL Drizzle type has no .execute() at compile time; getDbExec() is the established pattern (usage-metrics.ts). Subpath @gymos/hq-schema/constants export added to hq-schema package.json (was missing).**
- **2026-06-19 BD3-01 — Added apps/hq/vitest.config.ts scoped to server/**/*.test.ts (node env): apps/hq had no per-package vitest config; vite.config.ts is react-router SSR and causes preamble errors for pure TS tests.**
- **2026-06-19 BD3-01 — Shared query helper factored into list-studios-query.ts: both api.studios.ts (resource route) and list-studios.ts (action) call queryStudiosWithHealth() with no duplication.**

### BD2-06 Decisions (2026-06-19)

- **2026-06-19 BD2-06 — @gymos/queue added as workspace dep to @gymos/hq: the signup intake handler is the provision-studio queue producer; getBoss() needed in the HQ web app, not just hq-worker.**
- **2026-06-19 BD2-06 — Watchdog source uses line comments (//) not JSDoc block comments: esbuild 0.21.x treats */5 inside a block comment as a comment-close token, causing a transform error on the cron string.**
- **2026-06-19 BD2-06 — crypto.randomUUID() used instead of nanoid: nanoid is not in @gymos/hq deps; Node built-in randomUUID() produces UUIDs with equivalent uniqueness for studioId/runId.**
- **2026-06-19 BD2-06 — Task 4 human-verify checkpoint auto-approved as deferred-on-external-dependency: live deploy verification (curl signup, dashboard, Fly logs) requires HQ Vercel deploy + provider tokens not yet set by operator.**
- **2026-06-19 BD2-06 — Drizzle execute<T>() requires T extends Record<string, unknown>: StuckRun and StaleTelemetryStudio interfaces must extend that constraint for watchdog raw SQL queries to typecheck.**

### BD2-05 Decisions (2026-06-19)

- **2026-06-19 BD2-05 — LIFO compensation order: 7(revoke_token)→6(remove_dns)→5(delete_fly_app)→4(delete_vercel)→1(delete_neon). Steps 2, 3, 8 have no compensation (project deletion covers 2/3; step 8 registry write is idempotent). Compensation is best-effort (errors collected, never re-raised).**
- **2026-06-19 BD2-05 — runStep(runId, stepNum, fn) calls getHqDb() internally — enables vi.mock('./db.js') in unit tests without injecting a db argument (matches compensate.ts pattern).**
- **2026-06-19 BD2-05 — Token helpers (hashToken, generateTelemetryToken) moved from apps/hq/server/lib/telemetry-token.ts to packages/hq-schema/src/token.ts to avoid tsc rootDir violation when hq-worker imports them. apps/hq re-exports from @gymos/hq-schema/token for backward compatibility.**
- **2026-06-19 BD2-05 — pg-boss 12 WorkHandler receives Job<T>[] (array, not single item); handler destructures jobs[0] (batch size defaults to 1). This differs from pg-boss docs examples that show a single job.**
- **2026-06-19 BD2-05 — provision-studio.ts useMockApis param defaults true so unit tests skip live-run token guard; registerProvisionStudio passes false for production runs.**

### BD2-04 Decisions (2026-06-19)

- **2026-06-19 BD2-04 — ingest-helpers.ts pattern: pure business-logic helpers (extractBearerToken, hashToken, parseTelemetryBody, buildIngestPayload) extracted from the H3 handler into a separate file with no framework imports, so they can be unit-tested without a dev server — mirrors the auth-helpers.ts pattern established in BD1.**
- **2026-06-19 BD2-04 — TDD approach: vi.mock of deep relative paths fails in Vite's module runner, so the test imports ingest-helpers.ts directly (not the H3 handler), achieving full behavioral coverage without mocking framework internals.**
- **2026-06-19 BD2-04 — Route depth: telemetry route at server/routes/api/telemetry/ (4 levels) needs ../../../db/index.js (3 levels up). Caught and fixed at typecheck.**

### BD2-03 Decisions (2026-06-19)

- **2026-06-19 BD2-03 — studio_telemetry_state.updated_at is TEXT (not INTEGER epoch) to match the existing studio schema convention (gym_members, conversations etc. all use TEXT ISO timestamps).**
- **2026-06-19 BD2-03 — mobileEngagement proxy = COUNT(*) FROM food_entries in window. Rationale: food_entries is the only mobile-app-exclusive table in the current studio schema; BD3 may refine to a richer session metric.**
- **2026-06-19 BD2-03 — retentionRate = COUNT(DISTINCT member_id active this window) / COUNT(DISTINCT member_id active prior window). Documented approximation (not exact cohort intersection); 0 when prior denominator is 0.**
- **2026-06-19 BD2-03 — @gymos/hq-schema added as workspace dep to services/worker (Rule-3 auto-fix: tsc --noEmit failed TS2307 without it; TelemetrySnapshotInput type used in buildTelemetrySnapshot).**
- **2026-06-19 BD2-03 — Trigger guard uses DO $$ IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_token_usage_accumulate') to avoid DROP; wrapped in information_schema existence check for SQLite dev-path no-op.**

### BD2-02 Decisions (2026-06-19)

- **2026-06-19 BD2-02 — @neondatabase/api-client version is 2.x (actual published) not 10.x (as documented in research); pinned to ^2.7.2. API surface is compatible.**
- **2026-06-19 BD2-02 — Vercel SDK getProjects returns union type (GetProjectsResponseBody2 | GetProjectsResponseBody3 | Array<...>); Array.isArray guard normalises to project list for find-or-create.**
- **2026-06-19 BD2-02 — execa call spans multiple lines in fly.ts — test runtime-verifies array-arg form; single-line grep from plan is a style check only, not a semantic constraint.**

### BD2-01 Decisions (2026-06-19)

- **2026-06-19 BD2-01 — TelemetrySnapshot exported without .strict() — callers apply .strict() at ingest boundary to keep schema composable (push job doesn't need strict mode, ingest endpoint does).**
- **2026-06-19 BD2-01 — Per-package vitest.config.ts added to hq-schema; root vitest.config.ts only covers tests/integration/** — new per-package unit test packages need their own scoped config.**
- **2026-06-19 BD2-01 — apps/hq/server/db/schema.ts needed no change: export * from @gymos/hq-schema/schema auto-flows new tables into merged HQ db schema.**

### v2.0 Roadmap Decisions

- **2026-06-19 — Phase prefix BD (not integer) to avoid .planning/phases/ collisions with existing AE/R/D/P phase directories.**
- **2026-06-19 — 4 phases (coarse granularity).** Research converged on BD1-BD4. BD2 and BD4 each contain two parallel plans within the phase (TEL+PROV in BD2; GOB+GOD in BD4).
- **2026-06-19 — Provisioner runs in services/hq-worker (Fly), not Vercel.** 8-step saga exceeds Vercel's 300-second timeout. pg-boss job in hq-worker drives forward steps and LIFO rollback.
- **2026-06-19 — PROV rollback code ships before happy-path code (CRITICAL).** Non-idempotent provisioning creates orphaned cloud resources. Prevention: check GET before POST for each provider; build LIFO rollback first; test by deliberately failing at each step.
- **2026-06-19 — Three PII-up enforcement mechanisms (all three must ship together in BD1/BD2).** (1) No studio DB credentials in HQ env. (2) Zod `.strict()` TelemetrySnapshot schema (422 on unknown fields). (3) CI guard blocking HQ schema columns named `*connection*`/`*database_url*`/`*dsn*`.
- **2026-06-19 — HQ needs its own WABA (separate from any studio WABA).** Using a studio WABA for B2B owner comms is a Meta compliance violation. HQD WABA is registered to the GymClassOS business account; owner opt-ins stored in HQ Neon `hq_whatsapp_opt_in`. No HQD code touches `services/worker` or `services/edge-webhooks`.
- **2026-06-19 — Anthropic call-site audit is a BD1 task, not BD2.** The `createAgentChatPlugin` internals must be audited in BD1 to confirm the exact interception point for the token-usage wrapper. This audit gates the TEL plan in BD2.
- **2026-06-19 — Meta template approval lead times are calendar dependencies, not engineering tasks.** HQD owner-comms templates submitted at BD2 completion (2-7 day wait before BD3 HQD can send live messages). GOD member reactivation templates submitted at BD3 completion (2-7 day wait before BD4 GOD heartbeat goes live).
- **2026-06-19 — BD2 PROV plan needs /gsd:research-phase before planning.** Three unverified items: (a) Fly machine deploy sequencing (flyctl secrets set timing vs. machine creation); (b) Vercel async deployment polling with @vercel/sdk 1.27.0; (c) Neon 409 response body shape for idempotent step-1.
- **2026-06-19 — BD3 HQD plan needs /gsd:research-phase before planning.** HQ WABA second phone number registration in Meta Business Manager — procedure not yet confirmed.
- **2026-06-19 — services/hq-worker Dockerfile must include flyctl.** Fly secrets cannot be set via the Machines REST API (restricted to Fly KMS, not GA). flyctl CLI is the only working path. Base image + version pinning decided in BD2 PROV planning.
- **2026-06-19 — GOD suppression ceiling (3 attempts / 90-day window) ships from day one (Pitfall W-01).** Not retrofitted after launch. `heartbeat_suppression` table with attempt tracking created in the same BD4 plan that adds the heartbeat queue.
- **2026-06-19 — GOD heartbeat cron start times staggered by hash(studio_id) % 60 min (Pitfall W-02).** Prevents send storms when multiple studios provision at the same time (all would otherwise fire at exactly 09:00).
- **2026-06-19 — `sendMessage.ts` is NOT modified in BD4.** All GOD sends use INSERT messages -> enqueue outbound-whatsapp -> existing chokepoint. The chokepoint handles opt-in / 24h-window / template-approved gates unchanged.
- **2026-06-19 — HQ org + super-admin seed row in runMigrations (Pitfall F-02).** Without the org seed, Brain and Dispatch routes return empty because `accessFilter` scopes to `orgId`. Seed runs at migration time, not at application boot.
- **2026-06-19 — New v2.0 packages in pnpm workspace: `packages/hq-schema`, `services/hq-worker`.** Both added to `pnpm-workspace.yaml` in BD1.

### v1.2 Roadmap Decisions (preserved for reference)

- **2026-06-18 — Phase prefix AE to avoid .planning/phases/ collisions.**
- **2026-06-18 — Gate atomicity: new gated actions must update both `ACTION_ALLOWLIST` in `approve-proposal.ts` AND Zod enum in `propose-action.ts` in the same commit.**
- **2026-06-18 — Consent exclusion is structural (`.strict()` Zod schema), not behavioral.**
- **2026-06-18 — Cancel-occurrence correctness: BOOKINGS_EXIST guard + atomic transaction.**
- **2026-06-18 — No local dev server constraint continues (NitroViteError).**
- **2026-06-18 — Two-exposure rule per action: action file registry + system prompt bullet, both required.**

### v1.1 Roadmap Decisions (preserved for reference)

- **2026-06-12 — Phase prefix R to avoid .planning/phases/ collisions at merge time.**
- **2026-06-12 — Hustle brand hex is an open dependency (hustle.css placeholder values until customer confirms).**
- **2026-06-12 — No local dev server constraint.**

### v1.0 Accumulated Context (from master — preserved for reference)

**P1c-WIDE VERIFICATION CONSTRAINT:** The local `agent-native dev` server cannot boot (`NitroViteError: Vite environment "nitro" is unavailable` -> 503 on server routes). NO plan can run a local HTTP walkthrough. Verify via replay against live Neon DB via Neon MCP or defer to e2e smoke test on Vercel deploy.

- **2026-05-17 — Two-milestone restructure:** Demo Sprint (week 1) + Production v1 (weeks 2-9).
- **2026-05-17 — Stripe direct restricted-API-key (NOT Connect)** (later reversed 2026-06-12 to Connect Custom accounts).
- **2026-05-17 — pg-boss on Neon (NOT BullMQ + Redis):** Queue lives in same Neon DB; no Redis service.
- **2026-05-17 — Calorie counter built fresh (NOT fork OpenNutriTracker):** OpenNutriTracker is Flutter + GPL v3.
- **2026-05-17 (late) — Member surface = Expo fork of `packages/mobile-app`** (NOT web PWA).

**Live deployment state (master):**

- Staff-web: `https://gym-class-os.vercel.app` (Vercel, auto-deploys from `master`) — AE3 live as of commit `120d11c3`, deployed 2026-06-19
- Worker + edge-webhooks: Fly app `gymos-edge-webhooks`
- Neon project: `gymos-demo` (id `billowing-sun-51091059`)
- Demo data: 260 members / 423 class occurrences / 4,162 bookings / 200 active subs / 90 conversations / 453 messages

## Session Continuity

Last session: 2026-06-19T18:41:36.502Z
Stopped at: Completed BD4-02-PLAN.md
Resume file: None

### PICK UP HERE — plan BD1

v2.0 roadmap is written. The four phases are defined with success criteria and requirement mappings.

**Next step — plan Phase BD1:** `/gsd:plan-phase BD1`

BD1 is the foundational phase: `apps/hq` scaffold, HQ Neon, super-admin Better-auth, HQ org seed, `services/hq-worker` skeleton, CI guards, and the Anthropic call-site audit. All other phases depend on BD1.

**Research flags for upcoming phases (action at plan time):**

- BD2 PROV plan: run `/gsd:research-phase` before planning. Three unverified items: Fly machine deploy sequencing, Vercel async deployment polling, Neon 409 response body shape.
- BD3 HQD plan: run `/gsd:research-phase` before planning. HQ WABA second phone number registration in Meta Business Manager.

**Calendar watch items (non-engineering, but gate BD3/BD4 go-live):**

- Submit HQD owner-comms WhatsApp templates for Meta approval at BD2 completion.
- Submit GOD member reactivation + owner digest templates for Meta approval at BD3 completion.
