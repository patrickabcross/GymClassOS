---
phase: P1b.1-customer-pilot-enablement
plan: 07
subsystem: agent-surface

tags: [agent-chat, systemPrompt, actions-registry, gym-vocabulary, mentionProviders]

requires:
  - phase: P1b.1-customer-pilot-enablement
    provides: "Plan 03 + 04 gym actions (list-fill-rate, list-renewals, list-at-risk-members, list-classes, list-members) auto-discovered via .generated/actions-registry"
  - phase: P1b.1-customer-pilot-enablement
    provides: "Plan 01 AgentSidebar gym empty-state with 3 chip prompts (the prompts this plan grounds with real data)"

provides:
  - "Gym-aware agent surface — appId=gymos, gym systemPrompt referencing 5 gym actions"
  - "Cleared mentionProviders (no more email mention provider; gym mention providers deferred to P2)"
  - "apps/staff-web/AGENTS.md fully replaced with 85-line gym-domain dev guide"
  - "AgentSidebar chip prompts now resolve to real gym data instead of email-assistant fluff"

affects: [P2-agent-mutations, P1b.1-08-end-to-end-verification]

tech-stack:
  added: []
  patterns:
    - "Pattern: agent-chat plugin systemPrompt is the runtime source of truth; AGENTS.md is the dev-time source of truth — keep them aligned but don't duplicate"
    - "Pattern: actionsRegistry auto-loads ALL files in apps/staff-web/actions/ (mail actions stay on disk but agent is no longer primed to use them — systemPrompt is the gate, not file deletion)"
    - "Pattern: mentionProviders cleared to {} rather than removed — framework accepts empty object; reserving the slot for P2 gym mention providers (e.g. @member, @class)"

key-files:
  created: []
  modified:
    - "apps/staff-web/server/plugins/agent-chat.ts — appId=gymos, gym systemPrompt (~2100 chars), mentionProviders={}"
    - "apps/staff-web/AGENTS.md — full replacement, 85 lines, gym-domain vocabulary throughout"

key-decisions:
  - "appId changed mail → gymos (matches phase scope; visible in agent observability traces)"
  - "mail action files (archive-email, list-emails, etc.) intentionally NOT deleted — they stay on disk so /inbox dogfooding still works; only the systemPrompt gates the agent's tool selection. Deletion belongs to P0 audit phase, not P1b.1."
  - "mentionProviders set to empty object {} rather than removing the key — preserves the slot for P2 gym mention providers without touching the plugin signature"
  - "templates/mail/AGENTS.md preserved upstream-clean (578 lines) for future BuilderIO/agent-native fork merges per fork-boundary discipline"

patterns-established:
  - "systemPrompt-as-tool-gate: when a deploy has multiple action surfaces on disk but should only expose one to the agent, the systemPrompt's tool-naming + negative-prompt vocabulary is the gate — not file deletion. Cheap to reverse, friendly to dogfooding."

requirements-completed: [AGENT-04, AGENT-05]

duration: 12min
completed: 2026-05-25
---

# Phase P1b.1 Plan 07: Gym Agent Surface Summary

**Replaced mail systemPrompt + email mentionProvider with gym-aware agent surface so AgentSidebar chip prompts now invoke list-fill-rate / list-renewals / list-at-risk-members instead of email-assistant fluff.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-25T22:10:00Z
- **Completed:** 2026-05-25T22:22:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `agent-chat.ts` rewritten: `appId: "mail"` → `"gymos"`, systemPrompt swapped wholesale for a gym-domain prompt naming the 5 gym actions, `mentionProviders.emails` cleared
- `apps/staff-web/AGENTS.md` fully replaced: 578-line mail guide → 85-line gym guide (Role / Data Sources / Agent Actions / Forbidden Vocabulary / Adding a New Gym Action / Conventions)
- All 5 gym actions from plans 03 + 04 (`list-fill-rate`, `list-renewals`, `list-at-risk-members`, `list-classes`, `list-members`) confirmed present in `.generated/actions-registry.ts` — they auto-load without any registry edit
- Mail upstream-clean version preserved at `templates/mail/AGENTS.md` (untouched, 578 lines)
- `apps/staff-web/CLAUDE.md` still `@-includes AGENTS.md` (unchanged), so Claude Code dev sessions in this directory now read the gym guide on every session

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite apps/staff-web/server/plugins/agent-chat.ts for gym surface** — `06d3a797` (feat)
2. **Task 2: Replace apps/staff-web/AGENTS.md with a gym version** — `0038dca3` (docs)

## agent-chat.ts — exact changes

**Lines changed:** Full rewrite of the `createAgentChatPlugin({...})` argument object. Net: -131 lines, +30 lines.

| Field | Before | After |
|-------|--------|-------|
| `appId` | `"mail"` | `"gymos"` |
| `systemPrompt` | 87-line email-assistant prompt with Gmail / archive / drafts / queued-drafts / mail-filters / tracking content | ~2150-char gym-aware prompt naming gym tables + 7 tools (5 gym + view-screen + navigate) + read-only constraint + forbidden vocabulary |
| `mentionProviders` | `{ emails: { label, icon, search } }` with 50 lines of /api/emails fetch logic | `{}` (empty object — P2 will add gym mention providers) |
| `actions` | `loadActionsFromStaticRegistry(actionsRegistry)` | unchanged — auto-loads all actions/*.ts including the 5 new gym actions |
| `resolveOrgId` | `getOrgContext(event)` | unchanged |

## Actions visible to the agent on next dev restart

Verified by `grep -E "list-fill-rate|list-renewals|list-at-risk-members|list-classes|list-members" apps/staff-web/.generated/actions-registry.ts`:

```
import * as a_list_at_risk_members from "../actions/list-at-risk-members";
import * as a_list_classes from "../actions/list-classes";
import * as a_list_fill_rate from "../actions/list-fill-rate";
import * as a_list_members from "../actions/list-members";
import * as a_list_renewals from "../actions/list-renewals";
  "list-at-risk-members": a_list_at_risk_members,
  "list-classes": a_list_classes,
  "list-fill-rate": a_list_fill_rate,
  "list-members": a_list_members,
  "list-renewals": a_list_renewals,
```

All 5 actions are auto-loaded — no `loadActionsFromStaticRegistry` argument edit needed.

## Expected agent behaviour (chip-prompt round-trip)

The 3 hardcoded chip prompts set by Plan 01 in `AppLayout.tsx` for `/gymos/*` will now resolve as follows (verifiable in Plan 08 live verify):

| Chip prompt | Expected tool call | Expected response shape |
|-------------|--------------------|-------------------------|
| "Which classes haven't been filled in the last week?" | `list-fill-rate` (default 7-day window) | Prose listing occurrences with low fill %, e.g. "In the last 7 days, the 4 PM Yoga class had 3 of 12 seats filled (25%), and the 7 AM HIIT class had 8 of 12 (67%)..." |
| "Provide renewal numbers" | `list-renewals` | Prose with `{activeSubscriptions, expiringPasses7d, expiringPasses30d, subscriptionsRenewingNext30d}` |
| "Which customers should I reach out to?" | `list-at-risk-members` | Prose listing members with declining attendance / lapsed passes |

Negative test: asking "archive my emails" or "show me my starred" should return a polite refusal explaining the agent is gym-focused (gated by the systemPrompt's "Never reference: email, Gmail, inbox..." paragraph). The agent will NOT call `archive-email`, `star-email`, `list-emails` because those tool names appear nowhere in the systemPrompt — the LLM has no signal to pick them.

## Files Created/Modified

- `apps/staff-web/server/plugins/agent-chat.ts` — gym-aware agent plugin (appId, systemPrompt, mentionProviders)
- `apps/staff-web/AGENTS.md` — gym-domain dev guide replacing mail dev guide
- `templates/mail/AGENTS.md` — confirmed unmodified (preserved upstream-clean for fork merges)
- `apps/staff-web/CLAUDE.md` — confirmed unmodified (still `@-includes AGENTS.md`)

## Decisions Made

- **Mail action files preserved on disk** — the 30+ files in `apps/staff-web/actions/{archive-email,list-emails,send-email,...}.ts` are NOT deleted. They auto-register but the systemPrompt doesn't name them, so the agent has no incentive to call them. Trade: agent never offers email vocabulary, dogfooding `/inbox` still works (mail UI bypasses the agent). Deletion belongs to P0 audit.
- **mentionProviders set to `{}` not removed** — framework accepts empty object; reserves the slot for P2 gym mention providers (`@member`, `@class`, `@conversation`) without changing the plugin call shape.
- **systemPrompt is verbatim from the plan** — no rewording; matches the plan's "exact gym-aware prompt" specification so acceptance criteria (literal string match on "GymClassOS", "gym_members", "list-fill-rate", etc.) pass deterministically.

## Deviations from Plan

None - plan executed exactly as written.

The plan's verification step (`pnpm --filter staff-web typecheck`) surfaced one out-of-scope error in a sibling Wave 2 plan's file (`gymos._index.tsx` imports `~/components/gymos/TemplatesDialog` which doesn't exist yet — owned by Plan 05). Per SCOPE BOUNDARY rule, this is not my plan's responsibility to fix; it will resolve when Plan 05 lands its `TemplatesDialog.tsx`. The typecheck error is unrelated to my two file edits and does not affect the two files I shipped.

## Issues Encountered

- **Typecheck error in Plan 05's file:** `app/routes/gymos._index.tsx(42,33): error TS2307: Cannot find module '~/components/gymos/TemplatesDialog'` — Plan 05 is a sibling Wave 2 plan currently in progress; the missing import will land when Plan 05 commits its `TemplatesDialog.tsx`. Out of scope for Plan 07 (which only touched `agent-chat.ts` and `AGENTS.md`). Logged here for transparency; not deferred to `deferred-items.md` because it's not "discovered work" — it's a known parallel-execution artifact.

## Known Stubs

None - both files are fully wired. The systemPrompt names real actions that exist in the registry; AGENTS.md documents real data sources that exist in the Neon schema. No placeholder data, no empty render paths.

## User Setup Required

None - no external service configuration required. Changes are deploy-on-restart (Vite picks up the new systemPrompt + actions on dev server restart or `pnpm build`).

## Next Phase Readiness

- **Plan 08 (end-to-end verification):** can now exercise the 3 chip prompts and confirm real gym data flows back. Acceptance criteria for Plan 08 should include: "click chip 1 → agent calls list-fill-rate → response references real class names from `class_definitions`".
- **P2 (agent mutations):** the systemPrompt's read-only constraint paragraph is explicit, so when P2 adds mutation actions (book-member, cancel-booking, send-template) it needs to update the systemPrompt's "You are READ-ONLY" section and add the new action names to the tool list.
- **P2 (gym mention providers):** `mentionProviders` is `{}` ready to receive `member: {...}`, `class: {...}`, `conversation: {...}` providers; pattern mirrors the deleted email provider.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: apps/staff-web/server/plugins/agent-chat.ts
- FOUND: apps/staff-web/AGENTS.md (85 lines, >= 80 required)
- FOUND: templates/mail/AGENTS.md (578 lines, unmodified — preserved per D-10)
- FOUND: apps/staff-web/CLAUDE.md (unmodified, still `@AGENTS.md` include)
- FOUND: apps/staff-web/.generated/actions-registry.ts (contains all 5 gym actions)

**Commits verified to exist:**
- FOUND: 06d3a797 (feat(P1b.1-07): rewrite agent-chat plugin for gym surface)
- FOUND: 0038dca3 (docs(P1b.1-07): replace staff-web AGENTS.md with gym version)

**Acceptance criteria verified:**
- agent-chat.ts contains literal `"gymos"` (appId value): YES
- agent-chat.ts does NOT contain `appId: "mail"`: YES
- systemPrompt contains literal `"GymClassOS"`: YES
- systemPrompt contains literal `"gym_members"`: YES
- systemPrompt contains literal `"list-fill-rate"`: YES
- systemPrompt contains literal `"list-renewals"`: YES
- systemPrompt contains literal `"list-at-risk-members"`: YES
- systemPrompt contains negative-prompt about email vocabulary: YES ("Never reference: email, Gmail, inbox...")
- agent-chat.ts does NOT contain `emails:` inside mentionProviders block: YES (cleared to `{}`)
- systemPrompt is at least 1000 characters long: YES (~2150 chars)
- AGENTS.md contains `# GymClassOS Staff Web — Agent Guide` heading: YES
- AGENTS.md contains rows for list-fill-rate, list-renewals, list-at-risk-members: YES
- AGENTS.md contains `Forbidden Vocabulary` and `Data Sources` sections: YES
- AGENTS.md contains `WhatsApp`, `gym_members`, `Neon`: YES
- AGENTS.md does NOT contain `archive-email`: YES (0 occurrences)
- AGENTS.md does NOT contain `Gmail` outside Forbidden Vocabulary: YES (only line 61)

---
*Phase: P1b.1-customer-pilot-enablement*
*Completed: 2026-05-25*
