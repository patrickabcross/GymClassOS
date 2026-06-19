---
phase: BD3
plan: "03"
subsystem: hqd-send-foundation
tags:
  - hq-waba
  - gates
  - migrations
  - tdd
  - ci-guard
dependency_graph:
  requires:
    - BD2-01 (hq-schema base migrations v1-v7)
    - BD2-05 (services/hq-worker base, db.ts, provision pattern)
  provides:
    - hq_whatsapp_opt_in table (v8 migration)
    - hq_whatsapp_templates table (v9 migration)
    - hasOwnerOptIn gate (HQ-owned)
    - isOwnerInWindow gate (HQ-owned)
    - isOwnerTemplateApproved gate (HQ-owned)
    - HqWabaClient interface + mockHqWabaClient
    - sendOwnerMessage orchestrator (gate-ordered)
    - guard:hqd-no-worker-import CI guard
  affects:
    - BD3-04 (HQD-02 send-owner-whatsapp defineAction will call sendOwnerMessage)
    - BD4 (GOD gate pattern mirrors this HQD pattern)
tech_stack:
  added: []
  patterns:
    - TDD (RED→GREEN) for all three gate files and sendOwnerMessage
    - Mirror pattern (copy logic, never import) for D-07 WABA separation
    - Injected-client deferred-on-external-dependency mock (mirrors BD2 provision-studio)
    - Additive-only migrations v8+v9 (CREATE TABLE IF NOT EXISTS, dual-dialect)
key_files:
  created:
    - packages/hq-schema/src/migrations.ts (v8 + v9 appended)
    - packages/hq-schema/src/schema.ts (hqWhatsappOptIn + hqWhatsappTemplates appended)
    - services/hq-worker/src/lib/gates/ownerOptInGate.ts
    - services/hq-worker/src/lib/gates/ownerOptInGate.test.ts
    - services/hq-worker/src/lib/gates/ownerWindowGate.ts
    - services/hq-worker/src/lib/gates/ownerWindowGate.test.ts
    - services/hq-worker/src/lib/gates/ownerTemplateGate.ts
    - services/hq-worker/src/lib/gates/ownerTemplateGate.test.ts
    - services/hq-worker/src/lib/hq-waba-client.ts
    - services/hq-worker/src/domain/sendOwnerMessage.ts
    - services/hq-worker/src/domain/sendOwnerMessage.test.ts
    - scripts/guard-hqd-no-worker-import.mjs
  modified:
    - services/hq-worker/src/lib/db.ts (added hqWhatsappOptIn + hqWhatsappTemplates pg-core defs)
    - package.json (guard:hqd-no-worker-import added + wired into guards chain)
decisions:
  - "D-07 mirror pattern enforced: gate logic COPIED verbatim from services/worker gates, names/tables adapted, CI guard prevents drift back to imports"
  - "lastInboundAt added to hq_whatsapp_opt_in (not in original research spec v8 SQL but required by ownerWindowGate — added per Rule 2)"
  - "sendOwnerMessage client is injected (not imported singleton) so vi.mock of db.js + gate modules is sufficient in tests without a real HQ Neon"
  - "createHqWabaClient throws 'deferred-on-external-dependency' error (acceptable stub per D-13) until HQ WABA phone number registration in Meta Business Manager completes"
metrics:
  duration: 461s
  completed: "2026-06-19"
  tasks: 3
  files: 12
---

# Phase BD3 Plan 03: HQD Send Foundation Summary

HQ WhatsApp send foundation with additive migrations, three HQ-owned compliance gates mirroring the studio chokepoint, a mockable WABA client, and the gate-ordered `sendOwnerMessage` orchestrator — all built and unit-tested with the WhatsApp client mocked (D-13 deferred-on-external-dependency). A CI guard enforces the WABA-separation boundary (D-07).

## What Was Built

### Task 1: Additive migrations v8 + v9 + Drizzle defs (9e34f741)

Appended two new dual-dialect migrations to `packages/hq-schema/src/migrations.ts`:

- **v8 `hq_whatsapp_opt_in`**: gym-owner opt-in tracking for HQ WABA B2B comms (HQD-01). One row per studio (UNIQUE studio_id). Columns: id, studio_id, owner_email, phone_e164, last_inbound_at, opted_in_at, opted_out_at, opt_in_source, created_at. STRUCTURAL EXCLUSION: owner_email + phone_e164 are the gym-owner's own B2B contact info, NOT gym member data. HQ Neon physically contains no member records.
- **v9 `hq_whatsapp_templates`**: approved HQ owner-comms template registry (HQD-03). Mirrors studio whatsapp_templates pattern. Status: pending | approved | rejected.

Matching Drizzle defs appended to `packages/hq-schema/src/schema.ts` (`hqWhatsappOptIn`, `hqWhatsappTemplates`). `guard:hq-no-pii` passes — no `*connection*`, `*database_url*`, or `*dsn*` column names.

### Task 2: Three HQ-owned gates + WABA separation CI guard (8daa6a56)

Three gate files in `services/hq-worker/src/lib/gates/`, each a D-07-compliant mirror of the corresponding studio gate:

- **ownerOptInGate.ts**: `hasOwnerOptIn(studioId, db)` — queries `hq_whatsapp_opt_in` where studioId. Returns `rows.length > 0 && rows[0].optedOutAt == null`. Carries `guard:allow-unscoped` comment.
- **ownerWindowGate.ts**: `isOwnerInWindow(lastInboundAt, now)` — pure function, copy of windowGate.ts. `OWNER_WINDOW_HOURS = 24`. No DB access.
- **ownerTemplateGate.ts**: `isOwnerTemplateApproved(name, db)` — queries `hq_whatsapp_templates` where name AND status='approved'. Carries `guard:allow-unscoped` comment.

Three `.test.ts` files covering all behavior bullets from the plan (11 gate tests total).

`services/hq-worker/src/lib/db.ts` extended with `hqWhatsappOptIn` and `hqWhatsappTemplates` pg-core table defs added to the `schema` export object.

`scripts/guard-hqd-no-worker-import.mjs` created — scans `apps/hq/` and `services/hq-worker/` for import specifiers containing `services/worker` or `services/edge-webhooks`. Exit 1 on any violation (comment lines skipped). Wired into `package.json` as `guard:hqd-no-worker-import` and appended to the `guards` chain.

### Task 3: HqWabaClient mock + sendOwnerMessage orchestrator (ca113104)

- **hq-waba-client.ts**: `HqWabaClient` interface + `SendOwnerMessagePayload` discriminated union type. `mockHqWabaClient` returns `{ wamid: 'mock-wamid-{timestamp}' }`. `createHqWabaClient` stub throws `deferred-on-external-dependency` error documenting the Meta registration step (D-13).
- **sendOwnerMessage.ts**: Gate-ordered orchestrator implementing D-09 exactly:
  1. `hasOwnerOptIn(studioId, db)` → `OwnerNoOptInError`
  2. Load row → `phone_e164 + last_inbound_at`
  3. `isOwnerInWindow(lastInboundAt)` (text only) → `OwnerWindowExpiredError`
  4. `isOwnerTemplateApproved(name, db)` (template only) → `OwnerTemplateNotApprovedError`
  5. `client.sendMessage({ to: phoneE164, payload })` → `{ wamid }`

  Typed errors exported: `OwnerNoOptInError`, `OwnerWindowExpiredError`, `OwnerTemplateNotApprovedError`.
- **sendOwnerMessage.test.ts**: 6 tests covering all behavior bullets. Gate modules vi.mocked for outcome control. `mockHqWabaClient` injected — no live WABA calls.

## Verification Results

- `pnpm -F @gymos/hq-worker test --run`: **44/44 tests pass** (10 test files)
- `pnpm guard:hq-no-pii`: **clean**
- `pnpm guard:hqd-no-worker-import`: **clean**
- `grep -rn "services/worker" services/hq-worker/src/ apps/hq/`: all matches are in comments only (no import statements)
- Migrations: additive only — `CREATE TABLE IF NOT EXISTS`, no DROP/RENAME/TRUNCATE

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added `last_inbound_at` to migration v8 SQL**
- **Found during:** Task 1
- **Issue:** The RESEARCH.md v8 SQL block (lines 374-385) omitted `last_inbound_at TEXT` from the CREATE TABLE statement, though the research text described it as required and the Drizzle def spec (lines 409-428) included `lastInboundAt`.
- **Fix:** Added `last_inbound_at TEXT` column to both postgres and sqlite dialect of the v8 migration SQL, consistent with the RESEARCH.md Drizzle def and the ownerWindowGate design.
- **Files modified:** `packages/hq-schema/src/migrations.ts`
- **Commit:** 9e34f741

## Known Stubs

- **`createHqWabaClient`** in `services/hq-worker/src/lib/hq-waba-client.ts`: throws a `deferred-on-external-dependency` error. This is intentional per D-13 — live HQ WABA sends are blocked on Meta Business Manager phone number registration + Meta template approval. The production path will replace the stub body with a `@great-detail/whatsapp` client instance when creds are available.
- The `messageId` parameter in `sendOwnerMessage` is accepted but not currently used to update an HQ message row status (step 6 in the RESEARCH.md description). This is acceptable for BD3-03 scope — the HQ message table is not yet created; BD3-04 will wire the full message lifecycle.

## Live WABA Send Status

DEFERRED-ON-EXTERNAL-DEPENDENCY (D-13):
- Requires HQ second phone number registration in Meta Business Manager
- Requires Meta approval of HQ owner-comms templates (2-7 day lead time)
- Build + mock-tested now; live path unblocked when manual steps complete

## Requirements Fulfilled

- HQD-01: hq_whatsapp_opt_in tracks gym-owner opt-in; structurally separate from any studio WABA; HQ WABA creds path defined (mock)
- HQD-03: 24h-window + approved-template gating implemented on the HQ-owned send path, mirroring (never importing) the studio chokepoint

## Self-Check: PASSED

Files exist:
- packages/hq-schema/src/migrations.ts — FOUND (v8 + v9 appended)
- packages/hq-schema/src/schema.ts — FOUND (hqWhatsappOptIn + hqWhatsappTemplates)
- services/hq-worker/src/lib/gates/ownerOptInGate.ts — FOUND
- services/hq-worker/src/lib/gates/ownerWindowGate.ts — FOUND
- services/hq-worker/src/lib/gates/ownerTemplateGate.ts — FOUND
- services/hq-worker/src/lib/hq-waba-client.ts — FOUND
- services/hq-worker/src/domain/sendOwnerMessage.ts — FOUND
- scripts/guard-hqd-no-worker-import.mjs — FOUND

Commits exist:
- 9e34f741 — Task 1: migrations + Drizzle defs
- 8daa6a56 — Task 2: gates + CI guard
- ca113104 — Task 3: HqWabaClient + sendOwnerMessage
