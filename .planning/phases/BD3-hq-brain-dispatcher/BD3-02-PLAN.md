---
phase: BD3
plan: 02
type: execute
wave: 2
depends_on: ["BD3-01"]
files_modified:
  - apps/hq/package.json
  - apps/hq/app/routes/studios._index.tsx
  - apps/hq/app/routes/studios.$id.tsx
  - apps/hq/app/routes/api.studios.$id.snapshots.ts
autonomous: true
requirements: [HQB-01, HQB-04, HQB-05]
must_haves:
  truths:
    - "Operator can open /studios and see every studio listed in a shadcn Table with a health badge, last-telemetry-received, token spend, and key engagement metrics"
    - "A stale studio renders a grey 'stale' badge and never a green 'healthy' badge"
    - "Operator can filter the list to at-risk and power-user cohorts"
    - "Operator can open /studios/:id and see telemetry history over time as charts (active members, messages sent, retention, token usage)"
    - "Charts do not crash SSR (wrapped in ClientOnly)"
  artifacts:
    - path: "apps/hq/app/routes/studios._index.tsx"
      provides: "HQB console — studio list/table with health badges + cohort filter"
      min_lines: 60
    - path: "apps/hq/app/routes/studios.$id.tsx"
      provides: "HQB-05 per-studio drill-in with recharts telemetry history"
      min_lines: 50
    - path: "apps/hq/app/routes/api.studios.$id.snapshots.ts"
      provides: "GET /api/studios/:id/snapshots resource route — telemetry history rows"
    - path: "apps/hq/package.json"
      provides: "recharts dependency"
      contains: "recharts"
  key_links:
    - from: "apps/hq/app/routes/studios._index.tsx"
      to: "/api/studios"
      via: "fetch in loader or useEffect"
      pattern: "api/studios"
    - from: "apps/hq/app/routes/studios.$id.tsx"
      to: "/api/studios/:id/snapshots"
      via: "fetch"
      pattern: "snapshots"
    - from: "apps/hq/app/routes/studios.$id.tsx"
      to: "recharts"
      via: "import LineChart wrapped in ClientOnly"
      pattern: "ClientOnly"
---

<objective>
Build the HQB operator console (D-05: shadcn Table studio list with health badges + cohort filter) and the per-studio drill-in (D-06: telemetry history charts via recharts, SSR-guarded). Consumes the `/api/studios` read model from BD3-01.

Purpose: HQB-01 (console), HQB-04 (cohort views), HQB-05 (drill-in over time).
Output: `/studios` list route, `/studios/:id` drill-in route, `/api/studios/:id/snapshots` history resource route, recharts added to apps/hq.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/BD3-hq-brain-dispatcher/BD3-CONTEXT.md
@.planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md
@apps/hq/app/routes/provisioning.tsx
@apps/hq/app/routes/api.studios.ts

<interfaces>
From BD3-01 `apps/hq/app/routes/api.studios.ts`:
```typescript
export interface StudioConsoleRow {
  id; slug; displayName; ownerEmail; status; provisionedAt;
  lastTelemetryReceivedAt; periodStart; periodEnd;
  totalInputTokens; totalOutputTokens;
  activeMembers; bookings; messagesSent; retentionRate;
  health: StudioHealthSignals; // { status, cohort, isStale, isDormant, isUnderMessaging, isLowRetention, signals: string[] }
}
export interface StudiosResponse { studios: StudioConsoleRow[]; }
```
`HealthStatus = "healthy" | "dormant" | "under-messaging" | "low-retention" | "stale" | "at-risk"` from `apps/hq/server/lib/studio-health.ts`.

ClientOnly: `import { ClientOnly } from "@agent-native/core/client";` — already used in apps/hq root.tsx for the agent sidebar (Pitfall 6 / Open Question 2). recharts components MUST be inside ClientOnly to avoid `window is not defined` on Vercel SSR.

shadcn primitives available in apps/hq (used by provisioning.tsx): Badge, Card/CardHeader/CardContent/CardTitle/CardDescription, Skeleton, Button, Table. If `Table` or `Tabs` is missing, copy from another template package and add matching @radix deps (per AGENTS.md) — do not hand-roll.
Tabler icons: IconActivity, IconAlertTriangle, IconClock, IconArrowLeft.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install recharts + studio history resource route</name>
  <files>apps/hq/package.json, apps/hq/app/routes/api.studios.$id.snapshots.ts</files>
  <read_first>
    - apps/hq/package.json (confirm no chart lib present; add recharts)
    - apps/hq/app/routes/api.provisioning-runs.ts (resource-route pattern)
    - apps/hq/app/routes/api.studios.ts (sibling resource route from BD3-01; reuse TelemetrySnapshotInput parsing)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 352-364 (drill-in data source)
  </read_first>
  <action>
    Add recharts to apps/hq: `cd apps/hq && pnpm add recharts` (verify version with `npm view recharts version` first — expect 2.15.x line; pin the resolved version, do NOT use a 3.x beta).
    Create `apps/hq/app/routes/api.studios.$id.snapshots.ts` — `GET /api/studios/:id/snapshots`. Mirror api.provisioning-runs.ts: `loader({ params })`, read `params.id`, `getDb()`, select all hq_telemetry_snapshots rows for that studioId ordered by `period_start` ASC (drizzle query builder: `where(eq(schema.hqTelemetrySnapshots.studioId, params.id)).orderBy(asc(schema.hqTelemetrySnapshots.periodStart))`). For each row JSON.parse `payload_json` and project a flat time-series point: `{ periodStart, periodEnd, receivedAt, activeMembers, bookings, messagesSent, retentionRate, llmInputTokens, llmOutputTokens }`. Export `StudioSnapshotPoint` and `StudioSnapshotsResponse { studioId: string; displayName: string | null; points: StudioSnapshotPoint[] }` (also join hq_studios for displayName). Carry the `// guard:allow-unscoped -- HQ operator-scoped` comment. Return `data<StudioSnapshotsResponse>(...)`.
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/package.json` contains `"recharts"`
    - `apps/hq/app/routes/api.studios.$id.snapshots.ts` exists and contains `export async function loader` and `orderBy`
    - route contains literal `guard:allow-unscoped`
    - `pnpm -F @gymos/hq exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>recharts installed; the snapshots history endpoint returns an ordered time-series for a studio.</done>
</task>

<task type="auto">
  <name>Task 2: Console list route /studios with health badges + cohort filter</name>
  <files>apps/hq/app/routes/studios._index.tsx</files>
  <read_first>
    - apps/hq/app/routes/provisioning.tsx (full UI pattern: useEffect fetch from resource route, Skeleton loading, Badge, Card, Tabler icons, progressive disclosure)
    - apps/hq/app/routes/api.studios.ts (StudioConsoleRow / StudiosResponse types from BD3-01)
    - apps/hq/app/routes/studios.$id.tsx ONLY if it exists yet (it does not — created in Task 3)
  </read_first>
  <action>
    Create `apps/hq/app/routes/studios._index.tsx` (path `/studios`). Mirror provisioning.tsx structure: client component, `useState` + `useEffect` fetch of `/api/studios`, Skeleton while loading, error state, a Refresh button (IconRefresh).
    Render a shadcn `Table` (one row per studio): columns = Display name (link to `/studios/${id}`), Health badge, Cohort, Last telemetry received (relative/formatted; "Never" when null), Active members, Messages sent, Retention (% — `(retentionRate*100).toFixed(0)`), Token spend (totalInput+totalOutput). Health badge color mapping (from RESEARCH.md lines 344-350):
      - `healthy` → green Badge
      - `dormant` / `under-messaging` / `low-retention` / `at-risk` → amber/red Badge with IconAlertTriangle
      - `stale` → grey Badge with IconClock, label "Stale"
    NEVER render a stale studio as green — drive the badge purely off `row.health.status`. Show `row.health.signals` (the reasons) on hover/expand (HoverCard or expandable row) for auditability (D-01) — progressive disclosure, not always-visible.
    Cohort filter: shadcn `Tabs` (or segmented Button group) with options All / At-risk / Power-user. Filter the rendered rows client-side by `row.health.cohort` (at-risk OR stale → at-risk tab; power-user → power-user tab). This is HQB-04 (computed views, no stored rows).
    Add a nav entry to the route so the operator can reach it (follow how provisioning.tsx is surfaced in the HQ shell nav — inspect the sidebar/nav config the same way).
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/app/routes/studios._index.tsx` exists, fetches `/api/studios`, renders a `Table`
    - file contains badge logic keyed on `health.status` and a branch for `"stale"` distinct from `"healthy"`
    - file contains a cohort filter referencing `health.cohort` with "power-user" and "at-risk"
    - no emoji icons; uses `@tabler/icons-react`
    - `pnpm -F @gymos/hq exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>/studios lists all studios with health badges and a working cohort filter; stale never reads as healthy.</done>
</task>

<task type="auto">
  <name>Task 3: Drill-in route /studios/:id with recharts history (SSR-guarded)</name>
  <files>apps/hq/app/routes/studios.$id.tsx</files>
  <read_first>
    - apps/hq/app/routes/api.studios.$id.snapshots.ts (StudioSnapshotsResponse from Task 1)
    - apps/hq/app/root.tsx (existing ClientOnly usage for agent sidebar — the SSR-guard pattern)
    - apps/hq/app/routes/provisioning.tsx (Card layout + loading/error pattern)
    - .planning/phases/BD3-hq-brain-dispatcher/BD3-RESEARCH.md lines 352-364, 747-755 (recharts pattern + SSR guard Pitfall 6)
  </read_first>
  <action>
    Create `apps/hq/app/routes/studios.$id.tsx` (path `/studios/:id`). Client component: read the id via `useParams()`, `useEffect` fetch `/api/studios/${id}/snapshots`, Skeleton while loading, error + empty states (empty = "No telemetry history yet for this studio").
    Header: back link to `/studios` (IconArrowLeft), studio displayName.
    Render four recharts charts in shadcn Cards (one metric each, x-axis = periodStart): Active members, Messages sent, Retention rate (%), Token usage (input+output). Use `<ResponsiveContainer><LineChart data={points}><CartesianGrid/><XAxis dataKey="periodStart"/><YAxis/><Tooltip/><Line .../></LineChart></ResponsiveContainer>` from recharts.
    CRITICAL (Pitfall 6 / Open Question 2): wrap every recharts chart in `<ClientOnly fallback={<Skeleton .../>}>{() => (<ResponsiveContainer>...)}</ClientOnly>` imported from `@agent-native/core/client`. recharts touches `window`; without ClientOnly the Vercel SSR render throws `ReferenceError: window is not defined`. The Skeleton renders on server; the chart mounts after hydration.
    Run prettier.
  </action>
  <verify>
    <automated>pnpm -F @gymos/hq exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `apps/hq/app/routes/studios.$id.tsx` exists, fetches `/api/studios/${...}/snapshots`
    - file imports from `recharts` and from `@agent-native/core/client` (ClientOnly)
    - every recharts `LineChart`/`ResponsiveContainer` is rendered inside a `ClientOnly` boundary (grep: `ClientOnly` appears and wraps the chart)
    - `pnpm -F @gymos/hq exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>/studios/:id shows telemetry history charts over time, SSR-safe via ClientOnly.</done>
</task>

</tasks>

<verification>
- `pnpm -F @gymos/hq exec tsc --noEmit` clean across all three routes.
- recharts pinned in apps/hq/package.json.
- No local dev walkthrough (P1c) — UI verified on the HQ Vercel deploy after merge; SSR safety asserted structurally via ClientOnly grep.
- `pnpm guard:hq-fork-boundary` passes (routes live under apps/hq, no templates/ edits).
</verification>

<success_criteria>
- HQB-01: operator console lists all studios with health summaries.
- HQB-04: at-risk + power-user cohort views are reachable as computed filters.
- HQB-05: per-studio drill-in shows performance over time.
- Stale telemetry visibly excluded from "healthy" in the UI.
</success_criteria>

<output>
After completion, create `.planning/phases/BD3-hq-brain-dispatcher/BD3-02-SUMMARY.md`
</output>
