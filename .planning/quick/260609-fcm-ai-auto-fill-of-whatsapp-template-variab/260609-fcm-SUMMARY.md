---
phase: quick-260609-fcm
plan: 01
subsystem: staff-web / WhatsApp inbox
tags: [whatsapp, templates, agent, application-state, delegate-to-agent]
requires:
  - "@agent-native/core sendToAgentChat + agentNativePath (client)"
  - "@agent-native/core/application-state writeAppState (server)"
  - "TemplatesDialog (P1b.1-05) + gymos.inbox loader (selectedMember/memberStats/upcomingBooking)"
provides:
  - "suggest-template-vars write-back action (application_state key gymos-template-vars-<conv>-<template>)"
  - "AI auto-fill of WhatsApp template {{N}} variables in the inbox TemplatesDialog"
affects:
  - "apps/staff-web inbox Templates send flow (additive — Send path untouched)"
tech-stack:
  added: []
  patterns:
    - "delegate-to-agent (sendToAgentChat background tab) + application_state poll/merge bridge (mirrors clips use-auto-title.ts)"
    - "system-prompt-as-tool-gate: naming the new tool in agent-chat.ts is what unlocks the LLM calling it"
key-files:
  created:
    - apps/staff-web/actions/suggest-template-vars.ts
  modified:
    - apps/staff-web/app/components/gymos/TemplatesDialog.tsx
    - apps/staff-web/app/routes/gymos.inbox.tsx
    - apps/staff-web/server/plugins/agent-chat.ts
    - apps/staff-web/AGENTS.md
decisions:
  - "Auto-fill trigger lives inline in handleSelect (not a separate useEffect) — fires the moment an approved template with >=1 var is picked"
  - "Merge guard preserves coach-typed values: only empty/whitespace slots receive AI suggestions"
  - "dispatched ref keyed on conversationId:templateName for once-per-(conv,template) idempotency; cleared on dialog close so reopen re-fires"
  - "memberContext built inline from existing loader data — no new queries, only compact slot-mappable fields (first/last name, pass info, next class)"
metrics:
  duration: ~4min
  tasks: 3
  files: 5
  completed: 2026-06-09
---

# Quick 260609-fcm: AI Auto-fill of WhatsApp Template Variables Summary

AI auto-fill of WhatsApp template `{{N}}` variables in the staff-web inbox: selecting an approved template delegates to the agent chat in a background tab, which maps the open conversation's member context onto the template slots via a new pure write-back action; the dialog polls `application_state` and merges suggestions into non-edited inputs — coach reviews and Sends manually.

## What was built

- **Task 1 — `suggest-template-vars` action** (`apps/staff-web/actions/suggest-template-vars.ts`): a `defineAction` write-back tool (NO `http` key, NO LLM/model call). Schema `{ conversationId, templateName, vars: Record<string,string> }`. Writes `JSON.stringify(vars)` to `application_state` under `gymos-template-vars-${conversationId}-${templateName}` via `writeAppState`. Returns `{ ok, key, count }`. Carries the `// guard:allow-unscoped` marker (single-tenant; framework-scoped application_state, no ownable gym table touched). Commit `4951dfda`.
- **Task 2 — TemplatesDialog auto-fill** (`TemplatesDialog.tsx`): added `useRef` + `sendToAgentChat`/`agentNativePath` imports and `IconMessageChatbot` (message-style, no sparkle/wand/emoji). Module-scope `stateKey`/`readVars`/`clearVars` helpers mirror clips `use-auto-title.ts` (value unwrapped from `payload.value`). New optional `memberContext` prop. On selecting an approved template with `>=1` variable and `memberContext` present, fires `sendToAgentChat({ submit:true, openSidebar:false, newTab:true, background:true })` exactly once per `(conversationId, templateName)` via a `dispatched` ref. A poll `useEffect` (2500ms) reads the state key while `filling`, merges incoming vars only into slots the coach hasn't typed into, sets `filling=false`, and clears the key. Inline `Filling with AI…` indicator shows while waiting. `resetState`/`handleOpenChange` clear the key + dispatch guard on close. Send path (`canSend`/`handleSend`) untouched — nothing auto-sends. Commit `865e5822`.
- **Task 3 — wiring + instructions** (`gymos.inbox.tsx`, `agent-chat.ts`, `AGENTS.md`): inbox mount passes a compact `memberContext` (firstName/lastName/pass info/next class) assembled inline from existing loader data (`selectedMember`/`memberStats`/`upcomingBooking`) — no new queries. Agent system prompt names `suggest-template-vars` with `{{1}}=first name, infer rest from surrounding body text` mapping guidance (system-prompt-as-tool-gate). AGENTS.md Agent Actions table gains the new row. Commit `4781e25d`.

All four agent-native areas covered: **UI** (TemplatesDialog), **Action** (suggest-template-vars), **Instructions** (agent-chat.ts + AGENTS.md), **Application State** (the `gymos-template-vars-*` key read/write).

## Verification

- `npx tsc --noEmit -p apps/staff-web/tsconfig.json` — no errors in any of the four touched files (grep for `TemplatesDialog`/`suggest-template-vars`/`gymos.inbox`/`agent-chat.ts` returned none); `@agent-native/core/client` imports resolve.
- `suggest-template-vars.ts` grep for `anthropic|openai|fetch(|messages.create|completions|generateText` returns NONE — confirmed pure `writeAppState` write-back.
- Prettier run on all four `.ts`/`.tsx` files (action, dialog, inbox route, agent-chat plugin).
- Merge guard, once-per-session dispatch, background `sendToAgentChat` options, and inline indicator confirmed present by code (see commits above).

## Deviations from Plan

None — plan executed exactly as written. The AGENTS.md row was placed immediately after `reject-proposal` (the plan said "after the propose-action / approve-proposal rows"); this keeps it grouped with the other `—`-tier coach/helper actions and before the proposal-execution helpers.

## Manual Post-Step (not runtime-verifiable from CLI)

**Adding a new action requires a dev-server restart to regenerate `.generated/actions-registry.js` before the agent can call `suggest-template-vars`.** The executor cannot verify live tool registration or the agent actually calling the action from CLI (and the local `agent-native dev` server cannot boot in this environment — known NitroViteError; staff-web only runs reliably on Fly/Vercel). To exercise end-to-end: deploy/restart staff-web, open the inbox on a conversation with a member, open Templates, select an approved template that has `{{N}}` variables, and confirm the `Filling with AI…` indicator appears then non-edited slots populate. Nothing should auto-send.

## Self-Check: PASSED

- FOUND: apps/staff-web/actions/suggest-template-vars.ts
- FOUND: apps/staff-web/app/components/gymos/TemplatesDialog.tsx (modified)
- FOUND: apps/staff-web/app/routes/gymos.inbox.tsx (modified)
- FOUND: apps/staff-web/server/plugins/agent-chat.ts (modified)
- FOUND: apps/staff-web/AGENTS.md (modified)
- FOUND commit: 4951dfda (Task 1)
- FOUND commit: 865e5822 (Task 2)
- FOUND commit: 4781e25d (Task 3)
