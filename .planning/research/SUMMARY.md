# Research Summary — GymClassOS v1.2 Agentic Tab Editing

**Project:** GymClassOS v1.2 — Agent Write Tools for Forms, Schedule, Members
**Domain:** LLM agent write-access layer on an existing single-tenant staff-web app
**Researched:** 2026-06-18
**Confidence:** HIGH — all four research files based on direct codebase inspection; no web research required

> Prior (v1.0) project research summary archived alongside this file as `SUMMARY-v1.0-archived.md`.

---

## Executive Summary

v1.2 closes the agent-native parity gap for three tabs: the agent can currently read Forms, Schedule, and Members data but cannot write it. The milestone wraps those same Drizzle mutations in `defineAction` agent tools, classifies each operation as direct-write or propose-approve-gated, restructures the system prompt with per-tab capability sections, and wires `useChangeVersion("action")` into the three tab routes so the UI live-refreshes when the agent writes.

The central architectural finding: **zero new dependencies required.** Every primitive needed — `defineAction`, `.generated/actions-registry.ts`, `agent-chat.ts`, `propose-action`/`approve-proposal`, `useChangeVersion`, `readAppState`/`writeAppState` — is already in production use. The work is additive TypeScript in `apps/staff-web/actions/` plus targeted edits to ~5 existing files. The existing `/api/forms/[...path].ts` HTTP handler is left untouched; new agent actions call Drizzle directly alongside it (the pattern `send-template-to-members.ts` already uses).

The key risks are correctness/compliance, not technical: the propose→approve gate is NOT automatically inherited by new actions (two files must be updated atomically — `ACTION_ALLOWLIST` in `approve-proposal.ts` and the Zod enum in `propose-action.ts`); `update-member-profile` must be `.strict()` and hard-exclude consent/opt-in fields; `cancel-occurrence` must refuse direct execution when bookings exist (`BOOKINGS_EXIST`) and route through propose→approve with pass-credit refunds. One schema question (`gym_members.notes`) must be verified before the Members plan — see Open Questions (resolved below in STATE/roadmap if confirmed).

---

## Key Findings

### Stack (STACK.md)
Zero new npm packages, zero new infra. Five-step write-tool workflow reuses existing primitives. `defineAction` registers as LLM tool + HTTP endpoint + triggers `useDbSync` invalidation on POST. **Registry exposure and system-prompt documentation are TWO INDEPENDENT steps, both required.** Do NOT put `http: { method: "GET" }` on write actions — GET suppresses `useDbSync` poll invalidation and the UI won't refresh.

### Features (FEATURES.md)
Organising principle: "how reversible is this, and does it affect members?" — drives HITL posture.
- **Forms (direct unless noted):** create-form, update-form (`.strict()`, status EXCLUDED), publish-form (GATED), unpublish-form, archive-form, restore-form, list/get. Anti-features: purge responses, auto-publish, edit slug, edit responses.
- **Schedule (direct unless noted):** list-occurrences, create-occurrence, update-capacity (CAPACITY_TOO_LOW guard), cancel-occurrence (GATED — BOOKINGS_EXIST guard + pass refund), reschedule (GATED), complete. Anti-features: hard-delete, auto-notify on cancel, direct pass debit/refund, bulk-cancel future.
- **Members (direct):** update-member-profile — firstName/lastName/email/phoneE164/notes ONLY; `.strict()` excludes marketingConsent/whatsappOptIn/userId. Anti-features: delete member, edit consent/opt-in, pass grants, link userId, send WhatsApp.
- **MVP order if pressured:** Forms (create+update-meta+publish+archive) → Schedule (capacity+cancel+create) → Members (notes+name+email+phone).

### Architecture (ARCHITECTURE.md v1.2 section)
Do NOT refactor `/api/forms/[...path].ts`. ~15 new action files, ~5 modified files, 0 schema changes (pending notes verification). Two-exposure steps per action (registry → callable; system-prompt bullet → agent knows). UI live-refresh: `useChangeVersion("action")` in queryKey + `initialData: loaderData` + `staleTime: 2_000`; `useDbSync` emits `source:"action"` after non-GET actions. Per-tab nav sync via `useNavigationState().sync()` on mount; agent receives active tab + selected id as `<current-screen>` block. Within each tab: actions → nav sync → system prompt → useQuery migration; ship each action wave before adding to system prompt (HTTP-test first).

### Critical Pitfalls (PITFALLS.md)
- **CRITICAL A-01 — gate not inherited:** new actions are callable the moment they hit the registry. Gated ops must NOT be exposed as direct tools; ACTION_ALLOWLIST + propose-action Zod enum updated in same commit. (publish-form, cancel-occurrence, reschedule-occurrence)
- **CRITICAL A-02 — consent mutation:** `update-member-profile` `.strict()`, exclude marketingConsent/whatsappOptIn/optedInAt/optedOutAt. Violation = GDPR/Meta incident, no rollback.
- **CRITICAL A-03 — cancel with bookings:** count `bookings WHERE status='booked'`; if >0 return `{error:"BOOKINGS_EXIST", bookingCount}` without mutating; approval path does bookings→cancelled + negative `pass_debits` refunds + occurrence cancel in ONE transaction.
- **HIGH A-04 — fields JSON:** validate `fields` against FormField Zod before write (create/update/publish). Malformed JSON silently breaks the public renderer + submission handler.
- **HIGH A-08 — over-broad tools:** per-tab system-prompt sections, not a flat list; don't call another tab's tools without navigating.
- **HIGH A-07 — optimistic desync:** instruct agent to `view-screen` before writes (full OCC is post-v1.2).

---

## Implications for Roadmap

**Suggested phases (build order):**
1. **Forms Write Tools** — lowest risk, demo-relevant, establishes the five-step pattern. Avoid A-04, A-01, no WhatsApp side effects in publish.
2. **Schedule Write Tools** — highest operational value; reuses Phase 1's gated wiring. Hardest correctness: A-03 cancel booking+pass transaction; A-10 occurrence-id vs definition-id. Plan-time: read `pass_debits` schema.
3. **Members Write Tools** — technically simplest, highest compliance sensitivity. A-02 consent exclusion is the key constraint. Plan-time gate: verify `gym_members.notes` exists first.
4. **(optional) Integration & Hardening** — end-to-end gate verification, cancel transaction test, per-tab prompt verification, live-refresh timing. Use the PITFALLS "Looks Done But Isn't" checklist as sign-off.

System-prompt per-tab update ships LAST within each wave.

---

## Open Questions
- **OQ-1 (BLOCKING Phase 3): Does `gym_members.notes` exist?** Flagged ABSENT (LOW confidence). Verify in `schema.ts`/DB before Members plan. If absent, an additive `notes text` column (via runMigrations / generate+migrate — never drizzle-kit push) is the ONLY schema change in the milestone.
- **OQ-2:** Extend `propose-action` Zod enum (preferred) vs new actions self-writing proposal rows. Pick one in requirements.
- **OQ-3:** Dedicated `list-occurrences` action vs reuse `list-fill-rate` for schedule context. Confirm at Phase 2 by reading `list-fill-rate` return shape.

---

## Confidence Assessment
| Area | Confidence | Notes |
|------|------------|-------|
| Stack (zero new deps, defineAction workflow) | HIGH | 10+ production action files inspected |
| Features (operations, HITL classification) | HIGH | PROJECT.md constraints + schema inspection |
| Architecture (file list, data flow, live-refresh) | HIGH | agent-chat.ts, approve-proposal.ts, propose-action.ts, real-time-sync SKILL.md |
| Pitfalls (correctness/compliance controls) | HIGH | A-02/A-03 vs schema.ts + submissions.ts; A-01 vs allowlist |

*Research completed 2026-06-18 | Ready for requirements + roadmap.*
