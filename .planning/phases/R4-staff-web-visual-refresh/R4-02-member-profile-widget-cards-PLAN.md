---
phase: R4-staff-web-visual-refresh
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/routes/gymos.members_.$id.tsx
autonomous: true
requirements: [SWEB-04]
must_haves:
  truths:
    - "Member Profile shows a pass-balance pill with the credit count in the studio accent"
    - "Member Profile shows a next-class widget card"
    - "Member Profile shows bookings as a chronological timeline of cards with status badges, not a raw table"
    - "The bookings timeline shows recent bookings with a 'Show all' reveal for the rest (progressive disclosure)"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.members_.$id.tsx"
      provides: "Pass-balance pill + next-class card + bookings timeline with status badges"
      contains: "Collapsible"
  key_links:
    - from: "apps/staff-web/app/routes/gymos.members_.$id.tsx"
      to: "pass balance numeral"
      via: "text-primary studio-accent class on the credit count"
      pattern: "text-primary|text-xl font-bold"
---

<objective>
Refresh the Member Profile to the R4-UI-SPEC §3 contract: profile header, a row of pass-balance + next-class widget cards, and a bookings timeline (cards with status badges), with progressive disclosure on the timeline.

Purpose: SWEB-04 — Member Profile shows pass-balance pill, next-class card, and a bookings timeline.
Output: Updated `gymos.members_.$id.tsx`. Loader already returns member, passes, passBalance, bookings, conversation — no loader/schema changes needed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/R4-staff-web-visual-refresh/R4-UI-SPEC.md

<interfaces>
Loader returns `{ member, passes, passBalance, bookings, foodEntries, conversation }`.
`bookings` are ordered newest-first (desc startsAt) with `{ id, status, bookedAt, startsAt, endsAt, className }`. Status values: booked, attended, no_show, cancelled.
`passes` each have `{ id, productName, source, granted, expiresAt }`. `passBalance` is a number.
Existing component already computes `upcoming` / `past` arrays and has a `statusVariant()` helper.
Available shadcn primitives in apps/staff-web/app/components/ui/: Card, CardContent, CardHeader, CardTitle, Badge, Button, Collapsible, Avatar, Separator. Tabler icons via @tabler/icons-react.
Page already renders "Member Profile" eyebrow + name (keep — satisfies NAME-07/R3).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pass-balance pill + next-class widget cards row</name>
  <files>apps/staff-web/app/routes/gymos.members_.$id.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.members_.$id.tsx (lines 154-253, header + pass-balance Card)
    - R4-UI-SPEC.md §3 Member Profile ("ROW OF WIDGET CARDS" + "Pass balance pill on profile") and §Typography (Display role)
  </read_first>
  <action>
    Replace the current full-width "Pass balance" Card (lines ~205-253) with a side-by-side row of two widget cards matching R4-UI-SPEC §3 and the §2 widget anatomy:

    Container: `<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">`.

    Card A — PASS BALANCE (shadcn Card, `className="p-4"`):
    - Sub-label: `<div className="text-[10px] uppercase tracking-wide text-muted-foreground">PASS BALANCE</div>`
    - Numeral row: the balance number in `<span className="text-xl font-bold text-primary tabular-nums">{passBalance}</span>` followed by `<span className="text-[12px] text-muted-foreground"> credits</span>`. (Display role per §Typography — the one place font-bold/text-primary is used.)
    - If `passBalance <= 0`: render `0` in `text-muted-foreground` (NOT text-primary) and add a `<div className="text-[11px] text-muted-foreground">No active pass</div>`.
    - If there is an active pass (first pass with null or future expiresAt) show `Expires {fmtDate(expiry)}` in `text-[11px] text-muted-foreground`.
    - Keep the existing per-pass breakdown list, but move it under a `<Collapsible>` "Show passes" trigger so the card stays clean (progressive disclosure) — OR drop it to keep the pill minimal; prefer Collapsible to preserve the grant-ledger detail.

    Card B — NEXT CLASS (shadcn Card, `className="p-4"`):
    - Sub-label: `NEXT CLASS` (same `text-[10px] uppercase tracking-wide text-muted-foreground`).
    - If `upcoming[0]` exists: class name `<div className="text-[13px] font-semibold">`, then datetime `<div className="text-[11px] text-muted-foreground tabular-nums">{fmtDateTime(upcoming[0].startsAt)}</div>`.
    - Else: `<div className="text-[12px] text-muted-foreground">No upcoming class</div>` (copy exactly per Copywriting Contract).

    Keep the profile header (avatar optional — add an `Avatar` h-12 w-12 with initials fallback per §3 if low-cost, else leave the existing text header) and the "Open WhatsApp conversation" Button untouched.
  </action>
  <acceptance_criteria>
    - `grep -n "PASS BALANCE" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns a match
    - `grep -n "NEXT CLASS" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns a match
    - `grep -n "text-xl font-bold text-primary" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns a match (accent numeral)
    - `grep -n "No upcoming class" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns a match
    - `grep -n "sm:grid-cols-2" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns a match (side-by-side cards)
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Profile shows a two-card row: pass-balance pill with accent numeral + expiry/no-pass states, and a next-class card with the upcoming class or "No upcoming class".</done>
</task>

<task type="auto">
  <name>Task 2: Bookings timeline (cards with status badges + Show-all reveal)</name>
  <files>apps/staff-web/app/routes/gymos.members_.$id.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.members_.$id.tsx (lines 255-338, current Bookings Card with Upcoming/Past split)
    - R4-UI-SPEC.md §3 "Bookings timeline (NOT a data table)" + Copywriting Contract ("No bookings yet")
  </read_first>
  <action>
    Replace the current Bookings Card's Upcoming/Past two-section layout with a single chronological timeline per R4-UI-SPEC §3 "Bookings timeline".

    Section heading: `<div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">BOOKINGS</div>`.

    Render `bookings` (already desc by startsAt) as a `<ul className="flex flex-col gap-1.5">` of shadcn Cards, each `className="flex items-center gap-3 p-2 border-border/40"`:
    - Left: datetime `<span className="text-[12px] text-muted-foreground tabular-nums w-36 shrink-0">{fmtDateTime(b.startsAt)}</span>`
    - Center: class name `<span className="text-[13px] font-semibold flex-1 truncate">{b.className ?? "Class"}</span>`
    - Right: a status Badge per the §3 variant map:
      - `booked` → `<Badge variant="secondary">Booked</Badge>`
      - `attended` → `<Badge variant="outline">Attended</Badge>`
      - `no_show` → `<Badge className="bg-destructive/10 text-destructive border-0">No-show</Badge>` with a line marker comment `{/* guard:allow-color — no_show semantic state, not a brand color */}` above it (destructive token is not hex, but keep the marker per UI-SPEC cheat sheet)
      - `cancelled` → `<Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>`

    Progressive disclosure: render the first 5 bookings directly; wrap the remainder in a shadcn `<Collapsible>` with a trigger button "Show all ({n} total)" / "Show less". (R4-UI-SPEC says up to 20 with a Show-all reveal; 5 visible is acceptable per Interaction Constraint #4 "show first 5".)

    Empty state: when `bookings.length === 0`, render `<p className="text-[13px] text-muted-foreground text-center py-6">No bookings yet</p>`.

    Keep the "Recent food entries" Card below as-is (out of SWEB-04 scope; leave untouched).
  </action>
  <acceptance_criteria>
    - `grep -n "No bookings yet" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns a match
    - `grep -n "No-show" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns a match
    - `grep -n "Collapsible" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns a match (Show-all reveal)
    - `grep -n "bg-destructive/10 text-destructive" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns a match (no_show badge)
    - `grep -n "guard:allow-color" apps/staff-web/app/routes/gymos.members_.$id.tsx` returns a match near the no_show badge
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Bookings render as a chronological card timeline with per-status badges; first 5 shown, rest behind a Collapsible; empty state reads "No bookings yet"; guard exits 0.</done>
</task>

</tasks>

<verification>
- `node scripts/guard-no-hardcoded-colors.mjs` exits 0.
- `npx prettier --write apps/staff-web/app/routes/gymos.members_.$id.tsx` runs clean.
- Static grep confirms widget cards + timeline + Collapsible present, no data-table layout.
- Visual correctness is deploy/UAT.
</verification>

<success_criteria>
SWEB-04: Member Profile shows a pass-balance pill (accent numeral), a next-class card, and a chronological bookings timeline of status-badged cards with a Show-all reveal — no raw data table.
</success_criteria>

<output>
After completion, create `.planning/phases/R4-staff-web-visual-refresh/R4-02-member-profile-widget-cards-SUMMARY.md`
Run `npx prettier --write` on the modified file.
</output>
