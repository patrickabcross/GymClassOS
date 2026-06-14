---
phase: R1-audit-baseline
plan: "01"
subsystem: naming-audit
tags: [naming, audit, gym-domain, email-vocabulary, refactor-planning]
dependency_graph:
  requires: []
  provides:
    - NAMING-RECORD.md — single naming decision record for R3/R4/R5 execution
  affects:
    - R3 naming-and-ia-pass (consumes Label + CSS + Identifier + Route layers)
    - R4 staff-web-embed-widgets (consumes widget vocabulary rows)
    - R5 member-mobile-app (consumes mobile tab label rows)
tech_stack:
  added: []
  patterns:
    - grep-driven codebase audit with file:line provenance
    - four-layer naming record (Label / CSS / Identifier / Route)
key_files:
  created:
    - .planning/phases/R1-audit-baseline/NAMING-RECORD.md
  modified: []
decisions:
  - "Widget CTA 'Enquire' is correct for lead-capture flow; 'Book' applies only when direct Stripe booking is added (NAME-06 split decision)"
  - "SnoozePopover/SnoozeModal renamed to ScheduledMessagePopover/ScheduledMessageModal (gym-domain equivalent)"
  - "CSS rename must be additive-alias-first per R-12: add .conversation-row alongside .email-list-row, migrate, then drop old class"
  - "Route renames deferred to R3 with explicit redirect shim requirement per R-06 (live customer Hustle uses /gymos/inbox daily)"
metrics:
  duration_seconds: 185
  completed_date: "2026-06-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 0
requirements_satisfied:
  - AUDT-02
---

# Phase R1 Plan 01: Naming Decision Record Summary

**One-liner:** Grep-driven four-layer naming audit producing NAMING-RECORD.md with 60+ items classified across Label/CSS/Identifier/Route layers, all three surfaces, with file:line provenance and proposed gym-domain targets — R3 executes from this record without re-auditing.

## What Was Built

`.planning/phases/R1-audit-baseline/NAMING-RECORD.md` — a 170-line single document with:

- **Label Layer table** (18 rows): user-visible copy across staff-web nav, inbox headings, page titles, mobile tabs, and embed widget CTAs
- **CSS Layer table** (12 rows): every `.email-*` and `.compose-*` class in `global.css` with confirmed line ranges and the component file that renders each class
- **Identifier Layer table** (18 rows): component file and function names requiring rename, plus neutral-keep items
- **Route Layer table** (10 rows): every hardcoded route string with file:line refs, redirect-shim requirements flagged for `/gymos/inbox` → `/gymos/messages`
- **NAME-05 do-not-touch table** (10 rows): DB-stored enum values that surface as labels, each explicitly marked frozen
- **R3/R4/R5 Scope Derivation section**: prose mapping each table to its consuming phase

## Deviations from Plan

None — plan executed exactly as written.

## Key Decisions Made

1. **Widget CTA split decision** — The embed schedule widget uses `"Enquire"` (not `"Book"`) because the current flow is lead-capture only (no Stripe Checkout path for the anonymous user). NAME-06 specifies `"Book"` as the booking CTA; `"Enquire"` is correct for enquiry-only flows. When R4 adds a direct booking path to the widget, the CTA becomes `"Book"`. Both cases are documented in the Label layer table.

2. **SnoozePopover/SnoozeModal → ScheduledMessagePopover/ScheduledMessageModal** — "Snooze" is pure email vocabulary (Gmail/Superhuman). The gym-domain equivalent for a deferred WhatsApp send is "Scheduled Message". R3 should confirm whether snooze functionality is retained or retired before renaming.

3. **CSS additive-alias-first strategy** — Per R-12 (CSS orphaning risk), `.email-list-row` → `.conversation-row` must use an additive alias approach: add `.conversation-row` to `global.css` alongside `.email-list-row`, migrate `EmailListItem.tsx` to use the new class, verify styling on Vercel preview, then drop `.email-list-row`. This prevents the stranded-CSS failure mode.

4. **Route renames deferred to R3 with explicit shim requirement** — `/gymos/inbox` is Hustle's daily-use URL. R3 must add `loader = () => redirect('/gymos/messages', 301)` to `gymos.inbox.tsx` BEFORE renaming the file, and must verify the redirect on a Vercel preview deploy before removing the old route file.

## Auth Gates

None — documentation-only plan; no deployed services accessed.

## Known Stubs

None — NAMING-RECORD.md is a planning artifact, not a UI surface. All rows have non-empty proposed-target and risk-note cells.

## Self-Check: PASSED

- [x] `.planning/phases/R1-audit-baseline/NAMING-RECORD.md` exists (170 lines)
- [x] `grep -cE "^## (Label|CSS|Identifier|Route) Layer"` returns 4
- [x] `grep -q "redirect shim"` succeeds
- [x] `grep -q "NAME-05"` succeeds
- [x] `grep -qi "conversation-row"` succeeds
- [x] `grep -qiE "Classes|Passes|Log"` succeeds (mobile tab targets)
- [x] `grep -qiE "Enquiry"` succeeds (WDGT-02)
- [x] `grep -q "R3/R4/R5 Scope Derivation"` succeeds
- [x] Task commit `ccd5b495` exists in git log
