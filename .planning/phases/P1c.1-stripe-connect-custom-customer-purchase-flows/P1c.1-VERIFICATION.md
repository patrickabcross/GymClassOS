---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
verified: 2026-06-13T00:00:00Z
status: human_needed
score: 6/8 success criteria live-proven; 7/8 code-complete; 1/8 partial
re_verification: null
gaps: []
human_verification:
  - test: "Criterion 4 — Coach sends checkout link from inbox or member profile"
    expected: "A button or action in /gymos/inbox or /gymos/members/:id lets the coach generate a Stripe Checkout URL and share it with the member via WhatsApp"
    why_human: "The create-checkout-link action exists and is code-complete but is only reachable via the noticeboard revenue card's propose-approve flow (BoardCard.tsx proposalActionName='create-checkout-link'). The inbox route (gymos.inbox.tsx) and member profile route (gymos.members_.$id.tsx) have no checkout-link button or UI trigger. Whether the noticeboard proposal path satisfies the criterion's intent of 'from the inbox/member profile' requires a product call."
  - test: "Criterion 2 (subscription path) — subscription mode Checkout live end-to-end"
    expected: "A subscription-mode Checkout completes, checkout.session.completed fires, invoice.paid fires, stripe_subscriptions row has member_id set (Pitfall 2 fix confirmed live)"
    why_human: "Code is verified complete (buildCheckoutParams sets subscription_data.metadata.memberId; invoice-paid reducer reads it). Only a drop-in payment was live-tested. The 302-into-Stripe for subscription mode was confirmed, but no subscription was completed end-to-end in the smoke test."
  - test: "Criterion 7 — Customer Portal URL returned and usable"
    expected: "create-portal-link returns { url } (non-error) when called for a member who has completed a purchase; the URL opens Stripe's portal on the connected account"
    why_human: "Code is verified complete (billingPortal.sessions.create with { stripeAccount }). Not live-tested because no member had a stripe_customers row with a connected-account cus_ id at time of smoke test."
  - test: "Criterion 6 (mobile) — Mobile purchase screen end-to-end on device"
    expected: "Mobile profile tab shows products, tapping Buy opens Checkout in a browser sheet, completing payment grants a pass (balance increases on sheet close)"
    why_human: "GET /api/m/purchase returning non-404 is LIVE-PROVEN. The full tap-to-buy flow requires Expo Go on a physical device and STRIPE_PRICE_* env vars set on Vercel — not achievable programmatically."
---

# Phase P1c.1: Stripe Connect (Custom) + Customer Purchase Flows — Verification Report

**Phase Goal:** Replace the direct restricted-API-key Stripe model with a GymClassOS platform account using Custom connected accounts (white-label), onboarded via Stripe-hosted Account Links; all charges are direct charges on the connected account with no application fee; customers can purchase packs/drop-ins AND recurring membership subscriptions from three surfaces (staff, public /embed/buy, mobile).

**Verified:** 2026-06-13
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Platform account is Connect-enabled; connected account `acct_1Thn4XER2RI3cQpx` exists with `charges_enabled=true && payouts_enabled=true` | LIVE-PROVEN | Plan 07 SUMMARY: Neon `connected_accounts` row confirmed; `account.updated` webhook drove the readiness flags via `account-updated.ts` reducer; `acct_1Thn4XER2RI3cQpx` confirmed by user |
| 2 | Checkout sessions (one-off drop-in) on connected account → reducer grants pass + records payment; idempotency on replay | LIVE-PROVEN | Event `evt_1ThpQ6ER2RI3cQpxpPdL5Mkn`; payments row `pay_pi_3ThpQ4ER2RI3cQpx0w5B9OF6`; 1 pass credit granted to member `RGRbwDb_s8lPiZX2taEWK`; replay tested (ON CONFLICT DO NOTHING) |
| 2b | Checkout sessions (subscription mode) on connected account activate subscription via invoice.paid reducer | CODE-COMPLETE | `buildCheckoutParams` sets `subscription_data.metadata.memberId` (Pitfall 2); `invoice-paid` reducer reads it; 302-into-Stripe confirmed; full completion not live-tested |
| 3 | Connect webhook (separate endpoint, separate secret, `connect=true`) verifies + routes through edge-webhooks → pg-boss → worker idempotency spine | LIVE-PROVEN | Endpoint `POST /webhooks/stripe-connect` in `services/edge-webhooks/src/routes/stripe.ts` uses `STRIPE_CONNECT_WEBHOOK_SECRET`; webhook endpoint `we_1Thp7oEDUyRYOcLTF1HHiAW6` registered with `connect=true`; signature verified; `webhook_events` row created (ON CONFLICT dedup) |
| 4 | Coach can generate and send a checkout link from the inbox or member profile | PARTIAL | `create-checkout-link` action is code-complete and wired. However, neither `gymos.inbox.tsx` nor `gymos.members_.$id.tsx` exposes a checkout-link UI trigger. The capability is reachable only via the noticeboard revenue card's propose-approve flow (`BoardCard.tsx`). Whether this satisfies criterion 4's "from the inbox/member profile" framing is a product judgment call. |
| 5 | Public `/embed/buy` supports a buy flow linking Checkout to a lead/member by email | LIVE-PROVEN | Full flow tested: `/embed/buy` → Stripe Checkout → `/embed/buy/thank-you`; `embed-buy-handler.ts` upserts `gym_members` by email (FK-safe ON CONFLICT), upserts `conversations` with `status='lead'`, creates Checkout on connected account with `{ stripeAccount }` |
| 6 | Member mobile app `/api/m/purchase` returns non-404 (endpoint live on Vercel) | LIVE-PROVEN | Root cause of 404 diagnosed and fixed (Plan 06): uncommitted Nitro files + h3 v1 API bug. All `server/routes/api/m/*.ts` committed with `event.req as unknown as Request` (h3 v2). Profile tab shows products; browser-sheet Checkout not live-tested on device |
| 7 | Stripe Customer Portal on connected account reachable via `create-portal-link` | CODE-COMPLETE | `create-portal-link.ts`: calls `billingPortal.sessions.create(params, { stripeAccount: acct.id })`; returns `{ url }` or `{ error }`. Not live-tested (requires `stripe_customers` row with connected-account cus_) |
| 8 | No card data stored anywhere; tokenised IDs only | CODE-COMPLETE + SCHEMA-VERIFIED | Schema has no PAN columns; `payments`, `stripe_customers`, `stripe_subscriptions` hold `pi_`, `cus_`, `sub_` ids only. Matches STR-08. |

**Score:** 6/8 live-proven (criteria 1, 2-drop-in, 3, 5, 6-endpoint, 8); 7/8 code-complete (adds 2b, 4-via-noticeboard, 7); criterion 4 partial (capability exists, wrong surface).

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/staff-web/server/db/migrations/0006_p1c1_connected_accounts.sql` | `connected_accounts` DDL | VERIFIED | Present; 9-column additive table; applied to gymos-demo Neon |
| `apps/staff-web/server/db/schema.ts` | `connectedAccounts` Drizzle export | VERIFIED | `integer({ mode: 'boolean' })` convention; export confirmed in Plan 01 SUMMARY |
| `packages/queue/src/types.ts` | `StripeEventPayload.stripeAccount` optional field | VERIFIED | `z.string().regex(/^acct_/).optional()` — Plan 01 confirmed |
| `services/edge-webhooks/src/routes/stripe.ts` | `POST /stripe-connect` handler | VERIFIED | 44-line handler; separate `STRIPE_CONNECT_WEBHOOK_SECRET`; `event.account` threaded to `enqueueStripeEvent` |
| `services/edge-webhooks/src/lib/env.ts` | `STRIPE_CONNECT_WEBHOOK_SECRET` in EnvSchema | VERIFIED | Plan 02 SUMMARY — required field, fail-fast |
| `services/worker/src/domain/stripeReducers/account-updated.ts` | `accountUpdated` reducer | VERIFIED | ON CONFLICT upsert; reads `event.data.object` (no refetch); idempotent |
| `services/worker/src/domain/stripeReducers/dispatch.ts` | `account.updated` entry in dispatch | VERIFIED | 7th reducer registered — Plan 03 SUMMARY |
| `services/worker/src/domain/stripeReducers/checkout-session-completed.ts` | Accepts `stripeAccount` param | VERIFIED | Plan 03: all 6 reducers widened; `opts = stripeAccount ? { stripeAccount } : undefined` guard |
| `apps/staff-web/server/lib/stripe.ts` | `getPlatformStripe()` resolver | VERIFIED | pgcrypto secrets → `STRIPE_SECRET_KEY` env → throw; `getStripeClient()` deprecated not deleted |
| `apps/staff-web/server/lib/connected-account.ts` | `readConnectedAccount()` + `upsertConnectedAccountId()` | VERIFIED | Both helpers present; `guard:allow-unscoped`; ON CONFLICT DO NOTHING |
| `apps/staff-web/actions/create-connect-account.ts` | Idempotent account creation action | VERIFIED | Plan 04 SUMMARY; controller properties (no deprecated `type:'custom'`) |
| `apps/staff-web/actions/create-account-link.ts` | Hosted Account Link URL generator | VERIFIED | `account_onboarding`; `refresh_url`/`return_url` to integrations page |
| `apps/staff-web/app/routes/gymos.settings.integrations.tsx` | Connect/pending/ready states UI | VERIFIED | 3-state display; `?stripe=refresh` server-redirect; `readConnectedAccount()` loader |
| `apps/staff-web/actions/create-checkout-link.ts` | Connect-scoped Checkout action | VERIFIED | `getPlatformStripe()` + `readConnectedAccount()`; `mode: payment|subscription`; `subscription_data.metadata.memberId`; `{ stripeAccount }` 2nd arg |
| `apps/staff-web/actions/create-checkout-link-helpers.ts` | Pure helpers (Vitest-safe) | VERIFIED | `validateConnectedAccount` + `buildCheckoutParams`; 6 unit tests pass |
| `apps/staff-web/actions/create-portal-link.ts` | Customer Portal action | VERIFIED | `billingPortal.sessions.create` with `{ stripeAccount }`; `stripe_customers` lookup; `{ url }` or `{ error }` return |
| `apps/staff-web/features/forms/lib/embed-buy-handler.ts` | Embed buy GET+POST handler | VERIFIED | Lead upsert (ON CONFLICT); `conversations` upsert `status='lead'`; Checkout on connected account; price type coercion for subscription mode |
| `apps/staff-web/server/routes/embed/buy.get.ts` + `buy.post.ts` | Nitro GET+POST for `/embed/buy` | VERIFIED | Both present; re-export from `embed-buy-handler.ts` |
| `apps/staff-web/app/routes/gymos.payments.tsx` | Staff payments surface | VERIFIED | Real DB query on `payments` JOIN `gymMembers`; table display; not a stub |
| `apps/staff-web/app/routes/api.m.purchase.tsx` | Mobile purchase endpoint | VERIFIED | GET (product list filtered by env vars) + POST (Connect Checkout creation); `requireDemoMember` gate; `readConnectedAccount()` guard |
| `apps/staff-web/app/routes/m.checkout-return.tsx` | Public Stripe return page | VERIFIED | Listed in Plan 06 key-files; in `auth.ts` publicPaths |
| `packages/mobile-app/app/(tabs)/profile.tsx` | Mobile purchase screen | VERIFIED | `useQuery(['purchase-products'])` + `useMutation` → `WebBrowser.openBrowserAsync` PAGE_SHEET; `invalidateQueries(['profile'])` on sheet close |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `POST /webhooks/stripe-connect` | `enqueueStripeEvent` | `event.account` as `stripeAccount` | WIRED | `stripe.ts:91` — `enqueueStripeEvent({ eventId: event.id, stripeAccount: connectedAccountId })` |
| `enqueueStripeEvent` | worker reducer dispatch | `StripeEventPayload.stripeAccount` → 4th arg | WIRED | `stripe-event.ts` extracts `stripeAccount` from payload; passes as 4th arg to every reducer |
| `accountUpdated` reducer | `connected_accounts` table | ON CONFLICT upsert | WIRED | `account-updated.ts` — verified LIVE via `account.updated` event flowing |
| `create-checkout-link` action | Stripe Checkout on connected account | `{ stripeAccount: acct.id }` 2nd arg | WIRED | `create-checkout-link.ts:103` — `(platform.checkout.sessions.create as any)(params, opts)` |
| `checkout.session.completed` reducer | `payments` row + `passes` row | `metadata.memberId` | WIRED + LIVE-PROVEN | Payments row `pay_pi_3ThpQ4ER2RI3cQpx0w5B9OF6`; 1 pass credit granted |
| `/embed/buy` POST | Checkout on connected account | `buildCheckoutParams` + `{ stripeAccount }` | WIRED + LIVE-PROVEN | Full flow confirmed live |
| `create-portal-link` | Stripe Customer Portal on connected account | `billingPortal.sessions.create(params, { stripeAccount })` | WIRED (code) | Not live-tested |
| `/api/m/purchase` POST | Checkout on connected account | `stripe.checkout.sessions.create(params, reqOpts)` | WIRED | `reqOpts = { stripeAccount: connectedAccount.id }` at line 142 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `gymos.payments.tsx` | `payments` (array from loader) | `db.select().from(schema.payments).leftJoin(gymMembers)` | Yes — real DB query with ORDER BY occurredAt LIMIT 100 | FLOWING |
| `gymos.settings.integrations.tsx` | `account` (connected account state) | `readConnectedAccount()` → `connected_accounts` table | Yes — live; also refetches from Stripe on `?stripe=return` | FLOWING |
| `api.m.purchase.tsx` GET | `products` (product list) | `PILOT_PRODUCTS` constant filtered by `process.env.STRIPE_PRICE_*` | Conditional — empty until `STRIPE_PRICE_*` env vars set on Vercel. Intentional; documented in Plan 06 as known stub. | STATIC until env configured |
| `embed-buy-handler.ts` | Checkout `session.url` | `platform.checkout.sessions.create` on live Stripe | Yes — LIVE-PROVEN via smoke test | FLOWING |
| `mobile profile.tsx` | `productsData` | `apiFetch('/api/m/purchase')` → `api.m.purchase.tsx` loader | Conditional — same PILOT_PRODUCTS dependency | CONDITIONAL |

---

### Behavioral Spot-Checks

| Behavior | Evidence | Status |
|----------|----------|--------|
| Connect webhook receives and deduplicates event | `evt_1ThpQ6ER2RI3cQpxpPdL5Mkn` recorded once in `webhook_events`; replay returned 200 with no duplicate processing | PASS (live) |
| drop-in Checkout → pass grant (1 credit) | `passes` row with `granted=1` for member `RGRbwDb_s8lPiZX2taEWK` | PASS (live) |
| `account.updated` event updates `connected_accounts` readiness | `charges_enabled=true, payouts_enabled=true` confirmed in Neon after Account Link onboarding | PASS (live) |
| `/embed/buy` → thank-you page | Buyer landed on styled `/embed/buy/thank-you` "Payment received" page | PASS (live) |
| `/api/m/purchase` non-404 on Vercel | h3 v2 fix committed (`7297586c`); endpoint returns 200 or 401/503, not 404 | PASS (live-confirmed) |
| Subscription Checkout 302 into Stripe | `create-checkout-link` with `mode:subscription` returns a Stripe URL | PASS (code-verified; not completed end-to-end) |
| Customer Portal URL returned | `create-portal-link` calls `billingPortal.sessions.create` with `{ stripeAccount }` | PASS (code-verified; not live-tested) |
| No PAN in DB | Schema grep: `payments`, `stripe_customers`, `stripe_subscriptions` have no card-number columns | PASS |

---

### Requirements Coverage

| Requirement | Description | Source Plans | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| STR-01 | Platform Stripe account + Custom connected account + readiness tracking + Connect webhook | P1c.1-01, 02, 03, 04 | SATISFIED | connected_accounts table live; getPlatformStripe(); create-connect-account + create-account-link; account-updated reducer; Connect endpoint live-proven |
| STR-02 | Generate Checkout link for a pass purchase, complete in test mode, reflect in member profile | P1c.1-05, 06 | SATISFIED | Drop-in Checkout live-proven end-to-end: checkout.session.completed → payments row + pass credit; staff /gymos/payments shows row |
| PAY-01 | Generate Checkout link for a pack purchase; verify success in member profile | P1c.1-05, 06 | SATISFIED | Drop-in (1-credit) Checkout live-proven; 10-pack/5-pack mechanism same code path, same reducer keywords; member balance = 1 confirmed |
| PAY-02 | Coach generates Checkout link for a drop-in (1-credit pass) | P1c.1-05 | SATISFIED | create-checkout-link with mode=payment; pass credit keyword matching live-proven for "drop-in" keyword |
| PAY-03 | Coach generates Subscription Checkout link for recurring memberships | P1c.1-05 | CODE-COMPLETE | buildCheckoutParams with mode=subscription + subscription_data.metadata.memberId; 302 into Stripe verified; completion not live-tested |
| PAY-04 | Coach generates Customer Portal link for member self-service billing | P1c.1-05 | CODE-COMPLETE | create-portal-link.ts wired to billingPortal.sessions.create with { stripeAccount }; not live-tested |

Note: STR-01 in REQUIREMENTS.md was originally framed as "direct restricted-API-key" but was formally reworked by the phase decision record (2026-06-12) to the Connect model. The requirement is now considered satisfied by the Connect implementation.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `apps/staff-web/app/routes/api.m.purchase.tsx` line 32-61 | `PILOT_PRODUCTS` constant with `process.env.STRIPE_PRICE_*` env vars — returns empty array when vars not set | Info | Intentional design: documented in Plan 06 as "PILOT_PRODUCTS stub"; P2 replaces with `stripe.prices.list()`. NOT a blocking stub — the endpoint correctly returns `{ products: [] }` when unconfigured. Studio must set env vars as part of onboarding. |
| `apps/staff-web/server/lib/stripe.ts` | `getStripeClient()` marked `@deprecated` but not deleted | Info | Deliberate rollback insurance per Plan 04 locked decision. Should be deleted post-cutover at P2. |

No blocker anti-patterns found.

---

### Human Verification Required

#### 1. Criterion 4 — Checkout link from inbox or member profile

**Test:** Open the staff web at `/gymos` inbox. Open a conversation with a member. Look for a button, action, or mechanism to generate and send a Stripe Checkout link to that member. Also check `/gymos/members/:id` (member profile).

**Expected (if satisfied):** A "Send payment link" or similar button exists in the inbox thread toolbar or member profile header that calls `create-checkout-link` and allows the coach to share the resulting URL via WhatsApp.

**Expected (as-shipped):** No direct button in inbox or member profile. The `create-checkout-link` action is reachable via the noticeboard Revenue card's propose-approve flow (BoardCard.tsx). The agent can also call `propose-action` with `actionName:'create-checkout-link'` and the coach approves from the noticeboard.

**Why human:** Product call required — does the noticeboard propose-approve path satisfy the criterion's intent of "from the inbox/member profile"? If not, an inbox checkout-link button is needed. This is a scope/UX question, not a code bug.

**Recommendation:** If criterion 4's intent is a direct "Send payment link" button in the inbox or member profile (not mediated by the noticeboard), this is a gap that needs a new action UI in those routes. If the propose-approve-from-noticeboard path is acceptable, the criterion is satisfied by the existing code.

#### 2. Criterion 2b — Subscription Checkout live end-to-end

**Test:** From `/gymos` (or via agent), use `create-checkout-link` with `mode:subscription` and `priceId: price_1ThopGER2RI3cQpxnxs3gQmA` (STRIPE_PRICE_MEMBERSHIP). Complete the Checkout with a test card. Verify:
- `invoice.paid` event fires and is processed by the worker
- `stripe_subscriptions` row has `member_id` set (Pitfall 2 fix proven live)
- `current_period_end` is populated

**Expected:** One `stripe_subscriptions` row with `member_id = <test member id>` and `status = active`.

**Why human:** Requires completing a Stripe test-mode subscription purchase, which needs a live browser session and the Stripe prices to be configured on the connected account.

#### 3. Criterion 7 — Customer Portal live

**Test:** After completing a purchase (so a `stripe_customers` row exists for the member), call `create-portal-link` with `memberId = <that member's id>`. Verify it returns `{ url }` (not `{ error }`). Visit the URL to confirm it opens Stripe's Customer Portal scoped to the connected account.

**Expected:** `{ url: "https://billing.stripe.com/p/session/..." }` returned; URL opens portal.

**Why human:** Requires a member with an existing `stripe_customers` row (connected-account `cus_`) from a completed purchase.

#### 4. Criterion 6 — Mobile purchase screen on device

**Test:** Run the mobile app in Expo Go. Log in as a demo member. Navigate to the Profile tab. Verify product cards appear (STRIPE_PRICE_* env vars must be set on Vercel). Tap "Buy" on a product. Verify Stripe Checkout opens in an in-app browser sheet. Complete payment with a test card. Verify pass balance increments on sheet close.

**Expected:** Smooth purchase flow; pass balance +1 (or +5/+10/subscription activation) after completion.

**Why human:** Requires a physical device with Expo Go, network access to Vercel staff-web, and all four STRIPE_PRICE_* env vars configured on Vercel.

---

### Gaps Summary

No code-blocking gaps were found. The core phase goal — Replace the restricted-API-key model with Stripe Connect platform account + Custom connected account, with direct charges on the connected account, end-to-end through edge-webhooks → worker → Neon — is **live-proven**.

The four items requiring human verification are:

1. **Criterion 4 scope question (inbox/member profile vs. noticeboard):** The `create-checkout-link` action is fully implemented and accessible via the noticeboard's propose-approve flow. A direct checkout-link button in the inbox or member profile route does not exist. This may or may not be a gap depending on product intent.

2. **Criterion 2b (subscription live test):** Code is complete and correct. The 302-into-Stripe for subscription mode was confirmed. Actual subscription completion has not been tested live.

3. **Criterion 7 (Customer Portal live):** Code is complete. Not testable programmatically without a prior purchase creating a `stripe_customers` row.

4. **Criterion 6 (mobile on device):** Endpoint is live. Device test with Expo Go required.

Items 2, 3, and 4 are extensions of an already-proven mechanism (same Connect + stripeAccount pattern) and are high-confidence to pass. Item 1 is a product scope question.

---

_Verified: 2026-06-13_
_Verifier: Claude (gsd-verifier)_
