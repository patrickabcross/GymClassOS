---
phase: quick-260613-oul
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/actions/create-checkout-link.ts
  - apps/staff-web/actions/create-checkout-link-helpers.ts
  - apps/staff-web/app/components/gymos/CheckoutLinkButton.tsx
  - apps/staff-web/app/routes/gymos.members_.$id.tsx
autonomous: true
requirements: [PAY-01]
must_haves:
  truths:
    - "A coach on a member profile can open a 'Payment link' control and pick Drop-in or Membership"
    - "Picking a product generates a Stripe Checkout URL for THAT member via the existing create-checkout-link action"
    - "The generated URL is shown with a one-click copy-to-clipboard button (instant, optimistic)"
    - "The client never receives or reads Stripe price IDs (resolved server-side by product key)"
  artifacts:
    - path: "apps/staff-web/app/components/gymos/CheckoutLinkButton.tsx"
      provides: "Self-contained shadcn DropdownMenu + Dialog affordance: pick product -> call action -> show + copy URL"
      min_lines: 60
    - path: "apps/staff-web/actions/create-checkout-link.ts"
      provides: "Optional productKey ('drop-in'|'membership') that resolves price+mode server-side; priceId path unchanged"
  key_links:
    - from: "apps/staff-web/app/components/gymos/CheckoutLinkButton.tsx"
      to: "create-checkout-link"
      via: "useActionMutation from @agent-native/core/client"
      pattern: "useActionMutation\\(\\s*[\"']create-checkout-link"
    - from: "apps/staff-web/app/routes/gymos.members_.$id.tsx"
      to: "CheckoutLinkButton"
      via: "render in profile header beside Open WhatsApp conversation"
      pattern: "CheckoutLinkButton"
---

<objective>
Close P1c.1 success-criterion 4: give a coach a direct way to generate a Stripe Checkout link for a member from the member profile, reusing the existing `create-checkout-link` action.

Purpose: Today `create-checkout-link` is only reachable via the agent propose→approve flow (BoardCard revenue card). A coach looking at a specific member has no first-class "send this person a pay link" affordance. This adds one focused, progressive-disclosure control on the member profile.

Output: A `CheckoutLinkButton` component (shadcn DropdownMenu trigger → product pick → Dialog showing the generated URL + copy button) wired into the member profile header, plus a thin additive `productKey` resolver on `create-checkout-link` so the client never handles Stripe price IDs.

Scope: Member profile only. Inbox conversation header is DEFERRED (see Task 3 note) — member profile alone satisfies criterion 4. WhatsApp "send" is DEFERRED — MVP is generate + copy; sending must route through the worker chokepoint (opt-in / 24h-window / approved-template gates) and is out of scope here. No new send path is built.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Existing action (REUSE — do not change Stripe logic)
@apps/staff-web/actions/create-checkout-link.ts
@apps/staff-web/actions/create-checkout-link-helpers.ts

# Member profile — the surface to extend (add affordance to the header beside "Open WhatsApp conversation")
@apps/staff-web/app/routes/gymos.members_.$id.tsx

# Reference: existing client-side usage of create-checkout-link (clipboard copy pattern, useActionMutation)
@apps/staff-web/app/components/gymos/Noticeboard/BoardCard.tsx

# Reference: env price-id keys + product catalogue (drop-in / membership) — server-side only
@apps/staff-web/app/routes/api.m.purchase.tsx

<interfaces>
<!-- Contracts the executor needs — use these directly, no exploration required. -->

create-checkout-link CURRENT schema (apps/staff-web/actions/create-checkout-link.ts):
```ts
schema: z.object({
  memberId: z.string().min(1),
  priceId: z.string().min(1),           // becomes optional in Task 1
  productName: z.string().default("pass"),
  mode: z.enum(["payment", "subscription"]).default("payment"),
})
// returns { url, sessionId, productName, mode }
```

Client action call pattern (from BoardCard.tsx — the canonical example):
```ts
import { useActionMutation } from "@agent-native/core/client";
const m = useActionMutation("create-checkout-link", {
  onSuccess: (data) => {
    const r = data as { url?: string; productName?: string };
    if (r.url) navigator.clipboard.writeText(r.url).catch(() => {});
  },
  onError: (err) => toast(err.message ?? "Failed"),
});
m.mutate({ memberId, productKey: "drop-in" } as Record<string, unknown> as Parameters<typeof m.mutate>[0]);
```

Server-side price env keys (NEVER read these in the client — api.m.purchase.tsx):
```ts
process.env.STRIPE_PRICE_DROP_IN     // mode: "payment", label "Drop-in class"
process.env.STRIPE_PRICE_MEMBERSHIP  // mode: "subscription", label "Unlimited membership"
```

shadcn primitives available at @/components/ui/: dropdown-menu, dialog, button, input. Tabler icons via @tabler/icons-react (IconLink, IconCopy, IconCheck, IconCurrencyPound). NO emojis. The member profile already imports Button + Card from @/components/ui/*.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add optional productKey resolver to create-checkout-link (thin, additive, non-breaking)</name>
  <files>apps/staff-web/actions/create-checkout-link.ts, apps/staff-web/actions/create-checkout-link-helpers.ts</files>
  <action>
    Goal: let the CLIENT pass a product KEY ('drop-in' | 'membership') instead of a raw Stripe price ID, so price IDs stay server-side. This is the PREFERRED path per the known-facts (cleaner, no price IDs in client). Do it additively — existing `priceId` callers (the agent propose→approve flow + the embed buy flow) MUST keep working unchanged.

    In create-checkout-link-helpers.ts — add a pure resolver (testable without the defineAction wrapper):
    - Export `const PILOT_PRODUCT_KEYS = ["drop-in", "membership"] as const;` and `type ProductKey = (typeof PILOT_PRODUCT_KEYS)[number];`
    - Export `function resolveProductKey(key: ProductKey): { priceId: string; mode: "payment" | "subscription"; productName: string }`:
      - 'drop-in'    -> { priceId: process.env.STRIPE_PRICE_DROP_IN ?? "",    mode: "payment",      productName: "Drop-in class" }
      - 'membership' -> { priceId: process.env.STRIPE_PRICE_MEMBERSHIP ?? "", mode: "subscription", productName: "Unlimited membership" }
      - If the resolved priceId is empty string, `throw new Error("Product not configured — STRIPE_PRICE_* env var missing for " + key)`.
      (Mirrors the env keys + labels in api.m.purchase.tsx PILOT_PRODUCTS — do not import that route module; just reuse the same env var names so behaviour is consistent.)

    In create-checkout-link.ts — update the Zod schema to accept EITHER a productKey OR a priceId:
    - Make `priceId` optional: `priceId: z.string().min(1).optional()`.
    - Add `productKey: z.enum(["drop-in", "membership"]).optional().describe("Resolve price+mode server-side from STRIPE_PRICE_* env. Use this from staff UI so price IDs never reach the client. Takes precedence over priceId/mode when present.")`.
    - In `run`: at the top, if `productKey` is provided, call `resolveProductKey(productKey)` and use its priceId/mode/productName (productKey wins over any passed priceId/mode; the resolved productName is used unless the caller passed an explicit non-default productName). If `productKey` is absent, require `priceId` — `if (!priceId) throw new Error("Either productKey or priceId is required")`. Then proceed exactly as before (validateConnectedAccount, getPlatformStripe, buildCheckoutParams, create session).
    - Do NOT touch buildCheckoutParams' Stripe logic, the metadata.memberId / subscription_data.metadata.memberId contracts, the {stripeAccount} direct-charge, or the no-application-fee decision. The CRITICAL CONTRACTS doc comments stay intact.

    Keep `// guard:allow-unscoped` discipline — no new queries are added here.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web typecheck</automated>
  </verify>
  <done>create-checkout-link accepts { memberId, productKey: "drop-in" | "membership" } and resolves price+mode server-side; existing { memberId, priceId, mode } callers still typecheck and behave identically; resolveProductKey is exported and pure; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 2: Build CheckoutLinkButton (shadcn DropdownMenu -> Dialog -> generate + copy)</name>
  <files>apps/staff-web/app/components/gymos/CheckoutLinkButton.tsx</files>
  <action>
    Create a self-contained client component (`"use client";`) exporting `CheckoutLinkButton({ memberId, memberName }: { memberId: string; memberName?: string })`.

    Progressive disclosure — ONE secondary button, no clutter:
    - A shadcn `DropdownMenu`. Trigger = `<Button variant="outline" size="sm">` with `<IconLink size={14} className="mr-1" />` and label "Payment link".
    - DropdownMenuContent (align="end") with two DropdownMenuItems: "Drop-in class" and "Unlimited membership". onSelect of each sets local state `productKey` ('drop-in' | 'membership') and opens the Dialog.

    A shadcn `Dialog` (controlled by `open` state) shows the result:
    - DialogTitle: `Payment link` ; DialogDescription: `{label} for {memberName ?? "this member"}`.
    - On dialog open (when a productKey is chosen) fire the mutation if not already fired for this key.
    - Use `useActionMutation("create-checkout-link", { onError })` from `@agent-native/core/client` (see BoardCard.tsx for the exact import + cast pattern). Call `mutate({ memberId, productKey } as Record<string, unknown> as Parameters<typeof mutate>[0])`.
    - States inside the dialog:
      - loading: a small "Generating link…" line (no full-screen spinner).
      - error (mutation.isError): show `mutation.error?.message` in destructive text + a "Try again" Button that re-fires mutate.
      - success: render the returned `url` in a read-only shadcn `<Input>` (value = url, readOnly, onFocus selects all) PLUS a copy Button.
    - Copy button: shadcn `<Button>` with `<IconCopy size={14} />` -> on click `navigator.clipboard.writeText(url)`, set `copied=true` for 1.5s (swap icon to `<IconCheck>` + label "Copied"), and `toast("Checkout link copied")` from sonner. Optimistic/instant — never await a round-trip to flip the copied state; clipboard write is fire-and-forget with `.catch(() => {})` (matches BoardCard).
    - Reset `copied` and clear the result when the dialog closes (onOpenChange false).

    Read the mutation result via `mutation.data` (typed as `{ url?: string; productName?: string; mode?: string } | undefined`). Do NOT read any process.env in this client file — the product key is the only thing passed; price IDs are resolved server-side (Task 1).

    Tabler icons only, no emojis. Use existing @/components/ui/* primitives (dropdown-menu, dialog, button, input). Run prettier on the new file.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web typecheck</automated>
  </verify>
  <done>CheckoutLinkButton.tsx exists; opening the menu offers Drop-in + Membership; selecting one calls create-checkout-link with { memberId, productKey } and renders the returned URL with a working copy-to-clipboard button; no price IDs in the client; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 3: Wire CheckoutLinkButton into the member profile header</name>
  <files>apps/staff-web/app/routes/gymos.members_.$id.tsx</files>
  <action>
    Import CheckoutLinkButton from "../components/gymos/CheckoutLinkButton" (match the existing relative-import style in this route; the file uses `@/` for ui primitives but relative paths for app modules — verify against the existing imports and use whichever resolves under apps/staff-web/tsconfig.json `@/*`, i.e. `@/components/gymos/CheckoutLinkButton`).

    In the profile header (the `mt-3 flex items-start justify-between` block, around lines 165-199), place the affordance in the existing right-hand action area next to the conditional "Open WhatsApp conversation" Link. Wrap the two actions in a `flex items-center gap-2` container so they sit side by side without crowding:
    - `<CheckoutLinkButton memberId={member.id} memberName={fullName} />` — render UNCONDITIONALLY (a coach can generate a pay link for any member, regardless of whether a WhatsApp conversation exists).
    - Keep the existing `{conversation && (<Link ...><Button size="sm">Open WhatsApp conversation</Button></Link>)}` as-is, second in the row.

    Do NOT add multiple always-visible payment buttons — the single "Payment link" outline button (which opens the picker) is the only new visible control. No layout rewrite beyond the flex wrapper. No loader changes (member.id is already in the loader data).

    DEFERRED (do not build): the same affordance on the inbox conversation header (gymos.inbox.tsx) — member profile alone satisfies criterion 4; adding it to the inbox is optional follow-up. WhatsApp "send the link" — must go through the worker chokepoint, out of scope. Note both as deferred in the SUMMARY.

    Run prettier on the modified route.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web typecheck</automated>
  </verify>
  <done>The member profile header renders the "Payment link" button beside (or in place of, when no conversation) the WhatsApp link; the full pick→generate→copy flow is reachable; typecheck passes. Runtime is verified on the next Vercel deploy (local dev server cannot boot per the documented P1c NitroViteError constraint).</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/staff-web typecheck` passes after all three tasks.
- `npx prettier --check apps/staff-web/actions/create-checkout-link.ts apps/staff-web/actions/create-checkout-link-helpers.ts apps/staff-web/app/components/gymos/CheckoutLinkButton.tsx apps/staff-web/app/routes/gymos.members_.$id.tsx` (or run --write before committing).
- Manual contract check: existing create-checkout-link callers (BoardCard revenue proposal via approve-proposal; /embed/buy) still pass `priceId` and are unaffected — confirm by grepping for `create-checkout-link` callers and verifying none pass an empty/missing priceId without a productKey.
- Runtime (deferred to Vercel): on gym-class-os.vercel.app open a member profile, click "Payment link" → "Drop-in class", confirm a real Stripe Checkout URL appears and copies to clipboard. STRIPE_PRICE_DROP_IN + STRIPE_PRICE_MEMBERSHIP are already set on Vercel per STATE P1c.1-07 closeout.
</verification>

<success_criteria>
- P1c.1 success-criterion 4 closed: a coach can generate a Stripe Checkout link for a specific member from the member profile and copy it, reusing create-checkout-link.
- Client never handles Stripe price IDs (productKey resolves server-side).
- No changes to create-checkout-link's Stripe session logic, metadata contracts, direct-charge, or fee decision.
- shadcn primitives only (DropdownMenu + Dialog + Button + Input), Tabler icons, no emojis, single secondary control (progressive disclosure), optimistic copy.
- No DB/schema changes. typecheck + prettier clean.
</success_criteria>

<output>
After completion, create `.planning/quick/260613-oul-add-coach-checkout-link-generator-to-mem/260613-oul-SUMMARY.md`.
Note in the SUMMARY: (1) inbox-header affordance DEFERRED, (2) WhatsApp send DEFERRED (must route through worker chokepoint — no new send path), (3) runtime verification deferred to Vercel deploy.
</output>
</content>
</invoke>
