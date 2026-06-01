---
phase: P1c-public-site-integrations
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/actions/create-checkout-link.ts
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [EMBED-05]
must_haves:
  truths:
    - "Staff can generate a Stripe hosted Checkout URL for a known member by calling create-checkout-link with memberId + priceId"
    - "The created Checkout session carries metadata.memberId so the P1b-07 reducer binds the resulting pass to that member on checkout.session.completed"
    - "Calling the action with an empty memberId is rejected by Zod before any Stripe call"
  artifacts:
    - path: "apps/staff-web/actions/create-checkout-link.ts"
      provides: "Stripe hosted Checkout link generation for a contacted lead"
      contains: "metadata: { memberId }"
  key_links:
    - from: "apps/staff-web/actions/create-checkout-link.ts"
      to: "Stripe checkout.sessions.create"
      via: "getStripeClient() reading the pgcrypto-encrypted restricted key"
      pattern: "checkout\\.sessions\\.create"
    - from: "apps/staff-web/actions/create-checkout-link.ts"
      to: "P1b-07 checkout-session-completed reducer"
      via: "session metadata.memberId contract"
      pattern: "metadata"
---

<objective>
Add the `create-checkout-link` action (EMBED-05): staff generate a Stripe hosted Checkout URL
for a now-known lead and send it via WhatsApp. The session MUST include `metadata.memberId` —
the P1b-07 reducer (`checkout-session-completed.ts`) reads exactly `session.metadata?.memberId`
to bind the granted pass to the member. Without it, the lead pays but gets no credits.

Purpose: This completes the lead-funnel loop (Decision 2 — booking + payment happens via a
staff-sent Checkout link, not anonymous self-serve). It is self-contained: it touches no new
P1c schema and no forms code, so it runs in parallel with P1c-02.

Output: `apps/staff-web/actions/create-checkout-link.ts` + an AGENTS.md actions-table row.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md
@.planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md
@services/worker/src/domain/stripeReducers/checkout-session-completed.ts
@apps/staff-web/AGENTS.md

<interfaces>
<!-- P1b-07 reducer contract (Source: services/worker/src/domain/stripeReducers/checkout-session-completed.ts):
     const memberId = (fullSession.metadata?.memberId as string | undefined) ?? null;
     If memberId is null → payment row inserted but NO pass granted, NO member link.
     => The Checkout session MUST set metadata: { memberId }.

     passCreditsForLineItem() matches by line-item DESCRIPTION string:
       "10-pack"/"10 pack" → 10 credits; "5-pack"/"5 pack" → 5; "1-class"/"drop-in" → 1; else null.
     => The Stripe Product/Price description must contain one of these keywords for the pass to
        be granted. This is a STUDIO STRIPE-SETUP requirement, documented below — not a code change. -->

<!-- Existing Stripe client helper — VERIFY exact path + export name at task time.
     P1b-08 SUMMARY references the worker's getStripeSecretKey reading the pgcrypto-encrypted
     restricted key from the secrets table. Staff-web needs a server-side Stripe client. Search:
     grep -rn "getStripeClient\|getStripeSecretKey\|new Stripe(" apps/staff-web/server apps/staff-web/actions
     If a staff-web helper already exists, import it. If NOT, create
     apps/staff-web/server/lib/stripe.ts that reads the restricted key via the same readSecret/
     pgcrypto path used by /gymos/settings/integrations (P1b-08) and constructs
     new Stripe(key, { apiVersion: '2026-04-22.dahlia' as Stripe.LatestApiVersion }). -->

<!-- defineAction pattern (Source: existing apps/staff-web/actions/*.ts, e.g. list-renewals.ts):
     import { defineAction } from "@agent-native/core";
     export default defineAction({ description, schema: z.object({...}), http: { method }, run }); -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create the create-checkout-link action</name>
  <files>apps/staff-web/actions/create-checkout-link.ts</files>
  <read_first>
    - services/worker/src/domain/stripeReducers/checkout-session-completed.ts — the `metadata?.memberId` read (line ~38) AND passCreditsForLineItem keyword matching (lines ~107-113). The action must produce sessions the reducer can bind.
    - apps/staff-web/actions/list-renewals.ts (or any existing action) — the exact defineAction shape: `description`, `schema: z.object(...)`, `http: { method }`, `run: async (...) => ...`. NOTE: existing actions use `schema:` + `run:` (NOT `parameters:` + `handler:` as the RESEARCH sketch shows — match the LIVE convention).
    - .planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md §"Pattern 7" + §"Code Examples" Checkout link action + Pitfall 7 (missing memberId metadata)
    - grep -rn "getStripeClient|getStripeSecretKey|new Stripe(" apps/staff-web — to find or decide the Stripe client import
    - .planning/STATE.md §Decisions P1b-08 — Stripe restricted key stored pgcrypto-encrypted via /gymos/settings/integrations; worker reads it fresh per job
  </read_first>
  <action>
Create `apps/staff-web/actions/create-checkout-link.ts`. It must be a POST action (it mutates
external Stripe state) and set `metadata.memberId`.

```typescript
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getStripeClient } from "../server/lib/stripe.js"; // create this helper if it does not exist (see read_first)

export default defineAction({
  description:
    "Generate a Stripe hosted Checkout link for a known member (lead) to buy a class pass or membership. " +
    "Use this AFTER a lead has been contacted — the resulting URL is sent to them via WhatsApp. " +
    "The Checkout session includes metadata.memberId so the payment webhook binds the purchased pass " +
    "to this member automatically. Returns { url }.",
  schema: z.object({
    memberId: z.string().min(1).describe("gym_members.id of the contacted lead"),
    priceId: z.string().min(1).describe("Stripe Price ID for the pass/membership product"),
    productName: z.string().default("pass").describe("Display name shown to the buyer"),
  }),
  http: { method: "POST" },
  run: async ({ memberId, priceId, productName }) => {
    const stripe = await getStripeClient();
    const baseUrl = process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      // CRITICAL: P1b-07 reducer reads session.metadata.memberId to grant the pass.
      metadata: { memberId },
      success_url: `${baseUrl}/gymos/members/${memberId}?checkout=success`,
      cancel_url: `${baseUrl}/gymos/members/${memberId}?checkout=cancelled`,
    });
    return { url: session.url, sessionId: session.id, productName };
  },
});
```

Notes:
- If no staff-web Stripe client helper exists yet, create `apps/staff-web/server/lib/stripe.ts`
  reading the restricted key from the same pgcrypto secrets path P1b-08 wired (the worker's
  getStripeSecretKey is the reference). Pin `apiVersion: '2026-04-22.dahlia' as Stripe.LatestApiVersion`
  (P1b-04 SUMMARY pin). Throw a clear error if no key is configured (directs staff to
  /gymos/settings/integrations).
- `productName` is passed through for the UI but the actual pass-credit mapping is driven by the
  Stripe Price's DESCRIPTION keyword (10-pack/5-pack/drop-in) — see the configuration note below.
- This action does NOT touch gym tables, so no guard:allow-unscoped marker is needed.

Run `pnpm --filter @gymos/staff-web typecheck`.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/actions/create-checkout-link.ts` exists
    - Contains `defineAction` import
    - Contains literal `metadata: { memberId }`
    - Contains `checkout.sessions.create`
    - Contains `http: { method: "POST" }`
    - Schema requires `memberId` with `.min(1)` and `priceId` with `.min(1)`
    - Uses `schema:` + `run:` (matches live defineAction convention, not `parameters:`/`handler:`)
    - Returns an object containing `url`
    - `pnpm --filter @gymos/staff-web typecheck` exits 0
    - If `apps/staff-web/server/lib/stripe.ts` was created, it pins `apiVersion` and reads the key (no hardcoded key)
  </acceptance_criteria>
  <done>
The action exists, requires a non-empty memberId + priceId, and creates a Stripe Checkout
session with metadata.memberId so the P1b-07 reducer can grant + bind the pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Document the action + the Stripe Product keyword requirement in AGENTS.md</name>
  <files>apps/staff-web/AGENTS.md</files>
  <read_first>
    - apps/staff-web/AGENTS.md — the "Agent Actions (LLM tools)" table and the "What the Agent CANNOT Do" section (create-checkout-link is a staff-initiated mutation; note whether the pilot agent should be allowed to call it or whether it's UI-only)
    - .planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md §"Open Questions" #4 (Stripe Product setup for pass credits)
  </read_first>
  <action>
1. Add a row to the "Agent Actions (LLM tools)" table in `apps/staff-web/AGENTS.md`:
```
| `create-checkout-link` | Generate a Stripe hosted Checkout URL for a contacted lead to buy a pass/membership; send the URL via WhatsApp | `{url, sessionId, productName}` |
```
2. Add a short "Stripe Product setup (pilot config)" note under the actions table stating: for a
   purchased pass to grant credits, the Stripe Price's product DESCRIPTION must contain one of the
   keywords the P1b-07 reducer matches: `10-pack`, `5-pack`, or `drop-in`/`1-class`. Otherwise the
   payment records but no pass is granted (Pitfall 7 / Open Question 4). This is a studio Stripe
   dashboard configuration step, not code.
3. Keep the read-only-for-pilot framing consistent: note that `create-checkout-link` is a
   staff-initiated mutation invoked from the UI / a contacted-lead flow, and (per the pilot's
   read-only agent posture) is NOT named in the agent system prompt's tool list unless/until the
   studio wants the agent to send Checkout links autonomously.

Run `npx prettier --write apps/staff-web/AGENTS.md`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('apps/staff-web/AGENTS.md','utf8'); if(!s.includes('create-checkout-link')){console.error('action row missing');process.exit(1)} if(!/10-pack|5-pack|drop-in/.test(s)){console.error('keyword note missing');process.exit(1)} console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/AGENTS.md` contains a `create-checkout-link` row in the Agent Actions table
    - AGENTS.md contains the Stripe Product description-keyword note mentioning `10-pack`, `5-pack`, and `drop-in`/`1-class`
    - The verify node script prints `OK`
  </acceptance_criteria>
  <done>
The action is documented and the studio's Stripe Product keyword requirement is recorded so the
pass-grant binding works at Checkout time.
  </done>
</task>

</tasks>

<verification>
- create-checkout-link action typechecks and sets metadata.memberId
- Empty memberId/priceId rejected by Zod
- AGENTS.md documents the action + the Stripe Product keyword requirement
</verification>

<success_criteria>
1. create-checkout-link generates a hosted Checkout URL with metadata.memberId (EMBED-05)
2. The P1b-07 reducer contract is honoured (pass binds to member on completion)
3. The Stripe Product keyword config requirement is documented (Pitfall 7 mitigation)
</success_criteria>

<output>
After completion, create `.planning/phases/P1c-public-site-integrations/P1c-03-checkout-link-action-SUMMARY.md` documenting:
- Whether a staff-web Stripe client helper already existed or was created (and its path)
- The Stripe apiVersion pin used
- Confirmation the session sets metadata.memberId (the P1b-07 binding contract)
- A sample of the returned { url } shape from a test call (test-mode key)
</output>
