---
phase: BD3
plan: 03
type: tdd
wave: 1
depends_on: []
files_modified:
  - packages/hq-schema/src/migrations.ts
  - packages/hq-schema/src/schema.ts
  - apps/hq/server/db/schema.ts
  - services/hq-worker/src/lib/gates/ownerOptInGate.ts
  - services/hq-worker/src/lib/gates/ownerOptInGate.test.ts
  - services/hq-worker/src/lib/gates/ownerWindowGate.ts
  - services/hq-worker/src/lib/gates/ownerWindowGate.test.ts
  - services/hq-worker/src/lib/gates/ownerTemplateGate.ts
  - services/hq-worker/src/lib/gates/ownerTemplateGate.test.ts
  - services/hq-worker/src/lib/hq-waba-client.ts
  - services/hq-worker/src/domain/sendOwnerMessage.ts
  - services/hq-worker/src/domain/sendOwnerMessage.test.ts
  - scripts/guard-hqd-no-worker-import.mjs
  - package.json
autonomous: true
requirements: [HQD-01, HQD-03]
must_haves:
  truths:
    - "hq_whatsapp_opt_in and hq_whatsapp_templates tables are created additively (migrations v8, v9) and pass guard-hq-no-pii"
    - "hasOwnerOptIn returns false for a missing row or an opted-out row, true only when a row exists with opted_out_at NULL"
    - "isOwnerInWindow returns false for null lastInboundAt and false when > 24h elapsed"
    - "isOwnerTemplateApproved returns true only for a row with status='approved'"
    - "sendOwnerMessage enforces gate order opt-in → 24h-window → approved-template and throws the typed error at each gate; live send is mocked"
    - "No file under apps/hq/ or services/hq-worker/ imports from services/worker/ or services/edge-webhooks/ (CI guard fails the build otherwise)"
  artifacts:
    - path: "packages/hq-schema/src/migrations.ts"
      provides: "Additive migrations v8 (hq_whatsapp_opt_in) + v9 (hq_whatsapp_templates)"
      contains: "hq_whatsapp_opt_in"
    - path: "services/hq-worker/src/lib/gates/ownerOptInGate.ts"
      provides: "hasOwnerOptIn — mirror of optInGate, HQ-owned"
      exports: ["hasOwnerOptIn"]
    - path: "services/hq-worker/src/lib/gates/ownerWindowGate.ts"
      provides: "isOwnerInWindow — pure 24h gate, HQ-owned"
      exports: ["isOwnerInWindow", "OWNER_WINDOW_HOURS"]
    - path: "services/hq-worker/src/lib/gates/ownerTemplateGate.ts"
      provides: "isOwnerTemplateApproved — HQ-owned"
      exports: ["isOwnerTemplateApproved"]
    - path: "services/hq-worker/src/lib/hq-waba-client.ts"
      provides: "HqWabaClient interface + mock + real factory"
      exports: ["HqWabaClient", "mockHqWabaClient", "createHqWabaClient"]
    - path: "services/hq-worker/src/domain/sendOwnerMessage.ts"
      provides: "Gate-ordered owner send orchestrator (mirror of sendMessage.ts)"
      exports: ["sendOwnerMessage"]
    - path: "scripts/guard-hqd-no-worker-import.mjs"
      provides: "CI guard: no services/worker or services/edge-webhooks import in HQ code"
  key_links:
    - from: "services/hq-worker/src/domain/sendOwnerMessage.ts"
      to: "services/hq-worker/src/lib/gates/ownerOptInGate.ts"
      via: "import hasOwnerOptIn (gate 1)"
      pattern: "hasOwnerOptIn"
    - from: "services/hq-worker/src/domain/sendOwnerMessage.ts"
      to: "services/hq-worker/src/lib/hq-waba-client.ts"
      via: "injected HqWabaClient (mock in tests)"
      pattern: "HqWabaClient"
    - from: "package.json"
      to: "scripts/guard-hqd-no-worker-import.mjs"
      via: "guards chain"
      pattern: "guard:hqd-no-worker-import"
---

<objective>
Build the HQD send foundation: the HQ-own opt-in/template tables (additive migrations), HQ-owned copies of the three compliance gates (D-07 mirror, NEVER import services/worker), a mockable WABA client, and the gate-ordered `sendOwnerMessage` orchestrator (D-09). All built + unit-tested with the WhatsApp client mocked — live sends are deferred-on-external-dependency (D-13). A CI guard enforces the WABA-separation boundary.

Purpose: HQD-01 (HQ WABA opt-in tracking + separation), HQD-03 (24h-window + approved-template gating on the HQ send path).
Output: migrations v8/v9 + Drizzle defs, three gate modules + tests, HqWabaClient mock, sendOwnerMessage + tests, and `guard-hqd-no-worker-import.mjs` wired into `pnpm guards`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/BD3-hq-brain-dispatcher/BD3-CONTEXT.md
@.planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md
@services/worker/src/domain/gates/optInGate.ts
@services/worker/src/domain/gates/windowGate.ts
@services/worker/src/domain/gates/templateGate.ts
@packages/hq-schema/src/migrations.ts
@packages/hq-schema/src/schema.ts

<interfaces>
HQ worker db handle: `import { getHqDb } from "../lib/db.js";` (services/hq-worker/src/lib/db.ts). Schema is exposed through the same module the watchdog uses — confirm how watchdog.ts accesses tables (it uses raw `sql\`\`` via getHqDb().execute). For drizzle-builder gate queries, import the schema barrel the worker exposes; if the worker lib/db.ts does not re-export `schema`, add a `schema` export there from `@gymos/hq-schema/schema` (additive).

Studio gate signatures being MIRRORED (copy logic, adapt names + table — DO NOT import):
```typescript
// optInGate.ts
export async function hasOptIn(memberId: string, db): Promise<boolean>
// → returns rows.length > 0 && rows[0].optedOutAt == null
// windowGate.ts
export const WINDOW_HOURS = 24;
export function isInWindow(lastInboundAt: Date | null, now = new Date()): boolean
// → false if null; else elapsedHours < 24
// templateGate.ts
export async function isTemplateApproved(name: string, db): Promise<boolean>
// → row where name=? AND status='approved'
```

Migration entry shape (packages/hq-schema/src/migrations.ts): `{ version: number; sql: string | { postgres?: string; sqlite?: string } }`. Highest existing version is 7. Use v8 + v9. Dual-dialect (postgres + sqlite) — sqlite uses `datetime('now')`, postgres uses `NOW()`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Additive migrations v8 + v9 + Drizzle defs (hq_whatsapp_opt_in, hq_whatsapp_templates)</name>
  <files>packages/hq-schema/src/migrations.ts, packages/hq-schema/src/schema.ts, apps/hq/server/db/schema.ts</files>
  <read_first>
    - packages/hq-schema/src/migrations.ts (append v8, v9 after v7 — additive only; dual-dialect; ON CONFLICT/IF NOT EXISTS rules in the file header)
    - packages/hq-schema/src/schema.ts (append Drizzle table defs; column names must match SQL exactly; PII-up boundary note)
    - apps/hq/server/db/schema.ts (re-exports @gymos/hq-schema — confirm new tables auto-flow per BD2-01 decision)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 366-429 (exact column definitions, verbatim)
    - scripts/guard-hq-no-pii.mjs lines 1-50 (column-name rule the new tables must pass)
  </read_first>
  <action>
    Append migration v8 to `hqMigrations` (dual-dialect) creating `hq_whatsapp_opt_in` EXACTLY per RESEARCH.md lines 374-385:
    columns id TEXT PK, studio_id TEXT NOT NULL REFERENCES hq_studios(id), owner_email TEXT NOT NULL, phone_e164 TEXT NOT NULL, last_inbound_at TEXT, opted_in_at TEXT NOT NULL DEFAULT NOW()/datetime('now'), opted_out_at TEXT, opt_in_source TEXT NOT NULL DEFAULT 'signup', created_at TEXT NOT NULL DEFAULT NOW(), UNIQUE(studio_id). (ADD `last_inbound_at TEXT` — the window gate needs it; RESEARCH sendOwnerMessage step 2 loads phone_e164 + last_inbound_at from this row.)
    Append migration v9 creating `hq_whatsapp_templates` per RESEARCH.md lines 393-401: id TEXT PK, name TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', language TEXT NOT NULL DEFAULT 'en_US', components_json TEXT, synced_at TEXT, created_at TEXT NOT NULL DEFAULT NOW(). Use `CREATE TABLE IF NOT EXISTS` for both; NO DROP/RENAME.
    Append matching Drizzle defs to `packages/hq-schema/src/schema.ts` per RESEARCH.md lines 409-428 (`hqWhatsappOptIn`, `hqWhatsappTemplates`), adding the `lastInboundAt: text("last_inbound_at")` column to hqWhatsappOptIn. Import helpers from `@agent-native/core/db/schema` (table, text, now) as the existing file does.
    Verify NO column name matches `*connection*`/`*database_url*`/`*dsn*` (it doesn't — phone_e164/owner_email/etc. are clean). owner_email + phone_e164 are GYM-OWNER contact (B2B), not member data — note this in a comment.
    Run prettier on both files.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq-schema build && pnpm guard:hq-no-pii</automated>
  </verify>
  <acceptance_criteria>
    - `packages/hq-schema/src/migrations.ts` contains `version: 8` and `hq_whatsapp_opt_in` and `version: 9` and `hq_whatsapp_templates`
    - migrations use `CREATE TABLE IF NOT EXISTS` and contain no `DROP`/`RENAME`/`TRUNCATE`
    - `packages/hq-schema/src/schema.ts` contains `export const hqWhatsappOptIn` and `export const hqWhatsappTemplates` and `last_inbound_at`
    - `pnpm guard:hq-no-pii` exits 0
    - `pnpm -F @gymos/hq-schema build` exits 0
  </acceptance_criteria>
  <done>Both HQ owner-comms tables exist additively with Drizzle defs; PII guard passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Mirror the three gates (RED→GREEN) + WABA separation CI guard</name>
  <files>services/hq-worker/src/lib/gates/ownerOptInGate.ts, services/hq-worker/src/lib/gates/ownerOptInGate.test.ts, services/hq-worker/src/lib/gates/ownerWindowGate.ts, services/hq-worker/src/lib/gates/ownerWindowGate.test.ts, services/hq-worker/src/lib/gates/ownerTemplateGate.ts, services/hq-worker/src/lib/gates/ownerTemplateGate.test.ts, services/hq-worker/src/lib/db.ts, scripts/guard-hqd-no-worker-import.mjs, package.json</files>
  <read_first>
    - services/worker/src/domain/gates/optInGate.ts (logic to mirror — rows.length>0 && optedOutAt==null)
    - services/worker/src/domain/gates/windowGate.ts (pure 24h function — copy verbatim, rename)
    - services/worker/src/domain/gates/templateGate.ts (name + status='approved')
    - services/hq-worker/src/lib/db.ts (getHqDb; confirm/add schema export)
    - scripts/guard-hq-fork-boundary.mjs (guard authoring pattern to follow for the new guard)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 431-483, 819-839 (HQ gate signatures + ownerOptInGate body verbatim), 627-634 (guard grep patterns)
  </read_first>
  <behavior>
    - ownerOptInGate: no row → false; row + opted_out_at NULL → true; row + opted_out_at set → false
    - ownerWindowGate: lastInboundAt null → false; 23h ago → true; 25h ago → false; OWNER_WINDOW_HOURS === 24
    - ownerTemplateGate: name with status='approved' → true; status='pending' → false; missing → false
  </behavior>
  <action>
    Create `services/hq-worker/src/lib/gates/ownerOptInGate.ts` mirroring optInGate.ts (RESEARCH lines 819-839 give the verbatim body): `export async function hasOwnerOptIn(studioId: string, db: ReturnType<typeof getHqDb>): Promise<boolean>` querying `schema.hqWhatsappOptIn` where `studioId` eq, limit 1, returns `rows.length > 0 && rows[0].optedOutAt == null`. Carry a `// guard:allow-unscoped — HQ send chokepoint; studio_id IS the access check` comment.
    Create `services/hq-worker/src/lib/gates/ownerWindowGate.ts` — copy windowGate.ts verbatim, rename to `OWNER_WINDOW_HOURS = 24` and `isOwnerInWindow(lastInboundAt: Date | null, now = new Date()): boolean`. Pure function, no DB.
    Create `services/hq-worker/src/lib/gates/ownerTemplateGate.ts` mirroring templateGate.ts: `export async function isOwnerTemplateApproved(name: string, db): Promise<boolean>` against `schema.hqWhatsappTemplates` where name eq AND status eq 'approved', limit 1.
    If `services/hq-worker/src/lib/db.ts` does not export `schema`, add `export { schema } from "@gymos/hq-schema/schema";` (or re-export the merged schema the worker already uses) so the gates can reference tables. Do NOT import anything from services/worker.
    Write the three `.test.ts` files (vitest) covering every <behavior> bullet. For DB gates, mock getHqDb / inject a fake db whose `.select().from().where().limit()` resolves a controlled rows array (mirror the testing approach in services/worker/src/domain/gates/optInGate.test.ts — read it for the mock shape). ownerWindowGate is pure → direct assertions.
    Create `scripts/guard-hqd-no-worker-import.mjs` (follow guard-hq-fork-boundary.mjs structure): scan every `.ts`/`.tsx` under `apps/hq/` and `services/hq-worker/` for import/from strings matching `services/worker` or `services/edge-webhooks` (patterns from RESEARCH lines 627-634); print offending file+line and exit 1 if any found, else exit 0. Exclude the guard script itself and comment lines.
    Wire it into package.json: add `"guard:hqd-no-worker-import": "node scripts/guard-hqd-no-worker-import.mjs"` and append ` && pnpm guard:hqd-no-worker-import` to the `"guards"` chain.
    Run prettier on the new .ts files.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq-worker test --run gates && pnpm guard:hqd-no-worker-import</automated>
  </verify>
  <acceptance_criteria>
    - three gate files exist exporting `hasOwnerOptIn`, `isOwnerInWindow`+`OWNER_WINDOW_HOURS`, `isOwnerTemplateApproved`
    - `grep -rn "services/worker" services/hq-worker/src/ apps/hq/` returns nothing (no import of studio worker)
    - `scripts/guard-hqd-no-worker-import.mjs` exists; `package.json` `"guards"` chain contains `guard:hqd-no-worker-import`
    - `pnpm -F @gymos/hq-worker test --run gates` exits 0
    - `pnpm guard:hqd-no-worker-import` exits 0
  </acceptance_criteria>
  <done>Three HQ-owned gates mirror the studio chokepoint, fully unit-tested; CI guard enforces the no-worker-import boundary.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: HqWabaClient mock + sendOwnerMessage orchestrator (gate order, RED→GREEN)</name>
  <files>services/hq-worker/src/lib/hq-waba-client.ts, services/hq-worker/src/domain/sendOwnerMessage.ts, services/hq-worker/src/domain/sendOwnerMessage.test.ts</files>
  <read_first>
    - services/worker/src/domain/sendMessage.ts (gate order to mirror: opt-in → load → window → template → relay → update status)
    - services/hq-worker/src/lib/gates/ownerOptInGate.ts + ownerWindowGate.ts + ownerTemplateGate.ts (created in Task 2)
    - services/hq-worker/src/queues/provision-studio.ts (the injected-client + useMockApis deferred-on-external-dependency pattern from BD2-05)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 485-507, 636-653 (sendOwnerMessage gate order + HqWabaClient mock, verbatim)
  </read_first>
  <behavior>
    - sendOwnerMessage throws OwnerNoOptInError when hasOwnerOptIn is false
    - sendOwnerMessage with payload type 'text' and lastInboundAt out-of-window throws OwnerWindowExpiredError
    - sendOwnerMessage with payload type 'template' and an unapproved template throws OwnerTemplateNotApprovedError
    - sendOwnerMessage with opt-in + in-window text calls client.sendMessage and returns its { wamid }
    - sendOwnerMessage with opt-in + approved template (any window) calls client.sendMessage
    - gates are evaluated in order opt-in → window(text) → template — earlier failure short-circuits
  </behavior>
  <action>
    Create `services/hq-worker/src/lib/hq-waba-client.ts` per RESEARCH lines 636-653: `export interface HqWabaClient { sendMessage(args: { to: string; payload: SendOwnerMessagePayload }): Promise<{ wamid: string }> }`, `export const mockHqWabaClient: HqWabaClient` returning `{ wamid: \`mock-wamid-${Date.now()}\` }`, and `export function createHqWabaClient(phoneNumberId: string, apiToken: string): HqWabaClient` (real impl may throw "deferred-on-external-dependency: HQ WABA not registered" if it's only a stub this phase — that's acceptable; the production path is gated on the manual Meta step). Define and export `SendOwnerMessagePayload = { type: "text"; body: string } | { type: "template"; name: string; vars: Record<string,string>; language?: string }`.
    Create `services/hq-worker/src/domain/sendOwnerMessage.ts` per RESEARCH lines 487-507. Define typed errors `OwnerNoOptInError`, `OwnerWindowExpiredError`, `OwnerTemplateNotApprovedError` (extend Error). Signature:
    ```typescript
    export async function sendOwnerMessage(args: {
      studioId: string;
      messageId: string;
      payload: SendOwnerMessagePayload;
      db: ReturnType<typeof getHqDb>;
      client: HqWabaClient;   // injected — mock in tests, real (or stub) in prod
    }): Promise<{ wamid: string }>
    ```
    Gate order (D-09), exactly:
      1. `if (!await hasOwnerOptIn(studioId, db)) throw new OwnerNoOptInError(...)`
      2. load the hq_whatsapp_opt_in row → phone_e164 + last_inbound_at
      3. if payload.type === "text": `if (!isOwnerInWindow(lastInboundAt)) throw new OwnerWindowExpiredError(...)`
      4. if payload.type === "template": `if (!await isOwnerTemplateApproved(payload.name, db)) throw new OwnerTemplateNotApprovedError(...)`
      5. `const res = await client.sendMessage({ to: phoneE164, payload }); return res;`
    Write `services/hq-worker/src/domain/sendOwnerMessage.test.ts` (vitest) covering every <behavior> bullet, injecting `mockHqWabaClient` and a fake db (mock getHqDb the same way Task 2 gate tests do; or vi.mock the gate modules to control branch outcomes). The mock client means NO live WABA call — this is the deferred-on-external-dependency build (D-13).
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq-worker test --run sendOwnerMessage</automated>
  </verify>
  <acceptance_criteria>
    - `services/hq-worker/src/lib/hq-waba-client.ts` exports `HqWabaClient`, `mockHqWabaClient`, `createHqWabaClient`, `SendOwnerMessagePayload`
    - `services/hq-worker/src/domain/sendOwnerMessage.ts` exports `sendOwnerMessage` and the three typed errors; calls `hasOwnerOptIn` before `isOwnerInWindow` before `isOwnerTemplateApproved`
    - `sendOwnerMessage.test.ts` asserts OwnerNoOptInError, OwnerWindowExpiredError, OwnerTemplateNotApprovedError, and a successful mock send
    - `pnpm -F @gymos/hq-worker test --run sendOwnerMessage` exits 0
  </acceptance_criteria>
  <done>The HQ owner-send orchestrator enforces the chokepoint gate order with a mocked client; live sends deferred-on-external-dependency.</done>
</task>

</tasks>

<verification>
- `pnpm -F @gymos/hq-worker test --run` green (gates + sendOwnerMessage).
- `pnpm -F @gymos/hq-schema build` clean; `pnpm guard:hq-no-pii` passes.
- `pnpm guard:hqd-no-worker-import` passes (WABA-separation boundary enforced).
- Migrations are additive (no DROP/RENAME) — applied to HQ Neon by the runMigrations plugin (note the gymos migration-drift gotcha: HQ Neon picks these up via apps/hq db.ts runMigrations; no manual apply needed since these are in hqMigrations).
- Live WABA send: DEFERRED-ON-EXTERNAL-DEPENDENCY (D-13) — requires HQ WABA second-phone-number registration in Meta Business Manager + Meta template approval. Build + mock-tested now.
</verification>

<success_criteria>
- HQD-01: hq_whatsapp_opt_in tracks gym-owner opt-in, structurally separate from any studio WABA; HQ WABA creds path defined (mock).
- HQD-03: 24h-window + approved-template gating implemented on the HQ-owned send path, mirroring (never importing) the studio chokepoint.
- WABA-separation CI guard live in the guards chain.
</success_criteria>

<output>
After completion, create `.planning/phases/BD3-hq-brain-dispatcher/BD3-03-SUMMARY.md`
</output>
