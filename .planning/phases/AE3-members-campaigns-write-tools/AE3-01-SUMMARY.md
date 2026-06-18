---
phase: AE3-members-campaigns-write-tools
plan: 01
subsystem: api
tags: [defineAction, drizzle, zod, agent-tools, gym_members, e164, consent]

# Dependency graph
requires:
  - phase: AE2-schedule-write-tools
    provides: "update-class-definition.ts partial-update template (resolve→Partial→empty no-op→update().where()), guard:allow-unscoped convention, agent-only no-http action shape, two-exposure rule"
provides:
  - "update-member agent action: agent-only partial-update over gym_members (firstName/lastName/email/phoneE164/notes)"
  - ".strict() consent-exclusion guarantee (marketing_consent / whatsapp_opt_in rejected at parse time, AEM-02)"
  - "in-run E.164 + email validation with typed errors (INVALID_PHONE/INVALID_EMAIL); phone never normalized (D-07)"
  - "email/phone unique-collision pre-checks returning EMAIL_IN_USE/PHONE_IN_USE instead of a DB 500"
affects: [AE3-02, AE3-03, members-write-tools, agent-exposure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Consent exclusion is structural via Zod .strict(), not a runtime if-check (AEM-02)"
    - "In-run phone/email validation returns typed {error} rather than raw Zod failure (Open Question 1 resolved in favour of in-run)"
    - "Unique-key collision pre-check (email AND phone_e164) before update to avoid opaque DB 500 (Pitfall 5)"

key-files:
  created:
    - apps/staff-web/actions/update-member.ts
  modified: []

key-decisions:
  - "In-run E.164/email validation (typed {error}) over Zod .regex()/.email() so the agent gets an explainable error code"
  - "Collision pre-checks added for both email and phone_e164 (gym_members is unique on BOTH) — returns typed error instead of relying on Postgres to throw"
  - "Action is direct (no http key, not in propose-action/approve-proposal gate files) per AEX-02"

patterns-established:
  - "Pattern 1: clone update-class-definition.ts shape + .strict() + in-run validation + collision pre-checks for member writes"

requirements-completed: [AEM-01, AEM-02]

# Metrics
duration: 2min
completed: 2026-06-18
---

# Phase AE3 Plan 01: Members Write Tool (update-member) Summary

**Agent-only `update-member` action over `gym_members` — partial update of 5 profile fields, `.strict()` Zod schema that structurally excludes consent/opt-in (AEM-02), in-run E.164 + email validation with typed errors, and email/phone collision pre-checks.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-18T22:45:34Z
- **Completed:** 2026-06-18T22:47:08Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments
- Created `apps/staff-web/actions/update-member.ts` — the Members write tool (AEM-01).
- Consent exclusion is enforced structurally: the Zod object is `.strict()`, so `marketing_consent` / `whatsapp_opt_in` / any extra key is rejected at parse time (AEM-02). The action never imports `whatsappOptIn`.
- Phone validated as E.164 (`/^\+[1-9]\d{1,14}$/`) and rejected (never normalized) with `{error:"INVALID_PHONE"}`; email validated with `{error:"INVALID_EMAIL"}` — both via in-run checks so the agent gets a typed, explainable result.
- Email/phone unique-collision pre-checks return `{error:"EMAIL_IN_USE"}` / `{error:"PHONE_IN_USE"}` instead of an opaque Postgres unique-index 500.
- `firstName` is `.min(1)` so it can never be blanked; empty patch returns `{updated:false, reason:"no changes"}`.

## Task Commits

1. **Task 1: Create the update-member agent action (.strict() + E.164 + collision pre-checks)** - `7ba558ad` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `apps/staff-web/actions/update-member.ts` - Agent-only partial-update action over `gym_members`; `.strict()` consent exclusion, E.164 + email validation, collision pre-checks, `// guard:allow-unscoped` on all 4 Drizzle queries.

## Decisions Made
- Followed the plan's verbatim code, which resolves Open Question 1 (phone rejection) in favour of in-run validation returning typed `{error}` codes rather than `.regex()`/`.email()` raising raw Zod failures.
- Used `z.string().max(254)` for email + in-run regex (not `z.string().email()`) so not-found/collision/format errors all surface as typed `{error}` results consistently.

## Deviations from Plan
None - plan executed exactly as written. The file was written verbatim from the plan; prettier reported it already-formatted; `tsc --noEmit` exited 0 on first run.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. The action is NOT yet agent-exposed (system prompt + AGENTS.md table entries are deliberately deferred to AE3-03 per the "system-prompt ships last" constraint).

## Next Phase Readiness
- `update-member.ts` exists, compiles, and is registry-eligible. AEX-02 confirmed: not referenced in `propose-action.ts` or `approve-proposal.ts` (direct action, no gate).
- AE3-03 will add the Members section to `agent-chat.ts`, the `view-screen` members branch, and the AGENTS.md Agent Actions row to make the action callable (two-exposure rule).
- Live confirmation (Neon MCP replay against gymos-demo) is deferred to AE3-03 / the Vercel deploy, since the action is not agent-exposed until then.

## Verification
- `cd apps/staff-web && npx tsc --noEmit` → exit 0.
- grep confirms `.strict(`, `MEMBER_NOT_FOUND`, `INVALID_PHONE`, `EMAIL_IN_USE`, `PHONE_IN_USE`, `firstName: z.string().min(1)`, the E.164 regex literal, and 4× `// guard:allow-unscoped` are present; `marketingConsent`, `whatsappOptIn`, `http:` are absent.
- grep confirms `update-member` is NOT referenced in `propose-action.ts` / `approve-proposal.ts`.

## Self-Check: PASSED

- FOUND: apps/staff-web/actions/update-member.ts
- FOUND: .planning/phases/AE3-members-campaigns-write-tools/AE3-01-SUMMARY.md
- FOUND commit: 7ba558ad

---
*Phase: AE3-members-campaigns-write-tools*
*Completed: 2026-06-18*
