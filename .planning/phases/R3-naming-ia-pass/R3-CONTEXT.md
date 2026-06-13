# Phase R3: Naming & IA Pass - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning
**Mode:** Autonomous (decisions made by Claude under standing user authorization; UAT deferred to post-completion)

<domain>
## Phase Boundary

Replace email-client vocabulary (inherited from the agent-native Mail template fork) with gym-domain language across **staff-web user-visible surfaces**, then retire email-vocabulary **code identifiers and routes** (with redirect shims). Ordering is enforced: label layer first, then CSS class renames, then identifier + route renames.

**In scope (staff-web only):**
- Label layer (NAME-01, NAME-02, NAME-06, NAME-07): nav labels, headings, button text, page titles, link text.
- CSS class renames (`.email-*` → gym-domain), additive-alias-then-migrate per pitfall R-12.
- Identifier renames (component/file/function names, e.g. `InboxPage.tsx` → `MessagesPage.tsx`) — zero user impact.
- Route renames (`/gymos/inbox` → `/gymos/messages`, legacy `/draft-queue`, `$view`) — each with a `redirect()` shim so the live customer's deep links never 404.

**Out of scope:**
- **Mobile tab naming (MOBL-02)** — the R1 naming record tags mobile tab renames (Classes / Log / Passes) as **R5**, not R3. R3 is staff-web only.
- DB enum string values + schema column names — **NAME-05: do not touch** (drizzle-kit#1409 + live Hustle DB table-lock risk). Inventory-only; display labels only.
- Visual redesign (R4) — R3 changes copy/identifiers/routes, not layout/styling.
- The Analytics nav item disposition — the naming record defers its removal to R4; R3 leaves it in place.

</domain>

<decisions>
## Implementation Decisions

### Vocabulary targets (from roadmap R3 success criteria + R1 NAMING-RECORD.md)
- **D-01:** Staff nav reads exactly: `Schedule | Messages | Members | Payments | Settings` with studio identity (from R2 skin) at top. "Home", "Campaigns", "Forms" stay (already gym-domain / neutral); "Inbox" → "Messages". No "Inbox", "Compose", or "Draft Queue" visible anywhere.
- **D-02:** Messaging surface: heading → "Messages"; threads labeled "Conversations"; send/compose button → "New Message". Zero email vocabulary visible.
- **D-03:** Booking CTA: "Book" is the single primary booking CTA on class surfaces — no "Reserve"/"Enrol"/"Register". Exception: the **lead-capture embed keeps "Enquire"/"Send Enquiry"** (it's enquiry, not a confirmed booking — WDGT-02 validates "Enquiry" UK vocabulary; "Book" applies only to confirmed-booking surfaces).
- **D-04:** Member detail view headed "Member Profile"; pass balance displays as "X credits" (label "Pass Balance: X credits" where the balance surfaces).

### Layer ordering (pitfall-enforced — drives wave structure)
- **D-05:** Three sub-passes, sequenced: (A) **label layer** (NAME-01/02/06/07) → (B) **CSS class renames** (R-12 additive-alias-then-migrate) → (C) **identifier + route renames with redirect shims** (NAME-03/04). Labels are self-contained and lowest-risk; identifier/route renames come last. On the live deploy the roadmap wants labels verified before routes flip — here (branch-isolated, no deploy) this is encoded as wave ordering so the diff stays legible, and the redirect shims make the route flip safe regardless of verification timing.

### Route renames + shims (NAME-03)
- **D-06:** `/gymos/inbox` → `/gymos/messages`. Add `loader = () => redirect('/gymos/messages', 301)` to the OLD route module BEFORE renaming the file to `gymos.messages.tsx`; update ALL hardcoded refs (GymosTopNav, internal `<Link>`/`navigate`/`redirect` refs listed in NAMING-RECORD §Route Layer) atomically in the same commit. Query params (`?filter=leads`, `?conversation=...`) must survive the redirect (verify the RR v7 redirect preserves the query string).
- **D-07:** Legacy `/draft-queue` + `/draft-queue/:id` (mail-template legacy) and `/inbox`/`$view` legacy refs: point/redirect to `/gymos/messages`. The existing `$view.tsx` already redirects legacy mail routes to `/gymos`; update remaining hardcoded refs for clarity and add shims where a path is renamed. Do not 404 any previously-reachable path.
- **D-08:** Redirect shims STAY in place (not removed in R3) — the roadmap forbids removing old routes before live-deploy verification, which happens in tomorrow's UAT. R3 leaves both old (shim) and new routes working.

### Constraints
- **D-09:** NAME-05 standing constraint: no DB enum/column renames. Any DB-adjacent identifier is inventoried as "do not touch."
- **D-10:** No local dev server (NitroViteError) — verification is grep/static + deferred deploy UAT. No plan step assumes a local HTTP walkthrough.
- **D-11:** Fork boundary holds: `templates/*` and `packages-vendored/*` never edited. All work in `apps/staff-web/`.

### Claude's Discretion
- Exact CSS alias names (`.email-list-row` → `.conversation-row` etc. per NAMING-RECORD §CSS Layer).
- Whether `/draft-queue` is renamed to `/gymos/scheduled` or simply shimmed-and-hidden (pick the lower-risk option given the surface isn't in the coach daily path).
- Commit granularity within each wave.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary source of truth
- `.planning/phases/R1-audit-baseline/NAMING-RECORD.md` — **THE inventory.** Four per-layer tables (Label / CSS / Identifier / Route) with exact file paths + line refs + proposed target + risk note, pre-tagged by phase (R3 vs R4 vs R5). Every R3 rename is an item here. The Route Layer table (§ from line 117) lists every hardcoded URL ref that must update atomically + the redirect-shim approach.

### Research
- `.planning/research/PITFALLS.md` — **R-06** (route inventory; redirect shim required before old route removed), **R-12** (email-* CSS class orphaning — additive alias, migrate usage, then drop). Both are R3-critical.
- `.planning/research/FEATURES.md` — Naming Recommendations Table + Competitor Vocabulary Map (source of the gym-domain target terms).

### Planning
- `.planning/REQUIREMENTS.md` — NAME-01..07 definitions.
- `.planning/ROADMAP.md` — Phase R3 success criteria (the 6 TRUE-conditions) + the "Internal ordering constraint" note (labels before identifiers/routes; NAME-05 standing).
- `.planning/STATE.md` — no-local-dev-server constraint; live-customer-on-deploy constraint (route renames need shims before old routes removed).

### Prior phase
- `.planning/phases/R2-design-system-token-layer/R2-CONTEXT.md` — R2 set studio identity in GymosTopNav (R3 keeps that; just renames the "Inbox" label to "Messages" alongside it).

</canonical_refs>

<code_context>
## Existing Code Insights

### Key files (from NAMING-RECORD.md line refs)
- `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — nav labels (line ~60 "Inbox" → "Messages"); R2 already made it skin-aware.
- `apps/staff-web/app/routes/gymos.inbox.tsx` — heading "WhatsApp Inbox" (~653), tab chips (~677/680), `meta()` title (~64), internal `<Link>`/redirect refs; becomes `gymos.messages.tsx`.
- `apps/staff-web/app/pages/InboxPage.tsx` → `MessagesPage.tsx` (identifier rename + all import sites).
- `apps/staff-web/app/routes/gymos.members.tsx:175`, `gymos.payments.tsx:52` — "← Back to inbox" link text + `to` prop.
- `apps/staff-web/app/components/layout/{AppLayout,CommandPalette,SearchBar}.tsx`, `app/pages/NotFound.tsx` — hardcoded `/inbox` refs → `/gymos/messages`.
- `apps/staff-web/app/global.css` — `.email-list-row` and related classes (lines ~77,144,149,154,...) → `.conversation-row` (additive alias first, then migrate `EmailListItem.tsx`).
- `apps/staff-web/app/pages/DraftQueuePage.tsx`, `$view.tsx` — legacy mail routes/shims.

### Integration points
- RR v7 route modules: `redirect(path, 301)` from a loader is the shim mechanism (loaders return plain objects / Response; no `json()`).
- `gymos.tsx` parent layout renders `GymosTopNav` + `<Outlet/>` — nav label change lands there.

### Constraints in force
- No local dev server — grep-verify renames + zero-email-vocabulary; deploy UAT confirms redirects.
- NAME-05: DB untouched. Fork boundary: staff-web only.

</code_context>

<specifics>
## Specific Ideas
- The single most-watched UAT item tomorrow: navigating an OLD route (e.g. `/gymos/inbox`, `/draft-queue`) on the deploy must redirect (301) to the new path, NOT 404 — the live customer Hustle uses `/gymos/inbox` daily.
- "Messages" is the chosen term for the inbox surface (heading + nav + route), per roadmap SC.
- Keep both old (shim) and new routes live through R3; old-route removal is a later, post-verification step.
</specifics>

<deferred>
## Deferred Ideas
- Mobile tab renames (Classes / Log / Passes) — R5 (MOBL-02), per NAMING-RECORD tagging.
- Analytics nav item removal/replacement — R4 (SWEB).
- Removal of redirect shims (old routes) — after live-deploy verification, post-R3.
- Pass-balance widget styling ("Pass Balance: X credits" card) — R4 surface work; R3 only sets the label text.
</deferred>

---

*Phase: R3-naming-ia-pass*
*Context gathered: 2026-06-13 (autonomous)*
