---
phase: R1-audit-baseline
plan: "03"
subsystem: ui
tags: [playwright, screenshot, baseline, mobile, react-native-web, expo, capture-harness]

# Dependency graph
requires:
  - phase: R1-02-capture-tooling
    provides: "capture.mjs script, embed test pages, storageState auth mechanism"
provides:
  - "33 PNG baseline screenshots committed to .planning/ui-reviews/baseline/ (staff-web, embeds, mobile)"
  - "INDEX.md manifest with deploy SHA 2fab6b7f, viewport metadata, deviation notes, and coverage summary"
  - "MOBILE-CHECKLIST.md with 8-screen checklist and real-device instructions"
  - "Mobile capture via react-native-web fallback (8 PNGs) with fixture-data interception"
  - "Discovery: /api/m/* is production-gated 401 — affects real devices, not just headless"
affects:
  - R2-design-system-token-layer
  - R3-naming-ia-pass
  - R4-staff-web-visual-refresh
  - R5-member-mobile-app

# Tech tracking
tech-stack:
  added:
    - "react-native-web (dev dep, mobile-app) — web renderer for headless Expo captures"
    - "react-dom (dev dep, mobile-app) — react-native-web peer"
    - "react-native-worklets-core@^0.7 pinned (mobile-app) — 0.8.x incompatible with reanimated 4.2 on web bundle"
    - "scripts/ui-baseline/capture-mobile-web.mjs — headless Chromium mobile renderer"
  patterns:
    - "Fixture interception pattern: intercept /api/m/* in Playwright route() and fulfill with loader-shape fixtures so production-gated routes render in headless captures"
    - "CDP-connect pattern for Google OAuth: attach to real Chrome/Edge via CDP because Google blocks OAuth in automated Chromium"
    - "Session-cookie gate for auth detection: wait for 'better-auth.session_token' cookie instead of URL, because /gymos loads unauthenticated (200 always)"

key-files:
  created:
    - ".planning/ui-reviews/baseline/staff-web/ (20 PNGs)"
    - ".planning/ui-reviews/baseline/embeds/ (3 PNGs)"
    - ".planning/ui-reviews/baseline/mobile/ (8 PNGs)"
    - ".planning/ui-reviews/baseline/INDEX.md"
    - ".planning/ui-reviews/baseline/MOBILE-CHECKLIST.md"
    - "scripts/ui-baseline/capture-mobile-web.mjs"
  modified:
    - "scripts/ui-baseline/capture.mjs (two fixes: session-cookie wait, CDP connect)"
    - "scripts/ui-baseline/embed-light.html (slug updated to schedule-enquiry)"
    - "scripts/ui-baseline/embed-dark.html (slug updated to schedule-enquiry)"
    - "packages/mobile-app/package.json (react-native-web, react-dom, worklets pin)"

key-decisions:
  - "Mobile real-device Expo Go capture impossible (SDK 55 app vs SDK 56 Expo Go in App Store, no EAS dev client). Approved fallback: react-native-web + headless Chromium with fixture interception."
  - "Fixture interception is necessary because /api/m/* routes are production-gated to 401 — this affects real phones too, not just headless."
  - "Google OAuth requires CDP attach to real browser process; automated Chromium triggers Google's bot-detection and blocks sign-in."
  - "Auth gate detection must check for 'better-auth.session_token' cookie, not URL, because /gymos returns 200 unauthenticated."
  - "Barcode screen captured as camera-permission stub — acceptable baseline; real camera unavailable in headless."
  - "Mobile screenshots re-shootable on-device at R5 once EAS dev client exists — same filenames, same manifest structure."

patterns-established:
  - "Per-surface baseline folders: staff-web/, embeds/, mobile/ — after-state runs mirror this structure for side-by-side review"
  - "INDEX.md deviation block pattern: clearly mark capture methodology differences so after-state comparisons know what changed"
  - "Known-gap documentation: interaction-state failures and methodology deviations recorded in INDEX.md, not silently omitted"

requirements-completed: [AUDT-01]

# Metrics
duration: "~4h (across 2 sessions including orchestrator auth fixes)"
completed: "2026-06-12"
---

# Phase R1 Plan 03: Run Captures and Manifest Summary

**33 PNG before-state baseline committed across staff-web (20), embeds (3), and mobile/web-fallback (8), with INDEX.md manifest keyed to deploy SHA 2fab6b7f — AUDT-01 satisfied**

## Performance

- **Duration:** ~4h (spread across 2 sessions including orchestrator auth rework)
- **Started:** 2026-06-12
- **Completed:** 2026-06-12
- **Tasks:** 5 of 5
- **Files modified:** 15+ (PNGs, scripts, mobile-app deps, INDEX.md, MOBILE-CHECKLIST.md)

## Accomplishments

- 20 staff-web PNGs committed (16 desktop + 4 mobile viewport routes; 2 of 4 interaction states captured — templates-dialog and booking-dialog failed at baseline and are documented as known gaps)
- 3 embed PNGs committed (light desktop, dark desktop, light mobile)
- 8 mobile PNGs committed via react-native-web fallback with fixture interception (real-device Expo Go impossible due to SDK mismatch)
- INDEX.md manifest written with deploy SHA, viewport metadata, deviation block, coverage summary, and intentional exclusions — satisfies D-14 and sets the parity target for R2–R5 after-state runs
- Two capture.mjs auth bugs found and fixed by orchestrator: (1) URL-wait changed to session-cookie-wait for auth detection; (2) CDP attach to real Chrome/Edge to defeat Google's automated-browser block

## Task Commits

1. **Task 1: Verify/publish embed form slug** — `8f6e87ce` (chore)
2. **Task 2: Google OAuth storageState** — orchestrator required two capture.mjs fixes:
   - `17e4ef5c` (fix: session-cookie wait, not URL wait)
   - `1337cf0f` (fix: CDP connect to real Edge — Google blocks automated Chromium)
3. **Task 3: Web + embed captures + INDEX.md** — `f909b939` (feat) — deploy SHA `2fab6b7f`; two interaction states documented as known gaps
4. **Task 4: Mobile captures** — `c148fca6` (feat) — react-native-web fallback approved; 8 PNGs captured with fixture interception
5. **Task 5: Reconcile mobile captures into INDEX.md** — `be5c969a` (feat) — Mobile table updated (all 8 captured), deviation block added, coverage summary updated to 33/35

## Files Created/Modified

- `.planning/ui-reviews/baseline/staff-web/` — 20 PNGs (created)
- `.planning/ui-reviews/baseline/embeds/` — 3 PNGs (created)
- `.planning/ui-reviews/baseline/mobile/` — 8 PNGs (created; react-native-web fallback)
- `.planning/ui-reviews/baseline/INDEX.md` — manifest with deploy SHA, deviation block, coverage summary (created then updated)
- `.planning/ui-reviews/baseline/MOBILE-CHECKLIST.md` — 8-screen real-device checklist (created)
- `scripts/ui-baseline/capture.mjs` — two auth fixes applied by orchestrator (modified)
- `scripts/ui-baseline/capture-mobile-web.mjs` — new mobile web-renderer script (created)
- `scripts/ui-baseline/embed-light.html` — slug updated to `schedule-enquiry` (modified)
- `scripts/ui-baseline/embed-dark.html` — slug updated to `schedule-enquiry` (modified)
- `packages/mobile-app/package.json` — react-native-web, react-dom added; react-native-worklets-core pinned ^0.7 (modified)

## Decisions Made

- **Mobile fallback approved by user (2026-06-12):** App Store Expo Go (SDK 56) incompatible with this app (SDK 55); no EAS dev client exists. react-native-web + headless Chromium with fixture interception is the accepted baseline methodology. Re-shootable at R5 once EAS dev client is built.
- **Fixture interception scope:** `/api/m/*` is production-gated to 401 in the Vercel deploy. Interception is not a workaround for the captures only — real phones also get 401. Flagged as a blocker for the master-branch mobile/EAS workstream.
- **Barcode stub acceptable:** `food-barcode.png` shows camera permission UI (no camera in headless). The screen chrome is captured; the actual camera viewfinder is a known gap.

## Deviations from Plan

### Auto-fixed Issues (orchestrator-applied)

**1. [Rule 1 - Bug] Auth detection used URL wait; /gymos returns 200 unauthenticated**
- **Found during:** Task 2 (Google OAuth storageState)
- **Issue:** `capture.mjs --save-auth` waited for navigation to `/gymos` URL to confirm login. But `/gymos` returns HTTP 200 even when unauthenticated — the script incorrectly declared auth saved before login completed.
- **Fix:** Changed wait condition to poll for `better-auth.session_token` cookie instead of URL.
- **Files modified:** `scripts/ui-baseline/capture.mjs`
- **Committed in:** `17e4ef5c`

**2. [Rule 1 - Bug] Google OAuth blocks automated Chromium — CDP attach to real browser required**
- **Found during:** Task 2 (Google OAuth storageState)
- **Issue:** Google detects headless Playwright Chromium and blocks OAuth sign-in entirely.
- **Fix:** Script now opens a real Chrome or Edge process and attaches via CDP for the OAuth flow only. All subsequent capture operations use normal headless Playwright.
- **Files modified:** `scripts/ui-baseline/capture.mjs`
- **Committed in:** `1337cf0f`

**3. [Rule 4 - Architectural — user-approved] Real-device Expo Go replaced with react-native-web fallback**
- **Found during:** Task 4 (mobile captures)
- **Issue:** The plan required real-device Expo Go capture (D-07). App Store Expo Go only runs SDK 56; this app is SDK 55. No EAS dev client exists (master-branch work). The plan's "real device required" constraint cannot be satisfied.
- **User decision (2026-06-12):** Approved react-native-web + headless Chromium fallback.
- **Fix implemented:** New script `scripts/ui-baseline/capture-mobile-web.mjs` renders the Expo app via react-native-web at 390×844. Intercepts `/api/m/*` with fixture data (live routes 401-gate in production — affects real phones too). Added `react-native-web`, `react-dom`, and pinned `react-native-worklets-core@^0.7` (0.8.x crashes web bundle with reanimated 4.2).
- **Files modified:** `scripts/ui-baseline/capture-mobile-web.mjs`, `packages/mobile-app/package.json`
- **Committed in:** `c148fca6`

---

**Total deviations:** 3 (2 auto-fixed bugs in capture.mjs; 1 architectural deviation approved by user)
**Impact on plan:** Auth bugs necessary to fix (script was broken). Mobile fallback is a methodology change, not a scope reduction — all 8 screens are captured, documented with honest caveats, and re-shootable at R5. No scope creep.

## Issues Encountered

- **Two D-06 interaction states failed at capture time** — `templates-dialog` (button not found without active conversation) and `booking-dialog` (no dialog appeared on schedule click — likely no upcoming bookable classes). Both documented as baseline capture-time gaps in INDEX.md. After-state parity checks should attempt the same interactions; matching failure is consistent, not a regression.
- **react-native-worklets-core 0.8.x incompatible with web bundle** — lockfile had 0.8.3 installed; crashed at boot when rendered in react-native-web. Pinned to `^0.7` in mobile-app package.json to resolve.

## User Setup Required

None — no external service configuration required for this plan's outputs.

## Next Phase Readiness

- AUDT-01 is complete: 33 PNGs committed across all three surfaces with deploy SHA keyed in INDEX.md. After-state runs in R2–R5 use `node scripts/ui-baseline/capture.mjs --output-dir <after-dir>` and check coverage parity against INDEX.md.
- R1 phase is complete (R1-01: naming decision record, R1-02: capture tooling, R1-03: captures + manifest). R2 (Design System Token Layer) can start.
- **Open dependencies entering R2:**
  - Hustle brand hex values not yet received — `hustle.css` uses placeholders. Not a blocker for R2 start.
  - `/api/m/*` production 401-gating is a master-branch mobile concern — flagged for the EAS workstream, not a v1.1 redesign blocker.
  - Mobile re-shoot at R5 once EAS dev client exists — INDEX.md and MOBILE-CHECKLIST.md document the re-shoot path.

## Known Stubs

- `food-barcode.png` — shows camera permission stub (no camera in headless Chromium). Real-device barcode viewfinder is not captured. Intentional; documented in INDEX.md deviation block.
- Mobile screenshots use fixture data, not live API data. The `/api/m/*` 401-gate is a production constraint, not a capture workaround. Documented in INDEX.md.

---
*Phase: R1-audit-baseline*
*Completed: 2026-06-12*
