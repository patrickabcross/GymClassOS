---
phase: quick-260630-mw8
plan: 01
subsystem: mobile-app/auth
tags: [mobile, auth, ux, sign-in, error-handling]
requires: []
provides: ["Friendly auth-failure messages on mobile sign-in"]
affects: [packages/mobile-app/lib/sign-in-api.ts]
tech-stack:
  added: []
  patterns: ["Defensive JSON.parse of error body; status/code-driven friendly error mapping"]
key-files:
  created: []
  modified:
    - packages/mobile-app/lib/sign-in-api.ts
decisions:
  - "401 OR code===INVALID_EMAIL_OR_PASSWORD both route to the same friendly message (status-first, code as a belt-and-suspenders fallback)"
metrics:
  duration: ~5min
  completed: 2026-06-30
requirements: [UAT-MA1-03-BUG-2]
---

# Quick 260630-mw8: Fix mobile-app sign-in wrong-password UX Summary

Wrong-password sign-in on the RunStudio mobile app now shows a clean "Incorrect email or password." instead of leaking the raw `Sign-in failed (401): {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}` HTTP/JSON dump onto the login screen.

## What changed

Replaced the `if (!res.ok)` branch of `signInWithEmail` in `packages/mobile-app/lib/sign-in-api.ts`:

1. Read the raw body once (`await res.text()`).
2. Defensively parse it (try/catch around `JSON.parse`) to extract an optional `code` — the body may not be JSON.
3. `res.status === 401 || code === "INVALID_EMAIL_OR_PASSWORD"` → `throw new Error("Incorrect email or password.")`.
4. Any other non-2xx → `throw new Error("Couldn't sign you in. Please try again.")`.

The login screen (`app/sign-in.tsx`) already surfaces `setError(err?.message ...)`, so the friendly strings flow straight through with no UI change.

## Untouched (by design)

- The `set-auth-token` missing-header throw (after `res.ok`).
- The `Origin` header logic and the `fetch` call.
- The network-failure path (a rejected fetch still propagates naturally).
- The `PHONE_REQUIRED` 403 flow — it lives in the `apiFetch("/api/m/profile")` catch in `sign-in.tsx`, not in `sign-in-api.ts`; `signInWithEmail` never sees that 403.

## Verification

- `npx tsc --noEmit -p tsconfig.json` → no `lib/sign-in-api` type errors.
- `npx prettier --write lib/sign-in-api.ts` → formatted clean.
- Traced all three branches against the confirmed prod 401 body — the wrong-password case reads cleanly on screen.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: packages/mobile-app/lib/sign-in-api.ts (contains "Incorrect email or password.")
- FOUND commit: 9ec1c4c4
