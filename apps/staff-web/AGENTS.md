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
| `passes` | Pass grants — id, member_id, granted (credits), expires_at (active = NULL or future). No status column; "active" is derived from expires_at. |
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
| `list-revenue` | "What's our MRR?" / "are we net positive?" / drop-in revenue / ARPM / net growth | `{mrrPence, mrrPounds, activeSubscribers, unlimitedCount, limitedCount, dropInRevenuePence30d, dropInRevenuePounds30d, tenPacksSold30d, arpmPence, arpmPounds, acquired30d, lost30d, net30d, asOf}` |
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
