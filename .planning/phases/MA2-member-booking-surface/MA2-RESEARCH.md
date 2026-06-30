# Phase MA2: Member Booking Surface - Research

**Researched:** 2026-06-30
**Domain:** Expo (React Native) member app + `/api/m/*` resource routes (React Router v7 / Nitro) + Stripe Connect inline checkout + pass-ledger booking
**Confidence:** HIGH (everything is in-repo; verified by reading the actual endpoints, screens, schema, and reducers — no external library uncertainty)

## Summary

MA2 is a **pure wiring phase**: every server endpoint and every mobile screen already exists from the demo era. There is **no new schema, no migration, and no new external dependency**. The work is (1) splitting "browse" from "book" so the schedule is publicly readable while booking requires a session, (2) adding **real pass-debit-on-booking** to `/api/m/bookings` (today it inserts a booking row but never touches `passes`/`pass_debits` and never sets `bookings.pass_id`), (3) wiring the **no-pass → Stripe inline → poll-for-grant → re-book** flow on the mobile side against the already-working `/api/m/purchase` endpoint, and (4) confirming the home surface (`/api/m/profile` already returns `{member, passBalance, upcomingBooking, today}`).

The single biggest correctness risk is the **async pass-grant race**: `/api/m/purchase` returns a hosted Checkout URL; the pass is granted by the **Fly worker** only after Stripe fires `checkout.session.completed`. The mobile client returns from the browser *before* that webhook is guaranteed processed, so the booking **cannot** complete synchronously after purchase — the client must poll `/api/m/profile` until `passBalance` rises, then re-issue the booking. The booking does **not** auto-complete server-side.

The second risk is the **app-entry auth wall**: `packages/mobile-app/app/_layout.tsx` `AuthGate` currently redirects to `/sign-in` whenever there is no token, which contradicts MEM-01 (anyone browses without logging in). The wall must move from app entry to the Book action.

**Primary recommendation:** Keep all member surfaces as `/api/m/*` resource routes (NOT agent `defineAction` tools). Add a deliberate **anonymous read branch** to `/api/m/schedule`, make pass-debit-on-booking atomic in `/api/m/bookings` (mirror the `cancel-occurrence.ts` transaction pattern, positive debit), move the AuthGate wall to the Book button, and implement no-pass booking as `purchase → expo-web-browser → poll profile → re-book`. No migration.

## User Constraints (from REQUIREMENTS.md locked decisions)

There is **no CONTEXT.md** for this phase (no discuss step was run). The governing constraints are the milestone's locked decisions plus the MA-wide discipline in STATE.md / ROADMAP.md. These are authoritative — do not plan around them.

### Locked Decisions (verbatim, the MA2-relevant subset)
- **Browse = public; book = authenticated** — the app is open to browse the schedule; login is the wall at the *booking* action.
- **No-membership is the Stripe paywall, not a hard block** — booking without an active pass routes to Stripe inline; purchase grants the pass and links the member.
- **Login = email + password** (Better-auth `emailAndPassword`, already wired). Member email comes from Stripe checkout; claim-by-email links the existing `gym_members` row. (MA1 — already shipped.)

### MA-wide discipline (every MA phase)
- **Additive-only** `runMigrations` (next version after v36); migrations are **NOT auto-run** — apply to Neon `billowing-sun-51091059` by hand. *(MA2 needs no migration — see Runtime State Inventory.)*
- **No identity-table reshape.** Reuse `user`/`session`/`account`.
- **`/api/m/*` bearer-gates from the verified session inside each handler — never trust a header/body for identity.**
- Native iOS/Android only (no react-native-web). `npx expo install` (not bare npm) for any SDK-55 pin.

### Out of scope (do not build in MA2)
- Waitlist + auto-promotion (`MEM-FUT-01`), late-cancel/no-show fees (`MEM-FUT-02`), walk-in/spot-selection (`MEM-FUT-03`).
- Any member-facing **web** portal. Member surface is the Expo app only.
- New CRM / member pipeline. Teacher and admin surfaces (MA3/MA4) and push (MA5).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEM-01 | Anyone can browse the class schedule without logging in | `/api/m/schedule` currently `requireMemberOrDemo`-gated (would 401 anonymously). Add an anonymous read branch (FQ1). Also move `_layout.tsx` AuthGate off app entry. |
| MEM-02 | Tapping **Book** while signed out prompts sign-in | AuthGate moves to the Book action: `getSessionToken()` null → route to `/sign-in` then return to the class (FQ1). `/sign-in` screen already exists (MA1-02). |
| MEM-03 | Signed-in member with an active pass books via `/api/m/bookings`; pass debited **on booking** | `/api/m/bookings` POST exists but does NOT debit. Add atomic capacity-check + pass-pick + `pass_debits` insert + `bookings.pass_id` set, mirroring `cancel-occurrence.ts` (FQ2). |
| MEM-04 | No active pass → Stripe inline → pass granted → booking completes | `/api/m/purchase` POST returns a hosted Checkout `{url}` on the connected account (works). Mobile: `expo-web-browser` → poll `/api/m/profile` for grant → re-book (FQ2, Pitfall 1). |
| MEM-05 | Home surface — upcoming bookings + current pass balance | `/api/m/profile` already returns `passBalance` + `upcomingBooking` (single). Home (`index.tsx`) already renders both. Plural "upcoming bookings" is the only gap (FQ3). |

## Standard Stack

No new packages. Everything below is already installed and in use.

### Server (`apps/staff-web`)
| Library | Role in MA2 | Notes |
|---------|-------------|-------|
| React Router v7 resource routes | `/api/m/*` loaders/actions | `app/routes/api.m.*.tsx` — the member API surface |
| Nitro server routes | thin delegating wrappers | `server/routes/api/m/*.ts` — each imports the RR route's `loader`/`action` from a sibling `.js` path and re-status-codes Responses |
| Drizzle ORM `^0.45` | booking/pass transactions | `db.transaction(async (tx) => …)` — pattern proven in `cancel-occurrence.ts` |
| Better-auth (`getSession`) | session → member identity | via `requireMember` in `server/lib/member-session.ts` (the H3 adapter shim is already correct — see Pitfall 5) |
| Stripe Node SDK `^17` | Connect direct-charge Checkout | `getPlatformStripe()` + `{ stripeAccount }`; already wired in `api.m.purchase.tsx` |

### Mobile (`packages/mobile-app`, Expo SDK 55)
| Library | Role in MA2 | Notes |
|---------|-------------|-------|
| `@tanstack/react-query` v5 | data + optimistic mutations | shared query keys `["schedule"]`, `["profile"]` already coordinate the screens |
| `expo-web-browser` | open hosted Stripe Checkout | already imported in `app/sign-in.tsx` (`WebBrowser.openBrowserAsync`) |
| `expo-secure-store` (via `lib/session.ts`) | Bearer token read | `getSessionToken()` — used by `lib/api.ts` on every request |
| `expo-router` | tabs + sign-in routing | `app/(tabs)/*`, `app/sign-in.tsx`, `AuthGate` in `app/_layout.tsx` |
| `@expo/vector-icons` (Feather) | icons | NOTE: mobile app uses **Feather**, not Tabler — the root AGENTS.md "Tabler only" rule is a *staff-web/web* convention; match the existing mobile screens' Feather usage, do not introduce Tabler into RN. |

**Installation:** none. If any `expo-*` pin is ever needed, use `npx expo install <pkg>` (never bare npm) per MA-wide discipline.

## Architecture Patterns

### The member API request path (verified)
```
Expo screen (react-query queryFn)
  └─ lib/api.ts apiFetch(path)            // adds Authorization: Bearer <secure-store token>
       └─ EXPO_PUBLIC_API_BASE + path
            └─ Nitro server/routes/api/m/<x>.{get,post}.ts   // delegates
                 └─ app/routes/api.m.<x>.tsx loader/action     // real logic
                      └─ requireMemberOrDemo(request)          // prod = requireMember (Bearer→session→gym_members)
```
`auth.ts` `publicPaths` already lists `/api/m` (prefix) and `/m/checkout-return`, so the **framework** guard lets these through unauthenticated; the **per-handler** `requireMember` is the real gate. This is the "public-to-guard, bearer-gate in handler" discipline.

### Pattern 1: Anonymous-read split for `/api/m/schedule` (MEM-01)
**What:** Let the schedule load with no Bearer, returning browse-only data (no member-scoped fields).
**Why this honors the bearer-gate rule:** the rule forbids *trusting a header/body for identity*. An anonymous read asserts **no** identity and returns **no** member-scoped data — it does not violate the rule. Document the exception in `apps/staff-web/AGENTS.md`.
**Shape:** resolve the session optionally; if absent, run Query A (occurrences) + Query B (counts) and set `isBookedByMe:false` for every item, **skip Query C** (the per-member booked-set). If present, behave as today.
```ts
// api.m.schedule.tsx (sketch)
import { getOptionalMember } from "../../server/lib/member-session"; // NEW thin helper
const member = await getOptionalMember(request); // returns Member | null, never throws 401
// …Query A + Query B always…
const mySet = member
  ? new Set((await db.select({occurrenceId: schema.bookings.occurrenceId})
       .from(schema.bookings)
       .where(and(eq(schema.bookings.memberId, member.id), eq(schema.bookings.status,"booked")))).map(b=>b.occurrenceId))
  : new Set<string>();
```
`getOptionalMember` = `requireMember` minus the throws (return null on no session / no claim). Keep `requireMember` unchanged for the write paths.

### Pattern 2: Move the auth wall from app entry to the Book action (MEM-01/MEM-02)
**What:** `app/_layout.tsx` `AuthGate` currently does `if (!token && !onSignIn) router.replace("/sign-in")`. Change it so the tabs render for anonymous users; gate only the Book press.
**Recommended:** AuthGate no longer force-redirects on missing token (it can still bounce *off* `/sign-in` when a token exists). On the Book button in `app/(tabs)/schedule.tsx`, check `await getSessionToken()`; if null, `router.push("/sign-in")` (optionally carrying the occurrenceId so the member returns to the same class). The agent FAB / member-only tabs that 401 already degrade gracefully (Home, Passes show a friendly "you may need to log in" state) — verify each tab tolerates anonymous (Home/Passes/Profile call `/api/m/profile` which will 401 anonymously; show the existing graceful error, not a crash).

### Pattern 3: Atomic pass-debit on booking (MEM-03) — mirror `cancel-occurrence.ts`
**What:** Wrap the booking insert in one `db.transaction`. Steps: re-check occurrence status + capacity (count booked `FOR UPDATE` on the occurrence row to close the capacity race), pick an **active pass with remaining credit**, insert the booking with `passId`, insert a **positive** `pass_debits` row (`amount: 1, reason: "class_booking", bookingId`). If no active pass with balance, do **not** insert a booking — return a distinguishable `NO_PASS` signal (see Pattern 4).
**Active pass definition (from schema + AGENTS.md):** `passes` has **no status column**; "active" = `expires_at IS NULL OR expires_at > now()`. Balance is ledger-derived: `SUM(passes.granted) − SUM(pass_debits.amount)` per member (two separate aggregations — never chain-join through `pass_debits`, it fans out and double-counts; see `api.m.profile.tsx` comment).
**Pass selection for the `passId` FK:** pick a specific pass row that still has remaining credit (recommend FIFO: order by `expires_at NULLS LAST, created_at ASC`), so refunds (`cancel-occurrence` inserts `amount:-1` against that `passId`) reconcile against the same pass. Compute per-pass remaining as `granted − SUM(its debits)`.
```ts
// inside db.transaction(tx):
// 1. lock occurrence + count booked  → reject CAPACITY_FULL
// 2. find an active pass with remaining > 0 (FIFO) → if none, return { error: "NO_PASS" } (HTTP 402)
// 3. insert booking { id, occurrenceId, memberId, status:"booked", passId, bookedAt }
// 4. insert pass_debits { id:`pdebit_${nanoid()}`, passId, bookingId, amount:1, reason:"class_booking", createdAt }
```
Keep the existing idempotency pre-check (already-booked → return existing booking id) **inside** the transaction.

### Pattern 4: No-pass → Stripe inline → poll → re-book (MEM-04) — the async-grant flow
**Server (`/api/m/purchase`, already built):** POST `{priceId, mode}` → returns `{url}` (hosted Checkout on the connected account; `success_url=${STAFF_WEB_URL}/m/checkout-return?result=success`). `metadata.memberId` is set so the worker reducer binds the granted pass.
**Worker (already built):** `checkout-session-completed.ts` grants the pass (`INSERT INTO passes … source:'purchase'`) **asynchronously** after the webhook. Pass credits keyed off the product **description** keyword (`drop-in`/`5-pack`/`10-pack`) — the `PILOT_PRODUCTS` descriptions in `api.m.purchase.tsx` already carry these.
**Mobile happy path (build this):**
```
Book pressed, profile.passBalance <= 0
  → POST /api/m/purchase { priceId }      // get { url }
  → WebBrowser.openBrowserAsync(url)       // hosted Checkout
  → on return (promise resolves on dismiss):
       poll GET /api/m/profile every ~2s, max ~30s, until passBalance increases
       → POST /api/m/bookings { occurrenceId }   // now debits the fresh pass
       → invalidate ["profile"] + ["schedule"]
  → if poll times out: show "purchase processing — your credits will appear shortly; tap Book again"
```
**The race, stated plainly:** the booking does **not** auto-complete after purchase. The worker grants the pass on its own clock; the client observes the grant by polling profile, then completes the booking by calling `/api/m/bookings` a second time. Do **not** try to make the worker auto-book (that would force the worker to import booking/capacity logic across the build boundary — out of scope; a deferred `MEM-FUT` enhancement).
**Server still enforces:** even though the client checks `passBalance` to choose the path, `/api/m/bookings` debits inside the transaction and returns `NO_PASS` if a stale client tries to book without credit — server is the source of truth, never the client balance.

### Pattern 5: Optimistic UI (already present, extend it)
`app/(tabs)/schedule.tsx` already does the AGENTS.md optimistic pattern: `onMutate` cancels `["schedule"]`, snapshots, `setQueryData` marks `isBookedByMe:true` + bumps count; `onError` rolls back from `ctx.previous`; `onSuccess` invalidates `["profile"]`. Extend `onError` to branch on `NO_PASS`/`402` → launch the purchase flow rather than show a red toast; branch on `CAPACITY_FULL`/`409` → roll back + "class just filled up".

### Anti-Patterns to Avoid
- **Building a member booking `defineAction` agent tool.** Member booking is REST `/api/m/*`, not an agent surface. The agent four-area contract (UI/actions/skills/application_state) is the **staff-web** agent's concern; MA2 adds no agent tools and needs no two-exposure entry in `agent-chat.ts`.
- **Debiting the pass on *purchase*.** MEM-03 is explicit: debit **on booking**. Purchase only *grants*; booking *debits*.
- **Chain-joining through `pass_debits`** to compute balance — fans out, double-counts. Use two separate `SUM` aggregations (see `api.m.profile.tsx`).
- **Trusting client `passBalance`** to skip the server pass check. Always debit-or-`NO_PASS` inside the transaction.
- **Relying on the Stripe redirect to reopen the app.** `success_url` is a plain web page (`/m/checkout-return`), not a deep link (the file comments say so). Use poll-on-return, not redirect-to-deeplink.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session → member identity | a new token verifier | `requireMember` / a new `getOptionalMember` in `server/lib/member-session.ts` | The H3 adapter shim + claim-by-email + 401/409/403/PHONE_REQUIRED semantics are already correct and spike-verified |
| Stripe Checkout session | a raw `stripe.checkout.sessions.create` call in a new file | the existing `/api/m/purchase` action | Already does connected-account direct charge, `metadata.memberId`, success/cancel URLs, charges-enabled guard |
| Pass grant on payment | client-side credit add | the worker `checkout-session-completed.ts` reducer | Idempotent (deterministic pass ids), keyed on product description; replay-safe |
| Pass refund on cancel | new refund logic | existing `cancel-occurrence.ts` (negative `pass_debits` against the booking's `passId`) | This is *why* the booking must record `passId` — so refunds reconcile |
| Checkout return page | a deep-link handler | existing `/m/checkout-return` SSR page | Already public, already branded, already the configured `success_url` |
| Nitro route plumbing | hand-written H3 handlers | copy an existing `server/routes/api/m/*.ts` wrapper | Uniform Response→status mapping; import the RR route via `.js` path |

**Key insight:** ~90% of MA2's server surface already exists and is live. The net-new server code is small: an optional-member helper, the booking transaction (debit + capacity), and possibly one additive `upcomingBookings` field on profile.

## Runtime State Inventory

MA2 is a code-wiring phase over existing tables. Audited explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `bookings` (incl. `pass_id` column — already exists), `passes`, `pass_debits`, `class_occurrences`, `gym_members.user_id` (claim link, from MA1). All present on Neon `billowing-sun-51091059`. | None — no schema change. Booking writes use existing columns. |
| Live service config | Stripe connected account (`connected_accounts` / `readConnectedAccount`), `STRIPE_PRICE_*` env vars on Vercel, `STAFF_WEB_URL` for return URLs, `EXPO_PUBLIC_API_BASE` in the mobile app. | Verify `STRIPE_PRICE_DROP_IN`/`5_PACK`/`10_PACK` are set on the studio's Vercel deploy and the Stripe **product descriptions** contain the credit keywords (else 0 credits granted). Operator/config check, not code. |
| OS-registered state | None. | None. |
| Secrets/env vars | No new secrets. Stripe platform key + connect already configured; Better-auth Bearer already wired (MA1). | None. |
| Build artifacts | Mobile app is Expo; no native rebuild needed for these JS/TS changes (no new native module — `expo-web-browser` already a dep). | None. A new EAS build is only needed if a native dep changes (it does not). |

**Migration needed?** **No.** `bookings.pass_id` already exists (schema line 298). The latest `runMigrations` version in `server/plugins/db.ts` is **v36**; MA2 adds nothing. The only response-shape change (plural `upcomingBookings` on profile, if adopted) is application-layer, not DDL.

## Common Pitfalls

### Pitfall 1: The async pass-grant race (the central MA2 trap)
**What goes wrong:** Member with no pass buys inline; the app tries to book immediately and gets `NO_PASS` because the worker hasn't processed `checkout.session.completed` yet.
**Why:** Pass grant is asynchronous (Stripe webhook → Fly worker reducer), and the hosted-Checkout return fires on browser dismiss, which can precede the webhook.
**How to avoid:** Poll `/api/m/profile` after browser return until `passBalance` rises (≈2s interval, ≈30s cap), then book. Show a "processing — tap Book again" fallback on timeout. Never assume the booking auto-completes.
**Warning signs:** booking 402s right after a successful payment; credits "appear later."

### Pitfall 2: App-entry auth wall blocks public browse (MEM-01 regression)
**What goes wrong:** `_layout.tsx` AuthGate redirects anonymous users to `/sign-in`, so nobody can browse.
**How to avoid:** Remove the force-redirect-on-missing-token; gate the Book press instead. Ensure Home/Passes/Profile tabs degrade gracefully when `/api/m/profile` 401s anonymously (existing error states already do — verify, don't crash).

### Pitfall 3: Schedule 401s for anonymous browsers
**What goes wrong:** `/api/m/schedule` calls `requireMemberOrDemo` → `requireMember` in prod → 401 with no Bearer.
**How to avoid:** Add the `getOptionalMember` anonymous branch (Pattern 1). Keep member-scoped Query C behind a present session.

### Pitfall 4: Capacity oversell + stale-balance double-book
**What goes wrong:** Two concurrent books exceed capacity; or a stale client books without credit.
**How to avoid:** Do capacity count + pass pick + debit inside one transaction with a row lock on the occurrence (`SELECT … FOR UPDATE`). Today's `bookings.post` has none of this ("Demo-grade: NO atomic capacity check, NO entitlement resolution, NO pass debit" — its own comment). MA2 adds it.

### Pitfall 5: H3 event adapter for any new session-reading endpoint
**What goes wrong:** Passing the wrong event shape to `getSession` crashes with `Cannot read properties of undefined (reading 'headers')`.
**How to avoid:** Reuse `sessionFromRequest` in `member-session.ts` — it builds the `{ req, headers, url, path }` shape that h3 v2 + Better-auth both need (the comment documents the exact failure from the MA1 spike). Don't re-derive it; `getOptionalMember` should call the same shim.

### Pitfall 6: Stripe prices/products must live on the **connected** account
**What goes wrong:** Platform-account price ids 404 when the session is created with `{ stripeAccount }`.
**How to avoid:** `STRIPE_PRICE_*` must be prices on the **connected** account, and product descriptions must contain the credit keyword. This is operator setup (documented in `apps/staff-web/AGENTS.md` Stripe section), surfaced here so the planner adds a verification step, not code.

### Pitfall 7: `expo-web-browser` return handling
**What goes wrong:** Assuming a return value tells you payment succeeded. `openBrowserAsync` resolves on dismiss with `{type:"cancel"|"dismiss"}` regardless of payment outcome.
**How to avoid:** Treat browser return only as "user came back"; determine success by polling profile for the grant. (If a tighter loop is wanted later, `openAuthSessionAsync` with a custom return scheme is a deferred enhancement — the current `success_url` is a fixed web page.)

## Code Examples

### Existing optimistic booking mutation (extend, don't replace) — `app/(tabs)/schedule.tsx`
```ts
// Source: packages/mobile-app/app/(tabs)/schedule.tsx (current)
const bookMutation = useMutation({
  mutationFn: ({ occurrenceId }) =>
    apiFetch("/api/m/bookings", { method: "POST", body: JSON.stringify({ occurrenceId }) }),
  onMutate: async ({ occurrenceId }) => {
    await qc.cancelQueries({ queryKey: ["schedule"] });
    const previous = qc.getQueryData(["schedule"]);
    qc.setQueryData(["schedule"], (old) => /* mark isBookedByMe + bump count */);
    return { previous };
  },
  onError: (err, _v, ctx) => { if (ctx?.previous) qc.setQueryData(["schedule"], ctx.previous); /* MA2: branch NO_PASS→purchase, CAPACITY_FULL→toast */ },
  onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
});
```

### Atomic refund pattern to mirror for the positive debit — `actions/cancel-occurrence.ts`
```ts
// Source: apps/staff-web/actions/cancel-occurrence.ts (refund = negative; booking debit = positive +1)
await tx.insert(schema.passDebits).values({
  id: `pdebit_refund_${nanoid()}`,
  passId: booking.passId!,     // ← this is why the booking must store passId
  bookingId: booking.id,
  amount: -1,                  // booking debit uses +1, reason:"class_booking"
  reason: "cancellation_refund",
  createdAt: new Date().toISOString(),
});
```

### Two-aggregation balance (do not chain-join) — `api.m.profile.tsx`
```ts
// Source: apps/staff-web/app/routes/api.m.profile.tsx
const grantedTotal = /* SUM(passes.granted) WHERE member */;
const debitsTotal  = /* SUM(pass_debits.amount) via leftJoin passes WHERE member */;
const passBalance  = grantedTotal - debitsTotal;
```

## State of the Art

| Old (demo) | Current target (MA2) | Impact |
|------------|----------------------|--------|
| `bookings.post` inserts a row, no debit, no capacity check | atomic capacity + pass debit + `passId` | MEM-03; makes refunds (`cancel-occurrence`) reconcile |
| App entry behind AuthGate | public browse, wall at Book | MEM-01/02 |
| `/api/m/schedule` member-gated | anonymous read branch | MEM-01 |
| Schedule "Pay drop-in" button is a stub (books without paying — see code comments "Stripe drop-in … not wired here") | real `purchase → poll → re-book` | MEM-04 |
| Profile returns single `upcomingBooking` | optionally `upcomingBookings[]` | MEM-05 (minor) |

**Deprecated/transitional:** `requireMemberOrDemo`'s demo branch (`X-Demo-Member-Id`) is prod-disabled (`NODE_ENV==="production"` forces the real `requireMember`). Leave it; do not remove (MA1 AUTH-06 keeps the demo alive in non-prod).

## Open Questions

1. **Plural upcoming bookings on Home (MEM-05).**
   - What we know: `/api/m/profile` returns one `upcomingBooking` (`limit(1)`); Home renders exactly one.
   - What's unclear: does "upcoming bookings" require a list on Home, or is the single "next class" card + the Classes tab sufficient?
   - Recommendation: cheapest compliant read of MEM-05 = add an additive `upcomingBookings: [...]` array to profile (keep `upcomingBooking` for back-compat) and render a short list on Home. No migration. Decide at plan time; both are small.

2. **Which price to launch for "Pay drop-in".**
   - What we know: `PILOT_PRODUCTS` has drop-in / 5-pack / 10-pack / unlimited; `/api/m/purchase` GET lists configured ones.
   - What's unclear: does the Book-with-no-pass flow open a product picker, or default straight to drop-in?
   - Recommendation: for the no-pass path, present the GET `/api/m/purchase` list (drop-in + packs) so the member can buy a pack, not just a single drop-in — better revenue and fewer repeat checkouts. Default-highlight drop-in. Plan-time UX decision.

3. **Return-to-class after sign-in (MEM-02).**
   - What we know: `/sign-in` exists and `router.replace("/(tabs)")` on success.
   - What's unclear: should tapping Book while signed out return the user to the *same class* after login?
   - Recommendation: pass the occurrenceId through sign-in (param or a pending-action store) and resume the booking on return. Nice-to-have; acceptable to just land on the schedule for v1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `expo-web-browser` | inline Stripe Checkout (MEM-04) | ✓ (imported in `sign-in.tsx`) | SDK 55 pin | — |
| `expo-secure-store` | Bearer token (MA1) | ✓ (`lib/session.ts`) | SDK 55 pin | — |
| `@tanstack/react-query` | all screens | ✓ | v5 | — |
| Stripe connected account + `STRIPE_PRICE_*` | purchase flow | config-dependent | — | If unset, `/api/m/purchase` returns 503 — purchase path unusable; member with a pass can still book (degrade) |
| Fly worker (`checkout-session-completed`) | pass grant | ✓ (live, Fly `gymos-edge-webhooks`) | — | — |
| EAS dev build | run on device | external-gated (Apple Dev acct) | — | Android device or simulator for JS-only verification; no native change in MA2 so no new build strictly required |

**Missing dependencies with no fallback:** none for code. **Operator-config dependency:** Stripe prices/descriptions on the connected account must be set for MEM-04 to work end-to-end (verification step, not a build blocker).

## Sources

### Primary (HIGH — direct file reads, 2026-06-30)
- `apps/staff-web/app/routes/api.m.{schedule,bookings,purchase,profile}.tsx` — current endpoint shapes, gates, demo caveats
- `apps/staff-web/server/routes/api/m/{schedule.get,bookings.post}.ts` — Nitro delegation pattern
- `apps/staff-web/server/lib/member-session.ts` + `demo-member.ts` — `requireMember`/`requireMemberOrDemo`/H3 shim/claim semantics
- `apps/staff-web/actions/cancel-occurrence.ts` — atomic pass-refund transaction pattern (the debit mirror)
- `services/worker/src/domain/stripeReducers/checkout-session-completed.ts` — async pass grant + keyword credits
- `apps/staff-web/server/db/schema.ts` (bookings/passes/pass_debits) — `pass_id` exists, no pass status col
- `apps/staff-web/server/plugins/auth.ts` (publicPaths) — `/api/m`, `/m/checkout-return` already public
- `apps/staff-web/app/routes/m.checkout-return.tsx` — the configured Stripe return page
- `packages/mobile-app/app/(tabs)/{schedule,index,passes}.tsx`, `app/_layout.tsx` (AuthGate), `app/sign-in.tsx`, `lib/{api,session}.ts` — mobile surfaces + optimistic pattern + web-browser usage
- `.planning/{STATE,ROADMAP,REQUIREMENTS}.md`, `apps/staff-web/AGENTS.md` — constraints, locked decisions, Stripe keyword table, migration discipline
- `.planning/config.json` — `nyquist_validation: false` (Validation Architecture section omitted)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all in-repo, all already installed.
- Architecture: HIGH — every endpoint/screen read directly; the only net-new logic (booking transaction) has a proven in-repo mirror (`cancel-occurrence.ts`).
- Pitfalls: HIGH — the async-grant race and the AuthGate wall are confirmed in the actual code/comments, not inferred.

**Research date:** 2026-06-30
**Valid until:** ~2026-07-30 (stable; would only shift if the Stripe product model or the demo→prod auth dual-path changes).
