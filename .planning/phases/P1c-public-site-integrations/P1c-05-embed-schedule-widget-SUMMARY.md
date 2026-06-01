---
phase: P1c-public-site-integrations
plan: "05"
subsystem: public-embed
tags: [schedule-widget, ssr, lead-funnel, embed, EMBED-01, EMBED-02, EMBED-03]
dependency_graph:
  requires: [P1c-01, P1c-02]
  provides: [/embed/schedule SSR route, schedule-widget-ssr.ts, seed-enquiry-form.ts]
  affects: [lead inbox /gymos, form_submissions table]
tech_stack:
  added: []
  patterns:
    - Standalone SSR HTML builder (mirror of public-form-ssr.ts pattern)
    - Nitro resource route re-export (mirror of f/[...slug].get.ts)
    - ON CONFLICT + FK-safe re-select enquiry->lead (mirror of submissions.ts)
    - URL-param theming via imported sanitizeHexColor/sanitizeIntPx
    - postMessage enquiry:created + gymos:resize (mirror of public-form-ssr.ts)
key_files:
  created:
    - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
    - apps/staff-web/server/routes/embed/schedule.get.ts
    - apps/staff-web/server/db/seeds/seed-enquiry-form.ts
  modified:
    - apps/staff-web/package.json (added db:seed-enquiry-form script)
decisions:
  - forms table PK = id (text), slug column is separate UNIQUE column; seed uses both id + slug = "schedule-enquiry"
  - schedule query: classOccurrences innerJoin classDefinitions on definitionId, status=scheduled AND startsAt>=now, orderBy startsAt, limit 50
  - Did NOT reuse the staff schedule loader (gymos.schedule.tsx uses RR v7 loader/React pattern; SSR widget is pure-Nitro resource route returning Response)
  - Date formatting: server-side en-GB locale (no date-fns-tz dep; avoids new runtime dep)
  - occurrenceId rides inside data{} JSON (not a top-level body field) so it flows through the existing field-extraction loop in submissions.ts without code changes
  - No spots-left / live capacity count — browse + enquire only (Decision 2 / lead funnel policy)
  - zero new runtime deps — sanitize helpers imported from public-form-ssr.ts
metrics:
  duration: "~8 minutes"
  completed_date: "2026-06-01"
  tasks_completed: 2
  tasks_total: 3
  files_created: 3
  files_modified: 1
---

# Phase P1c Plan 05: Embed Schedule Widget Summary

One-liner: SSR-rendered /embed/schedule widget with URL-param theming and inline enquiry CTA wired to the P1c-02 lead handler — browse-and-enquire (no anonymous booking), CORS + auth bypass inherited from P1c-02.

## What Was Built

### Task 1: seed-enquiry-form.ts

`apps/staff-web/server/db/seeds/seed-enquiry-form.ts` — idempotent seed that inserts ONE published "Schedule Enquiry" form with:

- **Stable id/slug**: `schedule-enquiry` (the widget hardcodes `/api/submit/schedule-enquiry`)
- **Status**: `published`
- **Fields**: `name` (text, required), `email` (email, required), `phone` (text, optional)
- **Settings**: `submitText: "Send Enquiry"`, `successMessage: "Thanks! We'll be in touch shortly..."`
- **allowedOrigins**: absent/empty (any origin may POST — back-compat with embed use)
- Idempotent via `onConflictDoNothing({ target: schema.forms.id })`

Script added to `package.json` as `db:seed-enquiry-form`. Run twice against gymos-demo Neon — second run was a no-op (idempotency confirmed).

**Forms table PK/slug column names**: PK = `id` (text), slug = `slug` (separate UNIQUE column). Both set to `"schedule-enquiry"`.

### Task 2: schedule-widget-ssr.ts + embed/schedule.get.ts

`apps/staff-web/features/forms/lib/schedule-widget-ssr.ts`:

- Exports `renderScheduleWidget(event: H3Event): Promise<Response>`
- **Schedule query**: Drizzle `innerJoin(classDefinitions, eq(classOccurrences.definitionId, classDefinitions.id))` filtered on `status='scheduled' AND startsAt >= now()`, ordered by `startsAt`, limit 50
- **guard:allow-unscoped** marker — gym tables single-tenant, anonymous public route
- **URL-param theming**: imports `sanitizeHexColor` + `sanitizeIntPx` directly from `public-form-ssr.ts` (no re-implementation). Injected as `:root { --gym-accent: ...; --gym-radius: ...px; }`. Malicious `accent=url(javascript:...)` falls back to `#000000`.
- **Day-grouped class cards**: each card shows time, class name, category badge, duration — NO "spots left" / live capacity count (browse + enquire lead funnel only)
- **Enquire CTA**: inline collapsible form per slot (name + email + phone), POST to `/api/submit/schedule-enquiry`
- **occurrenceId**: rides inside `data.occurrenceId` so the lead note shows which class the visitor enquired about
- **postMessage events**: `{ type: "enquiry:created", occurrenceId, responseId }` on success + `{ type: "gymos:resize", height }` on load + DOM mutations (MutationObserver)
- **XSS prevention**: `escapeHtml()` applied to all dynamic strings (class names, times)
- **Response headers**: `Content-Type: text/html; charset=utf-8`, `Content-Security-Policy: frame-ancestors *`, `Cache-Control: public, s-maxage=30, stale-while-revalidate=120`
- **Zero new runtime deps** — imports only from h3, drizzle-orm, and staff-web internals

`apps/staff-web/server/routes/embed/schedule.get.ts`:
- Nitro resource route, one line: `export { renderScheduleWidget as default }` (mirrors f/[...slug].get.ts pattern)
- Auth bypass (`/embed` in publicPaths) + CORS (`/embed/` prefix) — both configured by P1c-02; NOT re-edited here

## Theming Injection-Safety

The `sanitizeHexColor` function validates `/^#[0-9a-fA-F]{6}$/` and falls back to `#000000` for anything else. Testing:

| Input | Output |
|---|---|
| `#ff5733` | `#ff5733` |
| `url(javascript:alert(1))` | `#000000` |
| `#ff573` (short) | `#000000` |
| `null` / missing | `#000000` |

## postMessage Event Shapes

```json
// Emitted when enquiry submitted successfully
{ "type": "enquiry:created", "occurrenceId": "<classOccurrences.id>", "responseId": "<form_submissions.id>" }

// Emitted on load + DOM height changes
{ "type": "gymos:resize", "height": <scrollHeight in px> }
```

## DB-Replay Verification

Enquiry → lead data flow replayed directly against gymos-demo Neon using a unique test email/phone outside the Ofcom `+447700900xxx` seed range (`p1c05-test-enquiry@gymos-test.invalid` / `+447900555999`):

1. `gym_members` upsert → ON CONFLICT + re-select canonical id ✓
2. `conversations` upsert with `status='lead'` → ON CONFLICT(member_id, channel) + re-select ✓
3. `messages` insert with `payload.data.occurrenceId` ✓
4. `form_submissions` insert with `data.occurrenceId` ✓
5. Verification: `conversations.status = 'lead'`, `form_submissions.data.occurrenceId = 'test-occurrence-xyz'` ✓
6. Test rows cleaned up (DELETE) ✓

Result: **PASS** — enquiry→lead data flow confirmed via DB-replay.

## Deferred Runtime Verification (P1c-07)

Dev server cannot boot (NitroViteError — P1c-wide constraint). The following are deferred to P1c-07 on the Fly deploy:

1. Open `https://<deploy>/embed/schedule` anonymously (not signed in) → confirm week of classes renders in initial HTML (proves SSR, not CSR)
2. View-source → confirm class names present in initial HTML
3. `?accent=%23ff5733&radius=12` → accent colour + border radius visibly applied
4. `?accent=url(javascript:alert(1))` → view-source; `--gym-accent` value is `#000000` (injection blocked)
5. Click a class slot → inline enquiry form reveals
6. Submit name + email + phone → thank-you message shown
7. In Neon: `SELECT status FROM conversations WHERE status='lead' ORDER BY created_at DESC LIMIT 1;` → status='lead' row
8. In Neon: `SELECT data FROM form_submissions WHERE form_id='schedule-enquiry' ORDER BY submitted_at DESC LIMIT 1;` → data contains occurrenceId of clicked class
9. Confirm `/gymos?filter=leads` shows the enquiry lead

## Deviations from Plan

None — plan executed exactly as written.

The `checkpoint:human-verify` (Task 3) was auto-skipped per explicit user instruction in the execution context (dev server unavailable, runtime checks deferred to P1c-07 smoke test).

## Known Stubs

None. The SSR route reads live `class_occurrences` + `class_definitions` from Neon. The enquiry form POSTs to the live `/api/submit/schedule-enquiry` lead handler (seeded and verified). No hardcoded empty values or placeholder data.

## Self-Check: PASSED

Files created:
- [x] apps/staff-web/features/forms/lib/schedule-widget-ssr.ts — exists
- [x] apps/staff-web/server/routes/embed/schedule.get.ts — exists
- [x] apps/staff-web/server/db/seeds/seed-enquiry-form.ts — exists

Commits:
- [x] 0e6a58a0 — seed-enquiry-form.ts + package.json
- [x] 2984cde7 — schedule-widget-ssr.ts + embed/schedule.get.ts
