# Phase MC3: Meta Lead Ads + CRM lifecycle - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Leads captured **inside Facebook/Instagram** (Instant Forms / Lead Ads) land in the studio DB via a signature-verified **Lead Retrieval webhook** (edge-webhooks), get reconciled into `gym_members` + a `lead` conversation **capturing the Meta `lead_id`**, and then advance through the **same Contact/Purchase/Schedule senders MC2 already built** — reported back to Meta's Leads Center **keyed on `lead_id`** (Conversions API for CRM). Any WhatsApp follow-up routes through the **existing opt-in / 24h-window / approved-template worker chokepoint** (no bypass).

**This phase ADDS an ingest source + a lead_id identifier on top of MC1+MC2.** The CAPI queue, worker sender, `stageEventMap` resolver, `meta_lead_attribution` table, per-stage idempotency markers, the three lifecycle fire points (Contact/Purchase/Schedule), and the dual-unique-key member reconcile **all already exist**. MC3 wires a new inbound path (Meta Leadgen webhook → retrieve → ingest), stores `lead_id`, and threads `lead_id` into the lifecycle events for those members.

**In scope (MC3):** Lead Retrieval webhook + signature verify + idempotent ingest (LEAD-01); store Meta `lead_id` and include it in downstream lifecycle CAPI events keyed on `lead_id` (LEAD-02); WhatsApp follow-up via the existing chokepoint (LEAD-03); operator connection config (Page access token) on the existing Meta Settings card.

**Out of scope (later / not this phase):** A leads dashboard or CRM-stage management UI; lead scoring/qualification stages beyond the existing Contact/Purchase/Schedule lifecycle; bulk historical lead backfill; reporting refunds/reversals to Meta.

</domain>

<decisions>
## Implementation Decisions

### WhatsApp opt-in policy (LEAD-03)
- **D-01:** A Lead-Ad submission is treated as **opt-in** — record a `whatsapp_opt_in` row with a **new source value `'meta_lead_ads'`** (additive enum value), mirroring how website-form leads use `'form_submission'`. Rationale: the lead deliberately gave the gym their contact details via the ad. Use the same `ON CONFLICT (member_id) DO NOTHING` insert as `submissions.ts`.
- **D-02:** Opt-in does **not** bypass policy. All follow-up still flows through the existing worker `sendMessage` chokepoint — 24h-window + approved-template gates enforced (Meta constraint: non-template out-of-window sends MUST be rejected at the sender layer). MC3 adds **no new outbound path**; it only marks the lead reachable.

### Initial Lead event (LEAD-02)
- **D-03:** **Do NOT fire an initial `Lead` CAPI event on ingest** for Lead-Ad leads. The lead originated inside Meta — Meta already counted it; firing `Lead` back risks double-counting and skews ROAS. MC3 reports only **downstream progression** (Contact / Purchase / Schedule) keyed on `lead_id`.
- **D-04:** This differs from the website-form path (`submissions.ts`), which DOES fire `Lead` (that lead originated off-platform, so Meta must be told). Planner: the Lead-Ad ingest path is a sibling of `submissions.ts` that **skips the Lead enqueue** but performs the same member/conversation/attribution/opt-in writes.

### Field mapping & missing-data handling (LEAD-01)
- **D-05:** Map Meta Instant Form **standard fields** → member fields: `full_name` (best-effort split into first/last), `email`, `phone_number`. Custom-named fields are best-effort; researcher confirms Meta's `field_data` shape (`name`/`values` pairs) and the standard field keys.
- **D-06:** **Minimum to ingest = at least ONE of email or phone** (phone preferred as the WA channel). The existing **dual-unique-key reconcile** (email AND phone, with backfill) handles partial identity — reuse it verbatim from `submissions.ts`.
- **D-07:** A submission with **neither email nor phone** is **parked + logged** (not ingested as a member) — nothing to reconcile or message. Do not hard-fail the webhook (still 200 + idempotency-recorded).

### Lead Ads connection / config (LEAD-01)
- **D-08:** Operator connects Lead Ads by entering a **Page access token** (with `leads_retrieval` permission) into the **existing MC1 "Meta Conversion Tracking" Settings card** (`/gymos/settings/integrations`), stored in `app_secrets` via the same masked `writeAppSecret` + by-key presence pattern MC1 established for the CAPI token. Repeatable per client, self-serve, consistent with the existing card. No new standalone settings surface.
- **D-09:** The Page/webhook **subscription step** (subscribing the app to the Page's `leadgen` field in Meta) is an **operator/ops action documented in an ops note**, not automated by MC3 (no OAuth Page-connect flow this phase — that would be its own onboarding phase). Keep parity with how MC1 documented Pixel/webhook setup.

### Lead retrieval flow (LEAD-01) — architecture
- **D-10:** The Meta **Leadgen webhook delivers only a `leadgen_id`** (+ form_id/page_id/ad_id) — NOT the field data. Flow: **edge-webhooks** verifies the signature + records idempotency + enqueues; the **worker** calls the Graph API `GET /{leadgen_id}` (with the Page access token from `app_secrets`) to retrieve `field_data`, then runs the ingest. Webhook stays fast (verify + enqueue only), matching the existing WhatsApp/Stripe pattern.
- **D-11:** **Signature verification** reuses the same HMAC-SHA256 `verifySignature` helper from `@gymos/whatsapp` (Meta Lead Ads webhooks use the same App-secret signing scheme). The GET verify-handshake (`hub.challenge`) mirrors the existing WhatsApp GET verify route.
- **D-12:** **Idempotency** keyed on the `leadgen_id` via the existing `webhook_events` `insertWebhookEvent()` (`ON CONFLICT (provider, external_id) DO NOTHING`). Requires adding a **new provider value `'meta_lead'`** to the `webhook_events.provider` enum in BOTH the staff-web schema AND the edge-webhooks local schema mirror (additive). Only enqueue when `inserted === true`.

### lead_id storage + propagation (LEAD-02)
- **D-13:** Store the Meta `lead_id` as a **new additive column `meta_lead_id TEXT` on `meta_lead_attribution`** (keyed on `member_id`), next migration version **v34**, inline in `apps/staff-web/server/plugins/db.ts` `runMigrations` (additive only — no drop/rename, no `drizzle-kit push`).
- **D-14:** Add an optional **`leadId?: string`** field to `MetaCapiEventPayload` (`packages/queue/src/types.ts`) and include `lead_id` in the worker-built CAPI event when present. The three MC2 fire points already resolve attribution by `member_id`; they will pick up `meta_lead_id` from the attribution row and pass it through. **Researcher MUST confirm the exact `lead_id` placement** (top-level event field vs `user_data`) and whether Meta's CRM/Leads-Center path requires a specific `action_source` / event-source flag (e.g. `system_generated`) — this is the highest-risk unknown.

### Carried forward from MC1/MC2 (LOCKED — not re-decided)
- **D-15:** Worker is the **sole CAPI sender** — every fire point ENQUEUES; nothing POSTs to Meta directly (MC1 D-01 / MC2 D-15).
- **D-16:** PII (`em`/`ph`/`fn`/`ln`) **SHA-256 hashed after normalization**; `META_CAPI_TOKEN` / Page token never logged, never client-side (MC1 D-17 / MC2 D-16).
- **D-17:** Best-effort isolation — a failing CAPI enqueue/send never rolls back ingest or any other event; wrap enqueues in try/catch (MC2 D-17).
- **D-18:** Graph **v23** endpoint, `event_time` in Unix **seconds**, top-level `test_event_code`, terminal-vs-retryable split — reuse the MC1 handler (MC2 D-18).
- **D-19:** **Repeatable per client** — no hardcoding to HUSTLE/Patrick; resolve config by key from `app_secrets`/studio-global config (project convention).

### Claude's Discretion
- Exact shape of the worker ingest module (a new `services/worker/src/queues/meta-lead.ts` handler + a shared ingest helper vs extracting `submissions.ts`'s reconcile into a shared function). Reuse over copy-paste preferred.
- Whether the lead conversation's first `messages` row carries a `{kind: "meta_lead_ad", leadgenId, formId, fieldData}` payload analogous to the website form's `form_submission` payload (recommended for parity/traceability).
- How to represent the Lead Ad "source" beyond the opt-in source value (e.g. a `form_submissions`-style record vs a note on attribution) — planner decides minimal additive representation.
- Whether retrieval needs a small retry/backoff if the Graph GET races ahead of Meta's lead availability.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase + requirements
- `.planning/ROADMAP.md` § "Phase MC3: Meta Lead Ads + CRM lifecycle" — goal + success criteria.
- `.planning/REQUIREMENTS.md` § LEAD-01..03 — authoritative requirement text.
- `.planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md` and `.planning/phases/MC2-deep-funnel-lifecycle/MC2-CONTEXT.md` — carried-forward locked decisions (sole-sender, hashing, always-fire/best-effort, stageEventMap, idempotency markers, dual-key reconcile).

### The path MC3 mirrors (website-form lead ingest)
- `apps/staff-web/features/forms/handlers/submissions.ts` — **the template to mirror.** Dual-unique-key reconcile (lines ~313-367), lead conversation upsert (~374-389), `meta_lead_attribution` persist (~494-516), Lead CAPI enqueue (~521-543, **MC3 SKIPS this per D-03**), opt-in row `source='form_submission'` (~622). MC3 builds a sibling that ingests Meta `field_data` and sets opt-in `source='meta_lead_ads'`.
- `apps/staff-web/server/routes/api/submit/[id].post.ts` — how the website submission handler is mounted.

### edge-webhooks (where the new Lead Retrieval webhook slots in)
- `services/edge-webhooks/src/server.ts` (lines ~26-28) — `app.route("/webhooks", ...)` registration. Add `metaLeadRoutes` alongside whatsapp + stripe.
- `services/edge-webhooks/src/routes/whatsapp.ts` — **closest model**: raw-body-first read, `verifySignature(raw, sig, appSecret)`, GET verify handshake, DB-first app-secret resolution, enqueue-on-verify. Meta Leadgen uses the same signing scheme.
- `services/edge-webhooks/src/routes/stripe.ts` — second model for a verify→idempotency→enqueue route.
- `services/edge-webhooks/src/lib/idempotency.ts` — `insertWebhookEvent()` (`ON CONFLICT (provider, external_id) DO NOTHING`). Add provider `'meta_lead'`.
- `services/edge-webhooks/src/lib/db.ts` — local `webhook_events` schema mirror; add the `'meta_lead'` provider value here too.

### Worker (ingest + CAPI send)
- `services/worker/src/queues/inbound-whatsapp.ts` + `services/worker/src/domain/conversations.ts` — model for a worker queue handler that materialises a member/conversation from an inbound event.
- `services/worker/src/queues/meta-capi-event.ts` — the CAPI sender. **Add `lead_id` to the built event** (placement per D-14, research-confirmed). `user_data` fields built ~lines 123-132; event object ~lines 135-146.
- `services/worker/src/domain/metaLifecycle.ts` — MC2 shared helpers (attribution upsert, PII hashing, currency). Lifecycle fires already read attribution by `member_id`; they pick up `meta_lead_id` once stored.
- `services/worker/src/lib/stage-event-map.ts` — event-name resolver (reuse as-is).

### Schema + queue contract
- `apps/staff-web/server/db/schema.ts` — `meta_lead_attribution` (~lines 733-753, add `meta_lead_id`), `conversations.status` enum (`lead`), `whatsapp_opt_in.source` enum (~line 416, add `meta_lead_ads`), `webhook_events.provider` enum (add `meta_lead`).
- `apps/staff-web/server/plugins/db.ts` — `runMigrations`; latest version **v33** (`last_error`), next free is **v34** (additive only).
- `packages/queue/src/types.ts` — `MetaCapiEventPayload` (~lines 100-123; add `leadId?`). `packages/queue/src/publish.ts` — `enqueueMetaCapiEvent` (singletonKey on event_id); add a new `enqueueMetaLead`/`QUEUE_NAMES.META_LEAD` for the retrieval job.

### Config / Settings
- The MC1 "Meta Conversion Tracking" Settings card in `apps/staff-web` (`/gymos/settings/integrations`) — extend with a Page access token field (masked `writeAppSecret`, by-key presence). Find via the MC1-05 SUMMARY: `.planning/phases/MC1-foundation-lead-event/MC1-05-SUMMARY.md`.

### Project rules
- `CLAUDE.md` / `AGENTS.md` — additive-only migrations (no drop/rename), no `drizzle-kit push`, `guard:allow-unscoped` marker for worker raw SQL, Meta out-of-window template gate, repeatable-per-client, shadcn/Tabler UI, optimistic UI.

### External docs (research MUST verify — not in repo)
- Meta Lead Ads **Webhooks for Leadgen** (`leadgen` field subscription, payload = `leadgen_id`/`form_id`/`page_id`/`ad_id`, App-secret HMAC signing).
- Meta Graph API **Lead Retrieval** (`GET /{leadgen_id}` with Page token + `leads_retrieval` permission → `field_data`).
- Meta **Conversions API for CRM / Leads Center** — exact `lead_id` placement in the event, required `action_source`/event-source flags, and how progression events surface against the Lead Ad (the #1 research risk, D-14).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`submissions.ts`** — the entire dual-key reconcile + conversation upsert + attribution persist + opt-in insert is the blueprint; MC3's ingest is a sibling that swaps the data source (Meta `field_data`) and skips the Lead enqueue.
- **edge-webhooks route pattern** (`whatsapp.ts`) — raw-body verify + GET handshake + idempotency + enqueue is directly transplantable to the Leadgen webhook.
- **`insertWebhookEvent()` idempotency** — works for leadgen_id dedup with a new provider value.
- **MC1/MC2 CAPI send path** (`meta-capi-event.ts` + `metaLifecycle.ts`) — unchanged except for adding `lead_id` passthrough.
- **MC1 Settings card + `writeAppSecret` by-key pattern** — extend for the Page token; no new secrets plumbing.
- **`@gymos/whatsapp` `verifySignature`** — same HMAC used for the new webhook.

### Established Patterns
- Webhook = verify + idempotency + enqueue at the edge; heavy work (Graph retrieval + ingest) in the worker.
- Enqueue from staff-web via `app/lib/queue-client.ts`; from the worker via `@gymos/queue`.
- Worker raw SQL on ownable/attribution tables carries the `// guard:allow-unscoped` marker.
- Secrets resolved DB-first (`app_secrets`) with a TTL cache, repeatable per client.

### Integration Points
- New `POST /webhooks/meta-lead` (+ `GET` verify) in edge-webhooks → enqueue `meta-lead` retrieval job (leadgen_id) when idempotency `inserted`.
- New worker `meta-lead` handler → Graph GET field_data → reconcile member (dual-key) → upsert lead conversation → persist attribution **with `meta_lead_id`** → opt-in `source='meta_lead_ads'` → **no Lead enqueue**.
- Lifecycle (Contact/Purchase/Schedule) unchanged; reads `meta_lead_id` from attribution and passes `lead_id` into the CAPI event.

### Constraints / gotchas to respect
- New enum values (`webhook_events.provider='meta_lead'`, `whatsapp_opt_in.source='meta_lead_ads'`) must be added in BOTH staff-web schema and (for provider) the edge-webhooks mirror — additive.
- Migration is additive v34 only; no breaking DB changes.
- `lead_id` placement in the CAPI event is unconfirmed — research before coding (D-14).
- Leadgen webhook may deliver duplicates and may arrive before the lead is retrievable — idempotency + possible retry.
- Page access token never logged / never client-side; resolve from `app_secrets`.

</code_context>

<specifics>
## Specific Ideas

- Opt-in source for Lead-Ad leads = `'meta_lead_ads'` (new enum value), mirroring `'form_submission'`.
- No initial `Lead` CAPI on ingest (avoid double-count) — only downstream Contact/Purchase/Schedule keyed on `lead_id`.
- Ingest if email OR phone present (phone preferred); park+log if neither; reuse the dual-key reconcile.
- `meta_lead_id` stored on `meta_lead_attribution` (v34); `leadId?` added to `MetaCapiEventPayload`.
- Page access token entered on the existing Meta Settings card → `app_secrets`; webhook/Page subscription is a documented operator step.
- edge-webhooks verifies + enqueues; worker does the Graph Lead Retrieval + ingest.

</specifics>

<deferred>
## Deferred Ideas

- **Leads dashboard / CRM-stage management UI** — viewing/filtering Lead-Ad leads and their lifecycle stage in staff-web. Out of scope; would be its own phase.
- **OAuth Page-connect onboarding flow** — automated Page subscription + token minting instead of manual operator setup. Its own onboarding phase.
- **Lead scoring / qualification stages** beyond Contact/Purchase/Schedule.
- **Bulk historical lead backfill** from Meta.
- **Refund → reversal events** to Meta (carried over from MC2 deferred list) — only if ROAS accuracy later needs it.

None of these block MC3.

</deferred>

---

*Phase: MC3-meta-lead-ads-crm-lifecycle*
*Context gathered: 2026-06-24*
