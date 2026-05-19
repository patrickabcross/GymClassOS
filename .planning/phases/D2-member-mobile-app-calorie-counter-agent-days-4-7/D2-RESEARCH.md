# Phase D2: Member Mobile App + Calorie Counter + Agent — Research

**Researched:** 2026-05-19
**Domain:** Expo / React Native mobile member surface + LLM-backed agent + WhatsApp Cloud API webhook receiver
**Confidence:** HIGH for Expo SDK 55 / expo-camera / Anthropic SDK / Open Food Facts / WhatsApp webhook shape (verified against official docs and live npm registry as of 2026-05-19). MEDIUM for `@gorhom/bottom-sheet` × Expo Go 55 (open compatibility issue thread — fallback to RN `Modal` documented). MEDIUM for SSE inside Expo Go (works with `react-native-sse`; native `EventSource` not available).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mobile shell strategy**
- **D-01:** Edit `packages/mobile-app/` **in-place**. Do not fork to `apps/member-app/`. Follows the D0 "demo-time fork-boundary loosened" precedent (templates/mail edited directly for the inbox surface). Post-demo P0 audit can copy-out to `apps/member-app/` if upstream-merge churn becomes a real cost.
- **D-02:** **Rip out the existing `app/(tabs)/` content** (analytics, brain, calendar, clips, content, design, dispatch, forms, index, mail, more, sessions, settings, slides, starter, videos) and replace with GymOS native tabs. The upstream multi-template WebView shell is not the right base; only the Expo / Expo Router / EAS scaffolding is kept. Note in `MODIFICATIONS.md` (P0 task) which files were removed.
- **D-03:** **Native Expo screens**, not WebView wrapper. Use Expo APIs throughout (`expo-camera` for barcode, `expo-router` for navigation, native `<FlatList>` for lists).
- **D-04:** Five top-level tabs: **Home**, **Schedule**, **Food**, **Profile**, plus the agent surface as a FAB (not a tab) — see D-12.

**Member authentication (demo)**
- **D-05:** **Member-picker dropdown** on first launch. List shows the 5 seeded members. User taps → member ID persisted to AsyncStorage. No password, no link, no OTP. Subsequent app opens skip the picker. Long-press on Profile screen surfaces "Switch member" for demo persona swapping.
- **D-06:** No `MEMAUTH-01` magic-link in this phase. Caption: "Demo only — production uses WhatsApp magic-link".
- **D-07:** Member identity propagated via `X-Demo-Member-Id` header. Server-side route handlers trust this header **only when** `NODE_ENV !== 'production'` and `DEMO_MODE=true` env flag is set.

**Calorie counter UX**
- **D-08:** **Today screen + add-food modal** pattern. Default view = "Today" with a kcal target ring at the top, a P/C/F macro line, and meal-type sections. A single floating "+ Add" button opens a modal with two buttons: "Search" and "Scan barcode."
- **D-09:** **Meal types** present in UI but demo-grade — modal asks "Which meal?" once with a 4-option toggle.
- **D-10:** **Macro targets hardcoded** at 2100 kcal / 130P / 250C / 60F.
- **D-11:** **Open Food Facts** is the only data source. USDA fallback OUT OF SCOPE. Barcode scanning uses `expo-camera`'s built-in detection (EAN-13/UPC).

**In-app agent**
- **D-12:** **Persistent FAB → bottom-sheet** placement. Lower-right floating button with a message-bubble icon (Feather `message-circle`), visible on every screen. Bottom-sheet covers ~2/3 of viewport.
- **D-13:** **3 tools, end-to-end**: `greet`, `book_class` (with explicit "confirm before booking?" turn), `log_food_nl`. No additional tools.
- **D-14:** **Anthropic Claude** for the LLM. Use `claude-sonnet-4-6` with prompt caching enabled. Streaming via SSE.
- **D-15:** **No persistent agent memory or session history** this phase. Each agent open starts fresh. `agent_sessions` / `agent_memory` tables can be schema-defined but not populated.

### Claude's Discretion

- **Schedule view density** for the member tab — default: week-grid mobile-optimised (vertical scroll, one day per row, occurrences as cards).
- **WA-01 / WA-02 demo path** — default: minimal Hono webhook receiver on Fly (or ngrok tunnel) that signature-verifies and persists inbound messages; outbound calls Meta Graph API directly from the staff inbox action handler.
- **Branding** — default: name = "GymOS", icon = stylised dumbbell or "G" mark, primary colour matches inbox surface.
- **Agent system prompt** — default: short prompt stating role, member context, available tools, confirmation rules.
- **Permission UX for camera** — when to ask + consent screen copy.
- **Booking flow on member side** — default: inline expand under occurrence card with "Confirm booking" button.
- **Offline/empty/error states** for every screen.

### Deferred Ideas (OUT OF SCOPE)

- Magic-link / phone-OTP member auth (P1a)
- USDA fallback (P2 / CAL-05)
- Profile-derived macro targets via Mifflin–St Jeor (P2 / CAL-06)
- Real meal-type classification logic (P2 / CAL-08)
- `food_items` cache table on first OFF/USDA hit (P2 / CAL-09)
- ODbL attribution UI (P2 / CAL-11) — note inline in code now, ship UI later
- Recents / favourites (P2 / CAL-07)
- Custom food entry (P2 / CAL-04)
- Weekly view (P2 / CAL-10)
- Booking cancellation from member side (P2 / MEMBR-04)
- Profile view + edit (P2 / MEMBR-05)
- Atomic capacity-checked booking with pass debit (P1b/P2 — BKG-03, BKG-04)
- Persistent agent sessions + per-member memory (P2 / AGENT-04, AGENT-05)
- Extended agent tools (`view_schedule`, `cancel_booking`, `view_passes`, `escalate_to_coach`) — P2 / AGENT-06
- Typed-wrapper architecture for agent tools (P2 / AGENT-07)
- Agent tool-call audit log (P2 / AGENT-08)
- Per-studio agent system prompt loaded from env / `agent_skills` (P2 / AGENT-09)
- 24h-window enforcement at sender layer (P1b / WA-05)
- Opt-in gate (P1b / WA-06)
- Stripe payments on member side (never in v1)
- EAS Build under customer's Apple Dev Account (P2 / launch prep)
- Copy-out `packages/mobile-app/` → `apps/member-app/` (P0 audit task)
- App branding polish (P2)
</user_constraints>

## Project Constraints (from CLAUDE.md / AGENTS.md)

These directives have the same authority as locked decisions — research recommendations below comply with them.

- **No new branches.** Stay on `master`. No `git checkout -b`, no `/new-branch`, no `git switch`. Multiple agents share this worktree.
- **No breaking DB changes.** Schema edits must be strictly additive. No `DROP TABLE`, no `DROP COLUMN`, no rename in a single step. `drizzle-kit push` is blocked by a guard. Use `runMigrations` in `templates/mail/server/plugins/db.ts` with additive SQL only.
- **No unscoped queries on ownable resources.** Demo `/gymos*` routes already opt-out by being in `publicPaths`; new member-API routes must explicitly guard with the `X-Demo-Member-Id` header check (and document the bypass with a `// guard:allow-unscoped — demo D-07` marker where needed).
- **TypeScript everywhere.** All `.ts` / `.tsx`. Never `.js` / `.mjs`.
- **Prettier after edits** — `npx prettier --write <files>`.
- **No emojis as icons.** Use `@expo/vector-icons` Feather + MaterialCommunityIcons on mobile (NOT Tabler — Tabler is web-only). Agent chat output is **user-authored content**, so an emoji in a chat bubble is fine; an emoji in a tab bar is not.
- **No browser dialogs / RN `Alert.alert` for confirms** — use the existing RN `Modal` for confirmations on member side.
- **Optimistic UI by default.** Mutation pattern: generate client-side id, `queryClient.setQueryData(...)` optimistic update, navigate / close modal immediately, fire mutation in background, roll back on error.
- **Response status indicator** — every final response ends with the 🟢/🟡/🔴 block (executor agent concern, not researcher).
- **Always use shadcn primitives on web** — but on mobile we have no shadcn. Use Expo Router's `<Tabs>`, RN `Modal` for sheets, `<FlatList>` for lists, `@gorhom/bottom-sheet` (or fallback RN `Modal` — see Common Pitfalls).
- **No `studio_id` columns** — schema is already correctly tenanted; no work needed here.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **MEMBR-01** | Member can browse the upcoming week's class schedule in a mobile-optimised view | Reuse existing `gymos.schedule.tsx` loader shape; expose as `GET /api/m/schedule` action. Render with RN `<FlatList>` grouped by day. |
| **MEMBR-02** | Member can book a class from the app | New action `POST /api/m/bookings` mirroring `gymos.schedule.tsx` action (demo-grade INSERT, no atomic capacity). Header `X-Demo-Member-Id` resolves the actor. |
| **MEMBR-03** | Member can see their current pass balance and upcoming bookings | Reuse `gymos.members.$id.tsx` loader pattern: pass balance = SUM(grants) − SUM(debits) **as two separate aggregations** (D1-02 lesson — chained leftJoin double-counts). Expose as `GET /api/m/profile`. |
| **CAL-01** | Member can search for a food by name (OFF) and log it | OFF search v2 API + new action `POST /api/m/food-entries`. Snapshot kcal/macros into `food_entries` at log time (schema column already exists). |
| **CAL-02** | Member can scan a barcode and look up the food in OFF; log it if found | `expo-camera` `CameraView` + `useCameraPermissions` + `barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}` + OFF v2 product-by-barcode lookup. |
| **CAL-03** | Member can see daily totals (kcal + protein/carbs/fat) for today | Query `food_entries WHERE memberId = X AND date(loggedAt) = today`, sum the snapshotted columns. Action `GET /api/m/food-entries?date=YYYY-MM-DD`. |
| **AGENT-01** | Member can open a chat sheet from a persistent button and exchange messages | FAB + `@gorhom/bottom-sheet` (or RN `Modal` fallback) + `FlatList` of messages + TextInput at the bottom. State held locally in the screen (no persistence per D-15). |
| **AGENT-02** | Agent has 3 working tools end-to-end: `greet`, `book_class` (with confirmation), `log_food_nl` | Anthropic SDK `messages.create` (or `messages.stream`) with `tools: [...]` array. Each tool defined with JSON Schema. On `stop_reason === "tool_use"`, server executes the tool and posts back a `tool_result` block in the next turn. |
| **AGENT-03** | Agent response streams (SSE) to the chat sheet | Server route returns an SSE response (`Content-Type: text/event-stream`); SDK `messages.stream()` emits deltas server-side; RN client uses `react-native-sse` (works in Expo Go). |
| **WA-01** | Demo can receive at least one inbound WhatsApp message from a real phone and surface it in the inbox UI | New Hono app `apps/edge-webhooks/` (or ngrok-tunnelled local route for demo speed) verifying `X-Hub-Signature-256` (HMAC-SHA256 with app secret over raw body) and inserting into `messages` + upserting `conversations`. |
| **WA-02** | Demo can send at least one outbound WhatsApp message from the inbox UI | Direct Meta Graph API POST `https://graph.facebook.com/v23.0/{phone_number_id}/messages` from the existing `templates/mail/app/routes/gymos.tsx` send action. Demo bypasses the worker-layer 24h-window enforcement; relies on operator discipline. |
| **MEMAUTH-01** (stubbed) | Demo member-picker only | Member dropdown screen reads `GET /api/m/members/list`, writes selection to AsyncStorage. Caption "Demo only — production uses WhatsApp magic-link". |

## Summary

D2 has three concurrent integration surfaces (Expo native member app, an in-app LLM agent backed by Claude Sonnet 4.6, and the first real WhatsApp inbound webhook), all wired against the same Neon DB the staff surface uses. The "wow" of the demo is **camera-based barcode scan → packaged food → meal logged → daily totals update**, plus **member chats with agent, agent books a class for them**. Every other capability is a supporting beat.

The Expo project is already SDK 55 with Expo Router 55, React 19.2, and RN 0.83.9 — modern, Expo Go compatible, no native compile needed for the libraries this phase requires (`expo-camera` ships barcode scanning natively in Expo Go SDK 55; `@gorhom/bottom-sheet` peer-depends on `react-native-gesture-handler` ≥2.16.1 and `react-native-reanimated` ≥3.16.0, both of which are Expo Go compatible — but see Common Pitfall #4 about an open SDK 55 worklets crash that may force the RN `Modal` fallback). The bigger Expo Go gotcha is **SSE consumption**: native `EventSource` doesn't exist, and React Native's `fetch` does not implement `ReadableStream` reliably — we install `react-native-sse` (`^1.2.x`, XHR-backed, works in Expo Go without a custom dev client).

The server side stays inside `templates/mail/` (per D-01 / D0 fork-boundary loosening). All new member-API endpoints live as RR v7 resource routes at `templates/mail/app/routes/api.m.*.ts(x)`, gated by a small middleware that trusts `X-Demo-Member-Id` only when `DEMO_MODE=true && NODE_ENV !== 'production'`. The agent SSE route lives at `templates/mail/app/routes/api.m.agent.tsx` — it instantiates the Anthropic SDK server-side (API key never ships to the bundle), wires the tool loop, and proxies stream events to the RN client as SSE.

The WhatsApp side is intentionally narrow for demo: WA-01 (inbound) requires a publicly-reachable endpoint with HMAC verification — easiest demo path is **ngrok-tunnel a local Hono receiver during the live demo** rather than provisioning Fly today (saves ~2 hours). WA-02 (outbound) is one Graph API POST from the existing staff send-action; demo discipline (send only to a number that just messaged inbound, well within 24h window) replaces production's worker-layer enforcement.

**Primary recommendation:** Sequence the phase as: (Wave 0) strip `app/(tabs)/`, install deps, scaffold the 5-tab shell with auth-gate; (Wave 1) parallel — schedule/booking, today/food/barcode, member-picker auth, agent FAB+bottom-sheet; (Wave 2) parallel — agent SSE+tools wired to OFF and bookings, WhatsApp inbound webhook receiver, WhatsApp one-shot outbound from staff inbox. Each wave commits independently. Defer aesthetics polish to the back half of Day 7.

## Standard Stack

### Core

| Library | Version (verified 2026-05-19) | Purpose | Why Standard |
|---------|-------|---------|--------------|
| `expo` | `^55.0.17` (already installed) | RN runtime + Expo Go compat | Locked by existing `packages/mobile-app/package.json` |
| `expo-router` | `^55.0.13` (already installed) | File-system routing for RN | Mirrors RR v7 patterns (groups, dynamic `[id]`, layouts) — same mental model as staff-web |
| `react-native` | `0.83.9` (already installed) | RN | Locked |
| `react` | `^19.2.5` (already installed) | UI lib | Locked |
| `expo-camera` | `~55.0.18` (latest, npm view 2026-05-19) | Barcode scanning + camera permission flow | SDK 55-blessed barcode scanner. Native EAN-13/UPC-A/UPC-E support. `expo-barcode-scanner` is **deprecated** — do not use it. |
| `@react-native-async-storage/async-storage` | `^3.0.2` (already installed) | Persist selected demo member ID | Already in deps; standard RN persistence |
| `@expo/vector-icons` | `^15.1.1` (already installed) | Icon set (Feather + MaterialCommunityIcons) | Already in deps; project allows it on mobile (CLAUDE.md exemption from Tabler-only) |
| `@tanstack/react-query` | `^5.100.11` (latest, npm view 2026-05-19) | Client cache + mutation + refetch | Standard RN data lib; pairs with optimistic UI rule from CLAUDE.md |
| `@anthropic-ai/sdk` | `^0.97.0` (latest, npm view 2026-05-19) | Claude Messages API client (server-side only) | Official SDK; ships `messages.stream()` + tool runner helpers. Peer dep: `zod ^3.25.0 || ^4.0.0` (we have zod 4 already). |
| `react-native-sse` | `^1.2.1` (latest, npm view 2026-05-19) | EventSource polyfill for RN (XHR-backed) | Native `EventSource` doesn't exist in RN. `fetch + ReadableStream` is unreliable in Expo Go. This is the de facto standard. Works in Expo Go without a custom dev client. |

### Supporting

| Library | Version (verified) | Purpose | When to Use |
|---------|--------------------|---------|-------------|
| `@gorhom/bottom-sheet` | `^5.2.14` (latest, npm view 2026-05-19) | Native bottom-sheet for the agent chat surface (D-12) | First choice. Peer deps: `react-native-gesture-handler ^2.16.1+`, `react-native-reanimated ^3.16.0+` — both Expo Go compatible. **Confidence MEDIUM** — see Common Pitfall #4. |
| `react-native-gesture-handler` | `^2.31.2` (latest) | Peer for bottom-sheet | `npx expo install react-native-gesture-handler` |
| `react-native-reanimated` | `^4.3.1` (latest) | Peer for bottom-sheet | `npx expo install react-native-reanimated`. Note: 4.x requires the Babel plugin `react-native-worklets/plugin` (Reanimated 4 split worklets out). Add to `babel.config.js`. |
| `zod` | `^4.x` (already in workspace) | Action schema validation for `/api/m/*` routes | Already in agent-native catalog |
| `drizzle-orm` | `^0.45.x` (locked by agent-native) | Server-side DB calls | Already in workspace |

**RN bottom-sheet fallback (no extra deps):** If `@gorhom/bottom-sheet` proves unstable in Expo Go SDK 55 (see Pitfall #4), fall back to RN's built-in `<Modal animationType="slide" presentationStyle="pageSheet">` — this works out-of-box in Expo Go and is good enough for demo. Cost: less buttery animation, no swipe-down-to-dismiss gesture. Both options are acceptable for demo grade.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `expo-camera` | `expo-barcode-scanner` (deprecated) | Don't — formally deprecated; `expo-camera` is its replacement. |
| `expo-camera` | `react-native-vision-camera` | Higher fidelity + faster scan; **requires a custom dev client** (not Expo Go) → blocks customer demo flow. Defer to P2 if camera UX needs upgrading. |
| `react-native-sse` | `@falcondev-oss/expo-event-source-polyfill` (uses `expo/fetch`) | Newer, fewer downloads, requires Expo 52+ (we have 55 so it qualifies). Stick with `react-native-sse` for HIGH library maturity confidence — the polyfill is < 6 months old. |
| `@gorhom/bottom-sheet` | React Native `<Modal presentationStyle="pageSheet">` | Less polished but zero extra deps + zero peer-version risk. Use as fallback. |
| Anthropic SDK `toolRunner` helper | Manual tool loop with `messages.create` and `stop_reason === "tool_use"` detection | `toolRunner` is in `beta` namespace; we use the **manual loop** for production stability and because we want explicit control over the "confirm before booking" turn (D-13). |
| TanStack Query | SWR | Both work in RN. TanStack Query is the agent-native default elsewhere — use it for consistency. |
| OFF v0 API (`/api/v0/product/{ean}.json`) | OFF v2 API (`/api/v2/product/{ean}?fields=...`) | v2 supports `fields=...` to trim response payload — preferred for mobile bandwidth. Search endpoint is still `/cgi/search.pl` (no v2 search GA yet on world.openfoodfacts.org). Mix v0/v2 endpoints is normal. |

### Installation

```bash
# From repo root — pnpm filters to the mobile package
pnpm --filter @agent-native/mobile-app add @tanstack/react-query react-native-sse @gorhom/bottom-sheet

# Expo-managed installs (correct peer versions per SDK 55):
cd packages/mobile-app
npx expo install expo-camera react-native-gesture-handler react-native-reanimated

# Server-side (templates/mail) — Anthropic SDK
pnpm --filter mail add @anthropic-ai/sdk
```

After installing Reanimated 4.x, add to `packages/mobile-app/babel.config.js` (create if not present):

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"], // MUST be last
  };
};
```

**Version verification (against npm registry 2026-05-19):**

```
@tanstack/react-query → 5.100.11
react-native-sse      → 1.2.1
@gorhom/bottom-sheet  → 5.2.14
@anthropic-ai/sdk     → 0.97.0
expo-camera           → 55.0.18
react-native-reanimated → 4.3.1
react-native-gesture-handler → 2.31.2
```

## Architecture Patterns

### Recommended Project Structure

```
packages/mobile-app/                              # EDIT IN-PLACE (D-01)
├── app/
│   ├── _layout.tsx                               # Root Stack — add QueryClientProvider + auth-gate wrapper here
│   ├── pick-member.tsx                           # Member-picker first-launch screen (NEW)
│   ├── (tabs)/
│   │   ├── _layout.tsx                           # OVERWRITE — 4 GymOS tabs (Home / Schedule / Food / Profile)
│   │   ├── index.tsx                             # Home tab
│   │   ├── schedule.tsx                          # Schedule tab
│   │   ├── food.tsx                              # Food / Today tab
│   │   ├── profile.tsx                           # Profile tab (long-press → switch member)
│   │   └── [REMOVE all other (tabs)/* files per D-02]
│   └── _agent-fab.tsx                            # Floating action button + bottom-sheet (NEW — rendered by _layout)
├── lib/
│   ├── api.ts                                    # fetch wrapper that injects X-Demo-Member-Id (NEW)
│   ├── current-member.ts                         # AsyncStorage read/write for demo member id (NEW)
│   ├── query-client.ts                           # TanStack Query QueryClient + provider (NEW)
│   └── [REMOVE get-app-url.ts, use-apps.ts per D-02 — staff multi-app shell logic]
├── components/
│   ├── AgentSheet.tsx                            # The chat UI inside the bottom-sheet (NEW)
│   ├── BarcodeScanner.tsx                        # expo-camera wrapper with permission flow (NEW)
│   ├── KcalRing.tsx                              # Today screen progress ring (NEW)
│   └── [KEEP AppCard, AppForm — reusable primitives]
├── app.json                                      # KEEP — rebrand later
└── package.json                                  # MODIFY — add deps

templates/mail/                                   # SERVER SIDE — edit in-place (D0 precedent)
├── server/
│   └── lib/
│       └── demo-member.ts                        # NEW — gate helper: trusts X-Demo-Member-Id only in DEMO_MODE
└── app/
    └── routes/
        ├── api.m.profile.tsx                     # GET — member home (pass balance, next class, recent food)
        ├── api.m.members.list.tsx                # GET — list of 5 seeded members (for picker)
        ├── api.m.schedule.tsx                    # GET — week of occurrences
        ├── api.m.bookings.tsx                    # POST — book occurrence (demo-grade INSERT)
        ├── api.m.food-entries.tsx                # GET (today list) / POST (log entry)
        ├── api.m.foods.search.tsx                # GET — proxy to Open Food Facts search (server-side to allow attribution + later caching)
        ├── api.m.foods.barcode.$ean.tsx          # GET — proxy to OFF product-by-barcode
        ├── api.m.agent.tsx                       # POST (SSE) — agent chat endpoint with tool loop
        └── webhooks.whatsapp.tsx                 # POST (HMAC verify) + GET (verify-token handshake) — WA-01 receive

# (Optional for demo — only stand up if ngrok is unavailable)
apps/edge-webhooks/                               # Fly.io Hono app — webhooks live here in production v1
├── package.json
├── src/index.ts                                  # POST /webhooks/whatsapp + GET handshake + /healthz
└── fly.toml
```

### Pattern 1: Member-API gate (X-Demo-Member-Id, D-07)

**What:** Every `templates/mail/app/routes/api.m.*` resource route reads the demo member id from the header through a single helper, refusing the request unless `DEMO_MODE=true && NODE_ENV !== 'production'`. The helper returns the member row (or throws 401).

**When to use:** Every member-side API route in this phase.

**Example:**

```ts
// templates/mail/server/lib/demo-member.ts
import { getDb, schema } from "../db";
import { eq } from "drizzle-orm";

export async function requireDemoMember(request: Request) {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true") {
    throw new Response("Demo mode disabled", { status: 401 });
  }
  const memberId = request.headers.get("x-demo-member-id");
  if (!memberId) throw new Response("Missing X-Demo-Member-Id", { status: 401 });

  const db = getDb();
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

**Note on the unscoped-queries guard:** Member-API routes call ownable tables (`bookings`, `passes`, etc.) by `memberId` filter — that filter IS the access scope. CLAUDE.md's `guard-no-unscoped-queries.mjs` looks for `accessFilter` / `resolveAccess` / `assertAccess`, which don't exist on the GymOS schema (no `ownableColumns()` markers). The existing D1 routes are already exempt by virtue of being in `templates/mail/app/routes/gymos*` paths the guard doesn't scan. New `api.m.*.tsx` routes are in the same directory tree — same exemption applies — but add `// guard:allow-unscoped — demo D-07 (X-Demo-Member-Id gates access)` next to each query as a deliberate signal.

### Pattern 2: Mobile fetch wrapper (header injection)

**What:** Single client-side helper that reads the demo member id from AsyncStorage on every request and injects the header. TanStack Query queryFn calls this.

**When to use:** Every server call from the mobile app.

**Example:**

```ts
// packages/mobile-app/lib/api.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8081";

export async function apiFetch(path: string, init?: RequestInit) {
  const memberId = await AsyncStorage.getItem("demoMemberId");
  if (!memberId) throw new Error("No demo member selected");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Member-Id": memberId,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}
```

`EXPO_PUBLIC_API_BASE` defaults to the Vite dev server (`:8081`); over LAN this needs to be `http://<your-LAN-ip>:8081` so the phone running Expo Go can reach the laptop. Set it via `EXPO_PUBLIC_API_BASE=http://192.168.x.x:8081 npx expo start --tunnel` (the `--tunnel` flag uses Expo's ngrok-equivalent so the phone can reach the laptop even when not on the same WiFi).

### Pattern 3: expo-camera barcode scanning (CAL-02)

**What:** A reusable `<BarcodeScanner onScanned={...} />` component that handles permission UX, renders the live preview, fires the callback once, and unmounts.

**When to use:** Food → "Scan barcode" modal flow.

**Example:**

```tsx
// packages/mobile-app/components/BarcodeScanner.tsx
import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

type Props = { onScanned: (ean: string) => void };

export default function BarcodeScanner({ onScanned }: Props) {
  const [perm, requestPerm] = useCameraPermissions();
  const [done, setDone] = useState(false);

  if (!perm) return null; // permissions loading
  if (!perm.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>Camera permission is required to scan barcodes.</Text>
        <Pressable onPress={requestPerm} style={styles.btn}>
          <Text style={styles.btnText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <CameraView
      style={StyleSheet.absoluteFillObject}
      facing="back"
      barcodeScannerSettings={{
        barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
      }}
      onBarcodeScanned={(result) => {
        if (done) return;
        setDone(true);              // guard: callback can fire many times
        onScanned(result.data);     // BarcodeScanningResult.data is the decoded string
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  copy: { color: "#fff", textAlign: "center" },
  btn: { backgroundColor: "#3b82f6", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: "#fff", fontWeight: "600" },
});
```

**Confirmed BarcodeScanningResult fields (Expo SDK 55):** `type`, `data`, `cornerPoints`, `bounds`. (No `raw` field, contrary to some older tutorials.)

### Pattern 4: Open Food Facts proxy (CAL-01, CAL-02)

**What:** Server-side proxy through `templates/mail/app/routes/api.m.foods.*` so we (a) attribute correctly via User-Agent, (b) can swap in a cache later without changing the mobile client, (c) keep CORS issues away.

**When to use:** Both search + barcode lookup.

**Example (search):**

```ts
// templates/mail/app/routes/api.m.foods.search.tsx
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireDemoMember(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) return { results: [] };

  // OFF search — v2 not GA, use cgi/search.pl which is the documented stable endpoint
  // Source: https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/
  const offUrl =
    `https://world.openfoodfacts.org/cgi/search.pl` +
    `?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20`;

  const res = await fetch(offUrl, {
    headers: { "User-Agent": "GymOS-Demo/0.1 (https://gymos.local; demo@gymos.local)" }, // ODbL attribution
  });
  if (!res.ok) return { results: [], error: `OFF ${res.status}` };
  const json = (await res.json()) as { products?: any[] };

  const results = (json.products ?? []).slice(0, 20).map((p) => ({
    id: p.code,
    name: p.product_name ?? p.product_name_en ?? "Unknown",
    brand: p.brands ?? null,
    kcalPer100g: Number(p.nutriments?.["energy-kcal_100g"] ?? 0),
    proteinPer100g: Number(p.nutriments?.proteins_100g ?? 0),
    carbsPer100g: Number(p.nutriments?.carbohydrates_100g ?? 0),
    fatPer100g: Number(p.nutriments?.fat_100g ?? 0),
    servingSizeG: p.serving_size ?? null,
  }));
  return { results };
}
```

**Example (barcode):**

```ts
// templates/mail/app/routes/api.m.foods.barcode.$ean.tsx
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireDemoMember(request);
  const ean = params.ean;
  if (!ean) throw new Response("Missing ean", { status: 400 });

  // v2 barcode endpoint accepts ?fields= to trim the payload
  const offUrl =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}` +
    `?fields=code,product_name,brands,nutriments,serving_size`;

  const res = await fetch(offUrl, {
    headers: { "User-Agent": "GymOS-Demo/0.1 (https://gymos.local; demo@gymos.local)" },
  });
  if (!res.ok) return { found: false };
  const json = (await res.json()) as { status: number; product?: any };
  if (json.status !== 1 || !json.product) return { found: false };

  const p = json.product;
  return {
    found: true,
    item: {
      id: p.code,
      name: p.product_name ?? "Unknown",
      brand: p.brands ?? null,
      kcalPer100g: Number(p.nutriments?.["energy-kcal_100g"] ?? 0),
      proteinPer100g: Number(p.nutriments?.proteins_100g ?? 0),
      carbsPer100g: Number(p.nutriments?.carbohydrates_100g ?? 0),
      fatPer100g: Number(p.nutriments?.fat_100g ?? 0),
      servingSizeG: p.serving_size ?? null,
    },
  };
}
```

### Pattern 5: Anthropic agent SSE route with manual tool loop (AGENT-02, AGENT-03)

**What:** A POST route that accepts `{ messages: [...] }`, calls `client.messages.stream(...)` with tools, streams text deltas back to the client as SSE, and on `stop_reason === "tool_use"` executes the tool server-side and continues the conversation in a follow-up `messages.create` call. The "confirm before booking" turn is implemented as **explicit instruction in the system prompt** + the tool's `description` saying it requires a confirmation step.

**When to use:** The agent chat endpoint.

**Example:**

```ts
// templates/mail/app/routes/api.m.agent.tsx
import Anthropic from "@anthropic-ai/sdk";
import { requireDemoMember } from "../../server/lib/demo-member";
import { getDb, schema } from "../../server/db";
import { eq, sql } from "drizzle-orm";
import type { ActionFunctionArgs } from "react-router";

// Per claude-api research 2026-05-19: claude-sonnet-4-6 is current production
// (released 2026-02-17; claude-sonnet-4-7 does NOT exist; 4.8 is rumoured for
// mid-May 2026 but unverified at time of phase). Pin to 4-6.
const MODEL = "claude-sonnet-4-6";

const TOOLS = [
  {
    name: "greet",
    description: "Greet the member and list available capabilities. Call this once at session start if appropriate.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "book_class",
    description:
      "Book the member into a class occurrence. CRITICAL: you MUST confirm with the member BEFORE calling this tool — describe which class you intend to book, ask 'shall I confirm?', and only call book_class after they say yes.",
    input_schema: {
      type: "object",
      properties: {
        occurrenceId: { type: "string", description: "The class occurrence id from the schedule" },
      },
      required: ["occurrenceId"],
    },
  },
  {
    name: "log_food_nl",
    description:
      "Parse a natural-language food description ('I had a chicken caesar at Pret') into a food entry. Use Open Food Facts to find the best-matching item; if no good match, return an honest failure and ask the member to try a different description.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string" },
        mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
      },
      required: ["description", "mealType"],
    },
  },
] as const;

const SYSTEM_PROMPT = `You are GymOS Coach — a brief, kind, action-oriented in-app assistant for a member of a boutique fitness studio.

Rules:
- Be terse. One short paragraph per turn unless the member asks for detail.
- Before booking a class, always describe what you intend to book and ask the member to confirm.
- Never invent class times, members, or pass balances. If you don't have the info, say so.
- The member's first name is in <member> below. Address them by that name.
`;

export async function action({ request }: ActionFunctionArgs) {
  const member = await requireDemoMember(request);
  const { messages } = (await request.json()) as { messages: Array<{ role: "user" | "assistant"; content: any }> };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // Member context block — cached separately so it survives 5 min of follow-up turns
  const memberContext = JSON.stringify({
    firstName: member.firstName,
    memberId: member.id,
    // (Add pass balance / next booking lookups here in a more polished pass)
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventName: string, data: any) =>
        controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`));

      let turn = 0;
      let convo = [...messages];

      while (turn < 5) {
        const msStream = client.messages.stream({
          model: MODEL,
          max_tokens: 1024,
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" }, // 5m TTL — system prompt rarely changes
            },
            {
              type: "text",
              text: `<member>${memberContext}</member>`,
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: TOOLS as any,
          messages: convo as any,
        });

        msStream.on("text", (delta) => send("delta", { text: delta }));

        const finalMessage = await msStream.finalMessage();

        // Manual tool loop (per Anthropic SDK examples/tools.ts — not the beta toolRunner)
        if (finalMessage.stop_reason === "tool_use") {
          const toolUse = finalMessage.content.find((c) => c.type === "tool_use");
          if (!toolUse || toolUse.type !== "tool_use") break;

          send("tool_use", { name: toolUse.name, id: toolUse.id, input: toolUse.input });

          const result = await runTool(toolUse.name, toolUse.input as any, member.id);
          send("tool_result", { id: toolUse.id, result });

          // Append assistant turn + tool_result turn and continue
          convo = [
            ...convo,
            { role: "assistant", content: finalMessage.content },
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: JSON.stringify(result),
                },
              ],
            } as any,
          ];
          turn++;
          continue;
        }

        // No tool use → done.
        send("done", { stop_reason: finalMessage.stop_reason });
        break;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function runTool(name: string, input: any, memberId: string) {
  if (name === "greet") {
    return { ok: true, capabilities: ["book a class", "log food in natural language"] };
  }
  if (name === "book_class") {
    const db = getDb();
    const id = `bkg_${crypto.randomUUID()}`;
    await db.insert(schema.bookings).values({
      id,
      occurrenceId: input.occurrenceId,
      memberId,
      status: "booked",
      bookedByUserId: null,
      bookedAt: new Date().toISOString(),
    });
    return { ok: true, bookingId: id };
  }
  if (name === "log_food_nl") {
    // Phase 1: do a single OFF search on the literal text; pick top result.
    // Phase 2 (P2): LLM-mediated parse + multi-step disambiguation.
    const offUrl =
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(input.description)}` +
      `&search_simple=1&action=process&json=1&page_size=1`;
    const res = await fetch(offUrl, {
      headers: { "User-Agent": "GymOS-Demo/0.1 (https://gymos.local; demo@gymos.local)" },
    });
    if (!res.ok) return { ok: false, reason: "OFF unreachable" };
    const json = (await res.json()) as any;
    const p = json.products?.[0];
    if (!p) return { ok: false, reason: "No match" };

    const kcalPer100 = Number(p.nutriments?.["energy-kcal_100g"] ?? 0);
    const qtyG = 200; // sensible default — P2 / CAL-04 lets member adjust
    const db = getDb();
    const id = `fe_${crypto.randomUUID()}`;
    // foodItemId is required NOT NULL on the existing schema. Demo: insert a one-off
    // foodItems row first (the schema already supports this; production cache lives in P2 / CAL-09).
    const fiId = `fi_${crypto.randomUUID()}`;
    await db.insert(schema.foodItems).values({
      id: fiId,
      name: p.product_name ?? input.description,
      brand: p.brands ?? null,
      barcode: p.code ?? null,
      kcalPer100g: kcalPer100,
      proteinPer100g: Number(p.nutriments?.proteins_100g ?? 0),
      carbsPer100g: Number(p.nutriments?.carbohydrates_100g ?? 0),
      fatPer100g: Number(p.nutriments?.fat_100g ?? 0),
      source: "openfoodfacts",
      externalId: p.code ?? null,
      verified: false,
    });
    await db.insert(schema.foodEntries).values({
      id,
      memberId,
      foodItemId: fiId,
      loggedAt: new Date().toISOString(),
      mealType: input.mealType,
      quantityG: qtyG,
      kcal: (kcalPer100 * qtyG) / 100,
      proteinG: (Number(p.nutriments?.proteins_100g ?? 0) * qtyG) / 100,
      carbsG: (Number(p.nutriments?.carbohydrates_100g ?? 0) * qtyG) / 100,
      fatG: (Number(p.nutriments?.fat_100g ?? 0) * qtyG) / 100,
      source: "agent",
    });
    return { ok: true, foodEntryId: id, item: p.product_name ?? input.description };
  }
  return { ok: false, reason: "Unknown tool" };
}
```

### Pattern 6: React Native SSE consumption with `react-native-sse`

**What:** Open an `EventSource` to the SSE route, accumulate `delta` events into the current assistant message, handle `tool_use` / `tool_result` / `done` events.

**When to use:** The agent chat sheet (`components/AgentSheet.tsx`).

**Example:**

```ts
// packages/mobile-app/lib/agent-stream.ts
import EventSource from "react-native-sse";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8081";

export async function streamAgent(
  messages: any[],
  callbacks: {
    onDelta: (text: string) => void;
    onToolUse?: (e: { name: string; id: string; input: any }) => void;
    onToolResult?: (e: { id: string; result: any }) => void;
    onDone: () => void;
    onError: (err: any) => void;
  },
) {
  const memberId = await AsyncStorage.getItem("demoMemberId");
  if (!memberId) throw new Error("No member selected");

  const es = new EventSource(`${API_BASE}/api/m/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Member-Id": memberId,
    },
    body: JSON.stringify({ messages }),
  });

  es.addEventListener("delta", (e: any) => {
    const data = JSON.parse(e.data);
    callbacks.onDelta(data.text);
  });
  es.addEventListener("tool_use", (e: any) => callbacks.onToolUse?.(JSON.parse(e.data)));
  es.addEventListener("tool_result", (e: any) => callbacks.onToolResult?.(JSON.parse(e.data)));
  es.addEventListener("done", () => {
    callbacks.onDone();
    es.close();
  });
  es.addEventListener("error", (e: any) => {
    callbacks.onError(e);
    es.close();
  });

  return () => es.close();
}
```

### Pattern 7: WhatsApp inbound webhook (WA-01)

**What:** Two endpoints — `GET /webhooks/whatsapp` for the verify-token handshake, `POST /webhooks/whatsapp` for inbound messages. POST verifies `X-Hub-Signature-256` (HMAC-SHA256 with app secret) **against the raw request body before any JSON parsing**, then upserts conversation + inserts message.

**When to use:** WA-01 demo.

**Demo path (RECOMMENDED for D2):** Host inside `templates/mail/` as `app/routes/webhooks.whatsapp.tsx` and tunnel via `ngrok http 8081`. Saves the Fly deploy cycle for demo week. Document the production-target (Hono on Fly) explicitly in the route header comment so P1b knows to move it.

**Example (RR v7 resource route):**

```ts
// templates/mail/app/routes/webhooks.whatsapp.tsx
//
// DEMO ONLY — production target is apps/edge-webhooks/ on Fly (see PITFALLS #8).
// Hosting on Vercel/Netlify is fine for the demo because we're tunnelling
// through ngrok; Meta only sees the ngrok URL. Move to Fly for production
// to get always-on (no cold start), stable egress IP for Meta allowlisting.

import crypto from "node:crypto";
import { getDb, schema } from "../../server/db";
import { eq } from "drizzle-orm";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

// GET — verify-token handshake (https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// POST — inbound messages + status updates
export async function action({ request }: ActionFunctionArgs) {
  // 1. Raw body FIRST — must verify HMAC against exact bytes Meta sent.
  //    Per PITFALLS #9 — any JSON parse before signature check destroys the hash.
  const raw = await request.text();
  const sigHeader = request.headers.get("x-hub-signature-256") ?? "";
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", process.env.WHATSAPP_APP_SECRET!).update(raw).digest("hex");

  const sigBuf = Buffer.from(sigHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return new Response("Bad signature", { status: 401 });
  }

  // 2. NOW parse.
  const payload = JSON.parse(raw) as any;

  // 3. Idempotency — record webhook_event by external_id; skip if seen.
  const db = getDb();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const msg of value.messages ?? []) {
        const externalId = msg.id; // wamid
        const fromE164 = `+${msg.from}`;
        const messageType = msg.type as string;
        const body = messageType === "text" ? msg.text?.body ?? "" : null;

        // dedup
        const existing = await db
          .select()
          .from(schema.webhookEvents)
          .where(eq(schema.webhookEvents.id, `whatsapp:${externalId}`))
          .limit(1)
          .then((r) => r[0]);
        if (existing) continue;

        await db.insert(schema.webhookEvents).values({
          id: `whatsapp:${externalId}`,
          provider: "whatsapp",
          eventType: "messages.inbound",
          payloadRaw: raw,
        });

        // 4. Find or create the conversation by phone number.
        const member = await db
          .select()
          .from(schema.gymMembers)
          .where(eq(schema.gymMembers.phoneE164, fromE164))
          .limit(1)
          .then((r) => r[0] ?? null);

        if (!member) {
          // For demo: log + skip. Production (WA-03) creates a member-stub.
          continue;
        }

        let conv = await db
          .select()
          .from(schema.conversations)
          .where(eq(schema.conversations.memberId, member.id))
          .limit(1)
          .then((r) => r[0] ?? null);

        const now = new Date().toISOString();
        if (!conv) {
          const convId = `conv_${crypto.randomUUID()}`;
          await db.insert(schema.conversations).values({
            id: convId,
            memberId: member.id,
            channel: "whatsapp",
            status: "open",
            unreadCount: 1,
            lastInboundAt: now,
            lastMessagePreview: body ?? `(${messageType})`,
          });
          conv = { id: convId } as any;
        } else {
          await db
            .update(schema.conversations)
            .set({
              lastInboundAt: now,
              unreadCount: (conv.unreadCount ?? 0) + 1,
              lastMessagePreview: body ?? `(${messageType})`,
              updatedAt: now,
            })
            .where(eq(schema.conversations.id, conv.id));
        }

        await db.insert(schema.messages).values({
          id: `msg_${crypto.randomUUID()}`,
          conversationId: conv.id,
          externalId,
          direction: "in",
          messageType: messageType as any,
          body,
          payload: JSON.stringify(msg),
          status: "delivered",
        });
      }
    }
  }

  return new Response("OK", { status: 200 });
}
```

### Pattern 8: WhatsApp outbound from staff inbox (WA-02)

**What:** Direct `fetch` POST to Meta Graph API from the existing `gymos.tsx` action. Demo bypasses worker queue + 24h gate.

**When to use:** WA-02 single demo send.

**Example:**

```ts
// Inside templates/mail/app/routes/gymos.tsx action (added to existing send path)
async function sendWhatsAppOutbound(toE164: string, body: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_ACCESS_TOKEN!;
  const res = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164.replace(/^\+/, ""),
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) throw new Error(`Meta ${res.status}: ${await res.text()}`);
  return res.json();
}
```

### Anti-Patterns to Avoid

- **Anti-pattern: Calling Anthropic from the mobile bundle.** The API key would ship in the app binary. Always proxy through `templates/mail/app/routes/api.m.agent.tsx`.
- **Anti-pattern: Using `expo-barcode-scanner`.** Deprecated. Replaced by `expo-camera`'s built-in scanner.
- **Anti-pattern: Parsing the WhatsApp webhook body before HMAC verification.** Body parsing (via `request.json()`) loses the exact bytes Meta hashed. Always `request.text()` first, verify, then `JSON.parse`.
- **Anti-pattern: Spinner-after-click on booking / food-log.** Optimistic UI is mandatory per CLAUDE.md — update cache immediately, fire mutation in background, roll back on error.
- **Anti-pattern: `Alert.alert("Are you sure?", ...)` for in-app confirmations.** Use a styled RN `Modal` (or shadcn-style design — but on mobile, the dimmed scrim + sheet pattern is standard).
- **Anti-pattern: chaining a leftJoin through `passDebits` for pass balance.** D1-02 lesson — that fan-out double-counts. Use two separate aggregations: `SUM(passes.granted)` for grants, separate `SUM(passDebits.amount)` for debits.
- **Anti-pattern: Storing demo member id in component state.** Lost on reload. Use AsyncStorage and read once on app boot.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Barcode scanner | Custom MediaDevices + ZXing wrapper | `expo-camera` `CameraView` w/ `barcodeScannerSettings` | Already native in SDK 55; ZXing-in-JS is slow + battery-heavy + iOS-flaky |
| Anthropic streaming protocol | Hand-rolled SSE parsing on top of `fetch` | `@anthropic-ai/sdk` `messages.stream()` | SDK handles event reassembly, partial JSON, retries, error events |
| Anthropic tool loop | Custom JSON Schema validation + dispatch table | The SDK + a manual `stop_reason === "tool_use"` check | Reference implementation in `examples/tools.ts`; covered above in Pattern 5 |
| EventSource in RN | Custom XHR wrapper or fetch+ReadableStream polyfill | `react-native-sse` | Native EventSource doesn't exist in RN; this lib is the de facto standard, Expo Go compatible |
| WhatsApp HMAC verification | Custom timing-safe compare | `node:crypto` `createHmac` + `timingSafeEqual` | Stdlib; one-liner; canonical pattern in Meta's own docs |
| WhatsApp Cloud API client | A full client lib | Direct `fetch` for the demo, then `@great-detail/whatsapp` in P1b | A single outbound send is one POST; SDK overhead not worth it for demo |
| Food data | Curated nutrition CSV | OFF API | Decades of crowdsourced data, ODbL, free, no key. Hand-curating is impossible at scale. |
| Member-side optimistic mutations | Custom cache invalidation logic | TanStack Query `onMutate` / `onError` rollback | Standard pattern; well-documented |
| Sheet animation | Custom Animated.View with PanResponder | `@gorhom/bottom-sheet` (with RN `Modal` fallback) | Hand-rolled bottom-sheets are a rabbit hole — gestures, momentum, snap points, keyboard avoidance. Don't. |
| Macro target derivation | Mifflin-St Jeor formula in app code | **Hardcode for demo (D-10)** | Locked decision — defer to P2 |
| 24h-window enforcement (worker side) | Custom check at every send site | **None for demo (out-of-scope per D-14 / WA-05 deferred)** | Demo discipline replaces enforcement; production gets the chokepoint |

**Key insight:** Every "should we use a library?" answer in this phase points to YES, because each surface (Expo, Claude, OFF, SSE, HMAC, RN UI) has a mature standard library, and we're solving glue between them — not the underlying problem.

## Runtime State Inventory

> Phase D2 is greenfield additive — new code, new tables (none, all schema already exists), no rename / refactor. Verified by inspection of REQUIREMENTS.md (all D2 items are [D] new requirements, none are migrations of existing concepts).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by reading the existing schema (`templates/mail/server/db/schema.ts`) and confirming all phase D2 tables (`gymMembers`, `bookings`, `classOccurrences`, `classDefinitions`, `passes`, `passDebits`, `foodEntries`, `foodItems`, `conversations`, `messages`, `agentSessions`, `webhookEvents`) already exist with correct shape for D2 use. | None |
| Live service config | None — no production Meta WhatsApp number, no Datadog, no Cloudflare, no Tailscale to update. Demo phase. | None |
| OS-registered state | None — no Windows Task Scheduler, no pm2, no systemd registrations for GymOS. | None |
| Secrets/env vars | NEW vars required (not changes — additions): `ANTHROPIC_API_KEY` (server), `WHATSAPP_APP_SECRET` (server), `WHATSAPP_VERIFY_TOKEN` (server, chosen by us), `WHATSAPP_PHONE_NUMBER_ID` (server), `WHATSAPP_ACCESS_TOKEN` (server), `DEMO_MODE=true` (server), `EXPO_PUBLIC_API_BASE` (mobile, build-time). | Add to `templates/mail/.env.local` (already gitignored). Document in phase plan as a "User Setup Required" item. |
| Build artifacts / installed packages | None — fresh deps added via `pnpm add`; no stale egg-info / compiled artifacts to clear. | None |

## Common Pitfalls

### Pitfall 1: SSE through Expo Go via native `fetch` is unreliable

**What goes wrong:** A natural first try is `fetch(url).then(r => r.body.getReader())` to stream the response. In Expo Go (and bare RN), `r.body` is often `null` or doesn't behave as a real `ReadableStream`. Result: the agent looks frozen, then dumps the whole response at once when the stream closes.

**Why it happens:** React Native's `fetch` is a thin XHR wrapper. The Fetch API stream interfaces are only partially implemented depending on Hermes / JSC version; behaviour varies between iOS / Android / Expo Go.

**How to avoid:** Install `react-native-sse` (`^1.2.1`). It uses XHR `onprogress` under the hood, which is reliable. Works in Expo Go without a custom dev client — verified compatible with SDK 55 by the library's own README.

**Warning signs:** Agent message renders in one big chunk instead of streaming; `delta` events all fire after the request completes.

### Pitfall 2: WhatsApp HMAC fails because JSON middleware ran first

**What goes wrong:** `request.json()` in the route loader consumes the body, then we hash the re-stringified parsed JSON — but `JSON.stringify` doesn't reproduce the exact bytes (key order, whitespace, escaping all differ). Signature mismatch on every request.

**Why it happens:** Pitfall #9 in `PITFALLS.md`. Even mentioning JSON.parse before the HMAC step is enough to write the wrong code.

**How to avoid:** `await request.text()` first, do `createHmac().update(raw)`, *then* `JSON.parse(raw)`. The example in Pattern 7 follows this discipline.

**Warning signs:** Every webhook returns 401 "Bad signature" in dev. Bypassing the check shows the message arrives correctly, confirming the signature path is the only break.

### Pitfall 3: 24h-window violation suspends the WhatsApp number

**What goes wrong:** Coach sends a free-text outbound to a member whose last inbound was > 24h ago. Meta returns 200, but quality rating drops, then the number is suspended. Demo dies.

**Why it happens:** D-14 / WA-05 (worker-layer enforcement) is explicitly deferred to P1b. Demo trusts operator discipline.

**How to avoid:** For WA-02 demo path, send only to a number that *just* messaged in inbound. Document this constraint in the phase plan as a **manual checkpoint** before the live demo. Optionally: surface `conversations.lastInboundAt` next to the send button as a UI hint (cheap, helps human discipline).

**Warning signs:** Sent messages show as "Pending" indefinitely in WhatsApp Manager; quality rating in WhatsApp Manager flips from Green → Yellow.

### Pitfall 4: `@gorhom/bottom-sheet` crash on SDK 55 with Reanimated worklets

**What goes wrong:** Open the agent FAB → bottom-sheet → app crashes on iOS with "Tried to synchronously call a non-worklet function `addListener` on the UI thread" (open issue thread on `expo/expo#42886`). Or the sheet doesn't show up at all on certain iOS builds.

**Why it happens:** Reanimated 4.x split worklets into `react-native-worklets`; some library bindings haven't caught up. Reproduces specifically on Expo Go SDK 55 + reanimated 4 + latest bottom-sheet.

**How to avoid (decision tree):**
- **Option A — try `@gorhom/bottom-sheet` first.** If it works in your local Expo Go on day 1, ship it. The library is the production-quality choice.
- **Option B — fallback to RN `<Modal>`.** Zero extra deps, works on every RN version Expo supports. Lose: swipe-to-dismiss, momentum, snap points. Keep: dimmed scrim, slide animation, tap-outside-to-close. Demo-acceptable.
- **Decision point:** make this call in Wave 0 / Wave 1 with a 30-minute smoke test. Don't push through option A if it crashes — pivot immediately.

**Warning signs:** Red-screen crash on first bottom-sheet open; sheet renders blank; gesture handler errors in Metro logs.

### Pitfall 5: Mobile pass-balance double-count via chained leftJoin (the D1-02 lesson)

**What goes wrong:** Naively writing `db.select().from(gymMembers).leftJoin(passes).leftJoin(passDebits).groupBy(gymMembers.id)` — `granted` gets counted once per debit row (cartesian fan-out).

**Why it happens:** Standard SQL pitfall when summing two many-to-many relations through the same root in one query.

**How to avoid:** Two separate aggregations (the D1-02-established pattern):

```ts
// Granted total
const grantedRows = await db
  .select({ memberId: schema.passes.memberId, total: sql<number>`COALESCE(SUM(${schema.passes.granted}), 0)` })
  .from(schema.passes)
  .where(eq(schema.passes.memberId, memberId))
  .groupBy(schema.passes.memberId);

// Debits total — joined through passes to scope by member
const debitRows = await db
  .select({ total: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)` })
  .from(schema.passDebits)
  .leftJoin(schema.passes, eq(schema.passDebits.passId, schema.passes.id))
  .where(eq(schema.passes.memberId, memberId));

const passBalance = Number(grantedRows[0]?.total ?? 0) - Number(debitRows[0]?.total ?? 0);
```

**Warning signs:** Member's pass balance keeps growing as they debit more (because each debit duplicates the granted row in the fan-out).

### Pitfall 6: Camera permission denied → blank screen forever

**What goes wrong:** First-time `<CameraView>` mounts without permission, returns nothing, member sees a black square, app feels broken.

**Why it happens:** `useCameraPermissions()` initially returns `null` (loading), then a denied permission object on second render. If you only render the camera when `perm.granted`, the user gets stuck because nothing prompts them.

**How to avoid:** Three-state render in `BarcodeScanner` (already shown in Pattern 3): loading (`!perm`), denied (`!perm.granted` — render Grant button), granted (render `<CameraView>`). The button calls `requestPermission()` which fires the OS dialog.

**Warning signs:** Camera screen renders an empty View; iOS settings shows the app has no camera permission.

### Pitfall 7: OFF returns null nutriments on many real products

**What goes wrong:** Member scans a real packaged food, OFF has the product, but the `nutriments` object only has Nutri-Score grades, not raw `energy-kcal_100g`. The food logs as 0 kcal.

**Why it happens:** OFF is crowdsourced; coverage of macros varies wildly by product and region.

**How to avoid:**
1. Cast every nutriment with `Number(...)` and `?? 0` defaults — never assume the field exists.
2. After lookup, if `kcalPer100g === 0`, surface a one-line message in the UI: "Couldn't read nutrition info from the database — try a different product or search by name."
3. Don't silently log a 0-kcal entry.

**Warning signs:** Today screen shows scanned items with `0 kcal · 0g protein`.

### Pitfall 8: Expo Go LAN connection from phone → laptop fails

**What goes wrong:** Customer scans the Expo QR code, app loads, then every API call to `http://localhost:8081/api/m/*` fails because `localhost` resolves to the phone, not the laptop.

**Why it happens:** `localhost` is per-device. Phone has no idea what the laptop's IP is.

**How to avoid:**
- **Option A — `npx expo start --tunnel`** uses Expo's ngrok-equivalent. Slower (extra hop) but works across networks.
- **Option B — set `EXPO_PUBLIC_API_BASE=http://<laptop-LAN-ip>:8081`** before `npx expo start`. Works when phone + laptop are on the same WiFi. Faster than tunnel.
- For the live customer demo: use **Option A** (tunnel). Latency cost is acceptable; cross-network robustness is non-negotiable.

**Warning signs:** App loads, but every screen shows "Network error" — confirms it's an API URL issue, not a code issue.

### Pitfall 9: Anthropic SDK runs server-only — bundling fails on mobile

**What goes wrong:** Importing `@anthropic-ai/sdk` from mobile code throws at Metro bundle time, or runs but exposes the API key.

**Why it happens:** SDK is server-targeted; relies on Node-specific APIs. Even if it bundled, shipping the API key in `EXPO_PUBLIC_*` is a leak.

**How to avoid:** Only import `@anthropic-ai/sdk` in `templates/mail/server/` and `templates/mail/app/routes/api.m.agent.tsx`. The mobile app talks to the agent via SSE; it never touches Anthropic directly.

**Warning signs:** Metro error mentioning `node:fs` or `node:stream` resolution; or, worse, no error and the key appears in `EXPO_PUBLIC_*`.

## Code Examples

All code examples are in Architecture Patterns sections 1–8 above. Verified against:

- Anthropic SDK `examples/tools.ts` (manual tool loop) — https://github.com/anthropics/anthropic-sdk-typescript/blob/main/examples/tools.ts
- Anthropic SDK `helpers.md` (`messages.stream` API) — https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md
- Expo Camera SDK 55 docs — https://docs.expo.dev/versions/v55.0.0/sdk/camera/
- Open Food Facts API tutorial — https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/
- Meta WhatsApp Cloud API webhooks — https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
- D1-02 SUMMARY pass-balance pattern — `.planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/D1-02-members-directory-SUMMARY.md`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `expo-barcode-scanner` standalone package | `expo-camera`'s built-in `barcodeScannerSettings` | Expo SDK 51 (mid-2024) | One fewer dep; same / better fidelity |
| `claude-3-5-sonnet-20241022` | `claude-sonnet-4-6` (released 2026-02-17) | Feb 2026 | 1M token context (beta); better tool use; same $3 / $15 pricing |
| Anthropic SDK `messages.stream` with manual event parsing | SDK ships `.on('text', ...)` helper for delta accumulation | SDK 0.30+ | Less boilerplate; still need manual tool loop for explicit control |
| Reanimated 3.x worklets bundled | Reanimated 4.x splits to `react-native-worklets` | Reanimated 4 (early 2026) | Mandatory babel plugin change; some library bindings still catching up (see Pitfall #4) |
| WhatsApp official Node SDK | `@great-detail/whatsapp` fork | Meta paused official SDK 2024-12 | Demo can ignore; P1b uses the fork via thin adapter |

**Deprecated/outdated:**
- `expo-barcode-scanner` — replaced by `expo-camera`
- `claude-sonnet-3-5-*` — superseded by 4.5 / 4.6
- Native RN `fetch` + `ReadableStream` for SSE in Expo Go — not reliable; use `react-native-sse`

## Open Questions

1. **Does `@gorhom/bottom-sheet` 5.2.14 + Reanimated 4.3.1 work in Expo Go SDK 55 today?**
   - What we know: open issues exist (#42886) with worklet errors on similar version combos; the library is actively maintained.
   - What's unclear: whether the open issue affects every iOS run or only specific configurations.
   - Recommendation: spike it in 30 minutes in Wave 0 / Wave 1. If broken, fall back to RN `<Modal presentationStyle="pageSheet">` immediately.

2. **Will Meta's webhook subscription accept an ngrok URL for a live customer demo without prior allowlisting?**
   - What we know: ngrok URLs are commonly used for WhatsApp webhook dev; the verify-token handshake doesn't require IP-allowlisting at registration time.
   - What's unclear: whether the customer's Meta Business Account has any IP-allowlist enabled that would reject ngrok.
   - Recommendation: validate by end of Day 4 — register the ngrok URL in Meta's webhook config and send one inbound test message. If it fails, fall back to standing up `apps/edge-webhooks/` on Fly (~2 hours).

3. **What test phone number does the demo use?**
   - What we know: WA-01/WA-02 require at least one real WhatsApp Business phone (Meta sandbox provides a test number for free for development).
   - What's unclear: whether the customer's number is already provisioned and 2FA-clean, or whether we use the Meta sandbox.
   - Recommendation: prefer the Meta test number for demo — zero setup, zero risk to customer's real number. Customer's real number stays for P0 / customer onboarding checklist (FND-07).

4. **Does the `tunnel` mode add too much latency for the agent demo?**
   - What we know: Expo tunnel adds ~200-500ms per round-trip; SSE keeps the connection open so this is a one-time cost per agent turn.
   - What's unclear: how it feels live with the customer.
   - Recommendation: try `tunnel` first; if the agent's first token feels sluggish, switch to LAN with `EXPO_PUBLIC_API_BASE=http://<lan-ip>:8081` and `npx expo start` (no tunnel) the day of the demo.

5. **What happens if OFF returns no nutriments for a barcode the member scans live during the demo?**
   - What we know: OFF coverage varies by region; UK packaged foods are well-represented.
   - What's unclear: how the specific items the customer has on hand will look.
   - Recommendation: pre-test the demo with 3 specific products the customer brings; cache their barcode IDs in the seeded `food_items` table so the demo path is guaranteed to work even if OFF latency spikes.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | All server-side work | ✓ | v24.15.0 | — |
| pnpm | All package management | ✓ | 10.29.1 | — |
| Expo CLI | Mobile dev | ✓ (auto-installed via `npx expo`) | 55.0.24 | — |
| Expo Go on customer's phone | Demo delivery | ⚠ NEEDS USER ACTION | iOS App Store / Google Play | — |
| Neon Postgres | DB | ✓ | configured in `templates/mail/.env.local` | — |
| Anthropic API key | Agent | ⚠ NEEDS USER ACTION (paid account) | — | None — agent demo is hard-gated on this |
| Meta WhatsApp test number + app secret | WA-01, WA-02 | ⚠ NEEDS USER ACTION | — | Meta sandbox test number (free) |
| ngrok or Cloudflare Tunnel | WA-01 webhook reachability | ⚠ NEEDS USER ACTION | — | Stand up `apps/edge-webhooks/` on Fly (~2 hours) |
| Customer's Apple device with iOS 16+ | Expo Go demo | ⚠ ASSUMED YES (customer has iPhone per project notes) | — | Use Android Expo Go (also free), or iOS Simulator on laptop (won't impress in demo) |

**Missing dependencies with no fallback:**
- Anthropic API key — agent surface (AGENT-01/02/03) cannot ship without it. Confirm customer is OK with the API cost (rough demo: ~$0.50 / 100 turns at Sonnet 4.6 pricing $3/$15 per Mtok).

**Missing dependencies with fallback:**
- WhatsApp test phone access — Meta sandbox is the fallback (zero-cost, fast to set up). Document the sandbox approach in the phase plan as the default path; only escalate to a real Business phone if the customer specifically requests showing their own number.
- ngrok — Fly deploy is the fallback. Demo plan should default to ngrok (saves time) but provision the Fly path as a stretch if ngrok proves flaky.

## Sources

### Primary (HIGH confidence)

- [Anthropic SDK TypeScript — examples/tools.ts](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/examples/tools.ts) — Verified manual tool loop pattern (Pattern 5).
- [Anthropic SDK TypeScript — helpers.md](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md) — Verified `messages.stream` `.on('text', ...)` event helper.
- [Expo Camera SDK 55 docs](https://docs.expo.dev/versions/v55.0.0/sdk/camera/) — Verified `CameraView`, `useCameraPermissions`, `barcodeScannerSettings`, `onBarcodeScanned`, supported barcode types.
- [Open Food Facts API tutorial](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/) — Verified v2 product-by-barcode endpoint, `fields=` parameter, search endpoint location.
- [Anthropic Models overview](https://platform.claude.com/docs/en/about-claude/models/overview) — Verified `claude-sonnet-4-6` as current production Sonnet (released 2026-02-17). `claude-sonnet-4-7` does not exist.
- [Anthropic prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — Verified `cache_control: { type: "ephemeral" }` syntax + 5m TTL + 1h TTL extension.
- npm registry `npm view <package> version` — verified all package versions on 2026-05-19.
- `packages/mobile-app/package.json` — direct inspection confirms Expo 55 + RN 0.83.9 + React 19.2 + Expo Router 55 + AsyncStorage + Feather/MaterialCommunityIcons already installed.
- `templates/mail/server/db/schema.ts` — direct inspection confirms all D2 tables exist with correct shape; no migrations needed.
- `templates/mail/server/plugins/auth.ts` — direct inspection confirms `/gymos*` paths already in `publicPaths`; `/api/m/*` and `/webhooks/whatsapp` need adding.

### Secondary (MEDIUM confidence)

- [react-native-sse README](https://github.com/binaryminds/react-native-sse) — Verified XHR-based EventSource polyfill; community-validated for Expo Go usage.
- [WhatsApp Cloud API webhook guides (Pons, WASenderApi, chatarmin)](https://pons.chat/blog/whatsapp-cloud-api-webhook-nextjs) — Multiple sources agree on `X-Hub-Signature-256` HMAC-SHA256 over raw body, GET handshake using `hub.verify_token` + `hub.challenge`. Cross-checked against [Meta's own docs](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks).
- [Open Food Facts cgi/search.pl endpoint](https://world.openfoodfacts.org/data) — Search endpoint URL confirmed; v2 search not GA.

### Tertiary (LOW confidence)

- `@gorhom/bottom-sheet` × Expo Go SDK 55 compatibility — Multiple open issues (#42886, #32357) suggest intermittent crash conditions with Reanimated 4 worklets. **Flag for Wave 0 spike** — verify before committing to it. Fall back to RN `<Modal>` if broken.
- Expo Go iOS SDK 55 availability via App Store — community reports App Store version is still on SDK 54 as of early May 2026, with SDK 55 in TestFlight. Verify the day of the demo; may need to use Android Expo Go or have the customer join the TestFlight beta.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every package version verified against live npm registry on 2026-05-19; Expo SDK + RN versions verified by direct file inspection.
- Architecture patterns: HIGH — all 8 patterns either ported from D1-shipped code or directly from official SDK/API docs. WhatsApp HMAC pattern cross-verified across 4 independent sources.
- Pitfalls: HIGH for #1, #2, #3, #5, #6, #7, #8, #9 (verified mechanisms); MEDIUM for #4 (active library compatibility issue, exact reproduction unverified).
- WhatsApp demo path: MEDIUM — ngrok vs Fly call is a tactical choice with no clear winner; both paths are documented.
- Agent UX feel: LOW — streaming latency from server-Anthropic-server-mobile chain hasn't been measured; needs live spike in Wave 1.

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (30 days) for stable surfaces (Expo, OFF, WhatsApp Cloud API). 2026-05-26 (7 days) for Claude model recommendations (Anthropic releases Sonnet 4.8 may land mid-May per leaked source maps — re-verify `MODEL` constant before locking).

---

*Phase: D2-member-mobile-app-calorie-counter-agent-days-4-7*
*Research complete: 2026-05-19*
