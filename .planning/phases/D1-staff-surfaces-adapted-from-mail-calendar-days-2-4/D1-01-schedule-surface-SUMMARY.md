---
phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2-4
plan: 01
subsystem: staff-web
tags: [demo-sprint, schedule, bookings, react-router-v7, drizzle]
requires:
  - templates/mail/server/db/schema.ts (classOccurrences, classDefinitions, bookings, gymMembers — seeded in D0)
  - templates/mail/app/components/ui/{dialog,select,badge,button}.tsx (shadcn primitives)
  - templates/mail/server/db/index.ts (getDb + schema re-export)
provides:
  - GET  /gymos/schedule — week-grid view of seeded class occurrences (loader)
  - POST /gymos/schedule — book a member into an occurrence (action)
  - Demo bypass: /gymos/{schedule,members,payments} now in Better-auth publicPaths
affects:
  - templates/mail/server/plugins/auth.ts (publicPaths extended +3 entries; preserves /gymos and /api/gmail/*)
tech-stack:
  added: []  # no new deps — used existing shadcn + drizzle + react-router stack
  patterns:
    - "RR v7 framework-mode route: dot-separated filename = path segment (matches gymos.tsx)"
    - "Loader-driven URL-state for dialog open/close: ?book=<occ-id> param, no client state machine"
    - "Single grouped query for booking counts (Map keyed by occurrenceId) avoids N+1"
key-files:
  created:
    - templates/mail/app/routes/gymos.schedule.tsx (373 lines: meta, action, loader, helpers, default component)
  modified:
    - templates/mail/server/plugins/auth.ts (publicPaths: +3 entries — /gymos/schedule, /gymos/members, /gymos/payments)
decisions:
  - "URL-driven dialog state (?book=<id>) instead of React useState — loader re-runs on param change, so capacity counts refresh automatically"
  - "groupByDay keyed by UTC date for the demo; production must key by studio IANA TZ (SCH-07) to be DST-correct"
  - "Booking action does NOT debit pass / check capacity / resolve entitlement — explicitly deferred to BKG-03/BKG-04 in Production v1"
  - "Combined Form post pattern (no client fetch / no optimistic UI for demo) — keeps demo code readable; production booking flow lives in a worker job for retry semantics"
metrics:
  duration: "~5 min wall time (executor)"
  completed: "2026-05-19T07:22:00Z"
  tasks: 3
  files: 2
  commits: 3
  lines_added: 378
---

# Phase D1 Plan 01: Schedule Surface Summary

Staff-facing weekly class schedule at `/gymos/schedule` — coach sees the 7 seeded occurrences as cards in a Sun→Fri grid, clicks any card to open a booking dialog, picks one of the 5 seeded members, and submits to insert a `bookings` row (status='booked'). Demo-grade SELECT+INSERT with no atomic capacity check; production hardening tracked under BKG-03/BKG-04.

## What Shipped

### Task 1 — auth.ts publicPaths extension (`f5cdbdc6`)

Extended `templates/mail/server/plugins/auth.ts` `publicPaths` from `["/api/gmail/push","/api/gmail/watch/renew","/gymos"]` to add three D1 surfaces: `/gymos/schedule`, `/gymos/members`, `/gymos/payments`. Demo customer can hit every D1 route without Google sign-in. Production v1 will replace this with Better-auth magic-link (member side) + admin/coach roles (staff side).

### Task 2 — gymos.schedule.tsx loader + week-grid component (`dd50fe62`)

New RR v7 framework-mode route file at `templates/mail/app/routes/gymos.schedule.tsx`. Filename uses dot-separator convention so URL path is `/gymos/schedule` (matches the existing `gymos.tsx` inbox pattern).

- **`loader({ request })`** runs three queries:
  1. **All occurrences joined to definitions** ordered by `startsAt asc` — projects `id, startsAt, endsAt, capacity, status, room, className, category, durationMin`.
  2. **Booking counts per occurrence** — single `COUNT(*) GROUP BY occurrence_id WHERE status='booked'` reduced into a `Record<occurrenceId, number>`. No N+1.
  3. **Gym member list + selected occurrence** — only runs when `?book=<id>` is present (avoids overhead on the bare schedule page).

- **Default component** renders:
  - Header with title + occurrence-count badge.
  - Week grid — one column per UTC date, gap-3, fluid column widths (`minmax(180px, 1fr)`). Empty state if no occurrences.
  - Per-occurrence cards: `formatTime(startsAt)`, class name, category Badge, room, duration, and `{booked}/{capacity}` capacity (turns amber if at-or-over). Cards are `<button>` elements that call `setSearchParams({ book: o.id })`.
  - shadcn `Dialog` controlled by `open={!!data.bookOccurrence}` — closing clears the search param via `setParams({})`. URL-driven open state means no `useState` desync between dialog and loader data.
  - Inside the dialog: `<Form method="post">` with hidden `occurrenceId`, a `<Select name="memberId">` populated from `data.members`, and a Book button. Includes a footer note flagging the demo-grade trade-offs (no atomic txn / no pass debit) so the customer knows what's deferred.

- **Helpers**: `groupByDay` (UTC date bucket — flagged in inline comment for SCH-07 IANA-TZ replacement), `formatTime` (en-GB HH:mm), `formatDayHeader` (Weekday short + Day Mon).

### Task 3 — booking action handler (`23ee58f2`)

Appended `export async function action({ request })` to the same route. Reads `occurrenceId` + `memberId` from the posted form, generates `bkg_${randomUUID()}`, inserts into `schema.bookings` with `status: "booked"`, `bookedByUserId: null` (demo has no staff-auth context), `bookedAt: now`, and returns `redirect("/gymos/schedule")` so RR v7 re-runs the loader and the capacity count visibly increments on the next render.

**Demo-grade trade-offs explicit in code comments:**
- No `SELECT ... FOR UPDATE` on the occurrence row — concurrent bookings can over-fill capacity (acceptable for a single-coach demo; production needs the txn).
- No entitlement / pass debit — booking succeeds regardless of pass balance.
- No 24h-WhatsApp-window reminder enqueue — production sends the booking confirmation via `pg-boss → worker → Meta`.

Tracked as BKG-03 (atomic capacity) + BKG-04 (entitlement+debit txn) in REQUIREMENTS.md.

## Files Created / Modified

| Path | Status | Notes |
|---|---|---|
| `templates/mail/app/routes/gymos.schedule.tsx` | NEW (373 lines) | RR v7 route module — meta/action/loader/helpers/default export |
| `templates/mail/server/plugins/auth.ts` | MODIFIED (+3 lines) | `publicPaths` extended with 3 demo paths |

## Must-Have Pattern Checks (all PASS)

| Check | Result |
|---|---|
| `gymos.schedule.tsx` contains `classOccurrences.*leftJoin.*classDefinitions` (multi-line regex) | PASS |
| `gymos.schedule.tsx` contains `insert(schema.bookings)` | PASS |
| `auth.ts` publicPaths contains `/gymos/schedule` | PASS |
| `auth.ts` publicPaths contains `/gymos/members` | PASS |
| `auth.ts` publicPaths contains `/gymos/payments` | PASS |

## Acceptance Criteria

All plan-defined acceptance grep counts pass:

- `export async function loader` × 1 ✓
- `export async function action` × 1 ✓
- `export default function` × 1 ✓
- `schema.classOccurrences` × 9 (≥2 required) ✓
- `schema.classDefinitions` × 5 (≥1) ✓
- `schema.bookings` × 4 (≥1) ✓
- `schema.gymMembers` × 5 (≥1) ✓
- `db.insert(schema.bookings)` × 1 ✓
- `status: "booked"` × 1 ✓
- `redirect("/gymos/schedule")` × 1 ✓
- `ActionFunctionArgs` × 2 (import + signature) ✓
- `@/components/ui/dialog` × 1 ✓
- File length: 373 lines (≥200 required) ✓
- `auth.ts` `/api/gmail/push` preserved ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prettier reformatted `.leftJoin(` onto a new line**

- **Found during:** Task 2 verify step.
- **Issue:** Plan's literal automated check `s.includes('leftJoin(schema.classDefinitions')` failed because Prettier broke the call across newlines (`.leftJoin(\n      schema.classDefinitions,`). This is a brittle assertion in the plan, not a real code defect.
- **Fix:** Replaced the literal `includes()` check with the multi-line regex pattern from the plan's `must_haves.key_links.pattern` field (`/classOccurrences[\s\S]*leftJoin[\s\S]*classDefinitions/`). The plan's must-have pattern is the canonical contract.
- **Files modified:** None (code is correct; verification logic adjusted).
- **Commit:** N/A (verification only).

### Benign Counts

- `from "react-router"` appears 2 times instead of the plan's literal expectation of 1. The two occurrences are a normal RR v7 idiom: one regular value import (`useLoaderData`, `Form`, `redirect`, `useSearchParams`) plus one separate `import type { LoaderFunctionArgs, ActionFunctionArgs }`. Both target the same `react-router` package; intent is satisfied.

### No Other Deviations

No bugs auto-fixed (Rule 1). No missing critical functionality (Rule 2). No architectural decisions required (Rule 4). The auth.ts edit was the only change to a file outside this plan's primary route.

## Known Stubs / Demo-Grade Limitations

These are intentional, plan-acknowledged demo cutoffs — NOT bugs:

1. **No atomic capacity enforcement.** Booking handler does a naive INSERT; two coaches booking the same full class concurrently will both succeed. Production fix: BKG-03 (single-txn capacity check via `SELECT FOR UPDATE` on `class_occurrences`).
2. **No pass debit / entitlement resolution.** `bookings.passId` is left null and `pass_debits` is not inserted. Production fix: BKG-04 (atomic capacity-check + pass-debit + booking-insert in one txn).
3. **No booking confirmation WhatsApp send.** Action doesn't enqueue an outbound message. Production fix: enqueue to pg-boss with 24h-window + opt-in gate at the sender layer (P1b webhook spine work).
4. **`groupByDay` uses UTC date.** A class starting Mon 23:30 UTC could render under "Tue" for a Europe/London studio. Production fix: SCH-07 (IANA-TZ-aware date bucketing using `date-fns-tz`).
5. **`bookedByUserId: null`.** Demo has no staff auth context yet; production wires `getSession(event)` → `request_context.user_id`.

## Self-Check: PASSED

- File `templates/mail/app/routes/gymos.schedule.tsx` exists (373 lines).
- File `templates/mail/server/plugins/auth.ts` modified with 3 new publicPaths entries.
- Commits present: `f5cdbdc6` (auth.ts), `dd50fe62` (loader+component), `23ee58f2` (action).
- All must-have pattern checks pass.
- All acceptance grep counts meet thresholds.

## Manual Smoke-Test Gate (deferred to demo run)

Per plan `<verification>` — the visual demo is the real gate, executed once all 4 parallel D1 plans land:

1. `pnpm --filter mail dev` boots Vite on `:8081`.
2. Open `http://localhost:8081/gymos/schedule` — expect 7 seeded occurrences in week grid.
3. Click a card → dialog opens with the 5 seeded members in the select.
4. Pick a member, click Book → page refreshes; capacity bumps from `0/12` to `1/12`.
5. Refresh — booking persists (DB-backed, not client state).
6. Sanity check existing `/gymos` inbox still works (publicPaths preserved).

## Next Plans Unblocked

This plan's `auth.ts` edit unblocks D1-02 (members directory) and D1-03 (payments-stripe-checkout) without those plans needing to touch the same file — same-file contention avoided across the parallel D1 wave.
