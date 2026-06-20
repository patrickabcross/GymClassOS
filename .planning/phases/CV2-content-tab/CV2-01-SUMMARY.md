---
phase: CV2-content-tab
plan: "01"
subsystem: staff-web
tags: [tiptap, content, actions, agent, live-refresh, drizzle, slug]
dependency_graph:
  requires: [content_documents-table, /gymos/content-route, view-screen-branch]
  provides: [content-crud-actions, /gymos/content-list, /gymos/content-editor, content-agent-tools]
  affects: [view-screen.ts, agent-chat.ts, AGENTS.md, schema.ts]
tech_stack:
  added: []
  patterns:
    - non-collab-tiptap-editor
    - optimistic-new-document
    - useChangeVersions-live-refresh
    - agent-live-re-pull
    - two-exposure-direct-action
    - guard-allow-unscoped-single-tenant
key_files:
  created:
    - apps/staff-web/server/db/schema.ts (contentDocuments table export)
    - apps/staff-web/server/lib/content-slug.ts
    - apps/staff-web/server/lib/content-slug.test.ts
    - apps/staff-web/actions/content-create-document.ts
    - apps/staff-web/actions/content-list-documents.ts
    - apps/staff-web/actions/content-get-document.ts
    - apps/staff-web/actions/content-update-document.ts
    - apps/staff-web/actions/content-rename-document.ts
    - apps/staff-web/actions/content-duplicate-document.ts
    - apps/staff-web/actions/content-delete-document.ts
    - apps/staff-web/app/routes/gymos.content_.$id.tsx
  modified:
    - apps/staff-web/app/routes/gymos.content.tsx (replaced CV1 placeholder)
    - apps/staff-web/actions/view-screen.ts (content branch: static stub → live query)
    - apps/staff-web/server/plugins/agent-chat.ts (added Content tab section)
    - apps/staff-web/AGENTS.md (7 content tool rows + two-exposure note)
decisions:
  - "Non-ASCII slug stripping without NFD normalization matches plan expectation: slugify('café & co') = 'caf-co'"
  - "actions-registry.ts is gitignored (auto-generated); dev server restart picks up new content-* actions at runtime"
  - "Link alias: @tiptap/extension-link imported as Link_ to avoid shadowing React Router Link component"
metrics:
  duration: 667s
  completed: "2026-06-20"
  tasks: 3
  files: 14
---

# Phase CV2 Plan 01: Content Tab Summary

**One-liner:** Seven content CRUD actions (create/list/get/update/rename/duplicate/delete) + pure slugify helper (8 unit tests) + SSR list page with optimistic create and DropdownMenu secondary actions + non-collab Tiptap editor (StarterKit+Image+Link) + agent live re-pull + two-exposed agent Content tab tools.

## What Was Built

### Task 1 — content_documents Drizzle table + 7 content actions + slug helper

**Schema (schema.ts):** Added `contentDocuments` Drizzle table export matching the CV1 v20 DDL exactly. Placed after `studioBrainDocs` at file end. Uses existing `table`/`text`/`now()` helpers. Additive only — no migration change.

**Slug helper (server/lib/content-slug.ts):** Pure `slugify()` — lowercases, strips non-ASCII (including accented chars), replaces underscores+non-alphanumeric with hyphens, collapses consecutive hyphens, strips leading/trailing hyphens. 8 unit tests via Vitest in `content-slug.test.ts` (all GREEN). Lives in `server/lib` (not `server/plugins` — Nitro bundling rule enforced).

**7 content actions** (all under `apps/staff-web/actions/`):

| Action | Type | Key behavior |
|--------|------|-------------|
| `content-create-document` | mutation (no http) | Optimistic id, title defaults "Untitled", always 'draft', writeAppState |
| `content-list-documents` | GET read | bodyPreview (HTML-stripped, 180 chars), desc(updatedAt), no full body |
| `content-get-document` | GET read | Full body, NOT_FOUND guard |
| `content-update-document` | mutation | Partial patch, slug recomputes on title change, empty patch no-op |
| `content-rename-document` | mutation | Thin rename verb, slug recompute |
| `content-duplicate-document` | mutation | "(Copy)" suffix, always 'draft', nanoid/newId |
| `content-delete-document` | mutation | Hard delete, idempotent NOT_FOUND success |

All mutations: no `http` key, `guard:allow-unscoped — single-tenant content`, `writeAppState("refresh-signal")`. No `accessFilter`/`ownableColumns`/`assertAccess`/`getRequestUserEmail`/`getRequestOrgId`/`documentShares`/`buildDeepLink` imports.

### Task 2 — Content list page + non-collab Tiptap editor route

**gymos.content.tsx (list page):** Replaced CV1 placeholder. SSR loader queries `contentDocuments` via `getDb()` with `guard:allow-unscoped`. `useChangeVersions(["action"])` + `useRevalidator()` live-refresh (CONT-05). Optimistic New Document (nanoid client-id, navigate immediately, fetch fire-and-forget). DropdownMenu (⋯) with Rename Dialog (Input prefilled), Duplicate (revalidates), Delete AlertDialog. `useNavigationState().sync({ view: "content" })` preserved from CV1.

**gymos.content_.$id.tsx (editor route):** New flat route (trailing `_` escapes nesting, matching `gymos.members_.$id.tsx` convention). Non-collab Tiptap: StarterKit + Placeholder + Image + Link_.configure({ openOnClick: false }). Auto-save on editor blur + title blur + explicit Save button (IconDeviceFloppy). Image insert via shadcn Dialog + Input (no `window.prompt`). Agent live re-pull: when `useChangeVersions` bumps and `pendingBodyRef.current === null`, re-fetch and `editor.commands.setContent(fresh.body, { emitUpdate: false })` without triggering a new pending change. No Yjs/collab/websocket imports anywhere.

### Task 3 — view-screen live content branch + agent Content tab + AGENTS.md

**view-screen.ts:** Replaced CV1 static stub `screen.content = { note: "..." }` with live lazy-import query pattern: fetches `contentDocuments` list (id,title,status,slug,updatedAt) ordered desc. If `nav.documentId` set, also fetches full `selectedContentDocument`. Video branch untouched (CV3 scope). Both queries carry `// guard:allow-unscoped`.

**agent-chat.ts:** Added "Content tab" section naming all 5 mutations + 2 reads as DIRECT (no propose-action gate). Instructs agent: body is Tiptap HTML, pass COMPLETE body (replaces not merges), confirm destructive deletes, documents stay 'draft'.

**AGENTS.md:** Added 7 content tool rows to Agent Actions table (Tier 1 for reads, — for mutations). Added two-exposure note for CV2 matching AE1/AE2/AE3 convention: action files auto-registered + agent-chat.ts Content section + AGENTS.md table; all DIRECT; status stays 'draft' (publishing deferred to CV4).

## Verification

- `npx tsc --noEmit`: CLEAN (0 errors) after each task and final
- `npx vitest run --config vitest.unit.config.ts server/lib/content-slug.test.ts`: 8/8 PASSED
- No `@tiptap/extension-collaboration*`, `y-*`, `yjs`, `hocuspocus`, websocket in new files
- No `accessFilter`/`assertAccess`/`resolveAccess`/`ownableColumns`/`documentShares` imports in content-* actions
- No mutation sets `status: 'published'`
- All destructive UI uses shadcn AlertDialog; no `window.confirm/alert/prompt`
- Mutations have NO `http` key; reads have `http: { method: "GET" }`
- `actions-registry.ts` is gitignored (auto-generated); content-* actions auto-discovered by dev server on next start

## Deviations from Plan

### Auto-fixed Issues

None — all deviations were implementation choices within spec.

### Implementation Notes

**1. [Rule 2 - Missing] actions-registry.ts is gitignored**
- Found during Task 3: `.generated/actions-registry.ts` is in `.gitignore` and auto-generated at dev server start.
- The plan note "restart picks it up" confirms this is the expected behavior.
- Updated the registry file locally (for the tsc check) but did not commit it (correct — it's a generated artifact).
- Content-* actions will be discovered automatically on next deploy or dev server start.

**2. [Design] Link import alias**
- `@tiptap/extension-link` imported as `Link_` to avoid shadowing React Router's `Link` component in the same file.
- No functional impact; consistent naming.

**3. [Design] slug("café & co") = "caf-co"**
- The plan specifies this exact output. Implemented by stripping all non-ASCII as single codepoints (without NFD normalization first), so é (U+00E9 as a single codepoint) is removed entirely rather than decomposed to "e" + combining accent. All 8 unit tests assert the exact documented behavior.

## Known Stubs

None — all plan artifacts are fully implemented. The content tab is functional for list, create, edit, rename, duplicate, and delete. Status remains 'draft' (intentional; CV4 adds publishing).

## Self-Check: PASSED

Files verified present:
- FOUND: apps/staff-web/server/db/schema.ts (contentDocuments export added)
- FOUND: apps/staff-web/server/lib/content-slug.ts
- FOUND: apps/staff-web/server/lib/content-slug.test.ts
- FOUND: apps/staff-web/actions/content-create-document.ts
- FOUND: apps/staff-web/actions/content-list-documents.ts
- FOUND: apps/staff-web/actions/content-get-document.ts
- FOUND: apps/staff-web/actions/content-update-document.ts
- FOUND: apps/staff-web/actions/content-rename-document.ts
- FOUND: apps/staff-web/actions/content-duplicate-document.ts
- FOUND: apps/staff-web/actions/content-delete-document.ts
- FOUND: apps/staff-web/app/routes/gymos.content.tsx (replaced CV1 stub)
- FOUND: apps/staff-web/app/routes/gymos.content_.$id.tsx
- FOUND: apps/staff-web/actions/view-screen.ts (content branch live)
- FOUND: apps/staff-web/server/plugins/agent-chat.ts (Content section)
- FOUND: apps/staff-web/AGENTS.md (content tool rows + two-exposure note)

Commits verified:
- 5ddb4f09 feat(CV2-01): content_documents Drizzle table + 7 content actions + slug helper
- 1bd07cce feat(CV2-01): content list page + non-collab Tiptap editor route
- dc99d2d3 feat(CV2-01): view-screen live content branch + agent Content tab + AGENTS.md
