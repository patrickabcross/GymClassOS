# Phase BD3: HQ Brain + Dispatcher — Research

**Researched:** 2026-06-19
**Domain:** HQ telemetry analytics (HQB) + HQ WhatsApp WABA send path (HQD)
**Confidence:** HIGH for HQB data layer (schema verified); HIGH for gate interfaces (code read); MEDIUM for HQ WABA registration (Meta docs pattern, not live-verified); HIGH for Content fork scope

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Health/at-risk classification is deterministic threshold rules over telemetry aggregates (SQL/TS reading hq_telemetry_snapshots + hq_token_usage joined to hq_studios). Brain distillation queue is an additive narrative layer only — NOT the source of truth for health.

**D-02 (staleness gate):** Any studio whose `last_telemetry_received_at` is older than the staleness threshold is classified `stale`/`unknown` — never shown as `healthy`/`active`. Exact threshold is Claude's discretion as a named config constant.

**D-03 (classification signals):** active vs dormant (engagement aggregates), under-messaging (low outbound/conversation counts), low-retention (retentionRate below threshold), token-spend (from hq_token_usage). Thresholds are tunable constants.

**D-04 (cohorts):** At-risk = dormant OR under-messaging OR low-retention OR stale telemetry. Power-user = high engagement + healthy retention + active messaging. Computed views only — not stored membership rows.

**D-05 (console):** Studio list/table using shadcn Table. Reuse existing HQ routes/components rather than new layout.

**D-06 (drill-in):** Per-studio detail route showing telemetry history over time (charts of snapshot metrics). Progressive disclosure: summary in list, full history on drill-in.

**D-07 (mirror, not import):** HQD copies gate logic from services/worker/src/domain/gates/ into HQ-owned code. Never import services/worker or services/edge-webhooks. CI-checkable constraint.

**D-08 (structural exclusion):** Owner-send action Zod schema is .strict() and structurally member-excluded. No member id / email / phone / freeform member field can exist in the schema.

**D-09 (gate order):** opt-in gate → 24h-window gate → approved-template gate. Mirrors the studio chokepoint exactly.

**D-10 (Content fork):** Copy the Content template into apps/hq on the non-collab path (single super-admin, no Yjs/CRDT).

**D-11 (Video last):** HQD-05 Video is lowest priority — may slip to follow-up. No Remotion render cluster this phase.

**D-12 (plan split):** Two parallel plans — HQB plan and HQD plan. Both in apps/hq. HQB optionally touches services/hq-worker for brain-ingest. HQD depends on HQ-FND only.

**D-13 (deferred-on-external-dependency):** Live HQD sends deferred pending (a) HQ WABA second-phone-number registration in Meta Business Manager (procedure unconfirmed) and (b) Meta template approval (submitted at BD2 completion). Build + unit-test with WhatsApp client mocked.

### Claude's Discretion

- Exact staleness threshold value (recommended: 26 hours — 25h existing watchdog + 1h buffer)
- Cohort threshold constants (recommended values documented in Standard Stack section)
- Console column set
- Chart library for drill-in (recommendation: recharts — not yet in apps/hq package.json, must be added)
- Precise shape of owner-send Zod schema
- Where HQ send queue lives (apps/hq vs services/hq-worker — recommendation: services/hq-worker for consistency with provision-studio pattern)
- Whether brain-ingest ships this phase or as a thin stub

### Deferred Ideas (OUT OF SCOPE)

- Live HQD WhatsApp sends to gym owners (needs HQ WABA registration + Meta template approval)
- Video generation (HQD-05) dedicated Remotion render cluster
- Brain LLM distillation as richer narrative layer (may be thin stub)
- Studio-tier Brain/Dispatcher (BD4 GOB/GOD)
- Zero-touch billing/trial gating (PROV-FUT-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HQB-01 | Operator console listing all studios with health + engagement summaries | HQB data layer (SQL aggregates from hq_telemetry_snapshots); studios route |
| HQB-02 | Health/at-risk classification (active vs dormant, under-messaging, low-retention, token-spend) | Threshold constants + SQL/TS classification engine over existing schema |
| HQB-03 | last_telemetry_received_at staleness exclusion | Column confirmed in hq_telemetry_snapshots; watchdog already queries it |
| HQB-04 | Cohort views (at-risk, power-user) | Computed-view pattern (no stored rows) via classification function |
| HQB-05 | Per-studio drill-in (telemetry history over time) | New route pattern matching provisioning.tsx; chart library recommendation |
| HQD-01 | HQ WABA + hq_whatsapp_opt_in table | Schema migration v8; HQ WABA credential storage pattern |
| HQD-02 | Owner-send action, structurally member-excluded schema | .strict() Zod pattern; defineAction registration |
| HQD-03 | 24h-window + approved-template gating on HQ send path | Gate interface code verified; mirror pattern documented |
| HQD-04 | Content surface from Brain insights | templates/content fork scope; collab removal; copy-out discipline |
| HQD-05 | Video tools (lowest priority, may slip) | Thin stub or deferred |
</phase_requirements>

---

## Summary

BD3 delivers two parallel tracks, both inside `apps/hq` (already a Dispatch + Brain fork from BD1), built on the telemetry + studio-registry foundation from BD2.

**HQB** (HQB-01..05) is entirely a data-and-UI concern. The schema (`hq_telemetry_snapshots`, `hq_token_usage`, `hq_studios`) is already in place and populated by BD2. HQB adds: (1) a classification engine that reads those tables and computes a health signal per studio using deterministic thresholds; (2) a new `/studios` route — a shadcn Table console listing all studios; (3) a `/studios/:id` drill-in route showing per-studio telemetry history over time using recharts; (4) a cohort view endpoint (at-risk + power-user computed from the same classification function). No new tables are required for HQB. The only infrastructure addition is an optional `brain-ingest` pg-boss queue in `services/hq-worker` to feed telemetry into the Brain distillation pipeline.

**HQD** (HQD-01..05) adds HQ's own WhatsApp Business Account send path, structurally isolated from any studio WABA. It requires: (1) a new `hq_whatsapp_opt_in` table (migration v8, additive); (2) an `hq_whatsapp_templates` approved-template registry table (migration v9, additive); (3) HQ-owned copies of the three gate functions (optInGate, windowGate, templateGate) — never imported from services/worker; (4) a `send-owner-whatsapp` defineAction with a .strict() Zod schema that makes a member target structurally impossible; (5) HQ WABA credentials stored in the agent-native secrets layer (HQ Neon, not env vars); (6) a Content surface copy-out from templates/content (non-collab path — drop Yjs/CRDT extensions, keep Tiptap + actions). Live sends are deferred-on-external-dependency per D-13.

**Primary recommendation:** HQB can ship immediately — all data exists. HQD sends should be built and unit-tested with WhatsApp client mocked (mirrors BD2's provision-studio deferred pattern exactly); the live WABA path is unblocked by completing the manual Meta registration step documented in this research.

---

## Project Constraints (from CLAUDE.md)

- Additive-only migrations — `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. No DROP, RENAME, TRUNCATE, destructive ALTER. Enforced by `guard-no-drizzle-push.mjs`.
- No `drizzle-kit push`. Use `drizzle-kit generate` + `drizzle-kit migrate` (or additive SQL in `runMigrations`).
- No breaking DB changes — ever.
- shadcn/ui components for all standard UI (Button, Table, Badge, Card, Dialog, Sheet, etc.).
- Tabler icons (`@tabler/icons-react`) — no emojis as icons.
- TypeScript everywhere (`.ts`/`.tsx`). No `.js`/`.mjs` source files.
- `defineAction` for all new operations; `/api/` routes only for raw-body webhooks, file uploads, streaming.
- Fork-boundary discipline: templates/ is never edited in place. HQB/HQD modifications live in `apps/hq/`. CI guard `guard-hq-fork-boundary.mjs` enforces this.
- HQ PII guard (`guard-hq-no-pii.mjs`): no column matching `*connection*`, `*database_url*`, `*dsn*` in `packages/hq-schema/src/` or `apps/hq/server/db/`. New `hq_whatsapp_opt_in` table columns must pass this guard.
- Single super-admin HQ v2.0 — HQ org seeded with `HQ_ORG_ID = "hq-org-gymclassos-v1"` from `packages/hq-schema/src/constants.ts`. All Brain/Dispatch queries use this org scope.
- WhatsApp compliance: Outbound sends outside 24h window MUST use approved template — rejected at sender layer, not just UI.
- Stripe webhook handlers must be idempotent (not directly relevant to BD3 but reflects the pattern orientation).
- No local dev server (`pnpm dev` has NitroViteError) — verify via deploy or unit tests + `tsc`.

---

## Standard Stack

### Core (already in apps/hq)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@gymos/hq-schema` | workspace | HQ table defs + TelemetrySnapshot Zod schema + constants | All BD3 reads hq_telemetry_snapshots, hq_token_usage, hq_studios from this package |
| `drizzle-orm` | `^0.45.2` | SQL queries against HQ Neon | Already in apps/hq; stay on 0.45.x — do NOT jump to 1.0-beta |
| `zod` | `^4.3.6` | Structural schema validation (owner-send schema, opt-in schema) | Already in apps/hq; Zod 4 |
| `@agent-native/core` | workspace | `defineAction`, `AgentChatSurface`, `sendToAgentChat`, `useActionQuery`, `useActionMutation` | All HQB/HQD actions use this |
| `@agent-native/dispatch` | workspace | Dispatch shell + agent-chat plugin; base for HQD dispatcher actions | apps/hq already forks from this |
| shadcn/ui | (copy-in via CLI) | Table, Card, Badge, Sheet, Select, Tabs for HQB console + drill-in | apps/hq already uses these primitives |
| `@tabler/icons-react` | `^3.40.0` | Icons for health badges, cohort indicators, send status | Already in apps/hq |

### New Addition Required

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `recharts` | `^2.x` (verify at install) | Time-series charts for HQB-05 drill-in (telemetry history) | No chart library currently in apps/hq. recharts is the standard choice for React + Tailwind projects, lightweight, tree-shakeable, no peer-dep conflicts |

**Installation (apps/hq only):**
```bash
cd apps/hq && pnpm add recharts
```

**Version verification:** Run `npm view recharts version` before locking — training knowledge suggests 2.15.x as of mid-2026.

> Note: No chart library currently exists in `apps/hq/package.json`. The existing `provisioning.tsx` route uses shadcn Card + Badge for per-step progress strips. For the HQB drill-in (telemetry history over time), recharts `<LineChart>` / `<AreaChart>` is the lightest addition that avoids building a chart from scratch. If the planner prefers a pure CSS/table approach to avoid adding a dependency, the drill-in can use a shadcn-styled sparkline built from SVG primitives — this is lower confidence as a UX decision.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@great-detail/whatsapp` | `^9.x` | HQ WABA send client for HQD (once WABA registered) | HQD send path — mock in tests; real client injected in production |
| `pg-boss` | `^12.x` | HQ send queue + brain-ingest queue in services/hq-worker | Already used for provision-studio and hq-watchdog; add new queues |
| `pino` | `^9.x` | Structured logging in services/hq-worker | Already used for provisioning; HQ send queue follows same pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | Visx / Nivo | Both heavier, more complex API — recharts is the right fit for a few time-series charts |
| recharts | Pure SVG sparklines | Viable for simple sparklines, but recharts handles axes, tooltips, and responsive sizing without custom code |
| @great-detail/whatsapp | Hand-rolled fetch to Meta Graph API | Acceptable if the fork goes stale; the webhook signature verification + typed templates are the SDK's key value |

---

## Architecture Patterns

### HQB Data Layer — Classification Engine

All classification logic reads from HQ Neon tables that BD2 already populates. No new schema additions are needed for HQB.

**Key tables and columns (verified from `packages/hq-schema/src/schema.ts` and `migrations.ts`):**

```
hq_studios
  id TEXT PRIMARY KEY
  slug TEXT UNIQUE NOT NULL
  display_name TEXT NOT NULL
  owner_email TEXT NOT NULL
  status TEXT NOT NULL DEFAULT 'pending'       -- 'active' | 'pending' | ...
  provisioned_at TEXT
  created_at TEXT

hq_telemetry_snapshots
  id TEXT PRIMARY KEY
  studio_id TEXT NOT NULL REFERENCES hq_studios(id)
  period_start TEXT NOT NULL
  period_end TEXT NOT NULL
  payload_json TEXT NOT NULL                   -- full TelemetrySnapshot JSON
  received_at TEXT NOT NULL DEFAULT NOW()
  last_telemetry_received_at TEXT              -- denormalised for fast watchdog + HQB staleness gate
  UNIQUE(studio_id, period_start)

hq_token_usage
  studio_id TEXT NOT NULL REFERENCES hq_studios(id)
  date TEXT NOT NULL
  input_tokens INTEGER NOT NULL DEFAULT 0
  output_tokens INTEGER NOT NULL DEFAULT 0
  request_count INTEGER NOT NULL DEFAULT 0
  PRIMARY KEY(studio_id, date)
```

**TelemetrySnapshot fields (from `packages/hq-schema/src/telemetry.ts`):**
```typescript
{
  studioId: string,
  periodStart: string,
  periodEnd: string,
  llmInputTokens: number,    // HQB token-spend signal
  llmOutputTokens: number,
  llmRequestCount: number,
  activeMembers: number,     // HQB active/dormant signal
  bookings: number,          // HQB engagement signal
  messagesSent: number,      // HQB under-messaging signal
  mobileEngagement: number,
  retentionRate: number,     // HQB low-retention signal (0..1)
}
```

**`last_telemetry_received_at` location:** Stored as a denormalised column on `hq_telemetry_snapshots` (NOT on `hq_studios`). The watchdog already queries it via a `DISTINCT ON (studio_id) ORDER BY received_at DESC` subquery. HQB must use the same pattern to get the most recent `last_telemetry_received_at` per studio.

**Note on `last_telemetry_received_at` in ingest-helpers.ts:** When the studio pushes telemetry, `buildIngestPayload` sets `lastTelemetryReceivedAt: new Date().toISOString()` on the snapshot row. This means every snapshot row has it populated — HQB can simply take the MAX or the DISTINCT ON (studio_id) latest row.

### HQB Classification Engine (Recommended Implementation)

**File:** `apps/hq/server/lib/studio-health.ts` (new)

**Threshold constants** — exported from `packages/hq-schema/src/constants.ts` (additive, same pattern as `HQ_ORG_ID`):

```typescript
// packages/hq-schema/src/constants.ts (additive additions)

/** Studios with last_telemetry_received_at older than this are classified 'stale'. */
export const TELEMETRY_STALENESS_HOURS = 26; // 25h watchdog threshold + 1h buffer

/** Active members count below which a studio is classified 'dormant'. */
export const DORMANT_ACTIVE_MEMBERS_THRESHOLD = 5;

/** messagesSent count below which a studio is classified 'under-messaging'. */
export const UNDER_MESSAGING_THRESHOLD = 10;

/** retentionRate below which a studio is classified 'low-retention'. */
export const LOW_RETENTION_THRESHOLD = 0.5; // < 50%

/** retentionRate above which AND activeMembers above which = power-user candidate. */
export const POWER_USER_RETENTION_THRESHOLD = 0.75;
export const POWER_USER_ACTIVE_MEMBERS_THRESHOLD = 20;
export const POWER_USER_MESSAGES_THRESHOLD = 50;

/** Total token spend (input + output) above which is notable. */
export const HIGH_TOKEN_SPEND_THRESHOLD = 10000;
```

**Classification function shape:**

```typescript
// apps/hq/server/lib/studio-health.ts
import type { TelemetrySnapshotInput } from "@gymos/hq-schema/telemetry";
import {
  TELEMETRY_STALENESS_HOURS,
  DORMANT_ACTIVE_MEMBERS_THRESHOLD,
  UNDER_MESSAGING_THRESHOLD,
  LOW_RETENTION_THRESHOLD,
  POWER_USER_RETENTION_THRESHOLD,
  POWER_USER_ACTIVE_MEMBERS_THRESHOLD,
  POWER_USER_MESSAGES_THRESHOLD,
} from "@gymos/hq-schema/constants";

export type HealthStatus = "healthy" | "dormant" | "under-messaging" | "low-retention" | "stale" | "at-risk";
export type CohortMembership = "power-user" | "at-risk" | "healthy" | "unknown";

export interface StudioHealthSignals {
  status: HealthStatus;
  cohort: CohortMembership;
  isStale: boolean;
  isDormant: boolean;
  isUnderMessaging: boolean;
  isLowRetention: boolean;
  signals: string[];  // human-readable reason strings for the operator
}

export function classifyStudioHealth(
  snapshot: TelemetrySnapshotInput | null,
  lastTelemetryReceivedAt: string | null,
  now: Date = new Date(),
): StudioHealthSignals
```

**SQL query for HQB console (read model per studio):**

```sql
-- One row per active studio with latest snapshot aggregates
SELECT
  s.id,
  s.slug,
  s.display_name,
  s.owner_email,
  s.status,
  s.provisioned_at,
  -- Latest snapshot data (NULL if no snapshots)
  snap.payload_json,
  snap.last_telemetry_received_at,
  snap.period_start,
  snap.period_end,
  -- Token spend summary (last 30 days)
  COALESCE(tok.total_input, 0)  AS total_input_tokens,
  COALESCE(tok.total_output, 0) AS total_output_tokens
FROM hq_studios s
LEFT JOIN (
  SELECT DISTINCT ON (studio_id)
    studio_id,
    payload_json,
    last_telemetry_received_at,
    period_start,
    period_end
  FROM hq_telemetry_snapshots
  ORDER BY studio_id, received_at DESC
) snap ON snap.studio_id = s.id
LEFT JOIN (
  SELECT studio_id,
         SUM(input_tokens)  AS total_input,
         SUM(output_tokens) AS total_output
  FROM hq_token_usage
  WHERE date >= (CURRENT_DATE - INTERVAL '30 days')::TEXT
  GROUP BY studio_id
) tok ON tok.studio_id = s.id
ORDER BY s.created_at DESC
```

This query is run in a new `list-studios` action and the result + classification is returned to the UI. Classification is pure TS applied on the returned rows — no LLM.

### HQB UI Structure (Reuse Patterns)

**Recommended routes (new, added to apps/hq/app/routes/):**

| Route File | Path | Purpose |
|------------|------|---------|
| `studios._index.tsx` | `/studios` | HQB-01/02/03/04 — studio list console with health badges + cohort filter |
| `studios.$id.tsx` | `/studios/:id` | HQB-05 — per-studio drill-in with telemetry history charts |

**Why new routes vs. reusing `overview.tsx` or `provisioning.tsx`:**
- `overview.tsx` is `export { default } from "@agent-native/dispatch/routes/pages/overview"` — it re-exports the upstream Dispatch overview page unchanged. HQB needs a custom studio-health-aware list.
- `provisioning.tsx` is the closest pattern match — it uses shadcn Card + Badge + progressive disclosure, fetches from a resource route, handles loading/error states. HQB console should follow the same pattern but use shadcn `Table` for the list.
- `metrics.tsx` and `messaging.tsx` are also upstream re-exports. HQB does not reuse them.

**Console component pattern** (mirrors `provisioning.tsx`):

```tsx
// apps/hq/app/routes/studios._index.tsx
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { IconActivity, IconAlertTriangle, IconClock } from "@tabler/icons-react";
```

Health badge mapping:
- `healthy` → green Badge
- `dormant` → amber Badge
- `under-messaging` → amber Badge
- `low-retention` → amber Badge  
- `stale` → grey Badge with clock icon
- `at-risk` → red Badge with alert-triangle icon

**Drill-in (HQB-05) — recharts pattern:**

```tsx
// apps/hq/app/routes/studios.$id.tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// Chart 1: Active members over time (from snapshot payload_json parsed per row)
// Chart 2: Messages sent over time
// Chart 3: Retention rate over time
// Chart 4: Token usage over time
```

Data source: `GET /api/studios/:id/snapshots` resource route → reads `hq_telemetry_snapshots` for studio ordered by `period_start` → parses `payload_json` for each row.

### HQD Schema (New Additive Tables — migrations v8 + v9)

**`hq_whatsapp_opt_in` table (migration v8):**

```sql
-- Tracks gym-owner opt-in for HQ WABA B2B comms (HQD-01)
-- STRUCTURAL EXCLUSION: phone_e164 is the owner's number, captured at signup
-- No member_id, no member reference — physically impossible to store a member target
CREATE TABLE IF NOT EXISTS hq_whatsapp_opt_in (
  id          TEXT PRIMARY KEY,
  studio_id   TEXT NOT NULL REFERENCES hq_studios(id),
  -- Owner contact (the gym-owner, not a gym member)
  owner_email TEXT NOT NULL,
  phone_e164  TEXT NOT NULL,
  opted_in_at TEXT NOT NULL DEFAULT NOW(),
  opted_out_at TEXT,            -- NULL = active opt-in; SET = opted out
  opt_in_source TEXT NOT NULL DEFAULT 'signup', -- 'signup' | 'manual'
  created_at  TEXT NOT NULL DEFAULT NOW(),
  UNIQUE(studio_id)             -- one opt-in row per studio
)
```

**`hq_whatsapp_templates` table (migration v9):**

```sql
-- Approved HQ owner-comms templates (mirrors studio whatsapp_templates pattern)
-- Populated manually / via a sync action from Meta's template API
CREATE TABLE IF NOT EXISTS hq_whatsapp_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'pending', -- 'approved' | 'rejected' | 'pending'
  language    TEXT NOT NULL DEFAULT 'en_US',
  components_json TEXT,
  synced_at   TEXT,
  created_at  TEXT NOT NULL DEFAULT NOW()
)
```

Both tables pass `guard-hq-no-pii.mjs` (no `*connection*`/`*database_url*`/`*dsn*` column names).

**Drizzle defs (additive to `packages/hq-schema/src/schema.ts`):**

```typescript
export const hqWhatsappOptIn = table("hq_whatsapp_opt_in", {
  id: text("id").primaryKey(),
  studioId: text("studio_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  phoneE164: text("phone_e164").notNull(),
  optedInAt: text("opted_in_at").notNull().default(now()),
  optedOutAt: text("opted_out_at"),
  optInSource: text("opt_in_source").notNull().default("signup"),
  createdAt: text("created_at").notNull().default(now()),
});

export const hqWhatsappTemplates = table("hq_whatsapp_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("pending"),
  language: text("language").notNull().default("en_US"),
  componentsJson: text("components_json"),
  syncedAt: text("synced_at"),
  createdAt: text("created_at").notNull().default(now()),
});
```

### HQD Gate Interfaces (Mirrored from services/worker)

**Source files read:** `services/worker/src/domain/gates/optInGate.ts`, `windowGate.ts`, `templateGate.ts`, `sendMessage.ts`

The three gate functions have these exact interfaces — copy logic verbatim, adapt to HQ DB:

**optInGate (studio version — to mirror):**
```typescript
// Source: services/worker/src/domain/gates/optInGate.ts
export async function hasOptIn(memberId: string, db: ReturnType<typeof getDb>): Promise<boolean>
// Gate logic: SELECT FROM whatsapp_opt_in WHERE member_id = ? LIMIT 1
// true  if: row exists AND opted_out_at IS NULL
// false if: no row OR opted_out_at IS SET
```

**HQ version to create:**
```typescript
// apps/hq/server/domain/gates/ownerOptInGate.ts  (NEW, MIRROR)
export async function hasOwnerOptIn(studioId: string, db: ReturnType<typeof getHqDb>): Promise<boolean>
// Gate logic: SELECT FROM hq_whatsapp_opt_in WHERE studio_id = ? LIMIT 1
// true  if: row exists AND opted_out_at IS NULL
// false if: no row OR opted_out_at IS SET
```

**windowGate (studio version — to mirror):**
```typescript
// Source: services/worker/src/domain/gates/windowGate.ts
export const WINDOW_HOURS = 24;
export function isInWindow(lastInboundAt: Date | null, now: Date = new Date()): boolean
// Pure function — no DB. true if lastInboundAt is within 24h of now.
```

**HQ version to create:**
```typescript
// apps/hq/server/domain/gates/ownerWindowGate.ts  (NEW, MIRROR)
// Identical pure function — copy verbatim (same 24h Meta policy applies to B2B WABA)
export const OWNER_WINDOW_HOURS = 24;
export function isOwnerInWindow(lastInboundAt: Date | null, now: Date = new Date()): boolean
```

**templateGate (studio version — to mirror):**
```typescript
// Source: services/worker/src/domain/gates/templateGate.ts
export async function isTemplateApproved(name: string, db: ReturnType<typeof getDb>): Promise<boolean>
// SELECT FROM whatsapp_templates WHERE name = ? AND status = 'approved' LIMIT 1
```

**HQ version to create:**
```typescript
// apps/hq/server/domain/gates/ownerTemplateGate.ts  (NEW, MIRROR)
export async function isOwnerTemplateApproved(name: string, db: ReturnType<typeof getHqDb>): Promise<boolean>
// SELECT FROM hq_whatsapp_templates WHERE name = ? AND status = 'approved' LIMIT 1
```

**HQD sendMessage orchestrator (new, mirrors sendMessage.ts):**
```typescript
// apps/hq/server/domain/sendOwnerMessage.ts  (NEW, MIRROR of sendMessage.ts)

export type SendOwnerMessagePayload =
  | { type: "text"; body: string }
  | { type: "template"; name: string; vars: Record<string, string>; language?: string };

export type SendOwnerMessageArgs = {
  studioId: string;     // resolves owner contact from hq_whatsapp_opt_in
  messageId: string;    // pre-inserted HQ message row
  payload: SendOwnerMessagePayload;
  db: ReturnType<typeof getHqDb>;
};

// Gate order (D-09):
// 1. hasOwnerOptIn(studioId, db)         → throw OwnerNoOptInError on false
// 2. Load hq_whatsapp_opt_in row          → get phone_e164 + last_inbound_at
// 3. isOwnerInWindow(lastInboundAt)       → text gate: throw OwnerWindowExpiredError if !inWindow
// 4. isOwnerTemplateApproved(name, db)   → throw OwnerTemplateNotApprovedError on false
// 5. sendViaHqWaba(...)                  → calls HQ WABA client (mocked in tests)
// 6. Update HQ message row status
```

### HQD Owner-Send Action (Structurally Member-Excluded)

**File:** `apps/hq/actions/send-owner-whatsapp.ts` (new)

**Zod schema (.strict() — structural exclusion):**

```typescript
import { defineAction } from "@agent-native/core";
import { z } from "zod";

// The schema structurally prevents any member-directed payload.
// - No memberId, memberEmail, memberPhone, memberName field exists.
// - studioId resolves the owner contact from hq_whatsapp_opt_in (HQ Neon only).
// - topic restricts to system/product categories.
// - .strict() rejects any unknown field at parse time.

const OwnerSendSchema = z.object({
  studioId: z.string().min(1).describe("HQ studio registry ID — resolves owner contact"),
  topic: z.enum([
    "system_update",
    "feature_announcement",
    "onboarding_guidance",
    "performance_insight",
    "billing_notice",
  ]).describe("B2B communication topic — system/product only"),
  payload: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("text"),
      body: z.string().min(1).max(4096),
    }),
    z.object({
      type: z.literal("template"),
      name: z.string().min(1),
      vars: z.record(z.string(), z.string()),
      language: z.string().default("en_US"),
    }),
  ]),
}).strict(); // .strict() — any unknown field (e.g. memberId) throws ZodError
```

**Why this is structurally safe:** The schema has no field that can express a member target. `studioId` points at HQ's `hq_whatsapp_opt_in` table which only contains gym-owner phone numbers. The `topic` enum makes operator intent explicit and auditable. HQ Neon contains no member records, so even if the schema were bypassed, there is no member data to leak (defense in depth).

### HQD System-Prompt Constraint

**File:** `apps/hq/server/plugins/agent-chat.ts` (currently a thin re-export of `dispatchAgentChatPlugin`)

Currently: `export { dispatchAgentChatPlugin as default } from "@agent-native/dispatch/server";`

For HQD, this needs to become a custom plugin that wraps `dispatchAgentChatPlugin` and appends the HQD constraint to the system prompt. The constraint text (from ARCHITECTURE.md §V2-8):

```
HQD CONSTRAINT: You may only send messages to gym-owners about GymClassOS
product features, system updates, onboarding guidance, or aggregate performance
insights (never quoting specific member counts from a studio's data unless
derived from their own telemetry snapshot). You MUST NEVER send a message that
references, implies knowledge of, or derives from any specific gym member,
booking, conversation, or any PII. HQ Neon contains only aggregate telemetry
and studio registry data — never member records.
```

**Implementation pattern:** Inspect `@agent-native/dispatch/server`'s `dispatchAgentChatPlugin` to see if it accepts a `systemPromptSuffix` or similar option. If not, the plugin file needs to be copy-out forked (record in MODIFICATIONS.md) so the constraint can be appended.

### HQD Send Queue Location

**Recommendation: `services/hq-worker`** — extend the existing index.ts with a new `hq-owner-send` queue.

Rationale:
- Matches the provision-studio pattern exactly (long-lived Fly process, pg-boss against HQ Neon)
- No new infrastructure: services/hq-worker already exists, has pg-boss, has Hono healthz, has getHqDb()
- The `hq-worker` boss.ts already shows the pattern for createQueue + work + schedule
- Queue sends can be rate-limited via pg-boss `sendAfter` and `retryLimit`

The `send-owner-whatsapp` defineAction enqueues a job to `hq-owner-send`; the worker processes it through `sendOwnerMessage` (the HQD gate orchestrator).

### HQD Content Fork

**Source:** `templates/content/` (148 TypeScript files)

**What to copy (non-collab path only):**
- `app/routes/_app.page*.tsx` — document list + editor routes
- `app/routes/_app._index.tsx` — documents index
- `actions/create-document.ts`, `list-documents.ts`, `get-document.ts`, `update-document.ts`, `delete-document.ts`, `search-documents.ts`, `navigate.ts` — core CRUD actions (no Notion sync needed)
- `server/db/schema.ts` — Content schema (documents table + documentShares)
- `server/lib/documents.ts` — document helpers
- `app/components/editor/VisualEditor.tsx`, `DocumentToolbar.tsx` — Tiptap editor (non-collab)
- `app/components/EmptyState.tsx`, layout components

**What to DROP (Yjs/collab path — BD1 D-03):**
- `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-caret`, `@tiptap/y-tiptap` — all Yjs Tiptap extensions
- `yjs`, `y-protocols` — Yjs core
- `CommentsSidebar.tsx`, `NotionConflictBanner.tsx`, `NotionSyncBar.tsx` — collab-only UI
- `actions/add-comment.ts`, `list-comments.ts` — comments (collab feature)
- `actions/connect-notion-status.ts`, `link-notion-page.ts`, `pull-notion-page.ts`, `push-notion-page.ts`, `sync-notion-comments.ts` — Notion sync (not needed)
- `useCollaborativeDoc` hook usage — replace with simple Tiptap editor without Y-awareness

**Content schema migration:** The documents table uses `ownableColumns()` + `assertAccess` which scopes to orgId. With the HQ org seed (`HQ_ORG_ID = "hq-org-gymclassos-v1"`) already in place, the documents created by the super-admin will correctly be scoped to the HQ org.

**Copy-out discipline:** Record every copied file in `apps/hq/MODIFICATIONS.md` with origin path (`templates/content/...`). This is required by guard-hq-fork-boundary — the fork boundary guard scans for template imports, not for unrecorded copies. MODIFICATIONS.md is the audit trail.

### HQD WABA Registration (Flagged Unknown — D-13)

**Status:** MEDIUM confidence — based on Meta Business Manager documentation patterns, not live-verified.

**What must happen before live HQD sends can work:**

1. **Register a second phone number in Meta Business Manager** under the GymClassOS business account. This is a separate number from any studio WABA number. The procedure:
   - In Meta Business Manager → WhatsApp → Phone Numbers → Add phone number
   - Verify via SMS or call to the new number
   - This creates a second WhatsApp Business Account phone number associated with the same WABA account
   - Meta does NOT require a separate WABA for a second phone number — the same WABA can have multiple phone numbers

2. **Get the new phone number's `phone_number_id`** from the WhatsApp Business API → Phone Numbers endpoint

3. **Create and submit HQ owner-comms templates** in Meta Business Manager → Message Templates. Template categories must be `UTILITY` or `MARKETING` (not `AUTHENTICATION`). Category selection affects approval speed and message cost. For B2B system/product updates: `UTILITY` is appropriate.

4. **Store HQ WABA credentials in HQ Neon app_secrets** (not Fly env vars, not Vercel env vars):
   - `hq_waba_phone_number_id` — the phone number ID from step 2
   - `hq_waba_api_token` — the Meta System User token for the HQ WABA account
   - These are accessed via the agent-native secrets layer (`POST /_agent-native/secrets/adhoc` or the vault mechanism already in apps/hq)

5. **CI/grep guard for WABA separation:** Add a check in `scripts/guard-hq-no-pii.mjs` or a separate `guard-hqd-no-worker-import.mjs` that fails if any file under `apps/hq/` or `services/hq-worker/` imports from `services/worker/` or `services/edge-webhooks/`. Simple grep pattern:
   ```
   from "../../services/worker/   → FAIL
   from "../services/worker/      → FAIL
   from "services/worker/         → FAIL
   ```

**Deferred-on-external-dependency mock pattern** (mirrors BD2 provision-studio):

```typescript
// services/hq-worker/src/lib/hq-waba-client.ts
export interface HqWabaClient {
  sendMessage(args: { to: string; payload: SendOwnerMessagePayload }): Promise<{ wamid: string }>;
}

// Real implementation (used in production when WABA creds set):
export function createHqWabaClient(phoneNumberId: string, apiToken: string): HqWabaClient

// Mock implementation (used in tests and when creds absent):
export const mockHqWabaClient: HqWabaClient = {
  sendMessage: async (args) => ({ wamid: `mock-wamid-${Date.now()}` }),
}
```

The `registerOwnerSend` queue handler accepts the client as an injected parameter (exactly like `registerProvisionStudio(boss, apis)`), defaulting to mock when HQ WABA creds are absent.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WhatsApp signature verification | Custom HMAC | `@great-detail/whatsapp` event.verifySignature() | Edge cases in timing-safe comparison; SDK handles it |
| WhatsApp 24h window | Custom date math | Copy `isInWindow()` from windowGate.ts verbatim | Pure function, already tested — no reason to re-derive |
| Time-series charts | Custom SVG chart from scratch | recharts `<LineChart>` | Axes, tooltips, responsive containers are non-trivial to get right |
| Zod strict exclusion | Runtime member-id checks in action body | `.strict()` on the Zod schema | Schema-level: the field literally cannot be expressed; runtime checks are defense-in-depth only |
| Health classification LLM call | Ask the Brain to classify each studio | Deterministic threshold SQL/TS (D-01) | Auditable, no LLM cost, no PII exposure, instant |
| pg-boss queue registration | Custom worker loop | Extend services/hq-worker/src/index.ts with new createQueue/work calls | Already wired — adding queues is 5 lines |

---

## Runtime State Inventory

> BD3 is primarily an additive phase (new routes, new tables, new queues). No renaming or migration of existing runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | hq_telemetry_snapshots + hq_token_usage + hq_studios — already populated by BD2 live data (if any) | No migration needed — HQB reads these tables as-is |
| Live service config | services/hq-worker — currently has `provision-studio` + `hq-watchdog` queues registered | Additive: add `hq-owner-send` + `brain-ingest` queues in index.ts; no existing queues affected |
| OS-registered state | None — Fly Machines managed by flyctl; no OS-level queue registration | None |
| Secrets/env vars | HQ WABA credentials do NOT exist yet (`hq_waba_phone_number_id`, `hq_waba_api_token`) — must be set after Meta WABA registration | Manual operator step: set in HQ vault/secrets after WABA registration |
| Build artifacts | None — no renamed packages or moved files that would leave stale egg-info/dist | None |

**Nothing found requiring data migration** — BD3 is additive. The existing `hq_telemetry_snapshots` and `hq_token_usage` rows are the input to HQB classification with no schema changes needed.

---

## Common Pitfalls

### Pitfall 1: last_telemetry_received_at Is on snapshots, Not studios

**What goes wrong:** Developer queries `hq_studios.last_telemetry_received_at` (which doesn't exist) instead of the DISTINCT ON (studio_id) subquery against `hq_telemetry_snapshots`.

**Root cause:** The denormalised column is on the snapshot rows (one per push period) not on the studio registry row. This was intentional for idempotent upsert.

**Prevention:** The HQB console SQL must use the pattern established in `watchdog.ts`:
```sql
LEFT JOIN (
  SELECT DISTINCT ON (studio_id)
    studio_id,
    last_telemetry_received_at
  FROM hq_telemetry_snapshots
  ORDER BY studio_id, received_at DESC
) snap ON snap.studio_id = s.id
```

**Warning signs:** `hq_studios` query returns `column "last_telemetry_received_at" does not exist` — the column is on the snapshot table.

### Pitfall 2: HQD Code Imports from services/worker

**What goes wrong:** Developer imports `hasOptIn` or `isInWindow` from `services/worker/src/domain/gates/` to avoid "duplicating" code. HQD then routes owner messages through studio worker infrastructure.

**Root cause:** "Don't repeat yourself" instinct conflicts with the WABA-separation architectural constraint (Pitfall W-03).

**Prevention:** Add `guard-hqd-no-worker-import.mjs` — a CI guard that scans `apps/hq/` and `services/hq-worker/` for imports referencing `services/worker/` or `services/edge-webhooks/`. Mirror-copy the gate functions verbatim; do not share them across the boundary.

**Warning signs:** Import statement in hq-worker or apps/hq containing `from "../../services/worker/` — guard fails build.

### Pitfall 3: Stale Studio Showing as Healthy

**What goes wrong:** `last_telemetry_received_at IS NULL` (studio provisioned but never pushed) or `last_telemetry_received_at < NOW() - 26h` causes the classification to return `undefined` and the UI defaults to showing the studio as `healthy`.

**Root cause:** Null/stale telemetry is a valid and expected state for newly provisioned studios and studios with broken push jobs.

**Prevention:** The `classifyStudioHealth` function MUST handle `snapshot === null` and `lastTelemetryReceivedAt` older than `TELEMETRY_STALENESS_HOURS` as a first-class `stale` classification, returned BEFORE any engagement checks. The UI must never render `healthy` for a stale studio.

**Warning signs:** A provisioned studio with no telemetry push shows a green "healthy" badge in the console.

### Pitfall 4: Owner-Send Schema Silent PII Leak via Freeform Body

**What goes wrong:** The `.text` payload type allows `body: string` — an operator could manually construct a message body containing member names or booking details.

**Root cause:** The structural exclusion is on the schema fields, not on the message content. Human input is unrestricted prose.

**Prevention:** This is mitigated by: (a) HQ Neon physically contains no member data — the operator cannot quote what they can't see; (b) the `topic` enum restricts the stated intent; (c) the HQD system-prompt constraint reinforces the behavioural boundary for AI-generated messages. Document in the action's description that body content must not reference members. This is a social/process control, not a technical one — and it is acknowledged in the CONTEXT.md architecture.

**Warning signs:** Operator writes a message body like "Member John signed up last week" — HQ Neon has no John record, so this is a fabrication. The gate cannot block this; the system-prompt constraint discourages it.

### Pitfall 5: Content Fork Includes Yjs WebSocket Server Dependency

**What goes wrong:** The copied `apps/hq/server/` includes the Hocuspocus or y-websocket server plugin that opens a persistent WebSocket connection for Yjs real-time collab. On Vercel serverless, this crashes silently.

**Root cause:** The upstream Content template ships with Yjs collab as an SSR plugin.

**Prevention:** When copying server plugins from templates/content, explicitly exclude any plugin file whose name contains `collab`, `yjs`, `websocket`, or `hocuspocus`. Audit `templates/content/server/plugins/` before copying. The copy-out is for the document CRUD path only.

**Warning signs:** apps/hq build fails with "WebSocket not supported in edge runtime" or similar, or the HQ Vercel deploy shows serverless function timeouts on the document route.

### Pitfall 6: recharts Added Without SSR Guard

**What goes wrong:** recharts uses `window` / `document` in its chart components. In React Router v7 SSR, server-side rendering hits these browser globals and crashes.

**Root cause:** recharts is a browser-only library; its charts must not render on the server.

**Prevention:** Wrap recharts chart components in the framework's `ClientOnly` component (or React Router's `ClientHydrationBoundary`) in the drill-in route. The skeleton for the chart area renders on server; the actual chart mounts after hydration.

**Warning signs:** Vercel function crash with `ReferenceError: window is not defined` on the `/studios/:id` route.

---

## Code Examples

### HQB: Classification Function Skeleton

```typescript
// apps/hq/server/lib/studio-health.ts
// Source: verified interface design from inspecting packages/hq-schema/src/telemetry.ts
//         and services/hq-worker/src/queues/watchdog.ts

import type { TelemetrySnapshotInput } from "@gymos/hq-schema/telemetry";
import {
  TELEMETRY_STALENESS_HOURS,
  DORMANT_ACTIVE_MEMBERS_THRESHOLD,
  UNDER_MESSAGING_THRESHOLD,
  LOW_RETENTION_THRESHOLD,
} from "@gymos/hq-schema/constants";

export function classifyStudioHealth(
  snapshot: TelemetrySnapshotInput | null,
  lastTelemetryReceivedAt: string | null,
  now: Date = new Date(),
): StudioHealthSignals {
  // Staleness gate FIRST — D-02 / HQB-03
  if (!lastTelemetryReceivedAt) {
    return { status: "stale", cohort: "unknown", isStale: true, isDormant: false, isUnderMessaging: false, isLowRetention: false, signals: ["No telemetry received"] };
  }
  const ageHours = (now.getTime() - new Date(lastTelemetryReceivedAt).getTime()) / (1000 * 3600);
  if (ageHours > TELEMETRY_STALENESS_HOURS) {
    return { status: "stale", cohort: "unknown", isStale: true, isDormant: false, isUnderMessaging: false, isLowRetention: false, signals: [`Telemetry stale: ${Math.round(ageHours)}h ago`] };
  }
  if (!snapshot) {
    return { status: "stale", cohort: "unknown", isStale: true, isDormant: false, isUnderMessaging: false, isLowRetention: false, signals: ["No snapshot data"] };
  }

  // Signal checks
  const isDormant = snapshot.activeMembers < DORMANT_ACTIVE_MEMBERS_THRESHOLD;
  const isUnderMessaging = snapshot.messagesSent < UNDER_MESSAGING_THRESHOLD;
  const isLowRetention = snapshot.retentionRate < LOW_RETENTION_THRESHOLD;
  const signals: string[] = [];
  if (isDormant) signals.push(`Low active members (${snapshot.activeMembers})`);
  if (isUnderMessaging) signals.push(`Low messages sent (${snapshot.messagesSent})`);
  if (isLowRetention) signals.push(`Low retention (${(snapshot.retentionRate * 100).toFixed(0)}%)`);

  const isAtRisk = isDormant || isUnderMessaging || isLowRetention;
  const isPowerUser = !isAtRisk && snapshot.retentionRate >= POWER_USER_RETENTION_THRESHOLD && snapshot.activeMembers >= POWER_USER_ACTIVE_MEMBERS_THRESHOLD && snapshot.messagesSent >= POWER_USER_MESSAGES_THRESHOLD;

  return {
    status: isAtRisk ? "at-risk" : "healthy",
    cohort: isAtRisk ? "at-risk" : isPowerUser ? "power-user" : "healthy",
    isStale: false,
    isDormant,
    isUnderMessaging,
    isLowRetention,
    signals,
  };
}
```

### HQD: Owner Opt-In Gate (Mirror of optInGate.ts)

```typescript
// apps/hq/server/domain/gates/ownerOptInGate.ts
// MIRROR of services/worker/src/domain/gates/optInGate.ts
// DO NOT import from services/worker — CI guard enforces this

import { eq } from "drizzle-orm";
import type { getHqDb } from "../../db/index.js";
import { schema } from "../../db/schema.js"; // includes hqWhatsappOptIn

export async function hasOwnerOptIn(
  studioId: string,
  db: ReturnType<typeof getHqDb>,
): Promise<boolean> {
  // guard:allow-unscoped — HQ send chokepoint; studio_id IS the access check
  const rows = await db
    .select({ studioId: schema.hqWhatsappOptIn.studioId, optedOutAt: schema.hqWhatsappOptIn.optedOutAt })
    .from(schema.hqWhatsappOptIn)
    .where(eq(schema.hqWhatsappOptIn.studioId, studioId))
    .limit(1);
  return rows.length > 0 && rows[0].optedOutAt == null;
}
```

### HQD: defineAction owner-send registration

```typescript
// apps/hq/actions/send-owner-whatsapp.ts
import { defineAction } from "@agent-native/core";
import { z } from "zod";
import { getHqDb } from "../server/db/index.js";
import { sendOwnerMessage } from "../server/domain/sendOwnerMessage.js";

export default defineAction({
  description:
    "Send a WhatsApp message to a gym owner about a GymClassOS system or product topic. " +
    "ONLY use for: system updates, feature announcements, onboarding guidance, performance insights, billing notices. " +
    "NEVER send messages referencing gym members, bookings, conversations, or any PII. " +
    "This action sends from HQ's own WhatsApp Business Account — separate from any studio WABA.",
  schema: z.object({
    studioId: z.string().min(1).describe("HQ studio registry ID"),
    topic: z.enum(["system_update", "feature_announcement", "onboarding_guidance", "performance_insight", "billing_notice"]),
    payload: z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), body: z.string().min(1).max(4096) }),
      z.object({ type: z.literal("template"), name: z.string().min(1), vars: z.record(z.string(), z.string()), language: z.string().default("en_US") }),
    ]),
  }).strict(),
  run: async (args) => {
    const db = getHqDb();
    // Insert HQ message row, enqueue to hq-owner-send queue in hq-worker
    // (deferred-on-external-dependency: queue handles mock/real client injection)
    // ...
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LLM-based customer health scoring | Deterministic threshold rules + telemetry aggregates | BD3 design decision | Auditable, instant, no LLM cost in the trust path |
| Meta's official WhatsApp Node SDK | @great-detail/whatsapp v9 | April 2026 (Meta paused official SDK) | Must use fork — see CLAUDE.md |
| Drizzle 0.45.x → 1.0-beta | Stay on 0.45.x | Not yet (1.0-beta exists but unstable) | Do NOT upgrade during 2-month ship window |

---

## Open Questions

1. **dispatchAgentChatPlugin system-prompt injection**
   - What we know: `apps/hq/server/plugins/agent-chat.ts` is a thin re-export of the upstream plugin
   - What's unclear: Does `dispatchAgentChatPlugin` accept a `systemPromptSuffix` / `additionalInstructions` option, or must agent-chat.ts be copy-out forked?
   - Recommendation: Inspect `@agent-native/dispatch/server` source before implementing. If no suffix option exists, copy out `agent-chat.ts` and record in MODIFICATIONS.md.

2. **recharts SSR compatibility in React Router v7**
   - What we know: recharts uses browser globals; SSR can crash without a ClientOnly wrapper
   - What's unclear: Whether `@agent-native/core/client`'s `ClientOnly` component is the right wrapper or if React Router v7 has a built-in mechanism
   - Recommendation: Use `ClientOnly` from `@agent-native/core/client` — it's already in use in `root.tsx` for the agent sidebar. Wrap recharts chart components in it.

3. **HQ WABA — single WABA with second phone number vs. separate WABA**
   - What we know: Meta allows multiple phone numbers per WABA. ARCHITECTURE.md says "separate WABA."
   - What's unclear: Whether the operator has a second Meta Business account or whether a second phone number under the existing GymClassOS WABA satisfies the separation requirement
   - Recommendation: A second phone number under the existing GymClassOS WABA is sufficient for WABA separation (it's a different sender number, different opt-in basis). A fully separate WABA is only needed if the operator wants separate billing, separate quality ratings, or separate admin access. Code should store the phone number ID — the WABA account ID is secondary.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| services/hq-worker (Fly) | HQD owner-send queue + brain-ingest | ✓ | Already deployed (BD2-04/05/06) | — |
| @gymos/hq-schema | HQB + HQD schema + constants | ✓ | workspace | — |
| pg-boss | New HQ queues | ✓ | `^12.x` via @gymos/queue | — |
| recharts | HQB-05 drill-in charts | ✗ | Not installed | CSS sparklines or install recharts |
| @great-detail/whatsapp | HQD live sends | ✗ (deferred) | v9.x (not yet installed in apps/hq) | Mock client for unit tests |
| HQ WABA credentials | HQD live sends | ✗ (deferred) | — | Mock client; guard throws "deferred-on-external-dependency" |

**Missing dependencies with no fallback for current phase:**
- None — all blocking items for BD3's testable scope are available.

**Missing dependencies with fallback (deferred-on-external-dependency):**
- `@great-detail/whatsapp` + HQ WABA credentials: build and test with mock client; live sends deferred until Meta registration + template approval complete.
- recharts: install via `pnpm add recharts` in apps/hq; no existing chart lib to conflict with.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (`^4.1.5`) |
| Config file | `apps/hq/vitest.config.ts` (inherits from workspace); `services/hq-worker/vitest.config.ts` |
| Quick run command | `pnpm -F @gymos/hq test --run` |
| Full suite command | `pnpm -F @gymos/hq test --run && pnpm -F @gymos/hq-worker test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HQB-02 | `classifyStudioHealth()` returns correct status for each signal | unit | `pnpm -F @gymos/hq test --run` | ❌ Wave 0: `apps/hq/server/lib/studio-health.test.ts` |
| HQB-03 | Stale telemetry → `status: 'stale'` regardless of snapshot data | unit | (same) | ❌ Wave 0 |
| HQB-04 | at-risk cohort = dormant OR under-messaging OR low-retention OR stale | unit | (same) | ❌ Wave 0 |
| HQD-02 | `.strict()` schema rejects any unknown field (e.g. memberId) | unit | `pnpm -F @gymos/hq test --run` | ❌ Wave 0: `apps/hq/actions/send-owner-whatsapp.test.ts` |
| HQD-03 | hasOwnerOptIn returns false for missing/opted-out row | unit | `pnpm -F @gymos/hq-worker test --run` | ❌ Wave 0: `services/hq-worker/src/lib/gates/ownerOptInGate.test.ts` |
| HQD-03 | isOwnerInWindow returns false for null lastInboundAt | unit | (same) | ❌ Wave 0: `ownerWindowGate.test.ts` |
| HQD-03 | isOwnerTemplateApproved returns false for non-approved template | unit | (same) | ❌ Wave 0: `ownerTemplateGate.test.ts` |
| HQD-03 | sendOwnerMessage throws OwnerNoOptInError when not opted in | unit | (same) | ❌ Wave 0: `sendOwnerMessage.test.ts` |
| HQD-03 | sendOwnerMessage throws OwnerWindowExpiredError for out-of-window text | unit | (same) | ❌ Wave 0 |
| HQD-03 | sendOwnerMessage throws OwnerTemplateNotApprovedError for unknown template | unit | (same) | ❌ Wave 0 |
| HQB-01 | `/api/studios` resource route returns rows | manual-only (no dev server) | deploy verify | — |
| HQD-01 | hq_whatsapp_opt_in migration applies without error | unit via in-memory SQLite | `pnpm -F @gymos/hq-schema test --run` | ❌ Wave 0 if hq-schema tests don't exist |

### Sampling Rate
- **Per task commit:** `pnpm -F @gymos/hq test --run && pnpm -F @gymos/hq-worker test --run`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/hq/server/lib/studio-health.test.ts` — covers HQB-02, HQB-03, HQB-04
- [ ] `apps/hq/actions/send-owner-whatsapp.test.ts` — covers HQD-02 (.strict() exclusion)
- [ ] `services/hq-worker/src/lib/gates/ownerOptInGate.test.ts` — covers HQD-03 opt-in
- [ ] `services/hq-worker/src/lib/gates/ownerWindowGate.test.ts` — covers HQD-03 window
- [ ] `services/hq-worker/src/lib/gates/ownerTemplateGate.test.ts` — covers HQD-03 template
- [ ] `services/hq-worker/src/domain/sendOwnerMessage.test.ts` — covers HQD-03 gate order

---

## Plan Split + Wave Ordering (D-12)

BD3 contains exactly two parallel plans:

### HQB Plan (HQB-01..05)
Suggested waves:
- **Wave 1:** Classification engine (`studio-health.ts` + constants) + `list-studios` action + `/api/studios` resource route + migration v8 (schema only, no send tables yet — just hq_whatsapp_opt_in to unblock HQD wave 1 if running in parallel)
- **Wave 2:** `/studios._index.tsx` console UI (Table + health badges + cohort filter tabs)
- **Wave 3:** `/studios.$id.tsx` drill-in UI (recharts history charts) + optional `brain-ingest` queue in services/hq-worker

HQB has no external dependencies and can ship immediately.

### HQD Plan (HQD-01..05)
Suggested waves:
- **Wave 1:** hq_whatsapp_opt_in + hq_whatsapp_templates migrations (v8, v9) + Drizzle defs + constants (WABA phone number ID stored as secret)
- **Wave 2:** HQ gate copies (ownerOptInGate, ownerWindowGate, ownerTemplateGate) + HqWabaClient interface + mock implementation + sendOwnerMessage orchestrator — all unit-tested with mock client
- **Wave 3:** `send-owner-whatsapp` defineAction (member-excluded .strict() schema) + HQD system-prompt constraint in agent-chat.ts + hq-owner-send pg-boss queue in hq-worker
- **Wave 4:** Content fork copy-out (non-collab Tiptap editor + document CRUD actions + schema migration for documents table) + record in MODIFICATIONS.md
- **Wave 5 (optional, may slip):** Video stub (HQD-05)

HQD live send gated on external: build + test in waves 1-3; live sends enabled by operator completing Meta WABA registration + template submission (operator manual step).

---

## Sources

### Primary (HIGH confidence)
- `packages/hq-schema/src/schema.ts` — verified exact columns of `hq_studios`, `hq_telemetry_snapshots`, `hq_token_usage`, `hq_studio_tokens`; confirmed `hq_whatsapp_opt_in` does NOT exist yet (must be added additively as migration v8)
- `packages/hq-schema/src/telemetry.ts` — verified `TelemetrySnapshot` field set (all classification signals are present)
- `packages/hq-schema/src/migrations.ts` — verified migration versions 1-7; v8 is available for BD3
- `packages/hq-schema/src/constants.ts` — verified `HQ_ORG_ID`, `HQ_ORG_SLUG`, `HQ_ORG_MEMBER_ID`; additive threshold constants go here
- `services/worker/src/domain/gates/optInGate.ts` — verified exact function signature `hasOptIn(memberId, db): Promise<boolean>`
- `services/worker/src/domain/gates/windowGate.ts` — verified `WINDOW_HOURS = 24`, `isInWindow(lastInboundAt, now): boolean`
- `services/worker/src/domain/gates/templateGate.ts` — verified `isTemplateApproved(name, db): Promise<boolean>`
- `services/worker/src/domain/sendMessage.ts` — verified gate order (opt-in → load member → load conversation → window → template-approved → relay)
- `services/hq-worker/src/index.ts` — verified pattern for createQueue + work + schedule; `provision-studio` + `hq-watchdog` queues already registered
- `services/hq-worker/src/queues/watchdog.ts` — verified `STALE_TELEMETRY_THRESHOLD_HOURS = 25` and DISTINCT ON query pattern for `last_telemetry_received_at`
- `apps/hq/package.json` — confirmed NO chart library in deps; confirmed available: shadcn/ui, @tabler/icons-react, @tanstack/react-query, sonner, zod, drizzle-orm, @agent-native/core, @agent-native/dispatch, @gymos/hq-schema, @gymos/queue
- `apps/hq/app/routes/provisioning.tsx` — verified UI pattern for new HQB routes (shadcn Card + Badge + progressive disclosure, fetch from resource route)
- `apps/hq/server/plugins/agent-chat.ts` — confirmed thin re-export (must be copy-out forked for system-prompt constraint)
- `apps/hq/server/plugins/setup-dispatch.ts` — confirmed thin re-export
- `apps/hq/actions/run.ts` — verified pattern for action barrel (imports dispatchActions)
- `apps/hq/actions/ask-brain.ts` — verified `defineAction` pattern used in HQ
- `templates/content/package.json` — verified Yjs/collab deps (`yjs`, `y-protocols`, `@tiptap/extension-collaboration`, etc.) that must be dropped in the non-collab fork
- `scripts/guard-hq-fork-boundary.mjs` — verified guard pattern; new `guard-hqd-no-worker-import.mjs` should follow same approach
- `scripts/guard-hq-no-pii.mjs` — verified that `hq_whatsapp_opt_in` columns are safe (no `*connection*`/`*database_url*`/`*dsn*`)
- `apps/hq/server/routes/api/telemetry/ingest-helpers.ts` — verified pure-helper pattern for unit-testable business logic

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` §V2-8 — HQB gym-owner model, HQD system-prompt constraint text
- `.planning/research/PITFALLS.md` Area 3 — W-03 WABA separation; F-02 accessFilter orgId; F-03 Brain PII accumulation
- `.planning/phases/BD3-hq-brain-dispatcher/BD3-CONTEXT.md` — all locked decisions and discretion areas

### Tertiary (LOW confidence — needs live verification)
- Meta Business Manager second phone number registration procedure — documented pattern, not live-verified in GymClassOS account
- recharts SSR compatibility with React Router v7 — training knowledge + documented issue; mitigated by ClientOnly wrapper pattern

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — verified against apps/hq/package.json; recharts addition is net-new but low-risk
- HQB architecture: HIGH — all SQL columns verified from schema.ts + migrations.ts; classification engine design is straightforward threshold logic
- HQD gate interfaces: HIGH — exact function signatures read from source files
- HQD WABA registration: MEDIUM — Meta docs pattern, not live-verified in GymClassOS account
- Content fork scope: HIGH — templates/content package.json read; Yjs deps clearly identified

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (30 days — stable stack; recharts version should be re-verified at install)
