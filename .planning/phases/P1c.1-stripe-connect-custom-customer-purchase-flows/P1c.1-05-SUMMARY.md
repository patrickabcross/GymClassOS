---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: 05
subsystem: payments
tags: [stripe, connect, checkout, customer-portal, embed, lead-upsert, subscription]

# Dependency graph
requires:
  - phase: P1c.1-stripe-connect-custom-customer-purchase-flows
    provides: getPlatformStripe(), readConnectedAccount(), connected_accounts table
affects: [P1c.1-07, member-purchase-flows, embed-buy-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildCheckoutParams + validateConnectedAccount extracted to helpers module for Vitest testability (defineAction wrapper imports CJS React, breaks ESM Vitest)"
    - "TDD RED commit of failing test before GREEN implementation"
    - "Nitro server routes split into .get.ts + .post.ts for multi-method embed routes"
    - "(fn as any)() cast for Stripe SDK overload-resolution TS confusion with { stripeAccount } second arg"

key-files:
  created:
    - apps/staff-web/actions/create-checkout-link-helpers.ts
    - apps/staff-web/actions/create-checkout-link.test.ts
    - apps/staff-web/actions/create-portal-link.ts
    - apps/staff-web/features/forms/lib/embed-buy-handler.ts
    - apps/staff-web/server/routes/embed/buy.get.ts
    - apps/staff-web/server/routes/embed/buy.post.ts
  modified:
    - apps/staff-web/actions/create-checkout-link.ts
    - apps/staff-web/AGENTS.md
    - apps/staff-web/server/plugins/auth.ts

key-decisions:
  - "Extracted buildCheckoutParams/validateConnectedAccount to helpers module — defineAction wrapper can't be imported in Vitest (CJS React conflict); pure helpers are testable"
  - "Nitro .get.ts + .post.ts split for /embed/buy (not a single .ts) — matches schedule widget convention"
  - "(platform.checkout.sessions.create as any)(params, opts) cast — Stripe SDK TypeScript overloads confuse { stripeAccount } as second arg; runtime is correct"
  - "No auth.ts edit needed — /embed prefix already covers /embed/buy (documented with comment update)"
  - "embed buy success/cancel URL points to /embed/buy/thank-you + /embed/buy (public — Pitfall 6 fix)"

requirements-completed: [STR-02, PAY-01, PAY-02, PAY-03, PAY-04]

# Metrics
duration: 35min
completed: 2026-06-12
---

# Phase P1c.1 Plan 05: Staff + Public Purchase Surfaces Summary

**Connect-scoped Checkout for packs + subscriptions, Customer Portal, and public /embed/buy lead-upsert flow — all on the connected account via `{ stripeAccount }`.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-06-12T15:20:00Z
- **Completed:** 2026-06-12T15:56:31Z
- **Tasks:** 3 (+ TDD RED commit)
- **Files modified:** 9

## Accomplishments

- `create-checkout-link` reworked: uses `getPlatformStripe()` + `readConnectedAccount()`, adds `mode: payment|subscription`, sets `subscription_data.metadata.memberId` (Pitfall 2), passes `{ stripeAccount }` as 2nd arg, guards on `chargesEnabled`, no `application_fee_*`
- `create-portal-link` new action: opens Stripe Customer Portal on connected account; looks up member's `cus_` id from `stripe_customers`; returns `{ url }` or `{ error }` if no customer yet
- `/embed/buy` public flow: GET renders name/email/phone form, POST upserts member by email (FK-safe re-select pattern from P1c-02), upserts `status='lead'` conversation, creates Checkout on connected account, redirects to `session.url`
- 6 Vitest unit tests green for `buildCheckoutParams` + `validateConnectedAccount` helpers
- TypeScript clean (zero errors across all modified files)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing test for create-checkout-link** - `afa41443` (test)
2. **Task 1 GREEN: create-checkout-link Connect + subscription** - `3a46ec76` (feat)
3. **Task 2: create-portal-link action** - `2753a528` (feat)
4. **Task 3: /embed/buy public flow** - `784d3d30` (feat)

## Files Created/Modified

- `apps/staff-web/actions/create-checkout-link.ts` - Reworked: getPlatformStripe + readConnectedAccount + mode: payment|subscription + { stripeAccount } 2nd arg
- `apps/staff-web/actions/create-checkout-link-helpers.ts` - Pure helpers: buildCheckoutParams + validateConnectedAccount (Vitest-safe)
- `apps/staff-web/actions/create-checkout-link.test.ts` - 6 unit tests for payment mode, subscription mode, and guard logic
- `apps/staff-web/actions/create-portal-link.ts` - New: billingPortal.sessions.create on connected account
- `apps/staff-web/features/forms/lib/embed-buy-handler.ts` - Shared GET + POST handler for /embed/buy
- `apps/staff-web/server/routes/embed/buy.get.ts` - Nitro GET handler (re-exports renderEmbedBuy)
- `apps/staff-web/server/routes/embed/buy.post.ts` - Nitro POST handler (re-exports handleEmbedBuyPost)
- `apps/staff-web/AGENTS.md` - Updated create-checkout-link entry + new create-portal-link entry
- `apps/staff-web/server/plugins/auth.ts` - Comment update: /embed already covers /embed/buy

## Decisions Made

- **buildCheckoutParams extracted**: `defineAction` wraps React which is CJS — breaks ESM Vitest import. The solution is to extract pure business logic into a helpers module that can be imported cleanly. The action wrapper stays thin.
- **Nitro route split**: `/embed/buy` needs both GET (form render) and POST (submission). Nitro uses `.get.ts`/`.post.ts` suffixes. Created two thin re-export files backed by `embed-buy-handler.ts`.
- **No auth.ts edit**: `/embed` prefix in `publicPaths` already covers `/embed/buy`. Added a comment only.
- **(fn as any)()**: Stripe SDK TypeScript has overloaded `checkout.sessions.create` signature that conflicts when `{ stripeAccount }` request options are passed as the 2nd arg. Runtime is correct; cast bypasses the TS overload confusion.
- **Public success/cancel URLs**: Embed context must not redirect members behind staff auth. `/embed/buy/thank-you` and `/embed/buy?...` are both public (Pitfall 6).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TDD test structure: defineAction not importable in Vitest**
- **Found during:** Task 1 RED phase
- **Issue:** `@agent-native/core`'s `defineAction` transitively imports CJS React (`module is not defined` in ESM Vitest). Cannot import the action wrapper directly in tests.
- **Fix:** Extracted `buildCheckoutParams` and `validateConnectedAccount` as pure helpers in `create-checkout-link-helpers.ts`. Tests import helpers; action wrapper imports and calls helpers. Tests cover all the critical business logic.
- **Files modified:** `create-checkout-link-helpers.ts` (new), `create-checkout-link.ts` (uses helpers), `create-checkout-link.test.ts` (tests helpers)
- **Verification:** 6 tests pass; zero TypeScript errors
- **Committed in:** `3a46ec76` (Task 1 GREEN)

**2. [Rule 1 - Bug] Stripe SDK overload TypeScript error**
- **Found during:** Task 3 verification
- **Issue:** TypeScript's overload resolution for `checkout.sessions.create` errors when `{ stripeAccount }` is passed as the second argument: `Type 'RequestOptions' has no properties in common with type 'SessionCreateParams'`.
- **Fix:** Cast `(platform.checkout.sessions.create as any)(params, opts)` — runtime is correct; TS type system is confused by the overloads.
- **Files modified:** `create-checkout-link.ts`, `embed-buy-handler.ts`
- **Verification:** `tsc --noEmit` clean
- **Committed in:** `784d3d30` (Task 3)

**3. [Rule 2 - Missing Critical] embed/buy as two Nitro files (.get.ts + .post.ts)**
- **Found during:** Task 3 implementation
- **Issue:** Plan specified `app/routes/embed.buy.tsx` (RR7 route) but the existing `/embed/schedule` uses Nitro server routes (`server/routes/embed/schedule.get.ts`). A Nitro server route is the correct pattern for public embed endpoints that bypass RR7 and serve raw HTML.
- **Fix:** Created `embed-buy-handler.ts` with shared GET + POST logic, and two Nitro entry points `buy.get.ts` / `buy.post.ts`.
- **Files modified:** `server/routes/embed/buy.get.ts`, `server/routes/embed/buy.post.ts`, `features/forms/lib/embed-buy-handler.ts`
- **Verification:** TypeScript clean; pattern matches schedule widget
- **Committed in:** `784d3d30` (Task 3)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 bug, 1 missing critical pattern match)
**Impact on plan:** All deviations were necessary for correctness and consistency. No scope creep. Test coverage maintained.

## Issues Encountered

- Vitest + CJS React conflict for `defineAction` actions: known Vitest browser mode limitation (noted in CLAUDE.md). Resolved by extracting pure helpers.

## User Setup Required

None — no external service configuration required for this plan (uses existing Stripe platform key + connected account configured in Plan 04).

## Next Phase Readiness

- Staff checkout link is now Connect-scoped + subscription-capable (success criteria #2, #4)
- Customer Portal is reachable on connected account (criterion #7)
- Public `/embed/buy` flow upserts lead by email/phone FK-safely and creates Checkout (criterion #5)
- No card data stored; tokenised IDs only (criterion #8)
- Ready for P1c.1-06 (mobile purchase) and P1c.1-07 (Stripe CLI e2e test)

---
*Phase: P1c.1-stripe-connect-custom-customer-purchase-flows*
*Completed: 2026-06-12*
