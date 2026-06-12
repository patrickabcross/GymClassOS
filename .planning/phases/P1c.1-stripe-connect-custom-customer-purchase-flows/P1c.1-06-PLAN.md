---
phase: P1c.1-stripe-connect-custom-customer-purchase-flows
plan: 06
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/react-router.config.ts
  - apps/staff-web/app/routes/api.m.purchase.tsx
  - packages/mobile-app/app/(tabs)/profile.tsx
  - packages/mobile-app/lib/api.ts
autonomous: true
requirements: [PAY-01, STR-02]
must_haves:
  truths:
    - "A direct GET to a /api/m/* route on the live Vercel deploy returns JSON, not a 404"
    - "The member mobile app has a purchase screen that fetches purchasable products and opens Checkout in a browser sheet"
    - "The purchase Checkout is keyed to the logged-in demo member so the reducer binds the pass to them"
  artifacts:
    - path: "apps/staff-web/react-router.config.ts"
      provides: "Route discovery fix so /api/m/* resolve on direct hits"
      contains: "routeDiscovery"
    - path: "apps/staff-web/app/routes/api.m.purchase.tsx"
      provides: "Member purchase endpoint returning a Connect Checkout URL"
      contains: "create-checkout-link|createCheckout|checkout.sessions"
  key_links:
    - from: "packages/mobile-app/app/(tabs)/profile.tsx"
      to: "/api/m/purchase"
      via: "apiFetch then open Checkout url in browser sheet"
      pattern: "purchase|WebBrowser|Linking"
---

<objective>
Unblock + build the member mobile purchase surface. FIRST fix the `/api/m/*` 404 on the Vercel deploy (success criterion #6 prerequisite), THEN add a member purchase screen that fetches purchasable products and opens a Stripe Checkout (on the connected account) in a browser sheet, keyed to the logged-in demo member.

Purpose: Success criterion #6 — member mobile app has a purchase screen that opens Checkout. The 404 fix is a hard prerequisite and is the first task.
Output: route-discovery fix + `/api/m/purchase` endpoint + mobile purchase UI.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-RESEARCH.md
@apps/staff-web/app/routes/api.m.profile.tsx

<interfaces>
<!-- react-router.config.ts: routeDiscovery { mode: "initial" } — suspected cause of /api/m/* 404 on
     direct (non-navigated) hits on Vercel. The mobile app calls these routes directly via apiFetch,
     never through client-side navigation, so lazy/initial discovery may not register them. -->
<!-- /api/m/* routes are RR resource routes (app/routes/api.m.*.tsx) served via the [...page].get.ts
     + [...page].post.ts catch-all SSR handlers. requireDemoMember(request) gates them (D2-01). -->
<!-- create-checkout-link action (Plan 05) is the connected-account Checkout creator.
     /api/m/purchase can call the SAME server logic (import the action's run, or POST to it internally). -->
<!-- mobile apiFetch wrapper: packages/mobile-app/lib/api.ts — sends to EXPO_PUBLIC_API_BASE + demo-member header. -->
</interfaces>

**Root-cause discipline (success criterion #6 prerequisite):** The 404 root cause is NOT confirmed in research (Open Q3 flags it as out of research scope, "likely the same `[...page].post.ts` / catch-all routing class of bug already fixed for /gymos"). Task 1 MUST first reproduce + diagnose against the live deploy before applying a fix. Candidate causes to check in order: (1) `routeDiscovery: { mode: "initial" }` not registering resource routes on direct hits → switch to eager discovery or add explicit route manifest entries; (2) Vercel rewrites/output config not mapping `/api/m/*` to the SSR function; (3) the catch-all GET/POST handler not matching the `api.m.*` path segment. Apply the MINIMAL fix that makes a direct `GET /api/m/profile` return JSON on the live deploy.

**Verification constraint:** local dev can't boot. The 404 fix is verified against the LIVE Vercel deploy (curl the route post-deploy). Mobile UI is verified by reading + tsc (Expo Go physical-device walkthrough is a deferred manual check like D2-06).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnose + fix the /api/m/* 404 on Vercel</name>
  <files>apps/staff-web/react-router.config.ts</files>
  <action>
1. Reproduce: `curl -s -o /dev/null -w "%{http_code}" https://gym-class-os.vercel.app/api/m/members/list` (or `/api/m/profile` with a demo-member header) — confirm the 404 and capture which routes 404 vs. resolve.
2. Diagnose in the order in the context block. The leading hypothesis: `routeDiscovery: { mode: "initial" }` means RR only ships the route manifest for routes reachable from the initial render; resource routes hit directly by the mobile app aren't in the manifest, so the SSR catch-all has no build entry → 404. The fix is to enable eager route discovery: set `routeDiscovery: { mode: "eager" }` (or remove the `routeDiscovery` override to use the framework default that registers all routes), so every route — including `/api/m/*` resource routes — is in the manifest the catch-all resolves against.
3. If the cause is instead Vercel output/rewrites, add the minimal `vercel.json` rewrite mapping `/api/m/(.*)` to the SSR function (mirror how `/gymos/*` resolves). Pick the fix that the reproduction proves; document the chosen cause + fix in the SUMMARY.
4. Keep the change minimal and additive — do NOT restructure routing.
  </action>
  <verify>
    <automated>After deploy: curl -s -o /dev/null -w "%{http_code}\n" https://gym-class-os.vercel.app/api/m/members/list returns 200 (or 401 if the demo-member gate fires — NOT 404). Pre-deploy: pnpm --filter staff-web exec tsc --noEmit passes.</automated>
  </verify>
  <done>A direct hit to a /api/m/* route on the live deploy returns JSON/200/401, not 404; the chosen root cause is documented.</done>
</task>

<task type="auto">
  <name>Task 2: Add /api/m/purchase endpoint (member-scoped Connect Checkout)</name>
  <files>apps/staff-web/app/routes/api.m.purchase.tsx</files>
  <action>
Create a resource route gated by `requireDemoMember(request)` (D2-01 pattern, same as api.m.profile):
- GET: return the list of purchasable products for the connected account — for the pilot, a small server-side list of `{ priceId, label, mode, description }` (read from a config constant or from `stripe.prices.list({ active: true }, { stripeAccount })` via getPlatformStripe + readConnectedAccount). Keep it simple: a curated constant of the studio's pack/drop-in/subscription priceIds is acceptable for v1 (document that P2 will read live prices).
- POST: body `{ priceId, mode? }`. Resolve the logged-in member via requireDemoMember → memberId. Call the SAME logic as `create-checkout-link` (import its `run` or replicate: getPlatformStripe + readConnectedAccount guard + checkout.sessions.create with `metadata.memberId` [+ subscription_data.metadata.memberId for subscriptions] + `{ stripeAccount }`). success_url/cancel_url point at a mobile-friendly return (a simple public `/m/checkout-return` page or a deep link — use a public URL, Pitfall 6). Return `{ url }`.
- Add `/api/m/purchase` to `auth.ts publicPaths` ONLY IF the existing `/api/m` prefix isn't already public (D2-01 added `/api/m` to publicPaths — confirm; if present, no auth.ts edit needed). The demo-member gate (requireDemoMember) provides the member scoping, not Better-auth.
- `// guard:allow-unscoped — single-tenant gym tables`.
  </action>
  <verify>
    <automated>pnpm --filter staff-web exec tsc --noEmit -p tsconfig.json 2>&1 | rg -i "api.m.purchase" ; echo "typecheck-scan-done". Post-deploy: curl GET /api/m/purchase with a demo-member header returns a products JSON array (not 404).</automated>
  </verify>
  <done>/api/m/purchase GET lists products + POST returns a member-scoped Connect Checkout url; reachable on the live deploy.</done>
</task>

<task type="auto">
  <name>Task 3: Mobile purchase screen — fetch products + open Checkout in a browser sheet</name>
  <files>packages/mobile-app/app/(tabs)/profile.tsx, packages/mobile-app/lib/api.ts</files>
  <action>
Add a "Buy passes / membership" section to the Profile tab (or a dedicated screen if the tab is crowded — keep it minimal, follow the existing D2 mobile card style, no SVG per D2-04 policy):
- On mount, `apiFetch('/api/m/purchase')` (GET) → render the product list as cards (label + description + price).
- On tap "Buy", `apiFetch('/api/m/purchase', { method: 'POST', body: { priceId, mode } })` → receive `{ url }` → open it with `expo-web-browser`'s `WebBrowser.openBrowserAsync(url)` (a browser sheet — RESEARCH success criterion #6: "opens Checkout in a browser sheet"). Confirm `expo-web-browser` is a dep; if not, add it (it ships with Expo SDK 55).
- After the sheet dismisses, invalidate the profile query (`qc.invalidateQueries({ queryKey: ['profile'] })`) so a newly granted pass balance refreshes (the actual grant happens server-side via the webhook reducer; the refresh is best-effort/optimistic-poll).
- Use TanStack Query for the products fetch + the existing optimistic patterns. No emojis as icons (Tabler/RN icon set per project rules; mobile uses its existing icon convention).
- Extend `lib/api.ts` only if a new helper is needed; otherwise reuse apiFetch.
  </action>
  <verify>
    <automated>cd packages/mobile-app && pnpm exec tsc --noEmit 2>&1 | rg -i "profile.tsx|api.ts" ; echo "mobile-typecheck-scan-done"</automated>
  </verify>
  <done>Mobile Profile tab fetches purchasable products and opens a Stripe Checkout URL in a browser sheet, member-scoped; profile refreshes on return.</done>
</task>

</tasks>

<verification>
- LIVE deploy: `curl /api/m/members/list` and `/api/m/purchase` return non-404 (200/401) — the 404 is fixed.
- `pnpm --filter staff-web exec tsc --noEmit` + `packages/mobile-app tsc --noEmit` clean for touched files.
- Mobile Expo Go physical-device walkthrough (tap Buy → Checkout sheet opens) is a deferred manual check (like D2-06) — note it in the SUMMARY.
</verification>

<success_criteria>
- /api/m/* 404 fixed on Vercel (criterion #6 prerequisite).
- Member mobile purchase screen opens a connected-account Checkout in a browser sheet, keyed to the logged-in member (criterion #6).
</success_criteria>

<output>
After completion, create `.planning/phases/P1c.1-stripe-connect-custom-customer-purchase-flows/P1c.1-06-SUMMARY.md`
</output>
