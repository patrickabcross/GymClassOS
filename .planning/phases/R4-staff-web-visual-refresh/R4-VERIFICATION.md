---
phase: R4-staff-web-visual-refresh
verified: 2026-06-13T00:00:00Z
status: human_needed
score: 7/8 success criteria verifiable in code; 1 SC (instructor field) is a documented known limitation; WDGT-03 is deploy/UAT only
human_verification:
  - test: "SC1 — Class cards show name, time, X/Y booked, and 3-state capacity on a live deploy"
    expected: "Cards at 4+ spots: muted; 1-3 spots: amber pill; 0 spots: destructive pill + Full label"
    why_human: "No local dev server (NitroViteError). Requires Vercel deploy + seeded class with varied fill levels"
  - test: "SC2 — Member Context panel in a conversation renders the three widget cards (Pass Balance / Next Class / Last Visit) with live data, not a field list"
    expected: "Pass Balance shows credit count in accent color; Next Class shows class name + datetime or 'No upcoming class'; Last Visit shows date + class name or 'No visits recorded'"
    why_human: "Visual layout and data correctness require a live session with a selected conversation"
  - test: "SC3 — Members directory defaults to card view; table view available via ?view=table"
    expected: "On first load (no ?view param): card grid with Avatar initials, membership badge, next-class line. Switching to Table tab appends ?view=table and shows compact table. Search filters both views."
    why_human: "Tab-state + URL param behavior requires browser interaction on a live deploy"
  - test: "SC4 — Messages surface responsive at 375px mobile width"
    expected: "At 375px: conversation list visible, no thread; selecting a conversation shows only the thread (list hidden); thread header shows back link '← Messages' and IconUser button; tapping IconUser opens member context in a bottom sheet"
    why_human: "Responsive layout and Sheet interaction require a browser viewport resize test on a live deploy"
  - test: "SC5 — Role-based nav: coach vs admin tab set"
    expected: "Sign in as email NOT in GYMOS_ADMIN_EMAILS: nav shows Home/Messages/Schedule/Members only. Sign in as admin email: also shows Payments/Analytics/Campaigns/Forms/Settings"
    why_human: "isAdmin resolves from a live session cookie; requires two accounts on the deployed app"
  - test: "SC6 — Staff web is light-only on hard reload regardless of system dark-mode preference"
    expected: "Hard reload /gymos/* with system dark mode active: page renders in light theme. No dark toggle visible anywhere in /gymos"
    why_human: "next-themes defaultTheme='light' + enableSystem removal is code-verifiable, but the actual render requires a browser with dark system preference"
  - test: "SC7/WDGT-03 — Both embeds render correctly inside an iframe on light AND dark host backgrounds"
    expected: "On embed-dark.html host: white card with dark text + accent button floats visibly. On embed-light.html host: equal readability. /embed/schedule?accent=%23e63946 tints Enquire buttons red."
    why_human: "Iframe-on-host visual rendering requires a live Vercel deploy + the R1 test pages at scripts/ui-baseline/embed-light.html and embed-dark.html"
  - test: "SC8 — Lead-capture form submit button reads 'Send Enquiry' and success reads 'Thanks for your enquiry!'"
    expected: "Submit button label 'Send Enquiry'; success screen 'Thanks for your enquiry! We'll be in touch soon.'; error toast 'Something went wrong. Please try again or call us directly.'"
    why_human: "Code-verifiable (grep confirmed), but actual form interaction confirms the vocabulary is user-visible as intended — low-priority human check"
known_limitations:
  - id: SWEB-01-instructor
    description: "ROADMAP SC1 requires class cards to show instructor. The loader has no instructor column in the schema. The implementation intentionally omits the instructor field and shows name + time + X/Y booked only. This is a documented omission in every plan and summary (R4-UI-SPEC §1 says 'omit cleanly, do not stub TBD'). Surfacing instructor requires a schema/data addition outside R4's visual scope."
    classification: "Accepted limitation — not a code defect. The visual mechanism (3-state capacity, accent today-cell) is fully implemented. The data gap is explicitly acknowledged."
    resolution_path: "Add an instructor column to the classDefinitions or classOccurrences table in a future data phase; the card layout can then include it without further CSS changes."
---

# Phase R4: Staff Web Visual Refresh + Embed Widgets — Verification Report

**Phase Goal:** Staff-web surfaces and public embed widgets are visually redesigned using the token system; the product reads as a purpose-built gym platform, not an adapted email client.
**Verified:** 2026-06-13
**Status:** human_needed (code mechanisms verified; deploy/UAT confirmations + instructor limitation documented)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| SC | Truth | Code Status | Evidence |
|----|-------|-------------|---------|
| 1 | Class cards show name, time, instructor, X/Y booked; capacity amber/red ≤3 spots | PARTIAL — see Known Limitation | `spotsLeft` + `bg-amber-100 text-amber-700` + `bg-destructive/10 text-destructive` at lines 481-488 of gymos.schedule.tsx. Today-cell uses `var(--studio-accent)` at line 398. Instructor: absent by design (no schema column). |
| 2 | Member Context panel shows pass-balance pill, next-class card, last visit as widget cards | VERIFIED (code) | `MemberContextCards` component at line 687, with PASS BALANCE/NEXT CLASS/LAST VISIT widget Cards at lines 716/750/778. Wired to `memberStats.passBalance`, `upcomingBooking`, `memberStats.lastVisit`. |
| 3 | Members directory defaults to card view; table secondary | VERIFIED (code) | `lg:grid-cols-3` card grid at line 296; `TabsTrigger` for cards/table at lines 274/280; `?view=table` URL param at line 201. `nextClassByMember` loader query confirmed. |
| 4 | Messages responsive at mobile widths, member context in bottom Sheet | VERIFIED (code) | `side="bottom"` Sheet at line 1081; `hidden md:flex` at lines 844/973/1189; `md:hidden` back nav at line 1020 and Sheet trigger at line 1073; `← Messages` at line 1023. |
| 5 | Coaches see Schedule/Messages/Members; admins additionally see Payments/Settings | VERIFIED (code) | `isAdmin &&` gates at lines 120/125/130/135/144 of GymosTopNav.tsx; `/_agent-native/auth/session` fetch at line 45; `GYMOS_ADMIN_EMAILS` parsing in root.tsx loader at lines 74-84. |
| 6 | Staff web defaults to light theme; dark absent | VERIFIED (code) | `defaultTheme="light"` at line 303 of root.tsx; `enableSystem` absent (grep returns no output). |
| 7 | /embed/schedule and lead-capture embed render correctly on light and dark host backgrounds | CODE VERIFIED / DEPLOY-UAT PENDING | `class="dark"` absent from both embed SSR files (grep returns no matches). `--studio-accent` injected at lines 241/327. R1 iframe test pages exist at scripts/ui-baseline/. |
| 8 | Lead-capture form uses Enquiry vocabulary | VERIFIED (code) | `"Send Enquiry"` at line 359 of public-form-ssr.ts (button fallback); `"Thanks for your enquiry"` at line 368; `"call us directly"` at line 582; `"Send Enquiry"` also at line 163 of schedule-widget-ssr.ts. |

**Score:** 7 of 8 SCs code-verified (SC1 is partial due to the instructor limitation; SC7 code is verified, deploy-UAT pending). All code mechanisms present and wired.

---

### Known Limitation: Instructor Field (SC1 / SWEB-01)

**Status: Accepted limitation — not a missing code mechanism.**

ROADMAP SC1 reads: "Class cards on the staff schedule show class name, time, **instructor**, and X/Y booked."

The implemented cards show class name, time, and X/Y booked with the full 3-state capacity color system. The instructor field is intentionally absent.

**Root cause:** The `gymos.schedule.tsx` loader fetches from `classOccurrences` joined to `classDefinitions` — neither table has an instructor column in the schema. R4-UI-SPEC §1 explicitly directs "OMIT instructor entirely — do NOT add a placeholder." Every plan and summary documents this omission.

**Classification:** This is a real gap against the literal wording of SC1, acknowledged openly in the plan rather than silently passed. The visual redesign contract (3-state capacity, accent today-cell, clean card layout) is fully delivered. The data gap is a schema/data-model item for a future phase.

**Impact:** The visual system is correct and complete. A staff member viewing the schedule sees class name, time, and booked count with semantic capacity coloring — the "instructor" element is the only missing field.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/staff-web/app/routes/gymos.schedule.tsx` | 3-state capacity indicator + accent today-cell | VERIFIED | `spotsLeft`, `bg-amber-100 text-amber-700`, `bg-destructive/10 text-destructive`, `var(--studio-accent)` — all present |
| `apps/staff-web/app/routes/gymos.messages.tsx` | MemberContextCards + responsive layout + bottom Sheet | VERIFIED | `function MemberContextCards` at line 687; `side="bottom"` at line 1081; `hidden md:flex` at 3 locations; `← Messages` at line 1023 |
| `apps/staff-web/app/routes/gymos.members_.$id.tsx` | Pass-balance pill + next-class card + bookings timeline | VERIFIED | `sm:grid-cols-2` widget card row at line 235; `PASS BALANCE`/`NEXT CLASS` at lines 239/303; `Collapsible` bookings reveal; `No bookings yet` |
| `apps/staff-web/app/routes/gymos.members.tsx` | Card-default directory with Tabs toggle + nextClassByMember | VERIFIED | `TabsTrigger` (2x), `lg:grid-cols-3`, `AvatarFallback`, `nextClassByMember` loader + consumer |
| `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts` | Light/white embed + --studio-accent + Enquiry vocab | VERIFIED | No `class="dark"`, `--studio-accent` at line 241, `"Send Enquiry"` at line 163, `"No upcoming classes at this time."` at line 192 |
| `apps/staff-web/features/forms/lib/public-form-ssr.ts` | Light/white embed + --studio-accent + Enquiry vocab + error copy | VERIFIED | No `class="dark"`, `--studio-accent` at line 327, `"Send Enquiry"` at line 359, `"Thanks for your enquiry"` at line 368, `"call us directly"` at line 582 |
| `apps/staff-web/app/root.tsx` | Light-locked ThemeProvider + GYMOS_ADMIN_EMAILS loader | VERIFIED | `defaultTheme="light"` at line 303; `enableSystem` absent; `adminEmails` + `adminOpen` in loader at lines 74-84 |
| `apps/staff-web/app/components/gymos/GymosTopNav.tsx` | Role-gated nav with isAdmin + session fetch | VERIFIED | `isAdmin &&` gates at lines 120/125/130/135/144; `/_agent-native/auth/session` fetch; `adminEmails`/`adminOpen` from root loader |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `gymos.schedule.tsx` | capacity color states | `spotsLeft`-driven `capacityClass` | WIRED | `spotsLeft = o.capacity - booked` → 3-branch className at lines 481-490 |
| `gymos.schedule.tsx` | studio accent today-cell | `border-[color:var(--studio-accent)]` | WIRED | Line 398; CSS var references the skin token, no hex |
| `gymos.messages.tsx` | MemberContextCards (desktop) | `<aside>` renders `<MemberContextCards ...>` | WIRED | Line 1189 (desktop aside) |
| `gymos.messages.tsx` | MemberContextCards (mobile Sheet) | `<SheetContent>` renders `<MemberContextCards ...>` | WIRED | Lines 1080-1088 |
| `gymos.messages.tsx` | loader `lastVisit` → LAST VISIT widget | derived from `bookings` array, passed as `stats.lastVisit` | WIRED | Lines 317-356 (derivation) → lines 783-796 (render) |
| `gymos.members.tsx` | `nextClassByMember` query → card display | loader query at lines 146-159; card reads `data.nextClassByMember[m.id]` | WIRED | Lines 303-309 in card rendering |
| `schedule-widget-ssr.ts` | `--studio-accent` token | injected from sanitized `?accent` URL param into `:root` | WIRED | Line 241 (`:root { --studio-accent: ${accent}; }`) |
| `public-form-ssr.ts` | `--studio-accent` → button background | `var(--studio-accent,var(--gym-accent,#000))` CSS | WIRED | Line 695 (`.submit-btn` background) |
| `GymosTopNav.tsx` | session email → `isAdmin` gate | `fetch("/_agent-native/auth/session")` → email → `adminEmails.includes()` | WIRED | Lines 45-60 |
| `root.tsx` | `GYMOS_ADMIN_EMAILS` → loader → GymosTopNav | `process.env.GYMOS_ADMIN_EMAILS` → `adminEmails`/`adminOpen` returned from loader → consumed via `useRouteLoaderData("root")` | WIRED | Lines 74-84 (loader) + lines 36-37 (consumer) |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `gymos.schedule.tsx` capacity pill | `booked = bookingCounts[o.id]` | `bookingCounts: Record<string, number>` from loader (existing DB query) | Yes | FLOWING |
| `gymos.messages.tsx` PASS BALANCE | `stats.passBalance` | `memberStats.passBalance` from passes query in loader | Yes | FLOWING |
| `gymos.messages.tsx` NEXT CLASS | `upcomingBooking` | Loader bookings query filtered for future booked | Yes | FLOWING |
| `gymos.messages.tsx` LAST VISIT | `stats.lastVisit` | Derived from existing `bookings` array (no new query) | Yes | FLOWING |
| `gymos.members.tsx` card view | `nextClassByMember` | Additive loader query: bookings→occurrences→definitions join | Yes | FLOWING |
| `gymos.members_.$id.tsx` PASS BALANCE | `passBalance` | Loader passes+debits query | Yes | FLOWING |
| embed `schedule-widget-ssr.ts` | `--studio-accent` | Sanitized `?accent` URL param (`sanitizeHexColor`) | Yes (from URL) | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — no local dev server (NitroViteError documented project constraint). All code mechanisms verified statically. Deploy-UAT items captured under Human Verification Required.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Code Status | Evidence |
|-------------|------------|-------------|-------------|---------|
| SWEB-01 | R4-01 | Class cards: name, time, instructor, X/Y booked | PARTIAL | Name/time/X-of-Y: confirmed. Instructor: absent by design (no schema column). See Known Limitation. |
| SWEB-02 | R4-01 | Capacity amber/red ≤3 spots | SATISFIED | `bg-amber-100 text-amber-700` (1-3) + `bg-destructive/10 text-destructive` (0) — lines 485-488 |
| SWEB-03 | R4-05 | Member Context panel: pass-balance, next-class, last visit as widget cards | SATISFIED | `MemberContextCards` with all 3 widgets + real data wiring |
| SWEB-04 | R4-02 | Member Profile: pass-balance pill, next-class card, bookings timeline | SATISFIED | `sm:grid-cols-2` widget row + Collapsible bookings timeline in gymos.members_.$id.tsx |
| SWEB-05 | R4-03 | Members directory: card default + table secondary | SATISFIED | Tabs card/table toggle with `?view` param; card grid `lg:grid-cols-3` |
| SWEB-06 | R4-06 | Messages responsive: single column mobile + bottom sheet | SATISFIED | `hidden md:flex` responsive classes + `side="bottom"` SheetContent |
| SWEB-07 | R4-07 | Role-based nav: coaches vs admins | SATISFIED | `isAdmin &&` gates on Payments/Analytics/Campaigns/Forms/Settings; DOM-omitted for non-admin |
| SWEB-08 | R4-07 | Staff web light theme default | SATISFIED | `defaultTheme="light"` + `enableSystem` removed from root.tsx ThemeProvider |
| WDGT-01 | R4-04 | /embed/schedule: clean card embed, no admin chrome, studio token themed | SATISFIED (code) | `class="dark"` absent; `--studio-accent` injected; `Enquire` CTA present; no nav/sign-out |
| WDGT-02 | R4-04 | Lead form: studio tokens + Enquiry vocabulary | SATISFIED (code) | `--studio-accent` + `"Send Enquiry"` + `"Thanks for your enquiry"` + `"call us directly"` |
| WDGT-03 | R4-04 | Both embeds verified on light AND dark host backgrounds | PENDING DEPLOY-UAT | Code mechanism correct (dark default removed); R1 iframe test pages exist; human UAT required |

---

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `gymos.schedule.tsx` | `bg-amber-100 text-amber-700` | Info | Intentional semantic amber with `guard:allow-color` marker — correct per R4-UI-SPEC color contract |
| `gymos.members.tsx` | `text-amber-700` | Info | "Expiring" membership badge with `guard:allow-color` marker — same pattern |
| `gymos.members_.$id.tsx` | `bg-destructive/10 text-destructive` (No-show badge) | Info | With `guard:allow-color` — semantic, not brand color |

No blocker or warning anti-patterns found. All color guard markers are correctly placed. `node scripts/guard-no-hardcoded-colors.mjs` exits 0.

---

### Human Verification Required

#### 1. SC1 Instructor Gap — Schema Decision

**Test:** Decide whether the instructor field absence is acceptable for v1.1 or should be scheduled as a follow-on data task.
**Expected:** A future schema/data task adds `instructorName` to `classDefinitions` or `classOccurrences`; the schedule card renders it without further CSS changes.
**Why human:** Not a code defect — requires a product/data-model decision and schema migration.

#### 2. SC1/SC2/SC4 — Visual Correctness on Live Deploy

**Test:** Navigate to `/gymos/schedule` on the Vercel deploy; find a class with 8/10 booked and one with 10/10. Observe the capacity pill colors.
**Expected:** 8/10: muted text. 9/10 (1 spot left): amber pill `bg-amber-100 text-amber-700`. 10/10 (full): destructive pill `bg-destructive/10 text-destructive` + " · Full" text + "Full" button disabled. Today's cell has a studio-accent tinted border+background.
**Why human:** No local dev server. Code mechanism is fully present; visual rendering requires the deployed app.

#### 3. SC3 — Members Card/Table Toggle + ?view Persistence

**Test:** Open `/gymos/members` on the live deploy (cards by default). Click "Table" tab → URL should become `?view=table` and show a compact table. Refresh the page → table view should persist. Click "Cards" → URL drops the param.
**Expected:** Card grid on default; table on `?view=table`; search filters both identically.
**Why human:** URL param behavior and Tabs state require browser interaction.

#### 4. SC4 — Messages Mobile Responsiveness

**Test:** Open `/gymos/messages` in a 375px viewport on the live deploy. Observe: only the conversation list is visible initially. Tap a conversation: list disappears, thread fills screen. Thread header shows "← Messages" (back link) and an IconUser button. Tap IconUser: a bottom sheet slides up with the three widget cards.
**Expected:** Seamless single-column flow; Sheet renders widget cards correctly.
**Why human:** Requires browser viewport resize + touch interaction.

#### 5. SC5 — Role-Gated Nav (Two Accounts)

**Test:** Sign in with a non-admin email (not in `GYMOS_ADMIN_EMAILS`). Verify Payments/Analytics/Campaigns/Forms/Settings are absent from the nav DOM (not merely hidden). Sign in with an admin email. Verify all tabs appear.
**Expected:** Coach: Home/Messages/Schedule/Members + Sign Out only. Admin: all tabs including Payments/Analytics/Campaigns/Forms/Settings.
**Why human:** Requires two live accounts and GYMOS_ADMIN_EMAILS configured on Vercel.

#### 6. SC7/WDGT-03 — Embeds on Light and Dark Host Backgrounds

**Test:** After deploy, open `scripts/ui-baseline/embed-light.html` and `scripts/ui-baseline/embed-dark.html` pointed at the live `/embed/schedule` and a published form URL.
**Expected:**
- Dark host: white card with dark text + accent-colored Enquire button (high-contrast float, readable)
- Light host: equal readability
- `/embed/schedule?accent=%23e63946`: Enquire buttons render in red
- Lead form submit button reads "Send Enquiry"
- Capture after-state screenshots into `scripts/ui-baseline/` for the regression record.
**Why human:** Iframe-on-host rendering requires a live Vercel deploy + the R1 test pages.

---

### Gaps Summary

No code-level gaps. All 7 SWEB requirements and WDGT-01/WDGT-02 have their code mechanisms present, substantive, and wired to real data.

**Known limitation (not a code gap):** SWEB-01 instructor field is absent. The loader and card layout are correct for the data available; the instructor column does not exist in the schema. R4-UI-SPEC explicitly directs omission rather than stubbing. This should be tracked as a follow-on data/schema task, not as a verification failure.

**Pending deploy/UAT:** WDGT-03 is the only requirement explicitly pending human verification — the code mechanism (dark default removed, `--studio-accent` injected) is correct; only the visual iframe-on-host-background rendering needs a live deploy to confirm.

---

*Verified: 2026-06-13*
*Verifier: Claude (gsd-verifier)*
