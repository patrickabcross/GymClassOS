---
phase: AE1-forms-write-tools
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/features/forms/lib/slugify.ts
  - apps/staff-web/features/forms/lib/form-field-schema.ts
  - apps/staff-web/actions/create-form.ts
  - apps/staff-web/actions/update-form-fields.ts
  - apps/staff-web/actions/update-form-meta.ts
  - apps/staff-web/actions/unpublish-form.ts
  - apps/staff-web/actions/archive-form.ts
  - apps/staff-web/actions/restore-form.ts
  - apps/staff-web/app/routes/gymos.forms._index.tsx
autonomous: true
requirements: [AEF-01, AEF-02, AEF-03, AEF-05, AEF-06, AEX-03]
must_haves:
  truths:
    - "Agent can create a draft form (title + optional description) with a unique slug"
    - "Agent can replace a form's fields with a Zod-validated + XSS-guarded array; malformed fields are rejected and never written"
    - "Agent can edit a form's title/description/settings without touching status or slug"
    - "Agent can unpublish a published form back to draft (direct, no gate)"
    - "Agent can archive (set deletedAt) and restore (clear deletedAt) a form"
    - "Forms list route re-runs its loader after any agent write action with no manual reload"
  artifacts:
    - path: "apps/staff-web/features/forms/lib/form-field-schema.ts"
      provides: "FormFieldSchema Zod object matching FormField interface"
      exports: ["FormFieldSchema"]
    - path: "apps/staff-web/features/forms/lib/slugify.ts"
      provides: "Shared slugify + uniqueSlug helper used by route + create-form"
      exports: ["slugify"]
    - path: "apps/staff-web/actions/create-form.ts"
      provides: "create-form defineAction (AEF-01)"
      contains: "defineAction"
    - path: "apps/staff-web/actions/update-form-fields.ts"
      provides: "update-form-fields defineAction (AEF-02)"
      contains: "FormFieldSchema"
    - path: "apps/staff-web/actions/update-form-meta.ts"
      provides: "update-form-meta defineAction (AEF-03)"
      contains: "defineAction"
    - path: "apps/staff-web/actions/unpublish-form.ts"
      provides: "unpublish-form defineAction (AEF-05)"
      contains: "defineAction"
    - path: "apps/staff-web/actions/archive-form.ts"
      provides: "archive-form defineAction (AEF-06)"
      contains: "defineAction"
    - path: "apps/staff-web/actions/restore-form.ts"
      provides: "restore-form defineAction (AEF-06)"
      contains: "defineAction"
  key_links:
    - from: "apps/staff-web/actions/update-form-fields.ts"
      to: "apps/staff-web/features/forms/lib/form-field-schema.ts"
      via: "import { FormFieldSchema }"
      pattern: "form-field-schema"
    - from: "apps/staff-web/actions/update-form-fields.ts"
      to: "apps/staff-web/features/forms/lib/validate-fields.ts"
      via: "import { assertValidFields }"
      pattern: "assertValidFields"
    - from: "apps/staff-web/app/routes/gymos.forms._index.tsx"
      to: "@agent-native/core/client useChangeVersions"
      via: "useChangeVersions([\"action\"]) + useRevalidator"
      pattern: "useChangeVersions"
---

<objective>
Ship the six DIRECT (ungated) forms write actions plus the two shared validation utilities they depend on, and wire live-refresh into the Forms list route. This is Wave 1 of AE1: everything that does NOT route through propose→approve.

Purpose: Give the agent the full draft-side forms lifecycle (create, edit fields, edit meta, unpublish, archive, restore) with the same slug + field-validation correctness the existing route handler uses, and make the Forms tab refresh automatically after agent writes.

Output: 2 new lib files, 6 new defineAction files, and a live-refresh edit to `gymos.forms._index.tsx`. NO system-prompt change in this plan (that ships in Wave 3, AE1-03) and NO gate wiring (that ships in Wave 2, AE1-02).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/AE1-forms-write-tools/AE1-RESEARCH.md
@apps/staff-web/AGENTS.md

<interfaces>
<!-- FormField interface (source of truth) from apps/staff-web/features/forms/types.ts -->
```typescript
export type FormFieldType = "text" | "email" | "number" | "textarea" | "select" |
  "multiselect" | "checkbox" | "radio" | "date" | "rating" | "scale";

export interface FormField {
  id: string;               // MUST match /^[A-Za-z0-9_-]+$/
  type: FormFieldType;
  label: string;
  placeholder?: string;
  description?: string;
  required: boolean;
  options?: string[];
  validation?: { min?: number; max?: number; pattern?: string; message?: string };
  conditional?: { fieldId: string; operator: "equals" | "not_equals" | "contains"; value: string };
  width?: "full" | "half";
}
```

<!-- forms table columns (apps/staff-web/server/db/forms-schema.ts), exported via schema.forms -->
<!-- id (PK), title, description (nullable), slug (UNIQUE), fields (text JSON), settings (text JSON), -->
<!-- status ("draft"|"published"|"closed"), createdAt, updatedAt, deletedAt (nullable) -->

<!-- DB access (apps/staff-web/server/db/index.ts): -->
<!-- import { getDb, schema } from "../server/db/index.js";  // getDb() returns the Drizzle client -->

<!-- FIELD_ID_PATTERN + assertValidFields already exist in features/forms/lib/validate-fields.ts -->
<!-- export const FIELD_ID_PATTERN = /^[A-Za-z0-9_-]+$/; -->
<!-- export function assertValidFields(fields: unknown): void  // throws on bad id / dup id / non-numeric min-max -->

<!-- Live-refresh hook (confirmed export at apps/staff-web/app/pages/SettingsPage.tsx line 7): -->
<!-- import { useChangeVersions } from "@agent-native/core/client";  // signature: (sources: string[]) => number -->
<!-- import { useRevalidator } from "react-router"; -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add shared slugify util + FormFieldSchema Zod schema</name>
  <files>apps/staff-web/features/forms/lib/slugify.ts, apps/staff-web/features/forms/lib/form-field-schema.ts</files>
  <read_first>
    - apps/staff-web/features/forms/types.ts (FormField interface — source of truth for the Zod schema)
    - apps/staff-web/features/forms/lib/validate-fields.ts (FIELD_ID_PATTERN export + assertValidFields)
    - apps/staff-web/app/routes/gymos.forms._index.tsx lines 108-141 (existing slugify fn + uniqueness while-loop to replicate exactly)
  </read_first>
  <behavior>
    - FormFieldSchema.safeParse on a valid field { id:"phone", type:"text", label:"Phone", required:false } succeeds
    - FormFieldSchema.safeParse on { id:"x", type:"INVALID", label:"x", required:false } fails (bad type enum)
    - FormFieldSchema.safeParse on { id:"x", label:"x", required:false } fails (missing type)
    - slugify("Membership Enquiry!") returns "membership-enquiry"
    - slugify("   ") returns "form" (fallback)
  </behavior>
  <action>
    Create TWO files.

    FILE 1 — `apps/staff-web/features/forms/lib/slugify.ts`. Extract the exact slugify algorithm from `gymos.forms._index.tsx` lines 108-116 so the route and the new create-form action share one implementation (Pitfall 2 in RESEARCH — slug collision). Verbatim:
    ```typescript
    export function slugify(title: string): string {
      return (
        title
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "form"
      );
    }
    ```
    Do NOT change the route file in this task (route refactor is optional and out of scope here — the route can keep its inline copy; we only need a single shared source for create-form).

    FILE 2 — `apps/staff-web/features/forms/lib/form-field-schema.ts`. Translate the FormField interface to Zod verbatim, importing FIELD_ID_PATTERN from the existing validator so the id regex stays single-sourced:
    ```typescript
    import { z } from "zod";
    import { FIELD_ID_PATTERN } from "./validate-fields.js";

    const FieldIdSchema = z
      .string()
      .regex(FIELD_ID_PATTERN, "Field id must match [A-Za-z0-9_-]+");

    export const FormFieldSchema = z.object({
      id: FieldIdSchema,
      type: z.enum([
        "text", "email", "number", "textarea", "select", "multiselect",
        "checkbox", "radio", "date", "rating", "scale",
      ]),
      label: z.string().min(1),
      placeholder: z.string().optional(),
      description: z.string().optional(),
      required: z.boolean(),
      options: z.array(z.string()).optional(),
      validation: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
          pattern: z.string().optional(),
          message: z.string().optional(),
        })
        .optional(),
      conditional: z
        .object({
          fieldId: FieldIdSchema,
          operator: z.enum(["equals", "not_equals", "contains"]),
          value: z.string(),
        })
        .optional(),
      width: z.enum(["full", "half"]).optional(),
    });

    export type FormFieldInput = z.infer<typeof FormFieldSchema>;
    ```
    Run `npx prettier --write` on both files.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/features/forms/lib/slugify.ts` exists and exports `slugify`
    - File `apps/staff-web/features/forms/lib/form-field-schema.ts` exists, imports `FIELD_ID_PATTERN` from `./validate-fields.js`, and exports `FormFieldSchema`
    - form-field-schema.ts `z.enum` for `type` contains all 11 members: text, email, number, textarea, select, multiselect, checkbox, radio, date, rating, scale
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Both lib files exist; tsc passes; FormFieldSchema matches the FormField interface field-for-field.</done>
</task>

<task type="auto">
  <name>Task 2: Add create-form, update-form-meta, unpublish-form, archive-form, restore-form actions</name>
  <files>apps/staff-web/actions/create-form.ts, apps/staff-web/actions/update-form-meta.ts, apps/staff-web/actions/unpublish-form.ts, apps/staff-web/actions/archive-form.ts, apps/staff-web/actions/restore-form.ts</files>
  <read_first>
    - apps/staff-web/actions/create-class-occurrence.ts (defineAction shape + import path convention `../server/db/index.js`)
    - apps/staff-web/actions/propose-action.ts (a simple write defineAction for shape reference)
    - apps/staff-web/app/routes/gymos.forms._index.tsx lines 118-198 (existing create/archive/restore/publish intents — the canonical Drizzle writes to mirror)
    - apps/staff-web/features/forms/lib/slugify.ts (created in Task 1)
  </read_first>
  <action>
    Create FIVE defineAction files in `apps/staff-web/actions/`. Each imports `{ getDb, schema } from "../server/db/index.js"` and `{ eq } from "drizzle-orm"`. Every Drizzle query against `schema.forms` carries a `// guard:allow-unscoped — single-tenant gym forms` comment in the same file (the guard CI scan requires it). Mutations get NO `http` key (write actions are agent-only per AGENTS.md "Adding a New Gym Action" step 2).

    FILE 1 — `create-form.ts` (AEF-01):
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq } from "drizzle-orm";
    import { nanoid } from "nanoid";
    import { slugify } from "../features/forms/lib/slugify.js";

    export default defineAction({
      description:
        "Create a new lead-capture form as a draft. Returns { id, title, slug }. The form starts empty (no fields) — add fields with update-form-fields, then publish with propose-action.",
      schema: z.object({
        title: z.string().min(1).max(200).describe("Form title"),
        description: z.string().max(500).optional().describe("Optional description"),
      }),
      run: async ({ title, description }) => {
        const db = getDb();
        const slugBase = slugify(title);
        let slug = slugBase;
        let attempt = 0;
        // guard:allow-unscoped — single-tenant gym forms
        while (true) {
          const existing = await db
            .select({ id: schema.forms.id })
            .from(schema.forms)
            .where(eq(schema.forms.slug, slug))
            .then((r) => r[0]);
          if (!existing) break;
          attempt++;
          slug = `${slugBase}-${attempt}`;
        }
        const id = `form_${nanoid()}`;
        const now = new Date().toISOString();
        // guard:allow-unscoped — single-tenant gym forms
        await db.insert(schema.forms).values({
          id,
          title,
          slug,
          description: description ?? null,
          fields: JSON.stringify([]),
          settings: JSON.stringify({}),
          status: "draft",
          createdAt: now,
          updatedAt: now,
        });
        return { id, title, slug };
      },
    });
    ```

    FILE 2 — `update-form-meta.ts` (AEF-03). UPDATEs ONLY title/description/settings; NEVER status or slug. `settings` is a partial merge onto the existing FormSettings JSON:
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq } from "drizzle-orm";

    const SettingsPatch = z.object({
      submitText: z.string().optional(),
      successMessage: z.string().optional(),
      redirectUrl: z.string().optional(),
      showProgressBar: z.boolean().optional(),
    });

    export default defineAction({
      description:
        "Edit a form's title, description, and settings (submit text, success message). Does NOT change publish status or slug. Returns { updated: true }.",
      schema: z.object({
        formId: z.string().min(1).describe("The form's id"),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(500).nullable().optional(),
        settings: SettingsPatch.optional().describe("Partial settings to merge"),
      }),
      run: async ({ formId, title, description, settings }) => {
        const db = getDb();
        // guard:allow-unscoped — single-tenant gym forms
        const [form] = await db
          .select({ id: schema.forms.id, settings: schema.forms.settings })
          .from(schema.forms)
          .where(eq(schema.forms.id, formId))
          .limit(1);
        if (!form) return { error: "FORM_NOT_FOUND" };

        const patch: Record<string, unknown> = {
          updatedAt: new Date().toISOString(),
        };
        if (title !== undefined) patch.title = title;
        if (description !== undefined) patch.description = description;
        if (settings !== undefined) {
          let current: Record<string, unknown> = {};
          try {
            current = JSON.parse(form.settings) ?? {};
          } catch {
            current = {};
          }
          patch.settings = JSON.stringify({ ...current, ...settings });
        }
        // guard:allow-unscoped — single-tenant gym forms
        await db.update(schema.forms).set(patch).where(eq(schema.forms.id, formId));
        return { updated: true };
      },
    });
    ```

    FILE 3 — `unpublish-form.ts` (AEF-05). Direct UPDATE status='draft':
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq } from "drizzle-orm";

    export default defineAction({
      description:
        "Unpublish a published form — reverts it to draft and takes it offline at /f/{slug}. Direct action, no approval needed. Returns { unpublished: true }.",
      schema: z.object({
        formId: z.string().min(1).describe("The form's id"),
      }),
      run: async ({ formId }) => {
        const db = getDb();
        // guard:allow-unscoped — single-tenant gym forms
        const [form] = await db
          .select({ id: schema.forms.id })
          .from(schema.forms)
          .where(eq(schema.forms.id, formId))
          .limit(1);
        if (!form) return { error: "FORM_NOT_FOUND" };
        // guard:allow-unscoped — single-tenant gym forms
        await db
          .update(schema.forms)
          .set({ status: "draft", updatedAt: new Date().toISOString() })
          .where(eq(schema.forms.id, formId));
        return { unpublished: true };
      },
    });
    ```

    FILE 4 — `archive-form.ts` (AEF-06). UPDATE deletedAt=now() (this alone takes a published form offline — confirmed by getPublicForm gate in RESEARCH Pitfall 6):
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq } from "drizzle-orm";

    export default defineAction({
      description:
        "Archive a form (soft-delete; also takes it offline if it was published). Reversible with restore-form. Returns { archived: true }.",
      schema: z.object({
        formId: z.string().min(1).describe("The form's id"),
      }),
      run: async ({ formId }) => {
        const db = getDb();
        // guard:allow-unscoped — single-tenant gym forms
        const [form] = await db
          .select({ id: schema.forms.id })
          .from(schema.forms)
          .where(eq(schema.forms.id, formId))
          .limit(1);
        if (!form) return { error: "FORM_NOT_FOUND" };
        // guard:allow-unscoped — single-tenant gym forms
        await db
          .update(schema.forms)
          .set({ deletedAt: new Date().toISOString() })
          .where(eq(schema.forms.id, formId));
        return { archived: true };
      },
    });
    ```

    FILE 5 — `restore-form.ts` (AEF-06). UPDATE deletedAt=null:
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq } from "drizzle-orm";

    export default defineAction({
      description:
        "Restore an archived form (clears the archive flag). The form returns as a draft; republish via propose-action if it should go live. Returns { restored: true }.",
      schema: z.object({
        formId: z.string().min(1).describe("The form's id"),
      }),
      run: async ({ formId }) => {
        const db = getDb();
        // guard:allow-unscoped — single-tenant gym forms
        const [form] = await db
          .select({ id: schema.forms.id })
          .from(schema.forms)
          .where(eq(schema.forms.id, formId))
          .limit(1);
        if (!form) return { error: "FORM_NOT_FOUND" };
        // guard:allow-unscoped — single-tenant gym forms
        await db
          .update(schema.forms)
          .set({ deletedAt: null, updatedAt: new Date().toISOString() })
          .where(eq(schema.forms.id, formId));
        return { restored: true };
      },
    });
    ```
    Run `npx prettier --write apps/staff-web/actions/create-form.ts apps/staff-web/actions/update-form-meta.ts apps/staff-web/actions/unpublish-form.ts apps/staff-web/actions/archive-form.ts apps/staff-web/actions/restore-form.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - Files exist: actions/create-form.ts, actions/update-form-meta.ts, actions/unpublish-form.ts, actions/archive-form.ts, actions/restore-form.ts — each contains `defineAction`
    - create-form.ts imports `slugify` from `../features/forms/lib/slugify.js`
    - update-form-meta.ts UPDATE `set(patch)` never assigns `status` or `slug` (grep the file: no `status:` or `slug:` key inside the `patch` object)
    - Every file contains at least one `// guard:allow-unscoped` comment
    - None of the five files contains an `http:` key (mutations are agent-only)
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Five direct write actions compile; meta action provably cannot change status/slug; all queries carry the unscoped guard marker.</done>
</task>

<task type="auto">
  <name>Task 3: Add update-form-fields action (Zod + assertValidFields double validation) and wire live-refresh into the Forms route</name>
  <files>apps/staff-web/actions/update-form-fields.ts, apps/staff-web/app/routes/gymos.forms._index.tsx</files>
  <read_first>
    - apps/staff-web/features/forms/lib/form-field-schema.ts (created in Task 1 — FormFieldSchema)
    - apps/staff-web/features/forms/lib/validate-fields.ts (assertValidFields — second-pass XSS guard)
    - apps/staff-web/app/routes/gymos.forms._index.tsx (the route to add live-refresh to — read the component fn at line 212)
    - apps/staff-web/app/pages/SettingsPage.tsx lines 7 + 867 (the useChangeVersions(["...","action"]) reference pattern)
    - apps/staff-web/app/components/gymos/NewClassDialog.tsx lines 33, 102, 200 (useRevalidator + revalidate() reference pattern)
  </read_first>
  <action>
    PART A — Create `apps/staff-web/actions/update-form-fields.ts` (AEF-02). Validate with Zod FIRST (typed parse), then run `assertValidFields` as a second pass for the XSS-critical id regex + dup-id + numeric min/max checks (RESEARCH Pitfall 3 — Zod alone misses these). Per RESEARCH Pitfall 7, allow field edits on any non-archived form regardless of status (mirror existing route behavior — no status gate):
    ```typescript
    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { getDb, schema } from "../server/db/index.js";
    import { eq } from "drizzle-orm";
    import { FormFieldSchema } from "../features/forms/lib/form-field-schema.js";
    import { assertValidFields } from "../features/forms/lib/validate-fields.js";

    export default defineAction({
      description:
        "Replace a form's fields array (add/remove/reorder fields). All fields are Zod-validated AND XSS-guarded before write — malformed fields are rejected and never persisted. Pass the COMPLETE desired fields array (this replaces, it does not merge). Returns { updated: true, fieldCount } or { error }.",
      schema: z.object({
        formId: z.string().min(1).describe("The form's id"),
        fields: z
          .array(FormFieldSchema)
          .describe("Complete replacement fields array"),
      }),
      run: async ({ formId, fields }) => {
        const db = getDb();
        // guard:allow-unscoped — single-tenant gym forms
        const [form] = await db
          .select({ id: schema.forms.id, deletedAt: schema.forms.deletedAt })
          .from(schema.forms)
          .where(eq(schema.forms.id, formId))
          .limit(1);
        if (!form) return { error: "FORM_NOT_FOUND" };
        if (form.deletedAt) return { error: "FORM_IS_ARCHIVED" };

        // Second-pass XSS guard (id regex, dup ids, numeric min/max) — Zod alone misses these.
        try {
          assertValidFields(fields);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "FIELDS_INVALID" };
        }

        // guard:allow-unscoped — single-tenant gym forms
        await db
          .update(schema.forms)
          .set({
            fields: JSON.stringify(fields),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.forms.id, formId));
        return { updated: true, fieldCount: fields.length };
      },
    });
    ```
    Run `npx prettier --write apps/staff-web/actions/update-form-fields.ts`.

    PART B — Edit `apps/staff-web/app/routes/gymos.forms._index.tsx` for AEX-03 live-refresh. The route is an RR v7 loader route; `useDbSync` only invalidates TanStack Query, NOT loaders, so we subscribe to the "action" change source and call the revalidator.

    1. Add imports near the top (the file already imports from "react-router" on line 12 — extend that import to include `useRevalidator`; add a new import for `useChangeVersions`; the file already imports `useState` from "react" on line 13 — extend it to include `useEffect`):
    ```typescript
    import { useLoaderData, useNavigate, useFetcher, Link, useRevalidator } from "react-router";
    import { useState, useEffect } from "react";
    import { useChangeVersions } from "@agent-native/core/client";
    ```
    2. Inside `GymosFormsList()` (line 212), after the existing `const fetcher = useFetcher();` line, add:
    ```typescript
      const revalidator = useRevalidator();
      const actionVersion = useChangeVersions(["action"]);

      // Re-run the loader whenever the agent completes a write action (AEX-03).
      useEffect(() => {
        if (actionVersion > 0) {
          revalidator.revalidate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [actionVersion]);
    ```
    Do NOT add `revalidator` to the dependency array (RESEARCH Pitfall 5 — it is a new object each render and would loop). Leave the rest of the component unchanged.
    Run `npx prettier --write apps/staff-web/app/routes/gymos.forms._index.tsx`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/actions/update-form-fields.ts` exists, imports `FormFieldSchema` from `../features/forms/lib/form-field-schema.js` AND `assertValidFields` from `../features/forms/lib/validate-fields.js`
    - update-form-fields.ts schema uses `z.array(FormFieldSchema)` and the run() body calls `assertValidFields(fields)` inside a try/catch that returns `{ error: ... }`
    - update-form-fields.ts returns `{ error: "FORM_IS_ARCHIVED" }` when `form.deletedAt` is truthy
    - gymos.forms._index.tsx imports `useRevalidator` (from react-router), `useEffect` (from react), and `useChangeVersions` (from @agent-native/core/client)
    - gymos.forms._index.tsx contains `useChangeVersions(["action"])` and a `useEffect` whose dependency array is `[actionVersion]` (NOT including `revalidator`)
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>update-form-fields runs both validators; the Forms list route revalidates on the "action" change source with the correct (non-looping) dependency array.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` exits 0 (whole app compiles with the 6 new actions + 2 libs + route edit)
- `cd apps/staff-web && npx prettier --check actions/create-form.ts actions/update-form-fields.ts actions/update-form-meta.ts actions/unpublish-form.ts actions/archive-form.ts actions/restore-form.ts features/forms/lib/form-field-schema.ts features/forms/lib/slugify.ts app/routes/gymos.forms._index.tsx` reports no formatting issues
- grep confirms every new action file contains `// guard:allow-unscoped`
- NO edit to agent-chat.ts, propose-action.ts, approve-proposal.ts, or schema.ts in this plan (those are Waves 2 + 3)
- Optional DB replay (Neon MCP, gymos-demo project billowing-sun-51091059): INSERT a draft form via the create-form SQL shape, confirm a row with status='draft', then DELETE the test row
</verification>

<success_criteria>
- 6 direct write actions exist and compile: create-form, update-form-fields, update-form-meta, unpublish-form, archive-form, restore-form
- FormFieldSchema rejects malformed fields; update-form-fields never persists a field that fails Zod or assertValidFields
- update-form-meta cannot change status or slug
- Forms list route re-runs its loader on the "action" change source (no manual reload) without an infinite revalidate loop
- All AEF-01/02/03/05/06 + AEX-03 requirements have a shipped action/edit (system-prompt exposure deferred to AE1-03)
</success_criteria>

<output>
After completion, create `.planning/phases/AE1-forms-write-tools/AE1-01-SUMMARY.md`
</output>
