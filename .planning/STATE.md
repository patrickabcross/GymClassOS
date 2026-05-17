# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-17)

**Core value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp conversations + class bookings + member context); members book / pay / log activity from the studio's existing mobile app.
**Current focus:** Phase 0 — Audit & De-Risk

## Current Position

Phase: 0 of 4 (Audit & De-Risk)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-05-17 — Roadmap created (4 phases, 91 requirements mapped, coarse granularity)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 0. Audit & De-Risk | 0 | — | — |
| 1a. Data Foundation | 0 | — | — |
| 1b. Webhook + Worker Spine | 0 | — | — |
| 2. Staff Product Surfaces | 0 | — | — |

**Recent Trend:**
- Last 5 plans: none yet
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Phase 1 split into 1a (data + auth + deploy + observability) and 1b (integrations: Stripe + WhatsApp on Fly) because Phase 1 carries 38 of v1's 91 requirements and the research recommended the split when it bloats. Keeps coarse-granularity 4-phase shape.
- Roadmap: v1 = Phases 0, 1a, 1b, 2 only. Phases 3 (mobile), 4 (reporting + KB), 5 (calorie counter) and v1.x quick-wins are post-v1 and do NOT appear in ROADMAP.md.

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 1 research flag (from SUMMARY.md):** Two narrow technical-decision questions likely need `/gsd:research-phase` before Phase 1b planning lands — (a) Vercel-to-Fly Redis routing (public Upstash plan vs. Fly internal HTTP enqueue endpoint), (b) BullMQ vs pg-boss commit point given v1 job-volume estimates.
- **Phase 2 research flag (from SUMMARY.md):** Inbox real-time update strategy (TanStack Query polling vs. SSE vs. Postgres LISTEN/NOTIFY) — Pitfall #24 (polling keeps Neon warm) motivates choosing before inbox UI ships.
- **Customer-facing onboarding gaps (Phase 0 conversation):** Cancellation window policy per studio; late-cancel forfeit confirmation (v1 mode); recurring membership pricing for Stripe setup; default class capacity; existing member opt-in evidence — all listed in SUMMARY.md §Gaps.

## Session Continuity

Last session: 2026-05-17
Stopped at: Roadmap + state files written; awaiting first `/gsd:plan-phase 0` invocation.
Resume file: None
