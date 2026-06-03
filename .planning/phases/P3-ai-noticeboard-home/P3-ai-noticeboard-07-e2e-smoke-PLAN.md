---
phase: P3-ai-noticeboard-home
plan: 07
type: execute
wave: 5
depends_on: [01, 02, 03, 04, 05, 06]
files_modified:
  - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-E2E-RESULTS.md
autonomous: false
requirements: [SC-1, SC-2, SC-3, SC-4, SC-5, SC-6]
must_haves:
  truths:
    - "The deployed /gymos noticeboard renders 4 cards + AI-today + Tasks with real computed metrics"
    - "An agent-authored section note + task persist in SQL and survive reload"
    - "A propose -> approve -> execute round-trip works on the live deploy AND an out-of-window/no-opt-in send is still rejected by the worker (gate holds)"
  artifacts:
    - path: ".planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-E2E-RESULTS.md"
      provides: "Recorded pass/fail per success criterion against the live Vercel deploy + Neon"
      contains: "SC-5"
  key_links:
    - from: "live gym-class-os.vercel.app /gymos"
      to: "dashboard_* tables + worker chokepoint"
      via: "human-walked + Neon-verified e2e smoke"
      pattern: "SC-"
---

<objective>
Final end-to-end smoke test on the LIVE Vercel deploy + gymos-demo Neon (the local `agent-native dev` server cannot boot — NitroViteError — so all true runtime checks were deferred here). Confirm all six P3 success criteria against the running system, and specifically prove the security invariant: one-click approve still hits the worker's opt-in/24h-window/approved-template gates.

Purpose: Closes the verification debt the no-local-HTTP constraint forced onto Plans 01–06. This is the only plan that exercises rendering, the agent tool-calling loop, and the propose→approve→execute path over HTTP.
Output: `P3-ai-noticeboard-E2E-RESULTS.md` with a pass/fail line per SC-1..SC-6 + evidence (screenshots/console/Neon query output).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md
@.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-UI-SPEC.md

<interfaces>
<!-- Live deploy: https://gym-class-os.vercel.app (auto-deploys from master). Sign in with a CUSTOMER_ALLOWED_EMAILS account.
     Neon: gymos-demo (billowing-sun-51091059) — query dashboard_notes/tasks/proposals via Neon MCP to confirm persistence.
     Worker: Fly app gymos-edge-webhooks (services/worker) — the sendMessage() chokepoint that must still gate sends.
     Deploy must include Plans 01-06. Migration 0005 must already be applied to gymos-demo Neon (Plan 01).
     The right-rail Chat (AgentSidebar) is the agent surface used to drive Tier 2/Tier 3 from the UI. -->
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: Verify deploy + Plan 01 migration are live, then walk the board render + agent authoring</name>
  <read_first>
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-UI-SPEC.md (so the verifier knows the expected layout/copy)
    - The Plan 01 SUMMARY (confirm 0005 applied to gymos-demo Neon)
  </read_first>
  <what-built>
The noticeboard home (Plans 04/05), the dashboard-state tables + actions (Plans 01/02/03), and the suggest-and-act agent posture (Plan 06), all deployed to gym-class-os.vercel.app.

BEFORE the human walkthrough, the executor does automated pre-checks:
1. Confirm master is deployed (git log shows Plans 01-06 commits; Vercel deploy succeeded). If a deploy is needed, push master and wait for the Vercel build.
2. Via Neon MCP against gymos-demo (billowing-sun-51091059): confirm dashboard_notes/dashboard_tasks/dashboard_proposals exist (information_schema) — Plan 01 applied.
  </what-built>
  <how-to-verify>
SC-1 + SC-2 (render + computed metrics):
  1. Sign in to https://gym-class-os.vercel.app with an allowed account → land on /gymos.
  2. Confirm the noticeboard renders: AI-today strip at top, a 4-card grid (Inbox / Schedule / Members / Revenue), and a Tasks section at the bottom.
  3. Confirm each card's subheading shows a REAL number (not placeholder): Inbox "[N] unread · [M] open", Schedule "[N]% avg fill · [M] classes", Members "[N] active · [M] at risk / no members at risk", Revenue "£[MRR]/mo" + net growth. (Brief skeletons on load are fine; em-dash only if a metric errors.)
  4. Confirm the top-nav has Home + Inbox tabs; clicking Inbox opens the WhatsApp inbox at /gymos/inbox; clicking Home returns to the board.

SC-3 + SC-4 (agent authors persisted content):
  5. In the right-rail Chat, ask: "Summarise member retention and write a note on the Members card." Confirm the agent calls upsert-section-note (section=members) and the Members card shows the note. Reload the page → the note persists.
  6. Ask: "Create a high-priority task to follow up with at-risk members." Confirm a task appears in the Tasks section with a red (priority 1) left strip. Click the complete toggle → it optimistically marks done and disappears on reload.
  7. Via Neon MCP, confirm dashboard_notes has the members note row and dashboard_tasks has the task (status flips to 'completed' after step 6's toggle).
  </how-to-verify>
  <acceptance_criteria>
    - Neon information_schema confirms all three dashboard_* tables exist on gymos-demo before the walkthrough
    - The board renders 4 cards + AI-today strip + Tasks section on the live deploy (human-confirmed)
    - At least the Members and Revenue card subheadings show real computed values (human-confirmed; Neon row counts corroborate)
    - An agent-authored section note row exists in dashboard_notes for section='members' and survives reload (Neon-confirmed)
    - An agent-created task exists in dashboard_tasks and complete-task flips its status to 'completed' (Neon-confirmed)
  </acceptance_criteria>
  <resume-signal>Type "board-verified" when SC-1..SC-4 pass, or describe what failed (which card / which agent call).</resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Walk the propose -> approve -> execute round-trip AND confirm the worker gate still holds</name>
  <read_first>
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-UI-SPEC.md §"Interaction Contracts" (the exact AlertDialog flow + copy)
    - apps/staff-web/actions/approve-proposal.ts (confirm it routes through send-template-to-members)
  </read_first>
  <what-built>
The propose→approve→execute handshake (Plan 03 actions) wired to the noticeboard Approve/Dismiss UI (Plan 05), executing only via the existing gated send-template-to-members / create-checkout-link actions. The worker (Fly services/worker) sendMessage() chokepoint enforces opt-in + 24h-window + approved-template on every send.
  </what-built>
  <how-to-verify>
SC-5 (round-trip works AND gate holds):
  1. In Chat, ask: "Recommend a win-back WhatsApp to lapsing members using the hello_world template." Confirm the agent calls propose-action (actionName=send-template-to-members) and a pending proposal appears in the Members (or Inbox) card's proposal zone with a rationale + "Approve" + "Dismiss proposal".
  2. Click "Approve" → confirm the AlertDialog opens with the verbatim copy: title "Send [N] WhatsApp messages?", body mentioning the template name + "Messages that are out of window or not opted-in will be skipped by the worker. This action cannot be undone."
  3. Click "Send messages" → proposal zone shows loading then disappears; a toast "Sent to [N] members." appears. Via Neon, confirm dashboard_proposals.status='executed' for that row, and messages rows were enqueued (status='queued').
  3a. GATE-PROOF PRECONDITION (set up a guaranteed-failing target before step 4): via Neon MCP against gymos-demo, confirm a usable test subject exists — at least one gym_members row with NO matching whatsapp_opt_in row, OR at least one conversations.last_inbound_at older than 24h. If NEITHER exists, INSERT a throwaway test member with no whatsapp_opt_in row (note its id), use it as the gate-proof target in step 4, and DELETE that test member (and any rows it created) afterward. Record the cleanup explicitly in P3-ai-noticeboard-E2E-RESULTS.md.
  4. GATE PROOF (the security invariant): pick a target member who is OUT OF WINDOW (last_inbound_at > 24h ago) or has NO whatsapp_opt_in row. Propose + approve a NON-template free-text-equivalent path to that member (or inspect the worker outcome for the batch in step 3). Via Neon, confirm that member's message lands status='failed' with error_code in (WINDOW_EXPIRED, NO_OPT_IN) — i.e. the worker rejected it. NO Meta send for that member. This proves one-click approve did NOT bypass the gates.
  5. Dismiss test: propose another action, click "Dismiss proposal" → zone collapses; Neon shows status='rejected' with rejected_at set.

SC-6 (posture matches behavior): confirm the agent never claims to have "sent" a message itself — it proposes, the coach approves. (Observed in step 1-3 chat transcript.)

Record every result in P3-ai-noticeboard-E2E-RESULTS.md with a PASS/FAIL line per SC-1..SC-6 and the supporting Neon query output / toast text / chat transcript snippets. Clean up any test proposals/notes/tasks created purely for the smoke (DELETE the dprop_/dnote_/dtask_ test rows you added that are not meant to persist).
  </how-to-verify>
  <acceptance_criteria>
    - A send proposal reaches status='executed' after coach Approve (Neon-confirmed) with the AlertDialog showing the verbatim send copy
    - At least one targeted member who is out-of-window or not-opted-in lands messages.status='failed' with error_code WINDOW_EXPIRED or NO_OPT_IN (Neon-confirmed) — proving the worker gate held through one-click approve
    - A dismissed proposal reaches status='rejected' with rejected_at (Neon-confirmed)
    - P3-ai-noticeboard-E2E-RESULTS.md exists with an explicit PASS/FAIL line for each of SC-1, SC-2, SC-3, SC-4, SC-5, SC-6
    - Smoke-only test rows cleaned up from dashboard_* tables
  </acceptance_criteria>
  <resume-signal>Type "e2e-passed" when SC-5/SC-6 pass and results are recorded, or describe the failure (which gate / which status).</resume-signal>
</task>

</tasks>

<verification>
- This plan IS the runtime verification deferred from Plans 01-06 (per the no-local-HTTP constraint). It runs against the live Vercel deploy + gymos-demo Neon + Fly worker.
- The load-bearing check is SC-5's gate proof: an out-of-window/no-opt-in send must still land status='failed' (WINDOW_EXPIRED / NO_OPT_IN) even after one-click approve — confirming approve-proposal routes through the worker chokepoint and is NOT a bypass.
- All six success criteria recorded PASS/FAIL in P3-ai-noticeboard-E2E-RESULTS.md with evidence; smoke test rows cleaned up.
</verification>

<success_criteria>
All six ROADMAP P3 success criteria confirmed live. The phase is shippable: the noticeboard is the /gymos home, the agent authors persisted board content, and the propose→approve→execute path works WITH the WhatsApp compliance gates intact.
</success_criteria>

<output>
After completion, create `.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-07-SUMMARY.md` summarising the e2e results and any follow-ups, and ensure P3-ai-noticeboard-E2E-RESULTS.md holds the per-SC evidence. If any SC failed, note it as a gap-closure candidate for `/gsd:plan-phase P3 --gaps`.
</output>
