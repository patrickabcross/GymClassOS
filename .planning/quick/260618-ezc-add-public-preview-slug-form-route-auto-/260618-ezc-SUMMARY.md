---
phase: quick-260618-ezc
plan: 01
subsystem: forms / whatsapp
tags: [public-form, whatsapp, lead-capture, preview-route]
dependency_graph:
  requires: [P1c-02 form submission handler, P1b-06 worker sendMessage chokepoint, P1b-03 @gymos/queue enqueueOutboundWhatsApp]
  provides: [/preview/{slug} anonymous form route, WhatsApp template auto-reply on lead submit]
  affects: [apps/staff-web/features/forms, apps/staff-web/server/routes, apps/staff-web/server/plugins]
tech_stack:
  added: []
  patterns: [Nitro alias route, env+phone gated auto-reply, ON CONFLICT DO NOTHING opt-in upsert, try/catch lead-safe enqueue]
key_files:
  created:
    - apps/staff-web/server/routes/preview/[...slug].get.ts
  modified:
    - apps/staff-web/features/forms/lib/public-form-ssr.ts
    - apps/staff-web/server/middleware/00-public-cors.ts
    - apps/staff-web/server/plugins/auth.ts
    - apps/staff-web/server/db/schema.ts
    - apps/staff-web/features/forms/handlers/submissions.ts
decisions:
  - "Prefix strip generalized via /^\\/(f|preview)\\// regex — single-source renderer, no code duplication"
  - "Step 14 block wrapped in try/catch so lead capture always succeeds regardless of queue/DB failures"
  - "ON CONFLICT DO NOTHING on whatsapp_opt_in — re-submit never clobbers existing opt-out"
  - "vars = { '1': firstName } — single-variable template contract documented; supplying wrong count breaks MYÜTIK"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-18"
  tasks: 2
  files: 6
---

# Phase quick-260618-ezc Plan 01: Preview Slug + Lead Ack WhatsApp Summary

**One-liner:** `/preview/{slug}` alias route (anonymous + CORS-open) and env+phone gated WhatsApp template auto-reply on lead form submission via worker chokepoint.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Expose public form renderer at /preview/{slug} | `320e8db8` | public-form-ssr.ts, [..slug].get.ts, 00-public-cors.ts, auth.ts |
| 2 | Auto-send WhatsApp template ack on lead submit | `be7f1be9` | schema.ts, submissions.ts |

## What Was Built

### Task 1: /preview/{slug} route

- `public-form-ssr.ts` line 237: regex changed from `/^\/f\//` to `/^\/(f|preview)\//` — same renderer handles both URL shapes
- `server/routes/preview/[...slug].get.ts` created as a one-liner alias of the existing `f/` route (same `../../../` depth, same `renderPublicForm as default` export)
- `00-public-cors.ts`: `"/preview/"` added to `PUBLIC_EMBED_PREFIXES` so cross-origin preflight OPTIONS return 204 before auth runs
- `auth.ts`:
  - `"/preview"` added to `publicPaths` array (beside `"/f"`)
  - `pathname.startsWith("/preview/")` added to `allowlistHandler` skip block (beside `pathname.startsWith("/f/")`)

Demo URL: `https://gym-class-os.vercel.app/preview/schedule-enquiry`

### Task 2: WhatsApp template auto-reply

- `schema.ts`: `whatsappOptIn.source` enum expanded to `["inbound_reply", "manual_admin", "import", "form_submission"]` — TS-level only, no DB migration (column is plain text)
- `submissions.ts`:
  - Import: `enqueueOutboundWhatsApp` from `../../../app/lib/queue-client.js` (via `@gymos/queue` re-export; never direct `@gymos/whatsapp`)
  - Step 14 block gated on `phoneE164 && leadAckTemplate` (both must be truthy):
    1. `INSERT INTO whatsapp_opt_in ... ON CONFLICT (member_id) DO NOTHING`
    2. `INSERT INTO messages` with `direction='out', message_type='template', status='queued'`
    3. `UPDATE conversations SET last_message_preview`
    4. `enqueueOutboundWhatsApp({ messageId, memberId, payload: { type: "template", name, vars, language: "en_US" } })`
  - Whole block in `try/catch` — `console.error` + continue, form response always returns `{ success: true }`

## Typecheck Result

Command: `cd apps/staff-web && npx tsc --noEmit`
Result: **0 errors** (clean exit, no output)

## Deviations from Plan

None — plan executed exactly as written.

## Operational Caveats (from plan output spec)

1. **For the demo to actually deliver a message:** the new conversational template must be approved in WhatsApp/MYÜTIK AND `LEAD_ACK_TEMPLATE_NAME` must be set on BOTH staff-web (Vercel env) and the worker (Fly env). Until then the queued message row lands `status='failed'` with a template-gate error code — this is expected and acceptable behavior.

2. **Phone number required:** The submitter must enter a phone number to trigger a reply. The seeded "schedule-enquiry" form's phone field is `required: false` (`apps/staff-web/server/db/seeds/seed-enquiry-form.ts`). Recommend making the phone field required for the demo; otherwise a no-phone submission simply won't trigger a WhatsApp reply.

3. **Template variable contract:** The approved template MUST declare exactly one variable where `{{1}}` = the lead's first name. Supplying fewer vars than the template declares causes the Meta/MYÜTIK send to fail.

4. **Infrastructure:** MYÜTIK relay is live; Neon project is gymos-demo (id `billowing-sun-51091059`).

5. **Name extraction:** The P1c-07 gap still applies — submissions.ts matches `'name'`/`'first name'` labels only; the seeded form uses `'Your name'` so `firstName` saves as `'Lead'`. The WhatsApp reply will address the lead as "Lead" until the heuristic is broadened or the seed label is updated.

## Known Stubs

None — all code paths are wired. The step-14 block is a no-op (silently skipped) until `LEAD_ACK_TEMPLATE_NAME` is set, which is the intended behavior.

## Self-Check: PASSED

Files created:
- `apps/staff-web/server/routes/preview/[...slug].get.ts` — FOUND
- `.planning/quick/260618-ezc-add-public-preview-slug-form-route-auto-/260618-ezc-SUMMARY.md` — FOUND (this file)

Commits:
- `320e8db8` — FOUND (feat: expose public form renderer at /preview/{slug})
- `be7f1be9` — FOUND (feat: auto-send WhatsApp template ack on lead form submit)
