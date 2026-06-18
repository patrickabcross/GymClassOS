# Phase AE2: Schedule Write Tools — Research

**Researched:** 2026-06-18
**Domain:** Agent write tools for class definitions + occurrences (create, edit, capacity guard, atomic cancel-with-refund, reschedule, mark-complete)
**Confidence:** HIGH — all findings from direct file inspection; no external lookups required

---

## Summary

AE2 is a pure TypeScript addition to `apps/staff-web/actions/`. The two reusable `defineAction`s for the create path are already committed (`create-class-definition` + `create-class-occurrence`, commit `95e1f0da`). All schema tables needed already exist in `apps/staff-web/server/db/schema.ts` — no migrations required. The propose→approve gate pattern (establish in AE1) applies directly to `cancel-occurrence` and `reschedule-occurrence`.

The most technically involved requirement is AES-03 (cancel with atomic refund). The cancel path must (a) count active bookings, (b) if > 0, route through propose→approve with a proposal card showing booking/credit counts, and (c) execute bookings→cancelled + negative `pass_debits` entries + occurrence→cancelled in ONE Drizzle transaction. The worker (`services/worker/src/queues/stripe-event.ts`) already demonstrates the `db.transaction(async (tx) => { ... })` pattern. The staff-web's `getDb()` uses `createGetDb` with `neon-serverless` (WebSocket Pool) for Neon URLs, and the `neon-serverless` Pool driver supports transactions.

**Key constraint for the registry:** The AE1 forms actions (`create-form`, `archive-form`, `publish-form`, etc.) were committed to `actions/` but are NOT yet in `.generated/actions-registry.ts`. AE2 must manually add its new actions to the registry file (and trigger a build for regen) — do not rely on auto-regen alone.

**Primary recommendation:** Ship in 3 waves: (1) direct-write actions (set-capacity guard, mark-occurrence-complete, update-class-definition) + create-path agent exposure, (2) gated cancel + reschedule actions + gate atomicity, (3) per-tab Schedule system-prompt section + view-screen schedule branch + AGENTS.md docs.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AES-01 | Coach can ask agent to create a class occurrence (class def, start time, capacity) | `create-class-definition` + `create-class-occurrence` already exist; AE2 adds system-prompt exposure (two-exposure rule step 2) |
| AES-02 | Coach can ask agent to change capacity — rejected if new capacity < current bookings (no mutation) | New `set-occurrence-capacity` defineAction: COUNT(bookings WHERE status='booked'), guard + UPDATE capacity |
| AES-03 | Coach can ask agent to cancel — if active bookings exist, route through propose→approve; approval cancels bookings + refunds pass credits + cancels occurrence atomically | `BOOKINGS_EXIST` guard in `cancel-occurrence` action; gated via propose→approve; atomic Drizzle transaction on approval |
| AES-04 | Coach can ask agent to reschedule start time — gated when active bookings exist | `reschedule-occurrence` action; gated via propose→approve when bookings > 0 |
| AES-05 | Coach can ask agent to create or edit a class definition (name, duration, default capacity, category) | `create-class-definition` already exists; add new `update-class-definition` defineAction |
| AES-06 | Coach can ask agent to mark a past occurrence completed | New `mark-occurrence-complete` defineAction: UPDATE status='completed' |
</phase_requirements>

---

## Standard Stack

All existing. Zero new dependencies.

| Library | Version | Purpose | In Project Already |
|---------|---------|---------|-------------------|
| `@agent-native/core` | workspace | `defineAction`, `readAppState`, `recordChange` | Yes |
| `drizzle-orm` | `^0.45.x` | DB writes + transactions | Yes |
| `zod` | `^4.x` | Input validation | Yes |
| `nanoid` | `^5.1.x` | ID generation (`dprop_${nanoid()}`) | Yes |
| `date-fns` | `^4.1.x` | ISO date arithmetic (`addMinutes` already used in create-class-occurrence) | Yes |

---

## Architecture Patterns

### Relevant Project Structure

```
apps/staff-web/
  actions/
    create-class-definition.ts    EXISTS — AES-01 create-def path (already shipped)
    create-class-occurrence.ts    EXISTS — AES-01 create-occ path (already shipped)
    set-occurrence-capacity.ts    NEW — AES-02 (direct, with guard)
    cancel-occurrence.ts          NEW — AES-03 (gated via propose→approve)
    reschedule-occurrence.ts      NEW — AES-04 (gated via propose→approve)
    update-class-definition.ts    NEW — AES-05 (direct, edit path)
    mark-occurrence-complete.ts   NEW — AES-06 (direct)
    approve-proposal.ts           EDIT — add "cancel-occurrence" + "reschedule-occurrence" to ACTION_ALLOWLIST
    propose-action.ts             EDIT — add two new entries to Zod enum
    view-screen.ts                EDIT — add nav.view === "schedule" branch (AEX-01 for AE2)
  .generated/
    actions-registry.ts           EDIT — manually add 5 new action imports + map entries
  server/plugins/
    agent-chat.ts                 EDIT — add per-tab Schedule section + expose create path
  server/db/
    schema.ts                     EDIT — dashboardProposals.actionName enum (TypeScript-only, no migration)
  app/routes/
    gymos.schedule.tsx            EDIT — add useChangeVersions(["action"]) + useRevalidator for AEX-03
  apps/staff-web/AGENTS.md        EDIT — document 5 new actions + update propose-action row
```

### Pattern 1: Direct write with BOOKINGS_EXIST guard (AES-02)

```typescript
// apps/staff-web/actions/set-occurrence-capacity.ts
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq, and, count } from "drizzle-orm";

export default defineAction({
  description:
    "Change a class occurrence's capacity. Rejected if the new capacity is " +
    "below the current number of active bookings — returns {error:'CAPACITY_BELOW_BOOKINGS', " +
    "bookingCount, requestedCapacity} with no mutation.",
  schema: z.object({
    occurrenceId: z.string().min(1),
    capacity: z.number().int().min(1).max(500),
  }),
  run: async ({ occurrenceId, capacity }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables
    const [occ] = await db
      .select({ id: schema.classOccurrences.id, status: schema.classOccurrences.status })
      .from(schema.classOccurrences)
      .where(eq(schema.classOccurrences.id, occurrenceId))
      .limit(1);
    if (!occ) return { error: "OCCURRENCE_NOT_FOUND" };
    if (occ.status !== "scheduled") return { error: "OCCURRENCE_NOT_SCHEDULABLE", status: occ.status };

    // Count active bookings
    // guard:allow-unscoped — single-tenant gym tables
    const [{ bookingCount }] = await db
      .select({ bookingCount: count() })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.occurrenceId, occurrenceId),
          eq(schema.bookings.status, "booked"),
        ),
      );

    if (capacity < bookingCount) {
      return { error: "CAPACITY_BELOW_BOOKINGS", bookingCount, requestedCapacity: capacity };
    }

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.classOccurrences)
      .set({ capacity })
      .where(eq(schema.classOccurrences.id, occurrenceId));
    return { updated: true, occurrenceId, capacity };
  },
});
```

### Pattern 2: Gated cancel with atomic transaction (AES-03)

The `cancel-occurrence` action has two modes:
- **Without bookings:** cancel directly, return `{cancelled: true}`.
- **With bookings:** return `{error:"BOOKINGS_EXIST", bookingCount, passRefundCount}` — the agent must route through `propose-action({actionName:"cancel-occurrence", params:{occurrenceId}, rationale})`.

When `approve-proposal` calls `cancel-occurrence.run()` on approval, the action must be idempotent-aware: if already cancelled, return a success-like shape without re-running the transaction (the gate check happens inside the action itself on each call).

The transaction pattern (from `services/worker/src/queues/stripe-event.ts`):

```typescript
// apps/staff-web/actions/cancel-occurrence.ts (APPROVAL PATH)
await db.transaction(async (tx) => {
  // 1. Re-check status inside transaction (occurrence may have been cancelled between propose and approve)
  const [occ] = await tx
    .select({ status: schema.classOccurrences.status })
    .from(schema.classOccurrences)
    .where(eq(schema.classOccurrences.id, occurrenceId))
    .limit(1);
  if (!occ || occ.status === "cancelled") return; // already done — idempotent

  // 2. Fetch all active bookings with their passId
  const activeBookings = await tx
    .select({ id: schema.bookings.id, passId: schema.bookings.passId })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.occurrenceId, occurrenceId),
        eq(schema.bookings.status, "booked"),
      ),
    );

  // 3. Cancel each booking
  if (activeBookings.length > 0) {
    const bookingIds = activeBookings.map((b) => b.id);
    await tx
      .update(schema.bookings)
      .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
      .where(inArray(schema.bookings.id, bookingIds));
  }

  // 4. Insert negative pass_debits for each booking that had a passId
  const debitsToRefund = activeBookings.filter((b) => b.passId);
  for (const booking of debitsToRefund) {
    await tx.insert(schema.passDebits).values({
      id: `pdebit_refund_${nanoid()}`,
      passId: booking.passId!,
      bookingId: booking.id,
      amount: -1, // negative = credit refund
      reason: "cancellation_refund",
      createdAt: new Date().toISOString(),
    });
  }

  // 5. Cancel the occurrence
  await tx
    .update(schema.classOccurrences)
    .set({ status: "cancelled" })
    .where(eq(schema.classOccurrences.id, occurrenceId));
});
```

**Critical: `inArray` from `drizzle-orm`** is needed for the batch booking update. Verify the import.

**Idempotency:** The gate check inside the transaction (step 1 above) makes the action safe to call twice via double-approve. If already cancelled, no-op.

**Pass debit note:** `pass_debits.amount` is an INTEGER, and negative amounts are explicitly allowed per schema comment: "Negative amounts allowed for cancellation refunds." The `bookingId` FK is nullable, already set for the original debit and should also be set for the refund entry (links refund to the booking being cancelled).

**passId availability:** `bookings.passId` is nullable. It is set at booking time only if a pass debit was inserted at booking time. The demo-grade booking flow does NOT set passId (see `gymos.schedule.tsx` action, which does a naive INSERT with no passId). For demo data this means `passId` is null on most bookings. The refund logic must filter by `passId IS NOT NULL` — only bookings with a linked pass get a refund entry. Bookings without a passId are still cancelled; no debit entry is inserted for them.

### Pattern 3: Gated reschedule (AES-04)

```typescript
// apps/staff-web/actions/reschedule-occurrence.ts
// Gate decision: if active bookings > 0, action returns {error:"BOOKINGS_EXIST",...}
// without mutation; the agent routes through propose-action.
// On approval (called by approve-proposal), proceeds unconditionally.
// The action accepts an optional `force` boolean to distinguish the two modes.
// Simpler: the action ALWAYS checks bookings; if bookings exist it returns
// BOOKINGS_EXIST regardless. This means approve-proposal calls it again — but
// by that point it still sees the same bookings. Resolution: use the same
// two-mode pattern as AE1's publish-form.
//
// ACTUAL DESIGN: reschedule-occurrence checks bookings. If bookings exist,
// return BOOKINGS_EXIST (agent routes through propose-action). approve-proposal
// calls reschedule-occurrence.run(occurrenceId, startsAt). Because approve-proposal
// always calls run(), reschedule-occurrence must NOT gate on bookings when called
// from the approval path. Use a `bypassBookingCheck: true` flag in the params.
// The agent never passes bypassBookingCheck; approve-proposal's stored params do.
// The Zod schema uses .optional().default(false) for this flag.
```

**Simpler alternative:** Use a single action that checks bookings. If bookings exist, return `{error:"BOOKINGS_EXIST"}`. The agent calls `propose-action` with `params: {occurrenceId, startsAt, _approvedByCoach: true}`. The `_approvedByCoach` param is in the Zod schema as optional, defaults to false. When `_approvedByCoach: true`, the action skips the booking count guard and proceeds. This is the pattern to use — same as AE1's `publish-form` which always executes on call (the gate is enforced by only naming it in the propose-action call, not by being called directly).

**Actual pattern (cleanest):** reschedule-occurrence always reschedules. The BOOKINGS_EXIST check is in a SEPARATE read-only action or the agent calls `view-screen` + `list-classes` to see bookings. The agent is instructed in the system prompt: "If the occurrence has active bookings, call propose-action before calling reschedule-occurrence." The agent proposes; approval calls reschedule-occurrence directly.

Wait — approve-proposal dynamically imports the action and calls `run()`. The action always runs on approval. So reschedule-occurrence must either (a) always reschedule (no guard) and the GUARD is in a pre-check the AGENT does (not in the action), or (b) the action has a `force` param.

**Decision (aligned with AE1 cancel model from STATE.md):** cancel-occurrence returns `BOOKINGS_EXIST` when called without approval context. approve-proposal stores `params: {occurrenceId}` and calls `run({occurrenceId})` on approval. The action's `run()` sees the same call and would return `BOOKINGS_EXIST` again. This doesn't work as a simple re-call.

**Correct architecture (from STATE.md § "Cancel-occurrence correctness"):**

> AES-03: count bookings WHERE status='booked'; if >0 return `{error:"BOOKINGS_EXIST", bookingCount}` without mutating; approval path executes bookings→cancelled + negative pass_debits refunds + occurrence cancelled in ONE Drizzle transaction.

So `cancel-occurrence.run()` is ALWAYS safe to approve. The BOOKINGS_EXIST guard is the EARLY-RETURN path when called by the AGENT. When called by approve-proposal after a coach's explicit approval, the action must bypass this guard. The cleanest solution: the action checks a `confirmed: boolean` parameter. Agent calls: `propose-action({actionName:"cancel-occurrence", params:{occurrenceId, confirmed:true}})`. The action's run always receives `confirmed`; if the agent called directly without `confirmed:true`, it returns BOOKINGS_EXIST. approve-proposal stores `{occurrenceId, confirmed:true}` in params_json and the approval path runs the transaction.

**Simpler still (matching AE1 publish-form precedent):** `cancel-occurrence` is a gated action that ONLY runs the transaction — it NEVER checks whether to gate. The gating intelligence is in a SEPARATE check action (or the agent uses `view-screen` to see bookings). The agent flow is:

1. Agent calls `view-screen` → sees occurrence with `bookingCount > 0`.
2. System prompt instructs: "To cancel an occurrence that has active bookings, call `propose-action({actionName:'cancel-occurrence', params:{occurrenceId}, rationale})`."
3. approve-proposal calls `cancel-occurrence.run({occurrenceId})`.
4. `cancel-occurrence.run()` re-fetches bookings inside the transaction (always safe).

This means `cancel-occurrence.run()` never returns `{error:"BOOKINGS_EXIST"}` — it always executes the transaction. The AGENT is instructed to always route cancel through propose-action when the schedule tab shows the occurrence has bookings. This is the clean model — no `confirmed` flag needed.

**However,** the agent could also try to call `cancel-occurrence` directly (without a proposal), bypassing the human-in-the-loop. To prevent this: do NOT name `cancel-occurrence` as a standalone tool in the system prompt. Only name it in the `propose-action` tool description (same as `publish-form` in AE1). The system prompt only tells the agent to "call propose-action with actionName:'cancel-occurrence'" — the agent never calls cancel-occurrence directly.

### Pattern 4: Gate atomicity — Zod enum + ACTION_ALLOWLIST (AES-03/04)

Both files must be updated in the same commit:

```typescript
// approve-proposal.ts
const ACTION_ALLOWLIST = [
  "send-template-to-members",
  "create-checkout-link",
  "publish-form",
  "cancel-occurrence",      // ← ADD AES-03
  "reschedule-occurrence",  // ← ADD AES-04
] as const;

// approve-proposal.ts — dynamic import branches (add alongside existing)
} else if (proposal.actionName === "cancel-occurrence") {
  mod = await import("./cancel-occurrence.js");
} else if (proposal.actionName === "reschedule-occurrence") {
  mod = await import("./reschedule-occurrence.js");
}

// propose-action.ts — Zod enum extension
actionName: z.enum([
  "send-template-to-members",
  "create-checkout-link",
  "publish-form",
  "cancel-occurrence",      // ← ADD AES-03
  "reschedule-occurrence",  // ← ADD AES-04
])
```

### Pattern 5: dashboardProposals.actionName schema enum

In `schema.ts` (line 478), the `dashboardProposals.actionName` column uses a Drizzle text enum:

```typescript
actionName: text("action_name", {
  enum: ["send-template-to-members", "create-checkout-link", "publish-form"],
})
```

Add `"cancel-occurrence"` and `"reschedule-occurrence"` to this enum. **This is a TypeScript-only change — no Postgres migration needed** (Drizzle `text({ enum: [...] })` is a plain TEXT column; the enum is a TypeScript compile-time constraint only). Without this change, `tsc --noEmit` will emit a type error when `propose-action.ts` inserts `actionName: "cancel-occurrence"`.

### Pattern 6: Live-refresh for schedule tab (AEX-03)

The schedule route (`gymos.schedule.tsx`) is an RR v7 loader route — same as forms. The AE1-shipped forms route uses `useChangeVersions(["action"])` + `useRevalidator`. The schedule route needs the identical pattern. Confirmed: `gymos.forms._index.tsx` already uses this (AE1-03 shipped it for forms).

**Current state:** `gymos.schedule.tsx` has NO `useChangeVersion` or `useRevalidator` (grep returned empty). AE2 must add it.

```typescript
// apps/staff-web/app/routes/gymos.schedule.tsx — add to component imports + body
import { useChangeVersions } from "@agent-native/core/client";
import { useEffect } from "react";
// already imports useRevalidator from react-router (used by NewClassDialog, not the route itself)
// ...
const revalidator = useRevalidator();
const actionVersion = useChangeVersions(["action"]);
useEffect(() => {
  if (actionVersion > 0) revalidator.revalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [actionVersion]);
```

Note: `useRevalidator` is already imported by `NewClassDialog.tsx` (the component), not by the route file itself. The route file currently imports `useLoaderData, Form, redirect, useSearchParams` from `react-router`. AE2 must also add `useRevalidator` to the route's import.

### Pattern 7: Two-exposure rule for create path (AES-01)

`create-class-definition` and `create-class-occurrence` are in `actions/` and in `actions-registry.ts` (confirmed — lines 11-12 of the registry). They are NOT in the system prompt. AE2 step: add them to the agent-chat.ts Schedule section.

### Pattern 8: view-screen schedule branch (AEX-01)

Add a `nav.view === "schedule"` branch to `view-screen.ts` (before the generic email branch, same as the forms branch). Return:

```typescript
screen.schedule = {
  selectedDate: nav.selectedDate ?? null,
  occurrenceId: nav.occurrenceId ?? null,
  // Pull today's + next 7 days occurrences with booking counts for context
  upcomingOccurrences: [...],
};
if (nav.occurrenceId) {
  // Also pull the selected occurrence's full details + booking count
  screen.selectedOccurrence = { ... };
}
```

This gives the agent context before writing (e.g., the agent sees "Friday's pilates has 8 bookings" before proposing a cancel).

### Anti-Patterns to Avoid

- **Naming `cancel-occurrence` or `reschedule-occurrence` as direct agent tools:** Both are gated. They must only appear in the `propose-action` tool's description, not as standalone bullets.
- **Skipping the dashboardProposals.actionName enum update:** Will cause `tsc --noEmit` failure.
- **Transaction attempt with neon-http driver:** The HTTP driver does NOT support transactions. The staff-web uses `neon-serverless` (WebSocket Pool) for Neon URLs — confirmed by `create-get-db.ts` lines 104-119. Transactions work. Do not accidentally use the HTTP driver.
- **Using `inArray` before importing it:** `inArray` is in `drizzle-orm` — import alongside `eq`, `and`, `count`.
- **Not adding new actions to actions-registry.ts manually:** The AE1 forms actions were committed to `actions/` but are absent from the auto-generated registry (confirmed by inspection). AE2 must manually add its 5 new actions to `.generated/actions-registry.ts` in the same wave as the action files.
- **Refunding bookings with null passId:** Filter `activeBookings.filter(b => b.passId)` before inserting pass_debits. A booking without a passId has no pass credit to refund.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic cancel transaction | Separate sequential updates | `db.transaction(async (tx) => { ... })` | Partial writes on a crash leave orphaned credits — this happened with demo-grade booking path |
| Proposal rendering/storage | Custom DB table | Existing `dashboardProposals` + `propose-action` + `approve-proposal` | AE1 wired it; AE2 just adds new actionName entries |
| Booking count query | Ad-hoc SELECT | `count()` from `drizzle-orm` in a single grouped query | Already used in `gymos.schedule.tsx` loader Query B |
| Schedule live-refresh | `setInterval` polling | `useChangeVersions(["action"])` + `useRevalidator()` | Framework SSE already handles change notification |
| ID generation | `crypto.randomUUID()` | `nanoid()` with a prefix (`cocc_`, `pdebit_refund_`, `dprop_`) | Matches existing ID conventions in this codebase |

---

## Exact File-Level Implementation Map

### AES-01: Agent-drive create path (expose existing actions to agent)

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/server/plugins/agent-chat.ts` | ADD Schedule section with create-class-definition + create-class-occurrence bullets |
| 2 | `apps/staff-web/AGENTS.md` | ADD two-exposure note for create-class-definition/occurrence (mirror existing note pattern) |

No new action files needed — `create-class-definition.ts` and `create-class-occurrence.ts` already exist and are in the registry.

### AES-02: set-occurrence-capacity (direct, with guard)

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/set-occurrence-capacity.ts` | NEW — defineAction: count bookings, reject if new < count, else UPDATE capacity |
| 2 | `apps/staff-web/.generated/actions-registry.ts` | EDIT — add import + map entry for set-occurrence-capacity |
| 3 | `apps/staff-web/AGENTS.md` | ADD row to Agent Actions table |
| 4 | `apps/staff-web/server/plugins/agent-chat.ts` | ADD bullet in Schedule section |

### AES-03: cancel-occurrence (GATED)

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/cancel-occurrence.ts` | NEW — defineAction: atomic transaction (bookings→cancelled + pass_debits refunds + occurrence→cancelled) |
| 2 | `apps/staff-web/actions/approve-proposal.ts` | EDIT — add "cancel-occurrence" to ACTION_ALLOWLIST + dynamic import branch |
| 3 | `apps/staff-web/actions/propose-action.ts` | EDIT — add "cancel-occurrence" to Zod enum |
| 4 | `apps/staff-web/server/db/schema.ts` | EDIT — add "cancel-occurrence" to dashboardProposals.actionName enum |
| 5 | `apps/staff-web/.generated/actions-registry.ts` | EDIT — add import + map entry |
| 6 | `apps/staff-web/AGENTS.md` | ADD row — mark gated, reached only via propose-action |
| 7 | `apps/staff-web/server/plugins/agent-chat.ts` | ADD in Schedule section: "To cancel a class with bookings: call propose-action({actionName:'cancel-occurrence', ...})" |

Steps 2, 3, and 4 MUST be in the same commit (gate atomicity constraint + TypeScript type correctness).

### AES-04: reschedule-occurrence (GATED)

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/reschedule-occurrence.ts` | NEW — defineAction: UPDATE starts_at + recompute ends_at; always executes (gate is agent-prompt-level) |
| 2 | `apps/staff-web/actions/approve-proposal.ts` | EDIT — add "reschedule-occurrence" to ACTION_ALLOWLIST + dynamic import branch |
| 3 | `apps/staff-web/actions/propose-action.ts` | EDIT — add "reschedule-occurrence" to Zod enum |
| 4 | `apps/staff-web/server/db/schema.ts` | EDIT — add "reschedule-occurrence" to dashboardProposals.actionName enum |
| 5 | `apps/staff-web/.generated/actions-registry.ts` | EDIT — add import + map entry |
| 6 | `apps/staff-web/AGENTS.md` | ADD row — mark gated when bookings exist |
| 7 | `apps/staff-web/server/plugins/agent-chat.ts` | ADD in Schedule section: "To reschedule a class with bookings: call propose-action..." |

Steps 2, 3, and 4 MUST be in the same commit as AES-03's gate changes (batch all gate changes atomically).

### AES-05: update-class-definition (direct)

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/update-class-definition.ts` | NEW — defineAction: UPDATE name/durationMin/defaultCapacity/category (never touches active flag) |
| 2 | `apps/staff-web/.generated/actions-registry.ts` | EDIT — add import + map entry |
| 3 | `apps/staff-web/AGENTS.md` | ADD row |
| 4 | `apps/staff-web/server/plugins/agent-chat.ts` | ADD bullet in Schedule section |

### AES-06: mark-occurrence-complete (direct)

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/mark-occurrence-complete.ts` | NEW — defineAction: require status='scheduled' (or already completed = no-op); UPDATE status='completed' |
| 2 | `apps/staff-web/.generated/actions-registry.ts` | EDIT — add import + map entry |
| 3 | `apps/staff-web/AGENTS.md` | ADD row |
| 4 | `apps/staff-web/server/plugins/agent-chat.ts` | ADD bullet in Schedule section |

### AEX-03: schedule tab live-refresh

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/app/routes/gymos.schedule.tsx` | EDIT — add `useChangeVersions(["action"])` import, `useRevalidator` to component, `useEffect` pattern |

### Schedule per-tab section in agent-chat.ts (AEX-01 + AEX-04)

Inserted after the Forms section (same insertion point strategy as AE1). Example structure:

```
Schedule tab (when the coach is on /gymos/schedule — call view-screen first to see which occurrences exist):
- create-class-definition — create a new class type in the catalog ({name, durationMin, defaultCapacity?, category?}). Does NOT schedule an occurrence.
- create-class-occurrence — schedule an occurrence from an existing definition ({definitionId, startsAt, capacity?, room?}).
- update-class-definition — edit a class definition's name, duration, default capacity, or category ({definitionId, name?, durationMin?, defaultCapacity?, category?}).
- set-occurrence-capacity — change an occurrence's capacity ({occurrenceId, capacity}). Returns {error:"CAPACITY_BELOW_BOOKINGS"} if new capacity < active bookings — no mutation occurs.
- mark-occurrence-complete — mark a past occurrence as completed ({occurrenceId}).
- To CANCEL an occurrence with bookings: do NOT call cancel-occurrence directly. Call propose-action({actionName:"cancel-occurrence", params:{occurrenceId}, rationale}). The coach approves on the noticeboard; only then does the atomic cancellation (bookings cancelled + pass credits refunded + occurrence cancelled) run.
- To RESCHEDULE an occurrence that has active bookings: call propose-action({actionName:"reschedule-occurrence", params:{occurrenceId, startsAt}, rationale}). The coach approves; only then does the start time change.
```

---

## Existing Code Inventory (verified by direct file read)

### classDefinitions table (`apps/staff-web/server/db/schema.ts` lines 188-198)

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | format: `cdef_${nanoid()}` (from create-class-definition.ts) |
| `name` | text NOT NULL | |
| `description` | text | nullable |
| `durationMin` | integer NOT NULL | |
| `defaultCapacity` | integer NOT NULL | default 12 |
| `defaultInstructorUserId` | text | nullable FK to framework user.id |
| `category` | text | nullable — "yoga" / "hiit" / "strength" / etc. |
| `active` | integer boolean NOT NULL | default true |
| `createdAt` | text NOT NULL | ISO |

### classOccurrences table (`apps/staff-web/server/db/schema.ts` lines 201-216)

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | format: `cocc_${nanoid()}` |
| `definitionId` | text NOT NULL | FK classDefinitions.id |
| `startsAt` | text NOT NULL | ISO with timezone offset — stored verbatim |
| `endsAt` | text NOT NULL | UTC ISO (computed via addMinutes) |
| `capacity` | integer NOT NULL | |
| `instructorUserId` | text | nullable |
| `room` | text | nullable |
| `status` | text enum | `"scheduled" \| "cancelled" \| "completed"` |
| `notes` | text | nullable |
| `createdAt` | text NOT NULL | ISO |

Status lifecycle: `scheduled` → `cancelled` (AES-03 gated) | `scheduled` → `completed` (AES-06 direct).

### bookings table (`apps/staff-web/server/db/schema.ts` lines 218-232)

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `occurrenceId` | text NOT NULL | FK classOccurrences.id |
| `memberId` | text NOT NULL | FK gym_members.id |
| `status` | text enum | `"booked" \| "waitlist" \| "cancelled" \| "attended" \| "no_show"` |
| `passId` | text | nullable — FK passes.id; set only when pass debit was inserted at booking |
| `bookedByUserId` | text | nullable — staff who booked; null if self-booked |
| `bookedAt` | text NOT NULL | ISO |
| `cancelledAt` | text | nullable |
| `attendedAt` | text | nullable |

**Active bookings filter:** `WHERE status = 'booked'`

### passes table (`apps/staff-web/server/db/schema.ts` lines 234-247)

No `status` column — "active" is derived from `expires_at IS NULL OR expires_at >= now()`. Balance = SUM(granted) - SUM(debit amounts).

### passDebits table (`apps/staff-web/server/db/schema.ts` lines 250-257)

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Use `pdebit_refund_${nanoid()}` for refunds |
| `passId` | text NOT NULL | FK passes.id |
| `bookingId` | text | nullable FK bookings.id |
| `amount` | integer NOT NULL | positive = debit; **negative = refund** |
| `reason` | text | "class_booking" / "cancellation_refund" / etc. |
| `createdAt` | text NOT NULL | ISO |

Schema comment explicitly allows negative amounts: "Negative amounts allowed for cancellation refunds."

### dashboardProposals table (`apps/staff-web/server/db/schema.ts` lines 475-492)

`actionName` column currently: `text("action_name", { enum: ["send-template-to-members", "create-checkout-link", "publish-form"] })`. Must add `"cancel-occurrence"` and `"reschedule-occurrence"`.

### create-class-definition.ts (existing — AES-01 create-def path)

Schema: `z.object({ name: z.string().min(1).max(120), durationMin: z.number().int().min(5).max(480), defaultCapacity: z.number().int().min(1).max(500).optional().default(12), category: z.string().min(1).max(60).optional() })`. Returns `{id, name}`.

### create-class-occurrence.ts (existing — AES-01 create-occ path)

Schema: `z.object({ definitionId: z.string().min(1), startsAt: z.string().min(1), capacity: z.number().int().min(1).max(500).optional(), room: z.string().max(120).optional(), instructorUserId: z.string().optional(), notes: z.string().max(2000).optional() })`. Returns `{id, startsAt, endsAt, capacity}`. Rejects `INVALID_STARTS_AT` and `DEFINITION_NOT_FOUND`.

### actions-registry.ts (current state)

`create-class-definition` and `create-class-occurrence` ARE in the registry (lines 11-12). AE1 forms actions (`create-form`, `archive-form`, `publish-form`, etc.) are NOT in the registry — the registry is stale. AE2 must manually add all 5 new action entries to the registry file directly.

### approve-proposal.ts (current state)

`ACTION_ALLOWLIST` = `["send-template-to-members", "create-checkout-link", "publish-form"]`. Uses `if/else if` chain for dynamic import. `else` branch catches `create-checkout-link`. AES-03/04 additions must be inserted as `else if` branches before the final `else`.

### propose-action.ts (current state)

`actionName: z.enum(["send-template-to-members", "create-checkout-link", "publish-form"])`.

### gymos.schedule.tsx (current state)

Has `useRevalidator` import but it is NOT used in the route component — it is used inside `NewClassDialog.tsx`. The route component itself has no `useChangeVersions` or `useRevalidator` call. AE2 must wire both.

---

## Common Pitfalls

### Pitfall 1: Transaction on neon-http instead of neon-serverless
**What goes wrong:** If the DB connection is via the HTTP driver (stateless), `db.transaction()` throws because HTTP is stateless.
**Why it happens:** Misreading the `createGetDb` code.
**How to avoid:** `createGetDb` selects `neon-serverless` (WebSocket Pool) for any URL matching `*.neon.tech*` (line 53-58 of `create-get-db.ts`). The `gymos-demo` DATABASE_URL is a Neon URL, so the Pool driver is used. `db.transaction()` WORKS. No action needed — just confirm DATABASE_URL contains `.neon.tech`.
**Warning signs:** Runtime error "Cannot use transaction with HTTP driver."

### Pitfall 2: Refunding bookings with null passId
**What goes wrong:** Inserting a `pass_debits` row for a booking that has no `passId` causes a NOT NULL constraint violation on `pass_debits.passId`.
**Why it happens:** Demo-grade booking flow (gymos.schedule.tsx action, line 96-103) does naive INSERT with no passId. Most of the 4,162 seeded bookings have `passId = null`.
**How to avoid:** In `cancel-occurrence.ts`, filter: `const debitsToInsert = activeBookings.filter(b => b.passId != null)`. Only bookings with a real passId get a refund entry. All bookings still get `status='cancelled'`.

### Pitfall 3: Double-approve creates duplicate pass_debits
**What goes wrong:** Coach clicks Approve twice. Second call runs the transaction again, inserting duplicate refund entries.
**How to avoid:** The atomic transaction (step 1 inside the tx: re-read occurrence status) handles this. If `occ.status === "cancelled"`, the transaction body returns early without inserting. The `approve-proposal` handler also marks the proposal as `status='executed'` after the first approve — the second approval attempt finds the proposal is no longer `status='pending'` and returns `{error:"Proposal not found or already actioned"}`.

### Pitfall 4: Updating schema.ts actionName enum without updating both Zod files
**What goes wrong:** TypeScript compiles (schema.ts updated), but `propose-action.ts` still has the old 3-element enum so the agent can't call propose-action with the new actionName. OR `approve-proposal.ts` still has the old allowlist so the approval is rejected.
**How to avoid:** All three files (schema.ts, propose-action.ts, approve-proposal.ts) must be updated in the same commit. The planner should enforce this as a single-commit constraint on the gating wave.

### Pitfall 5: Mark-complete on a future occurrence
**What goes wrong:** Agent marks an occurrence as completed before it has happened (bad data).
**How to avoid:** `mark-occurrence-complete.ts` should check `new Date(occ.startsAt) <= new Date()` before allowing. If the occurrence is in the future, return `{error:"OCCURRENCE_IN_FUTURE"}`. This is a soft guard (the coach may have a legitimate reason on edge cases), but it prevents obvious mistakes.

### Pitfall 6: actions-registry.ts not updated with new actions
**What goes wrong:** New actions are committed to `actions/` but the framework can't find them at runtime (they're not imported into the Nitro bundle).
**Why it happens:** The registry is auto-generated by `pnpm build`, but build is only run during Vercel deploy. The registry was last regenerated before AE1's forms actions were added — confirmed by inspection (AE1 forms actions missing from registry). Manual entries are required.
**How to avoid:** For each new action in AE2, add both the `import * as a_<name> from "../actions/<name>"` line AND the entry in the `modules` record to `.generated/actions-registry.ts`. Follow the exact existing naming convention (`a_set_occurrence_capacity` etc. — underscores, all lowercase).

### Pitfall 7: useRevalidator imported at wrong level
**What goes wrong:** `useRevalidator` is imported from `"react-router"` at the top of `gymos.schedule.tsx` but the route file currently doesn't import it (it's used inside `NewClassDialog.tsx` component file, which has its own import). Adding the live-refresh hook to the route component requires adding the import at the route level.
**How to avoid:** Add `useRevalidator` to the route's import: `import { useLoaderData, Form, redirect, useSearchParams, useRevalidator } from "react-router";`

### Pitfall 8: reschedule-occurrence endsAt recomputation
**What goes wrong:** Rescheduling `startsAt` without also updating `endsAt` leaves a stale `endsAt` that predates the new `startsAt` (or is in the wrong interval).
**How to avoid:** `reschedule-occurrence.ts` must recompute `endsAt = addMinutes(new Date(startsAt), def.durationMin).toISOString()`. This requires fetching the class definition's `durationMin` first. The action should fetch `classDefinitions.durationMin` via `definitionId` (from the occurrence row) before running the UPDATE.

---

## Code Examples

### Counting active bookings (AES-02/03)

```typescript
// Source: drizzle-orm docs + gymos.schedule.tsx loader Query B pattern
import { count, and, eq } from "drizzle-orm";

const [{ bookingCount }] = await db
  .select({ bookingCount: count() })
  .from(schema.bookings)
  .where(
    and(
      eq(schema.bookings.occurrenceId, occurrenceId),
      eq(schema.bookings.status, "booked"),
    ),
  );
// bookingCount is a number (Drizzle count() returns number in pg mode)
```

### Drizzle transaction pattern (from services/worker/src/queues/stripe-event.ts)

```typescript
// Source: services/worker/src/queues/stripe-event.ts lines 95-104
await db.transaction(async (tx) => {
  // All writes inside tx use tx.update / tx.insert / tx.select
  await tx.update(schema.classOccurrences)
    .set({ status: "cancelled" })
    .where(eq(schema.classOccurrences.id, occurrenceId));
  // ... more writes ...
});
```

### inArray for batch update (cancel multiple bookings atomically)

```typescript
// Source: drizzle-orm docs
import { inArray } from "drizzle-orm";

const bookingIds = activeBookings.map((b) => b.id);
if (bookingIds.length > 0) {
  await tx.update(schema.bookings)
    .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
    .where(inArray(schema.bookings.id, bookingIds));
}
```

### Negative pass_debit for refund (AES-03)

```typescript
// Source: passDebits table schema (schema.ts lines 250-257)
// amount = -1 = refund 1 credit; schema allows negative
await tx.insert(schema.passDebits).values({
  id: `pdebit_refund_${nanoid()}`,
  passId: booking.passId!,
  bookingId: booking.id,
  amount: -1,
  reason: "cancellation_refund",
  createdAt: new Date().toISOString(),
});
```

### update-class-definition (AES-05)

```typescript
// apps/staff-web/actions/update-class-definition.ts
export default defineAction({
  schema: z.object({
    definitionId: z.string().min(1),
    name: z.string().min(1).max(120).optional(),
    durationMin: z.number().int().min(5).max(480).optional(),
    defaultCapacity: z.number().int().min(1).max(500).optional(),
    category: z.string().min(1).max(60).optional(),
  }),
  run: async ({ definitionId, name, durationMin, defaultCapacity, category }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables
    const [def] = await db.select({ id: schema.classDefinitions.id })
      .from(schema.classDefinitions)
      .where(eq(schema.classDefinitions.id, definitionId))
      .limit(1);
    if (!def) return { error: "DEFINITION_NOT_FOUND" };

    const updates: Partial<typeof schema.classDefinitions.$inferInsert> = {};
    if (name !== undefined) updates.name = name;
    if (durationMin !== undefined) updates.durationMin = durationMin;
    if (defaultCapacity !== undefined) updates.defaultCapacity = defaultCapacity;
    if (category !== undefined) updates.category = category;
    if (Object.keys(updates).length === 0) return { updated: false, reason: "no changes" };

    await db.update(schema.classDefinitions).set(updates)
      .where(eq(schema.classDefinitions.id, definitionId));
    return { updated: true };
  },
});
```

### actions-registry.ts manual entry pattern

```typescript
// .generated/actions-registry.ts — manual additions
import * as a_set_occurrence_capacity from "../actions/set-occurrence-capacity";
import * as a_cancel_occurrence from "../actions/cancel-occurrence";
import * as a_reschedule_occurrence from "../actions/reschedule-occurrence";
import * as a_update_class_definition from "../actions/update-class-definition";
import * as a_mark_occurrence_complete from "../actions/mark-occurrence-complete";

// In the modules Record:
"set-occurrence-capacity": a_set_occurrence_capacity,
"cancel-occurrence": a_cancel_occurrence,
"reschedule-occurrence": a_reschedule_occurrence,
"update-class-definition": a_update_class_definition,
"mark-occurrence-complete": a_mark_occurrence_complete,
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|---|---|---|
| No agent write tools (read-only agent) | defineAction pattern (AE1 established) | AE2 follows same pattern |
| Naive demo-grade INSERT booking (no passId) | Same for v1.2 (production atomicity BKG-03 deferred) | passId is null on most seeded bookings — refund logic must handle this |
| Single flat system prompt | Per-tab sections (AE1 established) | AE2 adds Schedule section |
| Manual page reload after agent write | useChangeVersions + useRevalidator (AE1 pattern) | AE2 applies same to schedule route |

---

## Open Questions

1. **`useRevalidator` in gymos.schedule.tsx — import location**
   - What we know: the route file already has `useLoaderData, Form, redirect, useSearchParams` from `"react-router"`. `NewClassDialog.tsx` imports `useRevalidator` separately.
   - What's unclear: whether there is a `useRevalidator` call anywhere in the route component function body.
   - Recommendation: grep confirms no `useRevalidator` in route body. Add to route imports and component body. Medium confidence — grep was empty.

2. **`count()` return type from Drizzle (pg mode)**
   - What we know: `count()` from drizzle-orm is used in `gymos.schedule.tsx` loader Query B with type annotation `sql<number>\`COUNT(*)\``. The drizzle `count()` helper returns `number` in Postgres mode.
   - What's unclear: the exact TypeScript shape of `db.select({ bookingCount: count() })` — whether it returns `{ bookingCount: number }` or `{ bookingCount: string }` (Postgres `COUNT` returns bigint as string in some drivers).
   - Recommendation: use `Number(result.bookingCount)` for safety, matching the existing pattern in the schedule loader: `Number(r.count)`.

3. **AE1 forms actions in registry — blocker?**
   - What we know: `create-form`, `archive-form`, etc. are NOT in `.generated/actions-registry.ts` even though they are live in `actions/` and in the agent-chat.ts system prompt.
   - What's unclear: whether the Vercel build auto-regened the registry (possible — `pnpm build` calls `agent-native build`). The local registry file we read was from the pre-build state.
   - Recommendation: At plan execution time, read the deployed registry or run `tsc --noEmit` to confirm forms actions are imported. If they are missing, treat manual registry entries as REQUIRED for all new AE2 actions. If they are present (regen happened on build), still add AE2 entries manually — safer to add duplicates than miss.

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. All work is TypeScript in `apps/staff-web/`. Verification via `tsc --noEmit` + Vercel deploy (no local dev server — NitroViteError constraint continues from prior phases).

---

## Validation Architecture

No automated test framework configured for `apps/staff-web/actions/`. Verification follows the pattern established in AE1:

- **TypeScript compile:** `cd apps/staff-web && npx tsc --noEmit` after each wave.
- **Gate atomicity check:** grep that both `ACTION_ALLOWLIST` and `propose-action.ts` Zod enum contain all new gated action names before commit.
- **Drizzle transaction check:** grep `db.transaction` in `cancel-occurrence.ts` — must be present.
- **Registry check:** grep each new action name in `.generated/actions-registry.ts` before Vercel deploy.
- **Integration:** Vercel deploy + Neon MCP verification:
  - `set-occurrence-capacity`: HTTP POST to action endpoint with capacity below booking count → confirm `{error:"CAPACITY_BELOW_BOOKINGS"}` returned and no DB write.
  - `cancel-occurrence`: approve a proposal → query `class_occurrences`, `bookings`, and `pass_debits` in Neon to confirm atomic cancel + refunds.
  - `reschedule-occurrence`: approve a proposal → confirm `starts_at` + `ends_at` updated.

### Success Criteria Verification Map

| Success Criterion | Verification Method |
|---|---|
| "create a HIIT class on Monday at 7am with 15 spots" → new occurrence on /gymos/schedule without reload | Agent chat → view-screen shows occurrence; schedule grid reloads via useChangeVersions |
| "reduce capacity of yoga to 8" when 9 people are booked → rejection, no mutation | Agent chat → confirm {error:"CAPACITY_BELOW_BOOKINGS"} in response; Neon MCP confirms capacity unchanged |
| "cancel Friday's spin" with bookings → proposal card; approve → atomic cancel + refunds | Neon MCP: bookings status='cancelled', pass_debits negative entries, occurrence status='cancelled' |
| "move Thursday's pilates to 9am" with bookings → proposal card; approve → new startsAt | Neon MCP: occurrence starts_at updated; ends_at recomputed |
| Schedule tab live-refreshes after agent write | Visual confirm on Vercel: change visible without reload |

---

## Sources

### Primary (HIGH confidence — direct file read)

- `apps/staff-web/server/db/schema.ts` — classDefinitions, classOccurrences, bookings, passes, passDebits, dashboardProposals table columns + types; confirmed negative passDebits allowed
- `apps/staff-web/actions/create-class-definition.ts` — exact Zod schema, ID format, DB write pattern
- `apps/staff-web/actions/create-class-occurrence.ts` — exact Zod schema, endsAt computation via addMinutes
- `apps/staff-web/actions/approve-proposal.ts` — current ACTION_ALLOWLIST, dynamic import pattern
- `apps/staff-web/actions/propose-action.ts` — current Zod enum
- `apps/staff-web/.generated/actions-registry.ts` — confirmed create-class-definition/occurrence present; AE1 forms actions absent
- `apps/staff-web/app/routes/gymos.schedule.tsx` — loader query patterns (count bookings), confirms no live-refresh wiring today
- `apps/staff-web/app/components/gymos/NewClassDialog.tsx` — useRevalidator + useActionMutation pattern, confirms post-write revalidation approach
- `apps/staff-web/app/routes/gymos.forms._index.tsx` — confirmed useChangeVersions(["action"]) + useRevalidator pattern (AE1 shipped)
- `apps/staff-web/actions/view-screen.ts` — forms branch pattern; confirmed nav.view branching structure
- `apps/staff-web/server/plugins/agent-chat.ts` — current system prompt + Forms tab section structure
- `apps/staff-web/server/db/index.ts` — getDb() via createGetDb; no direct transaction calls in staff-web actions (pattern must be imported from worker)
- `packages/core/src/db/create-get-db.ts` — confirmed neon-serverless (WebSocket Pool) used for Neon URLs; Pool supports transactions
- `services/worker/src/queues/stripe-event.ts` — `db.transaction(async (tx) => { ... })` exact pattern
- `apps/staff-web/AGENTS.md` — current Agent Actions table; two-exposure note pattern for create-class-definition/occurrence
- `.planning/phases/AE1-forms-write-tools/AE1-RESEARCH.md` — gate atomicity pattern, dashboardProposals enum pitfall
- `.planning/phases/AE1-forms-write-tools/AE1-03-SUMMARY.md` — confirmed AE1 shipped view-screen forms branch + per-tab system prompt
- `.planning/STATE.md` — Cancel-occurrence correctness constraint, gate atomicity constraint, no-local-dev-server constraint, two-exposure rule

### Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing; zero new deps
- Schema (tables): HIGH — verified columns, types, enums from direct read
- Transaction support: HIGH — create-get-db.ts confirms neon-serverless Pool for Neon URLs; worker already uses db.transaction
- Gate pattern: HIGH — verified both files (approve-proposal, propose-action) current state + addition required
- Live-refresh: HIGH — verified forms pattern ships; schedule route needs same wiring
- passDebits negative refund: HIGH — schema comment explicitly allows it; amount is INTEGER not UNSIGNED
- passId null risk: HIGH — demo booking flow does naive INSERT with no passId; seeded bookings have null passId

**Research date:** 2026-06-18
**Valid until:** 2026-07-31 (stable codebase; no upstream merges expected in this window)
