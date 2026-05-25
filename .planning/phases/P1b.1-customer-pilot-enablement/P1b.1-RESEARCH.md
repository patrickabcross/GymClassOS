# Phase P1b.1: Customer Pilot Enablement — Research

**Researched:** 2026-05-25
**Domain:** Staff-web layout surgery, WhatsApp template send UI, analytics aggregations, auth allowlist, agent grounding
**Confidence:** HIGH (all findings from direct codebase reads)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Layout / chrome strip**
- D-01: AgentSidebar-only wrapper for `/gymos/*`. Add `isGymosPath(pathname)` to `AppLayout.tsx` (sibling to `BARE_ROUTES` set at line 79). When path starts with `/gymos`, return `<AgentSidebar position="right" defaultOpen={!isMobile} emptyStateText="Ask me anything about your gym" suggestions={[…]}>{children}</AgentSidebar>` — no `AppLayoutInner`, no `StandardLayout`, no email header/sidebar/Compose/bell.
- D-02: Hard-redirect `/` and leftover email URLs to `/gymos`. Root redirect already done (`_index.tsx` + `$view.tsx`). No new work needed.

**Templates send path**
- D-03: Seed fixtures + `hello_world` bridge. Pre-seed `whatsapp_templates` with 5 rows: `hello_world` (approved), plus `class_reminder`/`waitlist_offer`/`payment_failed`/`pass_expiring` (pending). WA-08 cron replaces these when real approvals land.
- D-04: Single-Dialog picker. shadcn `<Dialog>` with left list / right variable form + preview / Send footer.
- D-05: "Templates" button beside Send in `gymos._index.tsx:528` reply Form. Optimistic insert (`status='queued'`), then `enqueueOutboundWhatsApp` with `type: 'template'` payload.

**Customer auth provisioning**
- D-06: Google OAuth only (already wired). Customer brings Gmail/Workspace account.
- D-07: `CUSTOMER_ALLOWED_EMAILS` env allowlist. After-signin hook in `apps/staff-web/server/plugins/auth.ts`. Mismatch → sign out + redirect `/access-denied`. Replace with org-ACL in P1a.

**Agent grounding**
- D-08: Replace `agent-chat.ts` system prompt + action registry with gym version.
- D-09: Minimum gym action set — `list-renewals`, `list-fill-rate`, `list-at-risk-members` + shared `list-classes`, `list-members`, `view-screen`, `navigate`.
- D-10: Replace `apps/staff-web/AGENTS.md` entirely with gym version.

### Claude's Discretion
- Analytics metric list (planner picks from: fill rate, cancellation rate, no-show rate, pass utilisation).
- Better-auth user-row pre-seed vs auto-create on first sign-in.
- AgentSidebar suggestions per route (hardcoded is fine for pilot).
- Extract `<GymosLayout>` wrapper component vs inline in `AppLayout.tsx`.
- `list-renewals` data source: `stripe_subscriptions` only vs also `member_passes`.

### Deferred Ideas (OUT OF SCOPE)
- Coach/admin role split enforcement (P1a / AUTH-02).
- Email magic-link for staff (P1a / MEMAUTH-02).
- Real Meta template approvals submitted via API (P0 / FND-07 — seeded for pilot).
- Per-org or per-studio allowlist via DB table (P1a).
- Agent-driven booking mutations (`book-member`, `cancel-booking`) (P2).
- Date-range picker on `/gymos/analytics` (P2).
- Cross-route AgentSidebar suggestions (P2 polish).
- Mail dogfooding in this deploy (separate non-prod deploy if needed).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Coach can sign in to staff-web with email + password (extends to customer accounts via Google OAuth allowlist) | D-06/D-07 — Google OAuth already wired; `auth.ts` allowlist hook is the delivery mechanism |
| WA-05 | Single `sendMessage()` chokepoint in the worker — staff-web enqueues, never calls Meta directly | `enqueueOutboundWhatsApp` with `type:'template'` payload already typed in `packages/queue/src/types.ts`; Templates dialog reuses this exact path |
| WA-06 | `sendMessage()` enforces 24h window at call time | Worker gates are live from P1b-06; template sends bypass the window gate (confirmed in P1b-06 SUMMARY: "allows template send OUTSIDE window") |
| WA-07 | `whatsapp_opt_in` table tracks opt-in; sendMessage refuses without it | Already enforced at worker; Templates dialog must also surface this in pre-flight UI (disabled Send if no opt-in) |
| INBX-01 | Coach can view list of conversations | Already shipped; this phase strips the email chrome wrapping it |
| INBX-02 | Coach can open a conversation and see message history | Already shipped; chrome strip is the only INBX-02 touch point |
| AGENT-04 | Conversation history persists across sessions (`agent_sessions` table) | Table exists in schema; agent plugin needs gym system prompt that reads from gym tables |
| AGENT-05 | Per-member memory (`agent_memory` table) | Deferred P2 in REQUIREMENTS.md — note: CONTEXT.md D-08/09/10 pull this forward as "gym-aware agent surface" for pilot. Delivery is system prompt + actions, not an `agent_memory` table |
</phase_requirements>

---

## Summary

Phase P1b.1 is a single-focused surgery on the deployed staff-web: strip email chrome, surface the WhatsApp template send path through a Dialog, add an Analytics route, gate access with an email allowlist, and replace the mail agent with a gym-aware one. All five work streams have been validated against the actual codebase — no architectural surprises.

The heaviest work is the gym agent surface (D-08/09/10): three new `defineAction` actions plus rewriting the `agent-chat.ts` plugin and `AGENTS.md`. The layout strip (D-01) is a 20-line conditional in `AppLayout.tsx`. The Templates Dialog (D-03/04/05) is a new client-side component wired to an existing server action pattern. The auth allowlist (D-07) is a hook in `auth.ts`. Analytics (D-Claude) is three live SQL aggregations in a new route.

**Primary recommendation:** Execute in four waves: (1) layout strip + redirect polish, (2) auth allowlist + access-denied page, (3) Templates dialog + seed data, (4) gym agent surface + analytics route. Waves 1-2 unlock the customer to sign in cleanly. Wave 3 unlocks template sends. Wave 4 completes the pilot UX.

---

## Standard Stack

All libraries are already installed. No new packages needed for this phase.

### Core (already in apps/staff-web)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| React Router v7 | ^7.x | Routes, loaders, actions | New route: `gymos.analytics.tsx` |
| Drizzle ORM | ^0.45.x | DB queries | Analytics aggregations use `sql` template; no new tables |
| Better-auth | ^1.6.x | Auth sessions | Extend `auth.ts` with allowlist after-signin hook |
| shadcn/ui | installed (48 components) | Dialog, Badge, ScrollArea, Skeleton, Card, Tabs | All already installed per UI-SPEC |
| @tabler/icons-react | installed | Icons | `IconTemplate` for Templates button |
| Sonner | ^2.0.x | Toast notifications | "Template queued" toast |
| TanStack Query | ^5.x | Client-side cache/optimistic UI | Templates dialog send uses existing mutation pattern |
| Zod | ^4.x | Schema validation | New action schemas |
| @gymos/queue | workspace | `enqueueOutboundWhatsApp` | Already imported in `gymos._index.tsx` |

### No New Packages
This phase is pure configuration, new routes, new actions, and component additions. The `defineAction` pattern, `getDb`, `schema`, shadcn Dialog, and the queue publisher are all already wired.

---

## Architecture Patterns

### 1. AppLayout.tsx Conditional Return (D-01)

**Current shape (lines 124-151):**
```typescript
export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  if (BARE_ROUTES.has(location.pathname)) {
    return <>{children}</>;
  }
  const content = isStandardLayoutPath(location.pathname) ? (
    <StandardLayout>{children}</StandardLayout>
  ) : (
    <AppLayoutInner>{children}</AppLayoutInner>  // ← email chrome lives here
  );
  return (
    <AgentSidebar position="right" defaultOpen={!isMobile} ...>
      {content}
    </AgentSidebar>
  );
}
```

**D-01 change — add gymos branch BEFORE the email check:**
```typescript
export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const isMobile = useIsMobile();

  if (BARE_ROUTES.has(location.pathname)) {
    return <>{children}</>;
  }

  // NEW: Gymos paths skip email chrome entirely — AgentSidebar only.
  if (location.pathname.startsWith("/gymos")) {
    return (
      <AgentSidebar
        position="right"
        defaultOpen={!isMobile}
        emptyStateText="Ask me anything about your gym"
        suggestions={[
          "Provide renewal numbers",
          "Which classes haven't been filled in the last week?",
          "Which customers should I reach out to?",
        ]}
      >
        {children}
      </AgentSidebar>
    );
  }

  // ... existing email / standard layout logic unchanged
}
```

**Key insight:** `gymos.tsx` already wraps `GymosTopNav + <Outlet />`. `AppLayout` only needs to stop injecting `AppLayoutInner`. The AgentSidebar suggestions are already gym-flavored at `AppLayout.tsx:142-146` (in the existing outer `AgentSidebar` wrap that also wraps email routes) — the D-01 branch simply isolates this for gymos paths with no email deps.

**No `isGymosPath()` helper needed** — `location.pathname.startsWith("/gymos")` inline is sufficient and idiomatic alongside the existing `BARE_ROUTES` pattern.

### 2. Templates Dialog Pattern

**Button placement in `gymos._index.tsx:528` reply Form:**
```tsx
<div className="flex gap-2">
  <Input name="body" ... />
  <TemplatesButton conversationId={data.selectedConversation.id}
                   hasOptIn={selectedHasOptIn} />
  <Button type="submit" disabled={!canSendText || !reply.trim()}>Send</Button>
</div>
```

**`TemplatesButton` is a client component that:**
1. Reads `whatsapp_templates` from a new `list-templates` action (or via loader data — see below).
2. Opens a shadcn `<Dialog>`.
3. On Send, calls `enqueueOutboundWhatsApp` with `{ type: 'template', name, vars, language: 'en_US' }`.
4. Optimistically inserts a `messages` row with `status='queued'` (same pattern as free-text send at line 265-305).

**Template payload shape (already typed in `packages/queue/src/types.ts`):**
```typescript
// type: 'template' variant of OutboundWhatsAppPayload.payload
{
  type: 'template',
  name: string,          // e.g. 'hello_world'
  vars: Record<string, string>,  // e.g. { "1": "Alice" }
  language?: string,     // defaults to 'en_US' in sendMessage
}
```

**Loader-side option (simpler):** Add `whatsapp_templates` to the existing `gymos._index.tsx` loader. Since the loader already fans out multiple DB queries, appending `db.select().from(schema.whatsappTemplates)` is consistent with the established pattern and avoids a separate action for a read.

**Action for send (new action `send-template`):** Inserts the `messages` row + calls `enqueueOutboundWhatsApp`. This is identical to the existing `action()` in `gymos._index.tsx` but with `payload: { type: 'template', name, vars }` instead of `type: 'text'`. The cleanest option for the planner: inline in the same `action()` function with a `_intent` discriminator, or a separate `send-template.ts` action.

**Recommendation:** Inline discriminated intent in the existing `gymos._index.tsx` action (add `_intent: 'send-template'` hidden field). Avoids creating a new action solely to call `enqueueOutboundWhatsApp` — the queue publisher is already imported there.

### 3. `whatsapp_templates` Table — Already Exists

Table confirmed in `schema.ts` (lines 348-361):
```typescript
export const whatsappTemplates = table("whatsapp_templates", {
  name: text("name").primaryKey(),      // e.g. 'hello_world'
  status: text("status", {
    enum: ["pending", "approved", "rejected", "paused", "disabled"],
  }).notNull(),
  category: text("category", ...),
  language: text("language").notNull().default("en_US"),
  componentsJson: text("components_json").notNull(), // raw Meta API JSON
  lastSyncedAt: text("last_synced_at").notNull().default(now()),
});
```

**No new migration needed.** The table was created in P1b-02. P1b.1 only inserts seed rows.

**Variable extraction from `components_json`:** The body component contains `{{1}}` placeholders (positional). For the pilot, variable inputs are labeled by position ("Variable 1", "Variable 2") since named variables are a Meta Business API v23 feature and the seeded templates are simple. The `hello_world` template has NO variables (plain "Hello World" body component).

**Seeded `hello_world` `components_json`:**
```json
{"components":[{"type":"BODY","text":"Hello World"}]}
```

**Seeded named templates (4 × pending):**
- `class_reminder`: `{"components":[{"type":"BODY","text":"Hi {{1}}, your {{2}} class is tomorrow at {{3}}. See you there!"}]}`
- `waitlist_offer`: `{"components":[{"type":"BODY","text":"Good news {{1}}! A spot opened in {{2}} on {{3}}. Reply YES to confirm your booking."}]}`
- `payment_failed`: `{"components":[{"type":"BODY","text":"Hi {{1}}, your payment for {{2}} failed. Please update your payment method to keep your membership active."}]}`
- `pass_expiring`: `{"components":[{"type":"BODY","text":"Hi {{1}}, your {{2}} pass expires on {{3}}. Renew now to keep attending classes."}]}`

**Variable count by template:** `class_reminder` → 3, `waitlist_offer` → 3, `payment_failed` → 2, `pass_expiring` → 3. `hello_world` → 0.

**`vars` payload shape:** positional, `{ "1": "Alice", "2": "Yoga", "3": "9am" }`. The `sendTemplate` adapter in `@gymos/whatsapp` translates `vars` to Meta's `parameters` array format.

### 4. Auth Allowlist (D-07)

**Current `auth.ts`:**
```typescript
export default createAuthPlugin({
  googleOnly: true,
  mountGoogleOAuthRoutes: false,
  googleScopes: ["...profile", "...email"],
  marketing: { ... },
  publicPaths: ["/api/m", "/pick-member", "/webhooks/whatsapp"],
});
```

**How Better-auth after-signin hooks work:** `createAuthPlugin` from `@agent-native/core/server` wraps `better-auth`. The plugin supports a `hooks` or `callbacks` option depending on the core version. Given the project uses `better-auth@^1.6.x`, the mechanism is the `trusted` / `callbackURL` layer OR a server H3 middleware that runs after session creation.

**Simplest implementation for pilot:** Add an H3 middleware in `apps/staff-web/server/plugins/auth.ts` that:
1. Reads the session from the request.
2. If session exists and the user email is NOT in `CUSTOMER_ALLOWED_EMAILS` (comma-split env var), signs the user out and redirects to `/access-denied`.
3. Runs only on non-public paths.

**Better-auth session reading in H3 context:**
```typescript
// The framework's runAuthGuard / createAuthPlugin exposes getSession
// via the event context. The exact import path is:
import { auth } from "@agent-native/core/server";
// auth.api.getSession({ headers: event.headers }) returns the session.
```

**MEDIUM confidence** on exact import path — the planner should verify by reading `@agent-native/core/server` exports before implementing. The pattern is well-established in the framework; the specific function name may be `getSession(event)` or `auth.api.getSession(...)`.

**Allowlist check location options:**
- Option A (recommended): H3 middleware in `auth.ts` plugin file, runs after session read, before route handler. Clean single file.
- Option B: `server/middleware/allowlist.ts` — separate Nitro middleware file.

Both work. Option A keeps the auth concern in one file.

**`/access-denied` route:** New file `apps/staff-web/app/routes/access-denied.tsx`. Must be in `publicPaths` or excluded from auth guard. Add `"/access-denied"` to `publicPaths` in `auth.ts`.

**Google sign-out + redirect from `/access-denied` page:** The "Sign in with a different account" button calls `auth.signOut()` then redirects to the Google sign-in page. Better-auth exposes a `signOut` mutation via its client SDK or via a `POST /_better_auth/sign-out` endpoint. The client component can use `fetch` to hit that endpoint, then redirect.

### 5. Analytics Route (`/gymos/analytics`)

**Route file:** `apps/staff-web/app/routes/gymos.analytics.tsx`

**No new tables.** All three metrics compute live from existing tables.

**Fill Rate SQL:**
```sql
SELECT
  COUNT(b.id) AS booked,
  SUM(co.capacity) AS capacity
FROM class_occurrences co
LEFT JOIN bookings b ON b.occurrence_id = co.id AND b.status = 'booked'
WHERE co.starts_at >= NOW() - INTERVAL '7 days'
  AND co.starts_at < NOW()
  AND co.status != 'cancelled'
```
Fill rate = `booked / capacity`. In Drizzle:
```typescript
const fillRate7d = await db
  .select({
    booked: sql<number>`COUNT(CASE WHEN ${bookings.status} = 'booked' THEN 1 END)`,
    capacity: sql<number>`SUM(${classOccurrences.capacity})`,
  })
  .from(schema.classOccurrences)
  .leftJoin(schema.bookings, eq(schema.bookings.occurrenceId, schema.classOccurrences.id))
  .where(and(
    gte(schema.classOccurrences.startsAt, sevenDaysAgo),
    lt(schema.classOccurrences.startsAt, now),
    ne(schema.classOccurrences.status, 'cancelled')
  ))
  .then(r => r[0]);
```

**Cancellation Rate SQL:**
```sql
-- cancelled bookings / total bookings where booking.booked_at in trailing N days
SELECT
  COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled,
  COUNT(*) AS total
FROM bookings
WHERE booked_at >= NOW() - INTERVAL '7 days'
```

**Pass Utilisation SQL:**
```sql
-- active passes that have had at least one debit / total active passes
-- "active" = not expired (expires_at IS NULL OR expires_at > NOW())
SELECT
  COUNT(DISTINCT pd.pass_id) AS with_debit,
  COUNT(DISTINCT p.id) AS total_active
FROM passes p
LEFT JOIN pass_debits pd ON pd.pass_id = p.id AND pd.amount > 0
WHERE (p.expires_at IS NULL OR p.expires_at > NOW())
```

**Seeded data sufficiency:** From `STATE.md` D0.4: 5 passes seeded, 7 class occurrences (Sun May 18 → Fri May 22), bookings from schedule (D1-01 booking action). These dates are in the past relative to 2026-05-25. A 30-day window will capture them; a 7-day window for "last 7 days" from 2026-05-25 would look back to 2026-05-18, which just barely includes the seeded occurrences. Fill rate and cancellation rate will show real non-zero numbers. Pass utilisation shows the 5 seeded passes.

**Important:** The seeded dates (May 18-22) are exactly 3-7 days before 2026-05-25, so the 7-day window catches them. Pilot analytics will show real data on day one.

**Loader pattern:** Use `Promise.all` to fan out all three metric queries in parallel, matching the established fan-out pattern in `gymos._index.tsx`.

**No actions needed for analytics** (read-only, no agent tool needed for pilot). Loader data only.

### 6. New Gym Actions (D-09)

**Action inventory gap analysis:**

All current actions in `apps/staff-web/actions/` are email/mail actions (archive-email, list-emails, search-emails, etc.). Zero gym-domain actions exist.

**Required new actions:**

| Action file | Agent chip it answers | SQL tables | Return shape |
|-------------|----------------------|------------|--------------|
| `list-fill-rate.ts` | "Which classes haven't been filled in the last week?" | `class_occurrences` + `bookings` + `class_definitions` | `[{name, date, capacity, booked, fillPct}]` trailing 7d |
| `list-renewals.ts` | "Provide renewal numbers" | `stripe_subscriptions` + `passes` | `{activeSubscriptions, expiringPasses7d, expiringPasses30d}` |
| `list-at-risk-members.ts` | "Which customers should I reach out to?" | `bookings` + `passes` + `gym_members` | `[{name, lastAttended, passExpiry, bookingCount30d}]` |

**Supporting actions (simpler, may already be coverable via loader data):**
- `list-classes.ts` — lists class definitions + recent occurrences
- `list-members.ts` — lists gym_members

**`defineAction` pattern for `list-fill-rate.ts`:**
```typescript
// apps/staff-web/actions/list-fill-rate.ts
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { gte, lt, ne, eq, sql, and } from "drizzle-orm";

export default defineAction({
  description: "List class occurrences from the last 7 days with their fill rate (bookings / capacity). Use this when asked which classes are not filling up.",
  schema: z.object({
    days: z.coerce.number().optional().default(7).describe("Trailing days to look back (default 7)"),
  }),
  http: { method: "GET" },
  run: async ({ days }) => {
    const db = getDb();
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const now = new Date().toISOString();
    // ... aggregation query
    return rows;
  },
});
```

**`no unscoped queries` compliance:** `gym_members`, `class_occurrences`, `bookings`, `passes`, `stripe_subscriptions` do NOT use `ownableColumns()` (they are not Better-auth ownable — they are GymClassOS domain tables). The `guard-no-unscoped-queries.mjs` script targets ownable resources. These tables are single-tenant by design (no owner column), so no `accessFilter` is needed. Confirm by checking the schema: none of these tables have `ownerEmail` / `orgId` / `userId` as ownership markers.

### 7. Gym AGENTS.md Replacement (D-10)

**Current `apps/staff-web/AGENTS.md`:** The full Mail agent guide (~600 lines). `apps/staff-web/CLAUDE.md` is `@AGENTS.md` — a simple include directive.

**Pattern for replacement:** Overwrite `apps/staff-web/AGENTS.md` entirely. The upstream-clean mail version lives in `templates/mail/AGENTS.md` (P1b-01 restored it there). No git concern — the replacement is intentional for this deploy.

**Gym AGENTS.md structure (what the planner writes):**
```markdown
# GymClassOS Staff Web — Agent Guide

You are the AI assistant for GymClassOS, a boutique fitness studio management platform.
Your role is to help coaches and studio managers run their day.

## Data Sources (Neon tables)
- `gym_members` — member profiles
- `class_occurrences` + `class_definitions` — class schedule
- `bookings` — who booked what (status: booked/attended/no_show/cancelled)
- `passes` + `pass_debits` — pass balance ledger
- `stripe_subscriptions` — active membership subscriptions
- `conversations` + `messages` — WhatsApp inbox

## Agent Actions
[table of list-fill-rate, list-renewals, list-at-risk-members, list-classes, list-members, view-screen, navigate]

## System Prompt (for agent-chat.ts)
[gym-specific — no email vocabulary, no Gmail references]

## What You Can Do (read-only for pilot)
- Answer questions about class fill rates, member retention, pass utilisation
- Identify members to reach out to
- Show renewal numbers

## What You Cannot Do (P2)
- Book members into classes
- Send WhatsApp messages
- Cancel bookings
```

**`agent-chat.ts` rewrite (D-08):** Change `appId: "mail"` → `appId: "gymos"`, replace `systemPrompt` with gym-aware text, remove `mentionProviders.emails`, keep the action registry (it auto-loads all actions in `actions/` including the new gym ones via `.generated/actions-registry.js`). The auto-generated registry picks up new action files after `pnpm build` or `pnpm dev` restart.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template variable substitution in preview | Custom regex replace | `template.replaceAll('{{N}}', vars[N])` — 2 lines | No library needed; positional vars only |
| Template approval status display | Custom badge component | `<Badge variant="outline">` from shadcn | Already installed |
| Dialog with keyboard trap + focus management | `position:absolute` modal | shadcn `<Dialog>` | AGENTS.md prohibits custom modals |
| WhatsApp send | Direct Meta Graph API call | `enqueueOutboundWhatsApp` → worker | WA-05 contract; guard script enforces it |
| Auth session reading | `event.context.session` raw | `auth.api.getSession` from `@agent-native/core` | Framework-provided, handles cookie parsing |
| SQL analytics aggregations | Separate materialized view | Live Drizzle `sql` template in loader | Simple enough; no refresh lag for read-only pilot metrics |

---

## Common Pitfalls

### Pitfall 1: The email chrome imports still run even if the JSX is not returned
**What goes wrong:** `AppLayout.tsx` imports `ComposeModal`, `useComposeState`, email hooks at the top of the file. Even if D-01's early return prevents rendering, these hooks and TanStack Query calls still run on `/gymos/*` — they fire API calls to `/api/emails`, `/api/labels` etc. which will fail silently or cause noise.

**Why it happens:** React hooks must be called unconditionally. Moving the early return above hook calls violates Rules of Hooks. The current code structure puts all hooks before the conditional returns.

**How to avoid:** The D-01 gymos branch returns BEFORE any email-specific hooks are called — but that's only possible if the hooks are called conditionally or moved into `AppLayoutInner`. Currently `AppLayoutInner` is a separate component, so hooks inside it run only when it renders. Verify: `AppLayout` itself calls only `useLocation()`, `useIsMobile()`, `useQueuedDraftCount()`, and `useIsMobile()` before the conditional returns. The heavy email hooks (`useEmails`, `useSettings`, `useLabels`, `useGoogleAuthStatus`) are all inside `AppLayoutInner`. So the D-01 early return is safe — no email hooks fire for gymos paths.

**Warning signs:** Network tab shows `/api/emails` or `/api/labels` calls on `/gymos` routes after the change.

### Pitfall 2: `whatsapp_window_state` is a VIEW, not a Drizzle table
**What goes wrong:** Trying to use `schema.whatsappWindowState` in Drizzle queries — it doesn't exist as a Drizzle export. Templates dialog needs window state to gate the Send button (pre-flight UI).

**How to avoid:** Use the same raw SQL pattern established in `gymos._index.tsx:101`:
```typescript
await (db as any).execute(sql`SELECT ... FROM whatsapp_window_state WHERE ...`)
```
The Templates dialog can read the window state from the loader data that's already passed to `GymosInbox` (it's in `data.windowStateByConvId`). No new query needed — the props flow through.

### Pitfall 3: `hello_world` template has zero variables — empty `vars` object
**What goes wrong:** Variable form renders with 0 inputs, the Send button fires with `vars: {}`. The worker's `sendTemplate` call receives `vars: {}` and Meta's API returns an error if the template has no components expecting parameters.

**How to avoid:** When `vars` is empty and the template has no `{{N}}` placeholders in `components_json`, pass `vars: {}` — Meta accepts this for parameter-less templates. The `packages/whatsapp` adapter constructs the `components` array from `vars`; with an empty map, it sends `components: []` which is correct for `hello_world`.

**Verify:** Check `apps/worker/src/domain/sendMessage.ts` — the `sendTemplate` call path. Confirm it handles `vars: {}` gracefully.

### Pitfall 4: Better-auth allowlist hook fires before session is established
**What goes wrong:** The allowlist middleware runs on the callback URL (`/_better_auth/callback/google`) BEFORE the session cookie is written, causing a loop (no session → not allowlisted → redirect → sign-in again).

**How to avoid:** The allowlist check must run AFTER the session cookie is set. Approach: add the check to a Nitro request middleware that skips `/_better_auth/*` paths. The middleware pattern:
```typescript
// apps/staff-web/server/plugins/auth.ts or separate middleware
if (event.path.startsWith('/_better_auth')) return; // never gate auth callbacks
const session = await auth.api.getSession({ headers: event.headers });
if (!session) return; // not signed in — auth guard handles this
const email = session.user.email;
const allowed = (process.env.CUSTOMER_ALLOWED_EMAILS ?? '').split(',').map(s => s.trim()).filter(Boolean);
if (allowed.length > 0 && !allowed.includes(email)) {
  await auth.api.signOut({ headers: event.headers });
  return sendRedirect(event, '/access-denied');
}
```

### Pitfall 5: New gym actions not in `.generated/actions-registry.js`
**What goes wrong:** The planner adds `list-fill-rate.ts` etc. to `apps/staff-web/actions/` but the agent chat plugin loads `actionsRegistry` from `.generated/actions-registry.js` (auto-generated). In dev, the file regenerates on restart. In the deployed build, it requires a build step.

**How to avoid:** New action files in `actions/` auto-register after `pnpm build` or `pnpm dev` restart (the framework scans the actions directory). Planner must note: the actions are NOT available to the agent until the dev server restarts or build runs. For the pilot deployment on Vercel, the build step handles this automatically.

### Pitfall 6: Analytics dates — seeded occurrences are in May 2026, not rolling "last 7 days" from any future date
**What goes wrong:** The "last 7 days" filter uses `NOW() - INTERVAL '7 days'`. Once the pilot is 8+ days in, the seeded occurrences fall outside the window and analytics shows "–" for every metric.

**How to avoid:** Plan must include adding real occurrence rows (via the Schedule UI or a seed script) as part of regular studio operation. For the pilot launch, note in the implementation that analytics shows real data for the first week, then requires live data. This is acceptable — the pilot is demonstrating the surface exists, not committing to historical accuracy.

---

## Code Examples

### Template variable extraction from `components_json`
```typescript
// Parse {{N}} placeholders from a template's body component
function extractVariables(componentsJson: string): string[] {
  const components = JSON.parse(componentsJson).components ?? [];
  const body = components.find((c: any) => c.type === 'BODY');
  if (!body?.text) return [];
  const matches = body.text.matchAll(/\{\{(\d+)\}\}/g);
  return [...new Set([...matches].map(m => m[1]))].sort();
}
// Returns ["1", "2", "3"] for class_reminder body
// Returns [] for hello_world body
```

### Optimistic template send (client-side) — same pattern as free-text send
```typescript
// In TemplatesButton component — mirrors gymos._index.tsx:265-307 action pattern
// 1. Insert messages row optimistically via fetcher.submit (RR v7 fetcher)
// 2. Payload shape for enqueueOutboundWhatsApp:
const payload = {
  _intent: 'send-template',
  conversationId: props.conversationId,
  templateName: selectedTemplate.name,
  vars: JSON.stringify(variableInputs),   // {"1":"Alice","2":"Yoga"}
};
// 3. The action() in gymos._index.tsx discriminates on _intent and calls:
await enqueueOutboundWhatsApp({
  messageId,
  memberId: conv.memberId,
  payload: { type: 'template', name: templateName, vars, language: 'en_US' },
});
```

### Auth allowlist middleware (in `server/plugins/auth.ts`)
```typescript
// After createAuthPlugin(), add an H3 event handler or extend via Nitro plugin
// Exact API depends on @agent-native/core/server internals — planner verifies
// by reading the createAuthPlugin return type before implementing.
```

### Analytics Drizzle query (fill rate)
```typescript
// apps/staff-web/app/routes/gymos.analytics.tsx loader
const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
const now = new Date().toISOString();

const [fillRate7d, fillRate30d, cancRate7d, passUtil] = await Promise.all([
  db.select({
    booked: sql<number>`COUNT(CASE WHEN ${schema.bookings.status} = 'booked' THEN 1 ELSE NULL END)`,
    capacity: sql<number>`COALESCE(SUM(${schema.classOccurrences.capacity}), 1)`,
  })
  .from(schema.classOccurrences)
  .leftJoin(schema.bookings, eq(schema.bookings.occurrenceId, schema.classOccurrences.id))
  .where(and(
    gte(schema.classOccurrences.startsAt, sevenDaysAgo),
    lt(schema.classOccurrences.startsAt, now),
    ne(schema.classOccurrences.status, 'cancelled' as const),
  ))
  .then(r => r[0] ?? { booked: 0, capacity: 1 }),
  // ... 30d variant, cancellation rates, pass util
]);
```

---

## Files Modified Inventory

### Wave 1: Layout strip + redirect polish
| File | Change |
|------|--------|
| `apps/staff-web/app/components/layout/AppLayout.tsx` | Add `isGymosPath` early-return branch (D-01). ~20 lines. |
| `apps/staff-web/app/components/gymos/GymosTopNav.tsx` | Add "Analytics" tab Link between Payments and Settings. 1 line. |

### Wave 2: Auth allowlist + access-denied page
| File | Change |
|------|--------|
| `apps/staff-web/server/plugins/auth.ts` | Add allowlist middleware hook + `/access-denied` to publicPaths (D-07). ~20 lines. |
| `apps/staff-web/app/routes/access-denied.tsx` | NEW — branded access denied page (D-06/07). ~60 lines. |
| `apps/staff-web/.env` + Vercel env vars | Add `CUSTOMER_ALLOWED_EMAILS=...` |

### Wave 3: Templates dialog + seed data
| File | Change |
|------|--------|
| `apps/staff-web/app/routes/gymos._index.tsx` | (a) Add `whatsapp_templates` to loader query. (b) Add `_intent: 'send-template'` branch to `action()`. (c) Add `<TemplatesButton>` beside Send in JSX. ~80 lines total. |
| `apps/staff-web/app/components/gymos/TemplatesDialog.tsx` | NEW — shadcn Dialog component with left list / right form / preview (D-04). ~200 lines. |
| `apps/staff-web/server/db/seed-templates.ts` or inline SQL | NEW — seed 5 `whatsapp_templates` rows (D-03). |
| `apps/staff-web/app/routes/gymos._index.tsx` line 540 | Update out-of-window placeholder: "Out of 24h window — use a template (P2)" → "Out of 24h window — use a template" (remove "(P2)" suffix per UI-SPEC copywriting contract). |

### Wave 4: Gym agent surface + analytics route
| File | Change |
|------|--------|
| `apps/staff-web/server/plugins/agent-chat.ts` | Rewrite: `appId: 'gymos'`, gym systemPrompt, remove mentionProviders.emails (D-08). ~60 lines. |
| `apps/staff-web/AGENTS.md` | Full replacement with gym AGENTS.md (D-10). ~150 lines. |
| `apps/staff-web/actions/list-fill-rate.ts` | NEW — `defineAction` (D-09). ~40 lines. |
| `apps/staff-web/actions/list-renewals.ts` | NEW — `defineAction` (D-09). ~40 lines. |
| `apps/staff-web/actions/list-at-risk-members.ts` | NEW — `defineAction` (D-09). ~50 lines. |
| `apps/staff-web/actions/list-classes.ts` | NEW — `defineAction` (D-09). ~30 lines. |
| `apps/staff-web/actions/list-members.ts` | NEW — `defineAction` (D-09). ~30 lines. |
| `apps/staff-web/app/routes/gymos.analytics.tsx` | NEW — Analytics route (D-Claude). ~120 lines. |

**Total new/modified files: ~14 files.**

---

## Validation Architecture

`nyquist_validation` is `false` in `.planning/config.json`. No automated test infrastructure needed for this phase. Manual verification checklist (for `/gsd:verify-work`):

1. Sign in with a non-allowlisted Google account → lands on `/access-denied`.
2. Sign in with allowlisted account → lands on `/gymos` with no email chrome visible.
3. No hamburger, no "Important/Other" tabs, no email Compose button visible on any `/gymos/*` route.
4. Analytics tab appears in GymosTopNav; `/gymos/analytics` loads with 3 metric cards showing non-zero values.
5. Templates button appears in reply form; clicking opens the Dialog; `hello_world` row shows "Approved" badge; other 4 show "Awaiting approval" badge with tooltip.
6. Selecting `hello_world` + clicking Send: Sonner toast "Template queued" fires; message row with `status='queued'` appears in thread (optimistic).
7. Gym agent suggestions are exact: "Provide renewal numbers", "Which classes haven't been filled in the last week?", "Which customers should I reach out to?".
8. Typing "Which classes haven't been filled in the last week?" in AgentSidebar returns a real answer (list of occurrences with fill %).
9. Agent does NOT offer to "archive an email" or reference Gmail/inbox/starred.

---

## Open Questions

1. **Better-auth `createAuthPlugin` after-signin hook API**
   - What we know: `createAuthPlugin` is from `@agent-native/core/server`. The auth plugin wraps Better-auth.
   - What's unclear: exact hook point for post-sign-in email check without interfering with the OAuth callback flow.
   - Recommendation: Planner reads `@agent-native/core/server` exports (or the compiled `createAuthPlugin` source) before writing the allowlist hook. An H3 global middleware that skips `/_better_auth/*` paths is the safe fallback if a hook isn't available.

2. **`(db as any).execute(sql\`...\`)` for analytics vs Drizzle ORM**
   - What we know: analytics queries use `GROUP BY` aggregations with `CASE WHEN`. Standard Drizzle ORM supports `sql<T>` template in `.select()` clauses (used throughout the codebase).
   - What's unclear: whether `SUM(CASE WHEN ...)` in a Drizzle select clause requires a cast.
   - Recommendation: Use Drizzle's `sql<number>\`COUNT(CASE WHEN ...)\`` pattern (verified working in `gymos._index.tsx` passBalance aggregation). Fall back to `(db as any).execute(sql\`...\`)` only if aggregation syntax fails TypeScript.

3. **`sendTemplate` with `vars: {}` for `hello_world`**
   - What we know: `hello_world` has no `{{N}}` placeholders. `packages/queue/src/types.ts` defines `vars: z.record(z.string(), z.string())`.
   - What's unclear: Whether the `@gymos/whatsapp` adapter's `sendTemplate` constructs `components: []` for empty vars (correct) or omits `components` entirely (may cause Meta API error).
   - Recommendation: Read `apps/worker/src/domain/sendMessage.ts` and the `sendTemplate` adapter call before implementing. If needed, add a guard: `if (Object.keys(vars).length === 0) send without components parameter`.

---

## Environment Availability

Step 2.6: SKIPPED — this phase has no new external service dependencies. All infrastructure (Neon DB, Vercel deployment, pg-boss worker, Meta WhatsApp Cloud API) was provisioned in prior phases. The `CUSTOMER_ALLOWED_EMAILS` env var is new but requires no service provisioning.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase reads (2026-05-25):
  - `apps/staff-web/app/components/layout/AppLayout.tsx` — layout conditional structure, BARE_ROUTES, AgentSidebar wrap
  - `apps/staff-web/app/components/gymos/GymosTopNav.tsx` — tab strip, tabClass pattern, Settings tab
  - `apps/staff-web/app/routes/gymos.tsx` — layout shell (29 lines, GymosTopNav + Outlet)
  - `apps/staff-web/app/routes/gymos._index.tsx` — loader, action, reply Form (lines 1-90, 285-350, 505-552)
  - `apps/staff-web/app/routes/_index.tsx` — root redirect already done
  - `apps/staff-web/app/routes/$view.tsx` — email redirect already done
  - `apps/staff-web/server/db/schema.ts` — all GymClassOS domain tables, whatsappTemplates table confirmed
  - `apps/staff-web/server/plugins/auth.ts` — createAuthPlugin call, publicPaths
  - `apps/staff-web/server/plugins/agent-chat.ts` — appId, systemPrompt, mentionProviders
  - `apps/staff-web/AGENTS.md` — full mail agent guide (confirmed: entirely email vocabulary)
  - `apps/staff-web/app/lib/queue-client.ts` — enqueueOutboundWhatsApp re-export
  - `packages/queue/src/types.ts` — OutboundWhatsAppPayload schema (template type confirmed)
  - `packages/queue/src/publish.ts` — enqueueOutboundWhatsApp implementation
  - `apps/staff-web/actions/` — glob: 39 files, all email actions (zero gym actions exist)
  - `.planning/phases/P1b.../P1b-06-worker-sendmessage-chokepoint-SUMMARY.md` — gate ordering, typed errors, template-bypasses-window-gate confirmed
  - `.planning/config.json` — `nyquist_validation: false` confirmed

### Secondary (MEDIUM confidence)
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md` — locked decisions, canonical refs
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md` — component choices, copy, spacing
- `.planning/REQUIREMENTS.md` — AUTH-01, WA-05/06/07, INBX-01/02, AGENT-04/05 acceptance criteria
- `.planning/STATE.md` — seeded data details (5 passes, 7 occurrences, 5 conversations)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — direct codebase inspection; all packages confirmed installed
- Architecture (AppLayout surgery): HIGH — code read line by line; no ambiguity
- Architecture (Templates dialog): HIGH — types.ts payload shape confirmed; existing action pattern verified
- Architecture (auth allowlist): MEDIUM — createAuthPlugin hook API not inspected at source
- Architecture (analytics SQL): HIGH — Drizzle pattern matches existing usage; SQL logic straightforward
- Architecture (gym actions): HIGH — defineAction pattern confirmed from skill + existing actions
- Pitfalls: HIGH — identified from direct code reading, not speculation

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (stable framework; only risk is Better-auth version bump)
