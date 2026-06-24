# Phase MC3: Meta Lead Ads + CRM lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** MC3-meta-lead-ads-crm-lifecycle
**Areas discussed:** WhatsApp opt-in policy, Initial Lead event on ingest, Field mapping & missing data, Lead Ads connection / config

---

## Area selection

All four proposed gray areas were selected for discussion.

---

## WhatsApp opt-in policy (LEAD-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto opt-in (mirror website form) | Record whatsapp_opt_in source 'meta_lead_ads'; lead gave their number via the ad = consent; follow-up still through chokepoint | ✓ |
| Require reply first | No auto opt-in; first outbound template-only; opt-in on first inbound reply | |

**User's choice:** Auto opt-in (mirror website form)
**Notes:** Chokepoint still enforces 24h-window + approved-template regardless. → D-01, D-02.

---

## Initial Lead event on ingest (LEAD-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Skip initial Lead (recommended) | Lead originated in Meta — already counted; only report downstream progression keyed on lead_id | ✓ |
| Fire Lead on ingest too | Parity with website-form leads but risks double-counting in-platform leads | |

**User's choice:** Skip initial Lead
**Notes:** Differs from website-form path which DOES fire Lead. → D-03, D-04.

---

## Field mapping & missing data (LEAD-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Either email or phone (phone preferred) | Map standard fields; ingest if ≥1 identifier; park+log if neither; dual-key reconcile handles partial identity | ✓ |
| Require phone | Drop email-only leads; guarantees WA reachability | |
| Require both email and phone | Highest quality, most lossy | |

**User's choice:** Either email or phone (phone preferred)
**Notes:** → D-05, D-06, D-07.

---

## Lead Ads connection / config (LEAD-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Extend the existing Meta Settings card | Page access token field on the MC1 card, stored in app_secrets via by-key pattern; subscription is a documented operator step | ✓ |
| Env/Fly secret only for now | No UI; token as Fly secret + docs; faster but not self-serve | |

**User's choice:** Extend the existing Meta Settings card
**Notes:** Repeatable per client; consistent with MC1. → D-08, D-09.

---

## Claude's Discretion

- Worker ingest module shape (new handler + shared reconcile helper vs extract from submissions.ts).
- First-message payload `{kind: "meta_lead_ad", ...}` for parity/traceability.
- Minimal additive representation of the Lead Ad "source".
- Retrieval retry/backoff if the Graph GET races Meta's lead availability.

## Deferred Ideas

- Leads dashboard / CRM-stage management UI
- OAuth Page-connect onboarding flow
- Lead scoring / qualification stages
- Bulk historical lead backfill
- Refund → reversal events to Meta
