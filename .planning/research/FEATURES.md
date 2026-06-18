# Feature Landscape: v1.2 Agentic Tab Editing

**Domain:** Agent write-access to GymClassOS staff-web tabs (Forms / Schedule / Members)
**Researched:** 2026-06-18
**Scope:** NEW agent-write features only. Existing staff CRUD via HTTP + builder UIs is already shipped.

---

## Summary

v1.2 closes the gap between "the agent can read" and "the agent can act." The agent-native principle is that everything the UI can do, the agent can do. For three tabs — Forms, Schedule, Members — the UI already has full CRUD. v1.2 wraps those same database mutations in `defineAction` agent tools, adds the right HITL posture per operation, and updates the system prompt so the agent leads with context-appropriate write tools when those tabs are in view.

The central question for each operation is: **how reversible is this, and does it affect members?** That single question drives everything: whether the agent acts directly, proposes for approval, or is blocked entirely. Edits that are invisible to members (draft form title, class capacity on a future class) are safe to act immediately. Edits that are visible to members or trigger downstream processes (publishing a form, cancelling a class) require the propose→approve posture. Edits that permanently destroy data or touch consent state are anti-features.

---

## Cross-Cutting HITL/Confirmation Model

The existing propose→approve machinery (`propose-action` → `dashboard_proposals` → coach one-click `approve-proposal`) is the correct HITL channel. The v1.2 classification for each operation:

| Posture | When to use | Existing precedent |
|---------|-------------|-------------------|
| **Act directly** | Edit is fully reversible, invisible to members, low-stakes (draft-only edits, capacity adjustments on future classes, profile field corrections) | `upsert-section-note`, `create-task` |
| **Propose + approve** | Edit is visible to members, semi-irreversible, or affects bookings/payments (publish a form, cancel a class, close/archive a published form) | `send-template-to-members`, `create-checkout-link` |
| **Blocked** | Destructive and irrecoverable (purge form + responses, hard-delete member, change consent flags) | N/A — not offered at all |

**Post-action feedback** (cross-cutting differentiator): after any write, the agent must narrate what changed and link to the entity. "I've updated 'Schedule Enquiry' — it's now published at `/f/schedule-enquiry`." The agent should not silently succeed.

**Optimistic UI constraint**: all mutations must trigger cache invalidation / loader revalidation so the tab reflects the agent's change without a manual refresh. The existing RR v7 loader pattern handles this if the action path is called correctly; for agent writes via `defineAction`, the UI must either poll via `useDbSync()` or the agent must call `navigate` to the edited entity's URL to force a loader re-run.

---

## Forms

### Context

The forms table has three statuses: `draft` → `published` → `closed` (or archived via `deletedAt`). A published form is live at `/f/<slug>` — embeddable on the studio website. Publishing is the key irreversibility threshold.

The existing UI actions cover: create (insert `status=draft`), archive (soft-delete via `deletedAt`), restore, publish-toggle (`status=draft|published`), purge (hard delete form + responses). The builder UI at `/gymos/forms/:id` handles field editing.

### Table Stakes — Forms Write Tools

These are the operations that make "agent can edit forms" feel complete. Without them the feature is a stub.

| Operation | Description | Reversibility | HITL posture | Complexity | Notes |
|-----------|-------------|---------------|--------------|------------|-------|
| **create-form** | Create a new draft form with title (and optional description) | Fully reversible (archive it) | Act directly | Low | Reuses existing `intent=create` logic. Agent names it, gets back `{ id }`. Agent should navigate to `/gymos/forms/<id>` so staff can see it. |
| **update-form-meta** | Edit title and/or description on any form | Fully reversible | Act directly | Low | Only allowed on drafts; if form is published, downgrade to propose+approve because the live form's identity changes. |
| **update-form-fields** | Replace the `fields` JSON array (add/remove/reorder fields) | Reversible on drafts | Act directly on draft; propose+approve on published | Medium | Published form with live responses: field changes break existing response data alignment. Agent must check `status` before deciding posture. Zod schema must validate the fields array structure. |
| **update-form-settings** | Edit `settings` JSON (thank-you message, redirect URL, close date) | Reversible on drafts | Act directly on draft | Low | Same draft-vs-published posture as fields. |
| **publish-form** | Set `status=published` (makes form live at `/f/<slug>`) | Semi-irreversible (responses start arriving) | **Propose + approve** | Low | Existing UI does this one-click; agent must gate it. Rationale in proposal: "Publishing 'Schedule Enquiry' — it will be live at `/f/schedule-enquiry`. Approve to confirm." |
| **unpublish-form** | Set `status=draft` (takes form offline, preserves responses) | Reversible | Act directly | Low | Staff may want to urgently pull a form; agent acting directly is acceptable. |
| **close-form** | Set `status=closed` (form visible but no longer accepts submissions) | Semi-reversible | Act directly | Low | Less impactful than publish — no new harm, existing responses preserved. |
| **archive-form** | Soft-delete a form (`deletedAt = now()`) | Reversible via restore | Act directly on drafts; propose+approve on published forms | Low | A published form with active responses being archived is meaningful. Draft archive is low stakes. |
| **restore-form** | Clear `deletedAt` on an archived form | Fully reversible | Act directly | Low | Restoring a closed/published form is safe — it was live before. |

### Differentiators — Forms

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| **Post-write link** | After publishing, agent says: "Done — form is live at `/f/schedule-enquiry`. Copy that link to share it." | Low | Pure narration in the agent response. |
| **Response-count awareness before archive** | Before archiving a published form, agent checks response count and warns: "This form has 14 responses — archiving hides it but keeps the responses. Confirm?" | Low | `list-form-responses` read tool (or inline in the write action) reads `COUNT(responses.formId)`. |
| **Field suggestion from context** | When staff says "create an enquiry form", agent proposes a sensible default fields array (name, phone, message) instead of an empty form. | Medium | Agent constructs the fields JSON from domain knowledge. Not a separate tool — just agent reasoning in the response. |
| **Draft-only field editing** | Agent explicitly refuses to edit fields on a published form without first unpublishing it, and explains why (response data alignment). | Low | Guard condition in `update-form-fields` action: check `status` before mutating. |

### Anti-Features — Forms

| Anti-Feature | Why blocked | What instead |
|---|---|---|
| **Purge form + responses** | Hard delete of response data is irrecoverable. A solo studio owner cannot accidentally recover from a purge. | Agent archives the form. Staff purges via the UI's AlertDialog (which requires deliberate confirmation click). |
| **Agent auto-publish without approval** | A published form goes live publicly and may receive real member data. Agent must always propose. | `propose-action` → `approve-proposal` flow. |
| **Edit slug** | Slug is the public URL identity. Changing it breaks any embed already on the studio website. | Not exposed as an agent parameter. If a staff member explicitly asks, agent explains the risk and declines. |
| **Modify form responses** | Responses are member-submitted data; mutating them is a data-integrity violation. | Read-only via a `list-form-responses` tool. |

---

## Schedule

### Context

Two tables: `class_definitions` (the catalog of class types — name, duration, default capacity, category, active) and `class_occurrences` (individual instances — starts_at, ends_at, capacity, status, notes, room). Status enum: `scheduled | cancelled | completed`. The existing schedule route is read-only from the agent's perspective; booking insertion is a demo-grade action in the RR v7 route action but not yet an agent tool.

Key constraint from PROJECT.md: "low-risk edits (adjusting class capacity) may act directly; anything that messages members, publishes a form, or affects bookings/payments stays propose→approve."

Cancelling a class has downstream effects: booked members lose their session, and depending on pass/payment policy, may expect a refund or credit. That makes cancellation the highest-stakes schedule operation.

### Table Stakes — Schedule Write Tools

| Operation | Description | Reversibility | HITL posture | Complexity | Notes |
|-----------|-------------|---------------|--------------|------------|-------|
| **create-occurrence** | Insert a new `class_occurrences` row (definitionId, starts_at, capacity) | Reversible (cancel it) | Act directly | Low | Agent must look up `class_definitions` first to pick a valid `definitionId`. Return `{ occurrenceId, startsAt, className }`. |
| **update-occurrence-capacity** | Change `capacity` on a future occurrence | Reversible | Act directly | Low | Only valid for `status=scheduled` future occurrences. Reducing below current booking count must error with a clear message ("8 members already booked — can't reduce to 5"). |
| **reschedule-occurrence** | Update `starts_at` (and `ends_at` derived from duration) on a future occurrence | Semi-reversible (bookings exist) | **Propose + approve** | Low-Med | Booked members are not notified automatically (that's a separate WhatsApp action); agent should surface this. "4 members are booked — rescheduling won't notify them automatically. Approve to reschedule, then use the inbox to notify them." |
| **cancel-occurrence** | Set `status=cancelled` on an occurrence | Largely irreversible (member trust impact) | **Propose + approve** | Low | Agent must state the booking count in rationale. Does NOT automatically issue pass credits or WhatsApp notifications — those are separate actions. Proposal card must call this out clearly. |
| **update-occurrence-status** | Set `status=completed` on a past occurrence | Reversible to scheduled | Act directly | Low | Housekeeping — marking past classes done. No member impact. |
| **create-class-definition** | Insert a new class type (name, duration_min, default_capacity, category) | Reversible (set active=false) | Act directly | Low | New class type has zero occurrences; no member impact until scheduled. |
| **update-class-definition** | Edit name, description, duration_min, default_capacity on an existing definition | Low-risk | Act directly | Low | Changing `default_capacity` doesn't retroactively change existing occurrences. Changing `name` renames the class everywhere (including historical bookings display). Agent should warn on rename. |
| **deactivate-class-definition** | Set `active=false` on a definition | Reversible | Act directly | Low | Hides it from scheduling UIs but doesn't affect existing occurrences. |

### Differentiators — Schedule

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| **Booking count in proposal rationale** | When proposing a cancel/reschedule, agent always states: "X members are booked." Staff see the impact before approving. | Low | Agent reads `COUNT(bookings WHERE occurrenceId=... AND status=booked)` inline before writing the proposal. |
| **Paired-action suggestion** | After approving a cancellation, agent offers: "Would you like me to draft a WhatsApp message to the 4 affected members?" Links the cancel to the existing WhatsApp propose→approve flow. | Medium | Agent creates a new `send-template-to-members` proposal. Requires identifying which members are booked. |
| **Fill-rate context on create** | When agent creates an occurrence, it references the fill-rate of similar past classes: "Yoga typically fills to 85% — you've set capacity at 15, which is consistent with recent classes." | Low | Reads `list-fill-rate` data already available as a tool. |
| **Past-occurrence guard** | Agent refuses to reschedule or cancel a `completed` occurrence, with a clear message. Only valid status transitions are offered. | Low | Guard in the action's `run` function: check `status` and `starts_at < now()`. |

### Anti-Features — Schedule

| Anti-Feature | Why blocked | What instead |
|---|---|---|
| **Hard-delete occurrence or definition** | Bookings reference occurrences by FK. Hard-deleting orphans booking rows and breaks history. | Cancel (`status=cancelled`) for occurrences; `active=false` for definitions. No delete exposed to the agent. |
| **Auto-notify booked members on cancellation/reschedule** | Notification is a separate member-facing action with WhatsApp compliance gates. Auto-bundling the notification into the cancellation tool bypasses the opt-in/24h-window/template-approved checks. | Agent proposes the notification separately, routing through `send-template-to-members` via `propose-action`. |
| **Debit or refund passes on cancellation** | Pass credit logic is in the Stripe webhook reducer. Agent has no visibility into which booking used which pass, and issuing credits directly would bypass the ledger. | Defer to a future "cancel + credit" compound action. For v1.2, cancellation is status-only. |
| **Bulk-cancel all future occurrences** | Studio-wide cancellations affect all booked members. Risk of a single mis-prompted bulk operation is too high for the propose→approve pattern to adequately gate. | Agent proposes per-occurrence, or staff uses the UI for bulk ops. |
| **Agent-initiated booking** | The existing booking action is demo-grade (no capacity atomicity, no pass debit). Exposing it as an agent tool would create bookings that bypass production controls (BKG-03/04 not yet shipped). | Defer booking-as-agent-tool to a post-v1.2 milestone once the atomic booking action ships. |

---

## Members

### Context

The `gym_members` table has: id, firstName, lastName, email, phoneE164, dateOfBirth, sex, heightCm, weightKg, goal, activityLevel, userId, createdAt. The `whatsapp_opt_in` table and any `marketing_consent` flag are explicitly protected.

The member detail page (`/gymos/members/:id`) is read-only from the agent side today. The route loader returns member data but the file has no action handler for profile edits — meaning the agent-write tools will be the FIRST edit surface for member profiles in this codebase. That's an opportunity: the agent is the primary edit surface, not an afterthought.

Key constraint from PROJECT.md: "agent updates `gym_members` profile fields (name, phone_e164, email, notes) WITHOUT silently changing `whatsapp_opt_in` / `marketing_consent` state."

Note: `notes` may not yet be a column on `gym_members` (not present in the schema inspection). If absent, it requires an additive migration (`ALTER TABLE gym_members ADD COLUMN notes text`) before the tool can be implemented. This is safe (additive only).

### Table Stakes — Members Write Tools

| Operation | Description | Reversibility | HITL posture | Complexity | Notes |
|-----------|-------------|---------------|--------------|------------|-------|
| **update-member-name** | Edit `firstName` and/or `lastName` | Reversible | Act directly | Low | Correction of typos, maiden name changes, etc. Non-sensitive. |
| **update-member-phone** | Edit `phoneE164` (must be a valid E.164 value, Zod-validated) | Semi-reversible (changes WhatsApp routing) | **Propose + approve** | Low-Med | A phone change changes which WhatsApp number the worker routes to. Invalid E.164 could break future sends. Proposal rationale must state old and new number: "Changing phone from +44... to +44... — future WhatsApp messages will go to the new number." |
| **update-member-email** | Edit `email` | Reversible | Act directly | Low | Email is informational only in v1 (no auth tied to gym_members for these members). Low risk. |
| **update-member-notes** | Write or replace the `notes` field (coaching notes, flags, context) | Fully reversible | Act directly | Low | Notes are internal-only; never shown to members. Schema migration required if column doesn't exist yet. |
| **update-member-profile-fields** | Edit `goal`, `activityLevel`, `dateOfBirth`, `sex`, `heightCm`, `weightKg` | Reversible | Act directly | Low | Used by the calorie counter and coaching context. Corrections are common (member updates goals in conversation). |

### Differentiators — Members

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| **Post-edit navigation** | After updating a member, agent links directly: "Updated Sarah's phone number. [View profile →](/gymos/members/mem_abc123)" | Low | Pure narration + `navigate` call. |
| **E.164 normalisation in agent** | Agent accepts "07911 123456" and normalises to `+447911123456` before calling the action. The action validates with Zod `e164` pattern; the agent layer attempts normalisation first and explains what it normalised to. | Low | The agent reasons about format; the action guards the final value with Zod. |
| **Notes append mode** | Alongside replace, offer an append-to-notes variant: "I'll add this to Sarah's notes rather than replacing them — she has existing notes." Prevents coach losing context from a careless "update notes" prompt. | Low | Agent reads current notes length, offers choice. The action itself uses replace; append is agent-side string composition. |
| **Opt-in status surfaced, not editable** | The agent shows the member's current opt-in status when updating phone: "Sarah is opted-in to WhatsApp — the new number will receive messages once she's next contacted." Makes clear it cannot change the opt-in. | Low | Read `whatsapp_opt_in` in the action's response payload; surface in narration. |

### Anti-Features — Members

| Anti-Feature | Why blocked | What instead |
|---|---|---|
| **Update `whatsapp_opt_in` or `marketing_consent`** | Opt-in is a compliance record — the member's own consent. Only the member or an explicit staff consent-recording flow can change it. Silent agent mutation would be a GDPR/Meta policy violation. | Blocked in the action's Zod schema: these fields are not accepted parameters. Agent narration explains: "I can't change opt-in status — that's the member's own consent record." |
| **Delete a gym_member row** | Members have FKs from bookings, passes, pass_debits, payments, conversations, whatsapp_opt_in. Hard delete cascades or orphans all of these. | Agent declines. Future off-boarding flow (post-v1.2) with data export and audit log. |
| **Merge two member records** | Deduplication requires reassigning all FKs — complex, irreversible if done wrong. | Out of scope for v1.2. |
| **Grant or debit passes** | Pass balance changes have financial implications and must flow through the Stripe webhook reducer path or an explicit pass-grant UI. Agent adding/subtracting passes directly bypasses the ledger. | Not exposed. For v1.2, pass-related operations remain staff-manual. |
| **Link a gym_member to a Better-auth user_id** | Auth identity linkage is sensitive — incorrect linking could give one person access to another's mobile profile. | Blocked. v1.2 does not touch `userId`. |
| **Send messages from member write tools** | WhatsApp sends always go through `propose-action` → `send-template-to-members`. Member write tools must not include a send shortcut that bypasses the worker chokepoint. | Agent creates a `send-template-to-members` proposal in the normal flow after updating the member. |

---

## Feature Dependencies

```
update-member-phone    → must read whatsapp_opt_in (to narrate opt-in status) but NOT write it
publish-form           → must check form status !== 'published' (idempotency guard)
cancel-occurrence      → must read booking count for proposal rationale
reschedule-occurrence  → must read booking count + surface WhatsApp notification suggestion
update-occurrence-capacity → must read current booking count (guard: new capacity >= booked count)
create-occurrence      → must list-classes first to resolve definitionId
update-form-fields on published → must either refuse or require unpublish first
propose-action enum    → must be extended to include new v1.2 action names, OR new actions self-handle proposal rows
notes column           → may require additive migration on gym_members before update-member-notes ships
```

---

## MVP Priority for v1.2

The minimum that makes agentic tab editing feel real and useful on day one:

**Forms (highest staff value, zero member risk on drafts):**
1. `create-form` — act directly
2. `update-form-meta` (title/description on drafts) — act directly
3. `publish-form` — propose + approve
4. `archive-form` (drafts only) — act directly

**Schedule (operational, medium risk):**
1. `update-occurrence-capacity` — act directly (most common daily need)
2. `cancel-occurrence` — propose + approve (most impactful)
3. `create-occurrence` — act directly

**Members (low risk, high-frequency corrections):**
1. `update-member-notes` — act directly (pure internal)
2. `update-member-name` — act directly
3. `update-member-email` — act directly
4. `update-member-phone` — propose + approve

**Defer within v1.2 if timeline pressured:**
- `update-form-fields` / `update-form-settings` (higher complexity, lower urgency)
- `reschedule-occurrence` (requires booking-count read + dual proposal logic)
- `create-class-definition` / `update-class-definition` (rare operation)
- `update-member-profile-fields` (goal/activity level — calorie counter dependency, less urgent for staff agent)

---

## Implementation Notes (Agent-Native Conventions)

Each tool follows the "Adding a New Gym Action" checklist from `apps/staff-web/AGENTS.md`:

1. Create `apps/staff-web/actions/<action-name>.ts` using `defineAction`.
2. No `http` key on mutations (no GET).
3. `// guard:allow-unscoped` comment on all gym tables (single-tenant, no `ownableColumns()`).
4. Regen `.generated/actions-registry.js` after creating.
5. Document in AGENTS.md Agent Actions table.
6. Add to `agent-chat.ts` tool list with per-tab context awareness (tool surfaces when the matching tab is in view — use the navigation state the agent already receives via `view-screen`).

The `propose-action` schema must be extended: its `actionName` enum currently only allows `send-template-to-members | create-checkout-link`. For schedule/forms proposals it must accept the new v1.2 action names. Alternatively, new actions can self-handle the proposal pattern internally (write a `dashboard_proposals` row directly, return `{ proposalId }`) — but extending the existing enum is preferred for observability consistency.

No schema changes required for forms and schedule. The one additive-only risk is `notes` on `gym_members`: verify presence before implementing `update-member-notes`.
