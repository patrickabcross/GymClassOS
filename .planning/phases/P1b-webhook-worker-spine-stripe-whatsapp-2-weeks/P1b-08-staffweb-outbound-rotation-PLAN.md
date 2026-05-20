---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 08
type: execute
wave: 5
depends_on: [01, 02, 03, 06, 07]
files_modified:
  - apps/staff-web/app/routes/gymos.tsx
  - apps/staff-web/app/routes/gymos.settings.integrations.tsx
  - apps/staff-web/app/lib/queue-client.ts
  - apps/staff-web/server/plugins/auth.ts
autonomous: false
requirements: [WA-05, WA-08]
must_haves:
  truths:
    - "Coach Send action in /gymos inserts messages row status='queued' + calls enqueueOutboundWhatsApp({messageId, memberId, payload}) — NO direct Meta call (WA-05)"
    - "messages row inserted with localMessageId='msg_<nanoid>' BEFORE enqueue (D-18 optimistic insert)"
    - "Send action returns 200/redirect immediately — UI renders message with clock icon (D-18 optimistic UI)"
    - "Inbox loader reads whatsapp_window_state VIEW per conversation → exposes windowState={inWindow, hoursLeft} to client"
    - "Inbox loader reads whatsapp_opt_in per member → exposes optInState={hasOptIn} to client"
    - "Send button disabled when payload.type='text' AND !inWindow (UI pre-gate per D-19)"
    - "Conversation list AND thread header show window-state badge: in-window with hours-left OR out-of-window grey badge (D-20)"
    - "Window-state badges use the Tabler IconPointFilled icon (NOT the U+25CF bullet character ●) — LOW #12 fix; resolves AGENTS.md no-emojis-as-icons ambiguity. Same pattern used in /gymos/settings/integrations for the current-key status indicator."
    - "Failed messages display error_code-derived friendly copy (D-19): WindowExpiredError, NoOptInError, TemplateNotApproved"
    - "/gymos/settings/integrations route accepts new Stripe restricted key, validates via stripe.accounts.retrieve(), encrypts + writes to secrets table via worker's writeSecret pattern"
    - "Stripe key rotation does NOT cause downtime — old key remains active until new key succeeds + write completes (atomic UPSERT)"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.tsx"
      provides: "Updated inbox route — Send action enqueues instead of direct Meta call; loader exposes window/opt-in state; UI shows IconPointFilled-based badges + failed-bubble error copy"
    - path: "apps/staff-web/app/routes/gymos.settings.integrations.tsx"
      provides: "NEW route — Stripe key rotation form + validate-and-encrypt + audit message; uses IconPointFilled for current-key status (LOW #12)"
    - path: "apps/staff-web/app/lib/queue-client.ts"
      provides: "Re-export of @gymos/queue publishers + Drizzle write helper for messages.status='queued' insert"
      exports: ["enqueueOutboundWhatsApp", "insertQueuedOutboundMessage"]
  key_links:
    - from: "apps/staff-web/app/routes/gymos.tsx action()"
      to: "@gymos/queue enqueueOutboundWhatsApp"
      via: "import + call after inserting messages row with status='queued'"
      pattern: "enqueueOutboundWhatsApp"
    - from: "apps/staff-web/app/routes/gymos.tsx loader()"
      to: "whatsapp_window_state VIEW"
      via: "SELECT in_window, hours_left FROM whatsapp_window_state WHERE conversation_id = ..."
      pattern: "whatsapp_window_state"
    - from: "apps/staff-web/app/routes/gymos.tsx JSX badges"
      to: "@tabler/icons-react IconPointFilled"
      via: "import { IconPointFilled } from '@tabler/icons-react' + <IconPointFilled size={8} className=... /> (LOW #12 — resolves ● glyph ambiguity)"
      pattern: "IconPointFilled"
    - from: "apps/staff-web/app/routes/gymos.settings.integrations.tsx action()"
      to: "writeSecret pattern (raw SQL INSERT/UPDATE secrets with pgp_sym_encrypt)"
      via: "Drizzle db.execute(sql`INSERT INTO secrets ... pgp_sym_encrypt(...) ON CONFLICT (name) DO UPDATE`)"
      pattern: "pgp_sym_encrypt"
---

<objective>
Wire staff-web (Vercel) into the P1b spine: (a) the inbox /gymos Send action stops calling Meta directly and instead inserts a queued messages row + enqueues via @gymos/queue; the loader exposes per-conversation window-state + opt-in-state; the UI gates Send button + shows badges (using Tabler IconPointFilled, not the ● glyph — LOW #12) + renders failed-bubble error copy (D-18, D-19, D-20); (b) a new /gymos/settings/integrations route lets an admin paste a new Stripe restricted key, validates it via stripe.accounts.retrieve(), and stores it pgcrypto-encrypted in `secrets` table — rotation without downtime (success criterion #6).

Purpose: WA-05 (single sendMessage chokepoint — staff-web NEVER calls Meta), WA-08 (template send via approved list — UI surfaces this; full picker is P2/INBX-04), plus P1b success criterion #6 (Stripe restricted key validity check + rotate without downtime).
Output: Coach hits Send → queued message renders optimistically → worker processes → status updates flow back. Admin hits /gymos/settings/integrations → paste key → validate → store encrypted.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md
@apps/staff-web/app/routes/gymos.tsx
@apps/staff-web/server/db/schema.ts
@apps/staff-web/server/plugins/auth.ts
@packages/queue/src/index.ts
@CLAUDE.md
@AGENTS.md

<interfaces>
<!-- From Plan 02 schema additions -->
whatsapp_window_state VIEW: { member_id, conversation_id, last_inbound_at, in_window bool, hours_left real }
whatsapp_opt_in table: { member_id PK, opted_in_at, evidence_message_id, evidence_payload, source }
secrets table: { name PK, ciphertext, updated_at, last_used_at }

<!-- From Plan 03 -->
@gymos/queue exports: enqueueOutboundWhatsApp({ messageId, memberId, payload })

<!-- Tabler icon — LOW #12: use this instead of the ● U+25CF bullet glyph -->
import { IconPointFilled } from "@tabler/icons-react";
// In-window:    <IconPointFilled size={8} className="text-emerald-500 inline" />
// Out-of-window: <IconPointFilled size={8} className="text-zinc-400 inline" />

<!-- Current gymos.tsx action signature (Plan 01 copy of demo) -->
export async function action({ request }: ActionFunctionArgs) {
  const fd = await request.formData();
  const conversationId = fd.get("conversationId") as string;
  const body = (fd.get("body") as string).trim();
  // ...existing env-gated direct Meta call...
}

<!-- D-19 failed-bubble copy (from CONTEXT specifics) -->
WindowExpiredError: "Couldn't send — outside 24-hour window. Use a template."
NoOptInError: "Couldn't send — member hasn't opted in to WhatsApp messages."
TemplateNotApproved: "Couldn't send — template '{name}' isn't approved yet."

<!-- D-20 window-state badge copy -->
In-window: IconPointFilled (emerald-500) + "in window · {hoursLeft}h left"
Out-of-window: IconPointFilled (zinc-400) + "out of window — template only"
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor gymos.tsx Send action to enqueue (D-18) + add window/opt-in state to loader (D-19) + use IconPointFilled badges (LOW #12)</name>
  <files>apps/staff-web/app/routes/gymos.tsx, apps/staff-web/app/lib/queue-client.ts</files>
  <read_first>
    - apps/staff-web/app/routes/gymos.tsx (full file — current loader + action; ~600 lines)
    - apps/staff-web/server/db/schema.ts (whatsappWindowState is a VIEW — Drizzle doesn't export it; query via raw SQL; whatsappOptIn is a table)
    - packages/queue/src/publish.ts (enqueueOutboundWhatsApp signature + singletonKey discipline)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-18 optimistic insert, D-19 defence-in-depth, D-20 badge copy)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Staff-web action call site" lines 580-625
    - CLAUDE.md (Optimistic UI default — no spinner-after-click; insert+enqueue then redirect)
    - AGENTS.md "Tabler Icons" rule — use IconPointFilled, NOT the U+25CF bullet character (LOW #12). The bullet glyph sits in the ambiguous zone between Unicode shapes and emoji icons; the project's icon rule resolves the ambiguity by mandating Tabler.
  </read_first>
  <action>
    Concrete steps:

    1. Create `apps/staff-web/app/lib/queue-client.ts` (thin wrapper for use in actions):
       ```ts
       import { enqueueOutboundWhatsApp } from "@gymos/queue";

       /**
        * Re-export the publisher so route files import from "~/lib/queue-client"
        * instead of pulling @gymos/queue directly. Makes future swap (e.g. inline
        * via direct pg-boss instance) a one-file change.
        */
       export { enqueueOutboundWhatsApp };
       ```

    2. Edit `apps/staff-web/app/routes/gymos.tsx` — locate the existing `action()` function (search for `export async function action` or `export const action`). Replace the env-gated direct Meta call with the optimistic-insert + enqueue pattern:

       ```ts
       // Add imports at top:
       import { nanoid } from "nanoid";
       import { enqueueOutboundWhatsApp } from "~/lib/queue-client";
       // LOW #12 fix: replace the ● bullet with the Tabler icon
       import { IconPointFilled } from "@tabler/icons-react";

       // Replace the action body:
       export async function action({ request }: ActionFunctionArgs) {
         const fd = await request.formData();
         const conversationId = fd.get("conversationId") as string;
         const body = (fd.get("body") as string).trim();
         if (!body) return redirect(`/gymos?conversation=${conversationId}`);

         const db = getDb();
         // guard:allow-unscoped — P1b spine; full role check in P1a/AUTH-04
         const conv = await db
           .select()
           .from(schema.conversations)
           .where(eq(schema.conversations.id, conversationId))
           .limit(1)
           .then((r) => r[0]);
         if (!conv) throw new Response("Not found", { status: 404 });

         // D-18: OPTIMISTIC insert with status='queued'
         const messageId = `msg_${nanoid()}`;
         await db.insert(schema.messages).values({
           id: messageId,
           conversationId,
           direction: "out",
           messageType: "text",
           body,
           status: "queued",
         });

         // Enqueue — worker picks up + runs sendMessage chokepoint (D-10)
         await enqueueOutboundWhatsApp({
           messageId,
           memberId: conv.memberId,
           payload: { type: "text", body },
         });

         // Return 200 — UI re-fetches conversation; the queued message appears
         return redirect(`/gymos?conversation=${conversationId}&sent=1`);
       }
       ```

       Remove the entire env-gated direct Meta call block (the if (process.env.WHATSAPP_ACCESS_TOKEN) {...} branch + console.warn else branch). Keep only the optimistic insert + enqueue.

    3. Edit the `loader()` function in the same file. Locate where the loader fetches conversations + selectedConversation + memberStats. Add two new queries before the return:

       ```ts
       // Window-state per conversation (D-20 badges)
       // Reads the VIEW created in Plan 02 — D-15 default chose VIEW over materialised
       const windowRows = await db.execute(sql`
         SELECT conversation_id, in_window, hours_left
         FROM whatsapp_window_state
         WHERE conversation_id IN (${sql.join(conversationIds.map((id) => sql`${id}`), sql`, `)})
       `);
       const windowMap: Record<string, { inWindow: boolean; hoursLeft: number | null }> =
         {};
       const rows = (windowRows as any)?.rows ?? (windowRows as any) ?? [];
       for (const r of rows) {
         windowMap[r.conversation_id] = {
           inWindow: Boolean(r.in_window),
           hoursLeft: r.hours_left !== null ? Number(r.hours_left) : null,
         };
       }

       // Opt-in per member (D-19)
       // guard:allow-unscoped — coach inbox shows all conversations
       const optInRows = await db
         .select({ memberId: schema.whatsappOptIn.memberId })
         .from(schema.whatsappOptIn)
         .where(inArray(schema.whatsappOptIn.memberId, memberIds));
       const optInSet = new Set(optInRows.map((r) => r.memberId));
       ```

       Where `conversationIds` and `memberIds` are arrays derived from the existing loader's conversation list. If not already computed, add them:
       ```ts
       const conversationIds = conversations.map((c) => c.id);
       const memberIds = conversations.map((c) => c.memberId).filter(Boolean);
       ```

       Add `inArray` to the drizzle-orm imports if not already there.

       Return the new fields in the loader's return object:
       ```ts
       return {
         conversations,
         selectedConversation,
         memberStats,
         // ...existing fields...
         windowStateByConvId: windowMap,
         optInByMemberId: Object.fromEntries(memberIds.map((id) => [id, optInSet.has(id)])),
       };
       ```

    4. Edit the JSX. Locate the conversation list (probably renders `{data.conversations.map((c) => ...)}` or similar):

       a. Add a window-state badge to each conversation list row using the Tabler IconPointFilled (LOW #12 — NOT the ● U+25CF bullet character). After the conversation name / last_message_preview, render:
       ```tsx
       <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
         {data.windowStateByConvId[c.id]?.inWindow ? (
           <span className="inline-flex items-center gap-1 text-emerald-600">
             <IconPointFilled size={8} className="text-emerald-500" aria-hidden />
             in window
             {data.windowStateByConvId[c.id]?.hoursLeft !== null
               ? ` · ${Math.floor(data.windowStateByConvId[c.id]!.hoursLeft!)}h left`
               : ""}
           </span>
         ) : (
           <span className="inline-flex items-center gap-1 text-muted-foreground">
             <IconPointFilled size={8} className="text-zinc-400" aria-hidden />
             out of window — template only
           </span>
         )}
       </span>
       ```
       LOW #12 NOTE: explicitly use `<IconPointFilled />` from `@tabler/icons-react` (already a Plan-01 dep — agent-native templates import Tabler everywhere). Do NOT use the `●` (U+25CF) bullet character — it sits in the ambiguous zone between Unicode geometric shapes and emoji icons, and AGENTS.md "Tabler Icons" rule mandates Tabler for all UI-chosen indicators.

       b. Locate the thread-header area (around line 480 in original demo). Add the same IconPointFilled-prefixed badge prominently.

       c. Locate the Send button + Input (around lines 509-524). Update:
       ```tsx
       const selectedWs = data.windowStateByConvId[data.selectedConversation?.id ?? ""];
       const hasOptIn = data.optInByMemberId[data.selectedConversation?.memberId ?? ""];
       const canSendText = (selectedWs?.inWindow ?? false) && hasOptIn;

       <Input
         name="body"
         value={reply}
         onChange={(e) => setReply(e.target.value)}
         placeholder={
           !hasOptIn
             ? "Member hasn't opted in to WhatsApp messages"
             : !selectedWs?.inWindow
             ? "Out of 24h window — use a template (P2)"
             : "Type a reply..."
         }
         disabled={!canSendText}
         className="text-[13px]"
       />
       <Button type="submit" disabled={!canSendText || !reply.trim()}>
         Send
       </Button>
       ```

       d. Locate the messages list rendering. For each outbound message with status='failed', render the friendly error copy (D-19):
       ```tsx
       {m.direction === "out" && m.status === "failed" && (
         <p className="text-[11px] text-red-600 mt-1 px-1">
           {(() => {
             const err = m.errorCode ?? "";
             if (err.includes("WINDOW_EXPIRED") || err.includes("WindowExpiredError"))
               return "Couldn't send — outside 24-hour window. Use a template.";
             if (err.includes("NO_OPT_IN") || err.includes("NoOptInError"))
               return "Couldn't send — member hasn't opted in to WhatsApp messages.";
             if (err.includes("TEMPLATE_NOT_APPROVED") || err.includes("TemplateNotApprovedError"))
               return `Couldn't send — template isn't approved yet.`;
             return `Couldn't send — ${err}`;
           })()}
         </p>
       )}
       ```

       e. Remove the existing demo banner (around lines 491-497 that reads "Sent (demo)" — the optimistic insert now means the message renders immediately; no banner needed). Replace with a simple TanStack-style refresh-on-focus hint OR remove entirely.

    5. Remove any remaining direct Meta `fetch` call from gymos.tsx. Search for: `graph.facebook.com`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. Confirm none remain after the action refactor.

    6. Run `pnpm install` if @gymos/queue dep was just added (Plan 03 already added it).
    7. Run `pnpm --filter @gymos/staff-web exec tsc --noEmit` — exits 0.
    8. Boot locally: `pnpm --filter @gymos/staff-web dev`. Open /gymos. Click conversation. Verify window-state badge renders WITH the Tabler IconPointFilled dot (NOT the ● bullet). Verify Send button is disabled when out-of-window. Click Send when in-window — message appears with status='queued', the form clears, the redirect renders the new message.
    9. Run `npx prettier --write apps/staff-web/app/routes/gymos.tsx apps/staff-web/app/lib/queue-client.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/app/routes/gymos.tsx` contains string `enqueueOutboundWhatsApp` (publisher call)
    - `apps/staff-web/app/routes/gymos.tsx` contains string `status: "queued"` (optimistic insert)
    - `apps/staff-web/app/routes/gymos.tsx` contains string `msg_${nanoid()}` OR `nanoid()` (local message ID generation)
    - `apps/staff-web/app/routes/gymos.tsx` contains string `whatsapp_window_state` (VIEW query)
    - `apps/staff-web/app/routes/gymos.tsx` contains string `whatsappOptIn` (opt-in table query) OR `whatsapp_opt_in` (if raw SQL)
    - `apps/staff-web/app/routes/gymos.tsx` DOES NOT contain string `graph.facebook.com` (direct Meta call removed)
    - `apps/staff-web/app/routes/gymos.tsx` DOES NOT contain string `WHATSAPP_ACCESS_TOKEN` (no direct env-gated Meta send)
    - `apps/staff-web/app/routes/gymos.tsx` contains string `disabled={!canSendText` OR `disabled={!selectedWs?.inWindow` (UI pre-gate per D-19)
    - `apps/staff-web/app/routes/gymos.tsx` contains string `WINDOW_EXPIRED` (failed-bubble error matching)
    - `apps/staff-web/app/routes/gymos.tsx` contains string `NO_OPT_IN`
    - `apps/staff-web/app/routes/gymos.tsx` contains string `outside 24-hour window` (D-19 copy)
    - `apps/staff-web/app/routes/gymos.tsx` contains string `IconPointFilled` (LOW #12 — Tabler icon import + usage)
    - `apps/staff-web/app/routes/gymos.tsx` contains string `from "@tabler/icons-react"` (LOW #12 — explicit Tabler import)
    - `apps/staff-web/app/routes/gymos.tsx` does NOT contain the bare character `●` (U+25CF) — LOW #12. Verify with: `grep -P "\\xe2\\x97\\x8f" apps/staff-web/app/routes/gymos.tsx` (UTF-8 bytes for ●) returns nothing. Equivalent ASCII-only check: file does not contain the literal three-byte sequence `0xE2 0x97 0x8F`.
    - `apps/staff-web/app/lib/queue-client.ts` EXISTS and exports enqueueOutboundWhatsApp
    - `pnpm --filter @gymos/staff-web exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Inbox /gymos enqueues via @gymos/queue; UI shows window-state badges with Tabler IconPointFilled (LOW #12); disables Send appropriately; failed messages render friendly D-19 error copy.</done>
</task>

<task type="auto">
  <name>Task 2: Create /gymos/settings/integrations route — Stripe restricted-key rotation flow (success criterion #6) with IconPointFilled status (LOW #12)</name>
  <files>apps/staff-web/app/routes/gymos.settings.integrations.tsx, apps/staff-web/server/plugins/auth.ts</files>
  <read_first>
    - apps/staff-web/server/plugins/auth.ts (publicPaths — add /gymos/settings/integrations OR rely on existing /gymos prefix match if such match exists)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Stripe rotation flow" lines 1297-1349
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (specifics §"Stripe rotation UI placement")
    - apps/worker/src/lib/secrets.ts (writeSecret pattern to mirror — but staff-web has its own env, NOT apps/worker; replicate the SQL inline)
    - apps/staff-web/server/db/schema.ts (secrets table from Plan 02)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Open Questions #5" (Stripe scope assertions)
    - CLAUDE.md (no-unscoped-queries — secrets table is studio-global, requires guard:allow-unscoped comment)
    - AGENTS.md (Tabler Icons rule — use IconPointFilled for current-key status indicator, LOW #12)
  </read_first>
  <action>
    Concrete steps:

    1. Update `apps/staff-web/server/plugins/auth.ts` publicPaths to include the new settings route IF needed. Actually `/gymos` prefix already matches `/gymos/settings/integrations` (RR v7 publicPaths are typically prefix matches via the `createAuthPlugin` source — verify by reading the auth plugin source if uncertain). If not a prefix match, add `"/gymos/settings/integrations"` to the list.

    2. Create `apps/staff-web/app/routes/gymos.settings.integrations.tsx` — LOW #12: current-key status uses IconPointFilled, NOT the ● bullet:

       ```tsx
       import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
       import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
       import { sql } from "drizzle-orm";
       import Stripe from "stripe";
       import { IconPointFilled } from "@tabler/icons-react";
       import { getDb, schema } from "../../server/db";

       // STR-01: pgcrypto-encrypted Stripe restricted key storage + rotation flow.
       // Success criterion #6: admin can rotate without downtime.
       // LOW #12: status indicator uses Tabler IconPointFilled (NOT ● U+25CF bullet).

       export async function loader(_: LoaderFunctionArgs) {
         const db = getDb();
         // Show whether a key is currently set + when it was last rotated/used (no plaintext)
         // guard:allow-unscoped — settings page; studio-global config
         const row = (await db.execute(sql`
           SELECT name, updated_at, last_used_at
           FROM secrets
           WHERE name = 'stripe_restricted_key'
           LIMIT 1
         `)) as any;
         const rows = row?.rows ?? row;
         const current = rows?.[0] ?? null;

         return {
           keyPresent: Boolean(current),
           updatedAt: current?.updated_at ?? null,
           lastUsedAt: current?.last_used_at ?? null,
         };
       }

       export async function action({ request }: ActionFunctionArgs) {
         const fd = await request.formData();
         const newKey = (fd.get("key") as string)?.trim();

         if (!newKey) {
           return { ok: false, error: "Paste a key first." };
         }
         if (!newKey.startsWith("rk_") && !newKey.startsWith("sk_")) {
           return {
             ok: false,
             error: "Must be a Stripe key (starts with rk_test_, rk_live_, sk_test_, or sk_live_).",
           };
         }

         // 1. Validate against Stripe — uses the NEW key BEFORE we store it.
         //    A known-required call (accounts.retrieve) probes scope adequacy
         //    per RESEARCH Open Question #5.
         const probe = new Stripe(newKey, { apiVersion: "2026-04-22.dahlia" });
         try {
           const account = await probe.accounts.retrieve();
           if (!account?.id) {
             return { ok: false, error: "Stripe accepted key but returned no account id." };
           }
         } catch (err) {
           const msg = err instanceof Error ? err.message : String(err);
           return {
             ok: false,
             error: `Stripe rejected the key — ${msg.slice(0, 200)}`,
           };
         }

         // 2. Atomic upsert via pgcrypto. Old key remains active (worker has cached
         //    it in-memory until next getStripeSecretKey call); when worker reads
         //    next, it'll get the new key. No downtime.
         const masterKey = process.env.PGCRYPTO_MASTER_KEY;
         if (!masterKey) {
           return {
             ok: false,
             error: "Server misconfigured: PGCRYPTO_MASTER_KEY not set.",
           };
         }

         const db = getDb();
         // guard:allow-unscoped — secrets table is studio-global
         await db.execute(sql`
           INSERT INTO secrets (name, ciphertext, updated_at)
           VALUES (
             'stripe_restricted_key',
             pgp_sym_encrypt(${newKey}, ${masterKey}),
             NOW()
           )
           ON CONFLICT (name) DO UPDATE
             SET ciphertext = EXCLUDED.ciphertext,
                 updated_at = EXCLUDED.updated_at
         `);

         // 3. Audit log — minimal in P1b; full audit_log table is P1a
         console.log(
           `[secrets] rotated stripe_restricted_key at ${new Date().toISOString()}`,
         );

         return { ok: true, message: "Key rotated successfully." };
       }

       export default function StripeIntegrations() {
         const data = useLoaderData<typeof loader>();
         const result = useActionData<typeof action>();
         const nav = useNavigation();
         const submitting = nav.state === "submitting";

         return (
           <div className="max-w-2xl mx-auto p-6">
             <h1 className="text-xl font-semibold mb-2">Stripe Integration</h1>
             <p className="text-sm text-muted-foreground mb-6">
               Paste a restricted API key from{" "}
               <a
                 href="https://dashboard.stripe.com/apikeys"
                 target="_blank"
                 rel="noreferrer"
                 className="underline"
               >
                 Stripe Dashboard → API keys → Restricted keys
               </a>
               . The key is validated against Stripe and then stored encrypted in
               the database. Old key stays active until the new one succeeds.
             </p>

             <div className="rounded-lg border border-border/50 p-4 mb-6 bg-card/30">
               <div className="text-xs text-muted-foreground mb-1">Current key</div>
               <div className="text-sm inline-flex items-center gap-2">
                 {data.keyPresent ? (
                   <>
                     <IconPointFilled
                       size={10}
                       className="text-emerald-500"
                       aria-hidden
                     />
                     <span className="font-medium">set</span>
                     <span className="text-muted-foreground">
                       — updated {data.updatedAt}
                       {data.lastUsedAt && ` · last used ${data.lastUsedAt}`}
                     </span>
                   </>
                 ) : (
                   <>
                     <IconPointFilled
                       size={10}
                       className="text-zinc-400"
                       aria-hidden
                     />
                     <span className="text-muted-foreground">
                       not set (worker falls back to env <code>STRIPE_SECRET_KEY</code>)
                     </span>
                   </>
                 )}
               </div>
             </div>

             <Form method="post" className="space-y-3">
               <label className="block text-sm font-medium">New restricted key</label>
               <textarea
                 name="key"
                 placeholder="rk_test_... or rk_live_..."
                 className="w-full border border-border/50 rounded-md px-3 py-2 font-mono text-xs bg-background"
                 rows={3}
                 required
                 autoComplete="off"
                 spellCheck={false}
               />
               <button
                 type="submit"
                 disabled={submitting}
                 className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium disabled:opacity-50"
               >
                 {submitting ? "Validating + rotating…" : "Validate & rotate"}
               </button>
             </Form>

             {result?.ok === true && (
               <div className="mt-4 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                 {result.message}
               </div>
             )}
             {result?.ok === false && (
               <div className="mt-4 rounded-md bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                 {result.error}
               </div>
             )}

             <div className="mt-6 text-[11px] text-muted-foreground">
               Note: P1b stores the key encrypted with pgcrypto. Full audit
               trail + admin role gating ships in P1a/P2 (SET-02).
             </div>
           </div>
         );
       }
       ```

    3. Verify the route is accessible:
       - `pnpm --filter @gymos/staff-web dev`
       - Open http://localhost:8081/gymos/settings/integrations
       - The page should render (auth bypass via /gymos publicPath prefix). Status indicator should show the Tabler dot icon (NOT the ● bullet).

    4. Smoke test:
       - Paste a known-bad key like `rk_test_invalid` → expect "Stripe rejected the key" error.
       - Paste a real test key from Stripe Dashboard → expect "Key rotated successfully."
       - Reload — "Current key" section shows `set — updated <timestamp>` with the green Tabler dot.

    5. Verify DB row:
       ```sql
       SELECT name, updated_at, length(ciphertext) FROM secrets WHERE name = 'stripe_restricted_key';
       -- Expected: 1 row, ciphertext length > 0
       ```

    6. Run `pnpm --filter @gymos/staff-web exec tsc --noEmit` — exits 0.
    7. Run `npx prettier --write apps/staff-web/app/routes/gymos.settings.integrations.tsx`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/staff-web exec tsc --noEmit 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/app/routes/gymos.settings.integrations.tsx` EXISTS
    - File contains string `pgp_sym_encrypt(${newKey}` (encryption at write)
    - File contains string `ON CONFLICT (name) DO UPDATE` (atomic rotation)
    - File contains string `probe.accounts.retrieve()` (validity probe per Open Question #5)
    - File contains string `"2026-04-22.dahlia"` (apiVersion pin — PITFALL #3)
    - File contains string `// guard:allow-unscoped` (secrets table access)
    - File contains string `PGCRYPTO_MASTER_KEY` (env read for master key)
    - File contains string `IconPointFilled` (LOW #12 — Tabler icon used for status indicator)
    - File contains string `from "@tabler/icons-react"` (LOW #12 — explicit Tabler import)
    - File does NOT contain the bare character `●` (U+25CF) — LOW #12. Verify with: `grep -P "\\xe2\\x97\\x8f" apps/staff-web/app/routes/gymos.settings.integrations.tsx` returns nothing.
    - File renders BOTH loader data (current key status) AND action result (rotation success/failure)
    - `pnpm --filter @gymos/staff-web exec tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>/gymos/settings/integrations route lets admin paste new Stripe restricted key, validates via accounts.retrieve(), stores pgcrypto-encrypted. Old key stays active until next worker read. Current-key status indicator uses Tabler IconPointFilled (LOW #12).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: End-to-end staff-web → Fly → worker → Meta send flow + Stripe rotation</name>
  <what-built>
    Staff-web Send action now enqueues instead of calling Meta directly. Inbox UI exposes window-state + opt-in state via badges (with Tabler IconPointFilled dots per LOW #12) + Send-button gates. Failed messages render D-19 error copy. Stripe key rotation route exists at /gymos/settings/integrations with the same icon treatment for the current-key status.
  </what-built>
  <files>(human verification — no specific file write; see &lt;how-to-verify&gt; below)</files>
  <action>
    This is a checkpoint task — the work is human verification of the steps described in &lt;how-to-verify&gt; below. The agent's job for this task is to:
      1. Print the &lt;how-to-verify&gt; steps to the user
      2. Wait for the &lt;resume-signal&gt; from the user
      3. Halt execution until the signal arrives
    Do NOT execute the verification steps autonomously — they are deliberately interactive.
  </action>
  <verify>
    <automated>echo "checkpoint:human-verify — awaiting user signal"</automated>
  </verify>
  <how-to-verify>
    1. Boot staff-web locally: `pnpm --filter @gymos/staff-web dev`. Confirm worker is running on Fly (Plans 05-07 deployed).

    2. **End-to-end outbound flow** (in-window happy path):
       a. Ensure a member has whatsapp_opt_in row + a recent inbound message (last_inbound_at < 24h). Use mcp__Neon__run_sql:
          ```sql
          INSERT INTO whatsapp_opt_in (member_id, opted_in_at, source)
          VALUES ('<seeded-member-id>', NOW(), 'manual_admin')
          ON CONFLICT (member_id) DO NOTHING;
          UPDATE conversations SET last_inbound_at = NOW() WHERE member_id = '<seeded-member-id>';
          ```
       b. Open /gymos in browser, click the conversation. Verify the window-state badge shows the GREEN Tabler dot + "in window · ~24h left" (LOW #12 — green IconPointFilled, NOT the ● bullet character).
       c. Type "Test outbound from P1b-08" and click Send.
       d. Expected: message appears in thread with status='queued' (clock icon or "queued" suffix).
       e. Within ~5s, refresh page (TanStack focus refetch). Expected: message status flips to 'sent' (and shortly 'delivered' / 'read' if real WhatsApp number receives).
       f. Verify in Neon:
          ```sql
          SELECT id, status, external_id, error_code FROM messages
          WHERE id LIKE 'msg_%' ORDER BY id DESC LIMIT 1;
          ```
          Expected: status='sent', external_id starts with 'wamid'.

    3. **Out-of-window enforcement** (success criterion #3):
       a. Set last_inbound_at to >24h ago:
          ```sql
          UPDATE conversations SET last_inbound_at = NOW() - INTERVAL '25 hours'
          WHERE member_id = '<seeded-member-id>';
          ```
       b. Reload /gymos. Window-state badge should show the GREY Tabler dot + "out of window — template only".
       c. Send button should be disabled. Input placeholder should say "Out of 24h window — use a template (P2)".
       d. (Optional) If you bypass the UI gate via direct enqueue, the worker should mark the message status='failed' with error_code='WINDOW_EXPIRED'.

    4. **No-opt-in enforcement** (success criterion #4):
       a. Pick a member with NO opt-in row:
          ```sql
          DELETE FROM whatsapp_opt_in WHERE member_id = '<member-id>';
          ```
       b. Reload /gymos. Send button should be disabled. Input placeholder should say "Member hasn't opted in to WhatsApp messages".

    5. **Failed message rendering** (D-19):
       a. Manually insert a failed message:
          ```sql
          INSERT INTO messages (id, conversation_id, direction, message_type, body, status, error_code)
          VALUES ('msg_test_failed_we', '<conv-id>', 'out', 'text', 'demo failed', 'failed', 'WINDOW_EXPIRED');
          INSERT INTO messages (id, conversation_id, direction, message_type, body, status, error_code)
          VALUES ('msg_test_failed_no', '<conv-id>', 'out', 'text', 'demo failed', 'failed', 'NO_OPT_IN');
          ```
       b. Reload /gymos and open the conversation. Verify the two failed messages render with the respective D-19 copy.

    6. **Stripe rotation flow** (success criterion #6):
       a. Open /gymos/settings/integrations. Verify the "Current key" line uses a Tabler dot icon (LOW #12), NOT the ● bullet character.
       b. Paste an invalid key like `rk_test_invalid_1234` → expect "Stripe rejected" error.
       c. Paste a valid test restricted key from your Stripe Dashboard → expect "Key rotated successfully."
       d. Reload — verify "Current key: set — updated <recent timestamp>" with green Tabler dot.
       e. Verify in Neon:
          ```sql
          SELECT name, updated_at, length(ciphertext) FROM secrets;
          -- Expected: 1 row, length > 0
          ```
       f. Verify the worker reads the new key on next stripe-event job. Trigger one via `stripe trigger checkout.session.completed`. Watch worker logs for `[stripe-event] processed` (means it could decrypt + reach Stripe with the new key).

    Report any failures. Type "approved" only if all 5 scenarios pass.
  </how-to-verify>
  <resume-signal>Type "approved" if all 5 end-to-end scenarios work as expected.</resume-signal>
  <acceptance_criteria>
    - User confirms in-window outbound flow: queued → sent + external_id populated
    - User confirms out-of-window UI disables Send + shows "template only" badge (with grey Tabler dot)
    - User confirms no-opt-in UI disables Send + shows opt-in placeholder
    - User confirms failed-bubble D-19 error copy renders
    - User confirms Stripe rotation: validate → store encrypted → worker reads new key
    - User confirms window-state badges and the current-key indicator use the Tabler IconPointFilled dot (NOT the ● bullet character) — LOW #12
  </acceptance_criteria>
  <done>Staff-web fully integrated with the worker spine. Defence-in-depth (UI pre-gate + worker enforce) confirmed. Stripe rotation works without downtime. UI indicators use Tabler IconPointFilled per LOW #12.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/staff-web exec tsc --noEmit` exits 0
- gymos.tsx does NOT contain direct Meta API calls (grep returns no `graph.facebook.com`)
- gymos.tsx contains enqueueOutboundWhatsApp + status='queued' insert
- gymos.tsx loader queries whatsapp_window_state VIEW + whatsapp_opt_in table
- gymos.tsx AND gymos.settings.integrations.tsx import IconPointFilled from @tabler/icons-react (LOW #12)
- Neither file contains the bare ● (U+25CF) character — LOW #12
- Send button disabled when out-of-window or no-opt-in (UI pre-gate per D-19)
- /gymos/settings/integrations rotation flow validates + encrypts + stores in secrets table
- Failed messages render D-19 friendly copy
</verification>

<success_criteria>
1. Coach Send action no longer calls Meta directly (WA-05)
2. Optimistic insert + enqueue pattern (D-18) — queued messages render immediately
3. UI shows window-state badges + opt-in state + Send-button gate (D-19, D-20) using Tabler IconPointFilled (LOW #12)
4. Failed messages display friendly error copy keyed on error_code (D-19)
5. Stripe restricted key rotation works without downtime (success criterion #6)
6. Defence-in-depth confirmed: UI pre-gates + worker re-checks at send time
7. No ● (U+25CF) bullet glyphs in any new staff-web UI — Tabler IconPointFilled is the sole status-dot pattern (LOW #12)
</success_criteria>

<output>
After completion, create `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-08-SUMMARY.md` recording:
- One end-to-end outbound trace (messages row: queued → sent + external_id) from UI click to worker completion
- Confirmation of UI pre-gates working (Send disabled out-of-window + no-opt-in)
- Confirmation of D-19 error copy in failed-message bubbles
- Confirmation that all status dots use Tabler IconPointFilled (LOW #12)
- Stripe rotation success — secrets row length + worker successfully decrypted
- Notes for Plan 09 about validation test fixtures (saved WA inbound payload, saved Stripe trigger events)
</output>
