---
phase: P1b.1-customer-pilot-enablement
plan: 01
subsystem: ui

tags: [react-router-v7, AgentSidebar, AppLayout, gymos, chrome-strip, navigation]

# Dependency graph
requires:
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
    provides: apps/staff-web scaffold + GymosTopNav (Inbox/Schedule/Members/Payments/Settings) + AgentSidebar wrapped at AppLayout level (with rebranded gym empty-state strings via commit abe558fa)
provides:
  - "AppLayout early-return branch for /gymos/* that renders ONLY AgentSidebar + children (no AppLayoutInner, no StandardLayout, no email header, no email sidebar)"
  - "GymosTopNav Analytics tab linking to /gymos/analytics (sits between Payments and Settings)"
  - "Gym-themed AgentSidebar (empty-state + 3 chip prompts) is now scoped to /gymos/* paths only — non-gymos paths revert to original Mail email-themed strings"
affects: [P1b.1-02-auth-allowlist, P1b.1-05-templates-dialog, P1b.1-06-analytics-route, P1b.1-07-gym-agent-surface, P1b.1-08-end-to-end-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AppLayout early-return per surface family — third branch alongside BARE_ROUTES and isStandardLayoutPath; consistent with existing pattern; AppLayoutInner email hooks (useEmails/useSettings/useLabels/useGoogleAuthStatus) DO NOT fire when not rendered (Pitfall 1 from RESEARCH.md confirmed)"
    - "Gym-themed AgentSidebar copy is conditional on /gymos prefix — non-gymos chrome keeps mail-themed empty-state; clean separation between vertical-specific UX and upstream template"

key-files:
  created: []
  modified:
    - "apps/staff-web/app/components/layout/AppLayout.tsx — added /gymos early-return branch (lines 131-150); reverted outer-wrapper AgentSidebar to email-themed strings (lines 159-164)"
    - "apps/staff-web/app/components/gymos/GymosTopNav.tsx — added Analytics Link between Payments and Settings (line 49-51), plus isAnalytics active-state derivation"

key-decisions:
  - "Reverted outer-wrapper AgentSidebar (non-gymos branch) from gym-themed strings back to Mail original ('Ask me anything about your emails' + 3 email-themed prompts) — required to satisfy plan acceptance criterion that the 5 gym strings appear exactly once. The gym strings were leaking onto /inbox, /sent, /settings, etc. via the prior quick rebrand (commit abe558fa). This plan corrects that scoping bug as part of the chrome strip."
  - "Inlined location.pathname.startsWith('/gymos') per D-01 — no isGymosPath() helper, consistent with BARE_ROUTES.has() pattern"

patterns-established:
  - "Per-surface-family chrome branching in AppLayout.tsx: BARE_ROUTES.has() → no chrome | startsWith('/gymos') → AgentSidebar+children only | isStandardLayoutPath() → StandardLayout | default → AppLayoutInner (email chrome)"

requirements-completed: [INBX-01, INBX-02]

# Metrics
duration: 7min
completed: 2026-05-25
---

# Phase P1b.1 Plan 01: Bare Gymos Layout Summary

**`/gymos/*` now skips the email AppLayout chrome (hamburger, Important/Other tabs, email sidebar, Compose pen, refresh icon, bell) and renders only the gymos top-nav + content + right-rail AgentSidebar; GymosTopNav grows an Analytics tab between Payments and Settings.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-25T21:51:24Z
- **Completed:** 2026-05-25T21:58:41Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `/gymos/*` paths now bypass `AppLayoutInner` entirely — none of the email-only React Query hooks (`useEmails`, `useSettings`, `useLabels`, `useGoogleAuthStatus`) fire on gymos routes, so no `/api/emails` or `/api/labels` requests are issued from `/gymos`. (Per Pitfall 1 in RESEARCH.md, hooks declared inside `AppLayoutInner` only run when that component renders; the early-return branch ensures it doesn't.)
- `GymosTopNav` now shows six tabs in order: **Inbox · Schedule · Members · Payments · Analytics · Settings**. The Analytics Link points to `/gymos/analytics` (404s until plan 06 lands; tab itself works).
- The gym-themed AgentSidebar (`emptyStateText="Ask me anything about your gym"` + the three plan-mandated chip prompts) is now scoped to `/gymos/*` only — leaking those strings onto non-gymos routes (`/inbox`, `/sent`, `/settings`) is corrected as part of this plan.

## Task Commits

Each task was committed atomically (parallel-executor `--no-verify`):

1. **Task 1: Add /gymos early-return branch to AppLayout.tsx** — `00d363c5` (feat)
2. **Task 2: Add Analytics tab to GymosTopNav** — `07aa7d76` (feat)

## Files Created/Modified

### `apps/staff-web/app/components/layout/AppLayout.tsx`

Inserted new early-return branch **after** the existing `BARE_ROUTES.has(...)` check and **before** the existing `const content = isStandardLayoutPath(...)` block:

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

Also reverted the outer-wrapper AgentSidebar (now scoped to non-gymos paths) from gym-themed strings back to Mail's original strings:

```tsx
// before (incorrectly applied to all non-bare paths via prior rebrand commit abe558fa)
emptyStateText="Ask me anything about your gym"
suggestions={[
  "Provide renewal numbers",
  "Which classes haven't been filled in the last week?",
  "Which customers should I reach out to?",
]}

// after (Mail template original — only seen on /inbox, /sent, /settings, etc.)
emptyStateText="Ask me anything about your emails"
suggestions={[
  "Summarize my unread emails",
  "What needs my reply today?",
  "Build me a custom widget for my inbox",
]}
```

### `apps/staff-web/app/components/gymos/GymosTopNav.tsx`

Inserted Analytics tab between Payments and Settings (also added `isAnalytics` active-state derivation):

```tsx
const isAnalytics = path.startsWith("/gymos/analytics");
// ...
<Link to="/gymos/analytics" className={tabClass(isAnalytics)}>
  Analytics
</Link>
```

Position confirmed via grep — lines: Payments (46) → Analytics (49) → Settings (53).

## AppLayoutInner Hook Inertness (Pitfall 1 Confirmation)

Per the plan's done criteria, no `/api/emails`, `/api/labels`, `/api/settings` requests should fire from `/gymos/*`. This is mechanically guaranteed by React's hook rules: hooks declared inside `AppLayoutInner` only execute when `AppLayoutInner` is mounted. The early-return branch added in Task 1 returns BEFORE the `content` expression that conditionally renders `AppLayoutInner`, so on any `/gymos/*` path, `AppLayoutInner` is never instantiated and none of its hooks (`useEmails`, `useSettings`, `useLabels`, `useGoogleAuthStatus`) fire. Verified by reading lines 131-156 of the updated `AppLayout.tsx`: the `/gymos` branch returns early; the `AppLayoutInner` instantiation lives at line 153 and is therefore unreachable on `/gymos/*` paths.

## Decisions Made

- **Outer-wrapper AgentSidebar reverted to mail-themed strings** (see Key Decisions). Required to satisfy the plan's "exactly once" acceptance criterion for the 5 gym literals. The reverted strings (`"Ask me anything about your emails"` + three email prompts) were copied from the pre-rebrand state at commit `abe558fa^` to keep the revert clean and traceable.
- **Inlined `startsWith('/gymos')` check** per D-01 — no helper function extracted. Consistent with the sibling `BARE_ROUTES.has(...)` and `isStandardLayoutPath(...)` patterns in the same function.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical Functionality / Scoping Bug] Reverted outer-wrapper AgentSidebar from gym-themed strings to Mail-template originals**

- **Found during:** Task 1 (after adding the early-return branch, the same gym strings still appeared inside the existing outer-wrapper AgentSidebar at lines 159-164)
- **Issue:** Prior commit `abe558fa` ("feat(staff-web): rebrand agent sidebar empty state for GymOS") applied gym-themed `emptyStateText` and 3 chip prompts to the AppLayout's *single* AgentSidebar wrapper, which wraps *every* non-bare path — including `/inbox`, `/sent`, `/settings`, etc. After Task 1 added the /gymos branch, the same strings appeared twice, violating the plan's "exactly once" acceptance criterion AND meaning the gym empty-state was still leaking onto every email-chrome route. Either was unacceptable.
- **Fix:** Reverted the outer (non-gymos) `AgentSidebar` to the Mail template's original strings (`"Ask me anything about your emails"` + `"Summarize my unread emails" / "What needs my reply today?" / "Build me a custom widget for my inbox"`). Strings copied from the pre-rebrand revision of the file at `git show abe558fa^:apps/staff-web/app/components/layout/AppLayout.tsx`.
- **Files modified:** `apps/staff-web/app/components/layout/AppLayout.tsx` (lines 159-165 in the post-edit file)
- **Verification:** `grep` confirms each of the 5 gym literals appears exactly once; typecheck passes; non-gymos paths now see mail-themed copy (matches upstream Mail template behaviour).
- **Committed in:** `00d363c5` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — scoping bug in prior commit corrected as a precondition for this plan's acceptance criteria)
**Impact on plan:** Necessary to satisfy "exactly once" criteria + plan's explicit intent that gym AgentSidebar wraps ONLY `/gymos/*`. No scope creep — actually narrows the prior rebrand's blast radius.

## Issues Encountered

- Parallel agents had also touched the working tree (modifications to `apps/staff-web/server/plugins/auth.ts`, new files `apps/staff-web/.env.example` and `apps/staff-web/actions/list-fill-rate.ts`). Handled by staging *only* the files this plan owns (`AppLayout.tsx`, `GymosTopNav.tsx`) — never `git add .` or `git add -A` per the parallel-executor protocol.

## Self-Check: PASSED

- `apps/staff-web/app/components/layout/AppLayout.tsx` — present, contains `location.pathname.startsWith("/gymos")` once, contains each of the 4 gym strings once, retains BARE_ROUTES + isStandardLayoutPath
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — present, contains `to="/gymos/analytics"` once, `>Analytics<` once, line order Payments(46) → Analytics(49) → Settings(53)
- Commit `00d363c5` exists (verified via `git log --oneline -5`)
- Commit `07aa7d76` exists (verified via `git log --oneline -5`)
- Typecheck `cd apps/staff-web && pnpm typecheck` → EXIT: 0 (run twice, once per task)

## Next Phase Readiness

- **P1b.1-02 (auth allowlist):** Layer is untouched by this plan; no merge conflict expected. Task 2 added `isAnalytics` but plan 02 doesn't touch GymosTopNav.
- **P1b.1-06 (analytics route):** Will land `gymos.analytics.tsx` route that the Analytics tab points to. Until then, clicking the tab 404s — acceptable per plan's done criteria.
- **P1b.1-07 (gym agent surface):** The three chip prompts ("Provide renewal numbers", "Which classes haven't been filled in the last week?", "Which customers should I reach out to?") are now visible to the customer on every /gymos/* surface. Plan 07 must ensure each of these three prompts returns real answers from gym data via the new gym-aware agent registry.

---
*Phase: P1b.1-customer-pilot-enablement*
*Completed: 2026-05-25*
