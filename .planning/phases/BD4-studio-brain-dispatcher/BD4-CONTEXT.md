# Phase BD4: Studio Brain + Dispatcher - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Mode:** Auto (`--auto`) — recommended defaults grounded in BD3's HQ-tier implementation (this phase is its studio-tier mirror), BD2's mock-first/deferred-on-external-dependency pattern, `.planning/research/` (ARCHITECTURE §V2-8, PITFALLS Area 3), and the existing studio `services/worker` chokepoint + `apps/staff-web` schema.

<domain>
## Phase Boundary

Two parallel tracks giving **each studio deploy** its own gym-owner Brain and Dispatcher — the studio-tier mirror of BD3's HQ-tier Brain/Dispatcher. All work lives in `apps/staff-web` (Brain + edit UI), `services/worker` (digest + heartbeat jobs), and the studio's own Neon (additive schema). The studio chokepoint (`services/worker/src/domain/sendMessage.ts`) is **reused, never modified**.

**GOB (GOB-01..03) — The studio's gym-owner Brain:**
- Studio Brain stores the studio's brand + ethos (brand voice) as Brain knowledge (GOB-01).
- Studio Brain stores classes + fitness methods as dispatcher-usable context (GOB-02), auto-ingested from `class_definitions` on init (owner does not hand-seed class data).
- The gym owner views and edits their studio Brain (brand voice, ethos, methods) from the staff web app at `/gymos/brain` (GOB-03).

**GOD (GOD-01..05) — The studio's owner-facing + member-reactivation dispatcher:**
- Daily WhatsApp **digest** to the gym owner of the studio's own telemetry/metrics (GOD-01).
- Daily **heartbeat** pg-boss job on the studio's IANA timezone that detects dormant members (GOD-02).
- Reactivation messages sent through the **existing worker `sendMessage` chokepoint** — opt-in + 24h-window + approved-template gates apply unchanged (GOD-03).
- **Suppression ceiling** (max 3 attempts / 90-day window) + member opt-out honored, enforced from day one (GOD-04).
- Reactivation messages **personalized** from the studio's GOB brand/ethos, with a generic fallback when GOB is not yet seeded (GOD-05).

**NOT in BD4:** HQ-tier Brain/Dispatcher (that was BD3); modifying `sendMessage.ts` or the gate modules; member-facing Brain UI (owner-facing only); live member sends before Meta template approval (deferred-on-external-dependency, see D-15); billing/trial gating (PROV-FUT-01).
</domain>

<decisions>
## Implementation Decisions

### GOB — Studio Brain storage + auto-ingest (GOB-01, GOB-02)
- **D-01:** The studio Brain forks `templates/brain` into `apps/staff-web` on the **non-collab single-studio path** (mirrors BD1/BD3's `apps/hq` Brain fork; no Yjs/CRDT). Brain knowledge (brand voice, ethos, class methods) persists in the **studio's own Neon** via an **additive migration** (new table(s) in `apps/staff-web/server/db/schema.ts`). Single-tenant code, no `studio_id` column (project tenancy rule).
- **D-02:** **Class catalog auto-ingest (GOB-02):** on Brain init the catalog is populated from the existing `class_definitions` table — the owner never hand-seeds class data. Re-sync cadence (on-init only vs. periodic refresh) is Claude's discretion; on-init is sufficient for the success criterion.
- **D-03:** Brand voice + ethos are stored as **editable documents** (brand-voice document model), distinct from the per-member/per-class operational tables. NOTE: there is **no existing studio-level `brand` field** to reuse — the `brand` column found in schema belongs to `food_items`, not the studio. Brand-voice storage is net-new and additive.

### GOB — Owner Brain edit UI (GOB-03)
- **D-04:** New route `gymos.brain.tsx` (`/gymos/brain`) inside the existing `/gymos` staff shell, following the established `gymos.*` tab convention and using shadcn primitives + progressive disclosure (AGENTS.md UI rules). Owner views brand voice / ethos / class methods and edits the brand-voice document; changes persist and survive reload (Success Criterion 1).
- **D-05:** All Brain writes go through `defineAction` (actions-first) with live-refresh via the `useChangeVersion` pattern established in the AE phases — no bespoke API route. Whether brand-voice editing is *also* exposed as an agent write-tool (AE-style) is out of strict GOB-03 scope (owner view+edit from the staff app is the requirement) and is Claude's discretion.

### GOD — Daily owner digest (GOD-01)
- **D-06:** The digest is a **new pg-boss scheduled job in `services/worker`** that mirrors `telemetry-push.ts` exactly (consumer-registered-first, then `boss.schedule()`; idempotent; unconfigured-skip when owner contact/credentials absent so the worker still boots). It aggregates the studio's **own** metrics by reusing the existing telemetry aggregation (`buildTelemetrySnapshot` / `studio_telemetry_state`) — no new metric pipeline.
- **D-07:** The digest sends to the gym owner via the **existing outbound chokepoint** (enqueue `outbound-whatsapp` → `sendMessage`), so opt-in / 24h-window / approved-template gates apply unchanged. Out-of-window delivery uses an approved owner-digest template. The exact metric set in the digest body is Claude's discretion, drawn from existing telemetry aggregates.

### GOD — Heartbeat + dormant detection (GOD-02)
- **D-08:** The heartbeat is a **separate daily pg-boss schedule at 09:00 in the studio's IANA timezone** (not UTC — distinct from telemetry-push's 02:00 UTC), registered with the same consumer-first / idempotent-schedule pattern. Timezone source is the PROV-seeded owner config (see research flag below); a sensible default applies if unset.
- **D-09:** "Dormant" is determined by **deterministic SQL over attendance/booking activity** (no recent activity within a threshold window) — mirroring BD3's deterministic-classification posture (auditable, no LLM in the trust path). The dormancy window is a **named config constant**, value at Claude's discretion. Detection excludes opted-out members and members without opt-in up front.

### GOD — Reactivation send via existing chokepoint (GOD-03)
- **D-10:** The heartbeat **enqueues** reactivation messages to the existing `outbound-whatsapp` queue via the `@gymos/queue` producer (with its `singletonKey` dedupe). **`sendMessage.ts` and the gate modules (`optInGate.ts`, `windowGate.ts`, `templateGate.ts`) are NOT modified** — all compliance gates apply unchanged at the chokepoint. A CI/grep guard should fail if BD4 heartbeat code modifies or bypasses `sendMessage`.

### GOD — Suppression ceiling + opt-outs (GOD-04)
- **D-11:** Suppression ceiling = **max 3 reactivation attempts per member per rolling 90-day window**, tracked in a **new additive table** (e.g. `reactivation_attempts`: member ref + `sent_at`). The heartbeat queries this **synchronously before enqueue**; members at the ceiling are skipped. Member opt-outs are excluded synchronously too (defense in depth — the chokepoint opt-in gate is a second line, not the only one).
- **D-12:** The ceiling ships **from day one** (Success Criterion 5) — suppression logic is part of the first GOD plan, never deferred to a follow-up. Recording an attempt and checking the ceiling are the same code path that enqueues (no race where a send happens without being counted).

### GOD — Personalization + fallback (GOD-05)
- **D-13:** Reactivation copy is **personalized from the studio's GOB brand voice / ethos** (read studio Brain). When GOB is **not yet seeded**, a **generic fallback** template is used so GOD works standalone. Personalization respects the out-of-window constraint — an approved template with variables, not freeform text out of window.

### Plan split
- **D-14:** BD4 = **two parallel plans** matching the ROADMAP: a **GOB plan** (Brain fork into `apps/staff-web` + class auto-ingest + brand-voice edit UI) and a **GOD plan** (daily digest job + heartbeat job + reactivation-via-chokepoint + suppression table + personalization). GOD's personalization (D-13) reads GOB's brand storage but has a generic fallback, so GOD can be built and unit-tested independently of GOB completion.

### Deferred-on-external-dependency (mirrors BD2/BD3 mock-first)
- **D-15:** **Live GOD member sends are deferred** pending Meta approval of the GOD member-reactivation templates (submitted at BD3 completion per the ROADMAP calendar dependency, 2-7 day lead). Build + unit-test the heartbeat, digest, dormant detection, suppression ceiling, opt-out exclusion, and enqueue path **now** with the WhatsApp send mocked at the chokepoint — exactly as BD2 built provisioning and BD3 built HQD with the provider mocked.

### Claude's Discretion
- Brain knowledge table shape/naming; class re-ingest cadence; dormancy window value; digest metric set + formatting; reactivation template wording; named config constant values; whether brand-voice editing is also an agent write-tool; precise location of the suppression check relative to the enqueue call — all at Claude's discretion guided by research and existing patterns.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone + phase
- `.planning/REQUIREMENTS.md` — GOB-01..03, GOD-01..05 acceptance criteria + v2.0 non-goals
- `.planning/ROADMAP.md` — Phase BD4 goal + 5 success criteria; "parallel GOB + GOD plans"; Meta template calendar dependency (GOD templates submitted at BD3 completion)

### Prior-phase context to mirror (BD4 is the studio-tier of BD3)
- `.planning/phases/BD3-hq-brain-dispatcher/BD3-CONTEXT.md` — HQ-tier Brain fork (D-10 non-collab Content/Brain), deterministic classification (D-01/D-02), chokepoint **mirror-not-import** pattern (D-07), member-excluded schema (D-08), deferred-on-external-dependency (D-13). BD4 applies the same shapes at the studio tier.
- `.planning/phases/BD2-telemetry-provisioning/BD2-CONTEXT.md` — mock-first/deferred-on-external-dependency pattern; telemetry snapshot contract; PROV-seeded studio owner config (timezone/owner contact) source for GOD
- `.planning/phases/BD1-hq-foundation/BD1-CONTEXT.md` — non-collab Brain fork mechanics (templates/brain → app), super-admin/org seed considerations

### Research (read for Brain + dispatcher specifics)
- `.planning/research/ARCHITECTURE.md` §V2-8 — two-tier Brain/Dispatcher (studio-tier GOB/GOD), brand-voice Brain, heartbeat reactivation
- `.planning/research/PITFALLS.md` Area 3 — WhatsApp compliance at scale (opt-in, 24h window, approved templates, suppression); reactivation suppression-ceiling pitfall
- `.planning/research/SUMMARY.md`, `.planning/research/STACK.md`, `.planning/research/FEATURES.md`

### Code to build on / mirror
- `apps/staff-web/server/db/schema.ts` — studio schema; `class_definitions` (auto-ingest source), `gym_members`, bookings/attendance (dormancy detection), `owner_email`; add Brain-knowledge + `reactivation_attempts` tables **additively**
- `apps/staff-web/server/db/migrations/` — additive migration (note migration-drift gotcha: studio migrations are applied by hand, not auto-run)
- `apps/staff-web/app/routes/gymos.*.tsx` — tab convention for the new `gymos.brain.tsx`
- `templates/brain/` — fork source for the studio Brain surface (non-collab path)
- `services/worker/src/queues/telemetry-push.ts` — exact pattern for the GOD daily digest + heartbeat scheduled jobs (consumer-first, idempotent schedule, unconfigured-skip)
- `services/worker/src/queues/outbound-whatsapp.ts` + `services/worker/src/domain/sendMessage.ts` — the chokepoint GOD **enqueues into and must NOT modify**
- `services/worker/src/domain/gates/optInGate.ts`, `windowGate.ts`, `templateGate.ts` — gates that apply unchanged (do not edit)
- `packages/queue/src/publish.ts` — producer (singletonKey dedupe) used to enqueue digest + reactivation messages

### Compliance / calendar dependency
- GOD live member sends gated on Meta approval of member-reactivation templates (submitted at BD3 completion, 2-7 day lead). Meta constraint: out-of-window sends MUST use an approved template, rejected at the sender layer otherwise (project constraint).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `templates/brain/` is a ready fork source — BD1/BD3 already proved the non-collab `templates/brain → app` fork into `apps/hq`; BD4 repeats it into `apps/staff-web`.
- `services/worker/src/queues/telemetry-push.ts` is a clean, unit-tested scheduled-job template (consumer-first registration, idempotent `boss.schedule()`, unconfigured-skip) — directly reusable for both the GOD digest and heartbeat jobs.
- The studio chokepoint is fully built and gated: producer (`@gymos/queue/publish.ts`) → `outbound-whatsapp` queue → `sendMessage` applying opt-in/window/template gates. GOD becomes a new **producer** into this existing path — zero changes to the consumer or gates.
- `buildTelemetrySnapshot` / `studio_telemetry_state` already aggregate the studio's own metrics — the digest reuses these rather than building a new metric pipeline.
- `class_definitions` already holds the catalog for GOB-02 auto-ingest.

### Established Patterns
- Additive-only migrations (no breaking DB changes ever) — Brain-knowledge and `reactivation_attempts` tables are new, additive.
- Migration-drift gotcha: studio `server/db/migrations/*.sql` are NOT auto-run by `db.ts`; the new migration must be applied to the studio Neon by hand or routes 500.
- Deterministic SQL classification (BD3 HQB) for dormancy — auditable, no LLM in the trust path.
- Mock-first / deferred-on-external-dependency (BD2/BD3) — build and unit-test with the WhatsApp send mocked; defer live sends to Meta template approval.
- Actions-first + `useChangeVersion` live-refresh (AE phases) for the Brain edit UI.

### Integration Points
- GOB: new Brain tables in studio Neon; `templates/brain` fork into `apps/staff-web`; `gymos.brain.tsx` route; `defineAction` Brain writes; class auto-ingest reading `class_definitions`.
- GOD: two new `services/worker` scheduled jobs (digest @ studio TZ; heartbeat @ 09:00 studio TZ); `reactivation_attempts` table; dormancy SQL over members/bookings; enqueue via `@gymos/queue` into `outbound-whatsapp`; personalization reading GOB Brain with generic fallback.
</code_context>

<specifics>
## Specific Ideas
- BD4 is deliberately the **studio-tier mirror of BD3** — reuse BD3's shapes (deterministic detection, mock-first sends, non-collab Brain fork) rather than inventing new ones.
- The suppression ceiling is a **first-class, day-one** safety mechanism, not an afterthought — recording an attempt and checking the 3/90-day ceiling are the same path that enqueues, so no message escapes the counter.
- The existing chokepoint is sacred: GOD is a new producer into `outbound-whatsapp`; `sendMessage.ts` and the gates are untouched. A CI/grep guard enforcing this is desirable.
- Dormancy and opt-out exclusion are evaluated **synchronously before enqueue** (defense in depth), even though the chokepoint re-gates.
- GOD must stand alone: a studio with no GOB seed still gets working reactivation via the generic fallback template.

## Research flag (run `/gsd:research-phase` for the GOD plan)
- **Owner contact + IANA timezone source:** BD2/BD4 depend-on language says "PROV seeds `studio_owner_config`", but no `studio_owner_config` table/code exists yet (BD2 deferred live provisioning execution). The GOD plan must confirm where owner contact + timezone come from — either an additive owner-config table/fields owned by BD4, or a PROV artifact to be created. Default if unresolved: BD4 adds the owner-config fields additively with a timezone default.
</specifics>

<deferred>
## Deferred Ideas
- Live GOD member reactivation sends — gated on Meta approval of member-reactivation templates (2-7 day lead). Code + suppression + dormancy + enqueue built and mock-tested now.
- Agent write-tool exposure for brand-voice editing (AE-style) — beyond GOB-03's owner view+edit requirement; can be added later.
- Periodic class-catalog re-sync (beyond on-init ingest) — on-init suffices for the success criterion.
- Richer LLM Brain distillation over the studio's data — additive narrative layer over the deterministic dormancy/digest logic.
- Member-facing Brain/coaching surface — owner-facing only in BD4.

### Reviewed Todos (not folded)
None — `todo match-phase BD4` returned 0 matches.
</deferred>

---

*Phase: BD4-studio-brain-dispatcher*
*Context gathered: 2026-06-19*
