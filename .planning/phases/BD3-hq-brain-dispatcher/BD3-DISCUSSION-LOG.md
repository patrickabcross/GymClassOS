# Phase BD3: HQ Brain + Dispatcher - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** BD3-hq-brain-dispatcher
**Mode:** Auto (`--auto`) — all gray areas selected, recommended defaults chosen without interactive prompts.
**Areas discussed:** Health classification engine, Cohort definitions, Console + drill-in, HQD send path + gating, Content/Video surfaces

---

## Health classification engine (HQB-02, HQB-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic threshold rules (SQL/TS) | Auditable rules over telemetry aggregates; Brain distillation additive | ✓ |
| Brain LLM distillation as source of truth | LLM classifies health from snapshots | |
| Hybrid (LLM verdict + rule guardrails) | LLM with deterministic floors | |

**User's choice (auto):** Deterministic threshold rules; Brain distillation = additive narrative layer.
**Notes:** No LLM in the trust path → auditable, PII-free, no token cost. Staleness gate: `last_telemetry_received_at` older than threshold ⇒ `stale`, never `healthy`.

---

## Cohort definitions (HQB-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Computed views over signals | At-risk / power-user derived live from telemetry; thresholds = config constants | ✓ |
| Stored cohort membership | Persisted membership rows | |
| Operator-defined custom cohorts | Manual cohort builder | |

**User's choice (auto):** Computed views; thresholds as tunable constants (Claude's discretion).
**Notes:** At-risk = dormant OR under-messaging OR low retention OR stale; power-user = high engagement + healthy retention + active messaging.

---

## Console + drill-in (HQB-01, HQB-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Studio list/table + per-studio history charts (reuse Brain shell) | shadcn Table list; drill-in route with telemetry-over-time charts | ✓ |
| Card grid dashboard | Card-per-studio layout | |
| New bespoke layout | Custom-built console | |

**User's choice (auto):** Studio list/table + per-studio drill-in charts, reusing existing `apps/hq` routes/components.
**Notes:** Progressive disclosure — summary in list, full telemetry history on drill-in.

---

## HQD send path + gating (HQD-01, HQD-02, HQD-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror studio chokepoint as HQ-owned code (own WABA) | Copy optInGate/windowGate/sendMessage logic; member-excluded `.strict()` schema; never import services/worker | ✓ |
| Import/share studio worker send code | Reuse services/worker directly | |
| Third-party messaging SaaS | Twilio/etc. | |

**User's choice (auto):** Mirror the chokepoint as HQ-owned code on HQ's own WABA; structurally member-excluded Zod schema.
**Notes:** CI-checkable: no HQD reference to `services/worker`/`services/edge-webhooks`. Live sends deferred-on-external-dependency (HQ WABA registration unconfirmed — research flag; Meta template approval calendar dependency). Build + mock-test now.

---

## Content / Video surfaces (HQD-04, HQD-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Content (non-collab) this phase; Video sequenced last, render cluster deferred | Fork templates/content non-collab; Video lightest path / may slip | ✓ |
| Content + Video both full-build this phase | Full Remotion render cluster | |
| Defer both | Skip HQD-04/05 entirely | |

**User's choice (auto):** Build Content (non-collab per BD1 D-03) this phase; Video (HQD-05) lowest priority, render cluster deferred.

---

## Claude's Discretion

- Exact staleness threshold value; cohort threshold constants; console column set; drill-in chart library; owner-send Zod schema shape; HQ send-queue location (`apps/hq` vs `services/hq-worker`); whether `brain-ingest` ships or stubs this phase.

## Deferred Ideas

- Live HQD WhatsApp sends (HQ WABA registration + Meta template approval).
- Video dedicated Remotion render cluster (HQD-05 lowest priority).
- Brain LLM distillation as deeper narrative layer.
- Studio-tier Brain/Dispatcher (BD4); billing/trial gating (PROV-FUT-01).
