---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: 03
type: execute
wave: 3
depends_on: ["01", "02"]
files_modified:
  - services/worker/src/queues/stripe-event.ts
  - services/worker/src/domain/stripeReducers/checkout-session-completed.ts
  - services/worker/src/domain/stripeReducers/invoice-paid.ts
  - services/worker/src/domain/stripeReducers/invoice-payment-failed.ts
  - services/worker/src/domain/stripeReducers/subscription-updated.ts
  - services/worker/src/domain/stripeReducers/subscription-deleted.ts
  - services/worker/src/domain/stripeReducers/charge-refunded.ts
  - services/worker/src/domain/stripeReducers/account-updated.ts
  - services/worker/src/domain/stripeReducers/account-updated.test.ts
  - services/worker/src/domain/stripeReducers/dispatch.ts
  - services/worker/src/domain/stripeReducers/checkout-session-completed.test.ts
  - services/worker/src/domain/stripeReducers/invoice-paid.test.ts
autonomous: true
requirements: [STR-01, STR-02, PAY-01, PAY-02]
must_haves:
  truths:
    - "Every reducer refetch passes { stripeAccount } so account-scoped objects resolve instead of 404ing against the platform"
    - "A new account.updated reducer upserts charges_enabled/payouts_enabled/requirements into connected_accounts"
    - "Existing idempotency + single-transaction + replay-no-op behaviour is preserved"
  artifacts:
    - path: "services/worker/src/domain/stripeReducers/account-updated.ts"
      provides: "Readiness-flag upsert reducer for account.updated"
      contains: "connected_accounts"
    - path: "services/worker/src/queues/stripe-event.ts"
      provides: "stripeAccount threaded from payload into reducer signature"
      contains: "stripeAccount"
  key_links:
    - from: "services/worker/src/queues/stripe-event.ts"
      to: "reducer(event, tx, stripe, stripeAccount)"
      via: "4th positional arg from data.stripeAccount"
      pattern: "stripeAccount"
    - from: "services/worker/src/domain/stripeReducers/checkout-session-completed.ts"
      to: "stripe.checkout.sessions.retrieve"
      via: "third-arg request option { stripeAccount }"
      pattern: "stripeAccount"
---

<objective>
Make the worker reducers account-aware. Thread the `stripeAccount` from the queue payload through the `stripe-event` handler into every reducer's signature, and pass `{ stripeAccount }` as the request-option on every `stripe.X.retrieve(...)` so refetches resolve against the connected account (not the platform — which 404s, Pitfall 3). Add a new `account.updated` reducer that upserts readiness flags into `connected_accounts`. Fix the subscription `memberId` propagation gap (Pitfall 2).

Purpose: Success criteria #1 (readiness state stays current via `account.updated`) and #2 (checkout grants pass / subscription activates — account-scoped, idempotency preserved).
Output: 7 reducers refetch with `{ stripeAccount }`; new `account-updated.ts` reducer + test; dispatch table updated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-RESEARCH.md
@services/worker/src/queues/stripe-event.ts
@services/worker/src/domain/stripeReducers/checkout-session-completed.ts
@services/worker/src/domain/stripeReducers/invoice-paid.ts
@services/worker/src/domain/stripeReducers/dispatch.ts

<interfaces>
<!-- Reducer signature TODAY (all 6): (event, tx, stripe) => Promise<void> -->
<!-- stripe-event.ts calls: await reducer(event, tx as any, stripe) inside db.transaction -->
<!-- StripeEventPayload now carries optional stripeAccount (Plan 01) -->
<!-- connectedAccounts Drizzle export (Plan 01):
  { id, studioLabel, chargesEnabled, payoutsEnabled, requirementsDue, disabledReason, rawJson, createdAt, updatedAt } -->
<!-- SDK request-option is the 3rd arg of retrieve(id, params, opts):
  stripe.checkout.sessions.retrieve(id, { expand: [...] }, { stripeAccount }) -->
</interfaces>

**Refetch-without-account = 404 (Pitfall 3):** every `stripe.X.retrieve` MUST receive `{ stripeAccount }` or it queries the platform and the connected-account object is "No such ...". The only exception is `subscription-deleted.ts` which (per existing code) does not refetch the deleted resource — confirm and leave it, but still pass stripeAccount to any retrieve it DOES make.

**Pitfall 2 (subscription memberId):** the fix for "subscription mirror loses memberId" is on the WRITE side (set `subscription_data.metadata.memberId` in Checkout — that's Plan 04). On the READ side here, keep reading `sub.metadata?.memberId`; once Plan 04 sets it, the value flows through. Do NOT change the reducer's read contract — just confirm the `?? ""` fallback comment references Plan 04 as the source.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Thread stripeAccount through the handler + all 6 existing reducers</name>
  <files>services/worker/src/queues/stripe-event.ts, services/worker/src/domain/stripeReducers/checkout-session-completed.ts, services/worker/src/domain/stripeReducers/invoice-paid.ts, services/worker/src/domain/stripeReducers/invoice-payment-failed.ts, services/worker/src/domain/stripeReducers/subscription-updated.ts, services/worker/src/domain/stripeReducers/subscription-deleted.ts, services/worker/src/domain/stripeReducers/charge-refunded.ts, services/worker/src/domain/stripeReducers/checkout-session-completed.test.ts, services/worker/src/domain/stripeReducers/invoice-paid.test.ts</files>
  <behavior>
    - Test (checkout-session-completed): given a job with `stripeAccount: "acct_x"`, the reducer calls `stripe.checkout.sessions.retrieve(id, { expand: [...] }, { stripeAccount: "acct_x" })` — assert the THIRD argument equals `{ stripeAccount: "acct_x" }` on the retrieve mock.
    - Test (checkout-session-completed): pass grant + payment row + customer upsert behaviour is unchanged when stripeAccount is provided (existing assertions still hold).
    - Test (invoice-paid): both `stripe.invoices.retrieve` and `stripe.subscriptions.retrieve` receive `{ stripeAccount }` as their final arg.
    - Test: when stripeAccount is undefined (platform event), retrieve is still called and the third arg is `undefined` or omitted — existing platform tests must remain green (backward compatible).
  </behavior>
  <action>
1. In `stripe-event.ts`: after `const data = StripeEventPayload.parse(job.data)`, extract `const stripeAccount = data.stripeAccount;`. Change the reducer call to `await reducer(event, tx as any, stripe, stripeAccount);` (4th positional arg). The dispatch table values are `any`-typed so no signature widening is needed at the call site.

2. In each of the 6 reducer files: widen the signature to `(event, tx, stripe, stripeAccount?: string)` and add `{ stripeAccount }` as the request-option (final arg) to EVERY `stripe.*.retrieve(...)` call:
   - `checkout-session-completed.ts`: `stripe.checkout.sessions.retrieve(session.id, { expand: [...] }, { stripeAccount })`
   - `invoice-paid.ts`: `stripe.invoices.retrieve(invoice.id!, { expand: [...] }, { stripeAccount })` AND `stripe.subscriptions.retrieve(subId, { stripeAccount })` (note: the bare `retrieve(subId)` has no params arg — use `retrieve(subId, {}, { stripeAccount })` or `retrieve(subId, undefined, { stripeAccount })` per the SDK's `(id, params?, opts?)` shape; verify against the installed 19.3.1 types).
   - `invoice-payment-failed.ts`, `subscription-updated.ts`, `charge-refunded.ts`: same treatment for each retrieve.
   - `subscription-deleted.ts`: add the param to the signature for uniformity; if it makes any retrieve, pass `{ stripeAccount }`; the documented no-refetch exception stays.

   IMPORTANT: when `stripeAccount` is `undefined`, passing `{ stripeAccount: undefined }` as the request option is a no-op to Stripe (no Stripe-Account header) — this keeps platform events working. Confirm the SDK tolerates `{ stripeAccount: undefined }`; if a test shows it stringifies oddly, guard with `const opts = stripeAccount ? { stripeAccount } : undefined;` and pass `opts`.

3. Update `checkout-session-completed.test.ts` and `invoice-paid.test.ts` per the behavior block. Other reducers' existing tests must still pass unchanged (their mocks call retrieve without a stripeAccount — backward compatible).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test</automated>
  </verify>
  <done>All worker tests green; every retrieve in all 6 reducers receives the request-option; platform-event (undefined account) path unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add the account.updated reducer + register it in dispatch</name>
  <files>services/worker/src/domain/stripeReducers/account-updated.ts, services/worker/src/domain/stripeReducers/account-updated.test.ts, services/worker/src/domain/stripeReducers/dispatch.ts</files>
  <behavior>
    - Test: given an `account.updated` event whose `data.object` is a `Stripe.Account` with `id: "acct_x"`, `charges_enabled: true`, `payouts_enabled: true`, `requirements.currently_due: []`, `requirements.disabled_reason: null` → reducer upserts a `connected_accounts` row (ON CONFLICT (id) DO UPDATE) with chargesEnabled=true, payoutsEnabled=true, requirementsDue='[]', disabledReason=null, updatedAt bumped.
    - Test: a second event for the same acct_x with charges_enabled:false + currently_due:["external_account"] → the row UPDATES in place (no duplicate row; flags flip to false; requirementsDue='["external_account"]').
    - Test: the reducer signature accepts (event, tx, stripe, stripeAccount?) for dispatch uniformity even though it reads everything off event.data.object (no refetch needed — the account object is fully present in the event).
  </behavior>
  <action>
Create `account-updated.ts`:

```typescript
import type Stripe from "stripe";
import { sql } from "drizzle-orm";

export async function accountUpdated(
  event: Stripe.Event,
  tx: any,
  _stripe: Stripe,
  _stripeAccount?: string,
): Promise<void> {
  const acct = event.data.object as Stripe.Account;
  const currentlyDue = acct.requirements?.currently_due ?? [];
  const disabledReason = acct.requirements?.disabled_reason ?? null;

  await tx.execute(sql`
    INSERT INTO connected_accounts
      (id, charges_enabled, payouts_enabled, requirements_due, disabled_reason, raw_json, created_at, updated_at)
    VALUES (
      ${acct.id},
      ${acct.charges_enabled ?? false},
      ${acct.payouts_enabled ?? false},
      ${JSON.stringify(currentlyDue)},
      ${disabledReason},
      ${JSON.stringify(acct)},
      NOW()::text,
      NOW()::text
    )
    ON CONFLICT (id) DO UPDATE SET
      charges_enabled  = EXCLUDED.charges_enabled,
      payouts_enabled  = EXCLUDED.payouts_enabled,
      requirements_due = EXCLUDED.requirements_due,
      disabled_reason  = EXCLUDED.disabled_reason,
      raw_json         = EXCLUDED.raw_json,
      updated_at       = NOW()::text
  `);
}
```
(Use `tx.execute(sql`...`)` raw SQL to match the established worker reducer pattern for ON CONFLICT upserts — see checkout-session-completed.ts passes insert. No Drizzle schema import is needed in the worker because the worker uses its own pg-core mirror; raw SQL against the table name is the simplest correct path.)

Register in `dispatch.ts`: add `import { accountUpdated } from "./account-updated.js";` and `"account.updated": accountUpdated,` to the reducers object. Write `account-updated.test.ts` per the behavior block (mock `tx.execute` and assert the SQL was called with the right bound values, OR — preferred — replay against gymos-demo Neon: insert a fake account event's effect, assert the row, then DELETE acct_test rows to clean up).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test -- account-updated</automated>
  </verify>
  <done>account.updated reducer upserts readiness flags idempotently; dispatch table includes it; tests green.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/worker test` fully green (all reducers + new account-updated + idempotency preserved).
- Replay an account.updated effect against gymos-demo Neon via MCP: confirm a single connected_accounts row flips charges_enabled/payouts_enabled; clean up the test row.
- Platform-event path (stripeAccount undefined) regression-safe.
</verification>

<success_criteria>
- All 6 reducers refetch account-scoped (Pitfall 3 closed).
- account.updated readiness reducer live (success criterion #1 data path).
- Subscription memberId read contract intact (write-side fix lands in Plan 04).
- Idempotency + single-transaction + replay-no-op unchanged.
</success_criteria>

<output>
After completion, create `.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-03-SUMMARY.md`
</output>
