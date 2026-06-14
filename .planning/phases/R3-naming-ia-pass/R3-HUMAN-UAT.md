---
status: partial
phase: R3-naming-ia-pass
source: [R3-VERIFICATION.md]
started: 2026-06-13T00:00:00Z
updated: 2026-06-13T00:00:00Z
---

## Current Test

[awaiting human testing — requires a live Vercel deploy of branch `redesign/ui-refresh`]

## Tests

### 1. Old inbox route 301-redirects (SC3 / NAME-03)
expected: `curl -I https://<preview>/gymos/inbox` returns `HTTP 301` with `Location: /gymos/messages`. In a browser, visiting `/gymos/inbox` lands on `/gymos/messages` (no 404). The live customer Hustle uses `/gymos/inbox` daily — this must not break.
result: [pending]

### 2. Query params survive the redirect (SC3)
expected: `/gymos/inbox?conversation=<id>` and `/gymos/inbox?filter=leads` redirect to `/gymos/messages?conversation=<id>` / `?filter=leads` (query string preserved by the shim's `url.search` forwarding).
result: [pending]

### 3. Legacy mail routes don't 404 (SC3)
expected: `/draft-queue`, `/draft-queue/:id`, and legacy `/inbox` paths redirect (not 404) to a gym surface. `$view.tsx` redirects legacy `/inbox` → `/gymos`; `/draft-queue` serves the renamed Scheduled Messages surface.
result: [pending]

### 4. Vocabulary visual scan (SC1, SC2, SC5)
expected: On the deployed staff web — nav shows no "Inbox"/"Compose"/"Draft Queue"; messages surface heading reads "Messages" with a "Conversations" thread-list label; member detail shows "Member Profile" + pass balance as "X credits". Confirm the inline reply button reads "Send" (intentional WhatsApp inline-reply UX) and the compose trigger reads "New Message" — confirm this split is acceptable.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
