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
| result          | **BLOCKED — adapter bug found + fixed; full green pending a real runtime** |
| profile_loaded  | not yet — see below |
| user_id_in_neon | still null (claim hasn't run end-to-end yet) |
| idempotent      | (pending)         |
| notes           | Exercising the real `requireMember` in-process surfaced a genuine bug: the H3Event adapter passed the wrong shape for **h3 v2** (core resolves `h3@2.0.x-rc`, where `event.web`→`event.req`). `getSession` crashed on `event.req.headers` (undefined). **Fixed in `87feb71c`** (event now exposes both `req` and `headers`); the crash is gone (clean auth check instead). Could not confirm the green end-to-end locally: the in-process script can't boot Better-auth (not an exported entry), and `agent-native dev` is broken on this Windows box (`NitroViteError: Vite environment "nitro" unavailable` + 60s module-load timeouts — framework tooling, not our code). **Verify after deploying MA1 to Vercel** (the only working full runtime), then re-run the HTTP profile check. |

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
| Leg 1 — Sign-in + token store | PASS | **PASS** (server-verified) |
| Leg 2 — getSession + claim    | PASS | adapter fixed; **awaiting deploy + re-test** |
| Leg 4 — Admin SSE carries session | PASS | PENDING (needs a runnable device) |

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
