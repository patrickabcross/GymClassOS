# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher

**Shipped:** 2026-06-19 (code-complete; live UAT deferred-on-external-dependency)
**Phases:** 4 (BD1–BD4) | **Plans:** 19 | **Sessions:** 1 (~9h, GSD auto-advance chain)

### What Was Built
- **Operator HQ control plane** (`apps/hq`, `packages/hq-schema`, `services/hq-worker`) above the gym tenants — single super-admin, fork-boundary + PII-up CI guards (BD1).
- **Zero-touch self-serve provisioning** — 8-step Neon/Vercel/Fly saga with LIFO rollback-first + per-step idempotency, public `/api/signup` 202-queue, watchdog (BD2).
- **PII-free telemetry pipeline** — `.strict()` snapshot (422 on PII), studio token-usage trigger + aggregate engagement/retention, token-hash ingest (BD2).
- **HQ Brain + Dispatcher** — deterministic health/cohort classification (no LLM in trust path, staleness-first), console + drill-in, HQ-owned mirrored WABA gates, member-excluded owner-send, non-collab Content (BD3).
- **Studio Brain + Dispatcher** — per-studio `studio_brain_docs` + `/gymos/brain`, daily owner digest + heartbeat reactivation through the existing chokepoint, 3/90 suppression + opt-out day-one, brand-voice personalization (BD4).

### What Worked
- **Mirror-don't-modify discipline.** The studio `sendMessage` chokepoint and gate modules were never touched across all 4 phases; HQ mirrored (copied) the gate logic rather than importing the worker, enforced by a CI `no-worker-import` guard. New comms paths (HQD, GOD digest, GOD heartbeat) all became producers into existing queues.
- **Structural safety over runtime checks.** PII exclusion was enforced by Zod `.strict()` schemas + an empty-by-construction HQ Neon + CI guards — defense in depth that can't silently regress.
- **Mock-first / deferred-on-external-dependency.** Every external blocker (provider API tokens, Meta template approval, HQ WABA registration, no-local-dev-server) was isolated so code shipped + unit-tested now and only live verification waits. 138/138 worker tests, 192 tests at BD2, clean `tsc` throughout.
- **BD4 reused BD3's shapes wholesale.** Treating the studio tier as a mirror of the HQ tier made BD4 the fastest phase (2 plans) with no novel architecture risk.
- **GSD auto-advance chain** (discuss → plan → execute, per phase) ran end-to-end with yolo-mode auto-approval, keeping a single context window productive across the whole milestone.

### What Was Inefficient
- **GSD phase-id parser tripped on the `+` in phase names.** "Studio Brain + Dispatcher" mis-split into `phase_number: BD4-studio-brain` / `phase_name: dispatcher` across init/complete tools, and `roadmap analyze` / `milestone complete` counted 0 phases/plans — requiring manual stat enrichment in MILESTONES.md and manual ROADMAP collapse. Avoid `+`/special chars in phase titles next milestone.
- **No milestone audit was run.** `/gsd:audit-milestone` was skipped before completion; relied on per-phase verifiers + 40/40 requirement checks instead. Cross-phase E2E/integration was never separately validated — recorded as a known gap.
- **Cross-plan schema coordination needed a manual call-out.** Both BD4 plans touched the studio schema; avoiding a `db.ts` migration collision required explicitly assigning all three additive tables to BD4-01 and worker-side mirrors to BD4-02. Worth a standing convention (one plan owns schema per wave).

### Patterns Established
- **Two-tier with a hard PII boundary:** HQ never holds studio DB credentials; studios push only aggregate telemetry up; `.strict()` at every send boundary.
- **Deterministic classification, no LLM in the trust path** — auditable health/dormancy scoring with config-constant thresholds; LLM (if any) is an additive narrative layer only.
- **Suppression ceiling on the same path that enqueues** — recording an attempt and the ceiling check are atomic with the send, so no message escapes the counter.
- **Schema ownership per wave** to prevent migration collisions between parallel plans.

### Key Lessons
1. **Make the sacred path un-importable, not just un-touched** — a CI grep guard ("no reference to `services/worker`") turns a convention into an invariant.
2. **Defer on external dependencies, never block on them** — mock the provider, ship + test the logic, capture the live step in a `*-HUMAN-UAT.md`. Whole milestone stayed unblocked despite zero live deploys/tokens.
3. **Keep phase titles tool-safe** — avoid `+` and punctuation; the planning tooling splits on them.
4. **Run `/gsd:audit-milestone` before `/gsd:complete-milestone`** when phases ship fast in one session — per-phase verification doesn't cover cross-phase integration.

### Cost Observations
- Model mix: orchestration on Opus; subagents (researcher/planner/checker/executors/verifier) on the GSD profile (planner Opus, others Sonnet).
- Sessions: 1 long auto-advance chain.
- Notable: a single ~9h session delivered 4 phases / 19 plans / +58k LOC by leaning on mock-first execution (no waiting on external systems) and reusing BD3's architecture at the studio tier.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v2.0 | 1 | 4 | Full GSD auto-advance chain (discuss→plan→execute) in yolo mode; mock-first for all external deps |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v2.0 | 138/138 worker (+ phase suites e.g. 192 @ BD2) | n/a (no local dev server) | 3 new HQ deps only (`@neondatabase/api-client`, `@vercel/sdk`, `execa`); all v2.0 product code on existing stack |

### Top Lessons (Verified Across Milestones)

1. Defer on external dependencies, never block — mock + unit-test now, capture live steps as UAT.
2. Make critical invariants CI-enforced (PII boundary, fork boundary, chokepoint isolation), not just documented.
