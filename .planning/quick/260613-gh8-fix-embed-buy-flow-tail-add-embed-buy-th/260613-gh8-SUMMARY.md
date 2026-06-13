---
phase: quick-260613-gh8
plan: "01"
subsystem: embed-buy
tags: [stripe, embed, public-routes, error-handling]
dependency_graph:
  requires: [P1c.1-stripe-connect]
  provides: [PAY-01, STR-02]
  affects: [embed/buy POST handler, embed/buy/thank-you GET route]
tech_stack:
  added: []
  patterns: [nitro-raw-html-route, stripe-try-catch, price-retrieve-mode-coercion]
key_files:
  created:
    - apps/staff-web/server/routes/embed/buy/thank-you.get.ts
  modified:
    - apps/staff-web/features/forms/lib/embed-buy-handler.ts
decisions:
  - "Dropped esc import from thank-you.get.ts — member param not interpolated into HTML (XSS avoidance; esc still exported for forward-compat callers)"
  - "Price retrieve failure is non-fatal (console.warn + fall back to submitted mode); sessions.create try/catch is the safety net"
  - "Buyer-visible error copy unified to friendly phrase; original success_url error copy updated to match"
metrics:
  duration_minutes: 12
  tasks_completed: 2
  files_changed: 2
  completed_date: "2026-06-13"
---

# Quick Task 260613-gh8 Summary

**One-liner:** Public `/embed/buy/thank-you` success page + try/catch around `checkout.sessions.create` with recurring-price mode coercion fixes both confirmed buy-flow tail failures.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| A | Add public /embed/buy/thank-you Nitro success route + export shared theme helpers | d63560da | embed-buy-handler.ts (exports), thank-you.get.ts (new) |
| B | Harden handleEmbedBuyPost against Stripe errors (try/catch + mode coercion) | 927d6000 | embed-buy-handler.ts |

## What Was Done

### Task A — thank-you route + exported helpers

- Added `export` keyword to `esc()`, `CSS()`, and `HTML_HEADERS` in `embed-buy-handler.ts` (bodies unchanged).
- Created `apps/staff-web/server/routes/embed/buy/thank-you.get.ts` — a Nitro GET handler that:
  - Imports `CSS` and `HTML_HEADERS` from the handler module (4 levels up via `../../../../features/...`).
  - Renders a self-contained dark-theme "Payment received" page with an inline SVG checkmark (no emoji).
  - Returns a `new Response(html, { headers: HTML_HEADERS })` — anonymous, `frame-ancestors *`, `no-store`.
  - Reads the `?member` query param via `getRequestURL` but does not interpolate it into the HTML (avoids XSS surface; pass-grant is the worker's job via the stripe-event reducer).
- No changes to `auth.ts` or `00-public-cors.ts` — the `/embed` prefix already covers the new route (confirmed at plan time).

### Task B — hardened POST handler

- **Price-type coercion** inserted before `buildCheckoutParams`: retrieves the price on the connected account via `platformForPrice.prices.retrieve(priceId, { stripeAccount })`, sets `effectiveMode = 'subscription'` if `price.recurring` is truthy, `'payment'` if `price.type === 'one_time'`. Failure is non-fatal (console.warn + fall back to submitted mode).
- **try/catch around `sessions.create`**: on Stripe throw, logs raw error server-side via `console.error`, classifies via regex (`recurring price|payment mode|you specified|no such price|invalid|missing`) as 400 (client config error) or 502 (transient), then renders the buy form with the friendly banner `"We couldn't start your payment — please try again or contact us."` — raw Stripe text is never sent to the buyer.
- Updated the `!session.url` fallback error copy to the same friendly phrase for consistency.
- `buildCheckoutParams` now receives `mode: effectiveMode` instead of `mode`.

## Deviations from Plan

**1. [Rule 1 - Bug] Dropped unused `esc` import from thank-you.get.ts**
- **Found during:** Task A implementation
- **Issue:** The plan template included `import { CSS, esc, HTML_HEADERS }` but noted that `esc` may be unused if member is not interpolated into markup. Not interpolating member is the correct XSS-safe choice.
- **Fix:** Dropped `esc` from the import list. `esc` is still exported from embed-buy-handler.ts for any future caller.
- **Files modified:** apps/staff-web/server/routes/embed/buy/thank-you.get.ts

No other deviations — plan executed exactly as written.

## Known Stubs

None. The thank-you page renders complete content. Pass-grant is handled by the existing worker stripe-event reducer (P1b-07) — that is the intended architecture, not a stub.

## Self-Check: PASSED

- `apps/staff-web/server/routes/embed/buy/thank-you.get.ts` exists and exports a default h3 handler.
- `apps/staff-web/features/forms/lib/embed-buy-handler.ts` exports `CSS`, `esc`, `HTML_HEADERS` and wraps `sessions.create` in try/catch with price-coercion before `buildCheckoutParams`.
- Commits d63560da and 927d6000 both present in git log.
- `pnpm --filter @gymos/staff-web typecheck` passes (no errors).
- No auth.ts or 00-public-cors.ts changes.
- No DB or schema changes.
- No emojis in rendered HTML (checkmark is inline SVG).
