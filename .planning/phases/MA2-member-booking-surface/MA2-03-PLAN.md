---
phase: MA2-member-booking-surface
plan: 03
type: execute
wave: 3
depends_on: [MA2-01, MA2-02]
files_modified:
  - packages/mobile-app/app/(tabs)/schedule.tsx
  - packages/mobile-app/lib/purchase-poll.ts
  - packages/mobile-app/components/ProductPickerSheet.tsx
autonomous: true
requirements: [MEM-02, MEM-03, MEM-04]
must_haves:
  truths:
    - "Tapping Book while signed out stores the occurrence intent and routes to /sign-in; after sign-in the schedule resumes that booking automatically"
    - "A signed-in member with a pass books optimistically (card flips to Booked immediately) and the pass-balance pill decrements after the profile refetch"
    - "A 409 CAPACITY_FULL rolls back the optimistic update and shows a 'class just filled up' message"
    - "A 402 NO_PASS opens the product picker (drop-in + 5-pack + 10-pack) instead of showing a red error"
    - "After buying via Stripe Checkout, returning to the app polls /api/m/profile until the credit appears, then re-issues the booking automatically"
    - "On poll timeout the member sees a 'purchase processing — tap Book again' message, not a crash"
  artifacts:
    - path: "packages/mobile-app/lib/purchase-poll.ts"
      provides: "pollForGrant — poll /api/m/profile until passBalance rises (interval+timeout)"
      contains: "export async function pollForGrant"
    - path: "packages/mobile-app/components/ProductPickerSheet.tsx"
      provides: "product picker sourced from GET /api/m/purchase (drop-in + packs)"
      contains: "ProductPickerSheet"
    - path: "packages/mobile-app/app/(tabs)/schedule.tsx"
      provides: "Book-press auth gate + optimistic booking with NO_PASS/CAPACITY branches + purchase→poll→rebook"
      contains: "getSessionToken"
  key_links:
    - from: "schedule.tsx book onError"
      to: "ProductPickerSheet / purchase flow"
      via: "branch on NO_PASS|402 → open picker; on CAPACITY_FULL|409 → rollback + toast"
      pattern: "NO_PASS|CAPACITY_FULL"
    - from: "schedule.tsx purchase flow"
      to: "lib/purchase-poll.pollForGrant"
      via: "after WebBrowser return, poll profile then re-POST /api/m/bookings"
      pattern: "pollForGrant"
    - from: "schedule.tsx Book press"
      to: "lib/pending-booking + getSessionToken"
      via: "no token → setPendingBooking + router.push('/sign-in')"
      pattern: "setPendingBooking"
---

<objective>
Wire the schedule screen's booking flow end-to-end (MEM-02 Book-press gate, MEM-03 client booking, MEM-04 inline Stripe purchase). This is the heaviest mobile plan: the async pass-grant race is the central trap of the phase.

1. **MEM-02 (Book-press gate + resume):** tapping Book while signed out stores the occurrence intent (MA2-02 store) and routes to `/sign-in`; on returning to the schedule, auto-resume the pending booking.
2. **MEM-03 (client):** keep/extend the optimistic mutation against the now-atomic `/api/m/bookings`; branch its `onError` on the new server codes.
3. **MEM-04 (inline purchase):** no active pass → product picker (drop-in + 5-pack + 10-pack from `GET /api/m/purchase`) → `POST /api/m/purchase` → `expo-web-browser` hosted Checkout → on return POLL `/api/m/profile` until the credit lands → re-issue `POST /api/m/bookings`. Stripe `success_url` is a plain web page, NOT a deep link — do not rely on a redirect.

Output: 1 edited screen + 2 new files (poll helper + picker component). No new dependency (expo-web-browser already present). Feather icons only.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MA2-member-booking-surface/MA2-CONTEXT.md
@.planning/phases/MA2-member-booking-surface/MA2-RESEARCH.md

<interfaces>
<!-- Server contracts from MA2-01 + existing endpoints -->
POST /api/m/bookings { occurrenceId } →
  200 { bookingId, passId, alreadyBooked }
  402 { error:"NO_PASS" }          // open product picker
  409 { error:"CAPACITY_FULL" }    // rollback + "class just filled up"
  409 { error:"OCCURRENCE_UNAVAILABLE" } / 404 { error:"OCCURRENCE_NOT_FOUND" }
GET  /api/m/purchase → { products: { priceId, label, description, mode }[] }   // already live; drop-in + packs configured
POST /api/m/purchase { priceId, mode? } → { url }                              // hosted Checkout on connected account
GET  /api/m/profile → { passBalance, ... }                                    // poll target

Mobile (existing):
- lib/api.ts apiFetch(path, init?) — adds Bearer; THROWS Error(`${status}: ${bodyText.slice(0,200)}`) on !ok (so err.message contains the status AND the JSON body, e.g. '402: {"error":"NO_PASS"}').
- lib/session.ts getSessionToken(): Promise<string|null>
- lib/pending-booking.ts (MA2-02) setPendingBooking/getPendingBooking/clearPendingBooking
- expo-web-browser: WebBrowser.openBrowserAsync(url) — resolves on dismiss with {type:'cancel'|'dismiss'} REGARDLESS of payment outcome (RESEARCH Pitfall 7); success is determined by polling, not the return value.
- schedule.tsx already has: useQuery(["schedule"]), useQuery(["profile"]) for the pill, bookMutation with onMutate optimistic setQueryData + onError rollback + onSuccess invalidate(["profile"]).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Book-press auth gate + resume + optimistic booking error branches (MEM-02, MEM-03 client)</name>
  <files>packages/mobile-app/app/(tabs)/schedule.tsx</files>
  <read_first>
    - packages/mobile-app/app/(tabs)/schedule.tsx (the existing bookMutation onMutate/onError/onSuccess; the "Use 1 pass" / "Pay drop-in" Pressables; the passBalance pill)
    - packages/mobile-app/lib/pending-booking.ts (MA2-02 store)
    - packages/mobile-app/lib/session.ts (getSessionToken)
    - packages/mobile-app/lib/api.ts (apiFetch throws Error with status+body in the message)
  </read_first>
  <action>
    1. **Book-press auth gate (MEM-02):** introduce a single `handleBookPress(occurrenceId)` used by the book buttons. It does: `const token = await getSessionToken();` — if `null`, call `setPendingBooking(occurrenceId)` then `router.push("/sign-in")` and return (do NOT mutate). If a token exists, proceed to the booking path (Task 1 booking for pass-holders; Task 2 picker for no-pass). Import `useRouter` from expo-router, `getSessionToken`, and `setPendingBooking/getPendingBooking/clearPendingBooking`.
    2. **Resume after sign-in (MEM-02):** add a `useFocusEffect` (from expo-router) that on focus reads `getPendingBooking()`; if non-null AND a session token now exists, `clearPendingBooking()` and auto-invoke the booking path for that occurrenceId (same path as a normal Book press for a signed-in user). Guard against double-fire (e.g. a ref flag) so it resumes once.
    3. **Optimistic mutation error branches (MEM-03):** keep the existing `onMutate` (cancel ["schedule"], snapshot, setQueryData mark isBookedByMe + bump count) and `onSuccess` (invalidate ["profile"]). Extend `onError(err, vars, ctx)`:
       - always roll back from `ctx.previous`.
       - if `err.message` includes `"NO_PASS"` or `"402"` → DO NOT show a red error; instead trigger the no-pass purchase flow for `vars.occurrenceId` (Task 2 — call the function it exports / sets state to open the picker).
       - if `err.message` includes `"CAPACITY_FULL"` or `"409"` → set `bookError` to "Sorry — this class just filled up." (existing toast styling).
       - otherwise → existing generic `bookError` message.
    4. **Simplify the book buttons:** the existing "Use 1 pass" button calls `handleBookPress(it.id)`. The "Pay drop-in" stub button (which currently books without paying — a correctness bug) must be REPLACED so it routes through the purchase flow (Task 2), never a bare booking. Remove the stale "Stripe drop-in not wired here" comments. Keep the optimistic UX; keep Feather icons.
  </action>
  <acceptance_criteria>
    - `grep -n "getSessionToken" packages/mobile-app/app/(tabs)/schedule.tsx` matches inside the Book-press gate.
    - `grep -n "setPendingBooking" packages/mobile-app/app/(tabs)/schedule.tsx` and `getPendingBooking` both match.
    - `grep -n "useFocusEffect" packages/mobile-app/app/(tabs)/schedule.tsx` matches (resume-on-focus).
    - `grep -nE "NO_PASS|CAPACITY_FULL" packages/mobile-app/app/(tabs)/schedule.tsx` matches both branches in onError.
    - `grep -n "just filled up" packages/mobile-app/app/(tabs)/schedule.tsx` matches the capacity message.
    - `grep -n "not wired here" packages/mobile-app/app/(tabs)/schedule.tsx` returns nothing (stale stub comment removed).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: No-pass product picker + purchase → poll-for-grant → re-book (MEM-04)</name>
  <files>packages/mobile-app/lib/purchase-poll.ts, packages/mobile-app/components/ProductPickerSheet.tsx, packages/mobile-app/app/(tabs)/schedule.tsx</files>
  <read_first>
    - packages/mobile-app/app/sign-in.tsx (existing WebBrowser.openBrowserAsync usage to copy the import + call style)
    - packages/mobile-app/lib/api.ts (apiFetch)
    - packages/mobile-app/lib/theme.ts usage in schedule.tsx (styles/theme tokens for the picker)
    - apps/staff-web/app/routes/api.m.purchase.tsx (GET returns {products:[{priceId,label,description,mode}]}; POST returns {url})
    - .planning/phases/MA2-member-booking-surface/MA2-RESEARCH.md Pattern 4 + Pitfall 1 + Pitfall 7 (the async-grant race, the exact happy-path sequence)
  </read_first>
  <action>
    1. **Poll helper** — create `packages/mobile-app/lib/purchase-poll.ts`:
       ```ts
       export async function pollForGrant(opts?: { intervalMs?: number; timeoutMs?: number }): Promise<boolean>
       ```
       Read the current `passBalance` first (GET /api/m/profile via apiFetch), then poll every `intervalMs` (default 2000) up to `timeoutMs` (default 30000); resolve `true` as soon as `passBalance` exceeds the starting balance, else `false` on timeout. Use a simple await-sleep loop; no new dependency.
    2. **Product picker** — create `packages/mobile-app/components/ProductPickerSheet.tsx`: a presentational picker (a Modal or simple overlay View is acceptable; reuse theme tokens; Feather icons; clean/minimal per AGENTS.md). Props: `{ visible, products, onSelect(product), onClose }`. It lists drop-in + 5-pack + 10-pack from the products it is given (label + description + a Select press). Default-highlight the drop-in entry. Do NOT fetch inside the component beyond what is passed; the screen owns data.
    3. **Wire the flow in schedule.tsx** — add a `startPurchaseFlow(occurrenceId)` invoked by the NO_PASS branch (Task 1) and by the (renamed) "Pay drop-in / Buy credits" button:
       - fetch `GET /api/m/purchase` (via useQuery key ["purchase-products"] or an on-demand apiFetch), open `ProductPickerSheet` with the products.
       - on select: `POST /api/m/purchase { priceId: product.priceId, mode: product.mode }` → get `{ url }` → `await WebBrowser.openBrowserAsync(url)`.
       - on return (promise resolved — treat ONLY as "user came back", per Pitfall 7): `const granted = await pollForGrant();`
         - if `granted` → `await apiFetch("/api/m/bookings", { method:"POST", body: JSON.stringify({ occurrenceId }) })`, then `qc.invalidateQueries(["profile"])` + `qc.invalidateQueries(["schedule"])`, optimistically mark the card booked.
         - if NOT granted (timeout) → set `bookError` to "Purchase processing — your credits will appear shortly. Tap Book again in a moment." (no crash).
       - if `POST /api/m/purchase` returns 503 (Stripe not configured) → surface a friendly "Online payment isn't set up yet — please contact the studio." message (degrade; a pass-holder can still book — this is the deferred operator-config dependency, not a build blocker).
    4. Manage picker/loading state with React state; keep everything optimistic-first and non-blocking per AGENTS.md (no spinner-gated navigation). Feather icons only; no Tabler, no emojis-as-icons.
  </action>
  <acceptance_criteria>
    - `grep -n "export async function pollForGrant" packages/mobile-app/lib/purchase-poll.ts` matches; default interval 2000 + timeout 30000 present (`grep -nE "2000|30000"`).
    - `grep -n "ProductPickerSheet" packages/mobile-app/components/ProductPickerSheet.tsx` matches the component definition; props include `onSelect` and `products`.
    - `grep -n "pollForGrant" packages/mobile-app/app/(tabs)/schedule.tsx` matches (used after WebBrowser return).
    - `grep -n "openBrowserAsync" packages/mobile-app/app/(tabs)/schedule.tsx` matches.
    - `grep -n "/api/m/purchase" packages/mobile-app/app/(tabs)/schedule.tsx` matches (GET list + POST).
    - `grep -nE "processing|contact the studio" packages/mobile-app/app/(tabs)/schedule.tsx` matches (timeout + 503 degrade copy).
    - `grep -n "Tabler" packages/mobile-app/components/ProductPickerSheet.tsx packages/mobile-app/app/(tabs)/schedule.tsx` returns nothing.
    - No new dependency in packages/mobile-app/package.json (expo-web-browser already present).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` (expo typecheck) clean across schedule.tsx + the two new files.
- No new dependency in packages/mobile-app/package.json.
- Manual/device flow (covered formally in MA2-04): signed-out Book → sign-in → auto-resume; pass-holder Book → optimistic + pill decrements; full class → rollback + "filled up"; no-pass Book → picker → Checkout → poll → booking completes; poll timeout → "tap Book again".
</verification>

<success_criteria>
- MEM-02: Book press gates on session; pending intent resumes after sign-in.
- MEM-03 (client): optimistic booking against the atomic endpoint; NO_PASS and CAPACITY_FULL handled distinctly.
- MEM-04: no-pass → product picker → Stripe inline → poll-for-grant → re-book; timeout degrades gracefully; 503 (unconfigured Stripe) degrades without blocking pass-holders.
</success_criteria>

<output>
After completion, create `.planning/phases/MA2-member-booking-surface/MA2-03-SUMMARY.md`.
</output>
