---
phase: CV3-video-tab
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/server/lib/video-spec.ts
  - apps/staff-web/server/lib/video-spec.test.ts
  - apps/staff-web/actions/video-list-compositions.ts
  - apps/staff-web/actions/video-get-composition.ts
  - apps/staff-web/actions/video-create-composition.ts
  - apps/staff-web/actions/video-update-composition.ts
  - apps/staff-web/actions/video-rename-composition.ts
  - apps/staff-web/actions/video-duplicate-composition.ts
  - apps/staff-web/actions/video-delete-composition.ts
  - apps/staff-web/app/features/video/GymPromo.tsx
  - apps/staff-web/app/features/video/VideoPreviewPlayer.tsx
  - apps/staff-web/app/routes/gymos.video.tsx
  - apps/staff-web/app/routes/gymos.video_.$id.tsx
  - apps/staff-web/actions/view-screen.ts
  - apps/staff-web/server/plugins/agent-chat.ts
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [VID-01, VID-02, VID-03, VID-04]

must_haves:
  truths:
    - "Staff can open /gymos/video and see a list of video compositions (title, status, updated time)"
    - "Staff can click 'New composition' and a new draft row appears immediately (optimistic) and persists"
    - "Staff can open a composition and see a live @remotion/player preview rendering its spec in-browser (no server render)"
    - "Staff can edit scene text/subtitle/colours/imageUrl and add/remove/reorder scenes; the Player re-renders live without a page reload"
    - "Staff can rename, duplicate (with '(Copy)' suffix), and delete a composition (delete behind shadcn AlertDialog); all reflect immediately"
    - "The agent can create a composition prefilled from a class/offer ('draft a promo for our HIIT class') with drafted scene copy, and it appears without reload (useChangeVersions)"
    - "The agent can edit an existing composition's scene copy and the preview updates live"
    - "A malformed spec sent to video-update-composition is rejected (Zod validation), never persisted"
  artifacts:
    - path: "apps/staff-web/server/lib/video-spec.ts"
      provides: "VideoSpec Zod schema + TS types + defaultSpec() + helpers (validation source of truth)"
      contains: "VideoSpecSchema"
    - path: "apps/staff-web/server/lib/video-spec.test.ts"
      provides: "Unit tests for the spec validator + helpers"
    - path: "apps/staff-web/app/features/video/GymPromo.tsx"
      provides: "ONE deterministic Remotion composition component that renders a VideoSpec via Sequences"
      contains: "export function GymPromo"
    - path: "apps/staff-web/app/features/video/VideoPreviewPlayer.tsx"
      provides: "Client-only @remotion/player <Player> wrapper driven by inputProps={{ spec }}"
      contains: "@remotion/player"
    - path: "apps/staff-web/actions/video-create-composition.ts"
      provides: "Create a draft composition (optionally agent-prefilled from class/offer)"
    - path: "apps/staff-web/actions/video-update-composition.ts"
      provides: "Update title and/or spec with Zod validation (rejects malformed spec)"
    - path: "apps/staff-web/app/routes/gymos.video.tsx"
      provides: "Video list page (replaces CV1 placeholder) with optimistic create + live-refresh + ⋯ menu"
    - path: "apps/staff-web/app/routes/gymos.video_.$id.tsx"
      provides: "Editor route: ClientOnly Player preview + scene form (controlled spec)"
  key_links:
    - from: "apps/staff-web/app/routes/gymos.video_.$id.tsx"
      to: "apps/staff-web/app/features/video/VideoPreviewPlayer.tsx"
      via: "ClientOnly wrapper around <VideoPreviewPlayer spec={spec} />"
      pattern: "ClientOnly"
    - from: "apps/staff-web/app/features/video/VideoPreviewPlayer.tsx"
      to: "apps/staff-web/app/features/video/GymPromo.tsx"
      via: "<Player component={GymPromo} inputProps={{ spec }} />"
      pattern: "inputProps"
    - from: "apps/staff-web/app/routes/gymos.video_.$id.tsx"
      to: "/_agent-native/actions/video-update-composition"
      via: "fetch on save (spec JSON.stringified)"
      pattern: "video-update-composition"
    - from: "apps/staff-web/actions/video-update-composition.ts"
      to: "apps/staff-web/server/lib/video-spec.ts"
      via: "VideoSpecSchema.safeParse before persist"
      pattern: "VideoSpecSchema"
    - from: "apps/staff-web/actions/view-screen.ts"
      to: "schema.videoCompositions"
      via: "video branch live query (replaces CV1 static note)"
      pattern: "videoCompositions"
---

<objective>
Build the Video tab: staff manage the full lifecycle of `video_compositions` (list, create, preview via `@remotion/player`, edit scenes, rename, duplicate, delete) and the right-rail agent assists authoring via two-exposed DIRECT tools. NO server-side render — authoring/preview only, in-browser `@remotion/player`. Mirrors the CV2 Content tab shape exactly (thin actions, list route + editor route, optimistic + useChangeVersions live-refresh, view-screen branch, two-exposure).

Purpose: Completes VID-01..04 — staff can produce branded promo videos for classes/offers from inside the staff app, agent-assisted, status stays 'draft' (member exposure is CV4).
Output: VideoSpec schema + validator (Zod, tested), ONE deterministic `GymPromo` Remotion component, a ClientOnly `<Player>` editor route with live scene editing, a list route with optimistic create, 7 video CRUD actions, agent two-exposure, live view-screen branch.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/CV1-foundation/CV1-01-SUMMARY.md
@.planning/phases/CV2-content-tab/CV2-01-SUMMARY.md
@apps/staff-web/AGENTS.md

# CV2 is the template to mirror — read these to copy the exact shape:
@apps/staff-web/actions/content-create-document.ts
@apps/staff-web/actions/content-update-document.ts
@apps/staff-web/actions/content-list-documents.ts
@apps/staff-web/actions/content-get-document.ts
@apps/staff-web/actions/content-rename-document.ts
@apps/staff-web/actions/content-duplicate-document.ts
@apps/staff-web/actions/content-delete-document.ts
@apps/staff-web/app/routes/gymos.content.tsx
@apps/staff-web/app/routes/gymos.content_.$id.tsx
@apps/staff-web/server/lib/content-slug.ts
@apps/staff-web/actions/view-screen.ts

# Remotion <Player> usage reference (DO NOT copy the heavy editor — extract only the Player props pattern):
@templates/videos/app/components/VideoPlayer.tsx

<interfaces>
<!-- Key contracts the executor needs — use these directly, no codebase exploration. -->

CV1 already shipped (DO NOT redo):
- `@remotion/player@4.0.481` + `remotion@4.0.481` already in apps/staff-web/package.json. DO NOT add @remotion/renderer or @remotion/lambda.
- Migration v21 already created the `video_compositions` table in db.ts:
  ```sql
  CREATE TABLE IF NOT EXISTS video_compositions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
    spec TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
    slug TEXT, created_at TEXT, updated_at TEXT )
  ```
  → spec is JSON TEXT. NO new DDL/migration needed unless a column is genuinely missing (it is not). Schema.ts only needs the Drizzle EXPORT.
- `GymosNavBridge` already maps `content` + `video` → `/gymos/<view>`. No bridge work.
- `navigate.ts` already lists `video` as a valid view. No change.
- view-screen.ts already has a `video` branch returning a static note (CV1) — REPLACE it with a live query (mirror the existing `content` branch right above it, lines ~444-470).

Slug helper to REUSE (do NOT create a new one): `apps/staff-web/server/lib/content-slug.ts` exports `slugify(s: string): string`. Import it in video actions.

DB access from actions: `import { getDb, schema } from "../server/db/index.js";`
DB access from routes (loaders): `import { getDb, schema } from "../../server/db";`
App state refresh signal: `import { writeAppState } from "@agent-native/core/application-state";` then `await writeAppState("refresh-signal", { ts: Date.now() });` in every mutation.
Live-refresh hook: `import { useChangeVersions } from "@agent-native/core/client";` → `const v = useChangeVersions(["action"]);` then revalidate on bump.
ClientOnly: `import { ClientOnly, DefaultSpinner } from "@agent-native/core/client";` (confirmed export — used in root.tsx).

Remotion contract (from remotion 4.x):
- `import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, Img } from "remotion";`
- `<Player>` props (from @remotion/player): `component`, `compositionWidth`, `compositionHeight`, `durationInFrames`, `fps`, `inputProps`, `controls`, `style`, `loop`, `autoPlay`. The `component` receives `inputProps` as its React props — passing a NEW `inputProps={{ spec }}` object re-renders the preview live (this is the controlled live-preview mechanism).
- DO NOT import `registerRoot` / `Composition` (that's for the render bundle, not the Player). `<Player>` takes the component directly.
</interfaces>

<scope_discipline>
DO NOT build a full timeline/keyframe editor. Build a MINIMAL, template-driven composition model:
- VideoSpec (stored as JSON TEXT in video_compositions.spec):
  `{ format: "square"|"landscape", fps, durationInFrames, scenes: [{ type:"title"|"textOverImage"|"outro", text, subtitle?, imageUrl?, bgColor?, durationInFrames }] }`
- ONE Remotion component (`GymPromo`) renders `spec` deterministically — maps scenes → `<Sequence>` with simple fades.
- Editor route = `<Player>` preview + shadcn form (scene list, click a scene to edit its fields) + add/remove/reorder. Player re-renders live as spec changes via controlled `inputProps`.
- Thumbnail/poster = best-effort: a CSS poster (first scene's bgColor + title text) on the list card is acceptable. NO server render, NO still-frame export.
</scope_discipline>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: VideoSpec schema/validator + videoCompositions Drizzle export + 7 video actions + agent system-prompt section</name>
  <files>apps/staff-web/server/lib/video-spec.ts, apps/staff-web/server/lib/video-spec.test.ts, apps/staff-web/server/db/schema.ts, apps/staff-web/actions/video-list-compositions.ts, apps/staff-web/actions/video-get-composition.ts, apps/staff-web/actions/video-create-composition.ts, apps/staff-web/actions/video-update-composition.ts, apps/staff-web/actions/video-rename-composition.ts, apps/staff-web/actions/video-duplicate-composition.ts, apps/staff-web/actions/video-delete-composition.ts, apps/staff-web/server/plugins/agent-chat.ts</files>
  <behavior>
    video-spec.ts (VideoSpecSchema + helpers) — write tests FIRST in video-spec.test.ts:
    - `VideoSpecSchema.safeParse(defaultSpec())` succeeds.
    - format enum is "square" | "landscape" only; unknown format → safeParse fails.
    - scene.type enum is "title" | "textOverImage" | "outro" only; unknown type → fails.
    - scene with negative or zero durationInFrames → fails (use `.int().positive()`).
    - empty scenes array → fails (require `.min(1)`); a spec with 0 scenes is malformed.
    - `bgColor` optional; `imageUrl` optional; `subtitle` optional; `text` required & non-empty per scene.
    - `defaultSpec()` returns a valid spec: format "square", fps 30, scenes = one "title" scene + one "outro" scene, with `durationInFrames` = sum of scene durations.
    - `specForClassPromo({ className, classTime?, offer?, catchphrase? })` returns a valid spec: a title scene (className headline), a textOverImage/title scene with classTime/offer subtitle, and an outro scene with catchphrase or a default CTA. Total durationInFrames ≈ 15s at fps (450 frames) — the agent's "15-second promo" path. Result MUST pass VideoSpecSchema.
    - `recomputeDuration(spec)` sets top-level durationInFrames = sum of scene durationInFrames and returns the spec.
    - `parseSpec(json: string): VideoSpec` — JSON.parse then VideoSpecSchema.parse; throws on malformed (used by reads to coerce stored TEXT; on throw, callers fall back to defaultSpec()).
  </behavior>
  <action>
    1. **video-spec.ts** — Pure module (NO DB, NO side effects) in `server/lib` (NEVER server/plugins — Nitro bundling rule). Export:
       - `VideoSpecSchema` (Zod): `z.object({ format: z.enum(["square","landscape"]), fps: z.number().int().positive(), durationInFrames: z.number().int().positive(), scenes: z.array(SceneSchema).min(1) })` where `SceneSchema = z.object({ type: z.enum(["title","textOverImage","outro"]), text: z.string().min(1), subtitle: z.string().optional(), imageUrl: z.string().optional(), bgColor: z.string().optional(), durationInFrames: z.number().int().positive() })`.
       - `export type VideoSpec = z.infer<typeof VideoSpecSchema>;` and `export type VideoScene = ...`.
       - `defaultSpec()`, `specForClassPromo(input)`, `recomputeDuration(spec)`, `parseSpec(json)`, and `DIMENSIONS = { square: {width:1080,height:1080}, landscape:{width:1920,height:1080} }`.
       - Keep colours tasteful (brand-neutral: e.g. bgColor "#0F172A", text white). Do NOT hardcode studio hex — use neutral defaults; staff edits in the UI.
    2. **video-spec.test.ts** — Vitest unit tests covering the Behavior bullets above (RED first, then GREEN). Run with the unit config: `npx vitest run --config vitest.unit.config.ts server/lib/video-spec.test.ts`.
    3. **schema.ts** — Append a `videoCompositions` Drizzle export AFTER the existing `contentDocuments` export (file end), matching the v21 DDL EXACTLY. Mirror the contentDocuments block's comment header (single-tenant, no ownableColumns, DDL from CV1 v21, guard:allow-unscoped on reads, status stays 'draft' until CV4). Columns: id (text pk), title (text notNull default ""), spec (text notNull default "{}"), status (text notNull default "draft"), slug (text), createdAt/updatedAt (text notNull default now()). Additive only — NO migration change.
    4. **7 video actions** under `apps/staff-web/actions/` — mirror the 7 content-* actions one-for-one, substituting video/spec semantics. All carry `// guard:allow-unscoped — single-tenant video` on every query; all mutations omit the `http` key and call `writeAppState("refresh-signal", ...)`; reads set `http: { method: "GET" }, readOnly: true`. NO accessFilter/ownableColumns/assertAccess/documentShares/buildDeepLink imports. Reuse `slugify` from `../server/lib/content-slug.js`.
       - `video-list-compositions` (GET, readOnly): returns `{ compositions: [{ id, title, status, slug, updatedAt, createdAt, format, sceneCount, posterText, posterColor }] }`. Derive format/sceneCount/posterText (first scene text)/posterColor (first scene bgColor) by `parseSpec(row.spec)` inside try/catch → on parse failure fall back to defaults from `defaultSpec()`. Do NOT return the full spec in the list. Ordered `desc(updatedAt)`.
       - `video-get-composition` (GET, readOnly): `{ id }` → full row incl. `spec` (the raw stored JSON string) + `status, slug, title, createdAt, updatedAt`. `{ error: "NOT_FOUND" }` if absent.
       - `video-create-composition` (mutation): schema `{ id?, title?, spec?, fromClass? }`. `fromClass` (optional object `{ className, classTime?, offer?, catchphrase? }`) → build spec via `specForClassPromo(fromClass)`. If `spec` (a VideoSpec object) is supplied directly, validate with `VideoSpecSchema.safeParse` → reject `{ error: "INVALID_SPEC", issues }` on failure. If neither supplied, use `defaultSpec()`. title defaults "Untitled". status always "draft". Persist spec as `JSON.stringify(spec)`. Accept optional client `id` for optimistic UI. Returns `{ id, title, status, slug }`.
       - `video-update-composition` (mutation): schema `{ id, title?, spec? }` where `spec` is the COMPLETE new VideoSpec object (replaces, not merges). If `spec` supplied → `VideoSpecSchema.safeParse`; on failure return `{ error: "INVALID_SPEC", issues }` and DO NOT write (this is the malformed-spec rejection must-have). On success run `recomputeDuration` then persist `JSON.stringify`. If title changes, recompute slug. Empty patch → `{ updated: false, reason: "no changes" }`. NOT_FOUND guard. Returns `{ updated: true }`.
       - `video-rename-composition` (mutation): `{ id, title }` → update title + slug + updatedAt. Thin verb (mirror content-rename). Returns `{ renamed: true, title, slug }`.
       - `video-duplicate-composition` (mutation): `{ id, newId? }` → copy with title "{source} (Copy)", spec copied verbatim, status always "draft". Returns `{ id, title, status, slug }`.
       - `video-delete-composition` (mutation): `{ id }` → hard delete, idempotent NOT_FOUND-as-success. Returns `{ deleted: true }`.
    5. **agent-chat.ts** — Add a "Video tab" section immediately AFTER the existing "Content tab" section (mirror its shape/wording). List the 5 mutations + 2 reads as DIRECT (no propose-action gate). Instruct: call view-screen first; spec is a structured JSON object (format/fps/durationInFrames/scenes); for "draft a promo for our HIIT class / 15-second promo for tomorrow's 7am yoga", call `video-create-composition` with `fromClass`; to edit copy, call `video-get-composition` then `video-update-composition` passing the COMPLETE new spec (replaces, not merges); confirm destructive deletes; compositions stay 'draft' (publishing arrives in CV4). Reuse `list-classes`/`view-screen` to ground class details before prefilling.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run --config vitest.unit.config.ts server/lib/video-spec.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>video-spec.test.ts is GREEN (covers all Behavior bullets); tsc --noEmit clean; videoCompositions exported from schema.ts; 7 video-* actions exist mirroring content-* (guard:allow-unscoped, no http on mutations, writeAppState on every mutation, no accessFilter/ownableColumns); video-update + video-create reject malformed specs via VideoSpecSchema.safeParse; agent-chat.ts has a Video tab section listing all 7 tools as DIRECT.</done>
</task>

<task type="auto">
  <name>Task 2: GymPromo Remotion component + ClientOnly Player editor route + video list route (optimistic + live-refresh)</name>
  <files>apps/staff-web/app/features/video/GymPromo.tsx, apps/staff-web/app/features/video/VideoPreviewPlayer.tsx, apps/staff-web/app/routes/gymos.video.tsx, apps/staff-web/app/routes/gymos.video_.$id.tsx</files>
  <action>
    1. **GymPromo.tsx** (`app/features/video/`) — ONE deterministic Remotion composition component. `import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, Img } from "remotion";` and `import type { VideoSpec, VideoScene } from "@/../server/lib/video-spec";` (or relative import that tsc resolves — verify path). `export function GymPromo({ spec }: { spec: VideoSpec })`:
       - Compute running frame offsets from `spec.scenes[].durationInFrames`; render each scene in its own `<Sequence from={offset} durationInFrames={scene.durationInFrames}>`.
       - A `<SceneView scene={scene}>` sub-component uses `useCurrentFrame()` + `interpolate` for a simple fade-in (opacity 0→1 over first ~15 frames) and fade-out near the end. Render:
         - `title`: centered large `scene.text`, optional `scene.subtitle` below, background `scene.bgColor` (default neutral).
         - `textOverImage`: `<Img src={scene.imageUrl}>` as `AbsoluteFill` background (only if imageUrl present; otherwise bgColor), with `scene.text` overlaid (semi-opaque scrim for legibility) + optional subtitle.
         - `outro`: centered `scene.text` (CTA/catchphrase) on `bgColor`.
       - Pure/deterministic — no Date.now, no random, no fetch. Tasteful, clean typography (system font stack, generous spacing).
       - Guard against an empty/invalid `spec.scenes` (render a neutral placeholder frame) so the Player never throws.
    2. **VideoPreviewPlayer.tsx** (`app/features/video/`) — client-only `<Player>` wrapper. `import { Player } from "@remotion/player";` + `GymPromo` + `DIMENSIONS` from video-spec. Props `{ spec: VideoSpec }`. Render `<Player component={GymPromo} inputProps={{ spec }} compositionWidth={DIMENSIONS[spec.format].width} compositionHeight={DIMENSIONS[spec.format].height} durationInFrames={spec.durationInFrames} fps={spec.fps} controls loop style={{ width: "100%" }} />`. Passing a fresh `inputProps={{ spec }}` on each spec change is what re-renders the preview live. Keep it lean — do NOT copy the heavy custom transport bar from templates/videos/VideoPlayer.tsx; use Remotion's built-in `controls`.
    3. **gymos.video_.$id.tsx** (editor route) — mirror `gymos.content_.$id.tsx` structure (trailing `_` escapes nesting). Load via `video-get-composition` on mount; `parseSpec` the stored JSON into a `spec` state (fall back to `defaultSpec()` on parse error). Layout: two-column on lg (left: ClientOnly Player; right: scene editor form), single column on mobile.
       - **Player (SSR pitfall — KEY):** `import { ClientOnly, DefaultSpinner } from "@agent-native/core/client";` and render `<ClientOnly fallback={<DefaultSpinner />}><VideoPreviewPlayer spec={spec} /></ClientOnly>`. The Player MUST NOT render during SSR (Remotion needs the browser). This is the critical SSR handling — without ClientOnly the route 500s on Vercel SSR.
       - **Scene editor (progressive disclosure):** a list of scenes (label = scene.type + truncated text); clicking a scene reveals a shadcn form (Input for text/subtitle/imageUrl, a colour Input/text for bgColor, a Select for type). Editing any field updates the `spec` state immutably → Player re-renders live (no save needed for preview). Add-scene button (appends a default scene of a chosen type), remove-scene (with at-least-one guard), reorder (move up/down buttons — keep it simple, no drag lib). A format Select (square/landscape) on the spec. Title input at top (mirror content editor).
       - **Save:** explicit Save button + auto-save on blur (mirror content editor's pendingRef pattern). On save: `recomputeDuration` client-side is optional (the action does it server-side) — POST `video-update-composition` with `{ id, title?, spec }` (spec = the object; the action validates + recomputes + stringifies). Surface `INVALID_SPEC` errors inline (should not happen from the UI, but handle gracefully).
       - **Agent live re-pull (VID-04 / CONT-05 parity):** mirror content editor — `useChangeVersions(["action"])`; when it bumps and no local edit is pending, re-fetch via `video-get-composition`, `parseSpec`, and replace `spec` state so the agent's edits appear live.
       - No `window.prompt/confirm/alert`; shadcn primitives + Tabler icons (IconVideo, IconArrowLeft, IconDeviceFloppy, IconPlus, IconTrash, IconArrowUp, IconArrowDown). All `.tsx`, optimistic, clean UX.
    4. **gymos.video.tsx** (list route) — REPLACE the CV1 placeholder; mirror `gymos.content.tsx` exactly:
       - SSR loader queries `videoCompositions` (`// guard:allow-unscoped`), `desc(updatedAt)`. For each row derive `{ format, sceneCount, posterText, posterColor }` via `parseSpec` (try/catch → defaultSpec fallback). Do not select nothing-but-spec; include id/title/status/slug/updatedAt/createdAt/spec.
       - `useNavigationState().sync({ view: "video" })` on mount (keep CV1 behavior).
       - `useChangeVersions(["action"])` + `useRevalidator()` live-refresh.
       - "New composition" optimistic create: nanoid id, fire-and-forget POST `video-create-composition` `{ id, title: "Untitled" }`, navigate immediately to `/gymos/video/${id}`.
       - List rows: a small CSS **poster** (a div with `background: posterColor`, the `posterText` centered, aspect matching format) as the thumbnail "where available" (best-effort, NO server render) + title + status Badge + relative updated time.
       - ⋯ DropdownMenu: Rename (Dialog), Duplicate (revalidate), Delete (AlertDialog). Empty state with a single CTA. Tabler IconVideo throughout.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <done>GymPromo renders a VideoSpec deterministically via Sequences with fades; VideoPreviewPlayer drives <Player> with inputProps={{ spec }}; editor route wraps the Player in ClientOnly (SSR-safe) and edits spec state live with the Player re-rendering on change; list route replaces the CV1 placeholder with optimistic New composition + useChangeVersions live-refresh + CSS poster + ⋯ menu (rename/duplicate/delete-via-AlertDialog); no @remotion/renderer or @remotion/lambda imports; no window.prompt/confirm/alert; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: Live view-screen video branch + AGENTS.md two-exposure + verification sweep</name>
  <files>apps/staff-web/actions/view-screen.ts, apps/staff-web/AGENTS.md</files>
  <action>
    1. **view-screen.ts** — Replace the CV1 static `else if (nav?.view === "video") { screen.video = { note: ... } }` branch with a live query, mirroring the `content` branch directly above it (lines ~444-470). Lazy-import `{ getDb, schema }` and `{ eq, desc }`. Query `videoCompositions` (id, title, status, slug, updatedAt) `desc(updatedAt) limit 100` with `// guard:allow-unscoped — single-tenant video` → `screen.video = { compositions }`. If `nav?.documentId` OR a `nav?.compositionId` is set, also fetch the full row (incl. spec) as `screen.selectedComposition`. (Use `nav.compositionId`; the editor route should sync `{ view: "video", compositionId: id }` if practical, but a list-only branch satisfies the must-have.) Do NOT alter the content branch.
    2. **AGENTS.md** (apps/staff-web) — Add 7 video tool rows to the Agent Actions table (reads `video-list-compositions`/`video-get-composition` = Tier 1; the 5 mutations = "—"), mirroring the content rows' format/wording. Add a "Two-exposure rule — CV3 video actions" note paragraph after the CV2 content note: action files auto-registered + named in agent-chat.ts Video tab section + documented in the table; all DIRECT (no propose-action gate); compositions stay 'draft' (member exposure deferred to CV4); spec is a structured JSON object validated by VideoSpecSchema (malformed specs rejected, never persisted). Add a `video_compositions` row to the Data Sources table (id, title, spec JSON, status draft/published, slug, timestamps; single-tenant).
    3. **Verification sweep** — confirm two-exposure completeness and constraint adherence (see verify).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit && rg -n "video-create-composition|video-update-composition|video-list-compositions" server/plugins/agent-chat.ts AGENTS.md && ! rg -n "@remotion/renderer|@remotion/lambda" actions/video-*.ts app/features/video app/routes/gymos.video*.tsx && ! rg -n "window.(confirm|alert|prompt)" app/routes/gymos.video*.tsx app/features/video</automated>
  </verify>
  <done>view-screen video branch returns a live videoCompositions list (no static note); each of the 7 video actions is named in BOTH agent-chat.ts AND AGENTS.md (two-exposure); AGENTS.md has the CV3 two-exposure note + video_compositions data-source row; no @remotion/renderer|@remotion/lambda anywhere; no window.confirm/alert/prompt in video UI; tsc clean.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` → 0 errors (run after every task and at the end).
- `npx vitest run --config vitest.unit.config.ts server/lib/video-spec.test.ts` → all GREEN.
- `videoCompositions` exported from schema.ts (additive — no migration change; v21 table already exists from CV1).
- 7 video-* actions mirror the 7 content-* actions (single-tenant guard, no http on mutations, writeAppState on every mutation, slugify reused).
- video-update-composition + video-create-composition reject malformed specs via `VideoSpecSchema.safeParse` (never persist `INVALID_SPEC`).
- Editor route preview is wrapped in `ClientOnly` (SSR-safe — the key Remotion pitfall) and re-renders live on spec change via controlled `inputProps={{ spec }}`.
- No `@remotion/renderer` / `@remotion/lambda` imports anywhere; no `window.confirm/alert/prompt`; shadcn AlertDialog for delete; Tabler icons only.
- Two-exposure complete: all 7 actions in agent-chat.ts Video section AND AGENTS.md table.
- view-screen video branch is a live query (no CV1 static note).
- NO local dev server / HTTP walkthrough; NO DB push/deploy; additive-only.
</verification>

<success_criteria>
VID-01: /gymos/video lists compositions (title, status, updated time, CSS poster) — replaces CV1 placeholder.
VID-02: opening a composition shows a live in-browser @remotion/player preview that re-renders as staff edit scene text/colours/imageUrl/format and add/remove/reorder scenes — no server render, no page reload.
VID-03: rename, duplicate ("(Copy)"), delete (AlertDialog) all reflect immediately.
VID-04: agent can create a composition prefilled from a class/offer (fromClass → specForClassPromo) and edit scene copy (video-update-composition, complete spec) — both DIRECT, two-exposed, live via useChangeVersions; status stays 'draft'.
</success_criteria>

<output>
After completion, create `.planning/phases/CV3-video-tab/CV3-01-SUMMARY.md` using the summary template.
</output>
