# Phase AE1: Forms Write Tools - Research

**Researched:** 2026-06-18
**Domain:** Agent write tools for forms lifecycle (defineAction pattern, propose→approve primitive, live-refresh via RR v7 + useDbSync)
**Confidence:** HIGH — all findings from direct source inspection; no external lookups required

---

## Summary

AE1 is a pure TypeScript addition to `apps/staff-web/actions/`. Every operation needed (create, edit, publish, unpublish, archive, restore) maps to a Drizzle write against the existing `forms` table, which is already fully defined in `apps/staff-web/server/db/forms-schema.ts` and re-exported through `apps/staff-web/server/db/schema.ts`. The `FormField` validation already exists in `apps/staff-web/features/forms/lib/validate-fields.ts` as `assertValidFields()`. No Zod schema for FormField exists yet — it must be built as a Zod translation of the TypeScript `FormField` interface in `apps/staff-web/features/forms/types.ts`.

The propose→approve gate is operational. Two files control it: `approve-proposal.ts` holds `ACTION_ALLOWLIST` (currently `["send-template-to-members", "create-checkout-link"]`) and `propose-action.ts` holds a matching Zod enum. Adding `"publish-form"` to AE1 requires both to be updated atomically. The pattern for `approve-proposal.ts` uses dynamic `import()` + module-level `schema.safeParse()` before calling `run()`.

The live-refresh challenge: the forms list route (`gymos.forms._index.tsx`) is a **RR v7 loader route**, not a TanStack Query route. `useDbSync` in `root.tsx` only invalidates TanStack Query caches — it does NOT trigger RR v7 `useRevalidator`. After any agent write, the framework emits `source: "action"` via `recordChange`. The forms route needs a `useChangeVersion("action")` + `useRevalidator` pattern to catch those events. This is not currently wired in the forms route (confirmed by code inspection — no `useRevalidator` usage in either forms route file).

**Primary recommendation:** Ship in 3 waves: (1) direct write actions (create, edit-fields, edit-meta, unpublish, archive, restore), (2) gated publish action + gate wiring, (3) system-prompt exposure + live-refresh hook. Do NOT add any action to the system prompt until its action file is deployed and verified.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AEF-01 | Agent creates a form (title, optional description) as draft | `create-form` defineAction → INSERT into `forms` table; status defaults to `"draft"` |
| AEF-02 | Agent edits a form's fields (add/remove/reorder); `fields` JSON Zod-validated before write | `update-form-fields` defineAction → validate with Zod FormField schema → UPDATE `forms.fields` |
| AEF-03 | Agent edits a form's title, description, settings without changing status or slug | `update-form-meta` defineAction → UPDATE `forms.{title,description,settings}` only |
| AEF-04 | Agent publishes a form via propose→approve (never auto-publishes) | `publish-form` defineAction + extend `ACTION_ALLOWLIST` + `propose-action` Zod enum |
| AEF-05 | Agent unpublishes a form (back to draft, direct — no gate) | `unpublish-form` defineAction → UPDATE `forms.status='draft'` |
| AEF-06 | Agent archives or restores a form | `archive-form` + `restore-form` defineActions → UPDATE `forms.deletedAt` |
| AEX-01 | Agent is context-aware of active tab/selected item; system prompt organized into per-tab sections | Extend `view-screen` for `nav.view === "forms"`; restructure system prompt in `agent-chat.ts` |
| AEX-02 | Risky ops gate through propose→approve; both `ACTION_ALLOWLIST` and Zod enum updated atomically | `publish-form` gated; `unpublish-form`/`archive-form`/`restore-form` direct |
| AEX-03 | After agent write, Forms tab live-refreshes — no manual reload | Add `useChangeVersion("action")` + `useRevalidator` to `gymos.forms._index.tsx` |
| AEX-04 | Every new write action documented in AGENTS.md and exposed in `agent-chat.ts` (two-exposure rule) | Document in AGENTS.md table + add system-prompt bullet in `agent-chat.ts` |
</phase_requirements>

---

## Standard Stack

All existing. Zero new dependencies.

| Library | Version | Purpose | In Project Already |
|---------|---------|---------|-------------------|
| `@agent-native/core` | workspace | `defineAction`, `readAppState`, `recordChange` | Yes |
| `drizzle-orm` | `^0.45.x` | DB writes (`db.insert`, `db.update`) | Yes |
| `zod` | `^4.x` | FormField schema validation | Yes |
| `nanoid` | `^5.1.x` | Form ID generation (`form_${nanoid()}`) | Yes |

---

## Architecture Patterns

### Project Structure (relevant subset)

```
apps/staff-web/
  actions/
    create-form.ts             ← NEW AEF-01
    update-form-fields.ts      ← NEW AEF-02
    update-form-meta.ts        ← NEW AEF-03
    publish-form.ts            ← NEW AEF-04 (gated)
    unpublish-form.ts          ← NEW AEF-05
    archive-form.ts            ← NEW AEF-06
    restore-form.ts            ← NEW AEF-06
    approve-proposal.ts        ← EDIT: add "publish-form" to ACTION_ALLOWLIST
    propose-action.ts          ← EDIT: add "publish-form" to Zod enum
    view-screen.ts             ← EDIT: add forms branch for AEX-01
  .generated/
    actions-registry.ts        ← REGEN: add 7 new action imports
  server/plugins/
    agent-chat.ts              ← EDIT: per-tab system prompt for AEX-01 + AEX-04
  app/routes/
    gymos.forms._index.tsx     ← EDIT: add useChangeVersion + useRevalidator for AEX-03
  features/forms/
    lib/
      validate-fields.ts       ← EXISTS: assertValidFields() — reuse as runtime guard
      form-field-schema.ts     ← NEW: Zod FormField schema (translate types.ts)
    types.ts                   ← EXISTS: FormField TypeScript interface (source of truth)
  apps/staff-web/AGENTS.md     ← EDIT: document 7 new actions in Agent Actions table
```

### Pattern 1: defineAction for direct write (create-form example)

```typescript
// apps/staff-web/actions/create-form.ts
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "nanoid";

export default defineAction({
  description: "Create a new lead-capture form as a draft. Returns { id, title, slug }.",
  schema: z.object({
    title: z.string().min(1).max(200).describe("Form title"),
    description: z.string().max(500).optional().describe("Optional description"),
  }),
  run: async ({ title, description }) => {
    const db = getDb();
    const slugBase = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "form";
    // slug uniqueness loop mirrors gymos.forms._index.tsx action handler
    let slug = slugBase;
    let attempt = 0;
    while (true) {
      const existing = await db.select({ id: schema.forms.id }).from(schema.forms)
        .where(eq(schema.forms.slug, slug)).then(r => r[0]);
      if (!existing) break;
      slug = `${slugBase}-${++attempt}`;
    }
    const id = `form_${nanoid()}`;
    const now = new Date().toISOString();
    // guard:allow-unscoped — single-tenant gym forms; no ownableColumns
    await db.insert(schema.forms).values({
      id, title, slug,
      description: description ?? null,
      fields: JSON.stringify([]),
      settings: JSON.stringify({}),
      status: "draft",
      createdAt: now, updatedAt: now,
    });
    return { id, title, slug };
  },
});
```

### Pattern 2: defineAction with Zod FormField validation (update-form-fields example)

```typescript
// apps/staff-web/actions/update-form-fields.ts
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";
import { FormFieldSchema } from "../features/forms/lib/form-field-schema.js";

export default defineAction({
  description: "Replace a form's fields array. All fields are Zod-validated before write. Malformed fields are rejected — never persisted.",
  schema: z.object({
    formId: z.string().min(1).describe("The form's id"),
    fields: z.array(FormFieldSchema).describe("Complete replacement fields array"),
  }),
  run: async ({ formId, fields }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym forms
    const [form] = await db.select({ id: schema.forms.id, status: schema.forms.status })
      .from(schema.forms).where(eq(schema.forms.id, formId)).limit(1);
    if (!form) return { error: "FORM_NOT_FOUND" };
    await db.update(schema.forms).set({
      fields: JSON.stringify(fields),
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.forms.id, formId));
    return { updated: true, fieldCount: fields.length };
  },
});
```

### Pattern 3: Gated publish via propose-action / publish-form

The agent calls `propose-action` with `actionName: "publish-form"`. The coach approves via the noticeboard. `approve-proposal` dynamically imports `publish-form.ts` and re-validates against its schema before calling `run()`.

```typescript
// apps/staff-web/actions/publish-form.ts
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";
import { FormFieldSchema } from "../features/forms/lib/form-field-schema.js";

export default defineAction({
  description: "Publish a draft form (makes it live at /f/{slug}). Must be approved via propose-action first — never call directly.",
  schema: z.object({
    formId: z.string().min(1).describe("The form's id to publish"),
  }),
  run: async ({ formId }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym forms
    const [form] = await db.select().from(schema.forms)
      .where(eq(schema.forms.id, formId)).limit(1);
    if (!form) return { error: "FORM_NOT_FOUND" };
    if (form.deletedAt) return { error: "FORM_IS_ARCHIVED" };

    // Re-validate fields before going live (prevent malformed JSON silently breaking public renderer)
    let fields: unknown;
    try { fields = JSON.parse(form.fields); } catch { return { error: "FIELDS_INVALID_JSON" }; }
    const parsed = z.array(FormFieldSchema).safeParse(fields);
    if (!parsed.success) return { error: "FIELDS_INVALID", issues: parsed.error.issues };

    await db.update(schema.forms).set({
      status: "published",
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.forms.id, formId));
    return { published: true, slug: form.slug };
  },
});
```

### Pattern 4: Gate atomicity — both files in same commit

```typescript
// approve-proposal.ts — ACTION_ALLOWLIST addition (line 10-13)
const ACTION_ALLOWLIST = [
  "send-template-to-members",
  "create-checkout-link",
  "publish-form",           // ← ADD in AEF-04
] as const;

// approve-proposal.ts — dynamic import branch (add alongside existing branches)
} else if (proposal.actionName === "publish-form") {
  mod = await import("./publish-form.js");
}

// propose-action.ts — Zod enum extension (line 17-20)
actionName: z
  .enum(["send-template-to-members", "create-checkout-link", "publish-form"])
  .describe("The existing gated action this proposal will execute on approval"),
```

CRITICAL: Both changes ship in the same commit. If `ACTION_ALLOWLIST` is updated without the Zod enum, the agent cannot call `propose-action` for publish. If the Zod enum is updated without the allowlist, `approve-proposal` rejects the proposal at runtime.

### Pattern 5: Live-refresh for loader-based routes (AEX-03)

The forms index route uses RR v7 `loader()` — not TanStack Query. `useDbSync` in `root.tsx` only invalidates TanStack Query caches, so it does NOT trigger `loader()` re-runs automatically. After an agent write, `production-agent.ts` calls `recordChange({ source: "action" })`. The forms route must subscribe to that event via `useChangeVersion("action")` and call `revalidator.revalidate()`:

```typescript
// apps/staff-web/app/routes/gymos.forms._index.tsx — add to component
import { useRevalidator } from "react-router";
import { useChangeVersion } from "@agent-native/core/client";
import { useEffect } from "react";

export default function GymosFormsList() {
  const revalidator = useRevalidator();
  const actionVersion = useChangeVersion("action");

  // Re-run the loader whenever the agent completes a write action
  useEffect(() => {
    if (actionVersion > 0) {
      revalidator.revalidate();
    }
  }, [actionVersion]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ... rest of component unchanged
}
```

`useChangeVersion("action")` returns a counter that increments each time `useDbSync` sees `source: "action"`. The `> 0` guard skips the initial mount. This is the correct pattern for loader-based routes — do NOT use `useActionQuery` or convert the route to client-side fetching (that would be architectural churn for no gain).

### Pattern 6: Two-exposure rule — actions-registry.ts regen

The `.generated/actions-registry.ts` is auto-generated by `@agent-native/core`. Based on current code, the regen command is triggered by `pnpm build` or by running the core code-gen script explicitly. All 7 new action files must be present before regen; the regen result is a static import map.

Regen command (verify at plan time):
```bash
cd apps/staff-web && pnpm exec agent-native generate-actions
```
Or via root workspace:
```bash
pnpm --filter staff-web build
```

The planner should verify the exact regen command by checking `apps/staff-web/package.json` scripts. Do not hand-write entries in `actions-registry.ts`.

### Pattern 7: view-screen extension for AEX-01

The current `view-screen.ts` is Mail-centric (Gmail threads). For AEX-01, add a forms branch that reads navigation state and returns form data when the coach is on `/gymos/forms`:

```typescript
// In view-screen.ts run() function — add new branch
if (nav?.view === "forms") {
  // Pull the forms list so the agent knows which forms exist and their current status
  const { getDb, schema } = await import("../server/db/index.js");
  const { isNull } = await import("drizzle-orm");
  const db = getDb();
  // guard:allow-unscoped — single-tenant gym forms
  const forms = await db.select({
    id: schema.forms.id, title: schema.forms.title, status: schema.forms.status,
    slug: schema.forms.slug, updatedAt: schema.forms.updatedAt,
  }).from(schema.forms).where(isNull(schema.forms.deletedAt));
  screen.forms = forms;
  if (nav?.formId) {
    const [form] = await db.select().from(schema.forms)
      .where(eq(schema.forms.id, nav.formId)).limit(1);
    if (form) screen.selectedForm = { ...form, fields: JSON.parse(form.fields), settings: JSON.parse(form.settings) };
  }
}
```

### Anti-Patterns to Avoid

- **Hand-rolling the slug uniqueness loop differently from the route action:** The `gymos.forms._index.tsx` action handler has a slug-uniqueness while-loop. The new `create-form` action must use the identical algorithm to avoid slug collisions.
- **Calling `publish-form` directly from the agent:** The agent must call `propose-action` with `actionName: "publish-form"`. Direct agent calls to `publish-form` must be blocked by NOT naming `publish-form` in the system prompt tool list.
- **Using `drizzle-kit push`:** The schema already exists. These actions are Drizzle query writes — no schema changes, no migration.
- **Adding actions to system prompt before action file is deployed:** Per STATE.md constraint: ship and Vercel-deploy each action wave before adding to system prompt.
- **Modifying `/api/forms/[...path].ts`:** The HTTP handler at `apps/staff-web/server/routes/api/forms/` is untouched. New agent actions call Drizzle directly alongside the existing handler (same pattern as `send-template-to-members.ts`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FormField runtime validation | Custom type-checker | `FormFieldSchema` (Zod translate of `types.ts`) + existing `assertValidFields()` for XSS guard on `id` characters | Existing `assertValidFields` guards stored XSS; Zod handles type correctness |
| Proposal storage | Custom DB table | Existing `dashboardProposals` table + `propose-action` + `approve-proposal` | Already wired to the noticeboard UI |
| Live-refresh polling | Custom `setInterval` or `fetch` loop | `useChangeVersion("action")` + `useRevalidator()` | Framework SSE+polling already handles the change notification |
| Slug generation | Custom logic different from route | Copy slug algo from `gymos.forms._index.tsx` action (lines 108-115) | Must match to avoid conflicts |

---

## Exact File-Level Implementation Map

### AEF-01: create-form

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/create-form.ts` | NEW — defineAction, INSERT into `schema.forms`, status='draft' |
| 2 | `apps/staff-web/.generated/actions-registry.ts` | REGEN (auto) |
| 3 | `apps/staff-web/AGENTS.md` | ADD row to Agent Actions table |
| 4 | `apps/staff-web/server/plugins/agent-chat.ts` | ADD system-prompt bullet (per-tab Forms section) |

### AEF-02: update-form-fields

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/features/forms/lib/form-field-schema.ts` | NEW — `FormFieldSchema` Zod object derived from `types.ts:FormField` |
| 2 | `apps/staff-web/actions/update-form-fields.ts` | NEW — defineAction, validate via FormFieldSchema, UPDATE `schema.forms.fields` |
| 3 | `apps/staff-web/.generated/actions-registry.ts` | REGEN |
| 4 | `apps/staff-web/AGENTS.md` + `agent-chat.ts` | ADD |

### AEF-03: update-form-meta

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/update-form-meta.ts` | NEW — defineAction, UPDATE `{title, description, settings}` only; never touches `status` or `slug` |
| 2 | `apps/staff-web/.generated/actions-registry.ts` | REGEN |
| 3 | `apps/staff-web/AGENTS.md` + `agent-chat.ts` | ADD |

### AEF-04: publish-form (GATED)

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/publish-form.ts` | NEW — defineAction, re-validate fields via FormFieldSchema, UPDATE `status='published'` |
| 2 | `apps/staff-web/actions/approve-proposal.ts` | EDIT line 10-13: add `"publish-form"` to `ACTION_ALLOWLIST`; add dynamic import branch |
| 3 | `apps/staff-web/actions/propose-action.ts` | EDIT line 17: add `"publish-form"` to Zod enum |
| 4 | `apps/staff-web/.generated/actions-registry.ts` | REGEN |
| 5 | `apps/staff-web/AGENTS.md` | ADD — note agent calls `propose-action` (not `publish-form` directly) |
| 6 | `apps/staff-web/server/plugins/agent-chat.ts` | ADD — agent must call `propose-action({actionName: "publish-form", ...})` |

Steps 2 and 3 MUST be in the same commit (gate atomicity constraint).

### AEF-05: unpublish-form (direct, no gate)

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/unpublish-form.ts` | NEW — defineAction, UPDATE `status='draft'` |
| 2 | `apps/staff-web/.generated/actions-registry.ts` | REGEN |
| 3 | `apps/staff-web/AGENTS.md` + `agent-chat.ts` | ADD |

### AEF-06: archive-form + restore-form (direct, no gate)

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/archive-form.ts` | NEW — defineAction, UPDATE `deletedAt=now()` |
| 2 | `apps/staff-web/actions/restore-form.ts` | NEW — defineAction, UPDATE `deletedAt=null` |
| 3 | `apps/staff-web/.generated/actions-registry.ts` | REGEN |
| 4 | `apps/staff-web/AGENTS.md` + `agent-chat.ts` | ADD |

### AEX-01: view-screen + per-tab system prompt

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/actions/view-screen.ts` | EDIT — add `nav.view === "forms"` branch returning forms list + selected form |
| 2 | `apps/staff-web/server/plugins/agent-chat.ts` | EDIT — restructure `systemPrompt` into per-tab sections; add Forms section |

### AEX-02: gate atomicity (covered by AEF-04 steps 2+3)

No additional files. Enforce in plan: approve-proposal.ts + propose-action.ts edits are in one commit.

### AEX-03: live-refresh for forms tab

| Step | File | Change |
|------|------|--------|
| 1 | `apps/staff-web/app/routes/gymos.forms._index.tsx` | EDIT — add `useChangeVersion("action")` + `useRevalidator` + `useEffect` pattern |

### AEX-04: two-exposure rule (covered per action above)

Each action has explicit steps for AGENTS.md + agent-chat.ts. The system-prompt update is the LAST step within each wave.

---

## Existing Code Inventory (verified by direct file read)

### forms table schema (`apps/staff-web/server/db/forms-schema.ts`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | format: `form_{nanoid()}` |
| `title` | text NOT NULL | |
| `description` | text | nullable |
| `slug` | text NOT NULL UNIQUE | slugified from title |
| `fields` | text NOT NULL | JSON array of FormField |
| `settings` | text NOT NULL | JSON FormSettings |
| `status` | text enum | `"draft" \| "published" \| "closed"` |
| `createdAt` | text | ISO |
| `updatedAt` | text | ISO |
| `deletedAt` | text | nullable — soft-delete marker for archive |

Status lifecycle: `draft` → `published` (gated via AEF-04) → `draft` (AEF-05 unpublish) → `deletedAt set` (AEF-06 archive) → `deletedAt null` (AEF-06 restore). Note: `"closed"` status exists in schema but is not targeted by any AE1 action — the UI does not expose it as a distinct agent-writable state.

### FormField TypeScript interface (`apps/staff-web/features/forms/types.ts`)

```typescript
export type FormFieldType = "text" | "email" | "number" | "textarea" | "select" |
  "multiselect" | "checkbox" | "radio" | "date" | "rating" | "scale";

export interface FormField {
  id: string;               // MUST match /^[A-Za-z0-9_-]+$/ — enforced by assertValidFields
  type: FormFieldType;
  label: string;
  placeholder?: string;
  description?: string;
  required: boolean;
  options?: string[];
  validation?: {
    min?: number; max?: number; pattern?: string; message?: string;
  };
  conditional?: {
    fieldId: string;        // MUST also match FIELD_ID_PATTERN
    operator: "equals" | "not_equals" | "contains";
    value: string;
  };
  width?: "full" | "half";
}
```

The Zod `FormFieldSchema` to build for `form-field-schema.ts` must match this exactly. The `assertValidFields()` function in `validate-fields.ts` adds XSS-critical checks (field `id` regex, conditional `fieldId` regex, numeric `validation.min/max`) that Zod type checking alone does not enforce — run `assertValidFields` in the action AFTER Zod parse for belt-and-suspenders.

### Existing route action (reference for slug uniqueness)

`gymos.forms._index.tsx` lines 108-156 implement the slugify + uniqueness loop for form creation. The `create-form.ts` action must replicate this algorithm exactly.

### propose-action.ts current state

Current Zod enum (line 17-20):
```typescript
actionName: z.enum(["send-template-to-members", "create-checkout-link"])
```
Must become:
```typescript
actionName: z.enum(["send-template-to-members", "create-checkout-link", "publish-form"])
```

### approve-proposal.ts current state

Current `ACTION_ALLOWLIST` (lines 10-13):
```typescript
const ACTION_ALLOWLIST = [
  "send-template-to-members",
  "create-checkout-link",
] as const;
```
Must become:
```typescript
const ACTION_ALLOWLIST = [
  "send-template-to-members",
  "create-checkout-link",
  "publish-form",
] as const;
```
Also need to add a dynamic import branch (current structure uses `if/else if` — add `else if (proposal.actionName === "publish-form") { mod = await import("./publish-form.js"); }` at line ~61).

### dashboardProposals table (already in schema)

The `actionName` column is typed as `text(actionName, { enum: ["send-template-to-members", "create-checkout-link"] })`. This is a Drizzle-level text enum — it validates at ORM type level but is stored as a plain text column in Postgres. Adding `"publish-form"` here requires a Drizzle schema change AND a migration. **This is a risk flag** — verify if the Drizzle schema enum also needs updating, or if Postgres will accept the new value without a migration (it will, because Drizzle text enums are validated at TypeScript compile time, not at the Postgres constraint level — unlike native Postgres ENUM types). Confirmed safe: Drizzle `text({ enum: [...] })` creates a plain `TEXT` column with TypeScript-only validation. No migration needed.

### agent-chat.ts current system prompt structure

The system prompt is a single flat tool list (verified by reading `apps/staff-web/server/plugins/agent-chat.ts` lines 18-53). AEX-01 requires restructuring into per-tab sections. The current list includes 12 tools. The restructured prompt should organize as:

```
## Tier 1 — Read & Report
- list-fill-rate, list-renewals, list-at-risk-members, list-inbox-summary, list-classes, list-members

## Tier 2 — Dashboard Authoring  
- upsert-section-note, create-task, complete-task

## Tier 3 — Propose + Act
- propose-action (for: send-template-to-members, create-checkout-link, publish-form)

## Context & Navigation
- view-screen, navigate

## Forms tab (when coach is on /gymos/forms)
- create-form, update-form-fields, update-form-meta, unpublish-form, archive-form, restore-form
- To publish: call propose-action({ actionName: "publish-form", params: { formId }, rationale })
```

---

## Common Pitfalls

### Pitfall 1: dashboardProposals.actionName Drizzle schema enum
**What goes wrong:** The `dashboardProposals` table definition in `schema.ts` (lines 478-481) uses `text("action_name", { enum: ["send-template-to-members", "create-checkout-link"] })`. TypeScript will emit a type error when `propose-action.ts` tries to insert `actionName: "publish-form"` unless the schema enum is also updated.
**How to avoid:** Update `schema.ts` dashboardProposals.actionName enum to include `"publish-form"`. This is a TypeScript/Drizzle schema edit only — no Postgres migration required (the underlying column is plain TEXT).
**Risk level:** HIGH — will cause `tsc --noEmit` failure if missed.

### Pitfall 2: Slug collision between route action and create-form action
**What goes wrong:** The route action (`gymos.forms._index.tsx`) and the new `create-form` defineAction both create forms. If they use different slug uniqueness algorithms, they can create duplicate-slug conflicts at the DB UNIQUE constraint.
**How to avoid:** Extract the slug logic into a shared utility at `apps/staff-web/features/forms/lib/slugify.ts` and import it from both the route action and `create-form.ts`.

### Pitfall 3: assertValidFields vs Zod FormFieldSchema — run both
**What goes wrong:** Zod validates field shape/types. `assertValidFields` enforces the field `id` regex (`/^[A-Za-z0-9_-]+$/`) and validates numeric min/max. Using only Zod misses the XSS guard.
**How to avoid:** In `update-form-fields.ts` and `publish-form.ts`, run Zod parse first (returning typed data), then call `assertValidFields(parsedFields)` as a second pass. If `assertValidFields` throws, catch and return `{ error: message }`.

### Pitfall 4: System prompt added before action is deployed
**What goes wrong:** Agent hallucinates calls to an action that doesn't exist in the registry yet.
**Constraint from STATE.md:** "Ship and HTTP-test each action wave before adding it to the system prompt."
**How to avoid:** The plan must wave-sequence with system-prompt update as the LAST task in the final wave.

### Pitfall 5: Live-refresh useEffect dependency array
**What goes wrong:** `useEffect(() => { revalidator.revalidate(); }, [actionVersion, revalidator])` — including `revalidator` in the dep array triggers re-runs on every render because `revalidator` is a new object each render.
**How to avoid:** Use `useEffect(() => { if (actionVersion > 0) revalidator.revalidate(); }, [actionVersion])` with the `revalidator` ref captured via `useRef` or suppressed from deps with an eslint-disable comment (matching the existing `NewClassDialog.tsx` pattern).

### Pitfall 6: archive-form doesn't check status before archiving a published form
**What goes wrong:** Archiving a published form leaves it publicly accessible at `/f/{slug}` because the public form handler checks `status === "published"` AND `deletedAt IS NULL`. Setting `deletedAt` takes it offline automatically.
**Confirmation:** `getPublicForm` handler (`handlers/forms.ts` line 44): `if (!row || row.status !== "published" || row.deletedAt)` — `deletedAt` alone gates it offline. Archive is safe without an explicit unpublish step.

### Pitfall 7: update-form-fields on a published form
**What goes wrong:** AEF-02 says the agent can edit fields; the requirement does not restrict edits to draft-only. But editing fields on a published form immediately changes what visitors see. The plan should decide: allow field edits on published forms (current route behavior allows it) or require unpublish first.
**Recommendation:** Mirror the existing route behavior — allow field edits on any non-archived form, regardless of status. If the coach wants safety, the agent should suggest unpublish → edit → republish as a workflow. Do not add a status gate at the action level.

---

## Code Examples

### FormFieldSchema (to create)

```typescript
// apps/staff-web/features/forms/lib/form-field-schema.ts
import { z } from "zod";
import { FIELD_ID_PATTERN } from "./validate-fields.js";

const FieldIdSchema = z.string().regex(FIELD_ID_PATTERN, "Field id must match [A-Za-z0-9_-]+");

export const FormFieldSchema = z.object({
  id: FieldIdSchema,
  type: z.enum(["text", "email", "number", "textarea", "select", "multiselect",
    "checkbox", "radio", "date", "rating", "scale"]),
  label: z.string().min(1),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    message: z.string().optional(),
  }).optional(),
  conditional: z.object({
    fieldId: FieldIdSchema,
    operator: z.enum(["equals", "not_equals", "contains"]),
    value: z.string(),
  }).optional(),
  width: z.enum(["full", "half"]).optional(),
});

export type FormFieldInput = z.infer<typeof FormFieldSchema>;
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|---|---|---|
| Flat system prompt (all tools in one list) | Per-tab sections (AEX-01) | Agent leads with tab-relevant tools; reduces hallucination on wrong-tab tool calls |
| Gate only on send/checkout | Gate on publish-form too (AEX-02) | Form-going-live is member-visible; requires human approval |
| Manual page reload after agent writes | `useChangeVersion + useRevalidator` (AEX-03) | No manual reload required |

---

## Open Questions

1. **Actions-registry regen command**
   - What we know: `.generated/actions-registry.ts` is auto-generated; it uses static imports
   - What's unclear: exact CLI command to regen (`pnpm exec agent-native generate-actions`? or `pnpm build`?)
   - Recommendation: planner should read `apps/staff-web/package.json` scripts at plan time and document the exact command. Until verified, plan should include a manual entry in `actions-registry.ts` as a fallback if auto-regen isn't available outside the build.

2. **Drizzle `text({ enum: })` on dashboardProposals.actionName**
   - What we know: Drizzle text enums are TypeScript-only (plain TEXT in Postgres)
   - What's unclear: does updating the TypeScript enum cause any compile-time breakage in test files that match on the literal type?
   - Recommendation: search for `dashboard_proposals` in test files at plan time; update any exhaustive switches.

3. **useChangeVersion availability in forms route**
   - What we know: `useChangeVersion` is exported from `@agent-native/core/client` (confirmed in `apps/staff-web/app/pages/SettingsPage.tsx` line 7)
   - What's unclear: whether `useChangeVersion` with `"action"` source specifically fires after our new agent actions (it should, because `production-agent.ts` emits `source: "action"` for any non-readOnly action)
   - Recommendation: treat as HIGH confidence; verify during first deploy by checking that the forms list refreshes after a `create-form` agent call.

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. All work is TypeScript in `apps/staff-web/`. Verification via `tsc --noEmit` + Vercel deploy (no local dev server available — NitroViteError constraint continues).

---

## Validation Architecture

No test framework currently configured for action unit tests in `apps/staff-web/actions/`. Verification pattern established in prior phases:

- **TypeScript compile check:** `tsc --noEmit` from `apps/staff-web/` after each action file
- **Schema validation unit test:** `form-field-schema.ts` can be tested with Vitest against valid and invalid FormField shapes
- **Integration:** Vercel deploy + manual agent chat interaction ("create a form called Test" → verify row in Neon via Neon MCP)
- **Gate verification:** `propose-action` with `actionName: "publish-form"` → check `dashboard_proposals` row in Neon; then `approve-proposal` → check `forms.status` updated

### Phase Gate Checks (before marking AE1 complete)

| Success Criterion | Verification Method |
|---|---|
| "create a new lead-capture form called Membership Enquiry" → draft row in `/gymos/forms` without page reload | Agent chat → Neon MCP query + visual confirm on Vercel |
| "add a phone number field" → field appears; malformed field rejected | Agent chat valid field → confirm; malformed field → confirm error returned, no DB write |
| "publish the enquiry form" → proposal card, not auto-published | Agent chat → check `dashboard_proposals` status='pending'; confirm no `forms.status='published'` yet |
| "unpublish the form" → status reverts to draft immediately | Agent chat → Neon MCP confirm `status='draft'` |
| After agent write, Forms tab refreshes without manual reload | Visual confirm on Vercel deployed instance |

---

## Sources

### Primary (HIGH confidence — direct file read)
- `apps/staff-web/actions/approve-proposal.ts` — ACTION_ALLOWLIST shape, dynamic import pattern, proposal re-validation
- `apps/staff-web/actions/propose-action.ts` — Zod enum, proposal insert
- `apps/staff-web/server/plugins/agent-chat.ts` — systemPrompt current structure, tool list
- `apps/staff-web/server/db/forms-schema.ts` — forms + responses table columns, types
- `apps/staff-web/server/db/schema.ts` lines 474-492 — dashboardProposals table definition
- `apps/staff-web/features/forms/types.ts` — FormField + FormSettings TypeScript interfaces
- `apps/staff-web/features/forms/lib/validate-fields.ts` — FIELD_ID_PATTERN, assertValidFields()
- `apps/staff-web/features/forms/handlers/forms.ts` — getPublicForm (confirms deletedAt gates public access)
- `apps/staff-web/app/routes/gymos.forms._index.tsx` — existing route action slugify + all 5 intents
- `apps/staff-web/.generated/actions-registry.ts` — current registry shape; confirms create-class-definition/occurrence present but not list-forms
- `apps/staff-web/app/root.tsx` lines 208-282 — useDbSync onEvent handler; confirms `source: "action"` invalidates TanStack Query only
- `packages/core/src/agent/production-agent.ts` lines 1704-1725 — recordChange({ source: "action" }) after mutating tool call
- `packages/core/src/client/use-action.ts` — useActionQuery queryKey = ["action", actionName, params]
- `apps/staff-web/app/components/gymos/NewClassDialog.tsx` — useRevalidator pattern for RR v7 loader refresh
- `apps/staff-web/AGENTS.md` — current Agent Actions table; AEX-04 target
- `.planning/STATE.md` — system-prompt-ships-last constraint, no-local-dev-server constraint
- `.planning/REQUIREMENTS.md` — AEF-01..06, AEX-01..04 definitions

### Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing; zero new deps
- Architecture patterns: HIGH — verified against production code
- Propose→approve gate: HIGH — exact line numbers verified in both files
- Live-refresh (AEX-03): HIGH — verified useDbSync doesn't hit RR v7 loaders; `useRevalidator` confirmed as correct approach
- FormField Zod schema: HIGH — TypeScript interface is the source of truth; Zod translation is mechanical
- Actions-registry regen: MEDIUM — regen command not verified in package.json scripts (open question #1)

**Research date:** 2026-06-18
**Valid until:** 2026-07-31 (stable codebase; no upstream merges expected in this window)
