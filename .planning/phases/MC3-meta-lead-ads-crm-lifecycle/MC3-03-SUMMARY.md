---
phase: MC3-meta-lead-ads-crm-lifecycle
plan: "03"
subsystem: staff-web-settings + ops-documentation
tags: [meta, lead-ads, settings, secrets, ui, operator-runbook]

# Dependency graph
requires:
  - phase: MC1-foundation-lead-event plan 05
    provides: Meta Conversion Tracking card + writeAppSecret by-key pattern (D-11)
  - phase: MC3-meta-lead-ads-crm-lifecycle plan 01
    provides: META_PAGE_ACCESS_TOKEN key contract (readAppSecretByKey in worker)

provides:
  - Page Access Token masked field on existing Meta Conversion Tracking card (LEAD-01)
  - META_PAGE_ACCESS_TOKEN in app_secrets via writeAppSecret(scope:workspace, scopeId:global)
  - hasPageToken loader presence detection (by-key, D-11 pattern, any operator login)
  - Lead Ads connection status hint on card (one-line, progressive disclosure)
  - MC3-LEAD-ADS-OPS-NOTE.md operator runbook (D-09)

affects:
  - MC3-02 worker meta-lead handler (reads META_PAGE_ACCESS_TOKEN via readAppSecretByKey)
  - Operators onboarding any future studio client (repeatable-per-client)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Page token mirrors CAPI token: readAppSecretByKey !== null presence (D-11), writeAppSecret(scope:workspace, scopeId:global), masked input never prefilled"
    - "save-meta-config intent extended: parallel conditional write for pageToken alongside existing CAPI token write"
    - "showPageTokenField state mirrors showTokenField: configured→Replace reveal, unconfigured→empty masked input"
    - "Status hint: one-line Lead Ads: connected/not-connected below the card description (progressive disclosure per AGENTS.md)"

key-files:
  created:
    - .planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md
  modified:
    - apps/staff-web/app/routes/gymos.settings.integrations.tsx

key-decisions:
  - "Reused save-meta-config intent for pageToken — no new intent required; single save covers all Meta config fields in one submit"
  - "showPageTokenField state added alongside existing showTokenField — separate state prevents one reveal toggling the other"
  - "Lead Ads status hint placed as a p element below the card description (not a badge or extra control) — keeps card clean per AGENTS.md progressive disclosure rule"
  - "ops note references D-09 explicitly; manual subscription step is intentional, not a gap"

# Metrics
duration: ~7min
completed: 2026-06-24
---

# Phase MC3 Plan 03: Settings Page Access Token + Ops Note Summary

**Page Access Token field added to existing Meta card; Lead Ads operator runbook created — LEAD-01 operator connection step complete**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-24T10:45:17Z
- **Completed:** 2026-06-24T10:52:26Z
- **Tasks:** 2
- **Files modified:** 1 (settings route)
- **Files created:** 1 (ops note)

## Accomplishments

### Task 1: Page Access Token field on the Meta Conversion Tracking card

Extended `apps/staff-web/app/routes/gymos.settings.integrations.tsx`:

- **Loader**: added `const hasPageToken = (await readAppSecretByKey("META_PAGE_ACCESS_TOKEN")) !== null` immediately after the existing CAPI token presence check. Included `hasPageToken` in the returned `meta` object. Also added `hasPageToken: false` to the early-return error path for the `?stripe=refresh` error branch.
- **save-meta-config action intent**: added `const pageToken = String(fd.get("pageToken") ?? "").trim()` and a conditional `writeAppSecret({ key: "META_PAGE_ACCESS_TOKEN", scope: "workspace", scopeId: "global", description: "..." })` if non-empty — runs in parallel with the existing CAPI token write, same fixed scope/scopeId to UPSERT one stable row (D-11).
- **UI**: added `showPageTokenField` state (mirrors `showTokenField`); added a masked `name="pageToken"` field inside the existing `<metaConfigFetcher.Form>` with configured/replace-token reveal identical to the CAPI token field; added a helper text paragraph describing where to get the token and the Leads Access requirement.
- **Lead Ads status hint**: one-line `<p>` below the card description showing "Lead Ads: connected" (emerald) or "Lead Ads: not connected — enter a Page Access Token below and follow the ops note (D-09) to subscribe to the leadgen webhook".

### Task 2: Lead Ads operator ops note (D-09)

Created `.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md` — a self-contained operator runbook covering:

1. Prerequisites — `leads_retrieval` + `pages_manage_ads` permissions; Meta App Review calendar dependency.
2. Page Access Token — System User (non-expiring, recommended) vs long-lived User token; Leads Access requirement on the Page; how to enter in the app.
3. Webhook subscription — Option A (App Dashboard) + Option B (Graph API POST `/{PAGE_ID}/subscribed_apps?subscribed_fields=leadgen`); callback URL = `/webhooks/meta-lead`; verify token reuses the WhatsApp verify token (same Facebook App).
4. App Secret / signing — existing `FB_APP_SECRET` Fly secret covers both webhook routes; no new secret needed.
5. End-to-end verification — Lead Ads Testing Tool → edge-webhooks logs → worker logs → inbox conversation → `meta_lead_id` in attribution → lifecycle events flowing.
6. Troubleshooting table — code 190 / code 100+404 / Leads Access / signature / template approval.

## Task Commits

1. **Task 1: Page Access Token field** — `41fb1810` (feat)
2. **Task 2: Lead Ads ops note** — `d2e8de76` (docs)

## Files Created/Modified

- `apps/staff-web/app/routes/gymos.settings.integrations.tsx` — EXTENDED: loader hasPageToken + early-return hasPageToken:false; save-meta-config pageToken write; showPageTokenField state; masked pageToken UI field; Lead Ads status hint
- `.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md` — NEW: operator runbook (prerequisites, token, subscription, signing, verification, troubleshooting)

## Decisions Made

- **Reused save-meta-config intent**: no new intent needed; pageToken write slots naturally alongside the CAPI token write in the same intent handler. Both are conditional on non-empty value (masked field convention).
- **Separate showPageTokenField state**: keeps the two token reveals independent — toggling one does not affect the other.
- **One-line Lead Ads status hint**: placed as a `<p>` element, not a badge or extra control, to comply with AGENTS.md "clean-UI" and "progressive disclosure" rules.
- **ops note explicitly references D-09**: the manual subscription step is a deliberate architectural decision, not a gap to be filled. The note is the intended delivery for this phase.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functionality is wired. The Page token field correctly shows the unconfigured state until the operator pastes a token. The Lead Ads status hint correctly shows "not connected" until `META_PAGE_ACCESS_TOKEN` is present in app_secrets.

## Self-Check: PASSED

- `apps/staff-web/app/routes/gymos.settings.integrations.tsx` — FOUND, contains META_PAGE_ACCESS_TOKEN (3 occurrences), name="pageToken" (1), hasPageToken (6), META_CAPI_TOKEN (3, unchanged)
- `.planning/phases/MC3-meta-lead-ads-crm-lifecycle/MC3-LEAD-ADS-OPS-NOTE.md` — FOUND, contains leadgen + Page Access Token + leads_retrieval + /webhooks/meta-lead + D-09
- Commit `41fb1810` — verified (feat: Page Access Token field)
- Commit `d2e8de76` — verified (docs: Lead Ads ops note)
- `pnpm tsc --noEmit` — PASS (0 errors)
- pageToken input has no `value` attribute — CONFIRMED (masked, never prefilled)
- META_CAPI_TOKEN save/rotate logic unchanged — CONFIRMED (3 occurrences remain, same code)

---
*Phase: MC3-meta-lead-ads-crm-lifecycle*
*Plan: 03*
*Completed: 2026-06-24*
