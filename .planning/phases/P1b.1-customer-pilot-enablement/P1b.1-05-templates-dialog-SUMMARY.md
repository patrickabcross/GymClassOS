---
phase: P1b.1-customer-pilot-enablement
plan: 05
subsystem: staff-web / WhatsApp outbound
tags: [whatsapp, templates, shadcn-dialog, worker-chokepoint, ui]
requirements: [WA-05, WA-06, WA-07, WA-08]
requires:
  - whatsapp_templates seeded with hello_world (status='approved') — Plan P1b.1-04
  - enqueueOutboundWhatsApp + worker sendMessage chokepoint — Phase P1b
  - shadcn Dialog/Tooltip/ScrollArea/Badge/Separator/Input/Button already installed
provides:
  - "/gymos reply form: Templates button opens picker dialog beside Send"
  - "/gymos action: _intent='send-template' branch (optimistic insert + enqueue)"
  - "/gymos loader: templates[] fan-out for the dialog"
  - "Reusable TemplatesDialog component (~348 LOC) — left list / right preview-form / footer split"
affects:
  - Inbox reply form button row (one new outline button between Input and Send)
  - Out-of-window placeholder copy ("(P2)" debug suffix removed)
tech-stack:
  added:
    - "@tabler/icons-react IconTemplate (already installed; first use in gymos surfaces)"
  patterns:
    - "useFetcher + action: 'post' with target action='/gymos' so dialog can fire from inside the reply Form without nesting"
    - "Optimistic toast + dialog close BEFORE the fetcher.submit promise settles (CLAUDE.md no-spinner-after-click rule)"
    - "Discriminated _intent on the action — clean replacement for splitting into a second route"
key-files:
  created:
    - apps/staff-web/app/components/gymos/TemplatesDialog.tsx
  modified:
    - apps/staff-web/app/routes/gymos._index.tsx
decisions:
  - "Path alias = @/ not ~/ (plan said ~/; tsconfig only has @/* — used @/ to keep typecheck green)"
  - "Worker's sendTemplate handles vars:{} natively via Object.values({})=[]; no extra guard in action handler (Pitfall 3 resolved)"
  - "fetcher.submit explicitly targets action='/gymos' so the dialog can sit inside the existing reply <Form> without action collision"
  - "Optimistic toast fires immediately on Send click (CLAUDE.md mandate); worker errors will surface via the existing failedCopy() bubble on next loader re-fetch"
metrics:
  duration_minutes: 6
  tasks_completed: 2
  files_changed: 2
  lines_added: 451
  commits:
    - "02af7dfd feat(P1b.1-05): wire templates loader + send-template action in /gymos"
    - "f1e91674 feat(P1b.1-05): add TemplatesDialog picker component"
  completed_date: 2026-05-25
---

# Phase P1b.1 Plan 05: Templates Dialog Summary

One-liner: Shipped a shadcn Dialog template picker beside the Send button in /gymos that enqueues `payload.type='template'` jobs through the existing worker chokepoint — completing the last UI piece blocking real outbound WhatsApp on pilot day.

## What Was Built

**Task 1 — Loader + action wiring** (`apps/staff-web/app/routes/gymos._index.tsx`)

1. **Loader** (lines 137-150): Added `whatsapp_templates` fan-out — selects `name`, `status`, `category`, `language`, `componentsJson` ordered by name. Returned on the loader payload at `templates`.

2. **Action** (lines 273-369): Discriminated on `_intent` form field (defaults to `"send-text"` for backwards compat). New `send-template` branch (lines 305-358):
   - Parses `templateName` + `vars` (JSON-stringified map) from FormData.
   - Same optimistic insert as send-text but with `messageType: "template"`, body=`"[template: <name>]"` placeholder, `payload` column=JSON of `{name, vars}`.
   - Calls `enqueueOutboundWhatsApp` with `payload: { type: "template", name, vars, language: "en_US" }`.
   - Returns the same `redirect(/gymos?conversation=...&sent=1)` for loader-refresh consistency.

3. **JSX placement** (lines 637-641): `<TemplatesDialog>` mounted inside the reply Form's button row between `<Input>` and `<Button type="submit">`. The component is its own DialogTrigger, so the trigger button is visually inline with Send.

4. **Copy fix** (line 631): `"Out of 24h window — use a template (P2)"` → `"Out of 24h window — use a template"`. Verbatim per UI-SPEC.

5. **Header comment** (lines 22-26): Added WA-06 and WA-08 to the requirements-covered list with explanation of the template path.

**Task 2 — TemplatesDialog component** (`apps/staff-web/app/components/gymos/TemplatesDialog.tsx`, 348 LOC)

Single-file picker: trigger button (`Templates` + IconTemplate), then `<Dialog>` with:

- **Header** — title `"Send a template"`, subtitle `"Approved WhatsApp message templates"`
- **Left pane (200px)** — `ScrollArea` of all templates. Approved → selectable `Badge` "Approved" + `bg-accent` highlight on selection. Pending → `opacity-50 cursor-not-allowed` + `Badge` "Awaiting approval" + `Tooltip` "Awaiting Meta approval — submit templates via your Meta Business Manager"
- **Right pane** — `text-sm font-semibold` template name, then per-`{{N}}` Input rows (label "Variable N" + inline "Required" `text-destructive` on empty), `Separator`, "Preview" uppercase label, live-substituted preview block `bg-muted/40 rounded p-3`. Empty state: `"Select a template from the list"`. Out-of-opt-in inline: `"Member hasn't opted in to WhatsApp messages"`.
- **Footer** — `Discard draft` (variant=ghost, closes + clears state) and `Send template` (disabled until selected + approved + all vars filled + hasOptIn).

On Send: builds FormData with `_intent=send-template`, `conversationId`, `templateName`, `vars=JSON.stringify(...)` → `fetcher.submit(fd, { method: "post", action: "/gymos" })` → `toast.success("Template queued")` → closes dialog → resets state. All synchronous-feeling (CLAUDE.md no-spinner-after-click).

## Pitfall 3 Resolution — `vars: {}` for hello_world

Read `services/worker/src/domain/sendMessage.ts` lines 105-122 and `packages/whatsapp/src/sdk-impl.ts` lines 43-67. The flow:

1. `sendMessage()` passes `payload.vars` straight to `sendTemplate({ vars: payload.vars, ... })`.
2. `sendTemplate()` runs `Object.values(validated.vars).map(...)`. For `vars = {}`, `Object.values({})` returns `[]`, so `components: []` is passed to Meta.
3. Meta's WhatsApp Cloud API accepts an empty `components` array for templates with no `{{N}}` placeholders — that's exactly hello_world's shape.

**No guard needed in the action handler.** hello_world flows through `vars: {}` cleanly. Documented this in the action's inline comment (lines 339-343).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Path alias `~/` → `@/`**
- **Found during:** Task 2 first typecheck
- **Issue:** Plan specified `import ... from "~/components/..."`. `apps/staff-web/tsconfig.json` only configures `@/*` → `./app/*`. TS2307 "Cannot find module" on every import.
- **Fix:** Replaced `~/` with `@/` in both TemplatesDialog.tsx (8 imports) and gymos._index.tsx (1 import).
- **Files modified:** apps/staff-web/app/components/gymos/TemplatesDialog.tsx, apps/staff-web/app/routes/gymos._index.tsx
- **Commits:** f1e91674, 02af7dfd

### Notes (not deviations)

- Worker file lives at `services/worker/src/domain/sendMessage.ts`, not `apps/worker/...` as the plan implied. Verified existing reference; no change required.
- The acceptance criterion "imports `TemplatesDialog` from `~/components/gymos/TemplatesDialog`" technically fails (we use `@/`) — but that bullet contradicts the parallel criterion "typecheck exits with code 0". Resolved per CLAUDE.md (project conventions override plan instructions).

## Verification

**Automated:**
- `pnpm --filter @gymos/staff-web typecheck` → exits 0 (both tasks)
- `node scripts/guard-no-whatsapp-in-staff-web.mjs` → `[guard] OK: apps/staff-web does not import @gymos/whatsapp` (WA-05 chokepoint preserved)

**File-level acceptance criteria (gymos._index.tsx):**
- ✅ Loader references `schema.whatsappTemplates` (line 143)
- ✅ Loader returns `templates` field (line 263)
- ✅ Action contains literal `"send-template"` (lines 299, 305)
- ✅ Action contains literal `type: "template"` (line 352)
- ✅ Existing send-text branch preserved (lines 371-405)
- ✅ Imports `TemplatesDialog` (line 47)
- ✅ JSX `<TemplatesDialog` element in reply form button row (line 637)
- ✅ `"(P2)"` substring removed
- ✅ Contains literal `"Out of 24h window — use a template"` (line 631, em-dash)

**File-level acceptance criteria (TemplatesDialog.tsx):**
- ✅ File exists, 348 lines (≥150 required)
- ✅ `export function TemplatesDialog` (line 105)
- ✅ Imports Dialog/DialogContent/DialogHeader/DialogTitle/DialogTrigger from shadcn dialog
- ✅ Imports IconTemplate from @tabler/icons-react
- ✅ Imports Badge from shadcn
- ✅ Imports useFetcher from react-router
- ✅ Imports toast from sonner
- ✅ All copywriting strings verbatim (Send a template, Approved WhatsApp message templates, Select a template from the list, Approved, Awaiting approval, Awaiting Meta approval — submit templates via your Meta Business Manager, Discard draft, Send template, Template queued, Member hasn't opted in to WhatsApp messages)
- ✅ Contains `_intent` set to `send-template` via FormData
- ✅ No window.confirm/alert/prompt
- ✅ No emoji as icon (Tabler IconTemplate only)
- ✅ No `graph.facebook.com` reference (WA-05 guard)

## Manual Verification (when dev server boots)

With Mail dev running and `hello_world` seeded as approved:

1. Open `/gymos`, click any conversation with `hasOptIn=true`
2. Click `Templates` button (right of the reply Input) → dialog opens at 640×520
3. Left list shows 5 templates. `hello_world` is selectable; the other four (`class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`) show `Awaiting approval` badge + opacity-50 + tooltip on hover
4. Click `hello_world` → right pane: name header, "This template has no variables.", Preview block with "Hello World" rendered, no opt-in error
5. `Send template` button enabled
6. Click → dialog closes, toast "Template queued" fires, new `messages` row with `status='queued'` + `messageType='template'` lands in DB
7. Worker (when running) picks up the job, calls Meta, status flips to `sent` (or `failed` with typed error)

## Known Stubs

None. All values are real:
- Templates are fetched live from `whatsapp_templates` table
- Variables/preview compute from real `componentsJson` parsed at render time
- Send goes through real `enqueueOutboundWhatsApp` → real worker → real Meta API

## Self-Check: PASSED

- ✅ apps/staff-web/app/components/gymos/TemplatesDialog.tsx exists
- ✅ apps/staff-web/app/routes/gymos._index.tsx contains all required strings + JSX
- ✅ Commit 02af7dfd exists (`git log --oneline -5`)
- ✅ Commit f1e91674 exists (`git log --oneline -5`)
- ✅ typecheck exits 0
- ✅ guard-no-whatsapp passes (WA-05 chokepoint intact)
