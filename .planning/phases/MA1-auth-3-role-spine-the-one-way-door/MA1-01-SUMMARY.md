---
phase: MA1-auth-3-role-spine-the-one-way-door
plan: "01"
subsystem: auth
tags: [better-auth, member-session, role-resolver, claim-by-email, dual-path-gate]
depends_on:
  requires: []
  provides: [requireMember, requireMemberOrDemo, claimMemberByEmail, claimMemberByPhone, resolveRole]
  affects: [all /api/m/* endpoints, mobile Better-auth sign-in flow, MA2 booking, MA3 teacher, MA4 admin]
tech-stack:
  added: [RUNSTUDIO_TEACHER_EMAILS env var]
  patterns:
    - "requireMemberOrDemo dual-path gate (DEMO_MODE + !production = demo branch; else Bearer session)"
    - "claimMemberByEmail lazy-on-first-request with isNull(userId) race guard"
    - "UPDATE .set({ userId }) ONLY — never email/phoneE164 (dual-unique-key safety)"
    - "Injected-db helper pattern for Vitest ESM unit tests (BD4-01)"
key-files:
  created:
    - apps/staff-web/server/lib/role-resolver.ts
    - apps/staff-web/server/lib/role-resolver.test.ts
    - apps/staff-web/server/lib/member-session.ts
    - apps/staff-web/server/lib/member-session-helpers.ts
    - apps/staff-web/server/lib/member-session.test.ts
  modified:
    - apps/staff-web/app/routes/api.m.profile.tsx
    - apps/staff-web/app/routes/api.m.schedule.tsx
    - apps/staff-web/app/routes/api.m.bookings.tsx
    - apps/staff-web/app/routes/api.m.purchase.tsx
    - apps/staff-web/app/routes/api.m.content.tsx
    - apps/staff-web/app/routes/api.m.members.list.tsx
    - apps/staff-web/app/routes/api.m.food-entries.tsx
    - apps/staff-web/app/routes/api.m.foods.search.tsx
    - "apps/staff-web/app/routes/api.m.foods.barcode.$ean.tsx"
    - apps/staff-web/app/routes/api.m.foods.analyze.tsx
    - apps/staff-web/app/routes/api.m.agent.stream.tsx
decisions:
  - "resolveRole does NOT apply the Patrick-fallback from root.tsx — mobile resolver requires explicit RUNSTUDIO_OPERATOR_EMAILS; empty list = no admins via env (diverges from web intentionally)"
  - "Pure claim helpers extracted to member-session-helpers.ts (injected db) to avoid @agent-native/core ESM/CJS vitest collision (BD4-01 pattern)"
  - "H3Event adapter built from request.headers (minimal shape); Plan 03 device spike verifies the Bearer round-trip end-to-end"
  - "x-claim-phone header honored inside requireMember (phone fallback without a second round-trip); Plan 02 sign-in flow supplies this header"
  - "Staff notification on all-miss is console.warn + TODO(MA2+) for ghost-lead conversations row — avoids coupling MA1 to conversations/lead pipeline"
metrics:
  duration: 13min
  completed_date: "2026-06-29"
  tasks: 3
  files: 16
---

# Phase MA1 Plan 01: Server-Side Member Identity Spine Summary

Server-side Better-auth member identity spine with dual-path gate: `requireMember` (verified Bearer session → lazy claim → gym_members row), `resolveRole` (RUNSTUDIO_OPERATOR_EMAILS > RUNSTUDIO_TEACHER_EMAILS > member), and `requireMemberOrDemo` (DEMO_MODE dual-path wrapper wiring all 11 `/api/m/*` handlers).

## What Was Built

**Task 1 — role-resolver.ts**: Pure `resolveRole(email): AppRole` reading `RUNSTUDIO_OPERATOR_EMAILS` and the new `RUNSTUDIO_TEACHER_EMAILS` env vars. Strict admin > teacher > member precedence. Does not read `GYMOS_ADMIN_EMAILS` (web-only nav tab gating with different semantics). 6 unit tests green.

**Task 2 — member-session.ts + helpers**: The core server-side auth contract:
- `claimMemberByEmail` / `claimMemberByPhone`: idempotent, re-claim-guarded (409), writes `userId` ONLY in the UPDATE SET (dual-unique-key safety — Pitfall 3), `isNull(userId)` race guard in WHERE.
- `requireMember`: verifies Bearer session via `getSession` H3Event adapter, fast-path by `userId`, then lazy claim chain, then phone-fallback via `x-claim-phone` header, then 403 with `{ code: "PHONE_REQUIRED" }` JSON signal.
- `requireMemberOrDemo`: verbatim gate `DEMO_MODE === "true" && NODE_ENV !== "production"`.
- `member-session-helpers.ts` extracted for pure injected-db Vitest testing (BD4-01 pattern avoids @agent-native/core ESM issue). 9 unit tests green.

**Task 3 — handler swap**: All 11 `/api/m/*` handler files updated. 10 files had `requireDemoMember` calls (12 total call sites: 2 each in `api.m.purchase.tsx` and `api.m.food-entries.tsx`). `api.m.members.list.tsx` had no call — demo-only picker with its own gate. `demo-member.ts` preserved (still used by `requireMemberOrDemo`'s demo branch).

## Verification

- `npx vitest run server/lib/role-resolver.test.ts server/lib/member-session.test.ts` — 15/15 green
- `grep requireDemoMember apps/staff-web/app/routes/api.m.*.tsx` — ZERO code matches
- `npx tsc --noEmit` — 0 new errors (2 pre-existing in unrelated `mark-booking-attended.ts`)
- Claim UPDATE verified to write `{ userId }` ONLY via unit test assertion on `Object.keys(setArgs)`
- `requireMemberOrDemo` contains verbatim `process.env.DEMO_MODE === "true"` AND `process.env.NODE_ENV !== "production"`
- `requireMember` NO_EMAIL_MATCH path throws 403 with `{ code: "PHONE_REQUIRED" }` in body

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with two minor autonomy calls:

**1. [Rule 2 - Missing Functionality] x-claim-phone header handling in requireMember**

The plan specified the phone-fallback retry "wired via a header in Plan 02's sign-in flow" but also said `requireMember` should honor `x-claim-phone` header "if present." This was implemented inside `requireMember` as specified (not deferred to Plan 02) — the plan explicitly instructs it at the `requireMember` level (Task 2 action text: "A request that supplies an x-claim-phone header MUST be honored inside requireMember").

**2. [Rule 2 - Pattern] member-session-helpers.ts extraction**

Plan explicitly anticipated this: "if mocking @agent-native/core proves awkward in vitest ESM, extract the pure claim logic into a member-session-helpers.ts." BD4-01 pattern applied. Three files created instead of two (`member-session.ts`, `member-session-helpers.ts`, `member-session.test.ts`).

## Known Stubs

None. This plan is server-side infrastructure only (no UI, no data rendering). The `requireMemberOrDemo` demo branch preserves the existing demo flow unchanged. All claim logic is fully implemented.

## Self-Check: PASSED

All created files exist on disk. All 3 task commits found in git log.

| Check | Result |
|-------|--------|
| `role-resolver.ts` exists | FOUND |
| `role-resolver.test.ts` exists | FOUND |
| `member-session.ts` exists | FOUND |
| `member-session-helpers.ts` exists | FOUND |
| `member-session.test.ts` exists | FOUND |
| `demo-member.ts` still exists | FOUND |
| Commit 77e12908 (Task 1) | FOUND |
| Commit fccdb20b (Task 2) | FOUND |
| Commit 2b278cce (Task 3) | FOUND |
