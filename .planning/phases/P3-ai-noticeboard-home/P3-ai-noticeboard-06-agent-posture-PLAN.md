---
phase: P3-ai-noticeboard-home
plan: 06
type: execute
wave: 3
depends_on: [02, 03]
files_modified:
  - apps/staff-web/server/plugins/agent-chat.ts
  - apps/staff-web/AGENTS.md
  - apps/staff-web/actions/navigate.ts
autonomous: true
requirements: [SC-6]
must_haves:
  truths:
    - "The agent system prompt names the new authoring + propose tools (upsert-section-note, create-task, complete-task, propose-action) so the LLM will call them"
    - "The 'READ-ONLY for the pilot' constraint is removed and replaced with the suggest-and-act (human-in-the-loop) posture"
    - "AGENTS.md documents the suggest-and-act posture, the new actions, and that one-click approve does NOT bypass the worker opt-in/window/template gates"
    - "The navigate action's vocabulary is updated to gymos route names (home/inbox/schedule/members/analytics/campaigns/forms)"
  artifacts:
    - path: "apps/staff-web/server/plugins/agent-chat.ts"
      provides: "Updated systemPrompt naming the new tools + suggest-and-act posture"
      contains: "propose-action"
    - path: "apps/staff-web/AGENTS.md"
      provides: "Documented suggest-and-act agent guide"
      contains: "upsert-section-note"
  key_links:
    - from: "apps/staff-web/server/plugins/agent-chat.ts (systemPrompt)"
      to: "the new P3 actions"
      via: "tool names enumerated in the prompt (the gate that unlocks agent authoring)"
      pattern: "propose-action"
---

<objective>
Update the agent's documented + enforced posture from "read-only for pilot" to "suggest + one-click act" (the locked decision). Three edits: (1) the system prompt in `agent-chat.ts` — name the new authoring/propose tools and remove the READ-ONLY constraint; (2) `apps/staff-web/AGENTS.md` — document the three-tier model + new actions + the gates-still-hold note; (3) the `navigate` action — replace email-centric vocabulary with gymos route names.

Purpose: Backs SC-6 (documented posture matches shipped behavior). CRITICAL per RESEARCH §5: simply adding the action files (Plans 02/03) is NOT enough — the LLM only calls tools the system prompt names. This plan is what actually unlocks agent authoring.
Output: updated systemPrompt + AGENTS.md + navigate descriptions.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md
@apps/staff-web/server/plugins/agent-chat.ts
@apps/staff-web/AGENTS.md
@apps/staff-web/actions/navigate.ts

<interfaces>
<!-- Current systemPrompt (agent-chat.ts) lists 7 read tools and an explicit:
       "You are READ-ONLY for the pilot. You cannot: ... Send WhatsApp messages ..."
     That block MUST be removed and replaced with the suggest-and-act posture.
     The new P3 actions to name: upsert-section-note, create-task, complete-task, propose-action.
     Also surface (already-existing, now agent-usable): send-template-to-members, create-checkout-link are executed ONLY via approve-proposal after coach approval — do NOT tell the agent to call them directly; tell it to use propose-action.
     CRITICAL gate note (locked decision 1): one-click approve does NOT bypass opt-in/24h-window/approved-template — the worker chokepoint still enforces them; the coach approves every send.
     AGENTS.md current sections to revise: "Role" (line ~7 read-only), "Agent Actions" table, "What the Agent CAN Do (read-only for pilot)", "What the Agent CANNOT Do", the create-checkout-link "Pilot-agent posture: ... not listed in the system prompt" note.
     navigate.ts current view enum describes email views (inbox, starred, sent, drafts, ...) — replace with gymos routes. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite the agent system prompt (suggest-and-act + name new tools)</name>
  <read_first>
    - apps/staff-web/server/plugins/agent-chat.ts (the ENTIRE systemPrompt template literal)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md §"System Prompt Update in agent-chat.ts"
    - apps/staff-web/actions/propose-action.ts + upsert-section-note.ts (confirm the exact tool names + their purpose for accurate prompt copy)
  </read_first>
  <action>
Edit the `systemPrompt` string in `apps/staff-web/server/plugins/agent-chat.ts`:

1. In the "Available tools" list, ADD these four tools with one-line usage descriptions:
   - `upsert-section-note` — write/replace the AI note on a dashboard section card (sections: inbox, schedule, members, revenue, ai_today). Use to surface a recommendation or summarise a recent action on the noticeboard.
   - `create-task` — add a prioritized task to the noticeboard Tasks list (priority 1=high..3=low); optionally link a proposal for a one-click action.
   - `complete-task` — mark a task done.
   - `propose-action` — queue a one-click action for the coach to approve (actionName 'send-template-to-members' or 'create-checkout-link' with params + rationale). The coach approves; the gated action then runs.
   Keep the existing read tools (list-fill-rate, list-renewals, list-at-risk-members, list-classes, list-members, view-screen, navigate).

2. REMOVE the entire "You are READ-ONLY for the pilot. You cannot: ..." block.

3. ADD a "How you act" posture block (replace the removed block):
   "You operate human-in-the-loop: suggest, then act on approval.
   - Tier 1 (answer): use the list-* tools to answer questions directly.
   - Tier 2 (author the board): use upsert-section-note to surface recommendations/recent-action notes, and create-task/complete-task to maintain a prioritized Tasks list.
   - Tier 3 (propose then act): to send WhatsApp or generate a Checkout link, call propose-action with the target actionName + params + a clear rationale. The coach approves with one click on the noticeboard; only then does the action run.
   NEVER claim to have sent a message yourself — you propose; the coach approves; the worker sends. One-click approve does NOT bypass compliance: the worker still enforces WhatsApp opt-in, the 24-hour window, and approved-template gates. If a member is out of window or not opted-in, that send will be skipped by the worker."

4. Keep the gym-vocabulary guardrail block (no email/Gmail/Starred/etc.) unchanged.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - agent-chat.ts systemPrompt contains "upsert-section-note", "create-task", "complete-task", and "propose-action"
    - agent-chat.ts no longer contains the literal "You are READ-ONLY for the pilot" (grep returns no match)
    - agent-chat.ts contains "human-in-the-loop" and a sentence stating one-click approve does NOT bypass opt-in / 24-hour window / approved-template gates
    - agent-chat.ts still contains the gym-vocabulary guardrail (e.g. "never reference" + "email")
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>System prompt names the four new tools, removes READ-ONLY, adds the three-tier suggest-and-act posture with the gates-still-hold note; typecheck clean.</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite apps/staff-web/AGENTS.md to the suggest-and-act posture</name>
  <read_first>
    - apps/staff-web/AGENTS.md (the ENTIRE current file)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md §"AGENTS.md Update Plan"
  </read_first>
  <action>
Edit `apps/staff-web/AGENTS.md`:

1. "Role" section: replace "You are read-only for the pilot — coaches still own all mutations through the UI." with a suggest-and-act description: the agent answers questions, authors the noticeboard (section notes + tasks), and proposes one-click actions the coach approves.

2. "Agent Actions (LLM tools)" table: ADD rows for `upsert-section-note`, `create-task`, `complete-task`, `propose-action`, `approve-proposal`, `reject-proposal`, `list-inbox-summary` with their return shapes (from Plans 02/03). Keep the existing rows.

3. Replace the two binary sections "What the Agent CAN Do (read-only for pilot)" and "What the Agent CANNOT Do" with a single "How the Agent Acts" section describing the three tiers:
   - Tier 1 — Read & Report (list-* tools)
   - Tier 2 — Author Dashboard Content (upsert-section-note, create-task, complete-task)
   - Tier 3 — Propose + One-Click Act (propose-action queues; approve-proposal executes the gated action after coach approval; reject-proposal dismisses)

4. Add a CRITICAL note verbatim in spirit: "Proposals for WhatsApp sends ALWAYS route through the existing worker chokepoint. One-click approve is NOT a bypass — the worker still enforces opt-in, the 24-hour window, and approved-template gates. The coach approves every send."

5. Update the existing `create-checkout-link` "Pilot-agent posture: ... not listed in the system prompt" note — it is now reachable via propose-action -> approve-proposal (coach-approved), not called directly by the agent.

6. Remove any remaining "read-only" / "Agent CANNOT send WhatsApp" phrasing so the doc matches the shipped behavior. Keep the "Forbidden Vocabulary" + "Adding a New Gym Action" + "Conventions Inherited" sections intact.
  </action>
  <verify>
    <automated>grep -q "upsert-section-note" apps/staff-web/AGENTS.md && grep -q "propose-action" apps/staff-web/AGENTS.md && grep -q "approve-proposal" apps/staff-web/AGENTS.md && grep -q "list-inbox-summary" apps/staff-web/AGENTS.md && ! grep -qi "read-only for the pilot" apps/staff-web/AGENTS.md && ! grep -qi "What the Agent CANNOT Do" apps/staff-web/AGENTS.md && grep -q "Forbidden Vocabulary" apps/staff-web/AGENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/AGENTS.md contains "upsert-section-note", "create-task", "complete-task", "propose-action", "approve-proposal", "list-inbox-summary"
    - AGENTS.md no longer contains "read-only for the pilot" and no longer contains "Send WhatsApp messages (coach does this" as a CANNOT-do bullet (grep returns no match for "What the Agent CANNOT Do")
    - AGENTS.md contains the three-tier model headings (Read, Author, Propose) and the gate note ("opt-in", "24-hour window", "approved-template" / "approved template", "One-click approve is NOT a bypass" or equivalent)
    - "Forbidden Vocabulary" section is still present (gym-vocabulary guardrail preserved)
  </acceptance_criteria>
  <done>AGENTS.md documents the suggest-and-act three-tier posture, all new actions, and the gates-still-hold note; no stale read-only language remains.</done>
</task>

<task type="auto">
  <name>Task 3: Update navigate action vocabulary to gymos routes</name>
  <read_first>
    - apps/staff-web/actions/navigate.ts (the ENTIRE file — view enum + description still email-centric)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md §"Pitfall 7: Navigate Action Vocabulary Is Email-Centric"
  </read_first>
  <action>
Edit `apps/staff-web/actions/navigate.ts`:
- Change the top-level `description` from "Navigate the UI to a specific view or email thread..." to "Navigate the staff UI to a specific gymos route (home, inbox, schedule, members, analytics, campaigns, forms, settings). Writes a navigate command to application state which the UI reads and auto-deletes."
- Change the `view` param `.describe(...)` from the email list to: "Gymos route to navigate to: home, inbox, schedule, members, analytics, campaigns, forms, settings".
- Leave the runtime logic and the other params untouched (threadId/settingsSection/etc. can remain — they are harmless; do not remove fields to stay strictly additive in behavior). Only the description strings change.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/actions/navigate.ts description no longer says "email thread"; contains "gymos route"
    - The view param .describe contains "home, inbox, schedule, members, analytics, campaigns, forms, settings"
    - Runtime run() logic unchanged (still writeAppState("navigate", nav))
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>navigate action describes gymos routes instead of email views; runtime unchanged; typecheck clean.</done>
</task>

</tasks>

<verification>
- staff-web `tsc --noEmit` clean.
- The system prompt names all four new tools (the unlock mechanism) and the READ-ONLY block is gone (grep).
- AGENTS.md + systemPrompt both carry the "one-click approve is not a bypass" gate note (locked decision 1).
- VERIFICATION CONSTRAINT honored: no local HTTP. These are prompt/doc edits — verified by grep + tsc. Whether the LLM actually calls the new tools end-to-end is exercised in the Plan 07 e2e smoke on the live deploy.
</verification>

<success_criteria>
SC-6 met: the agent's documented + enforced posture matches the shipped suggest-and-act behavior. Combined with Plans 02/03 (actions) this is what lets the agent author the board content Plan 05 renders.
</success_criteria>

<output>
After completion, create `.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-06-SUMMARY.md` noting the final systemPrompt tool list and confirming no stale read-only language remains in either file.
</output>
