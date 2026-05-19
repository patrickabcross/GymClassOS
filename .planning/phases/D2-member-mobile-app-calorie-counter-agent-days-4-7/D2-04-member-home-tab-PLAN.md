---
phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
plan: 04
type: execute
wave: 2
depends_on: ["D2-01"]
files_modified:
  - packages/mobile-app/app/(tabs)/index.tsx
  - packages/mobile-app/components/KcalRing.tsx
autonomous: true
requirements: [MEMBR-03]
must_haves:
  truths:
    - "Home tab fetches /api/m/profile via TanStack Query on mount + auto-refetches on tab focus"
    - "Home tab renders: greeting with firstName, pass-balance pill, upcoming booking card (class name + time + 'Tap to view' linking to Schedule tab), today kcal ring (kcal consumed / target with progress arc), and the macro line 'P 82g  C 134g  F 38g'"
    - "Home tab shows skeleton placeholders during the initial load (no full-screen spinner that blocks the chrome)"
    - "Home tab shows the actual member's data — switching member via Profile long-press → re-picking — refetches and displays the new member's data on next Home tab visit"
    - "If passBalance is 0 the pill shows '0 credits' in red; otherwise neutral colour"
  artifacts:
    - path: "packages/mobile-app/components/KcalRing.tsx"
      provides: "Pure SVG-free circular progress ring component for the daily kcal target (uses View + borderRadius arc trick, NOT requiring react-native-svg)"
      exports: ["default"]
      min_lines: 50
    - path: "packages/mobile-app/app/(tabs)/index.tsx"
      provides: "Home tab — replaces the D2-01 placeholder with the full home dashboard reading from /api/m/profile"
      exports: ["default"]
      min_lines: 120
  key_links:
    - from: "packages/mobile-app/app/(tabs)/index.tsx"
      to: "templates/mail/app/routes/api.m.profile.tsx"
      via: "useQuery(['profile'], () => apiFetch('/api/m/profile'))"
      pattern: "useQuery.*profile"
    - from: "packages/mobile-app/app/(tabs)/index.tsx"
      to: "packages/mobile-app/components/KcalRing.tsx"
      via: "default import + render with {value, target} props"
      pattern: "import KcalRing"
---

<objective>
Replace the D2-01 Home tab placeholder with a real member dashboard: greeting, pass balance, upcoming booking, today's kcal progress ring, and macro totals — all sourced from the `/api/m/profile` endpoint built in D2-01 Task 4. Plus a self-contained `KcalRing` component that doesn't require `react-native-svg` (keeps the dep tree small for the demo).

Purpose: Demo Sprint deliverable for MEMBR-03 (member sees pass balance + upcoming bookings) and the "wow" landing screen of the member app. Closes the MEMBR-03 truth set that D2-01 set up the server side for but left the client placeholder.

Output:
- `packages/mobile-app/components/KcalRing.tsx` — pure-RN circular progress ring (View-based arc, no SVG dep)
- `packages/mobile-app/app/(tabs)/index.tsx` — Home tab rewritten as a full dashboard
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-01-mobile-shell-auth-PLAN.md

<interfaces>
From templates/mail/app/routes/api.m.profile.tsx (D2-01 Task 4 — established contract):
```typescript
// GET /api/m/profile response shape:
{
  member: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phoneE164: string | null;
    goal: "maintain"|"lose"|"gain"|"performance"|null;
  };
  passBalance: number;
  upcomingBooking: {
    bookingId: string;
    occurrenceId: string;
    startsAt: string; // ISO
    className: string | null;
  } | null;
  today: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    targetKcal: number;      // hardcoded 2100 per D-10
    targetProteinG: number;  // 130
    targetCarbsG: number;    // 250
    targetFatG: number;      // 60
  };
}
```

From packages/mobile-app/lib/api.ts:
```typescript
export async function apiFetch(path: string, init?: RequestInit): Promise<any>;
```

From .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md §"Specific Ideas":
- Today screen kcal display format: "1,142 / 2,100 kcal" with a progress ring above
- Macro line format: "P 82g  C 134g  F 38g"
</interfaces>

</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create KcalRing component — circular progress ring without react-native-svg</name>
  <files>
    - packages/mobile-app/components/KcalRing.tsx
  </files>
  <read_first>
    - packages/mobile-app/components (existing components for the styling vocabulary — AppCard, AppForm)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md §"Specific Ideas" (display format)
  </read_first>
  <action>
Create new file `packages/mobile-app/components/KcalRing.tsx`. The ring is rendered using two overlapping half-circles with `transform: [{ rotate }]` to fake the progress arc — this avoids pulling in `react-native-svg` for the demo (the dep is heavy and Expo Go has known issues with SVG hit-testing in some scenarios). The trade is a slightly less smooth arc but is well-known-acceptable for demo grade.

Full content:

```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {
  value: number;
  target: number;
  /** Diameter of the ring in px. Default 160. */
  size?: number;
  /** Width of the ring stroke in px. Default 14. */
  stroke?: number;
};

/**
 * Circular progress ring without react-native-svg.
 *
 * Implementation: two half-disc clipping rectangles are rotated to expose
 * a coloured progress arc on top of a grey background ring. Resolution is
 * 1° (good enough for demo grade).
 */
export default function KcalRing({ value, target, size = 160, stroke = 14 }: Props) {
  const pct = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  const deg = pct * 360;
  const inner = size - 2 * stroke;

  // Rotation strategy:
  // - Left half progress (0..180deg): rotate progress-left from -180 to 0
  // - Right half progress (180..360deg): rotate progress-right from 0 to 180
  const rightDeg = Math.min(180, deg);
  const leftDeg = Math.max(0, deg - 180);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Background ring */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: "#2a2a2a",
          },
        ]}
      />
      {/* Right half progress */}
      <View style={[styles.half, { width: size, height: size }]} pointerEvents="none">
        <View
          style={{
            position: "absolute",
            width: size / 2,
            height: size,
            left: size / 2,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              width: size,
              height: size,
              left: -size / 2,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: "#3b82f6",
              transform: [{ rotate: `${rightDeg - 180}deg` }],
            }}
          />
        </View>
      </View>
      {/* Left half progress */}
      {leftDeg > 0 && (
        <View style={[styles.half, { width: size, height: size }]} pointerEvents="none">
          <View
            style={{
              position: "absolute",
              width: size / 2,
              height: size,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                position: "absolute",
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: stroke,
                borderColor: "#3b82f6",
                transform: [{ rotate: `${leftDeg}deg` }],
              }}
            />
          </View>
        </View>
      )}
      {/* Centre text */}
      <View
        style={{
          position: "absolute",
          width: inner,
          height: inner,
          left: stroke,
          top: stroke,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={styles.bigNum}>{value.toLocaleString("en-GB")}</Text>
        <Text style={styles.small}>/ {target.toLocaleString("en-GB")} kcal</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute" },
  half: { position: "absolute", overflow: "hidden" },
  bigNum: { color: "#fff", fontSize: 32, fontWeight: "700" },
  small: { color: "#999", fontSize: 12, marginTop: 4 },
});
```

Run `npx prettier --write packages/mobile-app/components/KcalRing.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('packages/mobile-app/components/KcalRing.tsx','utf8');const checks=['export default function KcalRing','value: number','target: number','toLocaleString','transform:'];const missing=checks.filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/mobile-app/components/KcalRing.tsx` exists
    - `grep -c 'export default function KcalRing' packages/mobile-app/components/KcalRing.tsx` returns 1
    - `grep -c 'value: number' packages/mobile-app/components/KcalRing.tsx` returns at least 1
    - `grep -c 'target: number' packages/mobile-app/components/KcalRing.tsx` returns at least 1
    - File does NOT import from `react-native-svg` (`grep -c "react-native-svg" packages/mobile-app/components/KcalRing.tsx` returns 0)
    - `grep -c 'toLocaleString' packages/mobile-app/components/KcalRing.tsx` returns at least 1 (number formatting)
    - File has at least 50 lines
  </acceptance_criteria>
  <done>Reusable circular progress ring component exists with no SVG dep, takes {value, target, size?, stroke?}, renders the value in the centre, scales 0-100% smoothly</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Rewrite (tabs)/index.tsx as the Home dashboard</name>
  <files>
    - packages/mobile-app/app/(tabs)/index.tsx
  </files>
  <read_first>
    - packages/mobile-app/app/(tabs)/index.tsx (D2-01 placeholder — we overwrite it)
    - packages/mobile-app/components/KcalRing.tsx (the component just created in Task 1)
    - packages/mobile-app/lib/api.ts (apiFetch helper)
    - templates/mail/app/routes/api.m.profile.tsx (D2-01 Task 4 — the response shape contract)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md §"Specific Ideas" (kcal format + macro format)
  </read_first>
  <action>
REPLACE the placeholder `packages/mobile-app/app/(tabs)/index.tsx` (the 10-line D2-01 stub) with the full Home dashboard.

Full content:

```tsx
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";
import KcalRing from "../../components/KcalRing";

type ProfileResponse = {
  member: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phoneE164: string | null;
    goal: string | null;
  };
  passBalance: number;
  upcomingBooking: {
    bookingId: string;
    occurrenceId: string;
    startsAt: string;
    className: string | null;
  } | null;
  today: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    targetKcal: number;
    targetProteinG: number;
    targetCarbsG: number;
    targetFatG: number;
  };
};

function bookingTimeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 86400000);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today at ${time}`;
  if (isTomorrow) return `Tomorrow at ${time}`;
  return d.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" }) + ` at ${time}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useQuery<ProfileResponse>({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });

  // Refetch on tab focus so a booking made on Schedule reflects here
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (isLoading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load home</Text>
        <Pressable onPress={() => refetch()} style={styles.btn}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { member, passBalance, upcomingBooking, today } = data;
  const lowBalance = passBalance <= 0;
  const fmt = (n: number) => Math.round(n);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingBottom: 96 }}>
      <Text style={styles.greeting}>
        Hi {member.firstName}
      </Text>
      <View style={[styles.pill, lowBalance && styles.pillRed]}>
        <Feather name="award" size={14} color="#fff" />
        <Text style={styles.pillText}>
          {passBalance} {passBalance === 1 ? "credit" : "credits"}
        </Text>
      </View>

      {/* Upcoming booking */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Next class</Text>
        {upcomingBooking ? (
          <Pressable onPress={() => router.push("/(tabs)/schedule")} style={styles.bookingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bookingTitle}>{upcomingBooking.className ?? "Class"}</Text>
              <Text style={styles.bookingTime}>{bookingTimeLabel(upcomingBooking.startsAt)}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#666" />
          </Pressable>
        ) : (
          <Pressable onPress={() => router.push("/(tabs)/schedule")} style={styles.bookingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bookingTitle}>No upcoming class</Text>
              <Text style={styles.bookingTime}>Tap to browse the schedule</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#666" />
          </Pressable>
        )}
      </View>

      {/* Today's nutrition */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Today</Text>
        <View style={{ alignItems: "center", marginVertical: 16 }}>
          <KcalRing value={fmt(today.kcal)} target={today.targetKcal} />
        </View>
        <Text style={styles.macroLine}>
          P {fmt(today.proteinG)}g  C {fmt(today.carbsG)}g  F {fmt(today.fatG)}g
        </Text>
        <Text style={styles.macroTargets}>
          Target P {today.targetProteinG}g · C {today.targetCarbsG}g · F {today.targetFatG}g
        </Text>
        <Pressable onPress={() => router.push("/(tabs)/food")} style={[styles.btn, { marginTop: 16 }]}>
          <Text style={styles.btnText}>+ Log a meal</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#111", padding: 24, gap: 16 },
  greeting: { color: "#fff", fontSize: 32, fontWeight: "700" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "#1f2937",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 8,
  },
  pillRed: { backgroundColor: "#7f1d1d" },
  pillText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  card: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16, marginTop: 16 },
  sectionLabel: {
    color: "#999",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bookingRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  bookingTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  bookingTime: { color: "#999", fontSize: 14, marginTop: 4 },
  macroLine: { color: "#fff", fontSize: 16, textAlign: "center", marginTop: 8, fontVariant: ["tabular-nums"] },
  macroTargets: { color: "#666", fontSize: 12, textAlign: "center", marginTop: 4 },
  btn: { backgroundColor: "#3b82f6", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "600" },
  error: { color: "#f88" },
});
```

Run `npx prettier --write packages/mobile-app/app/\(tabs\)/index.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('packages/mobile-app/app/(tabs)/index.tsx','utf8');const checks=['useQuery','/api/m/profile','KcalRing','passBalance','upcomingBooking','today.kcal','useFocusEffect','router.push(\"/(tabs)/schedule\")','router.push(\"/(tabs)/food\")','Hi '];const missing=checks.filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'useQuery' packages/mobile-app/app/(tabs)/index.tsx` returns 1
    - `grep -c '/api/m/profile' packages/mobile-app/app/(tabs)/index.tsx` returns 1
    - `grep -c 'KcalRing' packages/mobile-app/app/(tabs)/index.tsx` returns at least 2 (import + render)
    - `grep -c 'passBalance' packages/mobile-app/app/(tabs)/index.tsx` returns at least 1
    - `grep -c 'upcomingBooking' packages/mobile-app/app/(tabs)/index.tsx` returns at least 2 (destructure + use)
    - `grep -c 'useFocusEffect' packages/mobile-app/app/(tabs)/index.tsx` returns at least 1 (refetch on tab focus)
    - `grep -c 'router.push' packages/mobile-app/app/(tabs)/index.tsx` returns at least 2 (Schedule + Food navigation)
    - `grep -c 'Hi {member.firstName}' packages/mobile-app/app/(tabs)/index.tsx` returns 1 (the greeting)
    - File has at least 120 lines
    - Manual smoke: Expo Go → Home tab → see greeting "Hi Sarah", pill "3 credits" (or however many), Next class card linking to Schedule, Today card with kcal ring + macros, "+ Log a meal" button linking to Food tab
  </acceptance_criteria>
  <done>Home tab is a fully wired dashboard reading from /api/m/profile; refetches on tab focus so the upcomingBooking updates after Schedule bookings; navigation buttons route to Schedule + Food tabs</done>
</task>

</tasks>

<verification>
**Automated:**

```bash
node -e "const fs=require('fs');const c=[['packages/mobile-app/app/(tabs)/index.tsx','KcalRing'],['packages/mobile-app/app/(tabs)/index.tsx','useFocusEffect'],['packages/mobile-app/components/KcalRing.tsx','target: number']];for(const[f,s] of c){if(!fs.readFileSync(f,'utf8').includes(s)){console.error('FAIL',f,s);process.exit(1)}}console.log('OK')"

pnpm --filter @agent-native/mobile-app exec tsc --noEmit
```

**Manual smoke test (after D2-01 + D2-03 + (optionally) D2-05):**
1. Home tab loads in <2s, shows greeting "Hi <firstName>"
2. Pass balance pill is visible and uses red colouring if balance ≤ 0
3. "Next class" card shows the earliest future booking (or "No upcoming class" + CTA)
4. Today card: kcal ring centred shows "0 / 2,100 kcal" before any food logged (or the actual sum), macro line "P 0g  C 0g  F 0g"
5. Tap "+ Log a meal" → navigates to Food tab
6. Tap the "Next class" card → navigates to Schedule tab
7. Book a class on Schedule, return to Home → upcomingBooking visibly updates (useFocusEffect refetch)
</verification>

<success_criteria>
- [ ] KcalRing renders with no SVG dep
- [ ] Home tab fetches /api/m/profile via TanStack Query
- [ ] Greeting, pass-balance pill, next-class card, today ring + macros all rendered
- [ ] useFocusEffect refetches on tab focus
- [ ] Navigation to Schedule + Food tabs works via router.push
- [ ] Long-press switch (D2-01 Profile tab) → new member's data appears on Home next visit
</success_criteria>

<output>
After completion, create `.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-04-member-home-tab-SUMMARY.md` documenting:
- Files created/modified
- The View-based ring trick (no SVG dep)
- Demo limitations: hardcoded targets per D-10 (MMF-06 deferred), no recents/favourites link (CAL-07 deferred)
- Smoke test outcome
</output>
</content>
</invoke>