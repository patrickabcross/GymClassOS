---
phase: quick-260609-qe9
plan: 01
subsystem: worker / outbound-whatsapp
tags: [whatsapp, myutik, worker, send, WA-05]
requirements: [WA-05]
dependency_graph:
  requires:
    - "services/worker/src/lib/secrets.ts getMyutikApiKey / getMyutikPhoneNumberId (pre-existing)"
    - "MYÜTIK relay POST /api/channels/whatsapp/send (live 2026-06-05)"
  provides:
    - "All worker outbound WhatsApp sends routed through MYÜTIK (no direct-Meta path)"
  affects:
    - "outbound-whatsapp pg-boss queue handler (calls sendMessage)"
tech_stack:
  added: []
  patterns:
    - "Thin status-carrying HTTP client mirroring syncTemplates.ts fetch+error style"
key_files:
  created:
    - services/worker/src/domain/sendViaMyutik.ts
    - services/worker/src/domain/sendViaMyutik.test.ts
  modified:
    - services/worker/src/domain/sendMessage.ts
    - services/worker/src/domain/sendMessage.test.ts
    - services/worker/src/lib/logger.ts
decisions:
  - "Build templateComponents as a single body component, params ordered by placeholder number"
  - "KEEP leading + on E.164 (MYÜTIK accepts with/without; old Meta strip removed)"
  - "200-but-no-wamid throws status:502 so pg-boss retries (treated as transient downstream failure)"
metrics:
  duration: ~10min
  completed: 2026-06-09
  tasks: 3
  files: 5
---

# Quick 260609-qe9: Route worker outbound WhatsApp sends through MYÜTIK Summary

Rewired the worker's single outbound WhatsApp send chokepoint (`sendMessage.ts`) to relay through MYÜTIK's `POST /api/channels/whatsapp/send` instead of calling Meta Graph directly, via a new thin `sendViaMyutik` client; compliance gates and the message-status state machine are unchanged.

## What changed

- **New `sendViaMyutik.ts`** — thin MYÜTIK send client. POSTs to `https://myutik.com/api/channels/whatsapp/send` with `x-api-key` + `Content-Type: application/json`. Builds the JSON body from provided fields, omitting any `undefined` field; always includes `to` and `phoneNumberId`. Extracts `wamid` from `result.messages[0].id`. Throws `.status`-carrying errors on non-200 (so the chokepoint classifier branches: 4xx terminal/no-retry; 5xx re-throw/retry) and on 200-but-empty-wamid (status 502 → pg-boss retries). Mirrors `syncTemplates.ts` fetch + error style. The account is resolved from the API key — no Meta token is passed.
- **`sendMessage.ts` rewired** — removed `import { sendText, sendTemplate } from "@gymos/whatsapp"` and both direct-Meta adapter calls; removed the `getWhatsAppAccessToken`/`getWhatsAppPhoneNumberId` import in favour of `getMyutikApiKey`/`getMyutikPhoneNumberId`. Step 6 resolves the MYÜTIK key + phoneNumberId; step 7 calls `sendViaMyutik` for both text and template, building a single body component with params ordered by placeholder number for templates. The leading `+` is now KEPT on the E.164 number (the old `.replace(/^\+/, "")` Meta strip is gone). Gates 1–5 and status steps 8–9 are byte-for-byte intact in behaviour. The catch classifier is unchanged.
- **`sendMessage.test.ts` updated** — mocks `./sendViaMyutik.js`; gate-failure tests assert MYÜTIK is never called; text/template success tests assert the exact `sendViaMyutik` call args (incl. `apiKey: "myutik_test_key"`, `phoneNumberId: "302631896256150"`, `to` with leading `+`, and the ordered-params body component); 4xx (`status:409`) → row `failed` + `externalId:""`; 5xx (`status:502`) → re-throws.
- **`logger.ts` defensive fallback** (deviation, see below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Default pino level to "info" when LOG_LEVEL is undefined**
- **Found during:** Task 3 (full worker vitest suite verify).
- **Issue:** `src/lib/secrets.test.ts > getWhatsAppAccessToken > prefers DB over env` failed with `default level:undefined must be included in custom levels`. `logger.ts` passed `level: env.LOG_LEVEL`; pino 9.14.0 throws when handed `undefined`. The failing test mocks the env so `LOG_LEVEL` is undefined. Confirmed PRE-EXISTING and unrelated to this task: it fails identically on the clean `master` tree in the main checkout, and the last commit to touch `secrets.test.ts`/`logger.ts` is `d00ad643` (quick-260608-g74), before this work. None of this task's target files cause it.
- **Why fixed despite being pre-existing:** the task's hard constraint requires the full worker vitest suite to be green. The fix is a single isolated, defensible line — pino would also throw at worker runtime in any environment that doesn't set `LOG_LEVEL` and bypasses the EnvSchema default.
- **Fix:** `level: env.LOG_LEVEL ?? "info"` in `getLogger()`.
- **Files modified:** services/worker/src/lib/logger.ts
- **Commit:** a98f2635

## Verification

- `cd services/worker && npx tsc --noEmit` → passes (exit 0).
- `cd services/worker && npx vitest run` → 79/79 tests pass across 14 files (was 78 pass / 1 pre-existing fail before the logger fix).
- `grep` confirms no `@gymos/whatsapp` import, no `sendText`/`sendTemplate`, and no `.replace(/^\+/` phone-strip remain in `sendMessage.ts`.
- `sendViaMyutik` is imported and is the sole send call site in `sendMessage.ts`.
- The `@gymos/whatsapp` package itself was NOT modified (other paths still import it).
- Prettier applied to all four target files + the logger.

## Deploy (manual — REQUIRED for this change to take effect)

This is a **WORKER** change. The Fly worker process (the `gymos-edge-webhooks` worker process) must be **redeployed** for it to take effect:

> Pushing to GitHub does NOT auto-deploy the Fly worker.

Ship step: run `fly deploy` for the worker process (the Fly app/process that runs `@gymos/worker`). Until then the live worker still calls Meta Graph directly and sends will keep failing (Meta code 100/subcode 33 "missing permissions").

## Activation (verify after deploy)

The stored `MYUTIK_API_KEY` the worker reads must hold the **`whatsapp:send`** permission.

- Templates currently sync via the `whatsapp:read` scope. A gym-class-os key that holds BOTH `whatsapp:read` and `whatsapp:send` may still need to be **minted** — a read-only key will not send.
- If the key lacks `send`, MYÜTIK returns **400/401/403** on send. With this code that surfaces as the message row going `failed` (4xx terminal, no retry) — NOT a silent success.
- **Activation step to verify:** after the worker redeploy, trigger one real send (text or approved template) and confirm the message row reaches `status='sent'` with a populated `external_id` (wamid). A 4xx `failed` row with a MYÜTIK auth error means the key needs the `whatsapp:send` scope (mint a both-scopes key and update the stored secret).

## Self-Check: PASSED

- FOUND: services/worker/src/domain/sendViaMyutik.ts
- FOUND: services/worker/src/domain/sendViaMyutik.test.ts
- FOUND: services/worker/src/domain/sendMessage.ts (rewired)
- FOUND: services/worker/src/domain/sendMessage.test.ts (updated)
- FOUND: services/worker/src/lib/logger.ts (fallback)
- FOUND commit: 41a7be44 (sendViaMyutik client + tests)
- FOUND commit: 75a58e17 (sendMessage rewired)
- FOUND commit: a98f2635 (logger pino-level fallback)
