---
phase: AE3-members-campaigns-write-tools
plan: 03
type: execute
wave: 2
depends_on: ["01", "02"]
files_modified:
  - apps/staff-web/actions/view-screen.ts
  - apps/staff-web/server/plugins/agent-chat.ts
  - apps/staff-web/AGENTS.md
  - apps/staff-web/app/routes/gymos.members.tsx
  - apps/staff-web/app/routes/gymos.members_.$id.tsx
  - .planning/REQUIREMENTS.md
requirements: [AEM-01, AEM-02, AEM-03, AEM-04, AEX-01, AEX-03, AEX-04]
autonomous: true
must_haves:
  truths:
    - "view-screen has members + campaigns branches: on /gymos/members it returns the directory (and the selected member + recent bookings when nav.memberId is set); on /gymos/campaigns it returns the saved segments (readAppState works inside an action) + at-risk preset count — AEX-01 context-awareness"
    - "The agent-chat.ts system prompt has a Members section (update-member) and a Campaigns section (save-segment) adjacent to the Forms + Schedule sections; the Members section instructs the agent to REFUSE any consent / opt-in change and route members via list-members + view-screen"
    - "Both new actions are documented in apps/staff-web/AGENTS.md (Agent Actions table rows for update-member + save-segment) with a two-exposure note; update-member's row documents the consent exclusion"
    - "The members directory, member detail, and campaigns routes live-refresh after an agent write via useChangeVersions(['action']) + useRevalidator — no manual reload (AEX-03)"
    - "AEM-03 and AEM-04 are registered in .planning/REQUIREMENTS.md (AEM section + Traceability table) mapped to Phase AE3; AEM-01/AEM-02 Traceability rows updated to Phase AE3"
  artifacts:
    - path: "apps/staff-web/actions/view-screen.ts"
      provides: "members + campaigns branches for AEX-01 context-awareness"
      contains: "members"
    - path: "apps/staff-web/server/plugins/agent-chat.ts"
      provides: "Members + Campaigns per-tab sections naming update-member + save-segment with the consent-refusal posture"
      contains: "update-member"
    - path: "apps/staff-web/AGENTS.md"
      provides: "Agent Actions rows + two-exposure note for update-member + save-segment"
      contains: "update-member"
    - path: ".planning/REQUIREMENTS.md"
      provides: "AEM-03 + AEM-04 registered in section + Traceability, mapped to Phase AE3"
      contains: "AEM-03"
  key_links:
    - from: "apps/staff-web/server/plugins/agent-chat.ts"
      to: "update-member + save-segment shipped in AE3-01 + AE3-02"
      via: "systemPrompt names each in a per-tab Members / Campaigns section"
      pattern: "save-segment"
    - from: "apps/staff-web/app/routes/gymos.members.tsx"
      to: "the update-member write"
      via: "useChangeVersions(['action']) + useRevalidator re-runs the loader after an agent edit"
      pattern: "useChangeVersions"
---

<objective>
The LAST wave of AE3 — exposes both new actions to the agent (the second half of the two-exposure rule) and wires live-refresh on the consuming routes. Add `members` + `campaigns` branches to `view-screen` (AEX-01 context-awareness), add Members + Campaigns sections to the `agent-chat.ts` system prompt, document both actions in `AGENTS.md`, wire `useChangeVersions(["action"])` + `useRevalidator` into the members directory + member detail routes (AEX-03 — the campaigns route already got it in AE3-02), and register AEM-03 + AEM-04 in `REQUIREMENTS.md` (D-12).

Purpose: Per AEX-04, an action only becomes agent-callable once it is BOTH in the actions registry (shipped in AE3-01/02) AND named in the system prompt. This wave performs the second exposure. It ships LAST so the agent never hallucinates calls to actions that didn't exist yet (RESEARCH Pitfall 4 + STATE.md "system-prompt ships last" constraint). The Members section also carries the explicit consent-refusal posture so success criterion 3 (clear refusal) is met at the prompt level (defence-in-depth on top of `.strict()`).

Output: edits to view-screen.ts (members + campaigns branches), agent-chat.ts (Members + Campaigns sections), AGENTS.md (two rows + note), gymos.members.tsx + gymos.members_.$id.tsx (live-refresh), and REQUIREMENTS.md (AEM-03/04 registration). NO new action files in this plan — both exist from AE3-01/02. NO gate-file edits (both actions are direct).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/AE3-members-campaigns-write-tools/AE3-RESEARCH.md
@.planning/phases/AE2-schedule-write-tools/AE2-03-PLAN.md
@apps/staff-web/AGENTS.md

<interfaces>
<!-- view-screen.ts already has forms + schedule branches in an if/else-if chain BEFORE the generic `else if (nav?.view)` email branch. -->
<!-- The forms/schedule branches dynamically import: const { getDb, schema } = await import("../server/db/index.js"); + drizzle helpers. -->
<!-- readAppState WORKS inside view-screen (it is an action, wrapped in runWithRequestContext) — use it for the campaigns branch segment read. -->
<!-- agent-chat.ts systemPrompt has Forms + Schedule sections between the suggest-template-vars line and "How you act — three tiers:". Insert Members + Campaigns there. -->
<!-- gymos.members.tsx + gymos.members_.$id.tsx have NO live-refresh wiring yet (both need it). gymos.campaigns.tsx got it in AE3-02. -->
<!-- Live-refresh template (gymos.schedule.tsx:257-266): -->
<!--   const revalidator = useRevalidator(); const actionVersion = useChangeVersions(["action"]); -->
<!--   useEffect(() => { if (actionVersion > 0) revalidator.revalidate(); }, [actionVersion]); -->
<!-- Segments app-state key (must match save-segment.ts + campaigns client read): gymos-campaign-segments. -->
<!-- The view `nav.view` for these routes is the first path segment: "members" / "campaigns" (matches the forms="forms", schedule="schedule" convention). For members detail the selected id rides as nav.memberId if synced; treat it as best-effort (the agent primarily resolves members via list-members, D-09). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add members + campaigns branches to view-screen (AEX-01) and live-refresh to the members routes (AEX-03)</name>
  <files>apps/staff-web/actions/view-screen.ts, apps/staff-web/app/routes/gymos.members.tsx, apps/staff-web/app/routes/gymos.members_.$id.tsx</files>
  <read_first>
    - apps/staff-web/actions/view-screen.ts (FULL — the if/else-if chain: forms branch ~line 272, schedule branch ~line 305, generic email `else if (nav?.view)` ~line 375; readAppState import at top)
    - apps/staff-web/app/routes/gymos.members.tsx (the GymosMembers component — add the hook near the other hooks at the top of the component)
    - apps/staff-web/app/routes/gymos.members_.$id.tsx (the default component — add the hook at the top of the component)
    - apps/staff-web/app/routes/gymos.schedule.tsx lines 257-266 (the live-refresh hook to copy verbatim — PLURAL useChangeVersions)
    - .planning/phases/AE3-members-campaigns-write-tools/AE3-RESEARCH.md "Pattern 6" (view-screen members/campaigns branches) + "Pattern 5" (live-refresh)
  </read_first>
  <action>
    THREE edits.

    (A) `apps/staff-web/actions/view-screen.ts` — insert a `members` branch and a `campaigns` branch into the existing if/else-if chain, BEFORE the generic `else if (nav?.view)` email branch (so `/gymos/members` + `/gymos/campaigns` do NOT fall through to Gmail logic). Mirror the forms/schedule dynamic-import + guard pattern. Add `readAppState` usage for the campaigns branch (the import already exists at the top of the file).

    Members branch:
    ```typescript
    } else if (nav?.view === "members") {
      // AEX-01 — context-aware of the Members tab. Surface the directory (and the
      // selected member + recent bookings when nav.memberId is set) so the agent
      // can ground "update this member" before calling update-member.
      const { getDb, schema } = await import("../server/db/index.js");
      const { eq, desc } = await import("drizzle-orm");
      const db = getDb();
      // guard:allow-unscoped — single-tenant gym tables
      const members = await db
        .select({
          id: schema.gymMembers.id,
          firstName: schema.gymMembers.firstName,
          lastName: schema.gymMembers.lastName,
          phoneE164: schema.gymMembers.phoneE164,
          email: schema.gymMembers.email,
        })
        .from(schema.gymMembers)
        .limit(100);
      screen.members = members.map((m) => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(" ").trim(),
        phoneE164: m.phoneE164,
        email: m.email,
      }));
      if (nav?.memberId) {
        // guard:allow-unscoped — single-tenant gym tables
        const [selected] = await db
          .select()
          .from(schema.gymMembers)
          .where(eq(schema.gymMembers.id, nav.memberId))
          .limit(1);
        if (selected) {
          // guard:allow-unscoped — single-tenant gym tables
          const recentBookings = await db
            .select({
              id: schema.bookings.id,
              occurrenceId: schema.bookings.occurrenceId,
              status: schema.bookings.status,
              bookedAt: schema.bookings.bookedAt,
            })
            .from(schema.bookings)
            .where(eq(schema.bookings.memberId, nav.memberId))
            .orderBy(desc(schema.bookings.bookedAt))
            .limit(10);
          // Never surface consent/opt-in here — update-member cannot touch them.
          screen.selectedMember = {
            id: selected.id,
            firstName: selected.firstName,
            lastName: selected.lastName,
            email: selected.email,
            phoneE164: selected.phoneE164,
            notes: selected.notes,
            createdAt: selected.createdAt,
            recentBookings,
          };
        }
      }
    } else if (nav?.view === "campaigns") {
      // AEX-01 — context-aware of the Campaigns tab. readAppState WORKS here
      // (view-screen is an action, wrapped in runWithRequestContext) — unlike the
      // campaigns page loader, which must read segments client-side.
      // guard:allow-unscoped — application_state is framework-scoped
      const seg = (await readAppState("gymos-campaign-segments")) as
        | { segments?: unknown[] }
        | null;
      screen.campaigns = {
        savedSegments: Array.isArray(seg?.segments) ? seg!.segments! : [],
        presets: ["at-risk"],
      };
    }
    ```
    Splice these as sibling `else if` branches adjacent to the forms/schedule branches (before the generic email `else if (nav?.view)`). If `eq`/`desc` are already destructured from a prior dynamic import in the same function scope, reuse rather than redeclare.

    (B) `apps/staff-web/app/routes/gymos.members.tsx` — add the live-refresh hook inside `GymosMembers` (near the existing `useState`/`useSearchParams` hooks). Add imports `useEffect` (to the existing react import), `useRevalidator` (to the existing `react-router` import), and `useChangeVersions` from `@agent-native/core/client`:
    ```typescript
    const revalidator = useRevalidator();
    const actionVersion = useChangeVersions(["action"]);
    useEffect(() => {
      if (actionVersion > 0) revalidator.revalidate();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actionVersion]);
    ```

    (C) `apps/staff-web/app/routes/gymos.members_.$id.tsx` — add the IDENTICAL hook inside the default component (near the top, after `useLoaderData`). Add the same three imports (`useEffect`, `useRevalidator`, `useChangeVersions`).

    Run `npx prettier --write apps/staff-web/actions/view-screen.ts apps/staff-web/app/routes/gymos.members.tsx apps/staff-web/app/routes/gymos.members_.$id.tsx`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - view-screen.ts contains `else if (nav?.view === "members")` and `else if (nav?.view === "campaigns")`, both placed BEFORE the generic `else if (nav?.view)` email branch
    - the campaigns branch in view-screen.ts calls `readAppState("gymos-campaign-segments")`
    - the members branch assigns `screen.members` and (when nav.memberId set) `screen.selectedMember` and does NOT surface `marketingConsent` / `whatsappOptIn`
    - every query in the new view-screen branches carries `// guard:allow-unscoped`
    - gymos.members.tsx contains `useChangeVersions(["action"])` and `useRevalidator`
    - gymos.members_.$id.tsx contains `useChangeVersions(["action"])` and `useRevalidator`
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>view-screen surfaces members + campaigns context without falling through to Gmail logic; members directory + detail routes live-refresh after agent writes. tsc passes.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Add Members + Campaigns sections to the agent-chat.ts system prompt (AEX-04, second exposure)</name>
  <files>apps/staff-web/server/plugins/agent-chat.ts</files>
  <read_first>
    - apps/staff-web/server/plugins/agent-chat.ts (FULL — the systemPrompt template literal; the Forms section ~line 44-50, the Schedule section ~line 52-59, the "How you act — three tiers:" line ~line 61 it must be inserted before)
    - apps/staff-web/actions/update-member.ts (final param shape + error codes to describe — from AE3-01)
    - apps/staff-web/actions/save-segment.ts (final param shape — from AE3-02)
    - .planning/phases/AE3-members-campaigns-write-tools/AE3-RESEARCH.md "Two-Exposure Wiring" step 3 (the exact Members + Campaigns prompt blocks)
  </read_first>
  <action>
    Edit the `systemPrompt` string in `apps/staff-web/server/plugins/agent-chat.ts`. Insert TWO new per-tab sections ADJACENT to the existing Forms + Schedule sections — AFTER the Schedule section block, BEFORE the "How you act — three tiers:" line (the same insertion zone AE1-03 / AE2-03 used). Do NOT touch the `propose-action` tool line (neither new action is gated — AEX-02).

    Add this block verbatim:
    ```

    Members tab (when the coach is on /gymos/members — call view-screen first to identify the member; reuse list-members to find by name or phone):
    - update-member — update a member's first name, last name, email, phone (E.164), or notes ({memberId, firstName?, lastName?, email?, phoneE164?, notes?}). Only the supplied fields change. Phone must be valid E.164 (e.g. +447700900123) or it is rejected — never reformat it yourself. Returns {error:"INVALID_PHONE"} / {error:"INVALID_EMAIL"} / {error:"EMAIL_IN_USE"} / {error:"PHONE_IN_USE"} / {error:"MEMBER_NOT_FOUND"} on a problem; {updated:false, reason:"no changes"} for an empty patch; {updated:true} on success.
    - You CANNOT change a member's marketing consent or WhatsApp opt-in. Those fields are structurally excluded from update-member and any attempt is rejected. If the coach asks to "opt a member in/out", "change marketing consent", or anything touching consent/opt-in, DECLINE and explain it must be handled through the compliance/opt-in flow, not profile editing — do not call update-member with those fields (it will reject them).

    Campaigns tab (when the coach is on /gymos/campaigns):
    - save-segment — build a named, composable member segment ({name, minClassesAttended?, notAttendedInDays?, inquiryBefore?, inquiryAfter?}). Filters are AND-composed. e.g. "members who attended 4+ classes but haven't been in 3 weeks" → save-segment({name:"4+ classes, inactive 3w", minClassesAttended:4, notAttendedInDays:21}). Supply at least one filter. The saved segment appears on the Campaigns tab without a reload. This only SAVES the segment — it does not send anything; sending still goes through the existing propose-action → approve → worker flow.
    ```

    Run `npx prettier --write apps/staff-web/server/plugins/agent-chat.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - agent-chat.ts systemPrompt contains `Members tab` and `update-member`
    - agent-chat.ts systemPrompt contains `Campaigns tab` and `save-segment`
    - the Members section contains a DECLINE / refusal instruction for consent / opt-in changes (string contains both `consent` and `opt-in` near a decline instruction)
    - agent-chat.ts systemPrompt does NOT list update-member or save-segment in the propose-action tool line (they are direct, not gated)
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>The system prompt has Members + Campaigns sections naming update-member + save-segment, with an explicit consent-refusal posture. Neither is routed through propose-action.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Document both actions in AGENTS.md + register AEM-03/AEM-04 in REQUIREMENTS.md</name>
  <files>apps/staff-web/AGENTS.md, .planning/REQUIREMENTS.md</files>
  <read_first>
    - apps/staff-web/AGENTS.md (the "Agent Actions (LLM tools)" table; the existing two-exposure notes for AE1 forms + AE2 schedule; the Forbidden Vocabulary section)
    - .planning/REQUIREMENTS.md (the "Agentic Editing — Members (AEM)" section with AEM-01/AEM-02; the Traceability table)
    - apps/staff-web/actions/update-member.ts + save-segment.ts (final return shapes to document)
    - .planning/phases/AE3-members-campaigns-write-tools/AE3-RESEARCH.md "Two-Exposure Wiring" step 4 (AGENTS.md rows) + the AEM-03/AEM-04 descriptions
  </read_first>
  <action>
    TWO files.

    (A) `apps/staff-web/AGENTS.md` — two changes:

    (1) ADD two rows to the Agent Actions table (after the forms rows, matching the existing pipe formatting):
    ```
    | `update-member`            | —    | Update a gym member's profile fields — first name, last name, email, phone (E.164), or notes. Only supplied fields change. **Structurally CANNOT change `marketing_consent` or `whatsapp_opt_in`** — the `.strict()` schema rejects those keys at parse time (AEM-02). Phone validated as E.164 and rejected (not reformatted) if malformed; email validated; email/phone collisions with another member rejected. Direct — no approval gate.                                                                                                  | `{updated:true}` / `{updated:false, reason}` / `{error}` |
    | `save-segment`             | —    | Build (save) a named, composable Campaigns segment from filter criteria (minClassesAttended, notAttendedInDays, inquiryBefore, inquiryAfter — AND-composed). Persists a filter spec to `application_state` (key `gymos-campaign-segments`); the Campaigns tab renders it without a reload. Does NOT send — sending still routes through propose-action → approve → worker. Direct — no approval gate.                                                                                                                                                | `{saved:true, segmentId, name}` / `{error}` |
    ```

    (2) ADD a two-exposure note mirroring the AE1/AE2 notes (place after the AE2 schedule note):
    > **Two-exposure rule — AE3 members + campaigns actions.** `update-member` (Members tab) and `save-segment` (Campaigns tab) are exposed to the agent: action files are in `actions/` (auto-registered into `.generated/actions-registry.ts`) AND named in the `agent-chat.ts` system prompt Members + Campaigns sections. Both are DIRECT (no propose-action gate). `update-member` structurally excludes consent/opt-in via a `.strict()` schema — the agent can never flip `marketing_consent` or `whatsapp_opt_in`; the system prompt also instructs it to refuse any such request.

    (B) `.planning/REQUIREMENTS.md` (D-12) — three changes:

    (1) In the "Agentic Editing — Members (AEM)" section, add two new requirement lines after AEM-02:
    ```
    - [ ] **AEM-03**: The Campaigns tab exposes a composable segment builder (UI controls + matching agent action) that filters members by **# classes attended** (≥ N), **recency of last attendance** (not attended in the last X days, including never), and **inquiry/lead date** (member created_at before/after a date) — AND-composed, replacing the single fixed at-risk segment (which survives as a built-in preset). Segment specs persist in `application_state` (no schema change).
    - [ ] **AEM-04**: The agent can build a named segment from natural language via `save-segment` that appears in the Campaigns tab without a reload (UI and agent write the identical `application_state` spec).
    ```

    (2) In the Traceability table, add two rows and update the AEM-01/AEM-02 rows' Phase column from blank/Pending to Phase AE3:
    ```
    | AEM-01 | Phase AE3 | Pending |
    | AEM-02 | Phase AE3 | Pending |
    | AEM-03 | Phase AE3 | Pending |
    | AEM-04 | Phase AE3 | Pending |
    ```
    (Replace the existing AEM-01/AEM-02 rows in place; add AEM-03/AEM-04 immediately after.)

    Run `npx prettier --write apps/staff-web/AGENTS.md` (do NOT run prettier on .planning/REQUIREMENTS.md unless the repo formats .planning markdown — verify with `git check-attr` or just skip; .planning docs are not in the prettier glob).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx prettier --check AGENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/AGENTS.md Agent Actions table contains an `update-member` row and a `save-segment` row
    - the update-member row mentions it CANNOT change `marketing_consent` or `whatsapp_opt_in`
    - apps/staff-web/AGENTS.md contains a "Two-exposure rule — AE3 members + campaigns actions" note
    - .planning/REQUIREMENTS.md contains `AEM-03` and `AEM-04` in BOTH the AEM section and the Traceability table
    - .planning/REQUIREMENTS.md Traceability rows for AEM-01, AEM-02, AEM-03, AEM-04 all show `Phase AE3`
    - `cd apps/staff-web && npx prettier --check AGENTS.md` reports no issues
  </acceptance_criteria>
  <done>Both actions documented in AGENTS.md with the consent-exclusion note; AEM-03 + AEM-04 registered in REQUIREMENTS.md section + Traceability mapped to Phase AE3; AEM-01/02 Traceability updated.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` exits 0 (view-screen + members routes + agent-chat compile)
- grep proves agent-chat.ts names both `update-member` and `save-segment` in per-tab sections
- grep proves the Members section carries a consent/opt-in refusal instruction
- grep proves view-screen.ts has `members` + `campaigns` branches before the generic email branch
- grep proves gymos.members.tsx + gymos.members_.$id.tsx both have `useChangeVersions(["action"])`
- grep proves AGENTS.md has update-member + save-segment rows + the AE3 two-exposure note
- grep proves REQUIREMENTS.md has AEM-03 + AEM-04 in section + Traceability mapped to Phase AE3
- Whole-phase two-exposure check: both new actions appear in BOTH `.generated/actions-registry.ts` (after the Vercel build regen — or hand-add two imports mirroring `a_update_class_definition`) AND the agent-chat.ts system prompt
- Live agent walkthrough (deferred to Vercel deploy; persist the live-refresh items as UAT per RESEARCH): "update Sarah's phone to +447700900123" → Neon MCP confirms the E.164 value + members card refreshes w/o reload; "opt Sarah into WhatsApp" → clear refusal, no consent change; "build a segment of members who attended 4+ classes but haven't been in 3 weeks" → segment appears in Campaigns without a reload.
</verification>

<success_criteria>
- view-screen is context-aware of the Members + Campaigns tabs (AEX-01)
- both new actions are named in the system prompt AND documented in AGENTS.md AND present in the registry (AEX-04 two-exposure rule)
- the agent leads with update-member on Members and refuses consent/opt-in changes; with save-segment on Campaigns
- members directory + detail + campaigns routes all live-refresh after agent writes (AEX-03)
- AEM-03 + AEM-04 registered in REQUIREMENTS.md (D-12); AEM-01..04 traced to Phase AE3
- AE3 phase complete: agent can edit member profiles (consent structurally excluded) and build composable campaign segments, both live-refreshing and context-aware
</success_criteria>

<output>
After completion, create `.planning/phases/AE3-members-campaigns-write-tools/AE3-03-SUMMARY.md`
</output>
