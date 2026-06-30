# MA1 Auth Spike Results

**Phase:** MA1 — Auth + 3-Role Spine (the one-way door)
**Plan:** MA1-03
**Spike date:** PENDING (to be filled in after device verification)
**Device:** iPhone (Expo Go or EAS dev build)
**API base:** https://gym-class-os.vercel.app
**Neon project:** billowing-sun-51091059

---

## Test Account

| Field       | Value                                          |
|-------------|------------------------------------------------|
| email       | ma1-spike@example.com                         |
| password    | 12345678  (Better-auth requires ≥ 8 chars — "123456" was rejected PASSWORD_TOO_SHORT) |
| memberId    | mbr_spike_ma1_001                              |
| userId      | null at seed time — claim links it on first sign-in (Leg 2) |

Seeded against live Neon on 2026-06-29 — user created (HTTP 200), unclaimed gym_members row inserted.

```bash
MA1_SPIKE_PASSWORD='12345678' MA1_SPIKE_API_BASE=https://gym-class-os.vercel.app \
pnpm --filter @gymos/staff-web db:seed-ma1-test-account
```

### Pre-device finding (resolved) — Origin header required

Running the seed against the live deploy surfaced a real integration bug **before**
the device step: the Better-auth sign-up/sign-in endpoints enforce an Origin check
and reject requests with **no** Origin header (`403 MISSING_OR_NULL_ORIGIN`). Neither
the seed (Node `fetch`) nor the mobile client (React Native `fetch`) was sending one.
Fixed in commit `0b25841e` by sending the API base as `Origin` (a trusted origin by
default = baseURL) in both `seed-ma1-test-account.ts` and `mobile-app/lib/sign-in-api.ts`.
**Implication for the device legs:** Leg 1 should now pass; if it still 403s, the
deploy's trustedOrigins does not include `https://gym-class-os.vercel.app` — check
`BETTER_AUTH_URL` / trustedOrigins on the Vercel env.

---

## Spike Legs

---

### Leg 1 — Sign-in + token store (AUTH-01)

**What to test:** Open the app on device. Enter the seeded email + password and tap
Sign in. The app should navigate into the tabs (no error). The `set-auth-token`
response header should be read and stored in expo-secure-store.

**Watch for:** If sign-in fails with "No set-auth-token header", the endpoint may
have returned a redirect (Pitfall 5 in MA1-RESEARCH.md) — note the HTTP status code.

| Field        | Value                  |
|--------------|------------------------|
| result       | **PASS** (server-verified 2026-06-29, against live deploy) |
| http_status  | 200                    |
| token_stored | yes — `set-auth-token` header present and read |
| notes        | Verified the sign-in contract end-to-end via Node round-trip (faithful to native: sets `Origin`, no browser CORS). On-device UI step still pending a runnable device (Expo Go SDK-55 / EAS both blocked). Required the `Origin` header fix (`0b25841e`). |

---

### Leg 2 — getSession round-trip + claim (AUTH-05 / AUTH-07)

**What to test:** The Home tab's first `/api/m/profile` call should return the
member (name "Spike"). Confirm in Neon (`billowing-sun-51091059`) that
`gym_members.user_id` on the seeded row is now SET to the Better-auth user id
(the claim linked it). A second app open should still resolve the same member
(idempotent claim).

**Neon verification SQL:**
```sql
SELECT id, user_id, email FROM gym_members WHERE email = 'ma1-spike@example.com';
```

| Field           | Value             |
|-----------------|-------------------|
| result          | **PASS** (server-verified in production 2026-06-29) |
| profile_loaded  | yes — `/api/m/profile` returned member "Spike" (`mbr_spike_ma1_001`) on a real Bearer request |
| user_id_in_neon | `oaMoks8B5oDXs6yn1rhUTDw5cgADcY2a` — claim linked the row (was null) |
| idempotent      | yes by construction — fast-path resolves by `user_id` once linked (12/12 unit tests); a re-run resolves the same member |
| notes           | Took THREE fixes to get green: (1) Origin header `0b25841e`; (2) **h3 v2 H3Event adapter** `87feb71c` — `getSession` crashed on the old `{headers,node}` shape because core resolves `h3@2.0.x-rc` (`event.web`→`event.req`); fixed to expose both `req` and `headers`; (3) **uncommitted `pnpm-lock.yaml`** `2933e779` — MA1-02's `npx expo install expo-secure-store` never committed the lockfile, so Vercel `--frozen-lockfile` failed the build. Verified against the LIVE Vercel deploy (the only working full runtime — local dev server + Expo Go both blocked). The h3 v2 adapter fix is proven to resolve a real Bearer session and run the lazy claim in production. |

---

### Leg 3 — Session persists across restart (AUTH-03)

**What to test:** Force-quit the app and reopen. It should go straight to the
tabs (no sign-in prompt) — the secure-store token survived the restart.

| Field            | Value             |
|------------------|-------------------|
| result           | PENDING           |
| goes_to_tabs     | (yes / no)        |
| notes            |                   |

---

### Leg 4 — Admin SSE carries the session (AUTH-07 — keystone)

**What to test:** This is the hardest leg. Add the test email (`ma1-spike@example.com`)
to `RUNSTUDIO_OPERATOR_EMAILS` on the Vercel deploy so `resolveRole` returns
`"admin"` for it (or use a separate operator-allowlisted account). Open the
agent FAB in the app and send a message. The SSE stream should return deltas
(not a 401), proving `Authorization: Bearer` survived the `react-native-sse`
streaming POST to `/api/m/agent/stream`.

**Reconnect test (optional):** Background and foreground the app mid-stream.
Expect headers still present on reconnect (Pitfall 7 in MA1-RESEARCH.md —
`react-native-sse` re-sends headers on every `open()` call).

| Field               | Value             |
|---------------------|-------------------|
| result              | PENDING           |
| sse_stream_delivers | (yes / no)        |
| http_status         |                   |
| reconnect_ok        | (yes / no / N/A)  |
| notes               |                   |

---

### Leg 5 — Sign-out (AUTH-03)

**What to test:** Trigger sign-out from the Profile tab. The app should return
to the sign-in screen. Reopening the app should NOT auto-enter the tabs (token
cleared from expo-secure-store).

| Field                   | Value             |
|-------------------------|-------------------|
| result                  | PENDING           |
| returns_to_signin       | (yes / no)        |
| reopen_stays_on_signin  | (yes / no)        |
| notes                   |                   |

---

## Gate Criteria

**MA2/MA3/MA4 must NOT be planned until these three legs PASS:**

| Gate leg | Required result | Current |
|----------|-----------------|---------|
| Leg 1 — Sign-in + token store | PASS | **PASS** (production-verified) |
| Leg 2 — getSession + claim    | PASS | **PASS** (production-verified — claim linked the row) |
| Leg 4 — Admin SSE carries session | PASS | PENDING — needs a runnable device (Expo Go dead on iOS; EAS gated). `react-native-sse` re-sends headers on every `open()` (MA1-RESEARCH Finding 5, source-confirmed), so the Bearer header is expected to survive; transport-level, not a claim-logic risk. |

**Server-side spine (the security-critical core) is PROVEN in production.** Legs 1+2 cover sign-in, `set-auth-token` capture, the h3 v2 Bearer session resolution, and the idempotent claim-by-email that links `gym_members.user_id`. The only open gate is Leg 4 (native SSE header survival on a real device) — blocked by device tooling, not code, and statically de-risked by the `react-native-sse` source.

## Device UAT (2026-06-30) — on a real iPhone, EAS dev build (`com.airunstudio.app`)

Got the app running on a physical device via an EAS dev-client build (no Mac — cloud build). Path to get there required: Apple Developer enrol → register App ID `com.airunstudio.app` → `eas init` (linked `@patrickalexanderross/hustle`) → `eas build -p ios --profile development` → enable iOS Developer Mode → open Windows Firewall for port 8081 → `EXPO_USE_METRO_WORKSPACE_ROOT=1` (monorepo serverRoot) + `CI=1` (Windows watch-mode workaround) + cleared Metro cache. App points at the live deploy via `EXPO_PUBLIC_API_BASE`.

**Device leg results:**
| Leg | On device |
|-----|-----------|
| 1 — Sign in (`ma1-spike@example.com` / `12345678`) | **PASS** |
| 2 — Identity/claim (member "Spike" loads) | **PASS** |
| 3 — Restart persistence (reopen → straight in) | **PASS** |
| 5 — Sign out (→ sign-in, stays signed out) | **PASS** |
| 4 — Admin SSE (keystone) | **NOT YET RUN** — needs `ma1-spike@example.com` added to `RUNSTUDIO_OPERATOR_EMAILS` on Vercel + redeploy, then test agent chat streams (not 401) |

### Found during device UAT — fix next session (2026-07-01)
1. **401 Unauthorized uploading a photo to the calorie counter** (`/api/m/foods/analyze`). Bearer auth not carried on the image-upload path — the multipart/image POST likely isn't attaching `Authorization: Bearer` the way the JSON `apiFetch` does, or the analyze handler auths differently. **Investigate the upload path in `packages/mobile-app` (food-ai upload) + `api.m.foods.analyze.tsx`.**
2. **Failed-password shows a raw 401 + raw error string.** Sign-in screen needs a polished, professional error state (friendly message, no raw status/JSON). Lives in `packages/mobile-app/app/sign-in.tsx` / `sign-in-api.ts` error handling.

Both are app-polish/auth-edge items, not blockers for the MA1 spine (Legs 1/2/3/5 green). Leg 4 + these two are the remaining device-side work.

Legs 3 and 5 (restart persistence + sign-out) are desirable but not hard gates
for MA2/MA3/MA4.

## Spike findings (2026-06-29) — two real bugs caught before any device test

Both bugs would have hard-failed the on-device spike; both are now fixed.

1. **Missing `Origin` header** (`0b25841e`) — Better-auth's sign-in/up endpoints reject
   requests with no `Origin` header (`403 MISSING_OR_NULL_ORIGIN`). Neither the seed
   (Node fetch) nor the mobile client (React Native fetch) sent one. Fixed by sending
   the API base as `Origin` in `seed-ma1-test-account.ts` and `mobile-app/lib/sign-in-api.ts`.

2. **Wrong H3Event adapter shape for h3 v2** (`87feb71c`) — `requireMember`'s
   `sessionFromRequest` built `{ headers, node:{req,res} }`, but core resolves
   `h3@2.0.x-rc` where `event.web`→`event.req`. `getSession` crashed
   (`Cannot read properties of undefined (reading 'headers')`) on the first real Bearer
   request. Fixed so the event exposes both `req` (web Request) and `headers`.

**Runtime blockers hit (Windows tooling, not our code):** iOS Expo Go can't load SDK 55;
EAS dev builds gated on the upstream owner; `agent-native dev` fails locally
(Nitro 3 beta + Vite 8 dev-worker); Metro watch-mode times out without Watchman.
→ The only working full runtime is the **Vercel production deploy**. MA1 is currently
**23 commits ahead of `origin/master` (unpushed)** — the live deploy still runs the
pre-MA1 demo-only `/api/m` handlers. Deploy MA1, then re-run the profile check to
green Legs 2 (and 4 once a device is available).

---

## If a Leg Fails

Capture the symptom precisely (HTTP status, missing header, error text,
stack trace) and report back. A gap-closure sub-plan will be created to target
the specific failure before proceeding.

**Do NOT assume a failure is cosmetic.** The Bearer token round-trip through the
Fly/Vercel HTTPS proxy is the one thing that cannot be statically asserted —
that is the whole purpose of this spike.

---

*Scaffold created: 2026-06-29 (MA1-03 Task 1 commit)*
*Results to be filled in by the human after device verification.*
