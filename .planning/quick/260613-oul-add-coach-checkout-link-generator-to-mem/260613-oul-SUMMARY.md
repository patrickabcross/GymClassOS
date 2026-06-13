---
phase: quick-260613-oul
plan: 01
subsystem: staff-web/payments
tags: [stripe, checkout, member-profile, progressive-disclosure, ux]
dependency_graph:
  requires:
    - P1c.1-03 (create-checkout-link action + connected account + getPlatformStripe)
    - P1c.1-07 (STRIPE_PRICE_DROP_IN + STRIPE_PRICE_MEMBERSHIP set on Vercel)
  provides:
    - Coach-facing Stripe Checkout link generator on member profile
    - productKey resolver (server-side price-ID resolution for any future surface)
  affects:
    - apps/staff-web/actions/create-checkout-link.ts (schema + run logic)
    - apps/staff-web/actions/create-checkout-link-helpers.ts (new exports)
    - apps/staff-web/app/routes/gymos.members_.$id.tsx (header affordance)
tech_stack:
  added: []
  patterns:
    - productKey resolver pattern (server-side env var resolution, client never sees price IDs)
    - DropdownMenu -> Dialog progressive disclosure (pick -> generate -> copy)
    - useActionMutation with optimistic clipboard write (fire-and-forget, no await)
key_files:
  created:
    - apps/staff-web/app/components/gymos/CheckoutLinkButton.tsx
  modified:
    - apps/staff-web/actions/create-checkout-link.ts
    - apps/staff-web/actions/create-checkout-link-helpers.ts
    - apps/staff-web/app/routes/gymos.members_.$id.tsx
decisions:
  - productKey takes precedence over priceId/mode when both present; productName override preserved if caller passes non-default value
  - Mutation fires immediately on DropdownMenuItem select (dialog shows loading state inline, not on close)
  - Inbox conversation header affordance deferred (member profile alone satisfies criterion 4)
  - WhatsApp send deferred (must route through worker chokepoint — no new send path built here)
  - Runtime verification deferred to Vercel deploy (NitroViteError dev-server constraint)
metrics:
  duration: ~25 minutes
  completed: 2026-06-13
  tasks_completed: 3
  files_modified: 4
---

# Quick 260613-oul: Coach Checkout Link Generator on Member Profile

One-liner: Progressive-disclosure "Payment link" button on member profile that generates a Stripe Checkout URL via `productKey` (price IDs resolve server-side) and copies it with one click.

## What Was Built

### Task 1 — productKey resolver in create-checkout-link (additive, non-breaking)

Added to `create-checkout-link-helpers.ts`:
- `PILOT_PRODUCT_KEYS = ["drop-in", "membership"] as const`
- `type ProductKey`
- `resolveProductKey(key)` — maps `'drop-in'` -> `STRIPE_PRICE_DROP_IN` (payment) and `'membership'` -> `STRIPE_PRICE_MEMBERSHIP` (subscription); throws with a clear error if the env var is missing

Updated `create-checkout-link.ts`:
- `priceId` made optional (`z.string().min(1).optional()`)
- New optional `productKey: z.enum(["drop-in", "membership"]).optional()`
- Run function: `productKey` path calls `resolveProductKey` first and wins over caller-supplied `priceId`/`mode`; `priceId` path is fully unchanged (agent propose→approve and /embed/buy callers unaffected; `priceId` still validated as required when `productKey` absent)
- All CRITICAL CONTRACTS untouched: `metadata.memberId`, `subscription_data.metadata.memberId`, `{ stripeAccount }` direct charge, `buildCheckoutParams`, no application fee

### Task 2 — CheckoutLinkButton component

`apps/staff-web/app/components/gymos/CheckoutLinkButton.tsx` (192 lines):
- `"use client"` — self-contained, no SSR
- Props: `{ memberId: string; memberName?: string }`
- `DropdownMenu` trigger = outline Button with `IconLink` + "Payment link"
- Two `DropdownMenuItem`s: "Drop-in class" (`productKey: "drop-in"`) and "Unlimited membership" (`productKey: "membership"`)
- Selecting fires `useActionMutation("create-checkout-link")` immediately with `{ memberId, productKey }`, opens `Dialog`
- Dialog states: loading ("Generating link...") / error (destructive text + Try again) / success (read-only `Input` + copy `Button`)
- Copy: `navigator.clipboard.writeText(url).catch(() => {})` + `setCopied(true)` (1.5s) + `toast("Checkout link copied")` — all synchronous before any await
- Dialog close resets mutation, productKey, copied state
- No price IDs anywhere in this file; shadcn primitives only; Tabler icons only; no emojis

### Task 3 — Wire into member profile header

`gymos.members_.$id.tsx`:
- Import `CheckoutLinkButton` via `@/components/gymos/CheckoutLinkButton`
- Header action area wrapped in `flex items-center gap-2`
- `<CheckoutLinkButton memberId={member.id} memberName={fullName} />` renders unconditionally (every member can receive a payment link)
- Existing WhatsApp conversation `Link` preserved as second item (still conditional on `conversation`)
- No loader changes required

## Verification

- `pnpm --filter @gymos/staff-web typecheck` passes after each task and after all three combined
- `npx prettier --write` run on all four modified/created files
- Existing callers confirmed: `approve-proposal.ts` passes `priceId` via stored proposal JSON — still valid since `priceId` is now optional (not removed); `api.m.purchase.tsx` calls Stripe directly (does not use this action)
- Existing tests (`create-checkout-link.test.ts`) test `buildCheckoutParams` + `validateConnectedAccount` which are unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Items

1. **Inbox conversation header affordance** — `gymos.members_.$id.tsx` profile alone satisfies P1c.1 criterion 4. Adding the same button to the inbox conversation header (`gymos.inbox.tsx`) is optional follow-up for a future quick task.

2. **WhatsApp send from checkout link** — generating + copying satisfies the criterion. Sending the link to the member via WhatsApp must route through the worker chokepoint (opt-in check, 24h-window enforcement, approved-template gate). No new WhatsApp send path was built here — a dedicated plan is required.

3. **Runtime verification** — deferred to next Vercel deploy. The `NitroViteError` dev-server constraint means the live pick→generate→copy flow must be verified at `gym-class-os.vercel.app`. `STRIPE_PRICE_DROP_IN` and `STRIPE_PRICE_MEMBERSHIP` are already set on Vercel per P1c.1-07 closeout.

## Known Stubs

None — all data is wired. The component fetches a real Stripe Checkout URL from the live action on every invocation.

## Self-Check: PASSED

Files exist:
- `apps/staff-web/app/components/gymos/CheckoutLinkButton.tsx` — created ✓
- `apps/staff-web/actions/create-checkout-link-helpers.ts` — modified ✓
- `apps/staff-web/actions/create-checkout-link.ts` — modified ✓
- `apps/staff-web/app/routes/gymos.members_.$id.tsx` — modified ✓

Commits exist:
- `d6d828eb` feat(quick-260613-oul-01): add optional productKey resolver to create-checkout-link ✓
- `c539f172` feat(quick-260613-oul-02): add CheckoutLinkButton component ✓
- `c55ab6d8` feat(quick-260613-oul-03): wire CheckoutLinkButton into member profile header ✓
