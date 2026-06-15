---
phase: quick-260615-lyu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - services/worker/src/queues/outbound-whatsapp.ts
  - services/worker/src/lib/templateBody.ts
  - apps/staff-web/app/routes/gymos.messages.tsx
  - apps/staff-web/app/lib/templateBody.ts
  - apps/staff-web/app/lib/templateBody.test.ts
autonomous: true
requirements:
  - WA-05
  - INBX-02
gap_closure: false

must_haves:
  truths:
    - "An outbound WhatsApp message whose send fails (transient/unknown error, retries exhausted) eventually shows status='failed' in the staff inbox instead of staying 'queued' forever."
    - "A template message bubble in the conversation thread renders the real template body text (with {{N}} placeholders filled from the stored vars) instead of the literal '[template: name]' placeholder."
    - "Gate-refusal behavior (NoOptIn / WindowExpired / TemplateNotApproved → status='failed' with typed code) is unchanged."
    - "Retry behavior for non-final attempts is unchanged — the row is only force-failed on the LAST attempt."
    - "Template rendering falls back gracefully (to '[template: name]' or raw body) when the template row or a var is missing — never crashes."
  artifacts:
    - path: "services/worker/src/queues/outbound-whatsapp.ts"
      provides: "Final-attempt detection that marks messages.status='failed' on exhausted non-gate retries"
      contains: "includeMetadata"
    - path: "apps/staff-web/app/lib/templateBody.ts"
      provides: "Pure, unit-testable helper that substitutes {{N}} placeholders in a template BODY string from a vars map"
      exports: ["renderTemplateBody"]
    - path: "apps/staff-web/app/lib/templateBody.test.ts"
      provides: "Vitest coverage for renderTemplateBody (happy path, missing var, missing template, no-vars)"
  key_links:
    - from: "services/worker/src/queues/outbound-whatsapp.ts"
      to: "messages.status='failed'"
      via: "db.update on final attempt in the non-gate catch branch"
      pattern: "retryCount.*retryLimit|status.*failed"
    - from: "apps/staff-web/app/routes/gymos.messages.tsx render loop"
      to: "renderTemplateBody helper + loader templates map"
      via: "per-message resolution of template body text by payload.name"
      pattern: "renderTemplateBody"
---

<objective>
Make outbound WhatsApp message state honest in the staff inbox — two independent fixes.

FIX 1 (worker): When a non-gate (transient/unknown) error exhausts all pg-boss retries, the `messages` row is never updated and sits at status='queued' forever. Mark it status='failed' on the final attempt so the inbox reflects reality.

FIX 2 (staff-web): Template message bubbles render the literal stored body `[template: name]` instead of the real template text. Render the actual template BODY (from `whatsapp_templates.components_json`) with `{{N}}` placeholders substituted from the stored `payload.vars`.

Purpose: The staff inbox currently lies about send outcomes (eternal "queued") and shows opaque placeholders for templates. Both undermine coach trust in the conversation view.

Output: Updated worker queue handler + a small worker template-body helper (FIX 1 / worker side is logic-only); a pure, unit-tested `renderTemplateBody` helper and updated render loop in staff-web (FIX 2).
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

# FIX 1 target + chokepoint (read both — the catch branch lives in the queue handler)
@services/worker/src/queues/outbound-whatsapp.ts
@services/worker/src/domain/sendMessage.ts

# FIX 2 target (loader already fetches `templates` with componentsJson; render loop ~lines 1095-1127)
@apps/staff-web/app/routes/gymos.messages.tsx

<interfaces>
<!-- Verified facts the executor needs — do NOT re-investigate. -->

== FIX 1: pg-boss v12.18.2 job metadata ==
The base `Job` type does NOT carry retry counters. They live on `JobWithMetadata`:

  interface JobWithMetadata<T> extends Job<T> {
    state: 'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed';
    retryLimit: number;   // configured limit (3 from @gymos/queue publish.ts)
    retryCount: number;   // 0 on first attempt, increments each retry
    ...
  }

To receive `JobWithMetadata` in the `boss.work()` handler you MUST pass
`includeMetadata: true` in WorkOptions. The current call is:
  await boss.work(QUEUE_NAMES.OUTBOUND_WHATSAPP, { batchSize: 1, localConcurrency: 1 }, async (jobs: any) => {...})
The handler already casts `jobs: any` and does `const job = Array.isArray(jobs) ? jobs[0] : jobs;`
so reading `job.retryCount` / `job.retryLimit` after adding `includeMetadata: true` needs no type changes.

"Final attempt" = `job.retryCount >= job.retryLimit` (retryCount is the count of retries already
performed; on the last allowed run it equals retryLimit). Treat a missing/undefined retryLimit
defensively (e.g. default to 3 to match publish.ts, or skip force-fail if metadata absent).

== FIX 1: existing handler catch structure (outbound-whatsapp.ts) ==
- Gate errors (NoOptInError | WindowExpiredError | TemplateNotApprovedError): already write
  status='failed' + errorCode and `return` (terminal). DO NOT TOUCH this branch.
- All other errors: currently `throw err` unconditionally so pg-boss retries.
- messages status enum already includes 'failed'; errorCode is a free-text column.
- The worker's own writes use the marker comment `// guard:allow-unscoped — worker writes own state`.

== FIX 2: messages columns (apps/staff-web/server/db/schema.ts) ==
  messageType: enum ['text','template','image','audio','video','document'] (default 'text')
  body:    text | null   — for templates currently '[template: <name>]'
  payload: text | null   — JSON; for outbound templates: JSON.stringify({ name, vars })
                            where vars is keyed by placeholder index, e.g. {"1":"Patrick","2":"everyone"}

== FIX 2: loader ALREADY fetches templates (gymos.messages.tsx ~line 222) ==
  const templates = await db.select({
    name, status, category, language, componentsJson: schema.whatsappTemplates.componentsJson,
  }).from(schema.whatsappTemplates).orderBy(...);
  // returned to the component as data.templates
So you do NOT need a new DB query — build a name→bodyText (or name→components) map from
`data.templates` and pass it into the render loop. (You MAY narrow it to only template names
present in selectedMessages, but reusing the existing full list is fine and simpler.)

== FIX 2: render loop (gymos.messages.tsx ~lines 1095-1127) ==
Currently renders `{m.body}` directly inside the bubble. Replace with resolved text for
messageType==='template', else `{m.body}`.

== FIX 2: components_json shape — VERIFY BEFORE PARSING ==
Meta template components are typically an array of objects like
  [{ type: 'BODY', text: 'Hi {{1}}, ...' }, { type: 'HEADER', ... }, ...]
BUT confirm whether the column stores the components array directly or a wrapped object
(e.g. { components: [...] }). The seeded rows came from the MYÜTIK Template Extract sync
(see the sync-templates branch ~line 413 in gymos.messages.tsx for the upstream shape).
Query one row before writing the parser, e.g. via Neon MCP:
  SELECT name, components_json FROM whatsapp_templates WHERE name = 'bobby_harrison_hyrox_invite_v1';
Match the BODY component case-insensitively (type may be 'BODY' or 'body').

== staff-web conventions (from STATE.md / AGENTS.md) ==
- `@/` path alias (NOT `~/`); react-router v7 loaders return plain objects (no json()).
- Tabler icons only, shadcn primitives — but this change is logic-only, no new UI chrome.
- Vitest is the test runner; existing worker tests use the thenable-Drizzle-mock pattern.
</interfaces>

# Fork boundary (HARD): edit ONLY apps/staff-web/** and services/worker/**.
# Never templates/** or packages-vendored/**. No DB schema changes.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Worker — mark stuck 'queued' messages 'failed' on exhausted non-gate retries</name>
  <files>services/worker/src/queues/outbound-whatsapp.ts</files>
  <action>
In `registerOutboundWhatsAppWorker`, fix the invisible-failure bug (FIX 1).

1. Add `includeMetadata: true` to the WorkOptions object in the `boss.work(...)` call so the
   handler receives `JobWithMetadata` (which carries `retryCount` / `retryLimit`). Keep the
   existing `batchSize: 1, localConcurrency: 1` options. The handler already casts `jobs: any`
   and resolves `const job = Array.isArray(jobs) ? jobs[0] : jobs;` — no type changes needed.

2. In the `catch (err)` block, leave the gate-error branch (NoOptInError | WindowExpiredError |
   TemplateNotApprovedError) EXACTLY as-is — it already writes status='failed' + typed code and
   returns. DO NOT weaken or alter gate behavior (D-19).

3. For the NON-gate (unknown/transient) branch — currently just `throw err`:
   - Compute `const retryCount = Number(job?.retryCount ?? 0);` and
     `const retryLimit = Number(job?.retryLimit ?? 3);` (3 matches @gymos/queue publish.ts;
      defensive default if metadata is somehow absent).
   - If this is the FINAL attempt (`retryCount >= retryLimit`): write the messages row to
     status='failed' with a short errorCode derived from the error message, BEFORE re-throwing
     (or instead of re-throwing — either is fine; re-throwing after the write lets pg-boss still
     record the job as failed, which is harmless and preserves the existing log line). Use a
     truncated code, e.g. `const errorCode = (err instanceof Error ? err.message : String(err)).slice(0, 200);`
     Reuse the existing update shape:
       // guard:allow-unscoped — worker writes own state
       await db.update(schema.messages)
         .set({ status: "failed", errorCode })
         .where(eq(schema.messages.id, data.messageId));
     Add a `log.error({ messageId: data.messageId, retryCount, retryLimit }, "[outbound-whatsapp] retries exhausted — marking failed")` line.
   - If NOT the final attempt: keep the existing behavior — log the transient error and `throw err`
     so pg-boss retries. Do not write status='failed' on intermediate attempts.

Keep the existing success-path logging and the existing transient `log.error({ err, messageId })`
line for non-final attempts. Do not change sendMessage.ts (its 4xx/2xx writes are correct and the
gate errors are handled here).
  </action>
  <verify>
    <automated>cd services/worker && npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>
- `boss.work` passes `includeMetadata: true` alongside the existing concurrency options.
- The non-gate catch branch detects the final attempt via `retryCount >= retryLimit` and writes
  messages.status='failed' + a truncated errorCode before re-throwing; intermediate attempts still
  `throw err` to retry.
- Gate-error branch is byte-for-byte unchanged.
- Worker typechecks clean.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Staff-web — render real template body in conversation bubbles</name>
  <files>apps/staff-web/app/lib/templateBody.ts, apps/staff-web/app/lib/templateBody.test.ts, apps/staff-web/app/routes/gymos.messages.tsx</files>
  <behavior>
renderTemplateBody (pure helper) — given the template's BODY text and a vars map:
  - Happy path: `renderTemplateBody("Hi {{1}}, your {{2}} is ready", {"1":"Patrick","2":"pass"})`
    → "Hi Patrick, your pass is ready"
  - Missing var: a `{{N}}` with no matching key is left as-is (or replaced with empty string —
    pick one and assert it) — must NOT throw.
  - No vars / empty map: returns the body text unchanged (placeholders left intact).
  - Repeated placeholder: `{{1}}` appearing twice is substituted in both positions.
A separate resolver (can live in the same file, e.g. `resolveTemplateMessageBody`) that, given a
parsed payload `{name, vars}` + a `name → bodyText` map, returns the rendered text, OR falls back
to `[template: name]` when the template/body is missing — must never throw on malformed payload JSON.
  </behavior>
  <action>
FIX 2 — render the real template text instead of the `[template: name]` placeholder.

A. Create `apps/staff-web/app/lib/templateBody.ts` with two small pure functions:
   - `renderTemplateBody(bodyText: string, vars: Record<string, string> | undefined): string`
     — substitutes every `{{N}}` token using `vars[N]`. Implement via
       `bodyText.replace(/\{\{(\d+)\}\}/g, (m, n) => vars?.[n] ?? m)` (leaves unknown placeholders
       intact; choose `?? ""` instead if you prefer blanking — match whatever the test asserts).
   - `extractBodyText(componentsJson: unknown): string | null`
     — VERIFY the stored shape first (query one whatsapp_templates row via Neon MCP as noted in the
       interfaces block). Parse `componentsJson` (it may be a JSON string, an array, or a wrapped
       object), find the component whose `type` matches `/^body$/i`, and return its `text` string.
       Return `null` if not found / unparseable. Never throw.
   - `resolveTemplateMessageBody(rawPayload: string | null, byName: Record<string, string | null>):
        { text: string } | null` (or inline this in the route) — safely JSON.parse the payload,
       read `name` + `vars`, look up `byName[name]`; if found, return `renderTemplateBody(body, vars)`;
       otherwise return null so the caller falls back to `[template: name]` / raw body.

B. Create `apps/staff-web/app/lib/templateBody.test.ts` (Vitest) covering the behaviors above:
   happy path, missing var, empty vars, repeated placeholder, and `extractBodyText` for the
   confirmed real components_json shape + a null/garbage input.

C. In `apps/staff-web/app/routes/gymos.messages.tsx`:
   - Reuse the loader's existing `data.templates` (already includes `componentsJson`) — do NOT add a
     new query. In the component, build a `name → bodyText` map once via `extractBodyText` over
     `data.templates` (memoize with `useMemo` keyed on `data.templates`).
   - In the message render loop (~lines 1095-1127), replace the bare `{m.body}` with:
       for `m.messageType === "template"`: the resolved rendered body (via
       `resolveTemplateMessageBody(m.payload, bodyByName)`), falling back to `m.body` (the
       `[template: name]` string) when resolution returns null;
       otherwise render `{m.body}` as today.
     Keep the existing bubble styling, failed-bubble copy, and timestamp/status line untouched.

Do NOT modify the enqueue branches (they still store `[template: name]` as the fallback body) and do
NOT touch send-template-to-members.ts — the render-side fix covers both enqueue paths because both
write the same body+payload shape. No schema changes.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx vitest run app/lib/templateBody.test.ts</automated>
  </verify>
  <done>
- `renderTemplateBody` + `extractBodyText` exist as pure functions in app/lib/templateBody.ts and
  pass the Vitest suite (happy path, missing var, empty vars, repeated placeholder, null/garbage
  components_json).
- The conversation render loop shows real template text with vars substituted for
  messageType==='template', and falls back to `[template: name]` / raw body when the template row or
  a var is missing — no crash on malformed payload.
- No new DB query added (reuses data.templates); no enqueue branch or schema changed.
  </done>
</task>

</tasks>

<verification>
- Worker: `cd services/worker && npx tsc --noEmit` passes; the non-gate final-attempt branch writes
  status='failed'. Optional live check via Neon MCP: confirm a previously stuck message
  (e.g. msg_oJHmVng5fXHG3t2enDjki) — after redeploy + a fresh failing job — lands at 'failed' not
  'queued' (do NOT mutate existing prod rows by hand as part of the change).
- Staff-web: `cd apps/staff-web && npx vitest run app/lib/templateBody.test.ts` green; the messages
  route still typechecks (`npx tsc --noEmit` if quick).
- Fork boundary respected: only apps/staff-web/** and services/worker/** touched.
- Gate behavior in outbound-whatsapp.ts unchanged.
</verification>

<success_criteria>
- A send that fails on a non-gate error after exhausting retries shows 'failed' in the inbox instead
  of an eternal 'queued'.
- Template bubbles in the thread show the real, var-filled template text (graceful fallback when a
  template/var is missing).
- All existing gate refusals, retry-on-intermediate-attempt, and 4xx/2xx writes behave exactly as
  before.
- No DB schema changes; no edits outside the fork boundary.
</success_criteria>

<output>
After completion, create `.planning/quick/260615-lyu-make-outbound-whatsapp-message-state-hon/260615-lyu-SUMMARY.md`
</output>
