# Phase BD3: HQ Brain + Dispatcher - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Mode:** Auto (`--auto`) — recommended defaults grounded in `.planning/research/` (ARCHITECTURE §V2-8, PITFALLS Areas 3 & HQ-Brain-PII), BD1/BD2 artifacts, and the existing `apps/hq` fork.

<domain>
## Phase Boundary

Two parallel tracks **inside `apps/hq`** (already a Dispatch + Brain fork from BD1), built on the BD2 telemetry + studio-registry foundation. HQ never queries a studio DB — it reads only the HQ Neon tables BD2 populates (`hq_studios`, `hq_telemetry_snapshots`, `hq_token_usage`, `hq_studio_tokens`).

**HQB (HQB-01..05) — Operator's model of gym-owner customers:**
- An operator console listing every provisioned studio with health + engagement summaries derived from telemetry (active vs dormant, last telemetry received, token spend, retention).
- Health/at-risk classification from telemetry signals, with `last_telemetry_received_at` used to exclude stale/missing-telemetry studios from false "healthy/active" signals.
- Cohort views ("sets of clients") — at-risk and power-user studios.
- Drill-in to a single studio's installation performance over time (telemetry history).

**HQD (HQD-01..05) — Operator → gym-OWNER comms about system/product topics only:**
- HQ's own WhatsApp Business Account + `hq_whatsapp_opt_in` tracking, fully separate from any studio WABA.
- A dispatcher-agent send action whose Zod schema **structurally excludes** member-directed payloads and member PII (HQD can never message gym members).
- Owner messages route through a 24h-window + approved-template gate on HQ's own send path (no reference to studio `services/worker` or `services/edge-webhooks`).
- Generate marketing **Content** for the GymClassOS website from Brain insights (Content tools).
- Generate marketing **Video** (HQD-05) — lowest priority, sequenced last.

**NOT in BD3:** Studio-tier Brain/Dispatcher (BD4 GOB/GOD); live WABA sends (deferred-on-external-dependency — see below); live provisioning execution (BD2 deferred); billing/trial gating (PROV-FUT-01).
</domain>

<decisions>
## Implementation Decisions

### HQB — Health classification engine (HQB-02, HQB-03)
- **D-01:** Health/at-risk status is computed by **deterministic threshold rules over telemetry aggregates** (SQL/TS reading `hq_telemetry_snapshots` + `hq_token_usage` joined to `hq_studios`) — auditable, no LLM cost, no PII exposure. The Brain distillation queue (`brain-ingest`) is an **additive narrative layer** (operator can "ask the Brain" about a studio), NOT the source of truth for health classification.
- **D-02:** **Staleness gate (HQB-03):** any studio whose `last_telemetry_received_at` is older than the staleness threshold is classified `stale`/`unknown` and is **never** shown as `healthy`/`active`. Exact threshold (e.g. 2× the BD2 push interval, or a fixed window) is Claude's discretion as a named config constant, not a magic literal.
- **D-03:** Classification signals map to the requirement language: **active vs dormant** (recent engagement aggregates), **under-messaging** (low outbound/conversation counts), **low retention** (retentionRate below threshold), **token spend** (from `hq_token_usage`). Thresholds live as tunable constants.

### HQB — Cohorts (HQB-04)
- **D-04:** Cohorts are **computed views** over the same deterministic signals (not stored membership rows). **At-risk** = dormant OR under-messaging OR low retention OR stale telemetry. **Power-user** = high engagement + healthy retention + active messaging. Exact thresholds are Claude's discretion (config constants).

### HQB — Console + drill-in (HQB-01, HQB-05)
- **D-05:** The console is a **studio list/table** (one row per studio: name, health badge, last telemetry received, token spend, key engagement metrics) rendered in the existing `apps/hq` Brain/Dispatch shell using shadcn `Table`. Reuse existing HQ routes/components (e.g. `overview.tsx`, `metrics.tsx`, brain shell) rather than inventing a new layout.
- **D-06:** Drill-in (HQB-05) is a **per-studio detail route** showing telemetry **history over time** (charts of snapshot metrics across `hq_telemetry_snapshots`). Progressive disclosure: summary in the list, full history on drill-in.

### HQD — Send path + gating (HQD-01, HQD-02, HQD-03)
- **D-07:** HQD **mirrors the studio chokepoint** — copy the gate logic from `services/worker/src/domain/gates/optInGate.ts`, `windowGate.ts`, and `sendMessage.ts` into HQ-owned code (in `apps/hq` and/or `services/hq-worker`), using **HQ's own WABA credentials** + `hq_whatsapp_opt_in`. **Never import `services/worker` or `services/edge-webhooks`** (CI-checkable constraint — Pitfall: B2B sends from a member WABA).
- **D-08:** The owner-send action's Zod schema is **structurally member-excluded** (`.strict()`): it accepts only an owner-contact reference (resolved from `hq_whatsapp_opt_in` / `hq_studios` owner contact) + a system/product-topic body. **No** member id / email / phone / freeform member field exists in the schema — mirrors the v1.2 consent-exclusion structural pattern. The HQD agent system prompt additionally states the operator-comms constraint; HQ Neon physically contains no member data, so there is nothing to leak.
- **D-09:** Gating order mirrors the studio chokepoint: opt-in gate → 24h-window gate → approved-template gate (out-of-window sends must use an approved HQ owner-comms template, rejected at the sender layer otherwise).

### HQD — Content + Video (HQD-04, HQD-05)
- **D-10:** Copy the **Content** template surface into `apps/hq` on the **non-collab path** (BD1 D-03 — single super-admin, no Yjs/CRDT), wired so the dispatcher agent can generate marketing content from Brain insights.
- **D-11:** **Video (HQD-05) is lowest priority — sequenced last.** Build Content this phase; Video may slip to a follow-up plan if time-constrained. The dedicated Remotion render cluster is **deferred** (REQUIREMENTS non-goal — use a lighter path if Video is attempted).

### Plan split
- **D-12:** BD3 contains **two parallel plans** (matches ROADMAP): an **HQB plan** (console + classification + cohorts + drill-in + optional brain-ingest queue) and an **HQD plan** (WABA send path + gating + member-excluded schema + Content). Both live in `apps/hq`; HQB optionally touches `services/hq-worker` for `brain-ingest`. HQD depends on HQ-FND only and can overlap HQB.

### Deferred-on-external-dependency (mirrors BD2 mock-first approach)
- **D-13:** **Live HQD sends are deferred** pending two external items: (a) HQ WABA second-phone-number registration in Meta Business Manager (**unconfirmed procedure — research flag, run `/gsd:research-phase` for the HQD plan**); (b) Meta approval of HQ owner-comms templates (calendar dependency, submitted at BD2 completion, 2-7 day wait). Build + unit-test the send path, gating, opt-in, and member-excluded schema **now** with the WhatsApp client mocked — exactly as BD2 built provisioning with provider clients mocked.

### Claude's Discretion
- Exact staleness threshold value, cohort threshold constants, console column set, chart library for drill-in, the precise shape of the owner-send Zod schema, where the HQ send queue lives (`apps/hq` vs `services/hq-worker`), and whether `brain-ingest` ships this phase or is a thin stub — all at Claude's discretion guided by research + existing patterns.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone + phase
- `.planning/REQUIREMENTS.md` — HQB-01..05, HQD-01..05 acceptance criteria + v2.0 non-goals
- `.planning/ROADMAP.md` — Phase BD3 goal + 6 success criteria; "parallel HQB + HQD plans"

### Research (read for HQB/HQD specifics)
- `.planning/research/ARCHITECTURE.md` §V2-8 (HQB gym-owner model, HQD gym-owner dispatcher, system-prompt constraint, brain-ingest queue), lines ~1140-1170, ~1647-1671, ~1761-1856, ~1908-1922
- `.planning/research/PITFALLS.md` Area 3 (WhatsApp compliance at scale — HQD separate WABA, owner opt-in, no studio-worker reference, lines ~273-337); HQ-Brain-PII-accumulation pitfall (~411-416); accessFilter/orgId empty-results pitfall (~392)
- `.planning/research/SUMMARY.md`, `.planning/research/STACK.md`

### Prior-phase context to build on
- `.planning/phases/BD1-hq-foundation/BD1-CONTEXT.md` — apps/hq = Dispatch+Brain fork; D-03 non-collab Content; D-10 HQ org/super-admin seed (Pitfall F-02)
- `.planning/phases/BD2-telemetry-provisioning/BD2-CONTEXT.md` — telemetry snapshot contract; mock-first/deferred-on-external-dependency pattern to reuse for HQD

### Code to build on / mirror
- `packages/hq-schema/src/schema.ts` — `hq_studios`, `hq_telemetry_snapshots`, `hq_token_usage`, `hq_studio_tokens` (HQB reads these); add `hq_whatsapp_opt_in` additively for HQD
- `packages/hq-schema/src/telemetry.ts`, `migrations.ts`, `constants.ts` — extend additively
- `apps/hq/app/routes/` (`overview.tsx`, `metrics.tsx`, `messaging.tsx`, `brain/`) + `apps/hq/app/components/brain/` — HQB console + drill-in surfaces
- `apps/hq/actions/` (Brain + Dispatch action copies, `run.ts`, agent-chat plugin) — HQD send action + Content actions
- `services/worker/src/domain/gates/optInGate.ts`, `windowGate.ts`, `sendMessage.ts` — **mirror (copy logic), do not import** for the HQ send path
- `services/hq-worker/src/` — optional `brain-ingest` queue + HQ send queue
- `apps/hq/server/plugins/agent-chat.ts`, `setup-dispatch.ts` — HQD system-prompt constraint goes here
- `templates/content/` — fork source for the HQ Content surface (non-collab)

### Compliance / calendar dependency
- HQD live sends gated on HQ WABA registration (Meta Business Manager, **unconfirmed** — research) + Meta template approval (submitted at BD2 completion, 2-7 day lead time)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/hq` is already a Dispatch + Brain fork (BD1) — Brain routes/components/actions and the agent-chat + dispatch plugins are present. HQB and HQD extend this shell, not greenfield.
- BD2 HQ schema tables (`hq_studios`, `hq_telemetry_snapshots`, `hq_token_usage`, `hq_studio_tokens`) are the entire data source for the HQB console/cohorts/drill-in — no studio DB access.
- Studio chokepoint gates (`optInGate.ts`, `windowGate.ts`, `sendMessage.ts`) are clean, unit-tested modules — ideal to mirror for the HQ-owned send path.
- BD2's mock-first provider pattern (build + unit-test with the external client mocked, defer live runs) is the template for HQD's WhatsApp send path.

### Established Patterns
- Additive-only migrations via `runMigrations` (HQ side) — add `hq_whatsapp_opt_in` additively.
- Zod `.strict()` structural exclusion (v1.2 member-consent; BD2 telemetry) — apply to the owner-send action schema.
- HQ org + super-admin seed (BD1 D-10) so `accessFilter`/`orgId` Brain/Dispatch queries return data (Pitfall F-02).
- Deterministic SQL aggregates for classification (no LLM in the trust path) — consistent with the PII-free, auditable HQ posture.

### Integration Points
- HQB: new/extended HQ routes (studio-list console + per-studio drill-in), reading hq-schema; optional `brain-ingest` queue in `services/hq-worker`.
- HQD: `hq_whatsapp_opt_in` table; owner-send action (member-excluded schema); HQ-owned send queue + gates using HQ WABA creds; HQD constraint in the agent-chat system prompt; Content surface copied from `templates/content`.
</code_context>

<specifics>
## Specific Ideas
- Health classification must be **deterministic and auditable** — the operator should be able to see *why* a studio is at-risk (which signal tripped), not just an opaque LLM verdict.
- Stale telemetry is a first-class state, not an edge case: a silent/missing studio must visibly read as `stale`, never blend into `healthy`.
- HQD's member-exclusion is **structural** (schema can't express a member target) + reinforced by the empty-by-construction HQ Neon — defense in depth.
- Mirror, never import, the studio chokepoint — a CI/grep guard that fails if HQD code references `services/worker` or `services/edge-webhooks` enforces the WABA-separation constraint.
</specifics>

<deferred>
## Deferred Ideas
- Live HQD WhatsApp sends to gym owners — needs HQ WABA second-phone-number registration (Meta Business Manager, procedure unconfirmed) + Meta template approval. Code + gating + schema built and mock-tested now.
- Video generation (HQD-05) dedicated Remotion render cluster — heavy infra; HQD-05 is lowest priority and may use a lighter path or slip to a follow-up plan.
- Brain LLM distillation as a richer narrative layer over telemetry — additive to the deterministic console; can be a thin stub this phase and deepened later.
- Studio-tier Brain/Dispatcher (BD4 GOB/GOD).
- Zero-touch billing/trial gating at signup (PROV-FUT-01).
</deferred>

---

*Phase: BD3-hq-brain-dispatcher*
*Context gathered: 2026-06-19*
