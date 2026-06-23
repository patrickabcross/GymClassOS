# Phase MC2: Deep-funnel lifecycle — Research

**Researched:** 2026-06-23
**Domain:** Meta Conversions API lifecycle senders (Contact / Purchase / Schedule) on top of MC1 foundation
**Confidence:** HIGH for code shape (direct inspection); MEDIUM for Meta spec (official docs partially accessible via proxy sources)

---

<user_constraints>
## User Constraints (from MC2-CONTEXT.md)

### Locked Decisions
- D-01: Per-stage marker columns (`contactSentAt`/`purchaseSentAt`/`scheduleSentAt`) already on `meta_lead_attribution` are the durable idempotency truth; worker checks null before sending, stamps with timestamp after successful CAPI send.
- D-02: pg-boss `singletonKey` on Meta `event_id` stays as secondary in-flight guard.
- D-03: `event_id` formulas fixed: Contact = `memberId:contact`; Purchase = `purchase:<stripe_session_id>` or `purchase:<invoice_id>`; Schedule = `memberId:occurrenceId`.
- D-04/D-05: Events fire even without a `meta_lead_attribution` row (pre-MC1 members); upsert a row keyed on `member_id` in that case, using same COALESCE pattern as MC1's `submissions.ts`.
- D-06: Purchase hooks into two existing Stripe reducers — `checkout-session-completed.ts` and `invoice-paid.ts` (currently enqueue nothing). Renewals each report.
- D-07: `event_id` keyed on Stripe object's own id; value from minor units ÷ 100 (except zero-decimal).
- D-08: Zero-decimal currencies MUST NOT be divided by 100.
- D-09: No code today sets `bookings.status = 'attended'`. MC2 builds the first attended-transition chokepoint — `markBookingAttended(bookingId)` helper/action.
- D-10: Schedule fires exactly once per (member, occurrence); `scheduleSentAt` marker + `event_id = memberId:occurrenceId`.
- D-11: Minimal transition (status flip + event); no full check-in UI.
- D-12: Event naming via existing `stageEventMap` resolver — no rework.
- D-13: Contact is the recommended campaign optimisation target (ops note, not UI).
- D-14: `action_source = system_generated` for all three (Contact, Purchase, Schedule) — confirmed below.
- D-15: Worker is sole CAPI sender; fire points ENQUEUE, never POST directly.
- D-16: PII SHA-256-hashed after normalization; fbc/fbp/IP/UA plain.
- D-17: Lifecycle enqueue is best-effort (try/catch) — never rolls back WA message / Stripe reducer / attendance write on queue failure.
- D-18: Graph v23, `event_time` in Unix seconds, top-level `test_event_code`, terminal-vs-retryable error split — all existing in MC1 handler.

### Claude's Discretion
- Whether `MetaCapiEventPayload` needs new fields for `value`/`currency`/`custom_data` and per-event `action_source` — confirmed needed; additive extension.
- Whether worker handler needs a `custom_data` block for Purchase `value`/`currency` — confirmed YES (Meta requires it).
- Exact location of `markBookingAttended` (staff-web action) and how it resolves `occurrenceId` for a booking.
- Whether a per-transaction Purchase sent-ledger table is needed — confirmed NOT NEEDED (see Spec Q4 below).
- First-inbound-reply detection in inbound-whatsapp/conversations (confirmed below).

### Deferred Ideas (OUT OF SCOPE)
- Meta Lead Ads / Instant Forms ingestion (MC3).
- Full attendance / check-in UI.
- Refund → reversal events.
- EMQ / match-quality surfacing in UI for lifecycle events.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIFE-01 | First inbound WhatsApp reply on a lead conversation fires Contact CAPI event once (`action_source=system_generated`, `event_id=memberId:contact`) | Confirmed fire point in `upsertConversationAndMessage` after `insertResult` success; `contactSentAt` null-check is the durable gate |
| LIFE-02 | Stripe purchase (checkout.session.completed + invoice.paid) fires Purchase CAPI event with `value` + `currency`, renewals each report, replays dedupe | Confirmed fire points in two existing reducers; Stripe object id is available; `amount_total`/`amount_paid` + `currency` available in refetched objects |
| LIFE-03 | Booking→attended status flip fires Schedule CAPI event once per (member, occurrence) | No existing path sets `attended`; MC2 builds `markBookingAttended`; `attendedAt` column already on bookings table |
| LIFE-04 | Stage→event mapping via configurable `stageEventMap`; Contact documented as optimisation target | `stageEventMap` resolver already has Contact/Purchase/Schedule defaults; LIFE-04 is largely satisfied by MC1 — MC2 calls resolver at each fire point + adds ops note |
</phase_requirements>

---

## Reusable Assets (already built in MC1)

### `packages/queue/src/types.ts` — current `MetaCapiEventPayload`

```typescript
export const MetaCapiEventPayload = z.object({
  eventId: z.string().min(1),
  memberId: z.string().min(1),
  eventName: z.string().min(1),
  actionSource: z.string().min(1),    // MC2 adds per-event values (system_generated)
  eventTime: z.number().int(),
  eventSourceUrl: z.string().optional(),
  hashedEmail: z.string().optional(),
  hashedPhone: z.string().optional(),
  hashedFn: z.string().optional(),
  hashedLn: z.string().optional(),
  fbc: z.string().optional(),
  fbp: z.string().optional(),
  clientIp: z.string().optional(),
  clientUserAgent: z.string().optional(),
  // MISSING — MC2 must ADD:
  // value: z.number().optional(),         // major units (already divided by 100 by caller)
  // currency: z.string().optional(),      // ISO-4217 lowercase
});
```

**MC2 extension required:** Add `value: z.number().optional()` and `currency: z.string().optional()` fields. These are optional at the Zod level (Purchase populates them; Contact/Schedule do not). No other schema fields need changing — `actionSource` is already present and callers will pass `"system_generated"`.

### `packages/queue/src/publish.ts` — `enqueueMetaCapiEvent()`

```typescript
export async function enqueueMetaCapiEvent(args: MetaCapiEventPayload): Promise<string | null>
```

- `singletonKey = QUEUE_NAMES.META_CAPI_EVENT + ":" + data.eventId`
- `retryLimit: 5`, `retryBackoff: true`, `expireInSeconds: 86400` (24h)
- **No changes needed to this function** — it passes through whatever payload fields are given.

### `services/worker/src/queues/meta-capi-event.ts` — the CAPI handler

Key sections to extend for MC2:

1. **Step 3 (event name resolution):** Currently resolves with hardcoded `resolveStageEvent(metaStageEventMap, "lead")`. For MC2 fire points, the caller already resolves `eventName` and passes it in `data.eventName`. The handler already uses `data.eventName` as the primary (`const eventName = data.eventName || resolvedEventName`). No change needed in this line — each fire point passes the resolved `eventName`.

2. **Step 4 (CAPI payload):** Currently no `custom_data` block. MC2 must add:
   ```typescript
   if (data.value != null && data.currency) {
     capiBody.data[0].custom_data = {
       value: data.value,          // already in major units
       currency: data.currency,    // ISO-4217 lowercase
     };
   }
   ```

3. **Step 7 (success write-back):** Currently stamps `lead_status = 'sent'` + `lead_sent_at = NOW()`. For MC2, the handler needs to ALSO stamp the per-event marker column (`contact_sent_at`, `purchase_sent_at`, `schedule_sent_at`) on success. The event type can be inferred from `data.eventId` prefix or from a new `stageKey` field in the payload. Recommended approach: add an optional `stageKey: z.enum(["lead","contact","purchase","schedule"]).optional()` field to `MetaCapiEventPayload` and stamp the corresponding column in the success block.

### `services/worker/src/lib/stage-event-map.ts` — `resolveStageEvent()`

```typescript
export const DEFAULT_STAGE_EVENT_MAP = {
  lead: "Lead",
  contact: "Contact",
  purchase: "Purchase",
  schedule: "Schedule",
} as const;

export function resolveStageEvent(config, stage: StageKey): string
```

- Contact/Purchase/Schedule all resolve from this map. LIFE-04 is satisfied.
- Fire points call `resolveStageEvent(metaStageEventMap, "contact" | "purchase" | "schedule")` to get the `eventName` they pass in the payload.
- **No changes needed to the resolver.**

### `apps/staff-web/server/db/schema.ts` — `metaLeadAttribution` (v32 + v33)

Current columns confirmed:
```
id                TEXT PK
member_id         TEXT NOT NULL UNIQUE
fbc, fbp, fbclid  TEXT nullable
initial_event_id  TEXT nullable
page_url          TEXT nullable
client_ip         TEXT nullable
client_user_agent TEXT nullable
lead_sent_at      TIMESTAMPTZ nullable
lead_status       TEXT nullable
last_error        TEXT nullable          -- added v33
contact_sent_at   TIMESTAMPTZ nullable   -- MC2 gate for LIFE-01
purchase_sent_at  TIMESTAMPTZ nullable   -- status/health (NOT dedup key)
schedule_sent_at  TIMESTAMPTZ nullable   -- MC2 gate for LIFE-03
created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

All three per-stage marker columns exist. **No migration needed for idempotency markers.**

### `services/worker/src/lib/db.ts` — worker Drizzle schema

The worker's local schema mirror does NOT include a `metaLeadAttribution` table. All attribution reads/writes in the worker use raw `db.execute(sql`...`)` (as MC1's handler does). MC2 fire points inside the worker follow the same pattern.

**Key gap for inbound-whatsapp.ts fire point:** The worker's `conversations` Drizzle schema (line 51 of db.ts) defines `status` enum as `["open", "closed", "snoozed"]` — missing `"lead"`. This does NOT block the Contact fire point because:
- The inbound handler does not check conversation status to decide whether to fire Contact.
- The first-reply detection relies on `contactSentAt IS NULL` on `meta_lead_attribution` — queried via raw SQL, not via the Drizzle `conversations` schema.
- The `upsertConversationAndMessage` code already sets `status: "open"` unconditionally on inbound (line 170 of conversations.ts) regardless of prior status.

### `apps/staff-web/app/lib/queue-client.ts` — staff-web enqueue path

```typescript
import { enqueueOutboundWhatsApp, enqueueMetaCapiEvent } from "@gymos/queue";
export { enqueueOutboundWhatsApp, enqueueMetaCapiEvent };
```

The `markBookingAttended` action (staff-web) must import `enqueueMetaCapiEvent` from `"~/lib/queue-client"` (not directly from `@gymos/queue`), matching the pattern established by `submissions.ts`.

---

## Spec Confirmations

### Q1 — Does Meta REQUIRE `custom_data.value` + `custom_data.currency` for a Purchase event?

**YES — REQUIRED.** (Confidence: HIGH)

Meta's Conversions API documentation and third-party authoritative mirrors (Freshpaint's CAPI reference, which mirrors Meta's spec) confirm:

- `custom_data.value` (numeric, in major currency units, e.g. `29.99`) — required for Purchase
- `custom_data.currency` (ISO-4217 three-letter string, lowercase) — required for Purchase

The CAPI body shape for a Purchase event:
```json
{
  "event_name": "Purchase",
  "event_time": 1750000000,
  "event_id": "purchase:cs_live_abc123",
  "action_source": "system_generated",
  "user_data": { "em": ["<sha256>"], ... },
  "custom_data": {
    "value": 29.99,
    "currency": "gbp"
  }
}
```

Without `custom_data.value` + `custom_data.currency`, Meta cannot optimize for LTV/ROAS. Meta's Events Manager will flag the event with low signal quality, and revenue-based bidding strategies will not function correctly.

Contact and Schedule events do NOT require `custom_data` — omit entirely for those.

### Q2 — Does Meta accept `action_source = "system_generated"` for Purchase and Schedule events?

**YES — confirmed valid.** (Confidence: MEDIUM-HIGH, multiple authoritative sources)

The full list of valid `action_source` values per Meta's CAPI spec:
- `website` — event happened on a website (browser+server)
- `app` — mobile app
- `email`
- `phone_call`
- `chat`
- `physical_store` — in-person / POS
- `system_generated` — automated/CRM event (e.g. subscription renewal on auto-pay)
- `other`

`system_generated` is explicitly documented for "conversion happened automatically, for example, a subscription renewal that's set on auto-pay each month." This maps precisely to GymClassOS's Purchase (Stripe reducer fires from a server-side Stripe webhook) and Schedule (worker-side booking attendance flip). Contact also fits — the CAPI send is triggered by a server-side inbound message detection, not by user browser interaction.

Decision D-14 (all three use `action_source = system_generated`) is confirmed correct. For Purchase and Schedule in particular, there is no browser pixel counterpart, so `website` would be inaccurate; `system_generated` is the semantically correct value.

Note: Since Meta deprecated the Offline Conversions API in May 2025, all CRM/offline-style events now flow through the standard CAPI with `system_generated` — this is the authoritative path.

### Q3 — Canonical zero-decimal currency list (for the minor-units-to-major helper)

**Confirmed list** (Confidence: HIGH — from Stripe official docs and widely cross-referenced):

Zero-decimal currencies that must NOT be divided by 100:
```
BIF  CLP  DJF  GNF  JPY  KMF  KRW  MGA  PYG  RWF  UGX  VND  VUV  XAF  XOF  XPF
```

Special cases (two-decimal in most contexts but have payout quirks):
- `ISK` — always represent with `.00` (i.e. treat as zero-decimal for value purposes)
- `HUF` — zero-decimal for Stripe payouts only
- `TWD` — zero-decimal for Stripe payouts only
- `UGX` — always represent with `.00`

**Implementation recommendation for the helper:**

```typescript
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"
]);

function toMajorUnits(amountMinorUnits: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? amountMinorUnits
    : amountMinorUnits / 100;
}
```

HUSTLE is GBP (`gbp`) — `÷100` is correct. The helper handles future studios in other currencies.

### Q4 — Purchase idempotency: is a per-transaction sent-ledger table needed?

**NO — not needed.** (Confidence: HIGH)

The Stripe-object `event_id` (`purchase:<session_id>` or `purchase:<invoice_id>`) + the pg-boss `singletonKey` + the Stripe-event-level idempotency already in place at the edge (`webhook_events ON CONFLICT DO NOTHING`) constitute sufficient dedup for Purchase:

- **Edge layer:** `insertWebhookEvent()` with `ON CONFLICT (provider, external_id) DO NOTHING` ensures each Stripe `evt_` id is written once. The `stripe-event` worker checks `processedAt != NULL` before running reducers.
- **Reducer layer:** `checkout-session-completed.ts` and `invoice-paid.ts` both run inside a single Drizzle transaction with `processedAt` update — if a reducer crashes mid-run, the event is not marked processed and retries run the reducer again (all reducer writes use `ON CONFLICT DO NOTHING` or `DO UPDATE`, so they are already idempotent).
- **Meta-send layer:** `enqueueMetaCapiEvent` uses `singletonKey = meta-capi-event:<purchase:cs_live_abc123>`. If the reducer enqueues twice (due to a reducer retry), pg-boss collapses to one job. This is the in-flight dedup guard.
- **Renewal correctness:** Each renewal produces a distinct `invoice.paid` event with a distinct `evt_` id and distinct `invoice_id`. These produce distinct `event_id` values (`purchase:<inv_xxx>` vs `purchase:<inv_yyy>`), so they report correctly to Meta as separate Purchase events.

`purchaseSentAt` is a single column and is NOT the dedup key. It serves only as a status/health field ("this member has ever completed a purchase that was sent to Meta"). The planner must NOT treat `purchaseSentAt IS NULL` as a gate for Purchase (unlike Contact and Schedule). Instead, stamp `purchaseSentAt = NOW()` on success as a convenience signal, understanding that later renewals will overwrite it — that's fine.

**Conclusion:** No v34 migration needed for Purchase. The Stripe-object `event_id` layered with existing Stripe idempotency is sufficient. Do not build a per-transaction `meta_purchase_events` ledger table.

### Q5 — First-inbound-reply detection: is `contactSentAt` null-check race-safe?

**YES — confirmed race-safe.** (Confidence: HIGH, from direct code reading)

The inbound WhatsApp path in `upsertConversationAndMessage` (conversations.ts lines 182-209) uses `INSERT INTO messages ... ON CONFLICT DO NOTHING ... RETURNING id`. If `insertResult.length === 0`, the function returns `{ processed: false, reason: "duplicate_wamid" }` immediately — no further processing.

The flow for the Contact fire point:

1. `insertResult.length > 0` — this job won the race for this `wamid`. The message is new.
2. After the opt-in insert (step 4 of conversations.ts), the Contact fire hook goes here:
   - Raw SQL: `SELECT contact_sent_at FROM meta_lead_attribution WHERE member_id = $memberId`
   - If the row doesn't exist OR `contact_sent_at IS NULL` → proceed to enqueue + stamp.
   - If `contact_sent_at IS NOT NULL` → skip (already sent on a prior inbound).

The `onConflictDoNothing` on `messages.externalId` is the race-safe dedup at concurrency=5. Only one job wins per wamid. The `contactSentAt IS NULL` check then gates whether this is the FIRST winning inbound message that also triggers a Contact fire. The stamp of `contact_sent_at = NOW()` is a post-send write; if the enqueue fails (try/catch, D-17), the marker is NOT stamped, so the next inbound message will retry the Contact fire — this is correct (retry-until-success semantics for the marker).

**The upsert of the `meta_lead_attribution` row** (if no row exists for this member) must happen BEFORE the `contactSentAt` null-check, because a brand-new inbound-from-unknown member (auto-created at lines 97-134 of conversations.ts) will have no attribution row. The upsert pattern from `submissions.ts` (COALESCE preserving first-touch fbc/fbp) applies here, but for an unknown-inbound member there is no fbc/fbp to preserve — just insert a minimal row with the `member_id`.

**Timing: where exactly to add the Contact hook in `inbound-whatsapp.ts`:**
After `upsertConversationAndMessage` returns `{ processed: true }`, before marking `webhook_events.processedAt`. This is the correct single place — after the message insert succeeded (not before, which could double-fire on retry).

---

## Per-Requirement Breakdown

### LIFE-01 — Contact on first inbound reply

**Fire point:** `services/worker/src/queues/inbound-whatsapp.ts`

Exact location: after `upsertConversationAndMessage` returns `{ processed: true }`, before the final `db.update(schema.webhookEvents)` mark-processed call. Only fires on `data.direction !== "out"` (the normal inbound branch, not the outbound mirror branch).

```typescript
// After: result = await upsertConversationAndMessage(...)
// if result.processed === true — this is a new, first-winning message

if (result.processed) {
  try {
    // Contact fire (LIFE-01)
    await fireContactCapiIfFirstReply(db, member.id);
  } catch (err) {
    log.warn({ err }, "[inbound-whatsapp] Contact CAPI enqueue failed — non-fatal (D-17)");
  }
}
```

`fireContactCapiIfFirstReply(db, memberId)` (new helper, e.g. in `services/worker/src/domain/metaLifecycle.ts`):
1. Raw SQL: upsert a `meta_lead_attribution` row for `memberId` if none exists (D-04/D-05).
2. Raw SQL: `SELECT contact_sent_at, fbc, fbp, client_ip, client_user_agent FROM meta_lead_attribution WHERE member_id = $memberId`.
3. If `contact_sent_at IS NOT NULL` → return (already sent, idempotent).
4. Fetch `gym_members` for hashed email/phone.
5. Resolve `eventName = resolveStageEvent(stageEventMap, "contact")`.
6. `enqueueMetaCapiEvent({ eventId: memberId + ":contact", memberId, eventName, actionSource: "system_generated", stageKey: "contact", eventTime: Math.floor(Date.now()/1000), hashedEmail, hashedPhone, fbc, fbp, clientIp, clientUserAgent })`.
7. Raw SQL: `UPDATE meta_lead_attribution SET contact_sent_at = NOW(), updated_at = NOW() WHERE member_id = $memberId`.

**`member.id` availability:** The inbound-whatsapp.ts worker already has `member` in scope (lines 88-134 of conversations.ts resolve or create the member). But `upsertConversationAndMessage` does not return the `memberId`. The inbound-whatsapp.ts handler must be refactored slightly to either: (a) resolve `member` outside the function call and pass it in, or (b) return the `memberId` from `upsertConversationAndMessage` in addition to `processed`/`reason`. Option (b) is the minimal change — add `memberId?: string` to the return type and return it when `processed === true`.

**event_id:** `memberId:contact` — verbatim from REQUIREMENTS.md LIFE-01.

**Idempotency gates:** (1) `messages.externalId` ON CONFLICT race guard. (2) `contactSentAt IS NULL` on `meta_lead_attribution`. (3) pg-boss singletonKey `meta-capi-event:memberId:contact`.

**New fields needed in payload:** None beyond the extension for `stageKey` (for the handler's success write-back).

**No migration needed** — `contact_sent_at` already in v32.

---

### LIFE-02 — Purchase on Stripe reducer

**Fire points:**

**A) `services/worker/src/domain/stripeReducers/checkout-session-completed.ts`**

Available after refetch (`fullSession`):
- `fullSession.id` (the checkout session id, e.g. `cs_live_abc123`) → `event_id = "purchase:" + fullSession.id`
- `fullSession.amount_total` (minor units, e.g. `2999` for £29.99 GBP) → value = `toMajorUnits(amount_total, currency)`
- `fullSession.currency` (ISO-4217 lowercase, e.g. `"gbp"`) → currency
- `fullSession.metadata?.memberId` → memberId

Note: The reducer runs inside the Drizzle transaction (`tx`). The `enqueueMetaCapiEvent` call must be made OUTSIDE the transaction (after `tx` commits) or at minimum after all DB writes — a pg-boss enqueue inside a Drizzle transaction is not incorrect but the transaction is committed by the stripe-event handler after the reducer returns. The cleanest approach is to return the CAPI payload from the reducer and enqueue it in the stripe-event queue handler after the transaction commits.

Alternatively, enqueue within the reducer after the pass grants — best-effort, wrapped in try/catch. Since pg-boss uses its OWN db connection (separate from the Drizzle `tx`), enqueueing inside the reducer's `tx` scope is safe in practice (pg-boss is not part of the transaction).

**Simpler pattern (recommended):** Add the enqueue call at the end of the reducer, after all `tx` writes, wrapped in try/catch. This matches D-17 (best-effort, never rolls back the Stripe reducer).

```typescript
// At end of checkoutSessionCompleted, after pass grants:
try {
  const { enqueueMetaCapiEvent } = await import("@gymos/queue");
  const memberId = fullSession.metadata?.memberId ?? null;
  if (memberId && fullSession.amount_total != null) {
    const currency = (fullSession.currency ?? "gbp").toLowerCase();
    await enqueueMetaCapiEvent({
      eventId: `purchase:${fullSession.id}`,
      memberId,
      eventName: resolveStageEvent(/* stageMap from config */ null, "purchase"),  // or pass from caller
      actionSource: "system_generated",
      stageKey: "purchase",
      eventTime: Math.floor(Date.now() / 1000),
      value: toMajorUnits(fullSession.amount_total, currency),
      currency,
    });
  }
} catch (err) {
  log.warn({ err }, "[checkout-session-completed] Purchase CAPI enqueue failed — non-fatal (D-17)");
}
```

**stageEventMap access inside the reducer:** Reducers do not currently receive the studio config. Two options:
- Option A (simpler): Pass the resolved `eventName` string into the reducer from the stripe-event queue handler (which already reads `studio_owner_config` for other purposes... actually it does not today).
- Option B: The reducer fetches the config inline (one extra SQL, cached in process). But reducers currently run raw and only get `event, tx, stripe, stripeAccount`.
- Option C (recommended for minimal diff): Resolve `eventName = resolveStageEvent(null, "purchase")` = `"Purchase"` as the hard default (since the resolver falls back to default when `config` is null). This means Purchase will always report as "Purchase" unless the stageEventMap is also resolved in the reducer. For LIFE-04 compliance, the reducer should at minimum resolve from a null config (which returns the default). A future enhancement passes the actual config.

**B) `services/worker/src/domain/stripeReducers/invoice-paid.ts`**

Available after refetch (`full`):
- `full.id` (invoice id, e.g. `in_live_xyz789`) → `event_id = "purchase:" + full.id`
- `full.amount_paid` (minor units) → value
- `full.currency` (ISO-4217 lowercase) → currency
- `full.metadata?.memberId` (on the invoice) OR `sub.metadata?.memberId` (on the subscription) → memberId

Note: `full.metadata?.memberId` may be null for subscription invoices (metadata lives on the subscription in older Stripe versions). The reducer already reads `sub.metadata?.memberId` for the `stripeSubscriptions` upsert — use that as fallback.

**event_id:** `purchase:<invoice_id>`. Invoice ids are unique per billing cycle, so renewals each get a distinct event_id. Webhook replays of the same `evt_` (same invoice.paid event) are already deduped at the edge layer (webhook_events ON CONFLICT) and at the reducer level (processedAt check in stripe-event.ts), so the `singletonKey` on `meta-capi-event:purchase:<invoice_id>` is a belt-and-suspenders guard.

**Idempotency chain for Purchase:**
1. Edge: `insertWebhookEvent` ON CONFLICT DO NOTHING (prevents duplicate Stripe event ingestion).
2. Reducer: `processedAt IS NULL` check in stripe-event.ts (prevents reducer re-run).
3. Meta layer: pg-boss singletonKey `meta-capi-event:purchase:<id>` (prevents concurrent duplicate send).
4. `purchaseSentAt` column: stamp for health/status only, NOT a dedup gate. Multiple legitimate purchases → multiple stamps (last-write-wins column).

**No migration needed.**

---

### LIFE-03 — Schedule on booking→attended

**New artifact to build:** `apps/staff-web/actions/mark-booking-attended.ts`

Modeled on `mark-occurrence-complete.ts` (a clean, direct action using `defineAction`).

The action takes `bookingId` as input. It must:
1. SELECT the booking (id, memberId, occurrenceId, status, attendedAt).
2. If booking not found → `{ error: "BOOKING_NOT_FOUND" }`.
3. If already `status = 'attended'` → `{ attended: true }` (idempotent no-op — marker already set).
4. If `status = 'cancelled'` → `{ error: "BOOKING_CANCELLED" }`.
5. UPDATE `bookings SET status = 'attended', attended_at = NOW() WHERE id = $bookingId`.
6. Try/catch: enqueue Schedule CAPI event (see below).
7. Return `{ attended: true }`.

The `occurrenceId` comes from the booking row itself — no need for the caller to supply it.

**Schedule CAPI enqueue (within the action's try/catch):**

```typescript
try {
  const { enqueueMetaCapiEvent } = await import("~/lib/queue-client");
  // Fetch attribution row for fbc/fbp (or upsert if missing — D-04/D-05)
  const attrRow = await getOrUpsertAttribution(db, booking.memberId);
  const memberRow = await getMemberForHashing(db, booking.memberId);
  await enqueueMetaCapiEvent({
    eventId: `${booking.memberId}:${booking.occurrenceId}`,
    memberId: booking.memberId,
    eventName: resolveStageEvent(stageMap, "schedule"),  // from staff-web twin
    actionSource: "system_generated",
    stageKey: "schedule",
    eventTime: Math.floor(Date.now() / 1000),
    hashedEmail: booking.memberId ? sha256(normalize(memberRow.email)) : undefined,
    hashedPhone: booking.memberId ? sha256(normalize(memberRow.phone)) : undefined,
    fbc: attrRow?.fbc ?? undefined,
    fbp: attrRow?.fbp ?? undefined,
  });
} catch (err) {
  console.error("[mark-booking-attended] Schedule CAPI enqueue failed — non-fatal (D-17)");
}
```

**`scheduleSentAt` gate:** The worker handler (on success) stamps `schedule_sent_at`. The `event_id = memberId:occurrenceId` + pg-boss singletonKey prevents double-send from rapid re-marking. Since the action also checks `status = 'attended'` as a no-op guard, even if the action is called twice, the second call returns early without a second enqueue.

**stageMap access in staff-web action:** The staff-web twin of the stage-event-map resolver lives at `apps/staff-web/server/lib/stage-event-map.ts`. The action reads `studioOwnerConfig` for the `metaStageEventMap` column (same as how the worker resolves it). Since this is an infrequent call, a simple inline read is fine.

**`attendedAt` column:** Already exists in schema (confirmed in schema.ts line 298 + worker db.ts line 331). No migration needed for the column itself.

**Migration needed?** None. `schedule_sent_at` is already in v32. `attended_at` is already in schema. The `status = 'attended'` value is already in the bookings enum (schema.ts line 290).

**`markBookingAttended` as a helper vs. as an action:**
- Decision D-09 says "helper/action". The planner should make it a `defineAction` (staff-web) per project conventions (defineAction for all operations). It is DIRECT (no propose-action gate) — staff marks attendance directly, like `mark-occurrence-complete`.
- The worker-side Stripe reducers and the inbound-whatsapp worker do NOT call `markBookingAttended`. Only the attendance action calls it.

---

### LIFE-04 — stageEventMap + ops

**Satisfied by MC1 + minor MC2 additions:**

1. `resolveStageEvent(config, "contact"|"purchase"|"schedule")` already returns correct defaults.
2. Each MC2 fire point passes the resolved `eventName` in the payload.
3. The worker handler uses `data.eventName` as primary (already true in MC1 handler, line 115 of meta-capi-event.ts).
4. The staff-web settings card already has `stageEventMap` editable via `CAPI-06` (MC1 shipped). Renaming the event in the map changes what the worker resolves.
5. **Ops doc requirement:** Add a short note (e.g. in `apps/staff-web/AGENTS.md` or a comment in `stage-event-map.ts`) identifying Contact as the recommended campaign optimisation target. "Use the Contact event as your Meta ad campaign conversion goal — it represents a lead's first genuine engagement (inbound reply) and is the highest-intent signal available before a purchase."

**No code changes to the resolver itself.** LIFE-04 is substantially done; MC2 only needs to call the resolver correctly at each fire point.

---

## Migration Summary

| Migration | Version | Content | Reason |
|-----------|---------|---------|--------|
| None required | — | — | All marker columns added in v32; `last_error` in v33; `attendedAt` column pre-exists on bookings |

**Next free migration version is v34** if needed for future changes. MC2 itself requires no new migration.

---

## Worker schema gaps to fix

The worker's `services/worker/src/lib/db.ts` does NOT have a `metaLeadAttribution` schema entry. All attribution reads/writes for MC2 fire points inside the worker (inbound-whatsapp + Stripe reducers) MUST use raw `db.execute(sql`...`)` with `// guard:allow-unscoped — single-tenant meta attribution` comments. Do not add a Drizzle table to the worker schema mirror for this (Plan 09 cleanup is the right time; MC2 is not it).

The worker's `conversations` schema is missing `"lead"` in its status enum. This is a pre-existing paper gap (the DB has the value; only the Drizzle types are missing it). It does not affect MC2 — the Contact fire detection does not query conversation status.

---

## Payload Extension for `MetaCapiEventPayload`

The complete additive extension required (both fields optional to keep Contact/Schedule callers simple):

```typescript
// ADD to MetaCapiEventPayload in packages/queue/src/types.ts:
value: z.number().nonnegative().optional(),        // major units (Purchase only)
currency: z.string().length(3).optional(),          // ISO-4217 lowercase (Purchase only)
stageKey: z.enum(["lead","contact","purchase","schedule"]).optional(), // for handler write-back
```

**`stageKey` purpose:** The worker handler uses this to stamp the correct marker column on success. Without it, the handler would have to infer the stage from `eventId` prefix (fragile) or from a new switch on `eventName` (workable but couples eventName to stage). The `stageKey` field is clean and explicit.

The `meta-capi-event.ts` handler success block becomes:

```typescript
// On success (resp.ok), after existing lead_status + lead_sent_at update:
if (data.stageKey && data.stageKey !== "lead") {
  const col = { contact: "contact_sent_at", purchase: "purchase_sent_at", schedule: "schedule_sent_at" }[data.stageKey];
  if (col) {
    await db.execute(sql`
      UPDATE meta_lead_attribution
      SET ${sql.raw(col)} = NOW(), updated_at = NOW()
      WHERE member_id = ${data.memberId}
    `);
  }
}
```

---

## Risks and Gotchas

### 1. Best-effort enqueue — never rolls back parent operation (D-17)

Every lifecycle enqueue (Contact, Purchase, Schedule) MUST be wrapped in try/catch. A pg-boss failure must not:
- Abort the `upsertConversationAndMessage` result in the inbound path.
- Abort the Stripe reducer transaction (which is already committed by the time the enqueue call runs in the recommended pattern).
- Abort the `mark-booking-attended` status write.

The marker column (`contact_sent_at`, `schedule_sent_at`) is stamped in the WORKER HANDLER on success, not in the fire point. If the enqueue call throws, the marker is NOT stamped, and the next trigger (next inbound, next attendance mark) will retry the enqueue — correct semantics.

### 2. No-attribution-row upsert (D-04/D-05)

When a member has no `meta_lead_attribution` row (pre-MC1 member, walk-in, organic inbound), all three fire points must upsert a minimal row before proceeding:

```sql
INSERT INTO meta_lead_attribution (id, member_id, created_at, updated_at)
VALUES ($id, $memberId, NOW(), NOW())
ON CONFLICT (member_id) DO NOTHING
```

Then re-SELECT to get `fbc`/`fbp` (will be NULL for a new row, which is fine — Meta still matches on hashed PII).

### 3. Purchase: `memberId` may be null in Stripe reducers

Both `checkout-session-completed.ts` and `invoice-paid.ts` handle the case where `memberId` is null or absent. Guard the CAPI enqueue: `if (memberId && amount_total != null) { enqueue... }`. A purchase without a `memberId` cannot be attributed — skip silently, log a warning.

### 4. Purchase: `amount_total` can be 0

For free checkout sessions (100% discount codes), `amount_total = 0`. A `value: 0` purchase event is valid to send to Meta (it informs the optimiser of a $0 conversion). Do not gate on `amount_total > 0`.

### 5. Dual-unique-key member reconcile (email AND phone)

Attribution rows key off `member_id`. Member lookup for hashing goes through `gym_members` by `member_id` (PK lookup, safe). The dual-unique-key complexity (email AND phone) only applies to member creation / upsert paths (already handled). The lifecycle fire points use `member_id` as the stable key after member resolution has already occurred.

### 6. Additive-only migration constraint

If a future change requires schema additions for MC2 (currently none needed), use the next free version v34, inline in `apps/staff-web/server/plugins/db.ts` `runMigrations`. Never use `drizzle-kit push`. Never DROP/RENAME. Apply to gymos-demo Neon manually after deploy (migration-drift gotcha from project memory).

### 7. Worker `conversations` schema missing `"lead"` in enum

The worker's `conversations` Drizzle table (db.ts line 51) enumerates `["open","closed","snoozed"]` but the actual DB column allows `"lead"` too. The `upsertConversationAndMessage` code writes `status: "open"` when promoting (TypeScript is satisfied; Postgres accepts it). This is a pre-existing paper gap. If a future worker query needs to filter `status = 'lead'`, the worker schema must be updated. For MC2 it is not needed.

### 8. Stripe reducer architecture: enqueue outside vs inside transaction

The `stripe-event.ts` handler wraps the reducer + `processedAt` update in a single `db.transaction(...)`. The pg-boss enqueue inside the reducer runs on a SEPARATE pg-boss connection (not the Drizzle transaction). If the reducer throws after enqueueing but before committing, the event is not marked processed, the reducer re-runs on retry, and `enqueueMetaCapiEvent` is called again — but the pg-boss `singletonKey` collapses it to one job. The pattern is safe.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already in agent-native templates) |
| Config file | None confirmed at MC2 level — inherit from workspace |
| Quick run | `pnpm --filter @gymos/queue test` or `pnpm --filter staff-web test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| LIFE-01 | `contactSentAt IS NULL` gate prevents double-fire | unit | Test `fireContactCapiIfFirstReply` helper with mock DB |
| LIFE-02 | `toMajorUnits()` helper: GBP ÷100, JPY no-divide | unit | Pure function, no mocks needed |
| LIFE-02 | `event_id` formula: `purchase:<session_id>` vs `purchase:<invoice_id>` | unit | Verify string construction |
| LIFE-03 | `mark-booking-attended` returns no-op if already attended | unit | Mock Drizzle, test idempotency |
| LIFE-04 | `resolveStageEvent(null, "contact")` returns `"Contact"` | unit | Already covered by existing MC1 tests if any; trivial |

### Wave 0 Gaps

- [ ] `packages/queue/src/__tests__/lifecycle-payload.test.ts` — covers Zod parse of extended `MetaCapiEventPayload` with `value`/`currency`/`stageKey`
- [ ] `services/worker/src/__tests__/zero-decimal.test.ts` — covers `toMajorUnits` helper for all zero-decimal currencies
- [ ] No test infrastructure gaps beyond new test files — existing Vitest config applies.

---

## Sources

### Primary (HIGH confidence — direct code inspection)
- `packages/queue/src/types.ts` — `MetaCapiEventPayload` Zod schema (confirmed field list)
- `packages/queue/src/publish.ts` — `enqueueMetaCapiEvent()` with singletonKey pattern
- `services/worker/src/queues/meta-capi-event.ts` — full CAPI handler (Graph v23, hashing, error split, write-back)
- `services/worker/src/lib/stage-event-map.ts` — resolver with Contact/Purchase/Schedule defaults
- `apps/staff-web/server/db/schema.ts` lines 733-753 — `metaLeadAttribution` confirmed columns
- `services/worker/src/domain/conversations.ts` — `upsertConversationAndMessage` (insertResult race-safe gate)
- `services/worker/src/queues/inbound-whatsapp.ts` — inbound dispatch and `processed` flag
- `services/worker/src/domain/stripeReducers/checkout-session-completed.ts` — `fullSession.id`, `amount_total`, `currency`, `metadata.memberId`
- `services/worker/src/domain/stripeReducers/invoice-paid.ts` — `full.id`, `amount_paid`, `currency`
- `services/worker/src/domain/stripeReducers/dispatch.ts` + `stripe-event.ts` — transaction pattern
- `services/edge-webhooks/src/lib/idempotency.ts` — Stripe-event idempotency chain
- `apps/staff-web/actions/mark-occurrence-complete.ts` — model for `markBookingAttended`
- `apps/staff-web/server/plugins/db.ts` — confirmed v33 is latest migration; v34 is next free
- `apps/staff-web/app/lib/queue-client.ts` — staff-web enqueue re-export pattern
- `services/worker/src/lib/db.ts` — worker schema mirror (bookings.attendedAt confirmed; conversations missing "lead")
- `apps/staff-web/features/forms/handlers/submissions.ts` — attribution upsert COALESCE pattern

### Secondary (MEDIUM confidence — official docs via proxy sources)
- [Freshpaint CAPI Reference](https://documentation.freshpaint.io/integrations/destinations/direct-response-ads/facebook-conversions-api/facebook-conversions-api-reference) — `action_source` valid values list including `system_generated`; Purchase `custom_data.value` + `custom_data.currency` required
- [Stripe Supported Currencies](https://docs.stripe.com/currencies) — zero-decimal currency list cross-referenced
- [WebSearch: zero-decimal currencies](https://www.npmjs.com/package/zero-decimal-currencies) — BIF, CLP, DJF, GNF, JPY, KMF, KRW, MGA, PYG, RWF, UGX, VND, VUV, XAF, XOF, XPF confirmed via multiple sources

### Tertiary (LOW confidence — not independently verified)
- WebSearch result: "Meta permanently discontinued Offline Conversions API in May 2025" — plausible given Meta's migration to CAPI, but not verified against official Meta changelog. Does not affect implementation (we already use CAPI).

---

## Metadata

**Confidence breakdown:**
- Reusable assets / code shape: HIGH — direct file inspection
- Spec Q1 (Purchase value/currency required): HIGH — consistent across multiple CAPI documentation mirrors
- Spec Q2 (action_source system_generated): MEDIUM-HIGH — confirmed in Freshpaint mirror; semantics match the use case
- Spec Q3 (zero-decimal currencies): HIGH — consistent across Stripe docs and multiple cross-references
- Spec Q4 (Purchase idempotency sufficiency): HIGH — follows from code reading of the existing Stripe idempotency chain
- Spec Q5 (first-reply race safety): HIGH — direct reading of insertResult pattern

**Research date:** 2026-06-23
**Valid until:** 2026-07-23 (stable Meta CAPI spec; code shape tracks the repo)

## RESEARCH COMPLETE
