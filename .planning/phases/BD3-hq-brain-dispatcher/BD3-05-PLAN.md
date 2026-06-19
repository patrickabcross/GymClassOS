---
phase: BD3
plan: 05
type: execute
wave: 2
depends_on: ["BD3-03"]
files_modified:
  - apps/hq/app/routes/content._index.tsx
  - apps/hq/app/routes/content.$id.tsx
  - apps/hq/actions/content-create-document.ts
  - apps/hq/actions/content-list-documents.ts
  - apps/hq/actions/content-get-document.ts
  - apps/hq/actions/content-update-document.ts
  - apps/hq/server/db/content-schema.ts
  - apps/hq/server/db/index.ts
  - packages/hq-schema/src/migrations.ts
  - apps/hq/MODIFICATIONS.md
autonomous: true
requirements: [HQD-04, HQD-05]
must_haves:
  truths:
    - "Operator can open the HQ Content surface, create a document, edit it in a non-collab Tiptap editor, and see it persist on reload"
    - "The Content fork contains NO Yjs/CRDT/collab/Notion code (single super-admin, D-03/D-10)"
    - "Content documents are scoped to the HQ org (HQ_ORG_ID) so they are non-empty for the super-admin"
    - "Every file copied from templates/content is recorded in apps/hq/MODIFICATIONS.md"
    - "HQD-05 Video is present only as a thin deferred stub (no Remotion render cluster)"
  artifacts:
    - path: "apps/hq/server/db/content-schema.ts"
      provides: "Content documents table (copied from templates/content, ownableColumns)"
      contains: "documents"
    - path: "apps/hq/app/routes/content.$id.tsx"
      provides: "Non-collab Tiptap document editor"
    - path: "apps/hq/actions/content-create-document.ts"
      provides: "create-document action (no Notion/collab)"
  key_links:
    - from: "apps/hq/app/routes/content.$id.tsx"
      to: "apps/hq/actions/content-update-document.ts"
      via: "save via useActionMutation"
      pattern: "update-document"
    - from: "apps/hq/server/db/index.ts"
      to: "apps/hq/server/db/content-schema.ts"
      via: "merged into HQ schema barrel"
      pattern: "content-schema"
---

<objective>
Copy the agent-native Content surface into apps/hq on the NON-COLLAB path (D-10 / BD1 D-03 — single super-admin, no Yjs/CRDT/Notion), so the operator's dispatcher agent can generate marketing Content for the GymClassOS website from Brain insights. Sequence Video (HQD-05) LAST as a thin deferred stub (D-11 — no Remotion render cluster).

Purpose: HQD-04 (Content from Brain insights), HQD-05 (Video — deferred stub).
Output: forked Content routes + document CRUD actions + documents schema (additive migration), all collab/Notion code dropped, every copy recorded in MODIFICATIONS.md; a Video placeholder.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/BD3-hq-brain-dispatcher/BD3-CONTEXT.md
@.planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md
@apps/hq/server/db/index.ts
@apps/hq/MODIFICATIONS.md

<interfaces>
HQ schema barrel (apps/hq/server/db/index.ts): `export const schema = { ...dispatchSchema, ...brainSchema, ...hqSchema };` — add `...contentSchema` here so document tables flow into the merged HQ db handle (mirror how brain-schema.ts is composed). Register shareable resources the same way Brain sources are registered (registerShareableResource) IF the Content documents table uses ownableColumns()+createSharesTable().

HQ_ORG_ID = "hq-org-gymclassos-v1" (from @gymos/hq-schema/constants) — documents created by the super-admin scope to this org via assertAccess/accessFilter (RESEARCH lines 600-604).

Content fork scope (RESEARCH lines 584-606):
KEEP: app/routes document list + editor, _index; actions create/list/get/update/delete/search-documents + navigate; server/db/schema.ts (documents + documentShares); server/lib/documents.ts; components/editor/VisualEditor.tsx + DocumentToolbar.tsx; EmptyState.tsx + layout.
DROP: all @tiptap collaboration extensions, yjs, y-protocols; CommentsSidebar/NotionConflictBanner/NotionSyncBar; add-comment/list-comments actions; all connect/link/pull/push/sync-notion actions; useCollaborativeDoc hook (replace with plain Tiptap, no Y-awareness).
Pitfall 5: do NOT copy any server plugin whose name contains collab/yjs/websocket/hocuspocus — they crash on Vercel serverless.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Copy Content documents schema (non-collab) + additive migration + wire into HQ db</name>
  <files>apps/hq/server/db/content-schema.ts, apps/hq/server/lib/documents.ts, apps/hq/server/db/index.ts, packages/hq-schema/src/migrations.ts, apps/hq/MODIFICATIONS.md</files>
  <read_first>
    - templates/content/server/db/schema.ts (documents + documentShares table defs — copy the documents path only)
    - templates/content/server/lib/documents.ts (document helpers)
    - apps/hq/server/db/index.ts (schema barrel composition + registerShareableResource pattern)
    - apps/hq/server/db/brain-schema.ts (how a copied-out template schema is structured in apps/hq)
    - packages/hq-schema/src/migrations.ts (append the documents table as additive v10)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 584-606 (fork scope + copy-out discipline)
  </read_first>
  <action>
    Create `apps/hq/server/db/content-schema.ts` by copying the `documents` (+ `documentShares` if present) Drizzle table defs from `templates/content/server/db/schema.ts`. Keep ownableColumns()/createSharesTable() so org-scoping works. DROP any collab/Notion columns (e.g. notion_page_id, yjs state blob) — keep title, body/content, timestamps, ownable columns. Copy `apps/hq/server/lib/documents.ts` from templates/content/server/lib/documents.ts, stripping any Notion/collab references.
    Add the documents table(s) as additive migration v10 in `packages/hq-schema/src/migrations.ts` (dual-dialect, `CREATE TABLE IF NOT EXISTS`, NO collab/notion columns). Mirror the column types to the Drizzle def exactly.
    Wire into `apps/hq/server/db/index.ts`: `import * as contentSchema from "./content-schema.js";` and add `...contentSchema` to the `schema` object. If documents use ownableColumns()+shares, add a `registerShareableResource({ type: "content-document", ... })` block mirroring the brain-source registration.
    Record EVERY copied file in `apps/hq/MODIFICATIONS.md` with origin path `templates/content/...` + date + reason "HQD-04 Content fork (non-collab)".
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq exec tsc --noEmit && pnpm guard:hq-no-pii</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/server/db/content-schema.ts` exists and exports a `documents` table
    - content-schema.ts contains NO `yjs`/`collab`/`notion` substring (case-insensitive)
    - `apps/hq/server/db/index.ts` contains `contentSchema` in the merged schema
    - `packages/hq-schema/src/migrations.ts` contains `version: 10` creating the documents table additively
    - `apps/hq/MODIFICATIONS.md` lists the copied templates/content files
    - `pnpm -F @gymos/hq exec tsc --noEmit` exits 0; `pnpm guard:hq-no-pii` exits 0
  </acceptance_criteria>
  <done>HQ has a non-collab documents schema wired into the HQ db with an additive migration; copies are logged.</done>
</task>

<task type="auto">
  <name>Task 2: Copy document CRUD actions + Content routes (non-collab Tiptap)</name>
  <files>apps/hq/actions/content-create-document.ts, apps/hq/actions/content-list-documents.ts, apps/hq/actions/content-get-document.ts, apps/hq/actions/content-update-document.ts, apps/hq/app/routes/content._index.tsx, apps/hq/app/routes/content.$id.tsx, apps/hq/package.json, apps/hq/MODIFICATIONS.md</files>
  <read_first>
    - templates/content/actions/create-document.ts, list-documents.ts, get-document.ts, update-document.ts (copy these; skip notion/comment actions)
    - templates/content/app/routes/_app._index.tsx + the document editor route (copy; strip collab)
    - templates/content/app/components/editor/VisualEditor.tsx + DocumentToolbar.tsx (Tiptap editor — remove Collaboration/CollaborationCaret extensions + useCollaborativeDoc)
    - apps/hq/actions/ask-brain.ts (HQ defineAction + getDb pattern to align imports)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 584-606, 737-745 (fork scope + Pitfall 5 no collab server plugins)
  </read_first>
  <action>
    Copy the four core document actions into apps/hq/actions/ with `content-` prefix (to avoid collision with existing HQ action names): `content-create-document.ts`, `content-list-documents.ts`, `content-get-document.ts`, `content-update-document.ts`. Adapt imports to apps/hq's `getDb`/`schema` from `../server/db/index.js` and the contentSchema tables. Keep assertAccess/accessFilter org-scoping (HQ_ORG_ID). DROP add-comment/list-comments and ALL notion actions — do not copy them.
    Create `apps/hq/app/routes/content._index.tsx` (document list, "New document" CTA, EmptyState) and `apps/hq/app/routes/content.$id.tsx` (the editor). Copy the Tiptap editor (VisualEditor + DocumentToolbar) but REMOVE: `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-caret`, `@tiptap/y-tiptap`, any `yjs`/`y-protocols` import, `useCollaborativeDoc`, CommentsSidebar/NotionConflictBanner/NotionSyncBar. Replace collaborative doc state with a plain controlled Tiptap editor whose content saves via `content-update-document` (useActionMutation). Do NOT copy any server plugin matching collab/yjs/websocket/hocuspocus (Pitfall 5 — crashes Vercel serverless).
    Add the new Tiptap (non-collab) deps to apps/hq/package.json only if they are not already present (check first — apps/hq may already have base @tiptap from the Dispatch fork). Do NOT add any y-* or collaboration extension.
    Add a nav entry so the operator reaches /content (same mechanism as the /studios and /provisioning routes).
    Record all copied files in apps/hq/MODIFICATIONS.md.
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/actions/content-create-document.ts`, `content-list-documents.ts`, `content-get-document.ts`, `content-update-document.ts` all exist and use `defineAction`
    - `apps/hq/app/routes/content._index.tsx` and `content.$id.tsx` exist
    - `grep -rin "collaboration\|yjs\|y-protocols\|hocuspocus\|useCollaborativeDoc\|notion" apps/hq/app/routes/content.$id.tsx apps/hq/app/routes/content._index.tsx` returns nothing
    - content.$id.tsx references `content-update-document` (save path)
    - `pnpm -F @gymos/hq exec tsc --noEmit` exits 0; `pnpm guard:hq-fork-boundary` exits 0
  </acceptance_criteria>
  <done>HQ Content surface lets the operator create/edit/persist documents in a non-collab Tiptap editor; CRUD actions are HQ-org-scoped; no collab/Notion code present.</done>
</task>

<task type="auto">
  <name>Task 3: HQD-05 Video — thin deferred stub</name>
  <files>apps/hq/app/routes/content.video.tsx</files>
  <read_first>
    - apps/hq/app/routes/content._index.tsx (place the Video entry alongside Content)
    - .planning/REQUIREMENTS.md lines 59, 97 (HQD-05 lowest priority; Remotion render cluster out of scope)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-CONTEXT.md D-11 (Video last, may slip, no render cluster)
  </read_first>
  <action>
    Create a minimal `apps/hq/app/routes/content.video.tsx` (path `/content/video`) that renders a shadcn Card explaining Video generation is planned (HQD-05) and is deferred-on-external-dependency: the dedicated Remotion render cluster is out of scope (REQUIREMENTS non-goal). Show a single disabled "Generate video (coming soon)" Button with an IconVideo (Tabler). NO Remotion install, NO render pipeline, NO worker queue. This satisfies HQD-05 as the explicit thin stub per D-11 — it must not pull in heavy infra.
    Add a nav/link from the Content surface to /content/video.
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/app/routes/content.video.tsx` exists, renders a Card + disabled Button, references HQD-05/deferred
    - no `remotion` dependency added to apps/hq/package.json (`grep remotion apps/hq/package.json` returns nothing)
    - `pnpm -F @gymos/hq exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>HQD-05 is represented as a deferred thin stub with no Remotion/render-cluster footprint.</done>
</task>

</tasks>

<verification>
- `pnpm -F @gymos/hq exec tsc --noEmit` clean across schema, actions, routes.
- `pnpm guard:hq-fork-boundary` passes; every copied templates/content file recorded in apps/hq/MODIFICATIONS.md.
- `pnpm guard:hq-no-pii` passes (documents table has no PII-shaped columns).
- No collab/Yjs/Notion/Hocuspocus/Remotion code or deps in the fork (Pitfall 5 + D-11).
- Migration v10 is additive (no DROP/RENAME).
- No local dev walkthrough (P1c) — editor persistence verified on the HQ Vercel deploy after merge.
</verification>

<success_criteria>
- HQD-04: operator can generate/edit marketing Content from the HQ surface, org-scoped, non-collab.
- HQD-05: Video present as a deferred thin stub, no render cluster.
- Fork-boundary discipline preserved (MODIFICATIONS.md ledger complete).
</success_criteria>

<output>
After completion, create `.planning/phases/BD3-hq-brain-dispatcher/BD3-05-SUMMARY.md`
</output>
