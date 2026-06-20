---
phase: CV1-foundation
plan: "01"
subsystem: staff-web
tags: [remotion, tiptap, migrations, navigation, content, video, gymos]
dependency_graph:
  requires: []
  provides: [content_documents-table, video_compositions-table, /gymos/content-route, /gymos/video-route, GymosNavBridge, remotion-dep]
  affects: [gymos.tsx, GymosTopNav, navigate.ts, view-screen.ts]
tech_stack:
  added: ["@remotion/player@4.0.481", "remotion@4.0.481"]
  patterns: [runMigrations-additive, useNavigationState-sync, view-screen-branch]
key_files:
  created:
    - apps/staff-web/features/content/README.md
    - apps/staff-web/features/video/README.md
    - apps/staff-web/app/routes/gymos.content.tsx
    - apps/staff-web/app/routes/gymos.video.tsx
    - apps/staff-web/app/components/gymos/GymosNavBridge.tsx
  modified:
    - apps/staff-web/package.json
    - apps/staff-web/server/plugins/db.ts
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx
    - apps/staff-web/app/routes/gymos.tsx
    - apps/staff-web/actions/navigate.ts
    - apps/staff-web/actions/view-screen.ts
    - pnpm-lock.yaml
decisions:
  - "@remotion/player + remotion pinned at identical 4.0.481 (Remotion enforces lockstep; verified with pnpm view)"
  - "Tiptap already present at ^3.22.2 — no re-install; zero collab/Yjs deps confirmed"
  - "Migrations v20/v21 appended after v19 in runMigrations array (existing out-of-order v15 entry is normal per plan context)"
  - "view-screen content/video branches use static note (no DB query) — minimal correct path for CV1; CV2/CV3 will add live queries"
  - "GymosNavBridge renders null (pure side-effect); mounted in gymos.tsx layout once so all /gymos/* children inherit agent navigation"
  - "Content + Video tabs are admin-gated (isAdmin wrapper) matching Campaigns/Forms/Brain pattern"
metrics:
  duration: 522s
  completed: "2026-06-20"
  tasks: 3
  files: 13
---

# Phase CV1 Plan 01: Foundation Summary

**One-liner:** Remotion 4.0.481 + content_documents/video_compositions additive migrations (v20/v21) + /gymos/content and /gymos/video placeholder routes + GymosNavBridge agent navigation consumer wired into gymos layout.

## What Was Built

### DEP-01 — Remotion deps
- Added `@remotion/player@4.0.481` + `remotion@4.0.481` to `apps/staff-web/package.json` `dependencies` (runtime — in-browser player ships to client and SSR).
- Both packages pinned at identical exact version (Remotion enforces lockstep; verified with `pnpm view`).
- `pnpm-lock.yaml` updated from repo root per workspace discipline.
- NOT added: `@remotion/renderer`, `@remotion/lambda` (gated to CV-RENDER), any `@tiptap/extension-collaboration*` / `y-prosemirror` / `yjs` / `y-indexeddb` (Tiptap non-collab already present at ^3.22.2 — confirmed zero collab deps).

### MIG-01 — Additive migrations
- `apps/staff-web/server/plugins/db.ts`: appended v20 (`content_documents`) and v21 (`video_compositions`) to the `runMigrations([...])` array.
- Migration DDLs:

```sql
-- v20
CREATE TABLE IF NOT EXISTS content_documents (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  slug       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)

-- v21
CREATE TABLE IF NOT EXISTS video_compositions (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  spec       TEXT NOT NULL DEFAULT '{}',
  status     TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  slug       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

- Both `CREATE TABLE IF NOT EXISTS` (idempotent on re-run).
- Single-tenant: no `studio_id`, no `ownableColumns`. Reads will use `// guard:allow-unscoped`.
- Existing v1–v19 rows untouched. v15 remains in its existing out-of-order position (runMigrations applies by version number, not array order).
- Tables auto-apply on Vercel deploy boot via `runMigrations` (NOT standalone `.sql` files).

### NAV-01 UI half — Feature scaffold + placeholder routes + GymosTopNav
- `features/content/README.md` + `features/video/README.md`: fork boundary markers documenting prior art (HQ content actions) and key notes for CV2/CV3 implementors.
- `app/routes/gymos.content.tsx`: placeholder page rendering Tiptap-coming-soon copy, syncs `{ view: "content" }` to navigation `application_state` via `useNavigationState().sync`.
- `app/routes/gymos.video.tsx`: placeholder page rendering Remotion-coming-soon copy, syncs `{ view: "video" }`.
- `GymosTopNav.tsx`: added `isContent` + `isVideo` path flags; added two admin-gated `<Link>` tabs (Content → `/gymos/content`, Video → `/gymos/video`) placed after Brain in the admin cluster; text-only labels matching all other existing tabs; Tabler icons on route pages (not nav strip).

### NAV-01 agent half — GymosNavBridge + navigate/view-screen extensions
- `app/components/gymos/GymosNavBridge.tsx`: new null-rendering component that consumes the agent's one-shot `navigate` write from `useNavigationState().command`, maps `cmd.view` → `/gymos/<view>` via `VIEW_TO_PATH`, calls `navigate(target)` then `navState.clearCommand()`. Deduplicates via `lastRef` (JSON-keyed). Handles all existing gymos routes + the two new ones.
- `app/routes/gymos.tsx`: imports and mounts `<GymosNavBridge />` directly after `<GymosTopNav />` so all `/gymos/*` children inherit agent navigation.
- `actions/navigate.ts`: extended both the action `description` and the `view` field's `.describe()` text to include `brain, content, video` in the allowed route list (view remains free-form `z.string().optional()`).
- `actions/view-screen.ts`: added explicit `content` and `video` branches immediately before the `else if (nav?.view)` Gmail fall-through. Each branch returns a static `{ note: "..." }` screen object (no DB query this phase — minimal correct path). Without this, `nav.view='content'/'video'` would wrongly call `fetchEmailList → Gmail`.

## Verification

**tsc --noEmit:** CLEAN (0 errors, 0 warnings from new/changed files). Run from `apps/staff-web/`.

**Dependency hygiene:** `@remotion/player` + `remotion` present at matching `4.0.481`. No `@remotion/renderer`, `@remotion/lambda`, or any tiptap-collaboration/y-* dep in package.json.

**Migrations:** v20 + v21 appended; existing v1–v19 untouched; both `CREATE TABLE IF NOT EXISTS`.

**Pending (post-merge to master / Vercel deploy):**
- Neon gymos-demo tables `content_documents` + `video_compositions` verified via Neon MCP (`project: billowing-sun-51091059`) after first deploy boot.
- Content + Video tabs visible in GymosTopNav (admin); routes render placeholders.
- `navigate({view:"content"})` / `navigate({view:"video"})` → GymosNavBridge routes UI to matching tab.
- `view-screen` on Content/Video tab returns `screen.content`/`screen.video` object, not Gmail list.

## Notes for CV2 / CV3

- **Tiptap is already present** in `apps/staff-web/package.json` at `@tiptap/starter-kit@^3.22.2` + react/pm/image/link/placeholder/code-block-lowlight/tiptap-markdown/lowlight. No dep work needed in CV2; zero collab deps to remove.
- **Remotion is already present** at `@remotion/player@4.0.481` + `remotion@4.0.481`. No dep work needed in CV3. Do NOT add `@remotion/renderer` or `@remotion/lambda`.
- **GymosNavBridge** (`app/components/gymos/GymosNavBridge.tsx`) is the gymos navigate consumer to reuse. CV2/CV3 do NOT need a new bridge; `VIEW_TO_PATH` already maps `content` and `video` correctly.
- **view-screen content/video branches** are stubs this phase (`screen.content = { note: "..." }`). CV2 should add a live `content_documents` list query (lazy import pattern, `// guard:allow-unscoped`). CV3 adds `video_compositions` list similarly.
- **Prior art for CV2 actions:** `apps/hq/actions/content-{create,list,get,update}-document.ts` (BD3-05 non-collab Content fork). Key changes: remove `ownableColumns`/`accessFilter` (use `// guard:allow-unscoped`); add `status` field (`draft`/`published`); rename deepLink app to `'gymos'`.
- **Prior art for CV2 route UI:** `apps/hq/app/routes/content._index.tsx` + `content.$id.tsx` — list + editor; adapt to `gymos.content._index.tsx` + `gymos.content.$id.tsx` flat-route conventions.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `gymos.content.tsx` renders a placeholder ("Rich content documents arrive in CV2"). Intentional: CV2 fills this with the Tiptap editor + list.
- `gymos.video.tsx` renders a placeholder ("In-browser video compositions arrive in CV3"). Intentional: CV3 fills this with the Remotion player + list.
- `view-screen.ts` content/video branches return static notes. Intentional: CV2/CV3 add live DB queries once CRUD actions exist.

These stubs are intentional CV1 scaffolding. They do not prevent CV1's goal (navigation plumbing + tsc green); CV2/CV3 resolve them.

## Self-Check: PASSED

Files verified present:
- FOUND: apps/staff-web/features/content/README.md
- FOUND: apps/staff-web/features/video/README.md
- FOUND: apps/staff-web/app/routes/gymos.content.tsx
- FOUND: apps/staff-web/app/routes/gymos.video.tsx
- FOUND: apps/staff-web/app/components/gymos/GymosNavBridge.tsx

Commits verified:
- 3afa8044 feat(CV1-01): add Remotion deps + additive content/video migrations
- f1963367 feat(CV1-01): scaffold feature dirs, placeholder routes, Content+Video nav tabs
- 3ad6ed3b feat(CV1-01): agent navigate bridge, view-screen content/video branches (NAV-01)

tsc --noEmit: CLEAN (0 errors)
