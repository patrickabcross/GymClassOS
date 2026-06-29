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
| password    | (from MA1_SPIKE_PASSWORD env var)              |
| memberId    | mbr_spike_ma1_001                              |
| userId      | (filled in after seed run + sign-in)           |

Seed the account against live Neon before running legs 1-4:

```bash
MA1_SPIKE_API_BASE=https://gym-class-os.vercel.app \
pnpm --filter @gymos/staff-web db:seed-ma1-test-account
```

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
| result       | PENDING                |
| http_status  |                        |
| token_stored | (yes / no)             |
| notes        |                        |

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
| result          | PENDING           |
| profile_loaded  | (yes / no)        |
| user_id_in_neon | (filled in)       |
| idempotent      | (yes / no)        |
| notes           |                   |

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
| Leg 1 — Sign-in + token store | PASS | PENDING |
| Leg 2 — getSession + claim    | PASS | PENDING |
| Leg 4 — Admin SSE carries session | PASS | PENDING |

Legs 3 and 5 (restart persistence + sign-out) are desirable but not hard gates
for MA2/MA3/MA4.

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
