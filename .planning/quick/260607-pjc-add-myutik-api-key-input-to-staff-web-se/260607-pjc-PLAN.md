---
phase: quick-260607-pjc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/server/register-secrets.ts
autonomous: true
requirements: [MYUTIK-KEY-UI]
must_haves:
  truths:
    - "Settings → API Keys panel (gear button on the AI input section) shows a 'MYÜTIK API Key' input with a working Save button"
    - "Saving the MYÜTIK key writes an encrypted app_secrets row under key MYUTIK_API_KEY"
  artifacts:
    - path: "apps/staff-web/server/register-secrets.ts"
      provides: "registerRequiredSecret({ key: 'MYUTIK_API_KEY', ... }) call surfacing the input in Settings → API Keys"
      contains: "MYUTIK_API_KEY"
  key_links:
    - from: "apps/staff-web/server/register-secrets.ts"
      to: "Settings → API Keys panel"
      via: "registerRequiredSecret side-effect at boot (imported from server/plugins/agent-chat.ts)"
      pattern: "registerRequiredSecret\\(\\{[\\s\\S]*?MYUTIK_API_KEY"
---

<objective>
Add a MYÜTIK API key input to the staff-web Settings → API Keys panel (opened by the gear button on the AI input section).

Purpose: Surface the MYÜTIK relay credential in the in-app Settings UI so the customer can paste and rotate it from the staff-web surface — matching how the existing WhatsApp Cloud API credentials are exposed.

Output: One additional `registerRequiredSecret()` call in `apps/staff-web/server/register-secrets.ts`. Purely additive input registration — NO worker wiring, NO secrets.ts helper, NO new route.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/staff-web/server/register-secrets.ts

<interfaces>
<!-- registerRequiredSecret call shape — extracted from the file being edited. -->
<!-- The new block must match the EXISTING formatting/indentation exactly. -->

The WHATSAPP_PHONE_NUMBER_ID block is the closest template — it omits the
`validator` field (no GET validation endpoint, avoids false rejections):

```ts
registerRequiredSecret({
  key: "WHATSAPP_PHONE_NUMBER_ID",
  label: "WhatsApp Phone Number ID",
  description:
    "Meta WhatsApp phone number ID — the FROM number for outbound. Find at Meta Business → WhatsApp → API Setup. Also set via `fly secrets set` on the Fly worker.",
  docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
  scope: "user",
  kind: "api-key",
  required: true,
});
```

Existing comment-header style (use the same `// ─── … ───` rule style):
```ts
// ─── WhatsApp Cloud API ──────────────────────────────────────────────────────
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Register MYUTIK_API_KEY in Settings → API Keys</name>
  <files>apps/staff-web/server/register-secrets.ts</files>
  <action>
    Add ONE `registerRequiredSecret()` call to `apps/staff-web/server/register-secrets.ts`.

    PLACEMENT: Insert a new section directly AFTER the WhatsApp Cloud API block
    (after the closing of the WHATSAPP_VERIFY_TOKEN registration on line ~144),
    and BEFORE the `// WHATSAPP_BUSINESS_ACCOUNT_ID — optional …` comment block
    (currently line ~146). This keeps the new block in a logically grouped
    position with its own header.

    Open with a section header matching the EXISTING comment-header style
    (a `// ─── … ───` rule that extends to roughly the same column as the
    other headers in the file):

        // ─── MYÜTIK relay ────────────────────────────────────────────────────────────

    Then the registration block — EXACT field values, matching the existing
    2-space indentation and trailing-comma style:

      key: "MYUTIK_API_KEY"
      label: "MYÜTIK API Key"
      description: a multi-line string (matching the existing `description:`
        continuation indentation — value starts on the next line, indented 4
        spaces) that explains: it is the MYÜTIK API key (with whatsapp:send
        permission) used to send WhatsApp replies / campaigns from GymClassOS
        via the MYÜTIK relay (POST https://myutik.com/api/channels/whatsapp/send),
        sending from phoneNumberId 302631896256150; and — like the existing
        WhatsApp entries — note that the worker / edge-webhooks handlers may
        still need the matching `fly secrets set` until they read from
        app_secrets.
      docsUrl: "https://myutik.com"
      scope: "user"
      kind: "api-key"
      required: true

    NO `validator` field — MYÜTIK has no documented validation GET endpoint;
    match the WHATSAPP_PHONE_NUMBER_ID entry which omits the validator to avoid
    false rejections.

    Use the literal characters Ü (in "MYÜTIK") exactly as written. Do not add
    any other registration, helper, import, or route. The single existing
    `import { registerRequiredSecret } from "@agent-native/core/secrets";` at
    the top already covers this call.

    After editing, run `npx prettier --write apps/staff-web/server/register-secrets.ts`
    per the root AGENTS.md Prettier convention (it may reflow the header-rule
    comment length — that is fine).
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('apps/staff-web/server/register-secrets.ts','utf8'); const ok = s.includes('MYUTIK_API_KEY') && s.includes('MYÜTIK API Key') && s.includes('302631896256150') && s.includes('myutik.com/api/channels/whatsapp/send') && /MYUTIK relay/.test(s) && !/MYUTIK_API_KEY[\s\S]*?validator/.test(s.slice(s.indexOf('MYUTIK relay'))); if(!ok){console.error('FAIL: MYUTIK block missing required fields or contains a validator'); process.exit(1);} console.log('OK');"</automated>
  </verify>
  <done>
    `register-secrets.ts` contains a `// ─── MYÜTIK relay ───` section header
    followed by a `registerRequiredSecret({ key: "MYUTIK_API_KEY", label:
    "MYÜTIK API Key", … })` block placed after the WhatsApp Cloud API section and
    before the WHATSAPP_BUSINESS_ACCOUNT_ID comment. The block includes docsUrl
    "https://myutik.com", scope "user", kind "api-key", required true, a
    description mentioning the relay endpoint and phoneNumberId 302631896256150,
    and NO validator field. Prettier reports the file formatted.
  </done>
</task>

</tasks>

<verification>
- `apps/staff-web/server/register-secrets.ts` parses (Prettier formats it without error).
- Exactly ONE new `registerRequiredSecret` call was added (the MYÜTIK one); the
  five existing registrations (ANTHROPIC, WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN) are
  unchanged.
- The MYÜTIK block has no `validator` field.
- No new imports, helpers, routes, or worker/edge-webhooks changes.
</verification>

<success_criteria>
- Settings → API Keys (gear button on the AI input section) renders a "MYÜTIK API Key" input backed by key `MYUTIK_API_KEY` with a working Save button.
- The registration is additive — no other file changed, no behavior altered for existing keys.
</success_criteria>

<output>
After completion, create `.planning/quick/260607-pjc-add-myutik-api-key-input-to-staff-web-se/260607-pjc-SUMMARY.md`
</output>
