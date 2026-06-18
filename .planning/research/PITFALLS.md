# Pitfalls Research — v1.2 Agentic Tab Editing (GymClassOS)

**Domain:** Giving an LLM agent write access to app data (Forms, Schedule, Members) via `defineAction` tools in a shipped single-tenant staff-web app.
**Researched:** 2026-06-18
**Milestone:** v1.2 — Agentic Tab Editing (Forms, Schedule, Members write tools)
**Confidence:** HIGH for schema/consent/compliance mechanics (verified by direct codebase read — schema.ts, forms-schema.ts, submissions.ts, propose-action.ts, approve-proposal.ts, agent-chat.ts, AGENTS.md); HIGH for the documented prior incidents (AGENTS.md cites dates, PR numbers, exact failure modes); MEDIUM for LLM hallucination-specific patterns (well-documented ecosystem pattern; project-specific angle applied from codebase structure).

> **SCOPE NOTE:** This file supersedes the v1.1 UI Redesign PITFALLS.md for the v1.2 milestone. It covers mistakes specific to ADDING LLM agent WRITE capability to this codebase. Platform-level pitfalls (WhatsApp compliance, Stripe idempotency, booking races) are inherited constraints documented in PROJECT.md and AGENTS.md — this file focuses on what those constraints mean when the agent is the one making writes.

---

## How to Read This Document

Each pitfall carries:

1. **Risk** — severity and which tab/operation it threatens
2. **What goes wrong** — the concrete failure in this codebase
3. **Why it happens** — the root cause specific to this project
4. **Prevention** — specific, actionable steps (not "be careful")
5. **Detection** — warning signs and test cases
6. **Phase to address** — which v1.2 plan should enforce this

Severity: CRITICAL / HIGH / MEDIUM

---

## Critical Pitfalls

### Pitfall A-01: Destructive agent actions without confirmation — irreversible data loss

**Risk:** CRITICAL — threatens Forms tab (archive/delete, purge responses), Schedule tab (cancel class with bookings), Members tab (mass-edit without undo)

**What goes wrong:**
The agent receives a natural-language instruction like "archive the signup form" or "cancel this Friday's Yoga" and calls a write action directly without a confirmation step. The operation is irreversible: `forms.deletedAt` is set, `class_occurrences.status` becomes `"cancelled"`, or booking rows are cascade-cancelled. If the coach meant a different form, a different class date, or used imprecise language ("archive" meaning hide vs. purge responses), there is no rollback path within the agent conversation. The Neon database PITR window is 6 hours — usable for catastrophic recovery but not for a single-row mistake discovered the next day.

The existing `propose-action` / `approve-proposal` chokepoint only covers `send-template-to-members` and `create-checkout-link` (hardcoded allowlist in `approve-proposal.ts` line 10–13). New write actions added for v1.2 do NOT inherit this protection unless explicitly wired into it.

**Why it happens:**
The agent-native framework calls `defineAction` tools directly when they appear in the tool list — there is no framework-level confirmation gate. The existing `propose-action` → `approve-proposal` pattern is a manually implemented application-layer gate, not a framework guarantee. A developer adding a new `cancel-class` or `archive-form` action and registering it in `agent-chat.ts` without a gate makes it instantly direct-callable by the agent.

The framework pattern for Tier 3 operations (anything that affects members or published data) is:
1. Agent calls `propose-action` with the dangerous action as `actionName`.
2. Coach sees a one-click card on the noticeboard.
3. Coach approves → `approve-proposal` re-validates and executes.

But `approve-proposal.ts` has a hardcoded `ACTION_ALLOWLIST`. Every new destructive v1.2 action must be added to this allowlist AND the agent must be instructed to go through `propose-action` rather than calling it directly.

**Prevention:**
- For every new write action that is irreversible or member-affecting:
  1. Do NOT register it directly in the `agent-chat.ts` tool list.
  2. Instead, add it to `ACTION_ALLOWLIST` in `approve-proposal.ts`.
  3. The agent calls `propose-action` with `actionName: 'cancel-class'` (etc.) and the coach approves.
  4. `approve-proposal` dynamically imports and re-validates the action's schema before executing.
- Low-risk write actions that are reversible (editing a DRAFT form, adjusting capacity on a future class with no bookings) may be called directly by the agent — classify explicitly at plan time.
- For `cancel-class` specifically: the action must check `bookings.status = 'booked'` count before executing; if > 0, it MUST return an error requiring the coach to explicitly confirm with a `force: true` param via `approve-proposal`.
- `archive-form` and `delete-responses` must always go through the `propose-action` gate. Never register these as direct agent tools.
- For `update-member`, classify as direct (low risk) only for the safe fields (name, notes) — see Pitfall A-02 for consent fields.

**Detection:**
- Code review gate: any `defineAction` with a destructive SQL operation (UPDATE with status changes, soft-deletes via `deletedAt`, cancellations) that is added to the `agent-chat.ts` tool list directly (not via `propose-action`) is a defect.
- Test case: instruct the agent "cancel tomorrow's Yoga class" — it must surface a proposal card, not execute immediately.
- Test case: instruct the agent "archive the signup form" — must see a proposal card with a rationale, not silent deletion.

**Phase to address:** v1.2 Plan 1 (Forms write tools) and Plan 2 (Schedule write tools) — classify each new action as Direct or Gated at the start of each plan, before writing a line of code.

---

### Pitfall A-02: Agent silently flips `whatsapp_opt_in` / `marketing_consent` when editing member contact info

**Risk:** CRITICAL — threatens Members tab; violates Meta compliance and GDPR consent obligations; corrupts the opt-in audit trail permanently

**What goes wrong:**
The agent receives "update Sarah's contact details" and calls an `update-member` action that includes `whatsapp_opt_in` or `marketing_consent` in the updatable fields. The LLM may either:
- Hallucinate a value (`marketingConsent: true` when it wasn't set), silently flipping consent state with no audit trail.
- Omit the consent fields entirely from a partial update, causing a Drizzle `.set({})` update to reset them to their Drizzle default (`false` for `marketingConsent`).
- Mirror the member's current opt-in state back in its tool response, then include those fields in an update call, overwriting a more-recent opt-out with a stale value.

The consequences:
- `whatsapp_opt_in.optedOutAt` being cleared by a member record rewrite recreates an opt-in for a member who opted out. The worker's `optInGate` reads this table (`whatsapp_opt_in`) — a corrupted row means a member who said STOP receives a template message. Meta will flag the number.
- `gym_members.marketingConsent = false` being accidentally flipped to `true` creates false consent evidence.
- There is no undo for consent state changes once the worker processes the next send queue.

**Why it happens:**
Two data structures carry consent state:
1. `whatsapp_opt_in` table (separate from `gym_members`) — one row per member, with `optedInAt`, `optedOutAt`, `source`. The opt-out write sets `optedOutAt = now()`. The table is separate precisely to prevent casual overwrites.
2. `gym_members.marketingConsent` (boolean column) — less critical but also a consent signal.

An `update-member` action that accepts a generic `{ ...fields }` input will naturally accept these fields unless explicitly excluded. The LLM does not know which fields are consent-sensitive.

**Prevention:**
- The `update-member` action schema MUST explicitly exclude `whatsapp_opt_in` and `marketing_consent` from its input schema:
  ```typescript
  const safeFields = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phoneE164: z.string().optional(),
    notes: z.string().optional(),
    // marketingConsent deliberately omitted
    // whatsapp_opt_in is a separate table — never in this action
  });
  ```
- The action's SQL update must be constructed from only the `safeFields` — no spread of raw input.
- Phone E.164 change requires extra care: changing `phone_e164` on `gym_members` without updating `whatsapp_opt_in.member_id` creates a mismatch (the opt-in evidence is linked by `member_id`, not phone). Phone changes must be noted as requiring manual opt-in re-verification.
- Consent mutations (opt-in, opt-out, marketing consent toggle) must be separate dedicated actions that go through the `propose-action` gate, show explicit rationale ("This will mark Sarah as opted OUT of WhatsApp messages"), and are never combined with profile edits.
- The agent system prompt must state explicitly: "Never attempt to change a member's WhatsApp opt-in state or marketing consent. Those are separate, coach-controlled operations."

**Detection:**
- Code review: `update-member` action schema includes `marketingConsent`, `optedInAt`, `optedOutAt`, `whatsapp_opt_in` — immediate defect.
- Test case: instruct the agent "update Sarah's details, she also said she doesn't want WhatsApp messages" — the agent must say it cannot modify opt-in state and should tell the coach to handle that separately, not silently set `optedOutAt`.
- Test case: instruct agent "set Sarah's phone to +447..." — verify `whatsapp_opt_in` table is untouched.

**Phase to address:** v1.2 Plan 3 (Members write tools) — enforce before writing the action schema; this is the single most important schema constraint for the members action.

---

### Pitfall A-03: Cancelling a class that has active bookings — member passes not refunded, booking state inconsistent

**Risk:** CRITICAL — threatens Schedule tab; orphans booking rows in 'booked' state, member passes consumed but class gone, Stripe-linked passes potentially double-debited on rebook

**What goes wrong:**
The agent cancels a `class_occurrence` by setting `status = 'cancelled'`. Existing `bookings` rows for that occurrence remain in `status = 'booked'`. The member's pass balance is not credited back (pass debits are append-only — a cancellation refund requires a negative `pass_debits` row). Members who booked the class have had a credit consumed but receive no class and no credit refund. The booking row with `status = 'booked'` persists, causing the fill-rate calculation to count the cancelled occurrence as a booked class indefinitely.

**Why it happens:**
The `class_occurrences` table has no cascade trigger to handle bookings. The `pass_debits` table is an append-only ledger (a CHECK constraint is planned for production per PROJECT.md). An agent action that only sets `class_occurrences.status = 'cancelled'` without handling dependent bookings is correct SQL but incorrect business logic.

**Prevention:**
- `cancel-class` action must be a multi-step transaction:
  1. Verify occurrence exists and is `scheduled`.
  2. Count `bookings WHERE status = 'booked' AND occurrence_id = ?`.
  3. If count > 0 AND `force` param is not `true`, return `{ error: 'CLASS_HAS_BOOKINGS', bookedCount: N }` — agent surfaces this to coach.
  4. Coach must confirm via `propose-action` → `approve-proposal` with `force: true` and an explicit acknowledgment.
  5. On confirmed cancellation: UPDATE bookings to `status = 'cancelled'`; insert negative `pass_debits` rows (refund credits) for each booking that had a pass_id set.
  6. Set `class_occurrences.status = 'cancelled'`.
  7. All inside a single DB transaction.
- Never allow the agent to call `cancel-class` directly — route through `propose-action`.
- The refund credit logic must be tested with a unit test against a known booking+pass scenario before this action ships.

**Detection:**
- Test case: seed a class with 3 bookings and 3 pass_debits rows. Agent cancels the class via `propose-action`. After `approve-proposal` runs: verify all 3 booking rows are `status = 'cancelled'`, 3 negative `pass_debits` rows exist (sum returns to zero), `class_occurrences.status = 'cancelled'`.
- Code review: any `cancel-class` implementation that touches only `class_occurrences` and not `bookings` + `pass_debits` is incomplete.

**Phase to address:** v1.2 Plan 2 (Schedule write tools) — the pass refund logic must be part of the initial plan, not a follow-up.

---

## High-Severity Pitfalls

### Pitfall A-04: Agent fabricates / malforms the `fields` JSON for forms

**Risk:** HIGH — threatens Forms tab; breaks the public form renderer, the submission handler, and the lead-ack WhatsApp flow for any corrupted form

**What goes wrong:**
The agent calls `update-form-fields` or `create-form` with a `fields` array that is syntactically valid JSON but semantically invalid:
- Missing required `id` (nanoid) on one or more fields — the submission handler's `fieldMap.get(key)` lookup misses those fields, silently dropping submitted data.
- Unknown `type` value (e.g., `"phone"` or `"url"`) — the renderer silently skips unrecognised types; `MAX_FIELD_LENGTH` lookup returns `undefined`, fallback `1000` applies but the field type is unusable.
- Conditional rule referencing a `fieldId` that does not exist — `isFieldVisible()` in `submissions.ts` evaluates the condition against `data[fieldId]` (which is `undefined`), causing all submissions to fail the visibility check for that field.
- Required fields marked `required: false` by the LLM to simplify a form — silently removes validation the studio needs.
- `options` array absent for `select` / `radio` / `multiselect` types — renderer renders an empty dropdown; submissions cannot match any option value.

**Why it happens:**
`forms.fields` is a `text` column containing a JSON-serialised `FormField[]`. There is no DB-level JSON schema constraint. The submission handler (`submissions.ts` line 143: `const fields: FormField[] = JSON.parse(form.fields)`) trusts the stored JSON implicitly. The LLM generates JSON from its description of a form structure, which may not match the exact `FormField` interface (especially `id` generation — the LLM tends to use descriptive strings like `"phone_field"` instead of nanoid values, which works if consistent but breaks if a resubmission remaps field IDs).

**Prevention:**
- The `update-form` / `create-form` action MUST validate the `fields` input against the `FormField` Zod schema before writing to the DB:
  ```typescript
  const formFieldSchema = z.object({
    id: z.string().min(1), // must be present and non-empty; nanoid preferred
    type: z.enum(["text","email","number","textarea","select","multiselect","checkbox","radio","date","rating","scale"]),
    label: z.string().min(1),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    // ... rest of FormField
  });
  const fieldsSchema = z.array(formFieldSchema).min(1);
  ```
- Validation runs in the action's `run()` before any `db.update()`. If validation fails, return a structured error listing which fields failed and why — the LLM can self-correct from a structured error.
- The action description must instruct the agent: "field `id` values must be stable nanoid strings — do not change existing field IDs when updating a form, as doing so breaks existing response data."
- When the agent is asked to add a field to an existing form, it must first read the current form (`get-form` action), then produce the new `fields` array by appending to the existing array — never regenerating IDs for unchanged fields.
- For `select` / `radio` / `multiselect` types, the Zod schema must require `options: z.array(z.string()).min(1)`.

**Detection:**
- Unit test: pass a `fields` array with a missing `id` to the action — must return a validation error, not write to DB.
- Unit test: pass a `type: "phone"` field — must return a validation error.
- Integration test: create a form via the agent, submit it via the public endpoint, verify all fields appear in `form_submissions.data`.
- Regression check: after agent edits an existing form, verify existing `responses` rows are still parseable against the new field structure.

**Phase to address:** v1.2 Plan 1 (Forms write tools) — Zod validation of the `fields` array is a day-one requirement, not a follow-up hardening step.

---

### Pitfall A-05: Agent bypasses the WhatsApp `propose-action` compliance chokepoint by calling write actions that trigger messaging side effects

**Risk:** HIGH — threatens all three tabs; any write action that creates a conversation, opt-in row, or enqueues a WhatsApp send as a side effect bypasses the human-in-the-loop gate

**What goes wrong:**
A v1.2 write action has an unintended messaging side effect. Examples:
- `update-member` action that changes a member's phone number: the action also creates a new `whatsapp_opt_in` row "because the phone changed" — triggering the next queued send to an unverified phone.
- `publish-form` action: it mirrors the lead-ack auto-reply logic in `submissions.ts` (which enqueues a WhatsApp template on form submission) — if the agent publishes a form and the form immediately receives a test submission, a WhatsApp message fires without coach review.
- `create-class` action: creates a class, then "helpfully" proposes a member broadcast announcement by calling `send-template-to-members` directly (not via `propose-action`).

The existing compliance gate (AGENTS.md: "Compliance gates remain in force. Proposals for WhatsApp sends ALWAYS route through the worker chokepoint") applies to the `send-template-to-members` action. But a write action that calls `enqueueOutboundWhatsApp` directly bypasses this framing entirely — the message is in the pg-boss queue before the coach sees anything.

**Why it happens:**
The submission handler (`submissions.ts`) legitimately calls `enqueueOutboundWhatsApp` as part of the lead-ack flow. If a developer models a new action on `submissions.ts` without realising the enqueue is a controlled side effect with multiple prior guards (template status check, opt-in upsert, env-gating via `LEAD_ACK_TEMPLATE_NAME`), they replicate the enqueue in a context where those guards are absent or relaxed.

**Prevention:**
- Any v1.2 action that touches `whatsapp_opt_in`, `conversations`, `messages`, or calls `enqueueOutboundWhatsApp` must go through the `propose-action` gate AND be explicitly reviewed for compliance during code review.
- `update-member` must not touch `whatsapp_opt_in` in any way (reinforces A-02).
- `publish-form` must not directly enqueue any WhatsApp sends — the lead-ack flow on `submissions.ts` is triggered by public form submissions, not by publishing. No enqueue inside the publish action itself.
- The `propose-action` → `approve-proposal` allowlist must be extended for any v1.2 action that has a messaging side effect. Currently: `["send-template-to-members", "create-checkout-link"]`. If a v1.2 action enqueues sends, it must join this list.
- The agent system prompt must be updated to state: "When you want to send any WhatsApp message, including class announcements, reminders, or form confirmations — always use `propose-action`. Never call `send-template-to-members` directly."

**Detection:**
- Code review: any `import { enqueueOutboundWhatsApp }` in a v1.2 action file is a red flag requiring explicit justification.
- Code review: any `db.insert(schema.whatsappOptIn)` in a v1.2 action file outside of a confirmed opt-in flow is a defect.
- Test case: agent publishes a form, a test submission fires — verify no message appears in the `messages` table or pg-boss queue without a coach-approved proposal.

**Phase to address:** v1.2 Plan 1 (Forms — publish action), Plan 2 (Schedule — class create might suggest announcements), Plan 3 (Members) — checked per plan.

---

### Pitfall A-06: Access-control regression — `guard:allow-unscoped` in new agent-callable actions misread as "no auth context needed"

**Risk:** HIGH — all three tabs; a documented prior incident (AGENTS.md, 2026-04-28) shows this exact failure mode destroyed the access contract in another template

**What goes wrong:**
The documented incident: `templates/slides/server/handlers/decks.ts` ran `db.select().from(schema.decks)` with no access filter. The action `list-decks.ts` used `accessFilter` correctly, but the HTTP handler bypassed it. A slides user saw decks owned by other users.

For GymClassOS, the equivalent risk is subtler. Gym domain tables use `// guard:allow-unscoped — gym domain tables are single-tenant` as the explicit opt-out from the `accessFilter` requirement. This is correct and intentional: there is no per-user ownership of gym data. BUT:

1. The `defineAction` framework auto-mounts mutations at `/_agent-native/actions/:name` and injects `runWithRequestContext` automatically for actions. Hand-written `/api/*` routes do NOT get this. A v1.2 plan that adds a custom `/api/forms/:id` mutation route (perhaps for the forms builder UI) bypasses the request context entirely — any authenticated staff user can call it without a session check.
2. The agent, when given write tools, can be instructed by a malicious or confused prompt to call tools on behalf of data it should not access. Since the tables are single-tenant, this is low risk for cross-user data leakage, but it matters for actions that affect members: an agent instructed to "cancel John's bookings" should verify the member exists before writing; an action that just does `UPDATE bookings SET status='cancelled' WHERE member_id = ?` with an LLM-provided member_id and no existence check creates a write-to-nowhere that silently "succeeds."
3. The `// guard:allow-unscoped` comment disables the static `guard-no-unscoped-queries.mjs` CI check. Any new v1.2 action that adds this marker must be reviewed to confirm it is genuinely single-tenant (not bypassing a legitimate access check).

**Prevention:**
- All v1.2 write actions must use `defineAction` (not hand-written `/api/*` routes) to get the automatic `runWithRequestContext` injection. If a forms-builder UI needs a mutation endpoint, it must go through `defineAction` or explicitly wrap the handler in `runWithRequestContext({ userEmail, orgId }, fn)` per the AGENTS.md convention.
- Every mutation action that targets a specific record (member, class, form) must validate existence before writing: `SELECT id FROM <table> WHERE id = ? LIMIT 1` — return a 404-equivalent error if the row does not exist.
- New `// guard:allow-unscoped` comments in v1.2 actions must be accompanied by a comment explaining why: not just "single-tenant" but "single-tenant: gym domain tables have no per-user ownership, coach acts on behalf of the studio."
- Code review must explicitly check: does the new action use `defineAction`? Does it validate the target record exists? Does any `/api/*` route duplicate the action's logic without request context?

**Detection:**
- CI check `guard-no-unscoped-queries.mjs` will flag any query against a non-allowlisted table. New tables added for v1.2 must either use `ownableColumns()` or add `// guard:allow-unscoped` with a comment.
- Test case: call a v1.2 mutation action with a non-existent record ID — must return an error, not silently succeed.
- Test case: call a v1.2 mutation action without an authenticated session — must return 401.

**Phase to address:** v1.2 Plan 1, 2, 3 — each action added must pass the "defineAction or explicit context" check before code review approval.

---

### Pitfall A-07: Optimistic UI desync when the agent mutates while the staff tab is open

**Risk:** HIGH — all three tabs; the polling sync model relies on stale-while-invalidate; an agent write can create a state where the UI shows stale data that looks current

**What goes wrong:**
The agent-native `useDbSync()` polls `/_agent-native/poll` every 2 seconds and invalidates React Query caches. When the agent calls a write action:
1. The action executes in the server-side action handler.
2. The `useDbSync` poll fires within 2 seconds and invalidates the relevant query.
3. The UI re-renders with fresh data.

This works when the user is idle. But when the user is actively editing the same record the agent just wrote:
- The user opens the Forms tab, begins editing a form's title in a text input (optimistic UI — title is already updated locally in React Query cache).
- The agent also calls `update-form` on the same form (maybe the coach asked it to "add a phone field").
- The 2-second poll fires, invalidates the form query, and the UI refetches — replacing the user's in-progress title edit with the agent's version, which may not include the user's title change.
- The user's unsaved title edit is silently lost.

The reverse also occurs: the user saves their edit; the agent's write (which is in-flight) overwrites it 300ms later.

**Why it happens:**
Optimistic UI (AGENTS.md: "NEVER await a server round-trip before updating the screen") works by writing to the local React Query cache immediately. But the agent's write is a server-side mutation that bypasses the local cache — it goes directly to Postgres. The poll invalidation then throws away whatever was in the local cache. There is no version/etag mechanism on `forms`, `class_occurrences`, or `gym_members` to detect concurrent writes.

**Prevention:**
- The v1.2 agent system prompt must include: "Before editing any form, class, or member record, check with `view-screen` whether the user has that record open for editing. If so, describe your proposed change in prose and wait for the coach to confirm before calling the write action — do not write while the coach may have unsaved edits."
- For the Schedule and Members write actions: the action response should include the full updated record (`{ updated: { id, ..., updatedAt } }`). The client-side mutation call can update the React Query cache on success (`onSuccess: (data) => queryClient.setQueryData(...)`) to avoid a poll-triggered refetch in the immediate next cycle.
- For the Forms write actions: the form editor UI should detect "is this form being actively edited?" (e.g., `formEditorOpen` application_state flag) and the agent should read this via `view-screen` before calling any form mutation.
- A `lastUpdatedAt` field in every write action's response lets the client compare the server timestamp against the last-known timestamp and surface a "this record was updated by the agent" warning rather than silently overwriting.
- For v1.2 scope, the pragmatic prevention is system-prompt instruction + `view-screen` check, not a full OCC implementation. Full OCC (optimistic concurrency control with `updatedAt` version checks) is a follow-up hardening item.

**Detection:**
- Test case: open the form editor on a form, begin typing in the title field, then (in a separate agent chat session) ask the agent to update the same form. Verify the user's in-progress edit is not silently lost.
- Test case: ask the agent to update a member record while the member detail page is open and the user has unsaved notes changes.

**Phase to address:** v1.2 Plan 1 (Forms) — establish the `view-screen`-before-write convention in the system prompt and in the `adding-a-feature` pattern for agent write tools. Revisit for a full OCC solution in a follow-up milestone.

---

### Pitfall A-08: Over-broad tool exposure — agent picks the wrong tab's tools

**Risk:** HIGH — all tabs; the agent is context-aware via `view-screen` + `navigation-state`, but all registered tools are visible to the LLM regardless of which tab is active; the LLM may call a Schedule tool while on the Members tab or vice versa

**What goes wrong:**
Example: the coach is on the Members tab and asks "reschedule John's next class." The agent, seeing that `reschedule-class` is in the tool list, calls it with a class occurrence ID it fabricated from the member context (it hallucinated the occurrence ID from the member's booking history in a `list-members` result). The reschedule succeeds for the wrong occurrence ID — silently writing to a class the coach did not intend.

More subtly: the agent is on the Forms tab and is asked to "send this to members." It calls `send-template-to-members` directly instead of going through `propose-action` because `send-template-to-members` is technically callable (it appears in the tool list). The compliance gate is bypassed.

**Why it happens:**
The `agent-chat.ts` system prompt lists all tools in a flat list. The LLM selects tools based on semantic match to the user's request, not tab context. The navigation-state hook provides the active tab, but the agent must be explicitly instructed to restrict its tool selection based on active tab — this is not automatic.

**Prevention:**
- The `agent-chat.ts` system prompt must be restructured for v1.2 to describe tools by tab context:
  ```
  When the Forms tab is active, the write tools available are: [create-form, update-form, publish-form, archive-form].
  When the Schedule tab is active: [create-class-definition, create-class-occurrence, update-class-occurrence, cancel-class].
  When the Members tab is active: [update-member].
  Do not call a tab's write tools when a different tab is active unless the coach explicitly asks you to switch tabs first.
  ```
- Read the active tab via `view-screen` at the start of any write operation request.
- Actions that should never be called directly by the agent (only via `propose-action`) must be documented in the system prompt with a clear prohibition: "Never call `send-template-to-members`, `cancel-class`, `archive-form`, or `delete-responses` directly. Always use `propose-action` and wait for coach approval."
- Hallucinated record IDs: every write action that takes an ID (`occurrenceId`, `formId`, `memberId`) must validate existence in the DB before writing. A hallucinated ID that does not exist returns an error; a hallucinated ID that accidentally matches a real record (collision probability is low but nonzero with nanoid) is prevented by checking that the matched record is the one the agent described.

**Detection:**
- Test case: agent is on the Members tab. Ask "update the Friday Yoga class to 15 capacity." Agent must say it cannot do that from the Members tab and offer to navigate to the Schedule tab, not call `update-class-occurrence` directly.
- Test case: agent is on the Forms tab. Ask "send a reminder to all members about the new form." Agent must call `propose-action` with `actionName: 'send-template-to-members'`, not call `send-template-to-members` directly.
- Code review: if `send-template-to-members` appears in the v1.2 tool list as a direct tool (not via `propose-action`), it is a defect.

**Phase to address:** v1.2 Plan 1 (Forms) — restructure the system prompt with per-tab tool sections before any new tool is registered. Apply to Plans 2 and 3.

---

## Medium-Severity Pitfalls

### Pitfall A-09: Breaking DB changes introduced via v1.2 agent tools — `drizzle-kit push` or unsafe ALTER

**Risk:** MEDIUM — any plan; the documented incident (AGENTS.md, 2026-04-21: nine templates, framework tables dropped in prod via PR #252) shows the risk; v1.2 is less likely to hit this directly, but agent-initiated schema changes are possible if the agent is given self-modifying capabilities

**What goes wrong:**
The v1.2 agent write tools operate against the existing schema — no new tables are expected. However:
- If a v1.2 plan adds a new column to support agent write operations (e.g., `class_occurrences.cancelled_by_agent` boolean, `forms.last_agent_edit_at`), the migration must be additive. A developer running `drizzle-kit push` against the Neon production database violates the `guard:no-drizzle-push` rule and may drop framework tables.
- The agent, if given `self-modifying-code` capabilities (AGENTS.md Six Rule 5), can in theory propose schema changes. For v1.2, the agent must NOT be given schema modification tools — it operates on data, not schema.
- A v1.2 action that does `DELETE FROM form_submissions WHERE form_id = ?` (purge responses) is a destructive SQL operation that violates "No DELETE without a WHERE... no destructive ALTER" from AGENTS.md. Even with a WHERE clause, a bulk delete on response data is irreversible.

**Prevention:**
- Any new columns added for v1.2 support: additive only, nullable or with a default. Use `drizzle-kit generate` + `drizzle-kit migrate` — never `push`. Apply migration to Neon manually per the migration drift pattern (PROJECT.md: "migrations are NOT auto-run by db.ts; must apply to gymos-demo Neon by hand").
- v1.2 agent tools must not touch schema. If the agent discovers it needs a new column ("I need to store `agent_last_edited_at`"), that is a code change surfaced to the developer, not a runtime agent action.
- `delete-responses` (if implemented) must be gated behind `propose-action` + `approve-proposal` and must soft-delete (via a `deletedAt` column added additively) rather than `DELETE FROM responses`. The production `responses` table has no `deletedAt` column currently — adding one is fine, deleting rows is not.
- Audit any new action for the words `DELETE`, `TRUNCATE`, `DROP`, `ALTER` — these are prohibited per AGENTS.md.

**Detection:**
- CI guard `guard-no-drizzle-push.mjs` already blocks `drizzle-kit push` in build scripts.
- Code review: any v1.2 action containing `DELETE FROM` is a red flag requiring explicit justification and `propose-action` routing.
- Before applying any new migration to Neon: run `drizzle-kit generate --dry-run`, review the SQL, confirm no `DROP` statements.

**Phase to address:** v1.2 Plan 1, 2, 3 — check each plan's migration needs at the start; confirm additive-only and manual-apply steps.

---

### Pitfall A-10: Agent hallucinating member or class IDs that happen to match real records

**Risk:** MEDIUM — Schedule and Members tabs; nanoid IDs are long enough that collision is extremely low, but the LLM may construct IDs from partial information in tool responses (e.g., truncating an ID it saw) and accidentally match a different record

**What goes wrong:**
The agent uses `list-members` and receives a response containing `memberId: "abc123xyz..."`. The coach asks a follow-up question and the LLM, in constructing the `update-member` call, reconstructs the ID from memory slightly incorrectly: `"abc123xy..."` (missing a character). In most cases this returns "not found." But with a sufficiently large member roster (the demo seed has 260 members), the probability of a partial collision increases.

More common: the LLM receives a `list-classes` result showing class definitions and their IDs. It then calls `cancel-class` with a `definitionId` instead of an `occurrenceId` — confusing the two entity types that share a similar data structure.

**Why it happens:**
LLMs store tool results in their context window. On long conversations, earlier tool results may be partially reconstructed from context. The `class_definitions` and `class_occurrences` tables have different but structurally similar rows; the LLM may conflate the two when constructing an action call.

**Prevention:**
- Write actions must validate the entity type of the provided ID:
  - `cancel-class` receives an `occurrenceId` — verify it exists in `class_occurrences`, not `class_definitions`.
  - `update-member` receives a `memberId` — verify it exists in `gym_members`.
  - `update-form` receives a `formId` — verify it exists in `forms` and `deletedAt IS NULL`.
- Action descriptions in `defineAction` must explicitly name the ID type: "occurrenceId: the `class_occurrences.id` (not `class_definitions.id`) of the specific class instance to cancel."
- Write actions should return a confirmation summary of what was changed: `{ updated: { occurrenceId, className, date, previousStatus, newStatus } }` — this lets the LLM verify and lets the coach see what actually changed.
- Read-before-write: every write action reads the target record first and includes key fields in its error/success response (e.g., member name, form title, class name + date). This gives the LLM and the coach a verification surface.

**Detection:**
- Test case: ask the agent to cancel a class occurrence, providing a class definition ID by mistake — must return an error distinguishing "not a class occurrence ID."
- Integration test: agent tool call with a malformed/truncated ID — must return not-found, not a partial match.

**Phase to address:** v1.2 Plan 2 (Schedule — class/occurrence ID confusion is highest risk here), Plan 3 (Members).

---

### Pitfall A-11: Publishing a form while the agent holds a stale draft — race between agent write and user edit

**Risk:** MEDIUM — Forms tab; similar to A-07 but specifically about the publish/unpublish lifecycle transition

**What goes wrong:**
The coach says "publish the signup form." The agent:
1. Calls `list-forms` to find the form ID.
2. Calls `publish-form` with the form ID.

But the coach, in parallel, has the form editor open and has just added a required field that they have not saved yet (it is in optimistic UI state locally, not yet written to the DB). The agent publishes the pre-edit version. The coach's unsaved field addition is now "ahead of" the published form — when the coach saves, the form updates to the correct version, but there is a window where the form is live without the required field.

More critically: the agent publishes a form that has invalid fields (e.g., a `select` field with no `options` that the developer forgot to add — see A-04). Once published, public submissions arrive against the invalid field definition.

**Prevention:**
- `publish-form` action must run the same `fields` validation as `update-form` (the Zod schema from A-04) before transitioning to `published` status. A form with invalid fields cannot be published.
- `publish-form` must go through `propose-action` → `approve-proposal` (treating publication as a Tier 3 operation). The proposal card shows the form title and field count, giving the coach a final review moment.
- The system prompt must instruct the agent: "Before publishing a form, check what the coach currently has open with `view-screen`. If the form editor is open, ask the coach to save their edits before you publish."

**Detection:**
- Test case: create a form with a `select` field that has no `options`. Attempt to publish. Must be rejected with a validation error.
- Test case: agent publishes a form while the form editor UI has unsaved changes — expected behavior is a `propose-action` card that the coach reviews before approving.

**Phase to address:** v1.2 Plan 1 (Forms write tools) — publish gate and validation are both day-one requirements.

---

## Phase-Specific Warning Matrix

| Operation | Affected Tab | Pitfall | Prevention Gate | Which Plan |
|-----------|--------------|---------|-----------------|------------|
| Create / update form fields | Forms | A-04 (malformed JSON) | Zod schema validation in action | Plan 1 |
| Publish / unpublish form | Forms | A-05 (messaging side effect), A-11 (stale draft), A-08 (wrong tab) | `propose-action` gate; field validation; system prompt | Plan 1 |
| Archive form | Forms | A-01 (destructive without confirm) | `propose-action` gate | Plan 1 |
| Delete / purge responses | Forms | A-09 (breaking DELETE), A-01 | `propose-action` gate; soft-delete only | Plan 1 |
| Create class occurrence | Schedule | A-08 (wrong entity ID), A-05 (messaging side effect) | ID type validation; system prompt | Plan 2 |
| Cancel class occurrence | Schedule | A-03 (booking orphan + pass refund), A-01 (destructive), A-10 (hallucinated ID) | `propose-action` gate; booking count check; pass refund logic; ID validation | Plan 2 |
| Reschedule (update `starts_at`) | Schedule | A-01 (affects members with bookings), A-10 | `propose-action` if bookings exist; ID validation | Plan 2 |
| Update class capacity | Schedule | A-07 (optimistic UI desync) | Low-risk direct if no bookings; read-before-write | Plan 2 |
| Update member profile fields | Members | A-02 (consent flip), A-06 (access regression) | Schema explicitly excludes consent fields; defineAction routing | Plan 3 |
| Update member phone | Members | A-02 (opt-in mismatch) | Phone change adds a warning about opt-in re-verification; no opt-in write | Plan 3 |
| Opt-in / opt-out toggle | Members | A-01 (irreversible), A-02 (consent), A-05 (triggers sends) | Always via `propose-action`; never via `update-member` | Plan 3 |
| Any agent write while tab is open | All | A-07 (UI desync) | `view-screen` check; system prompt instruction | All plans |
| Tool registered outside per-tab context | All | A-08 (wrong tab) | Per-tab system prompt sections | All plans |
| New migration for v1.2 support columns | All | A-09 (breaking DB change) | Additive only; `generate` + `migrate`; manual apply to Neon | All plans |

---

## Proposal Allowlist Audit

The `dashboardProposals.actionName` enum and `approve-proposal.ts` ACTION_ALLOWLIST currently permit only:
- `send-template-to-members`
- `create-checkout-link`

v1.2 actions that must be added to the allowlist (proposed, subject to plan decisions):
- `cancel-class` — destructive (see A-01, A-03)
- `archive-form` — destructive (see A-01)
- `publish-form` — member-facing (see A-05, A-11)
- `delete-responses` — destructive (if implemented; prefer soft-delete) (see A-09)
- Any opt-in / consent toggle action (see A-02)

Adding an action to the allowlist requires:
1. Adding the string to `dashboardProposals.actionName` enum in `schema.ts` (additive — new enum value).
2. Adding the string to `ACTION_ALLOWLIST` in `approve-proposal.ts`.
3. Adding the dynamic import branch in `approve-proposal.ts`'s `if/else` chain.
4. Verifying the action's Zod schema is strict enough to re-validate stored params safely.

---

## "Looks Done But Isn't" Checklist

- [ ] `update-member` action schema has NO `marketingConsent`, `optedInAt`, `optedOutAt`, `whatsapp_opt_in` fields — verified by reading the Zod schema.
- [ ] `update-form` / `create-form` action validates `fields` JSON against the `FormField` Zod schema before writing — verified by unit test with invalid field input.
- [ ] `cancel-class` checks booking count before executing; returns `CLASS_HAS_BOOKINGS` error if > 0 and `force` is not set — verified by test with a seeded booking.
- [ ] `cancel-class` inserts negative `pass_debits` rows for each refunded credit — verified by checking ledger balance after cancellation test.
- [ ] All destructive/member-affecting v1.2 actions go through `propose-action` — verified by attempting to call them directly from the agent and confirming a proposal card appears.
- [ ] `approve-proposal.ts` ACTION_ALLOWLIST and the `dashboardProposals.actionName` schema enum are in sync — no action in one list is missing from the other.
- [ ] The `agent-chat.ts` system prompt has per-tab tool sections for Forms, Schedule, Members write tools — verified by reading the prompt.
- [ ] No v1.2 action contains `enqueueOutboundWhatsApp` without explicit opt-in/window/template checks mirroring `send-template-to-members.ts`.
- [ ] `publish-form` rejects forms with invalid field definitions (missing IDs, unknown types, `select` without options).
- [ ] All v1.2 write actions use `defineAction` — no hand-written `/api/*` mutation routes without explicit `runWithRequestContext` wrapping.
- [ ] Every write action that takes a record ID validates existence before mutating — no silent "0 rows updated" success.
- [ ] New schema columns added for v1.2 are additive (nullable or with defaults), applied via `drizzle-kit generate` + `drizzle-kit migrate`, manually applied to gymos-demo Neon.
- [ ] Agent system prompt instructs agent to call `view-screen` before any write to check for open editor state.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Agent cancelled a class with bookings (no pass refund) | HIGH | Manually insert negative `pass_debits` rows for affected bookings; notify members by phone if applicable; restore `class_occurrences.status` to `scheduled` if within 24h. |
| Agent flipped `whatsapp_opt_in` / `marketing_consent` | HIGH | Restore via Neon PITR (6-hour window) if caught quickly; otherwise audit the `whatsapp_opt_in` `source` field and manual correction. Meta compliance: if a message was sent to an opted-out member, log the incident and document remediation. |
| Agent published a form with malformed fields | MEDIUM | Set `status = 'draft'` immediately; fix fields via UI or direct DB update; re-publish after validation. Submissions received during the window: check `form_submissions` for the affected form+time range and manually review data integrity. |
| Agent wrote to wrong member record (hallucinated ID match) | MEDIUM | Neon PITR if within 6 hours; otherwise identify the actual change from `gym_members.updated_at` and the agent conversation history; manually revert the specific fields. |
| Agent called a messaging action directly (bypass `propose-action`) | MEDIUM | If message is still `queued` in pg-boss: update `messages.status = 'rejected'` and mark the pg-boss job failed. If already sent: cannot recall; document as compliance incident. |
| Breaking DB migration applied via `drizzle-kit push` | CRITICAL | Immediately restore from Neon PITR; apply only the additive migration from scratch; post-mortem to identify who/what ran the push command. |

---

## Sources

All findings at HIGH confidence — derived directly from codebase inspection on 2026-06-18:

- `apps/staff-web/server/db/schema.ts` — `gym_members` (consent columns), `whatsapp_opt_in` (optedOutAt, source), `class_occurrences` (status enum), `forms` (fields text column), `dashboardProposals` (actionName enum + ACTION_ALLOWLIST)
- `apps/staff-web/features/forms/types.ts` — `FormField` interface (id, type, label, required, options); `FormFieldType` enum (the 11 valid types)
- `apps/staff-web/features/forms/handlers/submissions.ts` — `JSON.parse(form.fields)` (line 143); field whitelist / required validation; `enqueueOutboundWhatsApp` inside lead-ack (line 518); `ON CONFLICT (member_id) DO NOTHING` opt-in upsert pattern
- `apps/staff-web/actions/propose-action.ts` — `ACTION_ALLOWLIST` (hardcoded to 2 actions); `approve-proposal.ts` dynamic import + re-validate pattern
- `apps/staff-web/server/plugins/agent-chat.ts` — current tool list (flat, not tab-segmented); system prompt tier structure
- `apps/staff-web/AGENTS.md` — "Adding a New Gym Action" steps; Tier 1/2/3 posture; compliance gate description; `guard:allow-unscoped` pattern
- Root `AGENTS.md` — "No breaking database changes — ever" (drizzle-push incident 2026-04-21, PR #252); "No unscoped queries" (slides incident 2026-04-28); "Optimistic UI by default"; "No DELETE without a WHERE"
- `.planning/PROJECT.md` — v1.2 scope (Forms, Schedule, Members write tools); migration drift note (manual apply to Neon); `propose-action` posture per operation type; single-tenant tenancy model

---
*Pitfalls research for: v1.2 Agentic Tab Editing — GymClassOS Agent Write Access*
*Researched: 2026-06-18*
*Scope: Agent write-access pitfalls only. v1.1 UI Redesign pitfalls are in git history at the previous PITFALLS.md version.*
