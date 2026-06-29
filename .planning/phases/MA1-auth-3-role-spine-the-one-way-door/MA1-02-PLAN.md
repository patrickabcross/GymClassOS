---
phase: MA1-auth-3-role-spine-the-one-way-door
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - packages/mobile-app/package.json
  - packages/mobile-app/lib/session.ts
  - packages/mobile-app/lib/api.ts
  - packages/mobile-app/lib/agent-stream.ts
  - packages/mobile-app/lib/auth-config.ts
  - packages/mobile-app/lib/sign-in-api.ts
  - packages/mobile-app/app/_layout.tsx
  - packages/mobile-app/app/sign-in.tsx
  - packages/mobile-app/app/(tabs)/profile.tsx
autonomous: true
requirements: [AUTH-01, AUTH-02, AUTH-03]
user_setup: []

must_haves:
  truths:
    - "The app's first screen is a sign-in screen (email + password); there is no in-app sign-up and no in-app password-reset screen"
    - "On successful sign-in the session token (read from the set-auth-token response header) is written to expo-secure-store under a single constant key, never AsyncStorage"
    - "Every apiFetch and the agent SSE stream send Authorization: Bearer <token> read from expo-secure-store (no X-Demo-Member-Id in the production path)"
    - "The session persists across app restarts (AuthGate reads the secure-store token) and sign-out deletes the token from secure store"
    - "Join/Subscribe and Forgot-password affordances deep-link to configurable URLs (not hardcoded)"
  artifacts:
    - path: "packages/mobile-app/lib/session.ts"
      provides: "getSessionToken / setSessionToken / clearSessionToken on expo-secure-store with a single SESSION_TOKEN_KEY constant"
      exports: ["getSessionToken", "setSessionToken", "clearSessionToken", "SESSION_TOKEN_KEY"]
    - path: "packages/mobile-app/lib/sign-in-api.ts"
      provides: "signInWithEmail(email, password) → posts to better-auth email sign-in, reads set-auth-token, stores it"
      exports: ["signInWithEmail"]
    - path: "packages/mobile-app/app/sign-in.tsx"
      provides: "Email+password sign-in screen with phone-fallback expansion + configurable Join/Forgot deep-links"
    - path: "packages/mobile-app/lib/auth-config.ts"
      provides: "Configurable subscribe + reset deep-link URLs from EXPO_PUBLIC_* env (repeatable per client, D-06)"
      exports: ["SUBSCRIBE_URL", "RESET_PASSWORD_URL"]
  key_links:
    - from: "packages/mobile-app/lib/api.ts"
      to: "packages/mobile-app/lib/session.ts"
      via: "apiFetch reads getSessionToken() and sets Authorization: Bearer"
      pattern: "Authorization.*Bearer"
    - from: "packages/mobile-app/lib/sign-in-api.ts"
      to: "set-auth-token response header"
      via: "response.headers.get('set-auth-token') → setSessionToken"
      pattern: "set-auth-token"
    - from: "packages/mobile-app/app/_layout.tsx"
      to: "packages/mobile-app/lib/session.ts"
      via: "AuthGate redirects to /sign-in when getSessionToken() is null"
      pattern: "sign-in"
---

<objective>
Replace the demo member-picker auth on the mobile side with a real Better-auth Bearer flow: install `expo-secure-store`, build `lib/session.ts` (secure-store token store), a sign-in screen that posts email+password to the framework Better-auth endpoint and captures the `set-auth-token` header, swap `api.ts`/`agent-stream.ts`/`_layout.tsx` to send `Authorization: Bearer`, and deep-link Join/Forgot to configurable URLs. App is sign-in-only (no in-app sign-up/reset).

Purpose: This is the client half of the one-way door. It produces the real token that Plan 01's `requireMember` consumes and that Plan 03 device-verifies. Using plain Bearer (no better-auth `expo()` plugin — it does not exist in 1.6.0) keeps the design exactly aligned with the server.

Output: secure-store session store, sign-in screen with phone-fallback, three swapped swap-point files, configurable deep-link config.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-CONTEXT.md
@.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-RESEARCH.md
@.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-01-SUMMARY.md

<interfaces>
<!-- Contracts the executor needs — extracted from codebase + RESEARCH. -->

expo-secure-store API (the three methods MA1 needs; install pins to SDK-55 via npx expo install):
```typescript
import * as SecureStore from "expo-secure-store";
await SecureStore.setItemAsync("session_token", token);   // store
const token = await SecureStore.getItemAsync("session_token"); // read (null if absent)
await SecureStore.deleteItemAsync("session_token");        // clear
```

Better-auth email sign-in (NO expo() plugin — plain Bearer flow, RESEARCH Findings 1 & 3):
```
POST {API_BASE}/_agent-native/auth/ba/sign-in/email
Body: { "email": "...", "password": "..." }   (no Authorization header yet)
→ 200 + response header `set-auth-token: <session_token>`   (lowercase, hyphenated — exact)
Read the token: response.headers.get("set-auth-token")
Store it: SecureStore.setItemAsync("session_token", token)
```

Current api.ts (the swap point — replace the X-Demo-Member-Id branch):
```typescript
const memberId = await AsyncStorage.getItem("demoMemberId");
// headers: ...(memberId ? { "X-Demo-Member-Id": memberId } : {})
```

Current agent-stream.ts EventSource (RESEARCH Finding 5 — react-native-sse forwards all options.headers on every open(); Bearer survives the streaming POST):
```typescript
const memberId = await AsyncStorage.getItem("demoMemberId");
new EventSource(`${API_BASE_URL}/api/m/agent/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Demo-Member-Id": memberId },
  body: JSON.stringify({ messages }),
});
```

Current _layout.tsx AuthGate (reads getCurrentMemberId, redirects to /pick-member):
```typescript
const id = await getCurrentMemberId();
if (!id && !onPicker) router.replace("/pick-member");
```

requireMember 403 phone-fallback signal from Plan 01 (the client reacts to this):
```
HTTP 403 body: { "code": "PHONE_REQUIRED" }   → prompt for phone, retry claim with x-claim-phone header
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install expo-secure-store + lib/session.ts + auth-config.ts</name>
  <files>packages/mobile-app/package.json, packages/mobile-app/lib/session.ts, packages/mobile-app/lib/auth-config.ts</files>
  <read_first>
    - packages/mobile-app/lib/current-member.ts (the AsyncStorage get/set/clear shape to mirror onto SecureStore)
    - packages/mobile-app/package.json (confirm expo-secure-store absent; SDK 55 / RN 0.83.9)
    - .planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-RESEARCH.md (Finding 6 — install command + API; Pitfall 2 — never bare npm)
  </read_first>
  <action>
    From `packages/mobile-app/`, install the SDK-55-pinned secure store: `cd packages/mobile-app && npx expo install expo-secure-store` (D-02; Pitfall 2 — MUST be `npx expo install`, never `npm install expo-secure-store@latest` which pulls SDK 56). Confirm `expo-secure-store` now appears in package.json dependencies with a `~14.x` (SDK-55) range.

    Create `packages/mobile-app/lib/session.ts` mirroring current-member.ts but on SecureStore:
    ```typescript
    import * as SecureStore from "expo-secure-store";
    export const SESSION_TOKEN_KEY = "session_token";
    export async function getSessionToken(): Promise<string | null> {
      return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    }
    export async function setSessionToken(token: string): Promise<void> {
      await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
    }
    export async function clearSessionToken(): Promise<void> {
      await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    }
    ```
    `SESSION_TOKEN_KEY` is the single source of truth referenced by api.ts, agent-stream.ts, sign-in-api.ts, and _layout.tsx (RESEARCH Don't-Hand-Roll — one constant, not per-file literals).

    Create `packages/mobile-app/lib/auth-config.ts` (D-06 repeatable-per-client — URLs configurable, NOT hardcoded):
    ```typescript
    // Configurable per studio (repeatable-per-client). Defaults: studio site + runstudioai.com.
    export const SUBSCRIBE_URL =
      process.env.EXPO_PUBLIC_SUBSCRIBE_URL ?? "https://doyouhustle.co.uk";
    export const RESET_PASSWORD_URL =
      process.env.EXPO_PUBLIC_RESET_PASSWORD_URL ?? "https://runstudioai.com/reset-password";
    ```
    Note in a comment that the default subscribe URL is the studio site and the default reset URL is runstudioai.com (D-04/D-05), overridable via EXPO_PUBLIC_* env so a new client deploy points elsewhere with no code change.
  </action>
  <verify>
    <automated>cd packages/mobile-app && node -e "const p=require('./package.json'); if(!p.dependencies['expo-secure-store']) { console.error('expo-secure-store missing'); process.exit(1);} console.log('expo-secure-store', p.dependencies['expo-secure-store']);" && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - package.json dependencies contains `expo-secure-store` at a `~14.` (SDK-55) range — NOT `^15` or higher (SDK 56)
    - lib/session.ts exports SESSION_TOKEN_KEY, getSessionToken, setSessionToken, clearSessionToken and imports `expo-secure-store` (NOT AsyncStorage)
    - lib/auth-config.ts exports SUBSCRIBE_URL and RESET_PASSWORD_URL, both reading `process.env.EXPO_PUBLIC_*` with defaults
    - `npx tsc --noEmit` in packages/mobile-app is clean
  </acceptance_criteria>
  <done>expo-secure-store installed at the SDK-55 pin; session token store + configurable deep-link config in place; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: sign-in-api.ts + swap api.ts & agent-stream.ts to Bearer</name>
  <files>packages/mobile-app/lib/sign-in-api.ts, packages/mobile-app/lib/api.ts, packages/mobile-app/lib/agent-stream.ts</files>
  <read_first>
    - packages/mobile-app/lib/api.ts (current apiFetch — X-Demo-Member-Id injection to replace)
    - packages/mobile-app/lib/agent-stream.ts (current EventSource headers — X-Demo-Member-Id to replace; RESEARCH Finding 5 + Pitfall 7 header survival)
    - packages/mobile-app/lib/session.ts (the token store from Task 1)
    - .planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-RESEARCH.md (Finding 3 set-auth-token; Pitfall 5 — confirm 200 not 302 before reading header)
  </read_first>
  <action>
    Create `packages/mobile-app/lib/sign-in-api.ts`:
    ```typescript
    import { API_BASE_URL } from "./api";
    import { setSessionToken } from "./session";
    export async function signInWithEmail(email: string, password: string): Promise<void> {
      const res = await fetch(`${API_BASE_URL}/_agent-native/auth/ba/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Sign-in failed (${res.status}): ${text.slice(0, 200)}`);
      }
      // RESEARCH Finding 3 — exact header name (lowercase, hyphenated). Pitfall 5:
      // this endpoint returns 200 (not a 302), so the header is readable directly.
      const token = res.headers.get("set-auth-token");
      if (!token) throw new Error("No set-auth-token header in sign-in response");
      await setSessionToken(token);
    }
    ```
    (If `set-auth-token` is not readable on-device because of an HTTPS redirect — Pitfall 5 — the Plan 03 spike flags it; the fallback is to follow the redirect and re-read. Keep the happy path here.)

    Edit `packages/mobile-app/lib/api.ts`:
    - Remove `import AsyncStorage ...`. Add `import { getSessionToken } from "./session";`.
    - Replace the memberId block with: `const token = await getSessionToken();` and the header spread with `...(token ? { Authorization: \`Bearer ${token}\` } : {})`. Remove the `X-Demo-Member-Id` header entirely.
    - Keep `API_BASE`, `API_BASE_URL`, the error-throw, and `res.json()` unchanged.

    Edit `packages/mobile-app/lib/agent-stream.ts`:
    - Remove `import AsyncStorage ...`. Add `import { getSessionToken } from "./session";`.
    - Replace `const memberId = await AsyncStorage.getItem("demoMemberId"); if (!memberId) throw ...` with `const token = await getSessionToken(); if (!token) throw new Error("Not signed in");`.
    - In the EventSource `headers`, replace `"X-Demo-Member-Id": memberId` with `Authorization: \`Bearer ${token}\``. Pass the token in `options.headers` at construction time (RESEARCH Pitfall 7 — react-native-sse re-sets headers on every open(), so reconnects keep the Bearer). Keep everything else (event listeners, cancel()) unchanged.

    Run `npx prettier --write packages/mobile-app/lib/api.ts packages/mobile-app/lib/agent-stream.ts packages/mobile-app/lib/sign-in-api.ts`.
  </action>
  <verify>
    <automated>cd packages/mobile-app && (grep -rn "X-Demo-Member-Id\|demoMemberId" lib/api.ts lib/agent-stream.ts && echo "DEMO HEADER STILL PRESENT" && exit 1 || echo "bearer swap clean") && grep -q "set-auth-token" lib/sign-in-api.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - lib/api.ts and lib/agent-stream.ts contain ZERO occurrences of `X-Demo-Member-Id` or `demoMemberId`
    - lib/api.ts and lib/agent-stream.ts both send `Authorization: Bearer ${token}` from getSessionToken()
    - lib/sign-in-api.ts reads `set-auth-token` and calls setSessionToken
    - `npx tsc --noEmit` in packages/mobile-app is clean
  </acceptance_criteria>
  <done>apiFetch + the agent SSE stream authenticate via Authorization: Bearer from secure store; sign-in captures the set-auth-token header; no demo header remains in these two files.</done>
</task>

<task type="auto">
  <name>Task 3: sign-in.tsx screen + AuthGate swap in _layout.tsx + sign-out wiring</name>
  <files>packages/mobile-app/app/sign-in.tsx, packages/mobile-app/app/_layout.tsx, packages/mobile-app/app/(tabs)/profile.tsx</files>
  <read_first>
    - packages/mobile-app/app/_layout.tsx (AuthGate + Stack screen registration — swap pick-member → sign-in)
    - packages/mobile-app/app/pick-member.tsx (existing screen for theme/layout conventions — useTheme, styling idioms)
    - packages/mobile-app/app/(tabs)/profile.tsx (current demo-member clear handler — the sign-out call site)
    - packages/mobile-app/lib/session.ts, lib/sign-in-api.ts, lib/auth-config.ts (the pieces the screen wires together)
    - packages/mobile-app/lib/theme.ts (useTheme tokens)
  </read_first>
  <action>
    Create `packages/mobile-app/app/sign-in.tsx` — the sign-in-only first screen (D-03). Use `useTheme()` for tokens (mirror pick-member.tsx visual idioms). It contains:
    - Email + password `TextInput`s and a "Sign in" button. On press: call `signInWithEmail(email, password)`; on success `router.replace("/(tabs)")`. On error show an inline error message (no browser dialog — React Native has none). Disable the button while in-flight.
    - **Phone-fallback expansion (D-12, RESEARCH Open Q2 — inline, no new route):** after sign-in succeeds the app navigates into (tabs); the first authed `/api/m/profile` call may return 403 `{ code: "PHONE_REQUIRED" }`. Handle this by: on the first post-sign-in profile fetch failing with that code, reveal an inline phone `TextInput` + "Link my membership" button on this screen (or a lightweight modal) that retries the claim. Implement the retry by sending the phone on the next authed request via an `x-claim-phone` header (Plan 01's requireMember honors `x-claim-phone` for the phone claim). Keep it minimal: a single phone field that, when submitted, re-issues the profile fetch with the `x-claim-phone` header; on success navigate to (tabs); on 403 (NO_PHONE_MATCH) show "No membership on file — contact the studio." (D-13 copy verbatim).
    - **Join / Subscribe** affordance: a button that opens `SUBSCRIBE_URL` via `expo-web-browser` `openBrowserAsync` (expo-web-browser is already a dependency). Label "Join / Subscribe".
    - **Forgot password?** affordance: opens `RESET_PASSWORD_URL` via the same. Label "Forgot password?".
    - NO sign-up form and NO in-app reset form (D-03) — only the two deep-links.
    Import `SUBSCRIBE_URL`, `RESET_PASSWORD_URL` from `lib/auth-config`, `signInWithEmail` from `lib/sign-in-api`.

    Edit `packages/mobile-app/app/_layout.tsx`:
    - In `AuthGate`: replace `import { getCurrentMemberId } from "../lib/current-member";` with `import { getSessionToken } from "../lib/session";`. Replace `const id = await getCurrentMemberId();` with `const token = await getSessionToken();` and the redirect logic: `const onSignIn = segments[0] === "sign-in"; if (!token && !onSignIn) router.replace("/sign-in"); if (token && onSignIn) router.replace("/(tabs)");` This makes the session persist across restarts (AuthGate reads secure store on every cold start, AUTH-03) and gates the app behind sign-in.
    - In `AgentFabAndSheet`: replace the `onPicker = segments[0] === "pick-member"` hide-check with `segments[0] === "sign-in"` so the FAB is hidden on the sign-in screen.
    - In the `<Stack>`: replace `<Stack.Screen name="pick-member" .../>` with `<Stack.Screen name="sign-in" options={{ headerShown: false }} />`. Leave the demo `pick-member.tsx` file on disk (it still works in DEMO_MODE; not deleting it preserves the demo path, AUTH-06) but it is no longer the gate.

    **Sign-out wiring (AUTH-03):** the Profile tab's existing clear action must call `clearSessionToken()` (from lib/session) instead of `clearCurrentMemberId()`. Update the Profile tab's sign-out/clear handler accordingly and route the user to `/sign-in` after clearing. (Find the call site in `app/(tabs)/profile.tsx` — it currently long-press-clears the demo member.)

    Run `npx prettier --write packages/mobile-app/app/sign-in.tsx packages/mobile-app/app/_layout.tsx packages/mobile-app/app/\(tabs\)/profile.tsx`.
  </action>
  <verify>
    <automated>cd packages/mobile-app && grep -q "getSessionToken" app/_layout.tsx && grep -q "sign-in" app/_layout.tsx && grep -q "clearSessionToken" "app/(tabs)/profile.tsx" && grep -Eq "SUBSCRIBE_URL|RESET_PASSWORD_URL" app/sign-in.tsx && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - app/sign-in.tsx exists, has email+password inputs, a sign-in button calling signInWithEmail, the phone-fallback field, and Join/Forgot deep-links opening SUBSCRIBE_URL / RESET_PASSWORD_URL
    - _layout.tsx AuthGate reads getSessionToken and redirects to `/sign-in` (not `/pick-member`) when no token; Stack registers `sign-in` screen
    - The Profile sign-out handler calls `clearSessionToken()` and routes to /sign-in
    - app/sign-in.tsx contains NO sign-up form and NO in-app password-reset form (only the two deep-link affordances)
    - `npx tsc --noEmit` in packages/mobile-app is clean
  </acceptance_criteria>
  <done>The app opens to a sign-in-only screen; session persists across restarts via secure store; sign-out clears the token; Join/Forgot deep-link to configurable URLs; phone-fallback handles the unmatched-email case inline.</done>
</task>

</tasks>

<verification>
- `expo-secure-store` present at SDK-55 (~14.x) range; NOT AsyncStorage for the session token
- `grep "X-Demo-Member-Id\|demoMemberId" lib/api.ts lib/agent-stream.ts` — zero matches
- sign-in-api.ts reads the exact `set-auth-token` header
- _layout.tsx gates on getSessionToken → /sign-in; Profile sign-out calls clearSessionToken
- Join/Forgot URLs come from auth-config (EXPO_PUBLIC_* configurable), not hardcoded
- `npx tsc --noEmit` in packages/mobile-app — clean
</verification>

<success_criteria>
- AUTH-01: sign-in with email+password posts to the better-auth endpoint; token from set-auth-token is stored in expo-secure-store (never AsyncStorage)
- AUTH-02: app is sign-in-only; account creation is on the web (Join/Subscribe deep-link); no in-app sign-up
- AUTH-03: AuthGate reads the secure-store token on cold start (persists across restarts); sign-out deletes the token
</success_criteria>

<output>
After completion, create `.planning/phases/MA1-auth-3-role-spine-the-one-way-door/MA1-02-SUMMARY.md`
</output>
