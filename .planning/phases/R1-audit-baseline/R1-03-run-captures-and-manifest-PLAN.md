---
phase: R1-audit-baseline
plan: 03
type: execute
wave: 2
depends_on: ["02"]
files_modified:
  - .planning/ui-reviews/baseline/staff-web/
  - .planning/ui-reviews/baseline/embeds/
  - .planning/ui-reviews/baseline/mobile/
  - .planning/ui-reviews/baseline/INDEX.md
  - .planning/ui-reviews/baseline/MOBILE-CHECKLIST.md
  - scripts/ui-baseline/embed-light.html
  - scripts/ui-baseline/embed-dark.html
autonomous: false
requirements: [AUDT-01]
must_haves:
  truths:
    - "Screenshots of every in-scope staff-web route, both embed widgets (light + dark host), and every mobile screen are committed to .planning/ui-reviews/baseline/"
    - "An INDEX.md manifest lists every capture with route/screen, viewport, state, capture date, and the deployed commit SHA"
    - "The baseline tree uses per-surface folders (staff-web/, embeds/, mobile/) so after-state runs mirror it for side-by-side review"
    - "Mobile screenshots are captured by the user on a real phone via Expo Go from a precise checklist with exact target filenames"
    - "The embed test pages reference a real published form slug so the form widget renders rather than 404ing"
  artifacts:
    - path: ".planning/ui-reviews/baseline/INDEX.md"
      provides: "Capture manifest with deploy SHA, coverage list for after-state parity checks"
      contains: "SHA"
    - path: ".planning/ui-reviews/baseline/MOBILE-CHECKLIST.md"
      provides: "User-facing Expo Go capture checklist with exact filenames"
      contains: "Expo Go"
    - path: ".planning/ui-reviews/baseline/staff-web/"
      provides: "Desktop + mobile + interaction-state staff-web screenshots"
    - path: ".planning/ui-reviews/baseline/embeds/"
      provides: "Light + dark host embed widget screenshots"
    - path: ".planning/ui-reviews/baseline/mobile/"
      provides: "User-captured Expo Go mobile screenshots"
  key_links:
    - from: ".planning/ui-reviews/baseline/INDEX.md"
      to: "the committed screenshot files"
      via: "one manifest row per file"
      pattern: "\\.png"
    - from: "scripts/ui-baseline/embed-light.html"
      to: "a published form slug in gymos-demo Neon"
      via: "data-gymos-form attribute"
      pattern: "data-gymos-form"
---

<objective>
Run the R1-02 capture harness to produce the committed before-state baseline, and assemble the manifest. This plan contains the two unavoidable human-interactive steps of R1: (1) the one-time manual Google OAuth login for Playwright storageState, and (2) the mobile screenshots captured by the user on a real phone via Expo Go (D-07). The executor automates everything else: verifies/publishes the embed form slug, runs the script, writes INDEX.md with the deploy SHA, and writes the user-facing mobile checklist.

Purpose: Completes AUDT-01 — every staff-web route, embed widget, and mobile screen is committed under `.planning/ui-reviews/baseline/` and diffable against post-redesign captures (phase success criterion 1).
Output: `.planning/ui-reviews/baseline/{staff-web,embeds,mobile}/*.png` + `INDEX.md` + `MOBILE-CHECKLIST.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/R1-audit-baseline/R1-CONTEXT.md
@.planning/phases/R1-audit-baseline/R1-RESEARCH.md
@scripts/ui-baseline/README.md

<run_facts>
<!-- From R1-RESEARCH.md + R1-02 plan. -->
- Capture script: scripts/ui-baseline/capture.mjs (built in R1-02). Run modes: `--save-auth` (one-time manual login) then default capture (writes to .planning/ui-reviews/baseline by default).
- Deploy SHA at research time: cdec3a18 (master HEAD). Re-confirm the ACTUAL deployed SHA at run time — see Task 3 (Vercel deploy header or /gymos page; if unavailable, record "master HEAD at <date>" and note it).
- Embed form widget needs a PUBLISHED form slug from gymos-demo Neon. Check https://gym-class-os.vercel.app/gymos/forms for a published form; if none, publish one via the staff UI. Update data-gymos-form in BOTH embed-light.html and embed-dark.html to the real slug (Pitfall 3).
- Mobile capture is the USER's job on a real phone via Expo Go against the live API (D-07, Pitfall 6: real device, not simulator). 8 screens (D-08): tab-home, tab-schedule, tab-food, tab-profile, pick-member, food-add, food-barcode, agent-sheet.
- Filename convention (D-13): <route-slug>.<viewport>[.<state>].png. Per-surface folders: staff-web/, embeds/, mobile/.
- INDEX.md (D-14): every capture row = route/screen | viewport | state | capture date | deploy SHA. After-state runs check parity against it.
</run_facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify/publish the embed form slug and finalize the embed test pages</name>
  <read_first>
    - scripts/ui-baseline/embed-light.html (the FORM_SLUG placeholder to replace)
    - scripts/ui-baseline/embed-dark.html
    - .planning/phases/R1-audit-baseline/R1-RESEARCH.md (Pitfall 3 — published form slug requirement)
  </read_first>
  <action>
    The embed test pages from R1-02 use a placeholder `data-gymos-form="trial-signup"`. Replace it with a REAL published form slug so the form widget renders instead of 404ing.

    1. Open `https://gym-class-os.vercel.app/gymos/forms` (the staff Forms list). Identify any form with status `published`. Note its slug.
    2. If a published form exists: update the `data-gymos-form="..."` attribute in BOTH `scripts/ui-baseline/embed-light.html` and `scripts/ui-baseline/embed-dark.html` to that slug. Remove the placeholder warning comment (or update it to record the chosen slug).
    3. If NO published form exists: publish one via the `/gymos/forms` UI (create or publish a lead/enquiry form), then use its slug. If publishing is not possible in this session, set `data-gymos-form` to a clearly-marked TODO and record in the SUMMARY that the form-embed capture is deferred until a form is published — the schedule-embed capture still proceeds.

    Verify the chosen slug actually renders: load `https://gym-class-os.vercel.app/f/<slug>` in a browser and confirm it shows the form (not a 404/empty state).
  </action>
  <verify>
    <automated>cd "C:/Users/dimet/gymclassos-br1" && grep -h "data-gymos-form" scripts/ui-baseline/embed-light.html scripts/ui-baseline/embed-dark.html</automated>
  </verify>
  <acceptance_criteria>
    - `grep "data-gymos-form" scripts/ui-baseline/embed-light.html` and `...embed-dark.html` return the SAME slug value in both files
    - The slug used is confirmed to render at `https://gym-class-os.vercel.app/f/<slug>` (or, if deferred, the SUMMARY records that the form-embed capture is deferred and why)
    - Both embed pages still contain the `<script src="https://gym-class-os.vercel.app/embed.js"` tag and the `data-gymos-schedule` mount
  </acceptance_criteria>
  <done>Both embed test pages reference a real, render-verified published form slug (or the form-embed capture is explicitly deferred with the schedule-embed proceeding).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2 (checkpoint): One-time Google OAuth login for Playwright storageState</name>
  <action>Pause for the user to run `node scripts/ui-baseline/capture.mjs --save-auth` and complete the interactive Google OAuth login in the launched browser so `scripts/ui-baseline/storageState.json` is written. This cannot be automated (Google interactive consent has no CLI/API). The exact steps are in what-built / how-to-verify below.</action>
  <what-built>
    The capture script `scripts/ui-baseline/capture.mjs` (built in R1-02) authenticates against the live staff web via a saved Playwright `storageState.json`. Google OAuth has no CLI/API path for an interactive consent login, so this single login must be done by you in a browser the script launches. This is the only auth step — once saved, the script reuses the session for all captures.
  </what-built>
  <how-to-verify>
    1. In a terminal at the repo root, run: `node scripts/ui-baseline/capture.mjs --save-auth`
    2. A Chromium window opens at `https://gym-class-os.vercel.app`. Log in with the customer-allowlisted Google account (the seeded coach/admin account that reaches `/gymos`).
    3. Wait until the browser lands on a `/gymos` page. The script auto-detects this, saves `scripts/ui-baseline/storageState.json`, prints "Auth saved", and closes the window.
    4. Confirm the file exists: `ls scripts/ui-baseline/storageState.json` (it is gitignored — it will NOT be committed).
    5. Note: Google sessions can expire in ~24-48h. Run the captures (Task 3) in the same sitting, right after this step.
  </how-to-verify>
  <resume-signal>Type "auth saved" once storageState.json exists, or describe any login error (e.g. access-denied, wrong account).</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Run web + embed captures, confirm the deploy SHA, and write INDEX.md</name>
  <read_first>
    - scripts/ui-baseline/capture.mjs (the surface list it captures — INDEX.md must mirror it)
    - scripts/ui-baseline/README.md
    - .planning/phases/R1-audit-baseline/R1-RESEARCH.md (recommended INDEX structure + Pitfall 2 agent sidebar)
  </read_first>
  <action>
    With storageState saved (Task 2 complete), run the capture and assemble the manifest.

    1. Run: `node scripts/ui-baseline/capture.mjs` (default output → `.planning/ui-reviews/baseline`). Watch the console summary. If it reports a route that landed on the Google login page, the session expired — re-run Task 2's `--save-auth` and re-run.
    2. Confirm screenshots landed: `ls .planning/ui-reviews/baseline/staff-web/` and `ls .planning/ui-reviews/baseline/embeds/`. Spot-check 2-3 PNGs (open them) to confirm they show the app (not a login page) and that the agent sidebar is closed so the member-context panel is visible in the context-panel capture (Pitfall 2). Re-run if any are wrong.
    3. Determine the DEPLOYED commit SHA of `gym-class-os.vercel.app` at capture time. Try, in order: (a) a Vercel deploy meta header / the deployment URL; (b) the latest `master` commit SHA if you can read it; (c) fall back to recording `"master HEAD as of <capture date>"`. Record whatever you determine — research-time SHA was `cdec3a18`, but re-confirm; do not assume it is unchanged.
    4. Write `.planning/ui-reviews/baseline/INDEX.md` (D-14). Structure:
       - Header: capture date, deploy target URL, deployed commit SHA (from step 3), Playwright version, the two viewports.
       - A note: "Baseline is for side-by-side human review, not pixel-diff (D-16). After-state runs (R2-R5) re-run `scripts/ui-baseline/capture.mjs --output-dir <after-dir>` and check coverage parity against this manifest."
       - `## Staff Web` table: columns `File | Route/Screen | Viewport | State | Capture date`. One row per PNG in `staff-web/`.
       - `## Embeds` table: same columns. One row per PNG in `embeds/` (note light vs dark host).
       - `## Mobile` table: one row per expected mobile PNG (from MOBILE-CHECKLIST.md / D-08), with a Status column = "pending user capture" until the files land (Task 4 fills them).
       - `## Coverage summary`: counts of staff-web / embed / mobile captures, and an explicit list of anything excluded (`/email` per D-05; `$view` redirect routes; API/webhook routes) so after-state parity checks know they are intentional gaps.
    5. The INDEX must have exactly one row per actually-committed PNG in staff-web/ and embeds/ (generate the rows from the directory listing, not from memory).
  </action>
  <verify>
    <automated>cd "C:/Users/dimet/gymclassos-br1" && test -f .planning/ui-reviews/baseline/INDEX.md && ls .planning/ui-reviews/baseline/staff-web/*.png | wc -l && grep -iE "SHA|commit" .planning/ui-reviews/baseline/INDEX.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/ui-reviews/baseline/staff-web/` contains at least the desktop captures for gymos-home, gymos-inbox, gymos-schedule, gymos-members, gymos-payments, gymos-analytics (verified via `ls`)
    - `.planning/ui-reviews/baseline/staff-web/` contains the four D-06 interaction-state PNGs (context-panel, templates-dialog, booking-dialog, selected-row) — verify filenames contain those state suffixes
    - `.planning/ui-reviews/baseline/embeds/` contains at least `embed-host.light.desktop.png` and `embed-host.dark.desktop.png`
    - `INDEX.md` exists and contains a `## Staff Web`, `## Embeds`, `## Mobile`, and `## Coverage summary` section
    - `grep -iE "SHA|commit" INDEX.md` succeeds (deploy SHA recorded per D-14)
    - `INDEX.md` records the `/email` exclusion (D-05) so after-state parity treats it as intentional
    - Number of `## Staff Web` table rows equals the number of PNGs in `staff-web/` (manifest matches reality)
  </acceptance_criteria>
  <done>Web + embed screenshots are captured to per-surface folders, the agent sidebar is closed in the context-panel shot, and INDEX.md records every committed PNG plus the deploy SHA and intentional exclusions.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4 (checkpoint): Capture mobile screens on a real phone via Expo Go</name>
  <action>First (executor, before pausing) write `.planning/ui-reviews/baseline/MOBILE-CHECKLIST.md` with the 8-screen capture checklist and exact target filenames described in what-built. Then pause for the user to capture the 8 mobile screens on a real phone via Expo Go and drop the PNGs into `.planning/ui-reviews/baseline/mobile/`. Real-device capture cannot be automated by an executor agent (D-07).</action>
  <what-built>
    A `MOBILE-CHECKLIST.md` (written by the executor before this checkpoint — see action note below) lists the 8 mobile screens to capture with exact target filenames. Mobile screenshots cannot be automated by an executor agent — they require a real iOS/Android device running Expo Go against the live API (D-07; research Pitfall 6 mandates a real device, not a simulator, because simulator styling differs subtly from real-device rendering).

    Executor pre-step (do this BEFORE pausing for the user): write `.planning/ui-reviews/baseline/MOBILE-CHECKLIST.md` containing:
    - "## How to capture" — install/open Expo Go on your physical phone, scan the QR for the GymClassOS member app pointed at the live API, log in via the member picker, capture each screen with the phone's native screenshot, AirDrop/transfer the PNGs to the machine, and drop them into `.planning/ui-reviews/baseline/mobile/` with the EXACT filenames below.
    - "## Real device required" — note explicitly: capture on a physical device, NOT a simulator (Pitfall 6).
    - A checklist table: `Screen | How to reach it | Target filename | Captured?` with these 8 rows (D-08):
      1. Home tab → `tab-home.png`
      2. Schedule tab (class browser) → `tab-schedule.png`
      3. Food tab (calorie log) → `tab-food.png`
      4. Profile tab → `tab-profile.png`
      5. Member picker (first launch / re-pick) → `pick-member.png`
      6. Food search screen (food-add) → `food-add.png`
      7. Barcode scanner screen (food-barcode) → `food-barcode.png`
      8. Agent chat sheet (tap the FAB, sheet open over any tab) → `agent-sheet.png`
  </what-built>
  <how-to-verify>
    1. Open `.planning/ui-reviews/baseline/MOBILE-CHECKLIST.md` and follow it.
    2. On your physical phone, open Expo Go and load the GymClassOS member app against the live API; log in via the member picker.
    3. Screenshot each of the 8 screens listed.
    4. Transfer the 8 PNGs onto the machine and place them in `.planning/ui-reviews/baseline/mobile/` using the EXACT filenames from the checklist (tab-home.png, tab-schedule.png, tab-food.png, tab-profile.png, pick-member.png, food-add.png, food-barcode.png, agent-sheet.png).
    5. Confirm: `ls .planning/ui-reviews/baseline/mobile/` shows all 8 files.
  </how-to-verify>
  <resume-signal>Type "mobile captured" once all 8 PNGs are in baseline/mobile/, or tell me which screens you could not capture and why.</resume-signal>
</task>

<task type="auto">
  <name>Task 5: Reconcile the mobile captures into INDEX.md and finalize coverage</name>
  <read_first>
    - .planning/ui-reviews/baseline/INDEX.md (the Mobile table to update)
    - .planning/ui-reviews/baseline/MOBILE-CHECKLIST.md
  </read_first>
  <action>
    After the user drops the mobile PNGs (Task 4), reconcile them into the manifest.

    1. `ls .planning/ui-reviews/baseline/mobile/` and confirm which of the 8 expected files (tab-home, tab-schedule, tab-food, tab-profile, pick-member, food-add, food-barcode, agent-sheet — all `.png`) are present.
    2. Update the `## Mobile` table in `INDEX.md`: set Status to "captured" for every PNG present, and leave "pending user capture" only for any genuinely missing screen (record why in a note).
    3. Update the `## Coverage summary` counts to reflect actual committed files across staff-web / embeds / mobile.
    4. If any of the 8 mobile files are missing, do NOT block the phase — record the gap explicitly in INDEX.md and the SUMMARY so after-state parity checks know it is a known, intentional gap rather than a regression.
  </action>
  <verify>
    <automated>cd "C:/Users/dimet/gymclassos-br1" && ls .planning/ui-reviews/baseline/mobile/*.png 2>/dev/null | wc -l && grep -ic "captured" .planning/ui-reviews/baseline/INDEX.md</automated>
  </verify>
  <acceptance_criteria>
    - `ls .planning/ui-reviews/baseline/mobile/*.png | wc -l` returns the count of mobile PNGs the user dropped (ideally 8)
    - `INDEX.md` Mobile table marks each present PNG "captured" and any absent screen "pending user capture" with a recorded reason
    - `## Coverage summary` counts in INDEX.md match actual file counts in staff-web/, embeds/, mobile/
  </acceptance_criteria>
  <done>INDEX.md Mobile table and coverage summary reflect the actual committed mobile screenshots; any missing screen is recorded as a known intentional gap, not a silent omission.</done>
</task>

</tasks>

<verification>
- `.planning/ui-reviews/baseline/staff-web/`, `embeds/`, `mobile/` all populated with PNGs
- All four D-06 interaction states captured (context-panel, templates-dialog, booking-dialog, selected-row)
- Embed widgets captured on both light and dark host pages (WDGT-03 harness)
- `INDEX.md` lists every capture with route/screen, viewport, state, date, and deploy SHA (D-14)
- `MOBILE-CHECKLIST.md` exists with exact target filenames and real-device instruction (D-07)
- Excluded surfaces (`/email`, `$view` redirects, API routes) recorded as intentional gaps
</verification>

<success_criteria>
Every staff-web route, both embeds, and all reachable mobile screens are committed under `.planning/ui-reviews/baseline/` and diffable against post-redesign captures. INDEX.md gives after-state runs a parity target. Satisfies AUDT-01 and phase success criterion 1.
</success_criteria>

<output>
After completion, create `.planning/phases/R1-audit-baseline/R1-03-SUMMARY.md`
</output>
