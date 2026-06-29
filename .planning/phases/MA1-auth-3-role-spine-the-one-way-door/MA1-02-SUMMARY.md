---
phase: MA1-auth-3-role-spine-the-one-way-door
plan: "02"
subsystem: mobile-auth
tags: [expo-secure-store, better-auth, bearer-token, sign-in-screen, auth-gate]
depends_on:
  requires: [MA1-01 requireMember / requireMemberOrDemo server contract]
  provides: [signInWithEmail, getSessionToken, setSessionToken, clearSessionToken, sign-in screen, AuthGate Bearer gate]
  affects: [all mobile apiFetch calls, agent SSE stream, app cold-start auth check, profile sign-out]
tech-stack:
  added: [expo-secure-store ~55.0.15 (SDK-55 pin)]
  patterns:
    - "Plain Bearer flow — no expo() plugin (does not exist in better-auth 1.6.0)"
    - "Single SESSION_TOKEN_KEY constant in lib/session.ts — one source of truth for all swap points"
    - "EXPO_PUBLIC_* env vars for deep-link URLs — repeatable per client (D-06)"
    - "Phone-fallback inline expansion (not a new route) on sign-in screen after 403 PHONE_REQUIRED"
key-files:
  created:
    - packages/mobile-app/lib/session.ts
    - packages/mobile-app/lib/auth-config.ts
    - packages/mobile-app/lib/sign-in-api.ts
    - packages/mobile-app/app/sign-in.tsx
  modified:
    - packages/mobile-app/package.json
    - packages/mobile-app/app.json
    - packages/mobile-app/lib/api.ts
    - packages/mobile-app/lib/agent-stream.ts
    - packages/mobile-app/app/_layout.tsx
    - packages/mobile-app/app/(tabs)/profile.tsx
decisions:
  - "expo-secure-store plugin added to app.json plugins array (required for native iOS/Android SecureStore access)"
  - "Pre-existing fontVariant readonly TS error in index.tsx is out of scope — not caused by MA1-02 changes"
  - "pick-member.tsx preserved on disk (demo path, AUTH-06) — not deleted; Stack registration kept for DEMO_MODE"
  - "Profile sign-out replaces demo 'switch member' long-press with real clearSessionToken + /sign-in redirect"
metrics:
  duration: 571s (~10min)
  completed_date: "2026-06-29"
  tasks: 3
  files: 10
---

# Phase MA1 Plan 02: Mobile Bearer Auth Client Summary

expo-secure-store session token store + plain Better-auth Bearer sign-in flow: `signInWithEmail` posts to the framework endpoint, reads the `set-auth-token` header, and stores the token; `apiFetch` and the SSE stream send `Authorization: Bearer`; the sign-in screen handles the phone-fallback case inline; AuthGate gates cold starts on the secure-store token.

## What Was Built

**Task 1 — expo-secure-store install + lib/session.ts + lib/auth-config.ts**:
- `npx expo install expo-secure-store` pinned `~55.0.15` (SDK-55); added `expo-secure-store` to `app.json` plugins array for native iOS/Android access.
- `lib/session.ts`: `SESSION_TOKEN_KEY = "session_token"` constant + `getSessionToken` / `setSessionToken` / `clearSessionToken` on SecureStore. Single source of truth referenced by all swap-point files.
- `lib/auth-config.ts`: `SUBSCRIBE_URL` and `RESET_PASSWORD_URL` read from `EXPO_PUBLIC_*` env vars with sensible defaults (doyouhustle.co.uk / runstudioai.com/reset-password). Repeatable per client — no code change needed when deploying for a new studio.

**Task 2 — sign-in-api.ts + Bearer swap in api.ts and agent-stream.ts**:
- `lib/sign-in-api.ts`: `signInWithEmail(email, password)` posts to `/_agent-native/auth/ba/sign-in/email`, reads the `set-auth-token` response header (exact name from RESEARCH Finding 3), calls `setSessionToken`. 200-only path — no redirect following needed (RESEARCH Pitfall 5).
- `lib/api.ts`: removed `AsyncStorage` + `demoMemberId`; now reads `getSessionToken()` and sends `Authorization: Bearer ${token}`. Zero `X-Demo-Member-Id` / `demoMemberId` references remain.
- `lib/agent-stream.ts`: same swap; token captured at EventSource construction time so `react-native-sse` re-sends it on every `open()` including reconnects (RESEARCH Finding 5 / Pitfall 7).

**Task 3 — sign-in.tsx + _layout.tsx AuthGate swap + profile sign-out**:
- `app/sign-in.tsx`: email + password inputs with a "Sign in" button. After sign-in, profile is fetched: 403 `PHONE_REQUIRED` → reveals inline phone field + "Link my membership" button; other 403s → "No membership on file — contact the studio." (D-13 verbatim). "Join / Subscribe" and "Forgot password?" open `SUBSCRIBE_URL` / `RESET_PASSWORD_URL` via `expo-web-browser`. No in-app sign-up, no in-app password reset form (D-03).
- `app/_layout.tsx`: `AuthGate` reads `getSessionToken()` from SecureStore — cold-start persists session across restarts (AUTH-03). Redirects to `/sign-in` when no token; redirects to `/(tabs)` when token present and on sign-in screen. FAB hidden on sign-in screen. Stack registers `sign-in` screen (headerShown: false). `pick-member` remains registered for DEMO_MODE compatibility (AUTH-06).
- `app/(tabs)/profile.tsx`: `switchMember` replaced with `signOut` — calls `clearSessionToken()` and routes to `/sign-in`. UI labels updated from "Switch member (demo)" to "Sign out".

## Verification

- `expo-secure-store ~55.0.15` in package.json dependencies
- `grep "X-Demo-Member-Id\|demoMemberId" lib/api.ts lib/agent-stream.ts` — zero matches
- `grep "set-auth-token" lib/sign-in-api.ts` — confirmed present
- `app/_layout.tsx` has `getSessionToken` and routes to `/sign-in`
- `app/(tabs)/profile.tsx` has `clearSessionToken` and routes to `/sign-in`
- `app/sign-in.tsx` has `SUBSCRIBE_URL`, `RESET_PASSWORD_URL`, email+password inputs, phone-fallback block
- `npx tsc --noEmit` — zero errors in MA1-02 files (one pre-existing unrelated error in index.tsx fontVariant readonly mismatch, pre-dates this plan)

## Deviations from Plan

None — plan executed exactly as written.

The phone-fallback UX was chosen as inline field expansion on the sign-in screen (per RESEARCH Open Q2 recommendation and the plan's D-12 guidance). No second route was needed.

## Known Stubs

None. This plan is mobile auth infrastructure only. No UI renders empty/stubbed data to members — the sign-in screen either signs in successfully or shows an error. The phone-fallback field is functional (sends `x-claim-phone` header to Plan 01's `requireMember` which handles it server-side).

## Self-Check: PASSED

All created files exist on disk. All 3 task commits found in git log.

| Check | Result |
|-------|--------|
| `lib/session.ts` exists | FOUND |
| `lib/auth-config.ts` exists | FOUND |
| `lib/sign-in-api.ts` exists | FOUND |
| `app/sign-in.tsx` exists | FOUND |
| Commit db17f7b4 (Task 1) | FOUND |
| Commit 0bec27c3 (Task 2) | FOUND |
| Commit 14cd3405 (Task 3) | FOUND |
