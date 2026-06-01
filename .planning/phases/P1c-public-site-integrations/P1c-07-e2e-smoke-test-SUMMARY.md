---
phase: P1c-public-site-integrations
plan: "07"
subsystem: testing
tags: [e2e, embed, lead-funnel, stripe, whatsapp, neon, vercel]

# Dependency graph
requires:
  - phase: P1c-02-forms-fork-lead-submission
    provides: /api/submit/:slug handler + gym_members upsert + lead conversation
  - phase: P1c-03-checkout-link-action
    provides: create-checkout-link action + Stripe Checkout + P1b-07 pass reducer
  - phase: P1c-04-forms-builder-and-leads-inbox
    provides: /gymos?filter=leads UI
  - phase: P1c-05-embed-schedule-widget
    provides: /embed/schedule SSR widget + schedule-enquiry form seed
  - phase: P1c-06-embed-js-snippet-postmessage
    provides: /embed.js snippet + postMessage events (lead:submitted, enquiry:created, gymos:resize)
provides:
  - P1c-E2E-RESULTS.md: recorded acceptance gate for the GHL-replacement phase
  - EMBED-06 requirement verified (Parts A + B passing on live deploy)
  - Known gap: name-extraction heuristic misses "Your name" label -> first_name saved as "Lead"
affects: [P2-product-surfaces, WhatsApp-deep-wire, customer-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live Vercel HTTP verification as substitute for local dev server (NitroViteError constraint)"
    - "Neon MCP DB verification for idempotency and FK-safety checks without local server"

key-files:
  created:
    - .planning/phases/P1c-public-site-integrations/P1c-E2E-RESULTS.md
  modified: []

key-decisions:
  - "Part C (Checkout->pass) DEFERRED not FAILED — studio Stripe restricted key not configured; code is verified at build/unit level; re-verify when studio Stripe setup complete"
  - "Name-extraction heuristic gap logged as follow-up (not blocking); funnel is functional, coach sees first_name='Lead' instead of actual name when form label is 'Your name'"
  - "Visual browser confirmations (radius theming, cross-origin iframe behaviour) carried forward as non-blocking deferred items"

patterns-established:
  - "P1c verification pattern: live Vercel HTTP + Neon MCP replays replace local dev server when NitroViteError blocks local boot"

requirements-completed: [EMBED-06]

# Metrics
duration: 8min
completed: "2026-06-01"
---

# Phase P1c Plan 07: E2E Smoke Test Summary

**Live Vercel HTTP + Neon MCP verification of GHL-replacement embed/lead funnel — Parts A and B PASS, Part C DEFERRED pending studio Stripe setup, name-extraction gap documented**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-01T14:06:29Z
- **Completed:** 2026-06-01T14:15:00Z
- **Tasks:** 1 (Task 1 — record results document; Task 0 checkpoint was pre-completed by orchestrator)
- **Files modified:** 1

## Accomplishments

- P1c-E2E-RESULTS.md written with explicit PASS markers for Part A (embed plumbing) and Part B (lead funnel), DEFERRED for Part C (Checkout→pass loop pending Stripe setup)
- EMBED-06 requirement verified on the live Vercel deploy (https://gym-class-os.vercel.app)
- Name-extraction heuristic gap surfaced: `"Your name"` label not matched → `first_name` saved as `"Lead"` instead of actual name; funnel otherwise functional
- Three deferred visual browser items documented (non-blocking carry-forward)
- All P1c plans now complete (7/7)

## Task Commits

1. **Task 1: Record the E2E results document** - `df2e0353` (docs)

**Plan metadata:** included in the final metadata commit (see below)

## Files Created/Modified

- `.planning/phases/P1c-public-site-integrations/P1c-E2E-RESULTS.md` — Full smoke-test record with PASS/DEFERRED per part, DB verification details, GHL-replacement summary, and known gaps

## Decisions Made

- Part C marked DEFERRED (not FAIL) — `create-checkout-link` is a staff-authenticated action; live Stripe Checkout requires the studio's restricted key + Products with pack keywords. Code path verified at unit/build level (P1b-07: 49/49 tests green). Re-verify when studio Stripe setup complete.
- Name-extraction gap logged as a recommended follow-up item, not blocking. Two fix options noted (broaden heuristic vs change seed label).
- Radius URL param theming deferred to browser confirmation — accent colour confirmed, radius needs visual inspection.

## Deviations from Plan

None — plan executed exactly as written. The E2E walk was pre-completed by the orchestrator against the live Vercel deploy; Task 1 (record results) executed from the verified results.

## Issues Encountered

- **Name-extraction gap:** `submissions.ts` only matches name labels `"name"` or containing `"first name"`; the seeded form label `"Your name"` falls through, saving `first_name='Lead'`. Funnel functional — email, phone (E.164), and full name in message body are all correct. Recommended fix: broaden the label heuristic or update seed label.

## Known Stubs

None introduced in this plan. Pre-existing deferred items from P1c:
- In-memory rate limiter (Vercel cold-start reset — noted in P1c-02 SUMMARY; P2 upgrade)
- Turnstile bot protection (not wired — deferred to P2 per FORMS.md)
- Capacity check on schedule enquiry (deferred to BKG-03/BKG-04)

## Next Phase Readiness

- P1c phase is complete (7/7 plans done, EMBED-06 verified)
- Name-extraction fix is a low-effort follow-up (single-file heuristic change)
- Studio Stripe setup (customer task) gates Part C re-verification
- Three parallel next tracks: WhatsApp deep wire, Mobile EAS build, P2 product surfaces

---
*Phase: P1c-public-site-integrations*
*Completed: 2026-06-01*
