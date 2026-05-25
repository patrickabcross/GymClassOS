---
phase: P1b.1-customer-pilot-enablement
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/plugins/auth.ts
  - apps/staff-web/app/routes/access-denied.tsx
  - apps/staff-web/.env.example
autonomous: true
requirements: [AUTH-01]
must_haves:
  truths:
    - "Signing in with a Google account whose email is NOT in CUSTOMER_ALLOWED_EMAILS lands the user on a branded /access-denied page (not /gymos)"
    - "Signing in with a Google account whose email IS in CUSTOMER_ALLOWED_EMAILS lands the user on /gymos with no extra redirects"
    - "If CUSTOMER_ALLOWED_EMAILS is empty/unset the allowlist is bypassed (dev fallback — anyone authenticated can sign in)"
    - "/access-denied is a public route reachable without a session and shows GymClassOS-branded copy + Sign in with a different account CTA"
  artifacts:
    - path: "apps/staff-web/server/plugins/auth.ts"
      provides: "Allowlist middleware hook that runs after session creation, sign out + redirect to /access-denied on mismatch"
      contains: "CUSTOMER_ALLOWED_EMAILS"
    - path: "apps/staff-web/app/routes/access-denied.tsx"
      provides: "Branded access-denied page with GymClassOS wordmark, IconLock, heading, body, sign-out CTA"
      min_lines: 40
    - path: "apps/staff-web/.env.example"
      provides: "Documented CUSTOMER_ALLOWED_EMAILS env var with explanatory comment"
      contains: "CUSTOMER_ALLOWED_EMAILS"
  key_links:
    - from: "apps/staff-web/server/plugins/auth.ts"
      to: "/access-denied"
      via: "sendRedirect on allowlist mismatch + publicPaths inclusion"
      pattern: "/access-denied"
    - from: "apps/staff-web/app/routes/access-denied.tsx"
      to: "Better-auth sign-out endpoint"
      via: "fetch('/_better_auth/sign-out') then redirect"
      pattern: "_better_auth"
---

<objective>
Gate the deployed staff-web behind an env-var email allowlist so only the customer's nominated Google accounts can reach `/gymos`. Add a branded `/access-denied` page for rejected sign-ins.

Purpose: The customer pilot is on a live URL (`gym-class-os.vercel.app`). Anyone with a Google account who knows the URL could currently sign in and reach the inbox. The allowlist gates access to a known set of customer emails until P1a's org-based ACL lands.

Output:
- `apps/staff-web/server/plugins/auth.ts` — allowlist hook + `/access-denied` added to publicPaths
- `apps/staff-web/app/routes/access-denied.tsx` — new branded page
- `apps/staff-web/.env.example` — documented env var
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md
@apps/staff-web/server/plugins/auth.ts
@apps/staff-web/server/lib/google-auth.ts

<interfaces>
<!-- Better-auth + framework auth plugin API. Executor MUST verify exact API by reading @agent-native/core/server before writing the middleware. -->

From apps/staff-web/server/plugins/auth.ts (current shape):
```typescript
// Calls createAuthPlugin(...) from @agent-native/core/server with options:
// {
//   googleOnly: true,
//   mountGoogleOAuthRoutes: false,
//   googleScopes: ["...profile", "...email"],
//   marketing: { ... },
//   publicPaths: ["/api/m", "/pick-member", "/webhooks/whatsapp"],
// }
```

From `@agent-native/core/server` (verify at task time):
- `createAuthPlugin(options)` returns a Nitro/H3 plugin
- Session reading: likely `auth.api.getSession({ headers: event.headers })` or `getSession(event)` — exact API MUST be verified by reading the source

From H3:
- `defineEventHandler`, `sendRedirect(event, path)`, `getRequestHeaders(event)`, `getRequestURL(event)`

Path semantics:
- `/_better_auth/*` paths (callback URLs, sign-out, etc.) MUST be skipped by the allowlist or the OAuth callback loop breaks (Pitfall 4 in research)
- `/access-denied` MUST be in `publicPaths` so unsigned-in users can see it after the forced sign-out
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add CUSTOMER_ALLOWED_EMAILS allowlist middleware to auth.ts</name>
  <files>apps/staff-web/server/plugins/auth.ts</files>
  <read_first>
    - apps/staff-web/server/plugins/auth.ts — current full file; observe `createAuthPlugin` call shape, current `publicPaths` array
    - apps/staff-web/server/lib/google-auth.ts — confirms Google OAuth scopes already narrowed (per quick task 260524-r8f); no changes here
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 4. Auth Allowlist (D-07)" — exact middleware shape + Pitfall 4 (skip /_better_auth/*)
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Open Questions > 1. Better-auth createAuthPlugin after-signin hook API" — note: MEDIUM confidence; executor MUST verify the exact session-read API by inspecting `node_modules/@agent-native/core/server` exports OR `node_modules/@agent-native/core/dist/server/*` before coding
    - node_modules/@agent-native/core/server (or dist equivalent) — find the getSession or auth.api.getSession export and confirm the function signature
  </read_first>
  <action>
1. **Verify the framework session-read API.** Read `node_modules/@agent-native/core/server` exports (try `node -e "console.log(Object.keys(require('@agent-native/core/server')))"` from inside `apps/staff-web/`). Identify the function that reads a session given an H3 event or headers. Common candidates: `auth.api.getSession({ headers })`, `getSession(event)`, or a re-export. Confirm exact name + signature before writing the middleware.

2. **Add `/access-denied` to the existing `publicPaths` array** in `apps/staff-web/server/plugins/auth.ts`. Final array:
   ```typescript
   publicPaths: ["/api/m", "/pick-member", "/webhooks/whatsapp", "/access-denied"],
   ```

3. **Add an H3 event handler / middleware below the `createAuthPlugin(...)` call** that enforces the allowlist. Concrete shape (adapt path/API names to the verified framework export):

   ```typescript
   // Allowlist gate: runs after session is established, redirects mismatches to /access-denied.
   // Pilot single-tenant ACL — replace with org-based ACL in P1a (AUTH-02).
   import { defineEventHandler, sendRedirect, getRequestURL } from "h3";
   // import { auth } from "@agent-native/core/server"; // or whatever the verified import is

   export const allowlistHandler = defineEventHandler(async (event) => {
     const url = getRequestURL(event);
     const pathname = url.pathname;

     // Never gate the auth callbacks, public routes, static assets, or the access-denied page itself.
     if (
       pathname.startsWith("/_better_auth") ||
       pathname.startsWith("/api/m") ||
       pathname.startsWith("/pick-member") ||
       pathname.startsWith("/webhooks/") ||
       pathname.startsWith("/access-denied") ||
       pathname.startsWith("/_") ||      // framework internals (_agent-native, _build, _assets)
       pathname.startsWith("/assets") ||
       pathname.includes(".")             // static files (.css, .js, .png, etc.)
     ) {
       return;
     }

     // Read session via the verified framework API.
     const session = await /* auth.api.getSession or getSession */(event);
     if (!session) return; // unauthenticated — auth plugin handles sign-in redirect

     const email = (session as any).user?.email;
     if (!email) return;

     const allowed = (process.env.CUSTOMER_ALLOWED_EMAILS ?? "")
       .split(",")
       .map((s) => s.trim().toLowerCase())
       .filter(Boolean);

     // Dev fallback: empty/unset allowlist = everyone authenticated passes.
     if (allowed.length === 0) return;

     if (!allowed.includes(email.toLowerCase())) {
       // Force sign-out then redirect to branded denial page.
       // The /access-denied page CTA re-triggers sign-in on a different account.
       return sendRedirect(event, "/access-denied", 302);
     }
   });
   ```

4. **Wire the handler into the Nitro plugin chain.** The exact wiring depends on what `createAuthPlugin` returns. Two common patterns:
   - **(a)** If `createAuthPlugin` returns an array of plugins/middleware, append `allowlistHandler` to the array.
   - **(b)** If `auth.ts` exports a default plugin, register `allowlistHandler` as a `defineNitroPlugin` that calls `nitroApp.hooks.hook("request", ...)`.
   
   Pick whichever fits the existing plugin shape. The handler MUST run AFTER auth session creation (so the session cookie exists) and BEFORE route handlers.

5. **Sign-out call inside the middleware: do NOT call sign-out here.** The redirect to `/access-denied` is enough — the user can use the page's CTA to sign out and try a different account. (Signing out inside this middleware risks the OAuth-loop trap from Pitfall 4. The page-driven sign-out is safer.)

6. **Add `CUSTOMER_ALLOWED_EMAILS` to `apps/staff-web/.env.example`** with this exact comment:
   ```
   # CUSTOMER_ALLOWED_EMAILS — comma-separated emails allowed to sign in to /gymos.
   # Empty or unset = dev fallback (no allowlist enforcement). Pilot-only gate, replaced by org-based ACL in P1a.
   CUSTOMER_ALLOWED_EMAILS=
   ```

Run `pnpm --filter staff-web typecheck` after the edits.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "CUSTOMER_ALLOWED_EMAILS" apps/staff-web/server/plugins/auth.ts` returns at least 1
    - `grep -c "CUSTOMER_ALLOWED_EMAILS" apps/staff-web/.env.example` returns at least 1
    - `grep -c "/access-denied" apps/staff-web/server/plugins/auth.ts` returns at least 2 (one in publicPaths, one in redirect target)
    - `grep -c "_better_auth" apps/staff-web/server/plugins/auth.ts` returns at least 1 (Pitfall 4 skip)
    - The middleware logic includes a string `"/_better_auth"` AND a string `"/access-denied"` in path-skip checks
    - The middleware logic includes a `.split(",")` over `process.env.CUSTOMER_ALLOWED_EMAILS`
    - The empty-allowlist fallback exists (an `if (allowed.length === 0) return;` or equivalent so unset env doesn't lock everyone out)
    - `pnpm --filter staff-web typecheck` exits with code 0
  </acceptance_criteria>
  <done>
With `CUSTOMER_ALLOWED_EMAILS=patrickalexanderross@outlook.com` set in env, signing in with `patrickalexanderross@outlook.com` lands on `/gymos`. Signing in with any other Google account redirects to `/access-denied`. With `CUSTOMER_ALLOWED_EMAILS` unset, any authenticated Google account reaches `/gymos` (dev fallback). The OAuth callback flow at `/_better_auth/callback/google` is never intercepted.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build the branded /access-denied route</name>
  <files>apps/staff-web/app/routes/access-denied.tsx</files>
  <read_first>
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md §"Surface Specifications > 4. Customer Login / Access Denied Page" — exact layout, sizing, copy
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md §"Copywriting Contract" — exact strings for heading, body, CTA, brand wordmark
    - apps/staff-web/app/components/ui/button.tsx — Button component API (variant=outline available)
    - .agents/skills/shadcn-ui/SKILL.md — shadcn component usage patterns (if present, for reference)
  </read_first>
  <action>
Create new file `apps/staff-web/app/routes/access-denied.tsx`. This is a public React Router v7 route — no loader, no action, just a presentational page.

Use this exact structure:

```tsx
import { IconLock } from "@tabler/icons-react";
import { Button } from "~/components/ui/button";

export default function AccessDenied() {
  const handleSignInDifferent = async () => {
    // Sign out the current Better-auth session then redirect to Google sign-in.
    // The exact sign-out endpoint depends on the framework — verify at code time.
    await fetch("/_better_auth/sign-out", { method: "POST", credentials: "include" }).catch(() => {});
    // Trigger a fresh Google sign-in (the framework's standard sign-in path).
    window.location.href = "/_better_auth/sign-in/social?provider=google";
  };

  return (
    <main
      role="main"
      className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-6"
    >
      <div className="text-sm font-semibold text-foreground">GymClassOS</div>
      <IconLock size={40} className="text-muted-foreground" aria-hidden />
      <h1 className="text-sm font-semibold text-foreground">Access not permitted</h1>
      <p className="max-w-[320px] text-center text-[13px] leading-[1.5] text-muted-foreground">
        Your account isn't on the approved list for this studio. Contact your studio admin to get access.
      </p>
      <Button variant="outline" onClick={handleSignInDifferent}>
        Sign in with a different account
      </Button>
    </main>
  );
}
```

Copy strings MUST be verbatim from the UI-SPEC copywriting contract:
- Brand wordmark: `GymClassOS` (14px semibold per UI-SPEC §4 corrected — `text-sm font-semibold`)
- Heading: `Access not permitted` (14px semibold — `text-sm font-semibold`)
- Body: `Your account isn't on the approved list for this studio. Contact your studio admin to get access.` (13px muted, max-width 320px)
- CTA: `Sign in with a different account` (variant=outline)
- IconLock from `@tabler/icons-react` at size 40

Verify the sign-out endpoint URL by inspecting `node_modules/@agent-native/core` exports or looking for any existing `signOut()` usage in the codebase (try `grep -r "sign-out" apps/staff-web/app/`). If a framework helper exists (e.g. `auth.signOut()` from a client SDK), use that instead of raw `fetch`. The `.catch(() => {})` is intentional — if sign-out fails, still redirect to sign-in.

Run `pnpm --filter staff-web typecheck` after creating the file.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/app/routes/access-denied.tsx` exists
    - Contains literal string `"GymClassOS"` (the wordmark)
    - Contains literal string `"Access not permitted"` (the heading — exact UI-SPEC copy)
    - Contains literal string `"Your account isn't on the approved list for this studio. Contact your studio admin to get access."` (the body — exact UI-SPEC copy)
    - Contains literal string `"Sign in with a different account"` (the CTA — exact UI-SPEC copy)
    - Imports `IconLock` from `@tabler/icons-react` (no emoji icons)
    - Imports `Button` from a shadcn UI path (`~/components/ui/button` or equivalent project path)
    - Uses `variant="outline"` on the Button
    - No `window.confirm`, `window.alert`, `window.prompt` calls (per AGENTS.md no-browser-dialogs rule)
    - `pnpm --filter staff-web typecheck` exits with code 0
    - File line count ≥ 30 lines (small page but meaningful component, not a stub)
  </acceptance_criteria>
  <done>
Navigating to `/access-denied` (publicly, no auth required) shows: GymClassOS wordmark at top, IconLock below it (40px, muted gray), heading "Access not permitted", body paragraph (max 320px, centered), "Sign in with a different account" outline button. Clicking the button signs out the current session and redirects to Google sign-in. The page is fully responsive (centered both axes via flex). Renders correctly in dark mode (uses only semantic tokens, no hardcoded colors).
  </done>
</task>

</tasks>

<verification>
- `auth.ts` has `/access-denied` in publicPaths AND has the CUSTOMER_ALLOWED_EMAILS middleware
- `/access-denied` route exists with branded copy matching UI-SPEC
- `.env.example` documents the new env var
- TypeScript compiles
- Pitfall 4 (OAuth callback loop) avoided by `/_better_auth` skip
</verification>

<success_criteria>
1. Customer can sign in with their nominated Google account and reach `/gymos` (ROADMAP success criterion #1)
2. Non-allowlisted Google accounts land on the branded `/access-denied` page
3. Allowlist gracefully degrades to "no enforcement" when env var is empty (dev safety)
4. OAuth callback flow is not intercepted by the allowlist
</success_criteria>

<output>
After completion, create `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-02-auth-allowlist-access-denied-SUMMARY.md` documenting:
- The verified framework session-read API (which import/function call worked)
- The exact wiring approach used (defineNitroPlugin vs append-to-plugin-array vs other)
- The verified sign-out endpoint URL used in the access-denied page
- Any deviation from the planned middleware shape
</output>
