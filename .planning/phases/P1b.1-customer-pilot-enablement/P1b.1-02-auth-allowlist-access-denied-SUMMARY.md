---
phase: P1b.1-customer-pilot-enablement
plan: 02
subsystem: auth
tags: [better-auth, h3, nitro, google-oauth, allowlist, env-config, react-router-v7, tabler-icons, shadcn]

# Dependency graph
requires:
  - phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
    provides: "apps/staff-web/server/plugins/auth.ts shape (createAuthPlugin call with googleOnly + publicPaths), apps/staff-web app dir structure"
  - phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
    provides: "/api/m/* + /pick-member + /webhooks/whatsapp publicPaths entries to preserve"
provides:
  - "CUSTOMER_ALLOWED_EMAILS env-var allowlist (case-insensitive, comma-separated) gating /gymos for the pilot deployment"
  - "Composable Nitro plugin pattern (await framework auth plugin, then app.use(myMiddleware)) for adding cross-cutting middleware after auth"
  - "/access-denied public React Router v7 route (no loader, presentational only) with branded copy + Better-auth sign-out CTA"
  - "Documented .env.example entry for the new env var"
affects: [P1a-org-acl, P1b.1-08-end-to-end-verification, future-customer-pilot-deployments]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compose-with-framework plugin: wrap createAuthPlugin's returned async fn, then call getH3App(nitroApp).use(handler) to append a hook that runs AFTER the framework's auth guard sets the session cookie"
    - "Path-skip hygiene for any middleware that 302s to an unauth route: skip /_agent-native/auth/*, /_agent-native/google/*, /_*, /assets/, /login, /signup, /__manifest, /webhooks/*, /api/m, /pick-member, and any URL containing '.' (static assets) so OAuth callbacks + the unauth public surfaces are never intercepted"
    - "Public denial route pattern: presentational component, no loader/action, listed in createAuthPlugin's publicPaths, sign-out via direct fetch to /_agent-native/auth/logout then window.location to /_agent-native/google/auth-url?redirect=1"

key-files:
  created:
    - "apps/staff-web/.env.example - documents CUSTOMER_ALLOWED_EMAILS"
    - "apps/staff-web/app/routes/access-denied.tsx - branded denial page"
  modified:
    - "apps/staff-web/server/plugins/auth.ts - composed createAuthPlugin with allowlist H3 middleware + added /access-denied to publicPaths"

key-decisions:
  - "Compose framework plugin via wrapper (await authPlugin then getH3App(nitroApp).use(handler)) instead of monkey-patching createAuthPlugin's return value — preserves a clean upgrade story when framework auth options change"
  - "Skip /_agent-native/auth/* + /_agent-native/google/* (not /_better_auth/* as the plan referenced) — verified by reading node_modules/@agent-native/core/dist/server/auth.js where Better-auth catch-all mounts at /_agent-native/auth/ba/* and Google OAuth lives at /_agent-native/google/callback. Kept /_better_auth in the skip list as forward-compat in case the framework renames"
  - "Sign-out from inside the denial page CTA (POST /_agent-native/auth/logout via back-compat handler wrapping auth.api.signOut), NOT from inside the allowlist middleware — the latter risks the OAuth-loop trap (P1b.1-RESEARCH Pitfall 4)"
  - "Empty/unset CUSTOMER_ALLOWED_EMAILS = dev fallback (every authenticated Google account passes) — lets local dev work without a per-engineer allowlist row"

patterns-established:
  - "Allowlist-middleware skip list: any middleware that issues a 302 to an unauth URL must enumerate framework auth/OAuth paths + static assets + manifests, not rely on the framework's own guard skip list (they run as separate H3 middleware)"
  - "Sign-in entrypoint URL: /_agent-native/google/auth-url?redirect=1 — verified by reading the framework's auth.js handler that builds the Google consent URL and 302s when ?redirect=1 is present"
  - "Sign-out endpoint URL: /_agent-native/auth/logout (POST) — verified as the back-compat handler that wraps auth.api.signOut + clearFrameworkSessionCookies + clearDesktopSso"

requirements-completed: [AUTH-01]

# Metrics
duration: 25min
completed: 2026-05-25
---

# Phase P1b.1 Plan 02: Auth Allowlist + Access Denied Summary

**Env-var email allowlist (CUSTOMER_ALLOWED_EMAILS) gates /gymos via a composable Nitro plugin that runs after Better-auth's Google OAuth session is established, with a branded /access-denied React Router v7 route for rejected sign-ins.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-25T22:00:00Z
- **Completed:** 2026-05-25T22:25:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 modified, 2 created)

## Accomplishments

- CUSTOMER_ALLOWED_EMAILS env-var allowlist enforced post-session in apps/staff-web — any Google account not on the list redirects to /access-denied before reaching /gymos
- Dev fallback preserved: empty/unset allowlist bypasses enforcement so local dev works without per-engineer config
- /access-denied is a branded full-page route (GymClassOS wordmark + IconLock + heading + body + "Sign in with a different account" CTA) matching the UI-SPEC §4 contract verbatim
- Sign-out flow verified against framework source: POST /_agent-native/auth/logout (back-compat handler wrapping auth.api.signOut), then 302 to /_agent-native/google/auth-url?redirect=1 to start a fresh consent flow
- OAuth callback loop avoided: middleware enumerates the full set of framework auth + Google OAuth paths to skip, so the gate never intercepts the round-trip
- typecheck (`pnpm --filter staff-web typecheck`) is green on both task commits

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CUSTOMER_ALLOWED_EMAILS allowlist middleware to auth.ts** - `d8ca108e` (feat)
2. **Task 2: Build the branded /access-denied route** - `b8814453` (feat)

**Plan metadata:** (pending — added in the final docs commit alongside SUMMARY/STATE/ROADMAP)

## Files Created/Modified

- `apps/staff-web/server/plugins/auth.ts` — composed `createAuthPlugin` with a follow-on H3 middleware (`allowlistHandler`) attached via `getH3App(nitroApp).use(...)`. Added `/access-denied` to the existing `publicPaths` array. The handler reads the session via `getSession(event)` (the verified framework export) and 302s to `/access-denied` if `session.user.email` is not in the parsed allowlist. Skips the full set of framework auth paths (`/_agent-native/auth/*`, `/_agent-native/google/*`), static assets, and public routes.
- `apps/staff-web/.env.example` — created. Documents `CUSTOMER_ALLOWED_EMAILS` with the pilot-only / replaced-in-P1a comment from the plan.
- `apps/staff-web/app/routes/access-denied.tsx` — created. Presentational React component (no loader/action). Uses `@/components/ui/button` (the project's shadcn Button) + `IconLock` from `@tabler/icons-react` per the UI-SPEC. CTA handler does `fetch("/_agent-native/auth/logout", { method: "POST" })` then `window.location.href = "/_agent-native/google/auth-url?redirect=1"`. `meta()` exports `noindex` so the denial page never appears in search results.

## Decisions Made

- **Composition over patching the framework plugin** — `createAuthPlugin` returns a single async `(nitroApp) => Promise<void>` function. Wrapped it in `staffWebAuthPlugin` which awaits the framework plugin first (so auth routes + guard are mounted), then attaches my own handler via `getH3App(nitroApp).use(allowlistHandler)`. This ordering guarantees the session cookie is already set when my handler runs. Confirmed against `autoMountAuth` source in `node_modules/@agent-native/core/dist/server/auth.js:2520`.
- **Verified path semantics by reading the framework, not by guessing.** The plan referenced `/_better_auth/*` (a stale name); actual paths are `/_agent-native/auth/*` (Better-auth catch-all at `/ba`) and `/_agent-native/google/*` (Google OAuth start/callback). Skip list covers both, plus the legacy `/_better_auth` prefix as forward-compat insurance.
- **Sign-out lives on the denial page, not in the middleware.** Per the plan's Task 1 step 5 and P1b.1-RESEARCH Pitfall 4: invalidating the session from inside the gate risks bouncing the user back through the Google consent screen, which then re-establishes the session with the same disallowed email and loops forever. The page CTA gives the user an explicit "Sign in with a different account" affordance instead.
- **Did not add `/access-denied` to the middleware's local skip list AND the framework's `publicPaths`** — needed both. `publicPaths` lets unauthenticated visitors reach the page (the framework guard would otherwise serve `loginHtml` for any unknown path). The middleware skip ensures the allowlist hook itself doesn't 302 again when the user lands on it post-redirect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan referenced `/_better_auth/*` framework paths that don't exist in the installed @agent-native/core**
- **Found during:** Task 1 (Add allowlist middleware)
- **Issue:** The plan's middleware sample and the access-denied CTA both pointed at `/_better_auth/*` paths. Reading `node_modules/@agent-native/core/dist/server/auth.js` showed the framework mounts everything under `/_agent-native/auth/*` (back-compat handlers) and Better-auth's catch-all at `/_agent-native/auth/ba/*`. Google OAuth lives at `/_agent-native/google/*`. Following the plan verbatim would have left the OAuth callback unprotected against the gate (Pitfall 4) AND made the access-denied page's sign-out / sign-in CTAs 404.
- **Fix:** Skip list now enumerates `/_agent-native/auth/`, `/_agent-native/google/`, AND `/_better_auth` (forward-compat). Sign-out CTA POSTs to `/_agent-native/auth/logout`. Sign-in CTA navigates to `/_agent-native/google/auth-url?redirect=1` (the verified framework endpoint that builds the Google consent URL).
- **Files modified:** apps/staff-web/server/plugins/auth.ts, apps/staff-web/app/routes/access-denied.tsx
- **Verification:** typecheck green; comments in both files spell out the verification source so the next agent doesn't re-discover this.
- **Committed in:** d8ca108e (Task 1) + b8814453 (Task 2)

**2. [Rule 2 - Missing Critical] Added `/_*` blanket skip + `/login` + `/signup` + `/__manifest` + `/assets/` + `pathname.includes('.')` to the middleware**
- **Found during:** Task 1
- **Issue:** The plan's skip list missed framework internals (`/_agent-native/*`, `/_build/*`), the framework-owned auth entry pages (`/login`, `/signup`), the React Router v7 manifest fetch (`/__manifest`), and the static-asset path patterns (`/assets/`, anything with `.` in the URL). Without these, every static-asset request and every framework health route would run the session lookup, slowing things down AND any browser-internal redirect to `/login` would loop through the allowlist hook.
- **Fix:** Added the broader set of skips, matching the framework's own guard skip-list shape (mirrored from `createAuthGuardFn` in `node_modules/@agent-native/core/dist/server/auth.js`).
- **Files modified:** apps/staff-web/server/plugins/auth.ts
- **Verification:** typecheck green; manual review against framework guard.
- **Committed in:** d8ca108e (Task 1)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes essential. Following the plan verbatim would have shipped a broken sign-in CTA and a vulnerable middleware (would intercept OAuth callbacks for any allowlist-disallowed email mid-flow). No scope creep — both fixes are inside the boundary of "wire the allowlist hook + the denial page".

## Issues Encountered

- The plan's `<read_first>` told me to verify the framework session-read API by running `node -e "console.log(Object.keys(require('@agent-native/core/server')))"`. Did that — `getSession` is exported directly. Used `await getSession(event)` (matches H3 event API). The return shape is `{ user: { email, ... }, ... } | null` (read via `(session as { user?: { email?: string } })?.user?.email` for type safety).
- The plan suggested two wiring patterns ((a) append to plugin array, (b) defineNitroPlugin + hooks.hook("request", ...)). Neither fits cleanly: `createAuthPlugin` returns a single async fn, not an array, and Nitro 'request' hooks are upstream of the H3 middleware chain (so the session cookie hasn't been validated yet). The correct pattern is the compose-and-attach approach above. Documented in the file comment.

## User Setup Required

No external service configuration required for the code change itself. However, **to activate the allowlist in the pilot deployment**, the customer's Vercel project needs:

```
CUSTOMER_ALLOWED_EMAILS=<customer-email-1>,<customer-email-2>,...
```

Set via `vercel env add CUSTOMER_ALLOWED_EMAILS` (production scope). When unset, the gate degrades to "any authenticated Google account passes" — fine for the demo URL, NOT fine once the URL is shared with the customer's prospects.

This is a P1b.1-08-end-to-end-verification responsibility, not a P1b.1-02 responsibility.

## Next Phase Readiness

- AUTH-01 requirement complete for the pilot acceptance criterion #1 ("Customer signs in with their own credentials and lands on /gymos").
- The Better-auth Google OAuth path is end-to-end intact (the allowlist gate skips every framework auth/OAuth path so the round-trip is never intercepted).
- `/access-denied` page is implemented + reachable + branded; the negative-auth test (success criterion in the phase ROADMAP) will exercise it end-to-end in P1b.1-08.
- No downstream plan in P1b.1 touches `apps/staff-web/server/plugins/auth.ts` — safe to merge in parallel with the other wave-1 plans (P1b.1-01, -03, -04, etc.) that other agents are working on.

## Self-Check

Checked created files exist:
- FOUND: apps/staff-web/server/plugins/auth.ts
- FOUND: apps/staff-web/app/routes/access-denied.tsx
- FOUND: apps/staff-web/.env.example

Checked commits exist:
- FOUND: d8ca108e (Task 1)
- FOUND: b8814453 (Task 2)

## Self-Check: PASSED

---
*Phase: P1b.1-customer-pilot-enablement*
*Completed: 2026-05-25*
