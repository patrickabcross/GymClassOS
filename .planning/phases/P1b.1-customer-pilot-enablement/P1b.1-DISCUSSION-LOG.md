# Phase P1b.1: Customer Pilot Enablement — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** P1b.1-customer-pilot-enablement
**Areas discussed:** Email-chrome strip strategy, Templates UX + source-of-truth, Customer auth provisioning, Agent grounding + gym actions

---

## Email-chrome strip strategy

### Q1: How aggressively should `/gymos/*` short-circuit AppLayout?

| Option | Description | Selected |
|--------|-------------|----------|
| AgentSidebar-only wrapper (recommended) | Add `isGymosPath()` to AppLayout.tsx alongside BARE_ROUTES/isStandardLayoutPath. /gymos/* skips AppLayoutInner + StandardLayout but still wraps in <AgentSidebar> so the right-rail Chat survives. gymos.tsx keeps GymosTopNav + Outlet. Minimal diff, preserves Chat per scope item 5. | ✓ |
| Full BARE_ROUTES (no AgentSidebar) | Add /gymos to BARE_ROUTES set at AppLayout.tsx:79. Cleaner code but kills the right-rail Chat — would need to re-mount AgentSidebar inside gymos.tsx manually. Worse trade because AgentSidebar imports from @agent-native/core/client and expects to live high in the tree. | |
| Hide email bits in-place | Leave AppLayout structure; conditionally hide hamburger/tabs/Compose/refresh/bell when pathname starts with /gymos. Smallest diff but leaves dead code paths + email state (use-emails hooks, Google account popover) loaded for every gymos page — wasteful + fragile. | |

**User's choice:** AgentSidebar-only wrapper (recommended)
**Notes:** Right-rail Chat survival is non-negotiable (success criterion #5 depends on it).

### Q2: When the customer signs in at the root URL, where should they land?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-redirect / and all email URLs to /gymos (recommended) | Extends the pattern from quick task 260524-r8f that already redirects $view.tsx + $view.$threadId.tsx → /gymos. Add an / → /gymos redirect in _index.tsx. Customer cannot accidentally land on /inbox or any email surface. Mail UI still reachable by typing the URL (kept for our dev work), just not by accident. | ✓ |
| Soft default / → /gymos but keep email reachable in nav | Root redirect to /gymos, but leave /inbox accessible via a hidden link or admin toggle so we can still dogfood Mail in the same deploy. More flexible but adds chrome the customer shouldn't see. | |
| Per-user role gate | Better-auth role split (admin sees both, coach sees gymos-only). Cleanest in theory, but P1a defines admin/coach role enforcement — doing it here pulls P1a forward. Defer the role split to P1a; in P1b.1 just redirect everyone to /gymos. | |

**User's choice:** Hard-redirect / and all email URLs to /gymos (recommended)
**Notes:** Mail URLs stay reachable by typing them (developer escape hatch); customer just never sees a link.

---

## Templates UX + source-of-truth

### Q3: Where do approved WhatsApp templates come from in P1b.1, given P0 Meta approvals (~48h) may not be done yet?

| Option | Description | Selected |
|--------|-------------|----------|
| Pull P0 template submission forward + use Meta as source | Submit the 4 named templates (class_reminder, waitlist_offer, payment_failed, pass_expiring) to Meta NOW as part of P1b.1. WA-08's daily sync cron (still pending in P1b-09) becomes the only writer to whatsapp_templates. Customer can use real approved templates from day one. Blocks pilot start on ~48h Meta approval window. | |
| Seed fixtures + hello_world bridge (recommended) | Seed whatsapp_templates with the 4 named templates marked status='pending' (un-sendable) PLUS Meta's pre-approved hello_world template marked status='approved' so the Templates button actually works on day one. WA-08 sync (P1b-09) replaces seeded rows when real approvals land. Customer gets working UI immediately; real templates roll in async. | ✓ |
| Seed fixtures only, all marked approved (demo-grade) | Seed all 4 templates as status='approved' in the DB. Worker chokepoint's template-approved gate passes, but the actual Meta send will 4xx because Meta doesn't know about them. Failed-bubble copy (D-19) shows TEMPLATE_NOT_APPROVED. Bad customer-facing UX; do not pick. | |

**User's choice:** Seed fixtures + hello_world bridge (recommended)
**Notes:** hello_world is Meta's default-approved template for any new WABA — guarantees at least one sendable template on pilot day.

### Q4: What shape should the Templates picker take?

| Option | Description | Selected |
|--------|-------------|----------|
| Single Dialog: list left, variable form + preview right (recommended) | Coach clicks Templates → shadcn <Dialog> opens with template list on the left (filtered to status='approved'); selecting a template renders its variable inputs + a live body preview with substitutions on the right; Send button at bottom enqueues. One screen, fewest clicks, preview shows what the member will receive. | ✓ |
| Two-step Dialog: pick template, then fill variables | Dialog step 1 = list of approved templates; click → step 2 swaps to variable form + preview + Send. Cleaner on mobile, but coach is on desktop and the extra click is friction. | |
| Inline panel inside thread (no Dialog) | Replace the reply Input with a collapsible Templates panel when out-of-window. More space for previews but bloats thread chrome and competes with the reply form's vertical real estate. | |

**User's choice:** Single Dialog: list left, variable form + preview right (recommended)

### Q5: When IS the Templates button shown / how does it relate to the existing free-text Send?

| Option | Description | Selected |
|--------|-------------|----------|
| Replace Compose with Templates on /gymos; coexist with Send (recommended) | Rename the top-bar Compose button (currently rendered by AppLayout at line 1140 but gone once AppLayout is stripped) to be removed entirely — it lives in mail chrome. Add 'Templates' as a SECONDARY button next to Send in gymos._index.tsx:543. Free-text Send stays the primary in-window action; Templates handles out-of-window + proactive sends. Both routes through the same worker chokepoint. | ✓ |
| Templates is the only send button; free-text disappears | Cut the free-text Send form entirely; everything goes through Templates. Massive scope creep: breaks in-window WhatsApp conversations (free-text within 24h is the whole point). Do not pick. | |
| Templates button on top-nav, not per-thread | Surface Templates in GymosTopNav as a global send-template action. Disconnects the action from the conversation context (which member? which thread?); makes the variable form harder. | |

**User's choice:** Replace Compose with Templates on /gymos; coexist with Send (recommended)
**Notes:** Per-thread placement preserves member/conversation context; both buttons route through the same worker chokepoint per P1b D-09/-10/-11.

---

## Customer auth provisioning

### Q6: How does the studio coach/owner log in on day one?

| Option | Description | Selected |
|--------|-------------|----------|
| Google OAuth, customer brings their Workspace/Gmail (recommended) | Better-auth's Google OAuth is already wired (just narrowed to profile+email in 260524-r8f). Customer signs in with their existing email — zero account-management on our side, zero SMTP setup, no password rotation. We seed a Better-auth 'user' row with their email so first sign-in associates correctly; if they need to invite their coach we add it manually pre-pilot. Pulls in nothing from P1a. | ✓ |
| Email/password seeded by us | Flip Better-auth googleOnly:false, seed user rows with bcrypt-hashed passwords, hand over via 1Password. Adds password storage + reset surface (no email transport = no reset flow). Means we own credential rotation. | |
| Email magic-link | Requires SMTP wiring (Resend or Postmark API key + Better-auth email transport config). Smoothest UX but adds a new vendor + secrets to manage + email deliverability risk. P1a defines MEMAUTH-02 magic-link for members — doing it here pulls staff-magic-link infrastructure forward. | |

**User's choice:** Google OAuth, customer brings their Workspace/Gmail (recommended)
**Notes:** Zero new infrastructure; reuses the narrowed-scope Google OAuth already shipped in 260524-r8f.

### Q7: How are coach accounts authorized to access this gymos-demo deploy?

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded allowlist of customer emails in env (recommended) | Add CUSTOMER_ALLOWED_EMAILS=email1,email2 to apps/staff-web/.env (and Vercel project env). auth.ts after-signin hook checks the signed-in email against the allowlist; mismatch = sign out + redirect to access-denied page. Simplest possible gate for a single-tenant pilot. Replace with proper org-based auth in P1a/AUTH-02. | ✓ |
| Better-auth domain restriction | Restrict sign-in to specific email domains (e.g., @studio-name.com). Cleaner but the customer's email may be a personal Gmail, not a domain email. Doesn't fit a 1-user pilot. | |
| Open sign-in, no allowlist | Anyone with a Google account can sign in. Fine for D0 demo (already deployed this way) but unsafe to hand to a real customer when the same deploy holds gym data. Do not pick. | |

**User's choice:** Hardcoded allowlist of customer emails in env (recommended)

---

## Agent grounding + gym actions

### Q8: How should the agent's system prompt + tool registry be wired for /gymos?

| Option | Description | Selected |
|--------|-------------|----------|
| Replace entirely — new agent-chat plugin with gym systemPrompt + gym actions only (recommended) | Write a new apps/staff-web/server/plugins/agent-chat-gymos.ts (or refactor the existing one) with a gym systemPrompt + actions filtered to gym actions only. Mail surface is being phased out for the customer; keeping mail actions adds hallucination risk (agent might offer to 'archive an email' to a gym coach). Cleanest, but means mail dogfooding in this deploy loses its agent. | ✓ |
| Route-aware — one plugin, branch on URL | Keep agent-chat.ts as the single plugin; inside, detect the user's current pathname (via application_state navigation key) and swap systemPrompt + filtered action set per route. Preserves mail agent for dev; adds branching complexity inside the plugin. | |
| Layered — mail prompt + gym preamble, all actions exposed | Prepend gym preamble + add gym actions to existing registry. Agent has to choose which surface to use. Highest hallucination risk; rejected pattern in agent-native (one app = one agent surface). | |

**User's choice:** Replace entirely — new agent-chat plugin with gym systemPrompt + gym actions only (recommended)
**Notes:** Mail dogfooding in this deploy loses its agent — acceptable trade for pilot.

### Q9: What's the MINIMUM set of gym actions that must exist in P1b.1 (vs. punted to P2)?

| Option | Description | Selected |
|--------|-------------|----------|
| Just the 3 suggestion prompts can be answered (recommended) | Cover ONLY the 3 hardcoded chip prompts end-to-end: (1) renewal numbers → list-renewals action over stripe_subscriptions + pass expiry, (2) unfilled classes → list-fill-rate action over occurrences + bookings, (3) reach-out candidates → list-at-risk-members action over no-show count + last-attended. Plus shared read actions: list-classes, list-members, view-screen, navigate. Skip CRM-level features (segments, campaigns, manual notes) — those are P2. | ✓ |
| Full action surface per phase scope | Add everything: list-classes, list-bookings, list-cancellations, member-retention PLUS the 3 suggestion data sources PLUS create/edit/cancel actions. Most complete but doubles the scope; planner is likely to bump tasks out anyway. | |
| Read-only initial set, no agent-driven mutations | Cover the 3 suggestion prompts + general reads (list-classes, list-members, list-bookings) but the agent has NO write actions (no book-member, no cancel-booking). Customer pilot is observability + WhatsApp; mutations only via UI. Lower risk of agent making bad changes pre-P2. | |

**User's choice:** Just the 3 suggestion prompts can be answered (recommended)
**Notes:** Read-only is implicit in the chosen option — no mutations land in P1b.1.

### Q10: Where does the gymos AGENTS.md live (the doc the agent reads at conversation start)?

| Option | Description | Selected |
|--------|-------------|----------|
| Replace apps/staff-web/AGENTS.md entirely (recommended) | Overwrite the 600-line mail AGENTS.md with a fresh gym version. Mail agent goes away in this deploy; pilot deploy is now a gym product. apps/staff-web/CLAUDE.md still @-includes AGENTS.md so Claude Code dev work also sees the gym instructions. Keep the upstream mail AGENTS.md in templates/mail/ for fork merges. | ✓ |
| Layer: keep mail AGENTS.md, add gymos-AGENTS.md alongside, plugin picks | Two AGENTS.md files; the new gym agent-chat plugin reads gymos-AGENTS.md, the old mail plugin reads the existing one. More complex but preserves both surfaces. Only valuable if you want to keep mail dogfooding. | |
| Inline the prompt in agent-chat-gymos.ts, no AGENTS.md | Hardcode the systemPrompt string in the plugin file. Less discoverable for both Claude Code and the runtime agent; loses the AGENTS.md 'single source of truth' pattern from the framework. | |

**User's choice:** Replace apps/staff-web/AGENTS.md entirely (recommended)
**Notes:** templates/mail/AGENTS.md stays upstream-clean for fork merges.

---

## Claude's Discretion (deferred to plan-phase)

- Exact analytics metric list (phase scope already says "finalised at plan time"): pick ≥3 of fill rate / cancellation rate / no-show rate / pass utilisation.
- Better-auth user-row pre-seed vs auto-create on first sign-in.
- AgentSidebar suggestions per route (currently hardcoded; planner can leave as-is).
- Whether to extract a `<GymosLayout>` wrapper component vs inlining AgentSidebar wrap in AppLayout.tsx.
- `list-renewals` data source split (stripe_subscriptions only vs + member_passes expiry).

## Deferred Ideas

- Coach/admin role split → P1a / AUTH-02.
- Real Meta template approvals via API → P0 / FND-07.
- Email magic-link / SMTP → P1a / MEMAUTH-02.
- Per-org or per-studio allowlist via DB table → P1a multi-tenant.
- Agent-driven booking mutations → P2 / AGENT-04..09.
- Date-range picker on /gymos/analytics → P2.
- Cross-route AgentSidebar suggestions → P2 polish.
- Mail dogfooding in this deploy → separate non-prod deploy.
