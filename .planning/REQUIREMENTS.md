# Milestone v2.1 Requirements — Content & Video Studio (staff-web)

**Defined:** 2026-06-20
**Goal:** HUSTLE staff author rich content documents and video compositions inside `apps/staff-web`, with the right-rail agent assisting, and publish them so they reach members (mobile app + public marketing pages) — no new member web portal.

**Scope note:** Adapt agent-native `templates/content` and `templates/videos` into staff-web tabs, following the established copy-into-`features/` + four-area (UI · actions · agent/instructions · application_state) pattern. Reuse the non-collab Content surface already built in `apps/hq` (BD3 HQD). Single-tenant code preserved; strictly additive DB changes.

---

## v2.1 Requirements

### CONT — Content tab (Tiptap docs)

- [x] **CONT-01**: Staff can open a `/gymos/content` tab and see a list of the studio's content documents (title, status draft/published, updated time). *(CV2-01: gymos.content.tsx SSR loader + list UI)*
- [x] **CONT-02**: Staff can create a new content document and edit it in a rich-text (Tiptap) editor — headings, lists, links, images — single-studio, **no real-time collaboration / Yjs**. *(CV2-01: gymos.content_.$id.tsx non-collab StarterKit+Image+Link, auto-save on blur)*
- [x] **CONT-03**: Staff can rename, duplicate, and delete a content document (delete is reversible-safe / soft where practical; confirm via shadcn AlertDialog). *(CV2-01: DropdownMenu + Rename Dialog + Duplicate + Delete AlertDialog)*
- [x] **CONT-04**: The right-rail agent can create and edit content documents (draft marketing copy, rewrite, summarise) via `defineAction` tools that are two-exposed (registry + `agent-chat.ts` + `apps/staff-web/AGENTS.md`). *(CV2-01: 7 content actions + Content tab section + AGENTS.md table)*
- [x] **CONT-05**: Content edits and the agent's writes stay in sync live in the UI (`useChangeVersions` / polling), matching the existing staff-web pattern. *(CV2-01: useChangeVersions on list + agent live re-pull on editor)*

### VID — Video tab (Remotion editor)

- [x] **VID-01**: Staff can open a `/gymos/video` tab and see a list of the studio's video compositions (title, updated time, thumbnail/preview where available).
- [x] **VID-02**: Staff can create and edit a video composition in an in-browser Remotion editor with live preview via `@remotion/player` (text, images/brand assets, transitions) — **no server-side render required for authoring/preview**.
- [x] **VID-03**: Staff can rename, duplicate, and delete a video composition (confirm destructive actions via AlertDialog).
- [x] **VID-04**: The right-rail agent can assist authoring/editing compositions (e.g. draft a promo from a class/offer, adjust copy/scenes) via two-exposed `defineAction` tools.

### PUB — Publish pipeline (member-facing + public)

- [x] **PUB-01**: Staff can move a content document between `draft` and `published` states; only `published` items are exposed beyond staff.
- [x] **PUB-02**: Published content is exposed to the member mobile app via a `/api/m/*` endpoint (read-only, demo-member gated like the other member APIs) — **no new member web portal**.
- [x] **PUB-03**: Published content is rendered on a public SSR marketing page (e.g. `/c/:slug`) so it is crawlable/shareable, reusing the existing public-path + SSR pattern (mirrors `/f`, `/embed`).
- [x] **PUB-04**: A published video composition is surfaced to members/public via the same publish model — as an embedded `@remotion/player` (web) and/or a poster + link — pending the RENDER decision below for true MP4 playback/social export.

### Cross-cutting (each tab must satisfy)

- [x] **NAV-01**: Content and Video appear as tabs in `GymosTopNav.tsx`, navigable by the agent via the `navigate` action, with `application_state` exposing the current tab/selection (context-awareness).
- [x] **DEP-01**: New dependencies (Tiptap minus collaboration; Remotion + `@remotion/player`) added to `apps/staff-web/package.json`; the Vercel/Nitro build succeeds (helper/test files in `server/lib`, not `server/plugins`).
- [x] **MIG-01**: New tables (`content_documents`, `video_compositions`, plus any join/asset tables) added as **additive-only** `runMigrations` versions in the studio Neon; no rename/drop; verified against the live `gymos-demo` DB.

---

## Future Requirements (deferred)

### RENDER — Server-side video export (GATED — infra + cost decision)

> **Default: deferred.** Authoring/preview ships first. True MP4 export (for social posting and in-app/native member video playback) requires `@remotion/renderer` (headless Chromium) running on a **new Fly render worker** — meaningful new infra and recurring compute cost. Requires explicit go-ahead before building.

- [ ] **RENDER-01**: Staff can export a composition to an MP4 via a server-side render job (Fly render worker, pg-boss queued).
- [ ] **RENDER-02**: Rendered MP4s are stored (object storage) and surfaced to members (mobile app) + downloadable for social posting.

### Other deferred

- [ ] **CONT-FUT-01**: Content templates/snippets library (reusable blocks for class descriptions, offers, newsletters).
- [ ] **VID-FUT-01**: Brand kit / design-system reuse across compositions (the templates' `design-systems` surface) beyond a minimal default.
- [ ] **PUB-FUT-01**: Scheduling/auto-publish and direct social-channel posting integrations.

---

## Out of Scope

- **Real-time collaborative editing (Yjs/Tiptap collaboration, live cursors)** — single-studio staff use; the collaboration extensions are stripped from the Content fork. Re-add only if multi-editor concurrency becomes a real need.
- **A new member-facing *web* portal** — locked project constraint; members are on the Expo mobile app. Member-facing = publish pipeline (member API + public SSR marketing pages), not a member web UI.
- **AWS Lambda render path (`@remotion/lambda`)** — if RENDER is approved, prefer a Fly render worker to stay inside the existing Fly footprint (matches the pg-boss/worker model); revisit Lambda only at scale.
- **Multi-tenant / studio_id scoping** — single-tenant code preserved; one Neon per studio.
- **Editing `templates/` or `@agent-native/core` in place** — fork-boundary discipline; adaptation lives in `apps/staff-web/features/*` + wrappers.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEP-01 | Phase CV1 | Complete |
| MIG-01 | Phase CV1 | Complete |
| NAV-01 | Phase CV1 | Complete |
| CONT-01 | Phase CV2 | Complete (CV2-01) |
| CONT-02 | Phase CV2 | Complete (CV2-01) |
| CONT-03 | Phase CV2 | Complete (CV2-01) |
| CONT-04 | Phase CV2 | Complete (CV2-01) |
| CONT-05 | Phase CV2 | Complete (CV2-01) |
| VID-01 | Phase CV3 | Complete |
| VID-02 | Phase CV3 | Complete |
| VID-03 | Phase CV3 | Complete |
| VID-04 | Phase CV3 | Complete |
| PUB-01 | Phase CV4 | Complete |
| PUB-02 | Phase CV4 | Complete |
| PUB-03 | Phase CV4 | Complete |
| PUB-04 | Phase CV4 | Complete |
| RENDER-01 | Phase CV-RENDER (GATED) | Gated — awaiting go-ahead |
| RENDER-02 | Phase CV-RENDER (GATED) | Gated — awaiting go-ahead |
