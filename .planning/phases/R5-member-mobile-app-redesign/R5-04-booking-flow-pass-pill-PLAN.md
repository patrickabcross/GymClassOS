---
phase: R5-member-mobile-app-redesign
plan: 04
type: execute
wave: 2
depends_on: ["R5-01"]
files_modified:
  - packages/mobile-app/app/(tabs)/schedule.tsx
autonomous: true
requirements: [MOBL-05, MOBL-01]
must_haves:
  truths:
    - "Booking completes in three steps or fewer: select class -> confirm (with pass/drop-in choice) -> done"
    - "A pass-balance pill is visible throughout the booking flow"
    - "schedule.tsx renders from theme tokens with zero bare hex"
  artifacts:
    - path: "packages/mobile-app/app/(tabs)/schedule.tsx"
      provides: "Classes tab + <=3-step booking flow with pass/drop-in choice + persistent pass-balance pill; theme-token styling"
      contains: "useTheme"
  key_links:
    - from: "packages/mobile-app/app/(tabs)/schedule.tsx"
      to: "/api/m/bookings"
      via: "apiFetch POST (existing booking mutation)"
      pattern: "api/m/bookings"
    - from: "packages/mobile-app/app/(tabs)/schedule.tsx"
      to: "/api/m/profile"
      via: "apiFetch useQuery for pass-balance pill"
      pattern: "api/m/profile"
---

<objective>
Tighten the Classes (schedule) booking flow to three steps or fewer with an explicit pass/drop-in choice at confirm, add a persistent pass-balance pill visible throughout, and migrate schedule.tsx to theme tokens.

Purpose: MOBL-05 (booking ≤3 steps: select → confirm with pass/drop-in choice → done, persistent pass pill) and the MOBL-01 hex elimination for schedule.tsx. This file is owned solely by this plan, so it runs parallel to R5-02 and R5-03. The tab is already relabeled "Classes" by R5-02 (tab title only); this plan does NOT touch (tabs)/_layout.tsx.

Output: a refined booking flow on schedule.tsx with a persistent pass pill, hex-clean.
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
const theme = useTheme(); // StudioTokens

<!-- Existing schedule item shape + booking mutation (from current schedule.tsx) -->
type Item = { id: string; startsAt: string; endsAt: string; capacity: number; className: string | null; category: string | null; durationMin: number | null; bookedCount: number; isBookedByMe: boolean; full: boolean };
// GET /api/m/schedule -> { items: Item[] }
// POST /api/m/bookings { occurrenceId } -> booking (optimistic mutation already implemented)
// GET /api/m/profile -> { passBalance: number, ... }  // for the pass pill
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate schedule.tsx to theme tokens</name>
  <read_first>
    - packages/mobile-app/app/(tabs)/schedule.tsx (18 hex: #111 bg, #fff text/icons, #999/#666 muted, #1a1a1a card, #16a34a bookedBadge, #3b82f6 btn, #7f1d1d toast, #f88 full/error, #444→none; check actual literals)
    - packages/mobile-app/lib/theme.ts (token names + in-render styles pattern)
  </read_first>
  <files>packages/mobile-app/app/(tabs)/schedule.tsx</files>
  <action>
    Call `const theme = useTheme()` and convert the top-level `StyleSheet.create` to the in-render `useMemo(() => StyleSheet.create({...}), [theme])` pattern from theme.ts. Map hex → tokens:
    - `#111` → `theme.colors.background`; `#1a1a1a` card → `theme.colors.card`; `#fff` text/icons → `theme.colors.foreground` (on-accent btnText/badge text → `theme.colors.accentForeground`); `#999` → `theme.colors.muted`; `#666` → `theme.colors.mutedFaint`; `#16a34a` bookedBadge → `theme.colors.success`; `#3b82f6` btn → `theme.colors.accent`; `#7f1d1d` toast → `theme.colors.dangerSoft`; `#f88` fullText/error → `theme.colors.danger`.
    Apply `fontFamily`: section headers/class name/buttons → `theme.font.semibold`, body/meta/time → `theme.font.regular`.
    Preserve the FlatList, day grouping, expand/collapse, optimistic booking mutation, rollback, and toast behavior exactly. Pure token swap.
    After this task `grep -E "#[0-9a-fA-F]{3,8}" packages/mobile-app/app/(tabs)/schedule.tsx` returns zero.
  </action>
  <verify>
    <automated>test "$(grep -cE '#[0-9a-fA-F]{3,8}' 'packages/mobile-app/app/(tabs)/schedule.tsx')" = "0" && grep -q "useTheme" 'packages/mobile-app/app/(tabs)/schedule.tsx' && echo "schedule.tsx hex-clean + themed"</automated>
  </verify>
  <done>schedule.tsx uses theme tokens + Inter, calls useTheme(), zero bare hex; booking behavior unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Add persistent pass-balance pill + pass/drop-in choice in a ≤3-step booking flow</name>
  <read_first>
    - packages/mobile-app/app/(tabs)/schedule.tsx (current flow: tap card to expand (step 1 select) -> "Confirm booking" button (step 2 confirm) -> optimistic update (step 3 done). Already ~3 steps; this task makes the pass/drop-in choice explicit at confirm and adds the persistent pill.)
    - packages/mobile-app/app/(tabs)/index.tsx (the existing pass-balance pill markup: award icon + "{n} credits", pillRed when low — reuse this visual for the persistent pill)
    - packages/mobile-app/lib/api.ts (apiFetch)
    - .planning/phases/R5-member-mobile-app-redesign/R5-CONTEXT.md (D-08: ≤3 steps select -> confirm with pass/drop-in choice -> done; persistent pass-balance pill visible throughout; refine the existing flow, do not rebuild)
  </read_first>
  <files>packages/mobile-app/app/(tabs)/schedule.tsx</files>
  <action>
    Refine (do NOT rebuild) the booking flow to satisfy MOBL-05:

    1. **Persistent pass-balance pill.** Add a sticky header pill above the FlatList that stays visible throughout browsing and booking. Add a `useQuery(["profile"], () => apiFetch("/api/m/profile"))` to read `passBalance`, render an award-icon pill `"{passBalance} {credit/credits}"` (reuse index.tsx's pill visual + low-balance danger treatment). Place it in the `styles.container` header area so it does not scroll away (outside the FlatList, or as a fixed header View above the FlatList). Invalidate/refetch `["profile"]` in the booking mutation's `onSuccess` (the mutation already invalidates `["profile"]` — confirm the pill reads from the same query key so it updates after a booking spends a credit).

    2. **Explicit pass/drop-in choice at confirm (the "confirm" step).** When a class card is expanded (step 1 = select) and not booked/not full, the expanded row currently shows a single "Confirm booking" button. Replace it with a confirm step that presents the pass/drop-in choice (step 2 = confirm with choice):
       - If `passBalance > 0`: show two clearly-labeled options — `"Use 1 pass"` (primary, accent) and `"Pay drop-in"` (secondary). Selecting either fires the booking. The existing POST `/api/m/bookings { occurrenceId }` is the only booking endpoint available; pass the member's choice along if the endpoint accepts it, otherwise record the choice client-side and still call the existing endpoint (do NOT invent a new endpoint — out of scope). Keep a short comment noting drop-in payment wiring is a future master-branch concern (Stripe purchase flow is P1c.1, not R5).
       - If `passBalance <= 0`: show only `"Pay drop-in"` (no pass to spend) plus a hint that the member is out of credits, linking conceptually to passes (no hard dependency — a plain note is fine).
       Selecting an option = step 2; the optimistic update + booked badge = step 3 (done). This keeps the flow at exactly three steps: select (expand) -> confirm (choose pass/drop-in) -> done (booked).

    3. Keep the full-class state ("This class is full"), the optimistic update, rollback, and toast intact. All new UI uses theme tokens (zero bare hex).

    Keep using existing Feather icons (e.g. `award` for the pill, `check` for booked) — no new icon lib, no emojis.
  </action>
  <verify>
    <automated>test "$(grep -cE '#[0-9a-fA-F]{3,8}' 'packages/mobile-app/app/(tabs)/schedule.tsx')" = "0" && node -e "const s=require('fs').readFileSync('packages/mobile-app/app/(tabs)/schedule.tsx','utf8'); for(const t of ['api/m/profile','passBalance','drop-in']){ if(!s.toLowerCase().includes(t.toLowerCase())) throw new Error('missing: '+t);} if(!/pass/i.test(s)) throw new Error('no pass choice'); console.log('pass pill + pass/drop-in choice present')"</automated>
  </verify>
  <done>schedule.tsx shows a persistent pass-balance pill, offers an explicit pass/drop-in choice at the confirm step within a ≤3-step flow, updates the pill after booking, and contains zero bare hex.</done>
</task>

</tasks>

<verification>
- `grep -E "#[0-9a-fA-F]{3,8}" packages/mobile-app/app/(tabs)/schedule.tsx` returns zero.
- schedule.tsx references /api/m/profile (pill), passBalance, and a drop-in/pass choice.
- HUMAN-UAT (deferred to EAS build): the 3-step booking feels fast, pill stays visible, pass/drop-in choice works end-to-end. Not runnable now (D-12; /api/m/* 401-gated; no local dev server).
</verification>

<success_criteria>
- ROADMAP R5 criterion 5 (booking ≤3 steps select→confirm with pass/drop-in choice→done, persistent pass pill) — satisfied at code level.
- ROADMAP R5 criterion 1 (zero bare hex) — satisfied for schedule.tsx.
</success_criteria>

<output>
After completion, create `.planning/phases/R5-member-mobile-app-redesign/R5-04-SUMMARY.md`
</output>
