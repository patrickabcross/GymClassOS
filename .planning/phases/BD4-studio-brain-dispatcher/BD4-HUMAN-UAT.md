---
status: partial
phase: BD4-studio-brain-dispatcher
source: [BD4-VERIFICATION.md]
started: 2026-06-19T00:00:00Z
updated: 2026-06-19T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Brand Voice persistence on reload (GOB-03)
expected: Navigate to `/gymos/brain` on the Vercel deploy with an authenticated staff session, type into the Brand Voice document, Save, then hard-reload — the text persists; Class Methods section is collapsed by default; the auto-seeded class catalog (from `class_definitions`) is visible.
result: [pending]

### 2. Daily owner digest live delivery (GOD-01)
expected: With `studio_owner_config` seeded (owner phone_e164 + IANA timezone) and the owner having a `gym_members` row, at the scheduled 06:00 studio-tz run the owner receives a WhatsApp digest template populated with numeric studio metrics. Requires the Meta-approved `owner_daily_digest` template (D-15 calendar dependency).
result: [pending]

### 3. Heartbeat reactivation + suppression ceiling (GOD-02..05)
expected: With a dormant test member, the 09:00 studio-tz heartbeat enqueues a reactivation template through the existing `outbound-whatsapp` chokepoint; `reactivation_attempts` grows by one; a member already at 3 attempts within 90 days is skipped; opted-out members are excluded. Requires the Meta-approved `member_reactivation` template + live Fly worker.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
