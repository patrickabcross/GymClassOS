---
phase: quick-260615-phi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - services/worker/src/domain/conversations.ts
  - services/worker/src/domain/conversations.test.ts
  - apps/staff-web/app/routes/gymos.messages.tsx
autonomous: true
requirements: [WA-INBOUND-UNKNOWN, WA-TEMPLATE-PRUNE]
must_haves:
  truths:
    - "An inbound WhatsApp message from a phone number not in gym_members auto-creates a gym_member and an 'open' conversation that appears in the Messages inbox"
    - "The auto-created member's name is the WhatsApp profile name when present, else the E.164 phone number"
    - "First inbound from a new number captures a whatsapp_opt_in row with source='inbound_reply' (same as the known-member path)"
    - "Concurrent inbound from the same new number resolves to exactly one gym_member (no duplicates at localConcurrency=5)"
    - "Clicking 'Update templates' after switching WhatsApp accounts prunes templates not returned by the new account's successful sync"
    - "Templates are NOT pruned when the sync errors or returns zero templates"
  artifacts:
    - path: "services/worker/src/domain/conversations.ts"
      provides: "upsertConversationAndMessage auto-creates member for unknown phone"
      contains: "onConflictDoNothing"
    - path: "services/worker/src/domain/conversations.test.ts"
      provides: "Test coverage for the auto-create-member path"
    - path: "apps/staff-web/app/routes/gymos.messages.tsx"
      provides: "sync-templates branch prunes stale templates on successful sync"
      contains: "syncStartedAt"
  key_links:
    - from: "services/worker/src/domain/conversations.ts (auto-create branch)"
      to: "schema.gymMembers / schema.conversations / schema.whatsappOptIn"
      via: "INSERT ... onConflictDoNothing(phoneE164) + re-SELECT, then existing conversation+message+opt-in logic"
      pattern: "gymMembers.*onConflictDoNothing"
    - from: "apps/staff-web/app/routes/gymos.messages.tsx (sync-templates)"
      to: "schema.whatsappTemplates"
      via: "DELETE WHERE last_synced_at < syncStartedAt after successful sync with synced > 0"
      pattern: "last_synced_at.*syncStartedAt|lt\\("
---

<objective>
Two WhatsApp correctness fixes, one self-contained plan.

1. **Inbound from unknown numbers** — today `upsertConversationAndMessage` early-returns `unknown_phone` and DROPS any inbound from a number not already in `gym_members`, so new prospects never appear in the staff inbox. Implement the deferred auto-create-member path: a new number gets a `gym_member` row + an `open` conversation + the message + opt-in, exactly like a known member.

2. **Stale template pruning** — the on-demand "Update templates" sync only upserts; templates left over from a previous WhatsApp account linger forever. Add prune-on-success so switching accounts and clicking "Update templates" once clears the stale templates automatically.

Purpose: New WhatsApp prospects become visible/actionable in the inbox; the template picker reflects only the currently-connected account.
Output: Modified worker domain function + extended test; modified staff-web sync-templates action branch.
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

# Files being changed (already traced — do not re-investigate from scratch)
@services/worker/src/domain/conversations.ts
@services/worker/src/queues/inbound-whatsapp.ts
@services/worker/src/domain/conversations.test.ts
@apps/staff-web/app/routes/gymos.messages.tsx

<interfaces>
<!-- Key contracts the executor needs. Extracted from the codebase. Use directly — no exploration needed. -->

worker gym_members mirror (services/worker/src/lib/db.ts) — Drizzle pg-core:
```ts
export const gymMembers = pgTable("gym_members", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  firstName: text("first_name").notNull(),   // NOT NULL — must always set
  lastName: text("last_name"),
  email: text("email"),
  phoneE164: text("phone_e164"),             // E.164 with leading "+"; PARTIAL UNIQUE index (P1c-01)
});
```
NOTE: the worker mirror does not model created_at/updated_at, but the REAL gym_members
table has `created_at`/`updated_at` with DB `default(now())`. An INSERT of only
{id, firstName, lastName, phoneE164} is therefore valid — defaults fill the rest.

staff-web whatsapp_templates (apps/staff-web/server/db/schema.ts):
```ts
export const whatsappTemplates = table("whatsapp_templates", {
  name: text("name").primaryKey(),
  status: text("status", { enum: ["pending","approved","rejected","paused","disabled"] }).notNull(),
  category: text("category", { enum: ["utility","marketing","authentication"] }),
  language: text("language").notNull().default("en_US"),
  componentsJson: text("components_json").notNull(),
  lastSyncedAt: text("last_synced_at").notNull().default(now()),  // TEXT column — ISO strings
});
```
NOTE: last_synced_at is a TEXT column written as `new Date().toISOString()`.
Prune comparison MUST compare against an ISO string captured BEFORE the fetch loop.

id convention: existing gym_members ids are bare `nanoid()` (no prefix), e.g. `RGRbwDb_s8lPiZX2taEWK`.
`nanoid` is already imported at the top of conversations.ts.

messages.externalId onConflict pattern already in conversations.ts (mirror this for gymMembers):
```ts
.onConflictDoNothing({
  target: schema.messages.externalId,
  where: sql`${schema.messages.externalId} is not null`,
})
```
The phone_e164 partial UNIQUE index is also `WHERE phone_e164 IS NOT NULL`, so the
gymMembers onConflict needs the same `where: sql\`${schema.gymMembers.phoneE164} is not null\`` predicate.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Auto-create gym_member for inbound from unknown numbers (worker)</name>
  <files>services/worker/src/domain/conversations.ts, services/worker/src/domain/conversations.test.ts</files>
  <behavior>
    Extend the worker Vitest suite (conversations.test.ts) BEFORE implementing:
    - Test A: inbound from a phone with NO matching gym_member → upsertConversationAndMessage
      INSERTs a gym_members row, creates an 'open' conversation, inserts the message,
      inserts a whatsapp_opt_in (source='inbound_reply'), and returns { processed: true }.
      (Assert the gymMembers INSERT was called with firstName set to the resolved name.)
    - Test B: name resolution — when rawPayload contains
      entry[0].changes[0].value.contacts[0].profile.name, firstName = that name;
      when absent (or rawPayload is a synthetic `{synthetic:true,...}` fallback),
      firstName = the E.164 number (e.g. "+447700900123").
    - Test C: the existing known-member path still returns { processed: true } unchanged
      (no regression — the early-return removal must not alter the happy path).
    Reuse the existing Drizzle-mock pattern in this file (mock the terminal chain
    method with mockResolvedValueOnce(rows); the query builder is a thenable —
    see STATE.md P1b-06 note). vi.hoisted() for shared mock fns referenced inside vi.mock().
  </behavior>
  <action>
    In services/worker/src/domain/conversations.ts, function `upsertConversationAndMessage`
    (~lines 45-171):

    1. REMOVE the early-return at lines 64-69 (`if (!member) return { processed:false,
       reason:"unknown_phone" }`). This was the deferred "stub member" path; implement it now.

    2. When `member` is null, AUTO-CREATE a gym_member, then fall through into the EXISTING
       conversation-upsert + message-insert + opt-in logic (do NOT duplicate that logic —
       resolve `member` to a real row and let the rest of the function run unchanged):

       a. Resolve the display name with a small safe parser that NEVER throws:
          - Parse `rawPayload` (a JSON string — the full Meta webhook envelope, OR a synthetic
            `{synthetic:true,...}` fallback when no webhook_events row existed; see inbound-whatsapp.ts
            line 108-109). Wrap JSON.parse in try/catch.
          - Read `parsed?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name`.
          - Fallback chain: profile.name (trimmed, non-empty) → `fromE164`.
          - Set `firstName = resolvedName`, `lastName = null`. (Do NOT over-engineer name
            splitting — single firstName field is acceptable per the locked decision.)
          - IMPORTANT: the executor MUST verify the actual shape of a real inbound payload
            BEFORE finalising the parser — query one recent inbound row's payload_raw from
            webhook_events via Neon MCP (project billowing-sun-51091059, the `gymos-demo` DB).
            Confirm the contacts[0].profile.name path; adjust if the real shape differs.

       b. Race-safe INSERT mirroring the messages.externalId onConflict pattern already in
          this file. The phone_e164 partial UNIQUE index is `WHERE phone_e164 IS NOT NULL`,
          so supply the matching predicate (else Postgres raises 42P10):
          ```ts
          // guard:allow-unscoped — webhook processor
          await db
            .insert(schema.gymMembers)
            .values({ id: nanoid(), firstName: resolvedName, lastName: null, phoneE164: fromE164 })
            .onConflictDoNothing({
              target: schema.gymMembers.phoneE164,
              where: sql`${schema.gymMembers.phoneE164} is not null`,
            });
          ```
          Use bare `nanoid()` (no prefix) to match the existing gym_members id convention.

       c. RE-SELECT the member by phoneE164 (same select used at lines 57-62) so concurrent
          inbound from the same new number resolves to ONE member (the loser of the
          onConflict race reads the winner's row). Assign the result to `member`.
          If the re-select still returns null (should not happen), return
          { processed: false, reason: "member_create_failed" } as a defensive guard.

       d. Fall through into the existing steps 2-4 (conversation upsert, message insert,
          opt-in insert) UNCHANGED — they already reference `member.id`.

    3. Do NOT touch `materialiseOutboundMirror` — its `unknown_phone` early-return for an
       unknown CUSTOMER on the outbound-mirror path is a genuinely different case and stays.

    Run prettier on the changed files.
  </action>
  <verify>
    <automated>cd services/worker && pnpm vitest run src/domain/conversations.test.ts</automated>
  </verify>
  <done>
    The auto-create test (unknown phone → member + open conversation + message + opt-in,
    returns processed:true) passes; the profile-name vs E.164-fallback test passes; the
    known-member path test still passes; the full conversations.test.ts suite is green;
    materialiseOutboundMirror is unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Prune stale templates on successful sync (staff-web)</name>
  <files>apps/staff-web/app/routes/gymos.messages.tsx</files>
  <action>
    In apps/staff-web/app/routes/gymos.messages.tsx, the `sync-templates` branch
    (~lines 417-511):

    1. Capture a `syncStartedAt` ISO string BEFORE the fetch loop begins (immediately
       after `const db = getDb();` at ~line 440):
       ```ts
       const syncStartedAt = new Date().toISOString();
       ```
       The per-row upsert already sets `lastSyncedAt: new Date().toISOString()` (later than
       syncStartedAt), so every row refreshed by THIS sync has last_synced_at > syncStartedAt.

    2. After the for-loop completes SUCCESSFULLY (i.e. the loop ran to its `break`/end without
       hitting the `return { syncResult: { ok:false ... } }` early-returns), and ONLY IF
       `synced > 0`, prune templates not refreshed by this sync:
       ```ts
       let pruned = 0;
       if (synced > 0) {
         // guard:allow-unscoped — single-tenant; templates are studio-wide
         const delResult: any = await (db as any).execute(
           sql`delete from whatsapp_templates where last_synced_at < ${syncStartedAt}`,
         );
         pruned = delResult?.rowCount ?? delResult?.rows?.length ?? 0;
       }
       ```
       Use the raw `db.execute(sql\`...\`)` cast pattern already used elsewhere in the
       staff-web codebase (STATE.md: `(db as any).execute(sql\`…\`)`). Ensure `sql` is
       imported from "drizzle-orm" in this file — if not already imported, add it.
       Comparison is TEXT vs TEXT (ISO strings sort lexicographically === chronologically),
       so `last_synced_at < syncStartedAt` correctly selects rows not refreshed this run.

    3. Do NOT prune on error or empty pull: the existing early-returns
       (`MYÜTIK ${res.status}` and missing-API-key) already bail before reaching the prune;
       the `synced > 0` guard prevents wiping the picker when the new account returns zero
       templates (transient/empty pull).

    4. Surface the pruned count in the success return:
       ```ts
       return { syncResult: { ok: true, synced, pruned } };
       ```
       (TemplatesDialog currently reads `synced`; adding `pruned` is additive and harmless.
       Surfacing it in the toast is optional — leave the dialog as-is if non-trivial.)

    Run prettier on the changed file.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | rg "gymos.messages" || echo "no type errors in gymos.messages.tsx"</automated>
  </verify>
  <done>
    The sync-templates branch captures syncStartedAt before the loop, deletes
    whatsapp_templates rows with last_synced_at < syncStartedAt only after a successful
    sync with synced > 0, returns { ok:true, synced, pruned }, never prunes on error or
    empty pull, and carries the guard:allow-unscoped comment. No new type errors in the file.
  </done>
</task>

</tasks>

<verification>
- Worker: `cd services/worker && pnpm vitest run src/domain/conversations.test.ts` — green, including the new auto-create + name-resolution tests.
- Staff-web: `gymos.messages.tsx` typechecks; prune logic only runs on successful sync with synced > 0.
- Behaviour replay (constraint: no local dev server — verify substance against live Neon, see STATE.md): optionally replay the auto-create SQL against gymos-demo Neon via Neon MCP using a throwaway test number, confirm one gym_member + one open conversation + one opt-in, then clean up the test rows.
- Fork boundary held: only services/worker/** and apps/staff-web/** touched; no templates/** or packages-vendored/** edits; no DB schema changes (uses existing columns + existing partial unique index).
</verification>

<success_criteria>
- Inbound WhatsApp from an unknown number creates a gym_member (name = profile name or E.164) + an 'open' conversation visible in the inbox + the message + a whatsapp_opt_in (source='inbound_reply').
- Concurrent inbound from the same new number yields exactly one member (onConflictDoNothing + re-select).
- materialiseOutboundMirror's unknown_phone behaviour is unchanged.
- "Update templates" prunes stale templates on a successful sync (synced > 0) and never prunes on error or empty pull.
- Prettier run on all changed files; worker Vitest suite passes.
</success_criteria>

<output>
After completion, create `.planning/quick/260615-phi-inbound-whatsapp-from-unknown-numbers-au/260615-phi-SUMMARY.md`
</output>
