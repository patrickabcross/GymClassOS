---
status: partial
phase: BD3-hq-brain-dispatcher
source: [BD3-VERIFICATION.md]
started: 2026-06-19
updated: 2026-06-19
---

## Current Test

[awaiting human testing]

## Tests

### 1. HQB console renders health badges correctly
expected: Opening `/studios` in the deployed HQ app shows a shadcn Table with one row per provisioned studio; a studio whose telemetry is stale/missing renders a grey "stale" badge and NEVER a green "healthy" badge; the cohort filter (All / At-risk / Power-user) re-filters the rows.

### 2. Per-studio drill-in charts render without SSR crash
expected: Opening `/studios/:id` renders the recharts telemetry-history panels (engagement, retention, messaging, token spend over time) with no `window is not defined` SSR error — the `ClientOnly` guard mounts the charts after hydration.

### 3. hq-owner-send queue runs end-to-end
expected: With the hq-worker running, invoking the `send-owner-whatsapp` action enqueues a `hq-owner-send` pg-boss job; the consumer runs `sendOwnerMessage` through the opt-in → 24h-window → approved-template gates and (with `HQ_WABA_*` env absent) uses `mockHqWabaClient` — no live Meta call, no error.

### 4. HQ Content editor persists
expected: On a running HQ Vercel + Neon deploy, creating a document at `/content`, editing it in the non-collab Tiptap editor, and reloading shows the content persisted (auto-save on blur).

### 5. Live WABA send (external dependency — Meta)
expected: After the operator registers the HQ WABA second phone number in Meta Business Manager AND the owner-comms templates are Meta-approved AND `HQ_WABA_*` env vars are set, a real owner message sends through HQ's own WABA. Deferred-on-external-dependency (D-13) until those manual steps complete.

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
