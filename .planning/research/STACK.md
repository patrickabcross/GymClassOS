# Stack Research

**Domain:** Production auth + push notifications for an EXISTING Expo / React Native mobile app (RunStudio member/teacher/admin), backed by a Better-auth ^1.6 server on React Router v7 / H3 / Nitro / Vercel.
**Researched:** 2026-06-29
**Confidence:** HIGH on packages + versions (verified via npm registry + Better-auth official docs). MEDIUM on the SSE-with-session interaction and the SDK-55-vs-56 pinning edge (call-outs below).

> **Scope discipline:** This milestone (v2.3) adds FOUR new stack capabilities to the already-validated stack. Everything in the existing stack (Expo 55, Expo Router, RN 0.83.9, TanStack Query, `react-native-sse`, Better-auth ^1.6 server, Drizzle/Neon, Anthropic SDK, Stripe Connect, pg-boss) is **fixed** and not re-researched. The four new pieces: (1) Better-auth client in Expo, (2) secure token storage, (3) Expo push, (4) deep-linking from a push tap.

---

## The Single Most Important Finding (Read First)

**Better-auth ships a first-party, maintained Expo integration — `@better-auth/expo` — and the GymClassOS server is already 90% configured for it.**

The riskiest unknown going in was *session transport in React Native* (no browser cookie jar). It is **solved by the official plugin**, not hand-rolled:

- The server enables a single `expo()` plugin. The client uses `expoClient()` from `@better-auth/expo/client`, configured with `storage: SecureStore`.
- The Expo client **stores the session cookie in `expo-secure-store` and re-attaches it to every auth request automatically.** For your *own* API calls (`/api/m/*`, the admin SSE endpoint) you call `authClient.getCookie()` and set it as the `Cookie` header manually — see the integration section.
- **You do NOT need a bespoke bearer-token shim.** The existing server already has both `bearer()` and `jwt()` plugins enabled (`packages/core/src/server/better-auth-instance.ts:818-829`) — those stay, but the *Expo* session path is cookie-string-over-SecureStore, handled by the plugin. The bearer plugin remains available as a fallback/alt transport if `getCookie()` ever proves awkward in a specific call site (e.g. the SSE POST).

**What's missing server-side:** the `expo()` plugin is **not yet registered**, and `trustedOrigins` for the app's `agentnative://` scheme is **not yet set**. Both are small, additive changes to the shared core auth instance (or, cleaner, injected via the `config.plugins` passthrough that `createBetterAuthInstance` already supports — line 828: `...(config?.plugins ?? [])`).

**Second most important finding:** the app is on **Expo SDK 55**, but npm `latest` for every Expo package is now **SDK 56**. You MUST pin the **`sdk-55`** dist-tag versions of `expo-secure-store`, `expo-network`, and `expo-notifications` — installing `latest` will pull SDK-56 native modules into an SDK-55 app and break the build. Use `npx expo install` (which resolves the correct SDK-pinned version), never bare `npm install`.

**Third:** push notifications **do not work in Expo Go on SDK 53+** — they were removed. Push requires an **EAS development build** (or production build). This compounds the existing constraint that the iOS build is gated on the customer's Apple Developer account. Local/in-app notifications still work in Expo Go; remote Expo push tokens do not.

---

## Recommended Stack

### Core Technologies (the four new pieces)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **`@better-auth/expo`** (client + server plugin) | **`1.6.22`** (match server `better-auth`) | Better-auth's official Expo/RN integration: `expo()` server plugin + `expoClient()` client plugin. Handles session storage in SecureStore + auto-attaches the session cookie to auth requests; powers email/password sign-in, social OAuth deep-link return, and `useSession`. | First-party, actively maintained (published days ago as of research). It *is* the answer to the "no browser cookies in RN" question — purpose-built for exactly this. Server already runs Better-auth ^1.6 with the org/jwt/bearer plugins; this is additive. |
| **`better-auth`** (server, already present) | **bump `^1.6.0` → `^1.6.22`** in `packages/core` | The server auth instance the Expo client talks to. | `@better-auth/expo@1.6.22` **peers on `better-auth@^1.6.22`** (verified via `npm view`). The core is pinned at `^1.6.0` today — bump to `1.6.22` so client and server agree. Patch-level within the 1.6 line; low risk. Do **not** jump to the 1.7 beta or 1.0-canary. |
| **`expo-secure-store`** | **`55.0.15`** (the `sdk-55` dist-tag — **NOT** `latest`/`56.0.4`) | Encrypted, OS-keychain-backed storage for the Better-auth session cookie/token. Replaces the `demoMemberId` AsyncStorage hack. | Session tokens are credentials — Keychain (iOS) / Keystore-backed EncryptedSharedPreferences (Android), not plaintext AsyncStorage. This is the `storage` you pass into `expoClient({ storage: SecureStore })`. **Not currently a dependency** — must be added. |
| **`expo-notifications`** | **`55.0.24`** (the `sdk-55` dist-tag) | Client: request permission, `getExpoPushTokenAsync({ projectId })`, foreground handler, Android channel, and the response listener that drives deep-link-on-tap. | Already a dependency (`^55.0.23`) and already in `app.json` `plugins`. Bump to the latest `sdk-55` patch (`55.0.24`). The de-facto standard for Expo push. |
| **`expo-server-sdk`** (Node, server-side) | **`6.1.0`** | Server: validate Expo push tokens, chunk, `sendPushNotificationsAsync`, poll receipts. Runs wherever the send originates. | The official Node sender for Expo push. Pure Node, no Expo runtime — fits both Vercel route handlers and the Fly worker. **Recommendation: send from the Fly worker (pg-boss), not staff-web** — push must be durable/retryable and the worker is the existing async chokepoint. Enqueue from staff-web, send from worker. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **`expo-network`** | **`55.0.15`** (`sdk-55` tag) | Peer dependency of `@better-auth/expo` (the plugin uses it for connectivity checks). | **Required by the plugin** (`peerDependencies` lists `expo-network >=8.0.7`). **Not currently a dependency** — must be added. |
| **`expo-linking`** | `^55.0.14` (already present) | Deep-link URL construction + the `scheme` plumbing Better-auth's OAuth return and notification taps rely on. | Already a dependency. No change. Used by both the auth deep-link return and the notification-tap router. |
| **`expo-web-browser`** | `~55.0.14` (already present) | Opens the OAuth consent screen for social sign-in and returns to the app via the scheme. Peer of `@better-auth/expo`. | Already present + in `app.json` plugins. Only strictly needed if you offer **social** (Google) sign-in in the mobile app. If mobile is email/password only for v1, it's still fine to keep. |
| **`expo-constants`** | `^55.0.15` (already present) | Reads `expo.extra.eas.projectId` for `getExpoPushTokenAsync` and is a peer of `@better-auth/expo`. | Already present. Use `Constants.expoConfig?.extra?.eas?.projectId` to feed the push-token call. |
| **`expo-device`** | `55.0.x` (`sdk-55` tag) | `Device.isDevice` guard — push tokens only issue on physical devices. | Optional but recommended in the registration flow to fail fast on simulators. Add via `npx expo install expo-device` if you want the guard. |
| **`react-native-sse`** | `^1.2.1` (already present) | The existing SSE client for the member agent; reused for the new **admin** AI ops SSE endpoint. | No change. The new admin SSE call swaps `X-Demo-Member-Id` for the Better-auth session cookie (see SSE call-out below). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **`npx expo install`** | Installs SDK-pinned native module versions | **Use this, not `npm install`/`pnpm add`, for every `expo-*` package.** It resolves the correct version for SDK 55 automatically, sidestepping the SDK-55-vs-56 trap. For `@better-auth/expo` and `expo-server-sdk` (not Expo-native), use the normal package manager. |
| **EAS CLI (`eas-cli`)** | Builds the dev/prod client with native push entitlements + APNs/FCM credentials | Push requires a **development build** (Expo Go cannot receive remote push on SDK 53+). `eas build` prompts to generate the APNs key (iOS) and configures FCM V1 (Android). **Gated on the customer's Apple Developer account** (per STATE.md / D2). |
| **`eas credentials`** | Manage APNs key (iOS) + FCM V1 service account (Android) | iOS APNs key is auto-generated during `eas build` if you consent; Android needs the Firebase project's FCM V1 service-account JSON uploaded. |
| **Expo Push Notifications Tool** (web) | Manually test a push to a captured token before wiring the server | `https://expo.dev/notifications` — fastest way to verify token capture + deep-link payload before building the server send path. |
| **`EXPO_ACCESS_TOKEN`** (env, optional) | Enables Expo push security (rejects sends from unauthorized callers) | Set on the worker if you enable "push security" in the Expo dashboard. Recommended for production. Store in `app_secrets`/Fly env like the other server secrets. |

---

## Installation

```bash
# --- Mobile app (packages/mobile-app) — Expo-native: use `expo install` for correct SDK-55 pin ---
cd packages/mobile-app
npx expo install expo-secure-store expo-network expo-device
npx expo install expo-notifications   # bumps existing ^55.0.23 → sdk-55 latest (55.0.24)
# expo-linking / expo-web-browser / expo-constants already present at sdk-55

# --- Mobile app — the Better-auth client (NOT an expo-native module; normal add) ---
pnpm --filter @agent-native/mobile-app add @better-auth/expo better-auth@1.6.22

# --- Server: core auth instance — bump better-auth to match the expo client peer ---
# packages/core: better-auth ^1.6.0  ->  ^1.6.22   (and add the expo plugin)
pnpm --filter @agent-native/core add better-auth@^1.6.22 @better-auth/expo@^1.6.22

# --- Server send path (Fly worker — recommended) ---
pnpm --filter @gymos/worker add expo-server-sdk@^6.1.0
```

> **CRITICAL — do not run a bare `npm install expo-secure-store`.** That resolves to `56.0.4` (SDK 56) and will mismatch the SDK-55 native runtime. Always `npx expo install`.

---

## Integration with the EXISTING server + app (concrete, not generic)

### 1. Better-auth in Expo — session transport (the riskiest unknown, resolved)

**Server side** — register the `expo()` plugin and add the app scheme to `trustedOrigins`. The cleanest insertion point is the existing `config.plugins` passthrough in `createBetterAuthInstance` (`packages/core/src/server/better-auth-instance.ts:828`), or add it directly to the `plugins: [...]` array alongside `jwt()` and `bearer()`:

```typescript
import { expo } from "@better-auth/expo";

betterAuth({
  // ...existing config...
  trustedOrigins: [
    "agentnative://",                 // the app.json scheme (verified: app.json "scheme": "agentnative")
    // add prod/staging schemes here if they ever diverge
    // dev only (do NOT ship to prod): "exp://", "exp://192.168.*.*:*/**"
  ],
  plugins: [
    jwt({ /* existing */ }),
    bearer(),                         // existing — keep
    expo(),                           // NEW
    ...(config?.plugins ?? []),
  ],
});
```

- The server already mounts auth under a **custom basePath** (`/_agent-native/auth/ba`, line 580). The Expo client must be given the **full URL including that path** — Better-auth's docs explicitly call this out for custom base paths.
- The session, cookie config, 30-day expiry, and Neon adapter all already exist and are reused — no auth-table changes (the `user`/`session`/`account` tables are already created). This satisfies the "strictly additive DB changes" constraint: **no migration needed for auth itself.**

**Client side** — new file in `packages/mobile-app/lib/auth-client.ts`:

```typescript
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  // Full URL INCLUDING the custom basePath (server mounts at /_agent-native/auth/ba)
  baseURL: `${process.env.EXPO_PUBLIC_API_BASE}/_agent-native/auth/ba`,
  plugins: [
    expoClient({
      scheme: "agentnative",          // must match app.json
      storagePrefix: "runstudio",     // namespaces SecureStore keys
      storage: SecureStore,           // ← session cookie persisted in the OS keychain
    }),
  ],
});
```

**Making authenticated calls to your OWN endpoints (`/api/m/*`, admin SSE)** — the plugin auto-attaches the cookie to *auth* requests, but for your app endpoints you grab the cookie string and set it yourself:

```typescript
// Replaces lib/api.ts's X-Demo-Member-Id injection
const cookie = authClient.getCookie();          // synchronous; reads from SecureStore cache
const res = await fetch(`${API_BASE}${path}`, {
  ...init,
  headers: { "Content-Type": "application/json", Cookie: cookie, ...init?.headers },
  credentials: "omit",                           // prevent RN's fetch from interfering
});
```

This is a **one-file change** to `lib/api.ts` (swap `X-Demo-Member-Id` → `Cookie`) and a matching change in `lib/agent-stream.ts`.

**Server-side session read is unchanged.** `getSession(event)` (already used in `auth.ts`) reads the cookie the Expo client sends, identically to the web app. The new admin SSE endpoint wraps work in `runWithRequestContext({ userEmail, orgId })` exactly as the staff-web actions do — no new session machinery.

> **SSE + cookie call-out (MEDIUM confidence — verify in the spike).** `react-native-sse` supports custom headers (the existing code already sends `X-Demo-Member-Id`), so attaching `Cookie: authClient.getCookie()` to the admin SSE POST is the direct path. **If** a specific RN/Nitro combination strips or mishandles the `Cookie` header on the streaming POST, the fallback is the already-enabled **`bearer()` plugin**: read the bearer token from the session and send `Authorization: Bearer <token>` instead. Both transports are live on the server today — so this is a no-new-dependency fallback. **Action: prove the SSE-with-session path in the auth spike before building the admin agent UI.**

> **Role routing** is application logic, not a stack concern: after sign-in, resolve the role server-side from `session.user.email` against `RUNSTUDIO_OPERATOR_EMAILS` (admin) and a new teacher allowlist, else member. Member **claim-by-email** links the Better-auth `user` to the existing `gym_members` row via the nullable `user_id` FK already in schema (additive — no new column).

### 2. Secure token storage

- `expo-secure-store@55.0.15`. Used purely as the `storage` adapter handed to `expoClient` — you rarely call it directly. The plugin reads/writes the session under the `storagePrefix` keys.
- **SDK 55 caveat:** value size limit is ~2KB per key on Android (SecureStore wraps a small encrypted blob) — fine for a session cookie/token, do not stuff large JSON in it. The Better-auth session string is well under this.
- **Web caveat:** SecureStore is a no-op / unavailable on web (`react-native-web`). Since the app targets iOS/Android/web, the Better-auth Expo client falls back to its web cookie handling on web — but confirm the member web target's behaviour in the spike if web is in scope for v2.3 (PROJECT notes member surface is native-first; web is a dev convenience).

### 3. Expo push notifications

**Client registration flow** (in the mobile app, after sign-in):

```typescript
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;                  // simulators can't get a token
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default", importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;  // ← MUST be set (see below)
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return token; // POST to a new /api/m/push-token endpoint, store per authenticated user
}
```

- **`projectId` is required and currently MISSING.** `app.json` has **no `extra.eas.projectId`** (verified). It gets populated when the project is linked to EAS (`eas init`). Without it, `getExpoPushTokenAsync` throws. **This is a hard prerequisite, gated on EAS setup under the customer's account.**
- Store the captured Expo push token in a **new additive table** (e.g. `push_tokens(user_id, expo_token, platform, created_at)`) — additive-only, satisfies the no-breaking-DB-change rule. One user can have multiple devices/tokens.

**Server send flow** (Fly worker, `expo-server-sdk@6.1.0`):

```typescript
import { Expo } from "expo-server-sdk";
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN }); // optional but recommended

// 1. filter valid tokens with Expo.isExpoPushToken(token)
// 2. chunkPushNotifications([{ to, title, body, data: { url: "/admin/agent" } }])
// 3. for each chunk: await expo.sendPushNotificationsAsync(chunk)  -> tickets
// 4. later: expo.getPushNotificationReceiptsAsync(ticketIds) -> prune DeviceNotRegistered tokens
```

- **Send from the worker, enqueue from staff-web** — push is async, retryable, and must not block a request. pg-boss already exists; add a `member-push` (or `admin-push`) queue. This matches the existing "staff-web never calls external APIs directly; the worker is the chokepoint" architecture.
- **Prune `DeviceNotRegistered`** receipts — stale tokens accumulate or Expo throttles you. Receipt-checking is not optional at scale.

**EAS / APNs / FCM credentials (gated on customer Apple Dev account):**
- **iOS:** needs the paid Apple Developer account. `eas build` prompts to generate an **APNs key** automatically; it's stored in EAS credentials. The build must be an **EAS dev or prod build** — Expo Go cannot receive remote push on SDK 53+.
- **Android:** needs **FCM V1** credentials — upload the Firebase project's service-account JSON via `eas credentials`. (Even Expo-managed push routes Android through FCM.)
- **Both:** require `eas init` first (to mint the `projectId`).

### 4. Deep-linking from a push tap

- **Scheme is already set:** `app.json` `"scheme": "agentnative"` — deep links and notification-tap routing work off this. No change needed.
- **Pattern (Expo Router):** put a `useNotificationObserver` hook in the root layout (`app/_layout.tsx`). On a notification with `data.url`, call `router.push(url)`. Cover both cold-start (`getLastNotificationResponse()`) and warm taps (`addNotificationResponseReceivedListener`):

```typescript
function useNotificationObserver() {
  useEffect(() => {
    const redirect = (n: Notifications.Notification) => {
      const url = n.request.content.data?.url;
      if (typeof url === "string") router.push(url);   // e.g. "/admin/agent" or "/booking/123"
    };
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) redirect(last.notification);
    const sub = Notifications.addNotificationResponseReceivedListener(r => redirect(r.notification));
    return () => sub.remove();
  }, []);
}
```

- **Server side:** put the destination route in the push payload's `data.url` — `{ url: "/admin/agent" }` for the admin "come look" nudge, `{ url: "/booking/<occurrenceId>" }` for a member booking/reminder. The route strings are Expo Router paths, so they map straight onto the file-based routes you build.
- **Cold-start ordering caveat:** the observer must run high in the tree and tolerate the router/auth not being ready yet on first frame — guard the `router.push` until after the session is resolved (a member must be authenticated before `/admin/agent` is reachable). This is app logic; flag it for the planner.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@better-auth/expo` cookie-over-SecureStore | Hand-rolled bearer-token flow using the existing `bearer()` plugin + manual SecureStore | Only if the official Expo plugin proves incompatible with the custom basePath / Nitro mount in the spike. The bearer plugin is already enabled, so this is a viable fallback — but it means re-implementing session refresh/storage the plugin gives for free. Use the plugin first. |
| `expo-secure-store` for the session | `@react-native-async-storage/async-storage` (the current demo hack) | Never for credentials. AsyncStorage is unencrypted plaintext. Keep AsyncStorage only for non-sensitive UI state (e.g. last-viewed tab); move all auth material to SecureStore. |
| `expo-notifications` + Expo push service | Bare `react-native-firebase` / raw APNs+FCM | Only if you outgrow Expo's push relay (e.g. need rich/critical alerts, or want to drop the Expo token indirection). Massive added native-config burden; not justified for "free owner nudges + booking reminders." Stay on Expo push. |
| Send push from the **Fly worker** (pg-boss) | Send from a Vercel route handler via `expo-server-sdk` | A Vercel route is fine for a *one-off* synchronous send (e.g. immediate "booking confirmed"). But scheduled reminders + retries + receipt pruning belong on the worker. Default to the worker; allow a thin synchronous Vercel send only for instant in-request confirmations if needed. |
| `better-auth@1.6.22` (stay on 1.6 line) | `better-auth@1.7.0-beta` / `1.0.0-canary` | Never mid-milestone. The 1.6 line is what the whole codebase runs; the Expo plugin's `latest` peers on 1.6.22. Re-evaluate the 1.7/2.0 line post-launch. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`npm install expo-secure-store` (bare, → `56.0.4`)** | Pulls SDK-56 native modules into an SDK-55 app → native build mismatch / crashes. | `npx expo install expo-secure-store` (resolves `55.0.15`, the `sdk-55` tag). |
| **`latest` tag for ANY `expo-*` package** | `latest` = SDK 56 across the board now; the app is SDK 55. | The `sdk-55` dist-tag via `npx expo install`. |
| **AsyncStorage for the session token** | Unencrypted plaintext on disk; the current `demoMemberId`/`X-Demo-Member-Id` hack is exactly what this milestone removes. | `expo-secure-store` as the `expoClient` storage adapter. |
| **Testing push in Expo Go** | Remote push removed from Expo Go on SDK 53+ — tokens won't issue / sends won't arrive. | An **EAS development build** on a physical device (gated on the customer Apple Dev account for iOS). |
| **Calling `getExpoPushTokenAsync()` without a `projectId`** | Throws — `app.json` has no `extra.eas.projectId` today. | Run `eas init` to mint the projectId, read it via `Constants.expoConfig?.extra?.eas?.projectId`. |
| **Sending push directly from staff-web request handlers** | Breaks the "staff-web never calls external services directly; worker is the chokepoint" architecture; no durable retry. | Enqueue a pg-boss job; send from the Fly worker via `expo-server-sdk`. |
| **A new bearer-only auth scheme that ignores the Expo plugin** | Reinvents session storage/refresh the plugin gives free; diverges from the web auth path. | The `expo()`/`expoClient()` plugin pair; keep `bearer()` only as the SSE fallback. |
| **A new auth-table migration** | Better-auth's `user`/`session`/`account` tables already exist and are reused; member linking uses the existing nullable `user_id` FK. | No auth migration. Only the **additive** `push_tokens` table is new. |

---

## Stack Patterns by Variant

**If the mobile app offers Google/social sign-in (not just email/password):**
- Keep `expo-web-browser` + `expo-linking` (already present) — the OAuth consent opens in the browser and returns via the `agentnative://` scheme.
- The server's Google provider config already exists (`better-auth-instance.ts:599`); add `agentnative://` to `trustedOrigins` so the OAuth return is accepted.

**If email/password only for v1 (simpler):**
- `expo()` + `expoClient()` + SecureStore is sufficient; `expo-web-browser` is unused by auth but harmless to keep (it's already a dep + plugin).

**If the SSE-with-cookie spike fails:**
- Switch the admin SSE call to `Authorization: Bearer <session-token>` using the already-enabled `bearer()` plugin. Zero new dependencies; server already accepts it.

**If push volume grows (many studios / many devices):**
- Set `EXPO_ACCESS_TOKEN` (push security) on the worker, and make receipt-pruning a scheduled pg-boss job, not a fire-and-forget after-send.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@better-auth/expo@1.6.22` | `better-auth@^1.6.22`, `@better-auth/core@^1.6.22` | **Server `better-auth` must be bumped `^1.6.0` → `^1.6.22`** to satisfy the peer. Verified via `npm view @better-auth/expo@1.6.22 peerDependencies`. |
| `@better-auth/expo@1.6.22` | `expo-network >=8.0.7`, `expo-linking >=7.0.0`, `expo-constants >=17.0.0`, `expo-web-browser >=14.0.0` | All satisfied by the SDK-55 versions (Expo 55 ships these well above the floors). `expo-network` must be **added**. |
| `expo-secure-store@55.0.15` | Expo SDK 55 (RN 0.83.9, React 19.2) | The `sdk-55` dist-tag. `latest` (`56.0.4`) is SDK 56 — do not use. |
| `expo-notifications@55.0.24` | Expo SDK 55 | The `sdk-55` dist-tag. Already a dep at `^55.0.23`; bump within the 55 line. Requires a dev build for remote push (Expo Go removed it on 53+). |
| `expo-network@55.0.15` | Expo SDK 55 | The `sdk-55` dist-tag. New dependency (plugin peer). |
| `expo-server-sdk@6.1.0` | Node 18+ (server) | Runs on Vercel functions and the Fly worker. No Expo runtime dependency. |
| `react-native-sse@^1.2.1` | Custom headers incl. `Cookie`/`Authorization` | Already proven sending `X-Demo-Member-Id`; swap to the session header. **Spike-verify** the streaming POST preserves the header. |
| Expo push (server) | Better-auth session (server) | Orthogonal — push token lives in a new `push_tokens` table keyed by the Better-auth `user.id`. Register the token *after* sign-in so it's attributable to a user. |

---

## Sources

- **Better-auth official Expo docs** (`better-auth.com/docs/integrations/expo`) — HIGH: `expo()` server plugin, `expoClient({ scheme, storagePrefix, storage: SecureStore })`, `authClient.getCookie()` + `credentials: "omit"` pattern, `trustedOrigins`, custom-basePath note, SecureStore-as-cookie-jar transport.
- **npm registry** (`npm view`, 2026-06-29) — HIGH: `@better-auth/expo@1.6.22` (+ peerDependencies), `better-auth@1.6.22`, `expo-secure-store` sdk-55=`55.0.15`/latest=`56.0.4`, `expo-notifications` sdk-55=`55.0.24`, `expo-network` sdk-55=`55.0.15`, `expo-server-sdk@6.1.0`.
- **Expo push setup docs** (`docs.expo.dev/push-notifications/push-notifications-setup/`) — HIGH: `getExpoPushTokenAsync({ projectId })`, permission flow, Android channel, APNs-during-`eas build`, FCM V1, paid Apple Developer requirement.
- **Expo Notifications SDK reference** (`docs.expo.dev/versions/latest/sdk/notifications/`) — HIGH: `useNotificationObserver` / `addNotificationResponseReceivedListener` / `getLastNotificationResponse` deep-link-on-tap pattern with `router.push(data.url)`.
- **Expo SDK 53 changelog + community** (search, 2026) — HIGH: remote push removed from Expo Go on SDK 53+; dev build required. ([Expo SDK 53 changelog](https://expo.dev/changelog/sdk-53), [Courier guide](https://www.courier.com/blog/expo-notifications))
- **expo-server-sdk-node GitHub** — HIGH: `new Expo()`, `Expo.isExpoPushToken`, `chunkPushNotifications`, `sendPushNotificationsAsync`, `getPushNotificationReceiptsAsync`, `EXPO_ACCESS_TOKEN`.
- **LogRocket: React Native auth with Better Auth + Expo** (`blog.logrocket.com/react-native-authentication-with-better-auth-and-expo/`) — MEDIUM: `expoClient` config example, `trustedOrigins` example, "Expo Go does not support custom schemes → dev build" caveat.
- **Direct codebase inspection** — HIGH: `packages/core/src/server/better-auth-instance.ts` (server already has `jwt()` + `bearer()`, custom basePath `/_agent-native/auth/ba`, `config.plugins` passthrough, 30-day session, Neon adapter, `user`/`session`/`account` tables already created); `apps/staff-web/server/plugins/auth.ts` (`getSession`/`createAuthPlugin`/`publicPaths`); `packages/mobile-app/app.json` (`scheme: "agentnative"`, no `extra.eas.projectId`, `expo-notifications` already a plugin); `packages/mobile-app/lib/{api,current-member,agent-stream}.ts` (the demo-auth hack to replace); `apps/staff-web/package.json` (`better-auth@^1.6.0`).

---
*Stack research for: v2.3 Mobile App Production Foundation — Better-auth in Expo + secure storage + Expo push + deep-linking*
*Researched: 2026-06-29*
