---
phase: R4-staff-web-visual-refresh
plan: 05
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/routes/gymos.messages.tsx
autonomous: true
requirements: [SWEB-03]
must_haves:
  truths:
    - "The member-context right rail shows scannable widget cards, not a raw field list / data table"
    - "It shows a pass-balance card (accent numeral), a next-class card, and a last-visit card"
    - "Each widget card has appropriate empty-state copy when data is absent"
    - "A 'View Member Profile' button links to the member's profile"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.messages.tsx"
      provides: "Member-context panel rebuilt as Pass Balance / Next Class / Last Visit widget cards"
      contains: "PASS BALANCE"
  key_links:
    - from: "apps/staff-web/app/routes/gymos.messages.tsx"
      to: "/gymos/members/:id"
      via: "View Member Profile button Link"
      pattern: "/gymos/members/"
---

<objective>
Rebuild the conversation member-context right rail from a stacked field list into three scannable widget cards (Pass Balance, Next Class, Last Visit) per R4-UI-SPEC §2 — the product's #1 differentiator.

Purpose: SWEB-03 — Member Context panel shows pass-balance pill, next-class card, and last visit as prominent scannable widgets — card hierarchy, NOT a data table.
Output: Updated member-context `<aside>` in `gymos.messages.tsx`. Loader extended to also resolve last-visit (most recent attended/past booking); the rest of the loader and the conversation list/thread are untouched. This plan is sequenced BEFORE R4-06 (responsiveness) because both edit this file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/R4-staff-web-visual-refresh/R4-UI-SPEC.md

<interfaces>
Loader (lines 74-341) builds `memberStats` `{ passBalance, passProduct, passExpiresAt, lifetimeBookings, todayKcal, todayProtein, todayFoodCount }` and `upcomingBooking` `{ className, startsAt }` for the selected conversation's member, plus `selectedMember`.
The member-context panel is the `<aside className="w-[300px] ...">` at lines 938-1052 — currently a stacked field list (Pass balance, Next class, Lifetime bookings, Today's nutrition, Goal).
The loader already queries `bookings` (lines 274-291) joined to occurrences+definitions for the member, ordered by startsAt. Reuse that array to derive the most recent PAST attended/booked visit.
Available shadcn primitives: Card, CardContent, Badge, Button, Avatar, Skeleton. Tabler icons available.
Capacity-state colors for the Next Class badge: amber ≤3 / destructive at 0 per R4-UI-SPEC §Color (only if occurrence capacity is in scope; upcomingBooking does not currently carry capacity — if absent, render the next-class card WITHOUT a capacity badge rather than stubbing one).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Loader — derive last-visit for the selected member</name>
  <files>apps/staff-web/app/routes/gymos.messages.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.messages.tsx (lines 274-326, bookings query + memberStats build)
    - R4-UI-SPEC.md §2 "WIDGET 3: LAST VISIT"
  </read_first>
  <action>
    Inside the `if (selectedRow)` block where `bookings` is already fetched, derive the last visit: the most recent booking whose `startsAt` is in the past AND status is `attended` (fall back to `booked` past occurrences if no `attended` exists). Compute `lastVisit: { className: string | null; startsAt: string } | null` and add it to the returned `memberStats` object (or return it as a sibling field `lastVisit`). Do NOT add a new DB query — reuse the existing `bookings` array. Keep all existing memberStats fields.
  </action>
  <acceptance_criteria>
    - `grep -n "lastVisit" apps/staff-web/app/routes/gymos.messages.tsx` returns matches (derivation + return)
    - No new `db.select` added to the loader for this (reuses existing `bookings`)
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Loader returns lastVisit derived from the existing bookings array; all prior memberStats fields preserved.</done>
</task>

<task type="auto">
  <name>Task 2: Member-context panel as Pass Balance / Next Class / Last Visit widget cards</name>
  <files>apps/staff-web/app/routes/gymos.messages.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.messages.tsx (lines 938-1052, the member-context <aside>)
    - R4-UI-SPEC.md §2 Member Context Panel (widget stack order, anatomy, loading state, empty states, "View Member Profile") + Copywriting Contract
  </read_first>
  <action>
    Replace the contents of the member-context `<aside>` (keep the `<aside className="w-[300px] shrink-0 border-l border-border/50 ...">` wrapper for now — R4-06 will make it responsive) with the three-widget-card stack per R4-UI-SPEC §2.

    Panel header: `<Avatar className="h-8 w-8">` with `<AvatarFallback>` initials + member name `<div className="text-sm font-semibold">` + phone `<div className="text-[11px] text-muted-foreground">`. Provide an sr-only heading "Member Context" (`<h3 className="sr-only">Member Context</h3>`) per Copywriting Contract.

    WIDGET 1 — PASS BALANCE (shadcn Card, `className="p-3 mt-2"`):
    - `<div className="text-[10px] uppercase tracking-wide text-muted-foreground">PASS BALANCE</div>`
    - `<span className="text-xl font-bold text-primary tabular-nums">{passBalance}</span> <span className="text-[12px] text-muted-foreground">credits</span>`
    - If `passBalance <= 0`: render `0` in `text-muted-foreground` (NOT text-primary) + `<div className="text-[11px] text-muted-foreground">No active pass</div>` (copy: "0 credits / No active pass").
    - If passExpiresAt present: `Expires {formatted date}` in `text-[11px] text-muted-foreground`.

    WIDGET 2 — NEXT CLASS (shadcn Card, `className="p-3 mt-2"`):
    - `NEXT CLASS` sub-label.
    - If `upcomingBooking`: class name `text-[13px] font-semibold` + datetime `text-[11px] text-muted-foreground tabular-nums`. (No capacity badge — capacity not in upcomingBooking; do not stub one.)
    - Else: `<div className="text-[12px] text-muted-foreground">No upcoming class</div>`.

    WIDGET 3 — LAST VISIT (shadcn Card, `className="p-3 mt-2"`):
    - `LAST VISIT` sub-label.
    - If `lastVisit`: date `text-[13px] font-semibold` + class name `text-[11px] text-muted-foreground`.
    - Else: `<div className="text-[12px] text-muted-foreground">No visits recorded</div>`.

    Footer: `<Button asChild variant="outline" size="sm" className="w-full mt-3"><Link to={`/gymos/members/${data.selectedMember.id}`}>View Member Profile</Link></Button>`.

    Remove the old "Lifetime bookings", "Today's nutrition", and "Goal" blocks from the panel (clean important-screen per Interaction Constraint #7 — three widget cards and nothing else). The nutrition/goal data stays in the loader (TemplatesDialog memberContext consumes some of it) — only the panel UI is trimmed.
  </action>
  <acceptance_criteria>
    - `grep -n "PASS BALANCE" apps/staff-web/app/routes/gymos.messages.tsx` returns a match
    - `grep -n "NEXT CLASS" apps/staff-web/app/routes/gymos.messages.tsx` returns a match
    - `grep -n "LAST VISIT" apps/staff-web/app/routes/gymos.messages.tsx` returns a match
    - `grep -n "text-xl font-bold text-primary" apps/staff-web/app/routes/gymos.messages.tsx` returns a match (accent numeral)
    - `grep -n "View Member Profile" apps/staff-web/app/routes/gymos.messages.tsx` returns a match
    - `grep -n "/gymos/members/" apps/staff-web/app/routes/gymos.messages.tsx` shows the profile link
    - `grep -n "Today's nutrition\|Lifetime bookings" apps/staff-web/app/routes/gymos.messages.tsx` returns NO match inside the aside (panel trimmed) — note: TemplatesDialog memberContext fields in the loader may still reference these, that is fine
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Member-context panel renders exactly three widget cards (Pass Balance accent numeral, Next Class, Last Visit) with empty states + a View Member Profile button; no field-list/table dump; guard exits 0.</done>
</task>

</tasks>

<verification>
- `node scripts/guard-no-hardcoded-colors.mjs` exits 0.
- `npx prettier --write apps/staff-web/app/routes/gymos.messages.tsx` runs clean.
- Static grep confirms three widget cards + accent numeral + profile link, no nutrition/goal/lifetime field list in the panel.
- Visual correctness is deploy/UAT.
</verification>

<success_criteria>
SWEB-03: the conversation member-context panel is three scannable widget cards (Pass Balance / Next Class / Last Visit) with a View Member Profile CTA — a card hierarchy, not a data table.
</success_criteria>

<output>
After completion, create `.planning/phases/R4-staff-web-visual-refresh/R4-05-member-context-widget-cards-SUMMARY.md`
Run `npx prettier --write` on the modified file.
</output>
