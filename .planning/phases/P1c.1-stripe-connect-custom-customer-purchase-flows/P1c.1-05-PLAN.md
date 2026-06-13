---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: 05
type: execute
wave: 2
depends_on: ["04"]
files_modified:
  - apps/staff-web/actions/create-checkout-link.ts
  - apps/staff-web/actions/create-portal-link.ts
  - apps/staff-web/app/routes/embed.buy.tsx
  - apps/staff-web/server/plugins/auth.ts
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [STR-02, PAY-01, PAY-02, PAY-03, PAY-04]
must_haves:
  truths:
    - "create-checkout-link creates the session ON the connected account, supports mode payment AND subscription, and sets subscription_data.metadata.memberId so the subscription mirror keeps the member link"
    - "create-portal-link opens a Stripe Customer Portal session on the connected account for subscription self-service"
    - "A public embed buy flow links a Checkout to a lead/member by email/phone and is reachable without auth"
  artifacts:
    - path: "apps/staff-web/actions/create-checkout-link.ts"
      provides: "Connect-scoped Checkout for packs + subscriptions"
      contains: "stripeAccount"
    - path: "apps/staff-web/actions/create-portal-link.ts"
      provides: "billingPortal.sessions.create on connected account"
      contains: "billingPortal"
    - path: "apps/staff-web/app/routes/embed.buy.tsx"
      provides: "Public buy flow keyed to lead/member"
      contains: "create-checkout-link|createCheckout"
  key_links:
    - from: "apps/staff-web/actions/create-checkout-link.ts"
      to: "stripe.checkout.sessions.create"
      via: "second-arg request option { stripeAccount }"
      pattern: "stripeAccount"
    - from: "apps/staff-web/actions/create-checkout-link.ts"
      to: "subscription_data.metadata.memberId"
      via: "subscription mode propagation (Pitfall 2)"
      pattern: "subscription_data"
---

<objective>
Build the staff + public purchase surfaces on the connected account: rework `create-checkout-link` to create direct charges ON the connected account (`{ stripeAccount }`) supporting both one-off packs/drop-ins (`mode: "payment"`) AND subscription memberships (`mode: "subscription"` with `subscription_data.metadata.memberId` — Pitfall 2 fix); add `create-portal-link` for Customer Portal self-service; and ship the public `/embed/buy` flow keyed to a lead/member by email/phone.

Purpose: Success criteria #2 (Checkout on connected account → pass/subscription via reducers), #4 (staff checkout link — the action behind it), #5 (public embed buy keyed to lead/member by email/phone), #7 (Customer Portal). Surface #6 (mobile) is Plan 06.
Output: reworked create-checkout-link + new create-portal-link + embed buy route.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-RESEARCH.md
@apps/staff-web/actions/create-checkout-link.ts
@apps/staff-web/AGENTS.md

<interfaces>
<!-- getPlatformStripe() + readConnectedAccount() from Plan 04 (server/lib/stripe.ts, server/lib/connected-account.ts) -->
<!-- create-checkout-link TODAY uses getStripeClient() (restricted) + mode payment only + metadata.memberId.
     It is invoked via approve-proposal AND directly from staff UI / embed. -->
```typescript
// Direct charge — pack (RESEARCH Pattern 4):
await platform.checkout.sessions.create(
  { mode: "payment", line_items: [{ price, quantity: 1 }], metadata: { memberId },
    success_url, cancel_url },          // NO application_fee (decision)
  { stripeAccount },                    // ← 2nd arg = direct charge on connected account
);
// Direct charge — subscription (RESEARCH Pattern 5):
await platform.checkout.sessions.create(
  { mode: "subscription", line_items: [{ price: recurringPrice, quantity: 1 }],
    metadata: { memberId },
    subscription_data: { metadata: { memberId } },   // ← Pitfall 2: also on the subscription
    success_url, cancel_url },
  { stripeAccount },
);
// Customer Portal (RESEARCH §Portal):
await platform.billingPortal.sessions.create(
  { customer: cusId, return_url },
  { stripeAccount },
);
```
<!-- P1c public-route plumbing: auth.ts publicPaths + 00-public-cors.ts own all /embed CORS.
     This plan adds /embed/buy to publicPaths ONLY (00-public-cors.ts already covers /embed prefix). -->
</interfaces>

**Locked decisions:** direct charges, NO application fee (omit all `application_fee_*` params). Prices live ON the connected account (anti-pattern: platform-account prices 404 under `{ stripeAccount }`). The pack-keyword contract (Product description must contain `10-pack`/`5-pack`/`drop-in`/`1-class`) is unchanged — reducer still keyword-matches (Pitfall 1; `pass_products` deferred to P2).

**Reducer contract preserved:** `metadata.memberId` is load-bearing for the P1b-07 checkout reducer; for subscriptions ALSO set `subscription_data.metadata.memberId` (the invoice-paid reducer reads `sub.metadata?.memberId`). Both must be set in subscription mode.

**Public buy flow keying (success criterion #5):** the embed buyer is anonymous. Key the Checkout to a lead/member by email/phone using the SAME lead-upsert discipline already in `apps/staff-web/features/forms/.../submissions.ts` (P1c-02): upsert gym_members by email/phone, re-SELECT canonical id, pass that memberId into create-checkout-link's metadata. Do NOT invent a new upsert path — reuse the lead-upsert helper or mirror its FK-safe re-select pattern.

**Verification constraint:** local dev can't boot. Verify by unit-asserting Stripe SDK call args (mock getPlatformStripe) + replaying lead-upsert SQL against gymos-demo Neon (cleanup rows). Live Checkout completion is Plan 07's Stripe-CLI e2e.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rework create-checkout-link for Connect + subscription mode</name>
  <files>apps/staff-web/actions/create-checkout-link.ts, apps/staff-web/AGENTS.md</files>
  <behavior>
    - Test: with `mode: "payment"` (default), the session is created with `{ stripeAccount: <acct from readConnectedAccount> }` as the 2nd arg, metadata.memberId set, no subscription_data, no application_fee_* fields.
    - Test: with `mode: "subscription"`, the session sets `mode: "subscription"`, `subscription_data.metadata.memberId === memberId` AND `metadata.memberId === memberId` (Pitfall 2), `{ stripeAccount }` 2nd arg.
    - Test: if `readConnectedAccount()` returns null OR `chargesEnabled === false`, the action throws/returns a clear "Stripe not connected — finish onboarding in Settings" error (do NOT create a session against the platform).
  </behavior>
  <action>
Rewrite `create-checkout-link.ts`:
- Switch the client from `getStripeClient()` to `getPlatformStripe()` (Plan 04).
- Read `const acct = await readConnectedAccount();` — if `!acct || !acct.chargesEnabled` throw the "not connected" error.
- Add a `mode: z.enum(["payment", "subscription"]).default("payment")` schema field.
- Build session params per the mode (see interfaces). ALWAYS set top-level `metadata: { memberId }`; in subscription mode ALSO set `subscription_data: { metadata: { memberId } }`.
- Pass `{ stripeAccount: acct.id }` as the SECOND arg to `checkout.sessions.create`.
- NO `application_fee_amount` / `application_fee_percent` (decision: no fee). Add a comment noting where the single fee parameter would later be added.
- Keep `success_url`/`cancel_url` on `BASE = STAFF_WEB_URL ?? https://gym-class-os.vercel.app`.
- Preserve the existing return shape `{ url, sessionId, productName }`; add `mode` to the return.
- Update the create-checkout-link description + the Stripe Product-keyword note in `apps/staff-web/AGENTS.md` to mention subscription support + the connected-account scoping.
Add tests in a sibling `create-checkout-link.test.ts` (mock getPlatformStripe + readConnectedAccount) — if no test infra exists for staff-web actions, add a minimal Vitest config note OR assert via the worker/edge pattern; if staff-web has no Vitest, set `<automated>MISSING — assert SDK call args by a focused vitest in apps/staff-web; if absent, replay lead-upsert SQL against Neon and inspect the action by reading</automated>` and verify by tsc + manual SDK-arg read. (Prefer adding a real unit test if staff-web has Vitest; check package.json scripts first.)
  </action>
  <verify>
    <automated>pnpm --filter staff-web exec tsc --noEmit -p tsconfig.json 2>&1 | rg -i "create-checkout-link" ; echo "typecheck-scan-done"</automated>
  </verify>
  <done>create-checkout-link creates sessions on the connected account, supports both modes, sets subscription_data.metadata.memberId, guards on readiness, no fee params.</done>
</task>

<task type="auto">
  <name>Task 2: create-portal-link action (Customer Portal on connected account)</name>
  <files>apps/staff-web/actions/create-portal-link.ts</files>
  <action>
New `defineAction` (POST, schema `{ memberId: z.string().min(1) }`):
- Read `const acct = await readConnectedAccount()`; guard `!acct?.chargesEnabled` → "Stripe not connected" error.
- Resolve the member's `cus_` id: `SELECT stripe_customer_id FROM stripe_customers WHERE member_id = ${memberId} LIMIT 1` via getDb raw execute (`// guard:allow-unscoped — single-tenant`). If none, return `{ error: "Member has no Stripe customer yet — they must complete a purchase first" }`.
- `const portal = await getPlatformStripe().billingPortal.sessions.create({ customer: cusId, return_url: BASE+"/gymos/members/"+memberId }, { stripeAccount: acct.id })`. Omit `configuration` (use the connected account's default portal config — RESEARCH §Portal).
- Return `{ url: portal.url }`.
- Document in AGENTS.md as a staff-invoked action (member self-service redirect). NOT an agent tool.
  </action>
  <verify>
    <automated>pnpm --filter staff-web exec tsc --noEmit -p tsconfig.json 2>&1 | rg -i "create-portal-link" ; echo "typecheck-scan-done"</automated>
  </verify>
  <done>create-portal-link opens a Customer Portal session on the connected account, scoped to the member's connected-account customer id; guards readiness + missing customer.</done>
</task>

<task type="auto">
  <name>Task 3: Public /embed/buy flow keyed to lead/member by email/phone</name>
  <files>apps/staff-web/app/routes/embed.buy.tsx, apps/staff-web/server/plugins/auth.ts</files>
  <action>
Create the SSR public route `/embed/buy` (mirror the existing `/embed/schedule` widget conventions from P1c-05 — themeable via URL params, no auth gate). Flow:
- Visitor lands with a `priceId` (and optional `occurrenceId`) URL param + a minimal name/email/phone form (reuse the enquiry-form styling).
- On submit (action), normalize phone to E.164 (reuse the P1c UK normaliser) and upsert the gym_member by email/phone using the SAME FK-safe re-select discipline as `features/forms/.../submissions.ts` (P1c-02) — re-SELECT canonical memberId after the ON CONFLICT upsert; do not trust the fresh nanoid.
- Call `create-checkout-link` with the resolved `memberId` + `priceId` (+ `mode` if the price is recurring) and redirect the visitor to `session.url`.
- Add `/embed/buy` to `auth.ts publicPaths` (the ONLY auth.ts edit — `00-public-cors.ts` already covers the `/embed` prefix per P1c-02; do not touch it). Public anonymous endpoint → no `runWithRequestContext`; gym tables carry `// guard:allow-unscoped`.
- success_url/cancel_url should point at a public thank-you/embed origin (Pitfall 6 — not behind auth).

Keep it minimal: one route file + the publicPaths entry. The cross-origin postMessage `booking:completed` relay already exists in P1c-06's `/embed.js`; if a `purchase:completed` message is desired, note it as a follow-up (out of scope unless trivial).
  </action>
  <verify>
    <automated>pnpm --filter staff-web exec tsc --noEmit -p tsconfig.json 2>&1 | rg -i "embed.buy|auth.ts" ; echo "typecheck-scan-done"</automated>
  </verify>
  <done>/embed/buy is public, upserts a lead by email/phone FK-safely, creates a Connect Checkout, redirects to Stripe; publicPaths updated; CORS plumbing untouched.</done>
</task>

</tasks>

<verification>
- `pnpm --filter staff-web exec tsc --noEmit` clean for touched files.
- Replay the embed lead-upsert SQL against gymos-demo Neon via MCP (upsert by email + by phone → 1 member, re-select returns canonical id) and clean up.
- Unit-assert (or manual SDK-arg read) that both create-checkout-link modes + create-portal-link pass `{ stripeAccount }` and the subscription path sets subscription_data.metadata.memberId.
- Live Checkout completion → pass/subscription is Plan 07 (Stripe CLI e2e).
</verification>

<success_criteria>
- Staff checkout link (existing action) now Connect-scoped + subscription-capable (criteria #2, #4).
- Public embed buy keyed to lead/member by email/phone (criterion #5).
- Customer Portal reachable on the connected account (criterion #7).
- No card data stored; tokenised ids only (criterion #8 — Checkout/Portal are Stripe-hosted).
</success_criteria>

<output>
After completion, create `.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-05-SUMMARY.md`
</output>
