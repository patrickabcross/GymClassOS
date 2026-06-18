---
phase: AE2-schedule-write-tools
plan: 03
type: execute
wave: 3
depends_on: ["01", "02"]
files_modified:
  - apps/staff-web/actions/view-screen.ts
  - apps/staff-web/server/plugins/agent-chat.ts
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [AES-01]
must_haves:
  truths:
    - "When the coach is on /gymos/schedule, view-screen returns upcoming occurrences with their booking counts (and the selected occurrence's detail, if any) so the agent is context-aware of the Schedule tab before writing"
    - "The agent-chat.ts system prompt has a per-tab Schedule section naming the create path (create-class-definition + create-class-occurrence) plus the direct edit actions (set-occurrence-capacity, update-class-definition, mark-occurrence-complete)"
    - "The system prompt instructs the agent to CANCEL and RESCHEDULE only via propose-action, never by calling cancel-occurrence / reschedule-occurrence directly"
    - "AGENTS.md documents the create-path exposure (flips the create-class-definition/occurrence rows from 'UI-driven for now' to agent-exposed) and the new schedule actions, with the two gated actions marked"
  artifacts:
    - path: "apps/staff-web/actions/view-screen.ts"
      provides: "schedule branch returning upcoming occurrences + booking counts + selected occurrence for AEX-01 context-awareness"
      contains: "schedule"
    - path: "apps/staff-web/server/plugins/agent-chat.ts"
      provides: "per-tab Schedule section in the system prompt"
      contains: "create-class-occurrence"
    - path: "apps/staff-web/AGENTS.md"
      provides: "Agent Actions table rows + two-exposure note for the schedule actions"
      contains: "set-occurrence-capacity"
  key_links:
    - from: "apps/staff-web/actions/view-screen.ts"
      to: "schema.classOccurrences"
      via: "nav.view === 'schedule' branch queries occurrences + booking counts via getDb()"
      pattern: "nav\\?\\.view === \"schedule\""
    - from: "apps/staff-web/server/plugins/agent-chat.ts"
      to: "the schedule actions shipped in AE2-01 + AE2-02"
      via: "systemPrompt names each action in a per-tab Schedule section; cancel/reschedule routed via propose-action"
      pattern: "set-occurrence-capacity"
---

<objective>
Expose the schedule write tools to the agent — the LAST wave of AE2. Add a schedule branch to `view-screen` (so the agent knows which occurrences exist and their booking counts when the coach is on the Schedule tab), add a per-tab Schedule section to the `agent-chat.ts` system prompt, and document the schedule actions in AGENTS.md. This completes AES-01 (agent-driven create path) and the two-exposure rule for every AE2 action.

Purpose: Per the two-exposure invariant (AEX-04), an action only becomes agent-callable once it is BOTH in the actions registry (shipped in Waves 1+2) AND named in the system prompt. This wave performs the second exposure. It ships LAST so the agent never hallucinates calls to actions that didn't exist yet (RESEARCH Pitfall 4 + STATE.md "system-prompt ships last" constraint). The create-path actions (`create-class-definition` + `create-class-occurrence`) already exist and are in the registry but were deliberately NOT in the system prompt (deferred from quick task 260618-j8z to AE2) — naming them here satisfies AES-01. AEX-01 (context-aware per-tab prompt) and AEX-04 (two-exposure documentation) are realized here, mirroring AE1-03's Forms work exactly.

Output: edits to view-screen.ts (schedule branch), agent-chat.ts (Schedule section), and AGENTS.md (action rows + two-exposure note). NO new action files in this plan — they all exist from AE2-01/AE2-02 (and the create-path from 95e1f0da).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md
@apps/staff-web/AGENTS.md

<interfaces>
<!-- view-screen.ts current structure (apps/staff-web/actions/view-screen.ts): -->
<!-- run() reads navigation app-state via readAppState("navigation"); nav = navigation as any. -->
<!-- AE1-03 added a `nav?.view === "forms"` branch BEFORE the generic `else if (nav?.view)` email branch. -->
<!-- Follow that EXACT shape: insert a `nav?.view === "schedule"` branch alongside the forms branch. -->
<!-- The forms branch dynamically imports getDb/schema + drizzle helpers (view-screen has no top-level db import): -->
<!--   const { getDb, schema } = await import("../server/db/index.js"); -->
<!--   const { eq, and, count, gte, asc } = await import("drizzle-orm"); -->

<!-- agent-chat.ts current systemPrompt (apps/staff-web/server/plugins/agent-chat.ts): -->
<!-- AE1-03 restructured it into per-tab sections; a Forms section sits between suggest-template-vars and the -->
<!-- "How you act — three tiers" block. The propose-action tool line already lists publish-form. -->
<!-- Insert the Schedule section adjacent to the Forms section (same insertion strategy). -->

<!-- Schedule actions to name (all shipped in AE2-01/02 + create-path from 95e1f0da): -->
<!--   create-class-definition({name, durationMin, defaultCapacity?, category?}) -> {id, name}        (AES-01) -->
<!--   create-class-occurrence({definitionId, startsAt, capacity?, room?, instructorUserId?, notes?}) -> {id, startsAt, endsAt, capacity}  (AES-01) -->
<!--   update-class-definition({definitionId, name?, durationMin?, defaultCapacity?, category?}) -> {updated}  (AES-05) -->
<!--   set-occurrence-capacity({occurrenceId, capacity}) -> {updated} | {error:"CAPACITY_BELOW_BOOKINGS",...}  (AES-02) -->
<!--   mark-occurrence-complete({occurrenceId}) -> {completed} | {error:"OCCURRENCE_IN_FUTURE"}  (AES-06) -->
<!--   cancel-occurrence  -> via propose-action({actionName:"cancel-occurrence", params:{occurrenceId}, rationale})  (AES-03, GATED) -->
<!--   reschedule-occurrence -> via propose-action({actionName:"reschedule-occurrence", params:{occurrenceId, startsAt}, rationale})  (AES-04, GATED) -->

<!-- classOccurrences: id, definitionId, startsAt, endsAt, capacity, status enum, room. classDefinitions: id, name. -->
<!-- bookings: occurrenceId, status ('booked' = active). count() in pg mode may surface as string — wrap Number(). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add a schedule branch to view-screen for AEX-01 context-awareness</name>
  <files>apps/staff-web/actions/view-screen.ts</files>
  <read_first>
    - apps/staff-web/actions/view-screen.ts (FULL file — the run() fn, the AE1-03 `nav?.view === "forms"` branch, and the generic `else if (nav?.view)` email branch it sits before)
    - apps/staff-web/app/routes/gymos.schedule.tsx loader (the columns + the booking-count query to mirror: occurrence id, definition name, startsAt, capacity, booked count, status)
    - apps/staff-web/server/db/index.ts (getDb/schema export shape)
    - .planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md "Pattern 8" (view-screen schedule branch shape: upcomingOccurrences + selectedOccurrence)
  </read_first>
  <action>
    Edit `apps/staff-web/actions/view-screen.ts`. Insert a `nav?.view === "schedule"` branch RIGHT BEFORE the AE1-03 forms branch (or right after it — either way it must sit BEFORE the generic `else if (nav?.view)` email branch so `/gymos/schedule` does NOT fall through into Gmail logic). Mirror the forms branch's dynamic-import + guard pattern exactly.

    Add this branch (place it as a sibling `else if` adjacent to the forms branch):
    ```typescript
    } else if (nav?.view === "schedule") {
      // AEX-01 — context-aware of the Schedule tab. Surface upcoming occurrences
      // with their booking counts (and the selected occurrence's detail, if any)
      // so the agent knows what exists before writing (e.g. "Friday's spin has 8 bookings").
      const { getDb, schema } = await import("../server/db/index.js");
      const { eq, and, count, gte, asc } = await import("drizzle-orm");
      const db = getDb();
      const nowIso = new Date().toISOString();
      // guard:allow-unscoped — single-tenant gym tables
      const occurrences = await db
        .select({
          id: schema.classOccurrences.id,
          className: schema.classDefinitions.name,
          startsAt: schema.classOccurrences.startsAt,
          capacity: schema.classOccurrences.capacity,
          status: schema.classOccurrences.status,
        })
        .from(schema.classOccurrences)
        .innerJoin(
          schema.classDefinitions,
          eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
        )
        .where(gte(schema.classOccurrences.startsAt, nowIso))
        .orderBy(asc(schema.classOccurrences.startsAt))
        .limit(30);

      // Per-occurrence active-booking counts (one grouped query, then map).
      const upcomingOccurrences = [];
      for (const occ of occurrences) {
        // guard:allow-unscoped — single-tenant gym tables
        const [bc] = await db
          .select({ booked: count() })
          .from(schema.bookings)
          .where(
            and(
              eq(schema.bookings.occurrenceId, occ.id),
              eq(schema.bookings.status, "booked"),
            ),
          );
        upcomingOccurrences.push({
          ...occ,
          bookingCount: Number(bc?.booked ?? 0),
        });
      }
      screen.schedule = { upcomingOccurrences };

      if (nav?.occurrenceId) {
        // guard:allow-unscoped — single-tenant gym tables
        const [occ] = await db
          .select()
          .from(schema.classOccurrences)
          .where(eq(schema.classOccurrences.id, nav.occurrenceId))
          .limit(1);
        if (occ) {
          // guard:allow-unscoped — single-tenant gym tables
          const [bc] = await db
            .select({ booked: count() })
            .from(schema.bookings)
            .where(
              and(
                eq(schema.bookings.occurrenceId, occ.id),
                eq(schema.bookings.status, "booked"),
              ),
            );
          screen.selectedOccurrence = {
            ...occ,
            bookingCount: Number(bc?.booked ?? 0),
          };
        }
      }
    }
    ```
    Adjust the exact `} else if {` joinery to match how the forms branch was written (the file uses an if/else-if chain — splice this branch into that chain before the generic email `else if (nav?.view)`). Leave the rest of `run()` unchanged. If `count`/`gte`/`asc` are already imported dynamically elsewhere in the function, reuse the existing destructure rather than redeclaring.

    Run `npx prettier --write apps/staff-web/actions/view-screen.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - view-screen.ts contains a branch `else if (nav?.view === "schedule")` placed BEFORE the generic `else if (nav?.view)` email branch
    - The schedule branch dynamically imports `getDb`/`schema` from `../server/db/index.js` and the needed helpers (`eq`, `and`, `count`, `gte`, `asc`) from `drizzle-orm`
    - The schedule branch assigns `screen.schedule` (with `upcomingOccurrences`) and (when `nav.occurrenceId` is set) `screen.selectedOccurrence`
    - The booking counts are wrapped in `Number(` (count() may surface as string in pg mode)
    - Every query in the schedule branch carries `// guard:allow-unscoped`
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>view-screen returns schedule context (upcoming occurrences + booking counts + selected occurrence) for the Schedule tab without falling through to Gmail logic; tsc passes.</done>
</task>

<task type="auto">
  <name>Task 2: Add a per-tab Schedule section to the agent-chat.ts system prompt</name>
  <files>apps/staff-web/server/plugins/agent-chat.ts</files>
  <read_first>
    - apps/staff-web/server/plugins/agent-chat.ts (FULL file — the systemPrompt template literal; locate the AE1-03 Forms section and the propose-action tool line)
    - .planning/phases/AE2-schedule-write-tools/AE2-RESEARCH.md "Schedule per-tab section in agent-chat.ts" (the recommended Schedule section text)
    - apps/staff-web/actions/create-class-definition.ts, create-class-occurrence.ts, set-occurrence-capacity.ts, update-class-definition.ts, mark-occurrence-complete.ts (exact action names + param shapes + return shapes to describe)
  </read_first>
  <action>
    Edit the `systemPrompt` string in `apps/staff-web/server/plugins/agent-chat.ts` (AEX-01 + AEX-04). Two changes, mirroring how AE1-03 added the Forms section:

    (1) In the `propose-action` tool line (the one AE1-03 updated to include `'publish-form'`), extend the allowed actionName list to also include the two new gated schedule actions. Change the list to read:
    `actionName: 'send-template-to-members', 'create-checkout-link', 'publish-form', 'cancel-occurrence', or 'reschedule-occurrence'`

    (2) Append a new per-tab Schedule section. Insert it ADJACENT to the existing Forms section (after the Forms section block, before the "How you act — three tiers:" line — same insertion zone AE1-03 used). Add this block verbatim:
    ```

    Schedule tab (when the coach is on /gymos/schedule — call view-screen first to see which occurrences exist and their booking counts):
    - create-class-definition — create a new class TYPE in the catalog ({name, durationMin, defaultCapacity?, category?}). Returns {id, name}. Does NOT schedule an occurrence.
    - create-class-occurrence — schedule an occurrence from an existing definition ({definitionId, startsAt, capacity?, room?}). Returns {id, startsAt, endsAt, capacity}. Pair with create-class-definition when the coach asks for a brand-new class type.
    - update-class-definition — edit a class definition's name, duration, default capacity, or category ({definitionId, name?, durationMin?, defaultCapacity?, category?}). Never changes the active flag.
    - set-occurrence-capacity — change an occurrence's capacity ({occurrenceId, capacity}). Returns {error:"CAPACITY_BELOW_BOOKINGS", bookingCount, requestedCapacity} with NO change if the new capacity is below the current active bookings — tell the coach the booking count when this happens.
    - mark-occurrence-complete — mark a PAST occurrence as completed ({occurrenceId}). Rejects a future occurrence (OCCURRENCE_IN_FUTURE).
    - To CANCEL an occurrence that has active bookings: do NOT call cancel-occurrence directly. Call propose-action({ actionName: "cancel-occurrence", params: { occurrenceId }, rationale }). The coach approves on the noticeboard; only then does the atomic cancellation run (active bookings cancelled + pass credits refunded + occurrence cancelled, all in one transaction).
    - To RESCHEDULE an occurrence that has active bookings: do NOT call reschedule-occurrence directly. Call propose-action({ actionName: "reschedule-occurrence", params: { occurrenceId, startsAt }, rationale }). The coach approves; only then does the start time change (ends time is recomputed automatically).
    ```
    Note: neither `cancel-occurrence` nor `reschedule-occurrence` may be named as a directly-callable tool bullet anywhere in the prompt — the only path is via propose-action (RESEARCH Anti-Pattern: "Naming cancel-occurrence or reschedule-occurrence as direct agent tools"). The two bullets above are the only mentions and both route through propose-action.

    Run `npx prettier --write apps/staff-web/server/plugins/agent-chat.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - agent-chat.ts systemPrompt contains a Schedule section that names: create-class-definition, create-class-occurrence, update-class-definition, set-occurrence-capacity, mark-occurrence-complete
    - agent-chat.ts systemPrompt contains `propose-action({ actionName: "cancel-occurrence"` AND `propose-action({ actionName: "reschedule-occurrence"`
    - agent-chat.ts systemPrompt does NOT list `cancel-occurrence` or `reschedule-occurrence` as a standalone directly-callable tool bullet (grep: no line of the form `- cancel-occurrence —` or `- reschedule-occurrence —`)
    - agent-chat.ts propose-action tool line mentions both `cancel-occurrence` and `reschedule-occurrence` in its allowed actionName list
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>The system prompt has a per-tab Schedule section naming the 5 direct/create actions and routing cancel + reschedule through propose-action; the two gated actions are never offered as direct tools.</done>
</task>

<task type="auto">
  <name>Task 3: Document the schedule actions in AGENTS.md (two-exposure rule)</name>
  <files>apps/staff-web/AGENTS.md</files>
  <read_first>
    - apps/staff-web/AGENTS.md (the "Agent Actions (LLM tools)" table; the existing create-class-definition / create-class-occurrence rows currently marked "(UI-driven for now; AE2 will expose to agent)"; the "Two-exposure rule" notes; the propose-action row)
    - apps/staff-web/actions/set-occurrence-capacity.ts, update-class-definition.ts, mark-occurrence-complete.ts, cancel-occurrence.ts, reschedule-occurrence.ts (final return shapes to document)
  </read_first>
  <action>
    Edit `apps/staff-web/AGENTS.md`. Three changes:

    (1) Update the two EXISTING create-path rows. Change the `create-class-definition` and `create-class-occurrence` "Use For" text — remove the `(UI-driven for now; AE2 will expose to agent)` prefix and replace with agent-exposed wording. New rows:
    | `create-class-definition` | — | Create a new class type in the catalog (name, durationMin, defaultCapacity?, category?). Does NOT schedule an occurrence — pair with create-class-occurrence. | `{id, name}` |
    | `create-class-occurrence` | — | Schedule a class occurrence from an existing definition (definitionId, startsAt, capacity?, room?). Resolves the definition and computes endsAt from its durationMin; rejects DEFINITION_NOT_FOUND / INVALID_STARTS_AT. | `{id, startsAt, endsAt, capacity}` |

    (2) ADD five rows to the table (after the create-class-occurrence row, matching the existing pipe formatting):
    | `set-occurrence-capacity` | — | Change an occurrence's capacity. Rejected with `{error:"CAPACITY_BELOW_BOOKINGS", bookingCount}` and NO mutation if the new capacity is below current active bookings. | `{updated:true, occurrenceId, capacity}` or `{error}` |
    | `update-class-definition` | — | Edit a class definition's name, duration, default capacity, or category. Never touches the active flag. | `{updated:true}` or `{updated:false, reason}` |
    | `mark-occurrence-complete` | — | Mark a past occurrence completed. Rejects a future occurrence (`OCCURRENCE_IN_FUTURE`); already-completed is a no-op. | `{completed:true}` or `{error}` |
    | `cancel-occurrence` | — | Cancel an occurrence and atomically refund affected pass credits. **Gated — reached only via `propose-action({actionName:"cancel-occurrence"})`; NOT called directly by the agent.** Runs one transaction: bookings cancelled + negative pass_debits + occurrence cancelled. Idempotent. | `{cancelled:true, bookingsCancelled, creditsRefunded}` or `{error}` |
    | `reschedule-occurrence` | — | Reschedule an occurrence's start time; recomputes endsAt. **Gated — reached only via `propose-action({actionName:"reschedule-occurrence"})`; NOT called directly by the agent.** | `{rescheduled:true, startsAt, endsAt}` or `{error}` |

    (3) Update the `propose-action` row's "Use For" text: change the actionName list from
    `(actionName: send-template-to-members, create-checkout-link, or publish-form, params + rationale)`
    to
    `(actionName: send-template-to-members, create-checkout-link, publish-form, cancel-occurrence, or reschedule-occurrence, params + rationale)`.

    (4) REPLACE the existing "Two-exposure rule — create-class-definition / create-class-occurrence" note (which says exposure is "deferred to Phase AE2") with an AE2-complete note, and add a schedule-actions note mirroring the AE1 forms note:
    > **Two-exposure rule — AE2 schedule actions.** The create path (`create-class-definition`, `create-class-occurrence`) and the new schedule actions (`set-occurrence-capacity`, `update-class-definition`, `mark-occurrence-complete`, and the gated `cancel-occurrence` / `reschedule-occurrence`) are exposed to the agent: action files are in `actions/` and entered in `.generated/actions-registry.ts`, AND named in the `agent-chat.ts` system prompt Schedule section. `cancel-occurrence` and `reschedule-occurrence` are reachable only through `propose-action` — never as direct tools.

    Run `npx prettier --write apps/staff-web/AGENTS.md`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx prettier --check AGENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - AGENTS.md Agent Actions table contains rows for set-occurrence-capacity, update-class-definition, mark-occurrence-complete, cancel-occurrence, reschedule-occurrence
    - The create-class-definition and create-class-occurrence rows NO LONGER contain the string "UI-driven for now"
    - The cancel-occurrence and reschedule-occurrence rows each state they are gated / reached only via propose-action and NOT called directly
    - The propose-action row's "Use For" text mentions both `cancel-occurrence` and `reschedule-occurrence`
    - AGENTS.md contains a "Two-exposure rule — AE2 schedule actions" note and NO longer says schedule create-path exposure is "deferred to Phase AE2"
    - `cd apps/staff-web && npx prettier --check AGENTS.md` reports no issues
  </acceptance_criteria>
  <done>All schedule actions documented in AGENTS.md with the two gated actions clearly marked; the create-path rows flipped to agent-exposed; the AE2 two-exposure note present.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` exits 0 (view-screen + agent-chat edits compile)
- grep proves the agent-chat.ts Schedule section names all 5 direct/create actions and routes cancel + reschedule via propose-action
- grep proves `- cancel-occurrence —` and `- reschedule-occurrence —` do NOT appear as standalone tool bullets in agent-chat.ts (gated only via propose-action)
- AGENTS.md documents all schedule actions; prettier --check clean
- Whole-phase check: every AE2 action (create-path + AE2-01 + AE2-02) now appears in BOTH the system prompt (agent-chat.ts) and AGENTS.md, AND in .generated/actions-registry.ts (two-exposure rule + registry satisfied)
- Optional runtime confirmation deferred to Vercel deploy: on the live deploy, ask the agent "create a HIIT class on Monday at 7am with 15 spots" → confirm a draft occurrence row in gymos-demo Neon and that the Schedule tab refreshes without reload; then ask "cancel Friday's spin" (an occurrence with bookings) → confirm a pending dashboard_proposals row with action_name='cancel-occurrence' (not auto-cancelled).
</verification>

<success_criteria>
- view-screen returns schedule context (upcoming occurrences + booking counts + selected occurrence) when the coach is on /gymos/schedule (AEX-01)
- System prompt has a per-tab Schedule section; the agent leads with schedule tools on the Schedule tab and routes cancel/reschedule through propose-action (AEX-01)
- All AE2 schedule actions are named in the system prompt AND documented in AGENTS.md AND present in the registry (AEX-04 two-exposure rule)
- cancel-occurrence + reschedule-occurrence are exposed ONLY through propose-action, never as direct tools
- AES-01 satisfied: the create path is now agent-driven (system-prompt exposure layered on the existing create-class-definition/occurrence actions)
- AE2 phase complete: full schedule lifecycle is agent-driven, gated where high-risk, live-refreshing, and context-aware
</success_criteria>

<output>
After completion, create `.planning/phases/AE2-schedule-write-tools/AE2-03-SUMMARY.md`
</output>
