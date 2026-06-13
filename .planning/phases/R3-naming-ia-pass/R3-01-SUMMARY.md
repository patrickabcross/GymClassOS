---
phase: R3-naming-ia-pass
plan: 01
subsystem: ui
tags: [react-router, naming, labels, ia, gym-domain, staff-web]

# Dependency graph
requires:
  - phase: R2-design-system-token-layer
    provides: GymosTopNav skin-aware rendering; token layer foundation
  - phase: R1-audit-baseline
    provides: NAMING-RECORD.md with exact rename targets per label/CSS/identifier/route layers
provides:
  - Nav label "Messages" replacing "Inbox" in GymosTopNav and AppLayout
  - Messaging surface heading, meta title, and filter chip reading "Messages"
  - "Member Profile" eyebrow heading above member name in member detail view
  - Back-link copy "← Home" replacing "← Back to inbox" in members and payments routes
  - Legacy mail chrome labels updated: "New Message", "Scheduled Messages", "Messages"
affects: [R3-02-css-class-rename, R3-03-identifier-rename, R3-04-route-rename-shims, R4-staff-web-embed-widgets]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Label-layer-first: user-visible copy changes committed before CSS/identifier/route renames (D-05)"
    - "Eyebrow label pattern: text-[10px] uppercase tracking-wide text-muted-foreground above h1 for section context"

key-files:
  created: []
  modified:
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx
    - apps/staff-web/app/routes/gymos.inbox.tsx
    - apps/staff-web/app/routes/gymos.members_.$id.tsx
    - apps/staff-web/app/routes/gymos.members.tsx
    - apps/staff-web/app/routes/gymos.payments.tsx
    - apps/staff-web/app/components/layout/AppLayout.tsx
    - apps/staff-web/app/pages/DraftQueuePage.tsx
    - apps/staff-web/app/routes/draft-queue.tsx
    - apps/staff-web/app/routes/draft-queue.$id.tsx

key-decisions:
  - "Back-link text follows the plan's '← Home' (not NAMING-RECORD's '← Back to Messages') because to='/gymos' resolves to Noticeboard Home, not the messages surface — Home is accurate"
  - "toast('Draft queued.') left unchanged — transient system action feedback, not a nav/heading label; 'queued' is a verb, not the 'Draft Queue' surface name"
  - "DraftQueuePage.tsx + route meta files added to scope as Rule 2 deviation — plan success criteria requires zero visible 'Draft Queue' text in staff-web; those files contained user-visible h1 and meta title strings"

patterns-established:
  - "Eyebrow label: <div className='text-[10px] uppercase tracking-wide text-muted-foreground'>Section Name</div> above h1 for explicit surface context"

requirements-completed: [NAME-01, NAME-02, NAME-06, NAME-07]

# Metrics
duration: 25min
completed: 2026-06-13
---

# Phase R3 Plan 01: Label Layer Summary

**Gym-domain copy replaces email-client vocabulary across all staff-web surfaces: "Messages" nav/heading, "Member Profile" eyebrow, "New Message" button, "Scheduled Messages" label — label layer only, zero route/CSS/identifier changes**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-13T17:45:00Z
- **Completed:** 2026-06-13T18:10:00Z
- **Tasks:** 3 planned + 1 deviation fix
- **Files modified:** 9

## Accomplishments

- Staff nav label: "Inbox" → "Messages" in GymosTopNav (route `/gymos/inbox` unchanged)
- Messaging surface: meta title, h1 heading, and filter chip all read "Messages" (was "WhatsApp Inbox"/"Inbox")
- Member detail view now has explicit "Member Profile" eyebrow above the member name h1
- Back-links in members and payments routes read "← Home" (was "← Back to inbox")
- Legacy mail chrome (AppLayout) updated: "Compose" → "New Message", "Inbox" label → "Messages", "Draft queue" label → "Scheduled Messages"
- DraftQueuePage h1 + route meta titles updated to "Scheduled Messages" (deviation fix — missed by plan scope)

## Task Commits

1. **Task 1: Nav label + messaging surface** - `64a87972` (feat)
2. **Task 2: Member Profile heading + back-links** - `bf979ced` (feat)
3. **Task 3: Legacy mail chrome vocabulary** - `52955763` (feat)
4. **Deviation fix: DraftQueuePage + route meta** - `efc272fa` (fix)

## Files Created/Modified

- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` - Nav link text "Inbox" → "Messages"
- `apps/staff-web/app/routes/gymos.inbox.tsx` - Meta title + h1 heading + filter chip → "Messages"
- `apps/staff-web/app/routes/gymos.members_.$id.tsx` - Added "Member Profile" eyebrow heading above fullName h1
- `apps/staff-web/app/routes/gymos.members.tsx` - Back-link text → "← Home"
- `apps/staff-web/app/routes/gymos.payments.tsx` - Back-link text → "← Home"
- `apps/staff-web/app/components/layout/AppLayout.tsx` - "Compose"→"New Message", "Inbox" label→"Messages", "Draft queue" label→"Scheduled Messages", fallbackTitle→"Scheduled Messages"
- `apps/staff-web/app/pages/DraftQueuePage.tsx` - h1 + error text → "Scheduled Messages"
- `apps/staff-web/app/routes/draft-queue.tsx` - Meta title → "Scheduled Messages — GymClassOS"
- `apps/staff-web/app/routes/draft-queue.$id.tsx` - Meta title → "Scheduled Messages — GymClassOS"

## Decisions Made

- Back-link text follows plan's `← Home` rather than NAMING-RECORD's `← Back to Messages`. The `to="/gymos"` resolves to the Noticeboard Home route, not the messages surface — "Home" is semantically accurate.
- `toast("Draft queued.")` was left unchanged. It is transient system feedback (past tense verb "queued"), not the surface label "Draft Queue". Changing it would be a tone change, not a label rename.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Extended scope to DraftQueuePage.tsx and route meta files**
- **Found during:** Post-task 3 full verification sweep
- **Issue:** Plan listed only AppLayout.tsx for Task 3, but grep revealed `DraftQueuePage.tsx` (h1: "Draft queue", error: "Draft queue needs an active organization.") and `draft-queue.tsx` / `draft-queue.$id.tsx` (meta title: "Draft Queue — Mail") still contained user-visible "Draft Queue" strings. Plan's must_have truth: "No user-visible 'Inbox', 'Compose', or 'Draft Queue' text remains in staff-web."
- **Fix:** Updated h1 and error text in DraftQueuePage.tsx; updated meta titles in both route files to "Scheduled Messages — GymClassOS"
- **Files modified:** apps/staff-web/app/pages/DraftQueuePage.tsx, apps/staff-web/app/routes/draft-queue.tsx, apps/staff-web/app/routes/draft-queue.$id.tsx
- **Verification:** `grep -rn "Draft queue|Draft Queue" apps/staff-web/app` returns 0 matches in label/title positions
- **Committed in:** `efc272fa`

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical functionality)
**Impact on plan:** Necessary to satisfy the plan's own success criterion. No scope creep — label-only changes, same wave, same file type. Three additional files beyond plan's listed scope.

## Issues Encountered

- Line numbers in plan were accurate; grep-locate approach confirmed exact text before editing — no line shift issues encountered.
- Prettier reformatted gymos.inbox.tsx (it was already non-canonical). No functional impact.

## Known Stubs

None — this plan changes only user-visible copy strings. No data, API, or rendering logic was introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Label layer complete: all user-visible email-client vocabulary replaced with gym-domain copy in staff-web
- Ready for R3-02 (CSS class renames): `.email-list-row` → `.conversation-row` etc. per NAMING-RECORD CSS layer
- CSS wave should proceed atomically with component usage (R-12 pattern)
- Route paths unchanged in this wave — `/gymos/inbox`, `/inbox`, `/draft-queue` all still live (route rename is R3-04)

---
*Phase: R3-naming-ia-pass*
*Completed: 2026-06-13*
