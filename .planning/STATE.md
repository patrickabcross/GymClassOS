---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: — Content & Video Studio
status: deployed
stopped_at: "2026-06-22 — Quick task 260622-f8j complete: showOperatorChrome gate wired end-to-end (AgentPanel/AssistantChat/AppLayout). Both typechecks exit 0."
last_updated: "2026-06-22T00:00:00.000Z"
last_activity: "2026-06-22 — Quick task 260622-f8j: generalize operator chrome gate (showOperatorChrome renames showSettingsGear; also hides Workspace, FeedbackButton, model picker for non-operators)"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-20 — Milestone v2.1 started)
Roadmap: `.planning/ROADMAP.md` (v2.1 section at top; v2.0 collapsed to shipped summary; full v2.0 detail archived in `milestones/v2.0-ROADMAP.md`)
Requirements: `.planning/REQUIREMENTS.md` (v2.1 requirements, 11 in-scope: CONT-01..05, VID-01..04, PUB-01..04, NAV-01, DEP-01, MIG-01; RENDER-01/02 gated)

**Core value:** HUSTLE staff can author rich content documents and video compositions inside the staff app — with the right-rail agent assisting — and publish them so they reach members (mobile app + public marketing pages), without a new member web portal.

**Current milestone:** v2.1 — Content & Video Studio (staff-web). Started 2026-06-20. Adds `/gymos/content` (Tiptap, non-collab) + `/gymos/video` (Remotion `@remotion/player` editor) tabs to `apps/staff-web`, plus a publish pipeline for member mobile API + public SSR pages.

**Prior art:** `apps/hq` has a non-collab Content surface (BD3 HQD-04: `apps/hq/actions/content-*.ts` + `apps/hq/app/routes/content.*.tsx`) — mine before writing new staff-web content code. The HQ Video surface is a thin deferred stub only (no Remotion dep in `apps/hq`).

## Current Position

Milestone: v2.1 — Content & Video Studio (staff-web)
Phase: CV4 — Publish pipeline (complete) — ALL 4 active phases built
Plan: —
Status: CV1-CV4 built + committed on master. Full staff-web `tsc` clean (0 errors), 115/115 unit tests pass. **NOT deployed** — production push held for explicit user go-ahead (autonomous run pre-approved build only). CV-RENDER remains gated.
Last activity: 2026-06-22 — Quick task 260622-e4a: revert SettingsPanel trim, gate operator gear, AGENT_NATIVE_SINGLE_TENANT flag, env-status fix

> **Open tails from prior milestones:** v2.0 live UAT (BD1–BD4 `*-HUMAN-UAT.md`) deferred-on-external-dependency. v1.2 Agentic Tab Editing live UAT pending (AE1–AE3 deployed). v1.0 Production + Mobile Demo (AE4) remain tracked.

**Progress bar (v2.1):** [██████████] 100% (4/4 active phases, 4/4 plans) — built, not yet deployed

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260620-c8p | Settings API Keys page: resolve secret status studio-global (by key) so saved keys show as set for every staff login, not just the saver | 2026-06-20 | ba34c8b8 | [260620-c8p-settings-api-keys-page-resolve-secret-st](./quick/260620-c8p-settings-api-keys-page-resolve-secret-st/) |
| 260622-d1v | Trim agent-chat Settings panel to Account+Integrations only; fix LLM env-status app_secrets false-negative | 2026-06-22 | 2ecf2387 | [260622-d1v-trim-agent-chat-settings-panel-to-accoun](./quick/260622-d1v-trim-agent-chat-settings-panel-to-accoun/) |
| 260622-e4a | Revert SettingsPanel trim; gate agent-chat gear behind operator allowlist; AGENT_NATIVE_SINGLE_TENANT flag; env-status app_secrets fix | 2026-06-22 | 4d6fe256 | [260622-e4a-revert-settings-panel-trim-gate-sidebar-](./quick/260622-e4a-revert-settings-panel-trim-gate-sidebar-/) |
| 260622-f8j | Generalize operator chrome gate: rename showSettingsGear -> showOperatorChrome; also hide Workspace button, FeedbackButton, and model picker for non-operators | 2026-06-22 | 88bc6766 | [260622-f8j-generalize-operator-chrome-gate-also-hid](./quick/260622-f8j-generalize-operator-chrome-gate-also-hid/) |
| 260622-g2k | Fast: env-status no-short-circuit — app_secrets always checked, so a key in BOTH env and app_secrets reports configured (clears false "AI assistant not configured") | 2026-06-22 | (see git) | — |

### v2.1 Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| CV1. Foundation | Tiptap + Remotion deps; additive `content_documents` + `video_compositions` schema; features/ scaffold; Content + Video tabs in GymosTopNav; application_state context-awareness; tsc clean | DEP-01, MIG-01, NAV-01 | **Complete** — CV1-01 (2026-06-20) |
| CV2. Content tab | `/gymos/content` list + Tiptap editor (create/rename/duplicate/delete/edit); useChangeVersions live-refresh; agent actions two-exposed | CONT-01, CONT-02, CONT-03, CONT-04, CONT-05 | **Complete** — CV2-01 (2026-06-20) |
| CV3. Video tab | `/gymos/video` list + `@remotion/player` in-browser editor (create/rename/duplicate/delete/edit composition); agent actions two-exposed | VID-01, VID-02, VID-03, VID-04 | **Complete** — CV3-01 (2026-06-20) |
| CV4. Publish pipeline | `draft`/`published` toggle; `/api/m/content` member API (published only); public SSR `/c/:slug` + `/v/:slug` pages | PUB-01, PUB-02, PUB-03, PUB-04 | **Complete** — CV4-01 (2026-06-20) |
| CV-RENDER [GATED] | Server-side MP4 render via Fly worker + pg-boss; MP4 storage + member surfacing | RENDER-01, RENDER-02 | Gated — awaiting go-ahead |

**Next action:** Deploy to production (push `master` → Vercel) — HELD for explicit user go-ahead — then live UAT (Content + Video tabs, publish, /c + /v pages, /api/m/content). Migrations v20/v21 apply on deploy; verify tables in gymos-demo Neon after.

## Performance Metrics

**v2.1 milestone start:** 2026-06-20

**v2.0 reference velocity (completed 2026-06-19, single ~9h session):**

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| BD2 | 01 | 35min | 3 | 7 | 2026-06-19 |
| BD2 | 02 | 16min | 3 | 10 | 2026-06-19 |
| BD2 | 03 | 975s (~16min) | 3 | 6 | 2026-06-19 |
| Phase BD2 P04 | 45 | 2 tasks | 9 files |
| Phase BD2 P05 | 1145 | 3 tasks | 12 files |
| Phase BD2 P06 | 45 | 4 tasks | 11 files |
| Phase BD3 P01 | 838 | 2 tasks | 8 files |
| Phase BD3 P03 | 461 | 3 tasks | 12 files |
| Phase BD3 P02 | 711 | 3 tasks | 6 files |
| Phase BD3 P04 | 397 | 3 tasks | 8 files |
| Phase BD3 P05 | 687 | 3 tasks | 14 files |
| Phase BD4 P01 | 14 | 3 tasks | 9 files |
| Phase BD4 P02 | 25 | 3 tasks | 6 files |
| Phase CV1-foundation P01 | 522 | 3 tasks | 13 files |
| Phase CV2-content-tab P01 | 667 | 3 tasks | 14 files |
| Phase CV3-video-tab P01 | 810 | 3 tasks | 17 files |
| Phase CV4-publish-pipeline P01 | 834 | 3 tasks | 17 files |

## Accumulated Context

### v2.1 Roadmap Decisions (2026-06-20)

- **2026-06-20 — Phase prefix CV to avoid .planning/phases/ collisions with BD/AE/R/D/P dirs.**
- **2026-06-20 — 4 active phases (coarse granularity): CV1 Foundation, CV2 Content tab, CV3 Video tab, CV4 Publish pipeline.** CV-RENDER is gated (not part of the default build).
- **2026-06-20 — DEP-01 + MIG-01 + NAV-01 all land in CV1.** These are cross-cutting infrastructure reqs; landing them first unblocks CV2 and CV3 in parallel.
- **2026-06-20 — CV2 and CV3 are independently executable after CV1 completes.** Content and Video don't depend on each other. They can be planned and run in parallel (coarse granularity means one execution order is fine; call `/gsd:plan-phase CV2` then CV3 sequentially).
- **2026-06-20 — CV4 depends on both CV2 (content_documents published state) and CV3 (video_compositions published state).** The publish pipeline needs both entity types to exist.
- **2026-06-20 — Strip Yjs from the Tiptap fork.** The HQ Content surface (BD3-05) already demonstrates the non-collab pattern — copy it. Remove `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`, `y-prosemirror`, `yjs`, `y-indexeddb` from the staff-web Tiptap install.
- **2026-06-20 — @remotion/player only (no @remotion/renderer) for CV1-CV4.** `@remotion/renderer` is headless Chromium and requires a server process; it is gated to CV-RENDER. In-browser preview via `@remotion/player` has no server dependency.
- **2026-06-20 — Helper/test files in server/lib, NOT server/plugins.** Nitro bundler error on Vercel if utilities land in server/plugins/ (plugins must export Nitro plugin objects). The HQ BD-series phases all followed this rule.
- **2026-06-20 — Prior art for Content actions: apps/hq/actions/content-{create,list,get,update}-document.ts (forked from templates/content in BD3-05).** Use as the direct copy-and-adapt base. The main changes needed for staff-web: (a) remove ownableColumns/accessFilter (gym tables are single-tenant, use guard:allow-unscoped); (b) add `status` field (draft/published) not present in HQ version; (c) rename deepLink app from 'content' to match staff-web navigation.
- **2026-06-20 — No member web portal constraint is the governing constraint for CV4.** `/c/:slug` public SSR page and `/api/m/content` member API are the delivery mechanisms; no new member login-required routes inside /gymos.
- **2026-06-20 — RENDER-01 / RENDER-02 mapped to gated CV-RENDER phase.** Not counted in the default coverage total (11 in-scope reqs across CV1-CV4). Gated phase requires explicit go-ahead + infra planning before `/gsd:plan-phase CV-RENDER`.

### CV2-01 Decisions (2026-06-20)

- **2026-06-20 CV2-01 — actions-registry.ts is gitignored (auto-generated); content-* actions auto-discovered on next dev/build start.** Updated registry locally for tsc; do not commit.
- **2026-06-20 CV2-01 — slugify("café & co") = "caf-co": strip non-ASCII as single codepoints (no NFD normalization first).** é is U+00E9 single codepoint; removed entirely rather than decomposed to e + combining accent. All 8 slug unit tests assert this exact output.
- **2026-06-20 CV2-01 — @tiptap/extension-link imported as Link_ to avoid shadowing React Router Link.** Cosmetic alias only; no functional impact.
- **2026-06-20 CV2-01 — Hard delete on content-delete-document (no soft-delete/deleted_at column).** Per plan hard_constraints; delete is always behind shadcn AlertDialog in UI; no new migration needed.

### BD4-01 Decisions (2026-06-19) — preserved for reference

- **2026-06-19 BD4-01 — All three BD4 tables owned by BD4-01 to prevent db.ts collision with BD4-02: studio_brain_docs (v16), studio_owner_config (v17), reactivation_attempts (v18), index (v19) all in BD4-01; BD4-02 reads them without touching db.ts.**
- **2026-06-19 BD4-01 — Pure helper extraction to brain-init-helpers.ts: vitest.unit.config.ts + ESM vitest cannot import @agent-native/core (CJS React "module is not defined"); pure helpers extracted to *-helpers.ts (mirrors create-checkout-link-helpers.ts pattern).**
- **2026-06-19 BD4-01 — Collapsible shadcn primitive for Class Methods: progressive disclosure — Class Methods section collapsed by default on /gymos/brain per AGENTS.md rule.**
- **2026-06-19 BD4-01 — Client-side fetch in gymos.brain.tsx (no loader): readAppState and getDb() in a React Router v7 loader need request context; client-side pattern matches gymos.campaigns.tsx segment-fetch.**

### v2.0 Roadmap Decisions — preserved for reference

- **2026-06-19 — Phase prefix BD (not integer) to avoid .planning/phases/ collisions with existing AE/R/D/P phase directories.**
- **2026-06-19 — 4 phases (coarse granularity).** Research converged on BD1-BD4. BD2 and BD4 each contain two parallel plans within the phase (TEL+PROV in BD2; GOB+GOD in BD4).
- **2026-06-19 — Provisioner runs in services/hq-worker (Fly), not Vercel.** 8-step saga exceeds Vercel's 300-second timeout. pg-boss job in hq-worker drives forward steps and LIFO rollback.
- **2026-06-19 — PROV rollback code ships before happy-path code (CRITICAL).** Non-idempotent provisioning creates orphaned cloud resources.
- **2026-06-19 — Three PII-up enforcement mechanisms (all three must ship together in BD1/BD2).**
- **2026-06-19 — HQ needs its own WABA (separate from any studio WABA).**
- **2026-06-19 — Anthropic call-site audit is a BD1 task, not BD2.**
- **2026-06-19 — Meta template approval lead times are calendar dependencies, not engineering tasks.**
- **2026-06-19 — GOD suppression ceiling (3 attempts / 90-day window) ships from day one (Pitfall W-01).**
- **2026-06-19 — GOD heartbeat cron start times staggered by hash(studio_id) % 60 min (Pitfall W-02).**
- **2026-06-19 — `sendMessage.ts` is NOT modified in BD4.**
- **2026-06-19 — HQ org + super-admin seed row in runMigrations (Pitfall F-02).**

### v1.2 Roadmap Decisions — preserved for reference

- **2026-06-18 — Phase prefix AE to avoid .planning/phases/ collisions.**
- **2026-06-18 — Gate atomicity: new gated actions must update both `ACTION_ALLOWLIST` in `approve-proposal.ts` AND Zod enum in `propose-action.ts` in the same commit.**
- **2026-06-18 — Consent exclusion is structural (`.strict()` Zod schema), not behavioral.**
- **2026-06-18 — Cancel-occurrence correctness: BOOKINGS_EXIST guard + atomic transaction.**
- **2026-06-18 — No local dev server constraint continues (NitroViteError).**
- **2026-06-18 — Two-exposure rule per action: action file registry + system prompt bullet, both required.**

### v1.0 Accumulated Context — preserved for reference

**P1c-WIDE VERIFICATION CONSTRAINT:** The local `agent-native dev` server cannot boot (`NitroViteError: Vite environment "nitro" is unavailable` -> 503 on server routes). NO plan can run a local HTTP walkthrough. Verify via replay against live Neon DB via Neon MCP or defer to e2e smoke test on Vercel deploy.

- **2026-05-17 — Two-milestone restructure:** Demo Sprint (week 1) + Production v1 (weeks 2-9).
- **2026-05-17 — pg-boss on Neon (NOT BullMQ + Redis):** Queue lives in same Neon DB; no Redis service.
- **2026-05-17 — Calorie counter built fresh (NOT fork OpenNutriTracker):** OpenNutriTracker is Flutter + GPL v3.
- **2026-05-17 (late) — Member surface = Expo fork of `packages/mobile-app`** (NOT web PWA).

**Live deployment state (master):**

- Staff-web: `https://gym-class-os.vercel.app` (Vercel, auto-deploys from `master`). As of 2026-06-22 (commit `082854ba`): **RunStudio rebrand live**; 4 localized marketing homepages live at `/ /uk /us /fr /de` (FR/DE native); Content tab hidden; video brief pipeline stages 1-2 live; v2.1 Content/Video Studio live. **Deploy = git push to master ONLY** (the `vercel` CLI fails — monorepo source > 10 MB upload cap; and NO root `.vercelignore` — it breaks the `packages/core` build).
- Staff-web (history): AE3 live as of commit `120d11c3`, deployed 2026-06-19
- Worker + edge-webhooks: Fly app `gymos-edge-webhooks`
- Neon project: `gymos-demo` (id `billowing-sun-51091059`)
- Demo data: 260 members / 423 class occurrences / 4,162 bookings / 200 active subs / 90 conversations / 453 messages

## Session Continuity

Last session: 2026-06-22 — RunStudio rebrand + marketing homepages + video brief pipeline (ALL DEPLOYED). Full writeup: `.planning/SESSION-2026-06-22-marketing-rebrand-and-video-pipeline.md`
Stopped at: shipped + verified live; open follow-ups in the session doc (dispatch operator setup, CTA targets, AI-video clips, pipeline stages 3-5).
Resume file: None

Prior session: 2026-06-20T10:22:33.153Z — Completed CV4-publish-pipeline CV4-01-PLAN.md

### PICK UP HERE — plan CV1

v2.1 roadmap is written. The four active phases are defined with success criteria and requirement mappings.

**Next step — plan Phase CV1:** `/gsd:plan-phase CV1`

CV1 is the foundational phase: Tiptap (no collab) + `@remotion/player` deps installed in `apps/staff-web/package.json`; additive `content_documents` + `video_compositions` `runMigrations` versions; `features/content/` + `features/video/` scaffolded from templates; Content + Video tabs added to `GymosTopNav`; `application_state` updated for context-awareness; tsc + Nitro build verified clean.

**Prior art to mine at plan time:**

- `apps/hq/actions/content-{create,list,get,update}-document.ts` — BD3-05 non-collab Content fork; adapt imports + add `status` field + remove `ownableColumns`/`accessFilter` (use `guard:allow-unscoped`)
- `apps/hq/app/routes/content._index.tsx` + `content.$id.tsx` — list + editor UI; adapt to staff-web gymos route conventions
- `apps/hq/server/lib/documents.ts` — `parseDocumentFavorite` helper; copy into `apps/staff-web/server/lib/`
- `apps/hq/app/routes/content.video.tsx` — thin stub only (no Remotion); CV1 scaffold can be similarly thin; CV3 adds `@remotion/player`

**CV2 + CV3 can be planned in parallel after CV1 completes** (no dependency between them). CV4 depends on both.

**RENDER go-ahead note:** If server-side MP4 render is approved at any point, run `/gsd:plan-phase CV-RENDER`. The gated phase is fully specified in ROADMAP.md (RENDER-01/RENDER-02) but blocked on explicit infra/cost decision.
