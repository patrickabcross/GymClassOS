---
phase: MC2-deep-funnel-lifecycle
plan: 03
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - services/worker/src/domain/stripeReducers/checkout-session-completed.ts
  - services/worker/src/domain/stripeReducers/invoice-paid.ts
autonomous: true
requirements: [LIFE-02, LIFE-04]
must_haves:
  truths:
    - "A completed checkout session enqueues a Purchase CAPI event with value (amount_total in major units) + currency"
    - "A paid invoice (renewal) enqueues a Purchase CAPI event keyed on the invoice id, so each renewal reports distinctly"
    - "A replayed Stripe webhook does not double-count (Stripe-object event_id + singletonKey)"
    - "A Purchase enqueue failure never rolls back the Stripe reducer (best-effort try/catch, D-17)"
  artifacts:
    - path: "services/worker/src/domain/stripeReducers/checkout-session-completed.ts"
      provides: "Purchase enqueue keyed purchase:<session_id>"
      contains: "purchase:"
    - path: "services/worker/src/domain/stripeReducers/invoice-paid.ts"
      provides: "Purchase enqueue keyed purchase:<invoice_id>"
      contains: "purchase:"
  key_links:
    - from: "services/worker/src/domain/stripeReducers/checkout-session-completed.ts"
      to: "enqueueMetaCapiEvent"
      via: "best-effort enqueue after pass grants, eventId purchase:<session_id>, value=toMajorUnits(amount_total)"
      pattern: "enqueueMetaCapiEvent"
    - from: "services/worker/src/domain/stripeReducers/invoice-paid.ts"
      to: "enqueueMetaCapiEvent"
      via: "best-effort enqueue after payment write, eventId purchase:<invoice_id>, value=toMajorUnits(amount_paid)"
      pattern: "enqueueMetaCapiEvent"
---

<objective>
Fire a Purchase CAPI event from each of the two existing Stripe reducers — `checkout.session.completed` and `invoice.paid` — carrying `value` (currency-correct major units) and `currency` for LTV/ROAS optimisation. Keyed on the Stripe object's own id so renewals each report and webhook replays dedupe. Best-effort: a queue failure never rolls back the reducer.

Purpose: LIFE-02 — purchases (initial packs/subscriptions + renewals) reach Meta with revenue, enabling value-based bidding.
Output: Purchase enqueue blocks in both reducers using the shared `toMajorUnits` helper from Plan 01.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MC2-deep-funnel-lifecycle/MC2-CONTEXT.md
@.planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md
@.planning/REQUIREMENTS.md

<interfaces>
From Plan 01 — services/worker/src/domain/metaLifecycle.ts:
```typescript
export function toMajorUnits(amountMinorUnits: number, currency: string): number; // gbp/100, jpy as-is
export async function getMemberHashes(db, memberId): Promise<{ hashedEmail?: string; hashedPhone?: string }>;
export async function getOrUpsertAttribution(db, memberId): Promise<{ fbc?: string; fbp?: string; clientIp?: string; clientUserAgent?: string }>;
```
enqueueMetaCapiEvent from "@gymos/queue" — now accepts value/currency/stageKey.
resolveStageEvent from "services/worker/src/lib/stage-event-map.js" — resolveStageEvent(null, "purchase") -> "Purchase".

checkout-session-completed.ts (services/worker/src/domain/stripeReducers/checkout-session-completed.ts):
- `fullSession.id` (cs_... checkout session id)
- `fullSession.amount_total` (minor units; can be 0 for free checkout — still send value:0)
- `fullSession.currency` (ISO-4217 lowercase, may be null -> default "gbp")
- `memberId = (fullSession.metadata?.memberId as string|undefined) ?? null` (already computed at line ~45)
- Reducer signature: `(event, tx, stripe, stripeAccount?) => Promise<void>`. tx is the Drizzle transaction; the pg-boss enqueue runs on its OWN connection (NOT part of tx) — safe to call inside the reducer body after writes.

invoice-paid.ts (services/worker/src/domain/stripeReducers/invoice-paid.ts):
- `full.id` (in_... invoice id)
- `full.amount_paid` (minor units)
- `full.currency` (ISO-4217 lowercase, may be null -> default "gbp")
- memberId fallback: `full.metadata?.memberId` may be null on subscription invoices; fall back to the subscription's `sub.metadata?.memberId` (the reducer already retrieves `sub` at line ~50 when subId+customerId present).
- Reducer signature: `(event, tx, stripe, stripeAccount?) => Promise<void>`.

Neither reducer currently imports a logger. Use `console.error(...)` for the best-effort warning (matches submissions.ts resilience pattern) OR import the worker logger if a sibling reducer already does — check charge-refunded.ts for the established pattern; default to console.error if none.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enqueue Purchase from checkout.session.completed</name>
  <files>services/worker/src/domain/stripeReducers/checkout-session-completed.ts</files>
  <read_first>
    - services/worker/src/domain/stripeReducers/checkout-session-completed.ts (FULL file — fullSession fields at lines 34-46, pass-grant loop at lines 88-107)
    - services/worker/src/domain/metaLifecycle.ts (toMajorUnits, getMemberHashes, getOrUpsertAttribution)
    - services/worker/src/lib/stage-event-map.ts (resolveStageEvent)
    - .planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md (LIFE-02 fire point A ~line 340-381; Risk #3 null memberId ~line 546-548; Risk #4 amount_total=0 valid ~line 550-552)
  </read_first>
  <action>
    In services/worker/src/domain/stripeReducers/checkout-session-completed.ts, add a Purchase enqueue at the END of the function body (after the pass-grant `for` loop, ~after line 107).

    Add imports at the top:
    ```typescript
    import { enqueueMetaCapiEvent } from "@gymos/queue";
    import { toMajorUnits, getMemberHashes, getOrUpsertAttribution } from "../metaLifecycle.js";
    import { resolveStageEvent } from "../../lib/stage-event-map.js";
    import { getDb } from "../../lib/db.js";
    ```
    (The reducer receives `tx` for its writes, but the attribution/hash reads should use the non-transactional `getDb()` handle since pg-boss enqueue + attribution reads are not part of the Stripe transaction. Confirm getDb is exported from ../../lib/db.js.)

    Append this block at the end of `checkoutSessionCompleted`:
    ```typescript
    // MC2 LIFE-02: Purchase CAPI event. Best-effort (D-17) — never roll back the
    // reducer on a queue failure. Keyed on the checkout session id so a replay
    // dedupes (singletonKey) and renewals (distinct sessions/invoices) each report.
    if (memberId && fullSession.amount_total != null) {
      try {
        const db = getDb();
        const currency = (fullSession.currency ?? "gbp").toLowerCase();
        const attr = await getOrUpsertAttribution(db, memberId);
        const { hashedEmail, hashedPhone } = await getMemberHashes(db, memberId);
        await enqueueMetaCapiEvent({
          eventId: `purchase:${fullSession.id}`,
          memberId,
          eventName: resolveStageEvent(null, "purchase"),
          actionSource: "system_generated",
          stageKey: "purchase",
          eventTime: Math.floor(Date.now() / 1000),
          value: toMajorUnits(fullSession.amount_total, currency),
          currency,
          hashedEmail,
          hashedPhone,
          fbc: attr.fbc,
          fbp: attr.fbp,
        });
      } catch (err) {
        console.error(
          "[checkout-session-completed] Purchase CAPI enqueue failed — non-fatal (D-17):",
          err,
        );
      }
    }
    ```
    Note the guard `if (memberId && fullSession.amount_total != null)` — a purchase without a memberId cannot be attributed (skip silently); `amount_total === 0` (free checkout) IS sent (value:0 is valid — do NOT add `> 0`).

    Run prettier conceptually.
  </action>
  <verify>
    <automated>cd services/worker && npx tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n '`purchase:${fullSession.id}`' services/worker/src/domain/stripeReducers/checkout-session-completed.ts` matches (event_id formula).
    - `grep -n "toMajorUnits(fullSession.amount_total, currency)" services/worker/src/domain/stripeReducers/checkout-session-completed.ts` matches (value via shared helper).
    - `grep -n 'stageKey: "purchase"' services/worker/src/domain/stripeReducers/checkout-session-completed.ts` matches.
    - `grep -n 'actionSource: "system_generated"' services/worker/src/domain/stripeReducers/checkout-session-completed.ts` matches.
    - The enqueue is wrapped in try/catch with a "non-fatal (D-17)" console.error.
    - The guard is `if (memberId && fullSession.amount_total != null)` (NOT `amount_total > 0`).
    - Worker tsc clean.
  </acceptance_criteria>
  <done>checkout.session.completed enqueues a Purchase event keyed purchase:<session_id> with value=toMajorUnits(amount_total) + currency; null memberId is skipped; amount 0 is sent; failure is isolated.</done>
</task>

<task type="auto">
  <name>Task 2: Enqueue Purchase from invoice.paid (renewals)</name>
  <files>services/worker/src/domain/stripeReducers/invoice-paid.ts</files>
  <read_first>
    - services/worker/src/domain/stripeReducers/invoice-paid.ts (FULL file — full fields at lines 34-45, sub retrieve at line 50, payments write at lines 80-96)
    - services/worker/src/domain/metaLifecycle.ts (toMajorUnits, getMemberHashes, getOrUpsertAttribution)
    - .planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md (LIFE-02 fire point B ~line 382-401: invoice id unique per cycle, sub.metadata.memberId fallback)
  </read_first>
  <action>
    In services/worker/src/domain/stripeReducers/invoice-paid.ts, add a Purchase enqueue at the END of the function body (after the payments insert, ~after line 96).

    Add the same imports as Task 1:
    ```typescript
    import { enqueueMetaCapiEvent } from "@gymos/queue";
    import { toMajorUnits, getMemberHashes, getOrUpsertAttribution } from "../metaLifecycle.js";
    import { resolveStageEvent } from "../../lib/stage-event-map.js";
    import { getDb } from "../../lib/db.js";
    ```

    The reducer must resolve memberId with the subscription fallback. The `sub` variable is only in scope inside the `if (subId && customerId)` block (line 47-74). Hoist a `let resolvedMemberId: string | null` declared near the top of the function, set it to `(full.metadata?.memberId as string) ?? null`, and inside the `if (subId && customerId)` block after retrieving `sub`, set `resolvedMemberId = resolvedMemberId ?? ((sub.metadata?.memberId as string) ?? null)`.

    Append at the end of `invoicePaid`:
    ```typescript
    // MC2 LIFE-02: Purchase CAPI event for the renewal. Best-effort (D-17).
    // Keyed on the invoice id — each renewal invoice is unique so renewals each
    // report; a replayed invoice.paid webhook reuses the id and dedupes.
    if (resolvedMemberId && full.amount_paid != null) {
      try {
        const db = getDb();
        const currency = (full.currency ?? "gbp").toLowerCase();
        const attr = await getOrUpsertAttribution(db, resolvedMemberId);
        const { hashedEmail, hashedPhone } = await getMemberHashes(db, resolvedMemberId);
        await enqueueMetaCapiEvent({
          eventId: `purchase:${full.id}`,
          memberId: resolvedMemberId,
          eventName: resolveStageEvent(null, "purchase"),
          actionSource: "system_generated",
          stageKey: "purchase",
          eventTime: Math.floor(Date.now() / 1000),
          value: toMajorUnits(full.amount_paid, currency),
          currency,
          hashedEmail,
          hashedPhone,
          fbc: attr.fbc,
          fbp: attr.fbp,
        });
      } catch (err) {
        console.error(
          "[invoice-paid] Purchase CAPI enqueue failed — non-fatal (D-17):",
          err,
        );
      }
    }
    ```

    Run prettier conceptually.
  </action>
  <verify>
    <automated>cd services/worker && npx tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n '`purchase:${full.id}`' services/worker/src/domain/stripeReducers/invoice-paid.ts` matches (event_id = purchase:<invoice_id>).
    - `grep -n "toMajorUnits(full.amount_paid, currency)" services/worker/src/domain/stripeReducers/invoice-paid.ts` matches.
    - `grep -n "resolvedMemberId" services/worker/src/domain/stripeReducers/invoice-paid.ts` matches and includes the `sub.metadata?.memberId` fallback assignment.
    - `grep -n 'stageKey: "purchase"' services/worker/src/domain/stripeReducers/invoice-paid.ts` matches.
    - The enqueue is wrapped in try/catch with a "non-fatal (D-17)" console.error.
    - Worker tsc clean.
  </acceptance_criteria>
  <done>invoice.paid enqueues a Purchase event keyed purchase:<invoice_id> with value=toMajorUnits(amount_paid) + currency, resolving memberId from invoice metadata then subscription metadata; renewals report distinctly; failure is isolated.</done>
</task>

</tasks>

<verification>
- Worker `tsc --noEmit` clean.
- Grep confirms both event_id formulas (purchase:<session_id>, purchase:<invoice_id>), value via toMajorUnits, stageKey purchase, action_source system_generated, try/catch D-17.
- No per-transaction ledger table created (RESEARCH Q4: Stripe-object event_id + singletonKey + edge idempotency is sufficient).
- No migration.
- purchase_sent_at is NOT used as a gate (renewals must each report) — it is stamped by the handler for health only.
</verification>

<success_criteria>
- A membership/pack purchase produces a Purchase event with correct value + currency.
- A renewal produces a second Purchase (distinct invoice id, not deduped away).
- A replayed Stripe webhook does not double-count (edge idempotency + singletonKey on the Stripe-object event_id).
- A queue failure never rolls back the reducer (D-17).
</success_criteria>

<output>
After completion, create `.planning/phases/MC2-deep-funnel-lifecycle/MC2-03-SUMMARY.md`.
</output>
