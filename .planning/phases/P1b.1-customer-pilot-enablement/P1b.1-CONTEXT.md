# Phase P1b.1: Customer Pilot Enablement — Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Hand the live `gym-class-os.vercel.app` deploy to the signed customer as a real pilot tool. Five tightly-coupled changes — all already-scoped in ROADMAP.md — must land together:

1. **Bare gymos layout** — `/gymos/*` skips the email AppLayout chrome (hamburger / "Important / Other 25" tabs / email sidebar / Compose / refresh / bell) but keeps the right-rail AgentSidebar.
2. **Templates send path** — rename the per-thread send-template affordance to "Templates", open a shadcn `<Dialog>` with approved templates, route through the existing P1b-06 worker `sendMessage()` chokepoint.
3. **`/gymos/analytics`** — new route in `GymosTopNav` showing at least three read-only metrics from seeded data (fill rate, cancellation, pass utilisation; exact metric list finalised at plan-phase).
4. **Customer login provisioning** — Google OAuth (already wired); env allowlist gates access to a known set of customer emails.
5. **Gym-aware agent surface** — replace `agent-chat.ts`'s mail systemPrompt + mail tool registry with a gym version; ship the minimum action set so the three hardcoded chip prompts return real answers from gym data.

**Out of scope (kicked elsewhere — see Deferred):**
- Member/coach role split enforcement → P1a / AUTH-02.
- Email magic-link / SMTP wiring → P1a / MEMAUTH-02 (members) and later for staff.
- Atomic booking / pass debit / waitlist / notifications → P2.
- CRM-style mutations from the agent (book a member, cancel a booking, create campaigns) → P2.
- Real WhatsApp template approvals → already P0 / FND-07 (we ship Templates UI gated on seeded fixtures + Meta's `hello_world` so the UI works day-one; real approvals flow in via P1b-09's WA-08 sync cron).

**Quality bar:** First-pilot-grade. UI must look like a gym product end-to-end. Worker-chokepoint guarantees (opt-in + 24h-window + template-approved) remain the source of truth; nothing in this phase weakens them. No backwards-compat shims for the email chrome we're stripping out.

</domain>

<decisions>
## Implementation Decisions

### Layout / chrome strip

- **D-01:** **AgentSidebar-only wrapper.** Add `isGymosPath(pathname)` to `apps/staff-web/app/components/layout/AppLayout.tsx` (sibling to the existing `BARE_ROUTES` set and `isStandardLayoutPath()`). When the path starts with `/gymos`, `AppLayout` returns `<AgentSidebar position="right" defaultOpen={!isMobile} emptyStateText="Ask me anything about your gym" suggestions={…}>{children}</AgentSidebar>` — no `AppLayoutInner`, no `StandardLayout`, no email header, no email sidebar, no `ComposeModal`. `gymos.tsx` continues to provide `GymosTopNav + Outlet`. Right-rail Chat survives because the framework `AgentSidebar` is mounted high enough to wrap the entire `/gymos` content.

- **D-02:** **Hard-redirect `/` and any leftover email URLs to `/gymos`.** Extends the redirect pattern from quick task `260524-r8f` (which already redirects `$view.tsx` + `$view.$threadId.tsx` → `/gymos`). Add an `_index.tsx` root redirect (or update the existing one) so signing in lands on `/gymos`. The customer never sees `/inbox`, `/email`, `/draft-queue`, `/team`, or `/settings` (mail). Dev access to mail still works by typing the URL — intentional, our dogfooding survives.

### Templates send path

- **D-03:** **Seed fixtures + `hello_world` bridge for template availability.** Pre-seed `whatsapp_templates` with five rows:
  - 4 named templates (`class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`) marked `status='pending'` — appear in the picker but disabled / labelled "awaiting Meta approval".
  - Meta's pre-approved `hello_world` template marked `status='approved'` so the picker has at least one sendable option from day one.
    WA-08 daily sync cron (P1b-09) replaces seeded rows when real approvals land — no manual intervention needed once Meta clears the four named templates. Worker chokepoint's `template-approved` gate keeps the un-approved ones from being sent regardless of seeding.

- **D-04:** **Single-Dialog picker.** shadcn `<Dialog>` opens on Templates click. Layout: approved templates list on the left, selected template's variable inputs + live body preview with substitutions on the right, Send button at the bottom of the right pane. Closes on send or Cancel. No two-step navigation. Variable form derived from `whatsapp_templates.components_json`.

- **D-05:** **Templates is a secondary button next to Send in `gymos._index.tsx` reply form.** The mail "Compose" button at `AppLayout.tsx:1140` disappears with D-01 (it lived in stripped chrome). Add a new "Templates" button beside `Send` in the existing reply Form (`gymos._index.tsx:519`). Free-text `Send` stays primary and handles the in-window happy path; `Templates` handles out-of-window + proactive sends (e.g., a class reminder to a member with no recent inbound). Both routes through `enqueueOutboundWhatsApp` → worker `sendMessage()` chokepoint per P1b D-09/-10/-11 — staff-web NEVER calls Meta directly. Optimistic insert (status='queued') matches the D-18 pattern already in `gymos._index.tsx:299-301`.

### Customer auth provisioning

- **D-06:** **Google OAuth, customer brings their own Workspace/Gmail account.** Better-auth Google OAuth is already wired (scopes narrowed to `userinfo.profile + userinfo.email` in `260524-r8f`). Zero new auth infrastructure. Customer signs in with `their@email`; on first sign-in, Better-auth creates the `user` row. No password storage, no SMTP, no email transport.

- **D-07:** **Hardcoded `CUSTOMER_ALLOWED_EMAILS` env allowlist.** Add `CUSTOMER_ALLOWED_EMAILS=email1@…,email2@…` to `apps/staff-web/.env` and to the Vercel project env vars. A Better-auth after-signin hook (or a thin layer in `apps/staff-web/server/plugins/auth.ts`) checks the signed-in email against the allowlist; mismatch ⇒ sign out + redirect to an `/access-denied` page. Single-tenant pilot gate; replace with proper org-based ACL in P1a / AUTH-02. List of allowed emails comes from the customer at plan-time (developer/owner email + 1-2 coach emails expected).

### Agent grounding + gym actions

- **D-08:** **Replace `agent-chat.ts` entirely with a gym agent-chat plugin.** Refactor `apps/staff-web/server/plugins/agent-chat.ts` (or create `agent-chat-gymos.ts` and stop loading the mail plugin in this deploy) so the single agent surface in this deploy is gym-aware. Mail surface is being phased out for the customer; keeping mail actions in the registry adds hallucination risk (agent might offer to "archive an email" to a gym coach). Mail dogfooding in this deploy loses its agent — acceptable trade for pilot.

- **D-09:** **Minimum gym action set — cover the 3 chip prompts end-to-end.**
  - `list-renewals` (REQ source for "Provide renewal numbers"): aggregates over `stripe_subscriptions` (active + due-to-renew window) + `member_passes` expiry (passes expiring soon).
  - `list-fill-rate` (REQ source for "Which classes haven't been filled in the last week?"): over `class_occurrences` × `bookings` for the trailing 7 days; returns occurrence + capacity + bookings + fill %.
  - `list-at-risk-members` (REQ source for "Which customers should I reach out to?"): over `bookings` + `member_passes` + last-attended; returns members with declining attendance / lapsed passes.
  - Plus shared read actions used by all of the above: `list-classes`, `list-members`, `view-screen`, `navigate`.
    No agent-driven mutations in P1b.1 (no book-member, no cancel-booking, no message-member). Mutations stay UI-driven for pilot safety; agent gains write actions in P2.

- **D-10:** **Replace `apps/staff-web/AGENTS.md` entirely with a gym version.** Overwrite the ~600-line mail AGENTS.md with a fresh gym AGENTS.md that documents the gym agent's tools, data sources (Neon tables: `members`, `class_occurrences`, `bookings`, `member_passes`, `stripe_subscriptions`, `conversations`, `messages`), and operating patterns. `apps/staff-web/CLAUDE.md` already `@-includes` `AGENTS.md` so Claude Code dev work reads the gym instructions too. Upstream-clean mail `AGENTS.md` stays in `templates/mail/AGENTS.md` for fork merges.

### Claude's Discretion (planner decides at plan-time)

- **Analytics metric list.** Phase says "exact metric list finalised at plan time" — pick at least three of: fill rate, cancellation rate, no-show rate, pass utilisation. Computed live via Drizzle aggregations over the existing schema; no new tables; no date-range picker for v1 (defaults to "last 7 days" + "last 30 days" panels).
- **Better-auth user-row pre-seed vs auto-create on first sign-in.** Allowlist check can run either way; planner picks based on Better-auth's actual lifecycle.
- **AgentSidebar suggestions per route.** Suggestions array in AppLayout currently hardcoded; planner can leave hardcoded or accept route-aware suggestions if trivial.
- **Whether to extract a `<GymosLayout>` wrapper component** vs inlining the AgentSidebar wrap in AppLayout.tsx. Tiny diff either way.
- **`list-renewals` data source split** — pull only from `stripe_subscriptions`, or also include expiring `member_passes`? Probably both; planner verifies schema first.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition + prior context (must read first)
- `.planning/ROADMAP.md` §"Phase P1b.1: Customer Pilot Enablement" — Goal, Scope (5 numbered items), Success criteria (6 criteria), Risks (3 listed: template approval timing, Better-auth for non-Google accounts, agent action drift), Depends on.
- `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md` §`<decisions>` — D-09/-10/-11 (transport-only `packages/whatsapp` + worker chokepoint + staff-web cannot import @gymos/whatsapp), D-12/-13/-14 (typed publisher + singletonKey + concurrency), D-15 (`whatsapp_templates` table shape), D-18/-19/-20/-21 (optimistic insert UX + UI pre-gate AND worker enforcement + window-state badges + TanStack refetch-on-focus).
- `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-06-worker-sendmessage-chokepoint-SUMMARY.md` — exact `sendMessage()` signature + typed errors (`NoOptInError` / `WindowExpiredError` / `TemplateNotApprovedError`) + the status-bubble error_code copy mapping.
- `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-08-staffweb-outbound-rotation-SUMMARY.md` — the existing reply Form pattern in `gymos._index.tsx:519` (Templates button extends this same Form).

### Project-level + state
- `.planning/PROJECT.md` — vision, Stripe-direct decision, single-tenant code, Tabler icons / no emojis, no breaking DB changes ever.
- `.planning/STATE.md` — current deploy state (Vercel live with pg-externalisation fix, Fly worker still pending), Better-auth Google OAuth scope narrowing context, list of touched files this session.
- `.planning/REQUIREMENTS.md` §AUTH-01 + INBX-01/02 + WA-05/-06/-07 + AGENT-04/-05 — exact acceptance criteria for the requirements this phase touches.

### Code that downstream agents must read/modify
- `apps/staff-web/app/components/layout/AppLayout.tsx` — D-01 lives here (add `isGymosPath()` sibling to `BARE_ROUTES` set at line 79 + `isStandardLayoutPath` at line 88; conditional return at line 124-150 that wraps in AgentSidebar only for gymos paths).
- `apps/staff-web/app/routes/gymos.tsx` — layout shell, stays as-is or absorbs the AgentSidebar wrap.
- `apps/staff-web/app/routes/gymos._index.tsx:519-552` — existing reply Form; Templates button slots in beside Send.
- `apps/staff-web/app/routes/gymos._index.tsx:299-345` — existing `enqueueOutboundWhatsApp` + failed-bubble copy path; Templates send re-uses this exactly.
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — add `Analytics` tab between `Payments` and `Settings`.
- `apps/staff-web/app/routes/$view.tsx` + `$view.$threadId.tsx` — existing redirect-to-gymos stubs from quick task `260524-r8f` (template for D-02).
- `apps/staff-web/server/plugins/agent-chat.ts:59-130` — mail systemPrompt + action registry; rewritten for D-08.
- `apps/staff-web/server/plugins/auth.ts` — auth plugin where `CUSTOMER_ALLOWED_EMAILS` allowlist hook lands (D-07).
- `apps/staff-web/server/lib/google-auth.ts` — already narrowed to profile+email per `260524-r8f`; no changes expected.
- `apps/staff-web/AGENTS.md` — replaced entirely for D-10 (preserve mail version in `templates/mail/AGENTS.md` upstream-clean).
- `apps/staff-web/CLAUDE.md` — symlink/@-include of AGENTS.md; no changes.

### Schema
- `apps/staff-web/server/db/schema.ts` — `whatsapp_templates` table (name PK, status, components_json, last_synced_at) already migrated P1b-02; gym actions read `members`, `class_occurrences`, `class_definitions`, `bookings`, `member_passes`, `conversations`, `messages`, `stripe_subscriptions` (all exist post-P1b-02).
- `apps/staff-web/server/db/migrations/` — no new migration in P1b.1 unless analytics needs a derived view (planner decides; likely no, aggregations run live).

### Framework patterns
- `AGENTS.md` (root) §"The Six Rules" + §"Adding a Feature — The Four Areas" + §"Conventions" (shadcn primitives, Tabler icons, no emojis, no breaking DB changes, no unscoped queries).
- `CLAUDE.md` (root) — `@AGENTS.md` include; project preamble + stack constraints.
- `.agents/skills/actions/SKILL.md` — `defineAction` pattern for new gym actions.
- `.agents/skills/shadcn-ui/SKILL.md` — Dialog primitive usage for Templates picker.

### External docs (for the planner / researcher)
- WhatsApp Cloud API v23 template message reference — needed for variable interpolation in the picker preview.
- Meta `hello_world` template spec — confirm component shape for the seeded approved row.
- Better-auth after-signin hook reference — for D-07 allowlist enforcement.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- **`AppLayout.tsx` short-circuit pattern** — `BARE_ROUTES` set (line 79) and `isStandardLayoutPath()` (line 88) demonstrate the conditional-wrap approach D-01 extends.
- **`gymos.tsx` layout shell** — already a clean 29-line `<div><GymosTopNav /><Outlet /></div>`; no email residue inside this file.
- **`GymosTopNav.tsx`** — gym tab strip already exists with Inbox / Schedule / Members / Payments / Settings; adding Analytics is a one-line append between Payments and Settings.
- **`gymos._index.tsx` reply Form (line 519)** — already wires `enqueueOutboundWhatsApp` + status='queued' optimistic insert + `failedCopy(errorCode)` mapping. Templates button slots into this same Form's button row.
- **Window-state + opt-in badges already rendered** — list-row badges (line 408) and thread-header badges (line 457) tell coaches in-window vs out-of-window per conversation. Templates dialog should respect the same data.
- **shadcn `Dialog`** (`app/components/ui/dialog.tsx`) + `AlertDialog` + `Form` primitives already installed.
- **Better-auth Google OAuth** — `apps/staff-web/server/lib/google-auth.ts` already narrowed scopes per quick task `260524-r8f` (commit `8351022e`); no further wiring needed for D-06.
- **`$view.tsx` redirect stub** — `260524-r8f` already redirects any leftover email URL to `/gymos`; pattern reusable for D-02 root redirect.
- **AgentSidebar suggestions already gym-flavored** — `AppLayout.tsx:142-146` hardcodes "Provide renewal numbers" / "Which classes haven't been filled in the last week?" / "Which customers should I reach out to?" — these are the prompts D-09's actions must answer end-to-end.

### Established patterns
- **`defineAction`** (per `AGENTS.md` §The Six Rules #3) — all new gym actions land in `apps/staff-web/actions/`; auto-mounted at `/_agent-native/actions/<name>`; the same definition serves the agent (as a tool) and the frontend (as an HTTP endpoint).
- **`accessFilter` / `assertAccess`** for ownable resources (per CLAUDE.md "No unscoped queries on ownable resources — ever") — gym actions reading members / bookings / passes must honor this.
- **Optimistic UI** (per AGENTS.md "Optimistic UI by default") — Templates send uses the same optimistic-insert pattern as the existing `Send` (already implemented at `gymos._index.tsx:299`).
- **No browser dialogs** (per AGENTS.md) — Templates picker uses shadcn `<Dialog>`, NOT `window.confirm`.
- **Tabler icons** (per AGENTS.md) — Templates button gets a Tabler icon (e.g., `IconMessage2Plus` or `IconTemplate`), never an emoji.

### Integration points
- **AppLayout.tsx:124** — single conditional return; D-01 adds the gymos branch.
- **root.tsx:270** — AppLayout wraps every route; nothing else needs to change for D-01 to take effect across all `/gymos/*` children.
- **gymos._index.tsx loader** — already fans out window-state + opt-in + conversations; Templates picker reads the SAME loader data (no new API needed for picker availability gating).
- **packages/queue `enqueueOutboundWhatsApp`** — Templates send uses the existing publisher; payload shape extends from `text` to `template` per packages/whatsapp transport spec.

</code_context>

<specifics>
## Specific Ideas

- **The three hardcoded chip prompts must work end-to-end.** This is non-negotiable per success criterion #5. "Provide renewal numbers", "Which classes haven't been filled in the last week?", "Which customers should I reach out to?" — if any one of these returns a generic-AI-non-answer, the pilot looks unfinished. Plan must verify each one against real seeded data.
- **`hello_world` template as the day-one sendable.** Meta provides this template approved by default for any new WABA. Including it in the seeded set means the customer can demonstrate a real outbound template send on pilot day, even if the 4 named templates haven't cleared Meta approval.
- **`/access-denied` page must be branded GymClassOS, not a 401.** First impression matters — even the wrong-email path should look intentional.
- **The reply Form's secondary button placement matters.** Templates next to Send (right of Send), not above/below. Visual hierarchy: Send dominates (in-window happy path); Templates is a clear secondary affordance for the moments Send is disabled.

</specifics>

<deferred>
## Deferred Ideas

- **Coach/admin role split enforcement** — P1a / AUTH-02 will land Better-auth role middleware; P1b.1 ships single-role "everyone in allowlist sees everything".
- **Real Meta template approvals submitted via API** — P0 / FND-07; P1b.1 seeds the four named templates as pending so the picker shows them but they're un-sendable until approval lands.
- **Email magic-link for staff** — kicked to whichever phase first needs SMTP (P1a / MEMAUTH-02 wires it for members; staff inherits).
- **Per-org or per-studio allowlist via DB table** — replace env allowlist when P1a's multi-tenant deploy machinery lands.
- **Agent-driven booking mutations** (`book-member`, `cancel-booking`, `message-member`) — P2 / AGENT-04..09; P1b.1 is read-only for the agent.
- **Date-range picker on `/gymos/analytics`** — defer to P2 when the dashboard is more than three hardcoded SQL aggregations.
- **Cross-route AgentSidebar suggestions** (different chip prompts per page) — flagged as Claude's Discretion above but realistically a P2 polish item.
- **Mail dogfooding in this deploy** — agent-chat surface goes gym-only with D-08; if we want a mail agent for our own use, spin up a separate non-prod deploy.

</deferred>

---

*Phase: P1b.1-customer-pilot-enablement*
*Context gathered: 2026-05-25*
