---
phase: MC2-deep-funnel-lifecycle
plan: 04
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - apps/staff-web/actions/mark-booking-attended.ts
  - apps/staff-web/server/lib/stage-event-map.ts
  - apps/staff-web/AGENTS.md
autonomous: true
requirements: [LIFE-03, LIFE-04]
must_haves:
  truths:
    - "markBookingAttended flips a booking to status=attended + attended_at=NOW() — the first and only code path that sets attended"
    - "Marking a booking attended enqueues exactly one Schedule CAPI event keyed memberId:occurrenceId"
    - "Re-marking an already-attended booking is a no-op (no second enqueue, no second status write)"
    - "A Schedule enqueue failure never aborts the attendance status write (best-effort try/catch, D-17)"
    - "Contact is documented as the recommended Meta campaign optimisation target for ops (LIFE-04)"
  artifacts:
    - path: "apps/staff-web/actions/mark-booking-attended.ts"
      provides: "Attendance chokepoint action + Schedule enqueue"
      contains: "status: \"attended\""
    - path: "apps/staff-web/AGENTS.md"
      provides: "Ops note naming Contact as optimisation target"
      contains: "optimisation target"
  key_links:
    - from: "apps/staff-web/actions/mark-booking-attended.ts"
      to: "enqueueMetaCapiEvent (~/lib/queue-client)"
      via: "best-effort enqueue after status flip, eventId memberId:occurrenceId"
      pattern: "enqueueMetaCapiEvent"
---

<objective>
Build the single attendance-transition chokepoint — `mark-booking-attended` — the FIRST and ONLY code that sets `bookings.status = 'attended'`. It flips status + stamps `attended_at`, then enqueues exactly one Schedule CAPI event per (member, occurrence). Also adds the LIFE-04 ops note naming Contact as the recommended campaign optimisation target. This plan lives entirely in staff-web (no worker file overlap with Plans 02/03).

Purpose: LIFE-03 (Schedule event on attendance) + LIFE-04 (ops documentation). Minimal transition — no check-in UI (D-11).
Output: `mark-booking-attended.ts` defineAction, staff-web stage-event-map twin synced if needed, AGENTS.md ops note + action-table row.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MC2-deep-funnel-lifecycle/MC2-CONTEXT.md
@.planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md
@.planning/REQUIREMENTS.md

<interfaces>
Model action — apps/staff-web/actions/mark-occurrence-complete.ts (clean defineAction, no http key = agent-only mutation, guard:allow-unscoped on gym tables, getDb + schema from "../server/db/index.js", eq from "drizzle-orm").

bookings table (apps/staff-web/server/db/schema.ts line 285-299):
```
id (text PK), occurrence_id (text NOT NULL), member_id (text NOT NULL),
status enum ["booked","waitlist","cancelled","attended","no_show"] default "booked",
attended_at (text nullable), cancelled_at, booked_at
```
"attended" is ALREADY in the enum — no migration. attended_at column already exists.

gym_members (apps/staff-web/server/db/schema.ts line 109): id, email, phoneE164.

Staff-web enqueue — import { enqueueMetaCapiEvent } from "~/lib/queue-client" (re-exports from @gymos/queue). This is the staff-web convention (NOT a direct @gymos/queue import) per RESEARCH ~line 163-170. Extended payload accepts value/currency/stageKey.

resolveStageEvent — apps/staff-web/server/lib/stage-event-map.ts: resolveStageEvent(config, "schedule") -> "Schedule". config = studio_owner_config.meta_stage_event_map.

studio config — studioOwnerConfig table (schema.ts line 646), column metaStageEventMap (text, JSON string). Read via getDb().select().

SHA-256 hashing — use createHash from "node:crypto": email -> sha256(email.toLowerCase().trim()); phone -> sha256(phoneE164.replace(/\D/g,"")). Mirror apps/staff-web/server/lib/meta-capi-test-send.ts which imports createHash the same way. There is NO meta_lead_attribution Drizzle table reads needed beyond raw SQL — staff-web has the metaLeadAttribution schema (schema.ts ~line 730+) so prefer Drizzle there, but a raw SQL upsert is acceptable with guard:allow-unscoped.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build mark-booking-attended action (status flip + Schedule enqueue)</name>
  <files>apps/staff-web/actions/mark-booking-attended.ts, apps/staff-web/server/lib/stage-event-map.ts</files>
  <read_first>
    - apps/staff-web/actions/mark-occurrence-complete.ts (the model action — defineAction shape, no-op-on-already-done idempotency, guard markers)
    - apps/staff-web/server/db/schema.ts (bookings lines 285-299; gymMembers line 109; metaLeadAttribution ~line 730+; studioOwnerConfig line 646 metaStageEventMap)
    - apps/staff-web/server/lib/stage-event-map.ts (resolveStageEvent + Schedule default)
    - apps/staff-web/app/lib/queue-client.ts (enqueueMetaCapiEvent re-export)
    - apps/staff-web/server/lib/meta-capi-test-send.ts (createHash import + enqueue-from-staff-web pattern)
    - .planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md (LIFE-03 breakdown ~line 404-457: action steps, occurrenceId from booking row, scheduleSentAt gate via handler)
  </read_first>
  <action>
    Create apps/staff-web/actions/mark-booking-attended.ts using defineAction (model on mark-occurrence-complete.ts). NO `http` key (mutation = agent/staff-only). Carry `// guard:allow-unscoped — single-tenant gym tables` on every gym-table query.

    Schema: `z.object({ bookingId: z.string().min(1) })`.

    run() logic (RESEARCH LIFE-03 steps):
    1. SELECT the booking (id, occurrenceId, memberId, status, attendedAt) from schema.bookings WHERE id = bookingId, limit 1.
    2. If not found -> `return { error: "BOOKING_NOT_FOUND" }`.
    3. If `booking.status === "attended"` -> `return { attended: true }` (idempotent no-op — marker already set, do NOT re-enqueue).
    4. If `booking.status === "cancelled"` -> `return { error: "BOOKING_CANCELLED" }`.
    5. UPDATE schema.bookings SET status="attended", attendedAt=NOW-ISO WHERE id=bookingId. (Use `new Date().toISOString()` for attendedAt to match the text column convention — bookings.attendedAt is a text column.)
    6. Best-effort Schedule CAPI enqueue, wrapped in try/catch (D-17 — must NOT undo the status write):
       ```typescript
       try {
         const { enqueueMetaCapiEvent } = await import("../app/lib/queue-client.js");
         // resolve stageEventMap config
         const [cfg] = await db
           .select({ map: schema.studioOwnerConfig.metaStageEventMap })
           .from(schema.studioOwnerConfig)
           .limit(1); // guard:allow-unscoped — single-tenant meta config
         const eventName = resolveStageEvent(cfg?.map ?? null, "schedule");
         // ensure attribution row + read fbc/fbp (D-04/D-05)
         //   guard:allow-unscoped — single-tenant meta attribution
         await db.execute(sql`
           INSERT INTO meta_lead_attribution (id, member_id, created_at, updated_at)
           VALUES (${nanoid()}, ${booking.memberId}, NOW(), NOW())
           ON CONFLICT (member_id) DO NOTHING
         `);
         const attrRows = await db.execute(sql`
           SELECT fbc, fbp FROM meta_lead_attribution WHERE member_id = ${booking.memberId} LIMIT 1
         `); // guard:allow-unscoped — single-tenant meta attribution
         const attr = ((attrRows as any)?.rows ?? (attrRows as any) ?? [])[0] ?? {};
         // hashed PII
         const [m] = await db
           .select({ email: schema.gymMembers.email, phone: schema.gymMembers.phoneE164 })
           .from(schema.gymMembers)
           .where(eq(schema.gymMembers.id, booking.memberId))
           .limit(1); // guard:allow-unscoped — single-tenant gym tables
         const hashedEmail = m?.email ? createHash("sha256").update(m.email.toLowerCase().trim()).digest("hex") : undefined;
         const hashedPhone = m?.phone ? createHash("sha256").update(m.phone.replace(/\D/g, "")).digest("hex") : undefined;
         await enqueueMetaCapiEvent({
           eventId: `${booking.memberId}:${booking.occurrenceId}`,
           memberId: booking.memberId,
           eventName,
           actionSource: "system_generated",
           stageKey: "schedule",
           eventTime: Math.floor(Date.now() / 1000),
           hashedEmail,
           hashedPhone,
           fbc: attr.fbc ?? undefined,
           fbp: attr.fbp ?? undefined,
         });
       } catch (err) {
         console.error("[mark-booking-attended] Schedule CAPI enqueue failed — non-fatal (D-17):", err);
       }
       ```
    7. `return { attended: true }`.

    Imports: `import { z } from "zod"; import { defineAction } from "@agent-native/core"; import { getDb, schema } from "../server/db/index.js"; import { eq, sql } from "drizzle-orm"; import { nanoid } from "nanoid"; import { createHash } from "node:crypto"; import { resolveStageEvent } from "../server/lib/stage-event-map.js";` Use `const db = getDb();` at the top of run().

    event_id is `${booking.memberId}:${booking.occurrenceId}` — VERBATIM from LIFE-03 (memberId:occurrenceId). The scheduleSentAt marker is stamped by the worker handler on success (Plan 01 stageKey write-back) — do NOT stamp it in this action. Idempotency: the status==="attended" no-op guard (step 3) prevents a second enqueue on re-mark; pg-boss singletonKey on memberId:occurrenceId is the concurrency backstop.

    Run prettier conceptually.
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit 2>&1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - apps/staff-web/actions/mark-booking-attended.ts exists and exports a default defineAction.
    - It has NO `http` key (agent/staff-only mutation).
    - `grep -n 'status: "attended"' apps/staff-web/actions/mark-booking-attended.ts` matches in the UPDATE.
    - `grep -n "attendedAt" apps/staff-web/actions/mark-booking-attended.ts` matches (stamped on the flip).
    - `grep -n '`${booking.memberId}:${booking.occurrenceId}`' apps/staff-web/actions/mark-booking-attended.ts` matches (event_id formula).
    - `grep -n 'stageKey: "schedule"' apps/staff-web/actions/mark-booking-attended.ts` matches.
    - `grep -n 'actionSource: "system_generated"' apps/staff-web/actions/mark-booking-attended.ts` matches.
    - The action returns `{ attended: true }` early when status is already "attended" (no second enqueue).
    - The enqueue is inside a try/catch with a "non-fatal (D-17)" console.error.
    - `grep -c "guard:allow-unscoped" apps/staff-web/actions/mark-booking-attended.ts` is at least 3.
    - The action does NOT write schedule_sent_at (handler owns it).
    - staff-web tsc clean (no NEW errors from this file).
  </acceptance_criteria>
  <done>mark-booking-attended flips status to attended + stamps attended_at, then enqueues one Schedule event keyed memberId:occurrenceId; re-marking is a no-op; enqueue failure is isolated.</done>
</task>

<task type="auto">
  <name>Task 2: LIFE-04 ops note + AGENTS.md action-table row + two-exposure decision</name>
  <files>apps/staff-web/AGENTS.md</files>
  <read_first>
    - apps/staff-web/AGENTS.md (the Agent Actions table + the "Adding a New Gym Action" section + the existing two-exposure-rule callouts)
    - .planning/phases/MC2-deep-funnel-lifecycle/MC2-CONTEXT.md (D-11 minimal transition NOT a UI/agent surface; D-13 Contact optimisation note)
    - .planning/phases/MC2-deep-funnel-lifecycle/MC2-RESEARCH.md (LIFE-04 ops note text ~line 460-470)
  </read_first>
  <action>
    Two documentation edits in apps/staff-web/AGENTS.md (no code).

    1. LIFE-04 ops note. Add a short subsection (e.g. under the Agent Actions table or near the Meta/CAPI context if present) titled "Meta Conversion Tracking — campaign optimisation target" with this exact guidance (D-13):
    "Use the **Contact** event as your Meta ad campaign conversion goal. It represents a lead's first genuine engagement (their first inbound WhatsApp reply) and is the highest-intent signal available before a purchase. Purchase optimises for revenue (LTV/ROAS); Schedule confirms attendance; but Contact is the recommended primary optimisation target for top-of-funnel lead campaigns. Event names are configurable via `stageEventMap` in studio config — renaming an event there changes what is reported with no code change (LIFE-04)."

    2. Add a row to the Agent Actions table for `mark-booking-attended`. Per D-11 this is a MINIMAL backend transition, NOT an agent/UI surface — so it is registered as an action file but is NOT added to the agent-chat.ts system prompt tool list (it is staff/programmatic only, like create-connect-account which is marked "Staff-only, not an agent tool"). Table row:
    | `mark-booking-attended` | — | (Staff/programmatic chokepoint, not an agent LLM tool.) The single path that flips a booking to `status='attended'` (+ `attended_at`) and fires the Meta `Schedule` CAPI event once per (member, occurrence). Idempotent — re-marking an already-attended booking is a no-op. No check-in UI yet (deferred). | `{attended:true}` or `{error:'BOOKING_NOT_FOUND'\|'BOOKING_CANCELLED'}` |

    Add a one-line note in the "Adding a New Gym Action" / two-exposure area documenting the decision: "`mark-booking-attended` (MC2 LIFE-03) is the attendance chokepoint. It is registered as an action file but intentionally NOT added to the agent-chat.ts system prompt (D-11: minimal backend transition, not an agent surface). It carries `guard:allow-unscoped` on gym/attribution tables and enqueues the Schedule CAPI event best-effort (D-17)."

    Do NOT edit agent-chat.ts (the action is intentionally not agent-exposed).
  </action>
  <verify>
    <automated>grep -n "mark-booking-attended\|optimisation target\|Contact" apps/staff-web/AGENTS.md | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "optimisation target" apps/staff-web/AGENTS.md` matches and the surrounding text names Contact as the recommended target.
    - `grep -n "stageEventMap" apps/staff-web/AGENTS.md` matches in the ops note (LIFE-04 rename-without-code).
    - `grep -n "mark-booking-attended" apps/staff-web/AGENTS.md` matches (action-table row + two-exposure note).
    - The AGENTS.md text states mark-booking-attended is NOT an agent LLM tool (D-11).
    - agent-chat.ts is NOT modified by this plan.
  </acceptance_criteria>
  <done>AGENTS.md documents Contact as the campaign optimisation target (LIFE-04), records mark-booking-attended as a non-agent attendance chokepoint, and the rename-without-code property of stageEventMap.</done>
</task>

</tasks>

<verification>
- staff-web `tsc --noEmit` clean.
- Grep confirms: status "attended" + attendedAt write; event_id memberId:occurrenceId; stageKey schedule; action_source system_generated; no-op-on-already-attended; try/catch D-17; guard markers; ops note naming Contact.
- No migration (attended enum value + attended_at column pre-exist).
- agent-chat.ts untouched (D-11 — not an agent surface).
</verification>

<success_criteria>
- A booking marked attended produces exactly one Schedule event per (member, occurrence); re-marking does not re-fire.
- mark-booking-attended is the sole writer of status='attended'.
- Contact is documented as the campaign optimisation target; stageEventMap rename-without-code is noted (LIFE-04).
- Schedule enqueue failure never undoes the attendance write (D-17).
</success_criteria>

<output>
After completion, create `.planning/phases/MC2-deep-funnel-lifecycle/MC2-04-SUMMARY.md`.
</output>
