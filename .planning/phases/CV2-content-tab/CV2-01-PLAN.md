---
phase: CV2-content-tab
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/actions/content-list-documents.ts
  - apps/staff-web/actions/content-create-document.ts
  - apps/staff-web/actions/content-get-document.ts
  - apps/staff-web/actions/content-update-document.ts
  - apps/staff-web/actions/content-rename-document.ts
  - apps/staff-web/actions/content-duplicate-document.ts
  - apps/staff-web/actions/content-delete-document.ts
  - apps/staff-web/server/lib/content-slug.ts
  - apps/staff-web/server/lib/content-slug.test.ts
  - apps/staff-web/app/routes/gymos.content.tsx
  - apps/staff-web/app/routes/gymos.content_.$id.tsx
  - apps/staff-web/actions/view-screen.ts
  - apps/staff-web/server/plugins/agent-chat.ts
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [CONT-01, CONT-02, CONT-03, CONT-04, CONT-05]

must_haves:
  truths:
    - "Staff can open /gymos/content and see a list of content_documents (title, status, updated time)"
    - "Staff can click 'New document' and a draft appears immediately (optimistic) and persists"
    - "Staff can open a document in a Tiptap editor and type headings/lists/links/images; body saves on blur or manual save — no Yjs/collab/websocket"
    - "Staff can rename, duplicate (new draft '(Copy)'), and delete (shadcn AlertDialog) a document"
    - "The right-rail agent can create and edit content documents via two-exposed defineAction tools"
    - "Agent writes appear in the list + editor without a reload (useChangeVersions live-refresh)"
  artifacts:
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "contentDocuments Drizzle table export (id,title,body,status,slug,createdAt,updatedAt)"
      contains: "content_documents"
    - path: "apps/staff-web/actions/content-create-document.ts"
      provides: "Create draft document (optimistic id support)"
    - path: "apps/staff-web/actions/content-list-documents.ts"
      provides: "List document metadata (GET)"
      exports: ["default"]
    - path: "apps/staff-web/actions/content-get-document.ts"
      provides: "Get one document with full body (GET)"
    - path: "apps/staff-web/actions/content-update-document.ts"
      provides: "Update title/body of a document"
    - path: "apps/staff-web/actions/content-rename-document.ts"
      provides: "Rename a document title"
    - path: "apps/staff-web/actions/content-duplicate-document.ts"
      provides: "Duplicate document as new draft '(Copy)'"
    - path: "apps/staff-web/actions/content-delete-document.ts"
      provides: "Delete a document"
    - path: "apps/staff-web/app/routes/gymos.content.tsx"
      provides: "Content list page (replaces CV1 placeholder)"
      min_lines: 80
    - path: "apps/staff-web/app/routes/gymos.content_.$id.tsx"
      provides: "Non-collab Tiptap editor route"
      min_lines: 120
    - path: "apps/staff-web/server/lib/content-slug.ts"
      provides: "Pure slugify helper (unit-tested)"
  key_links:
    - from: "apps/staff-web/app/routes/gymos.content.tsx"
      to: "/_agent-native/actions/content-list-documents"
      via: "loader getDb query OR client fetch + useChangeVersions revalidate"
      pattern: "content-list-documents|contentDocuments"
    - from: "apps/staff-web/app/routes/gymos.content_.$id.tsx"
      to: "/_agent-native/actions/content-get-document + content-update-document"
      via: "fetch on load, save on blur/manual"
      pattern: "content-(get|update)-document"
    - from: "apps/staff-web/actions/content-*.ts (mutations)"
      to: "application_state refresh-signal"
      via: "writeAppState after write"
      pattern: "writeAppState"
    - from: "apps/staff-web/server/plugins/agent-chat.ts"
      to: "content-* tools"
      via: "Content tab section in system prompt"
      pattern: "content-create-document|Content tab"
---

<objective>
Build the full Content tab lifecycle on the flat `content_documents` table (CV1 migration v20): list, create, edit (non-collab Tiptap), rename, duplicate, delete — for both staff (UI) and the right-rail agent (two-exposed `defineAction` tools). Edits stay live via `useChangeVersions(["action"])`. Status stays `'draft'` (publishing is CV4 — out of scope here).

Purpose: Realizes CONT-01..05 — staff and agent author rich content documents inside `/gymos/content`, matching the established agent-native four-area pattern (UI · actions · agent/instructions · application_state).

Output: 7 content actions + 1 slug helper (+ test) + list page + editor route + view-screen content branch (live data) + agent-chat Content section + AGENTS.md rows.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/CV1-foundation/CV1-01-SUMMARY.md
@CLAUDE.md
@AGENTS.md
@apps/staff-web/AGENTS.md

# Prior art to adapt (HQ non-collab Content — uses the HEAVIER agent-native `documents` schema; adapt the SHAPE, do NOT copy verbatim):
@apps/hq/actions/content-create-document.ts
@apps/hq/actions/content-list-documents.ts
@apps/hq/actions/content-get-document.ts
@apps/hq/actions/content-update-document.ts
@apps/hq/app/routes/content._index.tsx
@apps/hq/app/routes/content.$id.tsx

# Established staff-web action + UI + agent patterns to MATCH:
@apps/staff-web/actions/update-member.ts
@apps/staff-web/actions/save-segment.ts
@apps/staff-web/app/routes/gymos.members.tsx
@apps/staff-web/actions/view-screen.ts
@apps/staff-web/server/plugins/agent-chat.ts

# CV1 placeholder to replace + DB plumbing:
@apps/staff-web/app/routes/gymos.content.tsx
@apps/staff-web/server/db/index.ts

<interfaces>
<!-- The CV1 migration (db.ts v20) created this FLAT table. content_documents is NOT yet a Drizzle export — Task 1 adds it. -->
<!-- DDL already applied (CV1): -->
<!--
content_documents:
  id         TEXT PRIMARY KEY
  title      TEXT NOT NULL DEFAULT ''
  body       TEXT NOT NULL DEFAULT ''        ← column is `body` (NOT `content` like the HQ documents table)
  status     TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published'))
  slug       TEXT
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
-->

Drizzle table-def pattern (from schema.ts — `table`, `text`, `now()` already imported there):
```typescript
export const contentDocuments = table("content_documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("draft"),
  slug: text("slug"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});
```

defineAction mutation contract (from update-member.ts / save-segment.ts):
```typescript
// Mutation: NO `http` key (agent + frontend both POST to /_agent-native/actions/<name>;
// a GET would suppress the source:"action" live-refresh signal the tabs listen for).
export default defineAction({
  description: "...",        // rich, agent-facing
  schema: z.object({ ... }), // .strict() optional but recommended
  run: async (args) => { ...; await writeAppState("refresh-signal", { ts: Date.now() }); return {...}; },
});
// Read action: add `http: { method: "GET" }` (and optionally readOnly: true) — list/get.
```

Live-refresh pattern (from gymos.members.tsx):
```typescript
const revalidator = useRevalidator();
const actionVersion = useChangeVersions(["action"]);
useEffect(() => { if (actionVersion > 0) revalidator.revalidate(); }, [actionVersion]);
```

Tiptap non-collab editor (from apps/hq content.$id.tsx — self-contained, no separate component):
useEditor({ extensions: [StarterKit, Placeholder, Image, Link], ... }) — Image + Link deps already present
(@tiptap/extension-image, @tiptap/extension-link confirmed in package.json). NO @tiptap/extension-collaboration,
NO y-* / yjs / hocuspocus.

Tabler icons + shadcn components used (Button, Card, Skeleton, AlertDialog, DropdownMenu, Input) — all present.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: content_documents Drizzle table + 7 content actions + slug helper</name>
  <files>
apps/staff-web/server/db/schema.ts,
apps/staff-web/server/lib/content-slug.ts,
apps/staff-web/server/lib/content-slug.test.ts,
apps/staff-web/actions/content-list-documents.ts,
apps/staff-web/actions/content-create-document.ts,
apps/staff-web/actions/content-get-document.ts,
apps/staff-web/actions/content-update-document.ts,
apps/staff-web/actions/content-rename-document.ts,
apps/staff-web/actions/content-duplicate-document.ts,
apps/staff-web/actions/content-delete-document.ts
  </files>
  <behavior>
    content-slug.ts (pure helper, unit-tested in content-slug.test.ts via Vitest):
    - slugify("Welcome to HIIT!") === "welcome-to-hiit"
    - slugify("  Multiple   Spaces  ") === "multiple-spaces"
    - slugify("Already-slugged_v2") === "already-slugged-v2"
    - slugify("") === "" (empty → empty; caller falls back to id)
    - slugify("café & co") strips accents/punctuation → "cafe-co" (or "caf-co" if no transliteration — assert the exact output you implement; keep deterministic)
    - Test 1..N cover: lowercasing, space→hyphen collapse, punctuation strip, leading/trailing hyphen trim, empty string.
  </behavior>
  <action>
Adapt the HQ content actions to the FLAT `content_documents` table. The HQ versions target the heavier agent-native `documents` schema (ownerEmail/orgId/visibility/shares/versions/position/icon/isFavorite). STRIP ALL of that — this is single-tenant, flat. DO NOT import `assertAccess`, `accessFilter`, `resolveAccess`, `ownableColumns`, `documentShares`, `documentVersions`, `getRequestUserEmail`, `getRequestOrgId`, or `buildDeepLink`. The column is `body` (NOT `content`).

1. **schema.ts** — Append a `contentDocuments` Drizzle table export matching the CV1 v20 DDL exactly (see `<interfaces>` block). Use the existing `table`/`text`/`now()` helpers already imported at the top of schema.ts. Additive only — no migration change (CV1 already applied v20). Place near the studioBrainDocs block at the file end.

2. **server/lib/content-slug.ts** — Pure `export function slugify(s: string): string` (lowercase, trim, replace non-alphanumeric runs with `-`, collapse repeats, strip leading/trailing `-`). MUST live in `server/lib` (NEVER `server/plugins` — Nitro bundling rule). No DB, no side effects. Write `content-slug.test.ts` FIRST (RED), then implement (GREEN) per `<behavior>`.

3. **content-create-document.ts** (mutation, no `http`): schema `{ id?: string (optimistic), title?: string, body?: string }`. Generate id via `nanoid` (import from `"nanoid"` like save-segment.ts) if not supplied. title defaults to `"Untitled"`. status `'draft'`. slug = `slugify(title) || id`. Insert into `contentDocuments`. `// guard:allow-unscoped — single-tenant content` on the query. `await writeAppState("refresh-signal", { ts: Date.now() })`. Return `{ id, title, status, slug, createdAt, updatedAt }`. Rich `description` so the agent knows it drafts a new content document.

4. **content-list-documents.ts** (read, `http: { method: "GET" }`, `readOnly: true`): select id,title,status,slug,updatedAt,createdAt + a `bodyPreview` (first ~180 chars of body, whitespace-collapsed; strip HTML tags with a simple `.replace(/<[^>]*>/g, " ")` since body is Tiptap HTML) ordered by `desc(updatedAt)`. `// guard:allow-unscoped`. Return `{ documents: [...] }`. Description notes it does NOT return full bodies (use content-get-document).

5. **content-get-document.ts** (read, GET, `readOnly: true`): schema `{ id: string }`. Select the row by id; throw/return `{ error: "NOT_FOUND" }` if missing. Return full `{ id, title, body, status, slug, createdAt, updatedAt }`. `// guard:allow-unscoped`.

6. **content-update-document.ts** (mutation, no `http`): schema `{ id: string, title?: string, body?: string }`. Resolve row (return `{ error: "NOT_FOUND" }` if missing). Build a partial update of only changed fields; if title changes, also recompute `slug = slugify(title) || id`. Set `updatedAt = new Date().toISOString()`. Empty patch → `{ updated: false, reason: "no changes" }`. `// guard:allow-unscoped`. `writeAppState("refresh-signal", ...)`. Return `{ updated: true }` (or the row). Rich description: "rewrite/edit the body or retitle a content document" so agent uses it for "rewrite the intro paragraph".

7. **content-rename-document.ts** (mutation, no `http`): schema `{ id: string, title: string }` (min 1). Update title + recompute slug + updatedAt. NOT_FOUND guard. `// guard:allow-unscoped`. writeAppState. Return `{ renamed: true, title, slug }`. (Thin wrapper over update — keep it as its own action so the agent + the inline rename UI have a clear verb.)

8. **content-duplicate-document.ts** (mutation, no `http`): schema `{ id: string, newId?: string (optimistic) }`. Load source; if missing → `{ error: "NOT_FOUND" }`. Insert a NEW row: id = newId || nanoid(), title = `${source.title} (Copy)`, body = source.body, status `'draft'` (never copy published state), slug = `slugify(newTitle) || newId`, fresh timestamps. `// guard:allow-unscoped`. writeAppState. Return `{ id, title, status, slug }`.

9. **content-delete-document.ts** (mutation, no `http`): schema `{ id: string }`. Hard delete the row (per hard_constraints: hard delete behind AlertDialog is acceptable; do NOT add a deleted_at column / no new migration). NOT_FOUND is a no-op success (idempotent) → `{ deleted: true }`. `// guard:allow-unscoped`. writeAppState. Return `{ deleted: true }`.

All actions: import `{ defineAction } from "@agent-native/core"`, `{ getDb, schema } from "../server/db/index.js"`, `{ writeAppState } from "@agent-native/core/application-state"`, `{ z } from "zod"`, drizzle ops (`eq`, `desc`) as needed. Match the file-header comment style + error-return style of update-member.ts. Content authoring/editing is DIRECT (staff-only authoring, like update-member) — NO propose-action gate, NO publish/status mutation here.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run server/lib/content-slug.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>contentDocuments exported from schema.ts; 7 content-*.ts actions exist (3 reads GET, 4 mutations no-http for create/update/rename/duplicate/delete — note create is also a mutation, total mutations = create/update/rename/duplicate/delete = 5; reads = list/get = 2... = 7 actions); slugify unit tests pass; tsc clean. No accessFilter/ownableColumns/shares/versions imports; column is `body`; status never set to 'published'.</done>
</task>

<task type="auto">
  <name>Task 2: Content list page + non-collab Tiptap editor route (optimistic + live-refresh)</name>
  <files>
apps/staff-web/app/routes/gymos.content.tsx,
apps/staff-web/app/routes/gymos.content_.$id.tsx
  </files>
  <action>
Replace the CV1 placeholder list page and add the editor route. Match the staff-web look (gymos.members.tsx) — shadcn + Tabler only, clean surface, progressive disclosure for secondary actions.

**gymos.content.tsx (list — replaces placeholder):**
- Use a `loader` that queries `contentDocuments` directly via `getDb()` (like gymos.members.tsx loader — SSR-safe, single query), selecting id/title/status/slug/updatedAt + a body preview, ordered `desc(updatedAt)`. `// guard:allow-unscoped — single-tenant content`. (Loader avoids a client round-trip; the agent's writes still surface via revalidator below.)
- Keep the existing `useNavigationState().sync({ view: "content" })` on mount (do NOT drop it — CV1 wired view-screen to read it; Task 3 makes that branch live).
- Live-refresh: `useRevalidator()` + `useChangeVersions(["action"])` effect (exact pattern from gymos.members.tsx) so agent creates/edits/deletes refresh the list with no reload (CONT-05).
- Header: "Content" + count Badge + a "New document" Button (IconPlus). Each row links to `/gymos/content/${id}` showing title, a `status` Badge (draft), body preview line, and relative updated time (reuse a small relativeTime helper). shadcn `Card` list like gymos.members / hq content._index. Empty state with IconFileText + a New-document CTA.
- **Optimistic New document:** generate a client `nanoid()` id immediately, POST `content-create-document` with `{ id, title: "Untitled" }`, and `navigate(\`/gymos/content/${id}\`)` WITHOUT awaiting the response (optimistic — per hard_constraints; the editor route will fetch-get and the row persists). On error, toast via `sonner` and stay.
- **Row secondary actions via shadcn DropdownMenu (⋯)** (progressive disclosure — do NOT add inline buttons cluttering each row):
  - Rename → open a shadcn `Dialog` with an Input prefilled with the title; on submit POST `content-rename-document`.
  - Duplicate → generate a client newId, POST `content-duplicate-document` with `{ id, newId }`; optimistic — navigate or let revalidator refresh.
  - Delete → shadcn `AlertDialog` confirm; on confirm POST `content-delete-document`. (AlertDialog mandatory — never window.confirm.)
- Admin-gated like the rest (the route is already under the admin cluster per CV1; no extra gate needed unless gymos.tsx requires it — match sibling routes).

**gymos.content_.$id.tsx (editor — new flat route, trailing `_` escapes nesting like gymos.members_.$id.tsx):**
- Adapt apps/hq/app/routes/content.$id.tsx (self-contained non-collab Tiptap). Changes:
  - Fetch via `GET /_agent-native/actions/content-get-document?id=...`; field is `body` (NOT `content`).
  - Save via `POST /_agent-native/actions/content-update-document` with `{ id, title?, body? }`.
  - useEditor extensions: `[StarterKit, Placeholder, Image, Link.configure({ openOnClick: false })]` — import `Image` from `@tiptap/extension-image`, `Link` from `@tiptap/extension-link` (deps present). This satisfies CONT-02 "headings, lists, links, and insert images". Provide a minimal image-insert affordance (a toolbar button that prompts for a URL via a shadcn Dialog/Input and `editor.chain().focus().setImage({ src }).run()` — NO browser prompt()).
  - Auto-save on editor blur + title blur + an explicit Save Button (IconDeviceFloppy), exactly like the HQ editor. DROP the favorite star (no isFavorite column on the flat table).
  - Back link → `/gymos/content`.
  - **Live-refresh of the OPEN editor (CONT-05 criterion 5 — "agent edits an existing document and the editor reflects the updated content live"):** add `useChangeVersions(["action"])`; when it bumps AND there is no unsaved local edit pending (pendingContentRef is null), re-fetch the document and `editor.commands.setContent(fresh.body, { emitUpdate: false })`. Guard against clobbering the user's in-progress typing (only re-pull when no pending change).
  - shadcn Skeleton loading + error state (reuse HQ structure).
- NO Yjs/collab/websocket anywhere. NO @tiptap/extension-collaboration import.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <done>gymos.content.tsx lists documents (loader + live-refresh + New-document optimistic + ⋯ DropdownMenu with Rename Dialog / Duplicate / Delete AlertDialog); gymos.content_.$id.tsx renders a non-collab Tiptap editor (StarterKit+Placeholder+Image+Link) wired to content-get/content-update with blur+manual save and agent-edit live re-pull; tsc clean; no collab/Yjs/websocket imports; no window.confirm/prompt.</done>
</task>

<task type="auto">
  <name>Task 3: view-screen content branch (live data) + agent two-exposure (system prompt + AGENTS.md)</name>
  <files>
apps/staff-web/actions/view-screen.ts,
apps/staff-web/server/plugins/agent-chat.ts,
apps/staff-web/AGENTS.md
  </files>
  <action>
Complete the four-area contract: context-awareness + agent exposure + docs.

1. **view-screen.ts** — Replace the CV1 static `content` branch (currently `screen.content = { note: "..." }`) with a LIVE query, mirroring the `members`/`forms` branches' lazy-import pattern:
   ```
   } else if (nav?.view === "content") {
     const { getDb, schema } = await import("../server/db/index.js");
     const { eq, desc } = await import("drizzle-orm");
     const db = getDb();
     // guard:allow-unscoped — single-tenant content
     const documents = await db.select({ id, title, status, slug, updatedAt }).from(schema.contentDocuments).orderBy(desc(updatedAt)).limit(100);
     screen.content = { documents };
     if (nav?.documentId) { // selected doc → full body so agent can "rewrite the intro"
       // guard:allow-unscoped — single-tenant content
       const [doc] = await db.select().from(schema.contentDocuments).where(eq(schema.contentDocuments.id, nav.documentId)).limit(1);
       if (doc) screen.selectedContentDocument = doc;
     }
   }
   ```
   Leave the `video` branch as its CV1 stub (CV3 owns it).

2. **agent-chat.ts** — Add a "Content tab" section to the system prompt, placed alongside the existing Forms / Schedule / Members / Campaigns tab sections (insert after the Campaigns tab block, before "How you act — three tiers"). Match their voice. Name all agent-callable content tools and that they are DIRECT (no propose-action gate), e.g.:
   ```
   Content tab (when the coach is on /gymos/content — call view-screen first to see which documents exist and which is selected):
   - content-create-document — draft a new content document ({title?, body?}). body is rich-text HTML (headings, lists, links, images). Returns {id,title,status,slug}. Use for "draft a welcome post for our new HIIT class".
   - content-update-document — rewrite or retitle a document ({id, title?, body?}). Use for "rewrite the intro paragraph to be more energetic". Pass the COMPLETE new body HTML (replaces, not merges).
   - content-rename-document — rename a document ({id, title}).
   - content-duplicate-document — copy a document as a new draft "(Copy)" ({id}).
   - content-delete-document — delete a document ({id}). The coach confirms destructive deletes in the UI.
   - All content actions are DIRECT (no approval gate) — staff-only authoring. Documents stay in 'draft' status; publishing arrives later.
   ```
   Keep body guidance accurate: the editor stores Tiptap HTML, so the agent should write HTML (or simple markdown-ish HTML) bodies.

3. **apps/staff-web/AGENTS.md** — Add the 5 content tools to the "Agent Actions (LLM tools)" table (content-create-document, content-update-document, content-rename-document, content-duplicate-document, content-delete-document) plus content-list-documents / content-get-document as read tools, with Tier + Use For + Returns columns matching existing rows. Add a "Two-exposure rule — CV2 content actions" note block (mirroring the AE3/AE2/AE1 notes) stating: action files in `actions/` (auto-registered) AND named in `agent-chat.ts` Content section AND documented here; all DIRECT (no propose-action gate); status stays 'draft' (publishing deferred to CV4).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <done>view-screen content branch returns live {documents} + selectedContentDocument (on nav.documentId); agent-chat.ts has a Content tab section naming all content tools as DIRECT; AGENTS.md table + two-exposure note updated; tsc clean. video branch untouched. No publish/status-mutation tools introduced.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` → 0 errors (run after each task).
- `cd apps/staff-web && npx vitest run server/lib/content-slug.test.ts` → slug helper tests pass.
- No `@tiptap/extension-collaboration*`, `y-*`, `yjs`, `hocuspocus`, or websocket imports anywhere in the new files.
- No `accessFilter` / `assertAccess` / `resolveAccess` / `ownableColumns` / `documentShares` / `documentVersions` imports in any content-*.ts action; every content_documents query carries `// guard:allow-unscoped`.
- No mutation action sets `status: 'published'` (publishing is CV4).
- All destructive UI uses shadcn AlertDialog; no `window.confirm/alert/prompt`.
- Mutations have NO `http` key; reads have `http: { method: "GET" }`.
- Post-merge / Vercel deploy (manual, not part of tsc gate — no local dev server): /gymos/content lists docs; New document opens editor optimistically; agent "draft a welcome post for our new HIIT class" creates a doc visible without reload; agent "rewrite the intro" updates the open editor live.
</verification>

<success_criteria>
CONT-01: /gymos/content lists content_documents (title, status, updated time). ✔ Task 2 (loader) + Task 1 (list action).
CONT-02: Create + non-collab Tiptap editor (headings/lists/links/images), save on blur/manual, no Yjs. ✔ Task 1 (create/get/update) + Task 2 (editor route).
CONT-03: Rename / duplicate ("(Copy)") / delete (AlertDialog). ✔ Task 1 (rename/duplicate/delete actions) + Task 2 (⋯ DropdownMenu UI).
CONT-04: Agent creates + edits via two-exposed defineAction tools. ✔ Task 1 (actions) + Task 3 (agent-chat + AGENTS.md).
CONT-05: Edits + agent writes stay live (useChangeVersions). ✔ Task 2 (list revalidator + editor re-pull).
</success_criteria>

<output>
After completion, create `.planning/phases/CV2-content-tab/CV2-01-SUMMARY.md` using the summary template.
</output>
