---
status: partial
phase: R4-staff-web-visual-refresh
source: [R4-VERIFICATION.md]
started: 2026-06-13T00:00:00Z
updated: 2026-06-13T00:00:00Z
---

## Current Test

[awaiting human testing — requires a live Vercel deploy of branch `redesign/ui-refresh`]

## Tests

### 1. Schedule class cards + capacity colors (SWEB-01, SWEB-02)
expected: Staff schedule shows class cards with name, time, and "X / Y booked". Capacity badge is muted at 4+ spots, amber at 1–3 spots, red/destructive when full (0). Today's date cell carries a studio-accent glow.
note: **Known limitation** — instructor is NOT shown (no instructor column in the schema). Decide whether the gym tracks instructors; if yes, that's a future additive-schema + data phase.
result: [pending]

### 2. Member context widget cards (SWEB-03)
expected: Opening a conversation shows the member context as scannable widget cards — Pass Balance pill (accent numeral), Next Class card, Last Visit — NOT a data table. "View Member Profile" button links to the member.
result: [pending]

### 3. Members directory card-default + table toggle (SWEB-05)
expected: /gymos/members defaults to a card grid (avatar, membership pill, next class). A Card/Table toggle (Tabs) switches to a compact table view via `?view=table`.
result: [pending]

### 4. Messages responsive + mobile bottom sheet (SWEB-06)
expected: At desktop width, side-by-side panes. At mobile width (≤md), single column; opening a conversation shows a member icon-button that opens member context in a bottom Sheet; a "← Messages" back link returns to the list.
result: [pending]

### 5. Role-based nav (SWEB-07)
expected: With `GYMOS_ADMIN_EMAILS` set, an admin sees Payments/Settings (and Analytics/Campaigns/Forms); a coach (email not in allowlist) sees only Home/Messages/Schedule/Members. Empty/unset allowlist = everyone admin (pilot default). Confirm the admin gate scope (admin currently also gates Analytics/Campaigns/Forms — confirm acceptable).
result: [pending]

### 6. Light theme only (SWEB-08)
expected: Staff web renders in light theme; no dark toggle; no system-dark flipping. Studio skin (R2) still applies.
result: [pending]

### 7. Embed widgets on light + dark host backgrounds (WDGT-01, WDGT-02, WDGT-03)
expected: `/embed/schedule` and the lead-capture form render as clean card layouts with a light/white default surface, themed by `--studio-accent`, readable inside an iframe on BOTH a light and a dark host page (use scripts/ui-baseline/ embed-light.html + embed-dark.html against the deploy). Lead form uses "Enquiry" vocabulary ("Enquire" / "Send Enquiry" / "Thanks for your enquiry").
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

- **SWEB-01 instructor field** — not shown; no instructor data in schema. Resolution path: additive schema column + data + card field, as a future phase IF the gym tracks instructors. Recorded as accepted known limitation, not a code defect.
