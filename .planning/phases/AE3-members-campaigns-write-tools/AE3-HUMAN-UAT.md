---
status: partial
phase: AE3-members-campaigns-write-tools
source: [AE3-VERIFICATION.md]
started: 2026-06-19
updated: 2026-06-19
---

## Current Test

[awaiting human testing] — run on the live deploy: **https://gym-class-os.vercel.app/gymos** (AE3 live as of commit `120d11c3`, deployed 2026-06-19). Use `/gsd:verify-work AE3`.

## Tests

### 1. Member phone update + live-refresh
expected: On the Vercel deploy, ask the agent on /gymos/members "update Sarah's phone to +447700900123". The gym_members row reflects the E.164 value (confirm via Neon MCP); the member profile card + directory refresh without a manual reload.
result: [pending]

### 2. Consent / opt-in refusal
expected: Ask the agent "opt Sarah into WhatsApp" or "change her marketing consent". The agent clearly refuses; no whatsapp_opt_in / marketing_consent change in the DB (the `.strict()` schema rejects the keys at parse time AND the system prompt instructs a decline).
result: [pending]

### 3. Agent-built segment appears without reload
expected: Ask the agent "build a segment of members who attended 4+ classes but haven't been in 3 weeks". A named segment (minClassesAttended:4, notAttendedInDays:21) appears in the Campaigns tab segment chooser without a reload.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
