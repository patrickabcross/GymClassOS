# Milestones

## v2.0 Self-Serve Platform + Two-Tier Brain/Dispatcher (Shipped: 2026-06-19)

**Delivered:** An operator HQ control plane above the gym tenants, zero-touch self-serve provisioning of independent per-customer systems, a PII-free telemetry boundary, and a two-tier Brain/Dispatcher (HQ-tier for understanding/growing gym-owner customers + studio-tier for activating each studio's members).

**Phases completed:** 4 phases (BD1–BD4), 19 plans
**Stats:** 99 commits (49 `feat`), 352 files changed, +58,006/−316 LOC
**Timeline:** 2026-06-19 (single ~9h solo session, research → BD1 → BD4)
**Git range:** `c8b90989` (v2.0 research summary) → `304a9d9c` (BD4 PROJECT.md evolution)
**Archives:** [v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md) · [v2.0-REQUIREMENTS.md](milestones/v2.0-REQUIREMENTS.md)

**Key accomplishments:**

1. **Operator HQ control plane (BD1)** — `apps/hq` forked from Dispatch+Brain, `packages/hq-schema` (additive, no-PII), Better-auth single super-admin + org seed, `services/hq-worker` skeleton (flyctl baked in), two CI guards (fork-boundary + PII-up), Anthropic token-usage seam audited. HQ-FND-01..06.
2. **PII-free telemetry + zero-touch provisioning (BD2)** — `TelemetrySnapshot` Zod `.strict()` (422 on PII), studio token-usage AFTER-INSERT trigger + `buildTelemetrySnapshot`, HQ `/api/telemetry` ingest (token-hash auth) + studio daily push, Neon/Vercel/Fly find-or-create adapters, 8-step provisioning saga with LIFO rollback-first + `runStep` idempotency, public `/api/signup` (202 queue), operator dashboard + watchdog. TEL-01..06 + PROV-01..10.
3. **HQ Brain + Dispatcher (BD3)** — deterministic `classifyStudioHealth` (no LLM in the trust path; staleness-first so stale/missing telemetry is never "healthy"), `DISTINCT ON (studio_id)` last-telemetry exclusion, computed at-risk/power-user cohorts, `/studios` console + drill-in (recharts under `ClientOnly`), HQ-owned mirrored WABA gates (opt-in→24h→template; never imports `services/worker`), member-excluded `.strict()` owner-send action, non-collab Content surface + Video stub. HQB-01..05 + HQD-01..05.
4. **Studio Brain + Dispatcher (BD4)** — per-studio `studio_brain_docs` (brand-voice + ethos editable docs, class catalog auto-seeded from `class_definitions`), `/gymos/brain` owner view+edit; daily owner digest (06:00 studio-tz, numeric metrics) + heartbeat reactivation (09:00 studio-tz) as a NEW producer into the existing `outbound-whatsapp` chokepoint, with a 3/90-day suppression ceiling + synchronous opt-out enforced day one and brand-voice personalization (generic fallback). GOB-01..03 + GOD-01..05.
5. **Two-tier architecture with a hard PII boundary** — HQ never queries a studio DB; studios push only PII-free telemetry up; structural `.strict()` exclusion at every send boundary; CI guards enforce fork boundary, PII-up, and no-worker-import.
6. **Discipline held across all 4 phases** — additive-only migrations throughout, the studio `sendMessage` chokepoint never modified, mock-first/deferred-on-external-dependency for all live WABA/provider work.

**Requirements:** 40/40 v2.0 requirements code-verified (HQ-FND, PROV, TEL, HQB, HQD, GOB, GOD).

### Known Gaps / Deferred

- **No formal milestone audit** — `/gsd:audit-milestone` was not run before completion; per-phase `gsd-verifier` checks all passed (must-haves verified) and 40/40 requirements are checked, but cross-phase integration/E2E was not separately audited.
- **Live UAT pending across BD1–BD4** — deferred-on-external-dependency items persist in each phase's `*-HUMAN-UAT.md`: HQ/studio deploys + provider API tokens, live provisioning runs, live WABA sends (HQ owner-comms + GOD member-reactivation templates await Meta approval, 2-7 day lead), and authenticated browser sessions (no local dev server — NitroViteError).
- **BD4 db.ts version ordering quirk** — pre-existing v15 trigger entry sits after v16-19 in `runMigrations`; safe (idempotent, no dependency) but noted.

---
