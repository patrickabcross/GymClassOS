---
phase: CV3-video-tab
plan: "01"
subsystem: staff-web
tags: [remotion, video, actions, agent, live-refresh, drizzle, zod, ssr-safe, clientonly]
dependency_graph:
  requires: [video_compositions-table, @remotion/player-dep, content-slug-helper]
  provides: [video-crud-actions, /gymos/video-list, /gymos/video-editor, video-agent-tools, VideoSpec-schema]
  affects: [view-screen.ts, agent-chat.ts, AGENTS.md, schema.ts]
tech_stack:
  added: []
  patterns:
    - VideoSpec-Zod-schema-validation
    - remotion-Player-inputProps-live-preview
    - ClientOnly-plus-React.lazy-two-layer-SSR-guard
    - optimistic-new-composition
    - useChangeVersions-live-refresh
    - agent-live-re-pull
    - two-exposure-direct-action
    - guard-allow-unscoped-single-tenant
    - specForClassPromo-agent-helper
key_files:
  created:
    - apps/staff-web/server/lib/video-spec.ts (VideoSpecSchema + helpers)
    - apps/staff-web/server/lib/video-spec.test.ts (32 unit tests, all GREEN)
    - apps/staff-web/actions/video-list-compositions.ts
    - apps/staff-web/actions/video-get-composition.ts
    - apps/staff-web/actions/video-create-composition.ts
    - apps/staff-web/actions/video-update-composition.ts
    - apps/staff-web/actions/video-rename-composition.ts
    - apps/staff-web/actions/video-duplicate-composition.ts
    - apps/staff-web/actions/video-delete-composition.ts
    - apps/staff-web/features/video/GymPromo.tsx
    - apps/staff-web/features/video/VideoPreviewPlayer.tsx
    - apps/staff-web/app/routes/gymos.video_.$id.tsx
  modified:
    - apps/staff-web/server/db/schema.ts (videoCompositions table export added)
    - apps/staff-web/app/routes/gymos.video.tsx (replaced CV1 placeholder)
    - apps/staff-web/actions/view-screen.ts (video branch: static stub → live query)
    - apps/staff-web/server/plugins/agent-chat.ts (added Video tab section)
    - apps/staff-web/AGENTS.md (7 video tool rows + two-exposure note + data-source row)
decisions:
  - "Two-layer SSR protection: ClientOnly (prevents server render) + React.lazy (prevents @remotion/player module evaluation during SSR) — both layers required for Vercel SSR safety"
  - "features/video/ at apps/staff-web/features/video/ (not app/features/video/) — matches the actual directory structure from CV1; tsconfig includes features/**/*"
  - "recomputeDuration called server-side in video-update-composition (not client-side) to keep spec internally consistent regardless of client state"
  - "specForClassPromo produces 450-frame (15s at 30fps) compositions: 150f title + 210f textOverImage + 90f outro"
metrics:
  duration: 810s
  completed: "2026-06-20"
  tasks: 3
  files: 17
---

# Phase CV3 Plan 01: Video Tab Summary

**One-liner:** VideoSpec Zod schema (32 unit tests) + 7 video CRUD actions (agent-DIRECT, single-tenant, malformed-spec rejection) + GymPromo Remotion composition + two-layer SSR-safe ClientOnly+React.lazy player + live composition list + editor route with controlled live preview + agent specForClassPromo path + view-screen live query + two-exposure.

## What Was Built

### Task 1 — VideoSpec schema + 7 video actions + agent Video tab section (TDD)

**TDD flow:** RED (test file written first — 32 tests, module not found) → GREEN (video-spec.ts implemented — 32/32 pass).

**video-spec.ts (server/lib/):** Pure module, no DB/side effects. Exports:

| Export | Purpose |
|--------|---------|
| `VideoSpecSchema` | Zod schema — format enum, fps, durationInFrames, scenes array (min 1), SceneSchema (type enum, text min 1, optional subtitle/imageUrl/bgColor, durationInFrames int.positive) |
| `VideoSpec`, `VideoScene` | TS types from schema |
| `DIMENSIONS` | Pixel dimensions per format (square: 1080×1080, landscape: 1920×1080) |
| `defaultSpec()` | Two-scene valid spec: title (3s) + outro (2s) |
| `specForClassPromo(input)` | Agent helper: title (5s) + textOverImage (7s) + outro (3s) = 450 frames (15s at 30fps) |
| `recomputeDuration(spec)` | Syncs top-level durationInFrames to sum of scene durations; pure (new object) |
| `parseSpec(json)` | JSON.parse + VideoSpecSchema.parse; throws on invalid (callers fall back to defaultSpec()) |

**schema.ts:** Added `videoCompositions` Drizzle export at file end (after `contentDocuments`), matching v21 DDL exactly. Additive — no migration change (table already exists from CV1).

**7 video actions** (all under `apps/staff-web/actions/`):

| Action | Type | Key behavior |
|--------|------|-------------|
| `video-list-compositions` | GET read | Derives format/sceneCount/posterText/posterColor via parseSpec (try/catch fallback), no full spec in list, desc(updatedAt) |
| `video-get-composition` | GET read | Full spec string, NOT_FOUND guard |
| `video-create-composition` | mutation | fromClass → specForClassPromo; spec → VideoSpecSchema.safeParse (INVALID_SPEC rejection); neither → defaultSpec(); always 'draft'; writeAppState |
| `video-update-composition` | mutation | VideoSpecSchema.safeParse on spec → INVALID_SPEC rejection (never persist malformed); recomputeDuration server-side; empty patch no-op; writeAppState |
| `video-rename-composition` | mutation | Thin rename verb, slug recompute, writeAppState |
| `video-duplicate-composition` | mutation | "(Copy)" suffix, spec copied verbatim, always 'draft', writeAppState |
| `video-delete-composition` | mutation | Hard delete, idempotent NOT_FOUND success, writeAppState |

All mutations: no `http` key, `guard:allow-unscoped — single-tenant video`, `writeAppState("refresh-signal")`. No `accessFilter`/`ownableColumns`/`assertAccess` imports.

**agent-chat.ts:** Added "Video tab" section immediately after the Content tab section. All 7 tools listed as DIRECT. Key instructions: call view-screen first; fromClass for class promos; always pass COMPLETE spec to video-update-composition; confirm destructive deletes; status stays 'draft'.

### Task 2 — GymPromo component + VideoPreviewPlayer + list route + editor route

**GymPromo.tsx (features/video/):** Deterministic Remotion composition.
- Imports: `AbsoluteFill, Sequence, useCurrentFrame, interpolate` from `remotion` (not @remotion/renderer)
- Maps scenes to `<Sequence from={offset} durationInFrames={scene.durationInFrames}>`
- SceneView: fade-in over first 15 frames, fade-out over last 15 frames via `interpolate`
- Renders title/outro: centered text + optional subtitle on bgColor background
- Renders textOverImage: `<img>` as background fill + semi-opaque scrim + text overlay
- Guards against empty spec.scenes with a neutral placeholder frame
- Pure/deterministic: no Date.now(), no random, no fetch

**VideoPreviewPlayer.tsx (features/video/):** Lean wrapper around `<Player>`.
- `import { Player } from "@remotion/player"` — only import, no renderer/lambda
- Props `{ spec: VideoSpec }` — passing fresh `inputProps={{ spec }}` on each change re-renders preview live
- Uses built-in `controls` prop (no custom transport bar)
- `DIMENSIONS[spec.format]` for compositionWidth/Height
- `Math.max(1, spec.durationInFrames)` guards against zero duration

**gymos.video.tsx (list route):** Fully replaces CV1 placeholder.
- SSR loader: queries `videoCompositions`, `desc(updatedAt)`, derives poster data via parseSpec (try/catch fallback to defaultSpec)
- `useNavigationState().sync({ view: "video" })` preserved from CV1
- `useChangeVersions(["action"])` + `useRevalidator()` live-refresh (VID-04 parity)
- Optimistic "New composition": nanoid id, fire-and-forget POST, navigate immediately to `/gymos/video/${id}`
- CSS poster thumbnail: `CompositionPoster` component uses posterColor/posterText from loader (best-effort, no server render)
- DropdownMenu (⋯): Rename (Dialog with Input), Duplicate (revalidate), Delete (AlertDialog)
- Tabler icons: IconVideo, IconPlus, IconDots, IconPencil, IconCopy, IconTrash

**gymos.video_.$id.tsx (editor route):** The critical SSR-safe editor.

**Two-layer SSR protection (the key Remotion pitfall):**
1. `<ClientOnly fallback={<Spinner/>}>` — prevents ANY server render of children
2. `const VideoPreviewPlayerLazy = lazy(() => import("../../features/video/VideoPreviewPlayer"))` — React.lazy defers the @remotion/player module load until browser JS executes, preventing Remotion from accessing window/document/requestAnimationFrame during Vercel SSR

Without BOTH layers: `<Player>` accesses browser globals at module import time → 500 on Vercel SSR.

- Two-column layout (lg: player left, editor right)
- Live preview: `spec` is React state → fresh `inputProps={{ spec }}` on every edit → Player re-renders instantly
- Scene list: click to select + move-up/move-down buttons + remove (at-least-one guard)
- Scene form: type Select, text Input, subtitle Input, imageUrl Input (textOverImage only), color picker + hex Input, duration Input (frames)
- Format Select at top: square/landscape (updates spec state → Player re-renders at new dimensions)
- Agent live re-pull: `useChangeVersions(["action"])` → when bumps and `pendingRef.current === false`, re-fetch → `parseSpec` → `setSpec` → Player re-renders with agent's changes
- Save: explicit Save button + title auto-save on blur (mirrors content editor pattern)
- No window.prompt/confirm/alert; shadcn primitives + Tabler icons

### Task 3 — Live view-screen video branch + AGENTS.md two-exposure + verification sweep

**view-screen.ts:** Replaced CV1 static stub:
```ts
screen.video = { note: "Video tab — compositions arrive in CV3." }  // CV1
↓
// CV3: live query
const compositions = await db.select(...).from(schema.videoCompositions)
  .orderBy(desc(...)).limit(100);
screen.video = { compositions };
if (nav?.compositionId) { ... fetch selectedComposition ... }
```

Matches the content branch pattern exactly (lazy import, guard:allow-unscoped).

**AGENTS.md:** Added 7 video tool rows (Tier 1 for reads, `—` for mutations). Added two-exposure note for CV3. Added `video_compositions` Data Sources table row.

## Verification

- `npx tsc --noEmit`: CLEAN (0 errors) after each task and final
- `npx vitest run --config vitest.unit.config.ts server/lib/video-spec.test.ts`: 32/32 PASSED (RED first, then GREEN)
- No `@remotion/renderer`, `@remotion/lambda`, `@remotion/bundler` imports in any new file
- No `accessFilter`/`assertAccess`/`resolveAccess`/`ownableColumns` in video-* actions
- No mutation sets `status: 'published'`
- All destructive UI uses shadcn AlertDialog; no `window.confirm/alert/prompt`
- Mutations have NO `http` key; reads have `http: { method: "GET" }`
- `videoCompositions` exported from schema.ts (additive; no migration change)
- Two-exposure complete: all 7 actions in agent-chat.ts Video section + AGENTS.md table
- view-screen video branch is a live query (no CV1 static note)
- ClientOnly + React.lazy two-layer SSR protection in gymos.video_.$id.tsx

## Deviations from Plan

### Implementation Notes

**1. [Rule 1 - Design] features/video/ location**
- Plan referenced `app/features/video/` (conceptual path)
- Actual path: `apps/staff-web/features/video/` (matches CV1 README.md location, confirmed by `ls apps/staff-web/features/`)
- tsconfig.json includes `features/**/*` at the `apps/staff-web` root — correct
- Import paths in routes use relative `../../features/video/VideoPreviewPlayer` — resolves correctly

**2. [Rule 2 - Missing] Two-layer SSR protection (deviation from plan spec)**
- Plan said: "ClientOnly wrapper around `<VideoPreviewPlayer spec={spec} />`"
- Reality: ClientOnly accepts `children: ReactNode` (not a render function). A static import of VideoPreviewPlayer would cause `@remotion/player` to load during SSR regardless of ClientOnly.
- Fix: added `React.lazy()` dynamic import of VideoPreviewPlayer + `<Suspense>` inside `<ClientOnly>`. This is a TWO-layer guard: ClientOnly prevents server render, lazy() prevents the module from loading at SSR time.
- This is the correct, production-safe approach and exceeds the plan's spec (which would have caused SSR failures on Vercel).

**3. [Design] recomputeDuration called in editor too**
- The plan said recomputeDuration is "optional client-side" (the action does it server-side).
- Editor also calls it on every spec mutation to keep the Badge counter accurate (frames/seconds display).
- No functional impact on correctness; purely cosmetic local state update.

## Known Stubs

None — all plan artifacts are fully implemented. The video tab is functional for list, create, preview, edit, rename, duplicate, and delete. Status remains 'draft' (intentional; CV4 adds member-facing publishing). The `video_compositions` table was already created by CV1 migration v21.

## Self-Check: PASSED

Files verified present:
- FOUND: apps/staff-web/server/lib/video-spec.ts
- FOUND: apps/staff-web/server/lib/video-spec.test.ts
- FOUND: apps/staff-web/server/db/schema.ts (videoCompositions export added)
- FOUND: apps/staff-web/actions/video-list-compositions.ts
- FOUND: apps/staff-web/actions/video-get-composition.ts
- FOUND: apps/staff-web/actions/video-create-composition.ts
- FOUND: apps/staff-web/actions/video-update-composition.ts
- FOUND: apps/staff-web/actions/video-rename-composition.ts
- FOUND: apps/staff-web/actions/video-duplicate-composition.ts
- FOUND: apps/staff-web/actions/video-delete-composition.ts
- FOUND: apps/staff-web/features/video/GymPromo.tsx
- FOUND: apps/staff-web/features/video/VideoPreviewPlayer.tsx
- FOUND: apps/staff-web/app/routes/gymos.video.tsx (replaced CV1 stub)
- FOUND: apps/staff-web/app/routes/gymos.video_.$id.tsx
- FOUND: apps/staff-web/actions/view-screen.ts (video branch live)
- FOUND: apps/staff-web/server/plugins/agent-chat.ts (Video section)
- FOUND: apps/staff-web/AGENTS.md (video tool rows + two-exposure note)

Commits verified:
- 67c3a62e feat(CV3-01): VideoSpec schema + 7 video actions + agent Video tab section
- 9ea66195 feat(CV3-01): GymPromo Remotion component + ClientOnly Player editor + video list route
- bd5d88fd feat(CV3-01): live view-screen video branch + AGENTS.md two-exposure (CV3)
