# Phase AE3: Members + Campaigns Write Tools - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Give the staff `/gymos` chat agent **write** tools for two surfaces, extending the agent-native "everything the UI can do, the agent can do" pattern already established for Forms (AE1) and Schedule (AE2):

1. **Members** — the agent can update a member's profile fields (first name, last name, email, phone (E.164), notes) and **only** those fields. It can **never** touch consent/opt-in state (`marketing_consent`, `whatsapp_opt_in`), enforced structurally via a `.strict()` Zod schema that omits those fields. Profile edits are low-risk reversible writes — they execute **directly** (no propose→approve gate).

2. **Campaigns segment builder** — replace today's single hardcoded "at-risk" segment in `gymos.campaigns.tsx` with a **composable** segment builder (UI controls + a matching agent write tool) that filters members by three axes: **# classes attended**, **recency of last attendance**, and **inquiry/lead date**. The agent can build a named segment from natural language and it appears in the Campaigns tab without a reload.

**In scope:** `update-member` action (+ two-exposure), a Members section in the `agent-chat.ts` system prompt, the composable segment builder UI, a `save-segment` (segment-build) agent action, segment persistence via `application_state`, live-refresh on both surfaces.

**Out of scope (locked by REQUIREMENTS/ROADMAP):** any schema change (milestone is fully additive); consent/compliance mutation by the agent; destructive member ops (hard-delete); changing the WhatsApp send/eligibility pipeline (opted-in AND not opted-out gate is reused as-is); member-facing surfaces.
</domain>

<decisions>
## Implementation Decisions

### Segment persistence
- **D-01:** Named/custom Campaigns segments persist as filter-spec rows in the framework's **`application_state`** table — NOT a new domain table. This honors the locked "no schema changes — fully additive" v1.2 constraint, survives reload, and is the canonical agent-native shared-state pattern (both UI and agent read/write the same state). Reference implementation: `apps/staff-web/actions/suggest-template-vars.ts` already writes suggestions to `application_state`.
- **D-02:** A segment is a stored **filter spec** (the three axis params + a name), not a materialized member list. The Campaigns loader/UI evaluates the spec against current member data at render time, so the segment stays live as bookings/attendance change.

### Segment builder UX
- **D-03:** The Campaigns tab exposes **structured filter controls** for the three locked axes, composable with **AND**:
  - **# classes attended** — `≥ N` (attended bookings count)
  - **recency of last attendance** — "not in the last X days/weeks" (last attended before a cutoff, or never attended)
  - **inquiry/lead date** — before/after a given date (member/lead creation or first-inquiry date)
- **D-04:** The **agent can build the same segment** via a write action that produces the identical filter spec from natural language (success criterion 6: "build a segment of members who attended 4+ classes but haven't been in 3 weeks" → a matching, named segment appears in the tab without a reload). UI and agent stay in sync because they write the same `application_state` spec. Both exposures are mandatory (parity) — neither UI-only nor agent-only is acceptable.

### At-risk segment fate
- **D-05:** Keep the existing at-risk criteria (**14d inactive OR 0 bookings/30d OR pass expiring in 14d**) as a **built-in preset** that pre-fills the composable builder, sitting alongside custom segments. Nothing is lost; the curated churn-outreach default that's already wired to the send flow stays one click away. The surface becomes composable rather than fixed (success criterion 5: "composable, replacing the single fixed at-risk segment").

### Member profile updates
- **D-06:** The `update-member` action edits **only** `first_name`, `last_name`, `email`, `phone_e164`, `notes`. Schema is `.strict()` so any extra key (notably `marketing_consent`) is rejected at parse time — the agent can never silently flip consent (AEM-02). `whatsapp_opt_in` lives in a separate table and is structurally unreachable from this action.
- **D-07:** Phone is **validated as E.164** (`+` followed by digits) and **rejected** if it doesn't conform — no loose normalization, no assumed country code. `phone_e164` is the "natural key for WhatsApp"; silent reformatting would corrupt it. Matches success criterion 1 ("+447700900123" stored verbatim). Email is Zod-email-validated. Empty patch is a no-op success (mirror `update-class-definition`'s pattern).
- **D-08:** Profile edits execute **directly** — no propose→approve gate (locked by success criterion 4 and AEX-02: low-risk reversible edits run direct). After the write, the member profile card on `/gymos/members` (and the detail route `gymos.members_.$id.tsx`) live-refreshes via `useDbSync`/`useChangeVersion("action")` — no manual reload (AEX-03).
- **D-09:** The agent resolves "which member" by reusing `list-members` (name/phone filter) and `view-screen` (the selected member on the detail route). No new lookup tool — this is the established context-awareness pattern (AEX-01).

### Two-exposure + documentation (carried forward from AE1/AE2, locked)
- **D-10:** Every new write action (`update-member`, the segment-build action) is exposed in BOTH places: an `actions/*.ts` file (auto-registered) AND a named entry in the `agent-chat.ts` system prompt — and a new **Members** section (and Campaigns/segment guidance) is added to that prompt since none exists yet. Each action is also added to the `apps/staff-web/AGENTS.md` Agent Actions table (AEX-04).
- **D-11:** New actions follow the AE2 action shape: agent-only `defineAction` with **no `http` key**, `// guard:allow-unscoped — single-tenant gym tables` on every query, resolve-then-update with explicit not-found errors, return `{updated:true}` / `{error}` style results.

### Claude's Discretion
- Exact `application_state` key naming and JSON shape for the stored segment spec (e.g. `campaign_segments` key holding `{ name, filters: {...} }[]`).
- Whether building a segment also auto-selects it for the send card or just saves it (success criterion only requires it to "appear"); lean toward saving + selecting the just-built one for a smooth flow.
- Whether the structured controls live inline in the segment card vs a `Popover`/`Sheet` (follow progressive-disclosure conventions; the segment surface should not clutter the send flow).
- Empty-state / zero-match copy for a custom segment.

### Requirements registration (planner action)
- **D-12:** AEM-01 and AEM-02 already exist in REQUIREMENTS.md (Pending). The Campaigns segment-builder requirements (AEM-03 / AEM-04 per ROADMAP) are **not yet registered** — the planner MUST add them to `.planning/REQUIREMENTS.md` and the Traceability table at plan time, mapped to Phase AE3, before/alongside writing plans.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` — Phase AE3 section (goal, six success criteria, AEM-03/AEM-04 note)
- `.planning/REQUIREMENTS.md` — AEM-01, AEM-02 (member edits + consent exclusion), AEX-01..04 (cross-cutting), Out-of-Scope exclusions, "no schema changes" constraint
- `.planning/research/SUMMARY.md` — milestone research headline (zero new deps; reuse `defineAction` + registry + propose→approve; `gym_members.notes` confirmed present)

### Established write-tool pattern (AE1/AE2 — replicate this)
- `apps/staff-web/AGENTS.md` — Agent Actions table, the **two-exposure rule** call-outs (AE1 forms / AE2 schedule), "Adding a New Gym Action" 6-step checklist, Forbidden Vocabulary, propose→approve compliance notes
- `apps/staff-web/actions/update-class-definition.ts` — closest pattern for a partial-update agent action (resolve-then-update, optional fields, no-op success, `{updated}` returns, `guard:allow-unscoped`)
- `apps/staff-web/actions/suggest-template-vars.ts` — reference for writing to `application_state` from an action
- `.planning/phases/AE1-forms-write-tools/AE1-RESEARCH.md` and `.planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md` — prior research on the same milestone's write-tool conventions
- `.planning/phases/AE2-schedule-write-tools/AE2-03-PLAN.md` — how the agent-exposure (two-exposure) step was planned/documented

### Surfaces to modify
- `apps/staff-web/server/plugins/agent-chat.ts` — system prompt; has Forms + Schedule per-tab sections, **no Members section yet** (add one + segment guidance)
- `apps/staff-web/app/routes/gymos.campaigns.tsx` — current hardcoded at-risk segment computed in the loader (lines ~96–194); the `// Custom segment builder: DEFERRED` comment marks exactly what AE3 unblocks; reuse the eligible-recipient (opted-in AND not opted-out) logic untouched
- `apps/staff-web/app/routes/gymos.members.tsx` — members directory; profile cards that must live-refresh after an edit
- `apps/staff-web/app/routes/gymos.members_.$id.tsx` — member profile detail route; the profile card here also refreshes after an agent edit
- `apps/staff-web/server/db/schema.ts` — `gymMembers` (lines 109–132: firstName notNull, lastName, email, phoneE164, notes, marketingConsent) and `whatsappOptIn` (line 343, separate table)

### Project conventions
- `AGENTS.md` (workspace root) — AEX-02 propose→approve chokepoint, `guard:allow-unscoped` rule, optimistic-UI mandate, shadcn/Tabler/TypeScript conventions, "no breaking database changes"
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `update-class-definition.ts` — copy its resolve→partial-update→`{updated}` shape for `update-member`.
- `suggest-template-vars.ts` — copy its `application_state` write pattern for saving segment specs.
- `list-members.ts` / `list-at-risk-members.ts` — existing member readers; the at-risk criteria become the built-in preset.
- The campaigns loader's eligible-recipient computation (opt-in row exists AND `opted_out_at IS NULL`) is reused verbatim for any segment's send flow.
- shadcn `Select`, `Input`, `Card`, `Badge`, `Popover`, `AlertDialog` already imported in campaigns/members routes.

### Established Patterns
- Agent write actions: `defineAction`, **no `http` key**, `// guard:allow-unscoped — single-tenant gym tables`, `.strict()`/optional-field Zod, explicit not-found error codes.
- **Two-exposure rule:** action file (auto-registered) + named in `agent-chat.ts` per-tab section + row in `apps/staff-web/AGENTS.md`.
- Live-refresh: `useDbSync` / `useChangeVersion("action")` invalidates after an agent write (AEX-03).
- Postgres 42702 gotcha in single-table FROM correlated subqueries — qualify the outer id literally as `"gym_members"."id"` (see campaigns loader comment + memory `project_gymos_drizzle_ambiguous_id`).

### Integration Points
- New Members section added to the `agent-chat.ts` system prompt (after the Schedule section).
- Segment specs stored under an `application_state` key; Campaigns loader reads them and renders saved segments + the at-risk preset.
- `update-member` writes `gym_members`; members directory + detail card re-poll and refresh.
</code_context>

<specifics>
## Specific Ideas

- Phone example from the goal: "update Sarah's phone number to +447700900123" must store `+447700900123` exactly (E.164, no reformat).
- Notes example: "add a note to David's profile: prefers morning classes" saves to `gym_members.notes`.
- Refusal example: "opt Sarah into WhatsApp" / "change her marketing consent" must yield a clear refusal — the `.strict()` schema rejects the field, no consent state changes.
- Segment example: "members who attended 4+ classes but haven't been in 3 weeks" → `# classes attended ≥ 4` AND `last attended before (now − 21d)`, saved as a named segment.
- At-risk preset criteria to preserve: 14d inactive OR 0 bookings/30d OR pass expiring in 14d.
</specifics>

<deferred>
## Deferred Ideas

- A proper `campaign_segments` domain table (rejected for v1.2 — violates "no schema changes"; revisit post-v1.2 if segments need richer metadata/sharing).
- Loose phone normalization / country-code inference (rejected — risks corrupting the WhatsApp natural key).
- OR / nested boolean composition across segment axes (v1.2 is AND-only).
- Agent-initiated bulk member edits and bulk segment sends (explicitly deferred in REQUIREMENTS "Future Requirements").
- Write tools for remaining tabs (Payments, Settings, Analytics) — future milestone.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.
</deferred>

---

*Phase: AE3-members-campaigns-write-tools*
*Context gathered: 2026-06-18*
