# Phase R1: Audit Baseline - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Documentation-only phase. Two deliverables:

1. **Before-state screenshots** of every deployed surface (staff web, embed widgets, member mobile app) committed to `.planning/ui-reviews/baseline/`, captured so they can be meaningfully compared against post-redesign captures.
2. **Naming decision record** — a complete inventory of every email-vocabulary UI label, code identifier, CSS class, and route, each classified by rename layer (label / CSS / identifier / route) with a proposed gym-domain target, comprehensive enough that R3 (and R5 for mobile naming) can be planned without re-auditing the codebase.

No code changes to app surfaces. The only code artifact produced is the reusable capture script (tooling, not product code).

</domain>

<decisions>
## Implementation Decisions

### Screenshot tooling & viewports
- **D-01:** Capture via a **committed Playwright script** run locally against the live Vercel deploy (`gym-class-os.vercel.app`). This is the standing verification tool pitfall R-11 calls for — the same script re-runs for after-state captures in R2–R4.
- **D-02:** Two web viewports: **1440px (desktop) and 390px (mobile width)**. The mobile-width baseline is required to prove SWEB-06 (responsive Messages) improved in R4.
- **D-03:** Auth via **saved Playwright `storageState`** — log in once manually through Google OAuth in a Playwright-launched browser, persist session cookies to a **gitignored** `storageState.json`, script reuses it. No code/config changes to the live app for auth.
- **D-04:** Embed widgets captured on **both light and dark host test pages** — matching WDGT-03's exact verification setup so R4 reuses the same harness.

### Surface coverage scope
- **D-05:** Staff-web coverage = **all user-facing routes including still-routable legacy email routes** (`/draft-queue`, `/draft-queue/:id`, `/settings`, `$view` inbox surfaces, `/team`), **explicitly excluding `/email`** (user decision). API routes (`api.m.*`) and webhook routes are excluded (nothing to screenshot).
- **D-06:** Capture **pages plus a named list of key interaction states**: member context panel open in a conversation (SWEB-03 redesign target), Templates dialog, schedule booking dialog, member detail view. These are R4's primary redesign surfaces and need before-states.
- **D-07:** Mobile screenshots are **captured by the user on a real phone via Expo Go** against the live API. Claude's deliverable is a checklist of screens with exact target filenames; the user captures and drops files in. Real-device rendering chosen per research (simulator styling differs subtly).
- **D-08:** Mobile scope = **all screens + agent sheet**: 4 tabs (Home, Schedule, Food, Profile) + member picker + food-add search + food-barcode scanner + agent chat sheet open.

### Naming decision record
- **D-09:** Depth = **inventory + propose target names now**. Each found item maps to its gym-domain target. Targets largely pre-decided by NAME-01..07 and the FEATURES.md Naming Recommendations Table — the record applies them item-by-item so R3 is mechanically executable.
- **D-10:** Format = **single markdown document with one table per rename layer** (label / CSS class / code identifier / route). Greppable, PR-reviewable, directly readable by downstream agents.
- **D-11:** Per-item fields = **full provenance**: current name | file path(s) + line refs | proposed target | rename layer | risk note (e.g. "route — needs redirect shim per R-06", "CSS — orphaning risk per R-12", "DB-adjacent — NAME-05, do not touch").
- **D-12:** Record scope = **all three surfaces**: staff-web email vocabulary + mobile tab names (MOBL-02) + widget vocabulary (Book CTA per NAME-06, Enquiry per WDGT-02). One record feeds R3, R4, and R5.

### Baseline diffability
- **D-13:** Organization = **per-surface folders**: `baseline/staff-web/`, `baseline/embeds/`, `baseline/mobile/`, with route-derived filenames carrying viewport + state suffixes (e.g. `gymos-schedule.desktop.png`, `gymos-inbox.mobile.context-panel.png`). After-state runs mirror the same tree.
- **D-14:** An **INDEX.md manifest** accompanies the screenshots: every capture listed with route/screen, viewport, state, capture date, and the deployed commit SHA. After-state runs check coverage parity against it.
- **D-15:** Capture script lives in **`scripts/ui-baseline/`** in the repo, parameterized by output directory so the same script produces `baseline/` now and after-captures later.
- **D-16:** Baseline is built for **side-by-side human review**, not pixel-diff tooling. The redesign intentionally changes everything, so pixel-diffing would flag 100% of pixels; consistent viewports + mirrored filenames are what make manual comparison meaningful.

### Claude's Discretion
- Exact Playwright config details (wait strategies, animation settling, full-page vs viewport capture)
- Exact set of legacy `$view` route variants worth capturing (capture what's reachable; skip duplicates)
- Structure/section ordering of the naming decision record beyond the per-layer tables
- The embed test page implementation (static HTML file per STATE.md verification method)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.1 research (current — written for this milestone)
- `.planning/research/PITFALLS.md` — v1.1 redesign pitfalls. R1-critical: **R-11** (Playwright-against-deploy workflow must exist before any redesign change), **R-06** (route inventory incl. hardcoded navigate/Link refs — lists known-risky routes), **R-12** (email-* CSS class orphaning — defines the CSS layer of the naming record)
- `.planning/research/FEATURES.md` — **Naming Recommendations Table** (§ Naming Recommendations Table) + Competitor Vocabulary Map — the source of proposed target names for D-09
- `.planning/research/STACK.md` — v1.1 theming-layer stack research (context for what R2 consumes from the audit)

### Prior UI artifacts (R1 formalises these)
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-REVIEW.md` — existing partial 6-pillar UI review; R1's audit completes and formalises it
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md` — existing partial UI spec; audit findings inform the R2–R4 specs

### Project planning
- `.planning/REQUIREMENTS.md` — AUDT-01, AUDT-02 (R1's requirements); NAME-01..07, MOBL-02, WDGT-02 (the pre-decided naming targets the record applies)
- `.planning/ROADMAP.md` — Phase R1 success criteria + key constraints section
- `.planning/STATE.md` — §"PICK UP HERE" verification method for R1 (live Vercel capture, static iframe test page, Expo Go on phone)

### Stale — do not treat as current
- `.planning/research/SUMMARY.md` and `.planning/research/ARCHITECTURE.md` are **v1.0-era** documents; read only for project background, not v1.1 guidance.

</canonical_refs>

<code_context>
## Existing Code Insights

### Surfaces to audit (from codebase scout)
- **Staff-web routes** (`apps/staff-web/app/routes/` — 34 files): gymos surfaces (`gymos._index`, `gymos.inbox`, `gymos.schedule`, `gymos.members`, `gymos.members_.$id`, `gymos.payments`, `gymos.analytics`, `gymos.campaigns`, `gymos.compose`, `gymos.forms.*`, `gymos.settings.integrations`), legacy email routes (`$view.tsx`, `$view.$threadId.tsx`, `draft-queue.tsx`, `draft-queue.$id.tsx`, `email.tsx` — **excluded from screenshots per D-05**, `settings.tsx`, `team.tsx`), `access-denied.tsx`, extensions routes
- **Embed/server routes** (`apps/staff-web/server/routes/`): `embed/schedule.get.ts`, `embed.js.get.ts`, `api/forms/public/[...slug].get.ts`, `f/` (public form pages)
- **Features dirs:** `apps/staff-web/features/forms/`, `apps/staff-web/features/marketing/`
- **Mobile** (`packages/mobile-app/app/`): `(tabs)/{index,schedule,food,profile}.tsx`, `food-add.tsx`, `food-barcode.tsx`, `pick-member.tsx`, `_layout.tsx`

### Known hardcoded route references (from PITFALLS R-06 — naming-record inputs)
- `/gymos/inbox` hardcoded in `GymosTopNav.tsx` and `gymos.inbox.tsx`
- `/inbox` hardcoded in `AppLayout.tsx`, `CommandPalette.tsx`, `SearchBar.tsx`, `NotFound.tsx`
- `/settings?alias=...` hardcoded in `RecipientInput.tsx`
- `/draft-queue` + `/draft-queue/:id` mail-template legacy, not yet retired

### Live deployment (capture target)
- Staff-web: `https://gym-class-os.vercel.app` (auto-deploys from `master`; this branch `redesign/ui-refresh` is not yet pushed — baseline captures the **live master deploy**, which is the true before-state)
- Demo data live in `gymos-demo` Neon: 260 members / 423 class occurrences / 4,162 bookings / 90 conversations — screenshots will show realistic seeded data
- Mobile connects to the live API via Expo Go

### Constraints in force
- **No local dev server** (NitroViteError) — all captures against deployed surfaces; no plan step may assume local HTTP
- **Fork boundary** — `templates/*` and `packages-vendored/*` out of audit-target scope (never edited; their vocabulary only matters where it surfaces through `apps/staff-web`)
- **NAME-05** — DB enum values / schema identifiers are inventoried only to be marked "do not touch" in the record

</code_context>

<specifics>
## Specific Ideas

- The capture script doubles as the milestone's standing verification harness — R2–R4 plans should invoke `scripts/ui-baseline/` with a different output dir rather than building new capture tooling.
- Filename suffix convention locked as `<route-slug>.<viewport>[.<state>].png` (e.g. `gymos-inbox.mobile.context-panel.png`).
- User explicitly excluded `/email` from screenshot coverage; it may still appear in the naming record if it carries email vocabulary worth inventorying.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: R1-audit-baseline*
*Context gathered: 2026-06-12*
