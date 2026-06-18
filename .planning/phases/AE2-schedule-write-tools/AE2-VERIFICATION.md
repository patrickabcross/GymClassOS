---
phase: AE2-schedule-write-tools
verified: 2026-06-18T00:00:00Z
status: human_needed
score: 5/5 success criteria code-verified; runtime confirmation deferred to live Vercel deploy
human_verification:
  - test: "Tell the agent 'create a new HIIT class on Monday at 7am with 15 spots' on /gymos/schedule"
    expected: "create-class-definition + create-class-occurrence run; a new occurrence appears on the schedule grid WITHOUT a manual reload (useChangeVersions['action'] revalidator fires)"
    why_human: "Requires the live agent loop + DB write + browser revalidation; no-local-dev-server constraint means runtime cannot be replayed locally"
  - test: "Tell the agent 'reduce the capacity of Tuesday's yoga to 8' when current bookings > 8"
    expected: "set-occurrence-capacity returns {error:'CAPACITY_BELOW_BOOKINGS', bookingCount, requestedCapacity} with NO mutation; with bookings <= 8 it saves directly"
    why_human: "Guard logic is statically verified; the booking-count branch depends on live DB row state"
  - test: "Tell the agent 'cancel Friday's spin class' (an occurrence with active bookings)"
    expected: "Agent calls propose-action (NOT cancel-occurrence directly) -> a pending dashboard_proposals row with action_name='cancel-occurrence' appears on the noticeboard; approving runs ONE atomic transaction (bookings->cancelled + negative pass_debits for passId bookings + occurrence->cancelled); a second approve is a no-op (no duplicate refunds)"
    why_human: "Atomic transaction + idempotency + propose->approve UI flow require a live DB and the agent loop to confirm end to end"
  - test: "Tell the agent 'move Thursday's pilates to 9am' (an occurrence with active bookings)"
    expected: "Routed through propose-action({actionName:'reschedule-occurrence'}); approval updates starts_at and recomputes ends_at from the definition durationMin"
    why_human: "propose->approve routing + endsAt recompute need a live run to confirm the agent does not call reschedule-occurrence directly"
  - test: "Ask the agent to mark a FUTURE occurrence complete, and separately to edit a class definition's active flag"
    expected: "mark-occurrence-complete rejects the future occurrence with OCCURRENCE_IN_FUTURE; update-class-definition has no way to set active (schema omits it) — past occurrences mark completed successfully"
    why_human: "Future-guard branch and the absence-of-active behavior are statically proven; live confirmation of agent invocation is the UAT bar"
---

# Phase AE2: Schedule Write Tools Verification Report

**Phase Goal:** Coach can use the agent to manage class definitions and occurrences — create, set capacity, cancel (with atomic booking refund), reschedule, and mark complete — with high-risk operations gated behind propose→approve; reuses the gate wiring established in AE1.

**Verified:** 2026-06-18
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Coach can create a HIIT class via agent → occurrence appears on grid without reload | ✓ VERIFIED (code) / ? human (runtime) | `create-class-occurrence.ts` inserts a real `class_occurrences` row (status='scheduled'); registered in registry; named in agent-chat.ts; `gymos.schedule.tsx` loader queries classOccurrences + `useChangeVersions(["action"])` revalidator re-runs it. Full data flow wired. |
| 2 | Reduce capacity below active bookings → rejected, no mutation; else saves | ✓ VERIFIED | `set-occurrence-capacity.ts` counts `bookings WHERE status='booked'` (Number()-wrapped), early-returns `CAPACITY_BELOW_BOOKINGS` BEFORE any `.update()`; success path UPDATEs and returns `{updated:true}`. |
| 3 | Cancel with active bookings → proposal card → atomic transaction, no orphaned credits | ✓ VERIFIED | `cancel-occurrence.ts` runs ONE `db.transaction`: re-reads status (idempotency), batch-cancels bookings via inArray, inserts negative `pass_debit` (amount:-1, reason:'cancellation_refund') ONLY for passId-bookings, cancels occurrence last. Gated (no http key), reached only via propose→approve dispatch. |
| 4 | Reschedule with active bookings → routed through propose→approve | ✓ VERIFIED | `reschedule-occurrence.ts` gated (no http key); system prompt (lines 58-59) routes both cancel + reschedule ONLY via propose-action; approve-proposal.ts dynamic-imports it on actionName match. endsAt recomputed via `addMinutes(start, def.durationMin)`. |
| 5 | mark-complete rejects future; update-class-definition cannot touch active | ✓ VERIFIED | `mark-occurrence-complete.ts`: `new Date(occ.startsAt) > new Date()` → `OCCURRENCE_IN_FUTURE`. `update-class-definition.ts` builds an `updates` object that structurally omits `active` (only name/durationMin/defaultCapacity/category). |

**Score:** 5/5 truths code-verified. Runtime behavior (agent loop + live DB) deferred to UAT per the project's no-local-dev-server constraint.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `actions/set-occurrence-capacity.ts` | CAPACITY_BELOW_BOOKINGS guard (AES-02) | ✓ VERIFIED | Guard precedes UPDATE; Number()-wrapped count; no http key; guard:allow-unscoped on every query |
| `actions/update-class-definition.ts` | edit path, never active (AES-05) | ✓ VERIFIED | updates object cannot include active; DEFINITION_NOT_FOUND + empty-patch handled |
| `actions/mark-occurrence-complete.ts` | OCCURRENCE_IN_FUTURE guard (AES-06) | ✓ VERIFIED | future-reject + cancelled-reject + already-completed no-op |
| `actions/cancel-occurrence.ts` | atomic cancel+refund (AES-03) | ✓ VERIFIED | single db.transaction; idempotent; null-passId safe |
| `actions/reschedule-occurrence.ts` | recompute endsAt (AES-04) | ✓ VERIFIED | addMinutes from definition durationMin; gated |
| `actions/create-class-occurrence.ts` | create path (AES-01) | ✓ VERIFIED | real insert; pre-existing (95e1f0da); now exposed |
| `.generated/actions-registry.ts` | imports + map entries for all 5 new actions | ✓ VERIFIED | 5 aliases + 5 kebab keys present (gitignored, on-disk; regenerated on build — matches AE1 precedent) |
| `actions/approve-proposal.ts` | ALLOWLIST + dispatch | ✓ VERIFIED | both gated names in ACTION_ALLOWLIST + 2 dispatch branches with re-validation |
| `actions/propose-action.ts` | Zod enum (5 members) | ✓ VERIFIED | both gated names in enum + description |
| `server/db/schema.ts` | dashboardProposals.actionName enum (5) | ✓ VERIFIED | both gated names in text() enum; no migration (additive TS-only) |
| `actions/view-screen.ts` | schedule branch (AEX-01) | ✓ VERIFIED | nav.view==='schedule' before generic email branch; upcoming occurrences + booking counts + selectedOccurrence |
| `server/plugins/agent-chat.ts` | Schedule section (AEX-01/04) | ✓ VERIFIED | names 5 direct actions; routes 2 gated ONLY via propose-action |
| `app/routes/gymos.schedule.tsx` | live-refresh (AEX-03) | ✓ VERIFIED | useChangeVersions(["action"]) + useRevalidator, dep array [actionVersion] (no loop) |
| `AGENTS.md` | action rows + two-exposure note | ✓ VERIFIED | 5 new rows; 2 gated marked; two-exposure note for AE2 |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| approve-proposal.ts | cancel-occurrence.ts | dynamic import on actionName==='cancel-occurrence' | ✓ WIRED (line 68) |
| approve-proposal.ts | reschedule-occurrence.ts | dynamic import on actionName==='reschedule-occurrence' | ✓ WIRED (line 70) |
| cancel-occurrence.ts | schema.passDebits | negative-amount insert for passId bookings | ✓ WIRED (reason:'cancellation_refund', amount:-1) |
| reschedule-occurrence.ts | schema.classDefinitions | fetch durationMin, addMinutes | ✓ WIRED |
| set-occurrence-capacity.ts | schema.bookings | count(booked) guard before UPDATE | ✓ WIRED |
| registry | 5 action files | import alias + map entry | ✓ WIRED (lines 42-47, 115-120) |
| gymos.schedule.tsx | @agent-native/core/client | useChangeVersions(["action"]) + revalidate | ✓ WIRED |
| view-screen.ts | schema.classOccurrences | nav.view==='schedule' branch | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| gymos.schedule.tsx | occurrences (loader) | DB query `classOccurrences` join `classDefinitions` | Yes (live query, re-run on action) | ✓ FLOWING |
| view-screen schedule branch | screen.schedule.upcomingOccurrences | DB query + per-occurrence booking count | Yes | ✓ FLOWING |
| cancel-occurrence | activeBookings / refundable | DB select bookings inside tx | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Whole staff-web app compiles with all AE2 edits | `npx tsc --noEmit` (apps/staff-web) | EXIT 0 | ✓ PASS |
| No stub/TODO markers in 5 new action files | grep TODO/FIXME/placeholder | empty | ✓ PASS |
| Gated actions have no http key | grep `http:` in cancel-occurrence.ts | 0 matches | ✓ PASS |
| Runtime agent-loop behaviors (criteria 1-5) | n/a — needs live server + DB | — | ? SKIP (no-local-dev-server; UAT) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| AES-01 | AE2-03 | Agent creates class occurrence | ✓ SATISFIED | create-class-* registered + named in prompt; view-screen context branch |
| AES-02 | AE2-01 | Change capacity, reject below bookings | ✓ SATISFIED | set-occurrence-capacity guard |
| AES-03 | AE2-02 | Cancel via propose→approve, atomic refund | ✓ SATISFIED | cancel-occurrence transaction + gate wiring |
| AES-04 | AE2-02 | Reschedule via propose→approve | ✓ SATISFIED | reschedule-occurrence gated + endsAt recompute |
| AES-05 | AE2-01 | Create/edit class definition | ✓ SATISFIED | update-class-definition (active-safe) + create-class-definition |
| AES-06 | AE2-01 | Mark past occurrence complete | ✓ SATISFIED | mark-occurrence-complete future-guard |

No orphaned requirements — all 6 AES IDs are declared across the three plans and mapped to Phase AE2 in REQUIREMENTS.md.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder/stub patterns in any of the 7 modified/created source files. No `return null`/empty-data stubs. Gated actions correctly omit the `http` key. Every gym-table query carries the required `// guard:allow-unscoped` comment.

### Human Verification Required

Per the project's no-local-dev-server constraint, runtime DB replay was not performed locally — the bar is tsc + grep + code inspection, with runtime confirmation rolling into the live Vercel deploy. The 5 success criteria are fully wired and statically verified; live confirmation of the agent loop, atomic transaction, idempotency, and live-refresh is captured as UAT (see `human_verification` frontmatter).

### Gaps Summary

No code gaps found. All 5 success criteria are code-verified end to end:
- All 5 new action files exist, are substantive, are registered, and compile.
- The propose→approve gate is atomic across all three sites (allowlist+dispatch, propose-action enum, schema enum) plus the registry — reusing the AE1 chokepoint exactly.
- cancel-occurrence is a single atomic transaction with idempotency and null-passId safety; no orphaned credits possible by construction.
- The two gated actions are reachable ONLY via propose-action (no standalone direct-tool bullets; no http key).
- The schedule route live-refreshes on the "action" change source; view-screen is context-aware of the Schedule tab.

The only outstanding items are runtime behavioral confirmations, which are inherently deferred to the live deploy under the no-local-dev-server constraint. Status is `human_needed` rather than `passed` solely because those runtime checks cannot be executed in this environment.

---

_Verified: 2026-06-18_
_Verifier: Claude (gsd-verifier)_
