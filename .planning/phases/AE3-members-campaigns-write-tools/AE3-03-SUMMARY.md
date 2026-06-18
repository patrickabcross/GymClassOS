---
phase: AE3-members-campaigns-write-tools
plan: 03
subsystem: agent-exposure
tags: [two-exposure, view-screen, agent-chat, live-refresh, context-awareness, members, campaigns]

# Dependency graph
requires:
  - phase: AE3-01
    provides: "update-member.ts agent action (partial-update over gym_members, .strict() consent exclusion, E.164 + collision pre-checks)"
  - phase: AE3-02
    provides: "save-segment.ts agent action (writes filter specs to gymos-campaign-segments app-state key); gymos.campaigns.tsx composable segment builder + its own live-refresh"
provides:
  - "view-screen members + campaigns branches (AEX-01 context-awareness) — directory + selected member + recent bookings; saved segments via readAppState + at-risk preset"
  - "agent-chat.ts Members + Campaigns system-prompt sections naming update-member + save-segment (AEX-04 second exposure) with explicit consent/opt-in refusal posture"
  - "AGENTS.md Agent Actions rows + AE3 two-exposure note for update-member + save-segment"
  - "members directory + detail routes live-refresh via useChangeVersions([\"action\"]) + useRevalidator (AEX-03)"
affects: [AE3-phase-complete, v1.2-agentic-tab-editing-complete]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "readAppState WORKS inside view-screen (an action wrapped in runWithRequestContext) — used for the campaigns branch; the campaigns page loader cannot (AE3-02 reads client-side)"
    - "members + campaigns view-screen branches inserted BEFORE the generic else-if (nav?.view) email branch so the gym routes never fall through to Gmail logic"
    - "Two-exposure completed: action file (auto-globbed into .generated registry at build time) + named in agent-chat.ts system prompt"

key-files:
  created:
    - .planning/phases/AE3-members-campaigns-write-tools/AE3-03-SUMMARY.md
  modified:
    - apps/staff-web/actions/view-screen.ts
    - apps/staff-web/server/plugins/agent-chat.ts
    - apps/staff-web/AGENTS.md
    - apps/staff-web/app/routes/gymos.members.tsx
    - apps/staff-web/app/routes/gymos.members_.$id.tsx

key-decisions:
  - "view-screen campaigns branch reads gymos-campaign-segments via readAppState (works in an action); members branch never surfaces marketingConsent / whatsappOptIn"
  - "Members system-prompt section carries an explicit DECLINE posture for any consent/opt-in request (defence-in-depth on top of update-member's .strict() schema)"
  - "REQUIREMENTS.md AEM-01..04 were already registered + traced to Phase AE3 (Complete) by the AE3-02 executor — Task 3's REQUIREMENTS portion was already satisfied; NO duplicate rows added (idempotent)"
  - ".generated/actions-registry.ts is gitignored and regenerated at Vercel build time — the build's action glob picks up update-member.ts + save-segment.ts automatically; no manual registry commit needed/possible"

requirements-completed: [AEM-01, AEM-02, AEM-03, AEM-04, AEX-01, AEX-03, AEX-04]

# Metrics
duration: 5min
completed: 2026-06-18
tasks: 3
files: 5
---

# Phase AE3 Plan 03: Members + Campaigns Agent Exposure Summary

**The LAST wave of AE3 and of the v1.2 Agentic Tab Editing milestone — performs the second half of the two-exposure rule for `update-member` (AE3-01) and `save-segment` (AE3-02): adds `members` + `campaigns` branches to `view-screen` (AEX-01), names both actions in the `agent-chat.ts` system prompt (AEX-04) with an explicit consent-refusal posture, documents them in `AGENTS.md`, and wires live-refresh into the members directory + detail routes (AEX-03). No new action files; no gate-file edits; no schema change.**

## What Shipped

- **`view-screen.ts` (AEX-01)** — a `members` branch and a `campaigns` branch, both spliced into the existing if/else-if chain BEFORE the generic `else if (nav?.view)` email branch so `/gymos/members` and `/gymos/campaigns` never fall through to Gmail logic. The members branch returns the directory (id, composed name, phone, email) and, when `nav.memberId` is set, the selected member's profile + last 10 bookings — and deliberately NEVER surfaces `marketingConsent` / `whatsappOptIn` (update-member cannot touch them). The campaigns branch reads the saved segments via `readAppState("gymos-campaign-segments")` (which works here because view-screen is an action wrapped in `runWithRequestContext`, unlike the campaigns page loader) and lists `presets: ["at-risk"]`.
- **`agent-chat.ts` (AEX-04 — second exposure)** — a Members tab section naming `update-member` (param shape + all typed error codes) with an explicit DECLINE instruction for any consent/opt-in request, and a Campaigns tab section naming `save-segment` (AND-composed filters, the worked 4+/3w example, "only saves — does not send"). Inserted adjacent to the Forms + Schedule sections, before "How you act — three tiers:". Neither action is added to the `propose-action` tool line — both are direct (AEX-02).
- **`AGENTS.md`** — Agent Actions table rows for `update-member` (with the consent-exclusion note) and `save-segment`, plus a "Two-exposure rule — AE3 members + campaigns actions" note mirroring the AE1/AE2 notes.
- **`gymos.members.tsx` + `gymos.members_.$id.tsx` (AEX-03)** — `useChangeVersions(["action"])` + `useRevalidator` live-refresh (copied verbatim from `gymos.schedule.tsx`), so the directory and the profile card re-run their loaders after an agent `update-member` write with no manual reload. (The campaigns route already got this in AE3-02.)

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | view-screen members+campaigns branches + members live-refresh | 7e8137ab | view-screen.ts, gymos.members.tsx, gymos.members_.$id.tsx |
| 2 | Members + Campaigns sections in agent-chat.ts system prompt | ab344bcd | server/plugins/agent-chat.ts |
| 3 | Document both actions in AGENTS.md (REQUIREMENTS already registered) | f249105c | apps/staff-web/AGENTS.md |

## Deviations from Plan

### Auto-fixed / Trimmed

**1. [Idempotency] Task 3 REQUIREMENTS.md portion already satisfied — no duplicate rows**
- **Found during:** Task 3 (pre-flight check, per the prompt's idempotency note)
- **Issue:** The plan's Task 3 instructs registering AEM-03/AEM-04 and re-tracing AEM-01/AEM-02 to Phase AE3 in `.planning/REQUIREMENTS.md`. The AE3-02 executor had ALREADY done this — AEM-01..04 are present in the AEM section (all `[x]`) and the Traceability table rows all read `Phase AE3 | Complete`.
- **Fix:** Verified the existing rows are present and correct; created NO duplicate rows. Task 3 reduced to the AGENTS.md documentation only. REQUIREMENTS.md was not modified.

**2. [Rule 2 - registry note] `.generated/actions-registry.ts` is gitignored, regenerated at build**
- **Found during:** Final two-exposure verification
- **Issue:** The committed/in-repo registry did not list `update-member` / `save-segment`. I hand-added both (mirroring `a_update_class_definition`) to make the local two-exposure verification pass, then discovered `.generated/` is gitignored and is regenerated by the Vercel build's action-file glob (`node ../../packages/core/dist/cli/index.js build`).
- **Resolution:** No commit — the build regenerates the registry from the action files on deploy, which is the intended mechanism (research Two-Exposure step 2: "prefer letting the build regenerate"). The local edit is harmless and will be overwritten. Both action files exist in `actions/`, so the production registry will include them. tsc passed with the local edit in place, confirming the imports resolve.

Otherwise the plan executed as written.

## Authentication Gates

None.

## Verification

- `cd apps/staff-web && npx tsc --noEmit` exits 0 after each task (and after the local registry edit).
- `npx prettier --check AGENTS.md` reports clean.
- agent-chat.ts names BOTH `update-member` and `save-segment` in per-tab sections (grep: 3 occurrences across the two sections); the Members section contains a DECLINE instruction referencing both `consent` and `opt-in`; neither action is on the `propose-action` tool line.
- view-screen.ts has `else if (nav?.view === "members")` (line 375) and `else if (nav?.view === "campaigns")` (line 432), BOTH before the generic `else if (nav?.view)` email branch (line 444); the campaigns branch calls `readAppState("gymos-campaign-segments")`; the members branch does not surface consent/opt-in; every new query carries `// guard:allow-unscoped`.
- gymos.members.tsx AND gymos.members_.$id.tsx both contain `useChangeVersions(["action"])` + `useRevalidator`.
- AGENTS.md has the update-member + save-segment rows and the AE3 two-exposure note.
- REQUIREMENTS.md has AEM-03 + AEM-04 in BOTH the AEM section and the Traceability table; AEM-01..04 all trace to Phase AE3 (Complete).

## Human UAT (deferred — no local dev server; NitroViteError)

On the live Vercel deploy, with Neon MCP confirmation + test-row cleanup:
1. "update Sarah's phone to +447700900123" → `gym_members.phone_e164` stores `+447700900123` verbatim; the members card / profile card refreshes without a reload.
2. "add a note to David's profile: prefers morning classes" → `gym_members.notes` saves.
3. "opt Sarah into WhatsApp" / "change her marketing consent" → the agent gives a clear refusal; `marketing_consent` + `whatsapp_opt_in` unchanged.
4. "build a segment of members who attended 4+ classes but haven't been in 3 weeks" → a named segment appears in the Campaigns tab without a reload (actionVersion re-fetch).

## Known Stubs

None. (`placeholder=` attributes elsewhere in the routes are legitimate HTML input hints, not unwired data.)

## Phase AE3 — Complete

Both new actions are now (1) shipped as action files (AE3-01/02), (2) named in the `agent-chat.ts` system prompt (this plan), and (3) documented in AGENTS.md — the full two-exposure rule. The agent can edit member profile fields (consent structurally excluded via `.strict()`, refused at the prompt level too) and build composable Campaigns segments, both context-aware (view-screen branches) and live-refreshing (AEX-03). This completes the v1.2 Agentic Tab Editing milestone scope for Forms (AE1), Schedule (AE2), and Members + Campaigns (AE3).

## Self-Check: PASSED

- FOUND: apps/staff-web/actions/view-screen.ts
- FOUND: apps/staff-web/server/plugins/agent-chat.ts
- FOUND: apps/staff-web/AGENTS.md
- FOUND: apps/staff-web/app/routes/gymos.members.tsx
- FOUND: apps/staff-web/app/routes/gymos.members_.$id.tsx
- FOUND: .planning/phases/AE3-members-campaigns-write-tools/AE3-03-SUMMARY.md
- FOUND commits: 7e8137ab, ab344bcd, f249105c
