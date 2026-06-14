---
phase: R5-member-mobile-app-redesign
plan: 02
type: execute
wave: 2
depends_on: ["R5-01"]
files_modified:
  - packages/mobile-app/app/(tabs)/_layout.tsx
  - packages/mobile-app/app/(tabs)/passes.tsx
  - packages/mobile-app/app/(tabs)/food.tsx
  - packages/mobile-app/app/(tabs)/profile.tsx
  - packages/mobile-app/app/food-add.tsx
  - packages/mobile-app/app/food-barcode.tsx
  - packages/mobile-app/app/pick-member.tsx
autonomous: true
requirements: [MOBL-02, MOBL-01]
must_haves:
  truths:
    - "Bottom tabs read Home / Classes / Passes / Log / Profile in that exact order"
    - "A Passes tab shows the member's pass balance and (where available) history"
    - "The Log, Profile, food-add, food-barcode, and pick-member screens render from theme tokens with zero bare hex"
  artifacts:
    - path: "packages/mobile-app/app/(tabs)/_layout.tsx"
      provides: "5 tabs in order with theme-token tab bar; titles Home/Classes/Passes/Log/Profile"
      contains: "Passes"
    - path: "packages/mobile-app/app/(tabs)/passes.tsx"
      provides: "Passes tab screen — pass balance + history; reuses /api/m/profile passBalance"
      min_lines: 40
  key_links:
    - from: "packages/mobile-app/app/(tabs)/passes.tsx"
      to: "/api/m/profile"
      via: "apiFetch useQuery"
      pattern: "apiFetch"
    - from: "packages/mobile-app/app/(tabs)/_layout.tsx"
      to: "packages/mobile-app/lib/theme.ts"
      via: "useTheme for tab bar colors"
      pattern: "useTheme"
---

<objective>
Rename and reorder the bottom tabs to Home / Classes / Passes / Log / Profile, add the new Passes tab screen, and migrate all hardcoded hex to theme tokens in the leaf screens not owned by the Home or Booking plans (Log, Profile, food-add, food-barcode, pick-member) plus the tab bar itself.

Purpose: MOBL-02 (tab rename + 5th Passes tab) and the MOBL-01 hex elimination for the screens no other R5 plan touches. Grouping the tab bar with the leaf-screen hex migration keeps file ownership disjoint from R5-03 (index.tsx) and R5-04 (schedule.tsx) so all three wave-2 plans run in parallel without colliding.

Output: a 5-tab shell, a Passes screen, and 5 hex-clean leaf screens.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/R5-member-mobile-app-redesign/R5-CONTEXT.md
@.planning/phases/R1-audit-baseline/NAMING-RECORD.md
@.planning/phases/R5-member-mobile-app-redesign/R5-01-theme-foundation-PLAN.md

<interfaces>
<!-- From R5-01: lib/theme.ts -->
import { useTheme } from "../../lib/theme"; // from (tabs)/* ; "../lib/theme" from app/*
const theme = useTheme(); // -> StudioTokens (colors/radius/spacing/font)
// StyleSheet.create cannot read context. Use the pattern documented at the top of theme.ts
// (R5-01 Task 2): build styles inline or via a makeStyles(theme) factory called in-render.

<!-- /api/m/profile response shape (from app/(tabs)/index.tsx) — Passes tab reuses passBalance -->
type ProfileResponse = {
  member: { id: string; firstName: string; lastName: string | null; goal: string | null };
  passBalance: number;
  upcomingBooking: { bookingId: string; occurrenceId: string; startsAt: string; className: string | null } | null;
  today: { kcal: number; targetKcal: number; /* ... */ };
};
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename + reorder tabs and theme the tab bar</name>
  <read_first>
    - packages/mobile-app/app/(tabs)/_layout.tsx (current 4 tabs Home/Schedule/Food/Profile; tabBarStyle bg #111111 borderTopColor #222222; active #ffffff inactive #666666; header #111111/#ffffff; uses Feather icons home/calendar/coffee/user)
    - .planning/phases/R1-audit-baseline/NAMING-RECORD.md (§Label Layer mobile rows: Schedule→Classes, Food→Log, add Passes; Home/Profile keep)
    - .planning/phases/R5-member-mobile-app-redesign/R5-CONTEXT.md (D-06: exact order Home / Classes / Passes / Log / Profile; keep Feather icon lib, no emojis)
    - packages/mobile-app/lib/theme.ts (useTheme tokens)
  </read_first>
  <files>packages/mobile-app/app/(tabs)/_layout.tsx</files>
  <action>
    Modify `(tabs)/_layout.tsx`:

    1. Call `const theme = useTheme();` inside `TabsLayout` and replace tab bar hex with tokens:
       - `tabBarStyle.backgroundColor: "#111111"` → `theme.colors.card` (slightly elevated from page bg reads as a tab bar); `borderTopColor: "#222222"` → `theme.colors.border`.
       - `tabBarActiveTintColor: "#ffffff"` → `theme.colors.accent` (orange active tab — on-brand) ; `tabBarInactiveTintColor: "#666666"` → `theme.colors.mutedFaint`.
       - header `backgroundColor: "#111111"` → `theme.colors.background`; `headerTintColor: "#ffffff"` → `theme.colors.foreground`.
       - Add `tabBarLabelStyle: { fontFamily: theme.font.semibold }` and `headerTitleStyle: { fontFamily: theme.font.semibold }` so tabs use Inter (replace the existing `headerTitleStyle: { fontWeight: "600" }`).

    2. Reorder and relabel the `<Tabs.Screen>` entries to this EXACT order with these EXACT `title` strings:
       - `name="index"` → `title: "Home"` (keep), icon Feather `home`
       - `name="schedule"` → `title: "Classes"` (relabel), icon Feather `calendar`
       - `name="passes"` → `title: "Passes"` (NEW — added in Task 2), icon Feather `award` (matches the pass/credits award icon used on Home pill)
       - `name="food"` → `title: "Log"` (relabel), icon Feather `coffee`
       - `name="profile"` → `title: "Profile"` (keep), icon Feather `user`

       The Passes `<Tabs.Screen name="passes">` entry must sit between `schedule` and `food` so the rendered tab order is Home / Classes / Passes / Log / Profile.

    After this task, `grep -E "#[0-9a-fA-F]{3,8}" packages/mobile-app/app/(tabs)/_layout.tsx` MUST return zero.
  </action>
  <verify>
    <automated>test "$(grep -cE '#[0-9a-fA-F]{3,8}' 'packages/mobile-app/app/(tabs)/_layout.tsx')" = "0" && node -e "const s=require('fs').readFileSync('packages/mobile-app/app/(tabs)/_layout.tsx','utf8'); for(const t of ['title: \"Home\"','title: \"Classes\"','title: \"Passes\"','title: \"Log\"','title: \"Profile\"','name=\"passes\"']){ if(!s.includes(t)) throw new Error('missing '+t);} const order=['\"Home\"','\"Classes\"','\"Passes\"','\"Log\"','\"Profile\"'].map(x=>s.indexOf(x)); for(let i=1;i<order.length;i++){ if(order[i]<order[i-1]) throw new Error('tab order wrong'); } console.log('tabs ordered + hex-clean')"</automated>
  </verify>
  <done>Five tabs in order Home/Classes/Passes/Log/Profile with exact titles; tab bar uses theme tokens + Inter; zero bare hex.</done>
</task>

<task type="auto">
  <name>Task 2: Create the Passes tab screen</name>
  <read_first>
    - packages/mobile-app/app/(tabs)/index.tsx (the pass-balance pill pattern + ProfileResponse shape + apiFetch/useQuery + useFocusEffect refetch pattern to mirror)
    - packages/mobile-app/lib/api.ts (apiFetch wrapper)
    - packages/mobile-app/lib/theme.ts (useTheme)
    - .planning/phases/R5-member-mobile-app-redesign/R5-CONTEXT.md (D-06 Passes = pass balance + history screen; Claude's Discretion: layout + data source — reuse member pass data; D-07 graceful empty/last-known state since /api/m/* is 401-gated on the deploy)
  </read_first>
  <files>packages/mobile-app/app/(tabs)/passes.tsx</files>
  <action>
    Create `(tabs)/passes.tsx` — a new Expo Router tab screen. Build with `useTheme()` tokens (zero bare hex):

    - `useQuery(["profile"], () => apiFetch("/api/m/profile"))` with the same `useFocusEffect(refetch)` pattern as index.tsx so the balance stays fresh after a booking spends a credit.
    - Header: a large pass-balance display — `"{passBalance} {passBalance === 1 ? 'credit' : 'credits'}"` styled prominently (foreground text, accent emphasis), with a smaller `"Pass Balance"` label above it (matches NAME-07 vocabulary "X credits"). Use a low-balance treatment (danger/dangerSoft tokens) when `passBalance <= 0`, mirroring index.tsx's `pillRed`.
    - History section: since the demo `/api/m/profile` does not return a pass-transaction history array, render a "Pass history" section with a graceful empty state ("No pass activity yet" using `muted`/`mutedFaint` tokens). Do NOT invent a new API endpoint (out of scope per R5-CONTEXT — reuse existing /api/m/* only). Structure the component so a future `passHistory` array on the profile response can map into rows without a rewrite (leave a typed `passHistory?: PassEvent[]` optional field + a `.map` that renders nothing when absent).
    - Loading + error states mirroring index.tsx (ActivityIndicator with `theme.colors.accent`; error copy with retry). Error/empty must not crash (D-07 — /api/m/* may 401 on the current deploy).
    - Wrap content in a ScrollView with `backgroundColor: theme.colors.background` and the same padding rhythm as other screens.

    No registration step needed beyond the file existing — Expo Router file-based routing picks up `(tabs)/passes.tsx`; the tab is wired by Task 1's `<Tabs.Screen name="passes">`.
  </action>
  <verify>
    <automated>test -f 'packages/mobile-app/app/(tabs)/passes.tsx' && test "$(grep -cE '#[0-9a-fA-F]{3,8}' 'packages/mobile-app/app/(tabs)/passes.tsx')" = "0" && grep -q "apiFetch" 'packages/mobile-app/app/(tabs)/passes.tsx' && grep -q "credit" 'packages/mobile-app/app/(tabs)/passes.tsx' && echo "passes.tsx present, themed, wired to profile"</automated>
  </verify>
  <done>passes.tsx exists, reads passBalance from /api/m/profile via apiFetch, shows balance as "X credits" + a graceful history empty state, uses theme tokens, zero bare hex.</done>
</task>

<task type="auto">
  <name>Task 3: Migrate hex to theme tokens in food, profile, food-add, food-barcode, pick-member</name>
  <read_first>
    - packages/mobile-app/app/(tabs)/food.tsx (22 hex: #111 bg, #fff text, #999/#666/#444 muted, #1a1a1a row/sheet, #3b82f6 fab, #252525 addOption, #333 handle, rgba(0,0,0,0.5) backdrop)
    - packages/mobile-app/app/(tabs)/profile.tsx (12 hex: #111, #fff, #999, #555, #3b82f6, #333, #1a1a1a, #f88)
    - packages/mobile-app/app/food-add.tsx (25 hex: #111, #1a1a1a, #fff, #999/#666/#777, #252525, #3b82f6, #f88)
    - packages/mobile-app/app/food-barcode.tsx (17 hex: #111, #fff, #999, #3b82f6, #252525, #fbbf24 warn)
    - packages/mobile-app/app/pick-member.tsx (7 hex: #111, #fff, #999, #1a1a1a, #f88)
    - packages/mobile-app/lib/theme.ts (token names to map onto)
  </read_first>
  <files>packages/mobile-app/app/(tabs)/food.tsx, packages/mobile-app/app/(tabs)/profile.tsx, packages/mobile-app/app/food-add.tsx, packages/mobile-app/app/food-barcode.tsx, packages/mobile-app/app/pick-member.tsx</files>
  <action>
    For each of the 5 files, replace every hardcoded hex (and the one `rgba(0,0,0,0.5)` backdrop in food.tsx → `theme.colors.overlay`) with the corresponding `theme.colors.*` token. Because `StyleSheet.create` runs at module load (no theme access), convert each file's styles to the pattern documented at the top of `theme.ts` (R5-01): call `const theme = useTheme()` in the component and build a `useMemo(() => StyleSheet.create({...}), [theme])` styles object (or inline style objects). Do NOT leave a top-level `StyleSheet.create` that references hex.

    Canonical mapping (apply consistently across all 5 files):
    - `#111` / `#111111` (page bg) → `theme.colors.background`
    - `#1a1a1a` (card/row/sheet) → `theme.colors.card`
    - `#252525` (input/addOption/elevated control) → `theme.colors.cardElevated`
    - `#333` (handle/secondary button) → `theme.colors.border` (handle) or `theme.colors.cardElevated` (btnSecondary — pick by role)
    - `#fff` / `#ffffff` (primary text/icons) → `theme.colors.foreground`; on-accent text (`btnText` on the blue button) → `theme.colors.accentForeground`
    - `#999` (secondary text) → `theme.colors.muted`
    - `#666` / `#777` (tertiary text/placeholder) → `theme.colors.mutedFaint`
    - `#555` / `#444` (faint hint/empty) → `theme.colors.mutedFaint`
    - `#3b82f6` (primary button / active meal pill) → `theme.colors.accent`
    - `#f88` (error text) → `theme.colors.danger`
    - `#fbbf24` (OFF no-nutrition warning, food-barcode) → `theme.colors.warning`
    - `rgba(0,0,0,0.5)` (food.tsx modal backdrop) → `theme.colors.overlay`
    - ActivityIndicator `color="#fff"` → `theme.colors.accent` (consistent with the rest of the app's spinner treatment) or `foreground` — pick one and apply uniformly.
    Also set `fontFamily: theme.font.*` on the prominent text styles (headings → bold, section labels/buttons → semibold) so Inter is actually applied; body text → regular. Keep existing fontWeight values harmlessly or drop them in favor of the Inter weight family.

    Preserve all layout, behavior, copy, and the meal-pill / barcode / search logic exactly — this is a pure color/font token swap, no functional change.

    After this task, `grep -rE "#[0-9a-fA-F]{3,8}" packages/mobile-app/app/(tabs)/food.tsx packages/mobile-app/app/(tabs)/profile.tsx packages/mobile-app/app/food-add.tsx packages/mobile-app/app/food-barcode.tsx packages/mobile-app/app/pick-member.tsx` MUST return zero.
  </action>
  <verify>
    <automated>test "$(grep -rcE '#[0-9a-fA-F]{3,8}' 'packages/mobile-app/app/(tabs)/food.tsx' 'packages/mobile-app/app/(tabs)/profile.tsx' packages/mobile-app/app/food-add.tsx packages/mobile-app/app/food-barcode.tsx packages/mobile-app/app/pick-member.tsx | grep -v ':0$' | wc -l)" = "0" && for f in 'packages/mobile-app/app/(tabs)/food.tsx' 'packages/mobile-app/app/(tabs)/profile.tsx' packages/mobile-app/app/food-add.tsx packages/mobile-app/app/food-barcode.tsx packages/mobile-app/app/pick-member.tsx; do grep -q "useTheme" "$f" || { echo "no useTheme in $f"; exit 1; }; done && echo "5 leaf screens hex-clean + themed"</automated>
  </verify>
  <done>All 5 leaf screens reference theme tokens only (incl. the rgba backdrop → overlay token), call useTheme(), apply Inter font families, and contain zero bare hex; no behavior changed.</done>
</task>

</tasks>

<verification>
- `grep -rE "#[0-9a-fA-F]{3,8}"` across this plan's 7 owned app/ files returns zero.
- Tab order + exact titles Home/Classes/Passes/Log/Profile verified by string-index check.
- passes.tsx exists and reads /api/m/profile.
- HUMAN-UAT (deferred to EAS build): tabs render with the right labels/icons, Passes screen shows the balance, screens look dark-on-orange. Not runnable now (D-12).
</verification>

<success_criteria>
- ROADMAP R5 criterion 2 (tabs Home/Classes/Passes/Log/Profile in order) — satisfied.
- ROADMAP R5 criterion 1 (zero bare hex) — satisfied for this plan's 7 app/ files.
</success_criteria>

<output>
After completion, create `.planning/phases/R5-member-mobile-app-redesign/R5-02-SUMMARY.md`
</output>
