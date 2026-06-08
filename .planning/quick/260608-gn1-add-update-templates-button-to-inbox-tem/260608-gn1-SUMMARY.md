---
phase: quick-260608-gn1
plan: 01
subsystem: staff-web + worker
tags: [whatsapp, templates, WA-08, inbox, sync]
dependency_graph:
  requires: [app_secrets table, whatsapp_templates table, /gymos/compose re-export]
  provides: [readAppSecretByKey (staff-web), sync-templates action, Update templates button]
  affects: [TemplatesDialog, gymos.inbox.tsx, syncTemplates worker cron]
tech_stack:
  added: []
  patterns:
    - AES-256-GCM resolve-by-key reader mirrored from worker to staff-web
    - Separate useFetcher for sync action (distinct from send fetcher)
    - useEffect toast feedback pattern on fetcher settle
    - object-wrapped componentsJson shape for dialog parser compatibility
key_files:
  created:
    - apps/staff-web/server/lib/app-secrets.ts
  modified:
    - apps/staff-web/app/routes/gymos.inbox.tsx
    - apps/staff-web/app/components/gymos/TemplatesDialog.tsx
    - services/worker/src/domain/syncTemplates.ts
    - services/worker/src/domain/syncTemplates.test.ts
    - apps/staff-web/AGENTS.md
decisions:
  - readAppSecretByKey in staff-web takes key only (resolves db internally via getDb()) — not a db arg like the worker version — because callers are React Router actions, not pg-boss cron handlers
  - sync-templates branch placed before the conversationId guard so it does not require a selected conversation
  - MYUTIK_PHONE_NUMBER_ID falls back to hardcoded "302631896256150" if not in app_secrets
  - Test assertion uses queryChunks array on the drizzle sql object (not JSON.stringify of the whole call) to find the bound components param
metrics:
  duration: 25min
  completed_at: "2026-06-08T11:10:00Z"
  tasks: 4
  files: 6
requirements: [WA-08]
---

# Quick 260608-gn1: Add "Update templates" button to inbox Templates dialog

On-demand MYÜTIK template sync from the inbox TemplatesDialog — staff can refresh approved templates without waiting for the nightly worker cron.

## What Was Built

**Task 1 — `apps/staff-web/server/lib/app-secrets.ts`**

New `readAppSecretByKey(key: string): Promise<string | null>` function. Mirrors `services/worker/src/lib/appSecrets.ts` exactly but resolves the DB internally via `getDb()` (no db argument). Derives AES-256-GCM key from `SECRETS_ENCRYPTION_KEY || BETTER_AUTH_SECRET`, queries `app_secrets` by key, decrypts, returns null on every failure path. Carries `guard:allow-unscoped` comment (single-tenant table). staff-web already carries `BETTER_AUTH_SECRET` for auth, so the resolver is immediately active.

**Task 2 — `sync-templates` action branch in `gymos.inbox.tsx`**

New `if (intent === "sync-templates")` branch inserted at the top of `action()`, before the `conversationId` guard. Reads `MYUTIK_API_KEY` from `app_secrets`; returns a friendly error object if absent. Reads optional `MYUTIK_PHONE_NUMBER_ID` or defaults to `302631896256150`. Fetches MYÜTIK with pagination (up to 20 pages), lowercases status/category, upserts `whatsapp_templates` with `JSON.stringify({ components: tpl.components ?? [] })` (object-wrapped shape). Returns `{ syncResult: { ok: true, synced } }` on success and `{ syncResult: { ok: false, error } }` on missing key, non-2xx, or thrown error. Existing `send-text` / `send-template` branches are untouched.

**Task 3 — "Update templates" button in `TemplatesDialog.tsx`**

Added `useEffect`, `IconRefresh` imports. Created `syncFetcher` (separate from the existing send `fetcher`) with `isSyncing` derived from its state. `handleSync` submits `_intent=sync-templates` to `/gymos/compose`. `useEffect` toasts `Updated — N templates` on success or the error string on failure. The DialogHeader now uses `flex flex-row items-start justify-between` with the title/subtitle block on the left and an outline `Button` (IconRefresh, `size="sm"`) on the right. While syncing: icon spins (`animate-spin`), button reads "Updating…" and is disabled. React Router revalidation refreshes the open dialog's template list automatically after the JSON action returns. All verbatim copywriting preserved; no emojis; no browser dialogs.

**Task 4 — Worker componentsJson shape fix + test + AGENTS.md**

`services/worker/src/domain/syncTemplates.ts`: changed `JSON.stringify(tpl.components ?? [])` to `JSON.stringify({ components: tpl.components ?? [] })` so worker-cron rows match the seed shape and the dialog parser (`JSON.parse(componentsJson).components`).

`services/worker/src/domain/syncTemplates.test.ts`: added assertion in the "lowercases UPPERCASE status" test that finds the bound components param in drizzle's `queryChunks` array and confirms it round-trips to `{ components: [] }`. All 5 existing tests pass.

`apps/staff-web/AGENTS.md`: extended the `whatsapp_templates` row to document the on-demand "Update templates" button alongside the nightly worker cron.

## Deviations from Plan

**1. [Rule 1 - Bug] Test assertion adjusted for Drizzle queryChunks structure**

- **Found during:** Task 4 test run
- **Issue:** The plan's suggested `JSON.stringify(call0)` assertion pattern looks for `'"components"'` (with literal double-quotes) but the serialized Drizzle sql object escapes inner JSON as `{\"components\":[]}` — the string `"components"` (with surrounding quotes) does not appear literally in the outer JSON.stringify output.
- **Fix:** Used `call0.queryChunks` array to find the bound components string, then `JSON.parse`-d it and asserted `toEqual({ components: [] })`. More precise and readable.
- **Files modified:** `services/worker/src/domain/syncTemplates.test.ts`
- **Commit:** 6701fbc3

## Self-Check

- [x] `apps/staff-web/server/lib/app-secrets.ts` — exists, exports `readAppSecretByKey`
- [x] `apps/staff-web/app/routes/gymos.inbox.tsx` — `sync-templates` branch added before `conversationId` guard
- [x] `apps/staff-web/app/components/gymos/TemplatesDialog.tsx` — "Update templates" button present; `syncFetcher` separate from `fetcher`
- [x] `services/worker/src/domain/syncTemplates.ts` — object-wrapped `componentsJson`
- [x] `services/worker/src/domain/syncTemplates.test.ts` — 5/5 tests pass
- [x] `apps/staff-web/AGENTS.md` — `whatsapp_templates` row updated
- [x] Staff-web `npx tsc --noEmit` — clean
- [x] Worker `npx tsc --noEmit` — clean
- [x] Worker `npx vitest run src/domain/syncTemplates.test.ts` — 5/5 passed
- [x] Prettier run on all touched files

## Self-Check: PASSED
