---
phase: R4-staff-web-visual-refresh
plan: "07"
subsystem: ui
tags: [react-router, next-themes, better-auth, role-nav, light-theme, gymos]

# Dependency graph
requires:
  - phase: R2-design-system-token-layer
    provides: root loader with skin data + data-studio on <html>; guard-no-hardcoded-colors.mjs CI guard
  - phase: R4-staff-web-visual-refresh
    provides: GymosTopNav skin identity + existing root loader pattern
provides:
  - Light-locked ThemeProvider (defaultTheme="light", enableSystem removed) in root.tsx
  - GYMOS_ADMIN_EMAILS parsing in root loader (adminEmails[], adminOpen flag)
  - Role-gated GymosTopNav: coaches see Home/Messages/Schedule/Members; admins additionally see Payments/Analytics/Campaigns/Forms/Settings
  - Admin tabs DOM-omitted for coaches (not CSS-hidden) via isAdmin guard
  - Session email read from /_agent-native/auth/session on mount; coach-level fallback while resolving
affects: [R4-staff-web-visual-refresh, R5-member-mobile-app, deploy-UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Admin role determination: GYMOS_ADMIN_EMAILS env → root loader → client useEffect fetch of /_agent-native/auth/session → isAdmin computed client-side"
    - "adminOpen=true when allowlist empty (single-pilot default matches CUSTOMER_ALLOWED_EMAILS pattern in auth.ts)"
    - "ml-auto on wrapper div (not individual tab) so right-cluster stays aligned when conditional Settings renders or not"

key-files:
  created: []
  modified:
    - apps/staff-web/app/root.tsx
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx

key-decisions:
  - "Light-lock via defaultTheme='light' + removal of enableSystem; .dark CSS block left dormant (R2 skin cascade specificity)"
  - "Admin allowlist in root loader (not session server-side): avoids auth infrastructure risk; matches existing CUSTOMER_ALLOWED_EMAILS empty-list-passes-everyone pattern"
  - "isAdmin=false while session resolves → coach-level fallback (never leaks admin tabs to unauthenticated state)"
  - "ml-auto moved from Settings Link to wrapper div so right-cluster alignment holds whether Settings renders or not"

patterns-established:
  - "GYMOS_ADMIN_EMAILS: comma-separated, lowercased, trimmed. Empty = adminOpen=true = everyone admin"
  - "Session email resolved client-side via fetch('/_agent-native/auth/session', { credentials: 'include' }) in useEffect with active flag"

requirements-completed: [SWEB-07, SWEB-08]

# Metrics
duration: 2min
completed: 2026-06-13
---

# Phase R4 Plan 07: Role Nav and Light Theme Summary

**Light-locked ThemeProvider (no system/dark switching) + GYMOS_ADMIN_EMAILS-driven role-gated nav that DOM-omits Payments/Analytics/Campaigns/Forms/Settings for non-admin staff**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-13T19:13:04Z
- **Completed:** 2026-06-13T19:15:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Removed `enableSystem` and changed `defaultTheme="system"` to `defaultTheme="light"` in root ThemeProvider — staff web is now light-locked on hard reload regardless of system preference; `.dark` CSS cascade left dormant per R2 skin specificity requirement
- Added `GYMOS_ADMIN_EMAILS` parsing in the root loader returning `adminEmails[]` + `adminOpen` (empty allowlist = everyone admin, matching the existing `CUSTOMER_ALLOWED_EMAILS` pattern in auth.ts)
- Refactored `GymosTopNav` with client-side session fetch + `isAdmin` computed gate: coach-level tabs (Home/Messages/Schedule/Members) always in DOM; admin tabs (Payments/Analytics/Campaigns/Forms/Settings) strictly DOM-omitted when `isAdmin` is false

## Task Commits

Each task was committed atomically:

1. **Task 1: Light-lock ThemeProvider + surface admin allowlist from root loader (SWEB-08)** - `719c998f` (feat)
2. **Task 2: Role-gated nav in GymosTopNav (SWEB-07)** - `de14ddb8` (feat)

## Files Created/Modified

- `apps/staff-web/app/root.tsx` — Changed `defaultTheme="system" enableSystem` → `defaultTheme="light"`; added `GYMOS_ADMIN_EMAILS` parsing → `adminEmails[]` + `adminOpen` in loader return
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — Added `useState`/`useEffect` imports; session email fetch; `isAdmin` computation; admin tabs wrapped in `{isAdmin && ...}`; `ml-auto` moved to right-cluster wrapper div

## Decisions Made

- **Light lock**: `defaultTheme="light"` without `enableSystem` is the correct next-themes pattern for explicit light lock. The `.dark` CSS block stays dormant (not removed) because R2 declares studio skin overrides after it — removing it would break the cascade specificity.
- **Admin allowlist in root loader**: Avoids wiring `getSession` (H3-event-only) into an RR v7 web-Request loader, which is auth infrastructure risk outside R4 scope. The client fetch of `/_agent-native/auth/session` is an established pattern (already used by agent-chat-adapter.js).
- **isAdmin defaults to false while resolving**: Safer UX — coaches never accidentally see admin tabs; admins see them appear once session resolves (fast, sub-100ms in practice on a warm session cookie).
- **ml-auto on wrapper div**: Settings is now conditional; if `ml-auto` stayed on the Settings `<Link>`, Sign out would float left when Settings is hidden. The group wrapper guarantees right-alignment in both coach and admin views.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Environment variable to configure on Vercel:**

| Variable | Value | Effect |
|---|---|---|
| `GYMOS_ADMIN_EMAILS` | `admin@example.com,owner@example.com` (comma-separated) | Only listed emails see Payments/Analytics/Campaigns/Forms/Settings in nav |
| `GYMOS_ADMIN_EMAILS` | *(unset or empty)* | Everyone who can log in sees all tabs (single-pilot default) |

No new environment variables are required to deploy — the default behavior (unset = all admin) is correct for the current single-pilot setup.

## Known Stubs

None — both changes are fully wired. The `isAdmin` gate is live; it resolves from the real session email on mount.

## Next Phase Readiness

- SWEB-07 and SWEB-08 are complete. Deploy UAT: sign in as a non-admin email (listed in `CUSTOMER_ALLOWED_EMAILS` but NOT in `GYMOS_ADMIN_EMAILS`) → confirm Payments/Analytics/Campaigns/Forms/Settings absent from nav. Sign in as admin email → all tabs visible. Hard-reload any `/gymos/*` → light theme, no dark toggle.
- R4 plan 07 of 7 is complete. R4 phase is now complete.

---
*Phase: R4-staff-web-visual-refresh*
*Completed: 2026-06-13*
