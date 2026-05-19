---
phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/mobile-app/package.json
  - packages/mobile-app/babel.config.js
  - packages/mobile-app/app/_layout.tsx
  - packages/mobile-app/app/(tabs)/_layout.tsx
  - packages/mobile-app/app/(tabs)/index.tsx
  - packages/mobile-app/app/(tabs)/schedule.tsx
  - packages/mobile-app/app/(tabs)/food.tsx
  - packages/mobile-app/app/(tabs)/profile.tsx
  - packages/mobile-app/app/pick-member.tsx
  - packages/mobile-app/lib/api.ts
  - packages/mobile-app/lib/current-member.ts
  - packages/mobile-app/lib/query-client.ts
  - packages/mobile-app/lib/bottom-sheet-impl.ts
  - templates/mail/server/lib/demo-member.ts
  - templates/mail/server/plugins/auth.ts
  - templates/mail/app/routes/api.m.members.list.tsx
  - templates/mail/app/routes/api.m.profile.tsx
  - templates/mail/.env.local.example
autonomous: false
requirements: [MEMAUTH-01, MEMBR-03]
user_setup:
  - service: anthropic
    why: "AGENT-01/02/03 in plan D2-06 require an Anthropic API key. Surface it here so it lands in .env.local before agent work begins."
    env_vars:
      - name: ANTHROPIC_API_KEY
        source: "https://console.anthropic.com/settings/keys → Create Key (no spend cap for demo, ~$0.50/100 turns)"
      - name: DEMO_MODE
        source: "Set to 'true' literally — gates the X-Demo-Member-Id header trust"
      - name: EXPO_PUBLIC_API_BASE
        source: "Set to the Expo tunnel URL (printed by `npx expo start --tunnel`) or http://<laptop-LAN-ip>:8081 — phone must reach this URL"
    dashboard_config:
      - task: "Install Expo Go on the demo phone"
        location: "iOS App Store / Google Play — search 'Expo Go'"
must_haves:
  truths:
    - "Running `npx expo start --tunnel` from packages/mobile-app prints a QR code that Expo Go can open"
    - "On first launch, the app shows a member-picker screen listing 5 seeded members (Sarah Patel, James Wong, Maya Singh, Tom Reilly, Aisha Khan) with the caption 'Demo only — production uses WhatsApp magic-link'"
    - "Tapping a member persists the id to AsyncStorage and routes to the 4-tab shell (Home / Schedule / Food / Profile)"
    - "Subsequent app opens skip the picker and go straight to Home; long-press on the Profile tab surfaces a 'Switch member' affordance that clears AsyncStorage and re-routes to pick-member"
    - "Every API call from the mobile app sends X-Demo-Member-Id header read from AsyncStorage"
    - "The server route helper requireDemoMember refuses requests with 401 unless DEMO_MODE=true && NODE_ENV !== 'production' AND a valid X-Demo-Member-Id header is present"
    - "GET /api/m/members/list returns the 5 seeded members for the picker"
    - "GET /api/m/profile returns {member, passBalance, upcomingBooking, todayKcal} for the currently-selected member (derived via the D1-02 two-aggregation pass-balance pattern)"
    - "A decision has been recorded (in plan summary) about @gorhom/bottom-sheet vs RN Modal — used by plan D2-06 for the agent sheet"
  artifacts:
    - path: "packages/mobile-app/lib/api.ts"
      provides: "apiFetch wrapper that injects X-Demo-Member-Id from AsyncStorage on every request"
      exports: ["apiFetch"]
      min_lines: 20
    - path: "packages/mobile-app/lib/current-member.ts"
      provides: "AsyncStorage read/write helpers for the demo member id"
      exports: ["getCurrentMemberId", "setCurrentMemberId", "clearCurrentMemberId"]
      min_lines: 15
    - path: "packages/mobile-app/lib/query-client.ts"
      provides: "TanStack QueryClient singleton + provider component"
      exports: ["queryClient", "QueryProvider"]
      min_lines: 15
    - path: "packages/mobile-app/lib/bottom-sheet-impl.ts"
      provides: "Single chosen bottom-sheet implementation — either re-exports @gorhom/bottom-sheet wrappers OR a RN Modal-based fallback (decided by spike). Plan D2-06 imports from here."
      exports: ["AgentSheetContainer"]
      min_lines: 30
    - path: "packages/mobile-app/app/pick-member.tsx"
      provides: "Member-picker first-launch screen"
      exports: ["default"]
      min_lines: 60
    - path: "packages/mobile-app/app/_layout.tsx"
      provides: "Root Stack wrapped in QueryProvider + auth-gate that redirects to /pick-member if no member id"
      exports: ["default"]
      min_lines: 30
    - path: "packages/mobile-app/app/(tabs)/_layout.tsx"
      provides: "4-tab GymOS shell (Home / Schedule / Food / Profile) — replaces the 16-template upstream shell"
      exports: ["default"]
      min_lines: 50
    - path: "packages/mobile-app/app/(tabs)/index.tsx"
      provides: "Home tab placeholder (filled out fully by D2-04)"
      exports: ["default"]
      min_lines: 10
    - path: "packages/mobile-app/app/(tabs)/schedule.tsx"
      provides: "Schedule tab placeholder (filled by D2-03)"
      exports: ["default"]
      min_lines: 10
    - path: "packages/mobile-app/app/(tabs)/food.tsx"
      provides: "Food tab placeholder (filled by D2-05)"
      exports: ["default"]
      min_lines: 10
    - path: "packages/mobile-app/app/(tabs)/profile.tsx"
      provides: "Profile tab — name + long-press Switch member affordance"
      exports: ["default"]
      min_lines: 40
    - path: "templates/mail/server/lib/demo-member.ts"
      provides: "requireDemoMember helper — server-side gate enforcing DEMO_MODE + valid X-Demo-Member-Id"
      exports: ["requireDemoMember"]
      min_lines: 20
    - path: "templates/mail/app/routes/api.m.members.list.tsx"
      provides: "GET endpoint returning the 5 seeded members for the picker (NOT gated — picker has no member yet)"
      exports: ["loader"]
      min_lines: 15
    - path: "templates/mail/app/routes/api.m.profile.tsx"
      provides: "GET endpoint returning member + passBalance + upcomingBooking + todayKcal for the X-Demo-Member-Id member"
      exports: ["loader"]
      min_lines: 50
    - path: "templates/mail/server/plugins/auth.ts"
      provides: "publicPaths extended with /api/m/* and /pick-member (mobile app routes are demo-public)"
      contains: "/api/m"
  key_links:
    - from: "packages/mobile-app/app/_layout.tsx"
      to: "packages/mobile-app/lib/current-member.ts"
      via: "AsyncStorage check at boot; redirect to /pick-member if null"
      pattern: "getCurrentMemberId"
    - from: "packages/mobile-app/lib/api.ts"
      to: "@react-native-async-storage/async-storage"
      via: "header injection on every fetch"
      pattern: "X-Demo-Member-Id"
    - from: "templates/mail/app/routes/api.m.profile.tsx"
      to: "templates/mail/server/lib/demo-member.ts"
      via: "loader calls requireDemoMember(request) first"
      pattern: "requireDemoMember"
    - from: "templates/mail/app/routes/api.m.profile.tsx"
      to: "schema.passes + schema.passDebits"
      via: "two separate aggregations (D1-02 lesson — never chain leftJoin through passDebits)"
      pattern: "passDebits.*leftJoin.*passes"
    - from: "templates/mail/server/plugins/auth.ts"
      to: "publicPaths"
      via: "match on /api/m/ + /pick-member prefixes"
      pattern: "/api/m"
---

<objective>
Replace the multi-template `packages/mobile-app` shell with a GymOS-specific 4-tab Expo app (Home / Schedule / Food / Profile), gated by a demo member-picker, wired to the staff-web's Neon DB via X-Demo-Member-Id-authenticated API routes. Also runs the `@gorhom/bottom-sheet` × Expo Go SDK 55 compatibility spike (RESEARCH.md Pitfall #4) and commits the winning implementation to a single shared module so D2-06 can import it without ambiguity.

Purpose: Foundation for the entire D2 phase. Plans D2-03 (schedule), D2-04 (home/profile content), D2-05 (food), and D2-06 (agent) all build on the shell, the API wrapper, the server gate, and the bottom-sheet decision made here. Implements MEMAUTH-01 (stubbed per D-05/D-06) and the server-side scaffolding for MEMBR-03 (the home screen polish lands in D2-04).

Output:
- `packages/mobile-app` stripped of all 16 upstream-template tabs; new 4-tab GymOS shell with placeholder screens
- New `pick-member.tsx` first-launch screen + AsyncStorage persistence (D-05, D-06, D-07)
- TanStack Query provider + apiFetch wrapper injecting `X-Demo-Member-Id`
- Server helper `requireDemoMember` and 2 first server endpoints (`/api/m/members/list`, `/api/m/profile`)
- `auth.ts` publicPaths extended with `/api/m/*` + `/pick-member`
- A locked bottom-sheet implementation in `lib/bottom-sheet-impl.ts` (either `@gorhom/bottom-sheet` or RN Modal fallback) — decided by the Task 2 spike
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
@packages/mobile-app/package.json
@packages/mobile-app/app/_layout.tsx
@packages/mobile-app/app/(tabs)/_layout.tsx
@templates/mail/server/db/schema.ts
@templates/mail/server/plugins/auth.ts
@templates/mail/app/routes/gymos.tsx

<interfaces>
<!-- Key types and exports the executor needs. Extracted from codebase. -->

From templates/mail/server/db/schema.ts (relevant tables):
```typescript
// gym_members
export const gymMembers: { id, userId, firstName, lastName, email, phoneE164, sex, heightCm, weightKg, goal, activityLevel, ... }

// passes
export const passes: { id, memberId, granted: number, source, productName, expiresAt, createdAt }

// pass_debits — append-only ledger
export const passDebits: { id, passId, bookingId, amount: number, reason, createdAt }

// bookings
export const bookings: { id, occurrenceId, memberId, status: "booked"|"waitlist"|..., bookedAt, ... }

// class_occurrences
export const classOccurrences: { id, definitionId, startsAt: string, endsAt: string, capacity, ... }

// class_definitions
export const classDefinitions: { id, name, durationMin, defaultCapacity, category, ... }

// food_entries
export const foodEntries: { id, memberId, foodItemId, loggedAt, mealType, quantityG, kcal: number, proteinG, carbsG, fatG, source, createdAt }
```

From templates/mail/server/db/index.ts:
```typescript
export const getDb: () => DrizzleDb;
export { schema };
```

From templates/mail/server/plugins/auth.ts (current publicPaths — preserve these, add new ones):
```typescript
publicPaths: [
  "/api/gmail/push",
  "/api/gmail/watch/renew",
  "/gymos",
  "/gymos/schedule",
  "/gymos/members",
  "/gymos/payments",
]
```

Pass-balance pattern (from D1-02 — DO NOT chain leftJoin through passDebits; do two separate aggregations):
```typescript
// Granted total (single member case)
const grantedTotal = await db
  .select({ sum: sql<number>`COALESCE(SUM(${schema.passes.granted}), 0)` })
  .from(schema.passes)
  .where(eq(schema.passes.memberId, memberId))
  .then(r => Number(r[0]?.sum ?? 0));

// Debits total — joined through passes to scope by member
const debitsTotal = await db
  .select({ sum: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)` })
  .from(schema.passDebits)
  .leftJoin(schema.passes, eq(schema.passDebits.passId, schema.passes.id))
  .where(eq(schema.passes.memberId, memberId))
  .then(r => Number(r[0]?.sum ?? 0));

const passBalance = grantedTotal - debitsTotal;
```

Expo Router 55 file convention (matches RR v7):
- `app/_layout.tsx` is the root Stack
- `app/(tabs)/_layout.tsx` is the Tabs group layout (parens = route group, doesn't appear in URL)
- `app/(tabs)/index.tsx` is the default/first tab
- `app/pick-member.tsx` is a sibling screen outside the tabs group
- `useRouter().replace("/(tabs)")` to leave the picker → tabs
- `useRouter().replace("/pick-member")` to log out
</interfaces>

</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Install mobile + server deps, scaffold babel config for Reanimated 4 worklets</name>
  <files>
    - packages/mobile-app/package.json
    - packages/mobile-app/babel.config.js
    - templates/mail/package.json
  </files>
  <read_first>
    - packages/mobile-app/package.json (current deps — confirm Expo 55, RN 0.83.9, AsyncStorage, @expo/vector-icons already present)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Standard Stack" → "Installation" (lines ~160-185 — the pnpm + expo install commands)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Common Pitfalls" → Pitfall #4 (the Reanimated 4 worklets babel plugin requirement)
  </read_first>
  <action>
Run these commands in order from the repo root:

```bash
# 1. Mobile-app deps (TanStack Query for cache, react-native-sse for D2-06 agent stream, @gorhom/bottom-sheet for the spike)
pnpm --filter @agent-native/mobile-app add @tanstack/react-query@^5.100.11 react-native-sse@^1.2.1 @gorhom/bottom-sheet@^5.2.14

# 2. Expo-managed installs (correct peer versions for SDK 55)
cd packages/mobile-app
npx expo install expo-camera react-native-gesture-handler react-native-reanimated
cd ../..

# 3. Server-side Anthropic SDK (used by D2-06; install now so D2-02 / D2-03 don't conflict on the lockfile)
pnpm --filter mail add @anthropic-ai/sdk@^0.97.0
```

Then create `packages/mobile-app/babel.config.js` (the file does NOT currently exist — verify with `ls packages/mobile-app/babel.config.js` before writing) with this exact content (Reanimated 4 split worklets into a separate plugin, mandatory for `@gorhom/bottom-sheet`):

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"], // MUST be last
  };
};
```

After the installs complete, verify package.json contains all expected entries:

```bash
node -e "const p=require('./packages/mobile-app/package.json'); const need=['@tanstack/react-query','react-native-sse','@gorhom/bottom-sheet','expo-camera','react-native-gesture-handler','react-native-reanimated']; const have=Object.keys(p.dependencies); const missing=need.filter(n=>!have.includes(n)); if(missing.length){console.error('MISSING',missing);process.exit(1)}"
node -e "const p=require('./templates/mail/package.json'); if(!Object.keys(p.dependencies).includes('@anthropic-ai/sdk')){console.error('MISSING @anthropic-ai/sdk');process.exit(1)}"
```

Run `npx prettier --write packages/mobile-app/babel.config.js`. Do NOT commit `node_modules/`. Do NOT modify the `scripts` section of either package.json.
  </action>
  <verify>
    <automated>node -e "const p=require('./packages/mobile-app/package.json'); const need=['@tanstack/react-query','react-native-sse','@gorhom/bottom-sheet','expo-camera','react-native-gesture-handler','react-native-reanimated']; const have=Object.keys(p.dependencies); const missing=need.filter(n=>!have.includes(n)); if(missing.length){console.error('MISSING',missing);process.exit(1)} const mail=require('./templates/mail/package.json'); if(!Object.keys(mail.dependencies).includes('@anthropic-ai/sdk')){console.error('MISSING @anthropic-ai/sdk');process.exit(1)} const fs=require('fs'); const b=fs.readFileSync('packages/mobile-app/babel.config.js','utf8'); if(!b.includes('react-native-worklets/plugin')){console.error('babel.config missing worklets plugin');process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"@tanstack/react-query"' packages/mobile-app/package.json` returns 1
    - `grep -c '"react-native-sse"' packages/mobile-app/package.json` returns 1
    - `grep -c '"@gorhom/bottom-sheet"' packages/mobile-app/package.json` returns 1
    - `grep -c '"expo-camera"' packages/mobile-app/package.json` returns 1
    - `grep -c '"react-native-gesture-handler"' packages/mobile-app/package.json` returns 1
    - `grep -c '"react-native-reanimated"' packages/mobile-app/package.json` returns 1
    - `grep -c '"@anthropic-ai/sdk"' templates/mail/package.json` returns 1
    - File `packages/mobile-app/babel.config.js` exists
    - `grep -c 'react-native-worklets/plugin' packages/mobile-app/babel.config.js` returns 1
    - `grep -c 'babel-preset-expo' packages/mobile-app/babel.config.js` returns 1
    - `pnpm-lock.yaml` includes the new packages (lockfile updated — `grep -c '@gorhom/bottom-sheet' pnpm-lock.yaml` returns at least 1)
  </acceptance_criteria>
  <done>All required deps installed in the correct workspace, babel.config.js created with the Reanimated 4 worklets plugin, lockfile updated, no scripts modified</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: SPIKE — verify @gorhom/bottom-sheet works in Expo Go SDK 55; pick bottom-sheet implementation</name>
  <files>
    - packages/mobile-app/lib/bottom-sheet-impl.ts
  </files>
  <read_first>
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Common Pitfalls" → Pitfall #4 in full (the decision tree)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Open Questions" → Question 1
  </read_first>
  <what-built>
After Task 1, the executor must run a 30-minute timeboxed spike to determine which bottom-sheet implementation D2-06 will use. The spike:

1. Temporarily inserts a `<BottomSheet>` from `@gorhom/bottom-sheet` (wrapped in `GestureHandlerRootView` + `BottomSheetModalProvider` at root) into `packages/mobile-app/app/_layout.tsx` with a trivial open-on-mount snap to ['50%'].
2. Runs `cd packages/mobile-app && npx expo start --tunnel` and opens the app in Expo Go on a phone (or iOS Simulator if no phone available).
3. Observes whether the sheet opens, animates, and dismisses cleanly with no red-screen crash and no "Tried to synchronously call a non-worklet function" worklet errors in Metro logs.

Then the executor writes `packages/mobile-app/lib/bottom-sheet-impl.ts` with ONE of two implementations:

**Option A — `@gorhom/bottom-sheet` works (PREFERRED):**

```ts
// packages/mobile-app/lib/bottom-sheet-impl.ts
// Spike result: @gorhom/bottom-sheet 5.2.14 works in Expo Go SDK 55 with Reanimated 4.x.
import React from "react";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export function GestureRoot({ children }: { children: React.ReactNode }) {
  return <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>;
}

export type AgentSheetContainerProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function AgentSheetContainer({ open, onClose, children }: AgentSheetContainerProps) {
  const ref = React.useRef<BottomSheet>(null);
  React.useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);
  return (
    <BottomSheet
      ref={ref}
      index={open ? 0 : -1}
      snapPoints={["66%"]}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: "#1a1a1a" }}
      handleIndicatorStyle={{ backgroundColor: "#333" }}
    >
      <BottomSheetView style={{ flex: 1 }}>{children}</BottomSheetView>
    </BottomSheet>
  );
}

export const BOTTOM_SHEET_IMPL: "gorhom" | "rn-modal" = "gorhom";
```

**Option B — `@gorhom/bottom-sheet` crashes / errors (FALLBACK):**

```ts
// packages/mobile-app/lib/bottom-sheet-impl.ts
// Spike result: @gorhom/bottom-sheet 5.2.14 crashed in Expo Go SDK 55 (worklet error per Pitfall #4).
// Using RN Modal with presentationStyle="pageSheet" — demo-acceptable; lose swipe-to-dismiss gesture but keep dimmed scrim + slide animation + tap-outside-to-close.
import React from "react";
import { Modal, Pressable, View, StyleSheet } from "react-native";

export function GestureRoot({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export type AgentSheetContainerProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function AgentSheetContainer({ open, onClose, children }: AgentSheetContainerProps) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#1a1a1a", height: "66%", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: "#333", marginBottom: 12 },
});

export const BOTTOM_SHEET_IMPL: "gorhom" | "rn-modal" = "rn-modal";
```

After picking one, REMOVE the temporary spike code from `_layout.tsx` (Task 3 will write the real `_layout.tsx`). Run `npx prettier --write packages/mobile-app/lib/bottom-sheet-impl.ts`.
  </what-built>
  <action>SEE <what-built> ABOVE. The executor: (1) runs the @gorhom/bottom-sheet spike for ~30 min in Expo Go SDK 55, (2) writes packages/mobile-app/lib/bottom-sheet-impl.ts with Option A or Option B per the spike outcome, (3) removes any temporary spike code from _layout.tsx, (4) runs prettier on the new file. After implementation, this checkpoint pauses for human confirmation of the choice.</action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('packages/mobile-app/lib/bottom-sheet-impl.ts','utf8');const ok=s.includes('AgentSheetContainer')&&s.includes('BOTTOM_SHEET_IMPL')&&(s.includes('\"gorhom\"')||s.includes('\"rn-modal\"'));process.exit(ok?0:1)"</automated>
  </verify>
  <how-to-verify>
1. Confirm `packages/mobile-app/lib/bottom-sheet-impl.ts` exists.
2. Confirm `BOTTOM_SHEET_IMPL` exports either `"gorhom"` or `"rn-modal"`.
3. State in the summary which implementation was picked and why (paste a 2-line log of the spike outcome — sheet opened cleanly / crashed with worklet error / etc.).
4. If you went with fallback, note it does NOT break any acceptance criterion of D2-06 — both options expose the same `<AgentSheetContainer>` shape.

The user should confirm the choice with one of:
- `gorhom` — proceed with `@gorhom/bottom-sheet`
- `rn-modal` — proceed with RN Modal fallback
- `re-spike` — try a different combo (e.g. roll Reanimated back to 3.x)
  </how-to-verify>
  <resume-signal>Type `gorhom`, `rn-modal`, or `re-spike <reason>`</resume-signal>
  <acceptance_criteria>
    - File `packages/mobile-app/lib/bottom-sheet-impl.ts` exists
    - `grep -c 'export.*AgentSheetContainer' packages/mobile-app/lib/bottom-sheet-impl.ts` returns 1
    - `grep -c 'export.*BOTTOM_SHEET_IMPL' packages/mobile-app/lib/bottom-sheet-impl.ts` returns 1
    - `grep -cE 'BOTTOM_SHEET_IMPL.*"(gorhom|rn-modal)"' packages/mobile-app/lib/bottom-sheet-impl.ts` returns 1
    - File compiles cleanly under TS (verified by `pnpm --filter @agent-native/mobile-app exec tsc --noEmit`)
    - No temporary spike code left in `packages/mobile-app/app/_layout.tsx`
  </acceptance_criteria>
  <done>One bottom-sheet implementation chosen, locked into bottom-sheet-impl.ts, and D2-06 has a single import target that doesn't require interpretation</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Strip upstream tabs, write new GymOS 4-tab shell + auth-gated root layout + 4 placeholder screens + pick-member screen</name>
  <files>
    - packages/mobile-app/app/_layout.tsx
    - packages/mobile-app/app/(tabs)/_layout.tsx
    - packages/mobile-app/app/(tabs)/index.tsx
    - packages/mobile-app/app/(tabs)/schedule.tsx
    - packages/mobile-app/app/(tabs)/food.tsx
    - packages/mobile-app/app/(tabs)/profile.tsx
    - packages/mobile-app/app/pick-member.tsx
    - packages/mobile-app/lib/api.ts
    - packages/mobile-app/lib/current-member.ts
    - packages/mobile-app/lib/query-client.ts
  </files>
  <read_first>
    - packages/mobile-app/app/_layout.tsx (CURRENT — preserve dark theme + StatusBar + Stack wrapper; add QueryProvider + auth-gate + GestureRoot)
    - packages/mobile-app/app/(tabs)/_layout.tsx (CURRENT — for the Tabs/Tabs.Screen API shape; we replace contents but keep the structure)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Pattern 2: Mobile fetch wrapper" (lines ~285-315 — the apiFetch implementation)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md §"Specific Ideas" (member-picker copy, FAB icon hint — not used in this plan but informs picker copy)
    - packages/mobile-app/lib/bottom-sheet-impl.ts (Task 2 output — import GestureRoot at root layout)
  </read_first>
  <action>
**Step A — DELETE these files outright** (per D-02; do not stub):

```bash
# From repo root
rm packages/mobile-app/app/\(tabs\)/analytics.tsx
rm packages/mobile-app/app/\(tabs\)/brain.tsx
rm packages/mobile-app/app/\(tabs\)/calendar.tsx
rm packages/mobile-app/app/\(tabs\)/clips.tsx
rm packages/mobile-app/app/\(tabs\)/content.tsx
rm packages/mobile-app/app/\(tabs\)/design.tsx
rm packages/mobile-app/app/\(tabs\)/dispatch.tsx
rm packages/mobile-app/app/\(tabs\)/forms.tsx
rm packages/mobile-app/app/\(tabs\)/more.tsx
rm packages/mobile-app/app/\(tabs\)/sessions.tsx
rm packages/mobile-app/app/\(tabs\)/settings.tsx
rm packages/mobile-app/app/\(tabs\)/slides.tsx
rm packages/mobile-app/app/\(tabs\)/starter.tsx
rm packages/mobile-app/app/\(tabs\)/videos.tsx
# Plus the now-unused lib helpers (D-02)
rm packages/mobile-app/lib/get-app-url.ts
rm packages/mobile-app/lib/use-apps.ts
rm packages/mobile-app/lib/app-store.ts
rm packages/mobile-app/lib/remote-sessions-api.ts
rm packages/mobile-app/lib/use-remote-push-registration.ts
# `app/app/[id].tsx` and `app/oauth-complete.tsx` are also stale multi-app shell — delete:
rm packages/mobile-app/app/app/\[id\].tsx
rmdir packages/mobile-app/app/app
rm packages/mobile-app/app/oauth-complete.tsx
```

On Windows PowerShell, use `Remove-Item path` (without backslash-escaping the parens — quote the path with parens instead). The Bash tool may be available — use whichever your shell supports. If a file doesn't exist, ignore the error.

The existing `packages/mobile-app/app/(tabs)/index.tsx` is also being overwritten — no need to delete it first, Task action below overwrites.

**Step B — CREATE `packages/mobile-app/lib/current-member.ts`:**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "demoMemberId";

export async function getCurrentMemberId(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function setCurrentMemberId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEY, id);
}

export async function clearCurrentMemberId(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
```

**Step C — CREATE `packages/mobile-app/lib/api.ts`:**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8081";

export async function apiFetch(path: string, init?: RequestInit) {
  const memberId = await AsyncStorage.getItem("demoMemberId");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(memberId ? { "X-Demo-Member-Id": memberId } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const API_BASE_URL = API_BASE;
```

Note: `apiFetch` does NOT throw if memberId is missing — the picker endpoint needs to work BEFORE a member is selected.

**Step D — CREATE `packages/mobile-app/lib/query-client.ts`:**

```ts
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s — demo doesn't need real-time
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

**Step E — REWRITE `packages/mobile-app/app/_layout.tsx`** (replace the current contents entirely):

```tsx
import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { QueryProvider } from "../lib/query-client";
import { getCurrentMemberId } from "../lib/current-member";
import { GestureRoot } from "../lib/bottom-sheet-impl";

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getCurrentMemberId();
      if (cancelled) return;
      const onPicker = segments[0] === "pick-member";
      if (!id && !onPicker) router.replace("/pick-member");
      if (id && onPicker) router.replace("/(tabs)");
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [segments]);

  if (!checked) {
    return (
      <View style={{ flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryProvider>
      <GestureRoot>
        <StatusBar style="light" />
        <AuthGate>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: "#111111" },
              headerTintColor: "#ffffff",
              headerTitleStyle: { fontWeight: "600" },
              contentStyle: { backgroundColor: "#111111" },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="pick-member" options={{ headerShown: false }} />
          </Stack>
        </AuthGate>
      </GestureRoot>
    </QueryProvider>
  );
}
```

**Step F — REWRITE `packages/mobile-app/app/(tabs)/_layout.tsx`** (replace the entire 419-line current file with this 60-line GymOS shell):

```tsx
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: "#111111", borderTopColor: "#222222" },
        tabBarActiveTintColor: "#ffffff",
        tabBarInactiveTintColor: "#666666",
        headerStyle: { backgroundColor: "#111111" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="food"
        options={{
          title: "Food",
          tabBarIcon: ({ color, size }) => <Feather name="coffee" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

**Step G — CREATE placeholder tab screens** (D2-03, D2-04, D2-05 fill these out):

`packages/mobile-app/app/(tabs)/index.tsx`:
```tsx
import { View, Text } from "react-native";

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#111" }}>
      <Text style={{ color: "#fff", fontSize: 20 }}>Home</Text>
      <Text style={{ color: "#666", marginTop: 8 }}>Filled out by plan D2-04</Text>
    </View>
  );
}
```

`packages/mobile-app/app/(tabs)/schedule.tsx`:
```tsx
import { View, Text } from "react-native";

export default function ScheduleScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#111" }}>
      <Text style={{ color: "#fff", fontSize: 20 }}>Schedule</Text>
      <Text style={{ color: "#666", marginTop: 8 }}>Filled out by plan D2-03</Text>
    </View>
  );
}
```

`packages/mobile-app/app/(tabs)/food.tsx`:
```tsx
import { View, Text } from "react-native";

export default function FoodScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#111" }}>
      <Text style={{ color: "#fff", fontSize: 20 }}>Food</Text>
      <Text style={{ color: "#666", marginTop: 8 }}>Filled out by plan D2-05</Text>
    </View>
  );
}
```

**Step H — CREATE `packages/mobile-app/app/(tabs)/profile.tsx`** (with the long-press Switch member affordance per D-05):

```tsx
import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import { clearCurrentMemberId } from "../../lib/current-member";

export default function ProfileScreen() {
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });
  const [confirming, setConfirming] = useState(false);

  async function switchMember() {
    await clearCurrentMemberId();
    router.replace("/pick-member");
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (error || !data?.member) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#f88" }}>Couldn't load profile</Text>
        <Pressable onPress={switchMember} style={styles.btn}>
          <Text style={styles.btnText}>Switch member</Text>
        </Pressable>
      </View>
    );
  }

  const m = data.member;
  return (
    <Pressable
      onLongPress={() => setConfirming(true)}
      delayLongPress={600}
      style={styles.container}
    >
      <Text style={styles.name}>
        {m.firstName} {m.lastName ?? ""}
      </Text>
      <Text style={styles.subtitle}>{m.email ?? m.phoneE164 ?? ""}</Text>
      <Text style={styles.hint}>Long-press anywhere to switch member (demo)</Text>

      {confirming && (
        <View style={styles.confirmBox}>
          <Text style={styles.confirmText}>Switch demo member?</Text>
          <View style={styles.confirmRow}>
            <Pressable onPress={() => setConfirming(false)} style={[styles.btn, styles.btnSecondary]}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={switchMember} style={styles.btn}>
              <Text style={styles.btnText}>Switch</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", padding: 24, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#111", gap: 12 },
  name: { color: "#fff", fontSize: 28, fontWeight: "700", marginTop: 32 },
  subtitle: { color: "#999", fontSize: 16 },
  hint: { color: "#555", fontSize: 12, marginTop: 24 },
  btn: { backgroundColor: "#3b82f6", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  btnSecondary: { backgroundColor: "#333" },
  btnText: { color: "#fff", fontWeight: "600" },
  confirmBox: { backgroundColor: "#1a1a1a", padding: 16, borderRadius: 12, marginTop: 32, gap: 12 },
  confirmText: { color: "#fff" },
  confirmRow: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
});
```

**Step I — CREATE `packages/mobile-app/app/pick-member.tsx`** (the first-launch member-picker per D-05/D-06):

```tsx
import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { apiFetch } from "../lib/api";
import { setCurrentMemberId } from "../lib/current-member";

type Member = { id: string; firstName: string; lastName: string | null };

export default function PickMember() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/m/members/list")
      .then((d) => setMembers(d.members))
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  async function pick(id: string) {
    await setCurrentMemberId(id);
    router.replace("/(tabs)");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Who are you?</Text>
      <Text style={styles.subtitle}>Demo only — production uses WhatsApp magic-link</Text>

      {members === null && !error && (
        <View style={{ marginTop: 32 }}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {members && (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingTop: 24, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => pick(item.id)}>
              <Text style={styles.rowText}>
                {item.firstName} {item.lastName ?? ""}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", padding: 24, paddingTop: 80 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#999", fontSize: 14, marginTop: 8 },
  row: { backgroundColor: "#1a1a1a", paddingHorizontal: 16, paddingVertical: 18, borderRadius: 12 },
  rowText: { color: "#fff", fontSize: 18 },
  error: { color: "#f88", marginTop: 24 },
});
```

After all files saved: `npx prettier --write packages/mobile-app/app packages/mobile-app/lib`.

Verify nothing references the deleted imports:

```bash
node -e "const fs=require('fs');const path=require('path');function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?walk(p):[p]})}const stale=['use-apps','app-store','get-app-url','remote-sessions-api','use-remote-push-registration','shared-app-config'];for(const f of walk('packages/mobile-app')){if(!/\\.(ts|tsx)$/.test(f))continue;const s=fs.readFileSync(f,'utf8');for(const x of stale){if(s.includes(x)){console.error('STALE IMPORT in',f,':',x);process.exit(1)}}}"
```

If the check fails, fix the residual imports.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const must=['packages/mobile-app/lib/current-member.ts','packages/mobile-app/lib/api.ts','packages/mobile-app/lib/query-client.ts','packages/mobile-app/lib/bottom-sheet-impl.ts','packages/mobile-app/app/_layout.tsx','packages/mobile-app/app/(tabs)/_layout.tsx','packages/mobile-app/app/(tabs)/index.tsx','packages/mobile-app/app/(tabs)/schedule.tsx','packages/mobile-app/app/(tabs)/food.tsx','packages/mobile-app/app/(tabs)/profile.tsx','packages/mobile-app/app/pick-member.tsx'];const missing=must.filter(f=>!fs.existsSync(f));if(missing.length){console.error('MISSING FILES',missing);process.exit(1)}const removed=['packages/mobile-app/app/(tabs)/analytics.tsx','packages/mobile-app/app/(tabs)/brain.tsx','packages/mobile-app/app/(tabs)/calendar.tsx','packages/mobile-app/app/(tabs)/clips.tsx','packages/mobile-app/app/(tabs)/more.tsx','packages/mobile-app/app/(tabs)/settings.tsx','packages/mobile-app/lib/use-apps.ts','packages/mobile-app/lib/get-app-url.ts'];const stillThere=removed.filter(f=>fs.existsSync(f));if(stillThere.length){console.error('SHOULD BE DELETED',stillThere);process.exit(1)}const lay=fs.readFileSync('packages/mobile-app/app/(tabs)/_layout.tsx','utf8');for(const t of ['name=\"index\"','name=\"schedule\"','name=\"food\"','name=\"profile\"']){if(!lay.includes(t)){console.error('tabs layout missing',t);process.exit(1)}}const root=fs.readFileSync('packages/mobile-app/app/_layout.tsx','utf8');for(const t of ['QueryProvider','GestureRoot','AuthGate','pick-member']){if(!root.includes(t)){console.error('_layout missing',t);process.exit(1)}}"</automated>
  </verify>
  <acceptance_criteria>
    - Files exist: `packages/mobile-app/lib/{api,current-member,query-client}.ts`, `packages/mobile-app/app/pick-member.tsx`, `packages/mobile-app/app/(tabs)/{_layout,index,schedule,food,profile}.tsx`, `packages/mobile-app/app/_layout.tsx`
    - Files DELETED (do not exist): `packages/mobile-app/app/(tabs)/{analytics,brain,calendar,clips,content,design,dispatch,forms,more,sessions,settings,slides,starter,videos}.tsx`, `packages/mobile-app/lib/{use-apps,get-app-url,app-store,remote-sessions-api,use-remote-push-registration}.ts`, `packages/mobile-app/app/oauth-complete.tsx`
    - `grep -c 'QueryProvider' packages/mobile-app/app/_layout.tsx` returns at least 2 (import + JSX use)
    - `grep -c 'GestureRoot' packages/mobile-app/app/_layout.tsx` returns at least 2
    - `grep -c 'AuthGate' packages/mobile-app/app/_layout.tsx` returns at least 2
    - `grep -c 'pick-member' packages/mobile-app/app/_layout.tsx` returns at least 1 (Stack.Screen registration)
    - `grep -c 'name="index"' packages/mobile-app/app/(tabs)/_layout.tsx` returns 1
    - `grep -c 'name="schedule"' packages/mobile-app/app/(tabs)/_layout.tsx` returns 1
    - `grep -c 'name="food"' packages/mobile-app/app/(tabs)/_layout.tsx` returns 1
    - `grep -c 'name="profile"' packages/mobile-app/app/(tabs)/_layout.tsx` returns 1
    - `grep -c 'X-Demo-Member-Id' packages/mobile-app/lib/api.ts` returns at least 1
    - `grep -c 'demoMemberId' packages/mobile-app/lib/current-member.ts` returns at least 1
    - `grep -c 'QueryClient' packages/mobile-app/lib/query-client.ts` returns at least 1
    - `grep -c 'Who are you' packages/mobile-app/app/pick-member.tsx` returns 1
    - `grep -c 'Demo only' packages/mobile-app/app/pick-member.tsx` returns 1
    - `grep -c 'onLongPress' packages/mobile-app/app/(tabs)/profile.tsx` returns at least 1
    - No file references `use-apps`, `app-store`, `get-app-url`, `remote-sessions-api`, `use-remote-push-registration`, or `@agent-native/shared-app-config` (stale-import check passes)
  </acceptance_criteria>
  <done>The mobile app boots into the GymOS-only shell: pick-member on first launch, then 4 tabs with the long-press switch-member affordance on Profile; all upstream multi-template files removed; no stale imports</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Server-side — requireDemoMember helper, /api/m/members/list, /api/m/profile, auth publicPaths extension, .env.local.example</name>
  <files>
    - templates/mail/server/lib/demo-member.ts
    - templates/mail/server/plugins/auth.ts
    - templates/mail/app/routes/api.m.members.list.tsx
    - templates/mail/app/routes/api.m.profile.tsx
    - templates/mail/.env.local.example
  </files>
  <read_first>
    - templates/mail/server/plugins/auth.ts (current publicPaths array — preserve all existing entries; add /api/m/ + /pick-member)
    - templates/mail/server/db/schema.ts lines 115-138 (gymMembers shape) + 218-258 (passes, passDebits, bookings) + 282-302 (foodEntries)
    - .planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/D1-02-members-directory-PLAN.md (Task 1 — the pass-balance two-aggregation pattern)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Pattern 1: Member-API gate" (the requireDemoMember helper full source)
    - templates/mail/app/routes/gymos.members.$id.tsx (reference for the profile loader queries — we adapt the existing 6-query pattern to a single API response)
  </read_first>
  <action>
**Step A — CREATE `templates/mail/server/lib/demo-member.ts`:**

```ts
// Demo-only auth gate. Trusts X-Demo-Member-Id only when DEMO_MODE=true
// AND NODE_ENV !== 'production'. Replaced in P1a by Better-auth member sessions.
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";

export type DemoMember = typeof schema.gymMembers.$inferSelect;

export async function requireDemoMember(request: Request): Promise<DemoMember> {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true") {
    throw new Response("Demo mode disabled", { status: 401 });
  }
  const memberId = request.headers.get("x-demo-member-id");
  if (!memberId) throw new Response("Missing X-Demo-Member-Id", { status: 401 });

  const db = getDb();
  // guard:allow-unscoped — demo D-07 (X-Demo-Member-Id is the access scope; no ownableColumns on GymOS schema)
  const member = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.id, memberId))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!member) throw new Response("Member not found", { status: 404 });
  return member;
}
```

**Step B — EDIT `templates/mail/server/plugins/auth.ts`:**

In the `publicPaths` array (currently contains the 4 `/gymos*` entries + 2 `/api/gmail/*` entries — see Read first), add these EXACT strings (preserving every existing entry):

```
"/api/m",
"/pick-member",
"/webhooks/whatsapp",
```

The leading `/api/m` is a PREFIX match (Better-auth's `publicPaths` is checked via `startsWith` per existing convention) — this single entry covers `/api/m/members/list`, `/api/m/profile`, `/api/m/schedule`, `/api/m/bookings`, `/api/m/food-entries`, `/api/m/foods/*`, `/api/m/agent`, etc.

`/webhooks/whatsapp` is also added here so D2-02 doesn't need to touch this file again (avoids merge conflict between this plan and D2-02 running in parallel — both touch auth.ts otherwise).

**Step C — CREATE `templates/mail/app/routes/api.m.members.list.tsx`:**

```ts
// GET /api/m/members/list
// Demo: returns all gym members for the member-picker first-launch screen.
// NOT gated by requireDemoMember — the picker has no member yet. Still
// requires DEMO_MODE=true to function. Production replaces with magic-link.
import { asc } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import type { LoaderFunctionArgs } from "react-router";

export async function loader(_: LoaderFunctionArgs) {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true") {
    throw new Response("Demo mode disabled", { status: 401 });
  }
  const db = getDb();
  // guard:allow-unscoped — demo D-07 (picker endpoint; no member context yet)
  const members = await db
    .select({
      id: schema.gymMembers.id,
      firstName: schema.gymMembers.firstName,
      lastName: schema.gymMembers.lastName,
    })
    .from(schema.gymMembers)
    .orderBy(asc(schema.gymMembers.firstName));
  return { members };
}
```

**Step D — CREATE `templates/mail/app/routes/api.m.profile.tsx`:**

```ts
// GET /api/m/profile
// Member home + profile data: name, passBalance (D1-02 two-aggregation pattern),
// upcomingBooking, todayKcal. Used by the Home tab (D2-04) and Profile tab.
import { eq, and, gte, sql, asc } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const member = await requireDemoMember(request);
  const db = getDb();
  const nowIso = new Date().toISOString();
  const todayDate = nowIso.slice(0, 10); // YYYY-MM-DD UTC for demo bucket

  // Pass balance — TWO SEPARATE aggregations (D1-02 lesson)
  // guard:allow-unscoped — demo D-07
  const grantedTotal = await db
    .select({ sum: sql<number>`COALESCE(SUM(${schema.passes.granted}), 0)` })
    .from(schema.passes)
    .where(eq(schema.passes.memberId, member.id))
    .then((r) => Number(r[0]?.sum ?? 0));

  // guard:allow-unscoped — demo D-07
  const debitsTotal = await db
    .select({ sum: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)` })
    .from(schema.passDebits)
    .leftJoin(schema.passes, eq(schema.passDebits.passId, schema.passes.id))
    .where(eq(schema.passes.memberId, member.id))
    .then((r) => Number(r[0]?.sum ?? 0));

  const passBalance = grantedTotal - debitsTotal;

  // Upcoming booking: earliest future occurrence for this member, status='booked'
  // guard:allow-unscoped — demo D-07
  const upcoming = await db
    .select({
      bookingId: schema.bookings.id,
      occurrenceId: schema.classOccurrences.id,
      startsAt: schema.classOccurrences.startsAt,
      className: schema.classDefinitions.name,
    })
    .from(schema.bookings)
    .leftJoin(schema.classOccurrences, eq(schema.bookings.occurrenceId, schema.classOccurrences.id))
    .leftJoin(schema.classDefinitions, eq(schema.classOccurrences.definitionId, schema.classDefinitions.id))
    .where(
      and(
        eq(schema.bookings.memberId, member.id),
        eq(schema.bookings.status, "booked"),
        gte(schema.classOccurrences.startsAt, nowIso),
      ),
    )
    .orderBy(asc(schema.classOccurrences.startsAt))
    .limit(1)
    .then((r) => r[0] ?? null);

  // Today's kcal total
  // guard:allow-unscoped — demo D-07
  const todayTotals = await db
    .select({
      kcal: sql<number>`COALESCE(SUM(${schema.foodEntries.kcal}), 0)`,
      protein: sql<number>`COALESCE(SUM(${schema.foodEntries.proteinG}), 0)`,
      carbs: sql<number>`COALESCE(SUM(${schema.foodEntries.carbsG}), 0)`,
      fat: sql<number>`COALESCE(SUM(${schema.foodEntries.fatG}), 0)`,
    })
    .from(schema.foodEntries)
    .where(
      and(
        eq(schema.foodEntries.memberId, member.id),
        sql`substr(${schema.foodEntries.loggedAt}, 1, 10) = ${todayDate}`,
      ),
    )
    .then((r) => r[0] ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 });

  return {
    member: {
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phoneE164: member.phoneE164,
      goal: member.goal,
    },
    passBalance,
    upcomingBooking: upcoming,
    today: {
      kcal: Number(todayTotals.kcal ?? 0),
      proteinG: Number(todayTotals.protein ?? 0),
      carbsG: Number(todayTotals.carbs ?? 0),
      fatG: Number(todayTotals.fat ?? 0),
      // Hardcoded targets per D-10 (production: Mifflin-St Jeor in P2/CAL-06)
      targetKcal: 2100,
      targetProteinG: 130,
      targetCarbsG: 250,
      targetFatG: 60,
    },
  };
}
```

**Step E — CREATE/UPDATE `templates/mail/.env.local.example`** (the actual `.env.local` is gitignored; example file is committed):

```bash
# Existing entries (DO NOT remove — preserve whatever's already in .env.local.example if present)
# Add these for GymOS Demo Sprint Phase D2:

# Demo-mode gate — required for /api/m/* to function
DEMO_MODE=true

# Anthropic — agent surface in plan D2-06
ANTHROPIC_API_KEY=sk-ant-...

# WhatsApp — plan D2-02 (inbound webhook + outbound from staff inbox)
WHATSAPP_APP_SECRET=...                  # from Meta App dashboard → Settings → Basic → App Secret
WHATSAPP_VERIFY_TOKEN=gymos-demo-verify  # arbitrary string; must match Meta webhook config
WHATSAPP_PHONE_NUMBER_ID=...             # from Meta WhatsApp → API Setup → Phone number ID
WHATSAPP_ACCESS_TOKEN=...                # 24h temp token from Meta WhatsApp → API Setup, or permanent system-user token
```

If `.env.local.example` already exists, APPEND these (do not overwrite). Verify by reading the file first.

Run `npx prettier --write templates/mail/server/lib/demo-member.ts templates/mail/app/routes/api.m.members.list.tsx templates/mail/app/routes/api.m.profile.tsx`.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const checks=[['templates/mail/server/lib/demo-member.ts','export async function requireDemoMember'],['templates/mail/server/lib/demo-member.ts','X-Demo-Member-Id'.toLowerCase()],['templates/mail/app/routes/api.m.members.list.tsx','export async function loader'],['templates/mail/app/routes/api.m.members.list.tsx','schema.gymMembers'],['templates/mail/app/routes/api.m.profile.tsx','requireDemoMember'],['templates/mail/app/routes/api.m.profile.tsx','schema.passes'],['templates/mail/app/routes/api.m.profile.tsx','schema.passDebits'],['templates/mail/app/routes/api.m.profile.tsx','schema.classOccurrences'],['templates/mail/app/routes/api.m.profile.tsx','schema.foodEntries'],['templates/mail/app/routes/api.m.profile.tsx','targetKcal: 2100'],['templates/mail/server/plugins/auth.ts','/api/m'],['templates/mail/server/plugins/auth.ts','/pick-member'],['templates/mail/server/plugins/auth.ts','/webhooks/whatsapp'],['templates/mail/server/plugins/auth.ts','/gymos/schedule'],['templates/mail/.env.local.example','DEMO_MODE=true'],['templates/mail/.env.local.example','ANTHROPIC_API_KEY'],['templates/mail/.env.local.example','WHATSAPP_APP_SECRET']];for(const [f,s] of checks){const c=fs.readFileSync(f,'utf8').toLowerCase();if(!c.includes(s.toLowerCase())){console.error('MISSING',s,'in',f);process.exit(1)}}"</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/server/lib/demo-member.ts` exists
    - `grep -c 'export async function requireDemoMember' templates/mail/server/lib/demo-member.ts` returns 1
    - `grep -c 'DEMO_MODE' templates/mail/server/lib/demo-member.ts` returns at least 1
    - `grep -ic 'x-demo-member-id' templates/mail/server/lib/demo-member.ts` returns at least 1
    - File `templates/mail/app/routes/api.m.members.list.tsx` exists
    - `grep -c 'schema.gymMembers' templates/mail/app/routes/api.m.members.list.tsx` returns at least 1
    - File `templates/mail/app/routes/api.m.profile.tsx` exists
    - `grep -c 'requireDemoMember' templates/mail/app/routes/api.m.profile.tsx` returns at least 2 (import + call)
    - `grep -c 'schema.passes' templates/mail/app/routes/api.m.profile.tsx` returns at least 2
    - `grep -c 'schema.passDebits' templates/mail/app/routes/api.m.profile.tsx` returns at least 1
    - Multi-line grep for two-aggregation pattern: ripgrep `passDebits[\s\S]*?leftJoin[\s\S]*?passes` succeeds in api.m.profile.tsx
    - `grep -c 'schema.classOccurrences' templates/mail/app/routes/api.m.profile.tsx` returns at least 1
    - `grep -c 'schema.foodEntries' templates/mail/app/routes/api.m.profile.tsx` returns at least 1
    - `grep -c 'targetKcal: 2100' templates/mail/app/routes/api.m.profile.tsx` returns 1 (D-10 hardcoded targets)
    - `grep -c '"/api/m"' templates/mail/server/plugins/auth.ts` returns at least 1
    - `grep -c '"/pick-member"' templates/mail/server/plugins/auth.ts` returns at least 1
    - `grep -c '"/webhooks/whatsapp"' templates/mail/server/plugins/auth.ts` returns at least 1
    - `grep -c '"/gymos/schedule"' templates/mail/server/plugins/auth.ts` returns at least 1 (existing entry preserved)
    - `templates/mail/.env.local.example` contains DEMO_MODE=true, ANTHROPIC_API_KEY, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN
    - `npx tsc --noEmit -p templates/mail` returns 0 errors (or runs cleanly via `pnpm --filter mail exec tsc --noEmit`)
  </acceptance_criteria>
  <done>requireDemoMember helper enforces DEMO_MODE; two server endpoints serve the picker + the home/profile data; auth.ts publicPaths covers all D2 mobile + WhatsApp routes; .env.local.example documents required keys for the executor's reference</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5: End-to-end smoke test — Expo Go boots, picker shows 5 members, tap → Home tab loads with pass balance</name>
  <what-built>
The full shell: Expo dev server boots, Expo Go on phone (or simulator) loads the app, member-picker appears on first launch listing 5 seeded members with the correct caption, tapping a member persists to AsyncStorage and routes to the 4-tab shell, and the Profile tab fetches `/api/m/profile` successfully (proves the X-Demo-Member-Id header round-trip works end-to-end).
  </what-built>
  <files>
    - (no file changes — this is a verification checkpoint that exercises Tasks 1-4 end-to-end)
  </files>
  <action>SEE <what-built> + <how-to-verify> ABOVE. The executor walks through the 16-step verification flow: boot Mail dev server, run , scan QR with Expo Go, exercise the member-picker → tabs → profile flow + the long-press switch flow. No files are modified — this checkpoint VERIFIES that Tasks 1-4 are correctly wired. The executor pauses for human approval.</action>
  <verify>
    <automated>node -e "const fs=require('fs');const must=['packages/mobile-app/lib/api.ts','packages/mobile-app/lib/current-member.ts','packages/mobile-app/app/pick-member.tsx','packages/mobile-app/app/(tabs)/profile.tsx','templates/mail/server/lib/demo-member.ts','templates/mail/app/routes/api.m.members.list.tsx','templates/mail/app/routes/api.m.profile.tsx'];for(const f of must){if(!fs.existsSync(f)){console.error('MISSING',f);process.exit(1)}}"</automated>
  </verify>
  <how-to-verify>
1. Ensure `templates/mail/.env.local` has `DEMO_MODE=true` set (copy from `.env.local.example` if needed).
2. From repo root:
   ```bash
   pnpm --filter mail dev               # boots Vite SSR on http://localhost:8081
   ```
   Confirm `http://localhost:8081/api/m/members/list` returns JSON `{"members":[...]}` with 5 entries (use curl or browser).

3. In a second terminal:
   ```bash
   cd packages/mobile-app
   npx expo start --tunnel
   ```
   Set `EXPO_PUBLIC_API_BASE` in a `.env` at `packages/mobile-app/.env` (Expo reads it):
   ```
   EXPO_PUBLIC_API_BASE=https://<your-expo-tunnel-or-laptop-LAN>:8081
   ```
   (If using `--tunnel`, the staff API still needs to be reachable — set it to the laptop's LAN IP, e.g. `http://192.168.x.x:8081`, since the tunnel only proxies Expo's metro server, not the Mail dev server.)

4. Scan the QR code with Expo Go on a phone.

5. Expected on first launch:
   - "Who are you?" header, "Demo only — production uses WhatsApp magic-link" subtitle
   - 5 rows: Sarah Patel, James Wong, Maya Singh, Tom Reilly, Aisha Khan
6. Tap **Sarah Patel**.
7. Expected: bottom tab bar with 4 icons (Home / Schedule / Food / Profile), Home tab visible (placeholder "Filled out by plan D2-04").
8. Tap **Profile** tab.
9. Expected: "Sarah Patel" + her email/phone + "Long-press anywhere to switch member (demo)" hint. No spinner stuck, no error.
10. Long-press the Profile screen body for ~600ms.
11. Expected: a confirm prompt "Switch demo member?" with Cancel / Switch buttons.
12. Tap **Switch**.
13. Expected: app routes back to the picker.
14. Force-quit the app, reopen.
15. Expected: picker again (since AsyncStorage was cleared in step 12). Tap a different member.
16. Expected: 4-tab shell again with the new member.

If anything fails, do not "approve" — capture the Metro logs + the failing screen and ask for help.
  </how-to-verify>
  <resume-signal>Type `approved` or describe the issue (e.g. `picker shows 0 members — API 404`)</resume-signal>
  <acceptance_criteria>
    - User has typed `approved` (or equivalent) confirming all 16 steps above behaved as expected
    - At least one round-trip through `/api/m/profile` succeeded with the X-Demo-Member-Id header (verified by the Profile tab rendering the member's name)
    - The long-press → switch flow rotated members successfully
  </acceptance_criteria>
  <done>The Wave 1 foundation is demo-verified. Plans D2-03, D2-04, D2-05, D2-06 can build on the shell + apiFetch + requireDemoMember with confidence.</done>
</task>

</tasks>

<verification>
**Automated (run after Task 4):**

```bash
# All files exist and have required exports
node -e "const fs=require('fs');const checks=[['packages/mobile-app/lib/api.ts','X-Demo-Member-Id'],['packages/mobile-app/lib/current-member.ts','demoMemberId'],['packages/mobile-app/lib/query-client.ts','QueryClient'],['packages/mobile-app/app/_layout.tsx','QueryProvider'],['packages/mobile-app/app/(tabs)/_layout.tsx','name=\"profile\"'],['packages/mobile-app/app/pick-member.tsx','Who are you'],['templates/mail/server/lib/demo-member.ts','requireDemoMember'],['templates/mail/app/routes/api.m.profile.tsx','requireDemoMember'],['templates/mail/server/plugins/auth.ts','/api/m']];for(const [f,s] of checks){if(!fs.readFileSync(f,'utf8').includes(s)){console.error('FAIL',f,s);process.exit(1)}}console.log('OK')"

# Stale-import sweep (must pass)
node -e "const fs=require('fs');const path=require('path');function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?walk(p):[p]})}const stale=['use-apps','app-store','get-app-url','remote-sessions-api','use-remote-push-registration','shared-app-config'];let fail=false;for(const f of walk('packages/mobile-app')){if(!/\\.(ts|tsx)$/.test(f))continue;const s=fs.readFileSync(f,'utf8');for(const x of stale){if(s.includes(x)){console.error('STALE',f,':',x);fail=true}}}if(fail)process.exit(1);console.log('no stale imports')"

# TS compiles cleanly in both workspaces
pnpm --filter mail exec tsc --noEmit
pnpm --filter @agent-native/mobile-app exec tsc --noEmit
```

**Manual (Task 5 checkpoint):** End-to-end Expo Go boot + 4-tab shell + profile fetch flow above.
</verification>

<success_criteria>
- [ ] All deps in mobile-app + mail package.json (lockfile updated)
- [ ] babel.config.js exists with react-native-worklets/plugin
- [ ] 14 upstream tab files + 5 upstream lib files DELETED
- [ ] 4 GymOS tab placeholders + pick-member + new root layout exist
- [ ] apiFetch wrapper injects X-Demo-Member-Id from AsyncStorage
- [ ] requireDemoMember helper refuses without DEMO_MODE+header
- [ ] GET /api/m/members/list returns 5 seeded members
- [ ] GET /api/m/profile returns member + passBalance + upcomingBooking + today totals
- [ ] auth.ts publicPaths covers /api/m, /pick-member, /webhooks/whatsapp (and preserves existing /gymos*, /api/gmail/*)
- [ ] bottom-sheet-impl.ts locked to either gorhom or rn-modal
- [ ] Expo Go demo: picker → member tap → 4 tabs → Profile shows member data → long-press switch works
- [ ] No stale imports of use-apps / shared-app-config etc.
- [ ] `npx tsc --noEmit` passes in both workspaces
</success_criteria>

<output>
After completion, create `.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-01-mobile-shell-auth-SUMMARY.md` documenting:
- The bottom-sheet decision (gorhom vs rn-modal) and the 2-line spike outcome
- Files deleted (the full list of stripped upstream tabs + lib helpers)
- Files created (mobile shell + server endpoints)
- The exact env vars added to .env.local.example
- Any deviations from the plan (especially if Reanimated had to be pinned to 3.x)
- Smoke test result summary
</output>
</content>
</invoke>