---
phase: quick-260615-lyu
plan: 01
subsystem: whatsapp-inbox
tags: [worker, pg-boss, staff-web, whatsapp, templates, vitest]
requires:
  - services/worker outbound-whatsapp queue (pg-boss v12 handler)
  - apps/staff-web gymos.messages route + loader templates fan-out
provides:
  - Final-attempt force-fail of stuck 'queued' outbound WhatsApp messages
  - Pure renderTemplateBody / extractBodyText / resolveTemplateMessageBody helpers
  - Real var-filled template body rendering in conversation bubbles
affects:
  - services/worker/src/queues/outbound-whatsapp.ts
  - apps/staff-web/app/routes/gymos.messages.tsx
tech-stack:
  added: []
  patterns:
    - "pg-boss includeMetadata:true to read retryCount/retryLimit in the work handler"
    - "Pure dependency-free app/lib helpers + standalone vitest config (vitest.unit.config.ts) so unit tests run without the app vite.config.ts"
key-files:
  created:
    - apps/staff-web/app/lib/templateBody.ts
    - apps/staff-web/app/lib/templateBody.test.ts
    - apps/staff-web/vitest.unit.config.ts
  modified:
    - services/worker/src/queues/outbound-whatsapp.ts
    - apps/staff-web/app/routes/gymos.messages.tsx
decisions:
  - "renderTemplateBody leaves unknown {{N}} placeholders intact (?? match) rather than blanking, so a partial vars map degrades gracefully"
  - "extractBodyText accepts JSON string, wrapped {components:[...]} object, or bare array; matches BODY case-insensitively; returns null (never throws) on garbage"
  - "Added vitest.unit.config.ts because the worktree has no built @agent-native/core dist; the default vitest --run loads vite.config.ts which pulls the core vite plugin"
metrics:
  duration_min: 35
  completed: 2026-06-15
  tasks: 2
  files: 5
---

# Quick 260615-lyu: Make Outbound WhatsApp Message State Honest Summary

Two independent inbox-honesty fixes: the worker now force-fails outbound WhatsApp messages whose non-gate sends exhaust all pg-boss retries (no more eternal "queued"), and the staff conversation thread renders the real, variable-filled template body instead of the opaque `[template: name]` placeholder.

## What Was Built

### FIX 1 — Worker force-fails exhausted retries (`services/worker/src/queues/outbound-whatsapp.ts`)
- Added `includeMetadata: true` to the `boss.work()` WorkOptions (alongside the existing `batchSize: 1, localConcurrency: 1`), so the handler receives `JobWithMetadata` carrying `retryCount` / `retryLimit`.
- In the non-gate catch branch, computes `retryCount = Number(job?.retryCount ?? 0)` and `retryLimit = Number(job?.retryLimit ?? 3)` (3 matches `@gymos/queue/publish.ts`, defensive default if metadata absent).
- On the **final attempt** (`retryCount >= retryLimit`): writes `messages.status = 'failed'` + a `slice(0, 200)` errorCode (with `// guard:allow-unscoped — worker writes own state`), logs `retries exhausted — marking failed`, then re-throws so pg-boss still records the job as failed.
- **Intermediate attempts** keep the prior behavior: log the transient error and `throw err` to retry; the row stays `'queued'` between tries.
- The gate-error branch (`NoOptInError | WindowExpiredError | TemplateNotApprovedError`) is byte-for-byte unchanged (D-19), and `sendMessage.ts` (4xx/2xx writes) was not touched.

### FIX 2 — Real template body in bubbles (`apps/staff-web/app/lib/templateBody.ts` + route)
- `renderTemplateBody(bodyText, vars)` — substitutes `{{N}}` via `replace(/\{\{(\d+)\}\}/g, (m, n) => vars?.[n] ?? m)`; unknown placeholders stay intact.
- `extractBodyText(componentsJson)` — parses the `whatsapp_templates.components_json` value (a JSON **string** wrapping `{ components: [{ type: "BODY", text, example }, ...] }`, verified against the live `bobby_harrison_hyrox_invite_v1` row in Neon `billowing-sun-51091059`). Also handles an already-parsed object or a bare array; matches `BODY` case-insensitively; returns `null` and never throws on null/garbage/unparseable input.
- `resolveTemplateMessageBody(rawPayload, byName)` — safely `JSON.parse`s the stored `{ name, vars }` payload, looks up `byName[name]`, and returns `{ text: renderTemplateBody(body, vars) }`, or `null` (so the caller falls back to `[template: name]`).
- `gymos.messages.tsx`: builds a `name → bodyText` map once via `useMemo` over the loader's existing `data.templates` (no new query), and the render loop now shows `messageType === "template" ? (resolveTemplateMessageBody(m.payload, bodyByName)?.text ?? m.body) : m.body`. Bubble styling, failed-bubble copy, and the timestamp/status line are unchanged.

## Verification
- **Worker typecheck:** `tsc --noEmit -p tsconfig.json` clean (after building the `@gymos/queue` workspace package's dist so `JobWithMetadata` types resolve).
- **Worker tests:** full suite `vitest run` — 90/90 passed, no regressions.
- **Staff-web helper tests:** `vitest run --config vitest.unit.config.ts app/lib/templateBody.test.ts` — 17/17 passed (happy path, missing var, empty/absent vars, repeated placeholder, real + lowercase + parsed + bare-array + no-body + null/garbage components_json, malformed payload). Full unit-config run (templateBody + 4 existing shared tests) — 34/34 passed.
- **Route typecheck:** no type errors reference `templateBody.ts` or `gymos.messages.tsx`. The only `tsc` errors in the worktree are pre-existing generated/virtual-module gaps (`+types/root`, `.generated/actions-registry.js`, `virtual:react-router/server-build`) in files this change never touched.
- Fork boundary respected: only `apps/staff-web/**` and `services/worker/**` edited. No DB schema changes (`messages.status` already had `'failed'`; only read `whatsapp_templates.components_json`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built `@gymos/queue` and `@agent-native/core` dist to enable verification**
- **Found during:** Task 1 / Task 2 verification.
- **Issue:** The isolated git worktree had no installed `node_modules` and no built workspace-package dist, so `tsc` couldn't resolve `@gymos/queue` types and `vitest` couldn't load the staff-web `vite.config.ts` (which imports `@agent-native/core/vite`).
- **Fix:** `pnpm install --offline` in the worktree, then `tsc -p tsconfig.build.json` for `packages/queue` and `tsc + finalize-build.mjs` for `packages/core`. These produce gitignored `dist/` output only — no source committed.
- **Files modified:** none committed (build artifacts are gitignored).

**2. [Rule 3 - Blocking] Added `apps/staff-web/vitest.unit.config.ts`**
- **Found during:** Task 2 verification.
- **Issue:** The plan's verify command `npx vitest run app/lib/templateBody.test.ts` loads the app `vite.config.ts`, which in this build-less worktree drags in the full core vite plugin + framework runtime (OpenTelemetry CJS interop hang). The `templateBody` helpers are pure and need none of that.
- **Fix:** Added a small standalone `vitest.unit.config.ts` (`include: app/lib/**, shared/**`) so dependency-free unit tests run reliably without the app vite config. The default `vitest --run` remains the runner for component/integration tests in a fully-built environment.
- **Files modified:** `apps/staff-web/vitest.unit.config.ts` (new).

### Note on plan frontmatter
- The plan frontmatter `files_modified` listed `services/worker/src/lib/templateBody.ts` and `apps/staff-web/app/lib/templateBody.test.ts`. The objective and tasks make clear FIX 1 (worker) is logic-only inside the queue handler — no worker `templateBody.ts` was needed and none was created (Task 1's `<files>` is just `outbound-whatsapp.ts`). The staff-web helper + test were created as specified.

## Authentication Gates
None.

## Known Stubs
None. Both fixes are fully wired: the worker writes real `'failed'` status on exhausted retries, and the route renders resolved template text with a safe fallback to the stored body.

## Commits
- `34eaa6e1` fix(quick-260615-lyu): mark stuck queued WhatsApp messages failed on exhausted retries
- `e5191ddd` feat(quick-260615-lyu): render real WhatsApp template body in conversation bubbles

## Self-Check: PASSED
- All 4 created/modified source files present on disk.
- Both task commits (`34eaa6e1`, `e5191ddd`) exist in git log.
- Key links verified: `includeMetadata` + `retryCount >= retryLimit` in the worker handler; `resolveTemplateMessageBody` wired into the route render loop.
