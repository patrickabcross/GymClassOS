---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: "— UI Redesign: GymClassOS Design System"
status: executing
stopped_at: Completed R2-01-token-layer-and-skins-PLAN.md
last_updated: "2026-06-13T10:15:22.857Z"
last_activity: 2026-06-13
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-12 — Milestone v1.1 UI Redesign started)
Roadmap: `.planning/ROADMAP.md` (v1.1 phases R1–R5 at top; v1.0 preserved below under separate milestone header)
Requirements: `.planning/REQUIREMENTS.md` (30 v1.1 reqs across 6 categories — AUDT, DSGN, NAME, SWEB, WDGT, MOBL)

**Core value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp + class bookings + member context). Members book, pay, and log activity / nutrition from a native iOS/Android Expo app (forked from agent-native's `packages/mobile-app`) that includes an in-app coaching agent.

**Current focus:** Phase R2 — Design System Token Layer

## Current Position

Milestone: v1.1 UI Redesign — GymClassOS Design System (branch-isolated on `redesign/ui-refresh`; v1.0 Demo Sprint continues on `master`)
Phase: R2 (Design System Token Layer) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-06-13

> **Branch note:** All v1.0 Demo Sprint position/detail in the Accumulated Context section below reflects `master` state at branch time (2026-06-12) and is kept for reference. Do not execute v1.0 work from this branch.

**Progress bar:** [░░░░░░░░░░] 0% (0/5 phases)

### v1.1 Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| R1. Audit Baseline | Document before-state; produce naming inventory | AUDT-01, AUDT-02 | Complete |
| R2. Design System Token Layer | CSS token system + skin injector + Inter self-hosted | DSGN-01..05 | Not started |
| R3. Naming & IA Pass | Gym-domain labels → code identifiers → route renames | NAME-01..07 | Not started |
| R4. Staff Web + Embed Widgets | Visual redesign across staff surfaces + embeds | SWEB-01..08, WDGT-01..03 | Not started |
| R5. Member Mobile App | Dark-first themed Expo app with token file | MOBL-01..07 | Not started |

**Next action:** `/gsd:execute-phase R2` (Design System Token Layer)

## Performance Metrics

**v1.1 milestone start:** 2026-06-12
**v1.0 reference velocity (from master):**

- P1b.1 (8 plans): live-accepted 2026-05-26
- P1c (7 plans): complete 2026-06-01
- P3 (6/7 plans): in progress on master

## Accumulated Context

### v1.1 Roadmap Decisions

- **2026-06-12 — Phase prefix R (not integer) to avoid .planning/phases/ collisions at merge time.** v1.0 uses D0–D2, P0, P1a, P1b, P1b.1, P1c, P2, P3. This branch uses R1, R2, R3, R4, R5.
- **2026-06-12 — 5 phases despite coarse granularity setting.** The pitfall-enforced ordering (audit first, tokens before labels, labels before identifiers/routes) creates 4 hard dependency boundaries. SWEB+WDGT merged into R4 (both consume tokens; WDGT-03 is a verification criterion, not a separate surface). Mobile is R5 (independent from web, can in theory parallel R3/R4, but solo dev context means sequential). 5 phases is the minimum coherent structure for this work.
- **2026-06-12 — Hustle brand hex is an open dependency.** hustle.css cannot be finalised until Hustle confirms their hex values. Placeholder values with TODO comments ship in R2; final values applied when received.
- **2026-06-12 — No local dev server constraint carried into all phases.** All verification is via Vercel/Fly deploy (staff web + widgets) and Expo Go / EAS (mobile). No phase plan should include a local HTTP walkthrough step.
- **2026-06-12 — NAME-05 (no DB enum renames) is a standing constraint throughout R3.** drizzle-kit#1409 + live Hustle DB table-lock risk. Display labels only.
- **2026-06-12 (R1-03) — Mobile real-device Expo Go impossible.** App Store Expo Go runs SDK 56; the app is SDK 55; no EAS dev client exists. User approved react-native-web + headless Chromium fallback with /api/m/* fixture interception. Re-shootable at R5 once EAS dev client built. Same filenames, same INDEX.md manifest structure.
- **2026-06-12 (R1-03) — /api/m/* is production-gated to 401.** The Vercel deploy returns 401 on all member API routes (NODE_ENV check). This affects real phones too, not just headless capture. Flagged for the master-branch mobile/EAS workstream to resolve before any real-device testing.
- **2026-06-12 (R1-03) — Google OAuth requires CDP attach to real browser.** Automated Chromium is blocked by Google's bot-detection during OAuth. Auth detection must check for the better-auth.session_token cookie, not the URL (because /gymos returns 200 unauthenticated).
- **2026-06-12 — Fork boundary holds throughout R1–R5.** templates/* and packages-vendored/* never edited. All changes land in apps/staff-web/ or packages/mobile-app/.

### v1.0 Accumulated Context (from master — preserved for reference)

**P1c-WIDE VERIFICATION CONSTRAINT:** The local `agent-native dev` server cannot boot (`NitroViteError: Vite environment "nitro" is unavailable` → 503 on server routes) — same class of issue as the Vercel/Netlify Nitro-bundling crash; staff-web only runs reliably on Fly. So NO plan can run a local HTTP walkthrough. Verify the SUBSTANCE by replaying the handler/action SQL against the live `gymos-demo` Neon DB via Neon MCP (and clean up test rows), OR defer runtime checks to an e2e smoke test. This constraint applies equally to v1.1 work on this branch.

**P1c-02 deviation (0004 migration):** P1c-01's migration 0003 created only `form_submissions`; it OMITTED the `forms` + `responses` tables the forked forms handler reads/writes. `apps/staff-web/server/db/migrations/0004_p1c_forms_responses.sql` (strictly additive) closes the gap and is applied to `gymos-demo` Neon. Any plan that adds new forms-feature tables must continue the direct-to-Neon-via-MCP apply pattern (0001-0004), not runMigrations.

**Live deployment state (master):**

- Staff-web: `https://gym-class-os.vercel.app` (Vercel, auto-deploys from `master`)
- Worker + edge-webhooks: Fly app `gymos-edge-webhooks`
- Neon project: `gymos-demo` (id `billowing-sun-51091059`)
- Demo data: 260 members / 423 class occurrences / 4,162 bookings / 200 active subs / 90 conversations / 453 messages

### Decisions (v1.0 — from master history)

Decisions are logged in `PROJECT.md` Key Decisions table. Key ones affecting this branch:

- **2026-05-17 — Two-milestone restructure:** Demo Sprint (week 1) + Production v1 (weeks 2-9). Demo deliberately cuts corners (skipped atomic transactions, hardcoded data on non-golden paths, single-studio config). Production rebuilds every corner-cut.
- **2026-05-17 — Stripe direct restricted-API-key (NOT Connect):** Studio owns merchant relationship. No application_fee / no deauth handler.
- **2026-05-17 — pg-boss on Neon (NOT BullMQ + Redis):** Queue lives in same Neon DB; no Redis service.
- **2026-05-17 — Calorie counter built fresh (NOT fork OpenNutriTracker):** OpenNutriTracker is Flutter + GPL v3 — incompatible.
- **2026-05-17 (late) — Member surface = Expo fork of `packages/mobile-app`** (NOT web PWA). Discovered upstream has a full Expo 55 + Expo Router + RN 0.83.9 mobile app — that's the fork target.
- **2026-05-17 — Demo-time fork-boundary loosened:** For demo speed, we edit inside `templates/mail/` directly instead of copy-out. Post-demo refactor (P0 audit task) will move to proper fork-boundary layout.

### Phase Decisions (v1.0 — condensed)

Key patterns discovered during v1.0 execution that apply to v1.1:

- react-router v7 framework mode no longer exports `json()` — every loader returns plain objects
- `@/` path alias (not `~/`) in apps/staff-web/tsconfig.json — use `@/*` paths in all staff-web files
- `db.execute(sql\`…\`)` cast pattern for raw SQL against Neon Postgres (used in P1b/P1c plans)
- System prompt as tool gate: naming tools in the AGENTS.md system prompt is the actual unlock mechanism
- Tags pattern: `guard:allow-unscoped` on gym table queries (single-tenant, no accessFilter needed)

### Quick Tasks Completed (v1.0 — from master history)

| # | Description | Date | Commit | Status |
|---|-------------|------|--------|--------|
| 260524-r8f | Fix staff-web OAuth: redirect Mail routes to /gymos, remove Mail account hook, narrow Google scopes | 2026-05-24 | 1c60a41e | Done |
| 260531-kbm | Redesign /gymos/analytics dashboard for stronger visual hierarchy with display sizes | 2026-05-31 | 3d082eb7 | Done |
| 260531-n7i | Core missed-session re-engagement campaign: opt-in capture + opt-out gate, send-template-to-members batch action, /gymos/campaigns UI | 2026-05-31 | cc114b8f | Verified |
| 260601-muh | Migrate Meta WhatsApp credentials in services/worker + services/edge-webhooks from process.env to pgcrypto-backed secrets table | 2026-06-01 | a3948c35 | Done |
| 260603-gxh | Build GoHighLevel contacts CSV importer | 2026-06-03 | d255db06 | Done |
| 260604-fj3 | Add MYÜTIK verify-echo branch to edge-webhooks WhatsApp POST handler | 2026-06-04 | 9dabc513 | Done |
| 260604-nwb | Fix pg-boss "Database not opened" 500 on edge-webhooks inbound | 2026-06-04 | 3dfd99d7 | Done |
| 260604-op8 | Fix inbound 42P10 — worker message INSERT onConflictDoNothing partial-index predicate | 2026-06-04 | 6f70e2a1 | Done |
| 260607-pjc | Register MYUTIK_API_KEY in staff-web Settings | 2026-06-07 | pending | Done |
| fast | Fix 404 on React Router action POSTs | 2026-06-07 | 6edc640d | Done |
| 260608-fb8 | Repoint worker templates-sync cron from Meta Graph to MYÜTIK Template Extract API | 2026-06-08 | 6c46964f | Done |
| 260608-g74 | Worker reads credentials from framework app_secrets table | 2026-06-08 | a1d66c11 | Done |
| 260608-gn1 | Add Update templates button to inbox TemplatesDialog | 2026-06-08 | 368f450c | Done |
| 260609-fcm | AI auto-fill of WhatsApp template variables in TemplatesDialog | 2026-06-09 | 0a5b48e1 | Done |
| 260609-qe9 | Route worker outbound WhatsApp sends through MYÜTIK | 2026-06-09 | 5cc4ab82 | Done |
| 260611-dxv | CSV bulk-upload interface for Leads view | 2026-06-11 | cf3b76df | Done |
| 260611-rrh | Fix WhatsApp webhook consumer dropping MYÜTIK outbound mirrors | 2026-06-11 | 00863fc1 | Done |
| Phase R1 P02 | 3 | 2 tasks | 5 files |
| Phase R1 P01 | 185 | 2 tasks | 1 files |
| Phase R1-audit-baseline P03 | 240 | 5 tasks | 15 files |
| Phase R2-design-system-token-layer P01 | 15 | 3 tasks | 6 files |

### Pending Todos (v1.1)

None tracked yet — begin with `/gsd:plan-phase R1`.

**Open dependency to flag in R2 planning:** Hustle brand hex values not yet received. Block `hustle.css` finalisation on customer confirmation; use placeholder values with clear TODO markers in the interim.

### Blockers/Concerns (v1.1)

- **Hustle brand hex values** — required before `hustle.css` can be finalised in R2. Flag as open dependency; do not block R2 from starting (use placeholder).
- **No local dev server** — all verification via Vercel/Fly/Expo Go/EAS. Every R-phase plan must account for this.
- **Live customer (Hustle) on deployed app** — route renames in R3 require redirect shims before the old routes are removed. Do not remove old routes before shims are verified on the live deploy.

## Session Continuity

Last session: 2026-06-13T10:15:22.840Z
Stopped at: Completed R2-01-token-layer-and-skins-PLAN.md
Resume file: None

### ▶ PICK UP HERE — v1.1 Roadmap ready

Run `/gsd:plan-phase R1` to begin planning the Audit Baseline phase.

**R1 scope reminder:** Screenshots of every deployed surface (Vercel staff-web + embed widgets via iframe test page + Expo Go mobile screenshots) into `.planning/ui-reviews/baseline/`. Plus the naming decision record (email-vocabulary audit → label / CSS / identifier / route classification). No code changes in R1 — documentation only.

**Verification method for R1 (no local dev server):**

- Staff-web screenshots: capture from `https://gym-class-os.vercel.app` (live Vercel deploy)
- Embed screenshots: load the embed iframe snippet on a local HTML test page (static file, no server needed) against the live embed routes
- Mobile screenshots: capture from Expo Go on a phone connected to the live API

**Key files to read at R1 plan time:**

- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-REVIEW.md` — the existing UI review done during P1b.1 (partial; R1 completes and formalises it)
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md` — existing UI spec (partial; R1 audit will inform R2–R4 spec)

### Files Written This Session (v1.1 roadmap)

```
.planning/ROADMAP.md     — v1.1 phases R1–R5 added at top; v1.0 preserved below
.planning/REQUIREMENTS.md — traceability section populated (30/30 mapped)
.planning/STATE.md       — this file (milestone status updated to roadmap-created)
```
