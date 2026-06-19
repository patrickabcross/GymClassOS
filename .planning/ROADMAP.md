# Roadmap: GymClassOS

---

## v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher

> **Started:** 2026-06-19 | **Branch:** `master`
>
> **Goal:** A gym signs up on the GymClassOS site and gets a fully provisioned, independent system with zero human steps; the operator (you) gets a brain/dispatcher to understand and grow your gym-owner customers; each gym gets its own brain/dispatcher to activate its members — all with no member PII ever leaving the studio deploy.
>
> **Three tiers:** Tier 1 = You / GymClassOS HQ (operator). Tier 2 = Gym-owners (your customers). Tier 3 = Gym members. Both Tier 1 and Tier 2 get their own Brain + Dispatcher.
>
> **Phase prefix:** BD — avoids `.planning/phases/` directory collisions with existing AE/R/D/P phase directories.

### Key constraints baked into every phase

- **Structural PII-up boundary:** No member names/emails/phones/message content in HQ Neon ever. Enforced by three mechanisms: no studio DB credentials in HQ env; Zod `.strict()` TelemetrySnapshot schema (422 on any unknown field); CI guard blocking HQ schema columns matching `*connection*`/`*database_url*`/`*dsn*`.
- **Additive-only DB changes:** Both HQ Neon and each studio Neon. `drizzle-kit generate` + `drizzle-kit migrate` only; no `drizzle-kit push`; no DROP/TRUNCATE/destructive ALTER.
- **Fork-boundary discipline:** `templates/` is never edited in place. HQ work in `apps/hq/`. Tier-2 additions in `apps/staff-web/` + `services/worker/`. Two-commit discipline: copy first, modify second.
- **No local dev server:** NitroViteError prevents `pnpm dev` on staff-web. Verification via deploy or unit tests + `tsc`.
- **Single super-admin:** HQ v2.0 is one operator account. Multi-user/roles deferred to v2.x.
- **Provisioner in hq-worker, not Vercel:** 8-step saga exceeds Vercel timeout; must run as a Fly pg-boss job.
- **Rollback before happy path:** PROV saga LIFO rollback compensation code ships before any real API calls are wired.
- **WABA separation:** HQ owns its own WhatsApp Business Account for owner-comms; studio WABAs are member-comms only. Never mixed.
- **Meta template lead times (calendar dependencies):** HQD owner-comms templates submitted at BD2 completion (2-7 day approval before BD3 HQD goes live). GOD member reactivation templates submitted at BD3 completion (2-7 day approval before BD4 GOD goes live).

## Phases

- [x] **Phase BD1: HQ Foundation** — `apps/hq` scaffolded (Dispatch + Brain copy-out fork; Videos/Yjs excluded); packages/hq-schema + HQ Neon; super-admin Better-auth; HQ org seed; `services/hq-worker` skeleton (flyctl baked in); CI guards; Anthropic call-site audit — **6 plans, 3 waves**
 (completed 2026-06-19)
- [x] **Phase BD2: Telemetry + Provisioning** — Parallel TEL plan (Zod strict schema, studio token accumulator, daily push, HQ ingest) + PROV plan (8-step saga with LIFO rollback first, then happy path; idempotent; watchdog); both plans independent within the phase
 (completed 2026-06-19)
- [x] **Phase BD3: HQ Brain + Dispatcher** — Parallel HQB plan (health scoring, cohort views, at-risk exclusion via `last_telemetry_received_at`) + HQD plan (own WABA, owner opt-in, onboarding nudge sequence, Content generation); HQD Meta templates submitted at BD2 completion — **5 plans, 2 waves**
 (completed 2026-06-19)
- [ ] **Phase BD4: Studio Brain + Dispatcher** — Parallel GOB plan (Brain template copy-in to staff-web, class catalog auto-ingest, brand voice UI) + GOD plan (daily owner digest, heartbeat reactivation via existing chokepoint, suppression ceiling); GOD Meta templates submitted at BD3 completion

## Phase Details

### Phase BD1: HQ Foundation
**Goal**: The operator can sign in to a running `apps/hq` control plane backed by its own Neon project; the structural PII boundary and fork-discipline CI guards are in place from day one; the Anthropic call-site is audited so the token-usage wrapper can be wired in BD2
**Depends on**: Nothing (first BD phase)
**Requirements**: HQ-FND-01, HQ-FND-02, HQ-FND-03, HQ-FND-04, HQ-FND-05, HQ-FND-06
**Success Criteria** (what must be TRUE):
  1. Operator can navigate to the `apps/hq` Vercel deploy, sign in as the single super-admin, and reach the HQ dashboard — no studio staff credential can authenticate to HQ
  2. `git diff upstream/main HEAD -- templates/` returns empty (fork boundary preserved; all HQ modifications live under `apps/hq/`)
  3. `pnpm guards` (CI guard suite) fails if any HQ schema migration adds a column matching `*connection*`, `*database_url*`, or `*dsn*`
  4. Navigating to the HQ Brain or Dispatch routes returns real (non-empty) results — the HQ org + super-admin seed row is present, so `accessFilter`/`orgId` queries return data, not empty arrays
  5. `services/hq-worker` `/healthz` endpoint responds with HTTP 200 on its Fly deploy (pg-boss bootstrapped against HQ Neon)
**Plans**: 6 plans (3 waves)

Plans:
- [x] BD1-01-PLAN.md (wave 1) — apps/hq scaffold: copy-out fork of Dispatch shell + Brain surfaces; exclude Videos/Yjs; MODIFICATIONS.md ledger [HQ-FND-02]
- [x] BD1-02-PLAN.md (wave 1) — packages/hq-schema package + apps/hq db plugin (runMigrations, additive) against HQ-own Neon [HQ-FND-03]
- [x] BD1-05-PLAN.md (wave 1) — Anthropic call-site audit -> BD1-ANTHROPIC-AUDIT.md wrapper-insertion spec (gates BD2 TEL-01)
- [x] BD1-03-PLAN.md (wave 2) — Better-auth single super-admin + HQ org seed in runMigrations; deployment-level isolation [HQ-FND-01, HQ-FND-04]
- [x] BD1-04-PLAN.md (wave 2) — services/hq-worker Fly skeleton (pg-boss + /healthz) + flyctl baked into image for BD2 [HQ-FND-05]
- [x] BD1-06-PLAN.md (wave 3) — two CI guards: guard:hq-fork-boundary + guard:hq-no-pii, wired into pnpm guards chain [HQ-FND-06]
**UI hint**: yes

### Phase BD2: Telemetry + Provisioning
**Goal**: Studios push aggregate (PII-free) telemetry to HQ on a schedule; HQ ingests it via a Zod-strict schema that structurally rejects PII; the provisioning saga (with LIFO rollback) orchestrates Neon + Vercel + Fly APIs to fully provision a new studio — idempotently and with operator-visible step progress
**Depends on**: Phase BD1
**Requirements**: TEL-01, TEL-02, TEL-03, TEL-04, TEL-05, TEL-06, PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, PROV-06, PROV-07, PROV-08, PROV-09, PROV-10
**Success Criteria** (what must be TRUE):
  1. Submitting a signup on the GymClassOS site creates a `provisioning_run` row and returns immediately; the operator can see per-step status and progress in the HQ dashboard
  2. A successfully provisioned studio has an independent Neon project, a Vercel staff-web deploy, and Fly edge-webhooks + worker — all reachable at their URLs — with zero manual operator steps
  3. Retrying a provisioning run that previously succeeded at step 3 (Neon created, Vercel not yet created) resumes at step 4 without creating a second Neon project or Fly app
  4. Deliberately failing the provisioning run at step 6 triggers LIFO rollback: no orphaned Neon projects, Vercel projects, or Fly apps remain after the compensating actions complete
  5. A studio's daily telemetry push arrives at `POST /api/telemetry` with a valid token; HQ records `last_telemetry_received_at`; submitting a payload containing a `member_email` field returns HTTP 422 (structurally rejected)
  6. HQ never stores or queries a studio's Neon connection string (CI guard confirms no such column exists in HQ schema)
**Plans**: 6 plans (3 waves)

Plans:
- [x] BD2-01-PLAN.md (wave 1) -- HQ schema extension: additive v4-v7 migrations + Drizzle defs (hq_studios, hq_provisioning_runs, hq_telemetry_snapshots, hq_token_usage, hq_studio_tokens) + canonical TelemetrySnapshot Zod .strict() schema [TEL-04, TEL-05, TEL-06, PROV-07, PROV-08, PROV-09]
- [x] BD2-02-PLAN.md (wave 1) -- Provider adapters behind NeonApi/VercelApi/FlyApi interfaces (find-or-create idempotency) + mocks + flyctl-execa secrets (array args, key-name logging) + env token activation [PROV-02, PROV-04, PROV-05, PROV-06, PROV-08]
- [x] BD2-03-PLAN.md (wave 1) -- Studio telemetry capture: studio_telemetry_state + AFTER INSERT trigger on token_usage (fork-safe, no core edit) + buildTelemetrySnapshot aggregate SQL [TEL-01, TEL-02]
- [x] BD2-04-PLAN.md (wave 2) -- HQ ingest endpoint (sha256 token + .strict() 422 + last_telemetry_received_at) + studio daily pg-boss push job [TEL-03, TEL-04, TEL-05, TEL-06]
- [x] BD2-05-PLAN.md (wave 2) -- Saga core: LIFO rollback FIRST + per-step idempotency (runStep) + 8-step provision-studio saga against mocked adapters (live deferred) [PROV-02, PROV-03, PROV-04, PROV-05, PROV-06, PROV-08, PROV-09]
- [x] BD2-06-PLAN.md (wave 3) -- Public signup intake (202 + enqueue) + operator provisioning dashboard (per-step status) + watchdog (stuck runs + missing telemetry) + hq-worker registration [PROV-01, PROV-07, PROV-10]
**UI hint**: yes

### Phase BD3: HQ Brain + Dispatcher
**Goal**: The operator can see a live model of all gym-owner customers (health cohorts, at-risk studios, performance over time) derived from telemetry; and can dispatch WhatsApp comms to gym owners about system/product topics via HQ's own WABA — never about member activity
**Depends on**: Phase BD2 (telemetry snapshots flowing to HQ; PROV seeds studio_owner_config used by GOD templates in BD4)
**Requirements**: HQB-01, HQB-02, HQB-03, HQB-04, HQB-05, HQD-01, HQD-02, HQD-03, HQD-04, HQD-05
**Success Criteria** (what must be TRUE):
  1. Operator can open the HQ console and see all provisioned studios listed with health summaries (active vs dormant, last telemetry received, token spend); studios with stale or missing telemetry are not falsely classified as healthy
  2. Operator can view cohort views — at-risk studios and power-user studios — each derived from telemetry aggregates with `last_telemetry_received_at` exclusion applied
  3. Operator can drill into a single studio's installation performance over time (telemetry history)
  4. Operator can ask the HQ dispatcher agent to send a WhatsApp message to a gym owner about a system/product topic; the action's Zod schema structurally prevents any member-directed payload or member-PII field from being included
  5. HQD owner messages route through a 24h-window + approved-template gate on HQ's own WABA (separate from any studio WABA); no HQD code references `services/worker` or `services/edge-webhooks`
  6. Operator can use the HQ content surface (agent-native Content tools) to generate marketing content for the GymClassOS website from Brain insights
**Plans**: 5 plans (2 waves)

Plans:
- [x] BD3-01-PLAN.md (wave 1) — HQB classification engine (deterministic, staleness-first) + threshold constants + list-studios action + GET /api/studios read model [HQB-01, HQB-02, HQB-03, HQB-04]
- [x] BD3-03-PLAN.md (wave 1) — HQD send foundation: hq_whatsapp_opt_in/templates migrations (v8/v9) + mirrored gates (opt-in/window/template) + HqWabaClient mock + sendOwnerMessage orchestrator + no-worker-import CI guard [HQD-01, HQD-03]
- [x] BD3-02-PLAN.md (wave 2, after 01) — HQB console: /studios list (shadcn Table + health badges + cohort filter) + /studios/:id drill-in (recharts history, ClientOnly SSR-guarded) + snapshots resource route [HQB-01, HQB-04, HQB-05]
- [x] BD3-04-PLAN.md (wave 2, after 03) — send-owner-whatsapp .strict() member-excluded action + HQD system-prompt constraint + hq-owner-send pg-boss queue (mock client, live deferred) [HQD-02, HQD-03]
- [x] BD3-05-PLAN.md (wave 2, after 03) — Content fork (non-collab Tiptap, no Yjs/Notion) + document CRUD + Video thin stub [HQD-04, HQD-05]
**UI hint**: yes

### Phase BD4: Studio Brain + Dispatcher
**Goal**: Each studio deploy has a gym-owner Brain (classes, fitness methods, brand voice) that the owner can view and edit; the owner receives a daily WhatsApp digest of their own metrics; dormant members receive personalized reactivation messages through the existing worker sendMessage chokepoint — with a suppression ceiling enforced from day one
**Depends on**: Phase BD2 (anthropic.ts wrapper in place; PROV seeds studio_owner_config; TEL accumulator pattern reused by daily digest)
**Requirements**: GOB-01, GOB-02, GOB-03, GOD-01, GOD-02, GOD-03, GOD-04, GOD-05
**Success Criteria** (what must be TRUE):
  1. Studio owner can open `/gymos/brain` in the staff web app, view their studio Brain (brand voice, ethos, class methods), and edit the brand voice document — changes persist and are visible on reload
  2. Studio Brain is pre-populated with the class catalog (from `class_definitions`) on Brain init — owner does not need to manually seed class data
  3. Studio owner receives a daily WhatsApp digest of their studio's own metrics (delivered via the existing worker chokepoint; opt-in/24h-window/template gates apply unchanged)
  4. A pg-boss heartbeat job runs daily at 09:00 in the studio's IANA timezone; it detects dormant members and enqueues reactivation messages through `sendMessage` (sendMessage.ts is NOT modified); all existing compliance gates apply
  5. A member who has received 3 reactivation attempts within any 90-day window receives no further heartbeat messages (suppression ceiling enforced from day one); members who opt out are excluded synchronously
**Plans**: 2 plans (2 waves)

Plans:
- [x] BD4-01-PLAN.md (wave 1) — GOB: additive studio_brain_docs (+ studio_owner_config + reactivation_attempts tables, all owned here to avoid db.ts collision) + class-catalog auto-ingest from class_definitions on Brain init + /gymos/brain owner view/edit UI (defineAction writes + useChangeVersions live-refresh) [GOB-01, GOB-02, GOB-03]
- [ ] BD4-02-PLAN.md (wave 2, after 01) — GOD: daily owner digest (buildTelemetrySnapshot reuse, numeric; LLM deferred) + heartbeat @ 09:00 studio IANA tz (staggered hash%60) + deterministic dormant detection + reactivation via existing outbound-whatsapp chokepoint (sendMessage NOT modified) + 3/90 suppression ceiling + synchronous opt-out from day one + brand-voice personalization w/ generic fallback; live sends mock-first/deferred (D-15) [GOD-01, GOD-02, GOD-03, GOD-04, GOD-05]

## Progress (v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| BD1. HQ Foundation | 6/6 | Complete   | 2026-06-19 |
| BD2. Telemetry + Provisioning | 6/6 | Complete    | 2026-06-19 |
| BD3. HQ Brain + Dispatcher | 5/5 | Complete    | 2026-06-19 |
| BD4. Studio Brain + Dispatcher | 1/2 | In Progress|  |

**Coverage:** 40 v2.0 requirements mapped across 4 phases (BD1-BD4). All pending.

---

## v1.2 — Agentic Tab Editing  ✅ COMPLETE (code) — live UAT pending

> **Started:** 2026-06-18 | **Completed (code):** 2026-06-19 | **Branch:** `master`
>
> **Goal:** Make the GymClassOS staff `/gymos` chat agent able to UPDATE each tab, not just read it — realizing the agent-native principle "everything the UI can do, the agent can do." Scope: **Forms, Schedule, Members** tabs (three tabs only). Zero new dependencies; all work reuses existing `defineAction`, propose→approve, and `useChangeVersion` primitives.
>
> **Status:** All three phases (AE1 Forms, AE2 Schedule, AE3 Members + Campaigns segment builder) are code-complete and code-verified. Per-phase live agent+browser UAT is deferred to the Vercel deploy (no local dev server — NitroViteError) and tracked in each phase's `*-HUMAN-UAT.md`.
>
> **Note:** Phase AE4 (Live Mobile Demo) was originally appended here but is a separate mobile workstream, not agentic tab-editing — it has been split into its own phase section below (**Mobile Demo**).

### Key constraints baked into every phase

- **No local dev server** — NitroViteError prevents `pnpm dev` on staff-web. Verification via Vercel deploy or unit tests + `tsc`.
- **Gate atomicity** — any gated action must update BOTH `ACTION_ALLOWLIST` in `approve-proposal.ts` AND the Zod enum in `propose-action.ts` in the same change.
- **Consent exclusion** — `update-member-profile` schema is `.strict()`, structurally excluding `marketing_consent` / `whatsapp_opt_in` / `optedInAt` / `optedOutAt`.
- **Cancel-occurrence correctness** — `BOOKINGS_EXIST` guard required; cancel-with-bookings must execute atomically (bookings→cancelled + negative pass_debits refunds + occurrence cancelled in one transaction).
- **Fields JSON validation** — `fields` on create/update/publish must be validated against the `FormField` Zod schema before any write.
- **Two-exposure rule** — every new action must be added to the `.generated` actions registry AND named in `agent-chat.ts` system prompt (two independent steps, both required).
- **No schema changes** — fully additive; `gym_members.notes` confirmed present.
- **Per-tab system prompt** — AEX conventions (AEX-01..04) established in AE1; AE2 and AE3 extend the same pattern.

## Phases

- [x] **Phase AE1: Forms Write Tools** — Agent can create, edit, publish/unpublish, and archive/restore forms; establishes the per-tab gate pattern and AEX conventions
 (completed 2026-06-18)
- [x] **Phase AE2: Schedule Write Tools** — Agent can create/edit class definitions, manage occurrences (capacity, cancel, reschedule, complete); cancel-with-bookings routed through propose→approve with atomic pass refund
- [x] **Phase AE3: Members + Campaigns Write Tools** — Agent can update member profile fields (name, phone, email, notes); consent/opt-in state is structurally excluded. Folds in the Campaigns **custom segment builder** (filter members by # classes attended / recency of last attendance / inquiry date) — replacing today's single fixed "at-risk" segment.
 (completed 2026-06-18)
- [→] **Phase AE4: Live Mobile Demo** — MOVED to its own **Mobile Demo** section below (separate mobile workstream, not agentic tab-editing). Summary: — Non-prod demo deploy with the member demo-gate relaxed (honor an explicit off-prod `DEMO_MODE`) + an EAS (or web) build pointed at it via `EXPO_PUBLIC_API_BASE`, so the customer can hand the member app to a real test cohort. **Unblocked 2026-06-18** by company iOS dev-account access.

## Phase Details

### Phase AE1: Forms Write Tools
**Goal**: Coach can use the agent to manage the full forms lifecycle — create, edit, publish, unpublish, archive, restore — and the active-tab context and propose→approve gate are established as the cross-cutting pattern for the whole milestone
**Depends on**: Nothing (first AE phase)
**Requirements**: AEF-01, AEF-02, AEF-03, AEF-04, AEF-05, AEF-06, AEX-01, AEX-02, AEX-03, AEX-04
**Success Criteria** (what must be TRUE):
  1. Coach can tell the agent "create a new lead-capture form called Membership Enquiry" and a draft form row appears in the `/gymos/forms` tab without a page reload
  2. Coach can tell the agent "add a phone number field to that form" and the published form's field list shows the new field (Zod-validated; malformed field attempts are rejected with a clear error, never persisted)
  3. Coach can tell the agent "publish the enquiry form" and the agent responds with a proposal card — the form only goes live after the coach clicks Approve
  4. Coach can tell the agent "unpublish the form" and the form status immediately reverts to draft (direct action, no approval needed)
  5. After any agent write, the Forms tab live-refreshes via `useChangeVersion("action")` — no manual reload required
**Plans**: 3 plans
- [x] AE1-01-PLAN.md — Direct (ungated) forms writes: FormFieldSchema + slugify + create/update-fields/update-meta/unpublish/archive/restore + live-refresh wiring (AEF-01/02/03/05/06, AEX-03)
- [x] AE1-02-PLAN.md — Gated publish path: publish-form action + atomic gate wiring (allowlist + dispatch + propose-action enum + schema enum) (AEF-04, AEX-02)
- [x] AE1-03-PLAN.md — Agent exposure: view-screen forms branch + per-tab system prompt + AGENTS.md docs (AEX-01, AEX-04)
**UI hint**: yes

### Phase AE2: Schedule Write Tools
**Goal**: Coach can use the agent to manage class definitions and occurrences — create, set capacity, cancel (with atomic booking refund), reschedule, and mark complete — with high-risk operations gated behind propose→approve; reuses the gate wiring established in AE1
**Depends on**: Phase AE1 (gate pattern + AEX conventions established)
**Requirements**: AES-01, AES-02, AES-03, AES-04, AES-05, AES-06
**Success Criteria** (what must be TRUE):
  1. Coach can tell the agent "create a new HIIT class on Monday at 7am with 15 spots" and a new occurrence appears on the `/gymos/schedule` grid without a reload
  2. Coach can tell the agent "reduce the capacity of Tuesday's yoga to 8" and the change is rejected with a clear error if current bookings exceed 8 (no mutation occurs); otherwise it saves directly
  3. Coach can tell the agent "cancel Friday's spin class" and — because it has active bookings — the agent presents a proposal card listing how many bookings will be cancelled and how many pass credits will be refunded; approval triggers a single atomic transaction (bookings→cancelled + negative pass_debits entries + occurrence cancelled); no orphaned pass credits
  4. Coach can tell the agent "move Thursday's pilates to 9am" when the class has active bookings and the reschedule is routed through propose→approve before the `starts_at` changes
  5. After any agent write, the Schedule tab live-refreshes — no manual reload required
**Plans**: 3 plans
- [x] AE2-01-PLAN.md — Direct (ungated) schedule writes: set-occurrence-capacity (bookings guard) + update-class-definition + mark-occurrence-complete + registry entries + Schedule live-refresh wiring (AES-02/05/06, AEX-03)
- [x] AE2-02-PLAN.md — Gated path: cancel-occurrence (atomic bookings+refund+occurrence transaction) + reschedule-occurrence + atomic gate wiring (allowlist + dispatch + propose-action enum + schema enum + registry) (AES-03, AES-04)
- [x] AE2-03-PLAN.md — Agent exposure: view-screen schedule branch + per-tab system prompt Schedule section + AGENTS.md docs (AES-01, AEX-01/AEX-04)
**UI hint**: yes
**Note (New Class — quick 260618-j8z):** AE2's create-path is already partly shipped. The two reusable `defineAction`s `create-class-definition` + `create-class-occurrence` are committed (`95e1f0da`); the **New Class button + dialog UI** on `/gymos/schedule` is being finished now as quick task **260618-j8z** (decision 2026-06-18: ship UI early for the live customer). AE2 then layers the **agent-driven** create path (system-prompt exposure per the two-exposure rule) on top of the same actions.

### Phase AE3: Members + Campaigns Write Tools
**Goal**: Coach can use the agent to (a) update a member's profile fields (name, phone, email, notes) — never consent/opt-in state, enforced structurally via a `.strict()` Zod schema — and (b) build a **custom Campaigns segment** by describing the filters in natural language, replacing today's single hardcoded "at-risk" segment in `gymos.campaigns.tsx`
**Depends on**: Phase AE2 (system-prompt per-tab pattern fully established; AEX conventions in place)
**Requirements**: AEM-01, AEM-02, + Campaigns segment-builder reqs (AEM-03/AEM-04 — to be registered in REQUIREMENTS.md at plan time)
**Success Criteria** (what must be TRUE):
  1. Coach can tell the agent "update Sarah's phone number to +447700900123" and the `gym_members` row reflects the new E.164 value; the member profile card on `/gymos/members` refreshes without a reload
  2. Coach can tell the agent "add a note to David's profile: prefers morning classes" and the `notes` field saves correctly
  3. Asking the agent to "opt Sarah into WhatsApp" or "change her marketing consent" results in a clear refusal — the action's schema structurally prevents those fields from being written (`.strict()` exclusion), and no `whatsapp_opt_in` or `marketing_consent` state changes
  4. Coach can tell the agent "correct this member's email" and the update applies directly (no approval gate needed for profile edits)
  5. The Campaigns tab exposes a custom segment builder (UI + matching action) that filters members by **# classes attended**, **recency of last attendance**, and **inquiry/lead date** — composable, replacing the single fixed "at-risk" segment; the data already exists (no schema change)
  6. Coach can tell the agent "build a segment of members who attended 4+ classes but haven't been in 3 weeks" and a matching, named segment appears in the Campaigns tab without a reload
**Plans**: 3 plans
- [x] AE3-01-PLAN.md (wave 1) — update-member action: .strict() consent exclusion + E.164/email validation + email/phone collision pre-checks (AEM-01, AEM-02)
- [x] AE3-02-PLAN.md (wave 1) — Campaigns segment builder: save-segment action (application_state) + spec-driven 3-axis evaluator + at-risk preset + structured builder UI + client-side segment read + live-refresh (AEM-03, AEM-04)
- [x] AE3-03-PLAN.md (wave 2) — Agent exposure: view-screen members/campaigns branches + agent-chat Members/Campaigns sections (consent-refusal) + AGENTS.md rows + members/detail live-refresh + REQUIREMENTS AEM-03/04 registration (AEX-01, AEX-03, AEX-04)
**UI hint**: yes

## Progress (v1.2 — Agentic Tab Editing)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| AE1. Forms Write Tools | 3/3 | Complete | 2026-06-18 |
| AE2. Schedule Write Tools | 3/3 | Complete | 2026-06-18 |
| AE3. Members + Campaigns Write Tools | 3/3 | Complete | 2026-06-19 |

**Coverage:** 18 v1.2 requirements (AEF/AES/AEM/AEX) delivered across AE1–AE3, plus the Campaigns segment-builder reqs (AEM-03/AEM-04) folded into AE3. All code-complete and code-verified (`tsc` clean + 76/76 vitest). Per-phase live agent+browser UAT runs on the Vercel deploy and is tracked in each phase’s `*-HUMAN-UAT.md`.

---

## Mobile Demo — Live Member App on Device

> **Status:** Not started | **Split out of v1.2 on 2026-06-19** — standalone mobile workstream (the member app on a real device), distinct from the agentic tab-editing milestone. Phase identifier **AE4** is retained; its requirements are net-new and will be registered at plan time.
>
> **Goal:** Stand up a non-prod demo deploy with the member demo-gate relaxed and a device build pointed at it, so the customer can hand the GymClassOS member app to a real test cohort.

## Phase Details

### Phase AE4: Live Mobile Demo
**Goal**: The customer can open the GymClassOS member app on a real device and hand it to a test cohort. Today this is blocked by three things: `/api/m/*` hard-401s in prod (`requireDemoMember` blocks on `NODE_ENV==='production'`), an Expo Go SDK mismatch (app SDK 55 vs store 56), and the local API can't boot (Nitro/Vite bug). This phase stands up a **non-prod demo deploy** with the member demo-gate relaxed and a build pointed at it.
**Depends on**: Nothing in AE1–AE3 (independent mobile workstream); newly unblocked by company iOS dev-account access (2026-06-18)
**Requirements**: Mobile-demo reqs — to be registered in REQUIREMENTS.md at plan time (demo-gate relax, demo deploy target, EAS/web build, API base wiring)
**Success Criteria** (what must be TRUE):
  1. A non-prod deploy serves `/api/m/*` to the member app with the demo gate honoring an explicit off-prod `DEMO_MODE` (no prod 401)
  2. An EAS build (under the company Apple Developer account) **or** a web build, pointed at the demo deploy via `EXPO_PUBLIC_API_BASE`, installs/loads on a real device — resolving the Expo Go SDK-55-vs-56 mismatch
  3. A test member can complete the golden path on the device (member-picker → browse schedule → book a class → log a meal) against the demo deploy
**Plans**: TBD
**UI hint**: yes

## Progress (Mobile Demo)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| AE4. Live Mobile Demo | 0/TBD | Not started | - |

**Coverage:** Mobile-demo requirements (demo-gate relax, demo deploy target, EAS/web build, API base wiring) are net-new — to be registered in REQUIREMENTS.md at AE4 plan time.

---

## v1.1 — UI Redesign: GymClassOS Design System

> **Branch:** `redesign/ui-refresh` | **Started:** 2026-06-12 | **Merges when ready** (not coupled to v1.0 ship date)
>
> **Goal:** Replace the agent-native template-fork look with a studio-skinnable GymClassOS design system and gym-domain naming across all three surfaces (staff web, public embed widgets, member mobile app), so the product reads as a real vertical product sellable beyond Hustle.
>
> **Phase prefix:** R (for Redesign) — avoids `.planning/phases/` directory collisions when this branch merges into master.

### Key constraints baked into every phase

- **No local dev server** — `NitroViteError` prevents `pnpm dev` on staff-web. Verification is via Vercel/Fly deploy (staff web + embeds) and Expo Go / EAS (mobile).
- **Live customer (Hustle) on the deployed app** — route renames require redirect shims (`React Router redirect()`); no DB enum or schema renames (drizzle-kit#1409 + live-DB table-lock risk).
- **Fork boundary holds** — `templates/*` and `packages-vendored/*` are never edited. Redesign work lands in `apps/staff-web/features/*`, `apps/staff-web/app/*`, `apps/staff-web/app/skins/*`, and `packages/mobile-app`.
- **Hustle brand hex values are a live dependency** — `hustle.css` cannot be finalised until Hustle confirms their brand hex values. This is flagged as an open dependency in R2.
- **Token-before-label ordering** — design tokens must resolve cleanly before UI label changes land; label changes must be stable before code identifier and route renames proceed (pitfall-enforced sequencing from research).

## Phases

- [x] **Phase R1: Audit Baseline** — Screenshot every deployed surface; produce the naming decision record (email-vocabulary inventory + rename classification)
 (completed 2026-06-12)
- [x] **Phase R2: Design System Token Layer** — Install CSS custom-property token system with skin injector; author GymClassOS default skin and Hustle skin; self-host Inter
 (completed 2026-06-13)
- [x] **Phase R3: Naming & IA Pass** — Rename nav labels and surface copy (labels first), then retire email-vocabulary code identifiers and routes (with redirect shims) (completed 2026-06-13)
- [x] **Phase R4: Staff Web Visual Refresh + Embed Widgets** — Apply design-system tokens to all staff-web surfaces and public embed widgets; deliver the visual redesign (completed 2026-06-13)
- [x] **Phase R5: Member Mobile App Redesign** — Align the Expo mobile app to the GymClassOS design language; rename tabs; deliver dark-first theme with token file (completed 2026-06-13)

## Phase Details

### Phase R1: Audit Baseline
**Goal**: The before-state of every surface is documented so regressions are detectable; every email-vocabulary item is inventoried and classified so R2–R5 have a concrete target list
**Depends on**: Nothing
**Requirements**: AUDT-01, AUDT-02
**Success Criteria** (what must be TRUE):
  1. Screenshots of every staff-web route, every embed widget, and every mobile screen are committed to `.planning/ui-reviews/baseline/` and can be diffed against post-redesign captures
  2. A naming decision record exists listing every email-vocabulary UI label, code identifier, CSS class, and route, with each item tagged by rename layer (label / CSS / identifier / route)
  3. The naming record is comprehensive enough that a reader can derive the full scope of R3 without re-auditing the codebase
**Plans**: 3 plans
- [x] R1-01-naming-decision-record-PLAN.md (wave 1) — grep-driven naming decision record: 4 per-layer tables (label/CSS/identifier/route) across all three surfaces [AUDT-02]
- [x] R1-02-capture-tooling-PLAN.md (wave 1) — parameterized Playwright capture script + light/dark embed test pages + README (reused by R2-R5) [AUDT-01]
- [x] R1-03-run-captures-and-manifest-PLAN.md (wave 2) — auth checkpoint + run web/embed captures + mobile Expo Go capture checkpoint + INDEX.md manifest with deploy SHA [AUDT-01]

### Phase R2: Design System Token Layer
**Goal**: All staff-web colors, typography, and radius resolve from CSS custom-property tokens; the skin injector selects the right skin at deploy time; Hustle and GymClassOS default skins exist; Inter is self-hosted
**Depends on**: Phase R1 (audit establishes the token surface area)
**Requirements**: DSGN-01, DSGN-02, DSGN-03, DSGN-04, DSGN-05
**Success Criteria** (what must be TRUE):
  1. A CI grep guard fails if any hardcoded hex color appears in GymClassOS app code (outside skin files)
  2. Setting `GYMOS_STUDIO_SKIN=hustle` at deploy time and redeploying to Vercel causes the staff web to render Hustle brand colors and logo — no code change required
  3. `apps/staff-web/app/skins/default.css` and `apps/staff-web/app/skins/hustle.css` both exist; switching between them requires only an env-var change
  4. No `fonts.googleapis.com` request appears in the network tab on any staff-web page load (Inter is served from the same origin)
  5. Studio name and logo appear at the top of the staff sidebar, sourced from the active skin config
**Plans**: 4 plans
- [x] R2-01-token-layer-and-skins-PLAN.md (wave 1) — bare @theme tokens + --studio-* defaults in global.css; default.css + hustle.css skins; skins/config.ts registry; studios/ env contract scaffold [DSGN-01, DSGN-03]
- [x] R2-02-skin-injector-and-studio-identity-PLAN.md (wave 2) — root loader reads GYMOS_STUDIO_SKIN, sets data-studio on <html> (SSR, no FOUC); GymosTopNav renders skin displayName/logo [DSGN-02, DSGN-05]
- [x] R2-04-self-hosted-inter-PLAN.md (wave 3) — self-hosted Inter variable woff2 in public/fonts/; @font-face in global.css + preload in root.tsx; replace Google Fonts in 3 SSR pages [DSGN-04]
- [x] R2-03-hex-conversion-and-ci-guard-PLAN.md (wave 4) — guard-no-hardcoded-colors.mjs + guards/prep/CI wiring; convert/allowlist remaining hex so the guard passes [DSGN-01]
**UI hint**: yes
**Open dependency**: Hustle brand hex values must be confirmed by the customer before `hustle.css` can be finalised. Until received, `hustle.css` uses placeholder values clearly marked `/* TODO: replace with Hustle brand values */`.

### Phase R3: Naming & IA Pass
**Goal**: Every user-visible surface uses gym-domain vocabulary; email-mental-model labels are eliminated; code identifiers and routes are renamed to match; the live customer's deep links continue working via redirect shims
**Depends on**: Phase R2 (token layer must be stable before identifier renames, to avoid conflating token-refactor diffs with naming diffs)
**Requirements**: NAME-01, NAME-02, NAME-03, NAME-04, NAME-05, NAME-06, NAME-07
**Success Criteria** (what must be TRUE):
  1. The staff nav reads exactly: Schedule | Messages | Members | Payments | Settings, with studio identity at the top — no "Inbox", "Compose", or "Draft Queue" appears anywhere user-visible
  2. The messaging surface shows "Messages" as the heading, threads are labeled "Conversations", and the send button reads "New Message" — zero email vocabulary is visible
  3. Navigating to any pre-rename route (e.g. the old inbox or draft-queue path) redirects correctly to the new route rather than returning a 404
  4. "Book" is the primary booking CTA on every class surface — no "Reserve", "Enrol", or "Register" appears
  5. Member detail view is headed "Member Profile"; pass balance displays as "X credits"
  6. DB enum string values and schema column names are untouched (display labels only)
**Plans**: 4 plans
- [x] R3-01-label-layer-PLAN.md (wave 1) — user-visible copy: nav Inbox→Messages, surface heading/meta, member back-links→Home, Member Profile heading, legacy Compose→New Message / Draft Queue→Scheduled Messages [NAME-01, NAME-02, NAME-06, NAME-07]
- [x] R3-02-css-class-renames-PLAN.md (wave 2) — additive-alias-then-migrate .email-*/.compose-* → .conversation-*/.message-* in global.css + email components (R-12) [NAME-04]
- [x] R3-03-identifier-renames-PLAN.md (wave 3) — EmailList*/Compose* → Conversation*/Message* components + InboxPage→MessagesPage, DraftQueuePage→ScheduledMessagesPage + import sites [NAME-04]
- [x] R3-04-route-renames-and-shims-PLAN.md (wave 4) — /gymos/inbox→/gymos/messages: relocate surface, 301 query-preserving redirect shim (R-06), atomic ref updates, GymosInbox→GymosMessages; NAME-05 no-DB-touch verification [NAME-03, NAME-05]
**UI hint**: yes
**Internal ordering constraint**: Label-layer changes (NAME-01, NAME-02, NAME-06, NAME-07) must be deployed and verified before code-identifier renames (NAME-04) and route renames with redirect shims (NAME-03) are applied. NAME-05 (no DB renames) is a standing constraint throughout.

### Phase R4: Staff Web Visual Refresh + Embed Widgets
**Goal**: Staff-web surfaces and public embed widgets are visually redesigned using the token system; the product reads as a purpose-built gym platform, not an adapted email client
**Depends on**: Phase R3 (naming and tokens must be stable before applying the full visual layer)
**Requirements**: SWEB-01, SWEB-02, SWEB-03, SWEB-04, SWEB-05, SWEB-06, SWEB-07, SWEB-08, WDGT-01, WDGT-02, WDGT-03
**Success Criteria** (what must be TRUE):
  1. Class cards on the staff schedule show class name, time, instructor, and "X / Y booked"; capacity turns amber or red when three or fewer spots remain
  2. The Member Context panel in a conversation shows pass-balance pill, next-class card, and last visit as scannable widget cards — not a data table
  3. Members directory defaults to card view (avatar, membership pill, next class); a table view is available as a secondary option
  4. The Messages surface is responsive at mobile widths — single column with member context in a bottom sheet
  5. Coaches see Schedule / Messages / Members in the nav; admins additionally see Payments / Settings
  6. Staff web defaults to light theme; dark theme is absent (not a toggle — deferred to DSGN-F1)
  7. `/embed/schedule` and the lead-capture embed both render correctly inside an iframe on both light and dark host backgrounds, themed by studio tokens
  8. The lead-capture form uses "Enquiry" vocabulary (not "Sign up" or "Contact")
**Plans**: 7 plans (2 waves)

Plans:
- [x] R4-01-schedule-class-cards-PLAN.md (wave 1) — class cards: name/time/X-of-Y booked + 3-state capacity (amber <=3, red at 0) + accent today-cell [SWEB-01, SWEB-02]
- [x] R4-02-member-profile-widget-cards-PLAN.md (wave 1) — pass-balance pill + next-class card + bookings timeline with Show-all reveal [SWEB-04]
- [x] R4-03-members-directory-card-view-PLAN.md (wave 1) — card-default directory (avatar/membership pill/next class) + Table tab via ?view [SWEB-05]
- [x] R4-04-embed-widgets-token-theming-PLAN.md (wave 1) — /embed/schedule + lead form: light/white default, --studio-* token theming, Enquiry vocab; WDGT-03 light/dark host UAT checkpoint [WDGT-01, WDGT-02, WDGT-03]
- [x] R4-05-member-context-widget-cards-PLAN.md (wave 1) — conversation member-context rail -> Pass Balance / Next Class / Last Visit widget cards [SWEB-03]
- [x] R4-06-messages-responsiveness-PLAN.md (wave 2, after R4-05) — desktop 3-pane -> mobile single-column + member-context bottom Sheet [SWEB-06]
- [x] R4-07-role-nav-and-light-theme-PLAN.md (wave 1) — role-gated nav (admin tabs via GYMOS_ADMIN_EMAILS) + light-locked ThemeProvider, dark toggle removed [SWEB-07, SWEB-08]
**UI hint**: yes

### Phase R5: Member Mobile App Redesign
**Goal**: The Expo member app is aligned to the GymClassOS design language with a dark-first theme, renamed tabs, and a token file replacing all hardcoded hex values
**Depends on**: Phase R2 (token approach established; mobile uses a parallel `theme.ts` pattern rather than CSS custom properties)
**Requirements**: MOBL-01, MOBL-02, MOBL-03, MOBL-04, MOBL-05, MOBL-06, MOBL-07
**Success Criteria** (what must be TRUE):
  1. `packages/mobile-app/lib/theme.ts` exists and all hardcoded hex values in mobile screens reference it — no bare hex strings remain in component files
  2. Bottom tabs are labeled Home / Classes / Passes / Log / Profile (in that order)
  3. The app opens in a high-contrast dark theme by default
  4. The Home tab hero area shows next class, pass balance, and latest coach message as prominent cards
  5. The booking flow completes in three steps or fewer (select → confirm with pass/drop-in choice → done) with a persistent pass-balance pill visible throughout
  6. The Noticeboard is framed in coach voice ("From your coach" / "Studio updates") — not a generic notification feed
  7. Inter loads via `useFonts` with OTF assets compatible with Expo Go; skin is selectable via `EXPO_PUBLIC_STUDIO_SKIN` at EAS build time
**Plans**: 4 plans (2 waves)

Plans:
- [x] R5-01-theme-foundation-PLAN.md (wave 1) — lib/theme.ts (ThemeContext + useTheme + default + Hustle skins, dark-first orange) + ThemeProvider/useFonts gate in _layout.tsx + Inter OTF assets [MOBL-01, MOBL-03, MOBL-07]
- [x] R5-02-tabs-and-leaf-screens-PLAN.md (wave 2) — rename/reorder tabs Home/Classes/Passes/Log/Profile + new passes.tsx + hex migration of food/profile/food-add/food-barcode/pick-member [MOBL-02, MOBL-01]
- [x] R5-03-home-hero-and-noticeboard-PLAN.md (wave 2) — Home hero (next class + pass balance + latest coach message cards) + coach-voice Studio updates section + index.tsx/KcalRing hex migration [MOBL-04, MOBL-06, MOBL-01]
- [x] R5-04-booking-flow-pass-pill-PLAN.md (wave 2) — <=3-step booking (select -> confirm with pass/drop-in choice -> done) + persistent pass-balance pill + schedule.tsx hex migration [MOBL-05, MOBL-01]
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| R1. Audit Baseline | 3/3 | Complete    | 2026-06-12 |
| R2. Design System Token Layer | 4/4 | Complete   | 2026-06-13 |
| R3. Naming & IA Pass | 4/4 | Complete   | 2026-06-13 |
| R4. Staff Web Visual Refresh + Embed Widgets | 7/7 | Complete   | 2026-06-13 |
| R5. Member Mobile App Redesign | 4/4 | Complete   | 2026-06-13 |

**Coverage:** 30 v1.1 requirements mapped across 5 phases (R1–R5).

---
## v1.0 — Demo Sprint + Production v1

## Overview

GymClassOS v1 ships in **two milestones**:

1. **Demo Sprint** — Week 1 (by ~2026-05-24). A vertical slice across all surfaces — prototype quality, deliberate corner-cutting acceptable, throwaway code where useful. Goal: signed customer sees a working URL on their phone (member PWA) and laptop (staff back-office) within the week, with at least one of: real inbound WhatsApp message in the inbox, one outbound WhatsApp send, one Stripe Checkout completed in test mode, one class booked, one meal logged, one agent chat exchange.

2. **Production v1** — Weeks 2–9 (by ~2026-07-15). Hardens the demo into production code. Adds the requirements that didn't make the demo (full Stripe webhook spine, full WhatsApp 24h-window + opt-in enforcement at sender layer, atomic booking transactions, waitlist + reply-to-confirm, notifications, settings, per-studio deploy machinery).

The demo deliberately cuts corners that production cannot: skipping atomic transactions, hardcoded test data, relaxed window-checks, single-studio config, no full idempotency. The production milestone is "rebuild every demo corner-cut as production-grade." This separation lets the demo move fast without polluting the production design.

Post-v1 backlog (HealthKit + native mobile, Coach View with health context, CRM campaigns + segments, Knowledge Base, Reporting, bsport-migration productisation, A2A) lives in REQUIREMENTS.md and PLATFORM-VISION.md.

## Milestones

- [ ] **Milestone 1: Demo Sprint** (Week 1) — vertical slice for customer's first look
- [ ] **Milestone 2: Production v1** (Weeks 2–9) — harden + extend to production-ready

## Milestone 1: Demo Sprint

**Window:** 2026-05-17 → ~2026-05-24 (~7 days)
**Quality bar:** Prototype. Stubs OK. Hardcoded data OK on non-demo paths. Golden-path flows must work.
**Demo delivery:** URLs on customer's devices — staff back-office on laptop, member PWA installed to home screen on phone.

### Phase D0: Fork + Schema + Deploys (Days 1–2)

**Goal:** Fork agent-native, get the workspace running locally, deploy a hello-world staff-web to Vercel against a Neon database, schema in place.

**Requirements:** FND-02, FND-03, DB-01, DB-02 (partial, demo subset), AUTH-01 (seeded), MEMAUTH-01 (stubbed magic-link)

**Success criteria:**
1. `pnpm install && pnpm dev` in the fork runs the Mail + Calendar templates locally without errors
2. A hello-world page on the staff-web app loads on a public Vercel URL with Better-auth signing in a seeded test coach
3. Drizzle migration creates the demo-subset of tables on a fresh Neon project; `pnpm db:studio` shows them
4. No `studio_id` column anywhere in the schema (`grep -r "studio_id" packages/db` returns zero)

### Phase D1: Staff Surfaces Adapted from Mail + Calendar (Days 2–4)

**Goal:** The staff back-office shows recognisable Mail-as-inbox and Calendar-as-schedule surfaces with seeded data, plus a member directory and basic payments view.

**Requirements:** INBX-01, INBX-02, INBX-03, INBX-06 (thin), INBX-07, MEM-01, MEM-02, SCH-01, BKG-01, PAY-01, STR-01, STR-02

**Success criteria:**
1. Inbox screen loads with 3–5 seeded conversations, opens a message thread, lets coach type and send a message (sends to a real WhatsApp number via Meta API for at least one happy-path test)
2. Schedule screen renders the seeded week (Mon–Sun) with class occurrences in the studio's local timezone
3. Member directory lists 5–10 seeded members; clicking one opens a profile with their bookings + pass balance
4. Member context panel in the inbox shows next-class + pass-balance for the opened conversation's member (real data)
5. Stripe Checkout link generated for a 10-pack purchase + paid in Stripe test mode + resulting pass grant visible in member profile

**Plans:** 1/2 plans executed

- [x] D1-01-schedule-surface-PLAN.md — Build /gymos/schedule week-grid + book-from-occurrence dialog (SCH-01, BKG-01) — completed 2026-05-19 (commits f5cdbdc6, dd50fe62, 23ee58f2)
- [x] D1-02-members-directory-PLAN.md — Build /gymos/members + /gymos/members/:id profile with bookings + pass balance (MEM-01, MEM-02)
- [ ] D1-03-payments-stripe-checkout-PLAN.md — Build /gymos/payments with Stripe test-mode Checkout + pass grant (PAY-01, STR-01, STR-02)
- [x] D1-04-inbox-gap-fill-PLAN.md — Add top-nav strip + send acknowledgement + INBX-* audit comments (INBX-01, INBX-02, INBX-03, INBX-06 thin, INBX-07)

### Phase D2: Member Mobile App + Calorie Counter + Agent (Days 4–7)

**Goal:** Member opens an Expo Go link on their phone, loads the GymClassOS member app (forked from agent-native's `packages/mobile-app`), logs in (demo-stub picker), browses + books a class, logs a meal via search + barcode, and chats with the in-app agent that can `greet` / `book_class` (with confirmation) / `log_food_nl`. At least one real WhatsApp message round-trip (inbound + outbound) lands in the staff inbox.

> **CORRECTION (2026-05-17 late):** Earlier text in this file said "PWA" for the member surface. Replaced — member surface is native via Expo + RN, forked from upstream `packages/mobile-app`. Demo via Expo Go (no native module compile, no Apple Dev Account this week). Production via EAS Build later. Read "PWA" / "web manifest" / "install-to-home-screen" elsewhere in this file as native Expo Go install for the demo and EAS Build install for production.

**Requirements:** MEMBR-01, MEMBR-02, MEMBR-03, CAL-01, CAL-02, CAL-03, AGENT-01, AGENT-02, AGENT-03, WA-01, WA-02, MEMAUTH-01 (stubbed picker)

**Success criteria:**
1. Customer can open the Expo Go QR on their iPhone and load the GymClassOS member app (member-picker first launch → 4 tabs after pick)
2. Member can browse the seeded class schedule and book one class from the mobile Schedule tab; the booking reflects in /gymos staff member-profile
3. Member can search "banana" → find an Open Food Facts result → log it as a snack from the Food tab; daily totals (kcal + macros) update on Home + Food tabs
4. Member can scan a barcode (using `expo-camera` built-in scanner) on a packaged food → see it logged with OFF nutrition data
5. Member can open the agent chat sheet from a persistent FAB on every screen
6. Member can type "book me into the 7am yoga tomorrow" → agent uses `book_class` tool WITH explicit confirmation turn (D-13) → booking appears in DB
7. Member can type "I had a chicken caesar at Pret" → agent uses `log_food_nl` → food entry created via OFF top-match
8. At least one real inbound WhatsApp message from a test phone surfaces in the staff inbox AND one real outbound from staff inbox is delivered to the test phone

**Plans:** 5/6 plans executed

- [x] D2-01-mobile-shell-auth-PLAN.md — Strip upstream tabs, install deps, build 4-tab GymClassOS shell + member-picker + AsyncStorage + TanStack Query + apiFetch wrapper + requireDemoMember server helper + `/api/m/members/list` + `/api/m/profile`. Includes the @gorhom/bottom-sheet × Expo Go SDK 55 compatibility spike (Pitfall #4). (MEMAUTH-01 stubbed, MEMBR-03 server side)
- [x] D2-02-whatsapp-webhook-outbound-PLAN.md — `templates/mail/app/routes/webhooks.whatsapp.tsx` HMAC-verified inbound receiver (ngrok-tunnelled) + augment `gymos.tsx` send action with real Meta Graph API v23 POST. (WA-01, WA-02)
- [x] D2-03-member-schedule-booking-PLAN.md — `/api/m/schedule` 7-day window + `/api/m/bookings` POST + mobile Schedule tab with day-grouped cards + optimistic UI booking. (MEMBR-01, MEMBR-02)
- [x] D2-04-member-home-tab-PLAN.md — SVG-free KcalRing component + Home tab with greeting / pass-balance pill / next-class card / kcal ring + macros. (MEMBR-03)
- [x] D2-05-food-calorie-counter-PLAN.md — OFF search + barcode proxy endpoints + food-entries CRUD + BarcodeScanner component (`expo-camera`) + Food tab + /food-add search screen + /food-barcode scan screen. (CAL-01, CAL-02, CAL-03) — completed 2026-05-19 (commits `1812a43e`, `57ad0abb`, `d9c47592`, `bcbe63e4`; SUMMARY in `D2-05-food-calorie-counter-SUMMARY.md`)
- [ ] D2-06-agent-chat-sse-tools-PLAN.md — `/api/m/agent/stream` SSE route with Anthropic Sonnet 4.6 + prompt caching + manual 3-tool loop (greet / book_class with confirmation / log_food_nl) + `react-native-sse` consumer + AgentSheet component + persistent FAB. (AGENT-01, AGENT-02, AGENT-03)

**Risks (from PITFALLS.md, demo-relevant subset):**
- #1 (24h-window violation → Meta suspension) — demo only sends to ONE test number that has just messaged inbound; UI gate is enough for demo (worker-level gate is production work)
- #19 (`@great-detail/whatsapp` single-maintainer) — mirror at production stage, demo can use npm directly
- #16 (RR v7 × Vercel middleware edge cases) — flagged; hello-world deploy in D0 is the validation gate
- D2-RESEARCH #4 (`@gorhom/bottom-sheet` × Expo Go SDK 55 worklets) — Wave 0 spike in D2-01 decides between gorhom and RN `<Modal>` fallback before D2-06 lands
- D2-RESEARCH #7 (OFF returns null nutriments) — Food tab + barcode screen surface a warning when kcal=0 instead of silently logging junk

**UI hint:** yes

## Milestone 2: Production v1

**Window:** ~2026-05-25 → ~2026-07-15 (~8 weeks)
**Quality bar:** Production. Atomic transactions. Idempotent everything. PII redacted logs. Per-studio deploy script. Real customer cutover lands in this window.

The production milestone is structured as 4 phases (preserving the prior coarse-grained roadmap shape). Each phase hardens demo corner-cuts AND adds the requirements that didn't make the demo.

### Phase P0: Audit & De-Risk (~3–5 days)

**Goal:** Long-lead-time and architectural risks neutralised before production code is written. Template audit completed. WhatsApp templates submitted to Meta (≤48h approval). `@great-detail/whatsapp` mirrored. Customer onboarding checklist signed off.

**Requirements:** FND-01, FND-04, FND-05, FND-06, FND-07, FND-08

**Success criteria:**
1. `audit/decision.md` exists with a fork-clean / adapt / build-fresh ruling per surface (Mail-as-inbox, Calendar-as-schedule, calorie-counter-fresh, member-PWA-shell, others noted post-v1)
2. Both git remotes set up (`origin` + `upstream` = `BuilderIO/agent-native`); `MODIFICATIONS.md` committed
3. `@great-detail/whatsapp` mirrored to the studio org's GitHub; package pinned to mirror git SHA
4. All four WhatsApp templates (`class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`) submitted to Meta — approval status visible in Meta Business Manager
5. Customer onboarding checklist signed off (Meta Business Manager + WhatsApp phone clean + Stripe account created + restricted key generated)

### Phase P1a: Data Foundation, Auth & Deploy (~2 weeks)

**Goal:** Coach + Member can log in to a production-deployed staff-web + member-PWA; schema has every table required by P1b and P2; adding a new studio is a single scripted command.

**Requirements:** DB-02, DB-03, DB-04, DB-05, DB-06, DB-07, AUTH-02, AUTH-03, AUTH-04, AUTH-05, MEMAUTH-02, MEMAUTH-03, MEMAUTH-04, DEP-01, DEP-02, DEP-03, DEP-04, OBS-01, OBS-02

**Success criteria:**
1. Coach sign-in via Better-auth with admin/coach role split enforced in UI + integration test
2. Member sign-in via magic-link delivered through WhatsApp template (no email channel)
3. `scripts/deploy.sh <studio>` deploys all three apps from a populated `studios/<studio>/env.yml`; fails-fast on missing/malformed env
4. `drizzle-kit migrate` runs cleanly against a fresh Neon project; `drizzle-kit push` is blocked; `grep -r "studio_id" packages/db/schema` returns zero
5. `pass_debits` CHECK constraint survives a 50-concurrent-debit test; recurring `schedule_rule` materialises across a DST boundary correctly in test
6. PWA passes a Lighthouse PWA audit (installable, service worker, manifest); installs to home screen on iOS Safari + Android Chrome
7. `/healthz` on edge-webhooks returns latency + queue-depth + last-processed JSON

### Phase P1b: Webhook + Worker Spine (Stripe + WhatsApp) (~2 weeks)

**Goal:** Every external event from Stripe or Meta is received, signature-verified, persisted idempotently, processed by a pg-boss worker. Every outbound WhatsApp send is gated at the worker layer by 24h-window + opt-in checks. Stripe restricted-key flow is rotation-capable.

**Requirements:** WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, WEB-06, STR-03, STR-04, STR-05, STR-06, STR-07, WA-03, WA-04, WA-05, WA-06, WA-07, WA-08, WA-09

**Success criteria:**
1. Replaying the same Stripe `checkout.session.completed` event twice via Stripe CLI produces exactly one `payments` row and exactly one pass grant
2. A WhatsApp inbound message from a real phone appears in `messages` within seconds; duplicate Meta deliveries produce no duplicate rows
3. Calling `sendMessage()` from the worker with a free-text body for a conversation whose `last_inbound_at` is > 24h returns a typed `WindowExpiredError` — no Meta API call made
4. Calling `sendMessage()` for a member with no row in `whatsapp_opt_in` returns a typed `NoOptInError` regardless of window state
5. Tampered webhook body to `/webhooks/stripe` or `/webhooks/whatsapp` returns 400 before any JSON parsing
6. Stripe restricted key validity check passes in settings UI; admin can rotate the key without downtime

**Risks (from PITFALLS.md):**
- #1, #2 (idempotency + window violation) — directly addressed by single sendMessage chokepoint + atomic webhook reducer
- #8 (webhooks on Vercel) — webhooks live only on Fly with `min_machines = 1`
- #9 (body parser before HMAC) — Hono `c.req.text()` before any JSON parsing
- #11 (WhatsApp status webhook dedup) — ordinal-guarded UPDATE on `messages.status`
- #17 (WhatsApp opt-in) — `whatsapp_opt_in` table + sender-gate refusal
- #19 (single-maintainer SDK) — thin adapter; mirror pinned
- #20 (worker at-least-once → duplicate sends) — pg-boss `singletonKey` per job

**Plans:** 9 plans

- [x] P1b-01-monorepo-refactor-staff-web-PLAN.md — Move templates/mail/ → apps/staff-web/; templates/mail/ back to upstream-clean; regenerate Drizzle migration for PG dialect (no requirement IDs — pure refactor) — completed 2026-05-20 (commits `1b601f3c`, `7efcbf9a`, `a126010a`, `b8cb721a`, `51e67e67`; SUMMARY in `P1b-01-monorepo-refactor-staff-web-SUMMARY.md`)
- [x] P1b-02-schema-migration-additive-PLAN.md — Single additive Drizzle migration: whatsapp_opt_in, whatsapp_templates, stripe_customers, stripe_subscriptions, payments, secrets (pgcrypto); whatsapp_window_state VIEW; extend webhook_events with (provider, external_id) UNIQUE + backfill; extend messages with delivered_at/read_at/error_code (WEB-03/05, WA-04/06/07/08, STR-03..07)
- [x] P1b-03-packages-queue-whatsapp-PLAN.md — packages/queue (typed pg-boss publishers + UNPOOLED guard) + packages/whatsapp (thin transport adapter); D-11 compile-time guard that apps/staff-web cannot import @gymos/whatsapp (WA-09)
- [x] P1b-04-edge-webhooks-fly-receiver-PLAN.md — apps/edge-webhooks Hono receiver on Fly region iad (research override of CONTEXT D-02 lhr); two-process fly.toml; raw-body HMAC + idempotent insert + enqueue (WEB-01/02/03)
- [x] P1b-05-worker-inbound-whatsapp-PLAN.md — apps/worker bootstrap + inbound-whatsapp queue handler (concurrency=5); upsertConversationAndMessage + ordinal-guarded status updates (WEB-04/05, WA-03/04)
- [x] P1b-06-worker-sendmessage-chokepoint-PLAN.md — Three gates (opt-in, window, template-approved) + sendMessage chokepoint + outbound-whatsapp queue (concurrency=1); typed errors NoOptInError/WindowExpiredError/TemplateNotApprovedError (WA-05/06/07/08/09)
- [x] P1b-07-worker-stripe-reducers-PLAN.md — 6 Stripe reducers (checkout.session.completed, invoice.paid/payment_failed, subscription.updated/deleted, charge.refunded) + single TX + apiVersion pin '2026-04-22.dahlia' + pgcrypto-encrypted secrets storage + rotation-capable getStripeSecretKey (WEB-06, STR-03..07)
- [x] P1b-08-staffweb-outbound-rotation-PLAN.md — /gymos Send action refactored to enqueue (no direct Meta) + loader exposes whatsapp_window_state + opt-in; UI badges + Send gate + D-19 failed-bubble copy; /gymos/settings/integrations Stripe key rotation (WA-05/08)
- [ ] P1b-09-validation-cutover-PLAN.md — WA-08 daily template-sync cron via pg-boss schedule + integration tests for the 4 D-23 scenarios + Meta/Stripe URL flip + DELETE templates/mail/webhooks.whatsapp.tsx (D-05 last task) (WA-08)

### Phase P1b.1: Customer Pilot Enablement (INSERTED — 2026-05-25)

**Goal:** Hand the deployed staff-web to the signed customer as a real pilot tool. After the successful 2026-05-25 demo, the customer immediately needs (a) accounts to log in with and (b) the ability to actually send WhatsApp messages from the inbox via approved templates. Plus the cosmetic + functional cleanup the demo exposed: `/gymos` looks like an email client, the AI sidebar isn't gym-aware, and Analytics is missing from the top-nav.

**Scope:**
1. **Strip email chrome from `/gymos/*`** — the email AppLayout (`apps/staff-web/app/components/layout/AppLayout.tsx`) wraps gymos routes today, bleeding email-only UI (hamburger, "Important"/"Other" tabs, email sidebar, email Compose button, refresh, bell) on top of `GymosTopNav`. Short-circuit `/gymos/*` to a bare gymos layout: only `GymosTopNav` + content + right-rail Chat.
2. **Rename "Compose" → "Templates" + open WhatsApp template picker.** WhatsApp Business cannot send free-text outside the 24h window; the button must reflect that. Clicking opens a `<Dialog>` listing approved templates (queried from Meta, or seeded `whatsapp_templates` for the first pilot), variable form for the chosen template, and sends via the P1b-06 worker `sendMessage` chokepoint (which already enforces opt-in + window + template gates).
3. **Add Analytics tab to GymosTopNav** — new `/gymos/analytics` route showing booking fill rate, cancellation rate, no-shows, pass utilisation (read-only dashboards for first pilot; exact metric list finalised at plan time).
4. **Provision staff logins for customer** — Better-auth accounts for the studio's coach(es) + owner. Email/password seeded by us, or magic-link via email (decide at plan time). Customer logs in to `gym-class-os.vercel.app` and reaches `/gymos` without our help.
5. **Ground the AI assistant in gym data, not email.** AgentSidebar in `AppLayout.tsx:138` already shows gym-flavored suggestions, but the agent's tools + system prompt still come from the Mail template's `apps/staff-web/AGENTS.md`. Replace (or layer) with a gymos AGENTS.md describing actions like `list-classes`, `list-bookings`, `list-cancellations`, `member-retention`; write the matching actions in `apps/staff-web/actions/` where they don't exist; verify the agent answers the three suggestion prompts end-to-end.

**Requirements:** AUTH-01 (extend to customer accounts), WA-05/-06/-07 (template send path — most shipped in P1b-06, this surfaces it in UI), INBX-01/-02 (gym-focused inbox chrome), AGENT-04/-05 (gym-aware agent surface — pulled forward from P2 for pilot)

**Success criteria:**
1. Customer signs in to `https://gym-class-os.vercel.app` with their own credentials and lands on `/gymos` without a redirect to `/inbox` or any email surface.
2. `/gymos/*` shows only the gymos top-nav (Inbox / Schedule / Members / Payments / Analytics / Settings) + content + right-rail Chat. No hamburger, no "Important"/"Other 25", no email Compose, no email sidebar.
3. Clicking "Templates" from a conversation opens a dialog of approved WhatsApp templates; selecting one + filling variables + Send enqueues an outbound that arrives on a test WhatsApp number via Meta Cloud API.
4. `/gymos/analytics` loads and shows at least three real metrics from the seeded data (fill rate, cancellation rate, pass utilisation — exact set finalised at plan time).
5. Asking the right-rail Chat "which classes haven't been filled in the last week?" returns a real answer from gym data (not an email-assistant response); same for "provide renewal numbers" and "which customers should I reach out to?".
6. Sending free-text WhatsApp to a number whose 24h window has expired is rejected by the worker with the typed `WindowExpiredError` (no Meta API call made) — confirms P1b-06 gates still hold from the new UI.

**Depends on:** Phase P1b (P1b-06 sendMessage chokepoint + P1b-08 outbound-rotation UI both ✓)

**Risks:**
- **WhatsApp templates not yet approved by Meta.** P0 success criterion 4 (templates submitted) hasn't been hit; the first pilot may have zero approved templates, leaving the Templates button useless except for 24h-window replies. Plan-phase decides: ship Templates UI now and gate behind seeded test templates, or pull P0 template submission forward.
- **Better-auth for non-Google customer accounts** — staff-web has only seen Google OAuth in the demo path. Plan-phase decides email/password vs. email magic-link and verifies Better-auth's email transport.
- **Agent action surface drift.** If `apps/staff-web/actions/` lacks the actions the new gymos AGENTS.md describes, the agent will hallucinate. Plan-phase verifies action inventory before writing AGENTS.md.

**Plans:** 8/8 — phase live-accepted 2026-05-26

- [x] P1b.1-01-bare-gymos-layout-PLAN.md — Strip email chrome from /gymos/* (AppLayout early-return for /gymos paths) and add Analytics tab to GymosTopNav (INBX-01, INBX-02)
- [x] P1b.1-02-auth-allowlist-access-denied-PLAN.md — CUSTOMER_ALLOWED_EMAILS env allowlist hook in auth.ts + branded /access-denied route (AUTH-01)
- [x] P1b.1-03-gym-actions-part-a-PLAN.md — Create list-fill-rate, list-classes, list-members defineAction files (AGENT-04)
- [x] P1b.1-04-gym-actions-and-template-seed-PLAN.md — Create list-renewals, list-at-risk-members + seed 5 whatsapp_templates rows including approved hello_world (AGENT-05, WA-05)
- [x] P1b.1-05-templates-dialog-PLAN.md — Templates picker dialog beside Send in gymos._index.tsx reply form, routes through enqueueOutboundWhatsApp with type:'template' payload (WA-05, WA-06, WA-07)
- [x] P1b.1-06-analytics-route-PLAN.md — /gymos/analytics route with Fill Rate / Cancellation Rate / Pass Utilisation metric cards (INBX-01)
- [x] P1b.1-07-gym-agent-surface-PLAN.md — Rewrite agent-chat.ts systemPrompt + replace apps/staff-web/AGENTS.md with gym version (AGENT-04, AGENT-05)
- [~] P1b.1-08-end-to-end-verification-PLAN.md — Live-accepted 2026-05-26 in lieu of formal walkthrough. VERIFICATION.md scaffold remains as reference but user signed off in-situ after a wave of live-fixes (sign-out button, month-grid calendar, members detail link, MRR/net-growth analytics cards, agent provider wiring, env-vars→app_secrets fallback, Gmail-scope sign-in fix, Builder.io card removal). See `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-LIVE-ACCEPTANCE.md`.

**▶ Next up (post-P1b.1):**
1. **WhatsApp integration deep wire** — migrate `services/worker/` and `services/edge-webhooks/` to read Meta credentials from `app_secrets` (so the in-app Settings UI is the single source of truth, not `fly secrets set`); wire WA-08 template sync cron to replace seeded stubs with real Meta approvals; end-to-end test of outbound send + inbound delivery/read callbacks against the verified WABA.
2. **Mobile app (member surface)** — resume D2 work (Task 4 of in-app agent was pending; D2-06 verification deferred); cut an EAS preview build under the customer's existing Apple Developer Account so the studio can hand the member experience to a real test cohort.

### Phase P1c: Public Site Integrations (~2–3 weeks — DRAFT, not yet planned)

**Goal:** Productize the pilot for *visitors* — people who land on the studio's marketing site (`doyouhustle.co.uk`) but haven't signed in to anything. Two surfaces:

1. **Forms app fork** — copy `templates/forms/` into `apps/forms/` (or `apps/staff-web/features/forms/` — decided at plan time). Studios build their own lead-capture / trial-signup / contact / membership-inquiry forms in the staff back-office, embed them on the marketing site with a `<script>` snippet, and submissions land in Neon as conversations (showing up in `/gymos`) or in a dedicated `/gymos/leads` queue. ~1–2 days lift.
2. **Schedule + booking embed widget** — public route `/embed/schedule` (and possibly `/embed/book/:occurrenceId`) renderable in an `<iframe>` or via a hosted `<script>` snippet that mounts a widget. Visitor sees the live class schedule, clicks a slot, completes Stripe Checkout (drop-in or 10-pack purchase) without signing into GymOS. Cross-origin `postMessage` for "I just booked" callbacks so the host site can react (analytics, redirect, etc.). ~1–2 weeks lift — the real commercial unlock; most boutique studios pay Mindbody/Bsport mainly for this widget.

**Scope (subject to plan-phase refinement):**

- **P1c-01 — Fork forms template into the workspace.** Following the same boundary discipline as `apps/staff-web/`: `apps/forms/` (standalone) or `apps/staff-web/features/forms/` (co-located). Plan-phase picks based on whether the customer wants forms editor in the same login as staff-web.
- **P1c-02 — Forms submission → conversations queue.** Submitted form data POSTs to a public action; server creates / upserts a `gym_members` row keyed by email or phone; opens a `conversations` row in `status='lead'`; appears in `/gymos` (or a sibling `/gymos/leads` tab — UI decision).
- **P1c-03 — Public `/embed/schedule` route.** Reads the same `class_occurrences` data as the staff schedule but with anonymous access (no auth gate). Server-rendered HTML for SEO; minimal JS for click → booking flow. Themeable via URL params (`?accent=#000&radius=8`).
- **P1c-04 — Anonymous booking flow + Stripe Checkout.** Visitor picks a slot → enters name+email+phone → server creates pending `gym_members` + `bookings` row → redirects to Stripe Checkout → webhook (`P1b-07` reducer) creates a pass + binds it to the booking on success. Capacity check lives in the worker (atomic — see PITFALL #3).
- **P1c-05 — Cross-origin embed plumbing.** `<script src="https://gym-class-os.vercel.app/embed.js">` snippet that injects a styled iframe; `postMessage` API for `booking:completed` and `booking:cancelled` callbacks; sample integration doc for `doyouhustle.co.uk`.
- **P1c-06 — End-to-end test.** Embed the widget on a throwaway page, complete a real booking + Stripe Checkout from a clean browser, verify pass appears in `/gymos/members/{id}` + lead conversation appears in `/gymos`.

**Requirements:** New (to be added to REQUIREMENTS.md at plan-phase): FORMS-01..FORMS-04, EMBED-01..EMBED-06. PITFALL #3 (atomic capacity) is in scope; PITFALL #4 (pass-balance race) is in scope for the Checkout webhook reducer.

**Depends on:**
- P1b-07 Stripe webhook reducer (✓ shipped — needed for Checkout→pass binding)
- P1b-06 sendMessage chokepoint (✓ shipped — booking confirmation WhatsApp message will route through it)
- The deferred P1c work below can start in parallel with the WhatsApp deep wire + Mobile app workstreams, OR stack after them — see plan-phase

**Risks:**
- **Cross-origin auth model for the embed.** Visitor isn't logged in; submission must be safe against bots (rate limit + maybe lightweight CAPTCHA on POST). Decision at plan-phase: full anonymous + Stripe-anti-fraud, or require email-verification before booking.
- **Theming / brand fit.** Studio brand likely doesn't match GymClassOS defaults. Plan-phase decides theming scope: URL params only, or full CSS-variable injection.
- **Capacity races at scale.** Embed widget might surface a class as "1 spot left" to multiple visitors simultaneously; PITFALL #3 atomic capacity check must hold under the anonymous flow too.
- **Stripe Checkout vs. embedded Payment Element.** Checkout is faster to ship; embedded element looks more integrated. Plan-phase picks; Checkout is the safer demo default.

**Requirements (registered 2026-06-01):** FORMS-01..04, EMBED-01..06 (10 [P] reqs — now in REQUIREMENTS.md).

**Plans:** 7/7 plans complete
- [ ] P1c-01-PLAN.md (wave 0) — additive lead schema migration: conversations.status 'lead' CHECK, gym_members email/phone partial-unique, conversations (member_id,channel) unique, form_submissions table
- [ ] P1c-02-PLAN.md (wave 1) — fork templates/forms → features/forms; lead-upsert submission handler; CORS + auth publicPaths + UK phone E.164 normaliser [FORMS-01, FORMS-03]
- [ ] P1c-03-PLAN.md (wave 1) — create-checkout-link action (Stripe hosted Checkout w/ metadata.memberId for the P1b-07 reducer) [EMBED-05]
- [ ] P1c-04-PLAN.md (wave 2) — staff forms builder at /gymos/forms + Forms tab + /gymos?filter=leads inbox filter [FORMS-02]
- [ ] P1c-05-PLAN.md (wave 2) — SSR /embed/schedule widget + URL-param theming + enquire→lead CTA + seeded enquiry form [EMBED-01, EMBED-02, EMBED-03]
- [ ] P1c-06-PLAN.md (wave 3) — /embed.js <script> snippet (origin-checked postMessage relay + iframe auto-resize) [FORMS-04, EMBED-04]
- [ ] P1c-07-PLAN.md (wave 4) — end-to-end smoke test: embed → lead → Checkout → pass [EMBED-06]

---

### Phase P1c.1: Stripe Connect (Custom) + Customer Purchase Flows (INSERTED — 2026-06-12)

**Goal:** Replace the direct restricted-API-key Stripe model with a GymClassOS **platform** account using **Custom connected accounts** (white-label — studio never sees Stripe branding), onboarded via Stripe-hosted Account Links (full embedded self-serve onboarding stays in backlog 999.3-adjacent territory). All charges are **direct charges on the connected account with NO application fee** (fee model deferred — one parameter to add later). Customers can purchase packs/drop-ins AND recurring membership subscriptions from three surfaces.

> **Decision record (2026-06-12, user):** Reverses the 2026-05-17 "direct restricted-key, NOT Connect" decision. Locked: Custom account type; no platform fee for now; packs + subscriptions; all three purchase surfaces.

**Requirements:** STR-01 (reworked for Connect), STR-02, PAY-01, PAY-02, PAY-03, PAY-04, plus closes milestone-audit gaps (Demo Sprint PAY-01/STR-02)

**Success criteria:**
1. Platform Stripe account configured; a Custom connected account exists for Hustle, onboarded to `charges_enabled && payouts_enabled` via an Account Link flow launched from /gymos/settings (account id stored server-side; `account.updated` webhook keeps readiness state current)
2. Checkout sessions (one-off packs/drop-ins AND subscription memberships) are created **on the connected account**; completing a test-mode checkout grants the pass / activates the subscription via the existing P1b-07 reducers (idempotency preserved; reducers refetch account-scoped)
3. Connect webhooks (events carrying the `account` field) verified + routed through edge-webhooks → pg-boss → worker, same idempotency spine as before
4. Coach can generate and send a checkout link from the inbox/member profile (staff surface)
5. Public embed (P1c widgets) supports a buy flow that links the Checkout to a lead/member by email/phone
6. Member mobile app has a purchase screen (opens Checkout in a browser sheet) — **prerequisite: fix the /api/m/* 404 on the Vercel deploy first**
7. Stripe Customer Portal (on the connected account) reachable for subscription self-service
8. No card data stored anywhere; tokenised IDs only (STR-08 preserved)

**Plans:** 7/7 plans complete

Plans:
- [x] P1c.1-01-PLAN.md (wave 1) — additive connected_accounts table (acct_id + readiness flags, direct-to-Neon) + StripeEventPayload.stripeAccount optional field [STR-01]
- [x] P1c.1-02-PLAN.md (wave 2) — POST /webhooks/stripe-connect Connect endpoint (separate whsec_, reads event.account, same idempotency spine) [STR-01]
- [x] P1c.1-03-PLAN.md (wave 3) — thread stripeAccount through all 6 reducers refetch + new account.updated readiness reducer [STR-01, STR-02, PAY-01, PAY-02]
- [x] P1c.1-04-PLAN.md (wave 1) — getPlatformStripe() + create-connect-account (controller props) + create-account-link + settings Connect/readiness UI; restricted-key path dormant [STR-01]
- [x] P1c.1-05-PLAN.md (wave 2) — rework create-checkout-link (Connect + subscription mode + subscription_data.metadata.memberId) + create-portal-link + public /embed/buy [STR-02, PAY-01, PAY-02, PAY-03, PAY-04]
- [x] P1c.1-06-PLAN.md (wave 1) — fix /api/m/* 404 on Vercel + /api/m/purchase endpoint + mobile purchase screen (Checkout in browser sheet) [PAY-01, STR-02]
- [ ] P1c.1-07-PLAN.md (wave 3) — CHECKPOINT: user enables platform Connect + registers Connect webhook + sets secrets + onboards Hustle; then live Stripe CLI e2e → VERIFICATION.md [STR-01, STR-02, PAY-01, PAY-02, PAY-03, PAY-04]

**Wave structure (parallelism):**
- **Wave 1** (no platform-account dependency — pure code/test): 01 (schema + queue contract), 04 (onboarding actions + settings UI), 06 (mobile 404 fix + purchase screen)
- **Wave 2** (depend on wave-1 code): 02 (Connect endpoint, needs 01 queue field), 05 (purchase surfaces, needs 04 resolver)
- **Wave 3** (depend on wave-2): 03 (reducers, needs 01+02), 07 (manual prereqs CHECKPOINT + live e2e, needs 02-06)

**Manual prerequisites (Plan 07 checkpoint — executor must NOT fake):** GymClassOS platform Stripe account + Connect enabled; register a SECOND webhook endpoint /webhooks/stripe-connect with connect=true; set STRIPE_SECRET_KEY (platform key) + new STRIPE_CONNECT_WEBHOOK_SECRET as Fly/Vercel secrets; complete the Hustle Account Link onboarding with Stripe TEST verification values.

---

### Phase P2: Staff + Member Product Surfaces (~3–4 weeks)

**Goal:** Production-quality versions of every surface the demo showed, plus the surfaces the demo skipped. Coach runs a full day from staff-web; member runs their fitness life from the PWA.

**Requirements:** All remaining [P] requirements — INBX-04/05/08, MEM-03/04/05/06/07, SCH-02 through SCH-07, BKG-02/03/04/05/06, WAIT-01..06, PAY-02/03/04/05, MEMBR-04/05/07, CAL-04 through CAL-11, AGENT-04 through AGENT-09, NOTIF-01..05, RTC-01/02/03, SET-01/02/03

**Success criteria:**
1. **Differentiator #1:** Member context panel inside the inbox shows full context (next class, pass balance + expiry, active subscription, food adherence summary, lifetime bookings) without leaving the inbox
2. **Differentiator #2:** Coach can book a member from inside a conversation; flows through the same atomic booking transaction as the schedule UI
3. Recurring schedule materialises 8 weeks ahead via worker job; DST-correct
4. 50-concurrent booking test on a 12-seat class → exactly 12 succeed; pass balances never go negative
5. Waitlist promote + WhatsApp offer + reply-to-confirm cycle works end-to-end (one happy path + one TTL-expiry path)
6. Stripe Checkout links flow back to pass / subscription state via webhook reducer
7. 24h + 2h reminders fire idempotently; re-running the reminder generation produces no duplicate sends
8. Member can do full calorie counter loop: search/barcode/custom-entry/manual log + see daily and weekly totals + macro rings against profile-derived targets
9. In-app agent has full skill set (book, cancel, view schedule, view passes, log food NL, escalate to coach) with audited tool calls + persistent sessions + memory

**Risks (from PITFALLS.md):**
- #3 (class capacity double-booking) — atomic SQL + 50-concurrent test
- #4 (pass-balance race) — `SELECT ... FOR UPDATE` + ledger insert in same transaction
- #5 (DST in UI / engine) — schedule UI renders in studio-local TZ
- #18 (waitlist auto-promotion race) — synchronous cancel + promote, idempotent `singletonKey`, reconciliation cron
- #21 (pass expiry timezone) — end-of-day in studio's IANA TZ

**UI hint:** yes

### Phase P3: AI Noticeboard Home (~1–2 weeks)

**Goal:** Replace the `/gymos` post-login landing with an old-school noticeboard/bulletin-board dashboard (Polsia-style; fits the gym brand). A board of section cards is the first thing a coach/manager sees after login. The existing right-rail agent chat stays but gains the ability to **author** dashboard content — turning the agent from read-only Q&A into a human-in-the-loop operator that surfaces recommendations and recently-taken actions, and maintains a prioritized Tasks list.

**Locked decisions (from discussion 2026-06-03 — fixed, do not relitigate):**
1. **AI role = "Suggest + one-click act".** AI proposes an action (draft a win-back WhatsApp to lapsing members, promote an under-filled class); coach approves with one click; AI executes via the **existing** actions (`send-template-to-members`, `create-checkout-link`, `navigate`). Deliberate shift from the read-only pilot posture to human-in-the-loop. **CRITICAL:** existing WhatsApp compliance gates (opt-in + 24h window + approved-template, enforced at the worker chokepoint) MUST stay in force — one-click approve does NOT bypass them. Coach approves every send.
2. **Progress subheadings = computed** from existing `list-*` actions wherever a real metric exists (`list-fill-rate`, `list-renewals`, `list-at-risk-members`, `list-revenue`, inbox unread/open counts); AI-written prose only fills gaps + section bodies.
3. **V1 sections** = Inbox (WhatsApp), Schedule, Members, Revenue — PLUS an "AI today" status header strip (what the agent just did / is working on) and an AI-curated overall **Tasks** section (prioritized; each task can carry a one-click action).

**Four-area scope (agent-native contract — all four required):**
- **UI:** new noticeboard route + section cards (noticeboard aesthetic; shadcn primitives; Tabler icons; CSR via `ClientOnly` — logged-in page, SSR not required).
- **Storage (SQL):** the agent now authors dashboard state → additive persistence for per-section AI notes + Tasks list + pending one-click action proposals (new tables e.g. `dashboard_notes` / `dashboard_tasks`, or `application_state`). Strictly additive migrations applied direct-to-Neon-via-MCP per the P1c `0001–0004` pattern (`db.ts` does NOT auto-run gymos migrations).
- **Actions:** new `defineAction` ops for the agent to upsert section content, create/complete tasks, and the propose→approve→execute handshake (approve invokes existing send/checkout actions; gates intact).
- **Skills/AGENTS.md:** update `apps/staff-web/AGENTS.md` to teach the board-authoring + suggest-and-act role; revise the now-outdated "read-only for pilot" / "Agent CANNOT send WhatsApp" notes to reflect the human-in-the-loop one-click model.

**Success criteria:**
1. `/gymos` post-login home renders the noticeboard with 4 section cards (Inbox, Schedule, Members, Revenue) + AI-today header + Tasks section
2. Each section's progress subheading shows a real computed metric from the existing `list-*` actions (not placeholder text)
3. The agent can populate a section body with a recommendation or recent-action note that persists in SQL and survives reload
4. The agent can create/complete Tasks; coach sees them prioritized
5. A propose→approve→execute round-trip works for at least one action (e.g. send-template-to-members), and the approve path is gated by the existing opt-in/24h/template checks at the worker — an out-of-window or no-opt-in send is still rejected
6. `apps/staff-web/AGENTS.md` updated so the agent's documented posture matches the shipped suggest-and-act behavior

**Constraints (carried into planning):** single-tenant (no `studio_id`); gym domain tables don't use `ownableColumns()` so no `accessFilter` on them; staff-web MUST NOT import `@gymos/whatsapp` (sends go through queue→worker chokepoint); local `agent-native dev` can't boot (Nitro/Vite) → verify by replaying SQL against `gymos-demo` Neon via MCP or defer to an e2e smoke (no local HTTP walkthrough).

**Depends on:** P1b.1 (send-template-to-members + opt-in/template gates — both ✓), P1c (lead/conversation surfaces — ✓). Sequence after P2 product surfaces, or pull forward independently since it sits on already-shipped actions.

**UI hint:** yes

**Plans:** 6/7 plans executed

Plans:
- [x] P3-ai-noticeboard-01-dashboard-storage-PLAN.md (wave 1) — additive migration 0005 (dashboard_notes/tasks/proposals) applied to gymos-demo Neon + Drizzle schema exports [SC-3, SC-4, SC-5]
- [x] P3-ai-noticeboard-02-authoring-actions-PLAN.md (wave 2) — list-inbox-summary + upsert-section-note + create-task + complete-task actions [SC-2, SC-3, SC-4]
- [x] P3-ai-noticeboard-03-propose-approve-handshake-PLAN.md (wave 2) — propose-action + approve-proposal (allowlist + re-validate, gates intact) + reject-proposal [SC-5]
- [x] P3-ai-noticeboard-04-route-restructure-PLAN.md (wave 3) — move inbox to /gymos/inbox; noticeboard route loader scaffold; GymosTopNav Home+Inbox tabs [SC-1]
- [x] P3-ai-noticeboard-05-noticeboard-components-PLAN.md (wave 4) — AiTodayStrip + BoardCard (4 sections, computed metrics) + TasksSection wired to the route [SC-1, SC-2, SC-3, SC-4, SC-5]
- [x] P3-ai-noticeboard-06-agent-posture-PLAN.md (wave 3) — system prompt + AGENTS.md suggest-and-act rewrite + navigate vocabulary [SC-6]
- [ ] P3-ai-noticeboard-07-e2e-smoke-PLAN.md (wave 5) — live Vercel + Neon e2e: board render, agent authoring, propose->approve->execute with worker gate proof [SC-1..SC-6]

## Progress

**Execution Order:**
Demo Sprint runs first (D0 → D1 → D2 over 7 days). Production v1 runs after (P0 → P1a → P1b → P2 over 8 weeks).

| Milestone / Phase | Requirements | Status | Completed |
|---|---|---|---|
| **Demo Sprint** | | | |
| D0. Fork + Schema + Deploys | 5 | ✓ Complete | 2026-05-17 |
| D1. Staff Surfaces Adapted | 12 | ✓ Complete | 2026-05-19 |
| D2. Member PWA + Calorie + Agent | 3/6 | ◐ In Progress (Task 4 + EAS build outstanding) | partial |
| **Production v1** | | | |
| P0. Audit & De-Risk | 6 | Not started | - |
| P1a. Data Foundation, Auth & Deploy | 19 | Not started | - |
| P1b. Webhook + Worker Spine | 18 | ◐ 8/9 plans (P1b-09 WA-08 template sync still open — rolls into Next-up WhatsApp work) | 8/9 by 2026-05-23 |
| **P1b.1. Customer Pilot Enablement** | 8 | ✓ **Live-accepted** | **2026-05-26** (8/8 plans + live-fix wave) |
| **P1c. Public Site Integrations** | 10 | ✓ **Complete** (7/7 plans; lead funnel verified live on deploy; Stripe Checkout deferred to studio Stripe setup) | **2026-06-01** |
| P2. Staff + Member Product Surfaces | 50+ | Not started | - |
| P3. AI Noticeboard Home | 6/7 | In Progress|  |

**Active workstreams (next up):**
- **WhatsApp deep wire** — migrate worker + edge-webhooks credentials from `process.env` to `app_secrets`; wire WA-08 template sync (P1b-09); live test against verified WABA
- **Mobile app** — finish D2-06 Task 4 + cut EAS build for customer's Apple Developer Account
- **Studio Stripe setup** — restricted key + Products tagged with pack keywords (`10-pack`/`5-pack`/`drop-in`); unblocks D1-03 payments AND the P1c Checkout-link → pass loop (customer task)
- ✓ **Public site integrations (P1c — SHIPPED 2026-06-01)** — forked agent-native's forms template + `/embed/schedule` widget + `/embed.js` snippet live on `gym-class-os.vercel.app`; lead funnel (form → `/gymos` lead) verified end-to-end. GHL lead-capture replaced; booking-payment loop pending studio Stripe setup.

**Coverage:** 130 v1 requirements mapped across two milestones (31 demo + 99 production).

---

## Backlog

Unsequenced parking lot (999.x). Promote with `/gsd:review-backlog` when ready.

### Phase 999.1: `@gymos/shared-types` contract package for the mobile↔backend API/schema seam (BACKLOG)

**Goal:** Formalize the mobile↔backend contract as a real package boundary. Today `packages/mobile-app` consumes the `/api/m/*` routes (8 routes in `apps/staff-web/app/routes/api.m.*.tsx`) and the `apps/staff-web` Drizzle schema/types via workspace/relative imports + convention. Extract the shared request/response types (and relevant Drizzle-derived types) into a versioned package both `apps/staff-web` and `packages/mobile-app` depend on — or generate a typed client from the route contracts.

**Why:** (a) catches backend↔mobile contract drift at compile time *now*, and (b) is the prerequisite that turns SEED-001 (extracting the mobile app into its own repo) into a mechanical move-and-rewire instead of a rearchitecture.

**Requirements:** TBD
**Plans:** 0 plans
**Scope:** Medium (a focused phase). Not urgent — do before any mobile repo split; candidate for P0-audit or P2. Related: `SEED-001-extract-mobile-app-own-repo`.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.2: Dedicated GymClassOS Meta Business portfolio + business verification (BACKLOG)

**Goal:** Stand up a dedicated "GymClassOS" Meta Business portfolio and complete its business verification, separate from the current "Myütik" business that owns the WhatsApp app (app ID `1638609197193795`).

**Why:** Vertical-SaaS-factory model wants one clean, verified business portfolio per product (separate apps, system users, billing, audit). Business verification is a prerequisite for WhatsApp **Embedded Signup** and is done once per business. Verification takes **days** of Meta review, so creating the portfolio + starting verification is the one piece worth doing early/in parallel — it is non-destructive and does not touch the live app or the demo path.

**Context:** Surfaced 2026-06-02 while connecting the first customer (Hustle). Hustle's WhatsApp number lives in a different Meta business than the app, forcing a cross-business WABA partner-share gated behind Hustle's billing manager. Pairs with 999.3.

**Requirements:** TBD
**Plans:** 0 plans
**Scope:** Small/ops (mostly Meta dashboard + verification docs). Do NOT migrate the app here — that's 999.3, after the demo.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.3: Transfer app to GymClassOS business + WhatsApp Embedded Signup for self-onboarding (BACKLOG)

**Goal:** After the first-customer demo is working: (a) transfer the GymClassOS app from the Myütik business into the new GymClassOS business (App Dashboard → Settings → Advanced → change business — a **transfer, not recreate**, which generally preserves the app ID + app secret so Fly secrets keep working; verify before relying on it), then re-test the WhatsApp webhook + Fly secrets; (b) build WhatsApp **Embedded Signup** (Tech Provider flow) so studio #2+ can self-onboard their own WABA via a Meta login flow.

**Why:** Replaces the manual cross-business partner-share + billing-admin dance hit with Hustle. Embedded Signup is the correct, scalable onboarding path for additional studios and is the payoff for the verified business portfolio in 999.2.

**Context:** Surfaced 2026-06-02. Depends on 999.2 (verified GymClassOS business) being done first; sequence after Milestone 1 demo is live.

**Requirements:** TBD
**Plans:** 0 plans
**Scope:** Medium (app transfer is ops + re-test; Embedded Signup is a real feature — Tech Provider config, signup UI, token capture, per-studio secret wiring).

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

---

### Phase 999.4: Apple Health (HealthKit) integration for the member app (BACKLOG)

**Goal:** Let a member link their Apple device so the member app reads HealthKit data — workouts/exercise "sessions" (`HKWorkout`) + activity/energy — and reconciles it with GymClassOS class attendance / member activity. Feeds the long-planned staff "Coach View".

**Why:** Requested by the user 2026-06-15. Promotes the previously-deferred "HealthKit / Coach View" item from out-of-scope to a planned feature.

**Hard constraints (shape the whole phase):**
- iOS-native only — no web, no react-native-web, no Expo Go. The local-web testing recipe does NOT apply; testing requires a physical iPhone running a custom build.
- Needs a native module (`react-native-health` or an Expo HealthKit config plugin) + an **EAS dev-client/preview build**; HealthKit entitlement + `NSHealthShareUsageDescription` in iOS config.
- **Prerequisite blocker:** EAS is still pointed at the upstream agent-native account (`owner: steve8708`, bundle `com.agentnative.mobile`). Must be re-pointed to the customer's Apple Developer account with HealthKit capability enabled before any build.
- Patrick develops on Windows → iOS builds must go through **EAS cloud** (no local Xcode).

**Context:** Surfaced 2026-06-15. Already anticipated as "Coach View (depends on HealthKit landing)" (backlog) and REQUIREMENTS §Out-of-Scope-v1 "HealthKit". Full detail in memory `project_gymos_apple_health.md`.

**Requirements:** TBD
**Plans:** 0 plans
**Scope:** Large — 4-area feature (onboarding/permission link step, HealthKit reader→session mapping, additive `/api/m/*` sync endpoint, member UI + later staff Coach View) gated on the EAS/Apple-account prerequisite.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

---

*Roadmap created: 2026-05-17*
*Revised: 2026-05-17 — major restructure (Demo Sprint + Production v1 two-milestone shape; mobile = PWA; Stripe direct; calorie counter in v1)*
*Revised: 2026-05-19 — D2 plan list registered (6 plans), success criteria realigned to native Expo flow (was inherited PWA wording), MEMBR-06 dropped from D2 (PWA manifest is N/A for native Expo Go; rolled into P1a EAS work)*
*Revised: 2026-06-01 — P1c Public Site Integrations planned (7 plans) + executed + verified live on deploy → marked Complete. Migrations 0003+0004 applied to gymos-demo Neon. FORMS-01..04 + EMBED-01..06 added (140 reqs total). Checkout-link + visual-browser checks deferred (studio Stripe setup / dev-server NitroViteError).*
*Revised: 2026-06-14 — merged `redesign/ui-refresh` into master. v1.1 UI Redesign roadmap (R1–R5, complete) now leads this file above the v1.0 section.*
*Revised: 2026-06-18 — v1.2 Agentic Tab Editing roadmap (AE1–AE3) prepended at top. 18 requirements mapped across 3 phases.*
*Out of v1 scope: Native mobile (v1.x), HealthKit, Coach View with health context, CRM campaigns + segments, Knowledge Base, Operational Reporting, bsport-migration productisation, A2A. See REQUIREMENTS.md §Post-v1 Backlog and PLATFORM-VISION.md.*
