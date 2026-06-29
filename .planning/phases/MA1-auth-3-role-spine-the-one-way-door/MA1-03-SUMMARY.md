---
phase: MA1-auth-3-role-spine-the-one-way-door
plan: "03"
subsystem: auth
tags: [auth-spike, device-verification, seed, claim-by-email, h3-v2-adapter]
depends_on:
  requires: [requireMember, claimMemberByEmail, set-auth-token, expo-secure-store session]
  provides: [MA1-SPIKE-RESULTS, seed-ma1-test-account, production-verified-auth-spine]
  affects: [MA2 booking, MA3 teacher, MA4 admin — all consume the verified member session]
tech-stack:
  added: [db:seed-ma1-test-account script]
  patterns:
    - "Idempotent test-account seed via Better-auth sign-up endpoint (D-08), never raw SQL"
    - "Faithful native-equivalent verification via Node round-trip (sets Origin, no browser CORS)"
key-files:
  created:
    - apps/staff-web/server/db/seeds/seed-ma1-test-account.ts
    - .planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-SPIKE-RESULTS.md
  modified:
    - apps/staff-web/server/lib/member-session.test.ts
    - apps/staff-web/package.json
requirements: [AUTH-07]
status: complete-with-deferral
---

# MA1-03 Summary — Device-verified auth spike

## Outcome

The auth spine is **production-verified**. Task 1 (idempotent seed + claim integration
tests, 12/12 green) landed in `edefcf83`. The device checkpoint (Task 2) was resolved by
proving the spine against the **live Vercel deploy** — the only working full runtime, since
iOS Expo Go is frozen at SDK 54 and EAS is gated, and the local dev server is broken on this
Windows box (NitroViteError).

## Spike legs

| Leg | Result | Evidence |
|-----|--------|----------|
| 1 — sign-in + `set-auth-token` | **PASS** (prod) | HTTP 200, token captured |
| 2 — Bearer → `getSession` → claim | **PASS** (prod) | `/api/m/profile` returned member "Spike"; `gym_members.user_id` linked NULL → `oaMoks8B5oDXs6yn1rhUTDw5cgADcY2a` |
| 3 — restart persistence | deferred (device UI) | secure-store code shipped (MA1-02) |
| 4 — admin SSE carries session | **DEFERRED** (no runnable device) | transport-level; `react-native-sse` re-sends headers on every `open()` (RESEARCH Finding 5, source-confirmed) |
| 5 — sign-out | deferred (device UI) | `clearSessionToken` shipped (MA1-02) |

Gate legs 1+2 PASS. Leg 4 is the only open item — blocked by device tooling, not code, and
statically de-risked. Per the MA1 close decision (2026-06-29), Leg 4 + the on-device app UI
move to a deferred verification once the **iOS EAS dev build** is unblocked (re-point EAS off
the upstream owner + Apple Developer account; see `packages/mobile-app/IOS-EAS-RUNBOOK.md`).

## Bugs the spike caught (all fixed)

1. **Missing `Origin` header** (`0b25841e`) — Better-auth 403 `MISSING_OR_NULL_ORIGIN`; native
   `fetch` sends none. Fixed in the seed + `mobile-app/lib/sign-in-api.ts`.
2. **h3 v2 H3Event adapter crash** (`87feb71c`) — core resolves `h3@2.0.x-rc` (`event.web`→
   `event.req`); `getSession` crashed on the old `{headers,node}` shape. Fixed to expose both
   `req` and `headers`.
3. **Uncommitted `pnpm-lock.yaml`** (`2933e779`) — MA1-02's `npx expo install` never committed
   the lockfile; Vercel `--frozen-lockfile` failed every build until synced.

## Deferred / follow-up

- **Leg 4 + on-device app UI** — verify once iOS EAS dev build is available (chosen path).
- Test account `ma1-spike@example.com` / `12345678` (member `mbr_spike_ma1_001`) is live in the
  shared Neon for that verification. Re-seed idempotently via `db:seed-ma1-test-account`.
