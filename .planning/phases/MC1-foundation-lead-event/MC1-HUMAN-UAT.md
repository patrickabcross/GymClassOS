---
status: partial
phase: MC1-foundation-lead-event
source: [MC1-VERIFICATION.md]
started: 2026-06-23T12:45:00Z
updated: 2026-06-23T12:45:00Z
---

## Current Test

[awaiting human testing — requires Vercel + Fly deploy and a live Meta Events Manager session]

## Tests

### 1. Meta Test Events — end-to-end dedup proof (CAPI-05)
expected: After deploy, configure the studio in Settings (Pixel ID + CAPI token + Test Event Code), visit an embed-form page with `?fbclid=<test>`, submit it, and open Meta Events Manager → Test Events. Exactly ONE Lead event appears (browser + server deduplicated via shared event_id, counted once — not twice). Event Match Quality shows `fbc` populated from the synthesized `fb.1.<ms>.<fbclid>`.
result: [pending]

### 2. BETTER_AUTH_SECRET parity check (D-03) — deploy gate
expected: `fly secrets list -a <worker-app>` shows BETTER_AUTH_SECRET byte-for-byte identical to the Vercel Production value (set with `fly secrets set BETTER_AUTH_SECRET="<value>" -a <worker-app>` if missing/mismatched). `fly logs -a <worker-app>` shows `[worker] boot self-test: app_secrets decrypt OK`. If the self-test errors, META_CAPI_TOKEN decrypt returns null and every CAPI send silently skips.
result: [pending]

### 3. 5xx retry behavior against live Meta (CAPI-04)
expected: A simulated Meta 5xx/network failure causes pg-boss to retry the meta-capi-event job (retryLimit 5, backoff) without dropping the event or crashing the worker; on final failure the row's lead_status flips to 'failed' with last_error populated; on success it flips to 'sent'.
result: [pending]

### 4. Operator Settings walkthrough (CAPI-06 / D-10)
expected: At `/gymos/settings/integrations`, the "Meta Conversion Tracking" card accepts Pixel ID + Test Event Code + masked CAPI token, Save shows badge "Configured — no sends yet", "Send test event" shows "Test event queued…" and a Lead appears in Meta Test Events within ~30s (sent by the Fly worker, not staff-web), and reloading shows the badge flip to "Active" / last-send health.
result: [pending]

### 5. Migration drift — confirm v31/v32/v33 applied (gotcha)
expected: After `git push origin master` deploys staff-web to Vercel, confirm migrations v31 (meta config columns), v32 (meta_lead_attribution), and v33 (last_error column) applied to the gymos-demo Neon DB (billowing-sun-51091059) on first cold-start. These run via runMigrations on app boot, NOT by the build — if routes 500 on meta tables, apply by hand.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
