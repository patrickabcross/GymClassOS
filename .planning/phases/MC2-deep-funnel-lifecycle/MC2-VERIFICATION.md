---
phase: MC2-deep-funnel-lifecycle
verified: 2026-06-23T00:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase MC2: Deep-Funnel Lifecycle Verification Report

**Phase Goal:** Deep-funnel lifecycle — Contact (first WhatsApp reply, worker), Purchase (Stripe reducer, value/currency, renewals report), Schedule (booking→attended); read stored attribution; idempotent.
**Verified:** 2026-06-23
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | MetaCapiEventPayload carries optional value, currency, stageKey | VERIFIED | `packages/queue/src/types.ts` lines 118-121: all three fields present with correct Zod schemas |
| 2 | Worker handler builds custom_data block for Purchase events | VERIFIED | `meta-capi-event.ts` lines 149-156: `if (data.value != null && data.currency)` guard adds `custom_data: {value, currency}` |
| 3 | On successful CAPI send, handler stamps per-stage marker column matching stageKey | VERIFIED | `meta-capi-event.ts` lines 241-255: fixed literal map `{contact→contact_sent_at, purchase→purchase_sent_at, schedule→schedule_sent_at}` + raw UPDATE inside `if (resp.ok)` |
| 4 | First inbound WhatsApp reply enqueues exactly one Contact CAPI event | VERIFIED | `inbound-whatsapp.ts` lines 168-177: `if (data.direction !== "out" && result.processed && result.memberId)` guard calls `fireContactCapiIfFirstReply` |
| 5 | contact_sent_at gate prevents repeat Contact enqueue | VERIFIED | `metaLifecycle.ts` lines 207-212: SQL SELECT on `contact_sent_at`, returns early if non-null |
| 6 | Contact event uses event_id=memberId:contact and action_source=system_generated | VERIFIED | `metaLifecycle.ts` lines 221-228: `eventId: \`${memberId}:contact\``, `actionSource: "system_generated"` |
| 7 | Contact enqueue failure never aborts inbound handling | VERIFIED | `inbound-whatsapp.ts` lines 169-176: try/catch around `fireContactCapiIfFirstReply` with `log.warn` carrying "non-fatal (D-17)" |
| 8 | checkout.session.completed enqueues Purchase with value+currency | VERIFIED | `checkout-session-completed.ts` lines 115-141: `eventId: \`purchase:${fullSession.id}\``, `value: toMajorUnits(fullSession.amount_total, currency)`, `stageKey: "purchase"` |
| 9 | invoice.paid (renewals) enqueues distinct Purchase per invoice | VERIFIED | `invoice-paid.ts` lines 112-138: `eventId: \`purchase:${full.id}\``, `value: toMajorUnits(full.amount_paid, currency)`, `resolvedMemberId` with sub.metadata fallback |
| 10 | Stripe webhook replays dedupe via singletonKey | VERIFIED | `publish.ts` line 102: `singletonKey: \`${QUEUE_NAMES.META_CAPI_EVENT}:${data.eventId}\`` — purchase:<session_id> / purchase:<invoice_id> are stable Stripe ids |
| 11 | Purchase enqueue failure never rolls back the Stripe reducer | VERIFIED | Both reducers wrap enqueue in try/catch with `console.error` carrying "non-fatal (D-17)" |
| 12 | mark-booking-attended is the sole code path setting bookings.status='attended' | VERIFIED | Only write in `actions/mark-booking-attended.ts` line 69; all other references in actions are reads (COUNT/WHERE filters) |
| 13 | Marking a booking attended enqueues exactly one Schedule event per (member, occurrence) | VERIFIED | `mark-booking-attended.ts` line 128: `eventId: \`${booking.memberId}:${booking.occurrenceId}\``, `stageKey: "schedule"` |
| 14 | Re-marking an already-attended booking is a no-op (no second enqueue) | VERIFIED | `mark-booking-attended.ts` line 59: `if (booking.status === "attended") return { attended: true }` early return before enqueue |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/queue/src/types.ts` | Extended MetaCapiEventPayload with value/currency/stageKey | VERIFIED | Lines 117-122: three optional fields with correct Zod validators |
| `packages/queue/src/lifecycle-payload.test.ts` | Unit tests for payload extension | VERIFIED | 7 tests covering all plan acceptance criteria (all three fields; none; bad stageKey; negative value; 2-char currency; all enum values; zero value) |
| `services/worker/src/domain/metaLifecycle.ts` | toMajorUnits + hashForCapi + getOrUpsertAttribution + getMemberHashes + fireContactCapiIfFirstReply | VERIFIED | All five exports present; 4+ guard:allow-unscoped markers; ZERO_DECIMAL_CURRENCIES set has all 16 currencies; ON CONFLICT (member_id) DO NOTHING upsert |
| `services/worker/src/domain/metaLifecycle.test.ts` | Unit tests for toMajorUnits | VERIFIED | 8 toMajorUnits tests including uppercase case-insensitivity; ZERO_DECIMAL_CURRENCIES set size check |
| `services/worker/src/queues/meta-capi-event.ts` | custom_data block + per-stage marker write-back | VERIFIED | Both additions confirmed; markerCol from fixed literal map (not user input); inside `if (resp.ok)` success block |
| `services/worker/src/queues/inbound-whatsapp.ts` | Contact fire hook — inbound branch only, best-effort | VERIFIED | Line 14: import; lines 168-177: inbound-only guard + try/catch |
| `services/worker/src/domain/conversations.ts` | upsertConversationAndMessage returns memberId on success | VERIFIED | Line 78: return type includes `memberId?: string`; line 235: `return { processed: true, memberId: member.id }` |
| `services/worker/src/domain/stripeReducers/checkout-session-completed.ts` | Purchase enqueue keyed purchase:<session_id> | VERIFIED | Lines 115-141: full enqueue block with toMajorUnits, try/catch |
| `services/worker/src/domain/stripeReducers/invoice-paid.ts` | Purchase enqueue keyed purchase:<invoice_id>, sub.metadata fallback | VERIFIED | Lines 53-61: resolvedMemberId with fallback; lines 112-138: enqueue block |
| `apps/staff-web/actions/mark-booking-attended.ts` | Attendance chokepoint + Schedule enqueue | VERIFIED | Status flip line 69; attended_at stamp line 65; enqueue lines 127-138; idempotent early return line 59 |
| `apps/staff-web/AGENTS.md` | Ops note naming Contact as optimisation target + stageEventMap rename-without-code note | VERIFIED | Lines 116-120: "Meta Conversion Tracking — campaign optimisation target" section; line 97: mark-booking-attended table row; line 191: two-exposure note |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `inbound-whatsapp.ts` | `fireContactCapiIfFirstReply` | import + call after `upsertConversationAndMessage` returns `processed:true`, inbound branch only | WIRED | Line 14 import; lines 168-177 call with inbound-only guard |
| `fireContactCapiIfFirstReply` | `enqueueMetaCapiEvent` | `@gymos/queue` enqueue with `eventId: memberId:contact` | WIRED | `metaLifecycle.ts` line 221 |
| `fireContactCapiIfFirstReply` | `contact_sent_at` null gate | raw SQL SELECT before enqueue | WIRED | `metaLifecycle.ts` lines 207-212 |
| `meta-capi-event.ts` | `contact_sent_at / purchase_sent_at / schedule_sent_at` | raw SQL UPDATE keyed on stageKey literal map | WIRED | Lines 242-254: fixed map, `sql.raw(markerCol)` |
| `checkout-session-completed.ts` | `enqueueMetaCapiEvent` | best-effort after pass grants, `purchase:<session_id>`, `toMajorUnits(amount_total)` | WIRED | Lines 115-141 |
| `invoice-paid.ts` | `enqueueMetaCapiEvent` | best-effort after payment write, `purchase:<invoice_id>`, `toMajorUnits(amount_paid)` | WIRED | Lines 112-138 |
| `mark-booking-attended.ts` | `enqueueMetaCapiEvent` (via `~/lib/queue-client`) | best-effort after status flip, `memberId:occurrenceId` | WIRED | Lines 74-76 dynamic import; line 127 enqueue |
| `enqueueMetaCapiEvent` | pg-boss singletonKey | `meta-capi-event:${eventId}` | WIRED | `publish.ts` line 102: `singletonKey: \`${QUEUE_NAMES.META_CAPI_EVENT}:${data.eventId}\`` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `metaLifecycle.ts → fireContactCapiIfFirstReply` | `attr` (fbc/fbp) | `getOrUpsertAttribution` → raw SQL SELECT from `meta_lead_attribution` | Yes — reads stored attribution or upserts empty row | FLOWING |
| `metaLifecycle.ts → fireContactCapiIfFirstReply` | `hashedEmail/hashedPhone` | `getMemberHashes` → raw SQL SELECT from `gym_members` | Yes — hashes real member PII | FLOWING |
| `checkout-session-completed.ts` | `value` | `toMajorUnits(fullSession.amount_total, currency)` from refetched Stripe session | Yes — real Stripe API value | FLOWING |
| `invoice-paid.ts` | `value` | `toMajorUnits(full.amount_paid, currency)` from refetched Stripe invoice | Yes — real Stripe API value | FLOWING |
| `mark-booking-attended.ts` | `attr` (fbc/fbp) | raw SQL SELECT from `meta_lead_attribution` (after upsert) | Yes — reads stored attribution | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: Not applicable for this phase — all code is library/domain logic and action handlers, not standalone CLI or server endpoints that can be invoked without running the stack. The user has confirmed test suites pass (queue 30/30, worker 152/152, staff-web tsc clean) which covers the unit-testable behaviors.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LIFE-01 | MC2-02 | First inbound WhatsApp reply fires Contact CAPI event, gated on contact_sent_at | SATISFIED | `inbound-whatsapp.ts` + `fireContactCapiIfFirstReply` + contact_sent_at null gate |
| LIFE-02 | MC2-01, MC2-03 | Purchase fires on checkout.session.completed and invoice.paid with value+currency; renewals each report; replays dedupe | SATISFIED | Both Stripe reducers wired; distinct event_ids (session_id vs invoice_id); singletonKey dedup |
| LIFE-03 | MC2-04 | Booking→attended transition fires Schedule CAPI event once per (member, occurrence); re-mark is no-op | SATISFIED | `mark-booking-attended.ts` — sole writer of status='attended'; idempotent early return; Schedule enqueue |
| LIFE-04 | MC2-01, MC2-04 | stageEventMap enables event rename without code changes; Contact documented as campaign optimisation target | SATISFIED | `resolveStageEvent` used at every fire point; AGENTS.md section "Meta Conversion Tracking — campaign optimisation target" at line 116 |

No orphaned requirements: REQUIREMENTS.md maps LIFE-01 through LIFE-04 to Phase MC2 only, all four are claimed and satisfied by the plans.

---

### Anti-Patterns Found

No blocking or warning anti-patterns found.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

Specifically checked:
- No `TODO/FIXME/placeholder` comments in any MC2 artifact
- No `return null` / `return {}` / empty handlers
- No hardcoded empty props/state flowing to rendering
- `status = "attended"` is written in exactly one location (`mark-booking-attended.ts:69`); all other references are read-only queries
- `purchase_sent_at` is NOT used as a gate for Purchase events (correct per plan — renewals must each report; it is stamped by handler for health only)
- No cross-app schema import in the worker (all worker DB access is raw SQL with guard markers)
- `sql.raw(markerCol)` is safe: markerCol is chosen from a fixed literal map `{contact:..., purchase:..., schedule:...}`, never from user/payload input

---

### Human Verification Required

None. All functional behaviors are verifiable from code structure:
- Idempotency is enforced by code (early return + singletonKey), not runtime behavior
- The "best-effort" pattern is enforced structurally (try/catch wrapping every enqueue)
- Attribution read is from DB (not hardcoded)

The only untested behavior is live CAPI send to Meta's Graph API, which requires a real pixel + token — but this is infra/env configuration, not a code gap.

---

### Gaps Summary

No gaps. All 14 observable truths are verified across all four levels:

- Level 1 (exists): All 11 artifacts exist at the expected paths
- Level 2 (substantive): No stubs — every function body implements the specified logic
- Level 3 (wired): All key links confirmed — imports, calls, and success block placements verified
- Level 4 (data flowing): Attribution reads from real DB queries; value comes from Stripe API refetch; PII hashing from real member rows

The phase goal is fully achieved: Contact fires on first inbound WhatsApp reply (LIFE-01); Purchase fires from both Stripe reducers with correct value/currency and per-invoice keying for renewals (LIFE-02); Schedule fires exactly once per attended booking through the sole chokepoint (LIFE-03); all fire points read stored attribution (fbc/fbp) and are idempotent via durable markers + pg-boss singletonKey (LIFE-04).

---

_Verified: 2026-06-23_
_Verifier: Claude (gsd-verifier)_
