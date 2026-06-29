# Architecture Research — v2.3 Mobile App Production Foundation

**Domain:** Production auth + 3-role routing + admin mobile AI agent + push, integrated into an existing agent-native fork (RunStudio / GymClassOS)
**Researched:** 2026-06-29
**Confidence:** HIGH on the integration points (grounded by reading the framework dist + the app code); MEDIUM on Expo push specifics (new territory for this codebase, not yet present in the repo).

> This is a **subsequent-milestone** architecture doc. The recommendations are framed as **integration points into existing files**, with explicit "NEW vs MODIFIED" tags, because the merge surface matters more than greenfield design. (Prior v2.0-era architecture research was archived when this file was overwritten for v2.3.)

---

## The Single Most Important Finding (Read This First)

**The framework already mounts the Better-auth `bearer()` plugin, and `getSession(event)` already resolves Bearer tokens.** No server-side auth-plugin change is needed to authenticate the mobile app.

Verified by reading `node_modules/@agent-native/core/dist/server/better-auth-instance.js` and `auth.js`:

- `better-auth-instance.js:674-685` — the betterAuth instance is built with `plugins: [ jwt(...), bearer(), ...config.plugins ]`. **`bearer()` is always on.**
- `better-auth-instance.js:510` — `emailAndPassword: { enabled: true, minPasswordLength: 8 }` is **hardcoded on**, independent of `googleOnly`. `googleOnly` (set in `apps/staff-web/server/plugins/auth.ts:13`) only changes the **login HTML** (`onboarding-html.js:743` — hides the password form on the web page). The email/password **REST endpoints stay mounted and callable.**
- `auth.js:1141-1210` — `getSession(event)`'s resolution order is: ACCESS_TOKEN → BYOA → **bearer legacy session → `ba.api.getSession({ headers: event.headers })`** (step 4, which reads `Authorization: Bearer <token>` because the bearer plugin is mounted) → legacy cookie → desktop SSO → `_session` query param. A native client attaching `Authorization: Bearer <token>` is a first-class, already-supported path.
- `auth.js:1978` — the Better-auth catch-all is mounted at `/_agent-native/auth/ba/*`. So the mobile sign-in endpoint is **`POST /_agent-native/auth/ba/sign-in/email`**, sign-up is `POST /_agent-native/auth/ba/sign-up/email`, sign-out is `POST /_agent-native/auth/ba/sign-out`. The standard Better-auth `bearer()` flow returns the session token in the **`set-auth-token` response header** on sign-in; the mobile client captures it and replays it as `Authorization: Bearer`.

**Consequence for the build:** the mobile auth foundation is mostly a **client-side** task (Expo app calls the existing endpoints, stores the token in `expo-secure-store`, attaches it as a Bearer header) plus a **small server-side gate swap** (`requireDemoMember` → a new `requireMember`/`requireRole` that calls `getSession(event)`). The one server-side enablement you DO want is adding **`trustedOrigins`** for the app's scheme (see Pitfall T-1) — there is currently no `trustedOrigins` config in the instance.

---

## Standard Architecture

### System Overview (target state, v2.3)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    packages/mobile-app  (Expo / RN)                        │
│                                                                            │
│  AuthGate (MODIFIED)   role router (NEW)    AgentSheet (REUSE)             │
│  ┌──────────┐   ┌────────────────────────┐   ┌──────────────────────┐     │
│  │ login.tsx│   │ role → tab set:        │   │ admin → owner stream │     │
│  │  (NEW)   │   │  admin / teacher /     │   │ member → member      │     │
│  │ sign-in  │   │  member                │   │   stream             │     │
│  └────┬─────┘   └───────────┬────────────┘   └──────────┬───────────┘     │
│       │ Bearer token in expo-secure-store    push token register (NEW)    │
│       │ (lib/session.ts NEW, replaces        expo-notifications           │
│       │  lib/current-member.ts)                                           │
└───────┼───────────────────────────────────────────────────┼──────────────┘
        │ Authorization: Bearer <token>  on every request    │
        ▼                                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  apps/staff-web  (React Router v7 + Nitro, Vercel)         │
│                                                                            │
│  Better-auth instance  ── bearer() + emailAndPassword (ALREADY ON)         │
│  getSession(event)     ── resolves Bearer token (ALREADY WORKS)            │
│                                                                            │
│  server/lib/require-member.ts (NEW)  resolveRole(email) (NEW)              │
│      claim-by-email: user.email → gym_members.user_id                      │
│                                                                            │
│  api.m.* routes (MODIFIED: requireDemoMember → requireMember)              │
│   ├ schedule / bookings / profile / food-* (member)                        │
│   ├ api.m.attendance (NEW — teacher check-in → mark-booking-attended)      │
│   ├ api.m.agent.stream (member agent — UNCHANGED, re-auth only)            │
│   └ api.owner.agent.stream (NEW — admin agent: registry + filter Tier-3)   │
│                                                                            │
│  server/plugins/auth.ts (MODIFIED publicPaths: add /api/owner, push reg)   │
│  push_tokens table (NEW, additive)   send-push enqueue helper (NEW)        │
└───────────────────────────────────┬──────────────────────────────────────┘
                                     │ pg-boss enqueue ("expo-push")
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                services/worker  (Fly.io, pg-boss subscriber)               │
│   expo-push job → Expo Push API (https://exp.host/--/api/v2/push/send)     │
│   (sibling of the existing outbound-whatsapp / meta-capi-event producers)  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | NEW / MODIFIED | File |
|-----------|----------------|----------------|------|
| Mobile session store | Hold Bearer token in `expo-secure-store`; refresh/clear | NEW | `packages/mobile-app/lib/session.ts` |
| Mobile login screen | Email/password (or OTP) sign-in against `/_agent-native/auth/ba/*` | NEW | `packages/mobile-app/app/login.tsx` |
| Mobile auth gate | Replace demo-id check with session check; route by role | MODIFIED | `packages/mobile-app/app/_layout.tsx` |
| `apiFetch` | Attach `Authorization: Bearer` instead of `X-Demo-Member-Id` | MODIFIED | `packages/mobile-app/lib/api.ts` |
| Role resolver | `email → 'admin' \| 'teacher' \| 'member'` server-side | NEW | `apps/staff-web/server/lib/resolve-role.ts` |
| Member auth gate (server) | Real Better-auth session → `gym_members` row (claim-by-email) | NEW (replaces `demo-member.ts`) | `apps/staff-web/server/lib/require-member.ts` |
| Member API routes | Swap `requireDemoMember` for `requireMember` | MODIFIED | `apps/staff-web/app/routes/api.m.*.tsx` |
| Owner mobile agent SSE | Load registry, filter Tier-3, owner prompt, Bearer auth, `runWithRequestContext` | NEW | `apps/staff-web/app/routes/api.owner.agent.stream.tsx` + nitro delegate |
| Teacher attendance API | Drive `mark-booking-attended` chokepoint from mobile | NEW | `apps/staff-web/app/routes/api.m.attendance.tsx` |
| Push token table | Store Expo push token keyed to `user.id` | NEW (additive migration) | `apps/staff-web/server/db/schema.ts` + migration |
| Push sender | Enqueue + send Expo push | NEW | staff-web enqueue helper + `services/worker` job |

---

## 1. Three-Way Role Routing

### Recommendation: two env allowlists + a member fallback, resolved server-side in ONE function

Do **not** reach for Better-auth org `member.role` for v2.3. The studio is single-tenant-per-deploy, staff are a tiny fixed set, and the existing admin gate is already an env allowlist (`RUNSTUDIO_OPERATOR_EMAILS`, read in `app/root.tsx:85`). Adding a parallel **`RUNSTUDIO_TEACHER_EMAILS`** allowlist is the lowest-friction, fewest-moving-parts choice and keeps the role decision in plain config the operator controls per deploy — consistent with the "repeatable per client" memory and how admin already works. (Better-auth org roles would require seeding `member` rows per teacher, a join the demo doesn't populate, and a heavier migration story. Defer it to a future multi-staff milestone.)

**Role precedence (first match wins):**

```
resolveRole(email):
  if email ∈ RUNSTUDIO_OPERATOR_EMAILS  → 'admin'    (admin even if also in teacher list)
  else if email ∈ RUNSTUDIO_TEACHER_EMAILS → 'teacher'
  else                                   → 'member'
```

**NEW file `apps/staff-web/server/lib/resolve-role.ts`** — a pure function over the two env lists. Mirror the parsing already in `root.tsx:85-92` and `auth.ts:80-85` (comma-split, trim, lowercase). Keep the Patrick default-fallback for admin that `root.tsx` already has so the operator never locks themselves out before the env is set.

> **Refactor opportunity (small):** `root.tsx`, `auth.ts`, and the new resolver all parse comma-lists. Extract once into `resolve-role.ts` and import it in all three so the allowlist semantics can't drift.

### Identity mapping per role

| Role | Identity source | Mapping mechanism |
|------|-----------------|-------------------|
| **admin** | Better-auth `user` (Google sign-in already works on web; mobile uses same instance) | email in `RUNSTUDIO_OPERATOR_EMAILS`. No `gym_members` link required — admin acts AS the studio, not as a member. |
| **teacher** | Better-auth `user` | email in `RUNSTUDIO_TEACHER_EMAILS`. **Do NOT couple to `trainers.email`** — the `trainers` table (`schema.ts:281`) is a scheduling roster with **no email column and no auth meaning today**. Optional, deferrable: add a nullable `trainers.user_id` (additive) later if you want to bind a logged-in teacher to their scheduling record; not required for check-in, which only needs occurrence + booking ids. |
| **member** | Better-auth `user` ↔ `gym_members` via **claim-by-email** | On first authenticated request, look up `gym_members` by `email = session.user.email`; if found and `user_id IS NULL`, set `user_id = session.user.id` (claim). The nullable FK already exists (`schema.ts:111`, comment: "Production wires Better-auth user → gym_member via user_id"). |

### Claim-by-email: the member linking flow (server-side, idempotent)

**NEW file `apps/staff-web/server/lib/require-member.ts`** — the real-auth replacement for `requireDemoMember`. Signature-compatible so the `api.m.*` swap is a one-line import change per route.

```typescript
// require-member.ts  (NEW — replaces demo-member.ts in production)
import { getSession } from "@agent-native/core/server";
import { eq, and, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";

export async function requireMember(event): Promise<DemoMember /* same shape */> {
  const session = await getSession(event);        // resolves Bearer token (auth.js:1141)
  if (!session?.email) throw new Response("Unauthorized", { status: 401 });

  const db = getDb();
  // 1. Already claimed?  (user_id is the strong link)
  let member = await db.select().from(schema.gymMembers)
    .where(eq(schema.gymMembers.userId, session.userId)).limit(1).then(r => r[0] ?? null);

  // 2. Not yet claimed → claim by email (idempotent, only fills a NULL user_id)
  if (!member) {
    const byEmail = await db.select().from(schema.gymMembers)
      .where(and(eq(schema.gymMembers.email, session.email), isNull(schema.gymMembers.userId)))
      .limit(1).then(r => r[0] ?? null);
    if (byEmail) {
      await db.update(schema.gymMembers)
        .set({ userId: session.userId })
        .where(and(eq(schema.gymMembers.id, byEmail.id), isNull(schema.gymMembers.userId)));
      member = { ...byEmail, userId: session.userId };
    }
  }
  if (!member) throw new Response("No member profile for this account", { status: 403 });
  return member;
}
```

Notes:
- `getSession` returns `{ email, token }` and (verify) `userId` from `mapBetterAuthSession`. **If the mapped shape omits `userId`, fall back to claiming/looking up by email only** — email is the natural key (`gym_members.email` exists); `user_id` is the optimization. Confirm the mapped session shape at MA1 plan time.
- The claim `UPDATE` is guarded with `isNull(user_id)` in the WHERE — two concurrent first-requests can't stomp each other, and re-running is a no-op. Idempotent by construction.
- **Edge case — member email not in `gym_members`:** return 403 with a clear message ("ask the studio to add you"). Do NOT auto-create a `gym_members` row from an arbitrary Google sign-in — that would let any account self-provision a member. Members are created by the studio (CRM / lead flow); auth only *claims* an existing row.
- **Edge case — `gym_members.email` is nullable** (`schema.ts:114`) and members are unique on BOTH email and phone (memory `member_upsert_keys`). Claim-by-email only matches rows that HAVE an email; WhatsApp-only members (phone, no email) won't auto-claim until the studio adds their email. Acceptable for v1: app members must have an email to sign in.

---

## 2. Better-auth Session for the Mobile App

### Where the app authenticates: the SAME Better-auth instance in staff-web

The Expo app points at the staff-web deploy (`gym-class-os.vercel.app`, configurable via `EXPO_PUBLIC_API_BASE`). It calls the already-mounted endpoints:

| Action | Endpoint | Method |
|--------|----------|--------|
| Sign up (member self-register) | `/_agent-native/auth/ba/sign-up/email` | POST |
| Sign in | `/_agent-native/auth/ba/sign-in/email` | POST |
| Sign out | `/_agent-native/auth/ba/sign-out` | POST |
| Get session (optional verify) | `/_agent-native/auth/ba/get-session` | GET (Bearer) |

On a successful sign-in, the `bearer()` plugin returns the session token in the **`set-auth-token`** response header. The client captures it and stores it in `expo-secure-store` (NOT AsyncStorage — repo/PROJECT constraint). Every subsequent request sends `Authorization: Bearer <token>`.

> The framework does **not** vendor `better-auth/client`, so the mobile app should call these REST endpoints with plain `fetch` (no client-lib dependency to version-match). The token capture is just reading the `set-auth-token` header off the sign-in response.

### Server changes needed: minimal

1. **`trustedOrigins`** — ADD the app's origin/scheme so Better-auth doesn't reject native requests on CSRF-sensitive POSTs. There is no `trustedOrigins` in the instance today. Set it from an env var in the fork's auth wiring (e.g. `BETTER_AUTH_TRUSTED_ORIGINS=runstudio://,exp://`). The app's custom scheme (production) + `exp://` (Expo Go) cover both demo and prod. `better-auth-instance.js:684` already spreads `config.plugins`, so a config passthrough surface exists — **flag for MA1: confirm `createAuthPlugin` forwards a `trustedOrigins`/config option down to `betterAuth`.** (For pure-Bearer native requests with no Origin header this is mostly belt-and-suspenders, but set it to avoid surprises on sign-in/sign-up POSTs.)
2. **`publicPaths`** — `auth.ts:28-69` already lists `/api/m` as public (each route self-gates via `requireDemoMember`). Two edits:
   - ADD `/api/owner` to `publicPaths` **and** to the `allowlistHandler` skip list (`auth.ts:104-135`) so the owner agent stream isn't intercepted by the email allowlist (it self-gates on `resolveRole==='admin'`).
   - The auth endpoints under `/_agent-native/auth/*` are already skipped (`auth.ts:105`).
3. **Nothing else.** Bearer + email/password are already enabled. No new Better-auth plugin install.

### Transition strategy: demo-auth and real-auth coexist (no mid-migration breakage)

This is the load-bearing part of the milestone. **Do NOT delete `requireDemoMember` until the app fully cuts over.** Build a **single resolver that accepts BOTH** during transition:

```typescript
// require-member.ts — transitional resolver
export async function requireMember(event) {
  // Real auth first
  const session = await getSession(event);
  if (session?.email) return resolveMemberFromSession(session);  // claim-by-email path

  // Demo fallback — ONLY when DEMO_MODE=true && NODE_ENV!=='production'
  // (identical guard to demo-member.ts:11-14)
  if (process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production") {
    return requireDemoMember(asRequest(event));   // existing header-hack path
  }
  throw new Response("Unauthorized", { status: 401 });
}
```

This means:
- **Production** (`NODE_ENV=production`) silently ignores `X-Demo-Member-Id` (the demo guard already throws 401 in prod — `demo-member.ts:11`), so real auth is the only path live. **No regression risk** because the member API is *already* 401 in prod (PROJECT.md: "`/api/m/*` is production-gated to 401").
- **Demo builds** keep working via the header until the Expo app ships the login screen.
- The cutover per route is a one-line import change (`requireDemoMember` → `requireMember`). Do them all in MA1 behind the transitional resolver, then drop the demo fallback in a later cleanup once the app ships.

**Mobile client transition (`lib/api.ts` MODIFIED):** attach Bearer if a token exists, else fall back to the demo header. Same dual-path discipline:

```typescript
const token = await getToken();          // expo-secure-store (NEW lib/session.ts)
const demoId = await AsyncStorage.getItem("demoMemberId");  // legacy, demo only
headers = token ? { Authorization: `Bearer ${token}` }
                : demoId ? { "X-Demo-Member-Id": demoId } : {};
```

Note `lib/agent-stream.ts:37` also reads `demoMemberId` and sets `X-Demo-Member-Id` — it gets the same Bearer/demo dual-path treatment when parametrized (see §3).

---

## 3. Admin Mobile Agent Endpoint

### Recommendation: NEW SSE route forking `api.m.agent.stream.tsx`'s manual loop, NOT a fork of `agent-chat.ts`

The web admin agent (`agent-chat.ts`) uses `createAgentChatPlugin` — a full framework plugin with propose/approve gating, mention providers, and the noticeboard. That's the wrong shell for a phone. The member mobile agent (`api.m.agent.stream.tsx`) is a **lean manual Anthropic SSE loop** that already matches the mobile client (`agent-stream.ts` consumes its named events). **Fork the member loop, swap the tools + prompt + auth.**

### NEW file `apps/staff-web/app/routes/api.owner.agent.stream.tsx` + nitro delegate

Data flow (parallel to the member path, with the registry + role gate added):

```
AgentSheet (admin variant) → streamAgent(endpoint='/api/owner/agent/stream', Bearer)
   ↓ SSE
api.owner.agent.stream.tsx  action({ request }):
   1. session = getSession(event); role = resolveRole(session.email)
      if role !== 'admin' → 401   (teachers/members never reach the owner agent)
   2. runWithRequestContext({ userEmail: session.email, orgId }, async () => {
        registry = loadActionsFromStaticRegistry(actionsRegistry)   // same registry as agent-chat.ts
        tools    = buildToolsFromRegistry(registry, { exclude: GATED_TIER3 })
        loop: Anthropic stream → on tool_use → registry[name].run(input, ctx) → tool_result
      })
```

**Tool construction — filter Tier-3 out of the registry.** The registry maps `name → { tool, run, http? }` (verified in `action-discovery.js:279-312`). Build the Anthropic `tools` array from `Object.entries(registry)` mapping `entry.tool` → `{ name, description, input_schema }`, **excluding a hardcoded gated set**:

```typescript
const GATED_TIER3 = new Set([
  "send-template-to-members",  // WhatsApp send — web-only, behind noticeboard approve
  "create-checkout-link",      // Stripe charge
  "cancel-occurrence",         // refund-bearing
  "reschedule-occurrence",
  "publish-form",
  // also exclude the approval/proposal plumbing + staff-only Stripe-account actions:
  "propose-action", "approve-proposal", "reject-proposal",
  "create-connect-account", "create-account-link",
]);
const tools = Object.entries(registry)
  .filter(([name]) => !GATED_TIER3.has(name))
  .map(([name, e]) => ({ name, description: e.tool.description, input_schema: e.tool.parameters }));
```

This **exposes only the non-gated verb set** the milestone calls for: Tier-1 reads (`list-*`), Tier-2 board authoring (`upsert-section-note`, `create-task`), and direct class/content/trainer/member writes (`create-class-occurrence`, `update-member`, `content-set-status`, etc.). The Tier-3 dangerous verbs stay web-only behind the propose→approve noticeboard. **The filter is the security boundary — assert it with a unit test** that the produced tool list contains none of `GATED_TIER3` (a guard against someone later adding a gated action that silently flows to the phone).

**Tool dispatch — call `registry[name].run`.** When Anthropic returns `tool_use`, dispatch with the registry's own `run` so the action's Zod validation + access checks fire exactly as they do on the web. Each action's `run` expects the request-context to be present, which is why the loop is wrapped in **`runWithRequestContext({ userEmail, orgId }, ...)`** (root AGENTS.md: hand-written routes must wrap work in `runWithRequestContext` after reading the session — the auto-mount only does this for `/_agent-native/actions/*`, not bespoke routes). Resolve `orgId` the same way `agent-chat.ts:13-16` does: `getOrgContext(event)`.

**Owner system prompt — reuse the source of truth.** The web prompt lives in `agent-chat.ts:18-105`. Don't copy-paste it (it'll drift). Extract it into a shared **`server/lib/owner-system-prompt.ts` (NEW)** and import it in both `agent-chat.ts` and the owner stream. The mobile owner prompt is the same gym-domain prompt **minus the propose-action Tier-3 instructions** (those actions aren't in the tool list). Add a one-line "you are on mobile, be terse" preamble like the member loop's `SYSTEM_PROMPT` (`api.m.agent.stream.tsx:73`).

### Nitro delegate (NEW)

Mirror `server/routes/api/m/agent/stream.post.ts` exactly — a ~20-line `defineEventHandler` that imports the RR action and `sendWebResponse(result)`. **NEW file: `server/routes/api/owner/agent/stream.post.ts`.** This is the dual-route pattern the codebase already uses for every `api.m.*` route (RR resource route + thin Nitro delegate so SSE streams through Nitro).

### Client reuse: parametrize `AgentSheet` + `agent-stream.ts`

Both are member-hardcoded today and need a tiny generalization:

- **`agent-stream.ts` (MODIFIED):** add an `endpoint` param (default `/api/m/agent/stream`) and swap the auth header from `X-Demo-Member-Id` to `Authorization: Bearer <token from session.ts>`. The named-event handling (`delta`/`tool_use`/`tool_result`/`done`/`error`) is identical for both endpoints because the owner loop emits the same event shape — **so the SSE consumer is reused as-is.**
- **`AgentSheet.tsx` (MODIFIED):** accept props for `endpoint`, `title`, and the cache keys to invalidate on `tool_result`. Member invalidates `schedule`/`food-entries`/`profile` (`AgentSheet.tsx:182-184`); admin would invalidate different keys (or none). The render/stream machinery (bubbles, streaming, cancel-on-unmount) is unchanged.
- **Routing:** the role router (`_layout.tsx`) mounts the admin variant for admins (owner endpoint) and the member variant for members. Teachers get **no agent surface** (milestone: "no AI surface") — the FAB (`_layout.tsx:75-122`) simply doesn't render for `role==='teacher'`.

---

## 4. Push Notifications

### Token storage: NEW additive table keyed to `user.id`

**NEW table `push_tokens` (additive migration only — repo rule: no breaking DB changes).** Keyed to the Better-auth `user.id` (the stable identity across all three roles), not `gym_members.id` (admins/teachers have no member row).

```typescript
// schema.ts (additive)
export const pushTokens = table("push_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),           // Better-auth user.id
  expoPushToken: text("expo_push_token").notNull(),
  platform: text("platform", { enum: ["ios", "android"] }),
  deviceId: text("device_id"),                 // dedupe per-device
  createdAt: text("created_at").notNull().default(now()),
  lastSeenAt: text("last_seen_at").notNull().default(now()),
});
// unique on (user_id, expo_push_token) so re-registration is an upsert no-op
```

Migration goes through `runMigrations` in `server/plugins/db.ts` as the **next version number** (schema is on v36 per memory — this is v37/additive). **Gotcha (memory `migrations`):** gymos migrations are NOT auto-applied to Neon by `db.ts` — the SQL must be hand-applied to the studio Neon, or reads 500. Flag this in the MA-NOTIF plan. **Gotcha (memory `active_boolean`):** if any boolean column is ever added here, use Drizzle `integer(mode:"boolean")` AND a `BOOLEAN` column in the hand-written SQL — they must agree.

**Registration flow:** after sign-in, the app calls `expo-notifications` `getExpoPushTokenAsync()`, then `POST /api/m/push-token` (NEW route, Bearer-authed via `getSession`/`requireMember`) which upserts the row. Re-register on every cold start (cheap, keeps `last_seen_at` fresh, handles token rotation).

### Who sends: the existing Fly worker, as a new pg-boss producer

Consistent with every other outbound in this system (the locked decision pattern: "staff-web only enqueues; the Fly worker is the single sender" — see WhatsApp + Meta CAPI in PROJECT.md Key Decisions). **Do not send Expo push from a Vercel function** (same cold-start/reliability reasoning that put WhatsApp + CAPI on the worker; also Expo push wants retry/receipt handling that pg-boss gives you durably).

```
admin action (backgrounded) → staff-web enqueues pg-boss "expo-push" job  (NEW enqueue helper)
   ↓
services/worker  expo-push subscriber (NEW job, sibling of outbound-whatsapp / meta-capi-event)
   → POST https://exp.host/--/api/v2/push/send  { to, title, body, data: { deepLink } }
   → handle Expo receipts (DeviceNotRegistered → prune push_tokens row)
```

The worker already owns pg-boss subscribers and can read secrets; adding an `expo-push` queue is the same shape as the existing `meta-capi-event` queue. No Expo "credentials" are needed for sending to the public Expo push endpoint (EAS owns APNs/FCM keys at build time, not send time); an `EXPO_ACCESS_TOKEN` is recommended for rate-limit headroom.

### "Come look" deep-link flow (backgrounded admin action → push → deep-link into the agent thread)

```
1. A backend event worth the admin's attention occurs (agent finished a long task,
   daily digest, lead spike). The producer (worker job or staff-web action) enqueues
   an "expo-push" job:  { userId, title, body, data: { route: "/(tabs)/...", threadId } }
2. Worker sends to Expo Push API with data.route = an Expo Router deep-link path.
3. Expo delivers; user taps the notification.
4. expo-notifications addNotificationResponseReceivedListener (NEW, in _layout.tsx) reads
   response.notification.request.content.data.route and router.push(route) — opening the
   target tab, then opening the AgentSheet (admin variant) on the referenced thread.
```

Deep-linking uses Expo Router's existing scheme. Register the app scheme (`runstudio://`) in `app.json` (the same scheme added to `trustedOrigins`). The notification-response listener belongs in `_layout.tsx` alongside the auth gate so it's mounted app-wide.

---

## 5. Suggested Build Order

MA1 (auth + roles) is the one-way door. Everything hangs off `getSession`-based identity, so it ships first and alone.

```
MA1 — Auth + 3-role spine  (ONE-WAY DOOR — build real, build first)
  Server:
    • resolve-role.ts (NEW) + RUNSTUDIO_TEACHER_EMAILS env
    • require-member.ts (NEW, transitional: real auth → demo fallback) + claim-by-email
    • trustedOrigins enablement + /api/owner publicPaths/skip-list (auth.ts MODIFIED)
    • swap requireDemoMember → requireMember across api.m.* (MODIFIED, one import each)
  Mobile:
    • lib/session.ts (NEW, expo-secure-store) ; lib/api.ts Bearer (MODIFIED)
    • app/login.tsx (NEW) ; _layout.tsx AuthGate → session check + role router (MODIFIED)
  Exit: member signs in on a real device, claim-by-email links the row, api.m.* returns
        their data via Bearer. Demo header still works in demo builds.

  ── after MA1, these three are largely independent and can be sequenced by value ──

MA2 — Member surface  (book / pay-gate / home)
  • api.m.bookings hardened (entitlement check) ; Stripe gate when no active pass
  • depends on MA1 member identity only

MA3 — Teacher surface  (schedule + check-in)
  • api.m.attendance.tsx (NEW) → mark-booking-attended chokepoint (exists, no UI today)
  • teacher tab set in role router ; depends on MA1 role='teacher'

MA4 — Admin mobile AI agent
  • api.owner.agent.stream.tsx (NEW) + nitro delegate ; registry + Tier-3 filter
  • owner-system-prompt.ts (NEW, extracted from agent-chat.ts)
  • AgentSheet/agent-stream.ts parametrized (endpoint/auth/title)
  • depends on MA1 role='admin' + Bearer

MA5 — Push notifications  (closes the loop; do LAST — needs identities + surfaces to link to)
  • push_tokens table (NEW additive migration) + /api/m/push-token route (NEW)
  • services/worker expo-push job (NEW) + staff-web enqueue helper
  • _layout.tsx notification-response deep-link listener (MODIFIED)
  • depends on MA1 (user.id keying) and benefits from MA4 (admin "come look" → agent thread)
```

**Why this order:** MA1 is the dependency root — no role, no auth, nothing downstream resolves. MA2/MA3/MA4 each need only MA1's identity and can be reordered by business priority (members need login to book + hit the Stripe paywall, which is the milestone's own justification for doing auth at all — so MA2 is the natural second). MA5 is last because push has nothing to notify about and nowhere to deep-link until the surfaces (esp. the admin agent thread) exist.

---

## Data Flow

### Member request (after MA1)

```
Expo app → apiFetch (Bearer) → /api/m/schedule
   → Nitro route → loader → requireMember(event)
        → getSession (resolves Bearer)  → claim-by-email → gym_members row
   → Drizzle query (guard:allow-unscoped — single-tenant) → JSON
```

### Admin agent tool call (MA4)

```
AgentSheet(admin) → streamAgent('/api/owner/agent/stream', Bearer)
   → api.owner.agent.stream action → getSession → resolveRole==='admin'
   → runWithRequestContext({ userEmail, orgId }):
        Anthropic stream → tool_use(name) → registry[name].run(input)  [Tier-3 filtered out]
        → tool_result → next turn → done
```

### Push "come look" (MA5)

```
worker/staff-web → pg-boss "expo-push" { userId, data.route } → worker job → Expo Push API
   → device tap → _layout.tsx response listener → router.push(data.route) → AgentSheet opens
```

---

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| 1 studio (HUSTLE today) | Current shape is correct. Bearer-token sessions, single Neon, single Fly worker. No changes. |
| ≤10 studios (the stated near-future, memory `tenancy_direction`) | If/when shared-DB sharded subdomains land, role allowlists stay per-deploy env; `push_tokens.user_id` already namespaces cleanly by user. The owner-agent registry filter is per-deploy, no change. |
| Per-studio member growth | Expo push: batch sends (Expo accepts ≤100 messages/request) and process receipts asynchronously in the worker. pg-boss already handles backpressure. `getSession` runs a DB lookup per request — the framework already caps the Better-auth Neon pool (`better-auth-instance.js`), so the bottleneck is the same as every other authenticated request, not new. |

### Scaling priorities

1. **First bottleneck:** session lookup per `api.m.*` request (one DB round-trip via `getSession`). Mitigated already by the capped auth pool; if it ever bites, the bearer token can carry a short-TTL cache. Not a v2.3 concern.
2. **Second bottleneck:** Expo push fan-out for studio-wide member notifications. Solved by batching + worker concurrency — already the worker's job shape.

---

## Anti-Patterns

### Anti-Pattern 1: Forking `agent-chat.ts` for the mobile admin agent
**What people do:** copy `createAgentChatPlugin` to get the owner tools on mobile.
**Why it's wrong:** that plugin carries the noticeboard, propose/approve gating, mention providers, and a cookie-session assumption — none of which fit a phone SSE stream, and it pulls in the Tier-3 propose machinery you're trying to exclude.
**Do this instead:** fork the lean manual loop in `api.m.agent.stream.tsx`, load the **registry** for tools, and filter Tier-3 by name.

### Anti-Pattern 2: Auto-creating a `gym_members` row on any sign-in
**What people do:** if claim-by-email finds nothing, insert a new member.
**Why it's wrong:** any account could self-provision a member, and the dual-unique-key (email/phone) reconcile (memory `member_upsert_keys`) makes blind inserts 500-prone.
**Do this instead:** claim only EXISTING rows (fill a NULL `user_id`); 403 if no row. Members are created by the studio, not by auth.

### Anti-Pattern 3: Storing the Bearer token in AsyncStorage
**What people do:** reuse the `demoMemberId` AsyncStorage pattern for the real token.
**Why it's wrong:** AsyncStorage is unencrypted; a session token is a credential. PROJECT.md explicitly mandates `expo-secure-store`.
**Do this instead:** `expo-secure-store` in a NEW `lib/session.ts`; AsyncStorage stays only for the legacy demo id during transition.

### Anti-Pattern 4: Sending Expo push directly from a Vercel function
**What people do:** call the Expo push API inline in a staff-web action.
**Why it's wrong:** breaks the locked "staff-web enqueues, worker sends" pattern; loses durable retry + receipt handling; cold-start unreliability.
**Do this instead:** enqueue a pg-boss `expo-push` job; the Fly worker sends and handles receipts/pruning.

### Anti-Pattern 5: Keying `push_tokens` to `gym_members.id`
**What people do:** attach push tokens to the member row.
**Why it's wrong:** admins and teachers have no `gym_members` row, so they couldn't receive the "come look" push that justifies the whole milestone.
**Do this instead:** key to Better-auth `user.id` — the one identity all three roles share.

### Anti-Pattern 6 (T-1): Deleting `requireDemoMember` during the auth swap
**What people do:** rip out the demo gate when wiring real auth.
**Why it's wrong:** demo builds (Expo Go) lose data access mid-migration before the login screen ships; this is exactly how the transition breaks.
**Do this instead:** the transitional `requireMember` tries real auth first, falls back to the demo header only when `DEMO_MODE && !production`. Drop the fallback in a later cleanup once the app ships login.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Expo Push API | Worker POSTs to `exp.host/--/api/v2/push/send`; pg-boss durable retry; handle `DeviceNotRegistered` receipts | No send-time creds needed; `EXPO_ACCESS_TOKEN` optional for rate limits. APNs/FCM keys are EAS build-time, owned by the customer's Apple Dev account. |
| Better-auth (in-process) | `getSession(event)` resolves Bearer (already mounted) | `trustedOrigins` for the app scheme is the only enablement gap. |
| Stripe (member pay-gate) | Existing `create-checkout-link` / `/api/m/purchase` | Already built; MA2 wires the "no active pass → checkout" branch. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Expo app ↔ staff-web | HTTPS + `Authorization: Bearer` | Same instance as web; `EXPO_PUBLIC_API_BASE` points at the Vercel deploy. |
| staff-web ↔ worker | pg-boss queue (Neon) | New `expo-push` queue; sibling of `outbound-whatsapp`, `meta-capi-event`. |
| Owner SSE ↔ action registry | `registry[name].run(input)` under `runWithRequestContext` | The Tier-3 name filter IS the security boundary — unit-test it. |
| Teacher API ↔ attendance chokepoint | `api.m.attendance` → `mark-booking-attended` | The single writer of `status='attended'`; idempotent; fires Meta Schedule event. No UI today (deferred D-11) — MA3 builds it. |

---

## Sources

- `node_modules/@agent-native/core/dist/server/better-auth-instance.js` (read 2026-06-29) — `bearer()` + `jwt()` always mounted (L674-685); `emailAndPassword.enabled: true` hardcoded (L510); auth basePath `/_agent-native/auth/ba` (L465); `config.plugins` spread (L684); no `trustedOrigins` configured. **HIGH.**
- `node_modules/@agent-native/core/dist/server/auth.js` (read 2026-06-29) — `getSession` resolution order incl. Bearer via `ba.api.getSession({ headers })` (L1141-1210); Better-auth catch-all mounted at `/_agent-native/auth/ba/*` (L1978); `googleOnly` only affects login HTML. **HIGH.**
- `node_modules/@agent-native/core/dist/server/action-discovery.js` (read 2026-06-29) — `loadActionsFromStaticRegistry` returns `name → { tool, run, http? }` (L279-312). **HIGH.**
- `node_modules/@agent-native/core/dist/server/onboarding-html.js` — `googleOnly` hides the password form on the web login page only (L743-762). **HIGH.**
- `apps/staff-web/server/plugins/auth.ts`, `agent-chat.ts`, `server/db/schema.ts` (gym_members.user_id L111, trainers L281), `app/root.tsx` (operator allowlist L85), `app/routes/api.m.*.tsx`, `server/lib/demo-member.ts`, `server/routes/api/m/agent/stream.post.ts`. **HIGH.**
- `packages/mobile-app/lib/api.ts`, `lib/agent-stream.ts`, `lib/current-member.ts`, `components/AgentSheet.tsx`, `app/_layout.tsx`, `app/pick-member.tsx`. **HIGH.**
- Expo push token storage / send pattern, `expo-secure-store`, notification deep-link listener — Expo docs conventions; not yet present in this repo. **MEDIUM** (verify exact `expo-notifications` API at MA5 plan time).
- Better-auth `bearer()` plugin `set-auth-token` response-header flow — Better-auth docs convention. **MEDIUM** (confirm the header name against the installed better-auth version at MA1 plan time).

---
*Architecture research for: production mobile auth + 3-role routing + admin agent + push, integrated into the RunStudio agent-native fork*
*Researched: 2026-06-29*
