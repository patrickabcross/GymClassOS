---
phase: quick-260611-dxv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/lib/csv-leads.ts
  - apps/staff-web/scripts/import-ghl-contacts.ts
  - apps/staff-web/actions/import-leads.ts
  - apps/staff-web/app/components/gymos/ImportLeadsDialog.tsx
  - apps/staff-web/app/routes/gymos.inbox.tsx
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [DXV-CSV-IMPORT]
must_haves:
  truths:
    - "A coach in the Leads view (/gymos/inbox?filter=leads) sees an 'Import leads' button"
    - "Selecting a CSV shows a preview: detected column mapping, importable row count, opted-in count, skip breakdown, and up to 5 sample rows"
    - "Confirming the import inserts gym_members, whatsapp_opt_in (for consented rows), and conversations with status='lead'"
    - "Imported leads appear in the Leads list without a page navigation away"
    - "Re-uploading the same CSV inserts 0 duplicate members (idempotent)"
  artifacts:
    - path: "apps/staff-web/server/lib/csv-leads.ts"
      provides: "Shared header auto-detection (SYNONYMS), detectHeaders, normalizePhone, parseConsent, parseConsentDate, parseLeadsCsv"
      min_lines: 120
    - path: "apps/staff-web/actions/import-leads.ts"
      provides: "defineAction that parses CSV text, dry-run previews, and commits member/opt-in/lead-conversation upserts"
      min_lines: 80
    - path: "apps/staff-web/app/components/gymos/ImportLeadsDialog.tsx"
      provides: "shadcn Dialog upload + preview + confirm UI"
      min_lines: 100
  key_links:
    - from: "apps/staff-web/app/components/gymos/ImportLeadsDialog.tsx"
      to: "apps/staff-web/actions/import-leads.ts"
      via: "fetch POST /_agent-native/actions/import-leads"
      pattern: "import-leads"
    - from: "apps/staff-web/actions/import-leads.ts"
      to: "apps/staff-web/server/lib/csv-leads.ts"
      via: "import parseLeadsCsv"
      pattern: "parseLeadsCsv"
    - from: "apps/staff-web/actions/import-leads.ts"
      to: "conversations(status='lead')"
      via: "raw SQL upsert mirroring features/forms/handlers/submissions.ts"
      pattern: "'lead'"
    - from: "apps/staff-web/app/routes/gymos.inbox.tsx"
      to: "apps/staff-web/app/components/gymos/ImportLeadsDialog.tsx"
      via: "render in Leads view header when isLeadsView"
      pattern: "ImportLeadsDialog"
---

<objective>
Add a CSV bulk-upload interface with column auto-detection to the Leads view of the inbox (`/gymos/inbox?filter=leads`). A coach clicks "Import leads", picks a CSV, sees an auto-detected column mapping + preview (row count, opted-in count, skip breakdown, sample rows), confirms, and the contacts land as leads in the Leads list.

Purpose: Coaches can bulk-load lead lists (GoHighLevel exports, spreadsheet contacts) into the inbox Leads funnel without running the CLI script — the same auto-detection / E.164 normalization / dedup / idempotency the CLI already has, now in the UI.

Output: A shared CSV-leads library (reused by the existing CLI script + the new action), an `import-leads` action, and an `ImportLeadsDialog` surfaced in the Leads view header.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@AGENTS.md
@apps/staff-web/AGENTS.md

# The existing CLI importer — REUSE its logic, do not re-derive it
@apps/staff-web/scripts/import-ghl-contacts.ts

# The canonical lead-upsert pattern that makes a contact appear in the Leads view.
# The import action MUST mirror this member→conversation(status='lead')→message flow
# (member upsert by email/phone partial-unique, re-select canonical id, conversation
# upsert ON CONFLICT (member_id, channel)). This is what surfaces a lead in
# /gymos/inbox?filter=leads.
@apps/staff-web/features/forms/handlers/submissions.ts

# The inbox route — Leads view is ?filter=leads (isLeadsView in loader). The Leads
# list header (around line 645-685) is where the Import button goes.
@apps/staff-web/app/routes/gymos.inbox.tsx

# Action conventions — defineAction, guard:allow-unscoped on gym tables
@apps/staff-web/actions/suggest-template-vars.ts

# Dialog/fetcher conventions to mirror for the new dialog
@apps/staff-web/app/components/gymos/TemplatesDialog.tsx

<interfaces>
<!-- Key contracts the executor needs. Extracted from codebase — do NOT re-explore. -->

Schema (apps/staff-web/server/db/schema.ts):
```ts
gymMembers: { id (pk text), userId?, firstName (notNull), lastName?, email?,
  phoneE164?, marketingConsent (bool, default false), createdAt, updatedAt }
// partial UNIQUE indexes (migration 0003): gym_members_email_unique (email WHERE NOT NULL),
//   gym_members_phone_unique (phone_e164 WHERE NOT NULL)

conversations: { id (pk text), memberId (notNull), channel ('whatsapp' default),
  status ('open'|'closed'|'snoozed'|'lead', default 'open'), unreadCount, lastInboundAt,
  lastOutboundAt, lastMessagePreview, createdAt, updatedAt }
// UNIQUE index (migration 0003): conversations_member_channel_unique (member_id, channel)

whatsappOptIn: { memberId (pk text), optedInAt, evidenceMessageId?, evidencePayload?,
  source ('inbound_reply'|'manual_admin'|'import'), optedOutAt? }
```

Existing CLI importer exports (currently NOT exported — Task 1 extracts these into csv-leads.ts):
```ts
function normalize(h: string): string                       // lowercase alphanumeric
const SYNONYMS: Record<string, string[]>                    // firstName/lastName/email/phone/marketingConsent/unsubscribed/consentDate
type FieldMapping = { firstName?, lastName?, email?, phone?, marketingConsent?, unsubscribed?, consentDate? }
function detectHeaders(rawHeaders: string[]): FieldMapping
function normalizePhone(raw: string): string | null         // E.164, UK +44 default; null if ambiguous
function parseConsent(row, mapping): boolean                // unsubscribed inverts; marketingConsent truthy-set
function parseConsentDate(row, mapping, fallback): string   // ISO
```

Raw-SQL execution pattern against Neon (used throughout staff-web — submissions.ts §9):
```ts
const db2 = db as any as { execute: (q: unknown) => Promise<{ rows: unknown[] }> };
await db2.execute(sql`INSERT ... ON CONFLICT ... DO UPDATE ...`);
const { rows: [r] } = await db2.execute(sql`SELECT id FROM ... LIMIT 1`); // re-select canonical id
```

Action HTTP endpoint (auto-mounted by defineAction): POST /_agent-native/actions/import-leads
with JSON body { csvText, dryRun }. Frontend calls it via fetch (file text is small).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract shared CSV-leads library and refactor the CLI script onto it</name>
  <files>apps/staff-web/server/lib/csv-leads.ts, apps/staff-web/scripts/import-ghl-contacts.ts</files>
  <action>
Create `apps/staff-web/server/lib/csv-leads.ts` exporting the pure (no-DB, no-fs) logic currently inlined in `scripts/import-ghl-contacts.ts`. Move these VERBATIM (copy the implementations exactly — do not re-derive the regexes or synonym lists; they are tuned):
  - `normalize(h: string): string`
  - `SYNONYMS` map + `FieldMapping` type
  - `detectHeaders(rawHeaders: string[]): FieldMapping`
  - `normalizePhone(raw: string): string | null`
  - `TRUTHY_CONSENT`, `TRUTHY_UNSUB` sets
  - `parseConsent(row, mapping): boolean`
  - `parseConsentDate(row, mapping, fallback): string`
Export all of them (`export function` / `export const` / `export type`).

Also add ONE new higher-level pure function to the library so both the CLI and the action share row-processing, not just primitives:
```ts
export type ParsedLeadRow = {
  firstName: string; lastName: string | null; email: string | null;
  phoneE164: string; consent: boolean; consentDate: string;
  consentColumn: string | null; consentValue: string;
};
export type ParseLeadsResult = {
  mapping: FieldMapping;
  rawHeaders: string[];
  members: ParsedLeadRow[];        // de-duped within file (by phone, then email)
  totalRows: number;
  counts: { importable: number; optedIn: number; notOptedIn: number;
    skipNoFirstName: number; skipNoValidPhone: number; skipDuplicateInFile: number };
  missingFields: string[];          // 'firstName' and/or 'phone' if not detected
};
// existingPhones lets the caller subtract DB dupes; nowIso is the consent-date fallback.
export function parseLeadsCsv(
  rows: Record<string, string>[],
  opts: { existingPhones?: Set<string>; nowIso: string },
): ParseLeadsResult & { counts: { skipAlreadyInDb: number } }
```
`parseLeadsCsv` must reproduce the CLI's exact row loop (sections 2,3,5 of the script): detect headers, compute `missingFields` (firstName/phone), then iterate rows applying skipNoFirstName → normalizePhone/skipNoValidPhone → within-file phone dedup (skipDuplicateInFile) → existingPhones DB dedup (skipAlreadyInDb) → within-file email dedup (with the same `seenPhones.delete` undo as the script) → build ParsedLeadRow. It MUST NOT touch the DB or fs (caller passes already-parsed rows + existingPhones).

Then refactor `scripts/import-ghl-contacts.ts`: delete the inlined copies of the moved functions and `import { ..., parseLeadsCsv } from "../server/lib/csv-leads.js"`. Replace the script's section 5 row loop with a call to `parseLeadsCsv(rows, { existingPhones, nowIso: NOW_ISO })`, then build the `members`/`optIns` insert arrays from the returned `members` (the script still owns CSV file reading via fs/csv-parse, the existingPhones DB SELECT, the report printout, and the chunked bulkInsert commit — keep all of that). The script's CLI behaviour (dry-run report, `--commit`, idempotency, hard-error on missing firstName/phone) MUST be unchanged.

Note the ESM import extension: sibling code imports server modules as `.js` even from `.ts` (see submissions.ts `from "../../../server/db/index.js"`); the script is run via tsx so use `../server/lib/csv-leads.js`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String -Pattern "csv-leads|import-ghl-contacts" -Quiet; if ($LASTEXITCODE -ne 0) { exit 0 } </automated>
  </verify>
  <done>csv-leads.ts exists exporting detectHeaders/normalizePhone/parseConsent/parseConsentDate/parseLeadsCsv; import-ghl-contacts.ts imports from it with zero inlined duplicates of the moved functions; `npx tsc --noEmit` in apps/staff-web reports no new errors in either file.</done>
</task>

<task type="auto">
  <name>Task 2: Add import-leads action + ImportLeadsDialog and surface it in the Leads view</name>
  <files>apps/staff-web/actions/import-leads.ts, apps/staff-web/app/components/gymos/ImportLeadsDialog.tsx, apps/staff-web/app/routes/gymos.inbox.tsx, apps/staff-web/AGENTS.md</files>
  <action>
**(a) Action — apps/staff-web/actions/import-leads.ts** (`defineAction` from `@agent-native/core`, NO `http: GET` key — it is a mutation, default POST; the frontend calls the auto-mounted `POST /_agent-native/actions/import-leads`).
Schema: `z.object({ csvText: z.string().min(1), dryRun: z.boolean().default(true) })`.
`run`:
  1. Parse `csvText` with `parse(csvText, { columns: true, skip_empty_lines: true, trim: true, bom: true })` from `csv-parse/sync` (already a dep — the CLI uses it). If 0 data rows → return `{ ok: false, error: "CSV has no data rows" }`.
  2. `const db = getDb()` from `../server/db`. SELECT existing phones: `db.select({ p: schema.gymMembers.phoneE164 }).from(schema.gymMembers)` → `existingPhones` Set (filter Boolean). `// guard:allow-unscoped — single-tenant gym deploy; bulk lead import by natural key`.
  3. `const nowIso = new Date().toISOString();` then `const parsed = parseLeadsCsv(rows, { existingPhones, nowIso })` from `../server/lib/csv-leads.js`.
  4. If `parsed.missingFields.length > 0` → return `{ ok: false, error: "Couldn't detect required column(s): " + parsed.missingFields.join(", "), mapping: parsed.mapping, rawHeaders: parsed.rawHeaders }` (NO insert).
  5. Build the preview payload from `parsed`: `{ ok: true, mapping, counts: parsed.counts, sample: parsed.members.slice(0,5).map(m => ({ firstName, lastName, phoneE164, email, optIn: m.consent })) }`.
  6. If `dryRun` → return the preview payload with `committed: 0`.
  7. Commit path (mirror features/forms/handlers/submissions.ts §9-11 exactly — the FK-safe re-select pattern): use `const db2 = db as any as { execute: (q:unknown)=>Promise<{rows:unknown[]}> }` and `sql` from `drizzle-orm`. For EACH `parsed.members` row:
     - Upsert gym_members. Prefer email conflict target when email present, else phone: copy the two `INSERT ... ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE ...` / `ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO UPDATE ...` blocks from submissions.ts, but set `marketing_consent = ${row.consent}` (the CLI carries consent; submissions.ts hardcoded false). Generate a `nanoid()` id per row. RE-SELECT canonical id by the same natural key (email or phone) → `resolvedMemberId`. (Every member here has a valid phoneE164, so the phone branch always works as a fallback.)
     - If `row.consent`: upsert whatsapp_opt_in via raw SQL `INSERT INTO whatsapp_opt_in (member_id, opted_in_at, evidence_payload, source) VALUES (${resolvedMemberId}, ${row.consentDate}, ${JSON.stringify({ importedVia:'csv-upload', consentColumn: row.consentColumn, consentValue: row.consentValue, importedAt: nowIso })}, 'import') ON CONFLICT (member_id) DO NOTHING`.
     - Upsert conversation status='lead' — copy the `INSERT INTO conversations ... 'lead' ... ON CONFLICT (member_id, channel) DO UPDATE SET status = CASE WHEN conversations.status = 'closed' THEN 'lead' ELSE conversations.status END, updated_at = NOW()` block from submissions.ts §10 (uses `resolvedMemberId`). No message row is required for the lead to appear (the Leads list keys off conversation status), but you MAY insert one summary message per new lead if trivial — optional; keep it lean.
     Count actual inserts: track `committedMembers` (re-select returns a row that did not previously exist — simplest: count members where the id you generated == the re-selected id) and `leadsCreated`. Return `{ ok: true, committed: committedMembers, leadsCreated, counts: parsed.counts }`.
  Add `// guard:allow-unscoped` comments on every gym-table query block. Do NOT wrap in runWithRequestContext (single-tenant; matches submissions.ts).

**(b) Dialog — apps/staff-web/app/components/gymos/ImportLeadsDialog.tsx** (mirror TemplatesDialog.tsx conventions: shadcn `Dialog`/`DialogTrigger`/`DialogContent`, `Button`, Tabler icons, `useState`, `toast` from sonner).
  - Trigger: a small `<Button variant="outline" size="sm">` with `<IconUpload size={14} />` and label "Import leads".
  - Body: a file `<input type="file" accept=".csv,text/csv">` (styled minimally; shadcn has no file primitive — a plain styled input is fine here, this is not a dropdown/menu). On file select, `await file.text()` and POST to the action for a preview:
    ```ts
    const res = await fetch(agentNativePath("/actions/import-leads"), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ csvText, dryRun: true }),
    });
    ```
    (`agentNativePath` is imported from `@agent-native/core/client`, same as TemplatesDialog uses it.) Parse the JSON; if `!ok` show the error (and `mapping`/`rawHeaders` hint if present) in a destructive-styled block.
  - Preview state: render the detected `mapping` (field → header, "(not found)" when absent), the `counts` (importable / opted-in / skipped breakdown), and a small shadcn-styled list/table of up to 5 `sample` rows (name · phone · email · opt-in yes/no). Use progressive disclosure — the preview only appears after a file is chosen.
  - Footer: a "Cancel" button and a primary "Import N leads" button (disabled until a valid preview with `counts.importable > 0`). On confirm, POST again with `dryRun: false`; on success `toast.success("Imported {committed} leads")`, close the dialog, and call a `onImported?: () => void` prop so the route can revalidate the Leads list (instant feel — no full navigation).
  - Keep all copy plain and gym-appropriate; no emojis as icons (Tabler only).

**(c) Wire into the Leads view — apps/staff-web/app/routes/gymos.inbox.tsx**
  - Import `ImportLeadsDialog` and `useRevalidator` from "react-router".
  - In the left-rail `<header>` (the block rendering "Leads"/"WhatsApp Inbox" title + count badge, ~lines 646-685), when `isLeadsView` render `<ImportLeadsDialog onImported={() => revalidator.revalidate()} />` next to the title/count (small, right-aligned — do NOT clutter the non-leads inbox; only show in the Leads view). `const revalidator = useRevalidator();` at the top of the component.
  - Do NOT change the loader, the existing action discriminator branches, or the send flow. The import goes entirely through the new action endpoint, not the route action.

**(d) Document — apps/staff-web/AGENTS.md**: add one row to the Agent Actions table: `| import-leads | — | Bulk-import a CSV of leads (auto-detects columns, normalizes phones to E.164, dedups, creates status='lead' conversations + opt-ins). dryRun previews; dryRun:false commits. Surfaced in the inbox Leads view, not an agent-facing tool. | {ok, committed, leadsCreated, counts} |`. Do not add it to the agent-chat.ts system prompt (UI-only, not an LLM tool).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String -Pattern "import-leads|ImportLeadsDialog|gymos.inbox" -Quiet; if (-not $?) { exit 0 }; npx prettier --check actions/import-leads.ts app/components/gymos/ImportLeadsDialog.tsx</automated>
  </verify>
  <done>import-leads.ts is a defineAction (no http GET key) that previews on dryRun and commits member/opt-in/lead-conversation upserts using the submissions.ts re-select pattern; ImportLeadsDialog renders a shadcn Dialog with file input + detected mapping + counts + sample preview + confirm; gymos.inbox.tsx shows the dialog only in the Leads view and revalidates on import; AGENTS.md documents the action; `npx tsc --noEmit` reports no new errors in the three TS files.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` in apps/staff-web has no new errors introduced by csv-leads.ts, import-ghl-contacts.ts, import-leads.ts, ImportLeadsDialog.tsx, gymos.inbox.tsx.
- `npx prettier --check` passes on the new/edited files.
- Logic correctness (runtime verification deferred — local `agent-native dev` cannot boot per STATE.md P1c-WIDE constraint; verify substance by reading the SQL against the submissions.ts canonical pattern, or replay the upsert SQL against the live gymos-demo Neon DB via Neon MCP with a 2-row test CSV and clean up the test rows after):
  - member upsert uses partial-unique conflict target (email or phone) + re-selects canonical id
  - conversation upsert uses ON CONFLICT (member_id, channel) and sets status='lead'
  - opt-in only inserted for consented rows, source='import', ON CONFLICT DO NOTHING
  - re-running with the same CSV inserts 0 new members (idempotent)
</verification>

<success_criteria>
- The Leads view (`/gymos/inbox?filter=leads`) shows an "Import leads" button (Tabler icon, shadcn Dialog); the non-leads inbox does not.
- Picking a CSV previews the auto-detected column mapping, importable/opted-in/skipped counts, and up to 5 sample rows BEFORE any write.
- Confirming imports gym_members + whatsapp_opt_in (consented) + conversations(status='lead'); the leads then appear in the Leads list after revalidation (no page navigation).
- Re-uploading the same CSV inserts 0 duplicate members.
- The CLI script (import-ghl-contacts.ts) and the action share one csv-leads.ts module — no copy-pasted detection/normalization logic.
- No schema changes. No new agent-facing LLM tool. Gym-table queries carry `// guard:allow-unscoped`.
</success_criteria>

<output>
After completion, create `.planning/quick/260611-dxv-add-csv-bulk-upload-interface-with-colum/260611-dxv-SUMMARY.md`
</output>
