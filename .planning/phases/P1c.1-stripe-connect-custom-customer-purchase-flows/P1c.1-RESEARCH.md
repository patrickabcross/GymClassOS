# Phase P1c.1: Stripe Connect (Custom) + Customer Purchase Flows - Research

**Researched:** 2026-06-12
**Domain:** Stripe Connect — Custom-equivalent connected accounts (controller properties), direct charges, Account Links onboarding, Connect webhooks, Customer Portal
**Confidence:** HIGH on API shapes (verified against current Stripe docs 2026); MEDIUM on the pinned-apiVersion ↔ Connect-event-shape interaction (needs a smoke test); MEDIUM on test-mode onboarding shortcuts.

## Summary

The locked decision is "Custom connected accounts." The single most important finding of this research: **Stripe's legacy `type: "custom"` parameter and the standalone "Custom accounts" guide are now flagged DEPRECATED for new platforms.** The current (2026) way to create what we mean by "Custom" — white-label, platform collects KYC, no Stripe dashboard, platform owns onboarding — is `accounts.create` with **controller properties**, not `type`. The four controller properties below reproduce a legacy Custom account exactly:

```
controller.stripe_dashboard.type   = "none"          // white-label, studio never sees Stripe branding
controller.fees.payer              = "application"    // PLATFORM pays Stripe processing fees (see liability note §7)
controller.losses.payments         = "application"    // PLATFORM is liable for negative balances / disputes
controller.requirement_collection  = "application"    // PLATFORM owns onboarding & KYC (we drive Account Links)
```

Everything else the phase needs is standard direct-charge Connect: charges are created **on the connected account** by passing the request option `{ stripeAccount: "acct_xxx" }` as the *second argument* to every SDK call (Checkout Session create, Products, Prices, Billing Portal). Products/Prices must live **on the connected account**, not the platform. Connect events (including the connected account's own `account.updated`, `checkout.session.completed`, `invoice.paid`) arrive on a **separate Connect webhook endpoint with its own signing secret**, and every such event carries a top-level `account: "acct_xxx"` field. Our existing edge-webhooks receiver and worker reducers are 90% reusable — they need (a) a second signing secret + endpoint, (b) reading `event.account` and threading it through the queue payload, and (c) every reducer's refetch passing `{ stripeAccount }`.

**Primary recommendation:** Add a new `/webhooks/stripe-connect` route (separate `whsec_`), store the connected `acct_id` + readiness flags in a new additive table, create Products/Prices on the connected account once at onboarding, and thread `stripeAccount` through `getStripe()`-callers via the request-option (not a per-account client). Keep the existing direct-key path only as a dead fallback to delete after cutover (§8).

## User Constraints (from ROADMAP P1c.1 — no CONTEXT.md exists yet)

> No `*-CONTEXT.md` file exists in the phase dir at research time. These constraints are copied from the ROADMAP P1c.1 "Decision record (2026-06-12)" and success criteria, and carry the same authority as locked decisions.

### Locked Decisions (do NOT relitigate)
- **Account type:** Custom connected accounts (white-label — studio never sees Stripe branding). Reverses the 2026-05-17 "direct restricted-key, NOT Connect" decision.
- **Onboarding:** Stripe-hosted **Account Links** (`account_onboarding` type). Full embedded self-serve onboarding stays in backlog (999.3-adjacent).
- **Charge model:** **Direct charges on the connected account, NO application fee** (fee model deferred — must remain a one-parameter addition later).
- **Products:** packs/drop-ins (one-off) **AND** recurring membership subscriptions, **plus** Customer Portal for self-service.
- **Three purchase surfaces:** (1) staff-generated checkout link from inbox/member profile; (2) public embed buy flow (P1c widgets) keyed to lead/member by email/phone; (3) member mobile purchase screen (opens Checkout in a browser sheet).
- **Compliance:** No card data stored anywhere; tokenised IDs only (STR-08).

### Claude's Discretion (research options, recommend)
- Where to store the connected `acct_id` + readiness flags (recommend: new additive table — §Schema).
- Whether to keep the pgcrypto restricted-key path as fallback or remove it (recommend: keep dormant, delete post-cutover — §8).
- Region for any new endpoint (existing edge-webhooks is on Fly `iad`).

### Deferred Ideas (OUT OF SCOPE)
- Application/platform fee (must stay a one-param add, but no fee now).
- Embedded onboarding components (Account Links hosted flow only for now).
- `pass_products` table keyed on price/product id (P2 — reducer still keyword-matches description; §Pitfall 1).
- Multi-studio onboarding self-serve (single connected account for Hustle in this phase).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STR-01 (reworked) | Stripe integration reworked for Connect | §Account creation + §Webhooks — controller-property `accounts.create`, separate Connect endpoint |
| STR-02 | Checkout → pass grant | §Direct charges + existing `checkout-session-completed.ts` reducer (metadata.memberId contract preserved) |
| STR-08 | No card data stored; tokenised IDs only | Checkout + Portal are Stripe-hosted; we store only `acct_`/`cus_`/`sub_`/`pi_` ids — already true in schema |
| PAY-01 | Pack/drop-in purchase | `mode: "payment"` direct charge (§3) |
| PAY-02..04 | Subscriptions + Customer Portal + self-service | `mode: "subscription"` direct charge + Billing Portal on connected account (§5) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` (Node SDK) | currently **installed 19.3.1** (project doc says `^17.x` — see note) | All Connect/Checkout/Portal calls | Already the pinned dep in all three apps; `{ stripeAccount }` request-option is built-in |

**Version note (verify-before-asserting):** CLAUDE.md recommends Stripe SDK `^17.x`, but the codebase already **runs `stripe@19.3.1`** (confirmed in `services/*/src/lib/stripe.ts` comments and `apiVersion` cast). Do NOT downgrade. SDK 19.x fully supports controller-property `accounts.create`, the `{ stripeAccount }` request option, and Account Links. Keep the existing pin pattern: `apiVersion: "2026-04-22.dahlia" as Stripe.LatestApiVersion` (SDK 19.3.1 still literal-types the older `clover` version, hence the cast — already in all three files).

**No new packages required.** Stripe Connect is entirely within the existing `stripe` SDK.

## Architecture Patterns

### Recommended additions to existing structure
```
apps/staff-web/
├── server/lib/stripe.ts          # ADD: getPlatformStripe() (platform key) + helper to pass {stripeAccount}
├── actions/
│   ├── create-connect-account.ts # NEW: accounts.create (controller props) — onboarding kickoff
│   ├── create-account-link.ts    # NEW: accountLinks.create (account_onboarding)
│   └── create-checkout-link.ts   # MODIFY: pass { stripeAccount } + mode payment|subscription
│   └── create-portal-link.ts     # NEW: billingPortal.sessions.create on connected account
└── app/routes/gymos.settings.integrations.tsx  # MODIFY: "Connect Stripe" button → Account Link; show readiness
services/edge-webhooks/
└── src/routes/stripe-connect.ts  # NEW: SEPARATE endpoint, separate whsec_, reads event.account
services/worker/
└── src/domain/stripeReducers/*   # MODIFY: thread stripeAccount into every stripe.X.retrieve()
                                  # + NEW account-updated.ts reducer (readiness flags)
```

### Pattern 1: Create the Custom-equivalent connected account (controller properties)
**What:** White-label, platform-managed, GB studio.
**When:** Once per studio, at onboarding kickoff from `/gymos/settings`.
```javascript
// Source: https://docs.stripe.com/connect/migrate-to-controller-properties
//         https://docs.stripe.com/api/accounts/create
const platform = new Stripe(PLATFORM_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });

const account = await platform.accounts.create({
  controller: {
    stripe_dashboard: { type: "none" },        // white-label
    fees: { payer: "application" },            // platform pays Stripe fees (see §7 liability)
    losses: { payments: "application" },       // platform liable for negative balances
    requirement_collection: "application",     // platform owns KYC; we drive Account Links
  },
  country: "GB",                               // UK studio
  capabilities: {
    card_payments: { requested: true },
    transfers:     { requested: true },        // required even for pure direct charges
  },
  // business_type / email optional; can be prefilled, or collected by Account Links
});
// → account.id is "acct_xxx" — STORE THIS server-side (new table, §Schema)
```
> `type: "custom"` is the LEGACY form and is deprecated for new platforms. Use controller properties. The combination above is byte-for-byte equivalent to a legacy Custom account.

### Pattern 2: Account Links (Stripe-hosted onboarding)
```javascript
// Source: https://docs.stripe.com/api/account_links/create
const link = await platform.accountLinks.create({
  account: account.id,                         // "acct_xxx"
  type: "account_onboarding",
  refresh_url: "https://gym-class-os.vercel.app/gymos/settings/integrations?stripe=refresh",
  return_url:  "https://gym-class-os.vercel.app/gymos/settings/integrations?stripe=return",
});
// Redirect the studio owner to link.url. It is single-use + short-lived:
// on "refresh" (expired/abandoned) generate a NEW link and redirect again.
```
**Critical:** `return_url` does NOT mean onboarding is complete — it only means the user came back. Readiness is determined by webhook (Pattern 3), never by the return.

### Pattern 3: Track readiness via `account.updated` (Connect webhook)
The connected account's `account.updated` events arrive on the **Connect** webhook endpoint (§Connect webhooks below), carrying `event.account`. Read these fields off `event.data.object` (a `Stripe.Account`):
- `charges_enabled` (boolean) — can accept charges
- `payouts_enabled` (boolean) — can receive payouts
- `requirements.currently_due` (string[]) — outstanding KYC; non-empty = not done
- `requirements.disabled_reason` (string|null) — why charges are blocked

Persist these to the new table on every `account.updated`. Success criterion #1 ("`charges_enabled && payouts_enabled`") is satisfied when both flags flip true and `currently_due` is empty.

### Pattern 4: Direct charge — one-off pack/drop-in
```javascript
// Source: https://docs.stripe.com/connect/direct-charges
const session = await platform.checkout.sessions.create(
  {
    mode: "payment",
    line_items: [{ price: "price_xxx", quantity: 1 }], // price lives ON the connected account
    metadata: { memberId },                            // PRESERVE — reducer contract (Pitfall 1)
    success_url: "https://gym-class-os.vercel.app/gymos/members/" + memberId + "?checkout=success",
    cancel_url:  "https://gym-class-os.vercel.app/gymos/members/" + memberId + "?checkout=cancelled",
    // NO application_fee_amount → omit payment_intent_data entirely (decision: no fee)
  },
  { stripeAccount: "acct_xxx" },                        // ← request option, 2nd arg = direct charge
);
```

### Pattern 5: Direct charge — subscription membership
```javascript
// Source: https://docs.stripe.com/connect/direct-charges (mode=subscription)
const session = await platform.checkout.sessions.create(
  {
    mode: "subscription",
    line_items: [{ price: "price_recurring_xxx", quantity: 1 }], // recurring price on connected acct
    metadata: { memberId },          // session metadata
    subscription_data: {
      metadata: { memberId },        // ALSO on subscription_data so sub.metadata.memberId survives
      // NO application_fee_percent → omit (decision: no fee)
    },
    success_url: "...?checkout=success",
    cancel_url:  "...?checkout=cancelled",
  },
  { stripeAccount: "acct_xxx" },
);
```
> **Gotcha:** for subscriptions the existing `invoice-paid.ts` reducer reads `sub.metadata?.memberId`. The Checkout `metadata` lives on the *session*, not automatically on the *subscription*. You MUST also set `subscription_data.metadata.memberId` or the subscription mirror row will have `memberId = ""` (see the current `invoice-paid.ts` line 48 fallback `?? ""`). This is a real bug waiting to happen.

### Anti-Patterns to Avoid
- **One `new Stripe()` client per connected account.** Don't. Use ONE platform client + the `{ stripeAccount }` request option per call. Per-account clients leak memory and lose the platform-key context.
- **Creating Products/Prices on the platform account.** For direct charges, Checkout reads prices from the **connected** account. A `price_xxx` created on the platform will 404 when the session is created with `{ stripeAccount }`.
- **Trusting `return_url` as "onboarding complete."** Only `account.updated` → `charges_enabled` is authoritative.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KYC / identity onboarding UI | Custom forms collecting passport/bank | Account Links (`account_onboarding`) | Stripe owns the regulatory surface; building it = PCI/KYC liability |
| Webhook signature verify | Manual HMAC | `stripe.webhooks.constructEvent(raw, sig, whsec)` | Already correct in `edge-webhooks/src/routes/stripe.ts`; reuse verbatim with the Connect secret |
| Subscription self-service (cancel/update card) | Custom billing UI | Billing Portal (`billingPortal.sessions.create` w/ `{ stripeAccount }`) | Stripe-hosted, PCI-safe, decision-locked |
| Idempotent event processing | New dedup logic | Existing `webhook_events (provider, external_id)` UNIQUE + `processed_at` spine | Already battle-tested in `stripe-event.ts` |

**Key insight:** This phase is mostly *re-pointing* the existing, working webhook/reducer spine at a connected account, not building new infrastructure.

## Connect Webhooks — what changes

The existing `services/edge-webhooks/src/routes/stripe.ts` handles **platform-account** events. Connect requires a **second, separate endpoint with its own signing secret**.

| Aspect | Platform endpoint (existing) | Connect endpoint (NEW) |
|--------|------------------------------|------------------------|
| Route | `POST /webhooks/stripe` | `POST /webhooks/stripe-connect` |
| Signing secret | `STRIPE_WEBHOOK_SECRET` | **NEW** `STRIPE_CONNECT_WEBHOOK_SECRET` (different `whsec_`) |
| `connect` flag at registration | `false` | `true` |
| Event shape | no `account` field | **top-level `event.account = "acct_xxx"`** |
| Events received | platform's own | every connected account's `account.updated`, `checkout.session.completed`, `invoice.paid/payment_failed`, `customer.subscription.*`, `charge.refunded` |

**Receiver change (mirror existing route exactly, swap the secret):**
```javascript
// Source: https://docs.stripe.com/connect/webhooks
const raw = await c.req.text();                              // raw body first (PITFALL #9)
let event;
try {
  event = getStripe().webhooks.constructEvent(
    raw, sigHeader, env.STRIPE_CONNECT_WEBHOOK_SECRET,       // ← Connect secret
  );
} catch { return c.text("invalid signature", 400); }

const connectedAccountId = event.account;                    // "acct_xxx" — non-null on Connect endpoint
// idempotency insert (provider:"stripe", external_id: event.id) — SAME as today
// enqueue: ADD account to the payload → { eventId, stripeAccount: connectedAccountId }
```

**Queue payload change:** `StripeEventPayload` in `@gymos/queue` currently carries `{ eventId }`. Add `stripeAccount?: string`. (Additive, optional — platform events leave it undefined.)

**Worker / reducer change — trust the API not the payload, account-scoped:** every reducer refetch must pass `{ stripeAccount }`:
```javascript
// checkout-session-completed.ts — was:
//   stripe.checkout.sessions.retrieve(session.id, { expand: [...] })
// must become:
stripe.checkout.sessions.retrieve(session.id, { expand: [...] }, { stripeAccount });
// Same for stripe.invoices.retrieve(...), stripe.subscriptions.retrieve(...),
// stripe.charges/refunds in charge-refunded.ts.
```
Without `{ stripeAccount }` the retrieve runs against the *platform* account and 404s (the object lives on the connected account). The `stripeAccount` comes from the queue payload (`event.account`), threaded from `stripe-event.ts` → reducer signature `(event, tx, stripe, stripeAccount)`.

**NEW reducer:** `account-updated.ts` → on `account.updated`, upsert readiness flags (`charges_enabled`, `payouts_enabled`, `requirements.currently_due`) into the connected-accounts table.

## Customer Portal on a connected account

```javascript
// Source: https://docs.stripe.com/api/customer_portal/sessions/create
const portal = await platform.billingPortal.sessions.create(
  {
    customer: "cus_xxx",                          // customer lives on the connected account
    return_url: "https://gym-class-os.vercel.app/gymos/members/" + memberId,
    // configuration: "bpc_xxx"  // optional; omit to use the connected account's DEFAULT config
  },
  { stripeAccount: "acct_xxx" },
);
// redirect member to portal.url
```
**Portal configuration requirement:** the connected account needs a Customer Portal **configuration** (what the customer can manage — cancel sub, update card, switch plan). The connected account's *default* configuration works out of the box; if you want to lock features you create a `billingPortal.configurations.create(..., { stripeAccount })` and pass its id. For v1, rely on the default config. The `customer` id must be a customer **on the connected account** (created during direct-charge Checkout), not a platform customer.

## SDK ^17.x / 19.x specifics

- **Request option, not per-client:** `{ stripeAccount: "acct_xxx" }` is the standard way to scope ANY call to a connected account (`accounts.*`, `accountLinks.*`, `checkout.sessions.*`, `billingPortal.*`, `products.*`, `prices.*`, all `.retrieve()`). It sets the `Stripe-Account` HTTP header. This is the request-options object — for `.create()` it's the 2nd arg; for `.retrieve(id, params, opts)` it's the 3rd arg.
- **`apiVersion` pinning unchanged:** keep `"2026-04-22.dahlia" as Stripe.LatestApiVersion`. Same pin across platform + connected calls.
- **`webhooks.constructEvent` unchanged:** same signature; only the secret differs per endpoint.
- **`accounts.create` with `controller`** is supported in 19.x (the deprecated thing is `type: "custom"`, not the SDK method).

## Runtime State Inventory

> P1c.1 is partly a config/credential migration (direct restricted key → platform key + connected account). Inventory of runtime state that a code edit alone won't fix:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (secrets table) | `secrets.name = 'stripe_restricted_key'` (pgcrypto-encrypted) — read by `apps/staff-web/server/lib/stripe.ts` + `services/worker/src/lib/secrets.ts getStripeSecretKey`. This is the **studio's own restricted key**, the model being replaced. | Add NEW secret rows: `stripe_platform_secret_key` (the GymClassOS PLATFORM key) and store the connected `acct_id` (in a table, not secrets). Keep `stripe_restricted_key` reader dormant as fallback, delete post-cutover (§8). |
| Stored data (DB ids) | `stripe_customers.stripe_customer_id`, `stripe_subscriptions.stripe_subscription_id`, `payments.stripe_payment_intent_id` — all are platform-scoped today (created under the studio's own key). | Under Connect these become **connected-account-scoped** ids. Existing rows from the direct-key era (if any real ones exist — demo only) are now orphaned. Hustle has no real production payments yet (P1c-07 Checkout was DEFERRED — see STATE), so **no data migration needed**; new ids are born under the connected account. Verify no live payments exist before cutover. |
| Live service config (Fly/Vercel env) | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` set as Fly secrets on `gymos-edge-webhooks` and on staff-web Vercel env. | ADD `STRIPE_CONNECT_WEBHOOK_SECRET` (Fly) + ensure the platform key is the value used. The platform key replaces the studio restricted key. |
| Live service config (Stripe Dashboard) | Webhook endpoints registered in Stripe Dashboard for `/webhooks/stripe`. | Register a SECOND endpoint `/webhooks/stripe-connect` with `connect=true`; copy its `whsec_` into the new env var. |
| OS-registered state | None — no Task Scheduler / launchd / pm2 entries reference Stripe. | None — verified by absence in STATE.md ops notes. |
| Build artifacts | None Stripe-specific. | None. |

**The canonical question — after every file is updated, what still holds the old model?** The Stripe Dashboard webhook registration (needs a second endpoint) and the Fly/Vercel env vars (need the platform key + new Connect secret). Both are out-of-git config the planner must call out as manual steps.

## Common Pitfalls

### Pitfall 1: Reducer pass-credit keyword matching across a connected account
**What goes wrong:** `passCreditsForLineItem()` in `checkout-session-completed.ts` grants 0 credits unless the Product **description** contains `10-pack`/`5-pack`/`drop-in`/`1-class`. Products now live on the **connected account** — if the studio creates a "10 Class Pass" product without those keywords, payment records but NO pass grants, silently.
**How to avoid:** When the platform programmatically creates the studio's Products at onboarding, set the description keyword. Document the keyword contract in `/gymos/settings`. (P2 replaces this with a `pass_products` table — out of scope now.)
**Warning signs:** `payments` row exists, no matching `passes` row.

### Pitfall 2: Subscription `memberId` lost (metadata only on session, not subscription)
**What goes wrong:** `invoice-paid.ts` reads `sub.metadata?.memberId ?? ""`. Checkout `metadata` does NOT propagate to the subscription object. Result: subscription mirror row with empty `memberId`.
**How to avoid:** Set `subscription_data.metadata.memberId` in the Checkout Session (Pattern 5).
**Warning signs:** `stripe_subscriptions.member_id = ''`.

### Pitfall 3: Refetch without `{ stripeAccount }` 404s
**What goes wrong:** every reducer's `stripe.X.retrieve(...)` runs against the platform; the object lives on the connected account → `No such ...` error → job retries forever.
**How to avoid:** thread `event.account` through the queue payload to every retrieve. (See §Connect webhooks.)
**Warning signs:** worker logs `StripeInvalidRequestError: No such checkout.session`.

### Pitfall 4: Wrong webhook endpoint / mixed secrets
**What goes wrong:** Connect events sent to the platform endpoint fail signature verification (wrong `whsec_`), OR the platform-account events get the `account`-field handling. Easy to register the new endpoint with `connect=false`.
**How to avoid:** Two distinct endpoints, two distinct `whsec_` env vars, register the Connect one with `connect=true`. Branch on `event.account` presence.

### Pitfall 5: Test-mode Custom onboarding still requires KYC
**What goes wrong:** Expecting `charges_enabled` to flip instantly in test mode. It does NOT — KYC requirements are enforced in test to mirror production.
**How to avoid:** In test mode, complete the Account Link flow with Stripe's **test verification values** (e.g. test SSN `000-00-0000`, test routing/account numbers, address `address_full_match`, DOB `1901-01-01` triggers success states). Use the documented [test verification tokens / values](https://docs.stripe.com/connect/testing-verification) and [Connect test data](https://docs.stripe.com/connect/testing). Plan for a real (test) onboarding pass before expecting Checkout to succeed.
**Warning signs:** `requirements.currently_due` never empties; `charges_enabled` stays false.

### Pitfall 6: `success_url` / origin
**What goes wrong:** Checkout `success_url`/`cancel_url` pointing at a stale origin or a route behind auth.
**How to avoid:** Use `https://gym-class-os.vercel.app/...` (the live deploy — local dev cannot boot, per STATE constraint) and ensure the success/cancel routes are in `auth.ts publicPaths` if the buyer is anonymous (public embed flow).

### Pitfall 7: Platform pays Stripe fees with `fees.payer = "application"`
**What goes wrong:** `controller.fees.payer = "application"` (required for Custom equivalence) means **the PLATFORM (GymClassOS) pays Stripe's processing fees**, not the studio — and with NO application fee, GymClassOS eats those fees with zero revenue offset.
**How to avoid:** This is a business decision, flag it explicitly. It is *correct* for "Custom + no app fee" but financially it means GymClassOS subsidises the studio's Stripe fees until a fee is added. Alternative: `fees.payer = "account"` makes the connected account pay fees — but that is NOT classic Custom and changes the liability model. Keep `application` to honour the locked "Custom" decision; just surface the cost. (See §State of the Art for the fee-payer table.)

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| `accounts.create({ type: "custom" })` | `accounts.create({ controller: {...} })` | Accounts v2 / controller-properties migration | The "Custom accounts" guide is marked **Deprecated for new platforms**; use controller properties (same behaviour) |
| Account-type mental model (Standard/Express/Custom) | Controller-property mental model (who pays fees / bears losses / collects requirements / dashboard access) | 2024→2026 rollout | Our "Custom" = the 4-property combo in Pattern 1 |
| `fees.payer = account` implicit (legacy Custom) | Explicit `controller.fees.payer` | controller migration | We set `application` → platform pays fees (Pitfall 7) |

**Deprecated/outdated:**
- The standalone `https://docs.stripe.com/connect/custom-accounts` page — Stripe now redirects new platforms to the [Accounts v2 / interactive platform guide](https://docs.stripe.com/connect/accounts-v2). Controller properties are the path; `type: "custom"` still works but is legacy.

## Open Questions

1. **Does the GymClassOS platform Stripe account exist + Connect enabled?**
   - What we know: success criterion #1 requires "platform Stripe account configured." The codebase only has a studio *restricted* key today.
   - What's unclear: whether a platform account with Connect enabled exists, and whether it's the same Stripe account or a new one.
   - Recommendation: **Wave 0 / customer-task** — create/confirm the platform account, enable Connect, generate a `sk_test_` platform key, store as `stripe_platform_secret_key` secret. Blocking.

2. **`apiVersion` pin × Connect event shapes (dahlia).** The reducers already cast `invoice.subscription`/`payment_intent` to `any` because the dahlia API moved fields. Connect events under the same pin should match, but this is unverified for connected-account `account.updated`.
   - Recommendation: smoke-test one of each event type via Stripe CLI `stripe trigger ... --stripe-account acct_xxx` against the live edge-webhooks before trusting the reducers.

3. **Mobile `/api/m/*` 404 prerequisite (success criterion #6).** The member purchase screen depends on fixing the Vercel `/api/m/*` 404 first. Root cause not in this research scope.
   - Recommendation: treat as a separate blocking task (likely the same `[...page].post.ts` / catch-all routing class of bug already fixed for `/gymos`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Stripe Node SDK | all Connect calls | ✓ | 19.3.1 (installed) | — |
| Stripe CLI | local/test webhook + `stripe trigger --stripe-account` | unknown (used in earlier phases) | — | Dashboard "Send test event" |
| Platform Stripe account w/ Connect enabled | account creation, all charges | ✗ (not confirmed) | — | **none — blocking** (Open Q1) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect endpoint verify | ✗ (to be created) | — | none — created at endpoint registration |
| Fly `gymos-edge-webhooks` | hosting both webhook endpoints | ✓ (deployed, healthy) | — | — |

**Missing dependencies with no fallback:** Platform Stripe account with Connect enabled (customer/owner task — see Open Q1).

## Migration Notes (existing direct-key path)

- **`getStripeClient()` / `getStripe(db)` / `getStripeSecretKey`** today resolve `stripe_restricted_key` from the secrets table (pgcrypto) → env fallback. Under Connect:
  - Add a **platform key resolver** (`stripe_platform_secret_key` secret → `STRIPE_SECRET_KEY` env). This is the key used to construct the single `Stripe` client.
  - The per-call connected-account scoping is the `{ stripeAccount }` request option, NOT a different key.
  - **Recommendation:** keep the `stripe_restricted_key` read path **dormant** (don't delete in this phase) so a rollback is one config change; mark it `@deprecated` and schedule deletion after Hustle is live on Connect and one real payment has settled. Low risk to keep; high risk to delete prematurely.
- **`/gymos/payments.tsx` stub** (D1-03 DEFERRED, never shipped) and `gymos.settings.integrations.tsx` (restricted-key entry UI): the settings page's "enter your Stripe restricted key" UX is **replaced** by a "Connect Stripe" button that kicks off `create-connect-account` → `create-account-link` → redirect, and shows readiness (`charges_enabled`/`payouts_enabled`/`currently_due`) from the new table. Keep the key-entry input only behind a dev/fallback flag.

## Schema (additive — strictly, per CLAUDE.md "no breaking DB changes")

New table to hold the connected account + readiness (Drizzle, applied direct-to-Neon via MCP per the 0001–0005 pattern — `db.ts` does NOT auto-run gymos migrations):
```
connected_accounts (
  id                  text primary key,        -- "acct_xxx"
  studio_label        text,                    -- single-tenant: 'hustle' for now (NOT studio_id scoping)
  charges_enabled     boolean not null default false,
  payouts_enabled     boolean not null default false,
  requirements_due    text,                    -- JSON array of currently_due
  disabled_reason     text,
  raw_json            text not null,
  created_at          text not null default now(),
  updated_at          text not null default now()
)
```
> Single-tenant rule preserved: no `studio_id` FK scoping; `studio_label` is descriptive only, one row expected. `stripe_customers`/`stripe_subscriptions`/`payments` need NO schema change (their ids are now connected-account-scoped values; columns unchanged).

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **PCI:** Card data never stored; tokenised ids only. Checkout + Portal are Stripe-hosted → compliant. ✓
- **Idempotent Stripe webhooks:** preserve the `webhook_events (provider, external_id)` UNIQUE + `processed_at` single-transaction spine. The Connect endpoint reuses it verbatim.
- **Stripe SDK pinned `apiVersion`:** keep `"2026-04-22.dahlia"` cast; never float.
- **No breaking DB changes:** new `connected_accounts` table is additive; no rename/drop. Apply direct-to-Neon-via-MCP (not `runMigrations`, not `drizzle-kit push`).
- **Single-tenant:** no `studio_id` columns; one connected account for now.
- **staff-web MUST NOT import `@gymos/whatsapp`** — unaffected (Stripe is separate), but note booking-confirmation WhatsApp still routes through the worker chokepoint.
- **Actions-first:** new Stripe operations are `defineAction` (HTTP POST), not bespoke `/api/` routes, except the webhook receiver (correctly a Hono route on edge-webhooks).
- **Verification constraint:** local `agent-native dev` cannot boot — verify by replaying SQL against `gymos-demo` Neon via MCP and/or Stripe CLI triggers against the live Fly edge-webhooks; no local HTTP walkthrough.

## Validation Architecture

> `.planning/config.json` not read for an explicit `nyquist_validation:false`; treating as enabled. Test infra: **Vitest** (worker tests are green — `79/79` per STATE; `services/worker` has the established reducer test pattern).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing in `services/worker`, `services/edge-webhooks`) |
| Quick run command | `pnpm --filter @gymos/worker test` (and `--filter edge-webhooks`) |
| Full suite | `pnpm -r test` (or per-package) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Command | File Exists? |
|-----|----------|-----------|---------|--------------|
| STR-01 | account.updated readiness reducer | unit | `pnpm --filter @gymos/worker test account-updated` | ❌ Wave 0 (new reducer) |
| STR-02/PAY-01 | checkout.session.completed grants pass (account-scoped) | unit (extend existing) | `pnpm --filter @gymos/worker test checkout-session-completed` | ✅ extend (add `{stripeAccount}` assertion) |
| PAY-02 | invoice.paid sub mirror w/ memberId | unit (extend) | `pnpm --filter @gymos/worker test invoice-paid` | ✅ extend (subscription_data.metadata path) |
| STR-01 | Connect endpoint verifies w/ Connect secret + reads event.account | unit | `pnpm --filter edge-webhooks test stripe-connect` | ❌ Wave 0 |
| e2e | trigger → enqueue → reduce → pass row | integration (Stripe CLI) | `stripe trigger checkout.session.completed --stripe-account acct_xxx` against live Fly | manual/deferred (local can't boot) |

### Wave 0 Gaps
- [ ] `services/worker/src/domain/stripeReducers/account-updated.ts` + test — STR-01 readiness
- [ ] `services/edge-webhooks/src/routes/stripe-connect.ts` + test — Connect endpoint + event.account
- [ ] Thread `stripeAccount` through `StripeEventPayload`, `stripe-event.ts`, and every reducer signature — extend existing tests to assert the `{ stripeAccount }` request option is passed to each `retrieve`.
- [ ] `connected_accounts` migration (direct-to-Neon via MCP)

## Sources

### Primary (HIGH confidence)
- https://docs.stripe.com/connect/migrate-to-controller-properties — controller-property values for Custom equivalence (verified via WebFetch)
- https://docs.stripe.com/connect/direct-charges — `{ stripeAccount }` request option, mode payment/subscription, prices on connected account (verified)
- https://docs.stripe.com/connect/webhooks — separate Connect endpoint, own secret, `event.account` field, `account.updated` on Connect endpoint (verified)
- https://docs.stripe.com/api/accounts/create — `accounts.create` params, capabilities
- https://docs.stripe.com/api/account_links/create — Account Links `account_onboarding`, refresh/return urls
- https://docs.stripe.com/api/customer_portal/sessions/create — billing portal session, connected-account support
- https://docs.stripe.com/connect/account-capabilities — card_payments / transfers requested
- https://docs.stripe.com/connect/accounts-v2 — the v2 model the legacy Custom guide now redirects to

### Secondary (MEDIUM confidence)
- https://docs.stripe.com/connect/testing-verification + https://docs.stripe.com/connect/testing — test KYC values (read via search snippets; verify exact tokens at plan time)
- https://docs.stripe.com/connect/direct-charges-fee-payer-behavior — fees.payer = application means platform pays Stripe fees (Pitfall 7)

### Tertiary (LOW confidence)
- Codebase comments asserting `apiVersion "2026-04-22.dahlia"` runtime behaviour under Connect — unverified for connected-account event shapes (Open Q2).

## Metadata

**Confidence breakdown:**
- API call shapes (account create, account link, checkout, portal, webhook): HIGH — directly verified against current Stripe docs.
- Controller-property = Custom equivalence: HIGH — explicit in the migration doc.
- Test-mode onboarding shortcuts: MEDIUM — KYC still enforced in test; exact test tokens need confirming at plan time.
- dahlia apiVersion × Connect event shapes: MEDIUM — works for platform events today; smoke-test for connected events.
- Whether the platform Stripe account exists: LOW — assumed not; flagged blocking.

**Research date:** 2026-06-12
**Valid until:** ~2026-07-12 (Stripe Connect API is stable, but the Accounts v2 rollout is active — re-check the controller-property page if planning slips past mid-July).
