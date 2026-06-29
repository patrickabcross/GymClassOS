---
phase: MA1-auth-3-role-spine-the-one-way-door
plan: 03
type: execute
wave: 3
depends_on: ["01", "02"]
files_modified:
  - apps/staff-web/server/db/seeds/seed-ma1-test-account.ts
  - apps/staff-web/server/lib/member-session.test.ts
  - .planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-SPIKE-RESULTS.md
autonomous: false
requirements: [AUTH-07]
user_setup: []

must_haves:
  truths:
    - "A test member account exists (Better-auth user + a gym_members row with a matching email and user_id IS NULL) so the claim round-trip can be exercised end to end"
    - "On a real device: sign-in stores a token, the first /api/m/profile call resolves the verified session and claims the gym_members row, and the admin SSE call carries the session (Authorization: Bearer survives the react-native-sse streaming POST)"
    - "The role resolver returns admin for an operator-allowlisted email and member otherwise, proven against the live endpoint"
    - "The spike result (pass/fail per leg) is recorded in MA1-SPIKE-RESULTS.md before any MA2/MA3/MA4 surface is built"
  artifacts:
    - path: "apps/staff-web/server/db/seeds/seed-ma1-test-account.ts"
      provides: "Idempotent seed: creates a Better-auth email+password test user and an unclaimed gym_members row with the same email for the spike"
    - path: ".planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-SPIKE-RESULTS.md"
      provides: "Recorded device-verification outcome per spike leg (sign-in, getSession round-trip, claim, admin SSE)"
  key_links:
    - from: "device sign-in"
      to: "apps/staff-web/server/lib/member-session.ts requireMember"
      via: "Authorization: Bearer <token> resolves the session and claims the row on first /api/m/profile"
      pattern: "Bearer"
    - from: "device agent sheet"
      to: "apps/staff-web/app/routes/api.m.agent.stream.tsx"
      via: "react-native-sse streaming POST carries Authorization: Bearer"
      pattern: "agent/stream"
---

<objective>
Prove the auth spine end-to-end on a real device (D-19, the keystone gate for the whole milestone): seed a test member account, then verify on a physical iPhone that sign-in stores a token, the first `/api/m/profile` call resolves the verified Better-auth session and claims the `gym_members` row, and the admin agent SSE call carries the session (Bearer survives the `react-native-sse` streaming POST). Record the result per leg.

Purpose: MA1 is a one-way door — MA2/MA3/MA4 all hang off `requireMember`. The static code path is fully understood (RESEARCH HIGH confidence), but the on-device Bearer round-trip through the Fly/Vercel HTTPS proxy is the ONE thing that cannot be statically asserted (RESEARCH Open Q3). This plan turns that uncertainty into a recorded pass/fail before any role surface is assumed.

Output: an idempotent test-account seed, an integration-level claim test that exercises the claim against seeded data, and MA1-SPIKE-RESULTS.md capturing the device verification.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-CONTEXT.md
@.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-RESEARCH.md
@.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-01-SUMMARY.md
@.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-02-SUMMARY.md

<interfaces>
<!-- Contracts the executor needs. -->

Test-account creation (D-08 — no in-app sign-up exists; seed via Better-auth sign-up endpoint):
```
POST {API_BASE}/_agent-native/auth/ba/sign-up/email
Body: { "email": "...", "password": "...", "name": "..." }
→ creates a Better-auth user (user.email NOT NULL UNIQUE). The user.id is the FK the claim writes into gym_members.user_id.
```

gym_members seed row (must match the test user's email, lower(trim), with user_id IS NULL so the claim can link it):
```typescript
// id: text PK; firstName notNull; email (partial-unique WHERE NOT NULL); userId NULL (claim target)
{ id, userId: null, firstName: "Spike", lastName: "Tester", email: "<test-email-lowercased>", phoneE164: "<E.164>" }
```

requireMember from Plan 01 — resolves session.userId, fast-path by user_id, else claimMemberByEmail.
The 403 PHONE_REQUIRED signal is returned when the email does not match (not exercised by the happy-path seed).

Neon project for HUSTLE: billowing-sun-51091059 (seed applied by hand / via Neon MCP per the migration-drift discipline; NO new migration here).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Idempotent test-account seed + integration-level claim test</name>
  <files>apps/staff-web/server/db/seeds/seed-ma1-test-account.ts, apps/staff-web/server/lib/member-session.test.ts</files>
  <read_first>
    - apps/staff-web/server/db/seeds/seed-demo-data.ts (existing seed conventions — how rows are inserted/idempotency handled)
    - apps/staff-web/server/lib/member-session.ts (requireMember + claimMemberByEmail from Plan 01 — the functions under test)
    - apps/staff-web/server/db/schema.ts (gymMembers columns; do NOT touch better-auth user/session/account tables directly — create the user via the sign-up endpoint, not raw SQL)
    - .planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-RESEARCH.md (Finding 8 claim pattern; D-08 test-account provisioning)
  </read_first>
  <behavior>
    - Running the seed twice does not error and does not create a second gym_members row for the test email (idempotent — guard on existing email row)
    - After seeding, a gym_members row exists with the test email and user_id IS NULL
    - claimMemberByEmail(testUserId, testEmail) links that row (writes user_id ONLY) and a second call returns the same row (idempotent)
  </behavior>
  <action>
    Create `apps/staff-web/server/db/seeds/seed-ma1-test-account.ts` — an idempotent seed exporting `async function seedMa1TestAccount(opts?: { email?; password?; phoneE164? })`:
    - Default email `ma1-spike@example.com`, password from `process.env.MA1_SPIKE_PASSWORD ?? "spike-test-pw-CHANGEME"`, phone a valid GB E.164 (e.g. `+447700900123`).
    - Create the Better-auth user by POSTing to `{BASE}/_agent-native/auth/ba/sign-up/email` (D-08 — do NOT insert into the better-auth `user` table via raw SQL; go through the endpoint so password hashing/session wiring is correct). If the user already exists (409/duplicate), treat as success and continue (idempotent).
    - Upsert the gym_members row: select by `eq(gymMembers.email, lower(trim(email)))`; if absent, insert `{ id: \`mbr_spike_...\`, userId: null, firstName: "Spike", lastName: "Tester", email: <lowercased>, phoneE164 }`. If present, leave it (do NOT overwrite user_id — the claim does that). Carry `// guard:allow-unscoped — single-tenant gym tables`.
    - Print the resulting test email + member id so the operator can use them in the device spike.
    This seed is run by hand against Neon `billowing-sun-51091059` (migration-drift discipline — NO new runMigrations entry). NO schema change.

    Extend `apps/staff-web/server/lib/member-session.test.ts` (from Plan 01) with an integration-style test that, against a mocked or in-memory db seeded with an unclaimed row, calls `claimMemberByEmail` and asserts: (a) the SET writes only `{ userId }`; (b) a second call returns the same row without a second UPDATE; (c) a row already owned by a different user returns `{ error: "RECLAIM", status: 409 }`. (This re-uses the Plan 01 mock harness — do not stand up a live DB in CI.)

    Run `npx prettier --write apps/staff-web/server/db/seeds/seed-ma1-test-account.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run server/lib/member-session.test.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - seed-ma1-test-account.ts exists, exports seedMa1TestAccount, creates the user via the sign-up endpoint (NOT raw INSERT into better-auth `user`), and upserts an unclaimed gym_members row idempotently
    - The seed never writes user_id on the gym_members row (claim does that) and carries `// guard:allow-unscoped`
    - member-session.test.ts asserts the user_id-only claim, idempotency, and the 409 reclaim — all green
    - `npx tsc --noEmit` in apps/staff-web is clean
  </acceptance_criteria>
  <done>An idempotent test account + unclaimed member row can be seeded; the claim is unit-proven to write user_id only and be idempotent/re-claim-guarded.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Device-verify the auth spike on a real iPhone (the keystone gate)</name>
  <files>.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-SPIKE-RESULTS.md</files>
  <read_first>
    - .planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-RESEARCH.md (Open Q3 — on-device Bearer round-trip is the only non-static check; Pitfall 5 set-auth-token over HTTPS redirect; Pitfall 7 SSE reconnect headers)
    - packages/mobile-app/IOS-EAS-RUNBOOK.md (how to run the app on a device — Expo Go for the demo, or a dev build)
  </read_first>
  <action>
    This is a human-verification checkpoint — its automatable prerequisites (Plans 01+02 code, the Task 1 seed) are already complete. The executor's job here is to (a) ensure the test account is seeded against Neon `billowing-sun-51091059` and `EXPO_PUBLIC_API_BASE` points at the live API, (b) hand the device-verification steps below to the user, and (c) write the result into `.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-SPIKE-RESULTS.md` (one PASS/FAIL line per leg + notes). This on-device round-trip is the single MA1 step that cannot be statically asserted — flag it explicitly to the user as a manual physical-iPhone check.
  </action>
  <what-built>
    Plan 01 (server: requireMember + resolveRole + dual-path across all /api/m/*) and Plan 02 (mobile: expo-secure-store session, sign-in screen, Bearer on apiFetch + agent SSE) are complete and tsc-clean. Task 1 seeded a test member account (Better-auth user + matching unclaimed gym_members row). Everything needed for the end-to-end Bearer round-trip is in place — this checkpoint is the ONE step that cannot be statically asserted: that React Native's XHR carries Authorization: Bearer through the Fly/Vercel HTTPS proxy on a real device, for both plain fetch and the react-native-sse streaming POST.
  </what-built>
  <how-to-verify>
    Run the app on a real iPhone (Expo Go pointed at the deployed API, or an EAS dev build per IOS-EAS-RUNBOOK.md). Set `EXPO_PUBLIC_API_BASE` to the live API origin. Then verify each leg and record PASS/FAIL in MA1-SPIKE-RESULTS.md:

    1. **Sign-in + token store (AUTH-01):** Open the app → it lands on the sign-in screen. Enter the seeded test email + password → tap Sign in. EXPECT: navigates into the tabs (no error). The token was read from the `set-auth-token` response header and written to expo-secure-store. (If sign-in fails with "No set-auth-token header", the endpoint redirected — Pitfall 5; note it and flag for a follow-up to follow-the-redirect.)
    2. **getSession round-trip + claim (AUTH-05/AUTH-07):** The Home tab's first `/api/m/profile` call must return the member (name "Spike"). Confirm in Neon (`billowing-sun-51091059`) that the seeded gym_members row's `user_id` is now SET to the Better-auth user id (the claim linked it). EXPECT: row claimed; a second app open still resolves the same member (idempotent).
    3. **Session persists across restart (AUTH-03):** Force-quit and reopen the app. EXPECT: it goes straight to the tabs (no sign-in prompt) — the secure-store token survived.
    4. **Admin SSE carries the session (AUTH-07, the hardest leg):** Add the test email to `RUNSTUDIO_OPERATOR_EMAILS` on the deploy (so it resolves admin), OR use a separate operator-allowlisted account. Open the agent FAB → send a message. EXPECT: the SSE stream returns deltas (not a 401) — proving `Authorization: Bearer` survived the `react-native-sse` streaming POST to `/api/m/agent/stream`. Watch a reconnect (background/foreground the app mid-stream if feasible) — EXPECT headers still present (Pitfall 7).
    5. **Sign-out (AUTH-03):** Trigger sign-out from Profile. EXPECT: returns to the sign-in screen; reopening the app does NOT auto-enter the tabs (token cleared).

    Record each leg's outcome (PASS / FAIL + notes) in `.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-SPIKE-RESULTS.md`. If any leg FAILS, capture the symptom precisely (status code, missing header, error text) so a gap-closure plan can target it. Do NOT proceed to MA2/MA3/MA4 until legs 1, 2, and 4 PASS (the spine + the SSE session-carry are the one-way-door gate).
  </how-to-verify>
  <acceptance_criteria>
    - MA1-SPIKE-RESULTS.md exists and records PASS/FAIL for all five legs
    - Legs 1 (sign-in/token), 2 (getSession + claim), and 4 (admin SSE carries session) are PASS — these three are the keystone gate
    - The claimed gym_members.user_id is confirmed SET in Neon for the seeded test account
  </acceptance_criteria>
  <done>The device spike outcome is recorded per leg; the one-way-door gate (sign-in + getSession round-trip + admin SSE carries session) is PASS before any MA2/MA3/MA4 surface is built.</done>
  <resume-signal>Type "approved" once legs 1, 2, and 4 PASS and MA1-SPIKE-RESULTS.md is written; or describe which leg failed (with the exact symptom) so a gap-closure plan can be created.</resume-signal>
</task>

</tasks>

<verification>
- Unit/integration claim tests green; tsc clean (Task 1)
- MA1-SPIKE-RESULTS.md records the device outcome per leg (Task 2)
- The one-way-door gate (sign-in + getSession round-trip + admin SSE carries session) is PASS before MA2/MA3/MA4 planning
</verification>

<success_criteria>
- AUTH-07: the auth spike passes on a real device — sign-in + getSession round-trip against the framework Better-auth instance, claim-by-email links the gym_members row, and the admin SSE call carries the session (Authorization: Bearer survives the react-native-sse streaming POST); bearer is the primary path (no cookie used), so the documented "bearer fallback" is the default
</success_criteria>

<output>
After completion, create `.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-03-SUMMARY.md`
</output>
