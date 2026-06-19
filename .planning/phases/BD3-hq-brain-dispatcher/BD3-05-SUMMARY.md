---
phase: BD3
plan: "05"
subsystem: apps/hq
tags: [content, tiptap, non-collab, documents, hqd-04, hqd-05, migration]
dependency_graph:
  requires: [BD3-03, BD3-04]
  provides: [content-documents-schema, content-crud-actions, content-editor-route, video-stub]
  affects: [apps/hq, packages/hq-schema]
tech_stack:
  added:
    - "@tiptap/core ^3.22.2 (non-collab — no extension-collaboration, no y-tiptap)"
    - "@tiptap/react ^3.22.2"
    - "@tiptap/starter-kit ^3.22.2"
    - "@tiptap/extension-placeholder ^3.22.2"
    - "@tiptap/pm ^3.22.2"
  patterns:
    - "Non-collab Tiptap editor with auto-save on blur + explicit Save button"
    - "Version snapshot ring buffer in content-update-document (5-min interval)"
    - "accessFilter + assertAccess org-scoping via HQ_ORG_ID"
key_files:
  created:
    - apps/hq/server/db/content-schema.ts
    - apps/hq/server/lib/documents.ts
    - apps/hq/actions/content-create-document.ts
    - apps/hq/actions/content-list-documents.ts
    - apps/hq/actions/content-get-document.ts
    - apps/hq/actions/content-update-document.ts
    - apps/hq/app/routes/content._index.tsx
    - apps/hq/app/routes/content.$id.tsx
    - apps/hq/app/routes/content.video.tsx
  modified:
    - apps/hq/server/db/index.ts
    - packages/hq-schema/src/migrations.ts
    - apps/hq/MODIFICATIONS.md
    - apps/hq/package.json
    - pnpm-lock.yaml
decisions:
  - "Non-collab Tiptap: StarterKit + Placeholder only — no extension-collaboration, no extension-collaboration-caret, no y-tiptap. Single super-admin makes CRDT unnecessary (D-03/D-10)."
  - "documentVersions retained: version snapshot ring buffer (5-min interval) provides audit trail even without collab — no collab dependency in update logic."
  - "content-delete-document not in BD3-05 scope: editor shows defensive error message rather than implementing delete; future plan adds the action."
  - "HQD-05 Video stub: content.video.tsx at /content/video — disabled Button + IconVideo + explanatory text. No Remotion install. Nav link from content._index.tsx. Satisfies D-11 thin stub requirement."
  - "setContent emitUpdate flag: Tiptap 3.22 changed second arg from boolean to SetContentOptions — used { emitUpdate: false } (Rule 1 auto-fix)."
metrics:
  duration_seconds: 687
  completed_date: "2026-06-19"
  tasks_completed: 3
  files_changed: 14
---

# Phase BD3 Plan 05: HQ Content Fork (Non-Collab) + Video Stub Summary

Non-collab Content surface for the HQ operator (HQD-04) — documents table, CRUD actions, plain Tiptap editor; HQD-05 Video present as a thin deferred stub with no Remotion footprint.

## What Was Built

### Task 1: Content documents schema + additive v10 migration + HQ db wiring

Created `apps/hq/server/db/content-schema.ts` by forking `templates/content/server/db/schema.ts` with:
- KEPT: `documents` (ownableColumns — HQ org scoped), `documentVersions` (audit ring), `documentShares` (accessFilter)
- DROPPED: `documentComments` (collab-only), `documentSyncLinks` (Notion sync), `notionCommentId` column

Appended additive v10 migration to `packages/hq-schema/src/migrations.ts` (dual-dialect, `CREATE TABLE IF NOT EXISTS`, no DROP/RENAME). Wired `contentSchema` into `apps/hq/server/db/index.ts` and registered `document` shareable resource. All copied files recorded in MODIFICATIONS.md.

### Task 2: Document CRUD actions + Content routes (non-collab Tiptap)

Four actions with `content-` prefix (collision avoidance):
- `content-create-document` — creates org-scoped doc, inherits parent shares
- `content-list-documents` — returns doc list via accessFilter, excludes full body
- `content-get-document` — resolveAccess single doc with full content
- `content-update-document` — assertAccess editor gate, version snapshot, no-op guard

Two routes:
- `content._index.tsx` — document list with "New document" CTA, EmptyState, nav to /content/video
- `content.$id.tsx` — plain Tiptap editor: StarterKit + Placeholder, auto-save on blur, title input, Save button, Favorite toggle

Added Tiptap non-collab deps to `apps/hq/package.json` (no collaboration extension, no y-tiptap).

### Task 3: HQD-05 Video — thin deferred stub

`content.video.tsx` at `/content/video`: shadcn Card + disabled Button ("Generate video (coming soon)") + IconVideo (Tabler) + explanatory text. No Remotion install. Satisfies D-11 (Remotion render cluster out of scope).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tiptap setContent API change**
- **Found during:** Task 2 typecheck
- **Issue:** `editor.commands.setContent(content, false)` — second arg changed from `boolean` to `SetContentOptions` in Tiptap 3.22.x. TS2559 type error.
- **Fix:** Changed to `setContent(content, { emitUpdate: false })`.
- **Files modified:** `apps/hq/app/routes/content.$id.tsx`
- **Commit:** 3cc283ae

**2. [Rule 3 - Blocking] Tiptap deps not in apps/hq/package.json**
- **Found during:** Task 2 typecheck
- **Issue:** `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/core`, `@tiptap/pm` not listed as explicit deps (templates/content has them but apps/hq is a separate package).
- **Fix:** Added the 5 non-collab Tiptap deps to `apps/hq/package.json`, ran `pnpm install`.
- **Files modified:** `apps/hq/package.json`, `pnpm-lock.yaml`
- **Commit:** 3cc283ae

## Verification Results

- `pnpm -F @gymos/hq exec tsc --noEmit`: PASS (clean, no errors)
- `pnpm guard:hq-no-pii`: PASS (no PII-shaped columns in documents schema)
- `pnpm guard:hq-fork-boundary`: PASS (no apps/hq imports into templates/)
- No Yjs/collab/Notion code in copied files (grep: only in comments/DROPPED notices)
- No `remotion` in `apps/hq/package.json` (grep: empty)
- Migration v10 is additive (CREATE TABLE IF NOT EXISTS, no DROP/RENAME)

## Known Stubs

- **`content.video.tsx` (HQD-05):** Intentional thin stub. The disabled "Generate video (coming soon)" Button is not wired to any pipeline — per D-11, the Remotion render cluster is out of scope for v2.0. This is documented in MODIFICATIONS.md and requirements. Future plan (post-v2.0) will implement the render pipeline.
- **`deleteDocument` helper in `content.$id.tsx`:** Throws a "not yet implemented" error. `content-delete-document` action was not in BD3-05 scope (plan files_modified list). Future plan adds the action and wires it to a Delete button.

## Self-Check: PASSED

Files exist:
- `apps/hq/server/db/content-schema.ts` — FOUND
- `apps/hq/server/lib/documents.ts` — FOUND
- `apps/hq/actions/content-create-document.ts` — FOUND
- `apps/hq/actions/content-list-documents.ts` — FOUND
- `apps/hq/actions/content-get-document.ts` — FOUND
- `apps/hq/actions/content-update-document.ts` — FOUND
- `apps/hq/app/routes/content._index.tsx` — FOUND
- `apps/hq/app/routes/content.$id.tsx` — FOUND
- `apps/hq/app/routes/content.video.tsx` — FOUND

Commits:
- 8eb313b8: feat(BD3-05): non-collab content schema + additive v10 migration + HQ db wiring
- 3cc283ae: feat(BD3-05): HQ Content CRUD actions + non-collab Tiptap routes
- 43f9dfb6: feat(BD3-05): HQD-05 Video thin deferred stub at /content/video
