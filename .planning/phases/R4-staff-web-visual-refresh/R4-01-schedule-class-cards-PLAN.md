---
phase: R4-staff-web-visual-refresh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/routes/gymos.schedule.tsx
autonomous: true
requirements: [SWEB-01, SWEB-02]
must_haves:
  truths:
    - "Each class card shows class name, time, and 'X / Y booked'"
    - "Capacity display is amber when 1-3 spots remain, red when 0 spots (full)"
    - "Capacity display is muted/normal when 4+ spots remain"
    - "Today's calendar cell carries the studio accent (not a generic black border)"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.schedule.tsx"
      provides: "Class cards with 3-state capacity color and accent today-cell"
      contains: "bg-amber-100 text-amber-700"
  key_links:
    - from: "apps/staff-web/app/routes/gymos.schedule.tsx"
      to: "capacity color states"
      via: "spotsLeft-driven className on the booked/capacity span"
      pattern: "text-destructive|bg-amber-100"
---

<objective>
Apply the R4-UI-SPEC §1 (Schedule) class-card and capacity-state contract to the staff schedule day-detail pane.

Purpose: SWEB-01 (class cards: name, time, X/Y booked) and SWEB-02 (capacity turns amber ≤3 spots, red at 0) — the single most-watched UAT detail on the schedule.
Output: Updated `gymos.schedule.tsx` with a 3-state capacity indicator, "Full" treatment, and an accent-styled today cell. No loader/schema/action changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/R4-staff-web-visual-refresh/R4-UI-SPEC.md
@.planning/phases/R4-staff-web-visual-refresh/R4-CONTEXT.md

<interfaces>
The loader already returns per-occurrence data and a `bookingCounts: Record<string, number>` map.
Current capacity render (lines ~491-500) is a single inline span that only turns amber-600 when full:
```tsx
<span className={cn("text-[11px] tabular-nums", full ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
  {booked} / {o.capacity}
</span>
```
The loader has NO instructor column (only className, category, room, durationMin, capacity, status). Per R4-UI-SPEC §1 "Instructor field": OMIT instructor entirely — do NOT add a placeholder. SWEB-01 ships name + time + X/Y booked for v1.1.
The today-cell currently uses `today && "border-foreground/40"` (line ~394).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Three-state capacity indicator + Full treatment on class cards</name>
  <files>apps/staff-web/app/routes/gymos.schedule.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.schedule.tsx (lines 468-548, the day-detail card map)
    - R4-UI-SPEC.md §Color "Semantic capacity color states" table + §1 Schedule "Capacity badge"
  </read_first>
  <action>
    In the `selectedOccurrences.map((o) => ...)` block, replace the single capacity `<span>` (currently `full ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"`) with a 3-state indicator driven by spots remaining.

    Compute inside the map callback, after `const full = booked >= o.capacity;`:
    ```tsx
    const spotsLeft = o.capacity - booked;
    const capacityClass = cn(
      "rounded px-1.5 py-0.5 text-[11px] tabular-nums",
      full
        ? "bg-destructive/10 text-destructive"
        : spotsLeft <= 3
          // guard:allow-color — capacity-warning amber semantic, not a brand color
          ? "bg-amber-100 text-amber-700"
          : "text-muted-foreground",
    );
    ```
    Render the capacity span using `capacityClass`. Text format: `{booked} / {o.capacity}` always; when `full`, append ` · Full` inside the same span. Per R4-UI-SPEC §Color the color applies to the inline count text only — do NOT tint the Card border or background; the Card stays `bg-background/60` regardless of capacity.

    Keep the existing time span, class-name `<div className="text-[13px] font-semibold">`, category Badge, room, and duration exactly as they are (these already satisfy SWEB-01 name + time). Do NOT add an instructor field — the loader has no instructor column (R4-UI-SPEC §1 says omit, do not stub "Instructor: TBD").

    The Book/Full button (lines ~530-541) already disables on `full` and shows "Full" — keep it. Also update the booking-dialog DialogDescription capacity span (lines ~575-582) to use the same destructive-at-full / amber-≤3 logic for consistency (replace `occFull && "text-amber-600 dark:text-amber-400"` with a className that goes `text-destructive` when `occFull`, `text-amber-700` when `occ.capacity - occBookedCount <= 3`, else default).
  </action>
  <acceptance_criteria>
    - `grep -n "bg-amber-100 text-amber-700" apps/staff-web/app/routes/gymos.schedule.tsx` returns a match with the `// guard:allow-color` marker on or above the line
    - `grep -n "bg-destructive/10 text-destructive" apps/staff-web/app/routes/gymos.schedule.tsx` returns a match
    - `grep -n "spotsLeft" apps/staff-web/app/routes/gymos.schedule.tsx` returns at least one match
    - `grep -n "· Full\|Full" apps/staff-web/app/routes/gymos.schedule.tsx` shows the Full label still present
    - `grep -n "Instructor" apps/staff-web/app/routes/gymos.schedule.tsx` returns NO match (instructor intentionally omitted)
    - No new hex literal introduced: `node scripts/guard-no-hardcoded-colors.mjs` exits 0
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Class cards show name/time/X-of-Y-booked; capacity text is amber at 1-3 spots, destructive at 0, muted at 4+; "Full" disables Book; color guard exits 0.</done>
</task>

<task type="auto">
  <name>Task 2: Accent today-cell in the month grid</name>
  <files>apps/staff-web/app/routes/gymos.schedule.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.schedule.tsx (lines 375-430, day-cell button)
    - R4-UI-SPEC.md §1 Schedule "Month grid day cells"
  </read_first>
  <action>
    Per R4-UI-SPEC §1 "Month grid day cells", replace the today highlight `today && "border-foreground/40"` (line ~394) with a studio-accent glow using the `--studio-accent` token via Tailwind arbitrary-property syntax that resolves to the CSS var (NOT a hex):
    ```tsx
    today && "border-[color:var(--studio-accent)]/30 bg-[color:var(--studio-accent)]/10",
    ```
    Leave the `isSelected` branch (`border-foreground bg-accent ring-1 ring-foreground/20`) unchanged so selection still reads clearly over the today glow. Keep the today date numeral styling (`font-semibold text-foreground`) as is.
  </action>
  <acceptance_criteria>
    - `grep -n "var(--studio-accent)" apps/staff-web/app/routes/gymos.schedule.tsx` returns a match in the today-cell className
    - `grep -n "border-foreground/40" apps/staff-web/app/routes/gymos.schedule.tsx` returns NO match (old generic border removed)
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0 (var() usage is not a hex literal)
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Today's cell carries the studio accent border+wash via the --studio-accent token; no hardcoded hex; guard exits 0.</done>
</task>

</tasks>

<verification>
- `node scripts/guard-no-hardcoded-colors.mjs` exits 0 (no new hex).
- `npx prettier --write apps/staff-web/app/routes/gymos.schedule.tsx` runs clean.
- Static grep confirms 3-state capacity classes present and instructor absent.
- Visual correctness (amber at 8/10, red at full) is deploy/UAT — reuse scripts/ui-baseline/ for after-state captures.
</verification>

<success_criteria>
SWEB-01 + SWEB-02: schedule class cards show name/time/X-of-Y booked with a token-driven capacity indicator that is muted (4+), amber (1-3), destructive (0/full); today cell uses studio accent; color guard stays green.
</success_criteria>

<output>
After completion, create `.planning/phases/R4-staff-web-visual-refresh/R4-01-schedule-class-cards-SUMMARY.md`
Run `npx prettier --write` on the modified file.
</output>
