---
phase: AE3-members-campaigns-write-tools
verified: 2026-06-19T00:20:00Z
status: human_needed
score: 7/7 truths structurally verified (3 live behaviors await Vercel UAT)
human_verification:
  - test: "On the Vercel deploy, ask the agent on /gymos/members: 'update Sarah's phone to +447700900123'"
    expected: "gym_members row reflects the E.164 value (confirm via Neon MCP); the member profile card + directory refresh without a manual reload"
    why_human: "No local dev server (NitroViteError) — cannot drive the live agent loop or observe useChangeVersions live-refresh in a browser locally"
  - test: "Ask the agent: 'opt Sarah into WhatsApp' / 'change Sarah's marketing consent'"
    expected: "Clear refusal; no whatsapp_opt_in / marketing_consent change in the DB (the .strict() schema rejects the keys at parse time AND the system prompt instructs a decline)"
    why_human: "Refusal is an LLM behavior over the live system prompt; structural exclusion is code-verified but the conversational decline can only be observed live"
  - test: "Ask the agent on /gymos/campaigns: 'build a segment of members who attended 4+ classes but haven't been in 3 weeks'"
    expected: "A named segment (minClassesAttended:4, notAttendedInDays:21) appears in the Campaigns tab segment chooser without a reload"
    why_human: "Requires the live agent to call save-segment and the actionVersion bump to re-fetch segments in the browser — not reproducible without the running app"
---

# Phase AE3: Members + Campaigns Write Tools Verification Report

**Phase Goal:** Coach can use the agent to (a) update a member's profile fields (first name, last name, email, phone (E.164), notes) — never consent/opt-in, enforced structurally via a `.strict()` Zod schema — and (b) build a custom Campaigns segment by describing filters in natural language, replacing the single hardcoded at-risk segment.
**Verified:** 2026-06-19T00:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (the 6 ROADMAP success criteria)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Agent updates a member's phone to E.164; row reflects it; card refreshes without reload | ✓ VERIFIED (code) / ? live | `update-member.ts` validates `phoneE164` against `/^\+[1-9]\d{1,14}$/` (line 20), sets it via `db.update(schema.gymMembers).set(updates).where(eq(id))` (l.107-110); `gymos.members_.$id.tsx` + `gymos.members.tsx` both wire `useChangeVersions(["action"])` + `useRevalidator` (l.148-151 / 208-211). Live agent+browser flow → UAT. |
| 2 | Agent adds a note; notes field saves | ✓ VERIFIED | `notes` is an allowed optional field (l.36) and written when supplied (l.99) |
| 3 | "opt into WhatsApp" / "change consent" → refusal; schema structurally prevents the write | ✓ VERIFIED (code) / ? live | Schema is `.strict()` (l.38) with NO `marketingConsent`/`whatsappOptIn` keys (only in explanatory comments l.5,38); system prompt Members section carries an explicit DECLINE instruction for consent/opt-in (agent-chat.ts l.63). Conversational refusal → UAT. |
| 4 | Agent corrects email directly (no approval gate) | ✓ VERIFIED | `update-member` not in propose-action.ts / approve-proposal.ts (grep empty); no `http` key; email validated + collision-checked (l.58-78) |
| 5 | Campaigns tab exposes a custom segment builder over 3 axes — composable, replacing the fixed at-risk segment; no schema change | ✓ VERIFIED | `gymos.campaigns.tsx`: `matchesSpec` evaluator over minClassesAttended / notAttendedInDays / inquiryBefore-After (l.83-100); Popover builder UI (l.516-653); at-risk retained as built-in preset (l.197-215, 656-669); no schema/migration in AE3 changeset |
| 6 | Agent builds a NL segment → named segment appears in Campaigns without reload | ✓ VERIFIED (code) / ? live | `save-segment.ts` writes `gymos-campaign-segments` app-state array; campaigns reads it client-side (l.273-282) and re-fetches on `actionVersion` bump (l.302-311). Live agent build → UAT. |

**Score:** 7/7 must-have truths structurally verified in code (criteria 1, 3, 6 have a live-behavior tail routed to UAT, not gaps).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `actions/update-member.ts` | partial-update, `.strict()`, E.164, collisions | ✓ VERIFIED | 113 lines; `.strict()`, MEMBER_NOT_FOUND, INVALID_PHONE, INVALID_EMAIL, EMAIL_IN_USE, PHONE_IN_USE; regex `/^\+[1-9]\d{1,14}$/`; firstName `.min(1)`; 4× `guard:allow-unscoped`; no consent keys, no `http:` |
| `actions/save-segment.ts` | writeAppState read-modify-write, 3 axes | ✓ VERIFIED | 77 lines; readAppState + writeAppState on `gymos-campaign-segments`; 4 filter axes; NO_FILTERS guard; `.strict()`; no `http:`; registered in actions-registry |
| `app/routes/gymos.campaigns.tsx` | spec evaluator + builder UI + client read + live-refresh | ✓ VERIFIED | 889 lines; `matchesSpec` exported; literal `"gym_members"."id"` ×5; loader does NOT call readAppState (comments only); Popover + Tabler icons; over-fetch `.limit(500)`; eligible opt-in gate reused |
| `actions/view-screen.ts` | members + campaigns branches | ✓ VERIFIED | `nav?.view === "members"` (l.375) and `"campaigns"` (l.432) both BEFORE the generic email branch (l.444); campaigns branch calls `readAppState("gymos-campaign-segments")`; members branch surfaces no consent/opt-in |
| `server/plugins/agent-chat.ts` | Members + Campaigns prompt sections | ✓ VERIFIED | Members tab (l.61-63) names update-member + consent refusal; Campaigns tab (l.65-66) names save-segment; neither in the propose-action tool line (l.41) |
| `apps/staff-web/AGENTS.md` | rows + two-exposure note | ✓ VERIFIED | update-member + save-segment rows in Agent Actions table; update-member row states it CANNOT change marketing_consent/whatsapp_opt_in; "Two-exposure rule — AE3" note present |
| `.planning/REQUIREMENTS.md` | AEM-03/04 registered + traceability | ✓ VERIFIED | AEM-01..04 in AEM section; Traceability rows AEM-01..04 → Phase AE3 (Complete) |
| `gymos.members.tsx` / `gymos.members_.$id.tsx` | live-refresh | ✓ VERIFIED | both have `useChangeVersions(["action"])` + `useRevalidator` + revalidate-on-bump |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| update-member.ts | schema.gymMembers | resolve-by-id → update().where(eq(id)) | ✓ WIRED | l.45-50, 107-110 |
| save-segment.ts | app-state `gymos-campaign-segments` | readAppState → writeAppState read-modify-write | ✓ WIRED | l.21, 57-74 |
| gymos.campaigns.tsx | GET /_agent-native/application-state/gymos-campaign-segments | client fetch in component, re-fetch on actionVersion | ✓ WIRED | l.273-311 |
| agent-chat.ts | update-member + save-segment | per-tab Members/Campaigns prompt sections | ✓ WIRED | l.61-66 |
| both actions | .generated/actions-registry | auto-registration | ✓ WIRED | `a_update_member` + `a_save_segment` imported & mapped |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| gymos.campaigns.tsx | `allMembers` / `atRisk` | loader Drizzle over-fetch of gym_members + correlated subqueries | Yes (real DB query, 3 axis columns) | ✓ FLOWING |
| gymos.campaigns.tsx | `segments` | client fetch of app-state key (written by save-segment) | Yes (round-trips through writeAppState) | ✓ FLOWING |
| gymos.campaigns.tsx | `eligibleMemberIds` | whatsappOptIn query (opted_out_at IS NULL) | Yes (reused send gate, not forked) | ✓ FLOWING |
| view-screen members/campaigns | `screen.members` / `screen.campaigns` | live gym_members query + readAppState | Yes | ✓ FLOWING |

No hollow props or static-empty returns: the send card's recipient ids derive from `matchedMembers ∩ eligibleMemberIds` (l.347-352), not a hardcoded `[]`.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Integrated typecheck | `npx tsc --noEmit` (apps/staff-web) | exit 0 | ✓ PASS |
| Full unit suite | `npx vitest run` | 12 files / 76 tests passed, exit 0 (trailing ReferenceErrors are post-test Vite/OTel teardown noise) | ✓ PASS |
| Actions registry | grep registry | both `update-member` + `save-segment` imported and mapped | ✓ PASS |
| Live agent walkthroughs | n/a | no local dev server (NitroViteError) | ? SKIP → UAT |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| AEM-01 | AE3-01/03 | Agent updates member profile fields, only those | ✓ SATISFIED | update-member.ts 5 allowed fields |
| AEM-02 | AE3-01/03 | Agent can never modify consent/opt-in (`.strict()`) | ✓ SATISFIED | `.strict()` excludes the keys; prompt refusal as defence-in-depth |
| AEM-03 | AE3-02/03 | Composable segment builder, 3 axes, at-risk preset retained | ✓ SATISFIED | matchesSpec + Popover builder + preset |
| AEM-04 | AE3-02/03 | Agent builds NL segment, appears without reload; UI/agent same spec | ✓ SATISFIED (code) | save-segment + client re-fetch; live appearance → UAT |
| AEX-01 | AE3-03 | Context-awareness via view-screen per-tab | ✓ SATISFIED | members + campaigns branches |
| AEX-02 | constraint | Direct actions, no propose→approve | ✓ SATISFIED | absent from gate files, no `http` key |
| AEX-03 | AE3-02/03 | Live-refresh after agent write | ✓ SATISFIED (code) | useChangeVersions on all 3 routes; live observation → UAT |
| AEX-04 | AE3-03 | Two-exposure: registry + system prompt + AGENTS.md | ✓ SATISFIED | both actions in registry, agent-chat.ts, AGENTS.md |

No orphaned requirements: every Phase-AE3 ID (AEM-01..04, AEX-01..04) is claimed by a plan and present in code.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| update-member.ts | 5, 38 | `marketing_consent`/`whatsapp_opt_in` mentions | ℹ️ Info | Comments documenting the exclusion — NOT schema keys; this is the intended structural guard, not a stub |
| campaigns.tsx | 15, 256 | `readAppState` text | ℹ️ Info | Comments only (loader correctly avoids the call per Pitfall 1); no anti-pattern |
| (none) | — | TODO/FIXME/placeholder/return [] stubs | — | None found in the 7 changed code files |

### Observations (non-blocking)

- No dedicated unit tests were added for `matchesSpec`, `update-member`, or `save-segment`. None of the three plans set `tdd:true` or required tests; the plans explicitly route behavioral validation to live Vercel UAT. The 76 passing tests are pre-existing coverage. Adding a `matchesSpec` unit test later would be cheap insurance for the segment evaluator but is not a phase gap.
- `gymos.campaigns.tsx` duplicates two pure template helpers (`extractVariables`, `getBodyText`) from `TemplatesDialog.tsx` by design (avoids importing the dialog state machine) — documented in-file (l.102-106). Acceptable.

### Human Verification Required

Three live items (in frontmatter) must run on the Vercel deploy because there is no local dev server:
1. **Member phone update + live-refresh** — agent sets E.164, Neon confirms, card refreshes without reload.
2. **Consent refusal** — agent declines "opt in / change consent"; no DB change.
3. **NL segment build** — agent builds the 4+/3-weeks segment; it appears in Campaigns without reload.

### Gaps Summary

No structural gaps. Every artifact exists, is substantive, is wired, and has real data flowing. All 8 requirement IDs are satisfied at the code level; tsc and the full vitest suite pass; the changeset is strictly additive (no schema.ts / migrations touched). The only open items are three live agent+browser behaviors that cannot be exercised without the running app (NitroViteError blocks the local dev server) — these are flagged as human UAT for the Vercel deploy, consistent with the phase plans which deferred them.

---

_Verified: 2026-06-19T00:20:00Z_
_Verifier: Claude (gsd-verifier)_
