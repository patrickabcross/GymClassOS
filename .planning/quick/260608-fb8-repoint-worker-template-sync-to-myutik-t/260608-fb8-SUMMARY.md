---
phase: quick-260608-fb8
plan: 01
subsystem: worker/template-sync
tags: [whatsapp, myutik, templates, sync, worker, cron]
dependency_graph:
  requires: [P1b-06-sendMessage, P1b-07-stripe-worker, 260601-muh-secrets-migration]
  provides: [WA-08 template sync via MYUTIK]
  affects: [templateGate status filter, send-side WhatsApp compliance]
tech_stack:
  added: []
  patterns: [DB-first secret resolver with env fallback, pagination loop with defensive cap]
key_files:
  modified:
    - services/worker/src/domain/syncTemplates.ts
    - services/worker/src/domain/syncTemplates.test.ts
    - services/worker/src/lib/secrets.ts
    - services/worker/src/lib/env.ts
    - services/worker/src/queues/housekeeping.ts
  created: []
decisions:
  - "MYUTIK Template Extract API replaces Meta Graph API for template sync — Meta token scope blocked direct Graph access; MYUTIK proxies with its own authorized Meta token"
  - "status.toLowerCase() applied at upsert time — MYUTIK returns UPPERCASE (APPROVED/PENDING/REJECTED); templateGate.isTemplateApproved filters on lowercase 'approved'"
  - "getMyutikPhoneNumberId never throws — falls back to required WHATSAPP_PHONE_NUMBER_ID env var"
  - "Pagination cap at 20 iterations (4,000 templates max) as defensive bound"
metrics:
  duration: "~15 min"
  completed: "2026-06-08"
  tasks: 3
  files: 5
---

# Quick 260608-fb8: Repoint Worker Template Sync to MYUTIK — Summary

Rewired the worker's daily `templates-sync` cron from the Meta Graph API
(`graph.facebook.com/v23.0/{wabaId}/message_templates`, Bearer auth) to the
MYUTIK Template Extract API (`myutik.com/api/channels/whatsapp/templates`,
`x-api-key` header). Direct Meta access was blocked by token scope; MYUTIK
holds an authorized Meta token for the Hustle gym's real WABA.

## What Was Built

### Task 1 — MYUTIK secret resolvers + optional env vars (`01e20cee`)

- `env.ts`: Added `MYUTIK_API_KEY` (optional, min 8 chars) and
  `MYUTIK_PHONE_NUMBER_ID` (optional, min 4 chars) to `EnvSchema`. Strictly
  additive — existing required env vars unchanged.
- `secrets.ts`: Added two exported async functions:
  - `getMyutikApiKey(db)` — DB-first (`secrets.myutik_api_key`), env fallback
    (`MYUTIK_API_KEY`), throws with descriptive error if absent.
  - `getMyutikPhoneNumberId(db)` — DB-first, env fallback, then falls through to
    required `WHATSAPP_PHONE_NUMBER_ID` (never throws).
  - Existing Meta resolvers (`getWhatsAppAccessToken`,
    `getWhatsAppBusinessAccountId`, `getWhatsAppPhoneNumberId`) preserved intact.

### Task 2 — Rewrite syncWhatsAppTemplates + update tests (`01e20cee`)

`services/worker/src/domain/syncTemplates.ts`:
- New signature: `syncWhatsAppTemplates(apiKey, phoneNumberId, db)`
- Calls MYUTIK endpoint with `x-api-key: apiKey` header — no `Authorization`
- Pagination loop: follows `paging.next` cursor, `?after=` param, defensive cap
  at 20 iterations
- `tpl.status.toLowerCase()` before upsert — MYUTIK returns `APPROVED`,
  templateGate expects `approved`
- `// guard:allow-unscoped` comment preserved above the Drizzle upsert

`services/worker/src/domain/syncTemplates.test.ts` (5 tests, all passing):
1. Fetches MYUTIK URL with `x-api-key` header and `phoneNumberId` query param;
   no `Authorization` header
2. Lowercases UPPERCASE status — `APPROVED` in, `approved` in SQL
3. Upserts all templates and returns correct synced count
4. Throws on non-2xx response (401 → rejects with /401/)
5. Pagination: two fetches when `paging.next` is set; second URL has
   `after=cursor1`; `result.synced === 2`

### Task 3 — Rewire housekeeping cron consumer (`9068e60b`)

`services/worker/src/queues/housekeeping.ts`:
- Replaced imports: `getWhatsAppAccessToken` + `getWhatsAppBusinessAccountId` →
  `getMyutikApiKey` + `getMyutikPhoneNumberId`
- Guard pattern: `try { apiKey = await getMyutikApiKey(db) } catch {}` — if
  `!apiKey`, log.warn with reference to `MYUTIK_API_KEY` / in-app Settings,
  then `return` (worker still boots cleanly)
- Resolves `phoneNumberId = await getMyutikPhoneNumberId(db)` after the guard
- Calls `syncWhatsAppTemplates(apiKey, phoneNumberId, db)` in the existing
  try/catch that re-throws for pg-boss job failure tracking

## Verification Results

```
Tests:  5 passed (5 total)
tsc --noEmit: 0 errors
grep syncTemplates.ts "myutik.com": 1 match
grep syncTemplates.ts "toLowerCase": 1 match
grep syncTemplates.ts "graph.facebook.com": 0 matches (GOOD)
grep housekeeping.ts "getMyutikApiKey": 2 matches (import + call)
grep secrets.ts "getWhatsAppAccessToken": 1 match (intact)
```

## Deviations from Plan

### Auto-fixed Issues

**[Rule 3 - Blocking] git worktree lacks node_modules for test execution**
- Found during: Task 1 test run
- Issue: The git worktree at `.claude/worktrees/agent-a5f0a39c2a9acea04` has no
  pnpm-managed `node_modules` — pnpm only installs into the main repo root. Vitest
  could not resolve `drizzle-orm`.
- Fix: Created symlinks in `services/worker/node_modules/` pointing to the pnpm
  store (same targets as main repo). Also created `@types/node` symlink for tsc.
  These symlinks are inside `node_modules` (gitignored) — not tracked by git.
- tsc was verified by temporarily copying modified files to main repo, running
  `tsc --noEmit` (exit 0), then restoring.

## Known Stubs

None. The sync function is fully wired — MYUTIK endpoint, pagination, status
lowercasing, and the cron consumer are all production-ready. Worker gracefully
handles absent MYUTIK key (warn + clean return).

## Self-Check: PASSED

- [x] `services/worker/src/domain/syncTemplates.ts` — exists and contains
  `myutik.com`, `toLowerCase`, `x-api-key`; no `graph.facebook.com`
- [x] `services/worker/src/lib/secrets.ts` — contains `getMyutikApiKey`,
  `getMyutikPhoneNumberId`; Meta resolvers intact
- [x] `services/worker/src/lib/env.ts` — contains `MYUTIK_API_KEY`,
  `MYUTIK_PHONE_NUMBER_ID` as optional
- [x] `services/worker/src/queues/housekeeping.ts` — imports `getMyutikApiKey`;
  no `getWhatsAppBusinessAccountId` or `getWhatsAppAccessToken` remaining
- [x] Commit `01e20cee` — Tasks 1+2 (secrets, env, syncTemplates, tests)
- [x] Commit `9068e60b` — Task 3 (housekeeping cron rewired)
- [x] 5/5 tests passing
- [x] tsc --noEmit clean (verified via main repo environment)
