---
phase: AE3-members-campaigns-write-tools
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/actions/save-segment.ts
  - apps/staff-web/app/routes/gymos.campaigns.tsx
requirements: [AEM-03, AEM-04]
autonomous: true
must_haves:
  truths:
    - "The Campaigns tab exposes a structured segment builder with controls for three AND-composed axes: # classes attended (>= N), recency of last attendance (not attended in last X days, incl. never), inquiry/lead date (before/after a date) — replacing the single fixed at-risk segment"
    - "The existing at-risk criteria (14d inactive OR 0 bookings/30d OR pass expiring in 14d) survive as a built-in preset alongside custom segments"
    - "Saved segment filter specs persist in application_state under the key gymos-campaign-segments (no schema change); the agent's save-segment action writes them and the Campaigns component reads them client-side via GET /_agent-native/application-state/:key"
    - "An agent-built segment (via save-segment) appears in the Campaigns tab without a reload — the component re-fetches the segment list when useChangeVersions(['action']) bumps"
    - "Selecting any segment recomputes the eligible recipient count using the existing opt-in gate (opt-in row exists AND opted_out_at IS NULL) — that gate is reused verbatim, not forked"
  artifacts:
    - path: "apps/staff-web/actions/save-segment.ts"
      provides: "agent-only action that writes a named filter spec into application_state (read-modify-write of the gymos-campaign-segments array)"
      contains: "writeAppState"
      min_lines: 30
    - path: "apps/staff-web/app/routes/gymos.campaigns.tsx"
      provides: "spec-driven member evaluator (3 axes) + structured builder UI + client-side segment read + live-refresh"
      contains: "matchesSpec"
      min_lines: 400
  key_links:
    - from: "apps/staff-web/actions/save-segment.ts"
      to: "application_state key gymos-campaign-segments"
      via: "readAppState then writeAppState({ segments }) — read-modify-write of the array"
      pattern: "gymos-campaign-segments"
    - from: "apps/staff-web/app/routes/gymos.campaigns.tsx"
      to: "GET /_agent-native/application-state/gymos-campaign-segments"
      via: "client-side fetch in CampaignsPage (NOT the loader — readAppState throws in a loader); re-fetch on actionVersion bump"
      pattern: "/_agent-native/application-state/"
---

<objective>
Replace the single hardcoded at-risk segment in `gymos.campaigns.tsx` with a composable, spec-driven segment builder, and add the `save-segment` agent action (AEM-03 + AEM-04). The three locked axes (# classes attended, recency of last attendance, inquiry/lead date) are AND-composed. A segment is a stored *filter spec* in `application_state` (not a materialized list), so it stays live as bookings change. The UI-driven builder and the agent's `save-segment` write the IDENTICAL spec to the SAME app-state key (parity). The at-risk criteria become a built-in preset.

Purpose: Realizes success criteria 5 and 6 — coaches (and the agent) can define arbitrary AND-composed segments without a schema change. The eligible-recipient send gate is reused verbatim, so the existing churn-outreach flow keeps working one click away.

Output: ONE new action file (`save-segment.ts`) + a rewrite of the campaigns loader + component (`gymos.campaigns.tsx`). NO schema change (segments live in the framework `application_state` table, already in prod via `suggest-template-vars`). NO gate-file edits (`save-segment` is direct per AEX-02). Agent exposure of `save-segment` (system prompt + AGENTS.md) is deferred to AE3-03 (ships last). This plan is independent of AE3-01 (disjoint files) → runs in parallel wave 1.

CRITICAL architecture finding (from RESEARCH Pitfall 1): `readAppState` THROWS in a React Router v7 page loader (no request context). The loader must NOT read app_state. Segments are read CLIENT-SIDE via `GET /_agent-native/application-state/:key` exactly like `TemplatesDialog.tsx`. The `save-segment` action CAN use `writeAppState` because it runs as an action (request context exists).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/AE3-members-campaigns-write-tools/AE3-RESEARCH.md
@apps/staff-web/app/routes/gymos.campaigns.tsx

<interfaces>
<!-- suggest-template-vars.ts is the writeAppState template (pass the object directly — writeAppState JSON.stringifies internally; pre-stringify double-encodes). -->
<!-- TemplatesDialog.tsx lines 128-145 is the client-side app-state READ template: -->
<!--   const res = await fetch(`/_agent-native/application-state/${encodeURIComponent(key)}`); -->
<!--   const payload = await res.json(); const value = payload?.value ?? payload; -->
<!--   const parsed = typeof value === "string" ? JSON.parse(value) : value; -->
<!-- gymos.schedule.tsx lines 257-266 is the live-refresh template (PLURAL useChangeVersions(["action"]) + useRevalidator). -->
<!-- 42702 gotcha: in correlated subqueries qualify the outer id LITERALLY as "gym_members"."id" — NOT ${schema.gymMembers.id}. -->
<!-- Segment axis columns (confirmed against schema.ts): -->
<!--   # attended  = (SELECT COUNT(*) FROM bookings b WHERE b.member_id = "gym_members"."id" AND b.status = 'attended') -->
<!--   recency     = (SELECT MAX(co.starts_at) FROM bookings b JOIN class_occurrences co ON co.id = b.occurrence_id WHERE b.member_id = "gym_members"."id" AND b.status = 'attended') -->
<!--   inquiry date = gym_members.created_at (no dedicated lead-date column; created_at IS the inquiry signal) -->
<!-- The campaigns loader already has: at-risk computation (lines 96-194), the lastAttendedAt subquery (124), the eligible gate (164-183), useFetcher send (247). -->
<!-- shadcn Select/Input/Card/Badge/Button/AlertDialog already imported; add Popover/Collapsible if needed for the builder. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create the save-segment agent action (writeAppState read-modify-write)</name>
  <files>apps/staff-web/actions/save-segment.ts</files>
  <read_first>
    - apps/staff-web/actions/suggest-template-vars.ts (FULL — the writeAppState pattern; object passed directly, NOT pre-stringified; the guard:allow-unscoped comment for framework-scoped application_state)
    - .planning/phases/AE3-members-campaigns-write-tools/AE3-RESEARCH.md "Pattern 2" (the full save-segment code) + the note on the single-key array approach
    - apps/staff-web/actions/update-class-definition.ts (the defineAction shape / no-http-key convention)
  </read_first>
  <action>
    Create `apps/staff-web/actions/save-segment.ts`. It writes a named filter spec into the `application_state` key `gymos-campaign-segments` (chosen + documented per Claude's Discretion D), doing a read-modify-write of an array so one fetch returns all saved segments. Write verbatim:
    ```typescript
    // save-segment — AEM-04
    //
    // Build (save) a named Campaigns segment from filter criteria. The segment is
    // a stored FILTER SPEC (not a materialized member list) in the framework
    // application_state table under the key gymos-campaign-segments — NO schema
    // change. Filters are AND-composed. The UI-driven builder writes the IDENTICAL
    // spec via the same action HTTP endpoint, so UI and agent stay in sync (D-04).
    //
    // Agent-only mutation: no `http` key (a GET would suppress the live-refresh
    // source:"action" signal the Campaigns tab listens for).

    import { z } from "zod";
    import { defineAction } from "@agent-native/core";
    import { readAppState, writeAppState } from "@agent-native/core/application-state";
    import { nanoid } from "nanoid";

    // Single app-state key holding an array of segment specs (one fetch returns all).
    const SEGMENTS_KEY = "gymos-campaign-segments";

    export default defineAction({
      description:
        "Build (save) a named Campaigns segment from filter criteria. Filters are AND-composed: " +
        "minClassesAttended (>= N attended bookings), notAttendedInDays (last attended before now-N days, or never), " +
        "inquiryBefore / inquiryAfter (member created_at before/after an ISO date). All filters optional, but supply " +
        "at least one. The saved segment appears on the Campaigns tab without a reload. " +
        "Returns {saved:true, segmentId, name} | {error}.",
      schema: z
        .object({
          name: z.string().min(1).max(80),
          minClassesAttended: z.number().int().min(1).max(10000).optional(),
          notAttendedInDays: z.number().int().min(1).max(365).optional(),
          inquiryBefore: z.string().optional(), // ISO date string
          inquiryAfter: z.string().optional(), // ISO date string
        })
        .strict(),
      run: async ({
        name,
        minClassesAttended,
        notAttendedInDays,
        inquiryBefore,
        inquiryAfter,
      }) => {
        const filters = {
          minClassesAttended,
          notAttendedInDays,
          inquiryBefore,
          inquiryAfter,
        };
        // Require at least one filter so we never save an "everyone" segment by accident.
        const hasFilter = Object.values(filters).some((v) => v !== undefined);
        if (!hasFilter) return { error: "NO_FILTERS" };

        // guard:allow-unscoped — application_state is framework-scoped, no ownable gym table touched
        const existing = (await readAppState(SEGMENTS_KEY)) as
          | { segments?: unknown[] }
          | null;
        const segments = Array.isArray(existing?.segments)
          ? existing!.segments!
          : [];

        const segmentId = `seg_${nanoid()}`;
        segments.push({
          id: segmentId,
          name,
          filters,
          createdAt: new Date().toISOString(),
        });

        // Pass the object directly — writeAppState JSON.stringifies internally.
        // guard:allow-unscoped — application_state is framework-scoped
        await writeAppState(SEGMENTS_KEY, { segments });
        return { saved: true, segmentId, name };
      },
    });
    ```
    Notes:
    - Use the SAME key string `gymos-campaign-segments` in Task 2's client read — keep them identical.
    - Do NOT add an `http` key. Do NOT add to propose-action / approve-proposal (AEX-02 direct).
    - `nanoid` is already a workspace dep (used by create-form / propose-action).

    Run `npx prettier --write apps/staff-web/actions/save-segment.ts`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/actions/save-segment.ts` exists
    - it contains `writeAppState` and `readAppState` (read-modify-write)
    - it contains the literal key `gymos-campaign-segments`
    - it contains `minClassesAttended`, `notAttendedInDays`, `inquiryBefore`, `inquiryAfter`
    - it does NOT contain `http:`
    - it contains `// guard:allow-unscoped`
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>save-segment.ts exists, compiles, writes a named filter spec into the gymos-campaign-segments app-state array via read-modify-write. Not yet agent-exposed (AE3-03 does that).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Spec-driven segment evaluator + at-risk preset in the campaigns loader</name>
  <files>apps/staff-web/app/routes/gymos.campaigns.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.campaigns.tsx (FULL — the loader at-risk computation lines 96-194, the 42702 comment 110-115, the lastAttendedAt subquery 124, the eligible-recipient gate 164-183)
    - .planning/phases/AE3-members-campaigns-write-tools/AE3-RESEARCH.md "Pattern 3" (the over-fetch query with attendedCount + lastAttendedAt subqueries and the matchesSpec evaluator) + Pitfall 3 (42702)
    - apps/staff-web/server/db/schema.ts lines 109-132 (gym_members.createdAt is the inquiry/lead date) + bookings/class_occurrences/passes
  </read_first>
  <action>
    Edit the `loader` in `apps/staff-web/app/routes/gymos.campaigns.tsx`. Goal: over-fetch all members with the THREE computed axis columns, expose a shared `matchesSpec` evaluator, keep the at-risk computation as a named preset, and return everything the component needs to evaluate any segment (custom or preset) plus the eligible gate.

    (1) Replace the `memberRows` select so it includes ALL three axis columns. Keep the EXACT literal `"gym_members"."id"` qualifier inside every correlated subquery (Pitfall 3 — `${schema.gymMembers.id}` emits a bare ambiguous `id` → Postgres 42702). Add `createdAt` and an `attendedCount` subquery; keep the existing `lastAttendedAt`, `bookingCount30d`, `earliestPassExpiry` subqueries (the at-risk preset needs them). Bump `.limit(200)` to `.limit(500)` (over-fetch; filter in app code):
    ```typescript
    const memberRows = await db
      .select({
        memberId: schema.gymMembers.id,
        firstName: schema.gymMembers.firstName,
        lastName: schema.gymMembers.lastName,
        phoneE164: schema.gymMembers.phoneE164,
        createdAt: schema.gymMembers.createdAt, // inquiry/lead date axis
        attendedCount: sql<number>`(SELECT COUNT(*) FROM bookings b WHERE b.member_id = "gym_members"."id" AND b.status = 'attended')`,
        lastAttendedAt: sql<
          string | null
        >`(SELECT MAX(co.starts_at) FROM bookings b JOIN class_occurrences co ON co.id = b.occurrence_id WHERE b.member_id = "gym_members"."id" AND b.status = 'attended')`,
        bookingCount30d: sql<number>`(SELECT COUNT(*) FROM bookings b WHERE b.member_id = "gym_members"."id" AND b.booked_at >= ${thirtyDaysAgo})`,
        earliestPassExpiry: sql<
          string | null
        >`(SELECT MIN(p.expires_at) FROM passes p WHERE p.member_id = "gym_members"."id" AND p.expires_at IS NOT NULL AND p.expires_at >= ${nowIso})`,
      })
      .from(schema.gymMembers)
      .limit(500);
    ```

    (2) Build a normalized member array the component can filter, AND keep the at-risk preset. Add (after the select):
    ```typescript
    const allMembers = memberRows.map((r) => ({
      memberId: r.memberId,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
      phoneE164: r.phoneE164,
      createdAt: r.createdAt,
      attendedCount: Number(r.attendedCount ?? 0),
      lastAttendedAt: r.lastAttendedAt ?? null,
      bookingCount30d: Number(r.bookingCount30d ?? 0),
      earliestPassExpiry: r.earliestPassExpiry ?? null,
    }));
    ```
    Keep the existing `atRisk` derivation but compute it FROM `allMembers` (same predicate: noRecentAttendance OR noBookings30d OR passExpiringSoon), preserving its sort + `.slice(0,50)`.

    (3) Compute the eligible-member map for ALL members (not just at-risk) so the component can show an eligible count for any selected segment without a round-trip. Generalize the existing opt-in gate (lines 164-183) to run over `allMembers.map(m => m.memberId)`:
    ```typescript
    // Eligible = has an opt-in row AND opted_out_at IS NULL. Reused verbatim from
    // the existing send gate — DO NOT fork this logic (D-05 / CONTEXT).
    const allMemberIds = allMembers.map((m) => m.memberId);
    const eligibleSet = new Set<string>();
    if (allMemberIds.length > 0) {
      // guard:allow-unscoped — single-tenant gym tables
      const optInRows = await db
        .select({
          memberId: schema.whatsappOptIn.memberId,
          optedOutAt: schema.whatsappOptIn.optedOutAt,
        })
        .from(schema.whatsappOptIn)
        .where(inArray(schema.whatsappOptIn.memberId, allMemberIds));
      for (const r of optInRows) {
        if (r.optedOutAt == null) eligibleSet.add(r.memberId);
      }
    }
    const eligibleMemberIds = Array.from(eligibleSet);
    ```

    (4) Return shape — return `allMembers`, `atRisk`, `templates`, `eligibleMemberIds`, and an `atRiskPreset` filter descriptor. The component evaluates custom-segment specs against `allMembers` client-side. Keep `counts` for the at-risk preset:
    ```typescript
    return {
      allMembers,
      atRisk,
      templates,
      eligibleMemberIds,
      counts: { atRisk: atRisk.length, total: allMembers.length },
    };
    ```

    (5) Export the `matchesSpec` evaluator from this module (the component imports it; keeping it module-level keeps it unit-testable later). Add near the top-level helpers:
    ```typescript
    export type SegmentFilters = {
      minClassesAttended?: number;
      notAttendedInDays?: number;
      inquiryBefore?: string;
      inquiryAfter?: string;
    };
    export type EvalMember = {
      memberId: string;
      attendedCount: number;
      lastAttendedAt: string | null;
      createdAt: string;
    };
    export function matchesSpec(
      m: EvalMember,
      f: SegmentFilters,
      nowMs: number,
    ): boolean {
      if (f.minClassesAttended != null && m.attendedCount < f.minClassesAttended)
        return false;
      if (f.notAttendedInDays != null) {
        const cutoff = new Date(
          nowMs - f.notAttendedInDays * 86400000,
        ).toISOString();
        // "haven't attended in N days" = never attended OR last attended before cutoff
        if (m.lastAttendedAt && m.lastAttendedAt >= cutoff) return false;
      }
      if (f.inquiryBefore && !(m.createdAt < f.inquiryBefore)) return false;
      if (f.inquiryAfter && !(m.createdAt > f.inquiryAfter)) return false;
      return true;
    }
    ```

    Leave the `whatsappTemplates` select + `inArray` import intact. Run `npx prettier --write apps/staff-web/app/routes/gymos.campaigns.tsx`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - gymos.campaigns.tsx loader selects `attendedCount` and `createdAt` columns and still selects `lastAttendedAt`
    - gymos.campaigns.tsx contains the literal `"gym_members"."id"` inside every correlated subquery (NOT `${schema.gymMembers.id}`)
    - gymos.campaigns.tsx exports a `matchesSpec` function and `SegmentFilters` type
    - the loader returns `allMembers` and `eligibleMemberIds` and retains the at-risk preset (`atRisk`)
    - the eligible-recipient query still filters on `whatsappOptIn` with `optedOutAt == null`
    - every new Drizzle query carries `// guard:allow-unscoped`
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Loader over-fetches all members with the 3 axis columns, exposes matchesSpec, keeps the at-risk preset, and returns the generalized eligible set. No 42702 (literal id qualifier preserved).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Structured segment builder UI + client-side segment read + live-refresh</name>
  <files>apps/staff-web/app/routes/gymos.campaigns.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.campaigns.tsx (the CampaignsPage component you just edited the loader of — the existing segment Card, template Card, send footer, useFetcher)
    - apps/staff-web/app/components/gymos/TemplatesDialog.tsx lines 128-145 (the client-side `GET /_agent-native/application-state/:key` read; `payload?.value ?? payload` unwrap)
    - apps/staff-web/app/routes/gymos.schedule.tsx lines 257-266 (the useChangeVersions(["action"]) + useRevalidator live-refresh hook to copy)
    - .planning/phases/AE3-members-campaigns-write-tools/AE3-RESEARCH.md "Pattern 4" (client-side read), "Pattern 5" (live-refresh + re-run readSegments on actionVersion bump)
  </read_first>
  <action>
    Edit `CampaignsPage` in `apps/staff-web/app/routes/gymos.campaigns.tsx`. Add: (a) a structured builder for the 3 axes that writes via `save-segment`, (b) a client-side read of saved segments, (c) an at-risk built-in preset entry, (d) live-refresh that also re-fetches segments. Follow progressive disclosure (CLAUDE.md) — keep the send flow uncluttered; put the builder controls in a `Popover` or `Collapsible` "New segment" affordance, not a permanently-expanded form.

    (1) Add imports at the top of the component file:
    ```typescript
    import { useEffect, useCallback } from "react";
    import { useRevalidator } from "react-router";
    import { useChangeVersions } from "@agent-native/core/client";
    ```
    Add `Popover`/`PopoverTrigger`/`PopoverContent` from `@/components/ui/popover` and (if used) `Collapsible` — both are already available shadcn primitives. Use `IconPlus`, `IconFilter` from `@tabler/icons-react` (no emojis).

    (2) Define the client-side segment reader (component scope), using the SAME key as save-segment.ts:
    ```typescript
    const SEGMENTS_KEY = "gymos-campaign-segments";
    type Segment = {
      id: string;
      name: string;
      filters: SegmentFilters;
      createdAt?: string;
    };
    async function readSegments(): Promise<Segment[]> {
      const res = await fetch(
        `/_agent-native/application-state/${encodeURIComponent(SEGMENTS_KEY)}`,
      );
      if (!res.ok) return [];
      const payload = await res.json().catch(() => null);
      const value = payload?.value ?? payload; // endpoint wraps stored value under `.value`
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return Array.isArray(parsed?.segments) ? parsed.segments : [];
    }
    ```
    Hold saved segments in state (`const [segments, setSegments] = useState<Segment[]>([])`) and load on mount + whenever `actionVersion` bumps.

    (3) Add the live-refresh hook (copy of schedule's, plus the segment re-fetch). The loader revalidation refreshes member rows; the readSegments re-fetch surfaces an agent-built segment without a reload (AEM-04 / success criterion 6):
    ```typescript
    const revalidator = useRevalidator();
    const actionVersion = useChangeVersions(["action"]);
    const refreshSegments = useCallback(() => {
      readSegments().then(setSegments).catch(() => {});
    }, []);
    useEffect(() => {
      refreshSegments();
    }, [refreshSegments]);
    useEffect(() => {
      if (actionVersion > 0) {
        revalidator.revalidate();
        refreshSegments();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actionVersion]);
    ```

    (4) Build a "segment list" surface that shows: the **at-risk preset** (built-in, pre-fills the builder per D-05) PLUS every saved custom segment. For the SELECTED segment compute its matched member ids client-side (preset uses the loader-supplied `atRisk`; custom segments use `matchesSpec` over `allMembers` with `Date.now()`), then intersect with `eligibleMemberIds` for the eligible count:
    ```typescript
    const nowMs = Date.now();
    function matchedIdsFor(seg: Segment | "at-risk"): string[] {
      if (seg === "at-risk") return atRisk.map((m) => m.memberId);
      return allMembers
        .filter((m) => matchesSpec(m, seg.filters, nowMs))
        .map((m) => m.memberId);
    }
    ```
    Track a `selectedSegmentId` (string id, or the sentinel `"at-risk"`). Default-select the at-risk preset on first load so the existing churn flow is unchanged. The send card's `memberIds` for the existing `send-template-to-members` fetcher must use `matchedIds ∩ eligibleMemberIds` for the currently selected segment (replace the old hardcoded `eligibleMemberIds`).

    (5) Add a "New segment" builder behind a `Popover` (progressive disclosure). Local form state for `name` + the three axis inputs (a number Input for `minClassesAttended`, a number Input for `notAttendedInDays`, two date `<input type="date">` or Inputs for `inquiryBefore`/`inquiryAfter`), all optional, AND-composed. On submit, write via the SAME `save-segment` action endpoint through `useFetcher` (parity with the agent — D-04), optimistically prepend the new segment to local `segments` state and select it (CLAUDE.md optimistic UI), then `refreshSegments()` reconciles on the action's source:"action" bump:
    ```typescript
    function handleSaveSegment() {
      const filters: SegmentFilters = {};
      if (minAttended.trim()) filters.minClassesAttended = Number(minAttended);
      if (notInDays.trim()) filters.notAttendedInDays = Number(notInDays);
      if (inquiryBefore) filters.inquiryBefore = inquiryBefore;
      if (inquiryAfter) filters.inquiryAfter = inquiryAfter;
      const body = new URLSearchParams();
      body.set("name", segName.trim());
      for (const [k, v] of Object.entries(filters)) body.set(k, String(v));
      segFetcher.submit(body, {
        method: "post",
        action: "/_agent-native/actions/save-segment",
        encType: "application/x-www-form-urlencoded",
      });
      // optimistic: add locally + select; refreshSegments reconciles on the bump.
      const optimistic: Segment = {
        id: `seg_local_${Date.now()}`,
        name: segName.trim(),
        filters,
      };
      setSegments((prev) => [optimistic, ...prev]);
      setSelectedSegmentId(optimistic.id);
      toast.success(`Saved segment "${optimistic.name}"`);
      // close popover, reset form fields
    }
    ```
    Use a SEPARATE `useFetcher()` instance for the segment save (`segFetcher`) so it doesn't collide with the existing send `fetcher`. Validate: require a non-empty name and at least one filter before enabling Save.

    (6) Update the segment Card header/body: replace the "Custom segment builder is DEFERRED" comment + the fixed at-risk-only copy with the segment list (preset + custom), a selected-segment member preview (matched names, `.slice(0,20)`), a zero-match empty-state copy, and the "New segment" Popover trigger. Keep the at-risk preset's existing descriptive copy as the preset's subtitle. Keep the template picker Card + send footer; only swap the recipient-id source to the selected segment's eligible intersection.

    Run `npx prettier --write apps/staff-web/app/routes/gymos.campaigns.tsx`.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - gymos.campaigns.tsx contains a client-side fetch to `/_agent-native/application-state/` reading the `gymos-campaign-segments` key
    - gymos.campaigns.tsx contains `useChangeVersions(["action"])` and `useRevalidator` and re-fetches segments when actionVersion bumps
    - gymos.campaigns.tsx submits to `/_agent-native/actions/save-segment` via a useFetcher (UI/agent parity)
    - gymos.campaigns.tsx references the at-risk preset as a built-in segment alongside custom segments (string contains `at-risk`)
    - the segment builder uses shadcn `Popover` (no custom absolute-positioned dropdown) and Tabler icons (no emojis)
    - the loader does NOT call `readAppState` (segments are read client-side only)
    - `cd apps/staff-web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Campaigns tab shows a composable builder (3 axes, AND), the at-risk preset, client-read saved segments, optimistic save via save-segment, and live-refresh so agent-built segments appear without a reload. Eligible count recomputes per selected segment via the reused opt-in gate.</done>
</task>

</tasks>

<verification>
- `cd apps/staff-web && npx tsc --noEmit` exits 0 (action + route compile)
- grep proves `gymos-campaign-segments` appears in BOTH save-segment.ts and gymos.campaigns.tsx (same key)
- grep proves the loader does NOT contain `readAppState` (Pitfall 1 — would 500 the page)
- grep proves `"gym_members"."id"` literal is present in the campaigns correlated subqueries (no 42702)
- grep proves save-segment.ts has no `http:` key and is not in propose-action.ts / approve-proposal.ts (AEX-02 direct)
- Manual UAT (cannot be asserted by tsc — persist as a UAT item per RESEARCH "Human UAT"): on the live Vercel deploy, build a segment in the UI → matched + eligible counts render; the at-risk preset still selectable; then (after AE3-03 exposes save-segment) ask the agent to build a segment and confirm it appears without a reload.
</verification>

<success_criteria>
- Campaigns exposes a composable segment builder over the 3 locked axes, AND-composed (AEM-03 / success criterion 5)
- the at-risk criteria survive as a built-in preset (D-05)
- segments persist in application_state (no schema change, D-01); written by save-segment, read client-side (Pitfall 1 honored)
- an agent-built segment appears without a reload via the actionVersion re-fetch (AEM-04 / success criterion 6)
- the eligible-recipient gate is reused verbatim for any selected segment
- save-segment is direct (no gate); agent exposure happens in AE3-03
</success_criteria>

<output>
After completion, create `.planning/phases/AE3-members-campaigns-write-tools/AE3-02-SUMMARY.md`
</output>
