---
phase: quick
plan: 260531-kbm
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/routes/gymos.analytics.tsx
  - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md
autonomous: true
requirements: [INBX-01]
must_haves:
  truths:
    - "KPI primary values (Fill Rate, MRR, etc.) render large (text-3xl/4xl) so they read as the hero of each card, not the same size as body text"
    - "Fill Rate and Cancellation Rate show a 7d→30d delta with a Tabler trend icon + semantic color (direction-aware: up=good for fill, up=bad for cancellation)"
    - "The dashboard still renders graceful empty states ('No data yet' / '–') when a window has no data"
    - "Each card keeps role='region' + aria-label; dark mode stays correct (semantic tokens only)"
    - "The loader, all SQL, and the data shape are byte-for-byte unchanged"
    - "P1b.1-UI-SPEC.md Typography table documents the new Display / metric size(s) so spec and code stay in sync"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.analytics.tsx"
      provides: "Redesigned presentation layer with display-size KPI heroes + trend deltas"
      contains: "text-3xl"
    - path: ".planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md"
      provides: "Updated Typography section adding the Display / metric role"
      contains: "Display / metric"
  key_links:
    - from: "gymos.analytics.tsx MetricCard"
      to: "@tabler/icons-react IconTrendingUp/IconTrendingDown/IconMinus"
      via: "import + conditional render of trend indicator"
      pattern: "IconTrending"
    - from: "gymos.analytics.tsx default-variant cards"
      to: "data.fillRate7d.pct / data.fillRate30d.pct"
      via: "delta computed in render from existing loader fields (no new query)"
      pattern: "30d.*7d|7d.*30d"
---

<objective>
Redesign the `/gymos/analytics` dashboard so it reads like a strong, scannable operational dashboard instead of a flat wall of 14px text. Root cause: the P1b.1-UI-SPEC locked the app to a 4-size type scale (10/12/13/14px) and a UI-checker pass downgraded the metric values from `text-2xl` to `text-sm` (14px), so headline KPIs (MRR, Fill Rate) render at the same size as captions — killing all visual hierarchy.

Purpose: Give coaches/managers a dashboard where the number that matters (MRR, Fill Rate, Net Growth) is the visual hero of each card, with trend/delta emphasis on the metrics that have a 7d→30d comparison.

Output: A redesigned `gymos.analytics.tsx` (presentation only — loader/SQL untouched) plus a Typography-section update to `P1b.1-UI-SPEC.md` so the spec authorizes the new display sizes.

Scope is ANALYTICS ONLY. This is a presentation-layer redesign. No data, query, action, or other-route changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md
@apps/staff-web/app/routes/gymos.analytics.tsx
@apps/staff-web/app/components/ui/card.tsx
@apps/staff-web/AGENTS.md

<scope_lock>
HARD CONSTRAINTS — the executor MUST NOT violate these:

- The ONLY code file you may edit is `apps/staff-web/app/routes/gymos.analytics.tsx`.
- The ONLY doc file you may edit is `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md`.
- Do NOT touch any other `/gymos/*` route, `GymosTopNav.tsx`, `card.tsx`, `global.css`, any action, or any other component. If you feel tempted to "also fix" a sibling screen — STOP. Out of scope.
- Do NOT change the `loader`, the SQL helpers (`fillRate`, `cancellationRate`, `passUtilisation`, `mrr`, `dropInRevenue30d`, `netGrowth30d`), the `PRICES` constants, or the returned data shape. Everything below the `return {...}` in the loader is the only part you redesign. The loader is a frozen contract.
- Do NOT install any shadcn component or npm package. Everything you need is already present.
</scope_lock>

<available_primitives>
Confirmed installed / available — use ONLY these:

- `Card`, `CardHeader`, `CardContent` from `@/components/ui/card` (already imported)
- `Badge` from `@/components/ui/badge` (already imported)
- `@tabler/icons-react@^3.40.0` — a project dep. Use `IconTrendingUp`, `IconTrendingDown`, `IconMinus`. (Tabler v3 exports these; size via the `size` prop, e.g. `size={14}`.)
- Tailwind v4 + semantic tokens from `global.css` (`text-muted-foreground`, `text-foreground`, `bg-card`, `border-border`, `text-emerald-600 dark:text-emerald-400`, etc.)

Do NOT use: nested Cards, custom popovers/dropdowns, raw hex, `text-2xl` (skip straight to the new display sizes), emojis, Lucide/inline SVG, weight 500/700.
</available_primitives>

<typography_decision>
New display sizes to introduce (relaxes the locked 4-size scale, ANALYTICS ONLY):

| Role | Class | Use |
|------|-------|-----|
| Display / metric — primary | `text-3xl font-semibold` (~30px, weight 600) | KPI hero value in every card |
| Display / metric — hero | `text-4xl font-semibold` (~36px, weight 600) | OPTIONAL: the single most important card only (recommend Monthly Recurring Revenue) |

Keep the existing roles for everything else: labels stay `text-[12px] uppercase tracking-wide text-muted-foreground`; context/secondary stays `text-[12px] text-muted-foreground`; section headings stay `text-sm font-semibold`. Weight stays 600 max (do not introduce 700/bold) to honor the existing weight rule.
</typography_decision>

<trend_indicator_rules>
Only the two metrics that already carry both a 7d and 30d value get a trend indicator: **Fill Rate** and **Cancellation Rate**.

- Compute delta in the render layer from existing loader fields: `delta = pct7d - pct30d` (both already on `data.fillRate7d.pct` / `data.fillRate30d.pct` etc.). Treat the 7d value as "now" and 30d as the baseline.
- If EITHER pct is `null` (empty window), render NO trend indicator (show the empty state instead).
- Direction is metric-specific:
  - **Fill Rate**: higher is good. delta > 0 → `IconTrendingUp` + `text-emerald-600 dark:text-emerald-400`. delta < 0 → `IconTrendingDown` + `text-muted-foreground`. delta === 0 → `IconMinus` + `text-muted-foreground`.
  - **Cancellation Rate**: higher is BAD. delta > 0 (more cancellations) → `IconTrendingUp` + `text-muted-foreground` (bad, but muted — NOT destructive red). delta < 0 (fewer cancellations) → `IconTrendingDown` + `text-emerald-600 dark:text-emerald-400` (good). delta === 0 → `IconMinus` + `text-muted-foreground`.
- NEVER use `text-destructive` / red for a bad trend — UI-SPEC reserves destructive for failed actions, not "we lost members" or "cancellations rose." Bad/neutral trends are muted; only genuinely-good trends get emerald.
- Trend label text: small (`text-[11px]` or `text-[12px]`), e.g. `+5pts vs 30d` / `-3pts vs 30d` / `flat vs 30d`. Icon `size={14}` with `aria-hidden`. Keep the existing 7d primary / 30d secondary numbers visible too — the trend is an addition, not a replacement.
</trend_indicator_rules>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Redesign MetricCard + the two trend metrics for strong hierarchy</name>
  <files>apps/staff-web/app/routes/gymos.analytics.tsx</files>
  <action>
Rework ONLY the presentation layer of `gymos.analytics.tsx` (everything from the `MetricCard` component down to the end of the file; the loader and all helpers above the `return {...}` are frozen — do not edit them).

1. Add the Tabler import: `import { IconTrendingUp, IconTrendingDown, IconMinus } from "@tabler/icons-react";` (place near the existing `react-router` / drizzle imports at the top).

2. Promote the KPI value to a display size. Replace the current `primaryClass` logic so the primary value renders at `text-3xl font-semibold` (use `text-muted-foreground` when `primaryTone === "muted"`, otherwise `text-foreground`). Keep the label above it as `text-[12px] uppercase tracking-wide text-muted-foreground` and the context below it as `text-[12px] text-muted-foreground`. Net layout per card: small muted LABEL (top) → large DISPLAY value (hero) → muted CONTEXT (bottom). This applies to BOTH the `default` (7d/30d) and `snapshot` variants.

3. For the `default` variant (Fill Rate, Cancellation Rate), redesign the two-value presentation:
   - Make the 7d value the hero (`text-3xl`), keep its "7d" badge.
   - Keep the 30d value as a smaller secondary line (`text-sm font-semibold` is fine) with its "30d" badge and context — this is the baseline.
   - Add a trend indicator row that follows the rules in `<trend_indicator_rules>`. Because direction differs per metric (higher Fill Rate good, higher Cancellation Rate bad), add a prop to `MetricCard` like `trendGoodWhen?: "up" | "down"` (only meaningful for the `default` variant) so the same component renders the correct icon+color. Compute `delta` from `props.primaryPct - props.secondaryPct` — to do this cleanly, extend the `default`-variant prop shape to also receive the raw numbers (`primaryPct: number | null`, `secondaryPct: number | null`) alongside the already-formatted strings. Do NOT recompute anything from the DB — these numbers come straight off the loader data already passed in at the call sites.
   - If either pct is null, render no trend indicator.

4. Keep ALL accessibility intact: `role="region"`, `aria-label={label}` on each Card. Trend icons get `aria-hidden`; the human-readable trend text (e.g. "+5pts vs 30d") carries the meaning for screen readers.

5. Keep semantic tokens only (no raw hex). Verify dark-mode safety by using `text-emerald-600 dark:text-emerald-400` for good trends and `text-muted-foreground` for neutral/bad.

6. Improve grouping/spacing at the page + grid level (presentation only): keep the two sections (Activity / Business) but give the cards more breathing room (e.g. bump card padding/gap, ensure the hero number has clear vertical separation from label and context). Do not add new sections, new metrics, or new controls. Keep the existing `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` responsive grid (it is fine); you may optionally promote the single most important Business card (Monthly Recurring Revenue) to `text-4xl` hero size per `<typography_decision>` — at your discretion, but if you do, only MRR gets it.

7. Update the call sites (the `<MetricCard ... />` instances in the `Activity` and `Business` sections) to pass the new props (`trendGoodWhen`, `primaryPct`, `secondaryPct`) for the Fill Rate (good when up) and Cancellation Rate (good when down) cards. The snapshot cards (Pass Utilisation, MRR, Drop-in, Net Growth, ARPM) are unchanged except for inheriting the new display-size hero value.

8. Update the file's top header comment block: the existing block documents the OLD deviation ("Rule 1: shadcn CardTitle defaults to a font size disallowed by UI-SPEC ... metric labels need text-[12px] ... primary value is 14px"). Replace/extend the relevant lines so the comment reflects the redesign rationale: KPI values now render at a new Display / metric size (text-3xl, optionally text-4xl for MRR) per the relaxed UI-SPEC Typography section, with direction-aware trend indicators on the 7d→30d metrics. Do not leave the comment claiming "primary value is 14px semibold."

Run `npx prettier --write apps/staff-web/app/routes/gymos.analytics.tsx` after editing.
  </action>
  <verify>
    <automated>cd C:/Users/dimet/hustle && npx tsc --noEmit -p apps/staff-web/tsconfig.json 2>&1 | Select-String "gymos.analytics" ; if ($LASTEXITCODE -ne 0) { Write-Host "tsc had errors — confirm none reference gymos.analytics.tsx" }</automated>
  </verify>
  <done>
- `gymos.analytics.tsx` type-checks with no errors originating from this file.
- KPI primary values render at `text-3xl` (grep confirms `text-3xl` present).
- `IconTrendingUp`/`IconTrendingDown`/`IconMinus` imported and conditionally rendered on Fill Rate + Cancellation Rate cards.
- No new red/destructive color used for bad trends; emerald reserved for genuinely-good direction.
- Loader, SQL helpers, PRICES, and return shape are byte-for-byte unchanged from the original.
- `role="region"` + `aria-label` preserved on every card; empty states ("No data yet" / "–") preserved.
- Header comment block updated to describe the redesign (no stale "14px semibold" claim).
  </done>
</task>

<task type="auto">
  <name>Task 2: Update P1b.1-UI-SPEC Typography section to authorize the display sizes</name>
  <files>.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md</files>
  <action>
Update the `## Typography` section (around lines 57-71) so the spec and code stay in sync now that analytics uses larger KPI values.

1. Add a new row (or rows) to the Typography table for the display size(s):
   - `Display / metric` | `30px (text-3xl)` | `600 (semibold)` | `1.1` | `Analytics KPI hero values (Fill Rate, MRR, etc.) on /gymos/analytics only`
   - Optionally: `Display / hero` | `36px (text-4xl)` | `600 (semibold)` | `1.05` | `Single most-important analytics KPI (MRR) — /gymos/analytics only`
2. Update the intro line under `## Typography` — it currently says "Do not introduce new sizes — use only these four." Change it to note that the four core sizes govern all conversational/list/form chrome, and that the Analytics dashboard adds a Display / metric size for KPI hero values to establish operational hierarchy (scoped to `/gymos/analytics`).
3. Remove or amend the stale phrase in the "Heading / section" row usage column that lists "analytics metric primary values" — those now use the Display / metric role, not the 14px Heading / section role.
4. Add a short note under the table (or in the "Checker revision notes" table) recording that the 2026-05-25 checker downgrade of analytics KPIs from `text-2xl` to `text-sm` was deliberately reversed on 2026-05-31 for hierarchy reasons, and the new Display / metric size is the authorized successor (so a future checker pass doesn't re-flag `text-3xl` as an "undeclared 5th size").

Keep the change scoped to documenting analytics display sizes — do not rewrite unrelated sections of the spec.
  </action>
  <verify>
    <automated>cd C:/Users/dimet/hustle && (Select-String -Path ".planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md" -Pattern "Display / metric","text-3xl") | Measure-Object | ForEach-Object { if ($_.Count -ge 2) { "OK" } else { "MISSING display-size rows" } }</automated>
  </verify>
  <done>
- The UI-SPEC Typography table contains a `Display / metric` row referencing `text-3xl`.
- The "use only these four" instruction is amended to acknowledge the analytics display size.
- A note records the reversal of the 2026-05-25 `text-2xl`→`text-sm` downgrade so future checker passes don't re-flag `text-3xl`.
- No unrelated UI-SPEC sections rewritten.
  </done>
</task>

</tasks>

<verification>
- `apps/staff-web/app/routes/gymos.analytics.tsx` type-checks; no errors originate from the file.
- Grep confirms `text-3xl`, `IconTrendingUp`, and `aria-label` present in the route file.
- Diff of the loader region (lines ~74-332 in the original) shows zero changes — only the presentation layer (MetricCard + component + header comment) and the imports changed.
- UI-SPEC Typography section documents the new Display / metric size.
- No file other than `gymos.analytics.tsx` and `P1b.1-UI-SPEC.md` was modified (`git status` shows exactly those two tracked-file changes plus this plan dir).
</verification>

<success_criteria>
- KPI numbers (Fill Rate, MRR, Net Growth, etc.) are the visual hero of each card — clearly larger than labels/context.
- Fill Rate and Cancellation Rate show a direction-aware trend (emerald for good, muted for neutral/bad, never destructive red) using Tabler trend icons, only when both 7d and 30d values exist.
- Empty states, accessibility (role/aria-label), dark mode, and the entire loader/data layer are unchanged.
- The P1b.1-UI-SPEC Typography section authorizes the new display sizes so spec and code stay in sync.
</success_criteria>

<output>
After completion, create `.planning/quick/260531-kbm-redesign-gymos-analytics-dashboard-for-s/260531-kbm-SUMMARY.md` recording: what changed, the new display sizes used (text-3xl, and whether text-4xl was applied to MRR), the trend-indicator directionality logic, and confirmation the loader was untouched.
</output>
