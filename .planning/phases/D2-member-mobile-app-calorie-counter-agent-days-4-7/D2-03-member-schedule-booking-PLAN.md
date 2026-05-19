---
phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
plan: 03
type: execute
wave: 2
depends_on: ["D2-01"]
files_modified:
  - templates/mail/app/routes/api.m.schedule.tsx
  - templates/mail/app/routes/api.m.bookings.tsx
  - packages/mobile-app/app/(tabs)/schedule.tsx
autonomous: true
requirements: [MEMBR-01, MEMBR-02]
must_haves:
  truths:
    - "GET /api/m/schedule returns occurrences for the next 7 days from now, joined with class names + booking counts + a flag indicating whether the current member is already booked into each"
    - "POST /api/m/bookings with { occurrenceId } inserts a row in bookings with status='booked' and memberId = the X-Demo-Member-Id header"
    - "Mobile Schedule tab renders the upcoming week grouped by day, each occurrence as a card showing time, class name, capacity used/total, and a 'Book' button (or 'Booked' badge if already booked)"
    - "Tapping the Book button calls POST /api/m/bookings, optimistically updates the card to 'Booked' immediately, and rolls back on error"
    - "After successful booking, the next page-load of /api/m/profile shows the new booking as the upcomingBooking"
  artifacts:
    - path: "templates/mail/app/routes/api.m.schedule.tsx"
      provides: "GET endpoint — week of upcoming occurrences + booking counts + already-booked flag for current member"
      exports: ["loader"]
      min_lines: 60
    - path: "templates/mail/app/routes/api.m.bookings.tsx"
      provides: "POST endpoint — naive INSERT booking (demo-grade; no atomic capacity check per BKG-01 demo)"
      exports: ["action"]
      min_lines: 40
    - path: "packages/mobile-app/app/(tabs)/schedule.tsx"
      provides: "Schedule tab — vertical day-grouped list, inline-expand booking pattern, optimistic UI"
      exports: ["default"]
      min_lines: 150
  key_links:
    - from: "templates/mail/app/routes/api.m.schedule.tsx loader"
      to: "schema.classOccurrences + schema.classDefinitions + schema.bookings"
      via: "leftJoin classOccurrences ← classDefinitions; separate aggregation for booking counts and member-is-booked flag"
      pattern: "classOccurrences.*leftJoin.*classDefinitions"
    - from: "templates/mail/app/routes/api.m.bookings.tsx action"
      to: "schema.bookings INSERT"
      via: "db.insert(schema.bookings).values({...status: 'booked'...})"
      pattern: "insert\\(schema\\.bookings\\)"
    - from: "packages/mobile-app/app/(tabs)/schedule.tsx"
      to: "templates/mail/app/routes/api.m.schedule.tsx + api.m.bookings.tsx"
      via: "useQuery(['schedule']) + useMutation with optimistic onMutate / rollback onError"
      pattern: "useQuery.*schedule"
---

<objective>
Build the member-side schedule + booking surface: a `/api/m/schedule` endpoint returning the upcoming week joined with booking metadata, a `/api/m/bookings` POST endpoint for naive demo-grade booking, and a mobile Schedule tab that renders day-grouped occurrence cards with inline "Book" → optimistic "Booked" interaction.

Purpose: Demo Sprint deliverable for MEMBR-01 (member browses week schedule mobile-optimised) + MEMBR-02 (member books a class from the app). Mirrors the data shape of the staff schedule (D1-01) but on the mobile tab, scoped to the X-Demo-Member-Id member.

Output:
- `templates/mail/app/routes/api.m.schedule.tsx` — GET with 7-day window + per-occurrence isBookedByMe flag
- `templates/mail/app/routes/api.m.bookings.tsx` — POST that inserts a booking row for the current demo member
- `packages/mobile-app/app/(tabs)/schedule.tsx` — overwrites the placeholder from D2-01 with a real screen
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-01-mobile-shell-auth-PLAN.md
@templates/mail/app/routes/gymos.schedule.tsx
@templates/mail/server/db/schema.ts

<interfaces>
From templates/mail/server/lib/demo-member.ts (created by D2-01 Task 4):
```typescript
export type DemoMember = typeof schema.gymMembers.$inferSelect;
export async function requireDemoMember(request: Request): Promise<DemoMember>;
```

From packages/mobile-app/lib/api.ts (created by D2-01 Task 3):
```typescript
export async function apiFetch(path: string, init?: RequestInit): Promise<any>;
export const API_BASE_URL: string;
```

From packages/mobile-app/lib/query-client.ts (created by D2-01):
```typescript
export const queryClient: QueryClient;
export function QueryProvider({ children }): JSX.Element;
```

From templates/mail/server/db/schema.ts:
```typescript
// class_occurrences
export const classOccurrences: { id, definitionId, startsAt: string /* ISO */, endsAt: string, capacity: number, instructorUserId, room, status: "scheduled"|"cancelled"|"completed", notes, createdAt }

// class_definitions
export const classDefinitions: { id, name, description, durationMin: number, defaultCapacity: number, defaultInstructorUserId, category, active: boolean, createdAt }

// bookings
export const bookings: { id, occurrenceId, memberId, status: "booked"|"waitlist"|"cancelled"|"attended"|"no_show", passId, bookedByUserId, bookedAt, cancelledAt, attendedAt }
```

The existing staff schedule route `templates/mail/app/routes/gymos.schedule.tsx` (built in D1-01) provides the booking-count aggregation pattern. The member endpoint mirrors the queries plus a third aggregation to detect "is the current member already booked?"
</interfaces>

</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create /api/m/schedule loader — next 7 days of occurrences + booking counts + isBookedByMe flag</name>
  <files>
    - templates/mail/app/routes/api.m.schedule.tsx
  </files>
  <read_first>
    - templates/mail/app/routes/gymos.schedule.tsx (D1-01 — for the leftJoin pattern: classOccurrences leftJoin classDefinitions, plus the booking-count groupBy)
    - templates/mail/server/db/schema.ts lines 188-216 (classDefinitions + classOccurrences) + 218-232 (bookings)
    - templates/mail/server/lib/demo-member.ts (D2-01 Task 4 output — the requireDemoMember helper)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Pattern 1: Member-API gate" (the access pattern + the "guard:allow-unscoped" marker)
  </read_first>
  <action>
Create new file `templates/mail/app/routes/api.m.schedule.tsx`. URL: `/api/m/schedule`. The loader queries occurrences for the next 7 days, joins class definitions, aggregates booking counts, and computes a per-occurrence flag indicating whether the current X-Demo-Member-Id member is already booked.

Full file content:

```ts
// GET /api/m/schedule
// Member-side schedule — returns occurrences for the next 7 days, with
// class metadata, booking counts, and a flag indicating whether the
// X-Demo-Member-Id member is already booked into each.
//
// Demo-grade: no studio-timezone bucketing (uses ISO date string of startsAt).
// Production (SCH-07) uses the studio's IANA timezone for DST-safe bucketing.
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const member = await requireDemoMember(request);
  const db = getDb();

  const nowIso = new Date().toISOString();
  const sevenDaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Query A — occurrences in window + class metadata
  // guard:allow-unscoped — demo D-07
  const occurrences = await db
    .select({
      id: schema.classOccurrences.id,
      startsAt: schema.classOccurrences.startsAt,
      endsAt: schema.classOccurrences.endsAt,
      capacity: schema.classOccurrences.capacity,
      status: schema.classOccurrences.status,
      room: schema.classOccurrences.room,
      className: schema.classDefinitions.name,
      category: schema.classDefinitions.category,
      durationMin: schema.classDefinitions.durationMin,
    })
    .from(schema.classOccurrences)
    .leftJoin(
      schema.classDefinitions,
      eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
    )
    .where(
      and(
        gte(schema.classOccurrences.startsAt, nowIso),
        lte(schema.classOccurrences.startsAt, sevenDaysIso),
        eq(schema.classOccurrences.status, "scheduled"),
      ),
    )
    .orderBy(asc(schema.classOccurrences.startsAt));

  // Query B — booking counts per occurrence (single grouped query)
  // guard:allow-unscoped — demo D-07
  const countRows = await db
    .select({
      occurrenceId: schema.bookings.occurrenceId,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.bookings)
    .where(eq(schema.bookings.status, "booked"))
    .groupBy(schema.bookings.occurrenceId);
  const bookingCounts: Record<string, number> = {};
  for (const r of countRows) bookingCounts[r.occurrenceId] = Number(r.count);

  // Query C — which occurrences is THIS member already booked into?
  // guard:allow-unscoped — demo D-07
  const myBookings = await db
    .select({ occurrenceId: schema.bookings.occurrenceId })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.memberId, member.id),
        eq(schema.bookings.status, "booked"),
      ),
    );
  const mySet = new Set(myBookings.map((b) => b.occurrenceId));

  const items = occurrences.map((o) => ({
    ...o,
    bookedCount: bookingCounts[o.id] ?? 0,
    isBookedByMe: mySet.has(o.id),
    full: (bookingCounts[o.id] ?? 0) >= o.capacity,
  }));

  return { items };
}
```

Run `npx prettier --write templates/mail/app/routes/api.m.schedule.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/app/routes/api.m.schedule.tsx','utf8');const checks=['requireDemoMember','schema.classOccurrences','schema.classDefinitions','schema.bookings','isBookedByMe','bookedCount','gte(schema.classOccurrences.startsAt','export async function loader'];const missing=checks.filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/app/routes/api.m.schedule.tsx` exists
    - `grep -c 'requireDemoMember' templates/mail/app/routes/api.m.schedule.tsx` returns at least 2 (import + call)
    - `grep -c 'schema.classOccurrences' templates/mail/app/routes/api.m.schedule.tsx` returns at least 2 (select + leftJoin/where)
    - `grep -c 'schema.classDefinitions' templates/mail/app/routes/api.m.schedule.tsx` returns at least 1
    - `grep -c 'schema.bookings' templates/mail/app/routes/api.m.schedule.tsx` returns at least 2 (count query + member-booked query)
    - `grep -c 'isBookedByMe' templates/mail/app/routes/api.m.schedule.tsx` returns at least 1
    - `grep -c 'bookedCount' templates/mail/app/routes/api.m.schedule.tsx` returns at least 1
    - `grep -c 'gte(schema.classOccurrences.startsAt' templates/mail/app/routes/api.m.schedule.tsx` returns 1 (7-day window)
    - File has at least 60 lines
  </acceptance_criteria>
  <done>The endpoint returns the upcoming week joined with class names, booking counts, and a per-occurrence isBookedByMe flag scoped to the X-Demo-Member-Id member</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create /api/m/bookings POST action — naive INSERT booking for current demo member</name>
  <files>
    - templates/mail/app/routes/api.m.bookings.tsx
  </files>
  <read_first>
    - templates/mail/app/routes/gymos.schedule.tsx (D1-01 — see the Task 3 action; we mirror the naive INSERT shape exactly, just substituting requireDemoMember for the formData-supplied memberId)
    - templates/mail/server/db/schema.ts lines 218-232 (bookings columns: id, occurrenceId, memberId, status, bookedAt)
    - templates/mail/server/lib/demo-member.ts (the helper that resolves the actor)
    - .planning/STATE.md (the "naive INSERT" decision from D1-01 — atomic capacity check + pass debit explicitly deferred to BKG-03/BKG-04)
  </read_first>
  <action>
Create new file `templates/mail/app/routes/api.m.bookings.tsx`. URL: `/api/m/bookings`. RR v7 resource routes only invoke `action` on non-GET methods, so a POST request to this URL with `{ occurrenceId }` triggers the action below.

Full file content:

```ts
// POST /api/m/bookings — body { occurrenceId: string }
// Inserts a bookings row for the X-Demo-Member-Id member.
//
// Demo-grade: NO atomic capacity check, NO entitlement resolution, NO pass debit.
// Production (BKG-03/BKG-04) wraps capacity check + entitlement + pass debit in
// a single SQL transaction with SELECT ... FOR UPDATE on the occurrence row.
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireDemoMember } from "../../server/lib/demo-member";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader(_: LoaderFunctionArgs) {
  // GET is not supported — clients use /api/m/schedule to read.
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const member = await requireDemoMember(request);

  let occurrenceId: string;
  try {
    const json = (await request.json()) as { occurrenceId?: string };
    occurrenceId = String(json.occurrenceId ?? "");
  } catch {
    return new Response(JSON.stringify({ error: "Bad JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!occurrenceId) {
    return new Response(JSON.stringify({ error: "Missing occurrenceId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();

  // Idempotency for the demo: if this member already has a 'booked' row for
  // this occurrence, return the existing booking id instead of inserting again.
  // guard:allow-unscoped — demo D-07
  const existing = await db
    .select({ id: schema.bookings.id })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.occurrenceId, occurrenceId),
        eq(schema.bookings.memberId, member.id),
        eq(schema.bookings.status, "booked"),
      ),
    )
    .limit(1)
    .then((r) => r[0] ?? null);
  if (existing) {
    return new Response(JSON.stringify({ bookingId: existing.id, alreadyBooked: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const bookingId = `bkg_${crypto.randomUUID()}`;
  await db.insert(schema.bookings).values({
    id: bookingId,
    occurrenceId,
    memberId: member.id,
    status: "booked",
    bookedByUserId: null, // self-booked from member app
    bookedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ bookingId, alreadyBooked: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
```

Run `npx prettier --write templates/mail/app/routes/api.m.bookings.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/app/routes/api.m.bookings.tsx','utf8');const checks=['export async function action','requireDemoMember','db.insert(schema.bookings)','status: \"booked\"','occurrenceId','alreadyBooked'];const missing=checks.filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/app/routes/api.m.bookings.tsx` exists
    - `grep -c 'export async function action' templates/mail/app/routes/api.m.bookings.tsx` returns 1
    - `grep -c 'requireDemoMember' templates/mail/app/routes/api.m.bookings.tsx` returns at least 2 (import + call)
    - `grep -c 'db.insert(schema.bookings)' templates/mail/app/routes/api.m.bookings.tsx` returns 1
    - `grep -c 'status: "booked"' templates/mail/app/routes/api.m.bookings.tsx` returns at least 1 (insert) — counting both insert and the where filter is also fine
    - `grep -c 'alreadyBooked' templates/mail/app/routes/api.m.bookings.tsx` returns at least 2 (true + false responses)
    - File has at least 40 lines
  </acceptance_criteria>
  <done>POST /api/m/bookings creates a bookings row keyed by occurrenceId + the current member; idempotent if the same (occurrenceId, memberId, 'booked') combo already exists</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Build mobile Schedule tab — day-grouped occurrence cards, optimistic booking via TanStack Query</name>
  <files>
    - packages/mobile-app/app/(tabs)/schedule.tsx
  </files>
  <read_first>
    - packages/mobile-app/app/(tabs)/schedule.tsx (D2-01 placeholder — we overwrite it)
    - packages/mobile-app/lib/api.ts (the apiFetch helper that injects X-Demo-Member-Id)
    - packages/mobile-app/lib/query-client.ts (QueryClient + QueryProvider — already wraps root)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md §"Claude's Discretion" → "Booking flow on member side" — "inline expand under the occurrence card with a 'Confirm booking' button"
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Anti-Patterns to Avoid" → "Spinner-after-click on booking" (optimistic UI mandatory)
  </read_first>
  <behavior>
    - Test 1 (mental: this is a UI screen, no auto-test): GET /api/m/schedule on mount; render N occurrence cards grouped by day
    - Test 2: Tap card → inline expand showing "Confirm booking" button (NOT a Modal — inline expansion under the card per D-claude-discretion)
    - Test 3: Tap "Confirm booking" → optimistic update to isBookedByMe=true (no spinner blocking the UI); fire POST /api/m/bookings in background
    - Test 4: On 200 response → refetch profile cache (so the Home tab shows the new upcomingBooking)
    - Test 5: On error → rollback the optimistic flag, show a toast/banner with the error text
    - Test 6: Already-booked occurrences show a "Booked" badge instead of the Book button (gated on isBookedByMe from the server)
  </behavior>
  <action>
**REPLACE** the placeholder content of `packages/mobile-app/app/(tabs)/schedule.tsx` (the 10-line stub from D2-01) with this full implementation. Use TanStack Query's `useQuery` + `useMutation` with optimistic `onMutate` / `onError` rollback per CLAUDE.md's "Optimistic UI by default" rule.

```tsx
import { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";

type Item = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  className: string | null;
  category: string | null;
  durationMin: number | null;
  bookedCount: number;
  isBookedByMe: boolean;
  full: boolean;
};

type Section = { day: string; items: Item[] };

function dayKey(iso: string) {
  // Demo: UTC date bucket. Production (SCH-07) uses the studio IANA TZ.
  return iso.slice(0, 10);
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ScheduleScreen() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["schedule"],
    queryFn: () => apiFetch("/api/m/schedule"),
  });

  const sections = useMemo<Section[]>(() => {
    const items: Item[] = data?.items ?? [];
    const grouped = new Map<string, Item[]>();
    for (const it of items) {
      const k = dayKey(it.startsAt);
      const arr = grouped.get(k) ?? [];
      arr.push(it);
      grouped.set(k, arr);
    }
    return Array.from(grouped.entries()).map(([day, items]) => ({ day, items }));
  }, [data]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);

  const bookMutation = useMutation({
    mutationFn: async (occurrenceId: string) => {
      return apiFetch("/api/m/bookings", {
        method: "POST",
        body: JSON.stringify({ occurrenceId }),
      });
    },
    onMutate: async (occurrenceId: string) => {
      // Optimistic — mark the occurrence as isBookedByMe immediately
      await qc.cancelQueries({ queryKey: ["schedule"] });
      const previous = qc.getQueryData<any>(["schedule"]);
      qc.setQueryData<any>(["schedule"], (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((it: Item) =>
            it.id === occurrenceId
              ? { ...it, isBookedByMe: true, bookedCount: it.bookedCount + 1 }
              : it,
          ),
        };
      });
      setExpandedId(null);
      return { previous };
    },
    onError: (err: any, _occurrenceId, ctx) => {
      // Rollback
      if (ctx?.previous) qc.setQueryData(["schedule"], ctx.previous);
      setBookError(String(err?.message ?? err));
      setTimeout(() => setBookError(null), 4000);
    },
    onSuccess: () => {
      // Refresh profile so the Home tab's upcomingBooking updates
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load schedule</Text>
        <Pressable onPress={() => refetch()} style={styles.btn}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {bookError && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{bookError}</Text>
        </View>
      )}
      <FlatList
        data={sections}
        keyExtractor={(s) => s.day}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionHeader}>{dayLabel(section.items[0].startsAt)}</Text>
            {section.items.map((it) => {
              const expanded = expandedId === it.id;
              return (
                <View key={it.id} style={styles.card}>
                  <Pressable
                    onPress={() => setExpandedId(expanded ? null : it.id)}
                    style={styles.cardHeader}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.time}>{timeLabel(it.startsAt)}</Text>
                      <Text style={styles.className}>{it.className ?? "Class"}</Text>
                      <Text style={styles.meta}>
                        {it.bookedCount}/{it.capacity}{" "}
                        {it.category ? `· ${it.category}` : ""}
                      </Text>
                    </View>
                    {it.isBookedByMe ? (
                      <View style={styles.bookedBadge}>
                        <Feather name="check" size={14} color="#fff" />
                        <Text style={styles.bookedBadgeText}>Booked</Text>
                      </View>
                    ) : (
                      <Feather
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={20}
                        color="#666"
                      />
                    )}
                  </Pressable>
                  {expanded && !it.isBookedByMe && (
                    <View style={styles.expandRow}>
                      {it.full ? (
                        <Text style={styles.fullText}>This class is full</Text>
                      ) : (
                        <Pressable
                          style={[styles.btn, bookMutation.isPending && { opacity: 0.6 }]}
                          disabled={bookMutation.isPending}
                          onPress={() => bookMutation.mutate(it.id)}
                        >
                          <Text style={styles.btnText}>Confirm booking</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No upcoming classes this week</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 96 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", paddingHorizontal: 16, paddingTop: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  sectionHeader: {
    color: "#999",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  card: { backgroundColor: "#1a1a1a", borderRadius: 12, marginBottom: 8, overflow: "hidden" },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  time: { color: "#999", fontSize: 12 },
  className: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 2 },
  meta: { color: "#666", fontSize: 12, marginTop: 2 },
  bookedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#16a34a",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  bookedBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  expandRow: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  fullText: { color: "#f88", fontSize: 13 },
  btn: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
  toast: {
    backgroundColor: "#7f1d1d",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  toastText: { color: "#fff", fontSize: 13 },
  error: { color: "#f88", marginBottom: 16 },
  emptyText: { color: "#666", marginTop: 32 },
});
```

Run `npx prettier --write packages/mobile-app/app/\(tabs\)/schedule.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('packages/mobile-app/app/(tabs)/schedule.tsx','utf8');const checks=['useQuery','useMutation','/api/m/schedule','/api/m/bookings','onMutate','onError','setQueryData','isBookedByMe','bookedCount','Confirm booking','queryKey: [\"profile\"]'];const missing=checks.filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'useQuery' packages/mobile-app/app/(tabs)/schedule.tsx` returns at least 1
    - `grep -c 'useMutation' packages/mobile-app/app/(tabs)/schedule.tsx` returns at least 1
    - `grep -c '/api/m/schedule' packages/mobile-app/app/(tabs)/schedule.tsx` returns at least 1
    - `grep -c '/api/m/bookings' packages/mobile-app/app/(tabs)/schedule.tsx` returns at least 1
    - `grep -c 'onMutate' packages/mobile-app/app/(tabs)/schedule.tsx` returns 1 (optimistic update)
    - `grep -c 'onError' packages/mobile-app/app/(tabs)/schedule.tsx` returns 1 (rollback)
    - `grep -c 'setQueryData' packages/mobile-app/app/(tabs)/schedule.tsx` returns at least 1 (optimistic cache update)
    - `grep -c 'invalidateQueries' packages/mobile-app/app/(tabs)/schedule.tsx` returns at least 1 (refresh profile on success)
    - `grep -c 'Confirm booking' packages/mobile-app/app/(tabs)/schedule.tsx` returns 1
    - `grep -c 'isBookedByMe' packages/mobile-app/app/(tabs)/schedule.tsx` returns at least 2 (cache mutation + render gate)
    - Manual smoke: Expo Go → Schedule tab → see classes grouped by day → tap card → expands inline → tap "Confirm booking" → card immediately shows "Booked" badge (optimistic) → Home tab shows new upcomingBooking
    - File has at least 150 lines
  </acceptance_criteria>
  <done>The Schedule tab fetches the next 7 days, renders day-grouped occurrence cards with inline expand booking, performs optimistic update on book + rollback on error, and invalidates the profile cache on success so the Home tab picks up the new booking</done>
</task>

</tasks>

<verification>
**Automated:**

```bash
# All three files exist with correct wiring
node -e "const fs=require('fs');const c=[['templates/mail/app/routes/api.m.schedule.tsx','isBookedByMe'],['templates/mail/app/routes/api.m.bookings.tsx','requireDemoMember'],['packages/mobile-app/app/(tabs)/schedule.tsx','onMutate']];for(const [f,s] of c){if(!fs.readFileSync(f,'utf8').includes(s)){console.error('FAIL',f,s);process.exit(1)}}console.log('OK')"

# TS compiles
pnpm --filter mail exec tsc --noEmit
pnpm --filter @agent-native/mobile-app exec tsc --noEmit
```

**Manual smoke test (run after D2-01 Task 5 has unblocked the shell):**
1. From the Schedule tab on Expo Go, expect a vertical list grouped by day with 7 days of classes.
2. Tap an unbooked occurrence card → expands inline.
3. Tap "Confirm booking" → card immediately shows "Booked" badge with green pill (no spinner).
4. Switch to the Home tab → wait 1s → upcomingBooking shows the just-booked class.
5. Pull-to-refresh (or kill+reopen) the Schedule tab → "Booked" badge persists (DB-backed).
6. Try booking the same class twice (e.g. force the cache mutation) → server returns `alreadyBooked: true`; no duplicate row in `bookings`.
</verification>

<success_criteria>
- [ ] /api/m/schedule returns occurrences for the next 7 days with isBookedByMe + bookedCount
- [ ] /api/m/bookings POST creates a bookings row; idempotent on (occurrence, member, 'booked')
- [ ] Mobile Schedule tab renders cards grouped by day with inline expand
- [ ] Optimistic UI: card flips to "Booked" instantly on tap (no spinner)
- [ ] Rollback toast appears on error; card returns to unbooked state
- [ ] Profile cache invalidated on success — Home tab reflects new upcomingBooking
- [ ] All endpoints gated by requireDemoMember
</success_criteria>

<output>
After completion, create `.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-03-member-schedule-booking-SUMMARY.md` documenting:
- Files created/modified
- The chosen view density (day-grouped vertical list per Claude's Discretion default)
- Demo limitations: no atomic capacity check (BKG-03 deferred), UTC day bucketing (SCH-07 deferred), no cancellation (MEMBR-04 deferred)
- Smoke test outcome
</output>
</content>
</invoke>