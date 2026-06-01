# Phase P1c: Public Site Integrations - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning
**Source:** Plan-time decisions (4 key decisions answered inline 2026-06-01)

<domain>
## Phase Boundary

Productize the pilot for **visitors** — people who land on the studio's marketing
site (`doyouhustle.co.uk`) but haven't signed into anything. P1c replaces the
studio's GoHighLevel-on-site footprint, which today does exactly two jobs:

1. **Lead-capture forms** — fork agent-native's `templates/forms/` so the studio
   can build lead-capture / trial-signup / contact / membership-inquiry forms in
   the staff back-office, embed them on `doyouhustle.co.uk` with a `<script>`
   snippet, and have submissions land in Neon as `status='lead'` conversations
   that surface in `/gymos` (the inbox + the new WhatsApp campaign tooling can
   then follow up).

2. **Public schedule + lead-to-booking** — a public, themeable `/embed/schedule`
   widget that displays the live class schedule to anonymous visitors. **Booking
   and payment are NOT fully self-serve/anonymous** (see Decision 2). The public
   widget is browse + "enquire / request to book", which creates a lead. The
   actual booking + payment completes through a Stripe **hosted Checkout** link
   sent to the now-known, staff-contacted lead.

**Out of scope for P1c:** fully anonymous stranger-picks-slot-and-pays-instantly
self-serve checkout (the roadmap's original P1c-04 framing). That reverses to a
lead-funnel model per Decision 2.

</domain>

<decisions>
## Implementation Decisions

### Forms app location — LOCKED
- Fork `templates/forms/` **co-located inside staff-web**:
  `apps/staff-web/features/forms/` (NOT a standalone `apps/forms/` deployable).
- Rationale: forms editor lives behind the same staff login; public form pages
  served from the same Vercel app; no 4th deployable to provision/auth. Fastest
  path for solo dev on the aggressive timeline.
- Follow the same fork-boundary discipline used for the rest of `apps/staff-web/`
  (copy out of `templates/forms/`, leave the upstream template untouched for
  future BuilderIO/agent-native merges).

### Booking auth model — LOCKED (lead funnel, NOT anonymous self-serve)
- **The public form is for LEADS.** Journey: visitor submits form → lead lands in
  `/gymos` as a `status='lead'` conversation → staff contacts them (WhatsApp) →
  booking + payment completes via a Stripe hosted Checkout link sent to the
  now-known lead.
- **No fully-anonymous instant book-and-pay widget.** The public `/embed/schedule`
  surface is read-only browse + an "enquire / request to book" CTA that creates a
  lead — it does not let a stranger reserve a seat and pay without ever talking to
  the studio.
- Public POST endpoints (form submission, enquiry) must still be hardened against
  bots: rate-limit + lightweight bot protection. No email-verification gate in
  front of the lead form (that friction would hurt marketing-site conversion).

### Theming / brand fit — LOCKED
- **URL-param theming only** for the embed: `?accent=#000&radius=8` (and similar).
- Enough to roughly match the Hustle brand for the pilot. Full CSS-variable token
  injection is deferred (not P1c).

### Stripe approach — LOCKED
- **Hosted Checkout** (redirect to Stripe-hosted page), NOT embedded Payment
  Element.
- Reuses the P1b-07 Stripe webhook reducer directly for Checkout→pass binding.
  PCI-safest, fastest to ship, safe default for the pilot.
- Checkout link is sent to a contacted lead (per Decision 2), not surfaced to an
  anonymous visitor mid-browse.

### Forms embed mechanism — LOCKED
- The upstream template only ships an iframe / hosted `/f/:slug` page. P1c must add
  a real `<script>` snippet so the studio can drop the form (and the schedule
  widget) onto `doyouhustle.co.uk` with one line.
- `postMessage` for cross-origin callbacks (e.g. `lead:submitted`,
  `enquiry:created`) so the host site can react (analytics, redirect, thank-you).

### Claude's Discretion
- Whether leads surface as a sibling `/gymos/leads` tab vs inline in `/gymos` with
  a `status='lead'` filter — planner/UI decides, favouring the cleaner inbox.
- Exact bot-protection mechanism (rate-limit only vs + lightweight CAPTCHA).
- Server-render vs CSR split for the public `/embed/schedule` route (SEO favours
  SSR for the schedule display per CLAUDE.md public-page rule).
- Atomic capacity handling: if any seat reservation happens at all in P1c, it must
  honour PITFALL #3 (atomic capacity) — but with the lead-funnel model, the
  binding booking happens on Checkout success via the P1b-07 reducer
  (PITFALL #4 pass-balance race in scope there).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` — Phase P1c section (scope sketch P1c-01..06, risks)
- `.planning/REQUIREMENTS.md` — new FORMS-01..04 + EMBED-01..06 to be added here
- `.planning/STATE.md` — current deploy state, P1c handoff notes (Session Continuity §3)

### Upstream template to fork
- `templates/forms/` — the agent-native forms template being copied into
  `apps/staff-web/features/forms/` (study its schema, builder UI, submission flow)

### Existing staff-web patterns to mirror
- `apps/staff-web/server/db/schema.ts` — extend here (NOT templates/mail) with any
  forms/lead tables; additive-only per CLAUDE.md no-breaking-DB-changes rule
- `apps/staff-web/server/plugins/auth.ts` — `publicPaths` for the public
  `/embed/*`, `/f/:slug`, and form-submission POST routes
- `apps/staff-web/app/routes/gymos._index.tsx` — inbox; leads surface here
- `apps/staff-web/actions/` — `defineAction` pattern for the public submission action

### Webhook spine already shipped (depended on)
- Stripe webhook reducer (P1b-07) — `services/worker/` Stripe-event handler;
  Checkout→pass binding + PITFALL #4 idempotency
- `sendMessage` chokepoint (P1b-06) — `services/worker/src/domain/sendMessage.ts`;
  booking/lead confirmation WhatsApp routes through it (opt-in → window → template)

### Pitfalls in scope
- `.planning/research/PITFALLS.md` — #3 (atomic class capacity), #4 (pass-balance
  race on the Checkout reducer)

</canonical_refs>

<specifics>
## Specific Ideas

- Target marketing site: `doyouhustle.co.uk` (studio currently runs GoHighLevel there).
- Staff-web is live at `gym-class-os.vercel.app` (auto-deploys from `master`); the
  embed `<script src="https://gym-class-os.vercel.app/embed.js">` is served from there.
- Neon project: `gymos-demo` (id `billowing-sun-51091059`).
- Lead form submission must upsert `gym_members` keyed by email/phone and open a
  `conversations` row in `status='lead'` so it lands in the inbox + is reachable by
  the missed-session / campaign WhatsApp tooling already shipped (260531-n7i).

</specifics>

<deferred>
## Deferred Ideas

- Fully anonymous self-serve book-and-pay widget (stranger picks slot + pays with
  no studio contact) — reframed to lead funnel for P1c; revisit post-pilot if the
  studio wants instant self-serve.
- Full CSS-variable theme-token injection for the embed — URL params only in P1c.
- Embedded Stripe Payment Element (in-widget card form) — hosted Checkout in P1c.
- Email-verification gate before lead submission — not used (conversion friction).

</deferred>

---

*Phase: P1c-public-site-integrations*
*Context gathered: 2026-06-01 via plan-time decisions*
