# Phase BD4: Studio Brain + Dispatcher - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** BD4-studio-brain-dispatcher
**Mode:** Auto (`--auto`) — all gray areas auto-selected; recommended defaults applied
**Areas discussed:** Brain storage/auto-ingest, Brain edit UI, Daily owner digest, Heartbeat dormant detection, Reactivation via chokepoint, Suppression ceiling, Personalization+fallback, Plan split, Deferred-on-external-dependency

---

## Brain storage + auto-ingest (GOB-01, GOB-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Fork templates/brain into apps/staff-web, additive studio-Neon tables, auto-ingest class_definitions on init | Mirrors BD1/BD3 apps/hq Brain fork (non-collab); single-tenant | ✓ |
| Greenfield Brain UI + bespoke storage | More work, diverges from proven BD3 pattern | |
| Manual class seeding by owner | Fails GOB-02 success criterion (owner does not hand-seed) | |

**Auto-selected:** Fork + additive tables + on-init class auto-ingest (D-01, D-02, D-03) — recommended default.

## Brain edit UI (GOB-03)

| Option | Description | Selected |
|--------|-------------|----------|
| New gymos.brain.tsx route in existing shell, defineAction writes, useChangeVersion live-refresh | Follows gymos.* tab + AE-phase conventions | ✓ |
| Separate standalone Brain app | Breaks the single staff shell UX | |

**Auto-selected:** `/gymos/brain` route, actions-first, live-refresh (D-04, D-05) — recommended default.

## Daily owner digest (GOD-01)

| Option | Description | Selected |
|--------|-------------|----------|
| New pg-boss scheduled job mirroring telemetry-push.ts, reuse buildTelemetrySnapshot, send via existing chokepoint | Proven scheduled-job + chokepoint pattern | ✓ |
| New metric pipeline + direct WhatsApp send | Duplicates telemetry aggregation; bypasses gates | |

**Auto-selected:** Mirror telemetry-push.ts, reuse aggregates, enqueue to outbound-whatsapp (D-06, D-07) — recommended default.

## Heartbeat dormant detection (GOD-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Daily pg-boss schedule @ 09:00 studio IANA TZ; deterministic SQL dormancy over attendance/bookings | Auditable, mirrors BD3 deterministic classification | ✓ |
| LLM-driven dormancy scoring | Cost + non-auditable; against PII-free posture | |
| UTC schedule | Fails "studio IANA timezone" criterion | |

**Auto-selected:** 09:00 studio-TZ schedule + deterministic SQL, dormancy window as named constant (D-08, D-09) — recommended default.

## Reactivation via chokepoint (GOD-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Heartbeat enqueues into existing outbound-whatsapp queue; sendMessage.ts NOT modified; CI/grep guard | Gates apply unchanged; chokepoint sacred | ✓ |
| Heartbeat calls a new send path | Duplicates gates; violates project constraint | |

**Auto-selected:** Enqueue-only producer, no chokepoint changes (D-10) — recommended default.

## Suppression ceiling + opt-outs (GOD-04)

| Option | Description | Selected |
|--------|-------------|----------|
| New reactivation_attempts table; synchronous 3/90-day check before enqueue; opt-out excluded synchronously; day-one | Defense in depth; meets day-one criterion | ✓ |
| Rely only on chokepoint gates | No attempt-count tracking; can't enforce 3/90-day | |
| Defer suppression to a follow-up | Violates Success Criterion 5 (day one) | |

**Auto-selected:** reactivation_attempts table + synchronous ceiling check, shipped day one (D-11, D-12) — recommended default.

## Personalization + fallback (GOD-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Personalize from GOB brand voice; generic fallback template when GOB unseeded; approved-template out of window | Lets GOD stand alone; compliant | ✓ |
| Always generic | Misses GOB personalization requirement | |
| Freeform personalized text out of window | Violates Meta template constraint | |

**Auto-selected:** Brand-voice personalization with generic fallback (D-13) — recommended default.

## Plan split

| Option | Description | Selected |
|--------|-------------|----------|
| Two parallel plans: GOB (Brain + UI) + GOD (digest + heartbeat + suppression + personalization) | Matches ROADMAP; GOD standalone via fallback | ✓ |
| Single monolithic plan | Larger, less parallelizable | |

**Auto-selected:** Two parallel plans (D-14) — recommended default.

## Deferred-on-external-dependency

| Option | Description | Selected |
|--------|-------------|----------|
| Mock-first: build + unit-test send path now, defer live member sends to Meta template approval | Mirrors BD2/BD3 | ✓ |
| Block phase on Meta approval | Stalls all GOD work on a 2-7 day external dependency | |

**Auto-selected:** Mock-first, defer live sends (D-15) — recommended default.

## Claude's Discretion

- Brain knowledge table shape/naming; class re-ingest cadence; dormancy window value; digest metric set + formatting; reactivation template wording; named config constant values; whether brand-voice editing is also an agent write-tool; precise location of the suppression check relative to enqueue.

## Deferred Ideas

- Live GOD member sends (Meta template approval); agent write-tool for brand voice; periodic class re-sync; richer LLM Brain distillation; member-facing Brain surface.

## Research flag

- Owner contact + IANA timezone source: no `studio_owner_config` exists in code yet despite the depend-on language. The GOD plan must confirm the source or add owner-config fields additively (with a timezone default).
