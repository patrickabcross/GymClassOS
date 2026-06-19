---
phase: BD3-hq-brain-dispatcher
verified: 2026-06-19T18:40:00Z
status: human_needed
score: 10/10 must-haves verified
human_verification:
  - test: "Open /studios in a deployed HQ app (gym-class-os.vercel.app or HQ Vercel deploy)"
    expected: "Table lists all provisioned studios; any studio with stale/null last_telemetry_received_at shows a grey 'Stale' badge, never a green 'Healthy' badge; cohort filter tabs (All / At-risk / Power-user) filter rows client-side; clicking a studio navigates to /studios/:id"
    why_human: "No dev server (P1c constraint); SSR + useEffect data-fetch verified structurally, not via live HTTP"
  - test: "Open /studios/:id for a studio that has pushed at least one telemetry snapshot"
    expected: "Four recharts LineChart panels render (Active members / Messages sent / Retention / Token usage); charts are visible (not blank/crashed); back link navigates to /studios"
    why_human: "recharts ClientOnly SSR guard verified via grep; actual chart rendering requires a browser + hydration cycle"
  - test: "Trigger the HQ dispatcher agent to call send-owner-whatsapp for a studio that has an hq_whatsapp_opt_in row with opted_out_at NULL and last_inbound_at within 24h"
    expected: "Job enqueued to hq-owner-send; worker logs '[hq-owner-send] send succeeded' with a mock-wamid-* wamid (live send is deferred pending Meta WABA registration)"
    why_human: "End-to-end producer→queue→consumer path requires a running HQ Fly worker with pg-boss connected to HQ Neon"
  - test: "Open /content in HQ, create a document, type content, blur/save, reload the page"
    expected: "Document persists on reload; editor is plain Tiptap (no collab toolbar, no Notion sync UI); /content/video shows disabled 'Generate video (coming soon)' button"
    why_human: "Persistence verified by DB write from content-update-document action; requires live Vercel + HQ Neon"
---

# Phase BD3: HQ Brain + Dispatcher Verification Report

**Phase Goal:** The operator can see a live model of all gym-owner customers (health cohorts, at-risk studios, performance over time) derived from telemetry; and can dispatch WhatsApp comms to gym owners about system/product topics via HQ's own WABA — never about member activity.

**Verified:** 2026-06-19T18:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

All 10 requirements (HQB-01 through HQB-05, HQD-01 through HQD-05) are structurally VERIFIED by code inspection and automated test suites. Four items are deferred to human verification because they require a live browser session or running services (P1c constraint — no dev server available during verification).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | classifyStudioHealth returns 'stale' for null/old last_telemetry_received_at, staleness-first before engagement checks | VERIFIED | `apps/hq/server/lib/studio-health.ts` lines 126-164: null timestamp → stale, ageHours > TELEMETRY_STALENESS_HOURS → stale (before engagement checks). Test line 64: "returns stale even if snapshot has great numbers." 13/13 vitest pass. |
| 2 | Cohort views (at-risk / power-user) computed from health signals with last_telemetry_received_at exclusion | VERIFIED | `classifyStudioHealth` returns cohort="unknown" for stale studios; at-risk filter in `studios._index.tsx` line 244 includes both cohort="at-risk" and cohort="unknown". |
| 3 | /studios console lists all studios with health badge driven exclusively by health.status | VERIFIED | `studios._index.tsx` healthBadge() function (lines 65-120) switches on `row.health.status` only; stale → grey Badge; healthy → green Badge reachable only when isStale===false and no at-risk signals. |
| 4 | /studios/:id shows telemetry history as recharts charts wrapped in ClientOnly | VERIFIED | `studios.$id.tsx` imports `ClientOnly` from `@agent-native/core/client` (line 36) and `recharts` (lines 28-35); every `ResponsiveContainer` + `LineChart` is inside `<ClientOnly fallback={<Skeleton/>}>` (lines 92-144). |
| 5 | send-owner-whatsapp .strict() Zod schema structurally prevents any member-directed payload | VERIFIED | `send-owner-whatsapp.ts` line 78: `.strict()`. Schema fields: studioId, topic (enum), payload (discriminated union text/template). No memberId/memberEmail/memberPhone/to field. 16/16 vitest assert rejection of memberId, memberEmail, memberPhone, to, and any unknown field. |
| 6 | HQD send routes through opt-in→24h-window→approved-template gate order on HQ's own WABA | VERIFIED | `sendOwnerMessage.ts` implements exact gate order (lines 86-120). 6/6 vitest covering OwnerNoOptInError, OwnerWindowExpiredError, OwnerTemplateNotApprovedError, and successful mock send. |
| 7 | No HQ code imports from services/worker or services/edge-webhooks | VERIFIED | `node scripts/guard-hqd-no-worker-import.mjs` exits 0: "guard-hqd-no-worker-import: clean". All mentions in hq-worker source are in comments marked "DO NOT import from services/worker". |
| 8 | HQ Content surface has non-collab Tiptap editor (no Yjs/CRDT/Notion) | VERIFIED | `content.$id.tsx` collab mentions (lines 8-12) are in comments listing what was DROPPED. No live import of collaboration extensions. `content-schema.ts` header documents DROPPED tables (documentComments, documentSyncLinks). No remotion in `apps/hq/package.json`. |
| 9 | Migrations v8/v9/v10 are additive-only (no DROP/RENAME) | VERIFIED | `packages/hq-schema/src/migrations.ts` grep for DROP/RENAME returns only the rule comment at line 12. v8: `CREATE TABLE IF NOT EXISTS hq_whatsapp_opt_in`, v9: `hq_whatsapp_templates`, v10: `documents` — all dual-dialect, all IF NOT EXISTS. |
| 10 | HQD-05 Video present as thin deferred stub with no Remotion footprint | VERIFIED | `content.video.tsx` renders a Card + disabled Button + IconVideo. `grep remotion apps/hq/package.json` returns empty. File header: "HQD-05 — Deferred pending Remotion render cluster / D-11 / no render cluster." |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/hq-schema/src/constants.ts` | Threshold constants including TELEMETRY_STALENESS_HOURS | VERIFIED | Contains all 8 threshold constants (lines 50-97); TELEMETRY_STALENESS_HOURS=26, DORMANT_ACTIVE_MEMBERS_THRESHOLD=5, etc. |
| `apps/hq/server/lib/studio-health.ts` | classifyStudioHealth() — staleness-first, no LLM | VERIFIED | 206 lines; exports classifyStudioHealth, HealthStatus, CohortMembership, StudioHealthSignals. Staleness gate runs lines 126-164 before engagement checks at 169-171. |
| `apps/hq/server/lib/studio-health.test.ts` | Unit coverage for staleness gate, signals, cohorts | VERIFIED | 13 tests; line 64 explicitly tests "stale even if snapshot has great numbers"; 13/13 pass. |
| `apps/hq/server/lib/list-studios-query.ts` | Shared query helper (DISTINCT ON + 30d token spend) | VERIFIED | Contains `DISTINCT ON (studio_id)` (line 96) and `INTERVAL '30 days'` (line 110); calls classifyStudioHealth (line 143); used by both api.studios.ts and list-studios.ts. |
| `apps/hq/app/routes/api.studios.ts` | GET /api/studios resource route | VERIFIED | 36 lines; exports loader, guard:allow-unscoped comment (line 17), calls queryStudiosWithHealth(). |
| `apps/hq/actions/list-studios.ts` | list-studios defineAction | VERIFIED | Exists; uses defineAction pattern. |
| `apps/hq/app/routes/api.studios.$id.snapshots.ts` | GET /api/studios/:id/snapshots history route | VERIFIED | Drizzle query with `.orderBy(asc(schema.hqTelemetrySnapshots.periodStart))`, guard:allow-unscoped, JSON.parse + flatMap for malformed rows. |
| `apps/hq/app/routes/studios._index.tsx` | HQB console with health badges + cohort filter | VERIFIED | 457 lines; fetches /api/studios; shadcn Table; healthBadge() keyed on health.status; CohortTabs (All/At-risk/Power-user); SignalsDetail expandable (progressive disclosure). |
| `apps/hq/app/routes/studios.$id.tsx` | Per-studio drill-in with recharts (SSR-guarded) | VERIFIED | 312 lines; imports ClientOnly + recharts; every LineChart/ResponsiveContainer inside ClientOnly fallback Skeleton. |
| `packages/hq-schema/src/migrations.ts` | Migrations v8 (hq_whatsapp_opt_in) + v9 (hq_whatsapp_templates) + v10 (documents) | VERIFIED | Additive-only, CREATE TABLE IF NOT EXISTS, dual-dialect (postgres+sqlite). No DROP/RENAME. |
| `services/hq-worker/src/lib/gates/ownerOptInGate.ts` | hasOwnerOptIn — HQ-owned, no services/worker import | VERIFIED | Queries hq_whatsapp_opt_in; returns rows.length > 0 && rows[0].optedOutAt == null; guard:allow-unscoped comment. |
| `services/hq-worker/src/lib/gates/ownerWindowGate.ts` | isOwnerInWindow — pure 24h gate | VERIFIED | Pure function; OWNER_WINDOW_HOURS=24; returns false for null lastInboundAt. |
| `services/hq-worker/src/lib/gates/ownerTemplateGate.ts` | isOwnerTemplateApproved | VERIFIED | Queries hq_whatsapp_templates where name AND status='approved'. |
| `services/hq-worker/src/lib/hq-waba-client.ts` | HqWabaClient interface + mock + stub factory | VERIFIED | Exports HqWabaClient, mockHqWabaClient (returns mock-wamid-*), createHqWabaClient (throws deferred-on-external-dependency per D-13). |
| `services/hq-worker/src/domain/sendOwnerMessage.ts` | Gate-ordered send orchestrator | VERIFIED | 122 lines; gate order: hasOwnerOptIn → load row → isOwnerInWindow (text) → isOwnerTemplateApproved (template) → client.sendMessage. Exports typed errors. |
| `services/hq-worker/src/domain/sendOwnerMessage.test.ts` | 6 tests covering all gate branches | VERIFIED | 6/6 pass; covers OwnerNoOptInError, OwnerWindowExpiredError, OwnerTemplateNotApprovedError, and successful mock sends (text + template). |
| `apps/hq/actions/send-owner-whatsapp.ts` | Member-excluded owner-send defineAction with .strict() | VERIFIED | .strict() at line 78; no member field in schema; description explicitly states "NEVER send messages referencing gym members"; enqueues to "hq-owner-send" via getBoss(). |
| `apps/hq/actions/send-owner-whatsapp.test.ts` | 16 tests asserting structural member exclusion | VERIFIED | 16/16 pass; D-08 tests at lines 88-125 assert memberId, memberEmail, memberPhone, to, extraField all throw ZodError. |
| `apps/hq/server/plugins/agent-chat.ts` | HQD system-prompt constraint in agent-chat | VERIFIED | Copy-out fork of dispatchAgentChatPlugin; HQD_CONSTRAINT const at line 30-37; appended to DISPATCH_BASE_PROMPT in createAgentChatPlugin call at line 79. |
| `services/hq-worker/src/queues/hq-owner-send.ts` | hq-owner-send queue handler | VERIFIED | Exports registerOwnerSend(boss, client); calls sendOwnerMessage; terminal gate errors swallowed (no retry); transient errors re-raised. |
| `services/hq-worker/src/index.ts` | hq-owner-send registered in worker boot | VERIFIED | "hq-owner-send" in createQueue loop (line 37); registerOwnerSend(boss, wabaClient) called (line 72); WABA client selection: createHqWabaClient if HQ_WABA_* set, else mockHqWabaClient (D-13). |
| `scripts/guard-hqd-no-worker-import.mjs` | CI guard for WABA-separation boundary | VERIFIED | Exists; scans apps/hq/ and services/hq-worker/ for import specifiers containing "services/worker" or "services/edge-webhooks"; exits 0 on clean run. |
| `apps/hq/server/db/content-schema.ts` | Non-collab documents table | VERIFIED | Exports documents, documentVersions, documentShares; no collab/Notion columns; DROPPED listed in header. |
| `apps/hq/actions/content-create-document.ts` | create-document defineAction | VERIFIED | Uses defineAction; HQ-org-scoped. |
| `apps/hq/actions/content-list-documents.ts` | list-documents defineAction | VERIFIED | Uses defineAction. |
| `apps/hq/actions/content-get-document.ts` | get-document defineAction | VERIFIED | Uses defineAction. |
| `apps/hq/actions/content-update-document.ts` | update-document defineAction | VERIFIED | Uses defineAction; called from content.$id.tsx auto-save. |
| `apps/hq/app/routes/content._index.tsx` | Content document list route | VERIFIED | Fetches content-list-documents action; "New document" CTA; nav link to /content/video. |
| `apps/hq/app/routes/content.$id.tsx` | Non-collab Tiptap editor | VERIFIED | Collab extensions mentioned only in DROPPED comments (lines 8-12); saves via content-update-document; auto-save on blur. |
| `apps/hq/app/routes/content.video.tsx` | HQD-05 thin deferred stub | VERIFIED | Disabled Button + IconVideo; no Remotion; "HQD-05 — Deferred pending Remotion render cluster" in header. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `api.studios.ts` | `list-studios-query.ts` | queryStudiosWithHealth() import | VERIFIED | Line 22: `import { queryStudiosWithHealth ... } from "../../server/lib/list-studios-query.js"` |
| `list-studios.ts` | `list-studios-query.ts` | queryStudiosWithHealth() call | VERIFIED | Both route and action share the same helper — no duplication |
| `list-studios-query.ts` | `studio-health.ts` | classifyStudioHealth() | VERIFIED | Line 22 import + line 143 call |
| `studio-health.ts` | `hq-schema/constants.ts` | TELEMETRY_STALENESS_HOURS etc. | VERIFIED | Line 20-28: imports 7 threshold constants from @gymos/hq-schema/constants |
| `studios._index.tsx` | `/api/studios` | fetch in useEffect | VERIFIED | Line 225: `await fetch("/api/studios")` in fetchStudios(); triggered by useEffect (line 236) |
| `studios.$id.tsx` | `/api/studios/${id}/snapshots` | fetch in useEffect | VERIFIED | Line 180: `fetch(\`/api/studios/${id}/snapshots\`)` |
| `studios.$id.tsx` | recharts + ClientOnly | imports + JSX | VERIFIED | Lines 28-36: recharts imports; line 36: ClientOnly; lines 92-144: charts wrapped in ClientOnly |
| `send-owner-whatsapp.ts` | `"hq-owner-send"` queue | getBoss().send(...) | VERIFIED | Line 111: `await getBoss().send("hq-owner-send", ...)` |
| `hq-owner-send.ts` | `sendOwnerMessage` | direct call | VERIFIED | Lines 40-44: imports sendOwnerMessage + typed errors; line 89: call |
| `services/hq-worker/src/index.ts` | `registerOwnerSend` | boot registration | VERIFIED | Line 20: import; line 72: `await registerOwnerSend(boss, wabaClient)` |
| `sendOwnerMessage.ts` | `ownerOptInGate.ts` | hasOwnerOptIn (gate 1) | VERIFIED | Line 4 import; line 86: `if (!(await hasOwnerOptIn(studioId, db)))` |
| `sendOwnerMessage.ts` | `hq-waba-client.ts` | injected HqWabaClient | VERIFIED | Line 10 import; line 120: `client.sendMessage(...)` |
| `package.json` | `guard-hqd-no-worker-import.mjs` | guards chain | VERIFIED | guards chain (line 46): `&& pnpm guard:hqd-no-worker-import` at chain tail |
| `agent-chat.ts` | HQD_CONSTRAINT | systemPrompt append | VERIFIED | Lines 30-37: const HQD_CONSTRAINT; line 79: `systemPrompt: DISPATCH_BASE_PROMPT + HQD_CONSTRAINT` |
| `apps/hq/server/db/index.ts` | `content-schema.ts` | ...contentSchema spread | VERIFIED | Lines 22+29: import + spread in schema object |
| `content.$id.tsx` | `content-update-document` | fetch to /_agent-native/actions/... | VERIFIED | Line 74: `fetch("/_agent-native/actions/content-update-document", ...)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `studios._index.tsx` | `data.studios` | fetch /api/studios → queryStudiosWithHealth() → hq_telemetry_snapshots + hq_token_usage via DISTINCT ON raw SQL | Yes — live DB query; empty state ("No studios provisioned yet") when no rows | FLOWING |
| `studios.$id.tsx` | `data.points` | fetch /api/studios/:id/snapshots → Drizzle select from hq_telemetry_snapshots with orderBy | Yes — live DB query; empty state ("No telemetry history yet") when no rows | FLOWING |
| `content._index.tsx` | documents list | fetch /_agent-native/actions/content-list-documents → accessFilter(documents) | Yes — live Drizzle query via defineAction | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| studio-health classification tests (13 cases) | `pnpm -F @gymos/hq exec vitest --run --config vitest.config.ts studio-health` | 13/13 passed | PASS |
| send-owner-whatsapp .strict() exclusion tests (16 cases) | `pnpm -F @gymos/hq exec vitest --run --config vitest.config.ts send-owner-whatsapp` | 16/16 passed | PASS |
| HQ-worker gate tests (11 cases: opt-in, window, template) | `pnpm -F @gymos/hq-worker test --run gates` | 11/11 passed | PASS |
| sendOwnerMessage orchestrator tests (6 cases) | `pnpm -F @gymos/hq-worker test --run sendOwnerMessage` | 6/6 passed | PASS |
| Full hq-worker suite | `pnpm -F @gymos/hq-worker test --run` | 44/44 passed (10 files) | PASS |
| WABA-separation CI guard | `node scripts/guard-hqd-no-worker-import.mjs` | Exit 0: "clean" | PASS |
| No member field in action schema (grep) | `grep "memberId\|memberEmail\|memberPhone" apps/hq/actions/send-owner-whatsapp.ts` | Returns no schema field declarations (only description text + test file) | PASS |
| No remotion in apps/hq | `grep remotion apps/hq/package.json` | Empty | PASS |
| No collab/yjs in content routes (live code) | `grep -ni "yjs\|collaboration\|y-protocols\|hocuspocus\|useCollaborativeDoc\|notion" content.$id.tsx` | Lines 8-12 only — all in comment block documenting DROPPED code | PASS |
| Migrations additive-only | `grep -n "DROP\|RENAME\|TRUNCATE" packages/hq-schema/src/migrations.ts` | Line 12 only — in the RULES comment ("NEVER use DROP") | PASS |
| ClientOnly wraps recharts | `grep "ClientOnly" apps/hq/app/routes/studios.$id.tsx` | Lines 36 (import), 89 (critical comment), 92 (opening tag), 144 (closing tag) | PASS |
| recharts pinned in apps/hq | `grep "recharts" apps/hq/package.json` | `"recharts": "2.15.4"` | PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HQB-01 | BD3-01, BD3-02 | Operator can view console listing all gym customers with health + engagement summaries | SATISFIED | /api/studios resource route + studios._index.tsx Table; 13/13 classification tests |
| HQB-02 | BD3-01 | Classifies health/at-risk status: dormant, under-messaging, low retention, token spend | SATISFIED | classifyStudioHealth() with 5 engagement signals + cohort derivation; unit tested |
| HQB-03 | BD3-01, BD3-02 | Uses last_telemetry_received_at to exclude stale/missing-telemetry studios from false "healthy" | SATISFIED | Staleness gate runs FIRST in classifyStudioHealth (lines 126-164 precede engagement checks at 169); stale → grey badge in UI; test line 64 explicitly asserts stale wins over great numbers |
| HQB-04 | BD3-01, BD3-02 | Operator can view at-risk and power-user cohorts | SATISFIED | CohortTabs in studios._index.tsx (All/At-risk/Power-user); computed client-side from health.cohort; no stored rows (D-04) |
| HQB-05 | BD3-02 | Operator can drill into single customer's performance over time | SATISFIED | /studios/:id route + /api/studios/:id/snapshots; recharts LineCharts for 4 metrics over time; SSR-guarded with ClientOnly |
| HQD-01 | BD3-03 | HQ has its own WABA + hq_whatsapp_opt_in, fully separate from studio WABA | SATISFIED | Migration v8 creates hq_whatsapp_opt_in (one row per studio, UNIQUE studio_id); CI guard enforces no studio-worker imports; ownerOptInGate queries HQ-only table |
| HQD-02 | BD3-04 | Operator can send WhatsApp to gym OWNERS; action schema structurally excludes member sends | SATISFIED | send-owner-whatsapp.ts .strict() schema; 16 tests asserting memberId/memberEmail/memberPhone/to all throw ZodError; HQD_CONSTRAINT in agent-chat.ts |
| HQD-03 | BD3-03, BD3-04 | HQD owner messaging routes through 24h-window + approved-template gating | SATISFIED | sendOwnerMessage gate order (opt-in→window→template); hq-owner-send queue; 6/6 orchestrator tests; 11/11 gate tests |
| HQD-04 | BD3-05 | HQD can generate marketing Content from Brain insights | SATISFIED | Non-collab Content fork: documents schema (v10 migration), 4 CRUD actions, content._index.tsx list + content.$id.tsx Tiptap editor; MODIFICATIONS.md complete |
| HQD-05 | BD3-05 | HQD can generate marketing Video | SATISFIED (thin stub) | content.video.tsx thin deferred stub; disabled Button; no Remotion; explicit D-11 documentation. Per BD3-CONTEXT.md D-11 and plan acceptance criteria, Video stub is the accepted deliverable |

### Anti-Patterns Found

| File | Pattern | Severity | Classification |
|------|---------|----------|---------------|
| `services/hq-worker/src/lib/hq-waba-client.ts` (createHqWabaClient) | Throws "deferred-on-external-dependency" — live WABA client is a stub | Info | Intentional per D-13 (HQ WABA second phone number registration requires manual Meta Business Manager step). Mock client (mockHqWabaClient) is injected in all code paths until creds set. NOT a gap. |
| `apps/hq/app/routes/content.$id.tsx` (deleteDocument) | Throws "not yet implemented" error | Info | Intentional out-of-scope item; plan explicitly deferred content-delete-document to a future plan. Not blocking HQD-04 goal. NOT a gap. |

No blocker anti-patterns found.

### Human Verification Required

#### 1. Studio Console Live Rendering

**Test:** Open `/studios` in the deployed HQ app (Vercel).
**Expected:** Table shows all provisioned studios; stale studios display grey "Stale" badge with clock icon; studios with at-risk signals show amber/red badges; "Healthy" (green) badge only appears when `isStale===false` AND no at-risk signals; clicking "At-risk" tab filters to `cohort===at-risk` or `cohort===unknown` rows; clicking a studio name navigates to `/studios/:id`.
**Why human:** P1c — no dev server during verification; SSR + useEffect fetch chain verified structurally (imports, fetch URL, state wiring); live rendering and actual Badge color require a browser + deployed HQ Vercel app.

#### 2. Per-Studio Drill-In with recharts

**Test:** Open `/studios/:id` for a studio that has pushed at least one telemetry snapshot (or seed a row in hq_telemetry_snapshots for testing).
**Expected:** Four chart panels render in a 2-column grid (Active members, Messages sent, Retention rate, Token usage); X-axis shows period dates (MM-DD format); no `ReferenceError: window is not defined` in Vercel SSR logs; back link to /studios works.
**Why human:** ClientOnly SSR guard verified via code inspection (`<ClientOnly fallback={<Skeleton/>}><ResponsiveContainer>...</ResponsiveContainer></ClientOnly>`); actual recharts rendering and absence of SSR crash requires a browser session + real data in hq_telemetry_snapshots.

#### 3. HQ Owner Send End-to-End (Producer → Queue → Consumer)

**Test:** In a deployed HQ app with a running hq-worker (Fly.io), trigger `send-owner-whatsapp` via the dispatcher agent for a studio with an active hq_whatsapp_opt_in row (opted_out_at NULL, last_inbound_at within 24h).
**Expected:** Job appears in pg-boss hq-owner-send queue; worker logs `[hq-owner-send] processing job`; since HQ_WABA creds are absent, worker uses mockHqWabaClient and logs `[hq-owner-send] send succeeded` with `wamid: mock-wamid-*`; no live Meta API call.
**Why human:** End-to-end queue test requires running pg-boss + hq-worker connected to HQ Neon. The producer (getBoss().send) and consumer (registerOwnerSend → sendOwnerMessage) are individually verified; their integration across the pg-boss boundary requires a live environment.

#### 4. Content Document Persistence

**Test:** Open `/content` in the HQ app; click "New document"; type a title and body content; blur the editor (triggering auto-save); reload the page.
**Expected:** Document appears in the /content list; opening it shows the persisted content; editor has no collaboration toolbar/sync indicators; /content/video shows the disabled "Generate video (coming soon)" button.
**Why human:** Content-update-document action writes to the documents table via assertAccess; persistence requires HQ Neon connected + migration v10 applied. Tiptap editor behavior (auto-save on blur) requires browser interaction.

### Gaps Summary

No gaps found. All 10 requirements are structurally verified. The four human_verification items are P1c-class deferred items (no live server during verification), not code gaps.

**Intentional known stubs (accepted, not gaps):**

- `createHqWabaClient` throws "deferred-on-external-dependency" — per D-13, live HQ WABA sends require manual Meta Business Manager phone number registration and Meta template approval (2-7 day lead time). The mock client path is fully operational and will be replaced when creds are available.
- `content.video.tsx` is a thin deferred stub — per D-11, the Remotion render cluster is out of scope for v2.0. This is the explicitly accepted deliverable for HQD-05.
- `deleteDocument` in content.$id.tsx throws "not yet implemented" — deferred to a future plan; not in BD3-05 scope.

---

_Verified: 2026-06-19T18:40:00Z_
_Verifier: Claude (gsd-verifier)_
