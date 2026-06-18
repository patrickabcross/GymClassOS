---
phase: AE3-members-campaigns-write-tools
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/actions/update-member.ts
requirements: [AEM-01, AEM-02]
autonomous: true
must_haves:
  truths:
    - "The agent can update a member's first name, last name, email, phone (E.164), or notes via update-member; only supplied fields change; an empty patch is a no-op success"
    - "update-member's Zod schema is .strict() so marketing_consent / whatsapp_opt_in / any extra key is rejected at parse time — the agent can never silently flip consent (AEM-02)"
    - "A phone that is not valid E.164 is rejected with a typed {error:'INVALID_PHONE'} — no normalization, no assumed country code; '+447700900123' is stored verbatim"
    - "firstName can never be blanked (schema .min(1)); changing email/phone to a value owned by another member returns {error:'EMAIL_IN_USE'} / {error:'PHONE_IN_USE'} instead of a raw DB unique-constraint 500"
  artifacts:
    - path: "apps/staff-web/actions/update-member.ts"
      provides: "agent-only partial-update action over gym_members (5 allowed fields), .strict() consent exclusion, E.164 + email validation, collision pre-checks"
      contains: ".strict("
      min_lines: 60
  key_links:
    - from: "apps/staff-web/actions/update-member.ts"
      to: "schema.gymMembers"
      via: "resolve-by-id then db.update().set(partial).where(eq(id))"
      pattern: "schema\\.gymMembers"
---

<objective>
Create the `update-member` agent action (AEM-01 + AEM-02) — a near-clone of the shipped `update-class-definition.ts`. Resolve a member by id, build a `Partial` from supplied optional fields, no-op on empty patch, single `db.update().where()`. Two correctness deltas over the class-definition template: (1) the Zod object is `.strict()` so consent/opt-in fields are rejected at parse time (AEM-02 is structural, not behavioral); (2) phone is validated as E.164 and email as `z.string().email()`, both rejected (never normalized) with typed errors, plus collision pre-checks against the unique email/phone indexes.

Purpose: Gives the agent the ability to correct member profile data (the Members write tool) while making it structurally impossible to touch marketing consent or WhatsApp opt-in. This is the lower-risk of the two AE3 actions and is independent of the campaigns work (different file), so it runs in parallel wave 1.

Output: ONE new file — `apps/staff-web/actions/update-member.ts`. NO schema change (every column already exists; `notes` confirmed at `schema.ts:129`). NO gate-file edits (this is a direct action per AEX-02). Agent exposure (system prompt + AGENTS.md) is deliberately deferred to AE3-03 so the agent never hallucinates a call before the action ships (STATE.md "system-prompt ships last" constraint).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/AE3-members-campaigns-write-tools/AE3-RESEARCH.md
@apps/staff-web/AGENTS.md

<interfaces>
<!-- update-class-definition.ts is the EXACT template (resolve → Partial → empty no-op → single update().where() → {updated}). -->
<!-- gym_members columns (apps/staff-web/server/db/schema.ts:109-132): -->
<!--   id text PK; firstName text NOT NULL; lastName text; email text; phoneE164 text; -->
<!--   notes text; marketingConsent integer(boolean) NOT NULL default false; createdAt text; updatedAt text -->
<!-- whatsappOptIn is a SEPARATE table (schema.ts:343) — never imported here. -->
<!-- DB export: import { getDb, schema } from "../server/db/index.js"; drizzle helpers from "drizzle-orm". -->
<!-- gym_members is UNIQUE on BOTH email AND phone_e164 (memory project_gymos_member_upsert_keys) — collision pre-check needed. -->
<!-- Agent-only mutation: NO `http` key (per AGENTS.md "Adding a New Gym Action" step 2; a GET would also suppress the live-refresh source:"action" signal). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create the update-member agent action (.strict() + E.164 + collision pre-checks)</name>
  <files>apps/staff-web/actions/update-member.ts</files>
  <read_first>
    - apps/staff-web/actions/update-class-definition.ts (FULL — the resolve→Partial→empty-no-op→update().where()→{updated} template; copy its shape exactly)
    - apps/staff-web/actions/list-members.ts (the `import { getDb, schema } from "../server/db/index.js"` path + `guard:allow-unscoped` comment convention)
    - apps/staff-web/server/db/schema.ts lines 109-132 (gymMembers columns: firstName notNull, lastName, email, phoneE164, notes, marketingConsent, createdAt, updatedAt) and line 343 (whatsappOptIn is a separate table — confirm it is NOT imported)
    - .planning/phases/AE3-members-campaigns-write-tools/AE3-RESEARCH.md "Pattern 1" (the full update-member code) + Pitfalls 4 (firstName notNull) and 5 (email/phone unique collision)
  </read_first>
  <action>
    Create `apps/staff-web/actions/update-member.ts` exactly as below. This follows `update-class-definition.ts`'s shape with three deltas: `.strict()` on the schema, E.164/email validation in `run()` returning typed errors (Open Question 1 resolved IN FAVOUR of in-run validation so the agent gets an explainable `{error}` rather than a raw Zod stack), and collision pre-checks against the unique email/phone indexes.

    Write this file verbatim:
    ```typescript
    // update-member — AEM-01, AEM-02
    //
    // Update a gym member's profile fields: first name, last name, email,
    // phone (E.164), or notes — and ONLY those fields. The schema is .strict(),
    // so marketing_consent / whatsapp_opt_in / any other key is rejected at
    // parse time: the agent can never silently flip consent (AEM-02). Phone is
    // validated as E.164 and REJECTED (never normalized) if malformed; email is
    // validated. An empty patch is a no-op success.
    //
    // Agent-only mutation: no `http` key (write actions are agent-only per
    // apps/staff-web/AGENTS.md "Adding a New Gym Action" step 2; a GET would also
    // suppress the live-refresh source:"action" signal).

    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { and, eq, ne } from "drizzle-orm";

    // E.164: leading '+', first digit 1-9, then up to 14 more digits (max 15 total).
    const E164 = /^\+[1-9]\d{1,14}$/;

    export default defineAction({
      description:
        "Update a gym member's profile: first name, last name, email, phone (E.164), or notes. " +
        "Only the supplied fields change. NEVER changes marketing consent or WhatsApp opt-in — those " +
        "are structurally excluded and cannot be set by this tool. Phone must be valid E.164 " +
        "(e.g. +447700900123) or it is rejected (no auto-formatting). Empty patch is a no-op success. " +
        "Returns {updated:true} | {updated:false, reason} | {error}.",
      schema: z
        .object({
          memberId: z.string().min(1),
          firstName: z.string().min(1).max(120).optional(),
          lastName: z.string().max(120).optional(),
          email: z.string().max(254).optional(),
          phoneE164: z.string().max(20).optional(),
          notes: z.string().max(2000).optional(),
        })
        .strict(), // AEM-02: rejects marketing_consent / whatsapp_opt_in / any extra key at parse time

      run: async ({ memberId, firstName, lastName, email, phoneE164, notes }) => {
        const db = getDb();

        // Resolve the member first (explicit not-found error, mirrors update-class-definition).
        // guard:allow-unscoped — single-tenant gym tables
        const [m] = await db
          .select({ id: schema.gymMembers.id })
          .from(schema.gymMembers)
          .where(eq(schema.gymMembers.id, memberId))
          .limit(1);
        if (!m) return { error: "MEMBER_NOT_FOUND" };

        // Validate phone/email in-run so the agent gets a typed, explainable error
        // (NOT a raw Zod failure). D-07: reject, never normalize — phone_e164 is the
        // WhatsApp natural key.
        if (phoneE164 !== undefined && !E164.test(phoneE164)) {
          return { error: "INVALID_PHONE" };
        }
        if (email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return { error: "INVALID_EMAIL" };
        }

        // Collision pre-checks: gym_members is UNIQUE on BOTH email and phone_e164.
        // Updating to a value already owned by ANOTHER member would 500 on the
        // unique index; pre-check and return a typed error instead (Pitfall 5).
        if (email !== undefined) {
          // guard:allow-unscoped — single-tenant gym tables
          const [clash] = await db
            .select({ id: schema.gymMembers.id })
            .from(schema.gymMembers)
            .where(
              and(
                eq(schema.gymMembers.email, email),
                ne(schema.gymMembers.id, memberId),
              ),
            )
            .limit(1);
          if (clash) return { error: "EMAIL_IN_USE" };
        }
        if (phoneE164 !== undefined) {
          // guard:allow-unscoped — single-tenant gym tables
          const [clash] = await db
            .select({ id: schema.gymMembers.id })
            .from(schema.gymMembers)
            .where(
              and(
                eq(schema.gymMembers.phoneE164, phoneE164),
                ne(schema.gymMembers.id, memberId),
              ),
            )
            .limit(1);
          if (clash) return { error: "PHONE_IN_USE" };
        }

        const updates: Partial<typeof schema.gymMembers.$inferInsert> = {};
        if (firstName !== undefined) updates.firstName = firstName;
        if (lastName !== undefined) updates.lastName = lastName;
        if (email !== undefined) updates.email = email;
        if (phoneE164 !== undefined) updates.phoneE164 = phoneE164;
        if (notes !== undefined) updates.notes = notes;
        if (Object.keys(updates).length === 0)
          return { updated: false, reason: "no changes" };

        // gym_members.updatedAt exists (schema.ts:131).
        updates.updatedAt = new Date().toISOString();

        // guard:allow-unscoped — single-tenant gym tables
        await db
          .update(schema.gymMembers)
          .set(updates)
          .where(eq(schema.gymMembers.id, memberId));
        return { updated: true };
      },
    });
    ```

    Notes for the executor:
    - `firstName: z.string().min(1)` (Pitfall 4): firstName is `notNull`; `.min(1)` means the agent can never submit an empty string for it. `lastName`/`email`/`phoneE164`/`notes` are nullable columns but the action only ever SETs them when supplied, so it cannot accidentally null a column.
    - Do NOT add `marketingConsent`, `whatsappOptIn`, `optedInAt`, or `optedOutAt` to the schema. The `.strict()` call is what enforces AEM-02 — do not weaken it to `.passthrough()` / plain `z.object`.
    - Do NOT add an `http` key. Do NOT add this action to `propose-action.ts` enum or `approve-proposal.ts` ACTION_ALLOWLIST (AEX-02: this is a direct action).
    - Use `z.string().max(254)` for email + in-run regex (NOT `z.string().email()`) so the not-found / collision errors surface as typed `{error}` results consistently; the in-run email regex returns `{error:"INVALID_EMAIL"}`.

    Run `npx prettier --write apps/staff-web/actions/update-member.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/actions/update-member.ts` exists
    - `apps/staff-web/actions/update-member.ts` contains `.strict(`
    - `apps/staff-web/actions/update-member.ts` contains `MEMBER_NOT_FOUND`
    - `apps/staff-web/actions/update-member.ts` contains `INVALID_PHONE`
    - `apps/staff-web/actions/update-member.ts` contains `EMAIL_IN_USE` and `PHONE_IN_USE`
    - `apps/staff-web/actions/update-member.ts` contains the regex literal `/^\+[1-9]\d{1,14}$/`
    - `apps/staff-web/actions/update-member.ts` does NOT contain `marketingConsent`, `whatsappOptIn`, or `http:`
    - `apps/staff-web/actions/update-member.ts` contains `// guard:allow-unscoped` on every Drizzle query (at least 4 occurrences)
    - `apps/staff-web/actions/update-member.ts` contains `firstName: z.string().min(1)`
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>update-member.ts exists, compiles, structurally excludes consent via .strict(), validates+rejects bad phone/email with typed errors, pre-checks email/phone collisions, and never blanks firstName. Not yet exposed to the agent (AE3-03 does that).</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` exits 0
- grep proves `.strict(` present and `marketingConsent` / `whatsappOptIn` / `http:` absent in update-member.ts
- grep proves the action is NOT referenced in propose-action.ts or approve-proposal.ts (AEX-02 direct): `grep -n "update-member" apps/staff-web/actions/propose-action.ts apps/staff-web/actions/approve-proposal.ts` returns nothing
- Optional live confirmation (deferred to AE3-03 / Vercel deploy, since the action is not agent-exposed until then): replay update-member's SQL against gymos-demo Neon via Neon MCP — UPDATE a test member's notes, confirm the row, then revert.
</verification>

<success_criteria>
- update-member edits only firstName/lastName/email/phoneE164/notes (AEM-01)
- `.strict()` schema rejects marketing_consent / whatsapp_opt_in at parse time (AEM-02 — structural, not a runtime if-check)
- E.164 phone rejected (not normalized) with {error:"INVALID_PHONE"}; "+447700900123" would store verbatim
- email/phone collisions return typed errors instead of a DB 500
- empty patch returns {updated:false, reason:"no changes"}; firstName can never be blanked
- the action is direct (no gate); agent exposure happens in AE3-03
</success_criteria>

<output>
After completion, create `.planning/phases/AE3-members-campaigns-write-tools/AE3-01-SUMMARY.md`
</output>
