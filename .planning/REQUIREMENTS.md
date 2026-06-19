# Requirements: GymClassOS — Milestone v2.0 Self-Serve Platform + Two-Tier Brain/Dispatcher

**Defined:** 2026-06-19
**Core Value:** A gym signs up on the GymClassOS site and gets a fully provisioned, independent system with zero human steps; the operator gets a brain/dispatcher to understand and grow gym-owner customers; each gym gets its own brain/dispatcher to activate its members — all with no member PII ever leaving the studio deploy.

> **Milestone scope note:** This file holds the **v2.0** requirements only. v1.2 (Agentic Tab Editing) requirements are archived alongside as `REQUIREMENTS-v1.2-archived.md`; v1.1 as `REQUIREMENTS-v1.1-archived.md`; v1.0 lives in `master` git history.

> **Research:** `.planning/research/SUMMARY.md` (+ STACK / FEATURES / ARCHITECTURE / PITFALLS). Headlines: 3 new deps (`@neondatabase/api-client`, `@vercel/sdk`, `execa`); provisioner runs in `services/hq-worker` on Fly (flyctl subprocess + org-scoped token — NOT a Vercel function); PII-up boundary is structural (Zod `.strict()` ingest schema + no studio DB creds in HQ + CI guard); HQ needs its own WABA (separate from any studio WABA); provisioning rollback/idempotency ships BEFORE the happy path.

> **Three tiers:** Tier 1 = You / GymClassOS HQ (operator). Tier 2 = Gym-owners (your customers). Tier 3 = Gym members. Both Tier 1 and Tier 2 get their own Brain + Dispatcher. Hard boundary: Tier-1 dispatcher -> gym-owners only, system topics only; member comms live at Tier 2 inside the studio deploy.

## v2.0 Requirements

### HQ Foundation (HQ-FND)

- [ ] **HQ-FND-01**: Operator can sign in to `apps/hq` as a single super-admin via Better-auth; studio staff accounts cannot authenticate to HQ and HQ admin cannot authenticate to a studio.
- [x] **HQ-FND-02**: `apps/hq` is forked from agent-native Dispatch + Brain templates following fork-boundary discipline — `templates/` is never edited in place; HQ modifications live under `apps/hq/`.
- [ ] **HQ-FND-03**: HQ runs against its own dedicated Neon project (separate from every studio Neon); schema changes apply additively via `runMigrations` (no `drizzle-kit push`, no destructive SQL).
- [ ] **HQ-FND-04**: An HQ org + super-admin user are seeded at migration time so Brain/Dispatch `accessFilter`/`orgId` queries return results (no silent empty Brain).
- [ ] **HQ-FND-05**: A `services/hq-worker` Fly app skeleton exists (pg-boss against HQ Neon, `/healthz`) ready to host provisioning + scheduled jobs.
- [ ] **HQ-FND-06**: CI guards enforce (a) the `apps/hq` fork boundary and (b) that HQ schema/telemetry never stores PII-shaped columns or a studio Neon connection string.

### Provisioning (PROV)

- [ ] **PROV-01**: A prospective gym can submit a signup on the GymClassOS marketing site, which creates a `provisioning_run` record in HQ and returns immediately.
- [ ] **PROV-02**: HQ programmatically creates a new customer's Neon project (via `@neondatabase/api-client`) and captures its connection string into that customer's secret store (never into HQ's own schema).
- [ ] **PROV-03**: HQ runs the studio schema migrations + initial seed + studio admin user against the newly created Neon project.
- [ ] **PROV-04**: HQ programmatically creates a Vercel project, injects env, and deploys `staff-web` for the new customer (via `@vercel/sdk`).
- [ ] **PROV-05**: HQ programmatically creates the customer's Fly app(s) (edge-webhooks + worker) and sets their secrets via `flyctl` (org-scoped token, `execa` array args — no shell injection).
- [ ] **PROV-06**: HQ configures the customer's subdomain/DNS so the staff-web and webhook endpoints resolve.
- [ ] **PROV-07**: HQ registers the new customer in the studio registry and issues a per-studio telemetry token.
- [ ] **PROV-08**: Every provisioning step is idempotent (step-tracking + find-or-create); a retried run never creates duplicate Neon projects, Vercel projects, or Fly apps.
- [ ] **PROV-09**: On partial failure the provisioning saga compensates (LIFO rollback) so no orphaned Neon/Vercel/Fly resources remain; rollback logic is implemented before the happy path.
- [ ] **PROV-10**: The provisioning orchestrator runs in `services/hq-worker` (not a Vercel function); the operator can see each run's per-step status/progress and failures in HQ.

### Telemetry (TEL)

- [ ] **TEL-01**: Each studio deploy captures per-studio AI token usage (input + output tokens) at the Anthropic call-site, with no prompt/response content retained.
- [ ] **TEL-02**: Each studio computes aggregate, PII-free engagement + retention metrics (e.g. active members, bookings, messages sent, mobile-app engagement, retention rate) for a reporting window.
- [ ] **TEL-03**: Each studio pushes a telemetry snapshot to HQ on a schedule, authenticated by its per-studio token.
- [ ] **TEL-04**: The HQ telemetry ingest endpoint validates every payload against a Zod `.strict()` `TelemetrySnapshot` schema that structurally rejects any field not in the aggregate allow-list (no names/emails/phones/message content).
- [ ] **TEL-05**: HQ stores telemetry snapshots per studio and records `last_telemetry_received_at`.
- [ ] **TEL-06**: HQ never holds a studio's Neon connection string and never queries a studio database directly (enforced by HQ-FND-06 CI guard).

### HQ Brain (HQB)

- [ ] **HQB-01**: Operator can view a console listing all gym customers with health + engagement summaries derived from telemetry.
- [ ] **HQB-02**: HQB classifies each customer's health/at-risk status from telemetry (active vs dormant, under-messaging, low retention, token spend).
- [ ] **HQB-03**: HQB uses `last_telemetry_received_at` to exclude stale/missing-telemetry studios from false "active/healthy" signals.
- [ ] **HQB-04**: Operator can view customer cohorts ("sets of clients") such as at-risk and power users.
- [ ] **HQB-05**: Operator can drill into a single customer's installation performance over time.

### HQ Dispatcher (HQD)

- [ ] **HQD-01**: HQ has its own WhatsApp Business Account + `hq_whatsapp_opt_in` tracking for gym-owner contacts, fully separate from any studio WABA.
- [ ] **HQD-02**: Operator (via the HQ dispatcher agent) can send WhatsApp comms to gym OWNERS about system/product topics; the action's Zod schema structurally excludes member-directed sends and member data (HQD can never message gym members).
- [ ] **HQD-03**: HQD owner messaging routes through Meta 24h-window / approved-template gating (reusing the established chokepoint pattern).
- [ ] **HQD-04**: HQD can generate marketing **Content** for the GymClassOS website from HQ Brain insights (agent-native Content tools).
- [ ] **HQD-05**: HQD can generate marketing **Video** for the GymClassOS website (agent-native Video tools). *(Lowest priority within v2.0; sequenced last.)*

### Gym-owner Brain (GOB)

- [ ] **GOB-01**: Each studio deploy stores the studio's brand + ethos (brand voice) as Brain knowledge.
- [ ] **GOB-02**: Each studio deploy stores its classes + fitness methods as Brain context usable by the dispatcher.
- [ ] **GOB-03**: The gym owner can view and edit their studio Brain (brand voice, ethos, methods) from the staff app.

### Gym-owner Dispatcher (GOD)

- [ ] **GOD-01**: Each studio sends its gym owner a daily WhatsApp digest of the studio's own telemetry/metrics.
- [ ] **GOD-02**: Each studio runs a daily "heartbeat" job (pg-boss schedule, studio IANA timezone) that detects dormant members.
- [ ] **GOD-03**: The heartbeat sends member reactivation messages through the existing worker `sendMessage` chokepoint (opt-in + 24h-window + approved-template gates apply unchanged).
- [ ] **GOD-04**: Reactivation enforces a suppression ceiling (max 3 attempts / 90-day window) and honors member opt-outs.
- [ ] **GOD-05**: Reactivation messages are personalized from the studio's GOB brand/ethos, with a generic fallback when GOB is not yet seeded.

## Future Requirements

Deferred beyond v2.0 (tracked, not in this roadmap):

### Operator (HQ)

- **HQ-FUT-01**: Multi-user HQ admin org with roles (admin/viewer). *(v2.0 is single super-admin.)*
- **HQ-FUT-02**: Real-time collaborative editing (Yjs) on HQ content surfaces. *(Single super-admin makes this unnecessary for v2.0.)*

### Provisioning

- **PROV-FUT-01**: Self-service plan/billing selection + Stripe-gated provisioning at signup.
- **PROV-FUT-02**: Customer self-serve teardown / data export.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Member PII flowing up to HQ | Hard architectural + privacy boundary; HQ sees aggregate telemetry only. Enforced structurally (Zod `.strict()` + no studio DB creds + CI guard). |
| HQ querying a studio's Neon directly | Telemetry is push-up only; HQ never holds studio DB credentials. Preserves tenant isolation. |
| Multi-tenant single-DB / `studio_id` columns | Locked tenancy decision — each customer is a fully independent deploy. v2.0 doubles down via per-customer provisioning. |
| HQD messaging gym members | Tier-1 dispatcher talks to gym-owners about system topics only. Member comms live at Tier 2. Structurally excluded in HQD action schemas. |
| Remotion render cluster for HQD video | Heavy infra; HQD-05 is lowest-priority and may use a lighter path. Defer the dedicated render cluster until video is validated. |
| Zero-touch billing/trial gating at signup | v2.0 provisions the system; commercial gating (PROV-FUT-01) follows. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HQ-FND-01 | Phase BD1 | Pending |
| HQ-FND-02 | Phase BD1 | Complete |
| HQ-FND-03 | Phase BD1 | Pending |
| HQ-FND-04 | Phase BD1 | Pending |
| HQ-FND-05 | Phase BD1 | Pending |
| HQ-FND-06 | Phase BD1 | Pending |
| TEL-01 | Phase BD2 | Pending |
| TEL-02 | Phase BD2 | Pending |
| TEL-03 | Phase BD2 | Pending |
| TEL-04 | Phase BD2 | Pending |
| TEL-05 | Phase BD2 | Pending |
| TEL-06 | Phase BD2 | Pending |
| PROV-01 | Phase BD2 | Pending |
| PROV-02 | Phase BD2 | Pending |
| PROV-03 | Phase BD2 | Pending |
| PROV-04 | Phase BD2 | Pending |
| PROV-05 | Phase BD2 | Pending |
| PROV-06 | Phase BD2 | Pending |
| PROV-07 | Phase BD2 | Pending |
| PROV-08 | Phase BD2 | Pending |
| PROV-09 | Phase BD2 | Pending |
| PROV-10 | Phase BD2 | Pending |
| HQB-01 | Phase BD3 | Pending |
| HQB-02 | Phase BD3 | Pending |
| HQB-03 | Phase BD3 | Pending |
| HQB-04 | Phase BD3 | Pending |
| HQB-05 | Phase BD3 | Pending |
| HQD-01 | Phase BD3 | Pending |
| HQD-02 | Phase BD3 | Pending |
| HQD-03 | Phase BD3 | Pending |
| HQD-04 | Phase BD3 | Pending |
| HQD-05 | Phase BD3 | Pending |
| GOB-01 | Phase BD4 | Pending |
| GOB-02 | Phase BD4 | Pending |
| GOB-03 | Phase BD4 | Pending |
| GOD-01 | Phase BD4 | Pending |
| GOD-02 | Phase BD4 | Pending |
| GOD-03 | Phase BD4 | Pending |
| GOD-04 | Phase BD4 | Pending |
| GOD-05 | Phase BD4 | Pending |

**Coverage:**
- v2.0 requirements: 40 total (HQ-FND 6, PROV 10, TEL 6, HQB 5, HQD 5, GOB 3, GOD 5)
- Mapped to phases: 40
- Unmapped: 0

---
*Requirements defined: 2026-06-19*
*Last updated: 2026-06-19 — traceability populated by roadmapper (BD1-BD4, 40/40 mapped)*
