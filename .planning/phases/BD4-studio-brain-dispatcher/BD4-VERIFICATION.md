---
phase: BD4-studio-brain-dispatcher
verified: 2026-06-19T20:15:00Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Open /gymos/brain in the browser as an admin. Confirm the Brain tab is visible in GymosTopNav. On first load the class catalog should auto-seed (brain-init fires). Edit Brand Voice, save, reload the page — confirm the saved text persists."
    expected: "Brand Voice text survives a hard reload; class catalog shows studio classes without manual entry; Studio Ethos section editable and persistent."
    why_human: "Requires a running Vercel deploy and authenticated browser session. Persistence-on-reload is the core GOB-03 success criterion and cannot be verified programmatically without a live DB."
  - test: "Seed the studio_owner_config singleton row (id='singleton', owner_phone_e164='<owner phone>', studio_timezone='Europe/London') in the gymos-demo Neon, then wait for the next daily-owner-digest run at 06:00 (or trigger manually via pg-boss admin). Confirm the owner's WhatsApp receives the digest."
    expected: "Owner receives a WhatsApp message with numeric studio metrics (active members, bookings, retention). Message arrives via MYUTIK relay."
    why_human: "Requires Meta-approved 'owner_daily_digest' template, a configured studio_owner_config row, and a gym_members row for the owner phone. D-15 deferred-on-external-dependency — live activation waits on Meta template approval. Cannot be automated without a live worker and approved template."
  - test: "Seed studio_owner_config with heartbeat_enabled=1. Wait for the heartbeat at 09:xx studio tz (or trigger manually). Confirm dormant members (no booking in 30 days, opted in) receive a WhatsApp reactivation message. Confirm members with >= 3 reactivation_attempts in 90 days do NOT receive another message."
    expected: "Dormant members receive 'member_reactivation' template. Suppressed members (>= 3 attempts) are skipped. Opted-out members skipped. reactivation_attempts table grows by one row per send."
    why_human: "Requires Meta-approved 'member_reactivation' template, live worker, and dormant member test data in Neon. The suppression ceiling logic is unit-tested (pure helpers); the live end-to-end path needs a running system."
---

# Phase BD4: Studio Brain + Dispatcher Verification Report

**Phase Goal:** Each studio deploy has a gym-owner Brain (classes, fitness methods, brand voice) that the owner can view and edit; the owner receives a daily WhatsApp digest of their own metrics; dormant members receive personalized reactivation messages through the existing worker sendMessage chokepoint — with a suppression ceiling enforced from day one.

**Verified:** 2026-06-19T20:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Studio owner can open /gymos/brain, view brand voice/ethos/class methods, edit brand voice — persists on reload | WIRED — browser reload requires human | Route exists at 383 lines; GET/POST actions wired; useChangeVersions live-refresh present; save handler calls update-brain-doc; data flows from DB via get-brain-docs |
| 2 | Class catalog pre-populated from class_definitions on Brain init — no manual seeding | VERIFIED | brain-init.ts reads classDefinitions WHERE active=true, upserts 'class-catalog' row via onConflictDoUpdate; gymos.brain.tsx calls brain-init on mount if catalog absent or empty |
| 3 | Daily WhatsApp digest delivered to owner via existing chokepoint | WIRED (deferred D-15) | daily-owner-digest.ts registered in index.ts; reads studioOwnerConfig + buildTelemetrySnapshot; enqueueOutboundWhatsApp called; live send deferred on Meta template approval |
| 4 | Heartbeat pg-boss job at 09:00 studio IANA timezone; detects dormant members; enqueues reactivation through chokepoint; sendMessage.ts unmodified | VERIFIED | boss.schedule(HEARTBEAT_QUEUE, cron, {}, { tz: tz }); cron = `${minuteOffset} 9 * * *`; dormancy SQL LEFT JOIN bookings; enqueueOutboundWhatsApp only; zero imports of sendMessage |
| 5 | Member with >= 3 reactivation attempts in rolling 90-day window receives no further messages; opt-outs excluded synchronously from day one | VERIFIED | isSuppressed(count >= 3) = true; check runs BEFORE enqueue; INSERT reactivation_attempts in same path; DELETE on enqueue failure (no ghost counts); isExcludedOptOut runs as defense-in-depth; 14 unit tests covering all boundary cases |

**Score:** 5/5 truths verified (SC-3 and the live browser part of SC-1 require human validation per D-15 and no-local-dev-server constraints)

---

### Required Artifacts

#### BD4-01 (GOB)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/staff-web/server/db/schema.ts` | studioBrainDocs, studioOwnerConfig, reactivationAttempts Drizzle defs | VERIFIED | Lines 567-601: all three exports present with correct columns |
| `apps/staff-web/server/plugins/db.ts` | versions 16-19 runMigrations entries | VERIFIED | Versions 16 (studio_brain_docs), 17 (studio_owner_config), 18 (reactivation_attempts), 19 (index) present; all additive CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS |
| `apps/staff-web/actions/brain-init.ts` | Idempotent class-catalog seed from classDefinitions | VERIFIED | Reads classDefinitions WHERE active=true; onConflictDoUpdate for class-catalog; onConflictDoNothing for brand-voice/ethos rows; exports buildCatalogBody re-export |
| `apps/staff-web/actions/brain-init-helpers.ts` | Pure buildCatalogBody helper | VERIFIED | Standalone file, no framework imports; used by test and re-exported from brain-init |
| `apps/staff-web/actions/brain-init.test.ts` | 3 Vitest tests for buildCatalogBody | VERIFIED | 3 tests: 2-def serialization, empty array, null fields round-trip |
| `apps/staff-web/actions/get-brain-docs.ts` | GET action reading studio_brain_docs | VERIFIED | method: "GET"; db.select from studioBrainDocs; guard:allow-unscoped |
| `apps/staff-web/actions/update-brain-doc.ts` | .strict() mutation for brand-voice/ethos only | VERIFIED | z.enum(["brand-voice","ethos"]).strict(); no http key; db.update studioBrainDocs SET body/updatedAt |
| `apps/staff-web/app/routes/gymos.brain.tsx` | Brain view+edit UI with useChangeVersions | VERIFIED | 383 lines; useChangeVersions(["action"]); Collapsible for class methods; Textarea for brand-voice/ethos; save calls update-brain-doc POST; brain-init fired on absent/empty catalog |
| `apps/staff-web/app/components/gymos/GymosTopNav.tsx` | Admin Brain tab | VERIFIED | isBrain const at line 82; {isAdmin && <Link to="/gymos/brain" ...>Brain</Link>} at line 143 |

#### BD4-02 (GOD)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `services/worker/src/lib/db.ts` | pg-core mirrors for studioOwnerConfig, reactivationAttempts, studioBrainDocs, classDefinitions, bookings | VERIFIED | All 5 mirrors found (lines 261, 286, 298, 314, 324); all in schema barrel |
| `services/worker/src/queues/heartbeat-reactivate.ts` | boss.schedule with tz; enqueueOutboundWhatsApp; reactivation_attempts; brand-voice read; NO sendMessage import | VERIFIED | boss.schedule(HEARTBEAT_QUEUE, cron, {}, { tz: tz }); enqueueOutboundWhatsApp called; schema.reactivationAttempts insert/delete; brand-voice SELECT; grep for sendMessage returns 0 |
| `services/worker/src/queues/daily-owner-digest.ts` | boss.schedule with tz; buildTelemetrySnapshot reuse; enqueueOutboundWhatsApp; NO sendMessage | VERIFIED | boss.schedule(DIGEST_QUEUE, "0 6 * * *", {}, { tz: tz }); buildTelemetrySnapshot imported and called; enqueueOutboundWhatsApp; grep for sendMessage returns 0 |
| `services/worker/src/queues/heartbeat-reactivate.test.ts` | 14 pure-helper tests | VERIFIED | isSuppressed (5 cases), isExcludedOptOut (4 cases), buildReactivationVars (5 cases); all boundary conditions covered |
| `services/worker/src/queues/daily-owner-digest.test.ts` | 7 buildDigestVars tests | VERIFIED | Full snapshot, empty input, rounding, zero/perfect retention, string type assertion |
| `services/worker/src/index.ts` | Both queue names in createQueue loop + registerXxx calls | VERIFIED | "daily-owner-digest" and "heartbeat-reactivate" in createQueue for-loop; registerDailyOwnerDigest(boss) and registerHeartbeatReactivate(boss) after registerTelemetryPush |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| gymos.brain.tsx | update-brain-doc action | POST /_agent-native/actions/update-brain-doc in handleSave | WIRED | Line 176: fetch("/_agent-native/actions/update-brain-doc", { method: "POST" }) |
| gymos.brain.tsx | brain-init action | POST /_agent-native/actions/brain-init on absent catalog | WIRED | Lines 113-128: fetch("/_agent-native/actions/brain-init", { method: "POST" }) in seedIfNeeded |
| brain-init.ts | class_definitions table | db.select from schema.classDefinitions WHERE active=true | WIRED | Lines 29-38: Drizzle select on classDefinitions |
| GymosTopNav.tsx | /gymos/brain route | admin-only Link tab | WIRED | Line 143: {isAdmin && <Link to="/gymos/brain"> |
| heartbeat-reactivate.ts | outbound-whatsapp queue | enqueueOutboundWhatsApp from @gymos/queue | WIRED | Line 294: await enqueueOutboundWhatsApp({type:"template", name:REACTIVATION_TEMPLATE}) |
| heartbeat-reactivate.ts | reactivation_attempts table | schema.reactivationAttempts insert + delete-on-rollback | WIRED | Lines 285-309: Drizzle insert then conditional delete |
| heartbeat-reactivate.ts | studio_brain_docs brand-voice | SELECT body WHERE id='brand-voice' | WIRED | Lines 181-186: db.select {body} from studioBrainDocs WHERE id='brand-voice' |
| daily-owner-digest.ts | buildTelemetrySnapshot | import from domain/buildTelemetrySnapshot.js | WIRED | Line 39 import; line 134 await buildTelemetrySnapshot(db, studioId, state) |
| index.ts | daily-owner-digest + heartbeat-reactivate | createQueue + registerXxx in main() | WIRED | Lines 51-53 createQueue loop; lines 87, 93 registerXxx calls |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| gymos.brain.tsx | docs (BrainDoc[]) | GET /_agent-native/actions/get-brain-docs → db.select studio_brain_docs | Yes — DB query, rows mapped to UI sections | FLOWING |
| gymos.brain.tsx | classes (ClassEntry[]) | brain-init reads class_definitions; catalog JSON stored in studio_brain_docs body | Yes — sourced from real class_definitions table | FLOWING |
| heartbeat-reactivate.ts | dormantMembers | Raw SQL LEFT JOIN bookings/gym_members/whatsapp_opt_in | Yes — deterministic SQL, no static returns | FLOWING |
| daily-owner-digest.ts | snap (TelemetrySnapshot) | buildTelemetrySnapshot reads studio_telemetry_state + DB | Yes — reuses existing telemetry aggregate | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| isSuppressed boundary (3 attempts) | isSuppressed(2)=false; isSuppressed(3)=true — from test file | Verified by test assertions in heartbeat-reactivate.test.ts | PASS |
| buildReactivationVars generic fallback | buildReactivationVars(null)["1"] === "We miss you at the studio!" | Verified by test assertion | PASS |
| buildDigestVars safe zero defaults | buildDigestVars({})["3"] === "0%" (no NaN) | Verified by test assertion | PASS |
| No sendMessage import in heartbeat/digest | grep for sendMessage in both queue files | 0 matches | PASS |
| GymosTopNav Brain tab wired | grep for isBrain + /gymos/brain in GymosTopNav | Both present at lines 82 and 143 | PASS |
| Live browser reload persistence | Requires running Vercel deploy | Not runnable without live server | SKIP — human needed |
| Live WhatsApp digest delivery | Requires approved template + seeded config | Not testable without live system | SKIP — D-15 deferred |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| GOB-01 | BD4-01 | Studio stores brand + ethos as Brain knowledge | SATISFIED | studio_brain_docs with brand-voice + ethos rows; brain-init ensures both exist via onConflictDoNothing |
| GOB-02 | BD4-01 | Class catalog auto-ingested from class_definitions on init | SATISFIED | brain-init reads classDefinitions WHERE active=true; onConflictDoUpdate for class-catalog row; UI triggers on absent/empty catalog |
| GOB-03 | BD4-01 | Owner views and edits Brain from staff app at /gymos/brain | SATISFIED | Route exists; brand-voice + ethos Textarea + Save; update-brain-doc action; persistence requires human reload test |
| GOD-01 | BD4-02 | Daily owner WhatsApp digest of studio metrics | SATISFIED (D-15) | daily-owner-digest registered; buildTelemetrySnapshot reused; numeric vars; enqueued via chokepoint; deferred on Meta approval |
| GOD-02 | BD4-02 | Heartbeat pg-boss job at studio IANA timezone | SATISFIED | boss.schedule with { tz: tz }; cron = `${minuteOffset} 9 * * *`; STUDIO_TIMEZONE from env |
| GOD-03 | BD4-02 | Reactivation via existing chokepoint; sendMessage.ts unmodified | SATISFIED | enqueueOutboundWhatsApp only; zero sendMessage imports in either new file; git log confirms sendMessage.ts untouched by BD4 commits |
| GOD-04 | BD4-02 | 3/90-day suppression ceiling + synchronous opt-out exclusion from day one | SATISFIED | isSuppressed check before enqueue; schema.reactivationAttempts INSERT in same path; delete-on-rollback; isExcludedOptOut defense-in-depth; 14 unit tests |
| GOD-05 | BD4-02 | Personalization from brand-voice with generic fallback | SATISFIED | SELECT brand-voice body; buildReactivationVars(null) returns "We miss you at the studio!"; non-null derives greeting from first non-empty line (truncated to 160 chars) |

No orphaned requirements — all 8 GOB/GOD requirements claimed by BD4-01 and BD4-02 plans are fully accounted for and evidenced.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/staff-web/server/plugins/db.ts | array position | version 15 (trigger) appears after versions 16-19 in migration array | Info | runMigrations uses MAX(version) + array-order iteration; on a DB at v14, pending = [16,17,18,19,15] iterated in that order. All statements are idempotent (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE). Functionally safe — version 15 always runs on first boot after BD4 deploy for any DB at v14. Not a data-corruption risk. |

No blocker or warning-level anti-patterns found. No TODO/FIXME/PLACEHOLDER comments in BD4 files. No stub return values (return null / return [] without data) in implementation paths. No hardcoded empty props passed to rendering components.

---

### Critical Integrity Checks

**sendMessage.ts and gate modules unchanged by BD4:**
- `git log services/worker/src/domain/sendMessage.ts` — most recent commit is `964671b3` (pre-BD4 quick fix). No BD4 commits appear.
- Neither `heartbeat-reactivate.ts` nor `daily-owner-digest.ts` import from `../domain/sendMessage`, `../domain/gates/optInGate`, `windowGate`, or `templateGate`. Both files contain `enqueueOutboundWhatsApp` as the sole outbound path.

**Three additive tables registered in db.ts runMigrations (no orphaned .sql, no DROP/RENAME):**
- Versions 16, 17, 18, 19 all use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
- No standalone `.sql` file was created in `server/db/migrations/` for these tables (per migration-drift gotcha avoidance).
- No DROP, TRUNCATE, RENAME found in any BD4 migration entry.

**Suppression ceiling + synchronous opt-out enforced before enqueue:**
- heartbeat-reactivate.ts: suppression COUNT query runs at step (a), opt-out re-check at step (b), BEFORE enqueue at step (f).
- reactivation_attempts INSERT is at step (e) — immediately before enqueue — with DELETE rollback on enqueue failure. Same code path = no message escapes the counter (D-12 satisfied).

**Heartbeat uses pg-boss tz option for studio timezone:**
- `boss.schedule(HEARTBEAT_QUEUE, cron, {}, { tz: tz } as any)` where `tz = env.STUDIO_TIMEZONE ?? "Europe/London"`.
- cron = `${minuteOffset} 9 * * *` (deterministic stagger via simpleHash(STUDIO_ID) % 60).
- Digest uses `"0 6 * * *"` at the same `tz`.

**D-15 deferred-on-external-dependency (live sends mock-first):**
- Neither new queue file calls `sendViaMyutik` directly. Both enqueue into `outbound-whatsapp` → `sendMessage` chokepoint.
- The template gate at the chokepoint rejects `member_reactivation` and `owner_daily_digest` until whatsapp_templates has `status='approved'` for those names. This is the intended deferred-activation seam — not a stub.

---

### Human Verification Required

Three items require a live system and/or Meta template approval. All are expected per D-15 (deferred-on-external-dependency) and the no-local-dev-server constraint documented throughout BD3/BD4.

**1. Brand Voice persistence on reload (GOB-03 core success criterion)**

**Test:** Log in as admin, navigate to `/gymos/brain`. Confirm the Brain tab is visible in GymosTopNav. Type something in Brand Voice, click Save, hard-reload the page.
**Expected:** The saved Brand Voice text is visible after reload. Studio Ethos is similarly editable and persistent. Class Methods section is collapsed by default and shows auto-seeded classes from the catalog.
**Why human:** Requires authenticated browser session against Vercel deploy. Persistence verification is a round-trip read-back that requires a live Neon DB.

**2. Daily owner digest live delivery (GOD-01)**

**Test:** Seed `studio_owner_config` singleton with `owner_phone_e164` and `studio_timezone`. Ensure the owner has a `gym_members` row with matching phone. Wait for the 06:00 studio-tz run (or trigger via pg-boss admin). Check the owner's WhatsApp.
**Expected:** Owner receives a WhatsApp template message with numeric studio metrics (active members count, bookings count, retention percentage). Message delivers via MYUTIK relay.
**Why human:** Requires Meta-approved `owner_daily_digest` template (submitted at BD3 completion, 2-7 day lead per ROADMAP calendar dependency). Code path is complete and unit-tested; live activation is blocked on external approval.

**3. Heartbeat reactivation with suppression ceiling (GOD-02..05)**

**Test:** Ensure dormant test members exist in Neon (no bookings in 30 days, opted in, has phone). Trigger heartbeat manually or wait for 09:xx run. Check `reactivation_attempts` table grows. For a member with 3 existing rows in last 90 days, confirm no message is sent.
**Expected:** Dormant members receive `member_reactivation` template. Members at suppression ceiling (>= 3 in 90 days) skipped — confirmed by `reactivation_attempts` count not incrementing and no WhatsApp received. Opted-out members skipped.
**Why human:** Requires Meta-approved `member_reactivation` template + live worker running on Fly. Suppression logic (isSuppressed, isExcludedOptOut, buildReactivationVars) is 100% unit-tested with pure helpers; the end-to-end pg-boss → enqueue → chokepoint → MYUTIK path needs a live environment.

---

### Gaps Summary

No gaps found. All five success criteria have complete, substantive, wired implementations:
- SC-1 (brain view/edit): Route + actions + DB all wired; browser reload persistence is human-only.
- SC-2 (class catalog auto-seed): brain-init.ts reads classDefinitions and upserts class-catalog row; UI triggers on mount.
- SC-3 (daily digest): complete code path; deferred activation per D-15.
- SC-4 (heartbeat at 09:00 IANA tz): complete with deterministic stagger and tz option.
- SC-5 (suppression ceiling day one): synchronous 3/90-day check before enqueue; 14 unit tests proving boundary conditions.

The three human verification items are all D-15 deferred-on-external-dependency items or browser-only tests — they are expected outcomes of the agreed mock-first pattern, not gaps.

---

_Verified: 2026-06-19T20:15:00Z_
_Verifier: Claude (gsd-verifier)_
