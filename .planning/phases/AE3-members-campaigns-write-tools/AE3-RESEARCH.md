# Phase AE3: Members + Campaigns Write Tools - Research

**Researched:** 2026-06-18
**Domain:** Agent write tools for member profiles + a composable Campaigns segment builder (defineAction `.strict()` schema, application_state persistence, live-refresh via RR v7 loader + useChangeVersions, correlated-subquery SQL)
**Confidence:** HIGH — every finding is from direct source inspection of the shipped AE1/AE2 code, the campaigns/members routes, the schema, and the `@agent-native/core` application-state implementation. Zero new dependencies; nothing required external lookup.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Segment persistence**
- **D-01:** Named/custom Campaigns segments persist as filter-spec rows in the framework's **`application_state`** table — NOT a new domain table. Honors the locked "no schema changes — fully additive" v1.2 constraint. Reference: `apps/staff-web/actions/suggest-template-vars.ts` already writes to `application_state`.
- **D-02:** A segment is a stored **filter spec** (the three axis params + a name), not a materialized member list. The Campaigns loader/UI evaluates the spec against current member data at render time, so the segment stays live as bookings/attendance change.

**Segment builder UX**
- **D-03:** The Campaigns tab exposes **structured filter controls** for three locked axes, composable with **AND**:
  - **# classes attended** — `≥ N` (attended bookings count)
  - **recency of last attendance** — "not in the last X days/weeks" (last attended before a cutoff, or never attended)
  - **inquiry/lead date** — before/after a given date (member/lead creation or first-inquiry date)
- **D-04:** The **agent can build the same segment** via a write action producing the identical filter spec from natural language ("build a segment of members who attended 4+ classes but haven't been in 3 weeks" → a matching, named segment appears in the tab without a reload). UI and agent stay in sync because they write the same `application_state` spec. Both exposures mandatory (parity).

**At-risk segment fate**
- **D-05:** Keep the existing at-risk criteria (**14d inactive OR 0 bookings/30d OR pass expiring in 14d**) as a **built-in preset** that pre-fills the composable builder, sitting alongside custom segments. The surface becomes composable rather than fixed.

**Member profile updates**
- **D-06:** `update-member` edits **only** `first_name`, `last_name`, `email`, `phone_e164`, `notes`. Schema is `.strict()` so any extra key (notably `marketing_consent`) is rejected at parse time. `whatsapp_opt_in` lives in a separate table and is structurally unreachable.
- **D-07:** Phone **validated as E.164** (`+` followed by digits) and **rejected** if non-conforming — no loose normalization, no assumed country code. Email Zod-email-validated. Empty patch is a no-op success (mirror `update-class-definition`'s pattern).
- **D-08:** Profile edits execute **directly** — no propose→approve gate. After the write the member card live-refreshes via `useChangeVersions(["action"])` + `useRevalidator` — no manual reload.
- **D-09:** The agent resolves "which member" by reusing `list-members` (name/phone filter) and `view-screen` (the selected member on the detail route). No new lookup tool.

**Two-exposure + documentation (carried from AE1/AE2, locked)**
- **D-10:** Every new write action (`update-member`, the segment-build action) is exposed in BOTH places: an `actions/*.ts` file (auto-registered) AND a named entry in the `agent-chat.ts` system prompt — plus a new **Members** section (and Campaigns/segment guidance). Each action is also added to the `apps/staff-web/AGENTS.md` Agent Actions table.
- **D-11:** New actions follow the AE2 action shape: agent-only `defineAction` with **no `http` key**, `// guard:allow-unscoped — single-tenant gym tables` on every query, resolve-then-update with explicit not-found errors, return `{updated:true}` / `{error}` style results.

### Claude's Discretion
- Exact `application_state` key naming and JSON shape for the stored segment spec (e.g. `campaign_segments` key holding `{ name, filters: {...} }[]`).
- Whether building a segment also auto-selects it for the send card or just saves it; lean toward saving + selecting the just-built one for a smooth flow.
- Whether the structured controls live inline in the segment card vs a `Popover`/`Sheet` (follow progressive-disclosure conventions).
- Empty-state / zero-match copy for a custom segment.

### Deferred Ideas (OUT OF SCOPE)
- A proper `campaign_segments` domain table (rejected for v1.2 — violates "no schema changes").
- Loose phone normalization / country-code inference (rejected — risks corrupting the WhatsApp natural key).
- OR / nested boolean composition across segment axes (v1.2 is AND-only).
- Agent-initiated bulk member edits and bulk segment sends.
- Write tools for remaining tabs (Payments, Settings, Analytics).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AEM-01 | Coach can ask the agent to update a member's profile fields — first name, last name, email, phone (E.164), notes — and only those fields | `update-member` defineAction → resolve member → partial UPDATE on `gym_members` (`firstName/lastName/email/phoneE164/notes`); mirrors `update-class-definition.ts` exactly |
| AEM-02 | The agent can never modify consent/opt-in state; `.strict()` schema structurally excludes those fields | Zod `.strict()` object with ONLY the 5 allowed keys; `marketingConsent` is a column on `gym_members` but absent from the schema → `.strict()` rejects it at parse time; `whatsappOptIn` is a separate table never imported by the action |
| AEM-03 (REGISTER) | The Campaigns tab exposes a composable segment builder (UI controls) filtering members by # classes attended / recency of last attendance / inquiry-lead date — replacing the fixed at-risk segment | Replace the hardcoded at-risk computation in `gymos.campaigns.tsx` (loader lines 96–194) with a spec-driven evaluator; at-risk becomes a preset. Segment specs persist in `application_state`. |
| AEM-04 (REGISTER) | The agent can build a named segment from natural language that appears in the Campaigns tab without a reload | `save-segment` defineAction → `writeAppState(<segments key>, …)`; route reads specs via the framework `GET /_agent-native/application-state/:key` endpoint + `useChangeVersions(["action"])` revalidation |

> **PLANNER ACTION (D-12):** AEM-03 and AEM-04 are NOT yet in `.planning/REQUIREMENTS.md`. The planner MUST add both to the "Agentic Editing — Members (AEM)" section AND the Traceability table (mapped to Phase AE3) before/alongside writing plans. AEM-01/AEM-02 already exist (Pending). Update the Traceability rows for AEM-01/AEM-02 from "Pending" to "Phase AE3" on completion.
</phase_requirements>

---

## Summary

AE3 is the third pass of an established pattern. **`update-member` is a near-clone of the shipped `update-class-definition.ts`** — resolve-by-id, build a `Partial` from supplied optional fields, empty-patch no-op, single `db.update().where()`, `guard:allow-unscoped` on every query, agent-only (`no http key`). The only differences are: (1) the Zod object must be **`.strict()`** so `marketing_consent` and friends are rejected at parse time (AEM-02 is structural, not behavioral), and (2) phone gets an **E.164 regex** and email gets `z.string().email()`, both rejecting (never normalizing) bad input. There is **no schema change** — `gym_members.notes` is confirmed present (`schema.ts` line 129).

The Campaigns segment builder is the larger lift, and the **central architectural finding is about `application_state` scoping**. The `application_state` table is keyed `(session_id, key)` where `session_id` is the authenticated user's email. The agent action writes via `writeAppState(key, value)` which resolves `session_id` from the per-request context — and because the staff agent runs inside the coach's authenticated request, it writes under the coach's email. The route must read under that same email. **A React Router v7 page loader CANNOT read it**: `readAppState()` throws unless wrapped in `runWithRequestContext`, and the framework only auto-wraps **action HTTP routes** (`/_agent-native/actions/...`), NOT page loaders. The correct read path is the one `TemplatesDialog.tsx` already uses for `suggest-template-vars`: a **client-side `fetch` to `GET /_agent-native/application-state/:key`**, which reads under the authenticated session and round-trips to the same `session_id`. Segment specs therefore live in `application_state`, are written by the agent action, and are read client-side by the Campaigns component (not the loader). The member rows the spec is evaluated against still come from the loader (Drizzle).

Live-refresh on both surfaces uses the **shipped AE2 pattern verbatim**: `const actionVersion = useChangeVersions(["action"]); useEffect(() => { if (actionVersion > 0) revalidator.revalidate(); }, [actionVersion]);`. The members directory (`gymos.members.tsx`) and detail route (`gymos.members_.$id.tsx`) currently have NO such wiring — both must get it (AEX-03). The Campaigns component additionally re-fetches its segment specs from the app-state endpoint when `actionVersion` bumps.

**Primary recommendation:** Three waves. (1) `update-member` action + members/detail live-refresh wiring. (2) Segment spec evaluator in the campaigns loader + `save-segment` action (app-state write) + builder UI + client-side spec read + Campaigns live-refresh. (3) Two-exposure: `view-screen` members + campaigns branches, the new agent-chat.ts Members + Campaigns sections, AGENTS.md rows. Ship the system-prompt exposure LAST in each wave (STATE.md constraint).

---

## Standard Stack

All existing. **Zero new dependencies.** Verified against `apps/staff-web` and shipped AE1/AE2 actions.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@agent-native/core` | workspace | `defineAction`, `writeAppState`/`readAppState`, `useChangeVersions` (client) | Every action + live-refresh already uses it |
| `drizzle-orm` | `^0.45.x` | `db.update().set().where()`, `eq`, `and`, `count`, `sql` correlated subqueries | All gym reads/writes use it |
| `zod` | `^4.x` | `.strict()` member schema, E.164 regex, `.email()` | Shipped in every action |
| `nanoid` | `^5.1.x` | Segment id generation if specs need stable ids | Already used by `create-form`, `propose-action` |

### Supporting (already imported in the routes you'll edit)
| Library | Purpose | Where |
|---------|---------|-------|
| `react-router` (`useLoaderData`, `useRevalidator`, `useFetcher`, `useSearchParams`) | RR v7 loader/action + revalidation | `gymos.campaigns.tsx`, `gymos.members.tsx` |
| `@agent-native/core/client` (`useChangeVersions`) | live-refresh counter on `"action"` source | `gymos.schedule.tsx:36`, `gymos.forms._index.tsx:20` |
| shadcn `Select`, `Input`, `Card`, `Badge`, `Button`, `Popover`, `AlertDialog`, `Collapsible` | segment builder controls | already imported in campaigns/members routes |
| `@tabler/icons-react` | icons (no emojis) | already imported |
| `date-fns` (`format`) | date math for recency cutoffs | imported in members + schedule |

**Installation:** none. `npm view`/version checks intentionally skipped — no package is being added.

### Alternatives Considered (all rejected by locked decisions)
| Instead of | Could Use | Why NOT |
|------------|-----------|---------|
| `application_state` for segments | new `campaign_segments` table | D-01 forbids schema changes (fully additive milestone); deferred post-v1.2 |
| E.164 regex reject | a phone-normalization lib (libphonenumber) | D-07 forbids normalization — `phone_e164` is the WhatsApp natural key; reformat would corrupt it |
| Reading segments in the loader | `readAppState` in `loader()` | **Throws** — no request context in page loaders (see Pitfall 1) |

---

## Architecture Patterns

### Files touched (no new schema, no migration)

```
apps/staff-web/
  actions/
    update-member.ts            ← NEW (AEM-01/02) — clone of update-class-definition.ts + .strict() + E.164
    save-segment.ts             ← NEW (AEM-04)     — writeAppState campaign segment spec
    view-screen.ts              ← EDIT  — add nav.view === "members" and nav.view === "campaigns" branches
  .generated/
    actions-registry.ts         ← REGEN (auto via `pnpm --filter staff-web build`; or hand-add the 2 imports)
  server/plugins/
    agent-chat.ts               ← EDIT  — add Members section + Campaigns segment guidance to systemPrompt
  app/routes/
    gymos.campaigns.tsx         ← EDIT  — spec-driven segment evaluator (replace fixed at-risk), builder UI,
                                          client-side app-state read, live-refresh
    gymos.members.tsx           ← EDIT  — add useChangeVersions(["action"]) + useRevalidator (AEX-03)
    gymos.members_.$id.tsx      ← EDIT  — same live-refresh wiring (AEX-03)
  AGENTS.md                     ← EDIT  — Agent Actions rows for update-member + save-segment; two-exposure note
```

`update-member` and `save-segment` are **NOT gated** (AEX-02 — they are low-risk reversible). Do NOT touch `approve-proposal.ts` `ACTION_ALLOWLIST` or the `propose-action.ts` Zod enum (see "AEX-02 check" below).

### Pattern 1: `update-member` action (clone `update-class-definition.ts` + `.strict()` + E.164)

`update-class-definition.ts` (read in full) is the exact template. Copy its shape:

```typescript
// apps/staff-web/actions/update-member.ts — AEM-01, AEM-02
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

// E.164: leading '+', first digit 1-9, then up to 14 more digits (max 15 total).
const E164 = /^\+[1-9]\d{1,14}$/;

export default defineAction({
  description:
    "Update a gym member's profile: first name, last name, email, phone (E.164), or notes. " +
    "Only the supplied fields change. NEVER changes marketing consent or WhatsApp opt-in — those are " +
    "structurally excluded and cannot be set by this tool. Phone must be valid E.164 (e.g. +447700900123) " +
    "or it is rejected (no auto-formatting). Empty patch is a no-op success. " +
    "Returns {updated:true} | {updated:false, reason} | {error}.",
  schema: z
    .object({
      memberId: z.string().min(1),
      firstName: z.string().min(1).max(120).optional(),
      lastName: z.string().max(120).optional(),
      email: z.string().email().max(254).optional(),
      phoneE164: z.string().regex(E164, "INVALID_PHONE").optional(),
      notes: z.string().max(2000).optional(),
    })
    .strict(), // AEM-02: rejects marketing_consent / whatsapp_opt_in / any extra key at parse time
  run: async ({ memberId, firstName, lastName, email, phoneE164, notes }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym tables
    const [m] = await db
      .select({ id: schema.gymMembers.id })
      .from(schema.gymMembers)
      .where(eq(schema.gymMembers.id, memberId))
      .limit(1);
    if (!m) return { error: "MEMBER_NOT_FOUND" };

    const updates: Partial<typeof schema.gymMembers.$inferInsert> = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (email !== undefined) updates.email = email;
    if (phoneE164 !== undefined) updates.phoneE164 = phoneE164;
    if (notes !== undefined) updates.notes = notes;
    if (Object.keys(updates).length === 0)
      return { updated: false, reason: "no changes" };

    updates.updatedAt = new Date().toISOString(); // gym_members.updatedAt exists (schema.ts:131)

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.gymMembers)
      .set(updates)
      .where(eq(schema.gymMembers.id, memberId));
    return { updated: true };
  },
});
```

**Notes load-bearing for the planner:**
- `firstName` is **`notNull`** in the schema (`schema.ts:113`). The Zod field is `.min(1)` so the agent can never blank it. `lastName`/`email`/`phoneE164`/`notes` are all nullable columns — but the action only ever SETs them when supplied, so it can't accidentally null a column.
- A malformed phone or email makes the **whole action call fail Zod parse** (the agent gets the schema error and should relay a refusal). If you want a clean `{error:"INVALID_PHONE"}` result instead of a raw Zod failure, drop `.regex()` from the schema and validate inside `run()` returning `{error:"INVALID_PHONE"}`. CONTEXT D-07 says "rejected" — either is acceptable; recommend in-`run()` validation so the agent gets a typed, explainable error rather than a Zod stack. The planner picks one and is consistent.
- `email`/`phone` collisions: `gym_members` is **unique on BOTH email AND phone_e164** (see memory `project_gymos_member_upsert_keys`). A naive `UPDATE … SET phone_e164` to a value already owned by another member will 500 on the unique constraint. **Recommended:** before the update, if `email`/`phoneE164` is being changed, `SELECT` for any OTHER member already holding that value and return `{error:"EMAIL_IN_USE"}` / `{error:"PHONE_IN_USE"}` rather than letting Postgres throw. (Single-tenant, so this is a real-data hazard.) See Pitfall 5.

### Pattern 2: `save-segment` action (writeAppState — clone `suggest-template-vars.ts`)

`suggest-template-vars.ts` is the exact template for writing to `application_state` from an action.

```typescript
// apps/staff-web/actions/save-segment.ts — AEM-04
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { readAppState, writeAppState } from "@agent-native/core/application-state";
import { nanoid } from "nanoid";

const SEGMENTS_KEY = "gymos-campaign-segments"; // Claude's discretion (D); pick + document one key

export default defineAction({
  description:
    "Build (save) a named Campaigns segment from filter criteria. Filters are AND-composed: " +
    "minClassesAttended (>= N attended bookings), notAttendedInDays (last attended before now-N days, or never), " +
    "inquiryBefore / inquiryAfter (member created_at before/after an ISO date). All filters optional. " +
    "The saved segment appears on the Campaigns tab without a reload. Returns {saved:true, segmentId, name}.",
  schema: z
    .object({
      name: z.string().min(1).max(80),
      minClassesAttended: z.number().int().min(1).optional(),
      notAttendedInDays: z.number().int().min(1).max(365).optional(),
      inquiryBefore: z.string().optional(), // ISO date
      inquiryAfter: z.string().optional(),  // ISO date
    })
    .strict(),
  run: async ({ name, minClassesAttended, notAttendedInDays, inquiryBefore, inquiryAfter }) => {
    const existing = (await readAppState(SEGMENTS_KEY)) as
      | { segments?: any[] }
      | null;
    const segments = Array.isArray(existing?.segments) ? existing!.segments! : [];
    const segmentId = `seg_${nanoid()}`;
    const filters = { minClassesAttended, notAttendedInDays, inquiryBefore, inquiryAfter };
    segments.push({ id: segmentId, name, filters, createdAt: new Date().toISOString() });
    // writeAppState JSON.stringifies internally — pass the object, do NOT pre-stringify.
    await writeAppState(SEGMENTS_KEY, { segments });
    return { saved: true, segmentId, name };
  },
});
```

**Why a single `gymos-campaign-segments` key holding an array** (not one key per segment): the Campaigns UI lists all saved segments — one fetch returns them all. `writeAppState` upserts the whole `{ segments: [...] }` blob on each save (the store is an `INSERT … ON CONFLICT (session_id, key) DO UPDATE SET value`). The read-modify-write inside `run()` is safe because the staff agent is single-user-at-a-time per coach session.

**Session scoping is correct here:** the action runs in the coach's request context, so `writeAppState` writes under `session_id = <coach email>`. The Campaigns UI reads the same key under the same session via the HTTP endpoint (Pattern 4). They match.

### Pattern 3: Segment spec → Drizzle/SQL evaluator (replace the fixed at-risk loader)

The campaigns loader (`gymos.campaigns.tsx` lines 96–194) already computes the at-risk segment with correlated subqueries against `bookings` / `class_occurrences` / `passes`. **Reuse that exact query shape** and add a generic spec evaluator. The three axes map to columns as follows (verified against `schema.ts`):

| Axis | Definition | Column / SQL |
|------|------------|--------------|
| **# classes attended** | count of `bookings` where `status='attended'` for the member | `(SELECT COUNT(*) FROM bookings b WHERE b.member_id = "gym_members"."id" AND b.status = 'attended')` |
| **recency of last attendance** | `MAX(class_occurrences.starts_at)` over the member's `attended` bookings (NULL = never attended) | `(SELECT MAX(co.starts_at) FROM bookings b JOIN class_occurrences co ON co.id = b.occurrence_id WHERE b.member_id = "gym_members"."id" AND b.status = 'attended')` — this is exactly the `lastAttendedAt` subquery already in the loader (line 124) |
| **inquiry/lead date** | `gym_members.created_at` — the row's creation timestamp is the inquiry/lead date for this schema (no separate lead/conversation date column exists; `gym_members.createdAt` IS the lead-creation signal, confirmed `schema.ts:130`) | `gym_members.created_at` selected directly |

> **Column confirmation (load-bearing):** there is **no dedicated lead/inquiry-date column**. The members directory (`gymos.members.tsx` lines 81–104) derives a "first purchase" date from `payments.occurredAt` / `passes.createdAt`, but the *inquiry/lead* date the segment axis wants is the member-creation timestamp `gym_members.created_at`. Use `created_at`. (Leads enter via form submission / CSV import which INSERT a `gym_members` row, so `created_at` is the inquiry date.)

Evaluator shape (over-fetch all members with the three computed columns, then filter in app code — same approach the at-risk block already uses):

```typescript
// In gymos.campaigns.tsx loader. guard:allow-unscoped — single-tenant gym tables.
// CRITICAL: qualify the outer member id LITERALLY as "gym_members"."id" inside the
// correlated subqueries — NOT ${schema.gymMembers.id}. Drizzle drops the table
// qualifier for single-table FROM queries, emitting a bare "id"; bookings /
// class_occurrences / passes also have an "id", so a bare "id" raises Postgres
// 42702 "column reference is ambiguous" (this 500'd this page before). See the
// existing comment at gymos.campaigns.tsx:110-115 and memory project_gymos_drizzle_ambiguous_id.
const memberRows = await db
  .select({
    memberId: schema.gymMembers.id,
    firstName: schema.gymMembers.firstName,
    lastName: schema.gymMembers.lastName,
    phoneE164: schema.gymMembers.phoneE164,
    createdAt: schema.gymMembers.createdAt, // inquiry/lead date axis
    attendedCount: sql<number>`(SELECT COUNT(*) FROM bookings b WHERE b.member_id = "gym_members"."id" AND b.status = 'attended')`,
    lastAttendedAt: sql<string | null>`(SELECT MAX(co.starts_at) FROM bookings b JOIN class_occurrences co ON co.id = b.occurrence_id WHERE b.member_id = "gym_members"."id" AND b.status = 'attended')`,
  })
  .from(schema.gymMembers)
  .limit(500); // over-fetch; filter per spec below

function matchesSpec(m, filters, nowMs) {
  if (filters.minClassesAttended != null && Number(m.attendedCount) < filters.minClassesAttended) return false;
  if (filters.notAttendedInDays != null) {
    const cutoff = new Date(nowMs - filters.notAttendedInDays * 86400000).toISOString();
    // "haven't attended in N days" = never attended OR last attended before cutoff
    if (m.lastAttendedAt && m.lastAttendedAt >= cutoff) return false;
  }
  if (filters.inquiryBefore && !(m.createdAt < filters.inquiryBefore)) return false;
  if (filters.inquiryAfter && !(m.createdAt > filters.inquiryAfter)) return false;
  return true;
}
```

The **at-risk preset** is the existing filter predicate (lines 142–151) expressed as a spec or kept as a special-cased predicate — D-05 says it becomes a built-in preset that pre-fills the builder; keep its existing computation as the `"at-risk"` preset alongside the spec evaluator.

The **eligible-recipient gate stays untouched** (D-05 / CONTEXT): for any selected segment, the eligible count = members with an opt-in row AND `opted_out_at IS NULL` — reuse loader lines 164–183 verbatim against the matched member ids.

### Pattern 4: Reading saved segments client-side (NOT in the loader)

The Campaigns component reads the persisted spec via the **framework HTTP endpoint** — the same pattern `TemplatesDialog.tsx` (lines 128–145) uses for `suggest-template-vars`. This is mandatory because the loader cannot call `readAppState` (Pitfall 1).

```typescript
// In CampaignsPage component (client). agentNativePath wraps the base path.
async function readSegments(): Promise<Segment[]> {
  const res = await fetch(`/_agent-native/application-state/${encodeURIComponent("gymos-campaign-segments")}`);
  if (!res.ok) return [];
  const payload = await res.json().catch(() => null);
  // The endpoint wraps the stored value under `.value`.
  const value = payload?.value ?? payload;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed?.segments) ? parsed.segments : [];
}
```

The UI-driven builder writes through the **same `save-segment` action HTTP endpoint** (`POST /_agent-native/actions/save-segment`) via `useFetcher` (the campaigns route already uses `useFetcher` for `send-template-to-members`, line 247). This satisfies the "both exposures write the identical spec" parity requirement (D-04): UI and agent both call `save-segment`.

### Pattern 5: Live-refresh (shipped AE2 pattern — copy verbatim)

`gymos.schedule.tsx` lines 257–266 is the exact template. Add to **`gymos.members.tsx`**, **`gymos.members_.$id.tsx`**, and **`gymos.campaigns.tsx`**:

```typescript
import { useRevalidator } from "react-router";
import { useChangeVersions } from "@agent-native/core/client";
import { useEffect } from "react";

const revalidator = useRevalidator();
const actionVersion = useChangeVersions(["action"]);
useEffect(() => {
  if (actionVersion > 0) revalidator.revalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [actionVersion]);
```

For Campaigns, also re-run `readSegments()` when `actionVersion` bumps (the agent's `save-segment` write fires `source:"action"`), so an agent-built segment appears without a reload (AEM-04 / success criterion 6). The loader revalidation refreshes member rows; the `readSegments()` re-fetch refreshes the segment list.

> **Note:** `useChangeVersions(["action"])` (plural, array arg) is the form used in the shipped schedule/forms routes (`gymos.schedule.tsx:258`). The AE1-RESEARCH referenced a singular `useChangeVersion("action")` — the shipped code uses **`useChangeVersions([...])`**. Use the plural array form to match the working routes.

### Pattern 6: `view-screen` members + campaigns branches (AEX-01)

`view-screen.ts` already has `forms` and `schedule` branches in an `if/else-if` chain before the generic email `else if (nav?.view)`. Add `members` and `campaigns` branches in the same chain (dynamic `import("../server/db/index.js")` + drizzle helpers, `guard:allow-unscoped` on each query). For `members`: return the directory (id, name, phone, email) and, when `nav.memberId` is set, the selected member's profile + recent bookings so the agent can ground "update this member". For `campaigns`: return the saved segments (read via `readAppState` — and here it WORKS because `view-screen` is an **action**, which is wrapped in `runWithRequestContext`) plus the at-risk preset count. This is the asymmetry to call out: **`readAppState` works inside an action (`view-screen`, `save-segment`) but NOT inside a page loader.**

### Anti-Patterns to Avoid
- **Reading segments in the campaigns `loader()` via `readAppState`** — throws (no request context). Read client-side via the HTTP endpoint.
- **Putting `http: { method: "GET" }` on `update-member` or `save-segment`** — GET suppresses the `useDbSync` `source:"action"` invalidation, so the UI won't live-refresh, and it'd expose the mutation as a frontend GET. Both are agent-only mutations: **no `http` key**.
- **Normalizing the phone** (stripping spaces, adding country code) — D-07 forbids it; reject non-E.164 instead.
- **Adding `update-member` / `save-segment` to `propose-action` or `ACTURE_ALLOWLIST`** — they're direct (AEX-02). Don't touch the gate files.
- **`${schema.gymMembers.id}` inside a correlated subquery** — emits a bare ambiguous `id` → Postgres 42702. Use the literal `"gym_members"."id"`.
- **A new `campaign_segments` table** — violates the no-schema-change constraint.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Segment persistence | new SQL table | `application_state` via `writeAppState`/`readAppState` (action) + `GET /_agent-native/application-state/:key` (client) | D-01; the framework KV store survives reload, is session-scoped, and both agent + UI already use it (`suggest-template-vars`) |
| Member resolution ("which member") | new lookup action | existing `list-members` (name/phone filter) + `view-screen` selected member | D-09; AEX-01 context-awareness pattern already shipped |
| Live-refresh after a write | `setInterval` / manual `fetch` poll | `useChangeVersions(["action"])` + `useRevalidator()` | shipped in schedule/forms; framework already emits `source:"action"` on non-GET actions |
| Consent exclusion enforcement | a runtime `if (key === 'marketing_consent') reject` | Zod **`.strict()`** object omitting consent fields | structural (AEM-02) — a behavioral check can be bypassed by a future edit; `.strict()` rejects at parse time |
| Partial-update plumbing | bespoke diff logic | clone `update-class-definition.ts` (resolve → build `Partial` from optional fields → empty no-op → single `update().where()`) | identical shape; one shipped, tested template |
| At-risk recipient gating | re-derive opt-in logic | reuse campaigns loader lines 164–183 (opt-in row exists AND `opted_out_at IS NULL`) | the send pipeline depends on this exact gate; don't fork it |

**Key insight:** every primitive AE3 needs is already in production. The work is one new partial-update action (clone), one new app-state-write action (clone), one spec evaluator (extension of an existing correlated-subquery block), and three copy-paste live-refresh hooks.

---

## Runtime State Inventory

> AE3 is purely additive code + framework `application_state` writes. No rename/migration. Categories enumerated for completeness:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Segment specs newly written to `application_state` under key `gymos-campaign-segments` (session-scoped per coach email). No existing data is renamed or migrated. | none — new key only |
| Live service config | None — no n8n/Datadog/external service config involved. | None — verified, AE3 is staff-web-only |
| OS-registered state | None — no Task Scheduler / pm2 / cron registration. | None — verified |
| Secrets/env vars | None — no new secret. Reuses existing DB + framework auth. | None — verified |
| Build artifacts | `.generated/actions-registry.ts` must include the 2 new action imports (regenerated by `pnpm --filter staff-web build`, or hand-added). | regen registry — see Two-Exposure |

---

## Two-Exposure Wiring (AEX-04) — exact steps

The registry exposure makes the action *callable*; naming it in `agent-chat.ts` makes the agent *know it exists*. Both required. Mirror how AE2-03 did Schedule (read in full).

1. **Action files** → `apps/staff-web/actions/update-member.ts`, `apps/staff-web/actions/save-segment.ts`. Agent-only `defineAction`, no `http` key.
2. **Registry** → `.generated/actions-registry.ts`. Regenerated by the build (`apps/staff-web/package.json` `build` script runs `node ../../packages/core/dist/cli/index.js build` which writes the static-import registry). The file header says "AUTO-GENERATED … do not edit manually." If a deploy-time regen isn't run, the planner can hand-add two import lines mirroring the existing `a_update_class_definition` entry — but prefer letting the build regenerate. **Verify at plan time** whether the Vercel build step regenerates; AE1/AE2 relied on the build doing so.
3. **System prompt** → `agent-chat.ts`. Add a **Members section** (none exists yet) and **Campaigns segment guidance**, adjacent to the Forms + Schedule sections (insert before "How you act — three tiers:"). Example Members block:
   ```
   Members tab (when the coach is on /gymos/members — call view-screen first to identify the member; reuse list-members to find by name/phone):
   - update-member — update a member's first name, last name, email, phone (E.164), or notes ({memberId, firstName?, lastName?, email?, phoneE164?, notes?}). Only supplied fields change. Phone must be valid E.164 (e.g. +447700900123) or it is rejected — never reformat it yourself. You CANNOT change marketing consent or WhatsApp opt-in: those fields are structurally excluded and any attempt is refused. If the coach asks to opt a member in/out or change consent, decline and explain it must be done through the compliance flow, not profile editing.

   Campaigns tab (when the coach is on /gymos/campaigns):
   - save-segment — build a named, composable member segment ({name, minClassesAttended?, notAttendedInDays?, inquiryBefore?, inquiryAfter?}). Filters are AND-composed. e.g. "members who attended 4+ classes but haven't been in 3 weeks" → {name:"…", minClassesAttended:4, notAttendedInDays:21}. The saved segment appears on the Campaigns tab without a reload.
   ```
   Keep the Forbidden-Vocabulary refusal posture for consent edits explicit so success criterion 3 (clear refusal) is met.
4. **AGENTS.md** → add two rows to the Agent Actions table (Tier — / direct) and a "Two-exposure rule — AE3 members + campaigns actions" note mirroring the AE1/AE2 notes. Document the consent exclusion on the `update-member` row.

> **Ordering (STATE.md constraint):** ship + verify each action wave BEFORE adding it to the system prompt, so the agent never hallucinates a call to an action not yet in the registry. System-prompt exposure is the LAST task of the final wave.

---

## AEX-02 Check — direct vs gated

Confirmed **both new actions are low-risk/direct, NOT propose→approve**:
- Profile field edits are reversible and not member-visible in a way that triggers a compliance event (consent is explicitly excluded). Success criterion 4 says "the update applies directly (no approval gate needed for profile edits)." AEX-02 classifies "member profile fields" as direct.
- Building a segment is a read-only-by-effect operation (it just saves a filter spec; it sends nothing). The send itself still routes through the existing `send-template-to-members` flow which keeps its own gates.

**Therefore:** do NOT add `update-member` or `save-segment` to `ACTION_ALLOWLIST` (`approve-proposal.ts`) or the `propose-action.ts` Zod enum. **No gate-file edits in AE3.** (This also means AE3 carries none of the "gate atomicity" risk that AE1/AE2 did.) The only place the agent should mention consent is to *refuse* it.

---

## Common Pitfalls

### Pitfall 1: `readAppState` throws in a page loader (segment read MUST be client-side) — CRITICAL
**What goes wrong:** Calling `readAppState("gymos-campaign-segments")` inside the `gymos.campaigns.tsx` `loader()` throws `"Application state access requires an authenticated request context or AGENT_USER_EMAIL env var"`. The framework only wraps **action HTTP routes** (`/_agent-native/actions/...`) in `runWithRequestContext({ userEmail, ... })` (`action-routes.js:111`). RR v7 page loaders are NOT wrapped, so `resolveSessionId()` finds no per-request email and (in prod, no `AGENT_USER_EMAIL`) throws → loader 500.
**Why it happens:** `application_state` is keyed `(session_id, key)` and session resolution needs the request context. Actions get it; loaders don't.
**How to avoid:** Read segments **client-side** via `GET /_agent-native/application-state/:key` (the endpoint reads under the authenticated session — `getSession(event).user.email`), exactly as `TemplatesDialog.tsx` does. The loader supplies the member rows (Drizzle); the component fetches the specs. `view-screen` and `save-segment` CAN use `readAppState`/`writeAppState` because they ARE actions.
**Warning signs:** Campaigns page 500s on load after wiring a loader app-state read; error mentions "authenticated request context."

### Pitfall 2: Session-scope mismatch between agent write and UI read
**What goes wrong:** If segments were written under one `session_id` and read under another, the agent-built segment would never appear in the coach's UI.
**Why it doesn't happen here (but verify):** The staff agent runs inside the coach's authenticated request, so `writeAppState` writes under `session_id = <coach email>`; the `GET /_agent-native/application-state/:key` read also resolves to the coach's email. They match. **Verify on first deploy:** ask the agent to build a segment, then confirm it appears in the coach's Campaigns tab (same browser session). If the agent ever runs under a service identity, this assumption breaks and segments would need a non-session-scoped store — flag if observed.

### Pitfall 3: Postgres 42702 "column reference is ambiguous" — CRITICAL
**What goes wrong:** Using `${schema.gymMembers.id}` inside a correlated subquery emits a bare `id`; the subquery's own tables (`bookings`, `class_occurrences`, `passes`) also have `id`, so Postgres can't disambiguate → 42702, page 500.
**How to avoid:** Reference the outer member id as the **literal** `"gym_members"."id"` inside every correlated subquery (the at-risk block at `gymos.campaigns.tsx:124` already does this and documents it in a comment at lines 110–115). Memory: `project_gymos_drizzle_ambiguous_id`.
**Warning signs:** 500 on Campaigns load; PG error `42702`.

### Pitfall 4: `firstName` is `notNull` — agent must not blank it
**What goes wrong:** Setting `first_name = ''` or `null` violates the `notNull` constraint (`schema.ts:113`) or produces an unnamed member.
**How to avoid:** `firstName: z.string().min(1)` in the schema (already in Pattern 1). `lastName`/`email`/`phoneE164`/`notes` are nullable and only ever SET when supplied — the action can't null a column it isn't given a value for.

### Pitfall 5: Unique constraint on email AND phone_e164 → update collision
**What goes wrong:** `gym_members` has unique indexes on BOTH `email` and `phone_e164` (memory `project_gymos_member_upsert_keys`). `UPDATE … SET phone_e164='+44…'` where that number already belongs to another member 500s on the unique constraint — surfacing as an opaque DB error to the agent.
**How to avoid:** Before updating `email`/`phoneE164`, `SELECT` for any OTHER member (`id <> memberId`) already holding that value; return `{error:"EMAIL_IN_USE"}` / `{error:"PHONE_IN_USE"}` so the agent can explain. (Optional but recommended for a clean UX; without it the write still fails safely, just opaquely.)

### Pitfall 6: Migration-drift gotcha is a NON-issue here (but don't introduce one)
**What goes wrong (on other phases):** `server/db/migrations/*.sql` are NOT auto-run by `db.ts`; new tables/columns must be applied to `gymos-demo` Neon by hand (memory `project_gymos_migrations`).
**Why it's a non-issue for AE3:** AE3 adds **no migration** — `gym_members.notes` already exists (`schema.ts:129`), segments live in the framework `application_state` table (auto-created by `ensureTable()`), and `application_state` already exists in prod (used by `suggest-template-vars`). If a plan ever proposes a schema change here, that violates the locked no-schema-change constraint — reject it.

### Pitfall 7: `guard:no-unscoped-queries` interaction
**What goes wrong:** The root `guard-no-unscoped-queries.mjs` scans for queries on ownable tables. Gym tables (`gym_members`, `bookings`, `passes`, `class_occurrences`) are **single-tenant by design — they do NOT use `ownableColumns()`** and do NOT use `accessFilter`. The guard is satisfied by the `// guard:allow-unscoped — single-tenant gym tables` marker comment in the same file (AGENTS.md "Adding a New Gym Action" step 3).
**How to avoid:** Put `// guard:allow-unscoped — single-tenant gym tables` immediately above every Drizzle query in `update-member.ts`, the new view-screen branches, and any new loader queries. Do NOT wrap in `runWithRequestContext` / `accessFilter` (that's for ownable framework tables only).

### Pitfall 8: No local dev server — verify via tsc + Vercel + Neon MCP
**What goes wrong:** `NitroViteError` prevents `pnpm dev` on staff-web (STATE.md). Plans must not include a local HTTP walkthrough.
**How to avoid:** Verification = `cd apps/staff-web && npx tsc --noEmit`, optional Vitest for pure logic (the `.strict()` rejection + E.164 reject + `matchesSpec` evaluator are unit-testable), then live confirmation on the Vercel deploy with Neon MCP replay/cleanup of test rows.

---

## Code Examples (verified patterns from this codebase)

### Live-refresh hook (from `gymos.schedule.tsx:257-266` — shipped)
```typescript
const revalidator = useRevalidator();
const actionVersion = useChangeVersions(["action"]);
useEffect(() => {
  if (actionVersion > 0) revalidator.revalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [actionVersion]);
```

### app-state write from an action (from `suggest-template-vars.ts:24-32` — shipped)
```typescript
// guard:allow-unscoped — application_state is framework-scoped, no ownable gym table touched
// Pass the object directly — writeAppState JSON.stringifies internally. Pre-stringifying double-encodes.
await writeAppState(key, value);
```

### app-state read client-side (from `TemplatesDialog.tsx:128-145` — shipped)
```typescript
const res = await fetch(`/_agent-native/application-state/${encodeURIComponent(key)}`);
const payload = await res.json();
const value = payload?.value ?? payload;        // endpoint wraps stored value under `.value`
const parsed = typeof value === "string" ? JSON.parse(value) : value;
```

### Correlated subquery with literal id qualifier (from `gymos.campaigns.tsx:124` — shipped)
```typescript
lastAttendedAt: sql<string | null>`(SELECT MAX(co.starts_at) FROM bookings b JOIN class_occurrences co ON co.id = b.occurrence_id WHERE b.member_id = "gym_members"."id" AND b.status = 'attended')`,
```

---

## State of the Art

| Old Approach | Current Approach (AE3) | Impact |
|--------------|------------------------|--------|
| Campaigns has ONE fixed hardcoded at-risk segment (loader-computed) | Composable spec-driven segment builder; at-risk becomes a preset | Coaches (and the agent) define arbitrary AND-composed segments without a schema change |
| Members tab is read-only for the agent | `update-member` partial-update action (consent structurally excluded) | Agent can correct profile data; can never touch consent |
| Member/Campaigns routes do not live-refresh on agent writes | `useChangeVersions(["action"])` + `useRevalidator` wired | No manual reload after an agent edit (AEX-03) |

**Deprecated/outdated within this codebase:** the AE1-RESEARCH reference to singular `useChangeVersion("action")` — the shipped routes use plural `useChangeVersions([...])`. Use the plural form.

---

## Open Questions

1. **In-`run()` vs Zod-`.regex()` phone rejection**
   - What we know: D-07 says reject non-E.164. Both a schema `.regex()` (raw Zod failure surfaced to the agent) and an in-`run()` check returning `{error:"INVALID_PHONE"}` satisfy it.
   - Recommendation: in-`run()` validation returning a typed `{error}` so the agent gets an explainable result; keep `.strict()` on the object regardless. Planner picks one and is consistent. (LOW risk either way.)

2. **Actions-registry regen at Vercel build time**
   - What we know: `apps/staff-web/package.json` `build` runs `node ../../packages/core/dist/cli/index.js build`, which the AE1/AE2 phases relied on to regenerate `.generated/actions-registry.ts`.
   - What's unclear: whether the registry is regenerated on every Vercel build or committed. AE2 added actions and they became callable, so the build path works — but the planner should confirm whether to commit the regenerated registry or rely on the build. Fallback: hand-add two import lines mirroring `a_update_class_definition`.

3. **`save-segment` read-modify-write concurrency**
   - What we know: the single-key array approach does a read-modify-write inside the action. Single coach session → safe.
   - What's unclear: two coaches editing segments simultaneously could clobber. Out of scope for v1.2 (single-studio pilot); flag if multi-coach concurrency becomes real. (LOW.)

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. All work is TypeScript in `apps/staff-web/` against the existing Neon DB + framework `application_state`. No new tool/service/runtime. Verification: `tsc --noEmit` + Vercel deploy + Neon MCP (no local dev server — NitroViteError).

---

## Validation Architecture

> Nyquist validation is DISABLED for this run, so no full VALIDATION.md is required. This section gives the planner the acceptance-criteria scaffolding to derive per-task verification. No Vitest config currently exists in `apps/staff-web/actions/`; the pure-logic pieces below are unit-testable if the planner stands up Vitest, otherwise verify via `tsc` + live deploy.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (already used in `apps/worker`, `apps/edge-webhooks`; NOT yet wired for `apps/staff-web/actions`) |
| Config file | none for staff-web actions — Wave 0 gap if unit tests are wanted |
| Quick run command | `cd apps/staff-web && npx tsc --noEmit` (compile gate — the always-available check) |
| Full suite command | `cd apps/staff-web && npx tsc --noEmit` (+ `npx vitest run` if a config is added) |

### Six ROADMAP success criteria → verification map
| # | Success criterion | Verification |
|---|-------------------|--------------|
| 1 | "update Sarah's phone to +447700900123" → `gym_members` row reflects E.164; card refreshes w/o reload | Unit: `update-member` stores `+447700900123` verbatim (no reformat). Live: agent call → Neon MCP `SELECT phone_e164` + visual refresh on Vercel |
| 2 | "add a note to David's profile: prefers morning classes" → `notes` saves | Unit: notes-only patch updates `notes`, leaves others untouched. Live: Neon MCP `SELECT notes` |
| 3 | "opt Sarah into WhatsApp" / "change marketing consent" → clear refusal; NO consent change | Unit: `.strict()` schema **rejects** `{marketingConsent}` / `{whatsappOptIn}` at parse (assert parse failure). Live: agent declines; Neon MCP confirms `marketing_consent` + `whatsapp_opt_in` unchanged |
| 4 | "correct this member's email" → applies directly (no gate) | Confirm `update-member` has no `propose-action` path and is NOT in `ACTION_ALLOWLIST` (grep). Live: direct apply, no proposal card |
| 5 | Campaigns exposes a composable segment builder (UI + action) over the 3 axes, replacing the fixed at-risk segment | Unit: `matchesSpec` evaluator for each axis (attendedCount ≥ N; notAttendedInDays cutoff incl. never-attended; inquiry before/after). Live: build a segment in the UI → matching member count renders; at-risk still available as preset |
| 6 | "build a segment of members who attended 4+ classes but haven't been in 3 weeks" → named segment appears w/o reload | Unit: agent NL → `save-segment({minClassesAttended:4, notAttendedInDays:21})` → spec persisted. Live: agent call → segment appears in Campaigns tab via `readSegments()` re-fetch on `actionVersion` bump (no reload) |

### Sampling
- **Per task commit:** `cd apps/staff-web && npx tsc --noEmit`
- **Per wave merge:** `tsc --noEmit` + (if Vitest added) `npx vitest run`
- **Phase gate:** tsc green + live agent walkthrough of the six criteria on the Vercel deploy, with Neon MCP confirmation + test-row cleanup
- **Human UAT (manual-only):** the two live-refresh behaviors (member card after edit; segment appears after agent build) — these require a browser and cannot be asserted by tsc/Vitest. Persist as UAT items (mirrors AE2's `test(AE2): persist human verification items as UAT`).

### Wave 0 Gaps
- [ ] (optional) `apps/staff-web/vitest.config.ts` + first test file — only if the planner wants automated unit coverage of `.strict()` rejection / E.164 / `matchesSpec`. If skipped, those become reasoned-through-code + live UAT. (Nyquist disabled, so optional.)
- *(No framework install otherwise required; tsc is the standing gate.)*

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

These directives carry the same authority as locked decisions — plans must comply:
- **`defineAction` is the only path for new operations** (Six Rules #3); write actions are agent-only (no `http` key) per `apps/staff-web/AGENTS.md` "Adding a New Gym Action" step 2.
- **shadcn/ui primitives mandatory; no custom modals/dropdowns; no `window.confirm/alert/prompt`** — use `AlertDialog`/`Popover`/`Select` for the segment builder.
- **Tabler icons only; no emojis as icons** — in buttons/badges/toasts.
- **TypeScript everywhere** (`.ts`/`.tsx`); **Prettier** (`npx prettier --write`) after edits.
- **No breaking database changes — strictly additive.** AE3 makes none.
- **No unscoped queries on ownable resources** — gym tables are single-tenant, exempt via `// guard:allow-unscoped` marker (not `accessFilter`).
- **Optimistic UI by default** — the UI-driven segment save and any member edit form should update optimistically; never block a click on a server round-trip (except destructive/irreversible ops — none here).
- **Never create/switch git branches** unless the user explicitly asks — stay on `master`.
- **No status footer** in responses (memory `feedback_no_status_footer`) — AGENTS.md's `🟢/🟡/🔴` block is overridden for this user.
- **Forbidden Vocabulary** (`apps/staff-web/AGENTS.md`): no "email/Gmail/inbox(email)/thread(email)/Starred/Important/Archive/Drafts/labels/mail filters" in agent-facing copy.

---

## Sources

### Primary (HIGH confidence — direct file read)
- `apps/staff-web/actions/update-class-definition.ts` — partial-update template (resolve → Partial → empty no-op → `{updated}` → `guard:allow-unscoped`)
- `apps/staff-web/actions/suggest-template-vars.ts` — `writeAppState` from an action (object passed directly, not pre-stringified)
- `apps/staff-web/actions/list-members.ts` — member reader reused for resolution (D-09)
- `apps/staff-web/actions/view-screen.ts` — forms + schedule branches (template for members/campaigns branches); confirms `readAppState` works inside an action
- `apps/staff-web/actions/propose-action.ts` — gate enum (confirms what NOT to touch for AEX-02)
- `apps/staff-web/app/routes/gymos.campaigns.tsx` — at-risk loader (lines 96–194), 42702 comment (110–115), `lastAttendedAt` subquery (124), eligible-recipient gate (164–183), `useFetcher` send pattern (247)
- `apps/staff-web/app/routes/gymos.members.tsx` — directory loader/UI (NO live-refresh yet); granted/debit split pattern
- `apps/staff-web/app/routes/gymos.members_.$id.tsx` — member detail loader/UI (NO live-refresh yet)
- `apps/staff-web/app/routes/gymos.schedule.tsx` lines 257–266 — shipped `useChangeVersions(["action"])` + `useRevalidator` live-refresh
- `apps/staff-web/app/components/gymos/TemplatesDialog.tsx` lines 128–145 — client-side `GET /_agent-native/application-state/:key` read
- `apps/staff-web/server/plugins/agent-chat.ts` — current systemPrompt (Forms + Schedule sections, NO Members section); propose-action line
- `apps/staff-web/server/db/schema.ts` lines 109–132 (`gymMembers`: firstName notNull, lastName, email, phoneE164, notes, marketingConsent, createdAt, updatedAt), 343–352 (`whatsappOptIn` separate table), 188–258 (class_definitions/occurrences/bookings/passes/pass_debits)
- `apps/staff-web/AGENTS.md` — Agent Actions table, two-exposure notes, "Adding a New Gym Action" 6-step, Forbidden Vocabulary
- `.planning/phases/AE2-schedule-write-tools/AE2-03-PLAN.md` — how the two-exposure (view-screen branch + system prompt + AGENTS.md) wave was structured
- `.planning/phases/AE1-forms-write-tools/AE1-RESEARCH.md` — `.strict()`, gate-atomicity, live-refresh patterns
- `node_modules/@agent-native/core/dist/application-state/store.js` — `application_state` table `(session_id, key)` PK; upsert-on-conflict; `appStateGet/Put`
- `node_modules/@agent-native/core/dist/application-state/script-helpers.js` — `readAppState`/`writeAppState`; `resolveSessionId()` throws without request context (Pitfall 1 proof)
- `node_modules/@agent-native/core/dist/server/action-routes.js` line 111 — `runWithRequestContext` wraps ONLY action HTTP routes (not page loaders)
- `node_modules/@agent-native/core/dist/server/core-routes-plugin.js` lines 185–192, 362–368 — `GET/PUT/DELETE /_agent-native/application-state/:key`; reads under `getSession(event).user.email`

### Project memory (cross-checked)
- `project_gymos_drizzle_ambiguous_id` (42702 / literal `"gym_members"."id"`)
- `project_gymos_member_upsert_keys` (unique on BOTH email AND phone)
- `project_gymos_migrations` (migrations not auto-run — non-issue for AE3, no migration)
- `feedback_no_status_footer`

## Metadata

**Confidence breakdown:**
- Standard stack (zero new deps): HIGH — every primitive inspected in shipped code
- `update-member` shape: HIGH — direct clone of `update-class-definition.ts`; schema columns verified
- Consent exclusion via `.strict()`: HIGH — `.strict()` semantics + `marketingConsent`/`whatsappOptIn` location confirmed
- Segment app-state persistence + read path: HIGH — store impl + loader-vs-action context boundary read from core source; `TemplatesDialog` read pattern is the proven precedent
- Segment SQL axes / columns: HIGH — confirmed against `schema.ts` + the at-risk subqueries; `created_at` as the inquiry/lead date is the only candidate (no dedicated column)
- Live-refresh: HIGH — copy of shipped schedule/forms wiring
- AEX-02 (direct, no gate): HIGH — matches success criterion 4 + AEX-02 classification

**Research date:** 2026-06-18
**Valid until:** 2026-07-31 (stable codebase; no upstream merges expected in this window)
