---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: — Self-Serve Platform + Two-Tier Brain/Dispatcher
status: executing
stopped_at: Completed BD1-hq-foundation BD1-01-PLAN.md (apps/hq scaffold)
last_updated: "2026-06-19T10:53:39.080Z"
last_activity: 2026-06-19
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-19 — Milestone v2.0 Self-Serve Platform + Two-Tier Brain/Dispatcher started)
Roadmap: `.planning/ROADMAP.md` (v2.0 BD phases at top; v1.2 AE-phases below; v1.1 R-phases below that; v1.0 D/P phases below that)
Requirements: `.planning/REQUIREMENTS.md` (40 v2.0 reqs across 7 categories — HQ-FND, PROV, TEL, HQB, HQD, GOB, GOD)

**Core value:** A gym signs up on the GymClassOS site and gets a fully provisioned, independent system with zero human steps; the operator (you) gets a brain/dispatcher to understand and grow gym-owner customers; each gym gets its own brain/dispatcher to activate its members — all with no member PII ever leaving the studio deploy.

**Current milestone:** v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher. Introduces an entirely new operator HQ control plane (`apps/hq`) + zero-touch self-serve provisioning + PII-free telemetry + two-tier Brain/Dispatcher (HQ + per-studio).

**Three new v2.0 dependencies (install in apps/hq only):** `@neondatabase/api-client`, `@vercel/sdk`, `execa`. All other stack deps already in the pnpm workspace.

## Current Position

Milestone: v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher
Phase: BD1-hq (HQ Foundation) — EXECUTING
Plan: 2 of 6
Status: Ready to execute
Last activity: 2026-06-19

> **Predecessor:** v1.2 — Agentic Tab Editing is COMPLETE (code-verified, pushed, live on Vercel). Live agent+browser UAT (AE1-AE3 `*-HUMAN-UAT.md`) and the Mobile Demo (AE4) phase remain open and are tracked in the roadmap; they are not part of v2.0 scope.

**Progress bar:** [..........] 0% (0/4 v2.0 phases)

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

## Accumulated Context

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

Last session: 2026-06-19T10:53:39.073Z
Stopped at: Completed BD1-hq-foundation BD1-01-PLAN.md (apps/hq scaffold)
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
