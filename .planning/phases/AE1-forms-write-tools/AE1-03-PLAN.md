---
phase: AE1-forms-write-tools
plan: 03
type: execute
wave: 3
depends_on: ["01", "02"]
files_modified:
  - apps/staff-web/actions/view-screen.ts
  - apps/staff-web/server/plugins/agent-chat.ts
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [AEX-01, AEX-04]
must_haves:
  truths:
    - "When the coach is on /gymos/forms, view-screen returns the forms list (and the selected form, if any) so the agent is context-aware of the active tab"
    - "The agent-chat.ts system prompt is organized into per-tab capability sections (not a flat list) and includes a Forms section naming all 7 new actions"
    - "The system prompt instructs the agent to publish via propose-action({ actionName: 'publish-form', ... }), never by calling publish-form directly"
    - "AGENTS.md Agent Actions table documents all 7 new forms actions (two-exposure rule)"
  artifacts:
    - path: "apps/staff-web/actions/view-screen.ts"
      provides: "forms branch returning forms list + selected form for AEX-01 context-awareness"
      contains: "forms"
    - path: "apps/staff-web/server/plugins/agent-chat.ts"
      provides: "per-tab system prompt with a Forms section"
      contains: "create-form"
    - path: "apps/staff-web/AGENTS.md"
      provides: "Agent Actions table rows for the 7 new forms actions"
      contains: "create-form"
  key_links:
    - from: "apps/staff-web/actions/view-screen.ts"
      to: "schema.forms"
      via: "nav.view === 'forms' branch queries forms via getDb()"
      pattern: "nav\\.view === \"forms\""
    - from: "apps/staff-web/server/plugins/agent-chat.ts"
      to: "the 7 forms actions shipped in AE1-01 + AE1-02"
      via: "systemPrompt names each action in a per-tab Forms section"
      pattern: "update-form-fields"
---

<objective>
Expose the forms write tools to the agent — the LAST wave of AE1. Add a forms branch to `view-screen` (so the agent knows which forms exist and what's selected when the coach is on the Forms tab), restructure the flat system prompt in `agent-chat.ts` into per-tab capability sections with a Forms section, and document all 7 new actions in AGENTS.md.

Purpose: Per the two-exposure invariant, an action only becomes agent-callable once it is BOTH in the actions registry (shipped in Waves 1+2) AND named in the system prompt. This wave performs the second exposure. It ships LAST so the agent never hallucinates calls to actions that don't exist yet (RESEARCH Pitfall 4 + STATE.md "system-prompt ships last" constraint). AEX-01 (context-aware per-tab prompt) and AEX-04 (two-exposure documentation) are realized here.

Output: edits to view-screen.ts (forms branch), agent-chat.ts (per-tab restructure + Forms section), and AGENTS.md (7 action rows). NO new action files in this plan — they all exist from AE1-01/AE1-02.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/AE1-forms-write-tools/AE1-RESEARCH.md
@apps/staff-web/AGENTS.md

<interfaces>
<!-- view-screen.ts current structure (apps/staff-web/actions/view-screen.ts): -->
<!-- run() reads navigation app-state via readAppState("navigation"); nav = navigation as any. -->
<!-- It branches on nav.view ("draft-queue", else email list) — all Mail-centric. -->
<!-- We ADD a `nav.view === "forms"` branch that fills screen.forms (and screen.selectedForm if nav.formId). -->
<!-- IMPORTANT: view-screen.ts currently has NO db import. Add a dynamic import inside the branch: -->
<!--   const { getDb, schema } = await import("../server/db/index.js"); -->
<!--   const { isNull, eq } = await import("drizzle-orm"); -->

<!-- agent-chat.ts current systemPrompt (apps/staff-web/server/plugins/agent-chat.ts lines 18-53): -->
<!-- ONE flat "Available tools" list + a three-tier "How you act" section. -->
<!-- The 7 forms actions to name: create-form, update-form-fields, update-form-meta, -->
<!--   unpublish-form, archive-form, restore-form (direct) + publish-form (gated via propose-action). -->

<!-- Forms shipped earlier: -->
<!--   create-form({title, description?}) -> {id,title,slug} -->
<!--   update-form-fields({formId, fields[]}) -> {updated, fieldCount} | {error} -->
<!--   update-form-meta({formId, title?, description?, settings?}) -> {updated} -->
<!--   unpublish-form({formId}) -> {unpublished} -->
<!--   archive-form({formId}) -> {archived} ; restore-form({formId}) -> {restored} -->
<!--   publish-form({formId}) -> via propose-action({actionName:"publish-form", params:{formId}, rationale}) -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add a forms branch to view-screen for AEX-01 context-awareness</name>
  <files>apps/staff-web/actions/view-screen.ts</files>
  <read_first>
    - apps/staff-web/actions/view-screen.ts (FULL file — the run() fn and its nav branching at lines 232-313)
    - apps/staff-web/app/routes/gymos.forms._index.tsx loader (the columns to mirror: id, title, status, slug, updatedAt)
    - apps/staff-web/server/db/index.ts (getDb/schema export shape)
  </read_first>
  <action>
    Edit `apps/staff-web/actions/view-screen.ts`. Inside `run()`, the existing branch chain is: `if (nav?.view === "draft-queue") { ... } else if (nav?.view) { ...email list... }`. Insert a `forms` branch BEFORE the generic `else if (nav?.view)` email branch so `/gymos/forms` does NOT fall through into Gmail logic. Concretely, change the `else if (nav?.view)` (currently line 272) into a chain that checks forms first:

    Replace:
    ```typescript
    } else if (nav?.view) {
      const emails = await fetchEmailList(nav.view, nav.search, nav.label);
    ```
    with:
    ```typescript
    } else if (nav?.view === "forms") {
      // AEX-01 — context-aware of the Forms tab. Surface the forms list (and the
      // selected form, if any) so the agent knows what exists before writing.
      const { getDb, schema } = await import("../server/db/index.js");
      const { isNull, eq } = await import("drizzle-orm");
      const db = getDb();
      // guard:allow-unscoped — single-tenant gym forms
      const forms = await db
        .select({
          id: schema.forms.id,
          title: schema.forms.title,
          status: schema.forms.status,
          slug: schema.forms.slug,
          updatedAt: schema.forms.updatedAt,
        })
        .from(schema.forms)
        .where(isNull(schema.forms.deletedAt));
      screen.forms = forms;
      if (nav?.formId) {
        // guard:allow-unscoped — single-tenant gym forms
        const [form] = await db
          .select()
          .from(schema.forms)
          .where(eq(schema.forms.id, nav.formId))
          .limit(1);
        if (form) {
          screen.selectedForm = {
            ...form,
            fields: JSON.parse(form.fields),
            settings: JSON.parse(form.settings),
          };
        }
      }
    } else if (nav?.view) {
      const emails = await fetchEmailList(nav.view, nav.search, nav.label);
    ```
    Leave the rest of `run()` (the email-list mapping, the thread branch, the empty-screen fallback) unchanged.

    Run `npx prettier --write apps/staff-web/actions/view-screen.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - view-screen.ts contains a branch `else if (nav?.view === "forms")` placed BEFORE the generic `else if (nav?.view)` email branch
    - The forms branch dynamically imports `getDb`/`schema` from `../server/db/index.js` and `isNull`/`eq` from `drizzle-orm`
    - The forms branch assigns `screen.forms` and (when `nav.formId` is set) `screen.selectedForm`
    - Both queries in the forms branch carry `// guard:allow-unscoped`
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>view-screen returns forms context for the Forms tab without falling through to Gmail email logic; tsc passes.</done>
</task>

<task type="auto">
  <name>Task 2: Restructure agent-chat.ts system prompt into per-tab sections with a Forms section</name>
  <files>apps/staff-web/server/plugins/agent-chat.ts</files>
  <read_first>
    - apps/staff-web/server/plugins/agent-chat.ts (FULL file — the systemPrompt template literal lines 18-53)
    - .planning/phases/AE1-forms-write-tools/AE1-RESEARCH.md "agent-chat.ts current system prompt structure" (the recommended per-tab layout)
    - apps/staff-web/actions/create-form.ts, update-form-fields.ts, update-form-meta.ts, unpublish-form.ts, archive-form.ts, restore-form.ts, publish-form.ts (the exact action names + return shapes to describe)
  </read_first>
  <action>
    Edit the `systemPrompt` string in `apps/staff-web/server/plugins/agent-chat.ts` (AEX-01 + AEX-04). Two changes:

    (1) In the `propose-action` tool line (currently line 41), change
    `(actionName: 'send-template-to-members' or 'create-checkout-link', with params + rationale)`
    to
    `(actionName: 'send-template-to-members', 'create-checkout-link', or 'publish-form', with params + rationale)`.

    (2) Append a new per-tab Forms section. Insert it AFTER the existing `suggest-template-vars` tool line (line 42) and BEFORE the `How you act — three tiers:` line (line 44). Add this block verbatim:
    ```
    
    Forms tab (when the coach is on /gymos/forms — call view-screen first to see which forms exist and which is selected):
    - create-form — create a new lead-capture form as a draft ({title, description?}). Returns {id, title, slug}.
    - update-form-fields — replace a form's fields array ({formId, fields}). Fields are Zod-validated and XSS-guarded; malformed fields are rejected, never saved. Pass the COMPLETE desired fields array (this replaces, not merges).
    - update-form-meta — edit a form's title, description, and settings ({formId, title?, description?, settings?}). Never changes status or slug.
    - unpublish-form — revert a published form to draft, taking it offline ({formId}). Direct, no approval.
    - archive-form / restore-form — soft-delete or restore a form ({formId}). Archiving also takes a live form offline.
    - To PUBLISH a form: do NOT call any publish tool directly. Call propose-action({ actionName: "publish-form", params: { formId }, rationale }). The coach approves on the noticeboard; only then does the form go live at /f/{slug}.
    ```
    Note: `publish-form` MUST NOT be named as a directly-callable tool anywhere in the prompt — the only path is via propose-action (RESEARCH Anti-Pattern: "Calling publish-form directly"). The bullet above is the only mention and it routes through propose-action.

    Run `npx prettier --write apps/staff-web/server/plugins/agent-chat.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - agent-chat.ts systemPrompt contains a Forms section that names: create-form, update-form-fields, update-form-meta, unpublish-form, archive-form, restore-form
    - agent-chat.ts systemPrompt contains the string `propose-action({ actionName: "publish-form"` (the publish-via-propose instruction)
    - agent-chat.ts systemPrompt does NOT list `publish-form` as a standalone directly-callable tool bullet (grep: there is no line of the form `- publish-form —`)
    - agent-chat.ts propose-action tool line mentions `publish-form` in its allowed actionName list
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>The system prompt has a per-tab Forms section naming the 6 direct actions and routing publish through propose-action; publish-form is never offered as a direct tool.</done>
</task>

<task type="auto">
  <name>Task 3: Document the 7 new forms actions in AGENTS.md (two-exposure rule)</name>
  <files>apps/staff-web/AGENTS.md</files>
  <read_first>
    - apps/staff-web/AGENTS.md (the "Agent Actions (LLM tools)" table + the "Adding a New Gym Action" section + the create-class-definition/occurrence two-exposure note)
    - apps/staff-web/actions/create-form.ts, update-form-fields.ts, update-form-meta.ts, unpublish-form.ts, archive-form.ts, restore-form.ts, publish-form.ts (final return shapes to document)
  </read_first>
  <action>
    Edit `apps/staff-web/AGENTS.md`. Add SEVEN rows to the "Agent Actions (LLM tools)" markdown table (the table whose header is `| Tool | Tier | Use For | Returns |`). Insert these rows (place them after the `import-leads` / `create-class-occurrence` block, keeping table alignment — match the existing pipe formatting):

    | `create-form` | — | Create a new lead-capture form as a draft (title, optional description). Returns the new form id + slug. | `{id, title, slug}` |
    | `update-form-fields` | — | Replace a form's fields array (add/remove/reorder). Zod-validated + XSS-guarded; malformed fields rejected, never saved. Pass the complete fields array (replaces, not merges). | `{updated, fieldCount}` or `{error}` |
    | `update-form-meta` | — | Edit a form's title, description, and settings (submit text, success message). Never changes status or slug. | `{updated: true}` |
    | `unpublish-form` | — | Revert a published form to draft (takes it offline). Direct, no approval. | `{unpublished: true}` |
    | `archive-form` | — | Soft-delete a form (also takes a live form offline). Reversible with restore-form. | `{archived: true}` |
    | `restore-form` | — | Restore an archived form (returns it as a draft). | `{restored: true}` |
    | `publish-form` | — | Make a draft form live at /f/{slug}. **Gated — reached only via `propose-action({actionName:"publish-form"})`; NOT called directly by the agent.** Re-validates fields before going live. | `{published: true, slug}` |

    Then update the `propose-action` row in the same table: change its "Use For" text from
    `(actionName: send-template-to-members or create-checkout-link, params + rationale)`
    to
    `(actionName: send-template-to-members, create-checkout-link, or publish-form, params + rationale)`.

    Finally, add a short note under the table (mirroring the existing create-class-definition two-exposure note) confirming AE1 forms actions are now BOTH registered and named in the system prompt:
    > **Two-exposure rule — AE1 forms actions.** The seven forms actions above (`create-form`, `update-form-fields`, `update-form-meta`, `unpublish-form`, `archive-form`, `restore-form`, and the gated `publish-form`) are exposed to the agent: action files are in `actions/` (auto-registered) AND named in the `agent-chat.ts` system prompt Forms section. `publish-form` is reachable only through `propose-action` — never as a direct tool.

    Run `npx prettier --write apps/staff-web/AGENTS.md`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx prettier --check AGENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - AGENTS.md Agent Actions table contains rows for all 7: create-form, update-form-fields, update-form-meta, unpublish-form, archive-form, restore-form, publish-form
    - The publish-form row states it is gated / reached only via propose-action and NOT called directly
    - The propose-action row's "Use For" text mentions `publish-form`
    - AGENTS.md contains a "Two-exposure rule — AE1 forms actions" note
    - `cd apps/staff-web && npx prettier --check AGENTS.md` reports no issues
  </acceptance_criteria>
  <done>All 7 forms actions documented in AGENTS.md with the gated publish-form clearly marked; two-exposure note present.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` exits 0 (view-screen + agent-chat edits compile)
- grep proves the agent-chat.ts Forms section names all 6 direct actions and routes publish via propose-action
- grep proves `- publish-form —` does NOT appear as a standalone tool bullet in agent-chat.ts (publish only via propose-action)
- AGENTS.md documents all 7 actions; prettier --check clean
- Whole-phase check: every AE1 action file from AE1-01/AE1-02 now appears in BOTH the system prompt (agent-chat.ts) and AGENTS.md (two-exposure rule satisfied)
- Optional runtime confirmation deferred to Vercel deploy: on the live deploy, ask the agent "create a form called AE1 Test" → confirm a draft row in gymos-demo Neon and that the Forms tab refreshes without reload; then ask "publish it" → confirm a pending dashboard_proposals row (not auto-published)
</verification>

<success_criteria>
- view-screen returns forms context when the coach is on /gymos/forms (AEX-01)
- System prompt is per-tab with a Forms section; agent leads with forms tools on the Forms tab (AEX-01)
- All 7 forms actions are named in the system prompt AND documented in AGENTS.md (AEX-04 two-exposure rule)
- publish-form is exposed ONLY through propose-action, never as a direct tool
- AE1 phase complete: full forms lifecycle is agent-driven, gated where member-visible, live-refreshing, and context-aware
</success_criteria>

<output>
After completion, create `.planning/phases/AE1-forms-write-tools/AE1-03-SUMMARY.md`
</output>
