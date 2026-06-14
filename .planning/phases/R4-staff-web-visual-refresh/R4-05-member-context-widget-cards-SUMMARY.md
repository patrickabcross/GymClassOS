---
phase: R4-staff-web-visual-refresh
plan: "05"
subsystem: staff-web
tags: [member-context, widget-cards, pass-balance, next-class, last-visit, ui, shadcn]
dependency_graph:
  requires: [R4-03-members-directory-card-view]
  provides: [member-context-widget-cards]
  affects: [apps/staff-web/app/routes/gymos.messages.tsx]
tech_stack:
  added: []
  patterns: [shadcn-Card-widget, Avatar-initials-fallback, loader-derived-lastVisit]
key_files:
  modified:
    - apps/staff-web/app/routes/gymos.messages.tsx
decisions:
  - Derive lastVisit from existing bookings array (no new DB query) — most recent past booking with attended status, fallback to booked
  - Retain sidebar aside wrapper unchanged for R4-06 to extract into a responsive component
  - No capacity badge on NEXT CLASS widget (upcomingBooking does not carry capacity — omit rather than stub)
  - Nutrition/Goal data kept in loader for TemplatesDialog memberContext prop; only removed from panel UI
metrics:
  duration: ~10 minutes
  completed: "2026-06-13"
  tasks: 2
  files: 1
---

# Phase R4 Plan 05: Member Context Widget Cards Summary

**One-liner:** Rebuilt the conversations member-context right rail from a stacked field list into three scannable shadcn Card widgets — Pass Balance (accent numeral), Next Class, and Last Visit — with initials Avatar header and View Member Profile CTA.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Loader — derive lastVisit for selected member | 17b8fa58 | apps/staff-web/app/routes/gymos.messages.tsx |
| 2 | Member-context panel as Pass Balance / Next Class / Last Visit widget cards | 3eff8f57 | apps/staff-web/app/routes/gymos.messages.tsx |

## What Was Built

### Task 1 — lastVisit derivation

Inside the `if (selectedRow)` block, after the existing `bookings` query, derived `lastVisit` by:
1. Filtering the existing `bookings` array to past bookings with `attended` or `booked` status
2. Preferring `attended` records; falling back to `booked` if none exist
3. Taking `.at(-1)` (most recent — array is ordered ASC by startsAt)
4. Returning `{ className: string | null; startsAt: string } | null` added to `memberStats`

No new DB query added. The existing `bookings` left-join (occurrences + definitions) already provides all required fields.

### Task 2 — Widget card panel

Replaced the `<aside>` content (lines 938–1052 in the original) with:

**Panel header:** 32px Avatar with initials AvatarFallback + member name (text-sm font-semibold) + phone (text-[11px] text-muted-foreground). Sr-only `<h3>Member Context</h3>` per Copywriting Contract.

**WIDGET 1 — PASS BALANCE (shadcn Card, p-3 mt-2):**
- Sub-label: `PASS BALANCE` — text-[10px] uppercase tracking-wide text-muted-foreground
- Numeral: `text-xl font-bold text-primary tabular-nums` when > 0; `text-muted-foreground` when 0
- Inline "credits" label: text-[12px] text-muted-foreground
- Zero empty state: "No active pass" in text-[11px] text-muted-foreground
- Expiry: "Expires {formatted date}" in text-[11px] text-muted-foreground (when passExpiresAt present)

**WIDGET 2 — NEXT CLASS (shadcn Card, p-3 mt-2):**
- Sub-label: `NEXT CLASS`
- When `upcomingBooking`: class name text-[13px] font-semibold + datetime text-[11px] text-muted-foreground tabular-nums
- Empty state: "No upcoming class" text-[12px] text-muted-foreground
- No capacity badge (upcomingBooking does not carry capacity — omitted per spec)

**WIDGET 3 — LAST VISIT (shadcn Card, p-3 mt-2):**
- Sub-label: `LAST VISIT`
- When `lastVisit`: date text-[13px] font-semibold tabular-nums + class name text-[11px] text-muted-foreground
- Empty state: "No visits recorded" text-[12px] text-muted-foreground

**Footer:** `<Button asChild variant="outline" size="sm" className="w-full mt-3"><Link to="/gymos/members/{id}">View Member Profile</Link></Button>`

**Removed from panel:** Lifetime bookings, Today's nutrition, Goal blocks. These fields remain in the loader (consumed by TemplatesDialog's `memberContext` prop) — only the panel UI is trimmed per plan constraint.

**New imports added:** `Card` from `@/components/ui/card`; `Avatar`, `AvatarFallback` from `@/components/ui/avatar`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All three widget cards are wired to real loader data:
- Pass Balance uses `memberStats.passBalance` and `memberStats.passExpiresAt` from the existing passes + debits query
- Next Class uses `upcomingBooking` from the existing bookings query
- Last Visit uses `memberStats.lastVisit` derived in Task 1 from the same bookings array

## Verification

- `grep -n "PASS BALANCE"` — line 1006 (match)
- `grep -n "NEXT CLASS"` — line 1045 (match)
- `grep -n "LAST VISIT"` — line 1075 (match)
- `grep -n "text-xl font-bold text-primary"` — line 1012 (accent numeral)
- `grep -n "View Member Profile"` — line 1105 (match)
- `grep -n "/gymos/members/"` — line 1104 (profile link)
- `grep -n "Today's nutrition|Lifetime bookings"` — 0 matches (panel trimmed)
- `node scripts/guard-no-hardcoded-colors.mjs` — exit 0
- `npx prettier --write` — ran clean

## Self-Check: PASSED

- FOUND: `apps/staff-web/app/routes/gymos.messages.tsx`
- FOUND: `.planning/phases/R4-staff-web-visual-refresh/R4-05-member-context-widget-cards-SUMMARY.md`
- FOUND commit: `17b8fa58` feat(R4-05): derive lastVisit from existing bookings array in messages loader
- FOUND commit: `3eff8f57` feat(R4-05): rebuild member-context aside as Pass Balance / Next Class / Last Visit widget cards
