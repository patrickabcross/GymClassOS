# Milestone v2.2 Requirements — Meta Conversion Tracking

**Defined:** 2026-06-23
**Goal:** Report HUSTLE's form-lead conversions and full CRM lifecycle to the studio's own Meta Pixel via browser Pixel + Conversions API (deduplicated), then extend the same chokepoint to Meta Lead Ads.

**Scope note:** Single-tenant per deploy — `pixelId`/`capiToken` are studio-global config the operator enters in Settings (no hardcoding to HUSTLE; repeatable per client). All Meta events originate from the backend off DB transitions (chokepoint rule); the Fly worker is the single sender. Strictly additive DB changes. Grounded against existing transitions — no new CRM/pipeline is built.

**Architecture (locked in conversation 2026-06-23):**
- CAPI fires from the Fly worker via a new pg-boss `meta-capi-event` queue; staff-web only enqueues (never calls Meta directly).
- New additive `meta_lead_attribution` table (keyed by `member_id`) stores `fbc`/`fbp`/`initial_event_id` + per-stage fired markers — for offline attribution + idempotency.
- Studio config: `pixelId` + `stageEventMap` + `testEventCode` stored studio-global; `META_CAPI_TOKEN` as an encrypted `app_secret`. Entered via a "Meta Conversion Tracking" card in `/gymos/settings/integrations`.
- Event mapping (configurable, defaults): **Lead** (form submit, `action_source=website`) / **Contact** (first inbound reply on a lead conversation) / **Purchase** (Stripe reducer) / **Schedule** (booking→attended). Optimization target = **Contact**.
- Consent: **assumed** — Meta Pixel/ad-tracking consent is managed by the customer's own site consent bar and assumed correctly configured. We do NOT implement a consent gate or signal bridge. The only consent we control is the form's WhatsApp opt-in (which governs WhatsApp messaging, not Meta tracking). *(Caveat on record: a parent-site consent bar does not natively govern a cross-origin iframe, so this is a deliberate assumption that the customer's setup permits tracking.)*
- Graph API pinned to **v23**.

---

## v2.2 Requirements

### PIX — Browser Pixel + capture (in the public form iframe)

- [ ] **PIX-01**: The public form page (`/f/:slug`) loads the studio's Meta Pixel (templated `pixelId` from studio config) and fires a browser `Lead` event on successful submit, sharing an `event_id` with the server event for deduplication.
- [ ] **PIX-02**: `embed.js` reads `fbclid` + `_fbc`/`_fbp` cookies from the **parent page** and passes them into the cross-origin iframe (so ad-click attribution survives the iframe boundary, where `location.search` has no `fbclid` and third-party cookies may be partitioned).

### CAPI — Server-side Conversions API infrastructure

- [ ] **CAPI-01**: Studio Meta config storage — `pixelId` + `testEventCode` stored studio-global; `stageEventMap` resolved server-side with sensible defaults (Lead/Contact/Purchase/Schedule); `META_CAPI_TOKEN` stored as an encrypted `app_secret`.
- [ ] **CAPI-02**: Additive `meta_lead_attribution` table (keyed by `member_id`) persists `fbc`/`fbp`/`initial_event_id` at submit time plus per-stage fired markers, for later offline attribution and idempotency.
- [ ] **CAPI-03**: `/api/submit/:id` is extended to accept and persist `fbc`/`fbp`/`event_id`/`pageUrl` from the iframe, and enqueues a `meta-capi-event` job — it does not call Meta directly.
- [ ] **CAPI-04**: A pg-boss `meta-capi-event` queue + Fly worker sender POSTs to the Meta Conversions API (Graph v23) with SHA-256-hashed email/phone + `fbc`/`fbp` + client IP/UA, retrying on 5xx/network failures (events are never dropped); a failing send for one tenant/event is isolated and does not break others.
- [ ] **CAPI-05**: The browser `Lead` and server `Lead` events share an identical `event_id` so Meta deduplicates them (counted once) — verified in Events Manager Test Events.
- [ ] **CAPI-06**: A dedicated **"Meta Conversion Tracking"** card in `/gymos/settings/integrations` (alongside Stripe Connect) lets the operator enter their Pixel ID (plain field → studio config via `defineAction`), Conversions API token (masked → `app_secrets`), and Test Event Code (plain field), with a status indicator + "Send test event" affordance. Single entry point for the token (no duplicate `app_secrets` row).

### LIFE — Deep-funnel lifecycle events (website leads)

- [ ] **LIFE-01**: When a lead first replies on WhatsApp (first inbound message on a `lead` conversation, in the worker), a `Contact` CAPI event fires once using the stored `fbc`/`fbp` (`action_source=system_generated`), idempotent via `event_id=memberId:contact`.
- [ ] **LIFE-02**: When a member's purchase is recorded (Stripe reducer — `checkout.session.completed` / `invoice.paid`), a `Purchase` CAPI event fires carrying `value` + `currency` (for LTV/ROAS), keyed on the Stripe transaction id so **renewals each report** while webhook replays deduplicate.
- [ ] **LIFE-03**: When a booking's status flips to `attended`, a `Schedule` CAPI event fires once per (member, occurrence) using stored attribution.
- [ ] **LIFE-04**: The stage→event mapping is driven by the configurable `stageEventMap` (events can be renamed without code changes); the optimization target (Contact) is documented for ops.

### LEAD — Meta Lead Ads (Instant Forms) + CRM lifecycle

- [ ] **LEAD-01**: Meta Lead Ads (Instant Form) submissions are received via the Lead Retrieval webhook (edge-webhooks), signature-verified, and ingested as `gym_members` + `lead` conversations using the same dual-unique-key reconcile as website-form leads, capturing the Meta `lead_id`.
- [ ] **LEAD-02**: Ingested Lead-Ad leads advance through the same lifecycle (Contact/Purchase/Schedule) reported back to Meta keyed on `lead_id` (Conversions API for CRM / lead lifecycle) so in-platform leads progress in Meta's Leads Center.
- [ ] **LEAD-03**: Any WhatsApp follow-up to a Lead-Ad lead routes through the existing opt-in / 24h-window / approved-template worker chokepoint (no bypass).

---

## Future Requirements (deferred)

- [ ] **CAPI-FUT-01**: Expose `stageEventMap` editing in the Settings card ("Advanced" reveal) so the operator can rename Meta events from the UI.
- [ ] **STRIPE-FUT-01**: Stripe sales-side conversion tracking beyond membership Purchase (e-commerce product/catalog events, refunds as negative conversions).
- [ ] **EMQ-FUT-01**: Event Match Quality enrichment — send additional hashed identifiers (first/last name, city) to raise match rates.

---

## Out of Scope

- **Stripe sales-side e-commerce conversion events beyond membership Purchase** — deferred (STRIPE-FUT-01); membership/pack Purchase is the only sales conversion in v2.2.
- **Meta Offline Conversions / Offline Events API upload** — we report deep-funnel events via CAPI `system_generated` from DB transitions instead (real-time, attribution-linked), which supersedes batch offline upload.
- **Building a CRM pipeline / lead-stage model** — not needed; lifecycle events fire off transitions that already exist (`conversations`, Stripe reducers, `bookings.status`).
- **Multi-tenant / `studio_id` scoping** — single-tenant per deploy; `pixelId`/token are studio-global config entered per deploy.
- **Editing `templates/` or `@agent-native/core` in place** — fork-boundary discipline; work lands in `apps/staff-web/features/*`, `services/worker/*`, `services/edge-webhooks/*`, `packages/queue/*`.
- **Sending any PII to Meta unhashed** — only SHA-256-hashed `em`/`ph` leave the server; IP + UA are sent raw (Meta requires this); no PII in URL params.
- **A Meta-consent gate / consent-signal bridge on our side** — Pixel/ad-tracking consent is the customer's responsibility, managed by their own site consent bar and assumed correct (we fire unconditionally). We control only the form's WhatsApp opt-in. Revisit only if a customer's setup requires us to honor an explicit consent signal.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIX-01 | Phase MC1 | Pending |
| PIX-02 | Phase MC1 | Pending |
| CAPI-01 | Phase MC1 | Pending |
| CAPI-02 | Phase MC1 | Pending |
| CAPI-03 | Phase MC1 | Pending |
| CAPI-04 | Phase MC1 | Pending |
| CAPI-05 | Phase MC1 | Pending |
| CAPI-06 | Phase MC1 | Pending |
| LIFE-01 | Phase MC2 | Pending |
| LIFE-02 | Phase MC2 | Pending |
| LIFE-03 | Phase MC2 | Pending |
| LIFE-04 | Phase MC2 | Pending |
| LEAD-01 | Phase MC3 | Pending |
| LEAD-02 | Phase MC3 | Pending |
| LEAD-03 | Phase MC3 | Pending |
