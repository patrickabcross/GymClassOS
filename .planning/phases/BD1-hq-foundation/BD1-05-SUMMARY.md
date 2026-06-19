---
phase: BD1-hq-foundation
plan: "05"
subsystem: anthropic-audit
tags: [audit, telemetry, tokens, fork-boundary, BD2-input]
dependency_graph:
  requires: []
  provides: [BD2-TEL-01-input, anthropic-call-site-spec]
  affects: [BD2-TEL-01]
tech_stack:
  added: []
  patterns:
    - "DB-trigger intercept on token_usage INSERT as fork-safe TEL seam"
    - "AgentEngine abstraction — engine.stream() is the only LLM call path for main runs"
key_files:
  created:
    - .planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md
  modified: []
decisions:
  - "Recommended DB-trigger Option A over pnpm-patch Option B for fork safety"
  - "Title-gen fetch (agent-chat-plugin.ts:5499) excluded from TEL-01 (low volume, no recordUsage)"
  - "AgentChatPluginOptions confirmed to have NO onUsage hook — app-side DB intercept is the only clean seam"
metrics:
  duration_minutes: 12
  tasks_completed: 2
  files_created: 1
  files_modified: 0
  completed_date: "2026-06-19"
---

# Phase BD1 Plan 05: Anthropic Call-Site Audit Summary

**One-liner:** Verified `engine.stream()` → `runAgentLoop` → `recordUsage` token flow; specified DB-trigger intercept on `token_usage` INSERT as the fork-safe TEL-01 seam — no `messages.create` wrapper viable.

## What Was Done

Read-only audit of three `packages/core` files to locate and document the exact Anthropic token-usage call-site and produce a concrete wrapper-insertion spec for BD2 TEL-01.

Files audited (read-only):
- `packages/core/src/agent/production-agent.ts` (2700 lines)
- `packages/core/src/server/agent-chat-plugin.ts` (6304 lines)
- `packages/core/src/usage/store.ts` (453 lines)
- `apps/staff-web/server/plugins/agent-chat.ts` (how staff-web instantiates the plugin)

## Findings

### Call-Site Chain (Confirmed)

```
createAgentChatPlugin (agent-chat-plugin.ts:2948)
  → createProductionAgentHandler (production-agent.ts:1798)
    → runAgentLoop (production-agent.ts:1258)
      → engine.stream() [AgentEngine abstraction] (production-agent.ts:1342)
      ← event.type === "usage" accumulated (production-agent.ts:1397-1401)
    ← returns AgentLoopUsage (production-agent.ts:1795)
  → recordUsage({ ownerEmail, inputTokens, outputTokens, ... }) (production-agent.ts:2654)
    → INSERT INTO token_usage (usage/store.ts:242)
```

### Key Confirmations vs Pre-Audit Findings

| Finding | Pre-audit hypothesis | Confirmed? |
|---------|---------------------|------------|
| `runAgentLoop` accumulates tokens via `event.type === "usage"` | YES | YES — lines 1397-1401 exact |
| `runAgentLoop` returns `AgentLoopUsage` | YES | YES — line 1795 |
| Main run goes through `engine.stream()`, NOT `messages.create` | YES | YES — line 1342; `AgentEngine` is the only LLM adapter |
| Secondary title-gen `fetch` to `api.anthropic.com` | YES | YES — agent-chat-plugin.ts:5499, haiku, max_tokens 30 |
| `recordUsage` called after run | YES (agent-chat-plugin.ts ~2399/2654) | CORRECTED — called inside `production-agent.ts:2654`, NOT in `agent-chat-plugin.ts` |
| `AgentChatPluginOptions` has no `onUsage` hook | YES | YES — confirmed full audit of interface lines 1812-2002 |

### Pre-Audit Correction

The planner noted `recordUsage` calls "near lines 2399 and 2654" of `agent-chat-plugin.ts`. The current source has the `recordUsage` call at line 2654 of `production-agent.ts` (inside `createProductionAgentHandler`), NOT in `agent-chat-plugin.ts`. `agent-chat-plugin.ts` has zero `recordUsage` imports. This is an important correction: the token data is available inside the `createProductionAgentHandler` run closure, not in any app-facing plugin callback.

## Wrapper Insertion Spec Summary

**Recommended seam (Option A):** Install a Postgres `AFTER INSERT` trigger on the studio `token_usage` table. Trigger writes a row to `studio_telemetry_pending`; pg-boss worker picks it up and HTTP-POSTs counts (no PII) to HQ ingest endpoint.

**Why fork-safe:** Zero changes to `packages/core`. Uses existing `services/worker` pg-boss infrastructure. Fully additive.

**Fallback (Option B):** pnpm workspace patch of `packages/core/src/usage/store.ts` to add a side-call to `enqueueTokenSnapshot(record)`. Moderate risk: Nitro/Vite bundler may inline the import and bypass the shim.

**Fallback-of-last-resort:** Contribute `onUsage?: (record: UsageRecord) => void` to `ProductionAgentOptions` upstream — requires PR to `BuilderIO/agent-native`. Flag as deviation requiring BD2 sign-off.

## Data Captured by TEL-01

Counts only — no PII:
- `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`
- `model` (string, e.g. `"claude-sonnet-4-6"`)
- `label` (run category, e.g. `"chat"`)
- Studio identifier (env var, NOT a DB column)
- `created_at` (timestamp)

NOT captured: `owner_email`, message text, prompt content, thread IDs, session IDs, member records.

## Deviations from Plan

### Pre-Audit Correction (automatic; Rule 1)

**Found during:** Task 1  
**Issue:** Planner noted `recordUsage` at "lines 2399 and 2654" of `agent-chat-plugin.ts`. Current source has zero `recordUsage` calls in that file — all token recording happens inside `production-agent.ts:2654` within `createProductionAgentHandler`.  
**Fix:** Documented the correct file (`production-agent.ts`) and line number in the audit doc. This does not affect the recommended seam.  
**Files modified:** BD1-ANTHROPIC-AUDIT.md (the audit doc itself)

## Known Stubs

None — this is a pure audit/documentation plan. No code was written.

## Self-Check

- `.planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md` — FOUND (created)
- Commit `2d776546` — FOUND

## Self-Check: PASSED
