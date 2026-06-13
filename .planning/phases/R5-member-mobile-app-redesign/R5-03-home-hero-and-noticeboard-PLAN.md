---
phase: R5-member-mobile-app-redesign
plan: 03
type: execute
wave: 2
depends_on: ["R5-01"]
files_modified:
  - packages/mobile-app/app/(tabs)/index.tsx
  - packages/mobile-app/components/KcalRing.tsx
autonomous: true
requirements: [MOBL-04, MOBL-06, MOBL-01]
must_haves:
  truths:
    - "The Home tab hero shows next class, pass balance, and latest coach message as prominent cards"
    - "Studio updates are framed in coach voice ('From your coach' / 'Studio updates'), not a generic notification feed"
    - "index.tsx and KcalRing render from theme tokens with zero bare hex in index.tsx"
  artifacts:
    - path: "packages/mobile-app/app/(tabs)/index.tsx"
      provides: "Home hero: pass balance + next class + latest coach message cards; coach-voice noticeboard section; theme-token styling"
      contains: "useTheme"
  key_links:
    - from: "packages/mobile-app/app/(tabs)/index.tsx"
      to: "/api/m/profile"
      via: "apiFetch useQuery (existing)"
      pattern: "apiFetch"
    - from: "packages/mobile-app/app/(tabs)/index.tsx"
      to: "packages/mobile-app/lib/theme.ts"
      via: "useTheme"
      pattern: "useTheme"
---

<objective>
Turn the Home tab into a hero surface (next class + pass balance + latest coach message as prominent cards), add a coach-voice noticeboard section, and migrate index.tsx (and its KcalRing dependency) to theme tokens.

Purpose: MOBL-04 (Home hero with next class + pass balance + latest coach message) and MOBL-06 (noticeboard reframed in coach voice). Per R5-CONTEXT D-09, the lighter-touch option is a coach-voice section on Home rather than a new dedicated surface. index.tsx is owned solely by this plan so it runs parallel to R5-02 and R5-04.

Output: a redesigned Home screen with hero cards + coach-voice updates, hex-clean.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/R5-member-mobile-app-redesign/R5-CONTEXT.md
@.planning/phases/R5-member-mobile-app-redesign/R5-01-theme-foundation-PLAN.md

<interfaces>
<!-- From R5-01: lib/theme.ts -->
import { useTheme } from "../../lib/theme";
const theme = useTheme(); // StudioTokens (colors/radius/spacing/font)

<!-- Existing /api/m/profile response (from current index.tsx) — already wired -->
type ProfileResponse = {
  member: { id: string; firstName: string; lastName: string | null; email: string | null; phoneE164: string | null; goal: string | null };
  passBalance: number;
  upcomingBooking: { bookingId: string; occurrenceId: string; startsAt: string; className: string | null } | null;
  today: { kcal: number; proteinG: number; carbsG: number; fatG: number; targetKcal: number; targetProteinG: number; targetCarbsG: number; targetFatG: number };
};
<!-- NOTE: /api/m/profile does NOT currently return a coach message or studio updates.
     Per R5-CONTEXT D-07, source "latest coach message" from existing conversations/agent data IF available,
     otherwise render a graceful empty/last-known state. Do NOT add new backend endpoints (out of scope).
     The current deploy 401-gates /api/m/* (D-12) so the screen MUST not crash on missing data. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate index.tsx + KcalRing to theme tokens</name>
  <read_first>
    - packages/mobile-app/app/(tabs)/index.tsx (19 hex: #111 bg, #fff text, #999/#666 muted, #1f2937 pill, #7f1d1d pillRed, #1a1a1a card, #3b82f6 btn, #f88 error)
    - packages/mobile-app/components/KcalRing.tsx (5 hex: #2a2a2a bg ring, #3b82f6 progress x2, #fff bigNum, #999 small)
    - packages/mobile-app/lib/theme.ts (token names + the in-render styles pattern documented at top of file)
  </read_first>
  <files>packages/mobile-app/app/(tabs)/index.tsx, packages/mobile-app/components/KcalRing.tsx</files>
  <action>
    1. `index.tsx`: call `const theme = useTheme()`, convert the top-level `StyleSheet.create` to an in-render `useMemo(() => StyleSheet.create({...}), [theme])` (the pattern from theme.ts). Map hex → tokens:
       - `#111` → `theme.colors.background`; `#1a1a1a` card → `theme.colors.card`; `#1f2937` pill → `theme.colors.cardElevated`; `#7f1d1d` pillRed → `theme.colors.dangerSoft`; `#3b82f6` btn → `theme.colors.accent`; `#fff` text/icons → `theme.colors.foreground` (and `btnText`/pill-on-accent → `theme.colors.accentForeground`); `#999` → `theme.colors.muted`; `#666` → `theme.colors.mutedFaint`; `#f88` error → `theme.colors.danger`. Apply `fontFamily: theme.font.bold` to `greeting`, `theme.font.semibold` to section labels/booking title/buttons, `theme.font.regular` to body.

    2. `KcalRing.tsx`: KcalRing is a leaf component used by Home. Add an optional `colors` prop or make it consume `useTheme()` directly. Cleanest: import `useTheme` in KcalRing and read `theme.colors` (background ring `#2a2a2a` → `theme.colors.border`; progress arcs `#3b82f6` ×2 → `theme.colors.accent`; `bigNum #fff` → `theme.colors.foreground`; `small #999` → `theme.colors.muted`). Convert its `StyleSheet.create` to the in-render pattern. KcalRing lives in `components/` (outside the `app/**` grep gate) but MUST be migrated so the Home ring matches the dark-first orange palette — leaving `#3b82f6` blue arcs would visibly clash.

    Preserve KcalRing's geometry/rotation math and index.tsx's data flow, booking-time labels, and refetch-on-focus exactly. This task is a pure token swap; the hero restructure is Task 2.

    After this task `grep -E "#[0-9a-fA-F]{3,8}" packages/mobile-app/app/(tabs)/index.tsx` returns zero, and KcalRing.tsx has no `#3b82f6`/`#2a2a2a`/`#fff`/`#999` literals.
  </action>
  <verify>
    <automated>test "$(grep -cE '#[0-9a-fA-F]{3,8}' 'packages/mobile-app/app/(tabs)/index.tsx')" = "0" && test "$(grep -cE '#[0-9a-fA-F]{3,8}' packages/mobile-app/components/KcalRing.tsx)" = "0" && grep -q "useTheme" 'packages/mobile-app/app/(tabs)/index.tsx' && grep -q "useTheme" packages/mobile-app/components/KcalRing.tsx && echo "index.tsx + KcalRing hex-clean + themed"</automated>
  </verify>
  <done>index.tsx and KcalRing use theme tokens + Inter, call useTheme(), and contain zero bare hex; KcalRing arcs are accent-colored; no behavior changed.</done>
</task>

<task type="auto">
  <name>Task 2: Build the Home hero (next class + pass balance + latest coach message) + coach-voice noticeboard</name>
  <read_first>
    - packages/mobile-app/app/(tabs)/index.tsx (current layout: greeting, pass pill, Next class card, Today nutrition card — the hero reorganizes these into prominent cards and adds coach message + updates)
    - .planning/phases/R5-member-mobile-app-redesign/R5-CONTEXT.md (D-07 Home hero = next class + pass balance + latest coach message as prominent cards, graceful empty if coach data unavailable; D-09 noticeboard in coach voice "From your coach"/"Studio updates" — lighter-touch Home section)
    - packages/mobile-app/lib/theme.ts (tokens)
    - The <interfaces> note (no coach-message field on /api/m/profile today; do not add backend; graceful empty/last-known)
  </read_first>
  <files>packages/mobile-app/app/(tabs)/index.tsx</files>
  <action>
    Restructure the Home screen into a hero + noticeboard while keeping the existing nutrition card. Order top-to-bottom:

    1. **Greeting + pass-balance hero** — keep `"Hi {firstName}"`, and elevate the pass balance into a prominent hero card (not just a small pill): a card showing `"{passBalance} {credit/credits}"` large with a `"Pass Balance"` label, using accent emphasis and the low-balance danger treatment when `<= 0` (reuse the existing `lowBalance` logic). This is one of the three hero elements (MOBL-04).

    2. **Next class hero card** — keep/upgrade the existing "Next class" card as a prominent card: class name + `bookingTimeLabel(startsAt)`, tappable → `router.push("/(tabs)/schedule")` (Classes tab), with the existing empty state ("No upcoming class / Tap to browse the schedule"). Second hero element (MOBL-04).

    3. **Latest coach message hero card** — NEW. A prominent card headed `"From your coach"` (coach-voice framing, MOBL-06). Source the latest coach message from existing data if the profile response (or a cheap existing /api/m/* read already used elsewhere) exposes it; since `/api/m/profile` does not currently carry a coach message, render a graceful last-known/empty state: a friendly placeholder line in coach voice (e.g. `"No new messages from your coach right now — check back after class."`) using `muted` text. Add an optional typed field (e.g. `latestCoachMessage?: { body: string; sentAt: string } | null`) to the local ProfileResponse type and a `.map`/conditional that renders the real message when present, so wiring real data later is additive (no rewrite). Do NOT crash when absent (D-12 — /api/m/* may 401). Do NOT call an LLM or add a backend endpoint.

    4. **Studio updates (coach-voice noticeboard) section** — NEW. A section headed `"Studio updates"` (MOBL-06 coach-voice framing, explicitly NOT "Notifications"). Render any studio-update items in coach voice as cards; with no dedicated updates feed in the existing API, render a graceful empty state ("No studio updates this week.") with `mutedFaint` text and a structure ready to map a future `studioUpdates?: StudioUpdate[]` array. This is the lighter-touch Home noticeboard chosen in D-09 (no new dedicated surface).

    5. **Today nutrition card** — keep the existing KcalRing + macros + "+ Log a meal" button (now routing to the Log tab `/(tabs)/food`), below the hero.

    All new UI uses `theme.colors.*` / `theme.font.*` tokens (zero bare hex — this file is in the `app/**` gate). Keep refetch-on-focus, loading, and error states intact and crash-free.

    Use Feather icons already in the app (e.g. `message-circle` / `message-square` for the coach card, `award` for pass balance, `bell` is acceptable for studio updates) — no new icon library, no emojis-as-icons (per CLAUDE.md/AGENTS.md).
  </action>
  <verify>
    <automated>test "$(grep -cE '#[0-9a-fA-F]{3,8}' 'packages/mobile-app/app/(tabs)/index.tsx')" = "0" && node -e "const s=require('fs').readFileSync('packages/mobile-app/app/(tabs)/index.tsx','utf8'); for(const t of ['From your coach','Studio updates','Pass Balance','Next class']){ if(!s.includes(t)) throw new Error('missing hero/noticeboard text: '+t);} console.log('hero + coach-voice noticeboard present')"</automated>
  </verify>
  <done>Home shows pass-balance + next-class + "From your coach" message as prominent hero cards plus a "Studio updates" coach-voice section; all states crash-free; zero bare hex.</done>
</task>

</tasks>

<verification>
- `grep -E "#[0-9a-fA-F]{3,8}" packages/mobile-app/app/(tabs)/index.tsx` returns zero; KcalRing.tsx hex-clean.
- index.tsx contains the strings "From your coach", "Studio updates", "Pass Balance", "Next class".
- HUMAN-UAT (deferred to EAS build): hero cards render, coach-voice copy reads correctly, ring is orange. Not runnable now (D-12).
</verification>

<success_criteria>
- ROADMAP R5 criterion 4 (Home hero: next class + pass balance + latest coach message) — satisfied (real coach data wires additively when available).
- ROADMAP R5 criterion 6 (noticeboard in coach voice) — satisfied via the "From your coach" / "Studio updates" Home section.
- ROADMAP R5 criterion 1 (zero bare hex) — satisfied for index.tsx.
</success_criteria>

<output>
After completion, create `.planning/phases/R5-member-mobile-app-redesign/R5-03-SUMMARY.md`
</output>
