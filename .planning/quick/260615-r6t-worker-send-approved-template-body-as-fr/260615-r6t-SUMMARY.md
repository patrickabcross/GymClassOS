---
quick_task: 260615-r6t
title: Worker sends approved template BODY as free text in-window
subsystem: services/worker (WhatsApp outbound chokepoint)
tags: [whatsapp, worker, sendMessage, 24h-window, WA-06, WA-08, myutik]
key-files:
  created:
    - services/worker/src/domain/templateBody.ts
    - services/worker/src/domain/templateBody.test.ts
  modified:
    - services/worker/src/domain/sendMessage.ts
    - services/worker/src/domain/sendMessage.test.ts
commits:
  - 9d5f2593
metrics:
  tasks: 1
  files: 4
  worker_tests: 111
  completed: 2026-06-15
---

# Quick Task 260615-r6t: Worker Sends Approved Template BODY as Free Text In-Window Summary

In the worker `sendMessage` chokepoint, template payloads sent **inside** the 24h window
now render the approved template's BODY text (vars substituted from `whatsapp_templates.components_json`)
and send it as free `text` via MYÜTIK — so the member sees a real sentence rather than a
templated message — while **out-of-window** sends keep the existing real approved-template
path. The WA-08 approved-template gate fires for template payloads in **both** window states,
and a null/empty render safely falls back to the template send (never sends empty text).

## What Changed

### New: `services/worker/src/domain/templateBody.ts`
A worker-local renderer mirroring `apps/staff-web/app/lib/templateBody.ts` (fork boundary
held — no cross-app import):
- `renderTemplateBody(bodyText, vars)` — substitutes `{{N}}` tokens; unknown placeholders left intact.
- `extractBodyText(componentsJson)` — pulls the BODY component `text` from a JSON-string / wrapped-object / bare-array `components_json`; case-insensitive `type` match; never throws (returns `null`).
- `renderApprovedTemplateBody(componentsJson, vars)` — composes the two; returns `null` for a missing/empty body so the caller falls back (never returns an empty string).

### Modified: `services/worker/src/domain/sendMessage.ts`
- `isInWindow(lastInboundAt)` is now computed **once** (`const inWindow`) and used by both the text window gate and the template send-strategy decision.
- Out-of-window text gate (WA-06) unchanged (`text` + `!inWindow` → `WindowExpiredError`).
- WA-08 template-approved gate still fires for **every** template payload (both window states).
- Template branch: when `inWindow`, load the template row's `componentsJson`, call `renderApprovedTemplateBody`, and if a non-empty string comes back, send it as `text`. Otherwise (out-of-window OR null/empty render) send the real approved template with ordered body params — exactly the prior behaviour.

### Tests
- `sendMessage.test.ts`: the prior `"allows template send OUTSIDE window"` test (which asserted `isInWindow` was NOT called on the template path) is converted to a **window-closed** case — it now sets `isInWindow → false`, asserts `isInWindow` IS called and `renderApprovedTemplateBody` is NOT, and the real template is sent. Added: in-window template → text-render send (asserts WA-08 gate still fired, text sent, no `templateName`); in-window empty-render → template-send fallback (asserts no empty `text`). Added `whatsappTemplates` to the mocked schema and a `renderApprovedTemplateBody` mock.
- `templateBody.test.ts`: 17 unit tests across the three renderer functions (substitution, partial vars, uppercase/lowercase BODY type, wrapped/bare/string inputs, unparseable JSON, missing BODY, empty-body → null, non-string text).

## Verification
- `npx vitest run` (services/worker): **111 passed / 16 files** — full suite green.
- `npx tsc --noEmit` (services/worker): exit 0, no type errors.
- `npx prettier --write` run on all 4 changed files.

## Deviations from Plan

**1. [Rule 3 - Blocking] PLAN.md artifact was absent.**
- The referenced `.planning/quick/260615-r6t-.../260615-r6t-PLAN.md` did not exist on disk, nor did the plan directory. The task constraints in the prompt were complete and self-sufficient, so execution proceeded against those. The plan directory + this SUMMARY were created during closeout.

**2. [Rule 3 - Blocking] Worktree had no `node_modules`.**
- The isolated worktree shipped without installed dependencies or built dist, so `tsc`/`vitest`/`prettier` could not run. Ran `pnpm install` at the workspace root (gitignored output only). No build output was committed — `git status` confirmed only the 4 source files were staged.

**3. Path correction: `services/worker/` not `apps/worker/`.**
- The repo's worker lives at `services/worker/` (the STACK.md / older context referenced `apps/worker/`). All edits landed in `services/worker/**` per the fork-boundary constraint.

## Known Stubs
None. The renderer is fully wired into the send path; no placeholder data.

## Self-Check: PASSED
- FOUND: services/worker/src/domain/templateBody.ts
- FOUND: services/worker/src/domain/templateBody.test.ts
- FOUND: services/worker/src/domain/sendMessage.ts (modified)
- FOUND: services/worker/src/domain/sendMessage.test.ts (modified)
- FOUND: commit 9d5f2593
