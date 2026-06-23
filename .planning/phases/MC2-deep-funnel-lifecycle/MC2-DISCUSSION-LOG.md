# Phase MC2: Deep-funnel lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-23
**Phase:** MC2-deep-funnel-lifecycle
**Areas discussed:** Idempotency mechanism, Missing-attribution policy, Purchase keying + value, Schedule attendance hook

---

## Idempotency mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Persisted per-stage markers | Gate sends on contactSentAt/purchaseSentAt/scheduleSentAt columns (already on meta_lead_attribution); pg-boss singletonKey as secondary in-flight guard; durable across weeks/restarts | ✓ |
| pg-boss singletonKey only | Rely solely on event_id singletonKey; simpler but only dedups within pg-boss retention window | |

**User's choice:** Persisted per-stage markers (Recommended)
**Notes:** Two-layer model — persisted marker = durable truth, singletonKey = concurrency guard. Caveat captured in CONTEXT D-03 NOTE: Purchase can't use the single purchaseSentAt column as its dedup key (renewals), so Purchase dedups on the Stripe-object event_id instead.

---

## Missing-attribution policy

| Option | Description | Selected |
|--------|-------------|----------|
| Always fire, hashed PII only | Mirror MC1 D-14; fire with hashed email/phone from gym_members, omit fbc/fbp, upsert an attribution row for the marker | ✓ |
| Skip when no attribution row | Only fire for Meta-tracked (form-origin) members | |

**User's choice:** Always fire, hashed PII only (Recommended)
**Notes:** Forward-compatible (Meta matches on PII / later); harmless when unmatched. Upsert a member-keyed attribution row so the sent marker has a home (D-05).

---

## Purchase keying + value

| Option | Description | Selected |
|--------|-------------|----------|
| Key on the Stripe object id per reducer | checkout.session.completed → purchase:<session_id> value=amount_total/100; invoice.paid → purchase:<invoice_id> value=amount_paid/100; currency from event; zero-decimal currencies per Stripe rules | ✓ |
| Key uniformly on payment_intent id | Uniform key, but subscription invoices can share/relate payment_intents → renewal dedup risk | |

**User's choice:** Key on the Stripe object id per reducer (Recommended)
**Notes:** Each renewal invoice id is unique (reports separately); replayed webhook reuses id (dedupes). Zero-decimal currency handling left to Claude's discretion per Stripe minor-unit rules.

---

## Schedule attendance hook

| Option | Description | Selected |
|--------|-------------|----------|
| Build one attended-transition chokepoint now | markBookingAttended helper/action sets status='attended' AND enqueues Schedule (event_id=memberId:occurrenceId); minimal, no full check-in UI | ✓ |
| Defer LIFE-03 to a later phase | Ship Contact+Purchase now, reslot Schedule when attendance UI exists | |
| Wire the event but leave transition to others | Build sender only; risk it never fires until something sets attendance | |

**User's choice:** Build one attended-transition chokepoint now (Recommended)
**Notes:** Surfaced finding — NO code sets bookings.status='attended' today (only cancelled/completed/refunded; attended appears only in analytics reads + demo seed). MC2 builds the minimal transition + event. Re-mark/un-mark/retroactive does not re-fire (marker + event_id already set).

## Claude's Discretion

- MetaCapiEventPayload extension for value/currency/custom_data + per-event action_source (additive)
- Worker handler custom_data block for Purchase value/currency (Meta Purchase spec)
- markBookingAttended location (staff-web action vs worker helper) + occurrenceId resolution
- Whether a per-transaction Purchase sent-ledger is needed vs Stripe-object event_id + singletonKey
- First-inbound-reply detection reusing existing conversations.ts insert-dedup + lead→working promotion
- Zero-decimal currency list (JPY etc.)

## Deferred Ideas

- Meta Lead Ads / Instant Forms ingestion (MC3)
- Full attendance/check-in UI
- Refund → reversal events to Meta
- EMQ / match-quality UI surfacing for lifecycle events
