---
phase: P1b.1-customer-pilot-enablement
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/components/layout/AppLayout.tsx
  - apps/staff-web/app/components/gymos/GymosTopNav.tsx
autonomous: true
requirements: [INBX-01, INBX-02]
must_haves:
  truths:
    - "Customer navigating to /gymos sees only the gymos top-nav + content + right-rail Chat — no hamburger, no Important/Other tabs, no email Compose, no email sidebar, no refresh, no bell"
    - "GymosTopNav shows seven tabs in order: Inbox, Schedule, Members, Payments, Analytics, Settings"
    - "AgentSidebar appears on the right with emptyStateText 'Ask me anything about your gym' and the three suggestion chips ('Provide renewal numbers', 'Which classes haven't been filled in the last week?', 'Which customers should I reach out to?')"
  artifacts:
    - path: "apps/staff-web/app/components/layout/AppLayout.tsx"
      provides: "Conditional /gymos branch returning AgentSidebar-only wrapper, no AppLayoutInner"
      contains: "location.pathname.startsWith(\"/gymos\")"
    - path: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      provides: "Analytics tab linked to /gymos/analytics, sitting between Payments and Settings"
      contains: "Analytics"
  key_links:
    - from: "apps/staff-web/app/components/layout/AppLayout.tsx"
      to: "AgentSidebar"
      via: "early return for /gymos paths"
      pattern: "startsWith\\(.\\/gymos.\\)"
    - from: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      to: "/gymos/analytics"
      via: "Link to=\"/gymos/analytics\""
      pattern: "to=.\\/gymos\\/analytics."
---

<objective>
Strip the email AppLayout chrome from `/gymos/*` and add the Analytics tab to GymosTopNav.

Purpose: The customer pilot is being handed a deployed staff-web that currently bleeds email-only UI (hamburger menu, Important/Other 25 tabs, email Compose pen, refresh, bell) on top of the gymos surfaces. This plan converts `/gymos/*` into a clean gym product: bare layout (top-nav + content + right-rail Chat only) and surfaces the Analytics tab that the next wave's analytics route will populate.

Output:
- `apps/staff-web/app/components/layout/AppLayout.tsx` — early-return branch for /gymos paths wrapping children in AgentSidebar only
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — Analytics tab added between Payments and Settings
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md
@apps/staff-web/app/components/layout/AppLayout.tsx
@apps/staff-web/app/components/gymos/GymosTopNav.tsx
@apps/staff-web/app/routes/gymos.tsx

<interfaces>
<!-- Relevant existing types and contracts the executor needs. -->

From apps/staff-web/app/components/layout/AppLayout.tsx (current structure):
- `BARE_ROUTES: Set<string>` — set of pathnames that skip ALL layout chrome (line ~79)
- `isStandardLayoutPath(pathname: string): boolean` — returns true for paths that get StandardLayout wrap (line ~88)
- `AppLayout({ children })` — top-level wrapper called from root.tsx; uses `useLocation()` + `useIsMobile()` BEFORE any conditional return; returns `<AgentSidebar position="right" defaultOpen={!isMobile} ...>{content}</AgentSidebar>` where `content` is either StandardLayout or AppLayoutInner (line ~124–151)
- `AppLayoutInner` — separate component containing all the heavy email hooks (useEmails, useSettings, useLabels, useGoogleAuthStatus). Critically: those hooks DO NOT fire when AppLayoutInner is not rendered — verified in research §Pitfall 1.

From `@agent-native/core/client` (already imported in AppLayout.tsx):
- `AgentSidebar` props: `{ position: "right" | "left", defaultOpen: boolean, emptyStateText: string, suggestions: string[], children: ReactNode }`

From apps/staff-web/app/components/gymos/GymosTopNav.tsx (current shape):
- Renders a row of `<Link>` tabs (Inbox, Schedule, Members, Payments, Settings)
- Uses a local `tabClass(active: boolean)` helper for styling
- Active tab detection via `useLocation()` + `pathname.startsWith()` checks
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add /gymos early-return branch to AppLayout.tsx</name>
  <files>apps/staff-web/app/components/layout/AppLayout.tsx</files>
  <read_first>
    - apps/staff-web/app/components/layout/AppLayout.tsx — current full file; verify hook order (useLocation, useIsMobile before any conditional return) and existing AgentSidebar prop usage
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 1. AppLayout.tsx Conditional Return (D-01)" — exact 20-line diff shape
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md §"Surface Specifications > 1. Bare Gymos Layout" — exact emptyStateText + suggestions strings (verbatim required)
  </read_first>
  <action>
Edit `apps/staff-web/app/components/layout/AppLayout.tsx`. Find the function `export function AppLayout({ children }: AppLayoutProps)` body and insert a new conditional return AFTER the existing `if (BARE_ROUTES.has(location.pathname)) { return <>{children}</>; }` and BEFORE the existing `const content = isStandardLayoutPath(...)` block.

Insert exactly this branch (verbatim except formatting):

```tsx
// Gymos paths skip email chrome entirely — AgentSidebar wrap only.
// gymos.tsx provides GymosTopNav + Outlet inside `children`.
if (location.pathname.startsWith("/gymos")) {
  return (
    <AgentSidebar
      position="right"
      defaultOpen={!isMobile}
      emptyStateText="Ask me anything about your gym"
      suggestions={[
        "Provide renewal numbers",
        "Which classes haven't been filled in the last week?",
        "Which customers should I reach out to?",
      ]}
    >
      {children}
    </AgentSidebar>
  );
}
```

The three suggestion strings MUST be verbatim — these are the chips the gym agent (P1b.1-07) must answer end-to-end. The emptyStateText MUST be exactly "Ask me anything about your gym".

Per D-01: do NOT extract a separate `isGymosPath()` helper — inline `location.pathname.startsWith("/gymos")` is sufficient and consistent with the existing BARE_ROUTES pattern.

Do NOT touch `AppLayoutInner` (the email chrome) — leaving it intact preserves dev access to mail routes by typing the URL. Do NOT remove any existing imports. Do NOT change the existing `BARE_ROUTES` set or `isStandardLayoutPath()`.

Run `pnpm --filter staff-web typecheck` after the edit; fix any TypeScript errors before commit.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/app/components/layout/AppLayout.tsx` contains the literal substring `location.pathname.startsWith("/gymos")` exactly once
    - `apps/staff-web/app/components/layout/AppLayout.tsx` contains the literal substring `"Ask me anything about your gym"` exactly once
    - `apps/staff-web/app/components/layout/AppLayout.tsx` contains the literal substring `"Provide renewal numbers"` exactly once
    - `apps/staff-web/app/components/layout/AppLayout.tsx` contains the literal substring `"Which classes haven't been filled in the last week?"` exactly once
    - `apps/staff-web/app/components/layout/AppLayout.tsx` contains the literal substring `"Which customers should I reach out to?"` exactly once
    - `apps/staff-web/app/components/layout/AppLayout.tsx` still contains the existing `BARE_ROUTES` set and `isStandardLayoutPath` function (no accidental deletions)
    - `pnpm --filter staff-web typecheck` exits with code 0
    - The new branch sits AFTER `BARE_ROUTES.has(...)` check and BEFORE `isStandardLayoutPath(...)` check (grep for line numbers to verify ordering)
  </acceptance_criteria>
  <done>
Visiting `/gymos`, `/gymos/schedule`, `/gymos/members`, `/gymos/payments` in the browser shows: no hamburger menu, no "Important"/"Other 25" tabs, no email sidebar, no email Compose pen, no refresh icon, no bell icon. The GymosTopNav (44px tall) sits at the top, content fills the width, and the right-rail AgentSidebar is open by default on desktop with the three suggestion chips visible. Network tab does NOT show requests to `/api/emails`, `/api/labels`, or other email-only endpoints from these /gymos routes (per Pitfall 1).
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Analytics tab to GymosTopNav between Payments and Settings</name>
  <files>apps/staff-web/app/components/gymos/GymosTopNav.tsx</files>
  <read_first>
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx — current file; observe the existing `<Link>` pattern, `tabClass(active)` helper, and active-state detection via `pathname.startsWith()`
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md §"Surface Specifications > 3. Analytics Route" — tab placement contract (between Payments and Settings, text "Analytics", no icon)
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md §"Copywriting Contract" — "Analytics nav tab" row confirms exact label "Analytics"
  </read_first>
  <action>
Edit `apps/staff-web/app/components/gymos/GymosTopNav.tsx`. Add a new tab `<Link>` with text "Analytics" pointing to `/gymos/analytics`, positioned between the existing Payments tab and Settings tab.

Match the EXACT pattern already used by the other tabs in this file:
- Use `<Link to="/gymos/analytics" className={tabClass(pathname.startsWith("/gymos/analytics"))}>Analytics</Link>` (or whatever the local pattern is — read the file first)
- Text content: literal string "Analytics" (title case, no leading/trailing whitespace)
- No icon — analytics is consistent with Members / Payments / Settings (text-only)
- Position: immediately after the Payments `<Link>` and immediately before the Settings `<Link>` in the JSX

Do NOT change the existing nav height (`h-11`), the `tabClass()` helper, the brand wordmark `text-[12px] font-semibold`, or any other tab. This change is one new `<Link>` in the tab row.

Run `pnpm --filter staff-web typecheck` after the edit.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/app/components/gymos/GymosTopNav.tsx` contains the literal substring `to="/gymos/analytics"` exactly once
    - `apps/staff-web/app/components/gymos/GymosTopNav.tsx` contains the literal substring `>Analytics<` exactly once (the tab text wrapped in a JSX element)
    - The "Analytics" Link appears in the file AFTER the Payments Link and BEFORE the Settings Link (verify by grep line numbers: `grep -n "to=\"/gymos/payments\"\|to=\"/gymos/analytics\"\|to=\"/gymos/settings\"" apps/staff-web/app/components/gymos/GymosTopNav.tsx` — line numbers must appear in that order)
    - The file still contains the existing five tabs (Inbox, Schedule, Members, Payments, Settings)
    - `pnpm --filter staff-web typecheck` exits with code 0
  </acceptance_criteria>
  <done>
Visiting any `/gymos/*` route shows the top-nav with six tabs in order: Inbox · Schedule · Members · Payments · Analytics · Settings. Clicking Analytics navigates to `/gymos/analytics` (which 404s until plan 06 lands — acceptable, the tab itself works). The Analytics tab uses the same active-state styling as the other tabs when on `/gymos/analytics`.
  </done>
</task>

</tasks>

<verification>
- `apps/staff-web/app/components/layout/AppLayout.tsx` has the gymos branch in correct position
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` has Analytics tab between Payments and Settings
- TypeScript compiles cleanly across the staff-web app
- Manually loading `/gymos` shows no email chrome — verified by the absence of hamburger / Important/Other / Compose / refresh / bell
</verification>

<success_criteria>
1. `/gymos/*` shows only gymos top-nav + content + right-rail Chat (success criterion #2 from ROADMAP — partial: chrome strip portion)
2. GymosTopNav includes Analytics tab pointing to `/gymos/analytics`
3. AgentSidebar shows exact three chip prompts and exact emptyStateText
4. No TypeScript errors in staff-web
</success_criteria>

<output>
After completion, create `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-01-bare-gymos-layout-SUMMARY.md` summarizing:
- The exact lines inserted into AppLayout.tsx (before/after)
- The exact Analytics Link line inserted into GymosTopNav.tsx
- Confirmation that AppLayoutInner email hooks do not fire on /gymos paths (per Pitfall 1)
- Any deviations from the plan
</output>
