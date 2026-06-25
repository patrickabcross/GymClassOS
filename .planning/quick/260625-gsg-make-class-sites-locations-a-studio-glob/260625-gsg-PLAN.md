---
phase: quick-260625-gsg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/server/plugins/db.ts
  - apps/staff-web/server/db/migrations/0007_studio_sites.sql
  - apps/staff-web/server/lib/sites.ts
  - apps/staff-web/server/lib/sites.test.ts
  - apps/staff-web/app/routes/gymos.schedule.tsx
  - apps/staff-web/app/components/gymos/NewClassDialog.tsx
  - apps/staff-web/app/routes/gymos.settings.integrations.tsx
autonomous: false
requirements: [GSG-01]
user_setup: []

must_haves:
  truths:
    - "A multi-site gym defines its own site/location names as DATA (studio-global config), not hardcoded in component source."
    - "The create-class location picker (one-off AND Repeat-weekly) lists the studio's configured sites — no hardcoded Norwich/Wymondham."
    - "When no sites are configured the location picker degrades gracefully (— none — + a hint), never crashes or shows an empty dropdown."
    - "An operator can add/remove site names from a Settings card and the pickers reflect the change after reload."
    - "HUSTLE's two sites (Norwich, Wymondham) are preserved post-change because they are set as DATA in studio_owner_config, not code."
  artifacts:
    - path: "apps/staff-web/server/lib/sites.ts"
      provides: "Pure never-throws resolveSites resolver, gym-agnostic empty-array default"
      contains: "export function resolveSites"
    - path: "apps/staff-web/server/lib/sites.test.ts"
      provides: "Unit tests mirroring stage-event-map.test.ts (string/array/null/parse-error branches)"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "sites TEXT column on studioOwnerConfig"
      contains: "sites: text(\"sites\")"
    - path: "apps/staff-web/app/components/gymos/NewClassDialog.tsx"
      provides: "Configurable sites Select replacing the two hardcoded SelectItems"
      contains: "sites.map"
  key_links:
    - from: "apps/staff-web/app/routes/gymos.schedule.tsx"
      to: "resolveSites(studio_owner_config.sites)"
      via: "loader Query F, threaded to NewClassDialog as sites prop"
      pattern: "resolveSites"
    - from: "apps/staff-web/app/routes/gymos.settings.integrations.tsx"
      to: "studio_owner_config.sites"
      via: "save-sites-config action intent, raw SQL UPSERT"
      pattern: "save-sites-config"
---

<objective>
Make class sites/locations a studio-global configuration so a multi-site gym defines its own site names as DATA, not code. Today the create-class location picker is hardcoded to two `<SelectItem>`s ("Norwich"/"Wymondham") in `NewClassDialog.tsx`. Replace that with a configurable list stored studio-global in `studio_owner_config`, read by the create-class picker (which serves BOTH the one-off occurrence and the Repeat-weekly recurring-rule paths in the same component), and editable from Settings.

Purpose: REPEATABLE-PER-CLIENT — every RunStudio gym deploy defines its own sites without a code change. The resolver default is gym-agnostic (empty array, no HUSTLE names in code); HUSTLE's two sites are seeded as DATA.

Output: additive `sites` column on `studio_owner_config`; a pure `resolveSites` resolver + unit test (mirroring the stageEventMap precedent); the schedule loader threading `sites` to `NewClassDialog`; a configurable Select in the dialog; a "Locations" management card + save action in Settings.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/staff-web/AGENTS.md
@apps/staff-web/server/lib/stage-event-map.ts
@apps/staff-web/server/lib/stage-event-map.test.ts
@apps/staff-web/server/db/schema.ts
@apps/staff-web/server/plugins/db.ts
@apps/staff-web/app/components/gymos/NewClassDialog.tsx
@apps/staff-web/app/routes/gymos.schedule.tsx
@apps/staff-web/app/routes/gymos.settings.integrations.tsx

<interfaces>
<!-- Contracts the executor needs — use directly, no exploration required. -->

PRECEDENT — the resolver to mirror (server/lib/stage-event-map.ts):
- Pure function. Accepts `string | object | null | undefined`. NEVER throws.
- null/undefined/"" → default. String → JSON.parse in try/catch, fall back to default on error. Object branch handles the JSONB / Neon HTTP driver pre-parsed case.
- Lives in server/lib/ (NOT server/plugins/ — Nitro/Vercel: plugins must default-export a Nitro plugin).
- Test file (server/lib/stage-event-map.test.ts) imports with a `.js` extension: `import { resolveStageEvent } from "./stage-event-map.js";` (vitest ESM). Mirror this.

studioOwnerConfig table (server/db/schema.ts ~line 646) — singleton row id='singleton':
```ts
export const studioOwnerConfig = table("studio_owner_config", {
  id: text("id").primaryKey(),               // always 'singleton'
  // ...existing columns (ownerPhoneE164, studioTimezone, digestEnabled, ...)
  metaPixelId: text("meta_pixel_id"),
  metaTestEventCode: text("meta_test_event_code"),
  metaStageEventMap: text("meta_stage_event_map"), // JSONB col; TEXT here, JSON string
  // ← ADD: sites: text("sites")  (JSONB col; TEXT here, JSON string array)
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});
```

Migration mechanism — `runMigrations` array in server/plugins/db.ts. Highest existing version is **34**. Add **version 35**. Pattern (mirror v31):
```ts
{ version: 35, sql: `ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS sites JSONB` },
```
NOTE: migrations are NOT auto-applied to the Neon DB by build — apply by hand (migration-drift gotcha).

NewClassDialog props (app/components/gymos/NewClassDialog.tsx):
```ts
export function NewClassDialog({ classTypes, trainers, defaultDate }: {
  classTypes: ClassType[]; trainers: Trainer[]; defaultDate: string;
}) { ... }
```
- `NONE = "__none__"` sentinel; `location` state defaults to `NONE`; on submit `locationVal = location && location !== NONE ? location : undefined`.
- Hardcoded picker at ~lines 464-477:
```tsx
<SelectContent>
  <SelectItem value={NONE}>— none —</SelectItem>
  <SelectItem value="Norwich">Norwich</SelectItem>
  <SelectItem value="Wymondham">Wymondham</SelectItem>
</SelectContent>
```
- The SAME `location` state + `locationVal` feed BOTH the recurring branch (create-schedule-rule, ~line 255) and the one-off branch (create-class-occurrence, ~line 276). Replacing the one picker covers both class_schedule_rules.location and class_occurrences.location. There is NO separate Repeat-weekly dialog component.

schedule loader (app/routes/gymos.schedule.tsx) — threads classTypes (Query D ~226) and trainers (Query E ~242) and returns them (~271-278); `<NewClassDialog classTypes={data.classTypes} trainers={data.trainers} ... />` at ~535. Add a `sites` value the same way and pass `sites={data.sites}`.

Settings save precedent (app/routes/gymos.settings.integrations.tsx):
- `action({ request })` reads `_intent` from formData and branches. The `save-meta-config` branch (~line 363) does a raw-SQL UPSERT into studio_owner_config:
```ts
await (getDb() as any).execute(sql`
  INSERT INTO studio_owner_config (id, meta_pixel_id, meta_test_event_code, updated_at)
  VALUES ('singleton', ${pixelId || null}, ${testEventCode || null}, NOW())
  ON CONFLICT (id) DO UPDATE SET
    meta_pixel_id = ${pixelId || null},
    meta_test_event_code = ${testEventCode || null},
    updated_at = NOW()
`); // guard:allow-unscoped — studio-global config (singleton row)
```
- Cards are hand-rolled `<div className="rounded-lg border border-border/50 p-4 bg-card/30 space-y-4">` (NOT shadcn `<Card>`), each with a `fetcher.Form method="post"` + `<input type="hidden" name="_intent" value="...">`. Tabler icons. Mirror this idiom exactly.
- Loader reads config via raw SQL `SELECT ... FROM studio_owner_config LIMIT 1` (~line 149).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add sites column + pure resolveSites resolver (+ test) + migration</name>
  <files>apps/staff-web/server/db/schema.ts, apps/staff-web/server/plugins/db.ts, apps/staff-web/server/db/migrations/0007_studio_sites.sql, apps/staff-web/server/lib/sites.ts, apps/staff-web/server/lib/sites.test.ts</files>
  <behavior>
    resolveSites(configJson): string[] — NEVER throws. Mirror stage-event-map.test.ts cases:
    - resolveSites(null) → []  (gym-agnostic empty default — NO Norwich/Wymondham in code)
    - resolveSites(undefined) → []
    - resolveSites("") → []
    - resolveSites('["Norwich","Wymondham"]') → ["Norwich","Wymondham"]  (JSON string from TEXT column)
    - resolveSites(["A","B"]) → ["A","B"]  (pre-parsed array — JSONB / Neon HTTP driver branch)
    - resolveSites("not-json{{{") → []  (malformed → empty, no throw)
    - resolveSites("{}") → []  (object/non-array JSON → []; only string arrays are valid)
    - resolveSites('[1,2,"x"]') → ["x"]  (filter to non-empty strings; drop non-strings/empties)
    - resolveSites('["A",""," ","A"]') → ["A"]  (trim, drop empties, de-dupe — keep stable/insertion order)
    - resolveSites([]) → []
  </behavior>
  <action>
1. **schema.ts** — In `studioOwnerConfig` (~line 663, directly after `metaStageEventMap`), add:
   ```ts
   // GSG-01: studio-global site/location names. JSONB in Postgres — stored as
   // TEXT here, read/written as a JSON string array. Resolver in
   // server/lib/sites.ts applies an EMPTY-array default when null (gym-agnostic
   // — NO hardcoded site names in code; HUSTLE's sites are DATA). Migration v35.
   sites: text("sites"), // JSONB column; JSON string array
   ```

2. **server/lib/sites.ts** — Create the pure resolver, mirroring stage-event-map.ts structure and header-comment style:
   ```ts
   /**
    * Resolve the studio's configured site/location names.
    * @param configJson  Value of studio_owner_config.sites. Accepts a JSON
    *   string array, a pre-parsed array (JSONB driver), null, or undefined.
    *   All inputs are safe — never throws.
    * @returns  Array of trimmed, non-empty, de-duplicated site names (stable
    *   order). Gym-agnostic EMPTY-array default when unset/invalid.
    */
   export function resolveSites(
     configJson: string | unknown[] | null | undefined,
   ): string[] {
     if (!configJson) return [];
     let arr: unknown;
     if (Array.isArray(configJson)) {
       arr = configJson;
     } else if (typeof configJson === "string") {
       try { arr = JSON.parse(configJson); } catch { return []; }
     } else {
       return [];
     }
     if (!Array.isArray(arr)) return [];
     const out: string[] = [];
     const seen = new Set<string>();
     for (const v of arr) {
       if (typeof v !== "string") continue;
       const t = v.trim();
       if (!t || seen.has(t)) continue;
       seen.add(t);
       out.push(t);
     }
     return out;
   }
   ```
   IMPORTANT: default MUST be `[]` — do NOT seed Norwich/Wymondham in code (repeatable-per-client hard requirement).

3. **server/lib/sites.test.ts** — Create unit tests mirroring stage-event-map.test.ts. Import with `.js`: `import { resolveSites } from "./sites.js";`. Cover every case in the <behavior> block above (null/undefined/empty, JSON string array, pre-parsed array, malformed JSON → [], non-array JSON → [], non-string/empty filtering, trim + de-dupe, empty array).

4. **server/plugins/db.ts** — Add a new migration object to the `runMigrations` array (highest existing is v34; add **v35**). Place it next to v31-v34 with a header comment in the same style noting it is additive and NOT auto-applied to Neon:
   ```ts
   {
     version: 35,
     // GSG-01: studio-global site/location names (JSONB). Additive, idempotent.
     // NOT auto-applied to gymos-demo Neon by build — apply by hand after deploy
     // (migration-drift gotcha). HUSTLE's sites are seeded as DATA, not here.
     sql: `ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS sites JSONB`,
   },
   ```

5. **server/db/migrations/0007_studio_sites.sql** — Create a standalone SQL file (mirrors the existing numbered files in that dir) for the manual Neon-apply step:
   ```sql
   -- GSG-01: studio-global site/location names. Additive, idempotent.
   -- Apply by hand to the Neon DB (billowing-sun-51091059) — db.ts runMigrations
   -- v35 is the in-app mirror but is NOT auto-run against Neon by the build.
   ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS sites JSONB;
   ```

Run `npx prettier --write` on all changed/created files.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run server/lib/sites.test.ts</automated>
  </verify>
  <done>resolveSites resolver exists, never throws, defaults to [] (no HUSTLE names in code); all sites.test.ts cases pass; `sites` column added to schema + db.ts v35 + standalone 0007 SQL file.</done>
</task>

<task type="auto">
  <name>Task 2: Thread resolved sites into the loader and the create-class picker (one-off + recurring)</name>
  <files>apps/staff-web/app/routes/gymos.schedule.tsx, apps/staff-web/app/components/gymos/NewClassDialog.tsx</files>
  <action>
1. **gymos.schedule.tsx loader** — After Query E (trainers, ~line 250), add Query F to read the studio config and resolve sites:
   ```ts
   // Query F — studio-global site/location names for the New Class picker (GSG-01).
   // guard:allow-unscoped — studio-global config (singleton row).
   const { resolveSites } = await import("../../server/lib/sites.js");
   const siteCfgRows = await (db as any).execute(
     sql`SELECT sites FROM studio_owner_config LIMIT 1`,
   );
   const siteCfg = ((siteCfgRows as any)?.rows ?? (siteCfgRows as any))?.[0] ?? {};
   const sites = resolveSites(siteCfg.sites);
   ```
   (Confirm `sql` is already imported at the top of the file — it is used elsewhere in the loader; if not, add `sql` to the `drizzle-orm` import.)
   Then add `sites` to the loader return object (next to `classTypes`, `trainers` ~line 277).

2. **gymos.schedule.tsx render** — Pass the prop: `<NewClassDialog classTypes={data.classTypes} trainers={data.trainers} sites={data.sites} ... />` (~line 535).

3. **NewClassDialog.tsx** — Accept the new prop and render it:
   - Add `sites: string[]` to the props type and destructure it (~line 98-106).
   - Replace the hardcoded SelectContent (~lines 471-475) with:
     ```tsx
     <SelectContent>
       <SelectItem value={NONE}>— none —</SelectItem>
       {sites.map((s) => (
         <SelectItem key={s} value={s}>
           {s}
         </SelectItem>
       ))}
     </SelectContent>
     ```
   - EMPTY-SITES UX: when `sites.length === 0`, the dropdown still has the `— none —` item (never empty/crashing). Add a hint under the Select when empty:
     ```tsx
     {sites.length === 0 && (
       <p className="text-[11px] text-muted-foreground">
         No locations configured. Add sites in Settings → Integrations.
       </p>
     )}
     ```
   - Keep the existing `NONE` sentinel + `locationVal` mapping untouched (~line 210) so optional semantics still hold for BOTH the one-off (create-class-occurrence) and recurring (create-schedule-rule) submit branches — the single `location` state feeds both.

Run `npx prettier --write` on both files.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "NewClassDialog|gymos.schedule|sites" || echo "no type errors in changed files"</automated>
  </verify>
  <done>The location picker in NewClassDialog renders the loader-resolved `sites` (no hardcoded Norwich/Wymondham); both submit branches still map NONE→undefined; empty-sites shows — none — + a Settings hint and never crashes; tsc clean for the changed files.</done>
</task>

<task type="auto">
  <name>Task 3: Add a "Locations" management card + save-sites-config action in Settings</name>
  <files>apps/staff-web/app/routes/gymos.settings.integrations.tsx</files>
  <action>
Mirror the Meta Conversion Tracking card's save path (raw-SQL UPSERT into studio_owner_config) and the hand-rolled card idiom.

1. **Loader** — After the Meta status block (~line 190), read + resolve current sites:
   ```ts
   // GSG-01: studio-global site/location names.
   // guard:allow-unscoped — studio-global config (singleton row)
   const { resolveSites } = await import("../../server/lib/sites.js");
   const siteRows = await (getDb() as any).execute(
     sql`SELECT sites FROM studio_owner_config LIMIT 1`,
   );
   const siteCfg = ((siteRows as any)?.rows ?? (siteRows as any))?.[0] ?? {};
   const sites = resolveSites(siteCfg.sites);
   ```
   Add `sites` to the loader return object.

2. **Action** — Add a new intent branch (next to `save-meta-config`, ~line 362):
   ```ts
   // GSG-01: Save studio-global site/location names.
   if (intent === "save-sites-config") {
     const { resolveSites } = await import("../../server/lib/sites.js");
     // Newline-or-comma separated textarea → normalized JSON string array.
     const raw = String(fd.get("sites") ?? "");
     const list = resolveSites(
       JSON.stringify(raw.split(/[\n,]/).map((s) => s.trim())),
     );
     // guard:allow-unscoped — studio-global config (singleton row)
     await (getDb() as any).execute(sql`
       INSERT INTO studio_owner_config (id, sites, updated_at)
       VALUES ('singleton', ${JSON.stringify(list)}, NOW())
       ON CONFLICT (id) DO UPDATE SET
         sites = ${JSON.stringify(list)},
         updated_at = NOW()
     `);
     return { ok: true, intent };
   }
   ```
   (resolveSites is reused here as the normalizer so trim/de-dupe/empty-filter logic stays in one place.)

3. **Route component** — Add a `sitesFetcher` (mirror `metaConfigFetcher`, ~line 481) and render a new card after the Meta card. Use the hand-rolled card idiom + Tabler icon (`IconMapPin`):
   - Card: `<div className="rounded-lg border border-border/50 p-4 bg-card/30 space-y-4">` with header `<IconMapPin size={16} /> <span className="text-sm font-semibold">Locations</span>` and a one-line description ("Site names available when scheduling classes.").
   - Progressive disclosure: if `data.sites.length > 0`, show the current sites as small pills/text first; the edit textarea lives inside a shadcn `Collapsible` (label "Edit locations") OR a simple "Edit" toggle — keep it collapsed by default per the AGENTS.md progressive-disclosure rule. (Collapsible is already used elsewhere in staff-web; if importing it adds friction, a `useState` show/hide toggle on a Button is acceptable.)
   - `<sitesFetcher.Form method="post">` with `<input type="hidden" name="_intent" value="save-sites-config" />`, a `<textarea name="sites">` prefilled with `data.sites.join("\n")` (one per line), helper text "One per line", and a submit button "Save locations" (disabled while submitting). Show a success/error note from `sitesFetcher.data` like the Meta card.
   - Empty state: if `data.sites.length === 0`, lead with a single clear prompt ("No locations yet — add your studio's sites below.") and the textarea.

Add `IconMapPin` to the existing `@tabler/icons-react` import.

Run `npx prettier --write` on the file.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "settings.integrations" || echo "no type errors in changed file"</automated>
  </verify>
  <done>Settings → Integrations shows a "Locations" card; saving writes a normalized JSON string array to studio_owner_config.sites via UPSERT; the card lists current sites and lets the operator add/remove via a textarea (progressive disclosure, collapsed by default when sites exist); guard:allow-unscoped present; tsc clean.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx vitest run server/lib/sites.test.ts` — resolver tests pass.
- `cd apps/staff-web && npx tsc --noEmit -p tsconfig.json` — no NEW type errors in the four touched source files (NewClassDialog, gymos.schedule, gymos.settings.integrations, sites.ts). (Pre-existing repo-wide errors, if any, are out of scope.)
- No hardcoded "Norwich"/"Wymondham" remain in NewClassDialog.tsx or in server/lib/sites.ts (grep both — must return nothing).
- `npx prettier --write` run on every changed/created file.
</verification>

<success_criteria>
- `sites` JSONB column added to studio_owner_config (schema.ts + db.ts v35 + standalone 0007 SQL), strictly additive (ADD COLUMN IF NOT EXISTS — no rename/drop).
- `resolveSites` is pure, never throws, defaults to `[]`, and contains NO gym-specific site names.
- Both create-class submit paths (one-off occurrence + Repeat-weekly rule) use the loader-resolved sites list via the single shared `location` state.
- Empty-sites UX degrades gracefully (— none — + Settings hint), never crashes.
- Operator can edit the studio's sites from the Settings Locations card; pickers reflect it after reload.
- All gym/config table queries carry `// guard:allow-unscoped`. shadcn primitives + Tabler icons only. No git branch created/switched.
</success_criteria>

<operator_actions>
TWO MANUAL STEPS are required after this code ships (migration-drift gotcha — db.ts runMigrations does NOT auto-apply to Neon):

1. **Apply the additive migration to Neon** (`billowing-sun-51091059`), e.g. via Neon MCP / SQL console:
   ```sql
   ALTER TABLE studio_owner_config ADD COLUMN IF NOT EXISTS sites JSONB;
   ```
   (Same as apps/staff-web/server/db/migrations/0007_studio_sites.sql.) Without this, the schedule loader's `SELECT sites FROM studio_owner_config` 500s.

2. **Seed HUSTLE's two sites as DATA** (preserves current behavior — NOT in code):
   ```sql
   INSERT INTO studio_owner_config (id, sites, updated_at)
   VALUES ('singleton', '["Norwich","Wymondham"]'::jsonb, NOW())
   ON CONFLICT (id) DO UPDATE SET sites = '["Norwich","Wymondham"]'::jsonb, updated_at = NOW();
   ```
   (Or do this from the new Settings → Locations card once the migration is applied.)
</operator_actions>

<output>
After completion, create `.planning/quick/260625-gsg-make-class-sites-locations-a-studio-glob/260625-gsg-SUMMARY.md`
</output>
