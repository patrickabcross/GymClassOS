---
phase: R4-staff-web-visual-refresh
plan: 07
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/root.tsx
  - apps/staff-web/app/components/gymos/GymosTopNav.tsx
autonomous: true
requirements: [SWEB-07, SWEB-08]
user_setup:
  - service: gymos-admin-allowlist
    why: "Role-based nav: which staff emails see admin tabs (Payments/Analytics/Campaigns/Forms/Settings)"
    env_vars:
      - name: GYMOS_ADMIN_EMAILS
        source: "Vercel project env — comma-separated admin emails; unset/empty = everyone is admin (single-pilot default)"
must_haves:
  truths:
    - "Coaches (non-admin) see only Home / Messages / Schedule / Members in the top nav"
    - "Admins additionally see Payments / Analytics / Campaigns / Forms / Settings"
    - "Admin tabs are omitted from the DOM for coaches (not merely hidden via CSS)"
    - "Staff web renders in light theme on hard reload regardless of system preference; no dark toggle appears in any /gymos surface"
  artifacts:
    - path: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      provides: "Role-gated nav links (admin tabs conditional on isAdmin)"
      contains: "isAdmin"
    - path: "apps/staff-web/app/root.tsx"
      provides: "Light-locked ThemeProvider + admin-allowlist surfaced from root loader"
      contains: "defaultTheme=\"light\""
  key_links:
    - from: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      to: "session email vs admin allowlist"
      via: "client fetch of /_agent-native/auth/session compared to root-loader adminEmails"
      pattern: "/_agent-native/auth/session|isAdmin"
---

<objective>
Apply R4-UI-SPEC §6: gate Payments/Analytics/Campaigns/Forms/Settings behind an admin role in GymosTopNav (SWEB-07), and lock the staff web to light theme with no dark toggle (SWEB-08).

Purpose: SWEB-07 (coaches see Schedule/Messages/Members; admins additionally see Payments/Settings etc.) and SWEB-08 (staff web defaults to light; dark removed — not a toggle).
Output: Updated `root.tsx` (light-lock ThemeProvider + surface an admin-email allowlist from the loader) and `GymosTopNav.tsx` (conditional admin tabs). Lowest-risk role signal per plan-time research below.

Plan-time research finding (grounds the role mechanism): no RR v7 loader in staff-web currently reads the Better-auth session — `getSession` from `@agent-native/core/server` is H3-event-only (server plugins/handlers), and the root loader receives a web Request, not the H3 event. Wiring session→root-loader is auth infrastructure beyond R4's presentation scope and risks the OAuth-loop trap flagged in server/plugins/auth.ts. Instead, R4 reuses the framework's client-fetchable `/_agent-native/auth/session` endpoint (already used by the agent-chat adapter) to read the signed-in email client-side, and compares it to an env admin allowlist (`GYMOS_ADMIN_EMAILS`) surfaced through the root loader — mirroring the existing `CUSTOMER_ALLOWED_EMAILS` pattern. This is presentation-only and additive; server-side route authorization is explicitly out of R4 scope per R4-UI-SPEC §6.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/R4-staff-web-visual-refresh/R4-UI-SPEC.md

<interfaces>
root.tsx loader currently returns `{ skin: { name, ...skin }, accentHex }`. The Layout reads it via useRouteLoaderData("root"); GymosTopNav also reads root loader data via useRouteLoaderData("root") for skin.displayName/logo.
root.tsx ThemeProvider (lines 284-289): `attribute={["class","data-theme"]} defaultTheme="system" enableSystem disableTransitionOnChange`.
GymosTopNav (full file ~103 lines) renders Home, Messages, Schedule, Members, Payments, Analytics, Campaigns, Forms, Settings (ml-auto), Sign out. Active-tab styling via `tabClass(active)`. It already does a client `fetch("/_agent-native/auth/logout", ...)` in handleSignOut — same-origin client fetch from this component is an established pattern.
Framework endpoint: `GET /_agent-native/auth/session` returns the current session JSON (used in packages/core/dist/client/agent-chat-adapter.js). Session user email is at `session.user.email` (confirmed by server/plugins/auth.ts line 123: `(session as { user?: { email?: string } })?.user?.email`).
ThemeToggle lives only in the email AppLayout (apps/staff-web/app/components/layout/AppLayout.tsx), which is already short-circuited for /gymos/* (P1b.1-01) — so no ThemeToggle renders on gymos surfaces. The SWEB-08 change is the root ThemeProvider default + ensuring no dark toggle is reachable from /gymos.
The `.dark` CSS block in global.css must stay dormant (R2 skin cascade — skins declared after .dark). Do NOT delete it.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Light-lock the theme + surface admin allowlist from the root loader (SWEB-08)</name>
  <files>apps/staff-web/app/root.tsx, apps/staff-web/app/components/gymos/GymosTopNav.tsx</files>
  <read_first>
    - apps/staff-web/app/root.tsx (loader lines 58-69, Layout, ThemeProvider lines 284-289)
    - R4-UI-SPEC.md §6 "SWEB-08: Light theme default, dark toggle removed"
    - apps/staff-web/server/plugins/auth.ts (lines 62-68, the parseAllowedEmails env pattern to mirror)
  </read_first>
  <action>
    1. Theme lock: change the root `<ThemeProvider>` props to lock light. Replace `defaultTheme="system" enableSystem` with `defaultTheme="light"` and REMOVE `enableSystem` (explicit light lock per R4-UI-SPEC §6 — "Do NOT set enableSystem"). Keep `attribute={["class","data-theme"]}` and `disableTransitionOnChange`. `next-themes` stays installed; only the system/dark behavior is removed. Do NOT touch the `.dark` block in global.css (R2 skin cascade depends on its presence).
    2. Admin allowlist: in the root `loader`, read `process.env.GYMOS_ADMIN_EMAILS` (comma-separated, lowercased, trimmed) into a string array `adminEmails`. When unset/empty, return `adminEmails: []` AND a flag `adminOpen: true` meaning "no allowlist configured → treat everyone as admin" (single-pilot default — matches the CUSTOMER_ALLOWED_EMAILS empty-list-passes-everyone behavior in auth.ts). Add both to the loader return object. Do NOT log or expose any secret. These are non-sensitive role hints only.
  </action>
  <acceptance_criteria>
    - `grep -n "defaultTheme=\"light\"" apps/staff-web/app/root.tsx` returns a match
    - `grep -n "enableSystem" apps/staff-web/app/root.tsx` returns NO match (removed)
    - `grep -n "GYMOS_ADMIN_EMAILS" apps/staff-web/app/root.tsx` returns a match
    - `grep -n "adminEmails\|adminOpen" apps/staff-web/app/root.tsx` returns matches in the loader return
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>ThemeProvider is light-locked (no system/dark); root loader surfaces adminEmails + adminOpen; .dark CSS untouched; guard exits 0.</done>
</task>

<task type="auto">
  <name>Task 2: Role-gated nav in GymosTopNav (SWEB-07)</name>
  <files>apps/staff-web/app/root.tsx, apps/staff-web/app/components/gymos/GymosTopNav.tsx</files>
  <read_first>
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx (full file)
    - R4-UI-SPEC.md §6 "SWEB-07: Role-based nav" (nav-items-by-role table, "omit from DOM not CSS", "Fallback: undefined role → coach-level")
  </read_first>
  <action>
    Gate the admin tabs (Payments, Analytics, Campaigns, Forms, Settings) behind an `isAdmin` boolean computed client-side:

    1. Read the root loader's `adminEmails` + `adminOpen` via the existing `useRouteLoaderData("root")` call (extend the cast type to include `adminEmails?: string[]; adminOpen?: boolean`).
    2. Add client state `const [email, setEmail] = useState<string | null>(null)` and a `useEffect` that fetches the session once on mount:
       ```tsx
       useEffect(() => {
         let active = true;
         fetch("/_agent-native/auth/session", { credentials: "include" })
           .then((r) => (r.ok ? r.json() : null))
           .then((s) => { if (active) setEmail((s?.user?.email ?? null)); })
           .catch(() => {});
         return () => { active = false; };
       }, []);
       ```
       (Import `useState, useEffect` from "react".)
    3. Compute `const isAdmin = adminOpen || (email != null && adminEmails.includes(email.toLowerCase()));` — when no allowlist is configured (`adminOpen`), everyone is admin (single-pilot default). When the session hasn't resolved yet (`email == null` and not adminOpen), `isAdmin` is false → coach-level tabs only (the §6 fallback: undefined role shows coach tabs).
    4. Always render Home, Messages, Schedule, Members. Wrap the Payments, Analytics, Campaigns, Forms `<Link>`s AND the Settings `<Link>` in `{isAdmin && ( ... )}` so they are OMITTED from the DOM for coaches (not CSS-hidden, per §6). Keep Sign out always visible. Keep `ml-auto` on the first right-aligned element that is always present — move `ml-auto` from Settings to the Sign-out button (since Settings is now conditional) OR wrap Settings+Sign-out in a right-aligned group with `ml-auto` on the group container so the right cluster stays right-aligned whether or not Settings renders.

    Keep all existing tab styling (`tabClass`, active detection, studio logo/name header) unchanged.
  </action>
  <acceptance_criteria>
    - `grep -n "isAdmin" apps/staff-web/app/components/gymos/GymosTopNav.tsx` returns matches (compute + at least the Payments/Settings guards)
    - `grep -n "/_agent-native/auth/session" apps/staff-web/app/components/gymos/GymosTopNav.tsx` returns a match
    - `grep -n "adminEmails\|adminOpen" apps/staff-web/app/components/gymos/GymosTopNav.tsx` returns matches
    - `grep -n "isAdmin &&" apps/staff-web/app/components/gymos/GymosTopNav.tsx` returns multiple matches wrapping admin tabs
    - The four coach tabs remain unconditional: `grep -n "to=\"/gymos/messages\"\|to=\"/gymos/schedule\"\|to=\"/gymos/members\"" apps/staff-web/app/components/gymos/GymosTopNav.tsx` returns matches NOT inside an isAdmin guard
    - `grep -n "ml-auto" apps/staff-web/app/components/gymos/GymosTopNav.tsx` returns a match (right cluster stays right-aligned)
    - `node scripts/guard-no-hardcoded-colors.mjs` exits 0
  </acceptance_criteria>
  <verify>
    <automated>node scripts/guard-no-hardcoded-colors.mjs</automated>
  </verify>
  <done>Coaches see Home/Messages/Schedule/Members; admins additionally see Payments/Analytics/Campaigns/Forms/Settings (DOM-omitted for coaches); right cluster stays aligned; guard exits 0.</done>
</task>

</tasks>

<verification>
- `node scripts/guard-no-hardcoded-colors.mjs` exits 0.
- `npx prettier --write apps/staff-web/app/root.tsx apps/staff-web/app/components/gymos/GymosTopNav.tsx` runs clean.
- Static grep confirms light-lock (no enableSystem), admin-allowlist plumbing, and DOM-level admin-tab gating.
- Coach-vs-admin nav and light-on-hard-reload are deploy/UAT: sign in as a coach email (not in GYMOS_ADMIN_EMAILS) → confirm admin tabs absent; sign in as admin → all tabs; hard-reload any /gymos/* → light theme, no dark toggle.
</verification>

<success_criteria>
SWEB-07 + SWEB-08: nav is role-gated (admin tabs DOM-omitted for coaches via session-email vs GYMOS_ADMIN_EMAILS), and the staff web is light-locked with no dark toggle and the dormant .dark cascade preserved.
</success_criteria>

<output>
After completion, create `.planning/phases/R4-staff-web-visual-refresh/R4-07-role-nav-and-light-theme-SUMMARY.md`
Run `npx prettier --write` on the two modified files.
</output>
