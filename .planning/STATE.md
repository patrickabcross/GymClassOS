# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-17 — major scope revision)
Vision reference: .planning/research/PLATFORM-VISION.md (forward-looking; not architecture-of-record)

**Core value:** Coaches and studio managers run their entire day from one inbox-and-schedule surface (WhatsApp + class bookings + member context). Members book, pay, and log activity / nutrition from a mobile-optimised web PWA that includes an in-app coaching agent.

**Current focus:** Demo Sprint — Phase D0 (Fork + Schema + Deploys)

## Current Position

Milestone: Demo Sprint (1 of 2)
Phase: D0 of 3 (Fork + Schema + Deploys)
Status: Ready to execute
Last activity: 2026-05-17 — Major scope revision (Demo Sprint + Production v1 two-milestone shape) + REQUIREMENTS rewritten (130 reqs, 31 demo / 99 production) + ROADMAP rewritten

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| D0. Fork + Schema + Deploys | 0 | — | — |
| D1. Staff Surfaces | 0 | — | — |
| D2. Member PWA + Calorie + Agent | 0 | — | — |
| P0. Audit & De-Risk | 0 | — | — |
| P1a. Data Foundation, Auth & Deploy | 0 | — | — |
| P1b. Webhook + Worker Spine | 0 | — | — |
| P2. Staff + Member Product Surfaces | 0 | — | — |

**Recent Trend:**
- Last 5 plans: none yet
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- **2026-05-17 major scope revision:** Reconciled the new platform-vision doc against existing constraints item-by-item. Result: per-customer deploy (not tenant_id+RLS); React Router v7 + Drizzle + Better-auth (not Next.js+Prisma+NextAuth — agent-native is RR v7, verified); Stripe DIRECT restricted-API-key (NOT Connect — switched to new model); WhatsApp-only messaging (not Twilio multi-channel); pg-boss on Neon (not Redis); web PWA member surface (NOT native React Native — Expo / Fastlane / Apple Dev Account dance all dropped); calorie counter built fresh in agent-native style (NOT fork OpenNutriTracker — Flutter + GPL v3); Vercel + Fly + Neon (not Hetzner). See PLATFORM-VISION.md §Reconciliation Log.
- **2026-05-17 timeline restructure:** Two-milestone shape — Demo Sprint (Week 1, by ~2026-05-24, prototype quality for customer's first look) + Production v1 (Weeks 2–9, by ~2026-07-15, harden + extend). Replaces the prior 4-phase ROADMAP that assumed all-production-quality.
- **2026-05-17 calorie counter scope pivot:** PROJECT.md initially listed "Calorie tracker" as one of the 5 agent-native templates to fork. Verified upstream — NO such template exists. Calorie counter is now built fresh in the agent-native workspace using Open Food Facts + USDA FDC as data sources; OpenNutriTracker (Flutter, GPL v3) referenced for inspiration only.
- **2026-05-17 mobile reversal:** PROJECT.md initially said "mobile = updates to customer's existing React Native app." Reversed — member surface is now a mobile-optimised PWA on RR v7 (web), installable to home screen. NO native build, NO Expo, NO Fastlane. Native deferred to v1.x.

### Pending Todos

None yet.

### Blockers/Concerns

- **Calorie counter food data attribution:** Open Food Facts is ODbL (attribution + share-alike on derivative databases). Must show OFF attribution in the PWA per ODbL terms (CAL-11). USDA Food Data Central is public-domain — no attribution required. No legal review yet on what "derivative database" means for our `food_items` cache table; default to attribution-safe; revisit if commercialisation of the database becomes relevant.
- **WhatsApp template approval lead time:** ≤48h per Meta. Templates (`class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring`) need to be submitted in Phase P0. Not blocking the demo, but blocks Production v1 weeks 2-9.
- **Customer Stripe account creation:** Needs to happen before P0 onboarding checklist (FND-07). Customer task; flagged as a coordination dependency.
- **PWA push notifications on iOS:** iOS 16.4+ supports web push for installed PWAs (Apple added it Mar 2023). Confirm customer's iOS version is ≥ 16.4 before relying on web push for any flow; otherwise use WhatsApp templates for reminders. Production-time consideration; not demo-blocking.

## Session Continuity

Last session: 2026-05-17 (multiple — initial setup → BullMQ→pg-boss pivot → major scope revision)
Stopped at: Demo Sprint Phase D0 about to begin. All planning artifacts (PROJECT.md, REQUIREMENTS.md, ROADMAP.md) updated to reflect the major scope revision. Memory needs updating; in-flight pg-boss cleanup in PITFALLS.md and SUMMARY.md still pending.
Resume file: None — ready to invoke `/gsd:plan-phase D0` (or jump directly to scaffolding the fork via `/gsd:quick` if planning overhead isn't useful for the demo sprint).
