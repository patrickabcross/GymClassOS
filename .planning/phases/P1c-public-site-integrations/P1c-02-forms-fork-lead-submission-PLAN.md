---
phase: P1c-public-site-integrations
plan: 02
type: execute
wave: 1
depends_on: ["P1c-01"]
files_modified:
  - apps/staff-web/features/forms/FORMS.md
  - apps/staff-web/features/forms/types.ts
  - apps/staff-web/features/forms/lib/validate-fields.ts
  - apps/staff-web/features/forms/lib/public-form-ssr.ts
  - apps/staff-web/features/forms/lib/normalize-phone.ts
  - apps/staff-web/features/forms/lib/rate-limit.ts
  - apps/staff-web/features/forms/handlers/forms.ts
  - apps/staff-web/features/forms/handlers/submissions.ts
  - apps/staff-web/server/db/forms-schema.ts
  - apps/staff-web/server/db/schema.ts
  - apps/staff-web/server/middleware/00-public-cors.ts
  - apps/staff-web/server/plugins/auth.ts
  - apps/staff-web/server/routes/f/[...slug].get.ts
  - apps/staff-web/server/routes/api/forms/public/[...slug].get.ts
  - apps/staff-web/server/routes/api/submit/[id].post.ts
autonomous: false
requirements: [FORMS-01, FORMS-03]
must_haves:
  truths:
    - "A POST to /api/submit/:formId with name+email+phone upserts a gym_members row and opens/updates a conversations row with status='lead'"
    - "The same person submitting twice does not create a duplicate member or a duplicate conversation"
    - "An OPTIONS preflight to /api/submit/:id returns 204 (not a 302 redirect to login)"
    - "GET /f/:slug returns a self-contained HTML form page without requiring authentication"
    - "A UK phone like '07721 123456' is stored as '+447721123456' so the WhatsApp conversation can match it"
    - "More than ~60 submissions in 15 minutes from one IP are rejected with HTTP 429 (Decision 2 rate-limit)"
  artifacts:
    - path: "apps/staff-web/features/forms/handlers/submissions.ts"
      provides: "Gym lead-upsert submission handler (replaces upstream generic responses insert)"
      contains: "status: \"lead\""
    - path: "apps/staff-web/features/forms/lib/rate-limit.ts"
      provides: "Per-IP in-memory submission rate limiter (60 req / 15 min)"
      contains: "429"
    - path: "apps/staff-web/server/middleware/00-public-cors.ts"
      provides: "CORS middleware running before auth guard for public embed routes"
      contains: "Access-Control-Allow-Origin"
    - path: "apps/staff-web/server/routes/api/submit/[id].post.ts"
      provides: "Public form submission endpoint"
      contains: "submitLeadForm"
    - path: "apps/staff-web/features/forms/lib/normalize-phone.ts"
      provides: "UK phone → E.164 normaliser"
      contains: "+44"
  key_links:
    - from: "apps/staff-web/features/forms/handlers/submissions.ts"
      to: "gym_members + conversations + messages + form_submissions tables"
      via: "Drizzle insert with ON CONFLICT"
      pattern: "ON CONFLICT|onConflictDo"
    - from: "apps/staff-web/server/plugins/auth.ts"
      to: "publicPaths"
      via: "createAuthPlugin publicPaths array + allowlistHandler skip list"
      pattern: "\"/api/submit\""
    - from: "apps/staff-web/server/middleware/00-public-cors.ts"
      to: "OPTIONS preflight short-circuit"
      via: "H3 setResponseHeader + 204"
      pattern: "204"
---

<objective>
Fork the upstream `templates/forms/` template into `apps/staff-web/features/forms/`
(co-located, no new deployable per Decision 1) and replace its generic submission handler
with a gym-specific lead-upsert: a public form POST creates/updates a `gym_members` row and
opens a `status='lead'` conversation that surfaces in `/gymos`. This plan owns ALL the
auth/CORS/public-route plumbing (auth.ts + 00-public-cors.ts) so downstream plans never edit
those files (avoids parallel-edit conflicts).

Purpose: This is the FORMS-01 fork + FORMS-03 lead pipeline — the core commercial value of
P1c. Most form-rendering hard work is already done upstream; the value here is the
gym lead pipeline + the cross-origin plumbing.

Output: forked forms feature slice, lead-upsert handler, public SSR + submit routes, CORS
middleware, auth publicPaths extension, UK phone normaliser, per-IP rate limiter.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md
@.planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md
@apps/staff-web/server/plugins/auth.ts
@apps/staff-web/server/db/schema.ts
@templates/forms/server/handlers/submissions.ts
@templates/forms/server/middleware/00-public-cors.ts
@templates/forms/server/db/schema.ts

<interfaces>
<!-- Source: templates/forms/server/handlers/submissions.ts (copy bot-protection + validation verbatim) -->
<!-- Upstream submitForm: honeypot (_hp), time-to-submit (_t, MIN_FILL_TIME_MS=500),
     MAX_PAYLOAD_BYTES=100KB, per-field length limits, conditional-visibility required-field
     validation, field-id whitelist. Reuse ALL of this; only the persistence tail changes. -->

<!-- Source: apps/staff-web/server/db/index.ts -->
import { getDb, schema } from "../../server/db/index.js"; // ESM .js convention

<!-- gym tables this handler writes (from apps/staff-web/server/db/schema.ts):
     gymMembers: { id, firstName, lastName, email, phoneE164, marketingConsent, createdAt, updatedAt }
       partial unique index on email (P1c-01) + on phoneE164 (P1c-01)
     conversations: { id, memberId, channel('whatsapp'), status('open'|'closed'|'snoozed'|'lead'), createdAt, updatedAt }
       unique index on (memberId, channel) (P1c-01)
     messages: { id, conversationId, direction('in'|'out'), messageType, body, payload, status, createdAt }
       NOTE: messageType enum is ["text","template","image","audio","video","document"] — there is
       no 'form_submission' value. Use messageType:'text' and put the form summary in body, OR
       store the form context in payload JSON. Do NOT invent a new messageType enum value
       (that would need another migration). messages.status default is 'queued'; for an inbound
       note set direction:'in', status:'delivered'.
     formSubmissions (P1c-01): { id, formId, memberId, conversationId, data, submittedAt, ip, submitterEmail } -->

<!-- guard:allow-unscoped applies — gym domain tables do NOT use ownableColumns(); single-tenant.
     Per RESEARCH §"Pattern 2": do NOT wrap the lead-upsert in runWithRequestContext (endpoint is
     public/anonymous; framework does not inject context for /api/submit/*). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Copy the forms template into features/forms/ + forked Drizzle forms schema</name>
  <files>apps/staff-web/features/forms/FORMS.md, apps/staff-web/features/forms/types.ts, apps/staff-web/features/forms/lib/validate-fields.ts, apps/staff-web/features/forms/lib/public-form-ssr.ts, apps/staff-web/features/forms/handlers/forms.ts, apps/staff-web/server/db/forms-schema.ts, apps/staff-web/server/db/schema.ts</files>
  <read_first>
    - templates/forms/shared/types.ts — FormField, FormSettings, FormResponse types (copy unchanged)
    - templates/forms/server/lib/validate-fields.ts — copy unchanged
    - templates/forms/server/lib/public-form-ssr.ts — full SSR renderer; note exports safeRedirectUrl, renderPublicFormHtml, renderPublicForm; note the upstream postMessage event name "agent-native-feedback-submitted" and the "Built with Agent Native" badge (both replaced in Task 2/this fork)
    - templates/forms/server/handlers/forms.ts — CRUD handlers for the builder (list/create/update/publish/archive)
    - templates/forms/server/db/schema.ts — the upstream `forms` + `responses` tables (these reference ownableColumns; the fork drops sharing for the pilot)
    - apps/staff-web/server/db/schema.ts — confirm the `table`/`text`/`integer` import style + `now()` helper to reuse in forms-schema.ts
    - apps/staff-web/AGENTS.md — guard:allow-unscoped policy for gym tables
  </read_first>
  <action>
1. **Create `apps/staff-web/features/forms/FORMS.md`** — a short fork-notes file recording: source
   = `templates/forms/`; what changed (submission handler replaced with gym lead upsert;
   postMessage event renamed `agent-native-feedback-submitted` → `lead:submitted`; "Built with
   Agent Native" badge removed; sharing/ownableColumns dropped for the pilot; integrations
   (Slack/Discord/Sheets) copied but NOT wired; appStatePut call removed). State the fork
   boundary rule: never edit `templates/forms/`.

2. **Copy unchanged:**
   - `templates/forms/shared/types.ts` → `apps/staff-web/features/forms/types.ts` (verbatim).
   - `templates/forms/server/lib/validate-fields.ts` → `apps/staff-web/features/forms/lib/validate-fields.ts` (verbatim; fix the relative import to types.ts).

3. **Copy + adapt `public-form-ssr.ts`** → `apps/staff-web/features/forms/lib/public-form-ssr.ts`:
   - Replace `@agent-native/core/*` imports that don't resolve in staff-web with the staff-web
     equivalents (the SSR HTML generation itself is framework-free string building — keep it).
   - **Replace the success postMessage** from `{ type: "agent-native-feedback-submitted" }` to
     `{ type: "lead:submitted", formId: FORM_ID, responseId: id }`.
   - **Add a height-resize postMessage** the parent embed.js (P1c-06) consumes:
     `window.parent.postMessage({ type: "gymos:resize", height: document.body.scrollHeight }, "*")`
     fired on load and after any visibility change.
   - **Remove** the "Built with Agent Native" badge from the HTML output.
   - **Copy `safeRedirectUrl()` verbatim** (RESEARCH Pattern 4 security note — rejects
     `javascript:` redirect URLs; only http/https allowed).
   - Add the URL-param theming hook: read `?accent` and `?radius` from the request URL and inject
     sanitized CSS custom properties `--accent` / `--radius` into the `<style>` block. Define the
     sanitizers inline (also exported for reuse by the schedule widget in P1c-05):
     ```typescript
     export function sanitizeHexColor(value: string | null): string {
       const v = (value ?? "").trim();
       return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#000000";
     }
     export function sanitizeIntPx(value: string | null, min = 0, max = 32): number {
       const n = parseInt(value ?? "", 10);
       return isNaN(n) ? 6 : Math.min(max, Math.max(min, n));
     }
     ```

4. **Copy `templates/forms/server/handlers/forms.ts`** → `apps/staff-web/features/forms/handlers/forms.ts`:
   - These are the staff-side builder CRUD handlers (consumed by P1c-04's routes).
   - Fix imports to point at `../../../server/db/forms-schema.js` (created below) and staff-web
     server helpers. Strip the sharing/ownableColumns access checks ONLY if they don't compile;
     prefer keeping them if they resolve. Note in FORMS.md whatever was stripped.

5. **Create `apps/staff-web/server/db/forms-schema.ts`** — the forked `forms` + `responses`
   Drizzle tables (copy from `templates/forms/server/db/schema.ts`), adapted to staff-web's
   `table`/`text`/`integer` import style. Drop `ownableColumns()` and `createSharesTable()` (the
   pilot forms are single-tenant like the rest of the gym schema; add a `guard:allow-unscoped`
   marker comment explaining single-tenant). Re-export these from `apps/staff-web/server/db/schema.ts`
   by adding `export * from "./forms-schema.js";` at the end of schema.ts so `schema.forms` and
   `schema.responses` resolve through the existing `getDb()`/`schema` barrel.

Run `pnpm --filter @gymos/staff-web typecheck` after.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/features/forms/FORMS.md` exists and contains the string `lead:submitted`
    - `apps/staff-web/features/forms/types.ts` exists and exports `FormField`
    - `apps/staff-web/features/forms/lib/validate-fields.ts` exists
    - `apps/staff-web/features/forms/lib/public-form-ssr.ts` exists; contains `safeRedirectUrl`, `sanitizeHexColor`, `sanitizeIntPx`, `lead:submitted`, `gymos:resize`
    - public-form-ssr.ts does NOT contain `agent-native-feedback-submitted` or `Built with Agent Native`
    - `apps/staff-web/server/db/forms-schema.ts` exists and exports `forms` and `responses` tables
    - `apps/staff-web/server/db/schema.ts` contains `export * from "./forms-schema` 
    - `templates/forms/` is unmodified (git status shows no changes under templates/forms/)
    - `pnpm --filter @gymos/staff-web typecheck` exits 0
  </acceptance_criteria>
  <done>
The forms feature slice is forked into staff-web, the forked forms/responses tables resolve
through the schema barrel, and the SSR renderer emits gym-branded postMessage events.
  </done>
</task>

<task type="tdd">
  <name>Task 2: Lead-upsert submission handler + UK phone normaliser + per-IP rate limit</name>
  <files>apps/staff-web/features/forms/handlers/submissions.ts, apps/staff-web/features/forms/lib/normalize-phone.ts, apps/staff-web/features/forms/lib/rate-limit.ts, apps/staff-web/server/routes/api/submit/[id].post.ts, apps/staff-web/server/routes/api/forms/public/[...slug].get.ts, apps/staff-web/server/routes/f/[...slug].get.ts</files>
  <behavior>
    - normalizePhone('07721 123456') === '+447721123456'
    - normalizePhone('447721123456') === '+447721123456'
    - normalizePhone('+44 7721 123456') === '+447721123456'
    - normalizePhone('garbage') === null
    - submitLeadForm with a honeypot (_hp non-empty) returns { success: true, id: "" } and writes NO rows
    - submitLeadForm with valid name+email+phone: gym_members upserted (1 row), conversations upserted with status='lead' (1 row), form_submissions row written
    - submitLeadForm called twice with same email: still 1 member, 1 conversation (idempotent via ON CONFLICT)
    - submitLeadForm called twice with same EXISTING email: the conversations insert references the EXISTING member id (the upsert hit an existing row), NOT the freshly-generated nanoid — i.e. no FK mismatch
    - rate limiter: the 61st call within the 15-minute window from one IP key returns a 429-signalling result; a call from a different IP key is not throttled
  </behavior>
  <read_first>
    - templates/forms/server/handlers/submissions.ts — copy the ENTIRE pre-persistence pipeline verbatim (honeypot _hp, time _t with MIN_FILL_TIME_MS=500, MAX_PAYLOAD_BYTES, per-field MAX_FIELD_LENGTH, conditional-visibility isFieldVisible, required-field validation, field-id whitelist, captcha via verifyCaptcha). Only the tail (the `db.insert(schema.responses)` + appStatePut + fireIntegrations block) is replaced.
    - apps/staff-web/server/db/schema.ts — gymMembers / conversations / messages / formSubmissions column names + the messageType enum (NO 'form_submission' value — use 'text')
    - apps/staff-web/server/db/forms-schema.ts (from Task 1) — the forks `forms` table (load published form by id)
    - .planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md §"Pattern 2" (the exact upsert SQL) + §"Code Examples" lead-upsert outline + Pitfall 8 (phone normalisation) + the rate-limit recommendation (~60 req / 15 min / IP)
    - .planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md Decision 2 — "rate-limit + lightweight bot protection" is LOCKED
    - templates/forms/server/routes/api/submit/[id].post.ts + templates/forms/server/routes/api/forms/public/[...slug].get.ts + templates/forms/server/routes/[...page].get.ts — the route-wiring shapes to mirror
    - services/worker/src/domain/sendMessage.ts — the `db.execute(sql`...`)` raw-SQL pattern for ON CONFLICT against Neon Postgres
  </read_first>
  <action>
RED→GREEN: write the colocated tests for normalize-phone + rate-limit FIRST (they must fail
against an empty/missing implementation), then implement to green.

1. **Create `apps/staff-web/features/forms/lib/normalize-phone.ts`** (RESEARCH Pitfall 8):
```typescript
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\s/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("07")) return "+44" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("447")) return "+" + digits;
  if (digits.length === 10 && digits.startsWith("7")) return "+44" + digits;
  return null; // can't normalise — store null, email-only lead
}
```
   (Note: a UK mobile `07721123456` is 11 digits; adjusted from the research's 10-digit sketch.)
   Add a colocated test `normalize-phone.test.ts` next to it covering the behavior cases above
   (vitest — `apps/staff-web` already has a vitest setup per other tests).

2. **Create `apps/staff-web/features/forms/lib/rate-limit.ts`** — a per-IP in-memory sliding/fixed
   window limiter (Decision 2 LOCKS "rate-limit + lightweight bot protection"; the honeypot covers
   bots, this covers flooding). RESEARCH recommends ~60 req / 15 min / IP. Example:
```typescript
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_HITS = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

/** Returns true if the request is ALLOWED, false if the IP has exceeded the window. */
export function checkRateLimit(ipKey: string, now = Date.now()): boolean {
  if (!ipKey) return true; // unknown IP → don't hard-block (fail open)
  const entry = hits.get(ipKey);
  if (!entry || now >= entry.resetAt) {
    hits.set(ipKey, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_HITS) return false;
  entry.count += 1;
  return true;
}
```
   Add a colocated test `rate-limit.test.ts`: the 61st call within the window returns false; a
   different IP key returns true; advancing `now` past `resetAt` resets the window.
   **CAVEAT (note in FORMS.md + the SUMMARY):** Vercel serverless may not retain this in-memory
   `Map` across function invocations (each cold start is a fresh module), so this is best-effort
   flood protection for the pilot. If flooding materialises, upgrade to **Vercel KV** (a shared
   store) as the durable rate-limit backend. Staff-web currently runs on Fly (single always-on
   machine) per STATE.md, where the in-memory Map IS effective — the Vercel caveat applies only if
   the app is moved to Vercel serverless functions.

3. **Create `apps/staff-web/features/forms/handlers/submissions.ts`** — export `submitLeadForm`.
   Copy the upstream pre-persistence pipeline verbatim from `templates/forms/server/handlers/submissions.ts`
   (steps load-form → honeypot → time-check → captcha → field-whitelist → required-field validation).
   **Before** the pipeline runs, enforce the rate limit: derive the IP key from the request
   (`x-forwarded-for` first hop, else the socket remote address) and call `checkRateLimit(ipKey)`;
   if it returns false, return HTTP 429 (`setResponseStatus(event, 429)` and return
   `{ success: false, error: "rate_limited" }`) BEFORE touching the DB.
   Replace the persistence tail with:
   - Extract `email` and `phone` from `data` by matching the form's field definitions: a field of
     `type === "email"` provides email; a field whose `type` is `text`/`tel` and whose `label`
     (lowercased) includes "phone"/"mobile"/"tel" provides phone. Also accept a field labelled
     "name"/"first name" for `firstName` (default `"Lead"` if none).
   - `const phoneE164 = phone ? normalizePhone(phone) : null;`
   - Upsert the member (raw SQL via `db.execute(sql`...`)` per the worker pattern), THEN re-select
     the canonical id by the natural key used. **The re-select MUST be inside this code block** —
     the upsert may have hit an EXISTING row whose id != the freshly-generated `memberId`, so the
     conversation/form_submissions inserts MUST use the re-selected `resolvedMemberId`, never the
     raw `nanoid()`. Use email as the conflict target when present, else phone:
     ```typescript
     // guard:allow-unscoped — gym domain tables are single-tenant; lead upsert by natural key.
     const memberId = nanoid();
     let resolvedMemberId = memberId;
     if (email) {
       await db.execute(sql`
         INSERT INTO gym_members (id, first_name, last_name, email, phone_e164, marketing_consent, created_at, updated_at)
         VALUES (${memberId}, ${firstName}, ${lastName ?? null}, ${email}, ${phoneE164}, false, NOW(), NOW())
         ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET
           first_name = EXCLUDED.first_name,
           phone_e164 = COALESCE(EXCLUDED.phone_e164, gym_members.phone_e164),
           updated_at = NOW()
       `);
       // Re-select the canonical id — the upsert may have updated an EXISTING row (id != memberId).
       const { rows: [existing] } = await db.execute(
         sql`SELECT id FROM gym_members WHERE email = ${email} LIMIT 1`
       );
       resolvedMemberId = (existing?.id as string | undefined) ?? memberId;
     } else if (phoneE164) {
       await db.execute(sql`
         INSERT INTO gym_members (id, first_name, phone_e164, marketing_consent, created_at, updated_at)
         VALUES (${memberId}, ${firstName}, ${phoneE164}, false, NOW(), NOW())
         ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO UPDATE SET
           first_name = EXCLUDED.first_name, updated_at = NOW()
       `);
       // Re-select the canonical id — the upsert may have updated an EXISTING row (id != memberId).
       const { rows: [existing] } = await db.execute(
         sql`SELECT id FROM gym_members WHERE phone_e164 = ${phoneE164} LIMIT 1`
       );
       resolvedMemberId = (existing?.id as string | undefined) ?? memberId;
     }
     ```
     (Adjust the `db.execute` result-shape destructuring — `.rows` vs array — to match the live
     Neon driver return type the worker's sendMessage.ts uses; the LOAD-BEARING requirement is that
     `resolvedMemberId` is the natural-key re-select, not the raw nanoid.)
   - Upsert the conversation (status='lead', only resurrect from 'closed'), then re-select its id:
     ```typescript
     const convId = nanoid();
     await db.execute(sql`
       INSERT INTO conversations (id, member_id, channel, status, created_at, updated_at)
       VALUES (${convId}, ${resolvedMemberId}, 'whatsapp', 'lead', NOW(), NOW())
       ON CONFLICT (member_id, channel) DO UPDATE SET
         status = CASE WHEN conversations.status = 'closed' THEN 'lead' ELSE conversations.status END,
         updated_at = NOW()
     `);
     // Re-select the canonical conversation id by (member_id, channel).
     const { rows: [conv] } = await db.execute(
       sql`SELECT id FROM conversations WHERE member_id = ${resolvedMemberId} AND channel = 'whatsapp' LIMIT 1`
     );
     const resolvedConvId = (conv?.id as string | undefined) ?? convId;
     ```
   - Insert a `messages` row so the coach sees the lead context: direction='in',
     messageType='text' (NOT a new enum value), status='delivered',
     body=`New lead via form "${form.title}": ${summarised field values}`,
     payload=JSON.stringify({ kind: 'form_submission', formId: id, data }). Use `resolvedConvId`.
   - Insert a `form_submissions` row (id=responseId=nanoid(), formId=id, memberId=resolvedMemberId,
     conversationId=resolvedConvId, data=JSON.stringify(data), ip, submitterEmail=email).
   - Also insert into `responses` (the forks table) so the builder's responses view works — same
     as upstream, keyed on formId.
   - **Remove** the upstream `appStatePut` call and the `fireIntegrations` call (per RESEARCH
     §"State of the Art" deprecations — the conversations row IS the notification).
   - Return `{ success: true, id: responseId }`.
   - Do NOT wrap in `runWithRequestContext` (RESEARCH anti-pattern — endpoint is anonymous).

4. **Wire the public routes** (mirror upstream route shapes):
   - `apps/staff-web/server/routes/api/submit/[id].post.ts`:
     `export { submitLeadForm as default } from "../../../../features/forms/handlers/submissions.js";`
   - `apps/staff-web/server/routes/api/forms/public/[...slug].get.ts`: copy the upstream public
     form GET handler (returns the published form's fields/settings JSON for the client renderer).
   - `apps/staff-web/server/routes/f/[...slug].get.ts`: copy the upstream `[...page].get.ts` shape
     but route ONLY `/f/` to `renderPublicForm` (from the forked public-form-ssr.ts). Since
     staff-web already has its own SSR handler for the React app, this resource route must handle
     `/f/*` specifically and NOT intercept the main app catch-all — place it at the explicit
     `server/routes/f/[...slug].get.ts` path so Nitro routes `/f/*` here directly.

Run `pnpm --filter @gymos/staff-web test -- normalize-phone rate-limit` then `pnpm --filter @gymos/staff-web typecheck`.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm test -- normalize-phone rate-limit && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/features/forms/lib/normalize-phone.ts` exists; exports `normalizePhone`; contains `+44`
    - `apps/staff-web/features/forms/lib/normalize-phone.test.ts` exists with the 5 behavior cases; the test run passes
    - `apps/staff-web/features/forms/lib/rate-limit.ts` exists; exports `checkRateLimit`; contains the window/max constants (15 min / 60)
    - `apps/staff-web/features/forms/lib/rate-limit.test.ts` exists; the 61st-call-returns-false and different-IP-allowed cases pass
    - `apps/staff-web/features/forms/handlers/submissions.ts` exists; exports `submitLeadForm`
    - submissions.ts calls `checkRateLimit` and returns/sets HTTP `429` when the limit is exceeded, BEFORE any DB write
    - submissions.ts contains literal `'lead'` (the conversation status) and `ON CONFLICT (member_id, channel)`
    - submissions.ts contains `ON CONFLICT (email)` AND `ON CONFLICT (phone_e164)`
    - submissions.ts re-selects the canonical member id after EACH upsert: grep finds `SELECT id FROM gym_members WHERE email` AND `SELECT id FROM gym_members WHERE phone_e164` (both re-selects present, not just narrated)
    - submissions.ts uses a `resolvedMemberId` variable for the conversations + form_submissions inserts (NOT the raw `nanoid()` memberId)
    - submissions.ts re-selects the conversation id (`SELECT id FROM conversations WHERE member_id`) and uses `resolvedConvId` for the messages + form_submissions inserts
    - submissions.ts contains the honeypot check `_hp` and the time check `_t` (copied from upstream)
    - submissions.ts contains a `guard:allow-unscoped` marker comment
    - submissions.ts does NOT contain `appStatePut` or `fireIntegrations` or `runWithRequestContext`
    - submissions.ts uses `messageType: "text"` (NOT a `'form_submission'` enum value)
    - `apps/staff-web/server/routes/api/submit/[id].post.ts` re-exports `submitLeadForm`
    - `apps/staff-web/server/routes/f/[...slug].get.ts` calls `renderPublicForm`
    - `pnpm --filter @gymos/staff-web typecheck` exits 0
  </acceptance_criteria>
  <done>
POST /api/submit/:id upserts a member + a status='lead' conversation + writes form_submissions
and a messages note; duplicate submissions are idempotent and re-select the canonical existing
member/conversation ids (no FK mismatch); UK phones are E.164-normalised; the honeypot silently
drops bots; per-IP flooding (>60/15min) is rejected with 429.
  </done>
</task>

<task type="auto">
  <name>Task 3: CORS middleware + auth publicPaths (owns the plumbing for all P1c public routes)</name>
  <files>apps/staff-web/server/middleware/00-public-cors.ts, apps/staff-web/server/plugins/auth.ts</files>
  <read_first>
    - templates/forms/server/middleware/00-public-cors.ts — copy the H3 CORS structure verbatim; extend PUBLIC_EMBED_PREFIXES
    - apps/staff-web/server/plugins/auth.ts — the EXISTING publicPaths array (currently /api/m, /pick-member, /webhooks/whatsapp, /access-denied) AND the allowlistHandler skip list (the if-block that early-returns for framework/public paths). BOTH must be extended.
    - .planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md §"Pattern 3" (CORS load-order) + §"Code Examples" auth.ts + CORS extensions + Pitfall 4 (CORS must run before auth)
    - .planning/STATE.md §Decisions P1b.1-02 — the allowlistHandler is a SEPARATE middleware that repeats the skip list; new public prefixes must be added to BOTH the createAuthPlugin publicPaths AND the allowlistHandler skip if-block
  </read_first>
  <action>
1. **Create `apps/staff-web/server/middleware/00-public-cors.ts`** — copy the upstream file
   verbatim, but extend `PUBLIC_EMBED_PREFIXES` to cover every P1c public route:
```typescript
const PUBLIC_EMBED_PREFIXES = [
  "/api/forms/public/",
  "/api/submit/",
  "/f/",          // public SSR form pages
  "/embed.js",    // embed snippet (P1c-06)
  "/embed/",      // schedule widget (P1c-05)
];
```
   Keep the `00-` prefix (RESEARCH Pitfall 4 — must run before auth.ts). Keep the OPTIONS→204
   short-circuit and the `Access-Control-Allow-Origin: *` / Methods / Headers exactly as upstream.

2. **Extend `apps/staff-web/server/plugins/auth.ts`** — TWO additive edits:
   a. Add the new paths to the `createAuthPlugin({ publicPaths: [...] })` array (do NOT replace
      the existing entries):
```typescript
  publicPaths: [
    "/api/m",
    "/pick-member",
    "/webhooks/whatsapp",
    "/access-denied",
    // P1c additions — public marketing-site integrations:
    "/f",                 // public SSR form pages
    "/api/forms/public",  // public form GET
    "/api/submit",        // public form POST (anonymous lead upsert)
    "/embed",             // /embed/schedule (P1c-05) and /embed.js (P1c-06)
  ],
```
   b. Extend the `allowlistHandler` skip if-block so the email allowlist never intercepts these
      public routes (it currently skips /api/m, /pick-member, /webhooks/, /access-denied, etc.).
      Add these `pathname.startsWith(...)` conditions to the existing `if (...) return;`:
```typescript
    pathname.startsWith("/f/") ||
    pathname.startsWith("/api/forms/public") ||
    pathname.startsWith("/api/submit") ||
    pathname.startsWith("/embed") ||
```
      (Note: the existing skip block already early-returns on `pathname.includes(".")`, which would
      catch `/embed.js` — but add `/embed` explicitly for clarity and to cover `/embed/schedule`.)

Run `pnpm --filter @gymos/staff-web typecheck`.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/server/middleware/00-public-cors.ts` exists; filename starts with `00-`
    - PUBLIC_EMBED_PREFIXES contains all of: `/api/forms/public/`, `/api/submit/`, `/f/`, `/embed.js`, `/embed/`
    - File contains `Access-Control-Allow-Origin` and the OPTIONS `204` short-circuit
    - `apps/staff-web/server/plugins/auth.ts` publicPaths array contains literal `"/f"`, `"/api/forms/public"`, `"/api/submit"`, `"/embed"`
    - auth.ts publicPaths STILL contains the pre-existing `"/api/m"`, `"/pick-member"`, `"/webhooks/whatsapp"`, `"/access-denied"` (nothing removed)
    - auth.ts allowlistHandler skip block contains `pathname.startsWith("/api/submit")` and `pathname.startsWith("/embed")`
    - `pnpm --filter @gymos/staff-web typecheck` exits 0
  </acceptance_criteria>
  <done>
OPTIONS preflight on /api/submit/:id returns 204 before the auth guard; /f/:slug, /api/submit,
/api/forms/public, and /embed/* are reachable without a staff session and are not intercepted
by the email allowlist.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Verify a public submission lands as a lead in /gymos</name>
  <what-built>
The forked forms feature, the lead-upsert handler, the public SSR + submit routes, the CORS
middleware, and the auth publicPaths extension. This checkpoint runs the dev server and walks
a real public submission end-to-end (the dev-server boot is required because route mounting and
CORS ordering only manifest at runtime).
  </what-built>
  <how-to-verify>
1. Boot the staff-web dev server: `pnpm --filter @gymos/staff-web dev` (serves :8081).
2. **CORS preflight** (Pitfall 4 — must be 204, not 302):
   `curl -i -X OPTIONS -H "Origin: https://doyouhustle.co.uk" http://localhost:8081/api/submit/test`
   Expect: `HTTP/1.1 204` and an `Access-Control-Allow-Origin: *` header. (NOT a 302 to login.)
3. **Public form page** loads without auth: open `http://localhost:8081/f/<slug-of-a-published-form>`
   in a private window. (If no form is published yet, create one via P1c-04, OR temporarily
   insert a published form row via Neon MCP for this test.) Expect a styled standalone HTML form,
   no login redirect.
4. **Submit a lead** from that form (fill name + email + phone like `07721 123456`, submit).
   Then verify in Neon MCP:
   ```sql
   SELECT id, status FROM conversations WHERE status = 'lead' ORDER BY created_at DESC LIMIT 1;
   SELECT first_name, email, phone_e164 FROM gym_members ORDER BY created_at DESC LIMIT 1;
   SELECT form_id, member_id, conversation_id FROM form_submissions ORDER BY submitted_at DESC LIMIT 1;
   ```
   Expect: a conversation with status='lead', a gym_members row with `phone_e164 = '+447721123456'`,
   and a form_submissions row linking them.
5. **Submit the SAME email twice** — re-run step 4 with the same email. Confirm the member count
   and lead-conversation count did NOT increase (idempotent upsert), AND the form_submissions
   `member_id`/`conversation_id` of the second submission point at the SAME ids as the first
   (the re-select bound to the existing member, no FK mismatch / orphan id).
6. Open `http://localhost:8081/gymos` and confirm the lead conversation appears in the inbox list.

Confirm all six checks pass, or describe failures.
  </how-to-verify>
  <resume-signal>Type "leads working" once the lead lands in /gymos and the upsert is idempotent, or describe the failure.</resume-signal>
</task>

</tasks>

<verification>
- normalize-phone unit tests pass
- rate-limit unit tests pass (429 after 60/15min/IP)
- typecheck passes
- OPTIONS preflight on /api/submit returns 204 (CORS before auth)
- /f/:slug serves a public form with no auth
- A real submission creates a member + status='lead' conversation + form_submissions row
- Duplicate submissions are idempotent and re-bind to the existing member id
- Lead appears in /gymos
</verification>

<success_criteria>
1. Forms template forked into apps/staff-web/features/forms/ (templates/forms/ untouched)
2. Public form submission upserts gym_members + status='lead' conversation (FORMS-03)
3. CORS + auth plumbing live for all P1c public routes (no downstream plan touches auth.ts)
4. UK phone numbers normalised to E.164 so WhatsApp follow-up matches
5. Per-IP flooding rejected with 429 (Decision 2 rate-limit + bot protection)
</success_criteria>

<output>
After completion, create `.planning/phases/P1c-public-site-integrations/P1c-02-forms-fork-lead-submission-SUMMARY.md` documenting:
- Which upstream files were copied vs adapted (and what was stripped — sharing? integrations?)
- The exact ON CONFLICT targets used and whether raw SQL or onConflictDo* was used
- How the canonical member/conversation ids are re-selected after each upsert (the FK-safety fix)
- The rate-limit window/max chosen + the Vercel-KV upgrade caveat (in-memory Map not durable on Vercel serverless)
- Confirmation templates/forms/ is unmodified (fork boundary preserved)
- The messageType value used for the lead note (should be 'text', not a new enum value)
- Whether the f/:slug route required special Nitro routing to avoid the app catch-all
</output>
