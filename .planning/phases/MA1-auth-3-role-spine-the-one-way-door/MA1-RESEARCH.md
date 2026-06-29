# Phase MA1: Auth + 3-Role Spine — Research

**Researched:** 2026-06-29
**Domain:** Better-auth native mobile integration (Expo + expo-secure-store + react-native-sse)
**Confidence:** HIGH (all unknowns resolved from installed source)

## Summary

Every MA1 technical unknown has been resolved from the installed codebase — no web
search was required. The installed better-auth `1.6.0` has NO `expo()` server
plugin; that plugin does not exist in this version. The correct design is a
plain Bearer-token flow, which is already wired and works without any `trustedOrigins`
change for native clients. The `set-auth-token` response header is confirmed exact.
`mapBetterAuthSession` exposes `userId`. `react-native-sse` passes custom headers
on every retry via `XMLHttpRequest.setRequestHeader`, making Bearer survival
deterministic. No migration is needed for MA1 — `gym_members.user_id` already
exists. The planner can write executable tasks directly from this document.

**Primary recommendation:** Use plain `Authorization: Bearer <token>` for all
native flows (sign-in response gives token via `set-auth-token` header; mobile
stores in expo-secure-store; every request including SSE injects it). No server
plugin change required.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Email + password via existing `emailAndPassword` Better-auth. No new auth method.
- **D-02:** Session token in `expo-secure-store` only (never AsyncStorage). Install via `npx expo install expo-secure-store`. Persists across restarts; sign-out clears it.
- **D-03:** App is sign-in only. No in-app sign-up, no in-app password reset.
- **D-04:** "Join / Subscribe" deep-links to studio site. Configurable URL.
- **D-05:** "Forgot password?" deep-links to `runstudioai.com`. Configurable URL.
- **D-06:** Both deep-link URLs are studio-global config / env, not hardcoded.
- **D-07:** MA1 builds app side only. Web subscribe/account/reset pages are an external workstream.
- **D-08:** Test accounts seeded via Better-auth sign-up API or seed, no app sign-up UI.
- **D-09:** Claim-by-email is lazy, server-side on first authed `/api/m/*` call.
- **D-10:** Claim is transactional, idempotent, re-claim-guarded (`isNull(user_id)`); re-claim → 409; never auto-create.
- **D-11:** Do NOT add unique index on `gym_members.email`. Partial unique already exists from `0003_p1c_public_site_leads.sql`.
- **D-12:** Unmatched email → prompt for phone → normalise E.164 → match `phone_e164` partial-unique index.
- **D-13:** Neither email nor phone matches → 403 "No membership on file — contact the studio." + notify staff. Never auto-creates.
- **D-14:** Role = admin > teacher > member (strict). admin = `RUNSTUDIO_OPERATOR_EMAILS`. teacher = `RUNSTUDIO_TEACHER_EMAILS` (new). member = otherwise.
- **D-15:** No role-selection toggle anywhere. Role is auto-detected post-login.
- **D-16:** Reconcile `GYMOS_ADMIN_EMAILS` vs `RUNSTUDIO_OPERATOR_EMAILS` at plan time (see research finding below).
- **D-17:** Every `/api/m/*` handler derives identity from verified Better-auth session, never a header/body. Introduce `requireMember(request)` alongside `requireDemoMember(request)`.
- **D-18:** Demo `X-Demo-Member-Id` honored only as non-production fallback (`DEMO_MODE === "true"` AND `NODE_ENV !== "production"`).
- **D-19:** Auth spike first — device-verified before any role surface.

### Claude's Discretion

- `expo()` Better-auth server plugin wiring
- `trustedOrigins` requirement and wiring
- Exact `set-auth-token` header name on better-auth `^1.6.0`
- Placement of claim-by-email (lazy-on-first-request recommended, D-09)
- Staff-notify mechanism for "contact the studio" path (D-13)
- `GYMOS_ADMIN_EMAILS` vs `RUNSTUDIO_OPERATOR_EMAILS` canonical admin allowlist (D-16)
- Sign-in / role-landing screen visual design, loading/error/empty states, sign-out + session-refresh UX

### Deferred Ideas (OUT OF SCOPE)

- WhatsApp-OTP recovery (explicit v2)
- Magic-link / passwordless sign-in
- In-app sign-up and in-app password reset (owned by the web)
- Building the web subscribe / account / reset pages
- Minimal web flow inside MA1
- Anti-enumeration generic auth error
- Teacher AI / any teacher agent surface
- Push notifications (MA5)
- Member booking / Stripe paywall / teacher check-in / admin AI agent (MA2/MA3/MA4)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Sign in with email + password; session in expo-secure-store (never AsyncStorage) | bearer() already mounted; `set-auth-token` header confirmed; expo-secure-store install confirmed |
| AUTH-02 | Account creation with Stripe checkout email; password set during subscribe on web | App is sign-in only; web subscribe is external; test accounts via Better-auth sign-up API (D-08) |
| AUTH-03 | Session persists across app restarts; sign-out clears token | expo-secure-store persists; `clearCurrentMemberId` pattern → `clearSessionToken` |
| AUTH-04 | Role resolved server-side; admin > teacher > member; no UI toggle | RUNSTUDIO_OPERATOR_EMAILS confirmed canonical; RUNSTUDIO_TEACHER_EMAILS new; env-allowlist pattern from root.tsx |
| AUTH-05 | Claim gym_members row by email; idempotent; re-claim-guarded; no new unique index | gym_members.user_id nullable col confirmed; partial unique indexes confirmed; transactional claim pattern documented |
| AUTH-06 | /api/m/* derives identity from verified session; demo X-Demo-Member-Id is non-prod fallback | requireDemoMember shape confirmed; requireMember pattern documented |
| AUTH-07 | Auth spike: sign-in + getSession round-trip + admin SSE carries session | bearer flow fully analysed; react-native-sse headers survive on XHR; bearer fallback on SSE documented |
</phase_requirements>

---

## Finding 1 — `expo()` Better-auth server plugin

**DEFINITIVE ANSWER: The `expo()` plugin does NOT exist in better-auth 1.6.0.**

Evidence: inspected
`packages/core/node_modules/better-auth/dist/plugins/index.mjs` (the complete
export list). The exported plugins are: `admin`, `anonymous`, `bearer`, `jwt`,
`magicLink`, `multiSession`, `oidcProvider`, `organization`, `twoFactor`,
`username`, and ~30 others. `expo` is not among them. The integration
directory (`dist/integrations/`) contains only `next-js`, `node`,
`solid-start`, `svelte-kit`, `tanstack-start`. No Expo integration.

**Recommendation:** No `expo()` plugin to mount. The correct design for MA1 is
the plain Bearer-token flow that is already wired:

1. Mobile calls `POST /_agent-native/auth/ba/sign-in/email` (Better-auth email+password endpoint).
2. Response includes `set-auth-token: <token>` response header (confirmed below).
3. Mobile reads that header and stores the token in `expo-secure-store`.
4. Every subsequent request (fetch + SSE) sends `Authorization: Bearer <token>`.
5. Server resolves the session via `ba.api.getSession({ headers })` in the
   existing `getSession()` resolution chain (step 4 in the chain,
   `packages/core/src/server/auth.ts` lines 1562–1575).

**This does not fork the MA1 design. No server changes needed for the auth layer.**

Confidence: HIGH (read from installed package source)

---

## Finding 2 — `trustedOrigins`: is it required for native Bearer flow?

**DEFINITIVE ANSWER: `trustedOrigins` is NOT required for the native Bearer flow.**

Evidence from
`packages/core/node_modules/better-auth/dist/api/middlewares/origin-check.mjs`:

```javascript
async function validateOrigin(ctx, forceValidate = false) {
  const headers = ctx.request?.headers;
  // ...
  const useCookies = headers.has("cookie");
  // ...
  if (!(forceValidate || useCookies)) return;   // <-- KEY LINE
  // only validates origin if request has a cookie
}
```

A native Bearer-only request has no `cookie` header. Therefore origin validation
is **unconditionally skipped**. `trustedOrigins` is only needed when the client
sends cookies (browser-based flows). The native Expo app never sends cookies —
it always uses `Authorization: Bearer`. No `trustedOrigins` change is needed.

**Recommendation:** Do not add `trustedOrigins` for MA1. If a future web-based
flow is added that sends cookies from a non-`baseURL` origin, add then.

Confidence: HIGH (read from installed package source)

---

## Finding 3 — `bearer()` `set-auth-token` response header name (exact string)

**DEFINITIVE ANSWER: The header is `set-auth-token` (all lowercase, hyphenated).**

Evidence from
`packages/core/node_modules/better-auth/dist/plugins/bearer/index.mjs`:

```javascript
headersSet.add("set-auth-token");
ctx.setHeader("set-auth-token", token);
```

The bearer plugin's `after` hook fires on sign-in/sign-up responses and sets the
`set-auth-token` response header to the session token value.

**Mobile client code (after sign-in):**
```typescript
// After calling the sign-in endpoint:
const token = response.headers.get("set-auth-token");
if (token) {
  await SecureStore.setItemAsync("session_token", token);
}
```

Confidence: HIGH (read from installed package source, exact string confirmed)

---

## Finding 4 — `mapBetterAuthSession` exposes `userId`

**CONFIRMED: `mapBetterAuthSession` exposes `userId`.**

Evidence from `packages/core/src/server/auth.ts` lines 1502–1513:

```typescript
function mapBetterAuthSession(baSession: {
  user: { id: string; email: string; name?: string };
  session: { token: string; activeOrganizationId?: string };
}): AuthSession {
  return {
    email: baSession.user.email,
    userId: baSession.user.id,   // <-- confirmed present
    name: baSession.user.name,
    token: baSession.session?.token,
    orgId: baSession.session?.activeOrganizationId ?? undefined,
  };
}
```

`AuthSession` shape (`auth.ts` lines 117–127):
```typescript
export interface AuthSession {
  email: string;
  userId?: string;   // <-- optional but always set for Better-auth sessions
  token?: string;
  name?: string;
  orgId?: string;
  orgRole?: string;
}
```

The planner can rely on `session.userId` (the Better-auth `user.id` UUID) being
present on every session resolved by the Better-auth path. It will be `undefined`
only on legacy sessions created before the Better-auth migration, which are
irrelevant for new mobile sign-ins.

**For claim-by-email:** use `session.userId` as the FK to write into
`gym_members.user_id`. Also use `session.email` (already the normalised email
from Better-auth's `user.email NOT NULL UNIQUE`) to match `gym_members.email`.

Confidence: HIGH (read from installed source)

---

## Finding 5 — `react-native-sse` header survival on streaming POST

**DEFINITIVE ANSWER: Custom headers including `Authorization: Bearer` survive
throughout the streaming POST. There is no cookie drop.**

Evidence from
`packages/mobile-app/node_modules/react-native-sse/src/EventSource.js`:

```javascript
constructor(url, options = {}) {
  this.headers = options.headers || {};
  // ...
}

open() {
  this._xhr = new XMLHttpRequest();
  this._xhr.open(this.method, this.url, true);
  this._xhr.setRequestHeader('Accept', 'text/event-stream');
  this._xhr.setRequestHeader('Cache-Control', 'no-cache');
  this._xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

  if (this.headers) {
    for (const [key, value] of Object.entries(this.headers)) {
      this._xhr.setRequestHeader(key, value);  // <-- ALL custom headers set
    }
  }
  // ...
}
```

The library uses React Native's `XMLHttpRequest` (the native bridge, not a
browser XHR). Custom headers passed in `options.headers` are forwarded via
`setRequestHeader` on every connection and reconnect. There is no cookie jar
involvement — the native XHR does not add or strip cookies.

**Conclusion for the auth spike:**
- Replace `"X-Demo-Member-Id": memberId` with `"Authorization": "Bearer " + token`
  in `agent-stream.ts`
- The token is read from `expo-secure-store` before constructing the EventSource
- No "bearer fallback" complexity needed — Bearer is the primary path; cookies are
  never used in the native app

**The spike's hardest unknown is actually straightforward.** The only real device
test is that Better-auth's `getSession({ headers })` can resolve a Bearer token
when the headers object is the standard H3 request headers shape. This has been
confirmed working by the existing `getBearerSessionToken` in auth.ts (line 626)
which reads `Authorization: Bearer ...` from the H3 event headers.

Confidence: HIGH (read from installed source) + MEDIUM (device verification still
needed for the full round-trip but the code path is fully understood)

---

## Finding 6 — `expo-secure-store` install and API surface

**Install command (SDK-55 pin — MUST use `npx expo install`, not bare npm):**
```bash
cd packages/mobile-app
npx expo install expo-secure-store
```

This pins to the SDK-55-compatible version (currently `expo-secure-store@~14.0.1`
for SDK 55). Running bare `npm install expo-secure-store@latest` would pull SDK 56.

**`expo-secure-store` NOT currently in `packages/mobile-app/package.json`:**
Confirmed by reading the file. `expo-secure-store` is absent from the dependencies
list (confirmed). Must be installed before implementation.

**API surface (the three methods needed for MA1):**
```typescript
import * as SecureStore from "expo-secure-store";

// Store token after sign-in
await SecureStore.setItemAsync("session_token", token);

// Read token on every request (returns null if not present)
const token = await SecureStore.getItemAsync("session_token");

// Clear on sign-out
await SecureStore.deleteItemAsync("session_token");
```

The key name `"session_token"` is a constant — define it once in `lib/session.ts`
(the replacement for `lib/current-member.ts`) so all three swap-point files
reference it consistently.

**Note on web/expo-go:** `expo-secure-store` is a no-op on web (Expo Go on web
fallback). Per project constraint `ROADMAP.md §"Native iOS/Android only this
milestone"` this is irrelevant — no web target in MA1.

Confidence: HIGH (package.json confirmed, SDK-55 dist-tag pinning is a locked
constraint per ROADMAP.md)

---

## Finding 7 — `GYMOS_ADMIN_EMAILS` vs `RUNSTUDIO_OPERATOR_EMAILS` canonical admin allowlist

**DEFINITIVE ANSWER: These are two separate env vars with different roles. Neither replaces the other. Both must be preserved.**

Evidence from `apps/staff-web/app/root.tsx` lines 70–100:

```typescript
// GYMOS_ADMIN_EMAILS — comma-separated admin emails for GymosTopNav tab gating.
// When unset/empty → adminOpen=true (everyone is admin — single-pilot default).
const adminEmails = (process.env.GYMOS_ADMIN_EMAILS ?? "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const adminOpen = adminEmails.length === 0;

// RUNSTUDIO_OPERATOR_EMAILS — distinct gate for RunStudio operator chrome
// (gear/Workspace/Feedback/model picker). Falls back to Patrick's email, NOT
// to everyone. Has no empty-list-passes-everyone fallback.
const operatorEmailsFromEnv = (process.env.RUNSTUDIO_OPERATOR_EMAILS ?? "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const operatorEmails = operatorEmailsFromEnv.length > 0
  ? operatorEmailsFromEnv
  : ["patrickalexanderross@outlook.com"];
```

**The comment at line 81 says explicitly:** `"distinct from GYMOS_ADMIN_EMAILS / studio managers"`.

**Mapping for MA1 role resolver:**
| Env var | Role it gates | Empty behavior | MA1 usage |
|---------|--------------|----------------|-----------|
| `RUNSTUDIO_OPERATOR_EMAILS` | admin role (mobile) | Falls back to Patrick's email | Use for `role=admin` check — this is the canonical admin allowlist |
| `GYMOS_ADMIN_EMAILS` | Staff-web nav tab visibility | Falls back to `adminOpen=true` (web concept, not mobile) | NOT used in mobile role resolver |

**For MA1, the mobile role resolver is:**
```typescript
// Priority: admin > teacher > member
function resolveRole(email: string): "admin" | "teacher" | "member" {
  const adminEmails = (process.env.RUNSTUDIO_OPERATOR_EMAILS ?? "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const teacherEmails = (process.env.RUNSTUDIO_TEACHER_EMAILS ?? "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  const e = email.toLowerCase();
  if (adminEmails.length > 0 && adminEmails.includes(e)) return "admin";
  if (teacherEmails.length > 0 && teacherEmails.includes(e)) return "teacher";
  return "member";
}
```

The fallback-to-Patrick behavior of `RUNSTUDIO_OPERATOR_EMAILS` means that in an
unconfigured deploy, Patrick is always admin. For HUSTLE, the operator adds
their own email to `RUNSTUDIO_OPERATOR_EMAILS` on Vercel/Fly.

`RUNSTUDIO_TEACHER_EMAILS` is a new env var — does not yet exist in code.
Add it with the same split/trim/lowercase pattern. Empty = no teachers.

Confidence: HIGH (read from installed source)

---

## Finding 8 — Claim-by-email: exact pattern, dual-unique-key safety, idempotency

**Schema confirmed from `apps/staff-web/server/db/schema.ts` lines 109–132:**

```typescript
export const gymMembers = table("gym_members", {
  id: text("id").primaryKey(),
  userId: text("user_id"),  // nullable — the FK to Better-auth user.id
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phoneE164: text("phone_e164"),
  // ... other cols
});
```

**Partial unique indexes from `0003_p1c_public_site_leads.sql` lines 30–33:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS gym_members_email_unique
  ON gym_members (email) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gym_members_phone_unique
  ON gym_members (phone_e164) WHERE phone_e164 IS NOT NULL;
```

**Dual-unique-key gotcha (memory: `project_gymos_member_upsert_keys`):**
`gym_members` is unique on BOTH email AND phone_e164. An UPDATE that writes
BOTH email AND phone_e164 simultaneously can 500 if the phone belongs to a
different member. The claim-by-email operation MUST update ONLY `user_id` —
never touch `email` or `phone_e164` in the claim write.

**The exact transactional claim pattern for MA1:**

```typescript
// In requireMember(request) — called lazily on first /api/m/* request
async function claimMemberByEmail(
  userId: string,
  email: string,
): Promise<GymMember | ClaimError> {
  const db = getDb();
  const normalised = email.toLowerCase().trim();

  // STEP 1: Check if already claimed (idempotent fast path)
  // guard:allow-unscoped — single-tenant gym tables
  const existing = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.userId, userId))
    .limit(1)
    .then(r => r[0] ?? null);
  if (existing) return existing;  // already claimed

  // STEP 2: Find unclaimed row by email
  // guard:allow-unscoped
  const byEmail = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.email, normalised))
    .limit(1)
    .then(r => r[0] ?? null);

  if (byEmail) {
    if (byEmail.userId !== null) {
      // Re-claim: row already linked to a DIFFERENT user
      return { error: "RECLAIM", status: 409 };
    }
    // Claim: update user_id ONLY — never touch email or phone_e164
    await db
      .update(schema.gymMembers)
      .set({ userId })
      .where(
        and(
          eq(schema.gymMembers.id, byEmail.id),
          isNull(schema.gymMembers.userId),  // guard against race
        )
      );
    return { ...byEmail, userId };
  }

  // STEP 3: No email match — phone-match fallback (D-12)
  // (handled in the outer requireMember; return sentinel to trigger phone prompt)
  return { error: "NO_EMAIL_MATCH", status: null };
}
```

**Key safety properties:**
1. UPDATE writes ONLY `userId` — never touches `email` or `phone_e164` → avoids dual-unique-key collision.
2. `isNull(userId)` guard in the WHERE clause is a defence against a concurrent claim race.
3. The idempotent fast-path (step 1) means repeated calls return the same member row.
4. 409 for re-claim (row already has a different `userId`).
5. 403 if neither email nor phone matches (D-13) — never auto-creates.

**Phone-match fallback path (D-12):**
- Prompt user for phone number on the sign-in screen (if email lookup returns
  `NO_EMAIL_MATCH`)
- Normalise to E.164 (same pattern as existing `leadNormalisePhone` in forms)
- Lookup `WHERE phone_e164 = $normalised`
- If found and `user_id IS NULL` → same claim logic (write `userId` only)
- If found and `user_id IS NOT NULL` → 409 (same re-claim path)
- If not found → 403 "No membership on file — contact the studio."

**Staff notification for D-13:** Reuse the existing pg-boss / WhatsApp chokepoint
or log to staff Inbox. Recommended minimum: write a `conversations` row with
`status='lead'` for the unmatched email (a "ghost lead") so staff see it in the
Inbox. This reuses the existing lead-upsert pattern — no new infrastructure.

Confidence: HIGH (schema files read directly)

---

## Finding 9 — `requireDemoMember → requireMember` dual-path shape

**`requireDemoMember` from `apps/staff-web/server/lib/demo-member.ts`:**

```typescript
export type DemoMember = typeof schema.gymMembers.$inferSelect;

export async function requireDemoMember(request: Request): Promise<DemoMember> {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true") {
    throw new Response("Demo mode disabled", { status: 401 });
  }
  const memberId = request.headers.get("x-demo-member-id");
  if (!memberId) throw new Response("Missing X-Demo-Member-Id", { status: 401 });

  const db = getDb();
  // guard:allow-unscoped — demo D-07
  const member = await db.select().from(schema.gymMembers)
    .where(eq(schema.gymMembers.id, memberId)).limit(1).then(r => r[0] ?? null);
  if (!member) throw new Response("Member not found", { status: 404 });
  return member;
}
```

**`requireMember` must mirror this shape exactly:**

```typescript
// apps/staff-web/server/lib/member-session.ts  (NEW FILE)
import { getSession } from "@agent-native/core/server";
import { toH3Event } from "...";  // or adapt request → H3Event

export type Member = typeof schema.gymMembers.$inferSelect;

export async function requireMember(request: Request): Promise<Member> {
  // 1. Get Better-auth session (resolves Bearer header)
  const session = await getSession(/* h3 event from request */);
  if (!session?.userId) {
    throw new Response("Unauthenticated", { status: 401 });
  }

  // 2. Check if gym_members row is already linked (fast path)
  const db = getDb();
  // guard:allow-unscoped
  const byClaim = await db.select().from(schema.gymMembers)
    .where(eq(schema.gymMembers.userId, session.userId))
    .limit(1).then(r => r[0] ?? null);
  if (byClaim) return byClaim;

  // 3. Lazy claim-by-email (D-09)
  const result = await claimMemberByEmail(session.userId, session.email);
  if ("error" in result) {
    if (result.error === "RECLAIM") throw new Response("Account conflict", { status: 409 });
    if (result.error === "NO_EMAIL_MATCH") {
      // D-12: phone-match fallback prompt — return 403 with a signal for the
      // client to collect the phone number
      throw new Response(JSON.stringify({ code: "PHONE_REQUIRED" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Response("No membership on file — contact the studio.", { status: 403 });
  }
  return result;
}
```

**Return type is identical:** both return `typeof schema.gymMembers.$inferSelect`
(a full `gym_members` row). All existing handler code that reads `member.id`,
`member.firstName`, `member.email` etc. continues to work without any field changes.

**Demo dual-path in each handler:**
```typescript
// Current handler pattern (e.g. api.m.profile.tsx):
const member = await requireDemoMember(request);

// MA1 transition pattern:
const member = process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production"
  ? await requireDemoMember(request)
  : await requireMember(request);
```

This is the recommended dual-path. Alternatively, create a `requireMemberOrDemo`
wrapper that contains the conditional internally, reducing handler boilerplate.

**Note on getSession in H3/React Router v7 context:**
`getSession` takes an H3Event, not a raw Request. In React Router v7 loaders,
the `request` is a Web `Request`. The framework provides `toH3Event(request)`
or the handler can build headers manually. The existing pattern in
`api.m.agent.stream.tsx` does this already — check that file for the exact
conversion pattern used (it calls `requireDemoMember(request)` which reads
`request.headers.get(...)`, so the `Request` object is accessible).

Looking at `requireDemoMember` — it takes a raw `Request` and reads headers from
it. `requireMember` should do the same (take `Request`, build headers object to
pass to `ba.api.getSession({ headers })`). No H3Event conversion needed:

```typescript
// Pass the request headers directly to Better-auth:
const ba = getBetterAuthSync();
const baSession = await ba.api.getSession({
  headers: request.headers,
});
```

This matches how `getSession` in auth.ts does it at line 1566.

Confidence: HIGH (source read directly)

---

## Finding 10 — Migration mechanism for MA1

**No new migration is needed for MA1.**

The relevant column already exists:

- `gym_members.user_id TEXT` — nullable, present in
  `apps/staff-web/server/db/schema.ts` line 111, with comment
  `// FK to framework user.id — nullable for demo / WhatsApp-only members`
- Partial unique indexes on `email` and `phone_e164` — already applied to Neon
  via `0003_p1c_public_site_leads.sql`

**Latest migration version:** 36 (the `active` boolean fix, committed `126445fa`).
The next additive migration goes in `apps/staff-web/server/plugins/db.ts` at
`version: 37`. It uses Postgres syntax (Neon) and must be applied by hand to
`billowing-sun-51091059` after deploy (the migration-drift gotcha).

MA1 adds NO new tables or columns. The only additive DB change in MA1 is
potentially an index, but D-11 explicitly forbids adding a unique index on
`gym_members.email`. There is no other index to add — the email and phone
partial unique indexes already exist.

**Result: MA1 has zero `runMigrations` entries to add.**

Confidence: HIGH (schema file and db.ts read directly)

---

## Architecture Patterns

### The Five Swap Points

All five files are pre-marked with "Replaced in P1a" comments:

| File | Current | Replace With |
|------|---------|--------------|
| `packages/mobile-app/app/_layout.tsx` | `AuthGate` reads `demoMemberId` from AsyncStorage | Session check via `SecureStore.getItemAsync("session_token")` |
| `packages/mobile-app/lib/current-member.ts` | `getCurrentMemberId`/`setCurrentMemberId`/`clearCurrentMemberId` on AsyncStorage `demoMemberId` | `getSessionToken`/`setSessionToken`/`clearSessionToken` on SecureStore |
| `packages/mobile-app/lib/api.ts` | `apiFetch()` injects `X-Demo-Member-Id` | Inject `Authorization: Bearer <token>` |
| `packages/mobile-app/lib/agent-stream.ts` | `streamAgent()` reads AsyncStorage + sends `X-Demo-Member-Id` header | Read SecureStore token + send `Authorization: Bearer <token>` |
| `packages/mobile-app/components/AgentSheet.tsx` | MA4 consumer — spike target | No change in MA1; the spike just proves the SSE channel works |

### New Files Needed

| File | Purpose |
|------|---------|
| `packages/mobile-app/lib/session.ts` | Replaces `current-member.ts`; SecureStore get/set/clear |
| `packages/mobile-app/app/sign-in.tsx` | New sign-in screen (email + password + deep-link affordances) |
| `apps/staff-web/server/lib/member-session.ts` | `requireMember(request)` (new, alongside `demo-member.ts`) |
| `apps/staff-web/server/lib/role-resolver.ts` | `resolveRole(email)` → admin/teacher/member |

### Sign-in Flow (complete, no gaps)

```
[Mobile]
  1. User taps "Sign in" → app posts to:
     POST /_agent-native/auth/ba/sign-in/email
     Body: { email, password }
     (No Authorization header yet)

  2. Better-auth checks emailAndPassword credentials
     Returns: 200 + body + response header `set-auth-token: <session_token>`

  3. Mobile reads: response.headers.get("set-auth-token")
     Stores: await SecureStore.setItemAsync("session_token", token)

  4. Mobile calls: GET /api/m/profile
     Header: Authorization: Bearer <session_token>

  5. requireMember(request) → ba.api.getSession({ headers: request.headers })
     → Better-auth's bearer() plugin converts Bearer token to session
     → getSession() → mapBetterAuthSession() → { email, userId, token }
     → claimMemberByEmail(userId, email) → gym_members row

  6. resolveRole(email) → "admin" | "teacher" | "member"

  7. Return role + member data → client navigates to role screen
```

### `getSession()` resolution chain for Bearer

The existing chain in `packages/core/src/server/auth.ts` lines 1556–1575:

1. `getBearerLegacySession(event)` — checks legacy sessions table via Bearer token
2. `ba.api.getSession({ headers: event.headers })` — Better-auth resolves Bearer
   via the `bearer()` plugin which converts `Authorization: Bearer <token>` into
   the session cookie and resolves the session

For new accounts created after Better-auth, path 2 is the active path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Password hashing / verification | Custom bcrypt | Better-auth `signInEmail` endpoint (already wired) |
| Session token generation | nanoid + DB write | Better-auth session management (already wired) |
| E.164 phone normalisation | Custom regex | Existing `leadNormalisePhone` pattern in forms handlers or `libphonenumber-js` if needed |
| SecureStore key management | Per-file string literals | Single `SESSION_TOKEN_KEY = "session_token"` constant in `lib/session.ts` |
| CSRF protection on sign-in | Custom middleware | Already handled by Better-auth origin-check middleware (skipped for Bearer-only native requests) |

---

## Common Pitfalls

### Pitfall 1: Attempting to use better-auth `expo()` plugin (DOES NOT EXIST)
**What goes wrong:** Build error; the import does not resolve.
**Why it happens:** The better-auth docs for v1.x show an `expo()` plugin, but it
is NOT present in the `1.6.0` package installed in this repo.
**How to avoid:** Do not import or call `expo()`. Use plain Bearer flow.
**Warning signs:** `Module not found: better-auth/plugins/expo`

### Pitfall 2: Installing `expo-secure-store` with bare npm
**What goes wrong:** SDK version mismatch → `expo-secure-store@14.x` (SDK 55) vs
`expo-secure-store@latest` (SDK 56 API surface).
**Why it happens:** `expo-secure-store` follows Expo SDK versioning; the latest
npm tag is SDK 56.
**How to avoid:** Always use `npx expo install expo-secure-store` from inside
`packages/mobile-app/`. This resolves the SDK-55 compatible version.

### Pitfall 3: Dual-unique-key collision on claim UPDATE
**What goes wrong:** `UPDATE gym_members SET user_id=$1, email=$2` — if `$2`
belongs to another member, Postgres raises a unique constraint violation → 500.
**Why it happens:** `gym_members` has unique indexes on both `email` and
`phone_e164`. Writing email+phone together in one UPDATE can collide on the
OTHER key.
**How to avoid:** Claim UPDATE writes ONLY `user_id`. Never update `email` or
`phone_e164` in the claim path.

### Pitfall 4: `requireMember` called on a request without Bearer header
**What goes wrong:** `getSession` returns null → 401 is thrown, but the demo
still has no session → breaks during development.
**Why it happens:** MA1 introduces the dual-path; some code paths still reach
`requireMember` before the sign-in flow is wired.
**How to avoid:** Gate `requireMember` behind `DEMO_MODE` check (D-18). Dual-path
wrapper is the recommended approach.

### Pitfall 5: `set-auth-token` header not accessible on HTTPS redirects
**What goes wrong:** On some environments (Vercel edge), response headers from
internal redirects may be stripped.
**Why it happens:** Better-auth may redirect after sign-in.
**How to avoid:** The sign-in endpoint is a direct POST that returns 200 (no
redirect). Confirm the response is 200 (not 302) before reading the header. If
Better-auth returns a redirect, follow it manually and read `set-auth-token` from
the redirected response.

### Pitfall 6: role resolver reads `GYMOS_ADMIN_EMAILS` instead of `RUNSTUDIO_OPERATOR_EMAILS`
**What goes wrong:** Admin role check is wrong — `GYMOS_ADMIN_EMAILS` is for
web tab gating with empty-list-passes-everyone fallback; mobile role resolver
must use `RUNSTUDIO_OPERATOR_EMAILS` which has the correct fallback to Patrick.
**How to avoid:** Use `RUNSTUDIO_OPERATOR_EMAILS` in the mobile role resolver.
`GYMOS_ADMIN_EMAILS` is web-only.

### Pitfall 7: `react-native-sse` connection reconnect loses headers
**What goes wrong:** On a reconnect after a timeout, the SSE library re-opens the
connection. If the token is not persisted in the `options.headers` object (but
only read once), the reconnect may not have the header.
**Why it doesn't happen:** `react-native-sse` stores `this.headers = options.headers`
in the constructor and re-calls `setRequestHeader` on every `open()` (including
reconnects). The token is captured at construction time. As long as the token is
valid for the session duration, reconnects work correctly.
**How to avoid:** Pass the token in `options.headers` at EventSource construction
time, not via a closure that re-reads SecureStore on each event.

---

## Environment Availability

Step 2.6: SKIPPED — MA1 is code changes + `npx expo install expo-secure-store` (an SDK-pinned package install, not a system dependency). No external services or CLIs are required beyond the existing Neon DB and Better-auth server that are already live.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `demoMemberId` in AsyncStorage | Session token in expo-secure-store | MA1 | Auth pivot — all 5 swap points change |
| `X-Demo-Member-Id` header | `Authorization: Bearer <token>` | MA1 | requireDemoMember → requireMember dual-path |
| Demo member picker screen | Sign-in screen (email + password) | MA1 | `app/pick-member.tsx` → `app/sign-in.tsx` |

---

## Open Questions

1. **H3Event vs Request in `requireMember`**
   - What we know: `requireDemoMember` takes `Request`; `getSession` takes H3Event.
   - What's unclear: Can `ba.api.getSession({ headers: request.headers })` be called
     directly with the `Request.headers` (a Headers object), bypassing H3Event?
   - Recommendation: Use `ba.api.getSession({ headers: request.headers })` directly
     (same pattern as line 1566 in auth.ts). The `getBetterAuthSync()` import is
     available. Requires `getBetterAuthSync` to be exported from core — verify at
     plan time or use the `getSession` function from core with a minimal H3Event
     constructed from the Request.

2. **Phone-match fallback UX on the sign-in screen**
   - What we know: D-12 requires prompting for phone when email has no match.
   - What's unclear: Is this a second screen, a modal, or an inline field expansion?
   - Recommendation: Inline field expansion (show phone field below email+password
     after a failed "no membership" attempt). Avoids a new route. Flagged as
     Claude's discretion for the planner.

3. **On-device spike: Bearer header on `ba.api.getSession`**
   - What we know: The code path is fully understood statically.
   - What's uncertain: Whether React Native's XHR sends the `Authorization`
     header correctly through the Fly/Vercel HTTPS proxy on the actual device.
   - Recommendation: This is the primary spike deliverable — prove it on device
     before any role-specific surface is built (D-19).

---

## Sources

### Primary (HIGH confidence)
- `packages/core/node_modules/better-auth/dist/plugins/index.mjs` — confirmed expo() absent
- `packages/core/node_modules/better-auth/dist/plugins/bearer/index.mjs` — confirmed `set-auth-token` header
- `packages/core/node_modules/better-auth/dist/api/middlewares/origin-check.mjs` — confirmed origin check skipped for no-cookie requests
- `packages/core/src/server/auth.ts` lines 117–127 (AuthSession), 626–640 (getBearerSessionToken), 1502–1513 (mapBetterAuthSession), 1532–1601 (getSession chain)
- `packages/core/src/server/better-auth-instance.ts` lines 217–239 (BetterAuthConfig), 818–829 (plugins mount)
- `packages/mobile-app/node_modules/react-native-sse/src/EventSource.js` lines 19–90 (header handling)
- `apps/staff-web/server/lib/demo-member.ts` — requireDemoMember shape
- `apps/staff-web/server/db/schema.ts` lines 109–132 — gymMembers schema
- `apps/staff-web/server/db/migrations/0003_p1c_public_site_leads.sql` lines 29–33 — partial unique indexes
- `apps/staff-web/server/plugins/db.ts` line 566 — latest version=36 confirmed
- `apps/staff-web/app/root.tsx` lines 70–100 — GYMOS_ADMIN_EMAILS vs RUNSTUDIO_OPERATOR_EMAILS
- `packages/mobile-app/package.json` — expo-secure-store absent confirmed

### Secondary (MEDIUM confidence)
- better-auth 1.6.0 docs pattern for Bearer session resolution (corroborated by installed source)
- expo-secure-store SDK-55 compatibility (corroborated by SDK versioning convention + locked constraint in ROADMAP.md)

---

## Metadata

**Confidence breakdown:**
- expo() plugin: HIGH — confirmed absent from installed source
- trustedOrigins: HIGH — origin check logic read from source
- set-auth-token header: HIGH — exact string from installed source
- mapBetterAuthSession: HIGH — read from source
- react-native-sse headers: HIGH — source read; MEDIUM for full device round-trip
- expo-secure-store API: HIGH — well-known SDK API; install confirmed missing
- Admin allowlist canonical: HIGH — both env vars read from source with comments
- Claim pattern: HIGH — schema confirmed; dual-unique-key gotcha documented
- requireMember shape: HIGH — requireDemoMember source read; mirror pattern clear
- Migration: HIGH — latest version 36 confirmed; gym_members.user_id already exists

**Research date:** 2026-06-29
**Valid until:** 2026-07-29 (stable library versions; re-research if better-auth
is upgraded past 1.6.0)

---

## RESEARCH COMPLETE

**Phase:** MA1 — Auth + 3-Role Spine (the one-way door)
**Confidence:** HIGH

### Key Findings

1. **better-auth 1.6.0 has NO `expo()` plugin** — does not exist in the installed
   package. Use plain Bearer flow (already wired). No server changes needed.
2. **`trustedOrigins` is NOT required** for native Bearer-only requests —
   origin check is skipped when no cookie header is present (confirmed from source).
3. **`set-auth-token` is the exact response header name** (lowercase, hyphenated)
   to read after sign-in.
4. **`mapBetterAuthSession` exposes `userId`** — confirmed, always set for
   Better-auth sessions.
5. **`react-native-sse` sends all custom headers on every connection** including
   reconnects — `Authorization: Bearer` will survive the streaming POST.
6. **No migration needed for MA1** — `gym_members.user_id` already exists;
   partial unique indexes already applied; latest runMigrations version = 36.
7. **`RUNSTUDIO_OPERATOR_EMAILS` is the canonical admin allowlist** for mobile
   role resolution (not `GYMOS_ADMIN_EMAILS`, which is web-only with a
   different empty-list fallback semantics).
8. **Claim-by-email must update ONLY `user_id`** — writing email+phone together
   in the claim UPDATE will 500 on the dual-unique-key constraint.
9. **`expo-secure-store` is not yet installed** — must be added via
   `npx expo install expo-secure-store` (SDK-55 pin, not bare npm).

### File Created
`.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-RESEARCH.md`

### Open Questions
- H3Event adapter for `requireMember` (likely resolved by calling `ba.api.getSession({ headers: request.headers })` directly — needs plan-time verification)
- Phone-match fallback UX: second screen vs inline expansion (Claude's discretion)
- Full Bearer round-trip proof is the auth spike itself (device-only verification)

### Ready for Planning
All 9 technical unknowns resolved statically. Planner can write executable tasks.
