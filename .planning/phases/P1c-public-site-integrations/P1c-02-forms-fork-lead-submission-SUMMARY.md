---
phase: P1c-public-site-integrations
plan: "02"
subsystem: public-site
tags: [forms, lead-funnel, cors, auth, ssr, drizzle, upsert, rate-limit, staff-web]

requires:
  - phase: P1c-public-site-integrations
    provides: "P1c-01 lead migration (conversations.status='lead', formSubmissions table, partial unique indexes on gym_members.email/phone_e164, unique index on conversations(member_id, channel))"

provides:
  - "Forked forms feature slice at apps/staff-web/features/forms/ (templates/forms/ untouched)"
  - "submitLeadForm handler: public POST upserts gym_members + opens status='lead' conversation + writes form_submissions/messages/responses (FORMS-03)"
  - "Public routes: POST /api/submit/:id, GET /api/forms/public/:slug, GET /f/:slug (SSR form page)"
  - "00-public-cors.ts CORS middleware + auth.ts publicPaths plumbing for ALL P1c public routes (downstream plans must NOT edit auth.ts)"
  - "normalizePhone() UK→E.164 normaliser + checkRateLimit() per-IP flood limiter"
  - "forms-schema.ts (forms + responses tables) re-exported through the schema barrel"
  - "0004 migration creating forms + responses tables (gap left by 0003)"

affects:
  - P1c-04
  - P1c-05
  - P1c-06
  - P1c-07

tech-stack:
  added: []
  patterns:
    - "Forked-template slice: upstream copied into apps/staff-web/features/forms/, fork boundary rule recorded in FORMS.md, templates/forms/ never edited"
    - "Lead upsert via raw db.execute(sql`... ON CONFLICT ...`) + canonical-id re-SELECT (FK-safety): the freshly-generated nanoid is discarded when the upsert hits an existing row"
    - "CORS middleware at 00- prefix runs BEFORE auth guard; OPTIONS short-circuits to 204"
    - "Public-route plumbing owned by ONE plan (auth.ts publicPaths + allowlistHandler skip block both extended together) to avoid parallel-edit conflicts"
    - "Migrations applied directly to Neon via MCP (0001-0004), not runMigrations"

key-files:
  created:
    - apps/staff-web/features/forms/FORMS.md
    - apps/staff-web/features/forms/types.ts
    - apps/staff-web/features/forms/lib/validate-fields.ts
    - apps/staff-web/features/forms/lib/public-form-ssr.ts
    - apps/staff-web/features/forms/lib/normalize-phone.ts
    - apps/staff-web/features/forms/lib/normalize-phone.test.ts
    - apps/staff-web/features/forms/lib/rate-limit.ts
    - apps/staff-web/features/forms/lib/rate-limit.test.ts
    - apps/staff-web/features/forms/handlers/forms.ts
    - apps/staff-web/features/forms/handlers/submissions.ts
    - apps/staff-web/server/db/forms-schema.ts
    - apps/staff-web/server/middleware/00-public-cors.ts
    - apps/staff-web/server/routes/f/[...slug].get.ts
    - apps/staff-web/server/routes/api/forms/public/[...slug].get.ts
    - apps/staff-web/server/routes/api/submit/[id].post.ts
    - apps/staff-web/server/db/migrations/0004_p1c_forms_responses.sql
  modified:
    - apps/staff-web/server/db/schema.ts
    - apps/staff-web/server/plugins/auth.ts

key-decisions:
  - "Lead upsert uses raw db.execute(sql`... ON CONFLICT ...`) (worker sendMessage.ts pattern), NOT Drizzle onConflictDo* — matches the live Neon driver and the partial-unique-index conflict targets from P1c-01"
  - "Canonical-id re-SELECT after EACH upsert is load-bearing: ON CONFLICT may update an EXISTING row whose id != the new nanoid, so conversation/form_submissions/messages inserts use resolvedMemberId/resolvedConvId — never the raw nanoid (no orphan FK)"
  - "messageType='text' for the lead note (no new enum value → no extra migration); form context stored in payload JSON { kind: 'form_submission', formId, data }"
  - "Rate limit 60 req / 15 min / IP, in-memory Map; Vercel-KV upgrade caveat documented (Map not durable across serverless cold starts; effective on Fly single always-on machine, which is where staff-web runs)"
  - "appStatePut + fireIntegrations removed from the upstream tail — the conversations row IS the lead notification"
  - "All P1c public-route auth/CORS plumbing owned by this plan; P1c-04/05/06 must not touch auth.ts"

patterns-established:
  - "FK-safe upsert: INSERT ... ON CONFLICT then SELECT id ... WHERE <natural-key>; bind downstream FKs to the re-selected id"
  - "Public anonymous endpoints do NOT wrap in runWithRequestContext (framework injects no context for /api/submit/*); gym tables carry guard:allow-unscoped (single-tenant)"

requirements-completed:
  - FORMS-03

duration: 10min
completed: "2026-06-01"
---

# Phase P1c Plan 02: Forms Fork + Lead Submission Summary

**Forked `templates/forms/` into `apps/staff-web/features/forms/` and replaced the generic responses insert with a gym lead-upsert — a public form POST upserts a `gym_members` row and opens a `status='lead'` conversation that surfaces in `/gymos`, with FK-safe canonical-id re-selects, UK→E.164 phone normalisation, per-IP rate limiting, and the CORS + auth plumbing for every P1c public route.**

## Performance

- **Duration:** ~10 min (Tasks 1-3 execution + Task 4 checkpoint verification + finalization)
- **Tasks:** 4 (3 auto/tdd + 1 blocking human-verify checkpoint, resolved)
- **Files created:** 16 (15 plan + 1 deviation migration)
- **Files modified:** 2

## Accomplishments

- **Task 1 — Fork (`a5245853`):** Copied `templates/forms/` into `apps/staff-web/features/forms/`. `types.ts` + `validate-fields.ts` verbatim. `public-form-ssr.ts` adapted: postMessage `agent-native-feedback-submitted` → `lead:submitted`, added `gymos:resize` height postMessage for the P1c-06 embed, removed the "Built with Agent Native" badge, copied `safeRedirectUrl` verbatim, added `sanitizeHexColor`/`sanitizeIntPx` URL-param theming (exported for P1c-05). Created `forms-schema.ts` (forms + responses, ownableColumns/shares dropped — single-tenant, `guard:allow-unscoped`), re-exported through the `schema.ts` barrel. `FORMS.md` records the fork boundary.
- **Task 2 — Lead pipeline (`acab0eb9`, TDD):** `normalizePhone` (11 passing tests; UK 07x/+44x/44x → E.164, garbage → null) and `checkRateLimit` (60/15min/IP, FK-safe tests pass). `submitLeadForm`: upstream pre-persistence pipeline (honeypot `_hp`, time `_t`, payload/field-length caps, field whitelist, required-field/conditional-visibility validation) copied verbatim; rate-limit gate runs BEFORE any DB write (429); persistence tail rewritten to the gym lead upsert.
- **Task 3 — Plumbing (`cd9348c2`):** `00-public-cors.ts` (H3 CORS, OPTIONS→204 short-circuit, `PUBLIC_EMBED_PREFIXES` = `/api/forms/public/`, `/api/submit/`, `/f/`, `/embed.js`, `/embed/`). `auth.ts` extended additively: `publicPaths` += `/f`, `/api/forms/public`, `/api/submit`, `/embed` (pre-existing entries preserved) AND the `allowlistHandler` skip block extended with matching prefix checks.
- **Task 4 — Checkpoint (resolved):** Verified the lead pipeline lands idempotently (see Verification below).

## Task Commits

1. **Task 1: Fork forms template into staff-web features/forms/** — `a5245853` (feat)
2. **Task 2: Lead-upsert handler + UK phone normaliser + per-IP rate limit** — `acab0eb9` (feat)
3. **Task 3: CORS middleware + auth publicPaths for all P1c public routes** — `cd9348c2` (feat)

## Decisions Made

- **Raw `db.execute(sql\`... ON CONFLICT ...\`)`, not Drizzle `onConflictDo*`.** Mirrors `services/worker/src/domain/sendMessage.ts` and targets the partial unique indexes from P1c-01 (`ON CONFLICT (email) WHERE email IS NOT NULL`, `ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL`, `ON CONFLICT (member_id, channel)`).
- **Canonical-id re-SELECT is load-bearing (FK-safety — see Checker's BLOCKER fix below).** After each member upsert, `SELECT id FROM gym_members WHERE email = ...` (or `... WHERE phone_e164 = ...`) yields `resolvedMemberId`; after the conversation upsert, `SELECT id FROM conversations WHERE member_id = ... AND channel = 'whatsapp'` yields `resolvedConvId`. The freshly-generated `nanoid()` is used ONLY as the INSERT candidate — every downstream FK (conversation, messages, form_submissions) binds to the re-selected id. Without this, a repeat submission whose upsert hits an existing row would FK-reference a discarded nanoid → orphan.
- **`messageType: "text"` for the lead note** — no new enum value, no extra migration. Form context lives in `payload` JSON `{ kind: 'form_submission', formId, data }`; `direction: 'in'`, `status: 'delivered'`.
- **Rate limit 60/15min/IP, in-memory Map.** Effective on Fly (single always-on machine, where staff-web runs per STATE.md). Vercel-KV upgrade caveat recorded in FORMS.md: the Map is per-module so a Vercel-serverless move would need a shared store.
- **`appStatePut` + `fireIntegrations` removed** from the upstream tail — the `status='lead'` conversations row IS the notification.
- **This plan owns all P1c public-route plumbing.** `auth.ts` (publicPaths + allowlistHandler skip block) and `00-public-cors.ts` are finalized here so P1c-04/05/06 never edit them (avoids parallel-edit conflicts).

## ON CONFLICT Targets and Method

| Table | Conflict target | Method |
| --- | --- | --- |
| `gym_members` | `(email) WHERE email IS NOT NULL` (email-bearing leads) | raw `db.execute(sql\`...\`)` |
| `gym_members` | `(phone_e164) WHERE phone_e164 IS NOT NULL` (email-less leads) | raw `db.execute(sql\`...\`)` |
| `conversations` | `(member_id, channel)` | raw `db.execute(sql\`...\`)`; status only resurrects from `'closed'` → `'lead'` |

## messageType Value

`"text"` (NOT a new `'form_submission'` enum value — that would have required another migration). The form summary is in `body`; structured context is in `payload` JSON.

## /f/:slug Routing

Routed at the explicit Nitro path `apps/staff-web/server/routes/f/[...slug].get.ts` so `/f/*` resolves to `renderPublicForm` directly and does NOT collide with the staff-web React app catch-all. No additional special-casing was required.

## Verification Approach (carried-forward note)

The local `agent-native dev` server could **not** boot for an HTTP walkthrough — it threw repeated `NitroViteError: Vite environment "nitro" is unavailable` (503 on server routes). This is the known staff-web Nitro/Drizzle runtime fragility (project memory: "staff-web can ONLY run reliably on Fly; Nitro bundling is finicky"). The Vercel/Netlify Nitro-bundling crash and this local Nitro-Vite unavailability are the same class of issue.

Rather than an HTTP walk, the **substance** of the Task 4 checkpoint — the lead-upsert data flow + the checker's FK-safe re-select idempotency BLOCKER fix — was verified by replaying the handler's EXACT SQL sequence **twice** against the live `gymos-demo` Neon DB (run 2 used a fresh throwaway member nanoid, mimicking the handler).

### Verification Results — all PASS

- `gym_members`: **1 row** after 2 submissions (idempotent upsert)
- `conversations`: **1 row**, `status='lead'`, bound to the original member
- `form_submissions`: **2 rows**, BOTH bound to the original canonical `member_id` + `conversation_id` — the run-2 throwaway nanoid was correctly discarded by the re-select. **No orphan FK** → the checker's canonical-id re-select BLOCKER is confirmed working.
- `responses`: 2 rows
- `distinct_members = 1`, `distinct_convs = 1` across both submissions

All test rows + the test form were deleted afterward; the live DB is back to its prior state.

### Carried forward to P1c-07 (NOT runtime-confirmed here)

These require a booting HTTP surface and are deferred to the P1c-07 e2e smoke test:

- CORS preflight returns 204 (not a 302-to-login) with correct header ordering
- Actual Nitro route mounting of `/api/submit/:id`, `/api/forms/public/:slug`, `/f/:slug`
- Honeypot + rate-limit behavior over real HTTP
- Lead conversation rendering in `/gymos`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 0004 migration: `forms` + `responses` tables omitted by 0003**
- **Found during:** Task 4 checkpoint verification (DB-replay)
- **Issue:** P1c-01 (migration 0003) created only `form_submissions`; it omitted the `forms` and `responses` tables this plan's forked handler **reads** (`schema.forms`, to load the published form) and **writes** (`schema.responses`, for the builder responses view). Without them, the feature 500s on every submission.
- **Fix:** Wrote `apps/staff-web/server/db/migrations/0004_p1c_forms_responses.sql` — strictly additive (`CREATE TABLE forms`, `CREATE TABLE responses` + `responses_form_id_idx`), mirroring `forms-schema.ts`. Applied directly to the live `gymos-demo` Neon DB via Neon MCP (same direct-apply pattern as 0001-0003); both tables confirmed present.
- **Files modified:** `apps/staff-web/server/db/migrations/0004_p1c_forms_responses.sql`
- **Commit:** `3c084a26`

**2. [Rule 1 - Bug] public-form-ssr.ts typecheck — shadowed `form` var + missing cast**
- **Found during:** Task 4 checkpoint verification
- **Issue:** `renderPublicFormHtml` lost null-narrowing on `form` and passed an unverified shape to `renderFormPage`.
- **Fix:** Renamed local `form` → `formData` and cast to the concrete `{ id; title; description?; fields: FormField[]; settings: FormSettings }` shape. `pnpm --filter @gymos/staff-web typecheck` is clean.
- **Files modified:** `apps/staff-web/features/forms/lib/public-form-ssr.ts`
- **Commit:** `0ab900f9`

## Issues Encountered

- **Local dev server cannot boot** (`NitroViteError: Vite environment "nitro" is unavailable`). This blocks any local HTTP verification for the whole P1c phase. **Downstream impact:** P1c-04/05/06 will also be unable to use a local dev server — they must verify the same DB-replay way (replay the handler/action SQL against `gymos-demo` Neon via MCP) or defer runtime checks to P1c-07's e2e smoke test.

## Fork Boundary

`templates/forms/` is **unmodified** — `git status templates/forms/` is empty. The fork boundary rule (never edit `templates/`) is recorded in `apps/staff-web/features/forms/FORMS.md`. What was stripped from the fork: `ownableColumns()`/`createSharesTable()` (single-tenant pilot), `appStatePut`, `fireIntegrations`, the "Built with Agent Native" badge; integrations (Slack/Discord/Sheets) were copied but NOT wired.

## Known Stubs

None that block the plan goal. The builder CRUD handlers (`handlers/forms.ts`) are forked-in but their staff-side routes/UI are P1c-04's responsibility — that is the planned boundary, not a stub. The lead pipeline itself is fully wired and verified at the data layer.

## Next Phase Readiness

- FORMS-03 complete; the lead pipeline is live at the data layer (forms + responses + form_submissions tables exist on `gymos-demo`).
- P1c-04 (forms builder + leads inbox) can proceed — it consumes `handlers/forms.ts` and must NOT edit `auth.ts`/`00-public-cors.ts` (this plan owns them). It must verify via DB-replay or defer to P1c-07 (no local dev server).
- P1c-05/06 (embed widget + JS snippet) consume `sanitizeHexColor`/`sanitizeIntPx` and the `gymos:resize`/`lead:submitted` postMessages already shipped here.
- P1c-07 (e2e smoke) carries the deferred runtime checks: CORS 204 ordering, route mounting, honeypot/rate-limit over HTTP, `/gymos` lead rendering.

## Self-Check: PASSED

- All 9 spot-checked created files present on disk (FORMS.md, normalize-phone.ts, rate-limit.ts, submissions.ts, forms-schema.ts, 00-public-cors.ts, f/[...slug].get.ts, api/submit/[id].post.ts, 0004 migration).
- All 5 commits found in git history: a5245853, acab0eb9, cd9348c2 (task commits) + 3c084a26, 0ab900f9 (deviation commits).
- `pnpm --filter @gymos/staff-web typecheck` exits 0.
- `templates/forms/` unmodified (fork boundary preserved).

---
*Phase: P1c-public-site-integrations*
*Completed: 2026-06-01*
