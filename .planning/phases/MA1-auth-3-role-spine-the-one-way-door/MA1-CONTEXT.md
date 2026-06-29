# Phase MA1: Auth + 3-Role Spine (the one-way door) - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

A member / teacher / admin signs into the **native Expo app** (`packages/mobile-app`) once,
with a **real Better-auth session stored in `expo-secure-store`**, and is silently routed to
the right role (no UI toggle). A member's first authenticated request **claims their existing
`gym_members` row by email**. The whole spine is **device-verified (the auth spike)** —
including the admin SSE call carrying the session — before any role-specific surface (MA2/MA3/MA4)
is built. This phase replaces the D2 demo member-picker + `X-Demo-Member-Id` hack.

**In scope (AUTH-01..07):** sign-in screen (email+password) → session in secure-store →
server-side role resolution (admin > teacher > member) → claim-by-email (+ phone-match fallback)
→ `/api/m/*` bearer-gated from the verified session → the dual-path `requireDemoMember → requireMember`
transition → the auth spike.

**Explicitly NOT in scope (moved to web / deferred):**
- In-app **sign-up** — account creation + password are set **on the web** (studio site subscribe → Stripe → password). The app is **sign-in only**.
- In-app **password reset** — managed on **runstudioai.com**; the app only deep-links to it.
- The **web** subscribe / account / reset pages themselves — an **external workstream**, not built here.
- Any role-specific surface (booking MA2, teacher check-in MA3, admin AI agent MA4, push MA5).

</domain>

<decisions>
## Implementation Decisions

### Authentication method & token storage

- **D-01:** **Email + password** via the framework Better-auth instance (already `emailAndPassword`-on, `bearer()` + `jwt()` already mounted). No new auth method introduced.
- **D-02:** Session token stored in **`expo-secure-store`** — never AsyncStorage. `expo-secure-store` is **not yet installed** in `packages/mobile-app/package.json`; install via `npx expo install expo-secure-store` (SDK-55 pin, never bare npm). Session must persist across app restarts; sign-out clears the token from secure store.

### First-run & account creation (app is sign-in only)

- **D-03:** The app's first screen is **Sign in only**. There is **no in-app sign-up screen** and **no in-app password-reset screen**.
- **D-04:** A **"Join / Subscribe"** affordance on the sign-in screen **deep-links to the studio's own site** (e.g. doyouhustle.co.uk) where the member subscribes + pays (Stripe) and **sets their password on the web during subscribe**. They return to the app and sign in.
- **D-05:** A **"Forgot password?"** affordance **deep-links to the runstudioai.com** web reset page. The app never performs an in-app reset; it only consumes the resulting session.
- **D-06:** The "Join / Subscribe" and "Forgot password" target URLs are **configurable** (studio-global config / env), not hardcoded — repeatable per client (see [[feedback_repeatable_per_client]]). Default subscribe URL = the studio site; default reset URL = runstudioai.com.

### Web account system = external dependency

- **D-07:** MA1 builds **the app side only**: sign-in, secure-store session, claim-by-email, role routing, the spike, and the configurable deep-link URLs. The **web subscribe / account / password-reset pages are a separate workstream** and are NOT built in this phase. (This reinterprets AUTH-02's "sets a password on first sign-up" — that step now lives on the web, not in the app.)
- **D-08:** For **testing / the spike**, accounts are created directly via the **Better-auth sign-up API or a seed** (no app sign-up UI exists). The planner provisions a test member account this way to prove the round-trip.

### Claim-by-email (the security-critical link)

- **D-09:** On the **first authenticated request**, link Better-auth `user` → `gym_members` by **`lower(trim(email))`**. Recommended placement: **lazy, server-side on session resolution** (first authed `/api/m/*` call), decoupled from where the account was created — so MA1 does not depend on the web flow's internals. Final placement is Claude's discretion (see below).
- **D-10:** The claim is **transactional, idempotent, and re-claim-guarded**: guard on `isNull(user_id)`; a re-claim attempt (row already linked to a different user) → **409**; **never auto-create** a `gym_members` row.
- **D-11:** **Do NOT add a unique index on `gym_members.email`.** A **partial unique index already exists** (`gym_members_email_unique ON gym_members(email) WHERE email IS NOT NULL`, in `0003_p1c_public_site_leads.sql`) — claim logic must work *with* it. There is also a partial unique index on `phone_e164`. Mind the dual-unique-key gotcha (see [[project_gymos_member_upsert_keys]]): writing email AND phone together can collide on the *other* key.

### Unmatched-email policy (phone-match fallback)

- **D-12:** When a login email matches **no** `gym_members` row: **prompt for the member's phone number**, normalise to E.164, and try to match a **WhatsApp-only `gym_members` row** by `phone_e164` (the phone partial-unique index). If matched and unclaimed → **link/claim** that row to the new account (same idempotent/re-claim guards as D-10).
- **D-13:** If **neither** email nor phone matches → **403 "No membership on file — contact the studio"** and **notify staff** (existing staff channel; mechanism is Claude's discretion). Never auto-creates a member.

### Role resolution (server-side, no UI toggle)

- **D-14:** Role resolved **server-side** with **strict precedence: admin > teacher > member**.
  - admin = email in **`RUNSTUDIO_OPERATOR_EMAILS`** (already exists; resolved in `apps/staff-web/app/root.tsx`, falls back to the owner email).
  - teacher = email in **`RUNSTUDIO_TEACHER_EMAILS`** (**new** — does not exist in code yet; NOT coupled to `trainers.email`, NOT Better-auth org roles).
  - member = otherwise (resolved via the claimed `gym_members` row).
- **D-15:** **No role-selection toggle anywhere in the UI** — role is auto-detected post-login so the app feels like a pure member app. An **admin who is also a member resolves to admin**.
- **D-16:** Reconcile the existing **`GYMOS_ADMIN_EMAILS`** reference vs `RUNSTUDIO_OPERATOR_EMAILS` at plan time — confirm which is the canonical admin allowlist before wiring the resolver (see Claude's Discretion).

### `/api/m/*` identity & the demo dual-path

- **D-17:** Every `/api/m/*` handler **derives identity from the verified Better-auth session, never a header or body**. Introduce **`requireMember(request)`** alongside the existing `requireDemoMember(request)` — the **`requireDemoMember → requireMember` dual-path**.
- **D-18:** The demo `X-Demo-Member-Id` header is honored **only as a non-production fallback** — `requireDemoMember` stays gated to **`DEMO_MODE === "true"` AND `NODE_ENV !== "production"`**. In production the verified session is always used. This keeps the live demo working until the login screen fully ships (AUTH-06).

### The auth spike (first task — keystone)

- **D-19:** Before any role surface is built, prove **on a real device**: (1) sign-in + **`getSession` round-trip** against the framework Better-auth instance; (2) **claim-by-email** links the `gym_members` row; (3) the **admin SSE call carries the session** — the `Cookie` / `Authorization: Bearer` header **survives the `react-native-sse` streaming POST**, with a **bearer fallback** if the cookie path is stripped. The session shape is already confirmed to expose **`userId`** (scout-verified) — one of the flagged confirmations is resolved.

### Claude's Discretion (planner/researcher decide)

- **`expo()` Better-auth server plugin** wiring — **absent today**; confirm whether `createAuthPlugin` can forward it (or it's mounted on the core instance), and whether the expo client SecureStore adapter is the right integration (this forks the MA1 design — flagged for research).
- **`trustedOrigins`** — **absent today**; native clients may need it for the Better-auth flow. Confirm requirement and wiring.
- **The `bearer()` `set-auth-token` header name** on better-auth `^1.6.0` — confirm the exact header to read on the mobile side.
- **Exact placement of claim-by-email** — lazy-on-first-request (recommended, D-09) vs at account creation. Planner decides; must satisfy D-10/D-11.
- **Staff-notify mechanism** for the "contact the studio" path (D-13) — reuse an existing channel.
- **`GYMOS_ADMIN_EMAILS` vs `RUNSTUDIO_OPERATOR_EMAILS`** canonical admin allowlist (D-16).
- Sign-in / role-landing screen visual design, loading/error/empty states, sign-out + session-refresh UX details.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase MA1: Auth + 3-Role Spine (the one-way door)" — goal, 5 success criteria, research notes (the flagged confirmations + Key Decisions a–d)
- `.planning/ROADMAP.md` §"Key constraints baked into every phase" (v2.3) — the locked-down technical constraints (no auth migration, additive-only DB, security boundaries, role-routing model, browse-public/book-auth, worker-single-sender, SDK-55 pinning, EAS gate)
- `.planning/REQUIREMENTS.md` §AUTH-01..07 + the traceability table (rows 100–106)
- `.planning/STATE.md` §"PICK UP HERE — plan MA1 (v2.3)" — the auth-spike framing + MA-wide discipline + MA5 external gate

### Mobile app — the five designed swap points (all carry "Replaced in P1a / magic-link" markers)
- `packages/mobile-app/app/_layout.tsx` — `AuthGate` (demo member-picker today → real session check)
- `packages/mobile-app/lib/current-member.ts` — `getCurrentMemberId`/`setCurrentMemberId`/`clearCurrentMemberId` (AsyncStorage `demoMemberId` → secure-store session)
- `packages/mobile-app/lib/api.ts` — `apiFetch()` injects `X-Demo-Member-Id` (→ bearer token from secure store)
- `packages/mobile-app/lib/agent-stream.ts` — `streamAgent()` SSE POST carrying the demo header (→ bearer/cookie; the spike's SSE test)
- `packages/mobile-app/components/AgentSheet.tsx` — mobile agent surface (MA4 consumer; spike target)
- `packages/mobile-app/app/(tabs)/` — existing tabs (index/schedule/passes/food/profile); `app/pick-member.tsx` — demo picker
- `packages/mobile-app/package.json` — Expo SDK 55, RN 0.83.9; `expo-secure-store` NOT yet present; `react-native-sse` present

### Server — auth & member endpoints
- `apps/staff-web/server/lib/demo-member.ts` — `requireDemoMember(request)` (gate to extend with `requireMember`)
- `apps/staff-web/app/routes/api.m.*.tsx` — all member endpoints (profile, schedule, bookings, members.list, purchase, content, food-*, agent.stream) — uniform `requireDemoMember` + `guard:allow-unscoped` pattern
- `apps/staff-web/app/routes/api.m.agent.stream.tsx` — the SSE agent endpoint (spike's admin-SSE-carries-session target)
- `apps/staff-web/server/plugins/auth.ts` — `createAuthPlugin({ googleOnly: true, ... })`; `/api/m` + `/pick-member` listed public so routes self-gate
- `apps/staff-web/app/root.tsx` — `RUNSTUDIO_OPERATOR_EMAILS` resolution (lines ~85–92), `operatorEmails`, `GYMOS_ADMIN_EMAILS` reference
- `apps/staff-web/app/components/layout/AppLayout.tsx` — `isOperator` gating pattern (operator chrome)

### Better-auth core
- `packages/core/src/server/better-auth-instance.ts` — `getBetterAuth()`/`createBetterAuthInstance()`; `bearer()` + `jwt()` mounted (lines ~818–828); **`expo()` + `trustedOrigins` ABSENT**; identity tables singular (`user`/`session`/`account`/...); `user.email` notNull+unique; `ensureBetterAuthTables()`
- `packages/core/src/server/auth.ts` — `getSession(event)`, `mapBetterAuthSession` (~1502–1513, exposes `userId`), `AuthSession` shape (~117–127: `{email,userId?,token?,name?,orgId?,orgRole?}`), `createAuthPlugin`/`runAuthGuard`, `getBearerSessionToken`/`getBearerLegacySession` (~626–640)
- `packages/core/package.json` — `better-auth: ^1.6.0`

### Schema & migrations
- `apps/staff-web/server/db/schema.ts` — `gymMembers` (lines ~109–132); `userId: text("user_id")` nullable (the pre-built join column); profile/goal cols
- `apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql` (lines 30–33) — the **partial unique indexes** on `email` and `phone_e164` (`WHERE ... IS NOT NULL`)
- `apps/staff-web/server/plugins/db.ts` — `runMigrations([...], { table: "mail_migrations" })`, **latest version = 36** (auto-applied on boot; next additive version goes here). Standalone `server/db/migrations/*.sql` are **NOT auto-run** — migration-drift gotcha (see [[project_gymos_migrations]])

### EAS / external gate (context for MA5, not MA1 work)
- `packages/mobile-app/IOS-EAS-RUNBOOK.md` — `eas init` projectId + Apple Dev account gate

### External docs (confirm at research time)
- Better-auth Expo plugin + bearer plugin docs (v1.6.x) — `expo()`, SecureStore adapter, `set-auth-token` header
- `expo-secure-store` SDK-55 docs
- `react-native-sse` — header behavior on streaming POST (the spike's cookie/bearer survival test)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The **five swap-point files** above are pre-marked for exactly this replacement — edit in place (D2 precedent: edit `packages/mobile-app/` in-place, no fork).
- **`gym_members.user_id`** (nullable) is the pre-built FK join column to Better-auth `user.id` — no migration needed to add it.
- **`bearer()`** already mounted on the core Better-auth instance → token-in-header mobile flow is partially supported today.
- **`requireDemoMember`** is the exact pattern to mirror for `requireMember` (same return shape: a `gym_members` row).
- **`RUNSTUDIO_OPERATOR_EMAILS`** resolver in `root.tsx` is the template for the new `RUNSTUDIO_TEACHER_EMAILS` resolver.

### Established Patterns
- **Identity resolution at handler top:** `const member = await requireX(request)` then scope queries on `member.id` with `// guard:allow-unscoped` (gym tables aren't ownable).
- **Additive migrations only**, via `runMigrations` in `db.ts` (next version after 36); apply standalone `.sql` to Neon `billowing-sun-51091059` by hand (drift gotcha).
- **`runWithRequestContext`** used in `automation-engine.ts` — hand-written routes must wrap manually (relevant to MA4's admin agent, not MA1's member routes).

### Integration Points
- Mobile `apiFetch` / `streamAgent` → `/api/m/*` resource routes → `requireMember`/`requireDemoMember` → `gym_members` row.
- Better-auth instance (core) ← new `expo()`/`trustedOrigins` wiring (the research fork).
- Role resolver ← two env allowlists + the claimed member row.

</code_context>

<specifics>
## Specific Ideas

- Web domain for account/password management: **runstudioai.com** (note: memory had `runstudio.ai`; user confirmed `runstudioai.com` for the account system).
- Sign-in screen affordances: **"Join / Subscribe"** → studio site; **"Forgot password?"** → runstudioai.com reset page. Both URLs configurable.
- No-match flow copy: prompt phone first; final dead-end = **"No membership on file — contact the studio."**
- The app should *feel like a pure member app* — role chrome (teacher/admin) only appears for those roles, auto-detected, never selected.

</specifics>

<deferred>
## Deferred Ideas

- **WhatsApp-OTP recovery** — explicit v2 (the studio's native channel; out of MA1).
- **Magic-link / passwordless sign-in** — considered, not chosen (AUTH-01 is email+password).
- **In-app sign-up & in-app password reset** — owned by the web (runstudioai.com / studio site), not the app.
- **Building the web subscribe / account / reset pages** — separate external workstream (D-07).
- **Minimal web flow inside MA1** — explicitly rejected (would couple the one-way-door phase to web work).
- **Anti-enumeration generic auth error** — rejected in favor of the clear "contact the studio" message (small-studio clarity > enumeration hardening).
- **Teacher AI / any teacher agent surface** — none, ever (TCH-03; MA3 scope is check-in only).
- **Push notifications** — MA5.
- **Member booking / Stripe paywall / teacher check-in / admin AI agent** — MA2/MA3/MA4 (depend on this spine).

### Reviewed Todos (not folded)
None — no pending todos matched MA1 (`gsd-tools todo match-phase MA1` returned 0).

</deferred>

---

*Phase: MA1-auth-3-role-spine-the-one-way-door*
*Context gathered: 2026-06-29*
