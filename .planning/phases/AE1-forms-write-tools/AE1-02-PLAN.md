---
phase: AE1-forms-write-tools
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - apps/staff-web/actions/publish-form.ts
  - apps/staff-web/actions/approve-proposal.ts
  - apps/staff-web/actions/propose-action.ts
  - apps/staff-web/server/db/schema.ts
autonomous: true
requirements: [AEF-04, AEX-02]
must_haves:
  truths:
    - "Agent can request a form be published only via propose-action (never auto-publishes)"
    - "Approving a publish-form proposal flips forms.status to 'published' and serves it at /f/{slug}"
    - "publish-form re-validates the stored fields JSON before going live; malformed fields block the publish"
    - "The gate is atomic: ACTION_ALLOWLIST, the dynamic-import branch, the propose-action Zod enum, and the dashboardProposals.actionName Drizzle enum all include 'publish-form'"
  artifacts:
    - path: "apps/staff-web/actions/publish-form.ts"
      provides: "publish-form gated defineAction (AEF-04)"
      contains: "defineAction"
    - path: "apps/staff-web/actions/approve-proposal.ts"
      provides: "ACTION_ALLOWLIST + dynamic-import branch including publish-form"
      contains: "publish-form"
    - path: "apps/staff-web/actions/propose-action.ts"
      provides: "propose-action Zod enum including publish-form"
      contains: "publish-form"
    - path: "apps/staff-web/server/db/schema.ts"
      provides: "dashboardProposals.actionName Drizzle text enum including publish-form"
      contains: "publish-form"
  key_links:
    - from: "apps/staff-web/actions/approve-proposal.ts"
      to: "apps/staff-web/actions/publish-form.ts"
      via: "dynamic import './publish-form.js' on proposal.actionName === 'publish-form'"
      pattern: "publish-form\\.js"
    - from: "apps/staff-web/actions/publish-form.ts"
      to: "apps/staff-web/features/forms/lib/form-field-schema.ts"
      via: "re-validate stored fields before going live"
      pattern: "form-field-schema"
---

<objective>
Ship the single GATED forms action — `publish-form` — and wire it through the propose→approve chokepoint atomically. This is Wave 2 of AE1: the only AE1 action that routes through human approval before it runs.

Purpose: Form-going-live is member-visible, so AEF-04 requires it route through propose→approve (the agent never auto-publishes). AEX-02 requires the gate be wired atomically: a new gated action must appear in BOTH the runtime allowlist/dispatch (approve-proposal.ts) AND the propose-action Zod enum AND the Drizzle text enum on dashboardProposals.actionName — all in one task/commit, or tsc breaks or the gate fails at runtime.

Output: 1 new gated action file (`publish-form.ts`) + 3 atomic edits (approve-proposal.ts, propose-action.ts, schema.ts). NO system-prompt change here (that is Wave 3, AE1-03).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/AE1-forms-write-tools/AE1-RESEARCH.md

<interfaces>
<!-- approve-proposal.ts CURRENT state (apps/staff-web/actions/approve-proposal.ts) -->
<!-- ACTION_ALLOWLIST (lines 10-13): -->
```typescript
const ACTION_ALLOWLIST = [
  "send-template-to-members",
  "create-checkout-link",
] as const;
```
<!-- dynamic-import branch (lines 59-64): -->
```typescript
let mod: any;
if (proposal.actionName === "send-template-to-members") {
  mod = await import("./send-template-to-members.js");
} else {
  mod = await import("./create-checkout-link.js");
}
```

<!-- propose-action.ts CURRENT Zod enum (apps/staff-web/actions/propose-action.ts lines 19-23): -->
```typescript
actionName: z
  .enum(["send-template-to-members", "create-checkout-link"])
  .describe("The existing gated action this proposal will execute on approval"),
```

<!-- schema.ts CURRENT dashboardProposals.actionName (apps/staff-web/server/db/schema.ts lines 478-480): -->
```typescript
actionName: text("action_name", {
  enum: ["send-template-to-members", "create-checkout-link"],
}).notNull(),
```
<!-- This is a Drizzle text() enum = plain TEXT column in Postgres, TS-only validation. -->
<!-- Adding "publish-form" requires NO Postgres migration (RESEARCH §dashboardProposals confirms). -->

<!-- FormFieldSchema (shipped in AE1-01): apps/staff-web/features/forms/lib/form-field-schema.ts -->
<!-- forms columns: id, slug, status, fields (text JSON), deletedAt. getDb/schema from ../server/db/index.js -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create publish-form gated action</name>
  <files>apps/staff-web/actions/publish-form.ts</files>
  <read_first>
    - apps/staff-web/actions/create-checkout-link.ts (a gated action that is executed BY approve-proposal — shape reference for a propose→approve target)
    - apps/staff-web/features/forms/lib/form-field-schema.ts (FormFieldSchema — shipped in AE1-01)
    - apps/staff-web/features/forms/handlers/forms.ts line ~44 (getPublicForm gate: status==='published' && !deletedAt — confirms publish criteria)
    - apps/staff-web/actions/unpublish-form.ts (shipped in AE1-01 — the inverse action, for symmetry of shape)
  </read_first>
  <action>
    Create `apps/staff-web/actions/publish-form.ts`. This is the target action that `approve-proposal` runs AFTER the coach approves. It re-validates the stored fields JSON against FormFieldSchema before flipping status to 'published' (RESEARCH Pattern 3 — malformed JSON silently breaks the public renderer). Verbatim:
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq } from "drizzle-orm";
    import { FormFieldSchema } from "../features/forms/lib/form-field-schema.js";

    export default defineAction({
      description:
        "Publish a draft form (makes it live at /f/{slug}). Must be approved via propose-action first — the agent never calls this directly. Re-validates the form's fields before going live. Returns { published: true, slug } or { error }.",
      schema: z.object({
        formId: z.string().min(1).describe("The form's id to publish"),
      }),
      run: async ({ formId }) => {
        const db = getDb();
        // guard:allow-unscoped — single-tenant gym forms
        const [form] = await db
          .select()
          .from(schema.forms)
          .where(eq(schema.forms.id, formId))
          .limit(1);
        if (!form) return { error: "FORM_NOT_FOUND" };
        if (form.deletedAt) return { error: "FORM_IS_ARCHIVED" };

        // Re-validate fields before going live (prevent malformed JSON silently
        // breaking the public renderer).
        let fields: unknown;
        try {
          fields = JSON.parse(form.fields);
        } catch {
          return { error: "FIELDS_INVALID_JSON" };
        }
        const parsed = z.array(FormFieldSchema).safeParse(fields);
        if (!parsed.success) {
          return { error: "FIELDS_INVALID", issues: parsed.error.issues };
        }

        // guard:allow-unscoped — single-tenant gym forms
        await db
          .update(schema.forms)
          .set({ status: "published", updatedAt: new Date().toISOString() })
          .where(eq(schema.forms.id, formId));
        return { published: true, slug: form.slug };
      },
    });
    ```
    Run `npx prettier --write apps/staff-web/actions/publish-form.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/actions/publish-form.ts` exists and contains `defineAction`
    - publish-form.ts imports `FormFieldSchema` from `../features/forms/lib/form-field-schema.js`
    - publish-form.ts run() returns `{ error: "FIELDS_INVALID" }` (or FIELDS_INVALID_JSON) before any UPDATE when fields fail validation, and `{ error: "FORM_IS_ARCHIVED" }` when deletedAt is set
    - publish-form.ts contains `// guard:allow-unscoped`
    - publish-form.ts contains NO `http:` key (it is invoked only via approve-proposal)
    - `cd apps/staff-web && npx tsc --noEmit` exits 0 (note: tsc will still pass here because publish-form is not yet referenced by approve-proposal/propose-action — those edits are Task 2)
  </acceptance_criteria>
  <done>publish-form.ts compiles, re-validates fields before going live, and only flips status to 'published' when fields are valid and the form is not archived.</done>
</task>

<task type="auto">
  <name>Task 2: Atomic gate wiring — extend ACTION_ALLOWLIST + dispatch branch + propose-action enum + schema enum in one commit</name>
  <files>apps/staff-web/actions/approve-proposal.ts, apps/staff-web/actions/propose-action.ts, apps/staff-web/server/db/schema.ts</files>
  <read_first>
    - apps/staff-web/actions/approve-proposal.ts (FULL file — ACTION_ALLOWLIST lines 10-13, dispatch if/else lines 59-64)
    - apps/staff-web/actions/propose-action.ts (FULL file — Zod enum lines 19-23, description string lines 7-13)
    - apps/staff-web/server/db/schema.ts lines 474-481 (dashboardProposals.actionName Drizzle text enum)
    - apps/staff-web/actions/publish-form.ts (created in Task 1 — the dynamic-import target)
  </read_first>
  <action>
    Make ALL THREE edits in a single commit (AEX-02 gate atomicity — missing any one breaks tsc or the runtime gate). This is the gate-atomicity invariant from the planning context.

    EDIT 1 — `apps/staff-web/actions/approve-proposal.ts`:
    (a) Extend ACTION_ALLOWLIST (lines 10-13) to add `"publish-form"`:
    ```typescript
    const ACTION_ALLOWLIST = [
      "send-template-to-members",
      "create-checkout-link",
      "publish-form",
    ] as const;
    ```
    (b) Convert the dispatch `if/else` (currently lines 59-64) into an `if / else if / else` chain so publish-form gets its own dynamic-import branch:
    ```typescript
    let mod: any;
    if (proposal.actionName === "send-template-to-members") {
      mod = await import("./send-template-to-members.js");
    } else if (proposal.actionName === "publish-form") {
      mod = await import("./publish-form.js");
    } else {
      mod = await import("./create-checkout-link.js");
    }
    ```

    EDIT 2 — `apps/staff-web/actions/propose-action.ts`:
    (a) Extend the Zod enum (lines 19-23) to add `"publish-form"`:
    ```typescript
    actionName: z
      .enum(["send-template-to-members", "create-checkout-link", "publish-form"])
      .describe(
        "The existing gated action this proposal will execute on approval",
      ),
    ```
    (b) Update the description string (lines 7-13) so the line currently reading
    `"actionName must be 'send-template-to-members' or 'create-checkout-link'. "`
    becomes
    `"actionName must be 'send-template-to-members', 'create-checkout-link', or 'publish-form'. "`

    EDIT 3 — `apps/staff-web/server/db/schema.ts` (lines 478-480) — extend the dashboardProposals.actionName Drizzle text enum so tsc accepts inserting "publish-form". This is additive, TS-only, plain TEXT column — NO Postgres migration (RESEARCH §dashboardProposals + Pitfall 1):
    ```typescript
    actionName: text("action_name", {
      enum: ["send-template-to-members", "create-checkout-link", "publish-form"],
    }).notNull(),
    ```

    Run `npx prettier --write apps/staff-web/actions/approve-proposal.ts apps/staff-web/actions/propose-action.ts apps/staff-web/server/db/schema.ts`.

    Before finishing, grep the staff-web test files for any exhaustive match on the proposal actionName literal type that a new enum member would break (RESEARCH Open Question 2): `grep -rn "create-checkout-link" apps/staff-web --include=*.test.ts`. If a test exhaustively switches/asserts on the two-member union, update it to include "publish-form"; if no such test exists, no change needed.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - approve-proposal.ts ACTION_ALLOWLIST array contains the string `"publish-form"`
    - approve-proposal.ts contains a branch `else if (proposal.actionName === "publish-form")` that does `await import("./publish-form.js")`
    - propose-action.ts Zod enum contains `"publish-form"` (the `z.enum([...])` for actionName has 3 members)
    - propose-action.ts description string mentions `publish-form`
    - schema.ts dashboardProposals.actionName `enum` array contains `"publish-form"` (3 members total)
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
    - No `.sql` migration file was added (this is a Drizzle TS-only enum change)
  </acceptance_criteria>
  <done>All three gate locations include "publish-form" in one commit; tsc passes; the agent can propose publish-form and approve-proposal can dispatch it. No Postgres migration was created.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` exits 0
- grep proves "publish-form" appears in all four files: actions/publish-form.ts, actions/approve-proposal.ts, actions/propose-action.ts, server/db/schema.ts
- approve-proposal.ts dispatch chain reaches `import("./publish-form.js")` only for `proposal.actionName === "publish-form"`
- No new file under `apps/staff-web/server/db/migrations/` (Drizzle text enum is additive TS-only)
- NO edit to agent-chat.ts or AGENTS.md in this plan (system-prompt exposure is Wave 3, AE1-03)
- Optional DB replay (Neon MCP, gymos-demo billowing-sun-51091059): INSERT a dashboard_proposals row with action_name='publish-form', status='pending' (confirms the plain-TEXT column accepts the value without a constraint), then DELETE the test row
</verification>

<success_criteria>
- publish-form gated action exists, re-validates fields, and flips status to published only on valid input
- Gate wired atomically: allowlist + dispatch branch + propose-action enum + Drizzle schema enum all include publish-form in one commit
- tsc passes with no migration added
- AEF-04 + AEX-02 satisfied at the code level (system-prompt naming of the propose→publish workflow deferred to AE1-03)
</success_criteria>

<output>
After completion, create `.planning/phases/AE1-forms-write-tools/AE1-02-SUMMARY.md`
</output>
