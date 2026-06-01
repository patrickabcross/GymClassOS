---
phase: P1c-public-site-integrations
plan: 05
type: execute
wave: 2
depends_on: ["P1c-01", "P1c-02"]
files_modified:
  - apps/staff-web/features/forms/lib/schedule-widget-ssr.ts
  - apps/staff-web/server/routes/embed/schedule.get.ts
  - apps/staff-web/server/db/seeds/seed-enquiry-form.ts
  - apps/staff-web/package.json
autonomous: false
requirements: [EMBED-01, EMBED-02, EMBED-03]
must_haves:
  truths:
    - "An anonymous visitor can GET /embed/schedule and see a server-rendered week of upcoming classes with no login"
    - "Passing ?accent=#ff5733&radius=8 themes the widget; passing ?accent=url(javascript:...) is ignored (sanitised)"
    - "Clicking a class slot reveals an inline enquiry form (name+email+phone) that POSTs to the lead handler and creates a status='lead' conversation"
    - "The schedule widget is server-rendered HTML (SSR), not a client-only React route"
  artifacts:
    - path: "apps/staff-web/server/routes/embed/schedule.get.ts"
      provides: "SSR schedule widget route (anonymous, themeable)"
      contains: "class_occurrences"
    - path: "apps/staff-web/features/forms/lib/schedule-widget-ssr.ts"
      provides: "Standalone HTML builder for the schedule widget + inline enquiry form"
      contains: "enquiry:created"
    - path: "apps/staff-web/server/db/seeds/seed-enquiry-form.ts"
      provides: "Idempotent seed of a default published Schedule Enquiry form the widget targets"
      contains: "ON CONFLICT|onConflictDo"
  key_links:
    - from: "apps/staff-web/server/routes/embed/schedule.get.ts"
      to: "class_occurrences + class_definitions"
      via: "Drizzle read (anonymous, no auth)"
      pattern: "classOccurrences"
    - from: "apps/staff-web/features/forms/lib/schedule-widget-ssr.ts"
      to: "/api/submit/:enquiryFormId"
      via: "inline enquiry form POST + postMessage enquiry:created"
      pattern: "/api/submit/"
---

<objective>
Ship the public, server-rendered `/embed/schedule` widget (EMBED-01): an anonymous visitor
sees the live class schedule with URL-param theming (EMBED-02), and an "enquire / request to
book" CTA on each slot opens an inline lead form that routes through the P1c-02 lead handler
(EMBED-03). Per Decision 2 this is browse + enquire — NO anonymous booking, NO payment at
widget time. The binding booking happens later via a staff-sent Checkout link (P1c-03).

Purpose: This is the public schedule surface — the visitor-facing half of the GHL replacement.
SSR per CLAUDE.md public-page rule (SEO + no-hydration). Depends on P1c-01 (lead schema) and
P1c-02 (the lead-upsert submission handler + CORS + auth publicPaths + the sanitize helpers).

Output: schedule SSR HTML builder, the /embed/schedule route, and a seeded default enquiry form.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md
@.planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md
@apps/staff-web/server/db/schema.ts

<interfaces>
<!-- Schedule data (Source: apps/staff-web/server/db/schema.ts):
     classOccurrences: { id, definitionId, startsAt (ISO+offset), endsAt, capacity, status('scheduled'|'cancelled'|'completed'), room }
     classDefinitions: { id, name, durationMin, defaultCapacity, category }
     Join occurrences→definitions on definitionId. Filter status='scheduled' AND startsAt >= now.
     Render in studio-local time with date-fns / date-fns-tz (already in staff-web). -->

<!-- Theming helpers (from P1c-02 — apps/staff-web/features/forms/lib/public-form-ssr.ts):
     export function sanitizeHexColor(value: string | null): string  // /^#[0-9a-fA-F]{6}$/ else "#000000"
     export function sanitizeIntPx(value: string | null, min=0, max=32): number
     Import these — do NOT re-implement. They prevent CSS injection (RESEARCH Pitfall 5). -->

<!-- SSR route pattern (Source: P1c-02 server/routes/f/[...slug].get.ts + templates/forms route):
     A Nitro resource route returning a standalone HTML Response (NOT an RR v7 React page).
     The route is public — covered by CORS (00-public-cors.ts /embed/ prefix) + auth publicPaths
     ("/embed") already added in P1c-02. Do NOT touch auth.ts or 00-public-cors.ts here. -->

<!-- Enquiry → lead: the inline enquiry form POSTs to /api/submit/:enquiryFormId (the P1c-02
     lead handler). The widget needs a known published form to target → Task 3 seeds a default
     "Schedule Enquiry" form (fields: name, email, phone) with a stable id/slug the widget
     hardcodes. The lead handler turns it into a status='lead' conversation, same path as forms.
     postMessage on success: { type: "enquiry:created", occurrenceId, responseId }. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Seed a default published "Schedule Enquiry" form</name>
  <files>apps/staff-web/server/db/seeds/seed-enquiry-form.ts, apps/staff-web/package.json</files>
  <read_first>
    - apps/staff-web/server/db/forms-schema.ts (from P1c-02) — the `forms` table columns (id, title, slug, fields JSON, settings JSON, status, ...) + the FormField shape from features/forms/types.ts
    - apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts — the existing idempotent-seed pattern (getDb, onConflictDoNothing, process.exit, dotenv loading for standalone tsx)
    - apps/staff-web/package.json — the `scripts` block + how db:seed-* scripts are wired
    - .planning/STATE.md §Decisions P1b.1-04 — standalone tsx seed scripts load .env.local then .env before importing the db
  </read_first>
  <action>
Create `apps/staff-web/server/db/seeds/seed-enquiry-form.ts` — an idempotent seed inserting ONE
published form the schedule widget targets. Mirror `seed-whatsapp-templates.ts` exactly (getDb,
onConflictDoNothing on the PK, console logging, `process.exit(0)`, env loading for standalone tsx).

- Stable id/slug: `id = "schedule-enquiry"`, `slug = "schedule-enquiry"` (so the widget can
  hardcode `/api/submit/schedule-enquiry`). Verify the forms table's PK + slug column names from
  forms-schema.ts and use the real ones.
- `status = "published"`.
- `title = "Schedule Enquiry"`.
- `fields` JSON: three FormField objects matching the type shape from features/forms/types.ts:
  - `{ id: "name", type: "text", label: "Your name", required: true }`
  - `{ id: "email", type: "email", label: "Email", required: true }`
  - `{ id: "phone", type: "text", label: "Phone", required: false }`
  (Use the EXACT FormField field names the type requires — read types.ts; add any required
  fields like `placeholder`/`order` the type mandates.)
- `settings` JSON: `{}` (or the minimal valid FormSettings — empty allowedOrigins so any origin
  may submit, no redirect).
- Use `onConflictDoNothing` on the PK so re-running is safe.

Add a `db:seed-enquiry-form` script to `apps/staff-web/package.json` pointing at the file
(mirror the existing `db:seed-templates` script). Run it once locally to verify.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm db:seed-enquiry-form</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/server/db/seeds/seed-enquiry-form.ts` exists
    - Contains `id: "schedule-enquiry"` (or the verified PK value) and `status: "published"`
    - Contains the three fields with ids `name`, `email`, `phone` and a `type: "email"` field
    - Contains `onConflictDoNothing` OR `ON CONFLICT`
    - Contains `process.exit(0)`
    - `apps/staff-web/package.json` scripts contains `db:seed-enquiry-form`
    - Running `pnpm --filter @gymos/staff-web db:seed-enquiry-form` exits 0; a second run does not error or duplicate
    - SQL check via Neon MCP: `SELECT id, status FROM forms WHERE id = 'schedule-enquiry';` returns one row with status='published'
  </acceptance_criteria>
  <done>
A published "Schedule Enquiry" form with a stable id exists; the widget can POST enquiries to
/api/submit/schedule-enquiry and they flow through the lead handler.
  </done>
</task>

<task type="auto">
  <name>Task 2: Schedule widget SSR HTML builder + /embed/schedule route</name>
  <files>apps/staff-web/features/forms/lib/schedule-widget-ssr.ts, apps/staff-web/server/routes/embed/schedule.get.ts</files>
  <read_first>
    - apps/staff-web/features/forms/lib/public-form-ssr.ts (from P1c-02) — the standalone-HTML SSR style, the inline-CSS approach, the gymos:resize postMessage, and import sanitizeHexColor/sanitizeIntPx from here
    - apps/staff-web/server/routes/f/[...slug].get.ts (from P1c-02) — the Nitro resource-route shape that returns an HTML Response
    - apps/staff-web/server/db/schema.ts — classOccurrences + classDefinitions columns
    - apps/staff-web/app/routes/gymos.schedule.tsx (the staff schedule, if present) — reuse its occurrences query shape for consistency; grep for the existing schedule loader
    - .planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md §"Pattern 5" (schedule widget SSR) + Pitfall 5 (CSS injection) + §"Code Examples" URL-param theming
    - CLAUDE.md "SSR for public pages" rule + "Tabler icons / no emojis" (icons here are inline SVG/text in standalone HTML — avoid emoji glyphs)
  </read_first>
  <action>
1. **Create `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts`** — export
   `renderScheduleWidget(event)` returning a standalone HTML `Response`. Mirror the structure of
   `public-form-ssr.ts`:
   - Read `?accent` + `?radius` from the request URL; theme via
     `sanitizeHexColor(url.searchParams.get("accent"))` and `sanitizeIntPx(url.searchParams.get("radius"))`
     (import from public-form-ssr.ts — do NOT re-implement). Inject as `:root { --accent: ...; --radius: ...px; }`.
   - Query Neon via `getDb()`: join `classOccurrences` → `classDefinitions` on `definitionId`,
     filter `status = 'scheduled'` AND `startsAt >= now()`, order by `startsAt`, limit ~7 days /
     ~50 rows. guard:allow-unscoped marker (gym tables single-tenant).
   - Render a week grid / day-grouped list of class cards: class name, time (date-fns formatted in
     studio-local time), remaining capacity is OPTIONAL — DO NOT compute a live "spots left"
     count that implies bookable inventory (lead funnel: browse + enquire only). Show
     start time + class name + an "Enquire" / "Request to book" button per slot.
   - **Inline enquiry form** (hidden by default, revealed on slot click via the standalone vanilla
     JS in the page): name + email + phone inputs. On submit, `fetch('/api/submit/schedule-enquiry',
     { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({
     data: { name, email, phone }, _t: <shownAt>, occurrenceId }) })`. The `occurrenceId` rides in
     `data` so the coach sees which class the lead enquired about.
   - On a successful response, `window.parent.postMessage({ type: "enquiry:created", occurrenceId,
     responseId: json.id }, "*")` and show a thank-you message.
   - Fire `window.parent.postMessage({ type: "gymos:resize", height: document.body.scrollHeight }, "*")`
     on load and after the enquiry form toggles (so the embed.js parent resizes the iframe).
   - Escape all dynamic strings (class names, etc.) to prevent XSS — reuse the upstream escape
     helper from public-form-ssr.ts if exported, else inline a small HTML-escape function.
   - NO "Built with Agent Native" badge.

2. **Create `apps/staff-web/server/routes/embed/schedule.get.ts`** — a Nitro resource route that
   delegates to `renderScheduleWidget(event)`. This route is public (auth publicPaths "/embed" +
   CORS "/embed/" were added in P1c-02 — do NOT edit auth.ts or the CORS middleware here).
   Set `Content-Type: text/html` and a CSP allowing framing (`frame-ancestors *`) like the
   upstream form SSR does, so any domain can embed it.

Run `pnpm --filter @gymos/staff-web typecheck`.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/features/forms/lib/schedule-widget-ssr.ts` exists; exports `renderScheduleWidget`
    - Imports `sanitizeHexColor` and `sanitizeIntPx` from `public-form-ssr` (does NOT redefine them)
    - References `classOccurrences` and `classDefinitions` (the schedule query)
    - Contains literal `/api/submit/schedule-enquiry` (the enquiry POST target)
    - Contains literal `enquiry:created` and `gymos:resize` postMessage types
    - Contains a `guard:allow-unscoped` marker comment
    - Does NOT contain a "spots left" / live-capacity-count expression implying bookable inventory
    - Does NOT contain `Built with Agent Native`
    - `apps/staff-web/server/routes/embed/schedule.get.ts` exists; calls `renderScheduleWidget`; sets `Content-Type` text/html and a frame-ancestors CSP
    - `pnpm --filter @gymos/staff-web typecheck` exits 0
  </acceptance_criteria>
  <done>
GET /embed/schedule renders a themeable SSR week of classes with an inline enquiry CTA that
POSTs to the lead handler and emits enquiry:created.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verify the SSR schedule widget + enquiry→lead</name>
  <what-built>
The SSR schedule widget + the seeded enquiry form. This checkpoint boots the dev server, loads
the widget anonymously, verifies theming + CSS-injection safety, and walks an enquiry → lead.
(Runtime-only: SSR output, theming, and the enquiry POST can't be verified by grep.)
  </what-built>
  <how-to-verify>
1. Run the enquiry-form seed once: `pnpm --filter @gymos/staff-web db:seed-enquiry-form`.
2. Boot: `pnpm --filter @gymos/staff-web dev` (:8081).
3. **Anonymous SSR load** (private window, NOT signed in):
   `http://localhost:8081/embed/schedule` → renders the week of seeded classes, no login redirect.
   View source → confirm class names are present in the initial HTML (proves SSR, not CSR).
4. **Theming**: `http://localhost:8081/embed/schedule?accent=%23ff5733&radius=12` → accent colour
   + radius visibly applied.
5. **CSS-injection safety**: `http://localhost:8081/embed/schedule?accent=url(javascript:alert(1))`
   → view source; the `--accent` value is `#000000` (sanitised), NOT the injected string.
6. **Enquiry → lead**: click a class slot → inline form appears → submit name+email+phone. Then
   in Neon MCP:
   ```sql
   SELECT status FROM conversations WHERE status='lead' ORDER BY created_at DESC LIMIT 1;
   SELECT data FROM form_submissions WHERE form_id='schedule-enquiry' ORDER BY submitted_at DESC LIMIT 1;
   ```
   Expect a status='lead' conversation and a form_submissions row whose `data` includes the
   `occurrenceId` of the clicked class.
7. Confirm `/gymos?filter=leads` shows the enquiry lead.

Confirm SSR + theming + injection-safety + enquiry→lead all pass, or describe failures.
  </how-to-verify>
  <resume-signal>Type "schedule working" once the widget renders SSR, themes safely, and enquiries create leads, or describe the failure.</resume-signal>
</task>

</tasks>

<verification>
- /embed/schedule renders SSR anonymously
- ?accent / ?radius theme it; malicious accent is sanitised to #000000
- Enquiry CTA → /api/submit/schedule-enquiry → status='lead' conversation with occurrenceId in data
- enquiry:created + gymos:resize postMessages emitted
- typecheck passes
</verification>

<success_criteria>
1. Public SSR schedule widget (EMBED-01)
2. URL-param theming, injection-safe (EMBED-02)
3. Enquire CTA creates a lead via the P1c-02 handler (EMBED-03) — no anonymous booking/payment
</success_criteria>

<output>
After completion, create `.planning/phases/P1c-public-site-integrations/P1c-05-embed-schedule-widget-SUMMARY.md` documenting:
- The forms-table PK/slug column names used for the seeded enquiry form
- The schedule query shape (and whether it reused the staff schedule loader)
- Confirmation theming is injection-safe (the #000000 fallback test)
- The postMessage event shapes emitted (enquiry:created, gymos:resize)
</output>
