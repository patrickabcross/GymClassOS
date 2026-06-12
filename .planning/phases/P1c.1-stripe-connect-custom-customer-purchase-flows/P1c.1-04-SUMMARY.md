---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: "04"
subsystem: payments
tags: [stripe, stripe-connect, custom-account, account-links, onboarding, settings]

# Dependency graph
requires:
  - phase: P1c.1-stripe-connect-custom-customer-purchase-flows
    provides: "connected_accounts table (migration 0006_p1c1_connected_accounts.sql) + platform Stripe key secret slot"
provides:
  - "getPlatformStripe() — platform-key Stripe client resolver"
  - "readConnectedAccount() + upsertConnectedAccountId() — connected_accounts helpers"
  - "create-connect-account action — idempotent Custom-equivalent account creation"
  - "create-account-link action — hosted Account Link onboarding URL generator"
  - "/gymos/settings/integrations — Connect Stripe button + readiness UI"
affects:
  - P1c.1-05 (create-checkout-link + portal modifications — read connected account id)
  - P1c.1-06 (public embed buy flow — same getPlatformStripe resolver)
  - P1c.1-03 (account.updated reducer — writes connected_accounts, which readConnectedAccount reads)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getPlatformStripe(): pgcrypto secrets → STRIPE_SECRET_KEY env → throw — same pattern as restricted-key resolver but reads stripe_platform_secret_key"
    - "readConnectedAccount(): raw db.execute() SELECT LIMIT 1 with guard:allow-unscoped (studio-global table)"
    - "upsertConnectedAccountId(): INSERT ON CONFLICT (id) DO NOTHING — idempotent, flags filled by webhook reducer later"
    - "Settings page loader handles ?stripe=refresh by generating a fresh Account Link and redirecting (no JS round-trip)"
    - "Restricted-key dev fallback behind ?devKeyEntry=1 — preserved for rollback, never the primary surface"

key-files:
  created:
    - apps/staff-web/server/lib/connected-account.ts
    - apps/staff-web/actions/create-connect-account.ts
    - apps/staff-web/actions/create-account-link.ts
  modified:
    - apps/staff-web/server/lib/stripe.ts
    - apps/staff-web/app/routes/gymos.settings.integrations.tsx
    - apps/staff-web/AGENTS.md

key-decisions:
  - "getStripeClient() + getStripeSecretKey() marked @deprecated but NOT deleted — rollback insurance per plan"
  - "getPlatformStripe() is the sole resolver for all Connect operations (platform key, not per-account client)"
  - "?stripe=refresh handled at loader level (server-side redirect) not client-side — cleaner UX, no JS required"
  - "Both new actions are staff-only (not in agent system prompt) — consistent with create-checkout-link posture"
  - "Action server uses inline dynamic import for connected-account helpers to avoid circular dep at module load"

patterns-established:
  - "Platform-key resolver pattern: stripe_platform_secret_key → STRIPE_SECRET_KEY env → throw (extensible for future studios)"
  - "Single-tenant guard pattern: guard:allow-unscoped + LIMIT 1 for studio-global config tables"
  - "Fetcher-form Connect button: Form submits _intent=connect-stripe → action creates account + link → redirect() to Stripe"

requirements-completed: [STR-01]

# Metrics
duration: 8min
completed: 2026-06-12
---

# Phase P1c.1 Plan 04: Stripe Connect Onboarding UI Summary

**Platform Stripe client resolver (getPlatformStripe), Custom-equivalent account creation (controller properties), hosted Account Links onboarding, and Connect Stripe settings UI with readiness state from connected_accounts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-12T13:09:18Z
- **Completed:** 2026-06-12T13:17:38Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- `getPlatformStripe()` reads `stripe_platform_secret_key` from pgcrypto secrets → `STRIPE_SECRET_KEY` env → throws; existing `getStripeClient()` marked `@deprecated` but preserved for rollback
- `readConnectedAccount()` + `upsertConnectedAccountId()` helpers read/write `connected_accounts` with `guard:allow-unscoped` (studio-global, single-tenant)
- `create-connect-account` action: idempotent `accounts.create` with all 4 controller properties (no deprecated `type: "custom"`); stores `acct_id` via `upsertConnectedAccountId`
- `create-account-link` action: `accountLinks.create account_onboarding` with `refresh_url` / `return_url` pointing back to integrations settings
- `/gymos/settings/integrations` reworked: Connect/pending/ready states from `connected_accounts`; `?stripe=refresh` handled at loader level (server redirect to fresh link); restricted-key P1b-08 UI behind `?devKeyEntry=1`
- SQL logic verified live against gymos-demo Neon via `@neondatabase/serverless` (INSERT → SELECT → DELETE cleanup)

## Task Commits

1. **Task 1: getPlatformStripe() + connected-account helpers** — `15a29691` (feat)
2. **Task 2: create-connect-account + create-account-link actions** — `ce850b0d` (feat)
3. **Task 3: Settings integrations page rework** — `eb876999` (feat)

## Files Created/Modified

- `apps/staff-web/server/lib/stripe.ts` — Added `getPlatformStripe()` + `getPlatformStripeKey()`; deprecated `getStripeClient()` / `getStripeSecretKey()`
- `apps/staff-web/server/lib/connected-account.ts` — NEW: `readConnectedAccount()` + `upsertConnectedAccountId()`
- `apps/staff-web/actions/create-connect-account.ts` — NEW: idempotent Custom-equivalent account creation action
- `apps/staff-web/actions/create-account-link.ts` — NEW: hosted onboarding link action
- `apps/staff-web/app/routes/gymos.settings.integrations.tsx` — Full rework: Connect/pending/ready states, refresh handler, cost note, dev fallback
- `apps/staff-web/AGENTS.md` — Documented `create-connect-account` and `create-account-link` as staff-only actions

## Decisions Made

- `getStripeClient()` kept with `@deprecated` tag (not deleted) — preserves rollback path per plan's locked decision. Delete post-cutover.
- `?stripe=refresh` is handled in the loader (server-side redirect) rather than client-side JS — avoids a flash of the page before the redirect and makes no-JS compatible.
- Both new actions are NOT in the agent system prompt — consistent with `create-checkout-link` posture (staff-only, coach controls onboarding).
- Action handler uses dynamic `import()` for connected-account helpers in action branches to avoid circular dep at static module load time.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. TypeScript clean (only pre-existing `react-router.config.ts` type warning unrelated to this plan). SQL verification via `@neondatabase/serverless` against gymos-demo Neon confirmed INSERT/SELECT/DELETE all work correctly.

## User Setup Required

None — no new external service configuration required for this plan. The `stripe_platform_secret_key` secret slot will be configured in Plan 06 (platform key setup + live onboarding smoke test).

## Next Phase Readiness

- Platform resolver + onboarding actions are ready for Plan 05 (create-checkout-link + portal modifications)
- Settings UI is ready for live testing once `stripe_platform_secret_key` is set in Plan 06
- `readConnectedAccount()` is ready to be used by Plan 05's checkout action to thread `stripeAccount` into direct charges

---
*Phase: P1c.1-stripe-connect-custom-customer-purchase-flows*
*Completed: 2026-06-12*
