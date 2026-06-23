---
phase: MC1-foundation-lead-event
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/server/plugins/db.ts
  - apps/staff-web/server/register-secrets.ts
  - apps/staff-web/server/lib/stage-event-map.ts
  - apps/staff-web/server/lib/stage-event-map.test.ts
autonomous: true
requirements: [CAPI-01, CAPI-02]
user_setup:
  - service: meta
    why: "Meta Conversions API token for server-side Lead events (operator pastes via Settings card in MC1-05; this plan only registers the secret slot)"
    env_vars:
      - name: META_CAPI_TOKEN
        source: "Meta Events Manager → Data Sources → <pixel> → Settings → Conversions API → Generate access token (entered in Settings card, stored in app_secrets — NOT an env var)"

must_haves:
  truths:
    - "studio_owner_config has meta_pixel_id, meta_test_event_code, meta_stage_event_map columns"
    - "meta_lead_attribution table exists keyed uniquely by member_id"
    - "stageEventMap resolver returns Lead/Contact/Purchase/Schedule defaults when config is null, and honors a configured override"
    - "META_CAPI_TOKEN is a registered required secret so it surfaces in Settings"
  artifacts:
    - path: "apps/staff-web/server/plugins/db.ts"
      provides: "Additive migrations v31 (studio_owner_config Meta columns) + v32 (meta_lead_attribution table)"
      contains: "version: 31"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "metaLeadAttribution Drizzle export + meta columns on studioOwnerConfig"
      contains: "metaLeadAttribution"
    - path: "apps/staff-web/server/lib/stage-event-map.ts"
      provides: "resolveStageEvent() pure resolver with 4 defaults"
      exports: ["resolveStageEvent", "DEFAULT_STAGE_EVENT_MAP"]
    - path: "apps/staff-web/server/register-secrets.ts"
      provides: "META_CAPI_TOKEN registration"
      contains: "META_CAPI_TOKEN"
  key_links:
    - from: "schema.ts metaLeadAttribution export"
      to: "meta_lead_attribution table (migration v32)"
      via: "column names match exactly"
      pattern: "meta_lead_attribution"
---

<objective>
Lay the data + config foundation for Meta Conversion Tracking: the `meta_lead_attribution` table, additive Meta config columns on the `studio_owner_config` singleton, the server-side `stageEventMap` resolver (full 4-event map per D-05, MC1 only uses `Lead`), and registration of the `META_CAPI_TOKEN` secret slot.

Purpose: Everything downstream (worker sender, submit wiring, Settings card) reads/writes these structures. This plan creates the contracts; nothing here calls Meta.
Output: Two additive migrations (v31, v32), a `metaLeadAttribution` Drizzle export + 3 new columns on `studioOwnerConfig`, a tested `resolveStageEvent()` resolver, and a registered `META_CAPI_TOKEN` required secret.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/MC1-foundation-lead-event/MC1-CONTEXT.md
@.planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Additive migrations v31 + v32 (studio_owner_config Meta columns + meta_lead_attribution table)</name>
  <files>apps/staff-web/server/plugins/db.ts</files>
  <read_first>
    - apps/staff-web/server/plugins/db.ts — read the full `runMigrations([...])` array; the highest existing version is v30 (verified). Note the SQL style used by recent migrations (v27–v30) and that this file uses `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` against Neon Postgres.
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 8" and "Pattern 9" — the exact column lists.
  </read_first>
  <action>
    Append TWO new migration entries to the `runMigrations([...])` array in `server/plugins/db.ts`. Use the next free version numbers: **v31** then **v32**. Both MUST be idempotent (safe to run twice) and strictly additive — NO DROP/RENAME/TRUNCATE. This is Neon Postgres; use Postgres types (`JSONB`, `TIMESTAMPTZ`, `NOW()`), NOT SQLite `datetime('now')`.

    v31 — Meta config columns on the singleton (use a single statement block per existing migration style):
    ```sql
    ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT;
    ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT;
    ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS meta_stage_event_map JSONB;
    ```

    v32 — the attribution table + index:
    ```sql
    CREATE TABLE IF NOT EXISTS meta_lead_attribution (
      id                TEXT PRIMARY KEY,
      member_id         TEXT NOT NULL UNIQUE,
      fbc               TEXT,
      fbp               TEXT,
      fbclid            TEXT,
      initial_event_id  TEXT,
      page_url          TEXT,
      client_ip         TEXT,
      client_user_agent TEXT,
      lead_sent_at      TIMESTAMPTZ,
      lead_status       TEXT,
      contact_sent_at   TIMESTAMPTZ,
      purchase_sent_at  TIMESTAMPTZ,
      schedule_sent_at  TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_meta_lead_attribution_member ON meta_lead_attribution(member_id);
    ```

    `member_id` is `UNIQUE` (one attribution row per member — the upsert in MC1-04 relies on `ON CONFLICT (member_id)`). `meta_stage_event_map` is `JSONB` (null until the operator configures it; the resolver applies defaults when null). Do NOT seed any row here — the `studio_owner_config` singleton is upserted elsewhere.

    NOTE the migration-drift gotcha (project memory): these migrations are NOT auto-applied to the gymos-demo Neon by a build — they run via `runMigrations` on app boot. The SUMMARY must flag that the operator/executor confirms v31+v32 applied to gymos-demo Neon (`billowing-sun-51091059`) after deploy.
  </action>
  <verify>
    <automated>grep -n "version: 31" apps/staff-web/server/plugins/db.ts && grep -n "version: 32" apps/staff-web/server/plugins/db.ts && grep -n "meta_lead_attribution" apps/staff-web/server/plugins/db.ts && grep -n "meta_stage_event_map JSONB" apps/staff-web/server/plugins/db.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/server/plugins/db.ts` contains `version: 31` and `version: 32`
    - v31 block contains `ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT`, `meta_test_event_code TEXT`, and `meta_stage_event_map JSONB`
    - v32 block contains `CREATE TABLE IF NOT EXISTS meta_lead_attribution` with `member_id TEXT NOT NULL UNIQUE` and columns `fbc, fbp, fbclid, initial_event_id, page_url, client_ip, client_user_agent, lead_sent_at, lead_status, contact_sent_at, purchase_sent_at, schedule_sent_at`
    - v32 block contains `CREATE INDEX IF NOT EXISTS idx_meta_lead_attribution_member`
    - No `DROP`, `RENAME`, or `TRUNCATE` token appears in either new migration block
    - No `datetime('now')` in the new blocks (Postgres uses `NOW()`)
  </acceptance_criteria>
  <done>Two additive, idempotent Postgres migrations (v31 config columns, v32 attribution table) appended to runMigrations.</done>
</task>

<task type="auto">
  <name>Task 2: Drizzle exports — metaLeadAttribution table + meta columns on studioOwnerConfig</name>
  <files>apps/staff-web/server/db/schema.ts</files>
  <read_first>
    - apps/staff-web/server/db/schema.ts — read the `studioOwnerConfig` definition (~line 646) to match its `table(...)`/column-helper style (e.g. `text(...)`, `timestamp(...)`), and read an existing single-tenant table near `gymMembers` (~line 109) to copy the exact import helpers and `guard:allow-unscoped` comment convention used on gym tables.
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 8" and "Pattern 9" for the column list.
  </read_first>
  <action>
    Add the Drizzle definitions matching the v31/v32 migration columns EXACTLY (same snake_case DB names).

    1. Extend the existing `studioOwnerConfig` table export — add three columns using the same column helpers already imported in this file:
    ```typescript
    metaPixelId: text("meta_pixel_id"),
    metaTestEventCode: text("meta_test_event_code"),
    metaStageEventMap: text("meta_stage_event_map"), // JSONB column; read/write as JSON string
    ```
    (Map JSONB as `text(...)` to avoid introducing a new column-type import; the worker/resolver `JSON.parse`s it. If the file already imports a `jsonb` helper, you may use `jsonb("meta_stage_event_map")` instead — match whatever the file already does for JSONB columns.)

    2. Add a NEW exported table `metaLeadAttribution`:
    ```typescript
    export const metaLeadAttribution = table("meta_lead_attribution", {
      id: text("id").primaryKey(),
      memberId: text("member_id").notNull().unique(),
      fbc: text("fbc"),
      fbp: text("fbp"),
      fbclid: text("fbclid"),
      initialEventId: text("initial_event_id"),
      pageUrl: text("page_url"),
      clientIp: text("client_ip"),
      clientUserAgent: text("client_user_agent"),
      leadSentAt: timestamp("lead_sent_at"),
      leadStatus: text("lead_status"),
      contactSentAt: timestamp("contact_sent_at"),
      purchaseSentAt: timestamp("purchase_sent_at"),
      scheduleSentAt: timestamp("schedule_sent_at"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    });
    ```
    Use the exact `table` alias and `timestamp`/`text` helper names this file already uses (it may import them as `pgTable`/`timestamp` — match the file). `meta_lead_attribution` is a single-tenant gym table (no `ownableColumns`, no `studio_id`) — it carries no per-user access scoping; downstream raw-SQL reads add the `// guard:allow-unscoped — single-tenant meta attribution` marker comment.

    Run prettier on the file after editing.
  </action>
  <verify>
    <automated>grep -n "metaLeadAttribution" apps/staff-web/server/db/schema.ts && grep -n "meta_pixel_id" apps/staff-web/server/db/schema.ts && grep -n "initial_event_id" apps/staff-web/server/db/schema.ts</automated>
  </verify>
  <acceptance_criteria>
    - `schema.ts` exports `metaLeadAttribution` mapping table `meta_lead_attribution`
    - `metaLeadAttribution` has `memberId` mapped to `member_id` with `.notNull().unique()`
    - `metaLeadAttribution` includes columns mapping to `fbc, fbp, fbclid, initial_event_id, page_url, client_ip, client_user_agent, lead_sent_at, lead_status, contact_sent_at, purchase_sent_at, schedule_sent_at, created_at, updated_at`
    - `studioOwnerConfig` now contains `meta_pixel_id`, `meta_test_event_code`, and `meta_stage_event_map`
    - Every DB column name in the export string-matches a column created in v31/v32 (no typos)
  </acceptance_criteria>
  <done>schema.ts exposes metaLeadAttribution + the three new studioOwnerConfig columns, names matching v31/v32 exactly.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: stageEventMap resolver (full 4-event map, D-05) + META_CAPI_TOKEN secret registration</name>
  <files>apps/staff-web/server/lib/stage-event-map.ts, apps/staff-web/server/lib/stage-event-map.test.ts, apps/staff-web/server/register-secrets.ts</files>
  <read_first>
    - apps/staff-web/server/register-secrets.ts — read the existing `registerRequiredSecret(...)` calls to copy the exact registration signature/shape (key, label/description fields) used for other secrets.
    - .planning/phases/MC1-foundation-lead-event/MC1-RESEARCH.md § "Pattern 12" — the resolver spec.
    - apps/staff-web/server/lib/ — confirm this is where pure helpers live (NOT server/plugins/, which require a default plugin export per the Vercel/Nitro gotcha).
  </read_first>
  <behavior>
    - resolveStageEvent(null, "lead") === "Lead"
    - resolveStageEvent(undefined, "contact") === "Contact"
    - resolveStageEvent('{"lead":"Lead","contact":"Contact","purchase":"Purchase","schedule":"Schedule"}', "purchase") === "Purchase"
    - resolveStageEvent('{"lead":"CustomLeadName"}', "lead") === "CustomLeadName" (override honored)
    - resolveStageEvent('{"lead":"CustomLeadName"}', "contact") === "Contact" (missing key falls back to default)
    - resolveStageEvent("not-json{{{", "lead") === "Lead" (malformed JSON falls back to defaults, never throws)
  </behavior>
  <action>
    Create `apps/staff-web/server/lib/stage-event-map.ts` exporting a pure resolver (no DB, no I/O) — this is the full 4-event map per D-05 even though MC1 only calls it with `"lead"`:
    ```typescript
    export const DEFAULT_STAGE_EVENT_MAP = {
      lead: "Lead",
      contact: "Contact",
      purchase: "Purchase",
      schedule: "Schedule",
    } as const;

    export type StageKey = keyof typeof DEFAULT_STAGE_EVENT_MAP;

    export function resolveStageEvent(
      configJson: string | null | undefined,
      stage: StageKey,
    ): string {
      if (!configJson) return DEFAULT_STAGE_EVENT_MAP[stage];
      try {
        const map = JSON.parse(configJson) as Record<string, string>;
        const v = map[stage];
        return typeof v === "string" && v.length > 0 ? v : DEFAULT_STAGE_EVENT_MAP[stage];
      } catch {
        return DEFAULT_STAGE_EVENT_MAP[stage];
      }
    }
    ```
    Accept either a JSON string OR an already-parsed object: if the file's `metaStageEventMap` Drizzle column reads back as an object (JSONB driver), the resolver should also accept `Record<string,string>`. Add an overload/union: `configJson: string | Record<string, string> | null | undefined` and branch — if it's an object, read `stage` directly with the same fallback; if a string, `JSON.parse`. Keep it pure and never-throw.

    Create `apps/staff-web/server/lib/stage-event-map.test.ts` — a Vitest unit suite covering every case in <behavior> above (including the object-input branch: `resolveStageEvent({ lead: "Lead" }, "contact") === "Contact"`).

    In `apps/staff-web/server/register-secrets.ts`, register `META_CAPI_TOKEN` as a required secret using the same `registerRequiredSecret(...)` shape already present in the file — key `"META_CAPI_TOKEN"`, a human label like "Meta Conversions API token", description noting it is read at runtime by the Fly worker for server-side CAPI sends. Do NOT add it as an env var or a studio_owner_config column — it lives only in `app_secrets`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run server/lib/stage-event-map.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/server/lib/stage-event-map.ts` exports `resolveStageEvent` and `DEFAULT_STAGE_EVENT_MAP`
    - `DEFAULT_STAGE_EVENT_MAP` equals `{ lead: "Lead", contact: "Contact", purchase: "Purchase", schedule: "Schedule" }`
    - `resolveStageEvent("not-json{{{", "lead")` returns `"Lead"` (no throw) — covered by a passing test
    - The test file asserts the override case (`'{"lead":"CustomLeadName"}'` → `"CustomLeadName"`) and the object-input case
    - `npx vitest run server/lib/stage-event-map.test.ts` passes (all cases green)
    - `register-secrets.ts` contains `META_CAPI_TOKEN` inside a `registerRequiredSecret` call
    - `stage-event-map.ts` lives in `server/lib/`, NOT `server/plugins/`
  </acceptance_criteria>
  <done>Tested pure resolver returns the 4 defaults + honors overrides + never throws; META_CAPI_TOKEN registered as a required secret.</done>
</task>

</tasks>

<verification>
- `version: 31` and `version: 32` present in db.ts; both additive + idempotent (IF NOT EXISTS); no DROP/RENAME/TRUNCATE.
- `metaLeadAttribution` exported from schema.ts with column names matching v32 exactly.
- `resolveStageEvent` test suite passes.
- `META_CAPI_TOKEN` registered.
- `npx tsc --noEmit` in apps/staff-web has no new errors introduced by these files.
</verification>

<success_criteria>
- CAPI-02: `meta_lead_attribution` table exists (migration + Drizzle export), keyed uniquely by member_id, persisting fbc/fbp/initial_event_id + per-stage markers.
- CAPI-01 (foundation): pixelId/testEventCode/stageEventMap columns exist on studio_owner_config; META_CAPI_TOKEN registered as an app_secret slot; stageEventMap resolver returns the 4 defaults and honors overrides.
</success_criteria>

<output>
After completion, create `.planning/phases/MC1-foundation-lead-event/MC1-01-SUMMARY.md`.
Flag in the SUMMARY: v31+v32 migrations must be confirmed applied to gymos-demo Neon (billowing-sun-51091059) after deploy (migration-drift gotcha — not auto-run by build).
</output>
