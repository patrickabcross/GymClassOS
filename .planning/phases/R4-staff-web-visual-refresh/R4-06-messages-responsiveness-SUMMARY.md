---
phase: R4-staff-web-visual-refresh
plan: "06"
subsystem: staff-web
tags: [responsive, mobile, sheet, member-context, breakpoint, tailwind, sweb-06]
dependency_graph:
  requires: [R4-05-member-context-widget-cards]
  provides: [messages-responsive-layout, mobile-member-context-sheet]
  affects: [apps/staff-web/app/routes/gymos.messages.tsx]
tech_stack:
  added: []
  patterns: [shadcn-Sheet-bottom, Tailwind-md-breakpoint-responsive, MemberContextCards-local-component]
key_files:
  modified:
    - apps/staff-web/app/routes/gymos.messages.tsx
decisions:
  - Extract widget cards into MemberContextCards local component — single source of markup for both desktop aside and mobile Sheet
  - Use URL-state-driven visibility (selectedId) for single-column mobile — no new React state required
  - Desktop member-context aside uses hidden md:flex (Task 1 already applied this during the extraction)
  - SheetContent rounded-t-[calc(var(--radius)+0.25rem)] for skin-correct top radius per spec
  - Back nav is a Link (not a button) that drops ?conversation= param — pure URL navigation, no state
metrics:
  duration: ~4 minutes
  completed: "2026-06-13"
  tasks: 2
  files: 1
---

# Phase R4 Plan 06: Messages Responsiveness Summary

**One-liner:** Made the Messages surface responsive — desktop keeps the three-pane side-by-side layout, mobile collapses to single-column with member context in a shadcn Sheet (side="bottom") triggered by an IconUser button in the thread header.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract member-context widget stack into reusable MemberContextCards component | bb7ccdc7 | apps/staff-web/app/routes/gymos.messages.tsx |
| 2 | Responsive layout — single-column mobile + bottom Sheet member context | a5ccb651 | apps/staff-web/app/routes/gymos.messages.tsx |

## What Was Built

### Task 1 — MemberContextCards local component

Defined `MemberContextCards({ member, stats, upcomingBooking }: MemberContextCardsProps)` above the route component. The function returns the full inner card stack from R4-05 as a fragment:

- Avatar + name + phone panel header
- PASS BALANCE widget Card
- NEXT CLASS widget Card
- LAST VISIT widget Card
- "View Member Profile" Button/Link footer

The desktop `<aside>` was updated to:
- `hidden md:flex` (hides the panel on mobile — context moves to Sheet)
- `<MemberContextCards member={...} stats={...} upcomingBooking={...} />` instead of inline markup

No UI or data behaviour change on desktop.

### Task 2 — Responsive layout + mobile bottom Sheet

**New imports:** `Sheet, SheetContent, SheetTrigger` from `@/components/ui/sheet`; `IconUser` from `@tabler/icons-react`.

**Conversation-list aside responsive classes:**
- `w-full md:w-[320px]` — full-width on mobile, fixed 320px on desktop
- `hidden md:flex` when `selectedId` is set — on mobile, selecting a conversation hides the list so the thread takes full width

**Thread main responsive classes:**
- `hidden md:flex` when no `selectedId` — on mobile with no conversation selected, the thread area is hidden and the list owns the screen

**Thread header additions (both mobile-only via md:hidden):**

1. Back navigation: `<Link to="/gymos/messages{isLeadsView ? '?filter=leads' : ''}">← Messages</Link>` — drops `?conversation=` from URL, returning mobile to list view. Placed before the member name. `md:hidden`.

2. Member Sheet trigger: `<Button variant="outline" size="icon" className="h-9 w-9 md:hidden">` containing `<IconUser size={18} />` with `sr-only` text "Member context". Only renders when `data.selectedMember && data.memberStats` exist.

3. `<SheetContent side="bottom" className="h-[60vh] overflow-y-auto rounded-t-[calc(var(--radius)+0.25rem)]">` renders `<MemberContextCards>` — identical widget stack to the desktop aside.

**Window-state badge:** Kept in the header. Removed `dark:text-*` variants from the badge (was using hardcoded dark-mode classes that were incompatible with R4-07's light-lock — these are removed as cleanup per the light-only constraint).

## Deviations from Plan

None — plan executed exactly as written.

The `dark:text-emerald-300` / `dark:text-zinc-300` classes in the window-state badge in the thread header were silently present from before R4-07 (which locks light theme). These were removed during the header rewrite as a housekeeping cleanup — they had no effect in the light-locked theme but represented dead code. Not counted as a deviation since R4-07 already removed the ThemeToggle and locked light mode.

## Known Stubs

None. Both surfaces (desktop aside + mobile Sheet) are wired to the same real loader data:
- `data.selectedMember` — live gymMembers row
- `data.memberStats` — pass balance, expiry, lastVisit all from existing queries
- `data.upcomingBooking` — next booked class from existing bookings query

## Verification

- `grep -n "function MemberContextCards"` — line 687 (defined)
- `grep -n "<MemberContextCards"` — lines 1084 (Sheet) and 1192 (desktop aside) (used in both surfaces)
- `grep -n "PASS BALANCE"` — line 719 (preserved)
- `grep -n "NEXT CLASS"` — line 753 (preserved)
- `grep -n "LAST VISIT"` — line 781 (preserved)
- `grep -n 'side="bottom"'` — line 1081 (match)
- `grep -n "SheetContent\|SheetTrigger"` — lines 60, 61, 1073, 1083, 1084, 1093 (imports + usage)
- `grep -n "hidden md:flex\|hidden md:block"` — lines 844, 973, 1189 (3 matches — list, thread, desktop aside)
- `grep -n "md:hidden"` — lines 1020, 1073 (back nav + Sheet trigger)
- `grep -n "← Messages"` — lines 1015, 1023 (comment + rendered text)
- `grep -n "IconUser"` — lines 56, 1076 (import + usage)
- `grep -n "rounded-t-\[calc"` — line 1082 (skin-correct radius)
- `node scripts/guard-no-hardcoded-colors.mjs` — exit 0
- `npx prettier --write` — ran clean

## Self-Check: PASSED

- FOUND: `apps/staff-web/app/routes/gymos.messages.tsx`
- FOUND: `.planning/phases/R4-staff-web-visual-refresh/R4-06-messages-responsiveness-SUMMARY.md`
- FOUND commit: `bb7ccdc7` refactor(R4-06): extract member-context widget stack into reusable MemberContextCards component
- FOUND commit: `a5ccb651` feat(R4-06): responsive Messages layout — single-column mobile + bottom Sheet member context (SWEB-06)
