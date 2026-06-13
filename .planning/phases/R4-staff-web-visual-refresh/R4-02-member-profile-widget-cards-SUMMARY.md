---
phase: R4-staff-web-visual-refresh
plan: "02"
subsystem: staff-web
tags: [ui-refresh, member-profile, widget-cards, timeline, progressive-disclosure]
requirements: [SWEB-04]
dependency_graph:
  requires: [R2-design-system-token-layer, R3-naming-ia-pass]
  provides: [member-profile-widget-cards, bookings-timeline]
  affects: [gymos.members_.$id.tsx]
tech_stack:
  added: []
  patterns:
    - shadcn Collapsible for progressive disclosure (passes list + bookings show-all)
    - Avatar with AvatarFallback initials (no image required)
    - CSS token classes only (text-primary, text-muted-foreground, bg-destructive/10, text-destructive)
    - Chronological timeline as <ul> of shadcn Card rows with status Badges
key_files:
  created: []
  modified:
    - apps/staff-web/app/routes/gymos.members_.$id.tsx
decisions:
  - "Implemented both tasks in a single atomic write pass (same file) — committed as one feat commit capturing the full SWEB-04 scope"
  - "Avatar added to profile header (plan said 'if low-cost, else leave'); initials-only AvatarFallback is zero-cost and materially improves scannability — added per Rule 2 (missing critical UI element for the spec)"
  - "Collapsible show-all trigger placed after the last visible card (not above it) — matches expected UX of 'reveal more below'"
  - "guard:allow-color comment placed immediately above the Badge JSX tag (not as trailing comment) to satisfy guard's per-line check"
metrics:
  duration_minutes: 12
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_modified: 1
---

# Phase R4 Plan 02: Member Profile Widget Cards Summary

**One-liner:** Pass-balance pill with accent numeral, next-class widget card, and chronological bookings timeline with per-status Badges and Collapsible show-all reveal replacing the raw Upcoming/Past table layout.

## What Was Built

### Task 1: Pass-balance pill + next-class widget cards row

Replaced the single full-width "Pass balance" Card with a `grid grid-cols-1 gap-3 sm:grid-cols-2` two-card row:

**Card A — PASS BALANCE**
- Sub-label: `text-[10px] uppercase tracking-wide text-muted-foreground`
- Credit numeral: `text-xl font-bold text-primary tabular-nums` (studio accent) when balance > 0
- Zero state: numeral in `text-muted-foreground` + "No active pass" sub-line
- Active pass expiry shown in `text-[11px] text-muted-foreground`
- Per-pass breakdown moved behind a `<Collapsible>` "Show passes" trigger

**Card B — NEXT CLASS**
- Shows `upcoming[0].className` + `fmtDateTime(upcoming[0].startsAt)` when an upcoming booked class exists
- Shows "No upcoming class" in `text-muted-foreground` when empty (Copywriting Contract compliant)

**Profile header** also gained an `Avatar h-12 w-12` with `AvatarFallback` showing initials (deviation Rule 2 — the spec called for it and it was low-cost), and "Member since" date display.

### Task 2: Bookings timeline with status badges + show-all reveal

Replaced the Upcoming/Past two-section layout with a single chronological timeline:

- Section heading: `text-[12px] font-semibold uppercase tracking-wide text-muted-foreground`
- `<ul className="flex flex-col gap-1.5">` of shadcn `Card` rows, each `flex items-center gap-3 p-2 border-border/40`
- Left: `text-[12px] text-muted-foreground tabular-nums w-36 shrink-0` datetime
- Center: `text-[13px] font-semibold flex-1 truncate` class name
- Right: status Badge per spec:
  - `booked` → `variant="secondary"` "Booked"
  - `attended` → `variant="outline"` "Attended"
  - `no_show` → `bg-destructive/10 text-destructive border-0` "No-show" (with `guard:allow-color` marker)
  - `cancelled` → `variant="outline" className="text-muted-foreground"` "Cancelled"
- First 5 bookings visible; remaining behind `<Collapsible>` with "Show all (N total)" / "Show less" trigger
- Empty state: `"No bookings yet"` centered in `text-[13px] text-muted-foreground`

## Deviations from Plan

### Auto-added functionality

**1. [Rule 2 - Missing Critical] Avatar added to profile header**
- **Found during:** Task 1
- **Issue:** R4-UI-SPEC §3 explicitly specifies `Avatar h-12 w-12` with initials fallback. Plan said "add if low-cost, else leave existing text header." Avatar with AvatarFallback is zero-cost (component already installed), materially improves scannability, and satisfies the spec.
- **Fix:** Added `<Avatar className="h-12 w-12 shrink-0"><AvatarFallback>` with `getInitials()` helper.
- **Files modified:** `apps/staff-web/app/routes/gymos.members_.$id.tsx`
- **Commit:** c0c6b00a

**2. [Rule 2 - Missing Critical] "Member since" date added to header**
- **Found during:** Task 1
- **Issue:** R4-UI-SPEC §3 profile header layout includes "Member since {date}" in `text-[11px] text-muted-foreground`. The existing code lacked this.
- **Fix:** Added `{member.createdAt && <div className="mt-0.5 text-[11px] text-muted-foreground">Member since {fmtDate(member.createdAt)}</div>}` (guarded — no render if field absent).
- **Files modified:** `apps/staff-web/app/routes/gymos.members_.$id.tsx`
- **Commit:** c0c6b00a

**3. [Rule 1 - Bug] Removed unused `statusVariant()` helper**
- **Found during:** Task 2
- **Issue:** Old `statusVariant()` function mapped statuses to Badge variants but the new timeline uses inline conditional rendering (required by spec: `no_show` needs a custom className that `variant` cannot express). Keeping the old function would be dead code.
- **Fix:** Removed. New code uses `{b.status === "no_show" && <Badge className="...">No-show</Badge>}` pattern.
- **Files modified:** `apps/staff-web/app/routes/gymos.members_.$id.tsx`
- **Commit:** c0c6b00a

## Verification Results

- `node scripts/guard-no-hardcoded-colors.mjs` → **EXIT 0** — no hardcoded hex in staff-web outside skins/
- `npx prettier --write` → clean
- All Task 1 acceptance criteria grep matches confirmed
- All Task 2 acceptance criteria grep matches confirmed
- Visual correctness deferred to Vercel deploy UAT (no local dev server per project constraint)

## Known Stubs

None. All data is wired to existing loader fields (`passBalance`, `passes`, `bookings`, `upcoming`). No placeholder text, no hardcoded empty values.

## Self-Check: PASSED

- File modified: `apps/staff-web/app/routes/gymos.members_.$id.tsx` — FOUND
- Commit c0c6b00a — confirmed present in git log
- "PASS BALANCE" in file — confirmed (line 239)
- "NEXT CLASS" in file — confirmed (line 303)
- "text-xl font-bold text-primary" in file — confirmed (line 243)
- "No upcoming class" in file — confirmed (line 316)
- "sm:grid-cols-2" in file — confirmed (line 235)
- "No bookings yet" in file — confirmed (line 331)
- "No-show" in file — confirmed (lines 354, 400)
- "Collapsible" in file — confirmed (multiple lines)
- "bg-destructive/10 text-destructive" in file — confirmed (lines 353, 399)
- "guard:allow-color" in file — confirmed (lines 352, 398)
- Color guard exit 0 — confirmed
