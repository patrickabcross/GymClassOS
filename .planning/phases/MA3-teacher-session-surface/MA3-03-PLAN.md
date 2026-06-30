---
phase: MA3-teacher-session-surface
plan: 03
type: execute
wave: 3
depends_on: ["MA3-01", "MA3-02"]
files_modified:
  - packages/mobile-app/lib/use-role.ts
  - packages/mobile-app/app/_layout.tsx
  - packages/mobile-app/app/(tabs)/_layout.tsx
  - packages/mobile-app/app/(tabs)/teacher-schedule.tsx
  - packages/mobile-app/app/teacher-roster.tsx
autonomous: true
requirements: [TCH-01, TCH-02, TCH-03]
user_setup: []

must_haves:
  truths:
    - "The agent FAB is absent for role !== 'member' (teachers and, until MA4, admins see no AI surface)"
    - "A teacher signs in and lands on a teacher tab set (assigned schedule + profile), not the member booking tabs"
    - "A teacher taps a session to open its roster and taps a member to check them in (optimistic), driving POST /api/m/teacher/check-in"
    - "A teacher with no assigned sessions sees a clear empty state, not an error"
  artifacts:
    - path: "packages/mobile-app/lib/use-role.ts"
      provides: "useRole() hook reading GET /api/m/me once"
      exports: ["useRole"]
    - path: "packages/mobile-app/app/(tabs)/teacher-schedule.tsx"
      provides: "teacher assigned-sessions list + empty state + navigate to roster"
    - path: "packages/mobile-app/app/teacher-roster.tsx"
      provides: "roster list + tap-to-check-in mutation"
  key_links:
    - from: "packages/mobile-app/app/_layout.tsx"
      to: "GET /api/m/me"
      via: "useRole(); AgentFabAndSheet returns null if role !== 'member'"
      pattern: "role !== \"member\""
    - from: "packages/mobile-app/app/(tabs)/_layout.tsx"
      to: "GET /api/m/me"
      via: "useRole(); href: null toggles tab sets by role"
      pattern: "useRole"
    - from: "packages/mobile-app/app/teacher-roster.tsx"
      to: "POST /api/m/teacher/check-in"
      via: "useMutation apiFetch"
      pattern: "/api/m/teacher/check-in"
---

<objective>
Branch the existing Expo app by role: hide the agent FAB for non-members (TCH-03), render a teacher tab set when `role === "teacher"`, and build the teacher assigned-schedule list (TCH-01) + roster-with-check-in screen (TCH-02). All driven by the Plan 01 `/api/m/me` role surface and the Plan 02 teacher endpoints.

Purpose: This is the user-facing half of MA3. It keeps the app feeling like a pure member app (no role toggle) — role is auto-detected post-login and the right surface renders silently.
Output: a `useRole` hook, FAB role-gate + tab-set branch, a teacher schedule tab, and a pushed roster/check-in screen.

TCH-03 ORDERING NOTE: MA3 satisfies its part of TCH-03 client-side (FAB absent for non-members) and via the member coach SSE, which already 403s a teacher (it uses requireMemberOrDemo and a teacher has no gym_members row). The OTHER half of TCH-03 — "the admin SSE endpoint rejects a teacher session" — targets the admin SSE that MA4 builds (requireAdmin / AI-03). Do NOT build an admin endpoint here. For the full TCH-03 guarantee, execute MA4 before/with MA3.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/MA3-teacher-session-surface/MA3-CONTEXT.md
@.planning/phases/MA3-teacher-session-surface/MA3-RESEARCH.md

<interfaces>
<!-- Contracts the executor needs — extracted from the codebase. -->

apiFetch (packages/mobile-app/lib/api.ts) — sends Authorization: Bearer automatically, throws on !res.ok:
```ts
export async function apiFetch(path: string, init?: RequestInit): Promise<any>;
```

GET /api/m/me (Plan 01) returns: `{ role: "admin"|"teacher"|"member", userId, email, trainerId: string|null }`
GET /api/m/teacher/schedule (Plan 02) returns: `{ items: Array<{id, startsAt, endsAt, capacity, status, room, location, className, category, durationMin}>, trainerLinked: boolean }`
GET /api/m/teacher/roster?occurrenceId= (Plan 02) returns: `{ occurrenceId, roster: Array<{bookingId, memberId, firstName, lastName, status:"booked"|"attended"|...}> }`
POST /api/m/teacher/check-in body `{ bookingId }` returns: `{ attended: true } | { error: "BOOKING_NOT_FOUND"|"BOOKING_CANCELLED" }`

Mobile conventions (verified in repo):
- Icons: `Feather` from `@expo/vector-icons` (the mobile app's established convention — NOT Tabler; Tabler is staff-web only).
- Theme: `useTheme()` from `../../lib/theme` → `theme.colors.*`, `theme.spacing.*`, `theme.radius.*`, `theme.font.*`.
- Data: TanStack Query `useQuery` / `useMutation` via apiFetch; optimistic UI on mutations (onMutate cache patch + onError rollback).
- Routing: Expo Router. Root Stack is in app/_layout.tsx; tabs in app/(tabs)/_layout.tsx. Hide a tab per-role with `options={{ href: null }}`. Push a non-tab screen with `router.push({ pathname: "/teacher-roster", params: { occurrenceId, title } })` and register it as a `<Stack.Screen name="teacher-roster" />` in the root Stack.
- The existing member schedule screen (app/(tabs)/schedule.tsx) is the canonical pattern for FlatList + day grouping + theme styles + ListEmptyComponent — copy its structure.

AgentFabAndSheet today (app/_layout.tsx ~line 76) renders for EVERYONE behind AuthGate, hidden only on /sign-in. It must additionally return null for role !== "member".
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: useRole hook + FAB role-gate + role-branched tab set (TCH-03 + routing)</name>
  <read_first>
    - packages/mobile-app/app/_layout.tsx (AgentFabAndSheet ~line 76; AuthGate; root Stack ~line 158)
    - packages/mobile-app/app/(tabs)/_layout.tsx (the 5 member tabs)
    - packages/mobile-app/lib/api.ts (apiFetch)
    - packages/mobile-app/lib/query-client.ts (QueryProvider is already mounted)
  </read_first>
  <files>packages/mobile-app/lib/use-role.ts, packages/mobile-app/app/_layout.tsx, packages/mobile-app/app/(tabs)/_layout.tsx</files>
  <action>
    Create lib/use-role.ts — a thin hook reading /api/m/me once (cached by TanStack Query). Default to "member" while loading/erroring so the member experience is the safe fallback:
    ```ts
    import { useQuery } from "@tanstack/react-query";
    import { apiFetch } from "./api";

    export type AppRole = "admin" | "teacher" | "member";

    export function useRole(): { role: AppRole; trainerId: string | null; isLoading: boolean } {
      const { data, isLoading } = useQuery({
        queryKey: ["me"],
        queryFn: () => apiFetch("/api/m/me"),
        staleTime: 5 * 60 * 1000,
      });
      return { role: (data?.role as AppRole) ?? "member", trainerId: data?.trainerId ?? null, isLoading };
    }
    ```
    In app/_layout.tsx, gate the FAB: inside AgentFabAndSheet, after the existing `onSignIn` early-return, add a role check using useRole — `const { role } = useRole(); if (role !== "member") return null;` (no AI for teachers/admins; TCH-03). Also register the pushed roster screen in the root Stack (alongside the food-add/food-barcode Stack.Screen entries):
    ```tsx
    <Stack.Screen name="teacher-roster" options={{ title: "Roster", headerShown: true }} />
    ```
    In app/(tabs)/_layout.tsx, read `const { role } = useRole();` and branch the tab set with `href`:
    - Member tabs (index "Home", schedule "Classes", passes "Passes", food "Log"): add `href: role === "member" ? undefined : null` to each `options`.
    - New teacher tab `teacher-schedule` "Schedule": `href: role === "teacher" ? undefined : null`, icon Feather "calendar".
    - profile "Profile": leave visible for all roles (no href override).
    Keep all `<Tabs.Screen>` declared unconditionally; only the `href` toggles visibility (the Expo Router idiom — do NOT conditionally unmount Tabs.Screen children).
  </action>
  <verify>
    <automated>cd packages/mobile-app && npx tsc --noEmit 2>&1 | grep -E "use-role|_layout" || echo "no role/layout type errors"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function useRole" packages/mobile-app/lib/use-role.ts` present
    - `grep -n "role !== \"member\"" packages/mobile-app/app/_layout.tsx` present (FAB gate)
    - `grep -n "teacher-roster" packages/mobile-app/app/_layout.tsx` present (Stack.Screen registered)
    - `grep -n "useRole" packages/mobile-app/app/(tabs)/_layout.tsx` present
    - `grep -n "href:" packages/mobile-app/app/(tabs)/_layout.tsx` present (role-toggled tabs)
    - `grep -n "teacher-schedule" packages/mobile-app/app/(tabs)/_layout.tsx` present
  </acceptance_criteria>
  <done>The agent FAB is absent for role !== "member"; a teacher sees a teacher tab set (Schedule + Profile) while a member sees the existing 5 tabs; the pushed teacher-roster screen is registered.</done>
</task>

<task type="auto">
  <name>Task 2: Teacher assigned-schedule tab screen (TCH-01)</name>
  <read_first>
    - packages/mobile-app/app/(tabs)/schedule.tsx (FlatList + day grouping + theme styles + ListEmptyComponent — copy structure, strip booking/pass logic)
    - packages/mobile-app/lib/api.ts (apiFetch)
    - packages/mobile-app/lib/theme.ts (theme tokens)
  </read_first>
  <files>packages/mobile-app/app/(tabs)/teacher-schedule.tsx</files>
  <action>
    Create the teacher schedule screen. useQuery(["teacher-schedule"]) → apiFetch("/api/m/teacher/schedule"). Render the assigned sessions grouped by day (reuse the dayKey/dayLabel/timeLabel helpers and FlatList pattern from the member schedule.tsx). Each card shows time, className, capacity, location — and is Pressable to navigate to the roster:
    ```tsx
    import { useRouter } from "expo-router";
    // ...
    const router = useRouter();
    // onPress for a session card:
    router.push({ pathname: "/teacher-roster", params: { occurrenceId: it.id, title: it.className ?? "Class" } });
    ```
    Empty state — distinguish the two cases using `trainerLinked` from the response (Pitfall 3): when `data.trainerLinked === false` show "You're not linked to a trainer yet — contact the studio."; when linked but `items` is empty show "No sessions assigned to you this week." Use a centered empty view (mirror schedule.tsx ListEmptyComponent / styles.emptyText), NEVER an error toast for these. Keep the genuine error branch (query `error`) as a Retry view exactly like schedule.tsx.
  </action>
  <verify>
    <automated>cd packages/mobile-app && npx tsc --noEmit 2>&1 | grep -E "teacher-schedule" || echo "no teacher-schedule type errors"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n '/api/m/teacher/schedule' packages/mobile-app/app/(tabs)/teacher-schedule.tsx` present
    - `grep -n "teacher-roster" packages/mobile-app/app/(tabs)/teacher-schedule.tsx` present (navigates to roster)
    - `grep -n "trainerLinked" packages/mobile-app/app/(tabs)/teacher-schedule.tsx` present (distinguishes empty states)
    - `grep -nE "No sessions assigned|not linked" packages/mobile-app/app/(tabs)/teacher-schedule.tsx` present (clear empty copy, not an error)
  </acceptance_criteria>
  <done>The teacher schedule tab lists the teacher's assigned sessions grouped by day, each tappable to its roster; an unlinked teacher and a teacher with no sessions each see a clear empty state (not an error); genuine fetch errors still show Retry.</done>
</task>

<task type="auto">
  <name>Task 3: Roster + tap-to-check-in screen (TCH-02)</name>
  <read_first>
    - packages/mobile-app/app/(tabs)/schedule.tsx (useMutation optimistic pattern: onMutate cache patch, onError rollback, onSuccess invalidate)
    - packages/mobile-app/lib/api.ts (apiFetch)
    - packages/mobile-app/app/_layout.tsx (Task 1 — teacher-roster Stack.Screen must be registered)
  </read_first>
  <files>packages/mobile-app/app/teacher-roster.tsx</files>
  <action>
    Create the pushed roster screen. Read params via `useLocalSearchParams()` → `occurrenceId`, `title`. useQuery(["teacher-roster", occurrenceId]) → apiFetch(`/api/m/teacher/roster?occurrenceId=${occurrenceId}`). Render a FlatList of roster members (firstName + lastName), each row showing a check tick when `status === "attended"` and a "Check in" Pressable otherwise.
    Check-in mutation (optimistic — mirror schedule.tsx bookMutation):
    ```tsx
    const checkIn = useMutation({
      mutationFn: (bookingId: string) =>
        apiFetch("/api/m/teacher/check-in", { method: "POST", body: JSON.stringify({ bookingId }) }),
      onMutate: async (bookingId) => {
        await qc.cancelQueries({ queryKey: ["teacher-roster", occurrenceId] });
        const previous = qc.getQueryData<any>(["teacher-roster", occurrenceId]);
        qc.setQueryData<any>(["teacher-roster", occurrenceId], (old: any) => old && ({
          ...old,
          roster: old.roster.map((r: any) => r.bookingId === bookingId ? { ...r, status: "attended" } : r),
        }));
        return { previous };
      },
      onError: (_e, _v, ctx) => { if (ctx?.previous) qc.setQueryData(["teacher-roster", occurrenceId], ctx.previous); /* show inline error */ },
      onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-roster", occurrenceId] }),
    });
    ```
    Show a loading spinner while fetching, a Retry view on genuine error, and an empty state ("No one booked yet") when the roster is empty. Use Feather icons (check / user) and theme tokens; no emojis. Do NOT add any AI/agent surface to this screen (TCH-03).
  </action>
  <verify>
    <automated>cd packages/mobile-app && npx tsc --noEmit 2>&1 | grep -E "teacher-roster" || echo "no teacher-roster type errors"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n '/api/m/teacher/roster' packages/mobile-app/app/teacher-roster.tsx` present
    - `grep -n '/api/m/teacher/check-in' packages/mobile-app/app/teacher-roster.tsx` present
    - `grep -n "useLocalSearchParams" packages/mobile-app/app/teacher-roster.tsx` present
    - `grep -n "onMutate" packages/mobile-app/app/teacher-roster.tsx` present (optimistic UI)
    - `grep -nE "status === \"attended\"|attended" packages/mobile-app/app/teacher-roster.tsx` present (check tick state)
  </acceptance_criteria>
  <done>The roster screen lists booked members for the selected session and lets the teacher tap to check each in (optimistic, POST /api/m/teacher/check-in), showing an attended tick once done; loading/error/empty states all handled; no AI surface present.</done>
</task>

</tasks>

<verification>
- tsc clean for the mobile app (use-role.ts, _layout.tsx, (tabs)/_layout.tsx, teacher-schedule.tsx, teacher-roster.tsx)
- Static checks: FAB returns null for role !== "member"; teacher tabs toggle via href; check-in posts to /api/m/teacher/check-in; empty states are copy, not errors
- Device-gated (like MA1/MA3 server work): on-device iOS verification is blocked on the customer's Apple Developer account / EAS build. Verify role-branch + check-in flow on an Android device or simulator, OR record the device-gated checks the way MA1-03 did (in a SPIKE/UAT note) when the EAS build is available. Do NOT block plan completion on the Apple gate.
</verification>

<success_criteria>
- TCH-03: the agent FAB is absent for teachers (role !== "member"); no teacher AI surface anywhere; member coach SSE still member-gated (admin-SSE 403 is MA4's AI-03 — ordering note in objective)
- TCH-01: a teacher lands on the teacher tab set and sees their assigned sessions + a clear empty state; each session opens its roster
- TCH-02: a teacher checks members in from the roster, driving POST /api/m/teacher/check-in → the existing chokepoint
</success_criteria>

<output>
After completion, create `.planning/phases/MA3-teacher-session-surface/MA3-03-SUMMARY.md`, noting any device-gated checks deferred to the EAS build.
</output>
