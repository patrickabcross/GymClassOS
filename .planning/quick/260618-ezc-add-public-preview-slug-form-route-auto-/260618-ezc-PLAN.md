---
phase: quick-260618-ezc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/features/forms/lib/public-form-ssr.ts
  - apps/staff-web/server/routes/preview/[...slug].get.ts
  - apps/staff-web/server/middleware/00-public-cors.ts
  - apps/staff-web/server/plugins/auth.ts
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/features/forms/handlers/submissions.ts
autonomous: true
requirements: [QUICK-260618-EZC]

must_haves:
  truths:
    - "A visitor can open /preview/{slug} and see the same public form the /f/{slug} URL renders (demo: /preview/schedule-enquiry)"
    - "/preview/{slug} is reachable anonymously (no staff session, no email-allowlist denial) and returns permissive CORS headers"
    - "Submitting a lead form WITH a phone number AND with LEAD_ACK_TEMPLATE_NAME set creates a whatsapp_opt_in row and enqueues a TEMPLATE outbound send"
    - "Submitting WITHOUT a phone OR with LEAD_ACK_TEMPLATE_NAME unset never attempts a WhatsApp send — the lead still lands in the inbox exactly as today"
    - "A queue/enqueue failure never breaks the form-submission HTTP response (lead capture always succeeds)"
  artifacts:
    - path: "apps/staff-web/server/routes/preview/[...slug].get.ts"
      provides: "Nitro alias route that serves the public form renderer at /preview/:slug"
      contains: "renderPublicForm as default"
    - path: "apps/staff-web/features/forms/lib/public-form-ssr.ts"
      provides: "Renderer that strips both /f/ and /preview/ prefixes"
      contains: "/^\\\\/(f|preview)\\\\//"
    - path: "apps/staff-web/features/forms/handlers/submissions.ts"
      provides: "Lead handler that creates opt-in + enqueues template ack (env+phone gated)"
      contains: "LEAD_ACK_TEMPLATE_NAME"
  key_links:
    - from: "apps/staff-web/features/forms/handlers/submissions.ts"
      to: "apps/staff-web/app/lib/queue-client.ts"
      via: "import enqueueOutboundWhatsApp from ../../../app/lib/queue-client.js"
      pattern: "enqueueOutboundWhatsApp"
    - from: "apps/staff-web/server/plugins/auth.ts"
      to: "/preview/ anonymous access"
      via: "publicPaths += /preview AND allowlistHandler skip += /preview/"
      pattern: "/preview"
---

<objective>
Demo-enable the lead-capture form by (1) exposing the existing public form renderer at a friendlier `/preview/{slug}` URL alongside the existing `/f/{slug}`, and (2) auto-sending an approved WhatsApp template acknowledgement when a lead submits the form with a phone number.

Purpose: The demo wants `doyouhustle.co.uk/preview/schedule-enquiry` to render the lead form, and a fresh lead to receive an instant WhatsApp reply — without bypassing the worker's opt-in / 24h-window / approved-template compliance chokepoint.

Output: A `/preview/:slug` Nitro alias route (anonymous + CORS-open), a generalized renderer prefix-strip, and an env-gated + phone-gated auto-reply block in the submission handler that creates a `whatsapp_opt_in` row and enqueues a TEMPLATE send.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/staff-web/AGENTS.md

<interfaces>
<!-- Verified from the codebase — use these directly, no further exploration needed. -->

queue client — apps/staff-web/app/lib/queue-client.ts exports:
```typescript
export { enqueueOutboundWhatsApp };
// called as:
await enqueueOutboundWhatsApp({
  messageId,
  memberId,
  payload: { type: "template", name, vars, language: "en_US" },
});
```
From submissions.ts (at apps/staff-web/features/forms/handlers/) the correct relative import is:
  import { enqueueOutboundWhatsApp } from "../../../app/lib/queue-client.js";
(VERIFIED: three levels up from handlers/ reaches apps/staff-web/, then app/lib/queue-client.ts.)
Do NOT import @gymos/whatsapp directly — it is in forbiddenDependencies.

whatsappOptIn schema — apps/staff-web/server/db/schema.ts line 343:
```typescript
export const whatsappOptIn = table("whatsapp_opt_in", {
  memberId: text("member_id").primaryKey(),
  optedInAt: text("opted_in_at").notNull().default(now()),
  evidenceMessageId: text("evidence_message_id"),
  evidencePayload: text("evidence_payload"),     // JSON of evidence
  source: text("source", {
    enum: ["inbound_reply", "manual_admin", "import"],  // ADD "form_submission"
  }).notNull(),
  optedOutAt: text("opted_out_at"),
});
```
The `source` enum is TS-level only (DB column is plain text) → adding "form_submission" is purely additive, NO DB migration.

submissions.ts available locals (verified) at the insertion point (after step 13, ~line 410):
  - resolvedMemberId  (canonical gym_members.id after FK-safe re-select)
  - resolvedConvId    (canonical conversations.id after FK-safe re-select)
  - firstName         (extracted lead first name, defaults "Lead")
  - phoneE164         (string | null — null when no phone field submitted)
  - data              (the submitted form field map)
  - nowIso? — NOTE: this file uses `now` (an ISO string) not `nowIso`; reuse `now`.
  - db2.execute(sql`...`) raw-SQL helper (Neon HTTP returns { rows: [] })

messages-row pattern to mirror (from send-template-to-members.ts ~123-157):
```typescript
const messageId = `msg_${nanoid()}`;
const previewBody = `[template: ${templateName}]`;
// insert messages row: direction "out", messageType "template",
//   body previewBody, payload JSON {name, vars}, status "queued", createdAt now
// update conversation: lastMessagePreview = previewBody, updatedAt = now
// then enqueueOutboundWhatsApp({ messageId, memberId: resolvedMemberId, payload: {...} })
```

public renderer prefix strip — apps/staff-web/features/forms/lib/public-form-ssr.ts line 237:
```typescript
const slugOrId = decodeURIComponent(pathname.replace(/^\/f\//, ""));
// CHANGE TO:
const slugOrId = decodeURIComponent(pathname.replace(/^\/(f|preview)\//, ""));
```

existing /f route — apps/staff-web/server/routes/f/[...slug].get.ts (one-liner):
```typescript
export { renderPublicForm as default } from "../../../features/forms/lib/public-form-ssr.js";
```
The new preview route sits at the SAME depth (server/routes/preview/) → SAME `../../../` prefix.

auth/CORS — /preview must be added in THREE places (VERIFIED /f is whitelisted by explicit prefix match, NOT a broad pattern):
  1. apps/staff-web/server/middleware/00-public-cors.ts → PUBLIC_EMBED_PREFIXES array (line ~25): add "/preview/"
  2. apps/staff-web/server/plugins/auth.ts → publicPaths array (line ~51, beside "/f"): add "/preview"
  3. apps/staff-web/server/plugins/auth.ts → allowlistHandler skip block (line ~111, beside `pathname.startsWith("/f/")`): add `pathname.startsWith("/preview/")`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expose the public form renderer at /preview/{slug} (anonymous + CORS-open)</name>
  <files>
    apps/staff-web/features/forms/lib/public-form-ssr.ts,
    apps/staff-web/server/routes/preview/[...slug].get.ts,
    apps/staff-web/server/middleware/00-public-cors.ts,
    apps/staff-web/server/plugins/auth.ts
  </files>
  <action>
    Make `/preview/{slug}` a thin alias of the existing `/f/{slug}` public form renderer. Four edits:

    1. apps/staff-web/features/forms/lib/public-form-ssr.ts — in `renderPublicFormHtml` (line ~237), generalize the prefix strip so the same renderer serves both URL shapes:
       FROM: `const slugOrId = decodeURIComponent(pathname.replace(/^\/f\//, ""));`
       TO:   `const slugOrId = decodeURIComponent(pathname.replace(/^\/(f|preview)\//, ""));`
       This is the ONLY change inside the renderer. "form-name" == the form's unique `slug`; `getFormBySlugOrId` already matches slug first then id. The seeded demo form slug is "schedule-enquiry" → demo URL becomes /preview/schedule-enquiry.

    2. Create apps/staff-web/server/routes/preview/[...slug].get.ts as a one-liner sibling of the existing f/ route (same `../../../` depth):
       `export { renderPublicForm as default } from "../../../features/forms/lib/public-form-ssr.js";`
       (Optionally include a short header comment mirroring the f/ route's comment block.)

    3. apps/staff-web/server/middleware/00-public-cors.ts — add `"/preview/"` to the `PUBLIC_EMBED_PREFIXES` array (line ~25), so cross-origin requests to /preview/* get permissive CORS + OPTIONS 204 before auth runs.

    4. apps/staff-web/server/plugins/auth.ts — TWO additions (the /f route is whitelisted by explicit prefix match, confirmed — so /preview must mirror it in both spots):
       a. In the `publicPaths` array (beside `"/f"` at line ~51) add `"/preview"` with a one-line comment (e.g. `// public SSR form pages (alias of /f)`).
       b. In the `allowlistHandler` skip block (beside `pathname.startsWith("/f/")` at line ~111) add `pathname.startsWith("/preview/") ||`.

    OPTIONAL (only if trivial, otherwise skip): surface the /preview/{slug} link in the staff Forms list apps/staff-web/app/routes/gymos.forms._index.tsx near the existing /f/{slug} hint (~lines 418-427 and 490-496). NOT required for completion — do not let it expand scope.

    Run prettier on every changed file.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | grep -E "public-form-ssr|preview|00-public-cors|auth\.ts" || echo "no typecheck errors in changed files"</automated>
  </verify>
  <done>
    - public-form-ssr.ts strips both /f/ and /preview/ prefixes (regex `/^\/(f|preview)\//`).
    - apps/staff-web/server/routes/preview/[...slug].get.ts exists and re-exports renderPublicForm as default.
    - "/preview/" present in PUBLIC_EMBED_PREFIXES; "/preview" in auth publicPaths; `pathname.startsWith("/preview/")` in the allowlistHandler skip block.
    - TypeScript compiles (no new errors in the changed files); prettier applied.
  </done>
</task>

<task type="auto">
  <name>Task 2: Auto-send WhatsApp template ack on lead submit (opt-in + enqueue, env+phone gated)</name>
  <files>
    apps/staff-web/server/db/schema.ts,
    apps/staff-web/features/forms/handlers/submissions.ts
  </files>
  <action>
    Add a compliance-safe auto-reply to the lead submission handler. The worker remains the authoritative gate (opt-in / 24h-window / approved-template) — we are NOT short-circuiting it; we are creating the opt-in row the worker requires and enqueueing a TEMPLATE send.

    A. apps/staff-web/server/db/schema.ts (line ~348): add `"form_submission"` to the `whatsappOptIn.source` enum list, making it:
       `enum: ["inbound_reply", "manual_admin", "import", "form_submission"]`
       This is TS-level only (DB column is plain text) — NO DB migration required.

    B. apps/staff-web/features/forms/handlers/submissions.ts:
       1. Add the import at the top (mirroring send-template-to-members.ts):
          `import { enqueueOutboundWhatsApp } from "../../../app/lib/queue-client.js";`
          (VERIFIED relative path — three levels up from handlers/ reaches apps/staff-web/, then app/lib/queue-client.ts.) Do NOT import @gymos/whatsapp.

       2. Immediately AFTER the step-13 `responses` insert (~line 410) and BEFORE `return { success: true, id: responseId };`, add a "step 14 — auto-reply" block. The ENTIRE block must be a no-op when either `phoneE164` is null OR `process.env.LEAD_ACK_TEMPLATE_NAME` is empty/unset:

          ```typescript
          // -------------------------------------------------------------------
          // 14. Auto-reply: enqueue an approved WhatsApp template ack to a fresh lead.
          //
          // Compliance: a fresh form lead has NEVER messaged the studio, so the
          // 24h window is CLOSED → the outbound MUST be an approved TEMPLATE
          // (not free text). The worker remains the authoritative gate
          // (opt-in / window / approved-template); we only create the opt-in row
          // it requires and enqueue the send. We are NOT bypassing the worker.
          //
          // Env-gated: LEAD_ACK_TEMPLATE_NAME is the approved template name. The
          // conversational template is NOT approved yet (the user is getting a new
          // one approved separately) — until LEAD_ACK_TEMPLATE_NAME is set on BOTH
          // staff-web (Vercel) and the worker (Fly), this block is a complete no-op
          // and the lead simply lands in the inbox as before.
          //
          // TEMPLATE DESIGN CONTRACT: the approved template MUST declare exactly
          // ONE variable, where {{1}} = the lead's first name. Supplying fewer vars
          // than the template declares makes the Meta/MYÜTIK send FAIL.
          // -------------------------------------------------------------------
          const leadAckTemplate = (process.env.LEAD_ACK_TEMPLATE_NAME ?? "").trim();
          if (phoneE164 && leadAckTemplate) {
            try {
              // (a) Ensure an opt-in row exists. ON CONFLICT DO NOTHING so a
              //     re-submit never clobbers an existing opt-out / opt-in.
              await db2.execute(sql`
                INSERT INTO whatsapp_opt_in (member_id, opted_in_at, evidence_payload, source)
                VALUES (
                  ${resolvedMemberId},
                  ${now},
                  ${JSON.stringify({ kind: "form_submission", formId: id, data })},
                  'form_submission'
                )
                ON CONFLICT (member_id) DO NOTHING
              `);

              // (b) Optimistic queued template message (mirrors send-template-to-members.ts).
              const ackMessageId = `msg_${nanoid()}`;
              const ackVars = { "1": firstName };
              const ackPreview = `[template: ${leadAckTemplate}]`;
              await db2.execute(sql`
                INSERT INTO messages (id, conversation_id, direction, message_type, body, payload, status, created_at)
                VALUES (
                  ${ackMessageId},
                  ${resolvedConvId},
                  'out',
                  'template',
                  ${ackPreview},
                  ${JSON.stringify({ name: leadAckTemplate, vars: ackVars })},
                  'queued',
                  ${now}
                )
              `);
              await db2.execute(sql`
                UPDATE conversations
                SET last_message_preview = ${ackPreview}, updated_at = ${now}
                WHERE id = ${resolvedConvId}
              `);

              // (c) Enqueue the TEMPLATE send. Worker gates opt-in/window/approval.
              await enqueueOutboundWhatsApp({
                messageId: ackMessageId,
                memberId: resolvedMemberId,
                payload: {
                  type: "template",
                  name: leadAckTemplate,
                  vars: ackVars,
                  language: "en_US",
                },
              });
            } catch (err) {
              // Lead capture MUST always succeed even if the WhatsApp enqueue
              // fails — mirror send-template-to-members.ts resilience: log + continue.
              console.error(
                "[submitLeadForm] lead ack WhatsApp enqueue failed:",
                err,
              );
            }
          }
          ```

       3. Keep the existing `// guard:allow-unscoped` posture (gym tables are single-tenant). Do NOT wrap in runWithRequestContext — the handler is anonymous.

    Use the file's established raw-SQL `db2.execute(sql`...`)` style (shown above) for consistency. Reuse the existing `now`, `firstName`, `phoneE164`, `resolvedMemberId`, `resolvedConvId`, `id`, and `data` locals. Run prettier on both changed files.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | grep -E "submissions\.ts|schema\.ts" || echo "no typecheck errors in changed files"</automated>
  </verify>
  <done>
    - whatsappOptIn.source enum includes "form_submission".
    - submissions.ts imports enqueueOutboundWhatsApp from "../../../app/lib/queue-client.js".
    - The step-14 block is gated on `phoneE164 && leadAckTemplate`; inserts opt-in (ON CONFLICT DO NOTHING), inserts a queued template message, updates the conversation preview, and enqueues a template send.
    - The whole block is wrapped in try/catch and logs+continues on failure (form response unaffected).
    - vars = { "1": firstName } with the documented single-variable template contract comment present.
    - TypeScript compiles (no new errors in submissions.ts / schema.ts); prettier applied.
  </done>
</task>

</tasks>

<verification>
- Full staff-web typecheck has no NEW errors introduced by this change:
  `cd apps/staff-web && npx tsc --noEmit` (compare against pre-existing baseline; the enum addition + new import must typecheck).
- `apps/staff-web/server/routes/preview/[...slug].get.ts` exists and mirrors the f/ route.
- Grep confirms `/preview` appears in 00-public-cors.ts (PUBLIC_EMBED_PREFIXES), auth.ts publicPaths, and auth.ts allowlistHandler skip block.
- Grep confirms `LEAD_ACK_TEMPLATE_NAME`, `form_submission`, and `enqueueOutboundWhatsApp` appear in submissions.ts.
- No `@gymos/whatsapp` import added anywhere in staff-web (the guard script forbids it).
- Prettier applied to all changed files.

Runtime note (no local dev server — NitroViteError constraint per STATE.md): do NOT attempt a local HTTP walkthrough. Substance verification is typecheck + grep; live verification happens on the Vercel deploy. Do NOT over-engineer tests — typecheck + prettier is sufficient for this quick task (extend an existing submissions vitest only if one already exists; do not author a new test harness).
</verification>

<success_criteria>
- /preview/{slug} serves the same public form renderer as /f/{slug}, anonymously and CORS-open (demo: /preview/schedule-enquiry).
- A lead submit with a phone AND LEAD_ACK_TEMPLATE_NAME set creates a whatsapp_opt_in row (ON CONFLICT DO NOTHING) and enqueues a TEMPLATE send through the worker chokepoint.
- A lead submit without a phone, or with LEAD_ACK_TEMPLATE_NAME unset, is a no-op for WhatsApp and the lead still lands in the inbox exactly as today.
- A queue failure never breaks the form-submission response.
- staff-web TypeScript compiles; prettier applied.
</success_criteria>

<output>
After completion, create `.planning/quick/260618-ezc-add-public-preview-slug-form-route-auto-/260618-ezc-SUMMARY.md`.

Record these OPERATIONAL caveats (not code tasks) in the SUMMARY:
- For the demo to actually DELIVER a message: the new conversational template must be approved in WhatsApp/MYÜTIK AND `LEAD_ACK_TEMPLATE_NAME` must be set on BOTH staff-web (Vercel env) and the worker (Fly env — the worker reads/sends it). Until then the queued message row lands `status='failed'` with a template-gate error code — expected/acceptable.
- The submitter must enter a phone number to trigger a reply. The seeded "schedule-enquiry" form's phone field is `required: false` (apps/staff-web/server/db/seeds/seed-enquiry-form.ts). Recommend (do not require) making phone required for the demo; otherwise a no-phone submission simply won't trigger a WhatsApp reply.
- The approved template MUST declare exactly one variable ({{1}} = member first name); supplying fewer vars than declared makes the Meta/MYÜTIK send fail.
- MYÜTIK relay is live; Neon project is gymos-demo (id billowing-sun-51091059).
</output>
