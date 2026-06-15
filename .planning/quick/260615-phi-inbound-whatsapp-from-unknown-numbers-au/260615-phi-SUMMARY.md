---
phase: quick-260615-phi
plan: 01
subsystem: whatsapp
tags: [whatsapp, inbox, worker, templates, prospects]
requirements: [WA-INBOUND-UNKNOWN, WA-TEMPLATE-PRUNE]
dependency-graph:
  requires:
    - "services/worker/src/domain/conversations.ts (upsertConversationAndMessage)"
    - "apps/staff-web/app/routes/gymos.messages.tsx (sync-templates branch)"
    - "gym_members.phone_e164 partial UNIQUE index (P1c-01)"
    - "whatsapp_templates.last_synced_at TEXT column (P1b-02)"
  provides:
    - "Inbound WhatsApp from unknown numbers auto-creates a member + open conversation"
    - "On-demand template sync prunes stale templates from a previous account"
  affects:
    - "Staff inbox (new prospects now visible)"
    - "TemplatesDialog template picker (reflects currently-connected account)"
tech-stack:
  added: []
  patterns:
    - "Race-safe auto-create: INSERT onConflictDoNothing(phone_e164 partial unique) + re-SELECT"
    - "Defensive payload parser (try/catch + optional chaining, never throws, E.164 fallback)"
    - "Prune-on-success via syncStartedAt watermark (TEXT ISO lexicographic compare)"
key-files:
  created: []
  modified:
    - "services/worker/src/domain/conversations.ts"
    - "services/worker/src/domain/conversations.test.ts"
    - "apps/staff-web/app/routes/gymos.messages.tsx"
decisions:
  - "Single firstName field set to profile.name or E.164 (no name splitting) per locked plan decision"
  - "member_create_failed defensive guard if re-select still null after insert-or-conflict"
  - "pruned count surfaced in syncResult return (additive); TemplatesDialog left as-is"
metrics:
  duration_min: 11
  completed: 2026-06-15
  tasks: 2
  files: 3
---

# Phase quick-260615-phi Plan 01: Inbound WhatsApp From Unknown Numbers + Stale Template Pruning Summary

Inbound WhatsApp from a number not in `gym_members` now auto-creates a member + open conversation (so new prospects appear in the staff inbox), and the on-demand "Update templates" sync prunes templates left over from a previously-connected WhatsApp account.

## What Was Built

### Task 1 — Auto-create gym_member for inbound from unknown numbers (worker)

`upsertConversationAndMessage` previously early-returned `unknown_phone` and silently dropped any inbound from a number not already in `gym_members`. That early-return is replaced with an auto-create branch:

- **Name resolution** — new `resolveInboundDisplayName(rawPayload, fromE164)` helper parses the Meta webhook envelope at `entry[0].changes[0].value.contacts[0].profile.name`. It wraps `JSON.parse` in try/catch, optional-chains every hop, trims the name, and falls back to the E.164 number for empty/missing names, malformed JSON, or the synthetic `{synthetic:true,...}` fallback payload. It never throws.
- **Race-safe INSERT** — `db.insert(schema.gymMembers).values({ id: nanoid(), firstName: resolvedName, lastName: null, phoneE164: fromE164 }).onConflictDoNothing({ target: phoneE164, where: sql\`...is not null\` })`, mirroring the existing `messages.externalId` onConflict-with-where pattern. The `where` predicate matches the partial UNIQUE index (`WHERE phone_e164 IS NOT NULL`) so Postgres does not raise 42P10.
- **Re-SELECT** — after the insert-or-conflict, the member is re-selected by `phoneE164`, so concurrent inbound from the same new number (localConcurrency=5) all resolve to the one winning row. A defensive `member_create_failed` guard returns if the re-select is somehow still null.
- The function then falls through into the **unchanged** conversation-upsert + message-insert + opt-in logic, so the new prospect gets an `open` conversation, the message row, and a `whatsapp_opt_in` row with `source='inbound_reply'` — exactly like a known member.
- `materialiseOutboundMirror`'s `unknown_phone` early-return is untouched (genuinely different case — unknown customer on the outbound-mirror path).

TDD: `conversations.test.ts` extended (RED first, then GREEN) with Test A (auto-create → member + open conversation + message + opt-in, processed:true), Test B (profile.name trimmed / synthetic-fallback E.164 / malformed-JSON E.164), and a `member_create_failed` defensive-guard test. A `memberInsertChain` mock + `"member"` insert-sequence entry were added. The known-member, duplicate-wamid, and outbound-mirror tests still pass unchanged.

### Task 2 — Prune stale templates on successful sync (staff-web)

In the `sync-templates` action branch of `gymos.messages.tsx`:

- A `syncStartedAt = new Date().toISOString()` watermark is captured immediately after `getDb()`, before the MYÜTIK fetch loop. Every row refreshed by this sync writes `lastSyncedAt: new Date().toISOString()` (strictly later than the watermark).
- After the loop completes successfully and only when `synced > 0`, a raw `(db as any).execute(sql\`delete from whatsapp_templates where last_synced_at < ${syncStartedAt}\`)` removes rows not refreshed by this account. TEXT-vs-TEXT comparison works because ISO 8601 strings sort lexicographically === chronologically.
- The `synced > 0` guard prevents wiping the picker on a transient/empty pull; the existing `MYÜTIK ${res.status}` and missing-API-key early-returns prevent pruning on error.
- The success return is now `{ ok: true, synced, pruned }` (additive — `TemplatesDialog` reads `synced` and ignores the extra field).

## Verification

- `cd services/worker && pnpm vitest run src/domain/conversations.test.ts` — 13/13 green (including the 3 new auto-create / name-resolution / defensive-guard tests).
- Full worker suite: `pnpm vitest run` — 92/92 green across 15 files (no regressions).
- `pnpm typecheck` (worker) — exit 0.
- `npx tsc --noEmit -p tsconfig.json` (staff-web) — no type errors in `gymos.messages.tsx`.
- Prettier run on all three changed files.
- Fork boundary held: only `services/worker/**` and `apps/staff-web/**` touched; no `templates/**` or `packages-vendored/**`; no DB schema changes (existing columns + existing partial unique index only).

## Deviations from Plan

### Could not verify payload shape against live Neon (constraint not satisfiable in this environment)

- **Found during:** Task 1 pre-implementation step.
- **Constraint:** The plan and execution constraints required querying a recent `webhook_events.payload_raw` row via Neon MCP (project `billowing-sun-51091059`) to confirm the `contacts[0].profile.name` path before finalising the parser.
- **Issue:** No Neon MCP tool was available in this agent's toolset, and the isolated worktree has no `.env`/`DATABASE_URL` (gitignored, not copied into worktrees), so a direct DB query was also not possible.
- **Mitigation:** The parser was written defensively per the plan's exact path specification — `JSON.parse` wrapped in try/catch, every hop optional-chained, and an empty/missing/malformed result falls back to the E.164 number. If the live payload shape differs from the documented Meta Cloud API envelope, the parser degrades gracefully to the phone-number fallback rather than throwing or breaking the inbound pipeline. **Recommended follow-up:** confirm the `profile.name` path against a real `webhook_events` row when DB access is available, and broaden the path if the real shape differs (cheap, isolated change in `resolveInboundDisplayName`).

### [Rule 3 - Blocking] Installed workspace dependencies + built gitignored workspace dist

- **Found during:** Task 1 verification (running Vitest).
- **Issue:** The isolated worktree had no `node_modules` installed, so `pnpm vitest` failed with "vitest not found".
- **Fix:** Ran `pnpm install --frozen-lockfile` at the workspace root. This also ran postinstall builds for workspace packages (`@gymos/queue`, `@gymos/whatsapp`, etc.), writing their gitignored `dist/` output. Per the execution constraints, building gitignored dist is acceptable.
- **Build output NOT committed:** `git status` confirmed only the three task source files were staged. The one non-source change `pnpm install` left in the tree (`packages/scheduling/docs/llms-full.txt`, a postinstall regeneration) was deliberately left unstaged and out of both commits.

## Known Stubs

None. Both fixes wire real behaviour against existing tables and indexes; no placeholder data or unwired components were introduced.

## Self-Check: PASSED

- FOUND: services/worker/src/domain/conversations.ts
- FOUND: services/worker/src/domain/conversations.test.ts
- FOUND: apps/staff-web/app/routes/gymos.messages.tsx
- FOUND commit 00f25622 (Task 1)
- FOUND commit 6e3afe28 (Task 2)
