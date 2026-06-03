---
phase: P3-ai-noticeboard-home
plan: 04
type: execute
wave: 3
depends_on: [02, 03]
files_modified:
  - apps/staff-web/app/routes/gymos.inbox.tsx
  - apps/staff-web/app/routes/gymos._index.tsx
  - apps/staff-web/app/components/gymos/GymosTopNav.tsx
autonomous: true
requirements: [SC-1]
must_haves:
  truths:
    - "The WhatsApp inbox is reachable at /gymos/inbox (moved verbatim from the old index route)"
    - "/gymos index is now the noticeboard route file with a loader returning persisted dashboard state (notes, open tasks, pending proposals)"
    - "GymosTopNav has a Home tab (-> /gymos) and an Inbox tab (-> /gymos/inbox) with correct active-state logic"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.inbox.tsx"
      provides: "Relocated WhatsApp inbox (former gymos._index.tsx content)"
      contains: "enqueueOutboundWhatsApp"
    - path: "apps/staff-web/app/routes/gymos._index.tsx"
      provides: "Noticeboard route: loader fetches dashboard_notes/tasks/proposals; default export renders the board scaffold"
      contains: "dashboardNotes"
    - path: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      provides: "Home + Inbox tabs"
      contains: "/gymos/inbox"
  key_links:
    - from: "apps/staff-web/app/routes/gymos._index.tsx"
      to: "dashboard_notes / dashboard_tasks / dashboard_proposals (Plan 01 tables)"
      via: "loader Promise.all of three Drizzle selects"
      pattern: "schema.dashboard(Notes|Tasks|Proposals)"
    - from: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      to: "/gymos/inbox route"
      via: "<Link to=\"/gymos/inbox\">"
      pattern: "/gymos/inbox"
---

<objective>
Restructure the `/gymos` routing so the noticeboard becomes the post-login landing: (1) move the existing WhatsApp inbox verbatim from `gymos._index.tsx` to a new `gymos.inbox.tsx`; (2) replace `gymos._index.tsx` with the noticeboard route — a loader that fetches persisted dashboard state plus a scaffold default export (the section components land in Plan 05); (3) update `GymosTopNav` to add a Home tab and point Inbox at `/gymos/inbox` with correct active-state logic.

Purpose: Backs SC-1 (the noticeboard becomes the `/gymos` home; 4 cards + AI-today + Tasks scaffold present). Avoids RESEARCH Pitfall 1 (inbox becoming unreachable) by updating the nav in the SAME plan as the route move.
Output: inbox relocated, noticeboard route + loader scaffold, top-nav updated. Plan 05 fills the scaffold with live BoardCards/AiTodayStrip/TasksSection.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-RESEARCH.md
@.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-UI-SPEC.md
@apps/staff-web/app/routes/gymos._index.tsx
@apps/staff-web/app/routes/gymos.tsx
@apps/staff-web/app/components/gymos/GymosTopNav.tsx

<interfaces>
<!-- Layout: apps/staff-web/app/routes/gymos.tsx renders <GymosTopNav /> + <Outlet />.
     The AgentSidebar right-rail is auto-wired for ALL /gymos paths in AppLayout.tsx (no change needed here).
     React Router v7 framework mode: loaders return PLAIN objects (no json() — it is not exported).
     Path alias is @/* only (no ~/*). DB import in routes uses: import { getDb, schema } from "../../server/db";
     drizzle-orm imports: eq, asc.
     New P3 tables (Plan 01): schema.dashboardNotes, schema.dashboardTasks, schema.dashboardProposals.
     Tasks ordering per UI-SPEC: ORDER BY priority ASC, created_at ASC; only status='open'.
     Proposals: only status='pending'.
     GymosTopNav currently: isInbox = path === "/gymos". Tab order today: Inbox, Schedule, Members, Payments, Analytics, Campaigns, Forms, Settings (Settings has ml-auto). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move the WhatsApp inbox to gymos.inbox.tsx (verbatim relocation)</name>
  <read_first>
    - apps/staff-web/app/routes/gymos._index.tsx (the ENTIRE current file — it is the inbox; ~915 lines)
    - apps/staff-web/app/routes/gymos.tsx (confirm the Outlet shell so the moved route renders under it)
  </read_first>
  <action>
Create `apps/staff-web/app/routes/gymos.inbox.tsx` as a VERBATIM copy of the current `apps/staff-web/app/routes/gymos._index.tsx` (loader, action, default component, meta — all of it). React Router v7 framework mode auto-routes `gymos.inbox.tsx` to `/gymos/inbox` under the `gymos.tsx` Outlet, so no route-config change is needed.

Adjust ONLY if needed for the new path:
- The `meta()` title can stay "GymClassOS — WhatsApp Inbox".
- If the file uses any self-referential path string for its own `action`/`Form action` (e.g. `action="/gymos"`), update that literal to `action="/gymos/inbox"` so the reply form posts to the inbox route's action, not the noticeboard index. SEARCH the copied file for the string `"/gymos"` used as a form/fetcher action target and repoint those to `"/gymos/inbox"`. Do NOT change cross-surface deep-links that legitimately point at other routes (e.g. `/gymos/members/:id`).

Do NOT delete `gymos._index.tsx` yet — Task 2 overwrites it with the noticeboard. (Leaving it momentarily means /gymos still serves the inbox until Task 2; acceptable mid-plan.)
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/app/routes/gymos.inbox.tsx exists and contains "enqueueOutboundWhatsApp" and "export async function loader" and "export async function action" (mirrors the inbox's exports)
    - gymos.inbox.tsx contains the TemplatesDialog import (the inbox feature) — confirming a faithful copy
    - Any in-file form/fetcher action target that was `"/gymos"` is now `"/gymos/inbox"` (grep gymos.inbox.tsx for `action="/gymos"` returns ZERO bare `/gymos` form targets; `action="/gymos/inbox"` present if the inbox posts to itself)
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>The full inbox UI + loader + action live at /gymos/inbox; self-referential form action repointed; typechecks.</done>
</task>

<task type="auto">
  <name>Task 2: Replace gymos._index.tsx with the noticeboard route (loader + scaffold)</name>
  <read_first>
    - apps/staff-web/app/routes/gymos._index.tsx (current inbox — about to be overwritten; confirm Task 1 copied it first)
    - apps/staff-web/app/routes/gymos.analytics.tsx (precedent for a gymos route with a Promise.all loader + plain-object return + p-6 board padding)
    - apps/staff-web/server/db/schema.ts (dashboardNotes/Tasks/Proposals column names)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-UI-SPEC.md §"Layout Contract" (the board container markup + bg-muted/40 + p-6)
  </read_first>
  <action>
OVERWRITE `apps/staff-web/app/routes/gymos._index.tsx` with the noticeboard route. Loader fetches persisted dashboard state only (fast single-tenant query); live metrics fetch client-side in Plan 05. Default export renders the board container + a scaffold with clearly-marked placeholders that Plan 05 replaces:

```tsx
// GymClassOS AI Noticeboard — P3 home (replaces the WhatsApp inbox as /gymos index).
// Loader: persisted dashboard state (notes/tasks/proposals). Live list-* metrics
// are fetched client-side via useActionQuery inside the section components (Plan 05).
import { useLoaderData } from "react-router";
import { eq, asc } from "drizzle-orm";
import { getDb, schema } from "../../server/db";

export function meta() {
  return [{ title: "GymClassOS — Home" }];
}

export async function loader() {
  const db = getDb();
  // guard:allow-unscoped — single-tenant gym tables (no ownableColumns)
  const [notes, tasks, proposals] = await Promise.all([
    db.select().from(schema.dashboardNotes),
    db
      .select()
      .from(schema.dashboardTasks)
      .where(eq(schema.dashboardTasks.status, "open"))
      .orderBy(asc(schema.dashboardTasks.priority), asc(schema.dashboardTasks.createdAt)),
    db
      .select()
      .from(schema.dashboardProposals)
      .where(eq(schema.dashboardProposals.status, "pending")),
  ]);
  return { notes, tasks, proposals };
}

export default function Noticeboard() {
  const { notes, tasks, proposals } = useLoaderData<typeof loader>();
  return (
    <div className="flex flex-col gap-4 p-6 h-full overflow-y-auto bg-muted/40">
      {/* AiTodayStrip — Plan 05 */}
      <div data-noticeboard-ai-today className="min-h-[44px]" />
      {/* Section cards — Plan 05 fills with <BoardCard /> */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 xl:grid-cols-4" data-noticeboard-cards />
      {/* Tasks — Plan 05 */}
      <div data-noticeboard-tasks />
    </div>
  );
}
```

Pass `notes`, `tasks`, `proposals` shape forward by keeping them in the loader return (Plan 05 consumes them). Do NOT add the 6 `list-*` queries to this loader (RESEARCH anti-pattern — they go client-side via useActionQuery in Plan 05).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/app/routes/gymos._index.tsx no longer contains "enqueueOutboundWhatsApp" or "TemplatesDialog" (inbox content removed)
    - File contains "schema.dashboardNotes", "schema.dashboardTasks", "schema.dashboardProposals" in a Promise.all loader
    - Loader filters tasks status='open' with orderBy(asc(priority), asc(createdAt)) and proposals status='pending'
    - Default export renders a container with className containing "bg-muted/40" and "p-6" and the three data-noticeboard-* scaffold divs
    - meta() title is "GymClassOS — Home"
    - File contains "guard:allow-unscoped"
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>/gymos index is the noticeboard route: loader returns persisted notes/tasks/proposals; scaffold board container renders; no inbox code remains in the index; typechecks.</done>
</task>

<task type="auto">
  <name>Task 3: Update GymosTopNav — add Home tab, repoint Inbox to /gymos/inbox</name>
  <read_first>
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx (the ENTIRE current file — tab list + active-state logic)
    - .planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-UI-SPEC.md §"GymosTopNav Update — Design Contract" (new tab order + active rules)
  </read_first>
  <action>
Edit `apps/staff-web/app/components/gymos/GymosTopNav.tsx`:

1. Change the active-state booleans:
   - Replace `const isInbox = path === "/gymos";` with:
     `const isHome = path === "/gymos";`
     `const isInbox = path.startsWith("/gymos/inbox");`
2. Add a Home tab as the FIRST `<Link>` (before Inbox), and repoint the Inbox link:
   ```tsx
   <Link to="/gymos" className={tabClass(isHome)}>
     Home
   </Link>
   <Link to="/gymos/inbox" className={tabClass(isInbox)}>
     Inbox
   </Link>
   ```
   (The existing Inbox `<Link to="/gymos">` becomes the Home tab's target; the new Inbox link targets `/gymos/inbox`.)
3. Leave Schedule / Members / Payments / Analytics / Campaigns / Forms / Settings / Sign out untouched. Final tab order: Home | Inbox | Schedule | Members | Payments | Analytics | Campaigns | Forms | Settings | Sign out.

Do NOT add icons to tabs (UI-SPEC: nav icon design is out of P3 scope except the two label/target changes).
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - GymosTopNav.tsx contains `const isHome = path === "/gymos";` and `const isInbox = path.startsWith("/gymos/inbox");`
    - File contains `<Link to="/gymos"` for Home and `<Link to="/gymos/inbox"` for Inbox
    - The string `>Home<` (or `>\n        Home`) appears as a tab label and `>Inbox<` still appears
    - No tab still uses `isInbox` for `path === "/gymos"` (Home owns the exact-match)
    - staff-web tsc --noEmit exits 0
  </acceptance_criteria>
  <done>Top-nav shows Home (-> /gymos, active on exact match) and Inbox (-> /gymos/inbox, active on prefix); inbox reachable; typechecks.</done>
</task>

</tasks>

<verification>
- staff-web `tsc --noEmit` clean after all three tasks.
- Inbox reachable at /gymos/inbox (file present with loader+action+enqueueOutboundWhatsApp); noticeboard owns /gymos index with the persisted-state loader; nav has Home + Inbox with correct active logic (Pitfall 1 avoided).
- VERIFICATION CONSTRAINT honored: no local HTTP. Route wiring verified by tsc + structural greps; the noticeboard loader's three SELECTs can be replayed against gymos-demo Neon (they read the Plan-01 tables — expect rows or empty sets, no error). Actual rendering + navigation is deferred to the Plan 07 e2e smoke on the live Vercel deploy.
</verification>

<success_criteria>
SC-1 structural foundation: /gymos is the noticeboard, inbox relocated + reachable, nav updated. Plan 05 turns the scaffold into the live 4-card board + AI-today strip + Tasks section.
</success_criteria>

<output>
After completion, create `.planning/phases/P3-ai-noticeboard-home/P3-ai-noticeboard-04-SUMMARY.md` noting any self-referential action-target repoints made in the inbox copy, and the confirmed conversations form-action path.
</output>
