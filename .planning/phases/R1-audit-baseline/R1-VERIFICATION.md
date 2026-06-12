---
phase: R1-audit-baseline
verified: 2026-06-12T00:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Open representative PNGs from each surface folder and confirm they show the live app (not a login page, not a blank white frame)"
    expected: "staff-web PNGs show the gymos UI; embed PNGs show the schedule widget and form widget; mobile PNGs show the Expo/react-native-web rendered screens"
    why_human: "File existence is verified programmatically but image content can only be confirmed visually"
  - test: "Open gymos-inbox.desktop.context-panel.png and confirm the three-column layout (inbox list + conversation thread + member context panel) is visible with the agent sidebar closed"
    expected: "Three-column layout visible, agent sidebar not obstructing member context panel"
    why_human: "Screenshot content assessment requires visual inspection"
  - test: "Open embed-host.light.desktop.png and embed-host.dark.desktop.png; confirm schedule and form widgets rendered (not 404 or empty divs)"
    expected: "Both embed PNGs show widget content on their respective host backgrounds"
    why_human: "Widget render success inside iframe requires visual confirmation"
---

# Phase R1: Audit Baseline Verification Report

**Phase Goal:** The before-state of every surface is documented so regressions are detectable; every email-vocabulary item is inventoried and classified so R2-R5 have a concrete target list
**Verified:** 2026-06-12
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Screenshots of every in-scope staff-web route, embed widget, and mobile screen are committed and diffable against post-redesign captures | VERIFIED | 20 staff-web PNGs + 3 embed PNGs + 8 mobile PNGs committed under `.planning/ui-reviews/baseline/`; INDEX.md manifest with deploy SHA `2fab6b7f` present |
| 2 | A naming decision record lists every email-vocabulary UI label, code identifier, CSS class, and route with each item tagged by rename layer | VERIFIED | NAMING-RECORD.md (170 lines) present with 4 layer tables: 24 Label rows, 12 CSS rows, 20 Identifier rows, 11 Route rows |
| 3 | The naming record is comprehensive enough that a reader can derive the full scope of R3 without re-auditing the codebase | VERIFIED | "R3/R4/R5 Scope Derivation" section present, maps each table to its consuming phase; route-to-plan mapping is explicit; all redirect-shim needs flagged |
| 4 | An INDEX.md manifest exists listing every capture with route, viewport, state, capture date, and deployed commit SHA | VERIFIED | INDEX.md contains all required sections and columns; SHA `2fab6b7f78b7857b0ada16a411a26188ee9ccfae` recorded; known gaps documented |
| 5 | The capture harness is committed and re-runnable by R2-R5 phases | VERIFIED | `capture.mjs` (578 lines, syntax valid), `embed-light.html`, `embed-dark.html`, `README.md`, and `capture-mobile-web.mjs` all committed; `storageState.json` gitignored (not tracked) |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/ui-reviews/baseline/staff-web/` | 20 PNGs (16 desktop + 4 mobile viewport) | VERIFIED | Exactly 20 PNGs present; all 16 desktop routes + 4 mobile routes confirmed |
| `.planning/ui-reviews/baseline/embeds/` | 3 PNGs (light-desktop, dark-desktop, light-mobile) | VERIFIED | 3 PNGs present: `embed-host.light.desktop.png`, `embed-host.dark.desktop.png`, `embed-host.light.mobile.png` |
| `.planning/ui-reviews/baseline/mobile/` | 8 PNGs | VERIFIED | 8 PNGs present: all 8 target filenames from MOBILE-CHECKLIST.md confirmed |
| `.planning/ui-reviews/baseline/INDEX.md` | Manifest with SHA, coverage list | VERIFIED | File present; contains `## Staff Web`, `## Embeds`, `## Mobile`, `## Coverage Summary`; SHA recorded; `/email` exclusion documented |
| `.planning/ui-reviews/baseline/MOBILE-CHECKLIST.md` | Real-device Expo Go checklist with 8 screens and exact filenames | VERIFIED | File present; contains "Expo Go" instruction; 8-row checklist with target filenames; "Real device required" note |
| `.planning/phases/R1-audit-baseline/NAMING-RECORD.md` | Single doc, 4 per-layer tables, min 120 lines | VERIFIED | 170 lines; 4 layer sections confirmed by `grep -cE "^## (Label\|CSS\|Identifier\|Route) Layer"` returning 4 |
| `scripts/ui-baseline/capture.mjs` | Parameterized Playwright script, min 80 lines, contains `--output-dir` | VERIFIED | 578 lines; `--save-auth` and `--output-dir` modes present; `storageState` auth present; both viewports (1440/390) defined; interaction states (context-panel, templates-dialog, booking-dialog) present; syntax valid (`node --check` passes) |
| `scripts/ui-baseline/embed-light.html` | Light host page loading embed.js | VERIFIED | Present; contains `data-gymos-schedule`, `data-gymos-form="schedule-enquiry"` (real slug), and `<script src="https://gym-class-os.vercel.app/embed.js"` |
| `scripts/ui-baseline/embed-dark.html` | Dark host page loading embed.js | VERIFIED | Present; `background: #0b0f1a` dark body; same slug and embed.js tag as light page |
| `scripts/ui-baseline/README.md` | Re-run and re-auth instructions | VERIFIED | Present; documents `--save-auth`, `--output-dir` examples for R2-R5, filename convention `<route-slug>.<viewport>[.<state>].png` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `capture.mjs` | `https://gym-class-os.vercel.app` | `const BASE` + `page.goto` | VERIFIED | Line 34: `const BASE = "https://gym-class-os.vercel.app"` confirmed |
| `.gitignore` | `scripts/ui-baseline/storageState.json` | gitignore entry | VERIFIED | Entry present in `.gitignore`; `git ls-files` confirms file is not tracked |
| `INDEX.md` manifest rows | committed PNG files | one row per file | VERIFIED | 20 staff-web rows match 20 PNGs; 3 embed rows match 3 PNGs; 8 mobile rows match 8 PNGs |
| `embed-light.html` / `embed-dark.html` | published form slug `schedule-enquiry` | `data-gymos-form` attribute | VERIFIED | Both files contain `data-gymos-form="schedule-enquiry"`; R1-03 SUMMARY confirms slug verified against live deploy |
| `NAMING-RECORD.md` Route table | R3 route-rename + redirect-shim work (NAME-03) | `redirect shim` risk notes | VERIFIED | `grep -q "redirect shim"` passes; `/gymos/inbox` row explicitly flags shim requirement with file:line refs |

---

### Data-Flow Trace (Level 4)

Not applicable — all artifacts are documentation/planning artifacts or capture tooling scripts, not UI components that render dynamic data.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `capture.mjs` ESM syntax valid | `node --check scripts/ui-baseline/capture.mjs` | Exit 0 | PASS |
| NAMING-RECORD.md has all four layer sections | `grep -cE "^## (Label\|CSS\|Identifier\|Route) Layer" NAMING-RECORD.md` | 4 | PASS |
| `embed-light.html` form slug updated from placeholder | `grep data-gymos-form scripts/ui-baseline/embed-light.html` | `schedule-enquiry` (not `trial-signup` placeholder) | PASS |
| `embed-dark.html` has dark background | `grep "background: #0b0f" embed-dark.html` | `background: #0b0f1a` | PASS |
| `storageState.json` not committed to git | `git ls-files scripts/ui-baseline/storageState.json` | empty (not tracked) | PASS |
| Staff-web PNG count matches INDEX.md | `ls staff-web/*.png \| wc -l` | 20 | PASS |
| Mobile PNG count matches MOBILE-CHECKLIST.md | `ls mobile/*.png \| wc -l` | 8 | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUDT-01 | R1-02, R1-03 | Before-state screenshots of every staff-web surface, embed widget, and mobile screen committed to `.planning/ui-reviews/baseline/` | SATISFIED | 33 PNGs committed; INDEX.md manifest with SHA; capture harness committed and re-runnable |
| AUDT-02 | R1-01 | Complete rename inventory (every email-vocabulary UI label, code identifier, CSS class, and route) as naming decision record, each item classified by rename layer | SATISFIED | NAMING-RECORD.md with 4 layer tables; 60+ items classified; all acceptance criteria pass |

No orphaned requirements — both AUDT-01 and AUDT-02 are mapped to R1 in REQUIREMENTS.md, both claimed by plans, both have implementation evidence.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/ui-baseline/capture.mjs` | 143, 397, 418, 441, 465, 501, 554 | `waitUntil: "load"` used instead of `"networkidle"` as specified in R1-02 plan | Info | The plan spec required `waitUntil: "networkidle"`. The script uses `"load"` + explicit `waitForTimeout(3000)` instead. The SUMMARY does not document this as a deviation. The PNGs were successfully produced and committed, so the practical outcome is achieved. The harness works but uses a different wait strategy than the plan intended. Not a blocker — does not prevent goal achievement. |

No TODOs, placeholder comments, empty implementations, or stubs found in the key artifacts. The `MOBILE-CHECKLIST.md` still shows `[ ]` for "Captured?" checkboxes — this is by design (it is a user-facing instruction document, not a tracking doc). The actual capture status is in INDEX.md, which marks all 8 screens "captured".

---

### Approved Deviations (Not Failures)

The following are confirmed against the approved deviations listed in the verification prompt and documented in INDEX.md / R1-03-SUMMARY.md:

| Deviation | Approved | Documentation |
|-----------|----------|---------------|
| Mobile captures use react-native-web + fixture interception, not real-device Expo Go (SDK 55 vs 56 mismatch) | Yes — user approved 2026-06-12 | INDEX.md deviation block; R1-03-SUMMARY.md key-decisions |
| `templates-dialog` interaction state not captured (button not found headless) | Yes — documented as known gap | INDEX.md "Interaction-state failures" table |
| `booking-dialog` interaction state not captured (no upcoming bookable classes) | Yes — documented as known gap | INDEX.md "Interaction-state failures" table |
| `/email` route excluded from screenshots | Yes — user decision D-05 | CONTEXT.md D-05; INDEX.md intentional exclusions table |
| `embed-host.dark.mobile` not captured | Yes — not in capture harness by design | INDEX.md note after Embeds table |

---

### Human Verification Required

#### 1. PNG Content Spot-Check

**Test:** Open 3-4 representative PNGs from `staff-web/`, `embeds/`, and `mobile/` in an image viewer.
**Expected:** Staff-web images show the gymos application UI (not a Google login page, not a blank frame); embed images show widget content rendered on the host background; mobile images show React Native screen layouts with fixture data.
**Why human:** File existence and count are verified programmatically but image content validity requires visual assessment.

#### 2. Interaction-State Context Panel

**Test:** Open `gymos-inbox.desktop.context-panel.png`.
**Expected:** Three-column layout is visible — conversation list on the left, thread in the center, member context panel on the right. The agent sidebar should NOT be covering the right rail.
**Why human:** Verifying agent sidebar is correctly closed and the third column is visible requires visual inspection.

#### 3. Embed Widget Render

**Test:** Open `embed-host.light.desktop.png` and `embed-host.dark.desktop.png`.
**Expected:** Both images show the schedule widget and the lead-enquiry form widget rendered (not empty divs or "widget not found" errors).
**Why human:** Widget render success inside an iframe cannot be verified from file size alone.

---

### Gaps Summary

No blocking gaps. The phase goal is achieved:

- The before-state of every in-scope surface is documented with 33 committed PNGs, an INDEX.md manifest with the deployed commit SHA, and documented intentional exclusions (two failed interaction states, `/email`, dark-mobile embed) — all deviations were user-approved and recorded, enabling regression detection in R2-R5.

- Every email-vocabulary item across staff-web, embeds, and mobile is inventoried in NAMING-RECORD.md with 60+ classified items across four rename layers, plus a NAME-05 do-not-touch section and an explicit R3/R4/R5 scope-derivation section — a reader can plan and execute R3 entirely from this document.

- AUDT-01 and AUDT-02 are both satisfied. The capture harness is committed, re-runnable, and parameterized for R2-R5 reuse.

The one noteworthy non-conformance (capture.mjs uses `waitUntil: "load"` + `waitForTimeout` instead of the plan's `waitUntil: "networkidle"`) did not affect the outcome — screenshots were produced and committed — and does not block any downstream phase.

---

_Verified: 2026-06-12_
_Verifier: Claude (gsd-verifier)_
