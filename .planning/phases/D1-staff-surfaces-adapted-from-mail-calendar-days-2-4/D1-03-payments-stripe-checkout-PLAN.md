---
phase: D1-staff-surfaces-adapted-from-mail-calendar-days-2-4
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - templates/mail/app/routes/gymos.payments.tsx
  - templates/mail/server/lib/stripe-demo.ts
  - templates/mail/.env.local.example
autonomous: false
requirements: [PAY-01, STR-01, STR-02]
user_setup:
  - service: stripe
    why: "Generate a Stripe Checkout link for a 10-pack pass purchase in test mode (D1 demo goal)"
    env_vars:
      - name: STRIPE_SECRET_KEY
        source: "Stripe Dashboard → Developers → API keys → Restricted key with permissions: Products/Prices (write), Customers (write), Checkout Sessions (write), PaymentIntents (read). Use a TEST mode key (starts with sk_test_)."
    dashboard_config:
      - task: "Confirm Stripe account is in test mode (toggle top-left of dashboard)"
        location: "Stripe Dashboard → top-left workspace switcher"
must_haves:
  truths:
    - "Coach can open /gymos/payments and see a list of seeded members each with a 'Purchase 10-pack' button"
    - "Clicking the button creates a Stripe Checkout Session via API and redirects the coach to the hosted Stripe Checkout page in TEST MODE"
    - "Completing checkout with test card 4242 4242 4242 4242 redirects back to /gymos/payments?success=<sessionId>&memberId=<id>"
    - "On success return, the page calls Stripe to confirm session.payment_status === 'paid', then INSERTs a passes row (granted=10, source='purchase', stripeChargeId=session.payment_intent), and the member's pass balance increases by 10 (visible on /gymos/members/<id>)"
  artifacts:
    - path: "templates/mail/app/routes/gymos.payments.tsx"
      provides: "Payments surface — member list + Checkout link generator + success handler"
      exports: ["loader", "action", "meta", "default"]
      min_lines: 180
    - path: "templates/mail/server/lib/stripe-demo.ts"
      provides: "Thin Stripe client wrapper — reads STRIPE_SECRET_KEY, exports a singleton with pinned apiVersion"
      exports: ["getStripe"]
      min_lines: 20
    - path: "templates/mail/.env.local.example"
      provides: "Documents STRIPE_SECRET_KEY env requirement so future contributors know the setup"
      contains: "STRIPE_SECRET_KEY"
  key_links:
    - from: "gymos.payments.tsx action"
      to: "stripe.checkout.sessions.create"
      via: "getStripe().checkout.sessions.create({...})"
      pattern: "checkout\\.sessions\\.create"
    - from: "gymos.payments.tsx loader (success branch)"
      to: "stripe.checkout.sessions.retrieve + schema.passes INSERT"
      via: "verify session.payment_status='paid' then db.insert(schema.passes)"
      pattern: "checkout\\.sessions\\.retrieve.*insert\\(schema\\.passes\\)"
    - from: "Stripe Checkout success_url"
      to: "/gymos/payments?success={CHECKOUT_SESSION_ID}&memberId=<id>"
      via: "success_url config in sessions.create"
      pattern: "success_url"
---

<objective>
Build a demo-grade Stripe payments surface at `/gymos/payments` that lets a coach generate a Stripe Checkout link for a 10-pack pass purchase and (on test-mode payment completion) grants 10 credits to the member.

Purpose: Demo Sprint deliverable for PAY-01 (Checkout link for pass purchase), STR-01 (Stripe restricted key — demo: single env var, no rotation), STR-02 (Checkout completed in test mode + pass grant visible in member profile). Closes the loop with `/gymos/members/<id>` profile (D1-02) which already renders pass balance from `passes − pass_debits`.

Output:
- New route file `templates/mail/app/routes/gymos.payments.tsx` — payments surface
- New helper file `templates/mail/server/lib/stripe-demo.ts` — thin Stripe client wrapper
- New `templates/mail/.env.local.example` — documents `STRIPE_SECRET_KEY` requirement

**Demo grade limits (intentional; production work):**
- No webhook handling — success grant happens via synchronous Checkout Session retrieve on the redirect-back. STR-03 (atomic webhook reducer with idempotency) is Production v1 work.
- No HMAC verification of redirect (the success_url is trusted within the demo since we re-fetch the session from Stripe by ID).
- One product type only (10-pack). Drop-ins, subscriptions, refunds are PAY-02/PAY-03/PAY-05 in Production v1.
- One studio key from env. STR-01 production = encrypted per-studio key in DB with rotation UI.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@templates/mail/app/routes/gymos.tsx
@templates/mail/server/db/schema.ts

<interfaces>
<!-- Stripe Node SDK (v17.x) installed via pnpm. -->

From stripe npm package:
```typescript
import Stripe from "stripe";
const stripe = new Stripe(secretKey, { apiVersion: "2025-04-30.basil" }); // pin apiVersion
const session = await stripe.checkout.sessions.create({
  mode: "payment",
  payment_method_types: ["card"],
  line_items: [{
    price_data: {
      currency: "gbp",
      product_data: { name: "10-class pass" },
      unit_amount: 12000, // £120.00 in pence
    },
    quantity: 1,
  }],
  metadata: { memberId, productKey: "pack_10" },
  success_url: "http://localhost:8081/gymos/payments?success={CHECKOUT_SESSION_ID}&memberId=<id>",
  cancel_url: "http://localhost:8081/gymos/payments",
});
// session.url → redirect here
// session.payment_status → "paid" after completion
// session.payment_intent → string id, store as stripeChargeId
```

From templates/mail/server/db/schema.ts:
```typescript
// passes
{ id, memberId, granted, source: "purchase"|"subscription"|"manual"|"promo"|"refund",
  stripeChargeId, stripeSubscriptionId, productName, expiresAt, createdAt }
```

From templates/mail/server/db/index.ts:
```typescript
export const getDb: () => DrizzleDb;
export { schema };
```

Stripe test card: 4242 4242 4242 4242 / any future expiry / any CVC / any zip. Always succeeds in test mode.
</interfaces>

</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Add STRIPE_SECRET_KEY to .env.local (cannot be automated — requires Stripe Dashboard login)</name>
  <read_first>
    - templates/mail/.env.local (if it exists — to confirm STRIPE_SECRET_KEY is not already present, avoid duplicate keys)
    - templates/mail/server/plugins/auth.ts (sanity check — confirms /gymos/payments will be a publicPath after plan D1-01 ships)
    - .planning/STATE.md (Resume Notes section — confirms .env.local is gitignored)
  </read_first>
  <acceptance_criteria>
    - After this checkpoint resumes, `grep -c '^STRIPE_SECRET_KEY=rk_test_' templates/mail/.env.local` returns at least 1 (the executor can verify this)
    - The key starts with `rk_test_` or `sk_test_` (test mode, never live)
    - Dev server logs do not contain "STRIPE_SECRET_KEY not set" on restart
  </acceptance_criteria>
  <what-needed>
A test-mode restricted API key from Stripe with permissions: Products/Prices (write), Customers (write), Checkout Sessions (write), PaymentIntents (read).
  </what-needed>
  <how-to-verify>
1. Log in to https://dashboard.stripe.com
2. Confirm top-left workspace toggle is in **TEST MODE** (orange/yellow indicator)
3. Navigate to Developers → API keys → "+ Create restricted key"
4. Name: `gymos-demo-d1`
5. Permissions: Checkout Sessions (write), Products (write), Customers (write), PaymentIntents (read). Leave everything else "None."
6. Copy the `rk_test_...` key
7. Add to `templates/mail/.env.local`:
   ```
   STRIPE_SECRET_KEY=rk_test_xxx
   ```
8. Restart the dev server so the env var loads
  </how-to-verify>
  <resume-signal>Type "stripe-ready" once STRIPE_SECRET_KEY is in .env.local and dev server restarted. Optionally paste the first 8 chars (`rk_test_`) to confirm it's a test key, not a live key.</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Create stripe-demo.ts singleton wrapper + .env.local.example documentation</name>
  <files>templates/mail/server/lib/stripe-demo.ts, templates/mail/.env.local.example</files>
  <read_first>
    - templates/mail/server/db/index.ts (style reference for the singleton + lazy-init pattern — see how getDb() is structured)
    - templates/mail/package.json (confirm `stripe` package is installed; if not present, add `"stripe": "^17.0.0"` to dependencies and note the executor must run `pnpm install` after writing this task)
    - templates/mail/server/db/schema.ts (no direct DB use here, but confirms the file lives under server/ alongside db/)
  </read_first>
  <action>
**Step 2a — Verify `stripe` package is installed.** Run:
```bash
node -e "try{require.resolve('stripe',{paths:[require('path').resolve('templates/mail')]});console.log('ok')}catch(e){console.log('missing')}"
```
If output is `missing`, run `pnpm --filter mail add stripe@^17.0.0` from repo root. If output is `ok`, skip.

**Step 2b — Create `templates/mail/server/lib/stripe-demo.ts`** with this exact content:

```typescript
// GymClassOS Demo Sprint D1 — minimal Stripe client wrapper.
// Production (STR-01) will replace this with a per-studio encrypted key
// loader + rotation handling. Demo: read STRIPE_SECRET_KEY from env.

import Stripe from "stripe";

let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY not set. Add a test-mode restricted key to templates/mail/.env.local (see .env.local.example).",
    );
  }
  if (!key.startsWith("rk_test_") && !key.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_SECRET_KEY must be a TEST mode key (rk_test_ or sk_test_ prefix). Refusing to use live key in demo.",
    );
  }
  _client = new Stripe(key, {
    // Pinned apiVersion per AGENTS.md / research stack note: never let apiVersion float.
    apiVersion: "2025-04-30.basil",
  });
  return _client;
}
```

**Step 2c — Append to `templates/mail/.env.local.example`** (create the file if it doesn't exist):

```
# GymClassOS Demo Sprint D1 — Stripe test-mode key for /gymos/payments
# Get one at https://dashboard.stripe.com/test/apikeys → Create restricted key
# Required permissions: Checkout Sessions (write), Products (write),
#   Customers (write), PaymentIntents (read).
STRIPE_SECRET_KEY=rk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

If `.env.local.example` already exists, append the four-line block to the end. Do not duplicate the variable.

Run `npx prettier --write templates/mail/server/lib/stripe-demo.ts`.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs'); const s=fs.readFileSync('templates/mail/server/lib/stripe-demo.ts','utf8'); const e=fs.readFileSync('templates/mail/.env.local.example','utf8'); const ok=s.includes('export function getStripe')&&s.includes('process.env.STRIPE_SECRET_KEY')&&s.includes('apiVersion:')&&s.includes('rk_test_')&&e.includes('STRIPE_SECRET_KEY'); process.exit(ok?0:1)"</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/server/lib/stripe-demo.ts` exists
    - `grep -c 'export function getStripe' templates/mail/server/lib/stripe-demo.ts` returns 1
    - `grep -c 'process.env.STRIPE_SECRET_KEY' templates/mail/server/lib/stripe-demo.ts` returns 1
    - `grep -c 'apiVersion:' templates/mail/server/lib/stripe-demo.ts` returns 1 (pinned, not floating)
    - `grep -c 'rk_test_' templates/mail/server/lib/stripe-demo.ts` returns at least 1 (test-key safety guard present)
    - File `templates/mail/.env.local.example` contains `STRIPE_SECRET_KEY`
    - Importing the module from a Node REPL with STRIPE_SECRET_KEY unset throws the documented error
  </acceptance_criteria>
  <done>Stripe singleton helper exists with test-key safety guard; .env.local.example documents the env var</done>
</task>

<task type="auto">
  <name>Task 3: Create /gymos/payments route with member list, Checkout-session generator action, and success-redirect pass grant</name>
  <files>templates/mail/app/routes/gymos.payments.tsx</files>
  <read_first>
    - templates/mail/app/routes/gymos.tsx (full file — reference for loader + action + meta structure + Form pattern + redirect import)
    - templates/mail/server/lib/stripe-demo.ts (file created in Task 2 — confirms getStripe() export shape)
    - templates/mail/server/db/schema.ts (lines 235-247 passes table — confirms columns for the INSERT)
    - templates/mail/app/routes/gymos.members.tsx (file from D1-02 if shipped — reference for member list rendering pattern; if D1-02 not yet shipped, fall back to gymos.tsx member rendering style)
  </read_first>
  <action>
Create `templates/mail/app/routes/gymos.payments.tsx`. URL `/gymos/payments`.

Module structure:

1. Header comment: `// GymClassOS Payments — Demo Sprint D1. Generate a Stripe Checkout link for a 10-pack pass purchase; on success-redirect, retrieve the session and grant the pass. Demo grade — no webhook handler (STR-03 is Production v1).`

2. Imports:
```typescript
import { useLoaderData, Form, redirect } from "react-router";
import { eq, asc } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { getStripe } from "../../server/lib/stripe-demo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
```

3. `export function meta() { return [{ title: "GymClassOS — Payments" }]; }`

4. **`export async function loader({ request }: LoaderFunctionArgs)`** — handles TWO cases:
   - **Case A: success branch** — `?success=<sessionId>&memberId=<id>` in URL
     ```typescript
     const url = new URL(request.url);
     const sessionId = url.searchParams.get("success");
     const successMemberId = url.searchParams.get("memberId");
     let successMessage: string | null = null;
     let successError: string | null = null;

     if (sessionId && successMemberId) {
       try {
         const stripe = getStripe();
         const session = await stripe.checkout.sessions.retrieve(sessionId);
         if (session.payment_status === "paid") {
           const db = getDb();
           // Demo: insert a pass. Production (STR-03) does this in a webhook
           // handler inside a transaction with webhook_events insert.
           const passId = `pass_${crypto.randomUUID()}`;
           const now = new Date().toISOString();
           const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days
           await db.insert(schema.passes).values({
             id: passId,
             memberId: successMemberId,
             granted: 10,
             source: "purchase",
             stripeChargeId: typeof session.payment_intent === "string" ? session.payment_intent : null,
             productName: "10-class pass (demo)",
             expiresAt,
             createdAt: now,
           });
           successMessage = `10-pack granted to member ${successMemberId} (Stripe session ${sessionId}).`;
         } else {
           successError = `Stripe session ${sessionId} payment_status=${session.payment_status} — not paid, no grant issued.`;
         }
       } catch (e: any) {
         successError = `Stripe verification failed: ${e.message ?? "unknown error"}`;
       }
     }
     ```
   - **Case B: always** — list members:
     ```typescript
     const db = getDb();
     const members = await db.select({
       id: schema.gymMembers.id,
       firstName: schema.gymMembers.firstName,
       lastName: schema.gymMembers.lastName,
       email: schema.gymMembers.email,
       phoneE164: schema.gymMembers.phoneE164,
     }).from(schema.gymMembers).orderBy(asc(schema.gymMembers.firstName));
     ```
   - Return `{ members, successMessage, successError }`.

5. **`export async function action({ request }: ActionFunctionArgs)`** — generates the Checkout Session:
   ```typescript
   const formData = await request.formData();
   const memberId = String(formData.get("memberId") ?? "");
   if (!memberId) return { error: "Missing memberId" };

   const db = getDb();
   const member = await db.select().from(schema.gymMembers)
     .where(eq(schema.gymMembers.id, memberId)).limit(1).then(r => r[0] ?? null);
   if (!member) return { error: "Member not found" };

   const origin = new URL(request.url).origin;
   const stripe = getStripe();
   const session = await stripe.checkout.sessions.create({
     mode: "payment",
     payment_method_types: ["card"],
     line_items: [{
       price_data: {
         currency: "gbp",
         product_data: { name: "10-class pass (GymClassOS demo)" },
         unit_amount: 12000, // £120.00
       },
       quantity: 1,
     }],
     metadata: { memberId, productKey: "pack_10" },
     customer_email: member.email ?? undefined,
     success_url: `${origin}/gymos/payments?success={CHECKOUT_SESSION_ID}&memberId=${memberId}`,
     cancel_url: `${origin}/gymos/payments?cancelled=1`,
   });

   if (!session.url) return { error: "Stripe returned no URL" };
   return redirect(session.url);
   ```

6. **`export default function GymosPayments()`** — renders:
   - Max-width 960px centered.
   - Header: "Payments" + helper text "Demo: test-mode Stripe Checkout for 10-pack passes."
   - If `data.successMessage`: green banner card with the message + a link to `/gymos/members/<successMemberId>` (encourage cross-surface verify).
   - If `data.successError`: red banner card with the error.
   - Member list (each row):
     - Name + email + phone (left column)
     - `<Form method="post">`: hidden input `name="memberId" value={m.id}`, `<Button type="submit">Purchase 10-pack ()</Button>`
   - Footer note: "Use test card 4242 4242 4242 4242 / any future expiry / any CVC."

Run `npx prettier --write templates/mail/app/routes/gymos.payments.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/app/routes/gymos.payments.tsx','utf8'); const checks=['export async function loader','export async function action','export default function','getStripe','checkout.sessions.create','checkout.sessions.retrieve','db.insert(schema.passes)','success_url:','{CHECKOUT_SESSION_ID}','payment_status','source: \"purchase\"','granted: 10']; const missing=checks.filter(c=>!s.includes(c)); if(missing.length){console.error('MISSING:',missing);process.exit(1)} process.exit(0)"</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/app/routes/gymos.payments.tsx` exists
    - `grep -c 'export async function loader' templates/mail/app/routes/gymos.payments.tsx` returns 1
    - `grep -c 'export async function action' templates/mail/app/routes/gymos.payments.tsx` returns 1
    - `grep -c 'export default function' templates/mail/app/routes/gymos.payments.tsx` returns 1
    - `grep -c 'getStripe' templates/mail/app/routes/gymos.payments.tsx` returns at least 2 (import + 2 usages)
    - `grep -c 'checkout.sessions.create' templates/mail/app/routes/gymos.payments.tsx` returns 1
    - `grep -c 'checkout.sessions.retrieve' templates/mail/app/routes/gymos.payments.tsx` returns 1
    - `grep -c 'db.insert(schema.passes)' templates/mail/app/routes/gymos.payments.tsx` returns 1
    - `grep -c 'payment_status' templates/mail/app/routes/gymos.payments.tsx` returns at least 1
    - `grep -c 'source: "purchase"' templates/mail/app/routes/gymos.payments.tsx` returns 1
    - `grep -c '{CHECKOUT_SESSION_ID}' templates/mail/app/routes/gymos.payments.tsx` returns 1
    - File has at least 180 lines
  </acceptance_criteria>
  <done>Payments route renders member list with per-member Checkout buttons; action creates Stripe Checkout Session and redirects to session.url; loader on success-return verifies payment_status='paid' and inserts a passes row with granted=10</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: End-to-end test in Stripe test mode — purchase a 10-pack and verify pass grant on member profile</name>
  <read_first>
    - templates/mail/app/routes/gymos.payments.tsx (the file created in Task 3 — to confirm the success_url template + payment_status check are wired correctly before the human runs the flow)
    - templates/mail/server/lib/stripe-demo.ts (the wrapper created in Task 2 — to confirm the test-key guard is active)
    - templates/mail/app/routes/gymos.tsx (member context panel — to know where to verify the pass balance after the grant)
  </read_first>
  <acceptance_criteria>
    - A new row in `passes` table with `source='purchase'`, `granted=10`, `stripe_charge_id` matching a `pi_test_*` PaymentIntent ID
    - `/gymos/members/<memberId>` profile page shows pass balance increased by exactly 10 compared to pre-checkout state
    - Stripe Dashboard (test mode) → Payments shows a successful charge for £120.00 GBP with the metadata `memberId` matching the granted member
    - Browser URL after success redirect matches pattern `/gymos/payments?success=cs_test_*&memberId=*`
  </acceptance_criteria>
  <what-built>
A working `/gymos/payments` route that uses real Stripe Checkout (test mode) to grant a 10-pack pass on payment completion. Plan D1-02 (members profile) should already render the resulting pass balance.
  </what-built>
  <how-to-verify>
1. With dev server running (`pnpm --filter mail dev`), open http://localhost:8081/gymos/payments
2. Expect: list of 5 seeded members, each with a "Purchase 10-pack (£120.00)" button
3. Pick any member. Note their current pass balance via `/gymos/members/<id>` in another tab
4. Click "Purchase 10-pack" — expect: browser redirects to a Stripe-hosted Checkout page (URL on `checkout.stripe.com`)
5. Pay with test card: `4242 4242 4242 4242`, expiry `12/30`, CVC `123`, postal `12345`, any email/name
6. Expect: redirect back to `http://localhost:8081/gymos/payments?success=cs_test_xxx&memberId=...`
7. Expect: green banner showing "10-pack granted to member..." with a link to the member profile
8. Click the member profile link
9. Expect: pass balance increased by 10 credits compared to step 3
10. SQL sanity check (via Neon SQL editor or `mcp__Neon__run_sql`): `SELECT * FROM passes WHERE member_id = '<memberId>' ORDER BY created_at DESC LIMIT 1` — should show source='purchase', granted=10, stripe_charge_id='pi_xxx'

If any step fails, paste error output. Common issues to anticipate:
- "STRIPE_SECRET_KEY not set" → Task 1 not done or dev server not restarted
- "Refusing live key" → user accidentally pasted an sk_live_ instead of test key
- Redirect URL malformed → success_url template literal escaping issue in code
  </how-to-verify>
  <resume-signal>Type "demo-verified" if the pass grant appears on the member profile after a real Stripe test-mode checkout. If the flow fails, paste the failing step + observed output and we'll diagnose.</resume-signal>
</task>

</tasks>

<verification>
- Stripe Checkout Session creation: action returns a redirect to `checkout.stripe.com` URL
- Stripe Session retrieval on success: loader fetches by sessionId and confirms `payment_status === 'paid'`
- Pass insert: a new `passes` row with `source='purchase'`, `granted=10`, `stripe_charge_id` populated
- Cross-surface verification: `/gymos/members/<id>` shows updated balance via the formula `sum(granted) − sum(debits)` (already implemented in D1-02 / `gymos.tsx`)
</verification>

<success_criteria>
- [ ] `/gymos/payments` lists all 5 seeded members
- [ ] Clicking purchase redirects to Stripe Checkout (test mode)
- [ ] Test card 4242 completes the payment in Stripe
- [ ] Redirect lands on `/gymos/payments?success=...&memberId=...` with a green confirmation
- [ ] A new `passes` row exists with granted=10 + source='purchase' + stripe_charge_id non-null
- [ ] Member profile page (`/gymos/members/<id>`) shows the increased pass balance
- [ ] Code refuses to start if `STRIPE_SECRET_KEY` is unset OR is a live key (safety guard)
- [ ] No webhook handler exists yet (correct — that's Production v1 STR-03)
</success_criteria>

<output>
After completion, create `.planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/D1-03-payments-stripe-checkout-SUMMARY.md` documenting: payments route, stripe-demo.ts wrapper, .env.local.example, demo-grade synchronous grant (vs production webhook reducer — flagged STR-03), idempotency NOT implemented (re-hitting success URL twice would grant twice — production fix is the webhook_events table with ON CONFLICT DO NOTHING).
</output>
