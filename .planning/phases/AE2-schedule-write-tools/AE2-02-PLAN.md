---
phase: AE2-schedule-write-tools
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - apps/staff-web/actions/cancel-occurrence.ts
  - apps/staff-web/actions/reschedule-occurrence.ts
  - apps/staff-web/actions/approve-proposal.ts
  - apps/staff-web/actions/propose-action.ts
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/.generated/actions-registry.ts
autonomous: true
requirements: [AES-03, AES-04]
must_haves:
  truths:
    - "Approving a cancel-occurrence proposal runs ONE atomic transaction: active bookings -> cancelled, a negative pass_debit is inserted for every cancelled booking that had a passId, and the occurrence -> cancelled"
    - "The cancel transaction is idempotent: a second approve (double-click) finds the occurrence already cancelled and inserts no duplicate refunds"
    - "Bookings with a null passId are still cancelled but get no pass_debit refund row (no NOT NULL violation)"
    - "Approving a reschedule-occurrence proposal updates starts_at AND recomputes ends_at from the definition's durationMin"
    - "The gate is atomic across all three sites: ACTION_ALLOWLIST + dispatch branch (approve-proposal.ts), the propose-action Zod enum, and the dashboardProposals.actionName Drizzle enum (schema.ts) all include 'cancel-occurrence' and 'reschedule-occurrence' in one commit"
    - "cancel-occurrence and reschedule-occurrence are present in the actions registry so approve-proposal can dynamically import them"
  artifacts:
    - path: "apps/staff-web/actions/cancel-occurrence.ts"
      provides: "cancel-occurrence gated defineAction with atomic bookings+refund+occurrence transaction (AES-03)"
      contains: "db.transaction"
    - path: "apps/staff-web/actions/reschedule-occurrence.ts"
      provides: "reschedule-occurrence gated defineAction; recomputes endsAt (AES-04)"
      contains: "addMinutes"
    - path: "apps/staff-web/actions/approve-proposal.ts"
      provides: "ACTION_ALLOWLIST + dispatch branches including cancel-occurrence + reschedule-occurrence"
      contains: "cancel-occurrence"
    - path: "apps/staff-web/actions/propose-action.ts"
      provides: "propose-action Zod enum including the two new gated actions"
      contains: "reschedule-occurrence"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "dashboardProposals.actionName Drizzle text enum including the two new gated actions"
      contains: "cancel-occurrence"
    - path: "apps/staff-web/.generated/actions-registry.ts"
      provides: "Registry imports + map entries for the two gated actions"
      contains: "a_cancel_occurrence"
  key_links:
    - from: "apps/staff-web/actions/approve-proposal.ts"
      to: "apps/staff-web/actions/cancel-occurrence.ts"
      via: "dynamic import './cancel-occurrence.js' on proposal.actionName === 'cancel-occurrence'"
      pattern: "cancel-occurrence\\.js"
    - from: "apps/staff-web/actions/cancel-occurrence.ts"
      to: "schema.passDebits"
      via: "negative-amount insert inside db.transaction for each booking with a non-null passId"
      pattern: "cancellation_refund"
    - from: "apps/staff-web/actions/reschedule-occurrence.ts"
      to: "schema.classDefinitions"
      via: "fetch durationMin to recompute endsAt = addMinutes(startsAt, durationMin)"
      pattern: "addMinutes"
---

<objective>
Ship the two GATED schedule actions — `cancel-occurrence` (atomic cancel-with-refund) and `reschedule-occurrence` — and wire them through the propose→approve chokepoint ATOMICALLY across all three gate sites. This is Wave 2 of AE2: the only AE2 actions that route through human approval before they run.

Purpose: Cancelling a class with bookings and rescheduling a booked class are high-risk, member-visible operations, so AES-03/AES-04 require they route through propose→approve (the agent never executes them directly). AES-03's approval path must atomically cancel bookings, refund affected pass credits, and cancel the occurrence in ONE Drizzle transaction (no orphaned credits, idempotent on double-approve). The gate-atomicity invariant (AEX-02, established in AE1) requires the two new gated action names appear in approve-proposal's ACTION_ALLOWLIST + dispatch chain AND the propose-action Zod enum AND the dashboardProposals.actionName Drizzle enum — all in one commit, or tsc breaks / the gate fails at runtime.

Output: 2 new gated action files (`cancel-occurrence.ts`, `reschedule-occurrence.ts`) + atomic edits to approve-proposal.ts, propose-action.ts, schema.ts + manual registry entries. NO system-prompt change here (that is Wave 3, AE2-03). NO Postgres migration (the Drizzle text enum is a TS-only additive change).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md

<interfaces>
<!-- approve-proposal.ts CURRENT state (apps/staff-web/actions/approve-proposal.ts) -->
<!-- ACTION_ALLOWLIST (lines 10-14): -->
```typescript
const ACTION_ALLOWLIST = [
  "send-template-to-members",
  "create-checkout-link",
  "publish-form",
] as const;
```
<!-- dynamic-import dispatch (lines 61-67): -->
```typescript
let mod: any;
if (proposal.actionName === "send-template-to-members") {
  mod = await import("./send-template-to-members.js");
} else if (proposal.actionName === "publish-form") {
  mod = await import("./publish-form.js");
} else {
  mod = await import("./create-checkout-link.js");
}
```
<!-- After this dispatch, approve-proposal re-validates rawParams against mod.default.schema, calls mod.default.run(parsed.data), -->
<!-- then UPDATEs the proposal to status='executed'. The second approve is blocked upstream: the proposal SELECT requires -->
<!-- status='pending'; once executed, a re-approve returns {error:"Proposal not found or already actioned"} (RESEARCH Pitfall 3). -->

<!-- propose-action.ts CURRENT Zod enum (lines 19-27) + description (line 12): -->
```typescript
actionName: z
  .enum(["send-template-to-members", "create-checkout-link", "publish-form"])
  .describe("The existing gated action this proposal will execute on approval"),
```
<!-- description line 12: "actionName must be 'send-template-to-members', 'create-checkout-link', or 'publish-form'. " -->

<!-- schema.ts CURRENT dashboardProposals.actionName (lines 478-480): -->
```typescript
actionName: text("action_name", {
  enum: ["send-template-to-members", "create-checkout-link", "publish-form"],
}).notNull(),
```
<!-- Drizzle text() enum = plain TEXT column in Postgres, TS-only validation. Adding members needs NO Postgres migration. -->

<!-- classOccurrences: id, definitionId, startsAt (text ISO w/ tz offset), endsAt (text), capacity, status enum ["scheduled","cancelled","completed"] -->
<!-- classDefinitions: id, durationMin (integer NOT NULL) -->
<!-- bookings: id, occurrenceId, memberId, status enum ["booked",...], passId (nullable), cancelledAt (nullable) -->
<!-- passDebits: id (pdebit_refund_<nanoid> for refunds), passId NOT NULL, bookingId (nullable), amount (integer; NEGATIVE = refund), reason, createdAt -->

<!-- Transaction support: staff-web getDb() uses neon-serverless (WebSocket Pool) for Neon URLs -> db.transaction() WORKS. -->
<!-- The HTTP driver does NOT support transactions (RESEARCH Pitfall 1) — but staff-web uses the Pool driver, so this is fine. -->
<!-- Pattern reference: services/worker/src/queues/stripe-event.ts uses db.transaction(async (tx) => {...}). -->

<!-- date-fns addMinutes is already used in create-class-occurrence.ts: import { addMinutes } from "date-fns"; -->
<!-- ID convention: nanoid() with prefix. import { nanoid } from "nanoid"; -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create cancel-occurrence gated action (atomic transaction + idempotency)</name>
  <files>apps/staff-web/actions/cancel-occurrence.ts</files>
  <read_first>
    - apps/staff-web/actions/create-checkout-link.ts (a gated action executed BY approve-proposal — the shape of a propose→approve target, and how approve-proposal re-validates params against its schema)
    - services/worker/src/queues/stripe-event.ts (the db.transaction(async (tx) => {...}) pattern + deterministic-key idempotency reference)
    - .planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md "Pattern 2" (the verbatim atomic-cancel transaction), "Pitfall 2" (filter null passId), "Pitfall 3" (double-approve idempotency), and the "Negative pass_debit for refund" + "inArray for batch update" code examples
    - apps/staff-web/server/db/schema.ts lines 201-258 (classOccurrences, bookings, passes, passDebits — confirm column names: bookings.passId, bookings.cancelledAt, passDebits.amount/reason/bookingId)
  </read_first>
  <behavior>
    - An occurrence with 3 active bookings (2 with a non-null passId, 1 with null passId): approval cancels all 3 bookings (status='cancelled', cancelledAt set), inserts exactly 2 negative pass_debits (amount:-1, reason:'cancellation_refund', bookingId set), and sets the occurrence status='cancelled'
    - All writes happen inside ONE db.transaction — a thrown error mid-way rolls back everything (no partial cancel, no orphaned credits)
    - Idempotency: if the occurrence is ALREADY 'cancelled' when the transaction opens, the body returns early — no booking updates, no pass_debits inserted
    - A booking with passId === null is cancelled but produces NO pass_debit row (no NOT NULL violation on passDebits.passId)
    - An occurrence with zero active bookings is simply set to 'cancelled' with no booking/debit writes
  </behavior>
  <action>
    Create `apps/staff-web/actions/cancel-occurrence.ts`. This is the GATED target action that `approve-proposal` runs AFTER the coach approves — it ALWAYS executes the cancel transaction when called (the human-in-the-loop gate is enforced by NOT naming it as a direct tool in the system prompt; only propose-action reaches it — RESEARCH Pattern 3 "cleanest model"). The transaction is the single source of correctness for AES-03. Carry a `// guard:allow-unscoped — single-tenant gym tables` comment on every query. NO `http` key. Verbatim:
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq, and, inArray } from "drizzle-orm";
    import { nanoid } from "nanoid";

    export default defineAction({
      description:
        "Cancel a class occurrence and atomically refund affected pass credits. " +
        "GATED — reached only via propose-action({actionName:'cancel-occurrence', params:{occurrenceId}}); " +
        "the agent never calls this directly. On approval it runs ONE transaction: active bookings -> cancelled, " +
        "a negative pass_debit per cancelled booking that used a pass, and the occurrence -> cancelled. " +
        "Idempotent — a second approve on an already-cancelled occurrence is a no-op. " +
        "Returns {cancelled:true, bookingsCancelled, creditsRefunded} or {error}.",
      schema: z.object({
        occurrenceId: z.string().min(1),
      }),
      run: async ({ occurrenceId }) => {
        const db = getDb();

        let bookingsCancelled = 0;
        let creditsRefunded = 0;
        let alreadyCancelled = false;
        let notFound = false;

        // ONE atomic transaction — bookings + refunds + occurrence, all-or-nothing.
        await db.transaction(async (tx) => {
          // 1. Re-check status INSIDE the transaction (idempotency — occurrence may
          //    have been cancelled between propose and approve, or on a double-click).
          // guard:allow-unscoped — single-tenant gym tables
          const [occ] = await tx
            .select({ status: schema.classOccurrences.status })
            .from(schema.classOccurrences)
            .where(eq(schema.classOccurrences.id, occurrenceId))
            .limit(1);
          if (!occ) {
            notFound = true;
            return;
          }
          if (occ.status === "cancelled") {
            alreadyCancelled = true;
            return; // already done — idempotent no-op
          }

          // 2. Fetch all active bookings with their passId.
          // guard:allow-unscoped — single-tenant gym tables
          const activeBookings = await tx
            .select({
              id: schema.bookings.id,
              passId: schema.bookings.passId,
            })
            .from(schema.bookings)
            .where(
              and(
                eq(schema.bookings.occurrenceId, occurrenceId),
                eq(schema.bookings.status, "booked"),
              ),
            );

          // 3. Cancel every active booking (batch).
          if (activeBookings.length > 0) {
            const bookingIds = activeBookings.map((b) => b.id);
            // guard:allow-unscoped — single-tenant gym tables
            await tx
              .update(schema.bookings)
              .set({
                status: "cancelled",
                cancelledAt: new Date().toISOString(),
              })
              .where(inArray(schema.bookings.id, bookingIds));
            bookingsCancelled = activeBookings.length;
          }

          // 4. Insert a negative pass_debit ONLY for bookings that used a pass
          //    (passId != null). Bookings with null passId are still cancelled
          //    above but have no credit to refund (RESEARCH Pitfall 2).
          const refundable = activeBookings.filter((b) => b.passId != null);
          for (const booking of refundable) {
            // guard:allow-unscoped — single-tenant gym tables
            await tx.insert(schema.passDebits).values({
              id: `pdebit_refund_${nanoid()}`,
              passId: booking.passId!,
              bookingId: booking.id,
              amount: -1, // negative = credit refund (schema allows negative)
              reason: "cancellation_refund",
              createdAt: new Date().toISOString(),
            });
          }
          creditsRefunded = refundable.length;

          // 5. Cancel the occurrence (last — only reached if all the above succeed).
          // guard:allow-unscoped — single-tenant gym tables
          await tx
            .update(schema.classOccurrences)
            .set({ status: "cancelled" })
            .where(eq(schema.classOccurrences.id, occurrenceId));
        });

        if (notFound) return { error: "OCCURRENCE_NOT_FOUND" };
        if (alreadyCancelled) return { cancelled: true, alreadyCancelled: true };
        return { cancelled: true, bookingsCancelled, creditsRefunded };
      },
    });
    ```
    Run `npx prettier --write apps/staff-web/actions/cancel-occurrence.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/actions/cancel-occurrence.ts` exists and contains `defineAction`
    - cancel-occurrence.ts contains `db.transaction(` and the bookings-update, the passDebits-insert, AND the occurrence-update all appear INSIDE the transaction callback (grep: all three `tx.` write calls precede the closing of the `await db.transaction(async (tx) => {` block)
    - cancel-occurrence.ts re-reads `classOccurrences.status` inside the transaction and returns early when `occ.status === "cancelled"` (idempotency)
    - cancel-occurrence.ts filters `activeBookings.filter((b) => b.passId != null)` before inserting pass_debits, and the insert uses `amount: -1` and `reason: "cancellation_refund"`
    - cancel-occurrence.ts imports `inArray` from `drizzle-orm` and uses it for the batch booking update
    - cancel-occurrence.ts contains `// guard:allow-unscoped` and NO `http:` key
    - `cd apps/staff-web && npx tsc --noEmit` exits 0 (note: tsc passes here even though approve-proposal/propose-action do not yet reference it — those edits are Task 3)
  </acceptance_criteria>
  <done>cancel-occurrence runs the full cancel + refund + occurrence-cancel inside one transaction, is idempotent on re-approve, and never inserts a refund for a booking without a passId.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create reschedule-occurrence gated action (recompute endsAt)</name>
  <files>apps/staff-web/actions/reschedule-occurrence.ts</files>
  <read_first>
    - apps/staff-web/actions/create-class-occurrence.ts (the addMinutes endsAt computation + INVALID_STARTS_AT validation + DEFINITION_NOT_FOUND pattern to mirror)
    - .planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md "Pattern 3" + "Pitfall 8" (endsAt MUST be recomputed from the definition's durationMin)
    - apps/staff-web/server/db/schema.ts lines 188-216 (classDefinitions.durationMin + classOccurrences.startsAt/endsAt/definitionId/status)
  </read_first>
  <behavior>
    - Rescheduling a valid scheduled occurrence to a new startsAt updates starts_at AND sets ends_at = addMinutes(new startsAt, definition.durationMin).toISOString()
    - An invalid/unparseable startsAt returns {error:"INVALID_STARTS_AT"} with no mutation
    - A missing occurrence returns {error:"OCCURRENCE_NOT_FOUND"}; a non-scheduled (cancelled/completed) occurrence returns {error:"OCCURRENCE_NOT_SCHEDULABLE", status}
    - startsAt is stored verbatim (studio-local ISO with tz offset); endsAt is the computed UTC instant — matching create-class-occurrence's storage convention
  </behavior>
  <action>
    Create `apps/staff-web/actions/reschedule-occurrence.ts`. This is the second GATED target action — like cancel-occurrence it ALWAYS executes when called (the gate is enforced by routing through propose-action; it is never named as a direct tool). It fetches the occurrence's definition to recompute endsAt (Pitfall 8 — a stale endsAt is a correctness bug). Carry `// guard:allow-unscoped` on every query. NO `http` key. Verbatim:
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq } from "drizzle-orm";
    import { addMinutes } from "date-fns";

    export default defineAction({
      description:
        "Reschedule a class occurrence to a new start time. GATED — reached only via " +
        "propose-action({actionName:'reschedule-occurrence', params:{occurrenceId, startsAt}}); the agent never " +
        "calls this directly when the class has bookings. Recomputes endsAt from the definition's duration. " +
        "Returns {rescheduled:true, startsAt, endsAt} or {error}.",
      schema: z.object({
        occurrenceId: z.string().min(1),
        startsAt: z
          .string()
          .min(1)
          .describe("New ISO datetime, studio-local with tz offset"),
      }),
      run: async ({ occurrenceId, startsAt }) => {
        // Validate the new start time parses.
        const start = new Date(startsAt);
        if (isNaN(start.getTime())) return { error: "INVALID_STARTS_AT" };

        const db = getDb();

        // guard:allow-unscoped — single-tenant gym tables
        const [occ] = await db
          .select({
            id: schema.classOccurrences.id,
            definitionId: schema.classOccurrences.definitionId,
            status: schema.classOccurrences.status,
          })
          .from(schema.classOccurrences)
          .where(eq(schema.classOccurrences.id, occurrenceId))
          .limit(1);
        if (!occ) return { error: "OCCURRENCE_NOT_FOUND" };
        if (occ.status !== "scheduled")
          return { error: "OCCURRENCE_NOT_SCHEDULABLE", status: occ.status };

        // Resolve the definition's duration to recompute endsAt (Pitfall 8).
        // guard:allow-unscoped — single-tenant gym tables
        const [def] = await db
          .select({ durationMin: schema.classDefinitions.durationMin })
          .from(schema.classDefinitions)
          .where(eq(schema.classDefinitions.id, occ.definitionId))
          .limit(1);
        if (!def) return { error: "DEFINITION_NOT_FOUND" };

        const endsAt = addMinutes(start, def.durationMin).toISOString();

        // guard:allow-unscoped — single-tenant gym tables
        await db
          .update(schema.classOccurrences)
          .set({ startsAt, endsAt }) // startsAt stored verbatim; endsAt UTC instant
          .where(eq(schema.classOccurrences.id, occurrenceId));
        return { rescheduled: true, startsAt, endsAt };
      },
    });
    ```
    Run `npx prettier --write apps/staff-web/actions/reschedule-occurrence.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/actions/reschedule-occurrence.ts` exists and contains `defineAction`
    - reschedule-occurrence.ts imports `addMinutes` from `date-fns` and computes `endsAt = addMinutes(start, def.durationMin).toISOString()`
    - The UPDATE `.set({ startsAt, endsAt })` includes BOTH fields (grep: the set object contains both `startsAt` and `endsAt`)
    - reschedule-occurrence.ts returns `{ error: "INVALID_STARTS_AT" }` before any DB read when the date does not parse
    - reschedule-occurrence.ts contains `// guard:allow-unscoped` and NO `http:` key
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>reschedule-occurrence updates startsAt and recomputes endsAt from the definition's duration; it rejects invalid dates and non-scheduled occurrences before mutating.</done>
</task>

<task type="auto">
  <name>Task 3: Atomic gate wiring — ACTION_ALLOWLIST + dispatch branches + propose-action enum + schema enum + registry entries in one commit</name>
  <files>apps/staff-web/actions/approve-proposal.ts, apps/staff-web/actions/propose-action.ts, apps/staff-web/server/db/schema.ts, apps/staff-web/.generated/actions-registry.ts</files>
  <read_first>
    - apps/staff-web/actions/approve-proposal.ts (FULL file — ACTION_ALLOWLIST lines 10-14, dispatch if/else if/else lines 61-67)
    - apps/staff-web/actions/propose-action.ts (FULL file — Zod enum lines 19-27, description string line 12)
    - apps/staff-web/server/db/schema.ts lines 474-481 (dashboardProposals.actionName Drizzle text enum — confirm it currently lists the three AE1 members)
    - apps/staff-web/.generated/actions-registry.ts (the import-alias + modules-map convention; AE2-01 may have already added the three direct actions — match the same style)
    - apps/staff-web/actions/cancel-occurrence.ts + reschedule-occurrence.ts (created in Tasks 1-2 — the dynamic-import targets)
    - .planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md "Pattern 4" + "Pattern 5" + "Pitfall 4" (all three gate sites must change together) + "Pitfall 6" (registry manual entries)
  </read_first>
  <action>
    Make ALL of these edits in a SINGLE commit (AEX-02 gate atomicity — missing any one of the three gate sites breaks tsc or the runtime gate; this is the non-negotiable invariant from STATE.md and the planning context). Both gated actions (cancel + reschedule) gate through the same three files, so batch them together to avoid a second conflicting edit pass on these files.

    EDIT 1 — `apps/staff-web/actions/approve-proposal.ts`:
    (a) Extend ACTION_ALLOWLIST (lines 10-14) to add both new actions:
    ```typescript
    const ACTION_ALLOWLIST = [
      "send-template-to-members",
      "create-checkout-link",
      "publish-form",
      "cancel-occurrence",
      "reschedule-occurrence",
    ] as const;
    ```
    (b) Add two `else if` branches to the dispatch chain (lines 61-67), BEFORE the final `else` (which catches create-checkout-link):
    ```typescript
    let mod: any;
    if (proposal.actionName === "send-template-to-members") {
      mod = await import("./send-template-to-members.js");
    } else if (proposal.actionName === "publish-form") {
      mod = await import("./publish-form.js");
    } else if (proposal.actionName === "cancel-occurrence") {
      mod = await import("./cancel-occurrence.js");
    } else if (proposal.actionName === "reschedule-occurrence") {
      mod = await import("./reschedule-occurrence.js");
    } else {
      mod = await import("./create-checkout-link.js");
    }
    ```

    EDIT 2 — `apps/staff-web/actions/propose-action.ts`:
    (a) Extend the Zod enum (lines 19-27) to add both:
    ```typescript
    actionName: z
      .enum([
        "send-template-to-members",
        "create-checkout-link",
        "publish-form",
        "cancel-occurrence",
        "reschedule-occurrence",
      ])
      .describe(
        "The existing gated action this proposal will execute on approval",
      ),
    ```
    (b) Update the description string (line 12) so the actionName line reads:
    `"actionName must be 'send-template-to-members', 'create-checkout-link', 'publish-form', 'cancel-occurrence', or 'reschedule-occurrence'. "`

    EDIT 3 — `apps/staff-web/server/db/schema.ts` (lines 478-480) — extend the dashboardProposals.actionName Drizzle text enum so tsc accepts inserting the two new actionNames. This is additive, TS-only, plain TEXT column — NO Postgres migration (RESEARCH Pattern 5 + Pitfall 4):
    ```typescript
    actionName: text("action_name", {
      enum: [
        "send-template-to-members",
        "create-checkout-link",
        "publish-form",
        "cancel-occurrence",
        "reschedule-occurrence",
      ],
    }).notNull(),
    ```

    EDIT 4 — `apps/staff-web/.generated/actions-registry.ts` — manually register both gated actions (the registry is stale; RESEARCH Pitfall 6). Add two import lines alongside the existing `a_*` imports, matching the exact alias convention:
    ```typescript
    import * as a_cancel_occurrence from "../actions/cancel-occurrence";
    import * as a_reschedule_occurrence from "../actions/reschedule-occurrence";
    ```
    And two entries to the `modules` Record:
    ```typescript
    "cancel-occurrence": a_cancel_occurrence,
    "reschedule-occurrence": a_reschedule_occurrence,
    ```
    If any entry already exists (a build regenerated it), do NOT duplicate.

    Then grep the staff-web test files for any exhaustive match on the proposal actionName literal union that the two new enum members would break: `grep -rn "create-checkout-link" apps/staff-web --include=*.test.ts`. If a test exhaustively switches/asserts on the prior union, update it to include the two new members; if none exists, no change.

    Run `npx prettier --write apps/staff-web/actions/approve-proposal.ts apps/staff-web/actions/propose-action.ts apps/staff-web/server/db/schema.ts apps/staff-web/.generated/actions-registry.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - approve-proposal.ts ACTION_ALLOWLIST array contains BOTH `"cancel-occurrence"` and `"reschedule-occurrence"`
    - approve-proposal.ts contains a branch `else if (proposal.actionName === "cancel-occurrence")` doing `await import("./cancel-occurrence.js")` AND a branch for `reschedule-occurrence` doing `await import("./reschedule-occurrence.js")`
    - propose-action.ts Zod enum for actionName contains both new members (the enum has 5 members total)
    - propose-action.ts description string mentions both `cancel-occurrence` and `reschedule-occurrence`
    - schema.ts dashboardProposals.actionName `enum` array contains both new members (5 members total)
    - actions-registry.ts contains import aliases `a_cancel_occurrence` and `a_reschedule_occurrence` AND map keys `"cancel-occurrence"` + `"reschedule-occurrence"`
    - NO new file under `apps/staff-web/server/db/migrations/` (Drizzle text enum is additive TS-only)
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>All three gate sites (allowlist+dispatch, propose-action enum, schema enum) include both gated actions in one commit, plus the registry entries; tsc passes; no Postgres migration created. The agent can propose either action and approve-proposal can dispatch them.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` exits 0 (2 new gated actions + 3 gate-site edits + registry edits all compile)
- grep proves "cancel-occurrence" AND "reschedule-occurrence" each appear in all FOUR gate-related files: actions/approve-proposal.ts, actions/propose-action.ts, server/db/schema.ts, .generated/actions-registry.ts (and their own action files)
- grep proves `db.transaction(` appears in cancel-occurrence.ts and the bookings/passDebits/occurrence writes are inside it
- grep proves `addMinutes` appears in reschedule-occurrence.ts and the UPDATE sets both startsAt and endsAt
- NO new file under `apps/staff-web/server/db/migrations/`
- NO edit to agent-chat.ts or AGENTS.md in this plan (system-prompt exposure is Wave 3, AE2-03)
- Optional DB replay (Neon MCP, gymos-demo billowing-sun-51091059): (a) INSERT a dashboard_proposals row with action_name='cancel-occurrence', status='pending' to confirm the plain-TEXT column accepts the value, then DELETE it. (b) On a TEST occurrence you create + can clean up, replay the cancel transaction SQL and confirm bookings flip to cancelled, negative pass_debits appear only for bookings with a non-null pass_id, and the occurrence flips to cancelled — then roll back / delete the test rows. Do NOT run against real seed occurrences.
</verification>

<success_criteria>
- cancel-occurrence gated action exists; its approval path runs bookings→cancelled + negative pass_debits (only for non-null passId) + occurrence→cancelled inside ONE db.transaction; idempotent on double-approve; no orphaned credits
- reschedule-occurrence gated action exists; updates startsAt and recomputes endsAt from the definition duration
- Gate wired atomically: ACTION_ALLOWLIST + dispatch branches + propose-action enum + Drizzle schema enum all include both new actions in one commit
- Both gated actions are manually present in the actions registry so approve-proposal can dynamically import them
- tsc passes with no Postgres migration added
- AES-03 + AES-04 satisfied at the code level (system-prompt naming of the propose→cancel / propose→reschedule workflows deferred to AE2-03)
</success_criteria>

<output>
After completion, create `.planning/phases/AE2-schedule-write-tools/AE2-02-SUMMARY.md`
</output>
