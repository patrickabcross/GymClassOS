---
status: partial
phase: AE2-schedule-write-tools
source: [AE2-VERIFICATION.md]
started: 2026-06-18T00:00:00Z
updated: 2026-06-18T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Agent creates a class → occurrence appears without reload
expected: Tell the agent "create a new HIIT class on Monday at 7am with 15 spots" on /gymos/schedule. create-class-definition + create-class-occurrence run; a new occurrence appears on the schedule grid WITHOUT a manual reload (useChangeVersions['action'] revalidator fires).
result: [pending]

### 2. Capacity guard rejects below active bookings
expected: Tell the agent "reduce the capacity of Tuesday's yoga to 8" when current bookings > 8. set-occurrence-capacity returns {error:'CAPACITY_BELOW_BOOKINGS', bookingCount, requestedCapacity} with NO mutation; with bookings <= 8 it saves directly.
result: [pending]

### 3. Cancel with bookings → proposal → atomic transaction, idempotent
expected: Tell the agent "cancel Friday's spin class" (an occurrence with active bookings). Agent calls propose-action (NOT cancel-occurrence directly) → a pending dashboard_proposals row with action_name='cancel-occurrence' appears on the noticeboard; approving runs ONE atomic transaction (bookings→cancelled + negative pass_debits for passId bookings + occurrence→cancelled); a second approve is a no-op (no duplicate refunds).
result: [pending]

### 4. Reschedule with bookings → routed through propose→approve
expected: Tell the agent "move Thursday's pilates to 9am" (an occurrence with active bookings). Routed through propose-action({actionName:'reschedule-occurrence'}); approval updates starts_at and recomputes ends_at from the definition durationMin. Agent does not call reschedule-occurrence directly.
result: [pending]

### 5. mark-complete rejects future; update-definition cannot set active
expected: Ask the agent to mark a FUTURE occurrence complete, and separately to edit a class definition's active flag. mark-occurrence-complete rejects the future occurrence with OCCURRENCE_IN_FUTURE; update-class-definition has no way to set active (schema omits it); past occurrences mark completed successfully.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
