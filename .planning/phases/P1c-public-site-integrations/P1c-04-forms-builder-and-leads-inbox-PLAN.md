---
phase: P1c-public-site-integrations
plan: 04
type: execute
wave: 2
depends_on: ["P1c-01", "P1c-02"]
files_modified:
  - apps/staff-web/app/components/forms/FieldRenderer.tsx
  - apps/staff-web/app/components/forms/FieldPropertiesPanel.tsx
  - apps/staff-web/app/routes/gymos.forms._index.tsx
  - apps/staff-web/app/routes/gymos.forms.$id.tsx
  - apps/staff-web/server/routes/api/forms/[...path].ts
  - apps/staff-web/app/components/gymos/GymosTopNav.tsx
  - apps/staff-web/app/routes/gymos._index.tsx
autonomous: false
requirements: [FORMS-02]
must_haves:
  truths:
    - "A staff user can open /gymos/forms, see a list of forms, create a new form, edit its fields, and publish it"
    - "A published form's responses (leads) are viewable in the builder"
    - "Leads (conversations with status='lead') are distinguishable in /gymos via a Leads filter"
    - "The forms builder routes require a staff session (not public)"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.forms._index.tsx"
      provides: "Staff forms list page (loader + create)"
      contains: "loader"
    - path: "apps/staff-web/app/routes/gymos.forms.$id.tsx"
      provides: "Staff form builder page (edit fields, publish)"
      contains: "action"
    - path: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      provides: "Forms tab + Leads filter discoverability"
      contains: "/gymos/forms"
  key_links:
    - from: "apps/staff-web/app/routes/gymos.forms._index.tsx"
      to: "forms CRUD handlers"
      via: "loader fetch /api/forms + form create action"
      pattern: "/api/forms|getDb"
    - from: "apps/staff-web/app/routes/gymos._index.tsx"
      to: "conversations status='lead' filter"
      via: "?filter=leads search param in the inbox loader"
      pattern: "filter|lead"
---

<objective>
Build the staff-facing forms builder (FORMS-02): a `/gymos/forms` list page and a
`/gymos/forms/:id` builder page (forked from the upstream FormsListPage / FormBuilderPage),
behind the existing staff auth. Plus make leads discoverable in `/gymos` via a `?filter=leads`
search param (Claude's-discretion decision: a filter on the existing inbox, NOT a separate
route — favours the cleaner inbox per CONTEXT.md).

Purpose: Without a builder, the studio can't create the lead-capture forms P1c-02's handler
ingests; without a leads filter, leads are buried among open conversations. This plan makes
both usable. It depends on P1c-02 (the forked forms feature slice + forms-schema + CRUD
handlers + auth/publicPaths already exist).

Output: builder list + edit routes, the forks field components, a forms API route, GymosTopNav
Forms tab, and the inbox leads filter.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md
@.planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md
@apps/staff-web/app/components/gymos/GymosTopNav.tsx
@templates/forms/app/pages/FormsListPage.tsx
@templates/forms/app/pages/FormBuilderPage.tsx

<interfaces>
<!-- RR v7 framework mode (CRITICAL — from P1b.1-06 SUMMARY):
     - loaders/actions return PLAIN OBJECTS — there is NO json() export in react-router v7.
     - The ONLY tsconfig path aliases in apps/staff-web are @/* and @shared/* — NOT ~/*.
       Forked components importing from `~/components/*` MUST be rewritten to `@/components/*`.
     - Existing routes use `import { getDb, schema } from "../../server/db"`. -->

<!-- Upstream builder pages use TanStack Query hooks (useForms, useCreateForm, etc.) that hit
     /api/forms endpoints. Two viable adaptation paths — planner chooses at task time:
       (A) Keep the upstream client hooks + wire a single catch-all forms API route that mounts
           the forked CRUD handlers (forms.ts from P1c-02) — least rewriting of the page.
       (B) Convert to RR v7 loader/action data flow — more idiomatic but more rewriting.
     Recommended: (A) — keep the hooks, mount the handlers at /api/forms/* (a STAFF route, NOT
     under the public /api/forms/public/* prefix). The page components stay close to upstream. -->

<!-- Inbox loader (Source: apps/staff-web/app/routes/gymos._index.tsx):
     The loader currently selects ALL conversations with NO status filter (verified — no WHERE on
     status). Adding leads = read ?filter=leads from the URL and, when present, filter the
     conversations query to status='lead'; default (no param) keeps the existing all-statuses
     behaviour OR excludes leads — planner decides, favouring: default shows open+snoozed, a
     "Leads" filter shows status='lead'. Keep it minimal: one search param, no new route. -->

<!-- GymosTopNav (Source: apps/staff-web/app/components/gymos/GymosTopNav.tsx):
     existing tabs link to /gymos, /gymos/schedule, /gymos/members, /gymos/payments,
     /gymos/analytics, /gymos/campaigns, /gymos/settings/integrations via <Link to=...> with a
     tabClass(active) helper. Add a "Forms" tab → /gymos/forms following the same pattern. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fork the field components + builder routes (staff, behind auth)</name>
  <files>apps/staff-web/app/components/forms/FieldRenderer.tsx, apps/staff-web/app/components/forms/FieldPropertiesPanel.tsx, apps/staff-web/app/routes/gymos.forms._index.tsx, apps/staff-web/app/routes/gymos.forms.$id.tsx, apps/staff-web/server/routes/api/forms/[...path].ts</files>
  <read_first>
    - templates/forms/app/components/builder/FieldRenderer.tsx + FieldPropertiesPanel.tsx — copy; rewrite `@agent-native/core/client` + any `~/` imports to staff-web `@/` equivalents
    - templates/forms/app/pages/FormsListPage.tsx — the list page (uses useForms/useCreateForm hooks hitting /api/forms); copy the JSX, adapt to an RR v7 route component
    - templates/forms/app/pages/FormBuilderPage.tsx — the builder; STRIP the agent-native AgentToggleButton / ShareButton / VisibilityBadge (not needed in the pilot — note in SUMMARY)
    - templates/forms/server/handlers/forms.ts (forked into apps/staff-web/features/forms/handlers/forms.ts by P1c-02) — the CRUD handler exports to mount at /api/forms/*
    - apps/staff-web/app/routes/gymos._index.tsx — the RR v7 route file shape (loader signature, plain-object returns, @/ imports, getDb usage)
    - apps/staff-web/tsconfig.json — confirm only @/* and @shared/* aliases exist (no ~/*)
    - .planning/STATE.md §Decisions P1b.1-06 (no json(), no ~/* alias) + P1b.1-05 (@/ alias)
  </read_first>
  <action>
1. **Copy field components** to `apps/staff-web/app/components/forms/`:
   - `FieldRenderer.tsx` and `FieldPropertiesPanel.tsx` from `templates/forms/app/components/builder/`.
   - Rewrite imports: `@agent-native/core/client` → the staff-web equivalents; any `~/components/*`
     → `@/components/*`; fix the relative path to the forked `features/forms/types.ts`.
   - Replace any non-Tabler icons (there should be none — upstream already uses Tabler).

2. **Mount the staff forms CRUD API** at `apps/staff-web/server/routes/api/forms/[...path].ts`:
   - A catch-all resource route that dispatches to the forked CRUD handlers from
     `apps/staff-web/features/forms/handlers/forms.ts` (list/get/create/update/publish/archive).
   - This route is STAFF-only — it sits at `/api/forms/*` which is NOT in publicPaths (only
     `/api/forms/public` is public). The auth guard protects it automatically.
   - Each handler reads the session and resolves the staff user. (If the forked handlers used
     resolveAccess/sharing and P1c-02 stripped it, these are simple single-tenant reads/writes.)

3. **Create `apps/staff-web/app/routes/gymos.forms._index.tsx`** (forms list):
   - RR v7 route. Either keep the upstream TanStack hooks (path A — mount /api/forms above and
     keep useForms/useCreateForm) or use a loader. Match the surrounding staff-web style.
   - Render the GymosTopNav at top. Render a list of forms with create / publish / archive /
     "view responses" + a "Copy embed snippet" affordance (the snippet text is finalised in
     P1c-06; for now show `/f/<slug>` and a placeholder for the <script> line).
   - Optimistic UI on create (CLAUDE.md mandate — navigate to the builder immediately).

4. **Create `apps/staff-web/app/routes/gymos.forms.$id.tsx`** (builder):
   - RR v7 route forked from FormBuilderPage. STRIP AgentToggleButton / ShareButton /
     VisibilityBadge / cloud-upgrade. Keep field add/edit/reorder, settings (title, redirect URL,
     published toggle), and the responses view.
   - Use shadcn primitives already in staff-web (`@/components/ui/*`); Tabler icons only.

Run `pnpm --filter @gymos/staff-web typecheck`.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/app/components/forms/FieldRenderer.tsx` exists; contains NO `~/` import and NO `@agent-native/core/client` import that fails to resolve (typecheck enforces)
    - `apps/staff-web/app/components/forms/FieldPropertiesPanel.tsx` exists
    - `apps/staff-web/app/routes/gymos.forms._index.tsx` exists; contains `GymosTopNav`
    - `apps/staff-web/app/routes/gymos.forms.$id.tsx` exists
    - `gymos.forms.$id.tsx` does NOT contain `AgentToggleButton`, `ShareButton`, or `VisibilityBadge`
    - `apps/staff-web/server/routes/api/forms/[...path].ts` exists and references the forked CRUD handlers
    - No route file calls `json(` (RR v7 plain-object returns)
    - `pnpm --filter @gymos/staff-web typecheck` exits 0
  </acceptance_criteria>
  <done>
Staff can reach /gymos/forms (list) and /gymos/forms/:id (builder); the forms CRUD API is
mounted at the staff-only /api/forms/*; field components are forked with correct aliases.
  </done>
</task>

<task type="auto">
  <name>Task 2: GymosTopNav Forms tab + inbox Leads filter</name>
  <files>apps/staff-web/app/components/gymos/GymosTopNav.tsx, apps/staff-web/app/routes/gymos._index.tsx</files>
  <read_first>
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx — the existing <Link to=...> + tabClass(active) pattern; add a Forms tab consistently
    - apps/staff-web/app/routes/gymos._index.tsx — the loader's conversations query (confirm it has NO status WHERE today) + how it reads url.searchParams; add the leads filter without breaking the existing send action() or member-context panel
    - .planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md §"Open Questions" #2 (filter vs sibling tab — filter chosen)
    - CLAUDE.md "Template UX stays clean" + "Progressive disclosure" — a filter chip, not a new always-visible panel
  </read_first>
  <action>
1. **Add a "Forms" tab** to `GymosTopNav.tsx`: a `<Link to="/gymos/forms">` using the same
   `tabClass(isForms)` pattern as the other tabs, with `isForms = pathname.startsWith("/gymos/forms")`.
   Use a Tabler icon consistent with the other tabs (e.g. `IconForms` or `IconClipboardList`).

2. **Add the Leads filter** to the inbox `/gymos` (`gymos._index.tsx`):
   - In the loader, read `const filter = url.searchParams.get("filter");`.
   - When `filter === "leads"`, filter the conversations query to `status === 'lead'`
     (`where(eq(schema.conversations.status, "lead"))`).
   - Default (no filter param): keep the conversations list showing non-lead statuses
     (open/snoozed/closed as today) OR show all — favour: default EXCLUDES leads
     (`where(ne(schema.conversations.status, "lead"))` or equivalent) so the inbox stays focused
     and leads live behind the chip. Pick whichever keeps the inbox cleanest and document it.
   - In the inbox UI, add a small filter affordance: two chips/links — "Inbox" (no param) and
     "Leads" (`?filter=leads`) — using shadcn Button variants or links, near the conversation
     list header. Use a Tabler icon for the Leads chip. Keep it minimal (progressive disclosure;
     do NOT add a heavy filter bar).
   - Do NOT break the existing send `action()`, the member-context panel, or the window-state
     badges (P1b-08). Only the conversations list query + a chip change.

Run `pnpm --filter @gymos/staff-web typecheck`.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `GymosTopNav.tsx` contains a `<Link to="/gymos/forms"` 
    - `gymos._index.tsx` loader reads `searchParams.get("filter")`
    - `gymos._index.tsx` contains a `status` filter referencing `"lead"` (e.g. `eq(schema.conversations.status, "lead")`)
    - The inbox UI contains a `?filter=leads` link/chip
    - No new always-visible filter toolbar was added (a single Inbox/Leads chip pair is the cap)
    - The existing send `action` export and member-context panel code are still present (not removed)
    - `pnpm --filter @gymos/staff-web typecheck` exits 0
  </acceptance_criteria>
  <done>
A Forms tab links to the builder; leads are reachable via /gymos?filter=leads and visually
separated from the working inbox.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verify the builder loop + leads filter</name>
  <what-built>
The staff forms builder (list + edit), the forms CRUD API, the GymosTopNav Forms tab, and the
inbox Leads filter. This checkpoint walks the builder UI and confirms leads from P1c-02 surface
under the filter (runtime UI verification can't be done by grep).
  </what-built>
  <how-to-verify>
1. Boot: `pnpm --filter @gymos/staff-web dev` (:8081), sign in as a staff account.
2. Click the **Forms** tab in the top nav → lands on `/gymos/forms`.
3. **Create a form** — give it a title (e.g. "Trial Signup"), add fields: a Name (text), an
   Email (email), and a Phone (text labelled "Phone"). Publish it. Note its `/f/<slug>`.
4. Open `http://localhost:8081/f/<slug>` in a private window — the public form renders.
5. Submit it (name + email + UK phone). Back in the builder, open the form's **responses** —
   the submission appears.
6. Go to `/gymos?filter=leads` — the lead conversation from step 5 appears in the Leads view.
   Go to `/gymos` (no param) — confirm the inbox stays focused (leads not cluttering it per the
   chosen default).
7. Confirm the UI is clean (no AgentToggle/Share leftovers, no heavy filter toolbar).

Confirm the builder create→publish→submit→responses→leads-filter loop works, or describe issues.
  </how-to-verify>
  <resume-signal>Type "builder working" once create/publish/submit/responses + the leads filter all work, or describe the failure.</resume-signal>
</task>

</tasks>

<verification>
- /gymos/forms list + /gymos/forms/:id builder render behind auth
- Forms CRUD API mounted at staff-only /api/forms/*
- Forms tab in GymosTopNav
- /gymos?filter=leads shows status='lead' conversations; default inbox stays focused
- typecheck passes; no json(); no ~/ aliases; Tabler icons only
</verification>

<success_criteria>
1. Staff can build + publish lead-capture forms (FORMS-02)
2. Responses are viewable in the builder
3. Leads are discoverable in /gymos via a filter (clean inbox, no new route)
</success_criteria>

<output>
After completion, create `.planning/phases/P1c-public-site-integrations/P1c-04-forms-builder-and-leads-inbox-SUMMARY.md` documenting:
- Adaptation path chosen (kept upstream hooks vs RR v7 loader/action)
- What was stripped from the builder (AgentToggle/Share/VisibilityBadge/cloud-upgrade)
- The default inbox behaviour chosen (exclude leads vs show all) and the filter param shape
- Any alias rewrites needed (~/ → @/) in the forked components
</output>
