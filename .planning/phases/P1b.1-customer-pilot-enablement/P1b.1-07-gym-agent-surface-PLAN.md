---
phase: P1b.1-customer-pilot-enablement
plan: 07
type: execute
wave: 2
depends_on: [P1b.1-03, P1b.1-04]
files_modified:
  - apps/staff-web/server/plugins/agent-chat.ts
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [AGENT-04, AGENT-05]
must_haves:
  truths:
    - "Asking the AgentSidebar 'Which classes haven't been filled in the last week?' returns a real answer derived from list-fill-rate output (not an email-assistant non-answer, not a Gmail-vocabulary response)"
    - "Asking 'Provide renewal numbers' returns a real answer derived from list-renewals output"
    - "Asking 'Which customers should I reach out to?' returns a real answer derived from list-at-risk-members output"
    - "The agent does NOT offer to archive emails, manage Gmail filters, draft email replies, or reference Important / Starred / Inbox vocabulary"
    - "apps/staff-web/AGENTS.md contains gym-domain language only — no 'email', 'inbox' (in email sense), 'Gmail', 'thread' (in email sense) outside of code-fence examples"
  artifacts:
    - path: "apps/staff-web/server/plugins/agent-chat.ts"
      provides: "Gym-aware agent-chat plugin with gym systemPrompt and no email mentionProviders"
      contains: "gymos"
    - path: "apps/staff-web/AGENTS.md"
      provides: "Full gym AGENTS.md replacement — documents gym data sources, gym actions, gym agent capabilities"
      min_lines: 80
      contains: "GymClassOS"
  key_links:
    - from: "apps/staff-web/server/plugins/agent-chat.ts"
      to: "gym actions registry (list-fill-rate, list-renewals, list-at-risk-members, list-classes, list-members)"
      via: "auto-loaded via .generated/actions-registry"
      pattern: "actionsRegistry|actions/"
    - from: "apps/staff-web/AGENTS.md"
      to: "apps/staff-web/CLAUDE.md (@-include)"
      via: "Claude Code dev workflow reads it on every session"
      pattern: "@AGENTS.md"
---

<objective>
Replace the mail agent surface with a gym-aware one. The AgentSidebar suggestion chips (set in plan 01) need backing — when a coach clicks "Which classes haven't been filled in the last week?", the agent must use `list-fill-rate` and answer with real gym data, not generic email-assistant fluff.

Purpose: ROADMAP success criterion #5 requires the three chip prompts to return real answers from gym data. The current `agent-chat.ts` ships the Mail template's systemPrompt + mail action registry, so the agent has access to `archive-email`, `list-emails`, `manage-gmail-filters`, etc. — and zero gym context. This plan rewrites both `agent-chat.ts` (systemPrompt + appId) and `apps/staff-web/AGENTS.md` (the source of truth for Claude Code dev sessions in this deploy).

Output:
- `apps/staff-web/server/plugins/agent-chat.ts` — appId='gymos', gym systemPrompt, mentionProviders cleared of emails
- `apps/staff-web/AGENTS.md` — fully replaced with gym-domain guide
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md
@apps/staff-web/server/plugins/agent-chat.ts
@apps/staff-web/AGENTS.md
@AGENTS.md
@apps/staff-web/actions/list-emails.ts

<interfaces>
<!-- The agent-chat.ts plugin shape and how it wires actions to the LLM. -->

From apps/staff-web/server/plugins/agent-chat.ts (current shape — verify at task time):
```typescript
// Calls a framework helper (likely createAgentChatPlugin from @agent-native/core/server) with:
// {
//   appId: "mail",
//   systemPrompt: "You are a helpful email assistant...",
//   mentionProviders: { emails: ... },
//   actionsRegistry: importedFrom(".generated/actions-registry.js"),
// }
```

From the framework:
- The actionsRegistry is auto-generated from files in `apps/staff-web/actions/`. New action files (plans 03 + 04) auto-register on dev server restart or `pnpm build`.
- The systemPrompt is what the LLM sees first; it shapes the agent's voice and tool selection.
- `mentionProviders` is the @-mention surface in the chat composer (e.g. `@email-id` resolves to an email object). For gym surface, this should be cleared (or replaced with gym providers in P2).

Per research §"Architecture Patterns > 7. Gym AGENTS.md Replacement":
- Change `appId: "mail"` → `appId: "gymos"`
- Replace `systemPrompt` with gym-aware text
- Remove `mentionProviders.emails`
- Keep `actionsRegistry` — it auto-loads gym actions after dev server restart
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite apps/staff-web/server/plugins/agent-chat.ts for gym surface</name>
  <files>apps/staff-web/server/plugins/agent-chat.ts</files>
  <read_first>
    - apps/staff-web/server/plugins/agent-chat.ts — read the FULL file; identify the exact `createAgentChatPlugin` (or equivalent) call signature, where appId and systemPrompt are set, and what mentionProviders shape looks like
    - apps/staff-web/AGENTS.md (current mail version) — note the email-only vocabulary that's about to be replaced
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 7. Gym AGENTS.md Replacement (D-10)" — the structure for the new systemPrompt
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md D-08 — replace agent-chat.ts entirely with gym version; mail dogfooding loses its agent for this deploy (acceptable trade)
  </read_first>
  <action>
Edit `apps/staff-web/server/plugins/agent-chat.ts`. The minimum changes:

1. **Change `appId: "mail"` to `appId: "gymos"`.** (Or whatever the current value is — read first.)

2. **Replace the `systemPrompt` value** with this exact gym-aware prompt:

```
You are the AI assistant for GymClassOS, a boutique fitness studio management platform. Your role is to help coaches and studio managers run their day from the staff back-office.

You work with data from these gym domain tables:
- gym_members — member profiles (name, phone, email, created_at)
- class_definitions — the gym's class catalog (Yoga, HIIT, etc.) with duration and default capacity
- class_occurrences — individual class instances with starts_at, capacity, and status (scheduled/cancelled/completed)
- bookings — who booked what (status: booked/attended/no_show/cancelled)
- passes + pass_debits — pass-balance ledger (granted credits minus debits)
- stripe_subscriptions — active recurring memberships
- conversations + messages — WhatsApp inbox threads

Available tools (use these; do not invent others):
- list-fill-rate — class occurrences with capacity vs booked count over a trailing window. Use for "Which classes are not filling up?" / "What was attendance last week?" / fill-rate analytics.
- list-renewals — active subscriptions + expiring passes count. Use for "Provide renewal numbers" / retention figures.
- list-at-risk-members — members with declining attendance or lapsed passes. Use for "Which customers should I reach out to?" / churn outreach.
- list-classes — class definitions + recent occurrence counts. Use as supporting context.
- list-members — gym member roster (optionally filtered by name/phone). Use as supporting context.
- view-screen — see what's on the user's current screen. Use to ground answers in their context.
- navigate — take the user to a specific gymos route.

You are READ-ONLY for the pilot. You cannot:
- Book a member into a class (coach does this from /gymos/schedule)
- Send WhatsApp messages (coach does this from /gymos via the Templates dialog)
- Cancel bookings, refund payments, edit member records

You operate in a gym context. Never reference: email, Gmail, inbox (in the email sense), thread (in the email sense), Starred, Important, Archive, Drafts, labels (in the Gmail sense), or mail filters. The "Inbox" in this product is the WhatsApp conversations list, not email.

When a coach asks a question, choose the right tool, call it, and answer in plain prose with the numbers. Be concise. Be specific. If a tool returns zero results, say so honestly — don't fabricate data.
```

3. **Remove `mentionProviders.emails`** (or the equivalent email-only mention provider key). If `mentionProviders` becomes empty, either remove the key entirely or pass an empty object `{}` — match what the framework accepts. Do NOT replace with gym mention providers (deferred to P2).

4. **Keep `actionsRegistry` unchanged** — it auto-loads ALL files from `apps/staff-web/actions/` including the new gym actions (created in plans 03 + 04). The agent will see them as tools automatically on next dev server restart / build.

5. **DO NOT delete the existing mail action files** in `apps/staff-web/actions/` (archive-email, list-emails, etc.). They stay on disk because the mail surface still works for our dogfooding via direct URL navigation. The agent simply won't be primed to use them given the gym-only systemPrompt. Future deletion belongs to P0's audit phase, not here.

Run `pnpm --filter staff-web typecheck` after the edits.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/server/plugins/agent-chat.ts` contains literal `"gymos"` (appId value)
    - The file does NOT contain `appId: "mail"` (the value changed)
    - The systemPrompt string contains literal `"GymClassOS"`
    - The systemPrompt string contains literal `"gym_members"`
    - The systemPrompt string contains literal `"list-fill-rate"`
    - The systemPrompt string contains literal `"list-renewals"`
    - The systemPrompt string contains literal `"list-at-risk-members"`
    - The systemPrompt contains a sentence like "Never reference: email, Gmail, inbox..." OR similar negative-prompt about email vocabulary
    - The file does NOT contain `mentionProviders.emails` OR `emails:` inside any mentionProviders block (cleared)
    - The systemPrompt is at least 1000 characters long (the full prompt above)
    - `pnpm --filter staff-web typecheck` exits with code 0
  </acceptance_criteria>
  <done>
After dev server restart (or `pnpm build`), the AgentSidebar loads with the new gym systemPrompt. Asking "Which classes haven't been filled in the last week?" triggers the LLM to call `list-fill-rate`, which returns real data; the agent responds with prose like "In the last 7 days, the 4 PM Yoga class had 3 of 12 seats filled (25%), and the 7 AM HIIT class had 8 of 12 (67%)...". Asking "archive my emails" returns a refusal explaining the agent is gym-focused, NOT an attempt to call archive-email. Mail dogfooding via direct URL still works but its agent surface is no longer mail-aware (acceptable per D-08).
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace apps/staff-web/AGENTS.md with a gym version</name>
  <files>apps/staff-web/AGENTS.md</files>
  <read_first>
    - apps/staff-web/AGENTS.md — read the FULL current file to understand what is being replaced (sizes, structure, sections). Note: this is the mail-template AGENTS.md, ~600 lines. The entire file is being overwritten with a gym version.
    - templates/mail/AGENTS.md — confirm the upstream-clean mail version still lives here (do NOT touch it; it's preserved for upstream fork merges per P1b-01)
    - apps/staff-web/CLAUDE.md — confirm this file `@-includes` AGENTS.md so the replacement propagates to Claude Code dev sessions
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 7. Gym AGENTS.md Replacement (D-10)" — the structural template for the gym AGENTS.md
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md D-10 — overwrite entirely; mail version remains at templates/mail/AGENTS.md
  </read_first>
  <action>
Overwrite `apps/staff-web/AGENTS.md` entirely with this gym version. Do NOT preserve any of the existing mail content. The mail version is safe at `templates/mail/AGENTS.md` for upstream fork merges.

Write this exact content (it can be expanded but must contain at minimum these sections + verbatim section headings):

```markdown
# GymClassOS Staff Web — Agent Guide

> This file is the operating manual for the AI assistant embedded in the staff-web (`/gymos/*`) right-rail Chat. It is also `@-included` by `apps/staff-web/CLAUDE.md`, so Claude Code dev sessions in this directory read it on every session.

## Role

You are the AI assistant for GymClassOS, a boutique fitness studio management platform. Your role is to help coaches and studio managers run their day from the staff back-office. You answer questions about class fill rates, member retention, pass utilisation, and renewal numbers. You are read-only for the pilot — coaches still own all mutations through the UI.

## Data Sources (Neon Postgres tables)

| Table | Contents |
|-------|----------|
| `gym_members` | Member profiles — id, name, phone_e164, email, created_at |
| `class_definitions` | Class catalog — id, name (e.g. "Yoga"), duration_min, default_capacity |
| `class_occurrences` | Individual class instances — id, definition_id, starts_at, capacity, status (scheduled/cancelled/completed) |
| `bookings` | Who booked what — id, occurrence_id, member_id, status (booked/attended/no_show/cancelled), booked_at |
| `passes` | Pass grants — id, member_id, granted_credits, expires_at, status (active/expired/void) |
| `pass_debits` | Pass-balance ledger — id, pass_id, amount, created_at. Balance = SUM(granted) − SUM(debited). Never chain-join through this. |
| `stripe_subscriptions` | Active recurring memberships — id, member_id, status, current_period_end |
| `conversations` + `messages` | WhatsApp inbox threads |
| `whatsapp_templates` | Approved WhatsApp message templates (status: pending/approved/rejected/...) |
| `whatsapp_opt_in` | Per-member opt-in evidence for WhatsApp messaging |

## Agent Actions (LLM tools)

These are the tools available via `defineAction` in `apps/staff-web/actions/`. Each is both an HTTP GET endpoint at `/_agent-native/actions/<name>` and an LLM tool call.

| Tool | Use For | Returns |
|------|---------|---------|
| `list-fill-rate` | "Which classes are not filling up?" / fill-rate analytics over a trailing window | Array of `{occurrenceId, className, startsAt, capacity, booked, fillPct}` |
| `list-renewals` | "Provide renewal numbers" / retention figures | `{activeSubscriptions, expiringPasses7d, expiringPasses30d, subscriptionsRenewingNext30d, asOf}` |
| `list-at-risk-members` | "Which customers should I reach out to?" / churn outreach | Array of `{memberId, name, phoneE164, lastAttendedAt, bookingCount30d, earliestPassExpiry}` |
| `list-classes` | Supporting context — what classes the gym offers | Array of class definitions with occurrence counts |
| `list-members` | Supporting context — gym member roster, optional name/phone filter | Array of member rows |
| `view-screen` | See what's on the user's current screen | Framework-provided |
| `navigate` | Take the user to a specific gymos route | Framework-provided |

## System Prompt

The system prompt for the agent chat is defined in `apps/staff-web/server/plugins/agent-chat.ts`. The prompt establishes the gym domain, the available tools, and the read-only constraint. Do not duplicate it here — edit the plugin if you change it.

## What the Agent CAN Do (read-only for pilot)

- Answer questions about class fill rates, attendance, cancellations
- Identify members at risk of churn
- Report renewal numbers (active subscriptions + expiring passes)
- List members or classes for context
- Navigate the user to a specific gymos route

## What the Agent CANNOT Do (P2 — deferred from P1b.1 per CONTEXT.md)

- Book a member into a class (coach does this from `/gymos/schedule`)
- Send WhatsApp messages (coach does this from `/gymos` via the Templates dialog)
- Cancel bookings, issue refunds, edit member records
- Access email — there is no email surface in this deploy

## Forbidden Vocabulary

This deploy is a gym product. The agent must never use:

- "email", "Gmail", "inbox" (in the email sense), "thread" (in the email sense)
- "Starred", "Important", "Archive", "Drafts"
- "labels" (in the Gmail sense), "mail filters"

The word "Inbox" in this product refers to the WhatsApp conversations list (`/gymos`), not email.

## Adding a New Gym Action

1. Create `apps/staff-web/actions/<action-name>.ts` using `defineAction` from `@agent-native/core`.
2. Set `http: { method: "GET" }` for read actions, POST for mutations.
3. Mutations on ownable resources MUST use `accessFilter` / `assertAccess` per root AGENTS.md. Gym domain tables (`gym_members`, `bookings`, `passes`, etc.) do NOT use `ownableColumns()` — they are single-tenant by design, so `accessFilter` is not required for those reads.
4. Restart the dev server so `.generated/actions-registry.js` picks up the new action.
5. Document the action in this file's Agent Actions table.

## Conventions Inherited from Root AGENTS.md

- `defineAction` is the only path for new operations (Six Rules #3)
- shadcn/ui primitives are mandatory; no custom modals or browser dialogs
- Tabler icons only (no emojis as icons)
- TypeScript everywhere (`.ts`/`.tsx`)
- Optimistic UI on every mutation
- No breaking database changes — strictly additive only
- No unscoped queries on ownable resources

Read the root `AGENTS.md` at the workspace root for the full conventions list.
```

After writing, verify with: `wc -l apps/staff-web/AGENTS.md` — should be at least 80 lines.

Run `grep -i "email" apps/staff-web/AGENTS.md` — this MUST only match inside code-fence examples or the explicit "Forbidden Vocabulary" section listing it. The agent's narrative prose should have zero mentions of "email" outside those contexts.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/AGENTS.md` exists
    - File line count ≥ 80 lines (this is a meaningful guide, not a stub)
    - Contains literal heading `"# GymClassOS Staff Web — Agent Guide"` (or equivalent gym-titled H1)
    - Contains literal table-of-tools row for `list-fill-rate`
    - Contains literal table-of-tools row for `list-renewals`
    - Contains literal table-of-tools row for `list-at-risk-members`
    - Contains literal section heading `"Forbidden Vocabulary"` or `"Data Sources"` — the gym-specific structural sections
    - Contains literal string `"WhatsApp"` (gym product references WhatsApp, not email)
    - Contains literal string `"gym_members"` or `"Neon"` (real domain data sources)
    - The file does NOT contain the string "archive-email" outside a strict negative-example context (the entire mail action vocabulary should be gone)
    - The file does NOT contain "Gmail" outside the "Forbidden Vocabulary" listing
    - `templates/mail/AGENTS.md` still exists (mail upstream-clean version preserved — DO NOT delete)
    - `apps/staff-web/CLAUDE.md` still `@-includes` AGENTS.md (existing setup unchanged)
  </acceptance_criteria>
  <done>
After replacement: `apps/staff-web/AGENTS.md` is a gym-domain guide referencing gym tables, gym actions, and the read-only pilot constraint. A future Claude Code dev session reading this file gets gym context, not Mail context. The agent chat plugin (task 1) consumes the systemPrompt; the gym AGENTS.md exists as the source-of-truth dev reference but is not loaded at runtime by the agent — runtime systemPrompt is in agent-chat.ts. The mail upstream-clean version remains at templates/mail/AGENTS.md untouched.
  </done>
</task>

</tasks>

<verification>
- agent-chat.ts has appId='gymos', gym systemPrompt, no email mentionProviders
- apps/staff-web/AGENTS.md is the gym version (≥80 lines, gym vocabulary throughout)
- templates/mail/AGENTS.md preserved upstream-clean
- The 5 gym actions from plans 03 + 04 are auto-registered (dev server picks up via .generated/actions-registry)
- TypeScript compiles
</verification>

<success_criteria>
1. ROADMAP success criterion #5: The three chip prompts return real gym answers (not email-assistant non-answers)
2. The agent does not offer to "archive emails" or reference Gmail/Inbox/Starred
3. Future Claude Code dev sessions in apps/staff-web/ read the gym guide, not the mail guide
4. Mail upstream-clean reference preserved for future fork merges
</success_criteria>

<output>
After completion, create `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-07-gym-agent-surface-SUMMARY.md` documenting:
- The exact lines/sections of agent-chat.ts that changed
- Confirmation that all 5 gym actions appear in the auto-loaded actionsRegistry after dev server restart
- Sample agent response to each of the three chip prompts (paste prose + tool call name)
- Confirmation that templates/mail/AGENTS.md was not modified
</output>
