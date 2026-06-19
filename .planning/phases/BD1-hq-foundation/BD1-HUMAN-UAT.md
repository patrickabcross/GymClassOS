---
status: partial
phase: BD1-hq-foundation
source: [BD1-VERIFICATION.md]
started: 2026-06-19
updated: 2026-06-19
blocker: external-dependency (HQ Neon project + HQ secrets + Vercel/Fly deploys not yet provisioned)
---

## Current Test

[awaiting external provisioning — HQ Neon project, HQ_SUPER_ADMIN_EMAIL + BETTER_AUTH_SECRET, apps/hq Vercel deploy, services/hq-worker Fly deploy]

## Tests

### 1. Operator can sign in to the deployed apps/hq control plane
expected: After provisioning the HQ Neon project, setting HQ_SUPER_ADMIN_EMAIL + BETTER_AUTH_SECRET in the apps/hq Vercel project, and deploying, the operator navigates to the apps/hq deploy, signs in as the single super-admin, and reaches the HQ dashboard.
result: [pending — deferred on external dependency]

### 2. Studio staff credential is rejected by HQ at runtime
expected: On the live apps/hq deploy, authenticating with a studio (staff-web) credential lands on /access-denied — HQ admits only HQ_SUPER_ADMIN_EMAIL. (Code-verified via 19 unit tests; runtime confirmation pending deploy.)
result: [pending — deferred on external dependency]

### 3. services/hq-worker /healthz responds 200 on Fly
expected: After `fly app create gymos-hq-worker`, `fly secrets set DATABASE_URL_UNPOOLED=<HQ Neon unpooled>`, and `fly deploy`, GET /healthz returns HTTP 200 (pg-boss bootstrapped against HQ Neon).
result: [pending — deferred on external dependency]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

None — all gaps are external provisioning steps, not code defects. The operator setup checklist:
- Create HQ Neon project (`gymos-hq`); set DATABASE_URL + DATABASE_URL_UNPOOLED.
- Generate a fresh HQ BETTER_AUTH_SECRET (MUST differ from any studio's); set HQ_SUPER_ADMIN_EMAIL.
- Deploy apps/hq to Vercel; deploy services/hq-worker to Fly.
- Then run the 3 tests above (`/gsd:verify-work BD1`).
