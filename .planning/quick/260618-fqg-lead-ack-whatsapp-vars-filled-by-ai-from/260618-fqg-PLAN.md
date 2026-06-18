---
phase: quick-260618-fqg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/features/forms/lib/lead-ack.ts
  - apps/staff-web/features/forms/lib/lead-ack.test.ts
  - apps/staff-web/features/forms/handlers/submissions.ts
autonomous: true
requirements: [QUICK-260618-fqg]
user_setup: []

must_haves:
  truths:
    - "When a published form is submitted with a phone number AND LEAD_ACK_TEMPLATE_NAME is set to an APPROVED template, the lead receives an AI-filled template ack."
    - "The {{2}} (and any further) slots are filled by Claude from the form submission + active class catalog; {{1}} is always the lead's first name."
    - "If the template is missing, not approved, or the LLM fails, lead capture still succeeds (the lead always lands in the inbox)."
    - "The enqueued send uses the template row's actual language, not a hardcoded en_US."
  artifacts:
    - path: "apps/staff-web/features/forms/lib/lead-ack.ts"
      provides: "parseTemplateBody (pure) + buildLeadAckVars (Claude fill with deterministic fallback)"
      contains: "export function parseTemplateBody"
    - path: "apps/staff-web/features/forms/lib/lead-ack.test.ts"
      provides: "vitest coverage for parseTemplateBody + buildLeadAckVars fallback path"
      contains: "describe(\"parseTemplateBody\""
    - path: "apps/staff-web/features/forms/handlers/submissions.ts"
      provides: "step-14 block reworked to look up template, AI-fill vars, enqueue with real language"
      contains: "buildLeadAckVars"
  key_links:
    - from: "apps/staff-web/features/forms/handlers/submissions.ts"
      to: "apps/staff-web/features/forms/lib/lead-ack.ts"
      via: "import { parseTemplateBody, buildLeadAckVars }"
      pattern: "from \"../lib/lead-ack"
    - from: "apps/staff-web/features/forms/lib/lead-ack.ts"
      to: "@anthropic-ai/sdk"
      via: "new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })"
      pattern: "claude-sonnet-4-6"
    - from: "apps/staff-web/features/forms/handlers/submissions.ts"
      to: "enqueueOutboundWhatsApp"
      via: "payload { type: 'template', name, vars, language }"
      pattern: "enqueueOutboundWhatsApp"
---

<objective>
Replace the static var-fill in the form lead-ack auto-reply (step 14, added by quick task 260618-ezc) with an AI-generated fill that uses the form submission context PLUS the studio's active class catalog, and that adapts to whatever variable count the approved template declares.

Purpose: The approved lead-ack template is now 2-var — "Hi {{1}}, thanks for your interest in {{2}}. Feel free to reply here when you're ready." {{1}} = lead's first name, {{2}} = AI-inferred class/interest from the form + catalog. The current code hardcodes `{ "1": firstName }` and `language: "en_US"`, which fails a 2-var template and ignores the template's real language.

Output: A new unit-testable `lead-ack.ts` module (parse + LLM fill with fallback) and a reworked step-14 block that looks up the approved template, fills ALL `{{N}}` slots via Claude, and enqueues through the existing worker chokepoint.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/staff-web/AGENTS.md
@apps/staff-web/features/forms/handlers/submissions.ts
@apps/staff-web/app/routes/api.m.foods.analyze.tsx
@apps/staff-web/features/forms/types.ts
@apps/staff-web/features/forms/lib/normalize-phone.test.ts

<interfaces>
<!-- Contracts the executor needs. Verified from codebase — no exploration required. -->

From apps/staff-web/features/forms/types.ts:
```typescript
export interface FormField {
  id: string;
  type: FormFieldType; // "text" | "email" | "number" | "textarea" | "select" | ...
  label: string;
  required: boolean;
  options?: string[];
  // ...
}
```

Schema (apps/staff-web/server/db/schema.ts), reachable via `schema.*` from `../../../server/db/index.js`:
```typescript
// whatsapp_templates — PK is `name` (text), NOT an id column
export const whatsappTemplates = table("whatsapp_templates", {
  name: text("name").primaryKey(),
  status: text("status", { enum: ["pending","approved","rejected","paused","disabled"] }).notNull(),
  category: text("category", { enum: ["utility","marketing","authentication"] }),
  language: text("language").notNull().default("en_US"),
  componentsJson: text("components_json").notNull(), // raw Meta/MYÜTIK components JSON
  lastSyncedAt: text("last_synced_at").notNull().default(now()),
});

// class_definitions
export const classDefinitions = table("class_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),       // nullable
  category: text("category"),             // nullable: yoga | hiit | strength | ...
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // ...
});
```

Anthropic call pattern (mirror EXACTLY from app/routes/api.m.foods.analyze.tsx):
```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const msg = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 300,
  messages: [{ role: "user", content }],
});
const raw = msg.content
  .filter((c): c is Anthropic.TextBlock => c.type === "text")
  .map((c) => c.text)
  .join("");
// Defensive parse: strip ```json fences, slice from first { to last }.
```

In-scope at the step-14 insertion point in submissions.ts (do NOT re-derive):
`resolvedMemberId`, `resolvedConvId`, `firstName`, `phoneE164`, `data` (Record<string,unknown>),
`fields` (FormField[] — already `JSON.parse(form.fields)`), `form` (has `.title`), `id` (formId),
`now` (ISO string), `db` + `db2` (raw-SQL `{ execute }` helper), `enqueueOutboundWhatsApp` (imported),
`leadAckTemplate` (= trimmed `process.env.LEAD_ACK_TEMPLATE_NAME`).
</interfaces>

<skills>
Before editing, skim these .agents/skills SKILL.md files for project rules the plan must honor:
- forms — forked forms-feature conventions / fork boundary
- delegate-to-agent — but note: this is a SERVER-SIDE Claude call mirroring api.m.foods.analyze.tsx, NOT the agent-chat path. The "all AI goes through the agent chat" rule is for UI-initiated LLM calls; a server handler calling Anthropic directly for a deterministic fill is the established pattern here (see the existing analyze route).
- security — input validation, no unscoped queries (gym tables carry guard:allow-unscoped).
</skills>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create lead-ack.ts (parseTemplateBody + buildLeadAckVars)</name>
  <files>apps/staff-web/features/forms/lib/lead-ack.ts, apps/staff-web/features/forms/lib/lead-ack.test.ts</files>
  <behavior>
    parseTemplateBody (pure, defensive):
    - Input: `componentsJson` string of shape `{"components":[{"type":"BODY","text":"Hi {{1}}, thanks for your interest in {{2}}..."}]}`.
    - Output: `{ bodyText: string; varCount: number }` where bodyText = the BODY component's `text`, and varCount = the MAX distinct N across all `{{N}}` matches (so `{{1}}`+`{{2}}` → 2; `{{2}}` alone → 2; none → 0).
    - Test 1: normal 2-var body → `{ bodyText: "Hi {{1}}, thanks for your interest in {{2}}. Feel free to reply here when you're ready.", varCount: 2 }`.
    - Test 2: a 0-var BODY (no `{{N}}`) → varCount 0, bodyText = that text.
    - Test 3: malformed JSON (e.g. `"{ not json"`) → `{ bodyText: "", varCount: 0 }`.
    - Test 4 (edge, cheap): missing BODY component (only HEADER/FOOTER) → `{ bodyText: "", varCount: 0 }`.

    buildLeadAckVars FALLBACK path (no live API, do NOT mock Anthropic):
    - Test 5: with `ANTHROPIC_API_KEY` UNSET (delete it in the test, restore after), call with varCount=2, firstName="Sarah" → resolves to `{ "1": "Sarah", "2": "our classes" }` (deterministic fallback) WITHOUT throwing.
    - Test 6: varCount=0 → returns `{}` without throwing (no LLM needed).
  </behavior>
  <action>
    Create `apps/staff-web/features/forms/lib/lead-ack.ts`. Import `Anthropic from "@anthropic-ai/sdk"` and `type { FormField } from "../types.js"`.

    1) `export function parseTemplateBody(componentsJson: string): { bodyText: string; varCount: number }`
       - try/catch JSON.parse. On any throw or non-object → `{ bodyText: "", varCount: 0 }`.
       - Find the component with `type === "BODY"` in `parsed.components` (array; guard it's an array). If none or its `text` is not a string → `{ bodyText: "", varCount: 0 }`.
       - varCount = max N over all `/\{\{(\d+)\}\}/g` matches of bodyText (parseInt each capture; Math.max; 0 if none). NEVER throw.

    2) `export async function buildLeadAckVars(input: { formTitle: string; fields: FormField[]; data: Record<string, unknown>; firstName: string; bodyText: string; varCount: number; classCatalog: Array<{ name: string; category: string | null; description: string | null }> }): Promise<Record<string,string>>`
       - Define `fallback()` first: build `{ "1": firstName, "2": "our classes", "3": "our classes", ... }` — slot "1" = firstName, every other slot 1..varCount = "our classes". Return `{}` when varCount === 0. This is the value returned on ANY failure.
       - Early returns: if `varCount === 0` return `{}`. If `!process.env.ANTHROPIC_API_KEY` return `fallback()`.
       - Build `formContext`: start with `Form: ${input.formTitle}`, then for each field with a non-empty answered value in `data[field.id]`, append `${field.label}: ${String(value)}` (skip empty / undefined / null / empty-array; cap EACH value to ~120 chars; cap the whole joined context to ~1500 chars). Join with newlines.
       - Build `catalogStr`: each class as `${name}${category ? " — " + category : ""}${description ? " — " + description.slice(0,80) : ""}`, one per line, cap to ~30 entries.
       - Prompt (single user text block): "You are filling the variables of a WhatsApp message a boutique fitness studio is auto-sending to a NEW lead who just submitted a web form. Template body (with {{N}} placeholders):\n<bodyText>\n\nThe lead's form submission:\n<formContext>\n\nOur class catalog:\n<catalogStr>\n\nReturn ONLY a strict JSON object mapping each placeholder number (as a string key) to its value, e.g. {\"1\":\"Sarah\",\"2\":\"our Boxing classes\"}. Rules: slot \"1\" MUST be the lead's first name (<firstName>); other slots are inferred from the form context + the single best-matching class from our catalog, phrased naturally (e.g. \"our HYROX sessions\", never an id). Keep each value short (≤ ~50 chars), warm, matching the template's tone. NO emojis, NO newlines, NO markdown."
       - Wrap the LLM call + parse + validate in ONE try/catch; on ANY error return `fallback()`. NEVER throw.
       - Call `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({ model: "claude-sonnet-4-6", max_tokens: 300, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] })`. Read text via the `.filter(...TextBlock).map(c=>c.text).join("")` pattern.
       - Defensive parse: strip ```json fences, slice from first `{` to last `}`, JSON.parse. Throw inside the try if no braces found (caught → fallback).
       - Validate: build result object for keys "1".."varCount". For each key, the parsed value must be a non-empty trimmed string; coerce/trim and slice to 60 chars. If ANY required key is missing or not a non-empty string → throw (→ fallback).
       - FORCE `result["1"] = input.firstName` regardless of model output (safety/correctness).
       - Return the validated result.

    Create `apps/staff-web/features/forms/lib/lead-ack.test.ts` matching the style of normalize-phone.test.ts (`import { describe, expect, it } from "vitest"`). Cover the 6 behaviors above. For the fallback tests, save `process.env.ANTHROPIC_API_KEY`, `delete process.env.ANTHROPIC_API_KEY` before the call, and restore it after (use a try/finally or beforeEach/afterEach). Do NOT make any test hit the Anthropic API or mock the SDK — only `parseTemplateBody` (pure) and the no-key fallback branch of `buildLeadAckVars`.

    Run prettier on both files.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run features/forms/lib/lead-ack.test.ts</automated>
  </verify>
  <done>lead-ack.ts exports parseTemplateBody + buildLeadAckVars; lead-ack.test.ts passes all cases; buildLeadAckVars never throws and returns deterministic fallback when ANTHROPIC_API_KEY is unset.</done>
</task>

<task type="auto">
  <name>Task 2: Rework step-14 block in submissions.ts to AI-fill + real language</name>
  <files>apps/staff-web/features/forms/handlers/submissions.ts</files>
  <action>
    Add import near the top alongside the other `../lib/*` imports:
    `import { parseTemplateBody, buildLeadAckVars } from "../lib/lead-ack.js";`

    Replace the body INSIDE the existing `if (phoneE164 && leadAckTemplate) { try { ... } catch ... }` block (currently lines ~434-486) with the AI flow. KEEP the existing env-gate + phone-gate entry condition, the surrounding try/catch, the log-and-continue catch, and the final `return { success: true, id: responseId };`. New flow inside the try:

    1) Look up the template row by name (defence-in-depth, mirrors send-template-to-members.ts):
       ```
       // guard:allow-unscoped — single-tenant studio-wide templates table
       const tplRows = await db
         .select({
           name: schema.whatsappTemplates.name,
           status: schema.whatsappTemplates.status,
           language: schema.whatsappTemplates.language,
           componentsJson: schema.whatsappTemplates.componentsJson,
         })
         .from(schema.whatsappTemplates)
         .where(eq(schema.whatsappTemplates.name, leadAckTemplate))
         .limit(1);
       const tpl = tplRows[0];
       if (!tpl || tpl.status !== "approved") {
         // Missing or not approved → SKIP the whole send. No opt-in, no LLM, no
         // enqueue. The lead still lands in the inbox (steps 9-13 already ran).
         return { success: true, id: responseId };
       }
       ```
       (Returning here is safe — it's inside the handler and after all lead-capture writes. `eq` and `schema` are already imported.)

    2) Parse body + resolve language:
       ```
       const { bodyText, varCount } = parseTemplateBody(tpl.componentsJson);
       const language = (tpl.language ?? "").trim() || "en";
       ```

    3) Build vars:
       - If `varCount === 0` → `const ackVars: Record<string,string> = {};`
       - Else load the active class catalog and call buildLeadAckVars:
         ```
         // guard:allow-unscoped — single-tenant gym catalog
         const catRows = await db
           .select({
             name: schema.classDefinitions.name,
             category: schema.classDefinitions.category,
             description: schema.classDefinitions.description,
           })
           .from(schema.classDefinitions)
           .where(eq(schema.classDefinitions.active, true));
         const ackVars = await buildLeadAckVars({
           formTitle: form.title,
           fields,
           data,
           firstName,
           bodyText,
           varCount,
           classCatalog: catRows,
         });
         ```

    4) Then the EXISTING enqueue flow (unchanged except `vars` is now `ackVars` and language is `language`):
       - INSERT the `whatsapp_opt_in` row (ON CONFLICT (member_id) DO NOTHING, source 'form_submission', evidence_payload = form submission JSON) — keep exactly as-is.
       - `const ackMessageId = \`msg_${nanoid()}\`;`
       - `const ackPreview = \`[template: ${leadAckTemplate}]\`;`
       - INSERT the queued `messages` row (direction 'out', message_type 'template', body ackPreview, payload `${JSON.stringify({ name: leadAckTemplate, vars: ackVars })}`, status 'queued', created_at now) — keep the raw-SQL form.
       - UPDATE conversations last_message_preview + updated_at — keep as-is.
       - `enqueueOutboundWhatsApp({ messageId: ackMessageId, memberId: resolvedMemberId, payload: { type: "template", name: leadAckTemplate, vars: ackVars, language } });` — REPLACE the hardcoded `language: "en_US"` with the resolved `language` variable.

    Keep all of the above inside the existing try block so a lookup / LLM / enqueue failure logs and continues (never breaks lead capture). Update the stale comment block above the gate (the one claiming "the template MUST declare exactly ONE variable, where {{1}} = first name") to reflect the new N-variable AI fill: {{1}} = lead first name, {{2}}.. = AI-inferred from form + class catalog; var count is derived from the approved template body so it adapts.

    Run prettier on the file.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <done>submissions.ts imports lead-ack helpers; step-14 looks up the approved template (skips on missing/not-approved), AI-fills vars via buildLeadAckVars from form + active class catalog, enqueues with the template's real language; tsc --noEmit reports 0 errors; lead capture path unchanged (returns success even on ack failure).</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx vitest run features/forms/lib/lead-ack.test.ts` → all cases green.
- `cd apps/staff-web && npx tsc --noEmit` → 0 errors.
- Manual code read: the `if (phoneE164 && leadAckTemplate)` block still wraps everything in try/catch; the only `return` added inside it is the not-approved skip (after all lead-capture writes), so lead capture is never broken.
- No new DB migration (reads existing whatsapp_templates + class_definitions; no schema change).
- No live-server runtime walkthrough (NitroViteError constraint — STATE.md). Substance verified via unit tests + tsc.
</verification>

<success_criteria>
- A 2-var approved template gets {{1}}=first name and {{2}}=AI-inferred interest filled from the form + active class catalog.
- Variable count is derived from the approved template body, so the fill adapts if the final approved template differs from the 2-var draft.
- enqueue uses the template row's real `language` (fallback "en"), not hardcoded "en_US".
- Template missing or not approved → block self-skips; lead still captured.
- Any LLM / parse / enqueue failure → deterministic fallback vars (or skip) and lead capture still returns `{ success: true }`.
</success_criteria>

<output>
After completion, create `.planning/quick/260618-fqg-lead-ack-whatsapp-vars-filled-by-ai-from/260618-fqg-SUMMARY.md`.

Include these OPERATIONAL CAVEATS in the SUMMARY (not code tasks):
- Only staff-web (Vercel) needs `LEAD_ACK_TEMPLATE_NAME` set now — the LLM fill + enqueue happen in staff-web; the worker just sends the job's vars and does NOT need the env var. `ANTHROPIC_API_KEY` is already in staff-web's Vercel env (confirmed by prior task 260609-fcm / 260615-k8m analyze route).
- The template must be approved (synced into whatsapp_templates with status 'approved' via the inbox "Update templates" button / MYÜTIK) before any send fires; until then the block self-skips.
- The LLM call adds ~1-2s synchronous latency to the form-submit response. Acceptable for the demo. Possible follow-up: move the fill to an async self-fired task (integration-webhooks pattern) or to the worker if latency matters — do NOT use Vercel `after()`/`waitUntil` (forbidden by AGENTS.md).
- Variable count is derived from the approved template body, so the fill adapts if the final approved template differs from the 2-var draft.
</output>
