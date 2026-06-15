---
phase: quick-260613-ey3
plan: 01
subsystem: staff-web/payments
tags: [payments, stripe, list-action, shadcn-table, empty-state]
dependency_graph:
  requires: [P1b.1-01 (apps/staff-web move), P1b.2 (payments table via 0001 migration), P1b-07 (stripe-event reducer populates payments)]
  provides: [list-payments GET action, /gymos/payments real page]
  affects: [apps/staff-web/AGENTS.md agent tool table]
tech_stack:
  added: []
  patterns: [defineAction GET with leftJoin, shadcn Table with colour-coded Badge status, Intl.NumberFormat currency formatting, guard:allow-unscoped on single-tenant gym tables]
key_files:
  created:
    - apps/staff-web/actions/list-payments.ts
  modified:
    - apps/staff-web/app/routes/gymos.payments.tsx
    - apps/staff-web/AGENTS.md
decisions:
  - Money formatted in UI layer (not action) — action returns raw minor units + lowercase ISO currency so consumers control presentation
  - statusStyle helper uses variant="outline" + tailwind colour token className — matches Badge pattern in rest of codebase
  - Empty state uses IconReceiptPound (GBP-appropriate) rather than generic IconReceipt — suits the UK gym deployment
metrics:
  duration: ~25 minutes
  completed: 2026-06-13
  tasks_completed: 2
  files_changed: 3
---

# Quick Task 260613-ey3: Build the Real GymClassOS Payments Page (list-payments) — Summary

**One-liner:** `list-payments` GET action + `/gymos/payments` shadcn Table page replacing the "Coming soon" stub — LEFT JOINs payments→gym_members, colour-coded status badges, GBP-formatted amounts, clean empty state.

## What Was Built

### Task 1 — `list-payments` defineAction (commit `086adf1d`)

`apps/staff-web/actions/list-payments.ts` — a Tier 1 read action matching the `list-renewals` convention:

- `defineAction` with `http: { method: "GET" }` and empty Zod schema
- Single Drizzle query: `SELECT ... FROM payments LEFT JOIN gym_members ON gym_members.id = payments.member_id ORDER BY occurred_at DESC LIMIT 100`
- `guard:allow-unscoped` marker above the query (CI `guard-no-unscoped-queries` check satisfied)
- Returns `{ payments: [...] }` where each row carries `amountMinorUnits` (raw integer, unformatted), `currency` (lowercase ISO), composed `memberName` (firstName + lastName or null), and `memberPhone` (E.164 or null)

### Task 2 — Rewired `gymos.payments.tsx` + AGENTS.md doc (commit `267baf98`)

`apps/staff-web/app/routes/gymos.payments.tsx` — replaces the Coming Soon stub:

- `loader`: same LEFT JOIN query as the action, `guard:allow-unscoped` marker, returns plain object (no `json()` — RR v7 requirement)
- Component: shadcn `Table` (Date / Member / Amount / Status) rendered only when `payments.length > 0`
- `formatAmount()`: `Intl.NumberFormat("en-GB", { style: "currency", currency: ... })` — uppercases the lowercase Stripe ISO code before passing to Intl
- `statusStyle()`: switch over succeeded/refunded/failed/pending → tailwind colour tokens via `variant="outline" + className`
- Empty state: `IconReceiptPound` (muted) + exact copy "No payments yet — they'll appear here as members pay" — no empty table shell
- `meta()` returns `[{ title: "GymClassOS — Payments" }]`
- Header mirrors `gymos.members.tsx`: h1 + count Badge + "← Back to inbox" Link to `/gymos`

`apps/staff-web/AGENTS.md` — `list-payments` row added to the Tier 1 section of the Agent Actions table (between `list-revenue` and `list-at-risk-members`).

## Verification

- `tsc --noEmit`: no errors referencing `list-payments.ts` or `gymos.payments.tsx`
- Both files carry `// guard:allow-unscoped` above their queries
- Both queries use `leftJoin(schema.gymMembers, eq(schema.gymMembers.id, schema.payments.memberId)).orderBy(desc(schema.payments.occurredAt)).limit(100)`
- Route returns plain object (no `json()`), uses `@/` aliases, Tabler icons, no emojis
- Empty state copy is exactly "No payments yet — they'll appear here as members pay"
- `list-payments` documented in `apps/staff-web/AGENTS.md`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The payments table is currently empty (0 rows — the usual state before any Stripe webhooks have been processed). The empty state renders correctly by design. When the worker processes `checkout.session.completed` events (P1b-07), rows will appear in the table automatically.

## Self-Check: PASSED

- `apps/staff-web/actions/list-payments.ts`: FOUND
- `apps/staff-web/app/routes/gymos.payments.tsx`: FOUND
- `apps/staff-web/AGENTS.md`: contains `list-payments`
- commit `086adf1d`: FOUND
- commit `267baf98`: FOUND
- tsc: CLEAN (no errors in changed files)
