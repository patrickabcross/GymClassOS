---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: 07
type: execute
wave: 3
depends_on: ["02", "03", "04", "05", "06"]
files_modified:
  - .planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-VERIFICATION.md
autonomous: false
requirements: [STR-01, STR-02, PAY-01, PAY-02, PAY-03, PAY-04]
user_setup:
  - service: stripe-platform
    why: "GymClassOS platform account with Connect enabled is the root of all connected-account onboarding + charges; it cannot be created by code"
    env_vars:
      - name: STRIPE_SECRET_KEY
        source: "Stripe Dashboard (PLATFORM account) → Developers → API keys → Secret key (sk_test_… for test-mode verification). Set as Fly secret on gymos-edge-webhooks + Vercel env on staff-web; OR store as the stripe_platform_secret_key pgcrypto secret."
      - name: STRIPE_CONNECT_WEBHOOK_SECRET
        source: "Stripe Dashboard → Developers → Webhooks → the NEW /webhooks/stripe-connect endpoint (registered with connect=true) → Signing secret (whsec_…). Set as a Fly secret on gymos-edge-webhooks."
    dashboard_config:
      - task: "Enable Connect on the platform account (Connect → Get started)"
        location: "Stripe Dashboard → Connect"
      - task: "Register a SECOND webhook endpoint POST https://<edge-webhooks-fly-host>/webhooks/stripe-connect with connect=true, subscribing to account.updated, checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted, charge.refunded"
        location: "Stripe Dashboard → Developers → Webhooks → Add endpoint"
must_haves:
  truths:
    - "The platform account is Connect-enabled and the Connect webhook endpoint + secret are live on Fly"
    - "A test-mode Account Link onboarding completes the Hustle connected account to charges_enabled && payouts_enabled"
    - "A Stripe CLI trigger of checkout.session.completed --stripe-account acct_xxx flows through the Connect endpoint → worker reducer → a single pass grant in Neon"
  artifacts:
    - path: ".planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-VERIFICATION.md"
      provides: "Live e2e verification record across the 8 success criteria"
      contains: "success criterion"
  key_links:
    - from: "Stripe Connect endpoint (live)"
      to: "worker reducer → passes/connected_accounts rows in Neon"
      via: "Stripe CLI trigger --stripe-account"
      pattern: "checkout.session.completed"
---

<objective>
Land the manual platform prerequisites (the things an executor literally cannot do) and run the live end-to-end verification. This plan gates on user-completed Stripe setup, then drives the Stripe CLI smoke tests against the live Fly edge-webhooks + worker + gymos-demo Neon to prove all 8 success criteria.

Purpose: Success criteria #1–#3 + #8 proven live (account configured + onboarded, Checkout grants on the connected account, Connect webhooks route through the idempotency spine, no card data stored). Criteria #4–#7 surface-checked.
Output: completed manual setup + P1c.1-VERIFICATION.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-RESEARCH.md

**Why a checkpoint (not executor automation):** Creating/enabling the GymClassOS PLATFORM Stripe account, enabling Connect, registering the Connect webhook endpoint, and setting the live `whsec_`/platform-key secrets are out-of-git dashboard + credential steps. An executor MUST NOT fake these (RESEARCH Open Q1 — blocking). The checkpoint pauses for the user; the executor then runs the automated Stripe CLI verification once secrets are live.

**Test-mode onboarding still requires KYC (Pitfall 5):** `charges_enabled` does NOT flip instantly in test mode. The Account Link flow must be completed with Stripe's documented test verification values (test SSN `000-00-0000`, test routing/account numbers, DOB `1901-01-01`, address `address_full_match`). Plan for one real (test) onboarding pass before Checkout will succeed.

**dahlia × Connect event shape (Open Q2):** smoke-test one of each event type via `stripe trigger ... --stripe-account acct_xxx`. If a reducer's `as any` cast doesn't cover a connected-account field shift, capture it in VERIFICATION.md as a follow-up.
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: User completes platform Stripe setup (Connect + webhook + secrets)</name>
  <what-built>Plans 01–06 shipped the code: connected_accounts table, Connect webhook endpoint (needs its secret), account-aware reducers, onboarding actions + settings UI, purchase surfaces, and the mobile 404 fix. The remaining steps are Stripe-dashboard + credential work only a human can do.</what-built>
  <action>PAUSE for the user. The executor MUST NOT fake or self-issue any Stripe platform credential, webhook registration, or onboarding completion. Present the steps below, wait for the "stripe-live" resume signal carrying the acct_ id + edge-webhooks Fly host, then proceed to Task 2.</action>
  <how-to-verify>
Complete these in the Stripe Dashboard for the GymClassOS PLATFORM account (test mode), then confirm here:

1. **Enable Connect** on the platform account (Connect → Get started). Confirm Connect is enabled.
2. **Platform key:** copy the platform Secret key (`sk_test_…`). Set it as the platform key everywhere edge-webhooks + worker + staff-web read Stripe:
   - Fly secret `STRIPE_SECRET_KEY` on `gymos-edge-webhooks`, AND
   - Vercel env `STRIPE_SECRET_KEY` on staff-web (or store as the `stripe_platform_secret_key` pgcrypto secret via Settings).
3. **Register the Connect webhook endpoint:** Developers → Webhooks → Add endpoint → URL `https://<edge-webhooks-fly-host>/webhooks/stripe-connect`, toggle **"Listen to events on Connected accounts" (connect=true)**, subscribe to: `account.updated`, `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. Copy its **Signing secret** (`whsec_…`).
4. **Set the Connect secret:** Fly secret `STRIPE_CONNECT_WEBHOOK_SECRET` on `gymos-edge-webhooks` = the signing secret from step 3.
5. **Redeploy** `gymos-edge-webhooks` (Fly) and staff-web (Vercel) so the new env + the Connect endpoint code go live.
6. From `/gymos/settings/integrations`, click **Connect Stripe** → complete the hosted Account Link onboarding using Stripe's TEST verification values (SSN `000-00-0000`, DOB `1901-01-01`, test bank routing/account, `address_full_match`). Wait for the `account.updated` webhook to flip readiness.

Reply with: the connected account id (`acct_…`), confirmation Connect is enabled, the edge-webhooks Fly host, and "secrets set + redeployed" when all six are done.
  </how-to-verify>
  <verify>User confirms via the resume signal; Task 2's Neon query then proves readiness objectively.</verify>
  <done>Connect enabled; platform key + STRIPE_CONNECT_WEBHOOK_SECRET live on Fly; Connect endpoint registered with connect=true; Hustle account onboarded; acct_ id + host supplied.</done>
  <resume-signal>Reply "stripe-live" with the acct_ id + edge-webhooks host, or describe what's blocking.</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Live Stripe CLI e2e + write VERIFICATION.md</name>
  <files>.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-VERIFICATION.md</files>
  <action>
With secrets live + the connected `acct_xxx` known, run the live smoke tests and record results in P1c.1-VERIFICATION.md against each of the 8 success criteria:

1. **Readiness (criterion #1):** Query gymos-demo Neon via MCP: `SELECT id, charges_enabled, payouts_enabled, requirements_due FROM connected_accounts;` — confirm the Hustle acct row shows `charges_enabled = true && payouts_enabled = true` (set by the account.updated reducer during onboarding). If still false, capture `requirements_due` and flag.
2. **Connect webhook + idempotency (criterion #3):** `stripe trigger account.updated --stripe-account acct_xxx` and `stripe trigger checkout.session.completed --stripe-account acct_xxx` against the live endpoint. Confirm in Neon: exactly one `webhook_events` row per event id (re-trigger the SAME event → no duplicate processing; `processed_at` set once).
3. **Checkout → pass (criteria #2, #4):** create a real test-mode Checkout via `create-checkout-link` (staff path) for a seeded member against a connected-account Product whose description contains `10-pack`; complete it with a test card (4242…); confirm exactly one `payments` row + one `passes` row (10 credits) bound to the member. Replay the event → still one pass (idempotency, criterion #2).
4. **Subscription + memberId (criterion #2/PAY-02):** complete a `mode: "subscription"` Checkout; confirm `stripe_subscriptions.member_id` is the member id (NOT empty — Pitfall 2 fix proven) and `current_period_end` set.
5. **Portal (criterion #7):** call `create-portal-link` for that member → confirm it returns a portal URL (200) on the connected account.
6. **Embed buy (criterion #5):** hit `/embed/buy?priceId=…` on the live deploy with a new email/phone → confirm a lead gym_member is upserted + a Checkout URL returned; complete it → pass bound to the lead. Clean up test rows.
7. **Mobile (criterion #6):** confirm `/api/m/purchase` returns products (non-404) on the live deploy; the Expo Go tap-to-buy walkthrough is a deferred manual check — record as such.
8. **No card data (criterion #8):** confirm only tokenised ids (`acct_`/`cus_`/`sub_`/`pi_`) are stored — grep the schema + spot-check `payments`/`stripe_*` rows hold no PANs.

Record each criterion PASS/DEFERRED/FAIL with the evidence (SQL output, curl status, Stripe event ids). Clean up all test rows created during verification. Note any dahlia × Connect event-shape follow-ups (Open Q2).
  </action>
  <verify>
    <automated>Neon MCP: SELECT charges_enabled, payouts_enabled FROM connected_accounts returns true,true; and after a triggered checkout.session.completed, COUNT(*) FROM passes WHERE member_id = '<test member>' AND granted = 10 equals 1 (and stays 1 on replay).</automated>
  </verify>
  <done>P1c.1-VERIFICATION.md records all 8 success criteria with live evidence; checkout grants exactly one pass and is replay-safe; subscription keeps memberId; test rows cleaned up.</done>
</task>

</tasks>

<verification>
- connected_accounts shows charges_enabled && payouts_enabled true for the Hustle acct.
- Stripe CLI trigger → Connect endpoint → worker reducer → exactly one pass grant; replay = no-op.
- Subscription mirror keeps member_id (Pitfall 2 proven dead).
- /api/m/purchase non-404 on live; Customer Portal URL returns 200; embed buy upserts a lead + Checkout.
- VERIFICATION.md committed with evidence per criterion.
</verification>

<success_criteria>
- All 8 ROADMAP P1c.1 success criteria proven (or explicitly DEFERRED with reason) against the live deploy.
- Idempotency spine intact for Connect events; no card data stored.
</success_criteria>

<output>
After completion, create `.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-07-SUMMARY.md`
</output>
