# Phase R4: Staff Web Visual Refresh + Embed Widgets - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning
**Mode:** Autonomous (decisions by Claude under standing user authorization; UAT deferred)

<domain>
## Phase Boundary

Apply the R2 design-system tokens across all staff-web surfaces and the public embed widgets, delivering the visual redesign so the product reads as a purpose-built gym platform — not an adapted email client. This is presentation/layout work on top of the now-stable token layer (R2) and gym vocabulary (R3).

**In scope:**
- Staff-web surfaces: schedule (class cards), members directory (card-default), member profile, member-context panel in conversations, messages responsiveness, role-based nav, light-theme default.
- Public embed widgets: `/embed/schedule` and the lead-capture form — token-themed, gym vocabulary.

**Out of scope:**
- Mobile app (R5).
- New capabilities/data — this is visual/layout refactor of existing surfaces, not new features.
- Token system changes (R2 owns tokens; R4 consumes them).
- Naming/routes (R3 done).
- DB changes (none).

</domain>

<decisions>
## Implementation Decisions

### Schedule (SWEB-01, SWEB-02)
- **D-01:** Staff schedule renders **class cards** showing class name, time, instructor, and "X / Y booked". Card-based, token-styled (R2: orange accent, 0.5rem radius, Inter).
- **D-02:** Capacity indicator turns **amber when ≤3 spots remain, red when full (0 spots)**; normal/token color otherwise. Implement as a token-driven status pill/badge on the card.

### Member context + profile (SWEB-03, SWEB-04)
- **D-03:** The Member Context panel inside a conversation shows **scannable widget cards, NOT a data table**: a pass-balance pill, a next-class card, and last-visit — visual hierarchy with the most actionable info first.
- **D-04:** Member Profile shows pass-balance pill, next-class card, and a bookings timeline (chronological, scannable — not a raw table).

### Members directory (SWEB-05)
- **D-05:** Members directory **defaults to card view** (avatar, membership pill, next class). A table view remains available as a secondary/toggle option (progressive disclosure — card is primary).

### Responsiveness (SWEB-06)
- **D-06:** Messages surface is **responsive**: single column at mobile widths with the member-context panel moving into a **bottom sheet** (shadcn `Sheet`), since coaches check from phones on the gym floor. Desktop keeps the side-by-side layout.

### Nav + theme (SWEB-07, SWEB-08)
- **D-07:** **Role-based nav**: coaches see Schedule / Messages / Members; admins additionally see Payments / Settings. Studio identity (R2) stays at top. (Home/Campaigns/Forms/Analytics disposition: keep current set; gate Payments+Settings behind admin role. Use the existing auth/role signal — confirm the role field during planning.)
- **D-08:** Staff web **defaults to light theme; dark theme is removed** (not a toggle). Remove the `ThemeToggle` and `next-themes` dark switching from the staff surfaces (deferred from R2 D-09 to here). Keep the `.dark` CSS as dormant/unused or remove the toggle entry points — planning decides the cleanest removal that doesn't break R2's skin cascade. (Dark theme is a post-milestone DSGN-F1 idea.)

### Embed widgets (WDGT-01, WDGT-02, WDGT-03)
- **D-09:** `/embed/schedule` renders a **clean card-based layout, no admin chrome, themed by studio tokens** (the `--studio-*` vars from R2, injected via the existing URL-param/inline-style mechanism). Retain the existing **iframe isolation** — no Shadow DOM work (per STACK.md, iframe isolation is already correct).
- **D-10:** Lead-capture form (`schedule-widget-ssr.ts` / `public-form-ssr.ts`) styled with studio tokens and uses **"Enquiry" vocabulary** (UK boutique convention — Hustle is Norwich, UK). "Enquire" / "Send Enquiry" stays (consistent with R3 D-03).
- **D-11:** Both embeds must render correctly inside an iframe on **light and dark host backgrounds** — verified via the R1 capture harness on the static iframe test page (WDGT-03 is a deploy/UAT verification item).

### Constraints
- **D-12:** Consume R2 tokens only — **no hardcoded hex** (the `guard-no-hardcoded-colors.mjs` CI guard is active and must keep exiting 0). Use shadcn token classes / CSS vars.
- **D-13:** shadcn/ui primitives mandatory (Card, Sheet, Badge, Tabs, etc.); Tabler icons only (no emojis); no custom dropdowns/modals.
- **D-14:** No local dev server — visual/responsive/iframe proofs are deploy/UAT items (reuse `scripts/ui-baseline/` for after-state captures). Fork boundary: staff-web only.
- **D-15:** Optimistic-UI + progressive-disclosure conventions (root AGENTS.md) — card surfaces summarize; detail expands on demand. Keep important screens clean (no toolbar/badge clutter).

### Claude's Discretion
- Exact card layouts, spacing, badge styling within the token system + UI-SPEC.
- The members card↔table toggle mechanism (Tabs vs a view-switch control).
- Whether dark CSS is fully removed or left dormant (pick lowest-risk re: R2 skin cascade).
- Bottom-sheet trigger affordance on mobile.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design direction
- `.planning/phases/R4-staff-web-visual-refresh/R4-UI-SPEC.md` — **the design contract** (generated this phase before planning; 6-pillar visual/interaction spec). Primary reference for layout/visual decisions.
- `.planning/research/FEATURES.md` — feature/UX direction, competitor vocabulary, anti-feature guidance (keep surfaces clean).
- `.planning/research/STACK.md` — embed iframe isolation is already correct (no Shadow DOM); token consumption pattern.

### Token + naming foundation (consume, don't change)
- `.planning/phases/R2-design-system-token-layer/R2-CONTEXT.md` — the token vocabulary (`--studio-accent`, shadcn vars), default orange skin, `data-studio` mechanism. R4 styles WITH these.
- `.planning/phases/R3-naming-ia-pass/R3-CONTEXT.md` — gym vocabulary already applied; R4 must not reintroduce email vocabulary; routes are `/gymos/messages` etc.
- `.planning/phases/R1-audit-baseline/NAMING-RECORD.md` — vocabulary reference.

### Planning
- `.planning/REQUIREMENTS.md` — SWEB-01..08, WDGT-01..03 definitions.
- `.planning/ROADMAP.md` — Phase R4 success criteria (8 TRUE-conditions).
- `.planning/STATE.md` — no-dev-server + live-customer constraints.
- `.planning/research/PITFALLS.md` — R-14 (Radix portals + studio skin — modals must render with tokens), embed CSS isolation notes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Surfaces to refresh (apps/staff-web/app/routes/)
- `gymos.schedule.tsx` — schedule surface → class cards (SWEB-01/02).
- `gymos.messages.tsx` — messaging surface + member-context panel → widget cards + responsive bottom sheet (SWEB-03/06).
- `gymos.members.tsx` — directory → card-default + table toggle (SWEB-05).
- `gymos.members_.$id.tsx` — member profile → pass pill + next-class + bookings timeline (SWEB-04).
- `gymos.tsx` — parent layout; `GymosTopNav` (R2 skin identity) → role-based nav (SWEB-07).
- `gymos.payments.tsx`, `gymos.settings.integrations.tsx` — admin-gated per role.

### Theme
- `app/root.tsx` — `ThemeProvider` (next-themes) + `data-studio` (R2). `ThemeToggle.tsx` component. SWEB-08: remove dark toggle, default light. Mind R2's skin cascade (skins declared after `.dark`).

### Embeds (apps/staff-web/features/)
- `forms/lib/schedule-widget-ssr.ts` — `/embed/schedule` SSR (already injects `--gym-accent`/`--gym-radius` from URL params; R2 self-hosted the font here). Extend to full `--studio-*` token theming + card layout.
- `forms/lib/public-form-ssr.ts` — public lead-capture form SSR.
- `marketing/lib/marketing-ssr.ts` — marketing SSR (token-themed in R2).

### Reusable
- shadcn primitives in `apps/staff-web/app/components/ui/` (Card, Sheet, Badge, Tabs, Dialog, etc.).
- R2 tokens in `global.css` + `skins/`; `guard-no-hardcoded-colors.mjs` enforces no hex.

### Constraints in force
- No local dev server — verify via grep/static + deploy UAT (reuse scripts/ui-baseline/).
- Color guard active (no hex). Fork boundary: staff-web only. shadcn + Tabler only.

</code_context>

<specifics>
## Specific Ideas
- Capacity urgency: amber ≤3 spots, red when full — the single most-watched UAT detail on the schedule (SWEB-02).
- Member context = widget cards (pass pill + next class + last visit), explicitly NOT a data table — this is differentiator #1 from the product vision.
- Coaches use phones on the gym floor → mobile responsiveness (bottom sheet) is real, not cosmetic.
- Embeds themed by studio tokens so Hustle's widget matches their brand once their hex lands.
</specifics>

<deferred>
## Deferred Ideas
- Dark theme for staff web (DSGN-F1, post-milestone).
- Mobile app visual refresh (R5).
- Any new analytics/reporting surfaces (out of scope).
</deferred>

---

*Phase: R4-staff-web-visual-refresh*
*Context gathered: 2026-06-13 (autonomous)*
