---
phase: quick-260603-gxh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/scripts/import-ghl-contacts.ts
  - apps/staff-web/package.json
autonomous: true
requirements: [QUICK-GHL-IMPORT]
must_haves:
  truths:
    - "Running `pnpm --filter @gymos/staff-web db:import-ghl <file.csv>` parses the CSV and prints a dry-run report without writing to the DB"
    - "Header auto-detection maps GHL/arbitrary column names to firstName/lastName/email/phone/marketingConsent/consentDate and prints the mapping"
    - "Phones normalize to E.164 (UK +44 default); un-normalizable phones are skipped and counted"
    - "Passing --commit performs chunked, idempotent INSERTs into gym_members (+ whatsapp_opt_in when consented)"
    - "Re-running --commit inserts 0 new rows (onConflictDoNothing + DB phone dedupe)"
  artifacts:
    - path: "apps/staff-web/scripts/import-ghl-contacts.ts"
      provides: "GHL CSV importer (dry-run default, --commit to write)"
      min_lines: 200
    - path: "apps/staff-web/package.json"
      provides: "db:import-ghl script + csv-parse devDependency"
      contains: "db:import-ghl"
  key_links:
    - from: "apps/staff-web/scripts/import-ghl-contacts.ts"
      to: "apps/staff-web/server/db/index.ts (getDb + schema)"
      via: "dynamic import('../server/db/index.js') after dotenv load"
      pattern: "await import\\(.*server/db/index"
    - from: "import-ghl-contacts.ts"
      to: "schema.gymMembers + schema.whatsappOptIn"
      via: "chunked bulkInsert onConflictDoNothing"
      pattern: "onConflictDoNothing"
---

<objective>
Build a one-shot CLI importer that loads a GoHighLevel contacts CSV export into the
`gymos-demo` Neon DB — inserting `gym_members` rows and, for consented contacts,
`whatsapp_opt_in` rows. Default mode is a safe dry-run (writes nothing); `--commit`
performs idempotent chunked inserts.

Purpose: the signed studio's existing contacts live in GoHighLevel. To run WhatsApp
campaigns from GymClassOS, those contacts must land in `gym_members` with E.164 phones
and per-member opt-in evidence. GHL exports have inconsistent column headers across
accounts, so the importer auto-detects headers via a synonyms map and reports its
mapping before any write.

Output:
- `apps/staff-web/scripts/import-ghl-contacts.ts` — the importer (run via tsx)
- `apps/staff-web/package.json` — `"db:import-ghl"` script + `csv-parse` devDependency

NOTE: The executor must NOT connect to Neon. The user runs the dry-run themselves
against the real GHL export. Executor verifies it compiles (typecheck) and errors
cleanly with no/bad args.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/staff-web/AGENTS.md

<interfaces>
<!-- Executor: use these directly. No codebase exploration needed. -->

DB access (apps/staff-web/server/db/index.ts):
```typescript
export const getDb = createGetDb(schema);   // call getDb() to get the Drizzle instance
export { schema };                            // schema.gymMembers, schema.whatsappOptIn, ...
```
Compiled import path from a script under apps/staff-web/scripts/ is `../server/db/index.js`
(ESM .js convention — same as seed scripts).

gym_members columns (Drizzle keys → SQL). Insert keys to set:
```
id: text PK                       -> nanoid()
firstName: text NOT NULL          -> REQUIRED (skip row if blank)
lastName: text | null
email: text | null
phoneE164: text | null            -> normalized E.164
marketingConsent: boolean NOT NULL default false   -> parsed from consent column
createdAt: text NOT NULL default now()  -> new Date().toISOString()
updatedAt: text NOT NULL default now()  -> new Date().toISOString()
```
(Other columns — userId, dateOfBirth, sex, heightCm, weightKg, goal, activityLevel,
notes — are nullable/defaulted; leave them unset.)

whatsapp_opt_in columns (PK is member_id — ONE row per member):
```
memberId: text PK                 -> the new gym_members.id
optedInAt: text NOT NULL default now()  -> detected consentDate OR now ISO
evidenceMessageId: text | null    -> null
evidencePayload: text | null      -> JSON.stringify({ importedFrom:'gohighlevel', file, consentColumn, consentValue, importedAt })
source: enum NOT NULL             -> 'import'   (allowed: inbound_reply | manual_admin | import)
optedOutAt: text | null           -> leave unset
```

Env + DB bootstrap pattern (copy exactly from seed-demo-data.ts lines 29-42):
```typescript
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// apps/staff-web/scripts/import-ghl-contacts.ts → apps/staff-web is TWO levels up
const APP_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(APP_ROOT, ".env.local"), quiet: true });
dotenv.config({ path: path.join(APP_ROOT, ".env"), quiet: true });
const { getDb, schema } = await import("../server/db/index.js");
```
WARNING: the script lives in scripts/ (ONE level under apps/staff-web), NOT in
server/db/seeds/ (THREE levels). So APP_ROOT = path.resolve(__dirname, "..") and the
db import is `../server/db/index.js`. Do not copy the seed's `..`,`..`,`..` depth.

Chunked idempotent bulkInsert (adapt from seed-demo-data.ts lines 110-129):
```typescript
async function bulkInsert(table, rows, conflictTarget, chunkSize = 200) {
  if (rows.length === 0) return 0;
  const db = getDb();
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const result = await db.insert(table).values(chunk)
      .onConflictDoNothing({ target: conflictTarget })
      .returning({ id: conflictTarget });
    inserted += Array.isArray(result) ? result.length : chunk.length;
  }
  return inserted;
}
```
</interfaces>

CONSTRAINTS (from CLAUDE.md / AGENTS.md — non-negotiable):
- Single-tenant: NO studio_id anywhere.
- Do NOT import @gymos/whatsapp (forbiddenDependencies). This script only writes DB rows.
- gym_members / whatsapp_opt_in do NOT use ownableColumns() — accessFilter NOT required.
- Strictly additive: only INSERTs. No schema changes, no migrations, no drizzle-kit push.
- TypeScript only. Run prettier on the new file after writing.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add csv-parse dependency + db:import-ghl script</name>
  <files>apps/staff-web/package.json</files>
  <action>
    Edit apps/staff-web/package.json:
    1. Add to the `scripts` block (after `db:seed-enquiry-form`):
       `"db:import-ghl": "tsx scripts/import-ghl-contacts.ts"`
    2. Add `csv-parse` to `devDependencies` (the workspace has no csv lib — confirmed
       csv-parse / papaparse / csv-parser all absent). Use a current stable version, e.g.
       `"csv-parse": "^5.6.0"`. Keep devDependencies alphabetically sorted to match the
       existing convention (csv-parse sits between `cmdk` and `date-fns`).
    3. Run `pnpm install` from the repo root (or `pnpm --filter @gymos/staff-web install`)
       so csv-parse is fetched into node_modules before typecheck.
  </action>
  <verify>
    <automated>node -e "const p=require('C:/Users/dimet/hustle/apps/staff-web/package.json'); if(!p.scripts['db:import-ghl']) throw new Error('script missing'); if(!p.devDependencies['csv-parse']) throw new Error('dep missing'); console.log('ok')"</automated>
  </verify>
  <done>package.json has the db:import-ghl script + csv-parse devDependency; csv-parse resolves in node_modules.</done>
</task>

<task type="auto">
  <name>Task 2: Write the GHL CSV importer script</name>
  <files>apps/staff-web/scripts/import-ghl-contacts.ts</files>
  <action>
    Create apps/staff-web/scripts/import-ghl-contacts.ts (run via tsx). Structure:

    ENV + DB BOOTSTRAP — copy the dotenv + dynamic-import pattern exactly from the
    <interfaces> block above. APP_ROOT = path.resolve(__dirname, "..") (script is one
    level under apps/staff-web). Import nanoid from "nanoid" (already a dependency).
    Import the sync parser: `import { parse } from "csv-parse/sync";`.

    CLI ARGS:
    - First positional arg = path to CSV. Resolve relative to process.cwd().
    - `--commit` flag anywhere in argv switches from dry-run (default) to write mode.
    - If no path given OR file does not exist (fs.existsSync), print a clear usage error
      ("Usage: pnpm --filter @gymos/staff-web db:import-ghl <file.csv> [--commit]") and
      process.exit(1). This error path must NOT touch the DB.

    CSV PARSING: read the file with fs.readFileSync(path, "utf8"); parse with csv-parse/sync
    `parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true })` →
    array of row objects keyed by raw header. csv-parse handles quoted fields with embedded
    commas/newlines. Capture the raw header list from Object.keys(rows[0]) (guard empty file).

    HEADER AUTO-DETECTION:
    - normalize(h) = h.toLowerCase().replace(/[^a-z0-9]/g, "")  // strips spaces/punctuation
    - Build a synonyms map of canonical field → array of normalized synonym strings:
      * firstName: ["firstname","fname","givenname","contactfirstname","first"]   (covers "first name","first name","given name","contact first name")
      * lastName:  ["lastname","lname","surname","contactlastname"]
      * email:     ["email","emailaddress","email","e-mail"→"email"]  (normalize "e-mail" → "email")
      * phone:     ["phone","mobile","phonenumber","mobilenumber","contactphone","number","tel"]
      * marketingConsent: ["optin","optedin","marketing","consent","subscribed","marketingconsent","smsoptin","emailoptin"]
      * unsubscribed (INVERTED consent): ["unsubscribed","unsubscribe","optout","optedout","donotcontact","dnc"]
      * consentDate (optional): ["consentdate","optedindate","dateadded","optintimestamp","subscribeddate"]
      (All synonym strings must already be normalized the same way normalize() produces — i.e. lowercase, no punctuation.)
    - For each raw header, compute normalize(header), then find which canonical field's
      synonym list contains it (exact match on normalized form is sufficient; you may also
      accept startsWith for firstName/lastName/phone if you want light fuzziness — exact is fine).
    - Produce a mapping object: { firstName?: rawHeader, lastName?, email?, phone?,
      marketingConsent?, unsubscribed?, consentDate? }. First matching header wins per field.
    - PRINT the detected header→field mapping (a small table or list) so the user can verify.
    - HARD ERROR (exit 1) if firstName header OR phone header could not be located —
      message naming which one is missing and listing the raw headers seen, so the user can
      rename a column and retry. This check is BEFORE any DB work (works in dry-run too).

    PHONE NORMALIZATION → E.164 (UK +44 default). Function normalizePhone(raw): string|null
    - if raw blank → null
    - strip everything except digits and a leading "+": let s = raw.replace(/[^\d+]/g, "")
      (this removes spaces, dashes, parens, dots).
    - if s starts with "+": keep as-is (validate it then has 8-15 digits after the +; else null).
    - else if s starts with "0": drop the leading 0, prepend "+44" → "+44" + s.slice(1).
    - else if s starts with "44": prepend "+" → "+" + s.
    - else: reject → null  (ambiguous; cannot safely assume country).
    - Final sanity: result must match /^\+\d{8,15}$/ else null.
    - Returning null means the row is skipped and counted as "no valid phone" — these
      contacts cannot be WhatsApp-messaged.

    CONSENT PARSING. parseConsent(row, mapping): boolean
    - If mapping.unsubscribed present and the cell value is truthy-unsubscribed
      (lowercased in ["yes","true","1","y","unsubscribed","opted out","optout"]) → return false.
    - Else if mapping.marketingConsent present: cell lowercased/trimmed in
      ["yes","true","1","y","opted in","optedin","subscribed","opt in","optin"] → true; else false.
    - Else (no consent column at all) → false.
    - blank/unknown → false.

    CONSENT DATE. If mapping.consentDate present and the cell parses to a valid Date
    (new Date(cell), not NaN) → use cell's Date().toISOString(); else fall back to now ISO.

    DEDUPE:
    (a) WITHIN-FILE: keep a Set of normalized phones already seen this run; skip + count a
        duplicate ("duplicate-in-file") if the normalized phone repeats. Secondary: also track
        a Set of lowercased emails; if a row's email (when non-blank) was already seen, count it
        as a duplicate too (phone is the primary key for dedupe; email is secondary signal).
    (b) AGAINST DB: BEFORE building insert rows, query existing phones once:
        `const existing = await getDb().select({ p: schema.gymMembers.phoneE164 }).from(schema.gymMembers);`
        Build a Set of existing.phoneE164 values. Skip + count rows whose normalized phone is
        already in the DB ("already-in-db"). IMPORTANT: in DRY-RUN this is a read-only SELECT —
        acceptable. BUT the task spec says the EXECUTOR must not connect to Neon; that is a
        verification constraint, not a code constraint. The script itself DOES need the DB read
        at runtime. So: guard the DB read so it only runs when a real DATABASE_URL is present
        is NOT required — just write the SELECT normally; the executor simply won't run it.
        (The user runs the real dry-run.) Wrap main() in try/catch to print a clean error if
        DATABASE_URL is missing.

    PER IMPORTABLE ROW (passed firstName non-blank, valid phone, not deduped):
    - member = { id: nanoid(), firstName, lastName (or null), email (or null), phoneE164,
        marketingConsent: parsedConsent, createdAt: nowISO, updatedAt: nowISO }
    - if parsedConsent === true: also build optIn = { memberId: member.id,
        optedInAt: detectedConsentDate ?? nowISO, source: 'import', evidenceMessageId: null,
        evidencePayload: JSON.stringify({ importedFrom:'gohighlevel', file: path.basename(csvPath),
        consentColumn: mapping.marketingConsent ?? mapping.unsubscribed ?? null,
        consentValue: <raw cell value for that column>, importedAt: nowISO }) }
    Collect members[] and optIns[] arrays plus the skip counters.

    DRY-RUN OUTPUT (default — writes NOTHING):
    - print detected header→field mapping
    - print totals: rows parsed, importable, skipped broken down into
      { no firstName, no valid phone, duplicate-in-file, already-in-db }, opted-in count vs
      not-opted-in count
    - print 3-5 sample mapped rows (member fields + "would create opt-in: yes/no")
    - print a hint: "Dry run — nothing written. Re-run with --commit to insert."

    --COMMIT OUTPUT:
    - bulkInsert(schema.gymMembers, members, schema.gymMembers.id) then
      bulkInsert(schema.whatsappOptIn, optIns, schema.whatsappOptIn.memberId)
      (members FIRST so the opt-in FK target exists; both onConflictDoNothing → idempotent).
    - print final counts: members inserted, opt-ins inserted, conflicts/skipped (rows - inserted).
    - emphasise it is safe to re-run.

    End with process.exit(0) on success; main().catch(e => { console.error(e); process.exit(1); }).

    Run `npx prettier --write apps/staff-web/scripts/import-ghl-contacts.ts` after writing.
  </action>
  <verify>
    <automated>cd C:/Users/dimet/hustle/apps/staff-web && pnpm typecheck</automated>
  </verify>
  <done>
    Script compiles under the repo typecheck. Running `tsx scripts/import-ghl-contacts.ts`
    with no arg (or a missing-file arg) prints the usage error and exits 1 WITHOUT connecting
    to Neon. Dry-run is the default; --commit gates all writes; inserts go members-then-optins
    with onConflictDoNothing for idempotency.
  </done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/staff-web typecheck` passes (or repo-root typecheck).
- `node` smoke: running the script with no positional arg exits 1 with the usage message and
  makes no DB connection (no DATABASE_URL access before the arg/file check).
- Code review confirms: dry-run writes nothing; --commit inserts members before opt-ins, both
  onConflictDoNothing; phone normalizer follows the +44 rules; header detection errors clearly
  when firstName or phone is absent.
- No @gymos/whatsapp import. No schema/migration changes. Only INSERTs.
</verification>

<success_criteria>
- apps/staff-web/scripts/import-ghl-contacts.ts exists, compiles, and is prettier-clean.
- apps/staff-web/package.json has `db:import-ghl` + `csv-parse` devDependency; csv-parse installed.
- Importer: arg-validates, auto-detects headers (with printed mapping + hard error on missing
  firstName/phone), normalizes phones to E.164 (+44 default), dedupes within-file and against DB,
  defaults to dry-run, and on --commit performs idempotent chunked inserts (members → opt-ins).
- Executor did NOT run the script against Neon (only no-arg/bad-arg clean-exit + typecheck).
</success_criteria>

<output>
After completion, create `.planning/quick/260603-gxh-build-gohighlevel-contacts-csv-importer-/260603-gxh-SUMMARY.md`
</output>
