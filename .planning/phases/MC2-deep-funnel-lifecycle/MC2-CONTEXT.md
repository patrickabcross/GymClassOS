# Phase MC2: Deep-funnel lifecycle - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

A lead's progression after the form — **replied** (WhatsApp), **bought** (Stripe), **attended** (booking) — is reported to the studio's Meta Pixel as **Contact / Purchase / Schedule** Conversions-API events, fired from the **Fly worker** (the sole CAPI sender from MC1), reusing the `fbc`/`fbp` attribution stored on `meta_lead_attribution` at submit time, so campaigns optimise for deep-funnel quality and LTV.

**This phase ADDS senders on top of MC1's foundation** — the `meta-capi-event` queue, the worker CAPI handler, the `stageEventMap` resolver, and the `meta_lead_attribution` table (with per-stage sent markers) already exist. MC2 wires three new fire points + extends the payload/handler for `value`/`currency` and per-event `action_source`, and adds the missing attended-transition write path.

**In scope (MC2):** Contact on first WhatsApp inbound reply (LIFE-01), Purchase on Stripe `checkout.session.completed` + `invoice.paid` (LIFE-02), Schedule on booking→attended (LIFE-03) **including building the attended-transition chokepoint**, stageEventMap-driven event naming + ops doc of the Contact optimisation target (LIFE-04).

**Out of scope (later phases):** Meta Lead Ads / Instant Forms ingestion (MC3). Full attendance/check-in UI beyond the minimal `markBookingAttended` transition.

</domain>

<decisions>
## Implementation Decisions

### Idempotency (durable, not just in-flight)
- **D-01:** Each lifecycle send is gated on the **persisted per-stage marker column** on `meta_lead_attribution` — `contactSentAt` (LIFE-01), `purchaseSentAt` (LIFE-02), `scheduleSentAt` (LIFE-03). These columns already exist (added by MC1 v32). The worker checks the marker is null before sending and stamps it (with timestamp) after a successful CAPI send. This survives "repeat inbound weeks later" / worker restarts, which pg-boss retention alone does not.
- **D-02:** pg-boss `singletonKey` on the Meta `event_id` (already wired in MC1's `enqueueMetaCapiEvent`) stays as a **secondary in-flight guard** against concurrent/queued duplicates. Two layers: persisted marker = durable truth; singletonKey = concurrency guard.
- **D-03:** `event_id` formulas are fixed by REQUIREMENTS.md and MUST be used verbatim: Contact = `memberId:contact` (per LIFE-01); Purchase = keyed on the Stripe object id (see D-07); Schedule = `memberId:occurrenceId` shape (per LIFE-03, one per member+occurrence).
- **NOTE on Purchase vs. single-marker:** `purchaseSentAt` is a single timestamp but a member legitimately purchases multiple times (renewals each report — D-06). The single column cannot be the dedup key for Purchase. **Purchase idempotency is keyed on the Stripe-object `event_id` (D-07), not the `purchaseSentAt` marker** — the marker records "ever purchased / last purchase sent" for status/health only. Researcher/planner: confirm whether a per-transaction sent-ledger is needed, or whether the Stripe-object `event_id` + singletonKey + a replay guard at the reducer is sufficient. Contact and Schedule ARE one-shot per member(+occurrence), so their markers ARE the dedup truth.

### Missing-attribution policy (mirror MC1 D-14 "always fire")
- **D-04:** When a member has **no `meta_lead_attribution` row** (pre-MC1 member, walk-in, organic signup), lifecycle events **still fire** — with hashed email/phone from `gym_members`, omitting `fbc`/`fbp`. Forward-compatible (Meta can still match on PII / match later); harmless when unmatched.
- **D-05:** In the no-row case, **upsert a `meta_lead_attribution` row keyed on `member_id`** so the per-stage sent marker (and any future fbc/fbp) has a home. Reuse the same member-keyed upsert MC1's `submissions.ts` established.

### Purchase keying + value (LIFE-02)
- **D-06:** Hook Purchase into the **two existing Stripe reducers** — `services/worker/src/domain/stripeReducers/checkout-session-completed.ts` and `invoice-paid.ts` (these currently enqueue nothing). Renewals each report (distinct invoice ids); webhook replays of the same event dedupe.
- **D-07:** Key `event_id` on the **Stripe object's own id, per reducer**:
  - `checkout.session.completed` → `event_id = purchase:<checkout_session_id>`, `value = amount_total / 100`.
  - `invoice.paid` → `event_id = purchase:<invoice_id>`, `value = amount_paid / 100`.
  - `currency` taken from the Stripe event (already ISO-4217 lowercase). Each renewal invoice id is unique (reports); a replayed webhook reuses the id (dedupes).
- **D-08:** **Zero-decimal currencies** (JPY, KRW, etc.) must NOT be divided by 100 — follow Stripe's minor-unit rules (Claude's discretion; researcher to confirm the canonical zero-decimal list). HUSTLE is GBP (2-decimal) so `/100` is correct for the live customer, but the helper must be currency-correct for repeatability.

### Schedule attendance hook (LIFE-03)
- **D-09:** **No code sets `bookings.status = 'attended'` today** (only `cancelled`/`completed`/`refunded` exist; `attended` appears only in analytics reads + demo seed). MC2 **builds one attended-transition chokepoint** — a `markBookingAttended(bookingId)` helper/action that (a) sets `status = 'attended'` (+ `attendedAt`) and (b) enqueues the Schedule `meta-capi-event`. All future attendance-marking routes through this one function.
- **D-10:** Schedule fires **exactly once per (member, occurrence)** — `event_id = memberId:occurrenceId` + the `scheduleSentAt` marker gate (D-01). Re-marking / un-marking / retroactive attendance does **not** re-fire (the marker + event_id are already set). Un-marking does not "un-send" (Meta events are append-only).
- **D-11:** This is the **minimal** transition (status flip + event), NOT a full check-in UI. A staff/agentic check-in surface is deferred.

### stageEventMap + ops (LIFE-04)
- **D-12:** Event naming flows through the **existing `stageEventMap` resolver** (MC1 — `services/worker/src/lib/stage-event-map.ts` + the staff-web twin). MC2 does NOT rework the resolver; renaming an event in config changes the reported `event_name` with no code change (LIFE-04 success criterion #4). Each fire point resolves its `event_name` via the resolver (`Contact`/`Purchase`/`Schedule` defaults).
- **D-13:** Document the **Contact event as the recommended campaign optimisation target** for ops (per LIFE-04) — a short note in the SUMMARY / an ops doc, not UI.

### action_source per event
- **D-14:** Contact uses `action_source = system_generated` (REQUIRED by LIFE-01 — no browser counterpart). Purchase and Schedule are also server-only with no browser event → `action_source = system_generated` as well (Claude's discretion; researcher to confirm Meta accepts `system_generated` for Purchase/Schedule, else `website`/`physical_store`). Unlike MC1's Lead (browser+server dedup), these have **no browser pixel counterpart** — server-only, so no `event_id` dedup against a browser event is needed.

### Carried forward from MC1 (LOCKED — not re-decided)
- **D-15:** Worker is the **sole CAPI sender** (MC1 D-01) — every fire point ENQUEUES a `meta-capi-event` job; nothing POSTs to Meta directly from staff-web or inline.
- **D-16:** PII (`em`/`ph`) **SHA-256 hashed after normalization**; `fbc`/`fbp`/IP/UA never hashed; `META_CAPI_TOKEN` never logged / never client-side (MC1 D-17).
- **D-17:** A failing send for one event/tenant is **isolated** — does not break other events or the reducer/inbound flow (MC1 D-18). Lifecycle enqueue is best-effort: wrap in try/catch so a queue failure never rolls back the WhatsApp message / Stripe reducer / attendance write.
- **D-18:** Graph **v23** CAPI endpoint, `event_time` in Unix **seconds**, top-level `test_event_code`, terminal-vs-retryable error split — all already implemented in the MC1 worker handler; reuse, don't duplicate.

### Claude's Discretion
- Whether `MetaCapiEventPayload` (MC1) needs new fields for `value`/`currency`/`custom_data` and per-event `action_source` (it likely does — Purchase carries value) — researcher confirms the current schema shape and extends it additively.
- Whether the worker handler needs a `custom_data` block for Purchase `value`/`currency` (Meta requires `custom_data.value` + `custom_data.currency` for Purchase) — researcher confirms Meta's Purchase payload spec.
- Exact location of `markBookingAttended` (staff-web action vs worker helper) and how it resolves the `occurrenceId` for a booking.
- Whether a per-transaction Purchase sent-ledger table is needed vs. Stripe-object `event_id` + singletonKey sufficiency (see D-03 NOTE).
- First-inbound-reply detection in `inbound-whatsapp.ts`/`conversations.ts` (the insert-dedup + lead→working promotion already exist; reuse to detect "first reply").

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase + requirements
- `.planning/ROADMAP.md` § "Phase MC2: Deep-funnel lifecycle" — goal + success criteria.
- `.planning/REQUIREMENTS.md` § LIFE-01..04 — authoritative requirement text (idempotency key formulas live here).
- `.planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md` — carried-forward locked decisions D-01..D-18 (sole-sender, hashing, always-fire, stageEventMap).

### MC1 foundation this phase builds on
- `.planning/phases/MC1-foundation-lead-event/MC1-02-SUMMARY.md` — the frozen `MetaCapiEventPayload` field list + `enqueueMetaCapiEvent()` (singletonKey on event_id). **MC2 extends this payload for value/currency.**
- `.planning/phases/MC1-foundation-lead-event/MC1-03-SUMMARY.md` — the worker CAPI handler (Graph v23, hashing, error split, write-back). **MC2's events flow through this same handler.**
- `packages/queue/src/types.ts` — `QUEUE_NAMES.META_CAPI_EVENT` + `MetaCapiEventPayload` Zod schema. **Add value/currency/action_source fields additively.**
- `packages/queue/src/publish.ts` — `enqueueMetaCapiEvent()` (singletonKey). Worker imports from `@gymos/queue`; staff-web from `app/lib/queue-client.ts`.
- `services/worker/src/queues/meta-capi-event.ts` — the CAPI sender handler. **Extend to build Purchase `custom_data` (value/currency) + per-event action_source; resolve event_name via stageEventMap (already does).**
- `services/worker/src/lib/stage-event-map.ts` — the resolver (LIFE-04). Reuse as-is.
- `apps/staff-web/server/db/schema.ts` — `metaLeadAttribution` (lines ~722-751): `fbc`/`fbp`, `contactSentAt`/`purchaseSentAt`/`scheduleSentAt` markers. **Gate sends + stamp markers here.**

### Fire points (where each event hooks)
- `services/worker/src/queues/inbound-whatsapp.ts` + `services/worker/src/domain/conversations.ts` — inbound WA message path; lead→working promotion + insert-dedup. **Contact (LIFE-01) fires on first inbound reply on a lead conversation.**
- `services/worker/src/domain/stripeReducers/checkout-session-completed.ts` — **Purchase fire point #1** (event_id=purchase:<session_id>, value=amount_total/100).
- `services/worker/src/domain/stripeReducers/invoice-paid.ts` — **Purchase fire point #2** (event_id=purchase:<invoice_id>, value=amount_paid/100).
- `services/worker/src/domain/stripeReducers/dispatch.ts` + `index.ts` — reducer dispatch registry; confirm how reducers run + the Stripe-event idempotency already in place (`services/edge-webhooks/src/lib/idempotency.ts`).
- `services/worker/src/domain/stripeReducers/charge-refunded.ts` — model for "a reducer that mutates booking/member state" (sets status refunded) — closest shape to a reducer-side enqueue.
- **Attended write (LIFE-03):** NO existing site — MC2 creates `markBookingAttended`. `apps/staff-web/actions/mark-occurrence-complete.ts` + `cancel-occurrence.ts` are the closest existing booking-status-write actions to model on.
- `services/worker/src/lib/db.ts` — worker DB handle + `bookings`/`attendedAt` column; the worker-side schema the Stripe/inbound hooks use.

### Project rules
- `CLAUDE.md` / `AGENTS.md` — additive-only migrations (no drop/rename), no `drizzle-kit push`, access-scoping (`guard:allow-unscoped` marker for worker raw SQL), shadcn/Tabler UI, optimistic UI, no breaking DB changes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **MC1 `meta-capi-event` queue + worker handler** — the entire send path (decrypt token, build payload, POST v23, error split, write-back) is done; MC2 reuses it and only extends the payload for value/currency + action_source.
- **Per-stage marker columns** (`contactSentAt`/`purchaseSentAt`/`scheduleSentAt`) already on `meta_lead_attribution` — no migration needed for the idempotency markers (D-01).
- **`stageEventMap` resolver** (worker + staff-web twins) — LIFE-04 is largely satisfied by MC1; MC2 just calls it per fire point.
- **`submissions.ts` member-keyed attribution upsert** (MC1) — model for the no-row upsert (D-05).
- **Stripe reducer pattern** (`charge-refunded.ts` mutates state) — model for adding the Purchase enqueue in the two reducers.
- **`mark-occurrence-complete.ts` / `cancel-occurrence.ts`** — model for the new `markBookingAttended` status-write action.

### Established Patterns
- **Enqueue from the worker** = import `enqueueMetaCapiEvent` from `@gymos/queue`; **enqueue from staff-web** (the attended action) = import from `app/lib/queue-client.ts`.
- **Stripe idempotency** already exists at the edge (`services/edge-webhooks/src/lib/idempotency.ts`) — reducers run once per event id; MC2's per-transaction event_id (D-07) is the Meta-side dedup layer on top.
- **Worker raw SQL** on ownable/attribution tables uses the `// guard:allow-unscoped` marker (MC1 precedent).

### Integration Points
- Contact: `inbound-whatsapp.ts` first-reply branch → check `contactSentAt` null → `enqueueMetaCapiEvent({eventName resolved, action_source:system_generated, event_id:memberId:contact})` → stamp marker on success.
- Purchase: each Stripe reducer → enqueue with Stripe-object event_id + value/currency.
- Schedule: new `markBookingAttended` → status flip + enqueue (event_id=memberId:occurrenceId).
- All three resolve `fbc`/`fbp` + hashed PII from `meta_lead_attribution` + `gym_members` by `member_id` (upsert row if missing).

### Constraints / gotchas to respect
- `purchaseSentAt` single column ≠ Purchase dedup key (renewals) — see D-03 NOTE; Purchase dedup is the Stripe-object event_id.
- Lifecycle enqueue must be best-effort (try/catch) — never roll back the WA message / Stripe reducer / attendance write on a queue error (D-17).
- Member upsert dual-unique-key reconcile (email AND phone) — attribution/markers key off the resolved `member_id`.
- Migrations (if any new column/table needed, e.g. a Purchase sent-ledger) are additive, inline in `apps/staff-web/server/plugins/db.ts` `runMigrations`, next free version after **v33**.

</code_context>

<specifics>
## Specific Ideas

- Contact `event_id = memberId:contact`; Schedule `event_id = memberId:occurrenceId`; Purchase `event_id = purchase:<stripe_session_or_invoice_id>`.
- Purchase requires Meta `custom_data.value` + `custom_data.currency` (LTV/ROAS) — value from Stripe minor units ÷ 100 (except zero-decimal currencies).
- Contact `action_source = system_generated` (LIFE-01, literal).
- Idempotency = persisted marker columns (Contact/Schedule) + Stripe-object event_id (Purchase) + pg-boss singletonKey (concurrency guard).
- LIFE-04 "rename event without code change" is already provable via the MC1 stageEventMap resolver — MC2 adds an ops note naming Contact as the optimisation target.

</specifics>

<deferred>
## Deferred Ideas

- **Meta Lead Ads / Instant Forms ingestion** (LEAD-01..03) — Phase MC3.
- **Full attendance / check-in UI** — MC2 builds only the minimal `markBookingAttended` transition; a staff/agentic check-in surface is later.
- **Refund → reversal events** (e.g. reporting a refund to Meta) — not in LIFE scope; note for a future phase if ROAS accuracy needs it.
- **EMQ / match-quality surfacing in the UI** for lifecycle events — MC1 deferred this for Lead; same here.

None of these block MC2.

</deferred>

---

*Phase: MC2-deep-funnel-lifecycle*
*Context gathered: 2026-06-23*
