---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/lib/stripe.ts
  - apps/staff-web/server/lib/connected-account.ts
  - apps/staff-web/actions/create-connect-account.ts
  - apps/staff-web/actions/create-account-link.ts
  - apps/staff-web/app/routes/gymos.settings.integrations.tsx
autonomous: true
requirements: [STR-01]
must_haves:
  truths:
    - "A getPlatformStripe() resolver builds a single Stripe client from the platform key (stripe_platform_secret_key secret then STRIPE_SECRET_KEY env), leaving the dormant restricted-key reader intact"
    - "create-connect-account creates a Custom-equivalent account via controller properties and stores acct_id in connected_accounts"
    - "create-account-link returns a hosted onboarding URL; the settings page kicks off Connect + shows readiness from connected_accounts"
  artifacts:
    - path: "apps/staff-web/actions/create-connect-account.ts"
      provides: "accounts.create with controller properties"
      contains: "controller"
    - path: "apps/staff-web/actions/create-account-link.ts"
      provides: "accountLinks.create account_onboarding"
      contains: "account_onboarding"
    - path: "apps/staff-web/server/lib/connected-account.ts"
      provides: "readConnectedAccount() helper used by actions + settings loader"
      contains: "connected_accounts"
  key_links:
    - from: "apps/staff-web/actions/create-connect-account.ts"
      to: "connected_accounts"
      via: "INSERT acct_id after accounts.create"
      pattern: "connected_accounts|connectedAccounts"
    - from: "apps/staff-web/app/routes/gymos.settings.integrations.tsx"
      to: "create-account-link"
      via: "Connect Stripe button → fetcher → redirect to link.url"
      pattern: "account-link|accountLink"
---

<objective>
Build the studio onboarding path: a platform Stripe client resolver, the `create-connect-account` action (Custom-equivalent via controller properties — D-record: white-label, no fee), the `create-account-link` action (Stripe-hosted onboarding), and the `/gymos/settings/integrations` "Connect Stripe" button + readiness display. Keep the existing `stripe_restricted_key` reader DORMANT (rollback insurance — don't delete this phase).

Purpose: Success criterion #1 — a Custom connected account is created + onboarded to `charges_enabled && payouts_enabled` via an Account Link launched from settings, with the acct_id stored server-side.
Output: platform-key resolver + 2 actions + settings UI rework.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-RESEARCH.md
@apps/staff-web/server/lib/stripe.ts
@apps/staff-web/actions/create-checkout-link.ts
@apps/staff-web/AGENTS.md

<interfaces>
<!-- Existing stripe.ts exports getStripeClient() (restricted key) + STRIPE_API_VERSION.
     KEEP getStripeClient — mark @deprecated, add getPlatformStripe() alongside. -->
<!-- connectedAccounts Drizzle export (Plan 01) — single row expected, id = acct_xxx. -->
<!-- defineAction pattern (apps/staff-web/actions/*.ts): default export, zod schema,
     http: { method: "POST" }, run: async (params) => {...}. -->
```typescript
// Controller-property account creation (RESEARCH Pattern 1):
await platform.accounts.create({
  controller: {
    stripe_dashboard: { type: "none" },
    fees: { payer: "application" },
    losses: { payments: "application" },
    requirement_collection: "application",
  },
  country: "GB",
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
});
// Account Link (RESEARCH Pattern 2):
await platform.accountLinks.create({
  account: accountId, type: "account_onboarding",
  refresh_url: BASE + "/gymos/settings/integrations?stripe=refresh",
  return_url:  BASE + "/gymos/settings/integrations?stripe=return",
});
```
</interfaces>

**Locked decisions encoded here (ROADMAP D-record 2026-06-12):**
- Custom account = the 4 controller properties above (NOT `type: "custom"`, which is deprecated). Per D-record "Custom account type."
- `fees.payer = "application"` → platform pays Stripe fees (Pitfall 7 — surface a one-line cost note in the settings UI). This is REQUIRED for Custom equivalence + the no-fee decision.
- NO application fee anywhere (decision locked) — no `application_fee_*` params.
- Account Links hosted onboarding only (embedded onboarding deferred).

**`return_url` is NOT "complete" (Pitfall 3 in §Patterns):** readiness comes only from the `account.updated` reducer (Plan 03) writing connected_accounts. The settings page reads readiness from the table, never infers it from the return.

**Verification constraint:** local dev can't boot. Verify action logic by replaying its SQL effects against gymos-demo Neon via MCP and/or unit-asserting the Stripe SDK call args with a mocked client. Live onboarding runs in Plan 06.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getPlatformStripe() resolver + connected-account read helper</name>
  <files>apps/staff-web/server/lib/stripe.ts, apps/staff-web/server/lib/connected-account.ts</files>
  <action>
In `stripe.ts`: add `getPlatformStripe()` that resolves the PLATFORM key — priority: `secrets.name = 'stripe_platform_secret_key'` (pgcrypto-decrypted, same UPDATE...RETURNING pgp_sym_decrypt pattern as `getStripeSecretKey`) → `process.env.STRIPE_SECRET_KEY` env → throw a clear "No platform Stripe key configured" error. Build `new Stripe(key, { apiVersion: STRIPE_API_VERSION })`. Mark the existing `getStripeClient()` / `getStripeSecretKey()` with `@deprecated — restricted-key model replaced by Connect platform key (P1c.1); kept dormant for rollback, delete post-cutover`. Do NOT delete them.

Create `connected-account.ts` exporting `readConnectedAccount()` → `SELECT id, charges_enabled, payouts_enabled, requirements_due, disabled_reason FROM connected_accounts LIMIT 1` (single-tenant, one row) via the staff-web `getDb()` raw execute; returns `{ id, chargesEnabled, payoutsEnabled, requirementsDue: string[], disabledReason } | null`. `// guard:allow-unscoped — connected_accounts is studio-global config (single-tenant)`. Also export `upsertConnectedAccountId(acctId)` → INSERT ... ON CONFLICT (id) DO NOTHING (the readiness flags are filled by the worker's account.updated reducer; this just records the id at creation time).
  </action>
  <verify>
    <automated>pnpm --filter staff-web exec tsc --noEmit -p tsconfig.json 2>&1 | rg -i "stripe.ts|connected-account" ; echo "typecheck-scan-done"</automated>
  </verify>
  <done>getPlatformStripe() compiles; restricted-key path marked deprecated but present; readConnectedAccount/upsertConnectedAccountId helpers exist and typecheck.</done>
</task>

<task type="auto">
  <name>Task 2: create-connect-account + create-account-link actions</name>
  <files>apps/staff-web/actions/create-connect-account.ts, apps/staff-web/actions/create-account-link.ts</files>
  <action>
`create-connect-account.ts` (defineAction, POST, empty/optional schema e.g. `{ studioLabel: z.string().default("hustle") }`):
- If `readConnectedAccount()` already returns a row, return `{ accountId: existing.id, created: false }` (idempotent — never create a second account for the single tenant).
- Else `const account = await getPlatformStripe().accounts.create({ controller: {...4 props...}, country: "GB", capabilities: { card_payments: { requested: true }, transfers: { requested: true } } })`, then `upsertConnectedAccountId(account.id)` with the studioLabel, return `{ accountId: account.id, created: true }`.
- NOT in the agent system prompt (staff-invoked from settings only). Comment why.

`create-account-link.ts` (defineAction, POST, schema `{ accountId: z.string().regex(/^acct_/) }`):
- `const link = await getPlatformStripe().accountLinks.create({ account: accountId, type: "account_onboarding", refresh_url: BASE+"/gymos/settings/integrations?stripe=refresh", return_url: BASE+"/gymos/settings/integrations?stripe=return" })`.
- `BASE = process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app"`.
- Return `{ url: link.url }`. Document that the link is single-use + short-lived → on `?stripe=refresh` the settings page re-calls this action.

Both: `// guard:allow-unscoped — connected_accounts/secrets are studio-global config`. Document the new actions in `apps/staff-web/AGENTS.md` Agent Actions table as staff-only (not agent tools).
  </action>
  <verify>
    <automated>pnpm --filter staff-web exec tsc --noEmit -p tsconfig.json 2>&1 | rg -i "create-connect-account|create-account-link" ; echo "typecheck-scan-done"</automated>
  </verify>
  <done>Both actions compile; controller-property combo present (4 props, no type:custom); account creation idempotent; AGENTS.md updated.</done>
</task>

<task type="auto">
  <name>Task 3: Rework /gymos/settings/integrations — Connect Stripe button + readiness</name>
  <files>apps/staff-web/app/routes/gymos.settings.integrations.tsx</files>
  <action>
Loader: call `readConnectedAccount()`. If null → state "not connected". If present → expose `{ id, chargesEnabled, payoutsEnabled, requirementsDue }`.

UI (shadcn primitives, Tabler icons — no emojis):
- If not connected: a "Connect Stripe" button. On click, an action/fetcher flow: call `create-connect-account` → take its accountId → call `create-account-link` → `window.location.href = url` (full redirect to Stripe-hosted onboarding). Keep it a server action or fetcher chain; the button must navigate to Stripe.
- If connected but not ready (`!chargesEnabled || requirementsDue.length`): show a readiness card (charges_enabled / payouts_enabled badges + currently_due list) and a "Continue onboarding" button that re-calls `create-account-link` for the SAME acct_id and redirects.
- If ready (`chargesEnabled && payoutsEnabled`): green "Stripe connected — accepting payments" state.
- One-line cost note (Pitfall 7): "GymClassOS covers Stripe processing fees during the pilot (no platform fee)."
- Handle the `?stripe=refresh` query param: auto-regenerate an account link (link expired). Handle `?stripe=return`: just reload the loader (readiness comes from the table via the webhook, not the return).
- KEEP the existing restricted-key entry input only behind a dev/fallback flag (e.g. `?devKeyEntry=1`) — do not remove it (rollback insurance).

The page already exists (restricted-key UI) — preserve the route's existing Stripe key-rotation handler behind the dev flag; the primary surface becomes the Connect button.
  </action>
  <verify>
    <automated>pnpm --filter staff-web exec tsc --noEmit -p tsconfig.json 2>&1 | rg -i "gymos.settings.integrations" ; echo "typecheck-scan-done"</automated>
  </verify>
  <done>Settings page renders Connect/readiness states from connected_accounts; Connect button chains create-connect-account → create-account-link → redirect; restricted-key UI preserved behind a dev flag; cost note shown.</done>
</task>

</tasks>

<verification>
- `pnpm --filter staff-web exec tsc --noEmit` clean for the touched files.
- Replay `upsertConnectedAccountId('acct_test') ` then `readConnectedAccount()` semantics against gymos-demo Neon via MCP (insert → select → delete cleanup) to confirm the helper SQL is correct.
- Live account creation + onboarding is a Plan 06 step (needs the platform key set as a secret first).
</verification>

<success_criteria>
- Platform key resolver live; restricted-key path dormant (not deleted).
- create-connect-account (controller props, idempotent) + create-account-link (hosted onboarding) actions exist.
- /gymos/settings/integrations drives Connect onboarding + shows readiness from the table.
</success_criteria>

<output>
After completion, create `.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-04-SUMMARY.md`
</output>
