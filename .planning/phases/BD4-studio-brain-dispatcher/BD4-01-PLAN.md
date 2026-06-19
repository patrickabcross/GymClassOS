---
phase: BD4-studio-brain-dispatcher
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/server/plugins/db.ts
  - apps/staff-web/actions/brain-init.ts
  - apps/staff-web/actions/get-brain-docs.ts
  - apps/staff-web/actions/update-brain-doc.ts
  - apps/staff-web/actions/brain-init.test.ts
  - apps/staff-web/app/routes/gymos.brain.tsx
  - apps/staff-web/app/components/gymos/GymosTopNav.tsx
autonomous: true
requirements: [GOB-01, GOB-02, GOB-03]
must_haves:
  truths:
    - "Studio owner can open /gymos/brain and see brand voice, ethos, and class methods"
    - "Studio owner can edit the brand-voice document; the change persists and is visible after reload"
    - "The class catalog is pre-populated from class_definitions on first Brain load — owner does not hand-seed it"
  artifacts:
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "studioBrainDocs Drizzle table (id, doc_type, title, body, seeded_at, timestamps)"
      contains: "export const studioBrainDocs"
    - path: "apps/staff-web/server/plugins/db.ts"
      provides: "version 16 runMigrations entry creating studio_brain_docs (auto-applied on boot)"
      contains: "version: 16"
    - path: "apps/staff-web/actions/brain-init.ts"
      provides: "idempotent class-catalog seed from class_definitions into studio_brain_docs id='class-catalog'"
      contains: "class-catalog"
    - path: "apps/staff-web/actions/update-brain-doc.ts"
      provides: "defineAction owner edit of brand-voice / ethos doc body"
      exports: ["default"]
    - path: "apps/staff-web/actions/get-brain-docs.ts"
      provides: "GET defineAction reading all studio_brain_docs rows"
      contains: "method: \"GET\""
    - path: "apps/staff-web/app/routes/gymos.brain.tsx"
      provides: "Brain view/edit UI with useChangeVersions live-refresh"
      min_lines: 60
  key_links:
    - from: "apps/staff-web/app/routes/gymos.brain.tsx"
      to: "apps/staff-web/actions/update-brain-doc.ts"
      via: "fetch POST /_agent-native/actions/update-brain-doc"
      pattern: "update-brain-doc"
    - from: "apps/staff-web/app/routes/gymos.brain.tsx"
      to: "apps/staff-web/actions/brain-init.ts"
      via: "fetch on load to seed class-catalog when absent"
      pattern: "brain-init"
    - from: "apps/staff-web/actions/brain-init.ts"
      to: "class_definitions table"
      via: "db.select from schema.classDefinitions"
      pattern: "classDefinitions"
    - from: "apps/staff-web/app/components/gymos/GymosTopNav.tsx"
      to: "/gymos/brain"
      via: "admin-only Link tab"
      pattern: "/gymos/brain"
---

<objective>
Give each studio deploy its own gym-owner Brain: a lightweight `studio_brain_docs` table (brand voice, ethos, class-catalog) in the studio's own Neon, a `/gymos/brain` owner view+edit surface following the `gymos.*` tab convention, and class-catalog auto-ingest from `class_definitions` on Brain init.

Purpose: GOB-01..03 — the studio's brand/ethos becomes editable Brain knowledge; the class catalog is auto-seeded (no hand-entry); owner views and edits it from the staff app. GOD (plan 02) reads `studio_brain_docs id='brand-voice'` for reactivation personalization, with a generic fallback so GOD does not block on this plan.

Output: 3 additive Drizzle tables registered in `db.ts` (this plan owns ALL THREE additive tables — versions 16/17/18 — so plan 02 does not touch the migration file; see Task 1), 3 Brain actions, the `/gymos/brain` route, and the nav tab.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/BD4-studio-brain-dispatcher/BD4-CONTEXT.md
@.planning/phases/BD4-studio-brain-dispatcher/BD4-RESEARCH.md

<interfaces>
<!-- Extracted from codebase. Use these directly — no exploration needed. -->

Migration mechanism — apps/staff-web/server/plugins/db.ts:
  export default runMigrations([ { version: N, sql: '...' }, ... ], { table: "mail_migrations" });
  Current highest version = 15 (BD2-03 token_usage trigger). Next = 16.
  Imports available: import { runMigrations, intType } from "@agent-native/core/db";
  Dual-dialect: use `DEFAULT (datetime('now'))` for TEXT timestamps (SQLite-compatible);
  versions 14/15 demonstrate the pattern. CREATE TABLE IF NOT EXISTS only — additive, never DROP.

Drizzle schema helper — apps/staff-web/server/db/schema.ts line 1:
  import { table, text, integer, real, now } from "@agent-native/core/db/schema";
  Existing tables append at end of file (last is connectedAccounts at line 541).
  `now()` is the default-timestamp helper used by every gym table.

class_definitions (auto-ingest source) — schema.ts:188:
  export const classDefinitions = table("class_definitions", {
    id, name (notNull), description (nullable), durationMin (integer notNull),
    defaultCapacity (integer default 12), category (nullable),
    active (boolean default true), createdAt,
  });

Action pattern — apps/staff-web/actions/list-classes.ts:
  import { defineAction } from "@agent-native/core";
  import { getDb, schema } from "../server/db/index.js";   // NOTE: ../server, .js suffix
  export default defineAction({ description, schema: z.object({...}),
    http: { method: "GET" },   // GET for reads; OMIT http key for mutations
    run: async (input) => { const db = getDb(); ... } });
  guard:allow-unscoped comment required on gym-table queries (single-tenant, no ownableColumns).

Route + live-refresh pattern — apps/staff-web/app/routes/gymos.campaigns.tsx + gymos.forms._index.tsx:
  import { useChangeVersions } from "@agent-native/core/client";
  const actionVersion = useChangeVersions(["action"]);  // use as TanStack/effect dep to refetch on writes
  import { getDb, schema } from "../../server/db";       // NOTE: ../../server from routes
  Routes are FLAT files: gymos.brain.tsx (NOT a routes/gymos/ folder). They render under
  gymos.tsx layout via <Outlet/> and inherit GymosTopNav.

GymosTopNav admin-tab pattern — apps/staff-web/app/components/gymos/GymosTopNav.tsx:
  const isAnalytics = path.startsWith("/gymos/analytics");
  {isAdmin && (<Link to="/gymos/analytics" className={tabClass(isAnalytics)}>Analytics</Link>)}
  Tabler icons only; shadcn primitives only; no emojis-as-icons.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add all three BD4 additive tables (versions 16/17/18) + Drizzle defs</name>
  <files>apps/staff-web/server/db/schema.ts, apps/staff-web/server/plugins/db.ts</files>
  <read_first>
    - apps/staff-web/server/plugins/db.ts (the runMigrations array — versions 1-15; append after line 202)
    - apps/staff-web/server/db/schema.ts (lines 1, 188-232, 541-555 — table() helper, class_definitions/bookings shapes, append point)
    - .planning/phases/BD4-studio-brain-dispatcher/BD4-RESEARCH.md (Section 2 — exact table DDL + Drizzle defs)
  </read_first>
  <action>
    This plan owns ALL THREE additive tables to avoid a db.ts collision with plan 02 (coordination per planning instructions). Plan 02 only READS studioOwnerConfig / reactivationAttempts and references the mirror in the worker — it does NOT edit db.ts.

    In `apps/staff-web/server/plugins/db.ts`, append THREE entries to the runMigrations array (after the version-15 entry, before the closing `]`). Use `CREATE TABLE IF NOT EXISTS` and `DEFAULT (datetime('now'))` for TEXT timestamps (SQLite-compatible, matches versions 14/15):

    version 16 — studio_brain_docs (GOB):
      CREATE TABLE IF NOT EXISTS studio_brain_docs (
        id         TEXT PRIMARY KEY,
        doc_type   TEXT NOT NULL,
        title      TEXT NOT NULL DEFAULT '',
        body       TEXT NOT NULL DEFAULT '',
        seeded_at  TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )

    version 17 — studio_owner_config (consumed by plan 02 GOD; singleton 'singleton'):
      CREATE TABLE IF NOT EXISTS studio_owner_config (
        id                   TEXT PRIMARY KEY,
        owner_phone_e164     TEXT NOT NULL DEFAULT '',
        studio_timezone      TEXT NOT NULL DEFAULT 'Europe/London',
        digest_enabled       INTEGER NOT NULL DEFAULT 1,
        heartbeat_enabled    INTEGER NOT NULL DEFAULT 1,
        heartbeat_batch_size INTEGER NOT NULL DEFAULT 50,
        created_at           TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
      )

    version 18 — reactivation_attempts (consumed by plan 02 GOD suppression ceiling) — two statements: table then index. db.ts entries take ONE sql string; for the index, add a SEPARATE entry version 18 (table) and version 19 (index), OR combine both into one sql with the postgres-safe sequence. Simplest: add version 18 = CREATE TABLE, version 19 = CREATE INDEX:
      version 18: CREATE TABLE IF NOT EXISTS reactivation_attempts (
        id         TEXT PRIMARY KEY,
        member_id  TEXT NOT NULL,
        sent_at    TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
      version 19: CREATE INDEX IF NOT EXISTS idx_reactivation_attempts_member_sent ON reactivation_attempts(member_id, sent_at)

    In `apps/staff-web/server/db/schema.ts`, append THREE Drizzle table defs at the end of the file (after connectedAccounts), using the existing `table`, `text`, `integer`, `now` helpers (already imported line 1):

      export const studioBrainDocs = table("studio_brain_docs", {
        id: text("id").primaryKey(),
        docType: text("doc_type").notNull(),
        title: text("title").notNull().default(""),
        body: text("body").notNull().default(""),
        seededAt: text("seeded_at"),
        createdAt: text("created_at").notNull().default(now()),
        updatedAt: text("updated_at").notNull().default(now()),
      });

      export const studioOwnerConfig = table("studio_owner_config", {
        id: text("id").primaryKey(),
        ownerPhoneE164: text("owner_phone_e164").notNull().default(""),
        studioTimezone: text("studio_timezone").notNull().default("Europe/London"),
        digestEnabled: integer("digest_enabled", { mode: "boolean" }).notNull().default(true),
        heartbeatEnabled: integer("heartbeat_enabled", { mode: "boolean" }).notNull().default(true),
        heartbeatBatchSize: integer("heartbeat_batch_size").notNull().default(50),
        createdAt: text("created_at").notNull().default(now()),
        updatedAt: text("updated_at").notNull().default(now()),
      });

      export const reactivationAttempts = table("reactivation_attempts", {
        id: text("id").primaryKey(),
        memberId: text("member_id").notNull(),
        sentAt: text("sent_at").notNull().default(now()),
        createdAt: text("created_at").notNull().default(now()),
      });

    The schema barrel `apps/staff-web/server/db/index.ts` re-exports `* as schema`, so the new tables auto-flow into `schema.studioBrainDocs` etc. — no barrel edit needed.

    DO NOT add any standalone .sql file under server/db/migrations/ — those are NOT auto-run (migration-drift gotcha). Only the db.ts runMigrations array is auto-applied on boot.
  </action>
  <verify>
    <automated>cd apps/staff-web && grep -q "version: 16" server/plugins/db.ts && grep -q "studio_brain_docs" server/plugins/db.ts && grep -q "studio_owner_config" server/plugins/db.ts && grep -q "reactivation_attempts" server/plugins/db.ts && grep -q "export const studioBrainDocs" server/db/schema.ts && grep -q "export const studioOwnerConfig" server/db/schema.ts && grep -q "export const reactivationAttempts" server/db/schema.ts && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/server/plugins/db.ts` contains `version: 16`, `version: 17`, `version: 18`, `version: 19` and the strings `studio_brain_docs`, `studio_owner_config`, `reactivation_attempts`, `idx_reactivation_attempts_member_sent`
    - `apps/staff-web/server/db/schema.ts` contains `export const studioBrainDocs`, `export const studioOwnerConfig`, `export const reactivationAttempts`
    - No new file under `apps/staff-web/server/db/migrations/` was created (grep -rL is not needed; verify by `git status` showing only schema.ts + db.ts changed in that dir)
    - `grep -c "DROP\|TRUNCATE" apps/staff-web/server/plugins/db.ts` shows no new destructive statements added by this task
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Three additive tables registered in db.ts (auto-applied on boot) and defined in Drizzle schema; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Brain actions — brain-init (class-catalog seed), get-brain-docs, update-brain-doc + test</name>
  <files>apps/staff-web/actions/brain-init.ts, apps/staff-web/actions/get-brain-docs.ts, apps/staff-web/actions/update-brain-doc.ts, apps/staff-web/actions/brain-init.test.ts</files>
  <read_first>
    - apps/staff-web/actions/list-classes.ts (defineAction + getDb/schema import pattern, GET method, guard:allow-unscoped)
    - apps/staff-web/server/db/schema.ts (studioBrainDocs def from Task 1; classDefinitions at line 188)
    - apps/staff-web/server/db/index.ts (getDb/schema barrel — import from "../server/db/index.js")
    - .planning/phases/BD4-studio-brain-dispatcher/BD4-RESEARCH.md (Section 1 — brain-init idempotent upsert; Architecture Patterns block)
  </read_first>
  <action>
    Create three `defineAction` files. All import `import { defineAction } from "@agent-native/core";` and `import { getDb, schema } from "../server/db/index.js";` and use `import { nanoid } from "nanoid";` where an id is generated. Every studio-table query carries `// guard:allow-unscoped — studio-global single-tenant Brain`.

    `apps/staff-web/actions/get-brain-docs.ts` — GET read action (`http: { method: "GET" }`), schema `z.object({})`. Returns all rows from `studio_brain_docs`: `db.select().from(schema.studioBrainDocs)`. Map to `{ id, docType, title, body, seededAt, updatedAt }`.

    `apps/staff-web/actions/brain-init.ts` — mutation (NO http key), schema `z.object({})`. Idempotent class-catalog seed:
      1. Read `class_definitions` active rows: select id, name, description, durationMin, category WHERE active = true, ORDER BY name.
      2. Build JSON array of `{ name, description, durationMin, category }`.
      3. Upsert the `class-catalog` row by primary key `id='class-catalog'`:
         - On Postgres use Drizzle `.onConflictDoUpdate({ target: schema.studioBrainDocs.id, set: { body: <json>, docType: 'class-catalog', title: 'Class Catalog', seededAt: now-iso, updatedAt: now-iso } })`.
         - Insert values: id='class-catalog', docType='class-catalog', title='Class Catalog', body=<json>, seededAt=<iso>, createdAt default, updatedAt default.
      4. ALSO ensure the two editable doc rows exist (idempotent, do-nothing-on-conflict) so the UI always has rows to render:
         - id='brand-voice', docType='brand-voice', title='Brand Voice', body='' — `.onConflictDoNothing()`
         - id='ethos', docType='ethos', title='Studio Ethos', body='' — `.onConflictDoNothing()`
      5. Return `{ seeded: true, classCount: <n> }`.

    `apps/staff-web/actions/update-brain-doc.ts` — mutation (NO http key). schema `z.object({ id: z.enum(["brand-voice", "ethos"]), body: z.string().max(20000) }).strict()`. (`.strict()` so the owner can only edit brand-voice/ethos bodies, never docType/seed/class-catalog.) Update `studio_brain_docs` SET body=input.body, updatedAt=<iso> WHERE id=input.id. Return `{ updated: true, id }`.

    Create `apps/staff-web/actions/brain-init.test.ts` (Vitest). The staff-web vitest config covers `actions/**/*.test.ts` (BD3-04 decision). Test the PURE catalog-shaping logic to avoid DB mocking pain: extract a tiny exported helper `export function buildCatalogBody(defs: {name:string;description:string|null;durationMin:number;category:string|null}[]): string` in brain-init.ts and assert:
      - Given 2 class defs → returns JSON.parse-able string with 2 entries preserving name/description/durationMin/category.
      - Given [] → returns "[]".
    This keeps GOB-02 unit-covered without a live DB.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run actions/brain-init.test.ts && npx tsc --noEmit && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/actions/brain-init.ts` contains `class-catalog`, `classDefinitions`, and `export function buildCatalogBody`
    - `apps/staff-web/actions/brain-init.ts` contains `onConflictDoNothing` (for brand-voice + ethos rows) and an upsert of the class-catalog row
    - `apps/staff-web/actions/update-brain-doc.ts` contains `.strict()` and `z.enum(["brand-voice", "ethos"])`
    - `apps/staff-web/actions/get-brain-docs.ts` contains `method: "GET"`
    - All three action files contain `guard:allow-unscoped`
    - `npx vitest run actions/brain-init.test.ts` exits 0 with the buildCatalogBody cases passing
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>brain-init seeds class-catalog idempotently + ensures editable rows; get-brain-docs reads; update-brain-doc edits brand-voice/ethos only (.strict()); buildCatalogBody unit test green; tsc clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: /gymos/brain route + GymosTopNav tab (view + edit, live-refresh)</name>
  <files>apps/staff-web/app/routes/gymos.brain.tsx, apps/staff-web/app/components/gymos/GymosTopNav.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.campaigns.tsx (useChangeVersions(["action"]) live-refresh; client-side action read via /_agent-native/application-state pattern; getDb/schema from "../../server/db")
    - apps/staff-web/app/routes/gymos.forms._index.tsx (loader/action + useFetcher + shadcn imports + Tabler icons)
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx (admin-only tab pattern: isAnalytics const + {isAdmin && <Link>})
    - .planning/phases/BD4-studio-brain-dispatcher/BD4-RESEARCH.md (Section 1 "/gymos/brain route"; Pitfall 5 — tab must be added to nav)
  </read_first>
  <action>
    Create `apps/staff-web/app/routes/gymos.brain.tsx` — a flat route (renders under gymos.tsx <Outlet/>, inherits GymosTopNav). Owner-facing Brain view+edit. Per AGENTS.md: shadcn primitives only, Tabler icons only, progressive disclosure, optimistic UI.

    Behavior:
      1. On mount, fetch brain docs client-side: `GET /_agent-native/actions/get-brain-docs` (get-brain-docs is a GET action). Use a useEffect/TanStack-style fetch keyed on `useChangeVersions(["action"])` so it refetches after any write. (Mirror the campaigns.tsx client-side read pattern — readAppState throws in a loader, so do the fetch in the component.)
      2. If no `class-catalog` row is returned (or its body is empty), fire `POST /_agent-native/actions/brain-init` once, then refetch. This is the GOB-02 auto-ingest trigger (owner does not hand-seed).
      3. Render three sections with progressive disclosure (shadcn `Accordion` or `Collapsible`):
         - Brand Voice — editable: a `Textarea` bound to the brand-voice body + a Save button.
         - Studio Ethos — editable: a `Textarea` bound to the ethos body + a Save button.
         - Class Methods — read-only: render the class-catalog JSON as a list of class cards (name, durationMin, category, description). Lead with the editable sections; collapse Class Methods by default (progressive disclosure).
      4. Save: optimistic — update local state immediately, then `POST /_agent-native/actions/update-brain-doc` with `{ id: 'brand-voice' | 'ethos', body }`. On success toast via `sonner`; on error roll back + toast. The `useChangeVersions(["action"])` bump re-fetches authoritative state.
      5. Use Tabler icons (e.g. `IconBook`, `IconDeviceFloppy`, `IconBuildingStore`) — never emojis.

    In `apps/staff-web/app/components/gymos/GymosTopNav.tsx`, add the Brain tab (admin-only, mirroring the Analytics tab exactly):
      - `const isBrain = path.startsWith("/gymos/brain");`
      - `{isAdmin && (<Link to="/gymos/brain" className={tabClass(isBrain)}>Brain</Link>)}` placed alongside the other admin tabs (after Analytics).
  </action>
  <verify>
    <automated>cd apps/staff-web && grep -q "/gymos/brain" app/components/gymos/GymosTopNav.tsx && grep -q "isBrain" app/components/gymos/GymosTopNav.tsx && grep -q "useChangeVersions" app/routes/gymos.brain.tsx && grep -q "update-brain-doc" app/routes/gymos.brain.tsx && grep -q "brain-init" app/routes/gymos.brain.tsx && npx tsc --noEmit && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/app/routes/gymos.brain.tsx` exists, is >= 60 lines, contains `useChangeVersions`, `update-brain-doc`, `brain-init`, `get-brain-docs`
    - `gymos.brain.tsx` imports from `@tabler/icons-react` and contains no emoji glyph used as an icon (grep for common emoji ranges returns nothing in icon positions)
    - `gymos.brain.tsx` uses a shadcn primitive for progressive disclosure (`Accordion` or `Collapsible` import from `@/components/ui/...`)
    - `app/components/gymos/GymosTopNav.tsx` contains `isBrain` and `<Link to="/gymos/brain"` gated by `{isAdmin &&`
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>/gymos/brain renders brand-voice + ethos (editable, live-refresh, optimistic) and class methods (read-only, auto-seeded); admin Brain tab visible in GymosTopNav; tsc clean.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` exits 0
- `cd apps/staff-web && npx vitest run actions/brain-init.test.ts` exits 0
- db.ts contains versions 16-19 with the three table DDLs (no standalone .sql, no DROP/TRUNCATE)
- GymosTopNav exposes the admin-only Brain tab; gymos.brain.tsx wires get-brain-docs / brain-init / update-brain-doc with useChangeVersions live-refresh
- No file in this plan modifies services/worker/src/domain/sendMessage.ts (it is not in files_modified)
</verification>

<success_criteria>
GOB-01: studio brand + ethos stored as Brain knowledge (studio_brain_docs brand-voice + ethos rows). GOB-02: class catalog auto-ingested from class_definitions on init (brain-init, no hand-seed). GOB-03: owner views + edits brand voice/ethos from /gymos/brain; edits persist and survive reload (defineAction writes + useChangeVersions live-refresh).
</success_criteria>

<output>
After completion, create `.planning/phases/BD4-studio-brain-dispatcher/BD4-01-SUMMARY.md`
</output>
