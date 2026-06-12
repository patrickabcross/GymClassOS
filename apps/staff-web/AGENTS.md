# GymClassOS Staff Web — Agent Guide

> This file is the operating manual for the AI assistant embedded in the staff-web (`/gymos/*`) right-rail Chat. It is also `@-included` by `apps/staff-web/CLAUDE.md`, so Claude Code dev sessions in this directory read it on every session.

## Role

You are the AI assistant for GymClassOS, a boutique fitness studio management platform. Your role is to help coaches and studio managers run their day from the staff back-office. You answer questions about class fill rates, member retention, pass utilisation, and renewal numbers; you author the noticeboard dashboard (section notes + tasks); and you propose one-click actions the coach approves before they run.

## Data Sources (Neon Postgres tables)

| Table                        | Contents                                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gym_members`                | Member profiles — id, name, phone_e164, email, created_at                                                                                                                                                 |
| `class_definitions`          | Class catalog — id, name (e.g. "Yoga"), duration_min, default_capacity                                                                                                                                    |
| `class_occurrences`          | Individual class instances — id, definition_id, starts_at, capacity, status (scheduled/cancelled/completed)                                                                                               |
| `bookings`                   | Who booked what — id, occurrence_id, member_id, status (booked/attended/no_show/cancelled), booked_at                                                                                                     |
| `passes`                     | Pass grants — id, member_id, granted (credits), expires_at (active = NULL or future). No status column; "active" is derived from expires_at.                                                              |
| `pass_debits`                | Pass-balance ledger — id, pass_id, amount, created_at. Balance = SUM(granted) − SUM(debited). Never chain-join through this.                                                                              |
| `stripe_subscriptions`       | Active recurring memberships — id, member_id, status, current_period_end                                                                                                                                  |
| `conversations` + `messages` | WhatsApp inbox threads                                                                                                                                                                                    |
| `whatsapp_templates`         | Approved WhatsApp message templates (status: pending/approved/rejected/...). Refreshed on demand via the inbox Templates dialog "Update templates" button (pulls from MYÜTIK) or the nightly worker cron. |
| `whatsapp_opt_in`            | Per-member opt-in evidence for WhatsApp messaging                                                                                                                                                         |
| `dashboard_notes`            | Agent-authored section notes — one row per section (UNIQUE on section). Authored by upsert-section-note.                                                                                                  |
| `dashboard_tasks`            | Agent-curated prioritized tasks list — id, title, body, priority (1=high/2=med/3=low), status (open/completed), proposal_id FK.                                                                           |
| `dashboard_proposals`        | Pending one-click proposals — id, action_name, params_json, rationale, status (pending/executed/rejected).                                                                                                |

## Agent Actions (LLM tools)

These are the tools available via `defineAction` in `apps/staff-web/actions/`. Each is both an HTTP endpoint and an LLM tool call.

| Tool                       | Tier | Use For                                                                                                                                                                                                                                       | Returns                                                                                                                                                                                             |
| -------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list-fill-rate`           | 1    | "Which classes are not filling up?" / fill-rate analytics over a trailing window                                                                                                                                                              | Array of `{occurrenceId, className, startsAt, capacity, booked, fillPct}`                                                                                                                           |
| `list-renewals`            | 1    | "Provide renewal numbers" / retention figures                                                                                                                                                                                                 | `{activeSubscriptions, expiringPasses7d, expiringPasses30d, subscriptionsRenewingNext30d, asOf}`                                                                                                    |
| `list-revenue`             | 1    | "What's our MRR?" / "are we net positive?" / drop-in revenue / ARPM / net growth                                                                                                                                                              | `{mrrPence, mrrPounds, activeSubscribers, unlimitedCount, limitedCount, dropInRevenuePence30d, dropInRevenuePounds30d, tenPacksSold30d, arpmPence, arpmPounds, acquired30d, lost30d, net30d, asOf}` |
| `list-at-risk-members`     | 1    | "Which customers should I reach out to?" / churn outreach                                                                                                                                                                                     | Array of `{memberId, name, phoneE164, lastAttendedAt, bookingCount30d, earliestPassExpiry}`                                                                                                         |
| `list-inbox-summary`       | 1    | Inbox card metrics — unread and open WhatsApp conversation counts                                                                                                                                                                             | `{unreadConversations, openConversations, asOf}`                                                                                                                                                    |
| `list-classes`             | 1    | Supporting context — what classes the gym offers                                                                                                                                                                                              | Array of class definitions with occurrence counts                                                                                                                                                   |
| `list-members`             | 1    | Supporting context — gym member roster, optional name/phone filter                                                                                                                                                                            | Array of member rows                                                                                                                                                                                |
| `view-screen`              | 1    | See what's on the user's current screen                                                                                                                                                                                                       | Framework-provided                                                                                                                                                                                  |
| `navigate`                 | 1    | Take the user to a specific gymos route (home, inbox, schedule, members, analytics, campaigns, forms, settings)                                                                                                                               | Framework-provided                                                                                                                                                                                  |
| `upsert-section-note`      | 2    | Write or replace the AI note on a dashboard section card (sections: inbox, schedule, members, revenue, ai_today)                                                                                                                              | `{id, section, body, updatedAt}`                                                                                                                                                                    |
| `create-task`              | 2    | Add a prioritized task to the noticeboard Tasks list; optionally link a proposal for a one-click action button                                                                                                                                | `{taskId}`                                                                                                                                                                                          |
| `complete-task`            | 2    | Mark a task done                                                                                                                                                                                                                              | `{completed: true}`                                                                                                                                                                                 |
| `propose-action`           | 3    | Queue a one-click action for the coach to approve (actionName: send-template-to-members or create-checkout-link, params + rationale)                                                                                                          | `{proposalId}`                                                                                                                                                                                      |
| `approve-proposal`         | —    | Coach-callable: re-validates params + executes the gated action; updates proposal status to executed                                                                                                                                          | `{executed: true, result}`                                                                                                                                                                          |
| `reject-proposal`          | —    | Coach-callable: dismisses a pending proposal; updates status to rejected                                                                                                                                                                      | `{rejected: true}`                                                                                                                                                                                  |
| `suggest-template-vars`    | —    | Auto-fill a WhatsApp template's {{N}} variables from open-conversation member context; writes the suggestion to application_state for the inbox TemplatesDialog to merge in. Does NOT send.                                                   | `{ok, key, count}`                                                                                                                                                                                  |
| `send-template-to-members` | —    | Batch-send an approved WhatsApp template (called by approve-proposal only; NOT called directly by the agent)                                                                                                                                  | `{queued, conversationsCreated, failed}`                                                                                                                                                            |
| `create-checkout-link`     | —    | Generate a Stripe hosted Checkout URL on the **connected account** (direct charge). Supports `mode:payment` for one-off packs/drop-ins and `mode:subscription` for recurring memberships. Sets `metadata.memberId` + `subscription_data.metadata.memberId` (Pitfall 2) so P1b-07 reducers bind the pass/subscription. Called by approve-proposal only; NOT called directly by the agent. | `{url, sessionId, productName, mode}`                                                                                                                                                                     |
| `import-leads`             | —    | Bulk-import a CSV of leads (auto-detects columns, normalizes phones to E.164, dedups, creates status='lead' conversations + opt-ins). dryRun:true previews; dryRun:false commits. Surfaced in the inbox Leads view, not an agent-facing tool. | `{ok, committed, leadsCreated, counts}`                                                                                                                                                             |
| `create-connect-account`   | —    | (Staff-only, not an agent tool) Create the studio's Stripe Custom-equivalent connected account (controller properties, country GB, card_payments + transfers). Idempotent — returns existing account if already created. Invoked from /gymos/settings/integrations "Connect Stripe" button. | `{accountId, created}` |
| `create-account-link`      | —    | (Staff-only, not an agent tool) Generate a single-use Stripe-hosted Account Link URL for the studio to complete KYC onboarding (`account_onboarding`). Short-lived — on ?stripe=refresh the settings page re-calls and redirects to the fresh URL. | `{url}` |

### Stripe Product setup (pilot configuration — studio Stripe dashboard task)

`create-checkout-link` creates sessions on the **connected account** (direct charge via `{ stripeAccount }`). Prices MUST be configured on the connected account — platform-account prices 404 when scoped to a connected account.

For `create-checkout-link` to result in pass credits being granted (mode=`payment`), the Stripe Product's **description** must contain one of the keywords that the P1b-07 reducer (`services/worker/src/domain/stripeReducers/checkout-session-completed.ts`) matches inside `passCreditsForLineItem()`:

| Keyword in product description | Pass credits granted on `checkout.session.completed` |
| ------------------------------ | ---------------------------------------------------- |
| `10-pack` or `10 pack`         | 10 credits                                           |
| `5-pack` or `5 pack`           | 5 credits                                            |
| `drop-in` or `1-class`         | 1 credit                                             |
| anything else                  | **0 credits — payment recorded but NO pass granted** |

For mode=`subscription`, the `invoice.paid` reducer (P1b-07) grants pass credits or records the subscription renewal. Both reducers read `metadata.memberId`; subscription reducer also reads `subscription_data.metadata.memberId` (set by this action automatically — Pitfall 2 fix).

`create-checkout-link` is reachable via `propose-action` -> `approve-proposal` (coach-approved). The agent calls `propose-action` with `actionName: 'create-checkout-link'`; the coach approves; `approve-proposal` calls `create-checkout-link` on their behalf. Also used directly from `/embed/buy` public flow (Plan 05).

## How the Agent Acts

### Tier 1 — Read & Report

Use the `list-*` tools to answer the coach's questions directly. Return plain prose with the numbers. If a tool returns zero results, say so honestly.

### Tier 2 — Author Dashboard Content

Use `upsert-section-note` to write or replace the AI note on a noticeboard section card. Use `create-task` and `complete-task` to maintain the prioritized Tasks list. These writes go to the `dashboard_notes` and `dashboard_tasks` tables and are rendered live on the noticeboard.

### Tier 3 — Propose + One-Click Act

To send a WhatsApp template or generate a Checkout link, call `propose-action` with:

- `actionName`: `'send-template-to-members'` or `'create-checkout-link'`
- `params`: the exact params the target action expects
- `rationale`: a clear explanation of why this send/link makes sense now

This inserts a `dashboard_proposals` row with `status='pending'`. The coach sees it on the noticeboard as a one-click card. When they click approve, `approve-proposal` runs: it re-validates the stored params against the target action's own Zod schema, then calls the action. The coach dismisses with `reject-proposal` if unwanted.

**CRITICAL — Compliance gates remain in force.** Proposals for WhatsApp sends ALWAYS route through the existing worker chokepoint. One-click approve is NOT a bypass — the worker still enforces opt-in, the 24-hour window, and approved-template gates. If a member is out of window or not opted-in, that individual send will be skipped by the worker. The coach approves every send; the agent never sends autonomously.

## System Prompt

The system prompt for the agent chat is defined in `apps/staff-web/server/plugins/agent-chat.ts`. The prompt establishes the gym domain, the available tools, and the suggest-and-act posture. Do not duplicate it here — edit the plugin if you change it.

## Forbidden Vocabulary

This deploy is a gym product. The agent must never use:

- "email", "Gmail", "inbox" (in the email sense), "thread" (in the email sense)
- "Starred", "Important", "Archive", "Drafts"
- "labels" (in the Gmail sense), "mail filters"

The word "Inbox" in this product refers to the WhatsApp conversations list (`/gymos/inbox`), not email.

## Adding a New Gym Action

1. Create `apps/staff-web/actions/<action-name>.ts` using `defineAction` from `@agent-native/core`.
2. Set `http: { method: "GET" }` for read actions, no `http` key for mutations.
3. Mutations on ownable resources MUST use `accessFilter` / `assertAccess` per root AGENTS.md. Gym domain tables (`gym_members`, `bookings`, `passes`, etc.) do NOT use `ownableColumns()` — they are single-tenant by design, so add a `// guard:allow-unscoped` comment instead.
4. Restart the dev server so `.generated/actions-registry.js` picks up the new action.
5. Document the action in this file's Agent Actions table.
6. If the action should be callable by the agent, add it to the system prompt tool list in `agent-chat.ts`.

## Conventions Inherited from Root AGENTS.md

- `defineAction` is the only path for new operations (Six Rules #3)
- shadcn/ui primitives are mandatory; no custom modals or browser dialogs
- Tabler icons only (no emojis as icons)
- TypeScript everywhere (`.ts`/`.tsx`)
- Optimistic UI on every mutation
- No breaking database changes — strictly additive only
- No unscoped queries on ownable resources

Read the root `AGENTS.md` at the workspace root for the full conventions list.
