---
phase: MA2-member-booking-surface
plan: 02
type: execute
wave: 2
depends_on: [MA2-01]
files_modified:
  - packages/mobile-app/app/_layout.tsx
  - packages/mobile-app/lib/pending-booking.ts
  - packages/mobile-app/app/sign-in.tsx
  - packages/mobile-app/app/(tabs)/index.tsx
autonomous: true
requirements: [MEM-01, MEM-02, MEM-05]
must_haves:
  truths:
    - "A user with no session token can open the app and land on the tabs (schedule browsable), NOT force-redirected to /sign-in"
    - "Home/Passes/Profile tabs still degrade gracefully (existing error state) when /api/m/profile 401s for an anonymous user — no crash"
    - "After a signed-out member signs in with a pending booking intent, they are returned to the schedule (not just the tab root) so they can complete that class"
    - "Home renders a LIST of upcoming bookings from profile.upcomingBookings[] (falls back to the single upcomingBooking if the array is absent)"
  artifacts:
    - path: "packages/mobile-app/lib/pending-booking.ts"
      provides: "in-session pending-booking intent store (set/get/clear occurrenceId)"
      contains: "export function setPendingBooking"
    - path: "packages/mobile-app/app/_layout.tsx"
      provides: "AuthGate no longer force-redirects anonymous users to /sign-in"
    - path: "packages/mobile-app/app/(tabs)/index.tsx"
      provides: "upcomingBookings[] list on Home"
      contains: "upcomingBookings"
  key_links:
    - from: "app/sign-in.tsx"
      to: "lib/pending-booking.getPendingBooking"
      via: "on sign-in success, if a pending intent exists route to /(tabs)/schedule"
      pattern: "getPendingBooking|PendingBooking"
    - from: "app/(tabs)/index.tsx"
      to: "/api/m/profile upcomingBookings[]"
      via: "render list from profile response"
      pattern: "upcomingBookings"
---

<objective>
Mobile app-entry + sign-in + home wiring (no schedule booking logic — that is MA2-03):

1. **MEM-01 (client half):** move the auth wall OFF app entry. `AuthGate` in `_layout.tsx` currently force-redirects any tokenless user to `/sign-in` (a hard wall). Remove that so anonymous users see the tabs and can browse the schedule. Confirm Home/Passes/Profile already degrade gracefully on 401 (they do — verify, don't crash).
2. **MEM-02 (mechanism):** create the pending-booking intent store and wire `sign-in.tsx` so that after a member signs in with a pending intent they are returned to the schedule (MA2-03's Book press sets the intent; this plan builds the store + the return-on-success leg).
3. **MEM-05 (client half):** render the additive `upcomingBookings[]` list on Home.

Purpose: anonymous browse + a continuous return-to-class flow + the home list. The Book-press gate and the booking/purchase flow live in MA2-03 (schedule.tsx).
Output: 1 new file (lib/pending-booking.ts) + 3 edited files. No new dependency. Mobile uses Feather icons (NOT Tabler — that is a web convention).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/MA2-member-booking-surface/MA2-CONTEXT.md
@.planning/phases/MA2-member-booking-surface/MA2-RESEARCH.md

<interfaces>
<!-- Contracts from MA2-01 (server) the home list consumes -->
GET /api/m/profile now returns (additive):
```ts
{ member, passBalance, upcomingBooking /* single, back-compat */,
  upcomingBookings: { bookingId, occurrenceId, startsAt, className }[],  // NEW (MA2-01 Task 3)
  today, latestCoachMessage?, studioUpdates? }
```
Mobile session helper (packages/mobile-app/lib/session.ts):
```ts
export async function getSessionToken(): Promise<string | null>
```
Existing optimistic/query conventions: shared query keys ["schedule"], ["profile"]; apiFetch (lib/api.ts) adds Authorization: Bearer and throws Error(`${status}: ${body}`) on !ok.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move the auth wall off app entry (MEM-01 client) + create pending-booking store</name>
  <files>packages/mobile-app/app/_layout.tsx, packages/mobile-app/lib/pending-booking.ts</files>
  <read_first>
    - packages/mobile-app/app/_layout.tsx (AuthGate — the `if (!token && !onSignIn) router.replace("/sign-in")` force-redirect is the wall to remove)
    - packages/mobile-app/app/(tabs)/index.tsx + passes.tsx (confirm both already have a graceful error/401 state — they do: "Couldn't load home" / "you may need to log in")
    - packages/mobile-app/lib/session.ts (getSessionToken shape)
  </read_first>
  <action>
    1. Create `packages/mobile-app/lib/pending-booking.ts` — a tiny in-session intent store (module-level variable; survives sign-in navigation within one app run, which is all MEM-02 needs):
       ```ts
       let pending: string | null = null;
       export function setPendingBooking(occurrenceId: string) { pending = occurrenceId; }
       export function getPendingBooking(): string | null { return pending; }
       export function clearPendingBooking() { pending = null; }
       ```
    2. In `packages/mobile-app/app/_layout.tsx` `AuthGate`:
       - REMOVE the force-redirect line `if (!token && !onSignIn) router.replace("/sign-in");`. Anonymous users must now reach the tabs.
       - KEEP `if (token && onSignIn) router.replace("/(tabs)");` (still bounce a signed-in user off the sign-in screen).
       - Keep the `checked` render-gate/spinner. The effect can simplify to: read token, bounce-off-sign-in-if-token, then setChecked(true). Update the AuthGate doc comment to state the wall now sits at the Book action (MA2-03), not app entry.
    3. Do NOT change AgentFabAndSheet or the Stack screens. (The agent FAB still hides on /sign-in.)
  </action>
  <acceptance_criteria>
    - `grep -n "router.replace(\"/sign-in\")" packages/mobile-app/app/_layout.tsx` returns NOTHING (the force-redirect is gone).
    - `grep -n "router.replace(\"/(tabs)\")" packages/mobile-app/app/_layout.tsx` still matches (bounce-off-sign-in kept).
    - `grep -n "export function setPendingBooking" packages/mobile-app/lib/pending-booking.ts` and `getPendingBooking` and `clearPendingBooking` all match.
    - `npx tsc --noEmit` (or expo typecheck) clean for these files.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Return-to-class after sign-in (MEM-02 mechanism)</name>
  <files>packages/mobile-app/app/sign-in.tsx</files>
  <read_first>
    - packages/mobile-app/app/sign-in.tsx (handleSignIn → on profile success `router.replace("/(tabs)")`; phone-fallback path; deep-links)
    - packages/mobile-app/lib/pending-booking.ts (from Task 1)
  </read_first>
  <action>
    In `sign-in.tsx`, import `getPendingBooking` from `../lib/pending-booking`. In `handleSignIn`, on the SUCCESS branch (after `await apiFetch("/api/m/profile")` resolves) replace the bare `router.replace("/(tabs)")` with:
    - if `getPendingBooking()` is non-null → `router.replace("/(tabs)/schedule")` (return the member to the schedule so MA2-03's on-focus resume can complete the booking for that occurrence);
    - else → `router.replace("/(tabs)")` (current behavior).
    Apply the SAME branch in the phone-fallback success path (`handlePhoneClaim` → on success). Do NOT clear the pending intent here — MA2-03's schedule screen consumes and clears it on resume. Leave the PHONE_REQUIRED / "No membership on file" copy and the Join/Forgot deep-links unchanged.
  </action>
  <acceptance_criteria>
    - `grep -n "getPendingBooking" packages/mobile-app/app/sign-in.tsx` matches (imported + used).
    - `grep -n "/(tabs)/schedule" packages/mobile-app/app/sign-in.tsx` matches in both the email-success and phone-claim-success branches.
    - The PHONE_REQUIRED handling and deep-link buttons are unchanged (`grep -n "PHONE_REQUIRED" packages/mobile-app/app/sign-in.tsx` still present).
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Home upcoming-bookings list (MEM-05 client)</name>
  <files>packages/mobile-app/app/(tabs)/index.tsx</files>
  <read_first>
    - packages/mobile-app/app/(tabs)/index.tsx (ProfileResponse type; the "Next class" hero card currently renders the single upcomingBooking; bookingTimeLabel helper)
  </read_first>
  <action>
    1. Extend the `ProfileResponse` type with the additive field:
       `upcomingBookings?: { bookingId: string; occurrenceId: string; startsAt: string; className: string | null }[];`
       (keep `upcomingBooking` for back-compat).
    2. In the "Next class" hero section, render a LIST when `upcomingBookings` is present and non-empty: map each entry to a row (className + `bookingTimeLabel(startsAt)`), each Pressable → `router.push("/(tabs)/schedule")`, using the existing Feather "chevron-right" + the existing styles (bookingRow / bookingTitle / bookingTime). Keep the section label "Next class" (or relabel to "Upcoming" when showing a list — Claude's discretion, keep it minimal per AGENTS.md clean-UI rule). Cap visible rows at ~5.
    3. FALLBACK: if `upcomingBookings` is absent/empty, render exactly the current single `upcomingBooking` card (and its "No upcoming class" empty state). Do not regress the existing behavior.
    4. Use Feather icons only (the mobile app uses @expo/vector-icons Feather — NOT Tabler). No emojis as icons.
  </action>
  <acceptance_criteria>
    - `grep -n "upcomingBookings" packages/mobile-app/app/(tabs)/index.tsx` matches in both the type and the render.
    - `grep -n "upcomingBooking" packages/mobile-app/app/(tabs)/index.tsx` shows the singular fallback is still present.
    - `grep -n "Tabler" packages/mobile-app/app/(tabs)/index.tsx` returns nothing; icons remain `Feather`.
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` (expo typecheck) clean across the four files.
- No new dependency added to packages/mobile-app/package.json.
- AuthGate no longer redirects anonymous users to /sign-in (anonymous browse works); a signed-in user on /sign-in is still bounced to tabs.
- sign-in success with a pending intent routes to /(tabs)/schedule.
- Home renders the upcomingBookings[] list (or the single-card fallback when absent).
</verification>

<success_criteria>
- MEM-01 (client): app entry is open; no force-redirect; member-only tabs degrade gracefully on 401.
- MEM-02 (mechanism): pending-booking store exists; sign-in returns the member to the schedule when an intent is pending.
- MEM-05 (client): Home shows the upcoming-bookings list, additive and non-regressing.
</success_criteria>

<output>
After completion, create `.planning/phases/MA2-member-booking-surface/MA2-02-SUMMARY.md`.
</output>
