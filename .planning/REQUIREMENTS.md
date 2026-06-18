# Requirements: GymClassOS — Milestone v1.2 Agentic Tab Editing

**Defined:** 2026-06-18
**Core Value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp + class bookings + member context). Members book, pay, and log activity / nutrition from a native iOS/Android Expo app with an in-app coaching agent.

> **Milestone scope note:** This file holds the **v1.2 Agentic Tab Editing** requirements only. The v1.1 UI Redesign requirements are archived alongside as `REQUIREMENTS-v1.1-archived.md` and remain in git history; the v1.0 Demo/Production requirements live in `master` git history. v1.1 (R1–R5) is complete and merged; v1.0 Production work (P2/P3, WhatsApp deep-wire, mobile EAS) remains pending and is tracked in ROADMAP.md.

> **Milestone goal:** Make the GymClassOS staff `/gymos` chat agent able to UPDATE each tab, not just read it — realizing the agent-native principle "everything the UI can do, the agent can do." v1.2 scope is THREE tabs: Forms, Schedule, Members.

> **Research:** `.planning/research/SUMMARY.md` (+ STACK / FEATURES / ARCHITECTURE / PITFALLS). Headline: zero new dependencies; all reuse existing `defineAction` + registry + propose→approve primitives. `gym_members.notes` confirmed present (no migration needed) — the milestone is fully additive.

## v1.2 Requirements

### Agentic Editing — Forms (AEF)

- [x] **AEF-01**: Coach can ask the agent to create a new lead-capture form (title, optional description) — created as a `draft`.
- [x] **AEF-02**: Coach can ask the agent to edit a form's fields (add / remove / reorder fields; set type, label, required, options) — the `fields` JSON is Zod-validated against the `FormField` shape before write (malformed fields are rejected, never persisted).
- [x] **AEF-03**: Coach can ask the agent to edit a form's title, description, and settings (submit text, success message) without changing its publish status or slug.
- [x] **AEF-04**: Coach can ask the agent to publish a form — routed through propose→approve (the agent never auto-publishes).
- [x] **AEF-05**: Coach can ask the agent to unpublish a published form (back to draft).
- [x] **AEF-06**: Coach can ask the agent to archive or restore a form.

### Agentic Editing — Schedule (AES)

- [ ] **AES-01**: Coach can ask the agent to create a class occurrence (class definition, start time, capacity).
- [x] **AES-02**: Coach can ask the agent to change a class occurrence's capacity (rejected if the new capacity is below current bookings — returns a clear error, no mutation).
- [ ] **AES-03**: Coach can ask the agent to cancel a class occurrence — if it has active bookings the agent must route through propose→approve, and approval cancels bookings + refunds the affected pass credits + cancels the occurrence atomically (no orphaned credits).
- [ ] **AES-04**: Coach can ask the agent to reschedule a class occurrence's start time — routed through propose→approve when it has active bookings.
- [x] **AES-05**: Coach can ask the agent to create or edit a class definition (name, duration, default capacity, category).
- [x] **AES-06**: Coach can ask the agent to mark a past occurrence completed.

### Agentic Editing — Members (AEM)

- [ ] **AEM-01**: Coach can ask the agent to update a member's profile fields — first name, last name, email, phone (E.164), notes — and only those fields.
- [ ] **AEM-02**: The agent can never modify a member's consent / opt-in state (`marketing_consent`, `whatsapp_opt_in`) — the update-member action's schema structurally excludes those fields (`.strict()`), so an agent edit can never silently flip consent.

### Agentic Editing — Cross-cutting (AEX)

- [x] **AEX-01**: The agent is context-aware of the active tab and selected item (via navigation state + `view-screen`) and leads with that tab's write tools; the `agent-chat.ts` system prompt is organized into per-tab capability sections (not a flat tool list).
- [x] **AEX-02**: Risky / member-visible operations (publish form, cancel/reschedule a class with bookings) route through the existing propose→approve chokepoint; low-risk reversible edits (draft form edits, capacity bumps, member profile fields) execute directly. Every gated action is added to BOTH `ACTION_ALLOWLIST` (`approve-proposal.ts`) and the `propose-action` Zod enum in the same change.
- [x] **AEX-03**: After an agent write, the relevant tab UI live-refreshes (via `useDbSync` / `useChangeVersion("action")`) — no manual reload.
- [x] **AEX-04**: Every new write action is documented in `apps/staff-web/AGENTS.md` (Agent Actions table) and exposed in `agent-chat.ts` — registry + system-prompt are both updated (the two independent exposure steps).

## Future Requirements (deferred)

- Agent write tools for the remaining tabs: Campaigns, Payments, Settings, Analytics.
- Full optimistic-concurrency / conflict handling when an agent and a coach edit the same entity simultaneously (v1.2 mitigates via `view-screen`-before-write guidance only).
- Agent-initiated bulk operations (bulk reschedule/cancel, bulk member edits).

## Out of Scope (explicit exclusions)

- **Destructive agent actions:** purging form responses, hard-deleting forms / occurrences / class definitions / members, editing form responses — blocked at the schema layer, not just discouraged.
- **Consent / compliance mutation by agent:** any change to `whatsapp_opt_in` or `marketing_consent` (AEM-02).
- **Pass ledger mutation outside the cancel-refund transaction:** the agent cannot grant or debit passes directly.
- **WhatsApp side effects from tab-edit tools:** notifying members of a cancellation is a separate, already-gated send action — not bundled into cancel-occurrence.
- **Schema changes:** none — the milestone is fully additive against existing tables.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AEF-01 | Phase AE1 | Complete |
| AEF-02 | Phase AE1 | Complete |
| AEF-03 | Phase AE1 | Complete |
| AEF-04 | Phase AE1 | Complete |
| AEF-05 | Phase AE1 | Complete |
| AEF-06 | Phase AE1 | Complete |
| AES-01 | Phase AE2 | Pending |
| AES-02 | Phase AE2 | Complete |
| AES-03 | Phase AE2 | Pending |
| AES-04 | Phase AE2 | Pending |
| AES-05 | Phase AE2 | Complete |
| AES-06 | Phase AE2 | Complete |
| AEM-01 | Phase AE3 | Pending |
| AEM-02 | Phase AE3 | Pending |
| AEX-01 | Phase AE1 | Complete |
| AEX-02 | Phase AE1 | Complete |
| AEX-03 | Phase AE1 | Complete |
| AEX-04 | Phase AE1 | Complete |
