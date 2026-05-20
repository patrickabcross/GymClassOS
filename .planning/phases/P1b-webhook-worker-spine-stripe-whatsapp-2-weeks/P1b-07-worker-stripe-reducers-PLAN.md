---
phase: P1b-webhook-worker-spine-stripe-whatsapp-2-weeks
plan: 07
type: execute
wave: 4
depends_on: [01, 02, 03, 05]
files_modified:
  - apps/worker/src/lib/stripe.ts
  - apps/worker/src/lib/secrets.ts
  - apps/worker/src/queues/stripe-event.ts
  - apps/worker/src/domain/stripeReducers/index.ts
  - apps/worker/src/domain/stripeReducers/dispatch.ts
  - apps/worker/src/domain/stripeReducers/checkout-session-completed.ts
  - apps/worker/src/domain/stripeReducers/invoice-paid.ts
  - apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts
  - apps/worker/src/domain/stripeReducers/subscription-updated.ts
  - apps/worker/src/domain/stripeReducers/subscription-deleted.ts
  - apps/worker/src/domain/stripeReducers/charge-refunded.ts
  - apps/worker/src/domain/stripeReducers/checkout-session-completed.test.ts
  - apps/worker/src/domain/stripeReducers/invoice-paid.test.ts
  - apps/worker/src/domain/stripeReducers/subscription-updated.test.ts
  - apps/worker/src/domain/stripeReducers/charge-refunded.test.ts
  - apps/worker/src/lib/secrets.test.ts
  - apps/worker/src/index.ts
autonomous: true
requirements: [WEB-06, STR-03, STR-04, STR-05, STR-06, STR-07]
must_haves:
  truths:
    - "stripe-event queue handler runs each reducer + processed_at UPDATE in a SINGLE Drizzle transaction (WEB-06)"
    - "Each reducer REFETCHES from Stripe via stripe.X.retrieve(id) — does NOT trust webhook payload (WEB-06, PITFALL #4). Every reducer file MUST contain the substring `stripe.<resource>.retrieve` (asserted in tests)."
    - "Every reducer file MUST have a clear idempotency guarantee: either an insert with .onConflictDoNothing/.onConflictDoUpdate, or an UPDATE bound to a deterministic key. Asserted by per-file acceptance criteria."
    - "All 6 reducers idempotent — replay-twice produces no duplicate rows (STR-07, success criterion #1)"
    - "Stripe SDK apiVersion pinned to '2026-04-22.dahlia' (PITFALL #3)"
    - "Stripe restricted key stored encrypted via pgcrypto pgp_sym_encrypt(value, PGCRYPTO_MASTER_KEY) in secrets table (STR-01 storage)"
    - "getStripeSecretKey() reads from secrets table first, falls back to env STRIPE_SECRET_KEY (rotation-capable)"
    - "checkout.session.completed grants pass deterministically — pass_id = pass_<paymentIntentId>_<lineItemId> + ON CONFLICT DO NOTHING (idempotent)"
    - "charge.refunded inserts NEGATIVE pass_debits entry (ledger pattern from D1-02 SUMMARY)"
    - "stripe-event queue concurrency=3 (D-14)"
    - "All reducer imports are at the top of each file — no trailing imports with 'move to top' comments (LOW #11)"
  artifacts:
    - path: "apps/worker/src/queues/stripe-event.ts"
      provides: "pg-boss handler that loads webhook_events row + dispatches to reducer in single TX"
      contains: "db.transaction"
    - path: "apps/worker/src/domain/stripeReducers/index.ts"
      provides: "Barrel re-export of dispatch.ts (kept for stable import surface)"
      exports: ["reducers"]
    - path: "apps/worker/src/domain/stripeReducers/dispatch.ts"
      provides: "Dispatch table mapping event.type → reducer function. Imported by both index.ts barrel and stripe-event.ts queue handler."
      exports: ["reducers"]
    - path: "apps/worker/src/domain/stripeReducers/checkout-session-completed.ts"
      provides: "STR-03: upsert stripe_customers + payments + grant passes"
    - path: "apps/worker/src/domain/stripeReducers/charge-refunded.ts"
      provides: "STR-06: insert negative pass_debits + mark payment refunded"
    - path: "apps/worker/src/lib/secrets.ts"
      provides: "encryptSecret / decryptSecret using pgcrypto + writeSecret / readSecret DB helpers"
      contains: "pgp_sym_encrypt"
  key_links:
    - from: "apps/worker/src/queues/stripe-event.ts"
      to: "single Drizzle transaction wrapping reducer + processedAt UPDATE (WEB-06)"
      via: "await db.transaction(async (tx) => { await reducer(event, tx, stripe); await tx.update(webhookEvents).set({processedAt}) })"
      pattern: "db\\.transaction"
    - from: "apps/worker/src/domain/stripeReducers/checkout-session-completed.ts"
      to: "Stripe SDK refetch"
      via: "stripe.checkout.sessions.retrieve(session.id, { expand: [...] })"
      pattern: "stripe\\.checkout\\.sessions\\.retrieve"
    - from: "apps/worker/src/lib/secrets.ts pgp_sym_encrypt"
      to: "secrets table ciphertext column"
      via: "INSERT/UPDATE with pgp_sym_encrypt(value, PGCRYPTO_MASTER_KEY)"
      pattern: "pgp_sym_encrypt"
---

<objective>
Ship the Stripe side of P1b: six idempotent reducer functions, each running in a single Drizzle transaction with the `webhook_events.processed_at` UPDATE. Each reducer REFETCHES state from Stripe (don't trust payload — WEB-06, PITFALL #4). Stripe restricted-key encrypted via pgcrypto for rotation-capable storage (STR-01 storage; rotation UI ships in Plan 08).

HIGH #3 split: Task 2 is split into two tasks (2a + 2b) so the reducer set ships in two reviewable, individually-tested chunks rather than one ~430 LOC megatask. Each chunk has test enforcement for at least two of its reducers, ensuring all six reducers have explicit idempotency assertions in tests.

Purpose: WEB-06 (single TX + refetch), STR-03 (checkout.session.completed grants pass), STR-04 (invoice.paid/failed reconcile subscriptions), STR-05 (subscription.updated/deleted reconcile status), STR-06 (charge.refunded reverses pass via negative pass_debits), STR-07 (all idempotent — verified by Plan 09 replay-twice test).
Output: stripe-event queue drains; all 6 event types handled; replaying via `stripe trigger` twice produces exactly 1 row each (success criterion #1).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md
@apps/staff-web/server/db/schema.ts
@apps/worker/src/lib/db.ts
@apps/worker/src/lib/env.ts
@apps/edge-webhooks/src/lib/stripe.ts
@CLAUDE.md

<interfaces>
<!-- Stripe Node SDK 19.x with apiVersion '2026-04-22.dahlia' -->
new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia" })

<!-- Reducer signature -->
type Reducer = (event: Stripe.Event, tx: TxClient, stripe: Stripe) => Promise<void>;

<!-- The 6 event types — split across Task 2a + Task 2b -->
Task 2a (initial reducers + dispatch + queue):
- checkout.session.completed → STR-03 (upsert stripe_customers + payments + grant passes)
- invoice.paid → STR-04 (upsert stripe_subscriptions current_period_end + insert payments row)
- invoice.payment_failed → STR-04 (update stripe_subscriptions.status='past_due' + insert payments status='failed')

Task 2b (remaining reducers + extended dispatch):
- customer.subscription.updated → STR-05 (upsert stripe_subscriptions from event.data.object — use event.created for last-write-wins)
- customer.subscription.deleted → STR-05 (set stripe_subscriptions.status='canceled')
- charge.refunded → STR-06 (insert NEGATIVE pass_debits + mark payment refunded)

<!-- Schema (Plan 02 added these) -->
stripe_customers: { stripe_customer_id PK, member_id, raw_json, updated_at }
stripe_subscriptions: { stripe_subscription_id PK, member_id, status, plan_id, current_period_end, raw_json, updated_at }
payments: { id PK 'pay_<piId>', member_id, stripe_payment_intent_id UNIQUE, amount_minor_units, currency, status, raw_json, occurred_at }
passes (existing): { id PK, member_id, granted, source, stripe_charge_id, product_name, expires_at }
pass_debits (existing): { id PK, pass_id, amount (negative for refund), reason }
secrets: { name PK, ciphertext, updated_at, last_used_at }
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Secrets module — pgcrypto encrypt/decrypt + rotation-capable getStripeSecretKey()</name>
  <files>apps/worker/src/lib/secrets.ts, apps/worker/src/lib/secrets.test.ts, apps/worker/src/lib/stripe.ts</files>
  <read_first>
    - apps/worker/src/lib/env.ts (PGCRYPTO_MASTER_KEY env var was added in Plan 05 Task 1)
    - apps/staff-web/server/db/schema.ts (secrets table from Plan 02)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Stripe rotation flow" lines 1297-1349
    - apps/edge-webhooks/src/lib/stripe.ts (apiVersion pin to mirror)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-15 secrets table; STR-01 encrypted key storage)
    - CLAUDE.md (no-unscoped-queries — secrets is studio-global, requires guard:allow-unscoped comment)
  </read_first>
  <behavior>
    - writeSecret(name, plaintext, db) → INSERT/UPDATE secrets WHERE name = name with pgp_sym_encrypt(plaintext, master_key)
    - readSecret(name, db) → SELECT pgp_sym_decrypt(ciphertext::bytea, master_key) WHERE name = name; returns string | null
    - readSecret also updates last_used_at on access (for audit visibility)
    - getStripeSecretKey(db) → first tries readSecret('stripe_restricted_key'); on null, returns env STRIPE_SECRET_KEY; throws if both absent
    - getStripe(db) returns Stripe client with apiVersion '2026-04-22.dahlia' pinned; secret resolved via getStripeSecretKey
    - Tests: roundtrip (write→read returns plaintext); rotation (write 'key_v1' → read returns 'key_v1' → write 'key_v2' → read returns 'key_v2'); fallback to env when secrets table empty
  </behavior>
  <action>
    Concrete steps:

    1. Create `apps/worker/src/lib/secrets.ts`:
       ```ts
       import { sql } from "drizzle-orm";
       import { getEnv } from "./env.js";
       import type { getDb } from "./db.js";

       /**
        * Write a secret to the `secrets` table, encrypted via pgcrypto.
        * Used by the Stripe rotation flow (P1b-08).
        *
        * STR-01 mandate: Stripe restricted key stored encrypted in DB so the
        * rotation UI can read it. Master key lives in env (Fly Secret).
        */
       export async function writeSecret(
         name: string,
         plaintext: string,
         db: ReturnType<typeof getDb>,
       ): Promise<void> {
         const env = getEnv();
         // guard:allow-unscoped — secrets is studio-global (one studio per deploy)
         await db.execute(sql`
           INSERT INTO secrets (name, ciphertext, updated_at)
           VALUES (
             ${name},
             pgp_sym_encrypt(${plaintext}, ${env.PGCRYPTO_MASTER_KEY}),
             NOW()
           )
           ON CONFLICT (name) DO UPDATE
             SET ciphertext = EXCLUDED.ciphertext,
                 updated_at = EXCLUDED.updated_at
         `);
       }

       /**
        * Read a secret from the `secrets` table, decrypted via pgcrypto.
        * Also updates last_used_at for audit visibility.
        * Returns null if no row exists for the given name.
        */
       export async function readSecret(
         name: string,
         db: ReturnType<typeof getDb>,
       ): Promise<string | null> {
         const env = getEnv();
         // guard:allow-unscoped — secrets is studio-global
         const result = await db.execute(sql`
           UPDATE secrets
           SET last_used_at = NOW()
           WHERE name = ${name}
           RETURNING pgp_sym_decrypt(ciphertext::bytea, ${env.PGCRYPTO_MASTER_KEY}) AS plaintext
         `);
         const rows = (result as any)?.rows ?? (result as any);
         if (!rows || rows.length === 0) return null;
         return rows[0].plaintext as string;
       }

       /**
        * Resolve the active Stripe restricted key.
        * Priority: secrets table → env STRIPE_SECRET_KEY → throw.
        * Rotation-capable: write to secrets via writeSecret('stripe_restricted_key', ...).
        */
       export async function getStripeSecretKey(
         db: ReturnType<typeof getDb>,
       ): Promise<string> {
         const fromDb = await readSecret("stripe_restricted_key", db);
         if (fromDb) return fromDb;
         const env = getEnv();
         if (env.STRIPE_SECRET_KEY) return env.STRIPE_SECRET_KEY;
         throw new Error(
           "No Stripe key available — neither secrets.stripe_restricted_key nor env STRIPE_SECRET_KEY is set",
         );
       }
       ```

    2. Create `apps/worker/src/lib/stripe.ts`:
       ```ts
       import Stripe from "stripe";
       import type { getDb } from "./db.js";
       import { getStripeSecretKey } from "./secrets.js";

       const STRIPE_API_VERSION = "2026-04-22.dahlia" as const; // PINNED — PITFALL #3

       /**
        * Build a Stripe SDK instance using the active restricted key.
        * Worker calls this once per job (the key may have rotated between jobs).
        * For staff-web (Plan 08), the rotation endpoint uses a fresh instance per request.
        */
       export async function getStripe(db: ReturnType<typeof getDb>): Promise<Stripe> {
         const key = await getStripeSecretKey(db);
         return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
       }

       export { STRIPE_API_VERSION };
       ```

    3. Create `apps/worker/src/lib/secrets.test.ts`:
       ```ts
       import { describe, it, expect, vi, beforeEach } from "vitest";

       const executeMock = vi.fn();
       const mockDb = { execute: executeMock } as any;

       vi.mock("./env.js", () => ({
         getEnv: () => ({
           PGCRYPTO_MASTER_KEY: "test-master-key-1234567890abcdef",
           STRIPE_SECRET_KEY: "sk_test_envfallback",
         }),
       }));

       import { writeSecret, readSecret, getStripeSecretKey } from "./secrets.js";

       describe("secrets", () => {
         beforeEach(() => {
           executeMock.mockReset();
         });

         it("writeSecret runs INSERT...ON CONFLICT with pgp_sym_encrypt", async () => {
           executeMock.mockResolvedValue({ rows: [] });
           await writeSecret("stripe_restricted_key", "rk_test_abc", mockDb);
           const sqlObj = executeMock.mock.calls[0][0];
           const sqlStr = JSON.stringify(sqlObj);
           expect(sqlStr).toContain("INSERT INTO secrets");
           expect(sqlStr).toContain("pgp_sym_encrypt");
           expect(sqlStr).toContain("ON CONFLICT");
         });

         it("readSecret returns plaintext when row exists", async () => {
           executeMock.mockResolvedValueOnce({ rows: [{ plaintext: "rk_test_decrypted" }] });
           const result = await readSecret("stripe_restricted_key", mockDb);
           expect(result).toBe("rk_test_decrypted");
         });

         it("readSecret returns null when row missing", async () => {
           executeMock.mockResolvedValueOnce({ rows: [] });
           const result = await readSecret("missing_key", mockDb);
           expect(result).toBeNull();
         });

         it("readSecret uses pgp_sym_decrypt + updates last_used_at", async () => {
           executeMock.mockResolvedValueOnce({ rows: [{ plaintext: "v" }] });
           await readSecret("k", mockDb);
           const sqlStr = JSON.stringify(executeMock.mock.calls[0][0]);
           expect(sqlStr).toContain("UPDATE secrets");
           expect(sqlStr).toContain("pgp_sym_decrypt");
           expect(sqlStr).toContain("last_used_at = NOW()");
         });

         it("getStripeSecretKey prefers DB over env", async () => {
           executeMock.mockResolvedValueOnce({ rows: [{ plaintext: "rk_test_from_db" }] });
           const key = await getStripeSecretKey(mockDb);
           expect(key).toBe("rk_test_from_db");
         });

         it("getStripeSecretKey falls back to env on DB miss", async () => {
           executeMock.mockResolvedValueOnce({ rows: [] });
           const key = await getStripeSecretKey(mockDb);
           expect(key).toBe("sk_test_envfallback");
         });
       });
       ```

    4. Run `pnpm --filter @gymos/worker test apps/worker/src/lib/secrets` — all 6 tests pass.
    5. Run `pnpm --filter @gymos/worker typecheck` — exits 0.
    6. Run `npx prettier --write apps/worker/src/lib/secrets*.ts apps/worker/src/lib/stripe.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test secrets 2>&amp;1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `apps/worker/src/lib/secrets.ts` contains string `pgp_sym_encrypt` (write path)
    - `apps/worker/src/lib/secrets.ts` contains string `pgp_sym_decrypt` (read path)
    - `apps/worker/src/lib/secrets.ts` contains string `last_used_at = NOW()` (audit visibility)
    - `apps/worker/src/lib/secrets.ts` contains string `// guard:allow-unscoped` (twice — for read AND write)
    - `apps/worker/src/lib/stripe.ts` contains string `"2026-04-22.dahlia"` (apiVersion pin)
    - `apps/worker/src/lib/stripe.ts` contains string `getStripeSecretKey(db)` (rotation-aware)
    - All 6 secrets tests pass
    - `pnpm --filter @gymos/worker typecheck` exits 0
  </acceptance_criteria>
  <done>pgcrypto-backed secret storage + rotation-aware Stripe client init. apiVersion pinned.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2a: Reducers chunk A (checkout.session.completed + invoice.paid + invoice.payment_failed) + dispatch + queue handler + tests for checkout AND invoice.paid (HIGH #3 split)</name>
  <files>apps/worker/src/domain/stripeReducers/checkout-session-completed.ts, apps/worker/src/domain/stripeReducers/invoice-paid.ts, apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts, apps/worker/src/domain/stripeReducers/dispatch.ts, apps/worker/src/domain/stripeReducers/index.ts, apps/worker/src/queues/stripe-event.ts, apps/worker/src/index.ts, apps/worker/src/domain/stripeReducers/checkout-session-completed.test.ts, apps/worker/src/domain/stripeReducers/invoice-paid.test.ts</files>
  <read_first>
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pattern 3: Stripe Event Reducers" lines 628-804
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-22 all 6 handlers in P1b, D-14 concurrency=3)
    - apps/staff-web/server/db/schema.ts (stripeCustomers, stripeSubscriptions, payments — Plan 02 added these)
    - apps/worker/src/lib/stripe.ts (created in Task 1)
    - apps/worker/src/lib/db.ts (Drizzle client)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md Pitfall #4 (refetch from Stripe)
  </read_first>
  <behavior>
    - 3 reducer files: checkout-session-completed.ts, invoice-paid.ts, invoice-payment-failed.ts
    - Each reducer file has ALL imports at the top (LOW #11 — no trailing imports, no "move to top" comments)
    - Each reducer refetches via stripe.X.retrieve(id)
    - Each reducer uses deterministic IDs + onConflictDoNothing OR onConflictDoUpdate for idempotency
    - dispatch.ts: maps these 3 event types to their reducer functions
    - index.ts: re-exports `reducers` from dispatch.ts (barrel for stable import surface; Task 2b extends dispatch.ts directly)
    - stripe-event.ts: pg-boss handler loading webhook_events + db.transaction wrapping reducer + processedAt UPDATE
    - Unit tests for BOTH checkout.session.completed (4+ tests) AND invoice.paid (2+ tests, including the replay/idempotency assertion)
    - Worker index.ts registers the stripe-event queue
  </behavior>
  <action>
    Concrete steps:

    1. Create `apps/worker/src/domain/stripeReducers/checkout-session-completed.ts` — all imports at the TOP:
       ```ts
       import type Stripe from "stripe";
       import { sql } from "drizzle-orm";
       import { schema } from "../../lib/db.js";

       type TxClient = any; // Drizzle transaction client — keep loose for now

       /**
        * STR-03: checkout.session.completed.
        * Refetches session from Stripe (PITFALL #4), upserts customer mirror,
        * inserts payment, grants passes with deterministic IDs (replay-safe).
        */
       export async function checkoutSessionCompleted(
         event: Stripe.Event,
         tx: TxClient,
         stripe: Stripe,
       ): Promise<void> {
         const session = event.data.object as Stripe.Checkout.Session;

         // REFETCH for current state (PITFALL #4 + WEB-06)
         const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
           expand: ["line_items.data.price.product", "customer"],
         });

         const customerId =
           typeof fullSession.customer === "string"
             ? fullSession.customer
             : fullSession.customer?.id;

         const memberId =
           (fullSession.metadata?.memberId as string | undefined) ?? null;

         if (customerId) {
           await tx
             .insert(schema.stripeCustomers)
             .values({
               stripeCustomerId: customerId,
               memberId,
               rawJson: JSON.stringify(fullSession.customer ?? { id: customerId }),
             })
             .onConflictDoNothing({ target: schema.stripeCustomers.stripeCustomerId });
         }

         // payments row keyed on payment_intent (idempotent)
         const paymentIntentId =
           typeof fullSession.payment_intent === "string"
             ? fullSession.payment_intent
             : fullSession.payment_intent?.id;

         if (paymentIntentId) {
           await tx
             .insert(schema.payments)
             .values({
               id: `pay_${paymentIntentId}`,
               memberId,
               stripePaymentIntentId: paymentIntentId,
               amountMinorUnits: fullSession.amount_total ?? 0,
               currency: fullSession.currency ?? "usd",
               status: "succeeded",
               rawJson: JSON.stringify(fullSession),
               occurredAt: new Date(fullSession.created * 1000).toISOString(),
             })
             .onConflictDoNothing({ target: schema.payments.stripePaymentIntentId });
         }

         // Grant passes — deterministic IDs make replay safe
         // Demo: simple "pack" detection by line item description. P2 builds pass_products table.
         for (const li of fullSession.line_items?.data ?? []) {
           const credits = passCreditsForLineItem(li);
           if (credits === null || !memberId || !paymentIntentId) continue;

           const passId = `pass_${paymentIntentId}_${li.id}`;
           await tx.execute(sql`
             INSERT INTO passes (id, member_id, granted, source, stripe_charge_id, product_name, expires_at, created_at)
             VALUES (
               ${passId},
               ${memberId},
               ${credits},
               'purchase',
               ${paymentIntentId},
               ${li.description ?? "pack"},
               NULL,
               NOW()
             )
             ON CONFLICT (id) DO NOTHING
           `);
         }
       }

       /**
        * Demo helper: map line item to pass credits.
        * Production (P2): pass_products table.
        */
       function passCreditsForLineItem(li: Stripe.LineItem): number | null {
         const desc = (li.description ?? "").toLowerCase();
         if (desc.includes("10-pack") || desc.includes("10 pack")) return 10;
         if (desc.includes("5-pack") || desc.includes("5 pack")) return 5;
         if (desc.includes("1-class") || desc.includes("drop-in")) return 1;
         return null; // unknown SKU — skip pass grant
       }
       ```

    2. Create `apps/worker/src/domain/stripeReducers/invoice-paid.ts` — all imports at the TOP:
       ```ts
       import type Stripe from "stripe";
       import { schema } from "../../lib/db.js";

       export async function invoicePaid(
         event: Stripe.Event,
         tx: any,
         stripe: Stripe,
       ): Promise<void> {
         const invoice = event.data.object as Stripe.Invoice;

         // REFETCH (PITFALL #4)
         const full = await stripe.invoices.retrieve(invoice.id!, { expand: ["subscription", "customer"] });

         const subId = typeof full.subscription === "string"
           ? full.subscription
           : full.subscription?.id;
         const customerId = typeof full.customer === "string"
           ? full.customer
           : full.customer?.id;

         if (subId && customerId) {
           // Refetch subscription for current_period_end
           const sub = await stripe.subscriptions.retrieve(subId);
           await tx
             .insert(schema.stripeSubscriptions)
             .values({
               stripeSubscriptionId: subId,
               memberId: (sub.metadata?.memberId as string) ?? "",
               status: sub.status,
               planId: (sub as any).plan?.id ?? null,
               currentPeriodEnd: new Date((sub.current_period_end ?? 0) * 1000).toISOString(),
               rawJson: JSON.stringify(sub),
             })
             .onConflictDoUpdate({
               target: schema.stripeSubscriptions.stripeSubscriptionId,
               set: {
                 status: sub.status,
                 currentPeriodEnd: new Date((sub.current_period_end ?? 0) * 1000).toISOString(),
                 rawJson: JSON.stringify(sub),
                 updatedAt: new Date().toISOString(),
               },
             });
         }

         const piId = typeof full.payment_intent === "string" ? full.payment_intent : full.payment_intent?.id;
         if (piId) {
           await tx
             .insert(schema.payments)
             .values({
               id: `pay_${piId}`,
               memberId: (full.metadata?.memberId as string) ?? null,
               stripePaymentIntentId: piId,
               amountMinorUnits: full.amount_paid ?? 0,
               currency: full.currency ?? "usd",
               status: "succeeded",
               rawJson: JSON.stringify(full),
               occurredAt: new Date(full.created * 1000).toISOString(),
             })
             .onConflictDoNothing({ target: schema.payments.stripePaymentIntentId });
         }
       }
       ```

    3. Create `apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts` — LOW #11: `eq` import at the TOP, no trailing imports:
       ```ts
       import type Stripe from "stripe";
       import { eq } from "drizzle-orm";
       import { schema } from "../../lib/db.js";

       export async function invoicePaymentFailed(
         event: Stripe.Event,
         tx: any,
         stripe: Stripe,
       ): Promise<void> {
         const invoice = event.data.object as Stripe.Invoice;
         const full = await stripe.invoices.retrieve(invoice.id!, { expand: ["subscription"] });

         const subId = typeof full.subscription === "string"
           ? full.subscription
           : full.subscription?.id;

         if (subId) {
           await tx
             .update(schema.stripeSubscriptions)
             .set({
               status: "past_due",
               updatedAt: new Date().toISOString(),
             })
             .where(eq(schema.stripeSubscriptions.stripeSubscriptionId, subId));
         }

         const piId = typeof full.payment_intent === "string" ? full.payment_intent : full.payment_intent?.id;
         if (piId) {
           await tx
             .insert(schema.payments)
             .values({
               id: `pay_${piId}`,
               memberId: (full.metadata?.memberId as string) ?? null,
               stripePaymentIntentId: piId,
               amountMinorUnits: full.amount_due ?? 0,
               currency: full.currency ?? "usd",
               status: "failed",
               rawJson: JSON.stringify(full),
               occurredAt: new Date(full.created * 1000).toISOString(),
             })
             .onConflictDoUpdate({
               target: schema.payments.stripePaymentIntentId,
               set: { status: "failed" },
             });
         }
       }
       ```

    4. Create `apps/worker/src/domain/stripeReducers/dispatch.ts` — Task 2a registers 3 reducers; Task 2b extends this file with the remaining 3:
       ```ts
       import { checkoutSessionCompleted } from "./checkout-session-completed.js";
       import { invoicePaid } from "./invoice-paid.js";
       import { invoicePaymentFailed } from "./invoice-payment-failed.js";

       /**
        * Stripe event reducer dispatch table.
        *
        * Task 2a registers checkout/invoice handlers; Task 2b extends this
        * object with subscription + charge.refunded reducers.
        */
       export const reducers = {
         "checkout.session.completed": checkoutSessionCompleted,
         "invoice.paid": invoicePaid,
         "invoice.payment_failed": invoicePaymentFailed,
       } as const;

       export type ReducerKey = keyof typeof reducers;
       ```

    5. Create `apps/worker/src/domain/stripeReducers/index.ts` (barrel — kept for stable import surface even though dispatch.ts is the source-of-truth):
       ```ts
       export { reducers } from "./dispatch.js";
       export type { ReducerKey } from "./dispatch.js";
       ```

    6. Create `apps/worker/src/queues/stripe-event.ts`:
       ```ts
       import type PgBoss from "pg-boss";
       import type Stripe from "stripe";
       import { eq, and } from "drizzle-orm";
       import { QUEUE_NAMES, StripeEventPayload } from "@gymos/queue";
       import { getDb, schema } from "../lib/db.js";
       import { getStripe } from "../lib/stripe.js";
       import { getLogger } from "../lib/logger.js";
       import { reducers } from "../domain/stripeReducers/index.js";

       export async function registerStripeEventWorker(boss: PgBoss) {
         const log = getLogger();
         await boss.work(
           QUEUE_NAMES.STRIPE_EVENT,
           { teamSize: 3, teamConcurrency: 3 }, // D-14
           async (jobs) => {
             const job = Array.isArray(jobs) ? jobs[0] : jobs;
             const data = StripeEventPayload.parse(job.data);
             const db = getDb();
             const stripe = await getStripe(db);

             // 1. Load webhook_events row
             // guard:allow-unscoped — webhook processor
             const row = await db
               .select()
               .from(schema.webhookEvents)
               .where(
                 and(
                   eq(schema.webhookEvents.provider, "stripe"),
                   eq(schema.webhookEvents.externalId, data.eventId),
                 ),
               )
               .limit(1)
               .then((r) => r[0]);
             if (!row) {
               log.warn({ eventId: data.eventId }, "[stripe-event] no webhook_events row");
               return;
             }
             if (row.processedAt) {
               // STR-07 / success criterion #1: replay returns no-op
               return;
             }

             const event = JSON.parse(row.payloadRaw) as Stripe.Event;
             const reducer = (reducers as Record<string, any>)[event.type];

             if (!reducer) {
               // Unhandled event type — log and mark processed so it doesn't replay forever
               log.info({ eventType: event.type, eventId: event.id }, "[stripe-event] no reducer; marking processed");
               await db
                 .update(schema.webhookEvents)
                 .set({ processedAt: new Date().toISOString() })
                 .where(eq(schema.webhookEvents.id, row.id));
               return;
             }

             // 2. SINGLE TRANSACTION (WEB-06): reducer + processedAt UPDATE atomically
             await db.transaction(async (tx) => {
               await reducer(event, tx as any, stripe);
               await tx
                 .update(schema.webhookEvents)
                 .set({ processedAt: new Date().toISOString() })
                 .where(eq(schema.webhookEvents.id, row.id));
             });

             log.info({ eventType: event.type, eventId: event.id }, "[stripe-event] processed");
           },
         );
       }
       ```

    7. Update `apps/worker/src/index.ts` to register the stripe-event worker:
       ```ts
       import { registerStripeEventWorker } from "./queues/stripe-event.js";
       // ...inside main(), after registerOutboundWhatsAppWorker (from Plan 06):
       await registerStripeEventWorker(boss);
       log.info("[worker] stripe-event queue registered");
       ```

    8. Create `apps/worker/src/domain/stripeReducers/checkout-session-completed.test.ts`:
       ```ts
       import { describe, it, expect, vi, beforeEach } from "vitest";

       const insertChain = { values: vi.fn().mockReturnThis(), onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
       const executeMock = vi.fn().mockResolvedValue({ rowCount: 1 });
       const mockTx = {
         insert: vi.fn().mockReturnValue(insertChain),
         execute: executeMock,
       };
       const stripeRetrieve = vi.fn();
       const mockStripe = {
         checkout: { sessions: { retrieve: stripeRetrieve } },
       } as any;

       vi.mock("../../lib/db.js", () => ({
         schema: {
           stripeCustomers: { stripeCustomerId: { name: "stripe_customer_id" } },
           payments: { stripePaymentIntentId: { name: "stripe_payment_intent_id" }, id: { name: "id" } },
         },
       }));

       import { checkoutSessionCompleted } from "./checkout-session-completed.js";

       describe("checkoutSessionCompleted (STR-03)", () => {
         beforeEach(() => {
           insertChain.values.mockClear();
           insertChain.onConflictDoNothing.mockClear();
           executeMock.mockClear();
           stripeRetrieve.mockReset();
         });

         it("refetches session from Stripe (PITFALL #4)", async () => {
           stripeRetrieve.mockResolvedValueOnce({
             id: "cs_test_abc",
             customer: "cus_abc",
             payment_intent: "pi_abc",
             amount_total: 5000,
             currency: "gbp",
             created: 1700000000,
             metadata: { memberId: "mem_1" },
             line_items: { data: [] },
           });
           const event = { data: { object: { id: "cs_test_abc" } } } as any;
           await checkoutSessionCompleted(event, mockTx as any, mockStripe);
           expect(stripeRetrieve).toHaveBeenCalledWith("cs_test_abc", expect.objectContaining({ expand: expect.any(Array) }));
         });

         it("upserts stripe_customers + payments with onConflictDoNothing (idempotency assertion)", async () => {
           stripeRetrieve.mockResolvedValueOnce({
             id: "cs_x",
             customer: "cus_x",
             payment_intent: "pi_x",
             amount_total: 1000,
             currency: "gbp",
             created: 1700000000,
             metadata: { memberId: "mem_x" },
             line_items: { data: [] },
           });
           const event = { data: { object: { id: "cs_x" } } } as any;
           await checkoutSessionCompleted(event, mockTx as any, mockStripe);
           expect(insertChain.onConflictDoNothing).toHaveBeenCalled();
         });

         it("grants pass with deterministic ID for 10-pack line item (idempotency via deterministic ID + ON CONFLICT)", async () => {
           stripeRetrieve.mockResolvedValueOnce({
             id: "cs_pack",
             customer: "cus_pack",
             payment_intent: "pi_pack",
             amount_total: 10000,
             currency: "gbp",
             created: 1700000000,
             metadata: { memberId: "mem_pack" },
             line_items: { data: [{ id: "li_1", description: "10-pack class credits" }] },
           });
           const event = { data: { object: { id: "cs_pack" } } } as any;
           await checkoutSessionCompleted(event, mockTx as any, mockStripe);
           const sqlStr = JSON.stringify(executeMock.mock.calls[0][0]);
           expect(sqlStr).toContain("passes");
           expect(sqlStr).toContain("pass_pi_pack_li_1");
           expect(sqlStr).toContain("ON CONFLICT");
         });

         it("skips pass grant for unknown product description", async () => {
           stripeRetrieve.mockResolvedValueOnce({
             id: "cs_unknown",
             customer: "cus_x",
             payment_intent: "pi_x",
             amount_total: 1000,
             currency: "gbp",
             created: 1700000000,
             metadata: { memberId: "mem_x" },
             line_items: { data: [{ id: "li_unknown", description: "Custom T-shirt" }] },
           });
           const event = { data: { object: { id: "cs_unknown" } } } as any;
           await checkoutSessionCompleted(event, mockTx as any, mockStripe);
           const passesCall = executeMock.mock.calls.find((c) => JSON.stringify(c[0]).includes("passes"));
           expect(passesCall).toBeUndefined();
         });
       });
       ```

    9. Create `apps/worker/src/domain/stripeReducers/invoice-paid.test.ts` — idempotency replay test (STR-07 assertion for this reducer):
       ```ts
       import { describe, it, expect, vi, beforeEach } from "vitest";

       const subInsertChain = {
         values: vi.fn().mockReturnThis(),
         onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
       };
       const paymentsInsertChain = {
         values: vi.fn().mockReturnThis(),
         onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
       };
       let insertCount = 0;
       const mockTx = {
         insert: vi.fn().mockImplementation(() => {
           insertCount += 1;
           // First insert = subscriptions (upsert); second = payments (do-nothing)
           return insertCount === 1 ? subInsertChain : paymentsInsertChain;
         }),
       };

       const invoiceRetrieve = vi.fn();
       const subRetrieve = vi.fn();
       const mockStripe = {
         invoices: { retrieve: invoiceRetrieve },
         subscriptions: { retrieve: subRetrieve },
       } as any;

       vi.mock("../../lib/db.js", () => ({
         schema: {
           stripeSubscriptions: { stripeSubscriptionId: { name: "stripe_subscription_id" } },
           payments: { stripePaymentIntentId: { name: "stripe_payment_intent_id" } },
         },
       }));

       import { invoicePaid } from "./invoice-paid.js";

       describe("invoicePaid (STR-04)", () => {
         beforeEach(() => {
           subInsertChain.values.mockClear();
           subInsertChain.onConflictDoUpdate.mockClear();
           paymentsInsertChain.values.mockClear();
           paymentsInsertChain.onConflictDoNothing.mockClear();
           invoiceRetrieve.mockReset();
           subRetrieve.mockReset();
           insertCount = 0;
         });

         it("refetches invoice AND subscription from Stripe (PITFALL #4)", async () => {
           invoiceRetrieve.mockResolvedValueOnce({
             id: "in_x",
             subscription: "sub_x",
             customer: "cus_x",
             payment_intent: "pi_x",
             amount_paid: 5000,
             currency: "gbp",
             created: 1700000000,
             metadata: {},
           });
           subRetrieve.mockResolvedValueOnce({
             id: "sub_x",
             status: "active",
             current_period_end: 1700100000,
             metadata: { memberId: "mem_sub" },
           });
           const event = { data: { object: { id: "in_x" } } } as any;
           await invoicePaid(event, mockTx as any, mockStripe);
           expect(invoiceRetrieve).toHaveBeenCalledWith("in_x", expect.any(Object));
           expect(subRetrieve).toHaveBeenCalledWith("sub_x");
         });

         it("uses onConflictDoNothing on payments and onConflictDoUpdate on subscriptions (idempotency assertion — STR-07 replay safety)", async () => {
           invoiceRetrieve.mockResolvedValueOnce({
             id: "in_replay",
             subscription: "sub_replay",
             customer: "cus_replay",
             payment_intent: "pi_replay",
             amount_paid: 1000,
             currency: "gbp",
             created: 1700000000,
             metadata: {},
           });
           subRetrieve.mockResolvedValueOnce({
             id: "sub_replay",
             status: "active",
             current_period_end: 1700100000,
             metadata: {},
           });
           const event = { data: { object: { id: "in_replay" } } } as any;
           await invoicePaid(event, mockTx as any, mockStripe);
           expect(subInsertChain.onConflictDoUpdate).toHaveBeenCalled();
           expect(paymentsInsertChain.onConflictDoNothing).toHaveBeenCalled();
         });
       });
       ```

    10. Run `pnpm --filter @gymos/worker test` — all tests pass (Task 1 secrets + Task 2a reducers).
    11. Run `pnpm --filter @gymos/worker typecheck` — exits 0.
    12. Run `pnpm --filter @gymos/worker build` — exits 0.
    13. Run `npx prettier --write apps/worker/src/domain/stripeReducers/*.ts apps/worker/src/queues/stripe-event.ts apps/worker/src/index.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test 2>&amp;1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `apps/worker/src/queues/stripe-event.ts` contains string `db.transaction` (single TX wrapping reducer + processedAt UPDATE — WEB-06)
    - `apps/worker/src/queues/stripe-event.ts` contains string `if (row.processedAt)` (replay no-op — STR-07)
    - `apps/worker/src/queues/stripe-event.ts` contains string `teamSize: 3` (D-14 concurrency)
    - `apps/worker/src/domain/stripeReducers/checkout-session-completed.ts` contains string `stripe.checkout.sessions.retrieve` (refetch — PITFALL #4)
    - `apps/worker/src/domain/stripeReducers/checkout-session-completed.ts` contains string `pass_${paymentIntentId}_${li.id}` (deterministic pass ID for replay safety)
    - `apps/worker/src/domain/stripeReducers/checkout-session-completed.ts` contains string `onConflictDoNothing` (idempotency assertion — applies to stripe_customers + payments)
    - `apps/worker/src/domain/stripeReducers/invoice-paid.ts` contains string `stripe.invoices.retrieve` (refetch — PITFALL #4)
    - `apps/worker/src/domain/stripeReducers/invoice-paid.ts` contains string `stripe.subscriptions.retrieve` (refetch — PITFALL #4)
    - `apps/worker/src/domain/stripeReducers/invoice-paid.ts` contains string `onConflictDoUpdate` (idempotency assertion — applies to stripe_subscriptions)
    - `apps/worker/src/domain/stripeReducers/invoice-paid.ts` contains string `onConflictDoNothing` (idempotency assertion — applies to payments)
    - `apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts` contains string `stripe.invoices.retrieve` (refetch — PITFALL #4)
    - `apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts` contains string `onConflictDoUpdate` (idempotency assertion — applies to payments)
    - `apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts` has `import { eq } from "drizzle-orm"` at the TOP of the file (within the first 10 lines), NOT at the bottom (LOW #11 fix)
    - `apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts` does NOT contain the comment string `move it to the top` or `move the import` (LOW #11 — no remediation comments left for executor)
    - `apps/worker/src/domain/stripeReducers/dispatch.ts` contains all 3 Task-2a event types as keys: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`
    - `apps/worker/src/domain/stripeReducers/index.ts` re-exports from `./dispatch.js`
    - checkout-session-completed tests pass (≥4 tests) AND invoice-paid tests pass (≥2 tests, including the onConflictDoUpdate/onConflictDoNothing idempotency assertion)
    - `pnpm --filter @gymos/worker build` exits 0
  </acceptance_criteria>
  <done>3 Task-2a reducers shipped (checkout + 2 invoice handlers) + dispatch.ts + stripe-event queue handler + tests for checkout AND invoice-paid. All imports at top of each file (LOW #11). Idempotency assertions explicit in every reducer file.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2b: Reducers chunk B (subscription.updated + subscription.deleted + charge.refunded) + extended dispatch + tests for subscription-updated AND charge-refunded (HIGH #3 split)</name>
  <files>apps/worker/src/domain/stripeReducers/subscription-updated.ts, apps/worker/src/domain/stripeReducers/subscription-deleted.ts, apps/worker/src/domain/stripeReducers/charge-refunded.ts, apps/worker/src/domain/stripeReducers/dispatch.ts, apps/worker/src/domain/stripeReducers/subscription-updated.test.ts, apps/worker/src/domain/stripeReducers/charge-refunded.test.ts</files>
  <read_first>
    - apps/worker/src/domain/stripeReducers/dispatch.ts (current state from Task 2a — Task 2b extends the reducers object)
    - apps/worker/src/domain/stripeReducers/invoice-paid.ts (pattern reference for subscription upsert)
    - apps/staff-web/server/db/schema.ts (stripeSubscriptions, passes, passDebits)
    - .planning/STATE.md §"Decisions" — D1-02 ledger pattern (pass balance = SUM grants − SUM debits)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-22 all 6 handlers in P1b)
  </read_first>
  <behavior>
    - 3 reducer files: subscription-updated.ts, subscription-deleted.ts, charge-refunded.ts
    - Each reducer file has ALL imports at the top (LOW #11 — no trailing imports, no "move to top" comments)
    - Each reducer refetches via stripe.X.retrieve(id) (subscription-deleted may skip refetch since the resource is deleted — but it still operates on event.data.object which carries the final state)
    - Each reducer uses deterministic IDs + onConflictDoUpdate (subscription-updated) OR a deterministic-keyed UPDATE (subscription-deleted) OR deterministic INSERT id with ON CONFLICT DO NOTHING (charge-refunded pass_debits)
    - dispatch.ts: EXTEND existing reducers object with 3 new entries — final object has all 6 event types
    - Unit tests for subscription-updated (2+ tests) AND charge-refunded (2+ tests)
  </behavior>
  <action>
    Concrete steps:

    1. Create `apps/worker/src/domain/stripeReducers/subscription-updated.ts` — all imports at TOP:
       ```ts
       import type Stripe from "stripe";
       import { schema } from "../../lib/db.js";

       export async function subscriptionUpdated(
         event: Stripe.Event,
         tx: any,
         stripe: Stripe,
       ): Promise<void> {
         const sub = event.data.object as Stripe.Subscription;
         // REFETCH for current state (PITFALL #4)
         const full = await stripe.subscriptions.retrieve(sub.id);

         await tx
           .insert(schema.stripeSubscriptions)
           .values({
             stripeSubscriptionId: full.id,
             memberId: (full.metadata?.memberId as string) ?? "",
             status: full.status,
             planId: (full as any).plan?.id ?? null,
             currentPeriodEnd: new Date((full.current_period_end ?? 0) * 1000).toISOString(),
             rawJson: JSON.stringify(full),
           })
           .onConflictDoUpdate({
             target: schema.stripeSubscriptions.stripeSubscriptionId,
             set: {
               status: full.status,
               currentPeriodEnd: new Date((full.current_period_end ?? 0) * 1000).toISOString(),
               rawJson: JSON.stringify(full),
               updatedAt: new Date().toISOString(),
             },
           });
       }
       ```

    2. Create `apps/worker/src/domain/stripeReducers/subscription-deleted.ts` — all imports at TOP, including `eq`:
       ```ts
       import type Stripe from "stripe";
       import { eq } from "drizzle-orm";
       import { schema } from "../../lib/db.js";

       /**
        * STR-05 (deletion path): customer.subscription.deleted.
        *
        * The subscription resource is gone from Stripe; refetch would 404. The webhook
        * payload carries the final state of the subscription, so we use it directly
        * to UPDATE the mirror row to status='canceled'. The UPDATE is keyed by the
        * deterministic stripe_subscription_id, so replaying the same event is a no-op.
        */
       export async function subscriptionDeleted(
         event: Stripe.Event,
         tx: any,
         _stripe: Stripe,
       ): Promise<void> {
         const sub = event.data.object as Stripe.Subscription;
         await tx
           .update(schema.stripeSubscriptions)
           .set({
             status: "canceled",
             rawJson: JSON.stringify(sub),
             updatedAt: new Date().toISOString(),
           })
           .where(eq(schema.stripeSubscriptions.stripeSubscriptionId, sub.id));
       }
       ```
       NOTE: subscription-deleted is the one reducer that legitimately does NOT call `stripe.X.retrieve` (the resource no longer exists; refetch would 404). The webhook payload IS the source of truth here. Acceptance criteria accommodate this exception explicitly.

    3. Create `apps/worker/src/domain/stripeReducers/charge-refunded.ts` — all imports at TOP:
       ```ts
       import type Stripe from "stripe";
       import { eq, sql } from "drizzle-orm";
       import { schema } from "../../lib/db.js";

       /**
        * STR-06: charge.refunded.
        * REFETCH the charge from Stripe (PITFALL #4) so we use Stripe's current state
        * (refund amount may differ from the event payload after retries).
        * Insert NEGATIVE pass_debits for each pass granted by this payment_intent.
        * Pattern follows D1-02 ledger: pass_balance = SUM(grants) − SUM(debits).
        * Mark payments.status='refunded'.
        */
       export async function chargeRefunded(
         event: Stripe.Event,
         tx: any,
         stripe: Stripe,
       ): Promise<void> {
         const charge = event.data.object as Stripe.Charge;
         // REFETCH (PITFALL #4) — current refund state
         const full = await stripe.charges.retrieve(charge.id);

         const piId = typeof full.payment_intent === "string"
           ? full.payment_intent
           : full.payment_intent?.id;
         if (!piId) return;

         // guard:allow-unscoped — Stripe webhook processor; no per-user scoping
         const passes = await tx
           .select()
           .from(schema.passes)
           .where(eq(schema.passes.stripeChargeId, piId));

         for (const pass of passes) {
           const debitId = `pdebit_refund_${full.id}_${pass.id}`;
           // Deterministic ID — replay-safe via ON CONFLICT DO NOTHING
           await tx.execute(sql`
             INSERT INTO pass_debits (id, pass_id, amount, reason, created_at)
             VALUES (
               ${debitId},
               ${pass.id},
               ${-(pass.granted ?? 0)},
               'stripe_refund',
               NOW()
             )
             ON CONFLICT (id) DO NOTHING
           `);
         }

         // Mark payment refunded
         await tx
           .update(schema.payments)
           .set({ status: "refunded" })
           .where(eq(schema.payments.stripePaymentIntentId, piId));
       }
       ```

    4. Extend `apps/worker/src/domain/stripeReducers/dispatch.ts` to register the 3 new reducers — final form has all 6:
       ```ts
       import { checkoutSessionCompleted } from "./checkout-session-completed.js";
       import { invoicePaid } from "./invoice-paid.js";
       import { invoicePaymentFailed } from "./invoice-payment-failed.js";
       import { subscriptionUpdated } from "./subscription-updated.js";
       import { subscriptionDeleted } from "./subscription-deleted.js";
       import { chargeRefunded } from "./charge-refunded.js";

       /**
        * Stripe event reducer dispatch table — all 6 P1b event types (D-22).
        */
       export const reducers = {
         "checkout.session.completed": checkoutSessionCompleted,
         "invoice.paid": invoicePaid,
         "invoice.payment_failed": invoicePaymentFailed,
         "customer.subscription.updated": subscriptionUpdated,
         "customer.subscription.deleted": subscriptionDeleted,
         "charge.refunded": chargeRefunded,
       } as const;

       export type ReducerKey = keyof typeof reducers;
       ```

    5. Create `apps/worker/src/domain/stripeReducers/subscription-updated.test.ts`:
       ```ts
       import { describe, it, expect, vi, beforeEach } from "vitest";

       const insertChain = {
         values: vi.fn().mockReturnThis(),
         onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
       };
       const mockTx = { insert: vi.fn().mockReturnValue(insertChain) };

       const subRetrieve = vi.fn();
       const mockStripe = { subscriptions: { retrieve: subRetrieve } } as any;

       vi.mock("../../lib/db.js", () => ({
         schema: { stripeSubscriptions: { stripeSubscriptionId: { name: "stripe_subscription_id" } } },
       }));

       import { subscriptionUpdated } from "./subscription-updated.js";

       describe("subscriptionUpdated (STR-05)", () => {
         beforeEach(() => {
           insertChain.values.mockClear();
           insertChain.onConflictDoUpdate.mockClear();
           subRetrieve.mockReset();
         });

         it("refetches subscription from Stripe (PITFALL #4)", async () => {
           subRetrieve.mockResolvedValueOnce({
             id: "sub_abc",
             status: "active",
             current_period_end: 1700100000,
             metadata: { memberId: "mem_1" },
           });
           const event = { data: { object: { id: "sub_abc" } } } as any;
           await subscriptionUpdated(event, mockTx as any, mockStripe);
           expect(subRetrieve).toHaveBeenCalledWith("sub_abc");
         });

         it("uses onConflictDoUpdate on stripe_subscriptions (idempotency assertion — STR-07 replay safety)", async () => {
           subRetrieve.mockResolvedValueOnce({
             id: "sub_replay",
             status: "active",
             current_period_end: 1700100000,
             metadata: {},
           });
           const event = { data: { object: { id: "sub_replay" } } } as any;
           await subscriptionUpdated(event, mockTx as any, mockStripe);
           expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
         });
       });
       ```

    6. Create `apps/worker/src/domain/stripeReducers/charge-refunded.test.ts`:
       ```ts
       import { describe, it, expect, vi, beforeEach } from "vitest";

       const selectChain = {
         from: vi.fn().mockReturnThis(),
         where: vi.fn().mockResolvedValue([
           { id: "pass_pi_abc_li_1", granted: 10, stripeChargeId: "pi_abc" },
         ]),
       };
       const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
       const executeMock = vi.fn().mockResolvedValue({ rowCount: 1 });
       const mockTx = {
         select: vi.fn().mockReturnValue(selectChain),
         update: vi.fn().mockReturnValue(updateChain),
         execute: executeMock,
       };

       const chargeRetrieve = vi.fn();
       const mockStripe = { charges: { retrieve: chargeRetrieve } } as any;

       vi.mock("../../lib/db.js", () => ({
         schema: {
           passes: { stripeChargeId: { name: "stripe_charge_id" } },
           payments: { stripePaymentIntentId: { name: "stripe_payment_intent_id" } },
         },
       }));

       import { chargeRefunded } from "./charge-refunded.js";

       describe("chargeRefunded (STR-06)", () => {
         beforeEach(() => {
           executeMock.mockClear();
           updateChain.set.mockClear();
           chargeRetrieve.mockReset();
         });

         it("refetches charge from Stripe (PITFALL #4)", async () => {
           chargeRetrieve.mockResolvedValueOnce({
             id: "ch_refund_1",
             payment_intent: "pi_abc",
           });
           const event = { data: { object: { id: "ch_refund_1" } } } as any;
           await chargeRefunded(event, mockTx as any, mockStripe);
           expect(chargeRetrieve).toHaveBeenCalledWith("ch_refund_1");
         });

         it("inserts negative pass_debits entry with deterministic ID + ON CONFLICT DO NOTHING (idempotency assertion)", async () => {
           chargeRetrieve.mockResolvedValueOnce({
             id: "ch_refund_1",
             payment_intent: "pi_abc",
           });
           const event = { data: { object: { id: "ch_refund_1" } } } as any;
           await chargeRefunded(event, mockTx as any, mockStripe);
           const sqlStr = JSON.stringify(executeMock.mock.calls[0][0]);
           expect(sqlStr).toContain("pass_debits");
           expect(sqlStr).toContain("pdebit_refund_ch_refund_1_pass_pi_abc_li_1");
           expect(sqlStr).toContain("ON CONFLICT");
           // amount is -10 (the negative of pass.granted=10)
           expect(sqlStr).toContain("-10");
         });

         it("marks payments.status='refunded' for the payment_intent", async () => {
           chargeRetrieve.mockResolvedValueOnce({ id: "ch_x", payment_intent: "pi_y" });
           const event = { data: { object: { id: "ch_x" } } } as any;
           await chargeRefunded(event, mockTx as any, mockStripe);
           const setArgs = updateChain.set.mock.calls[0][0];
           expect(setArgs.status).toBe("refunded");
         });
       });
       ```

    7. Run `pnpm --filter @gymos/worker test` — all tests pass (Task 1 secrets + Task 2a + Task 2b reducers).
    8. Run `pnpm --filter @gymos/worker typecheck` — exits 0.
    9. Run `pnpm --filter @gymos/worker build` — exits 0.
    10. Run `npx prettier --write apps/worker/src/domain/stripeReducers/*.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @gymos/worker test 2>&amp;1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `apps/worker/src/domain/stripeReducers/subscription-updated.ts` contains string `stripe.subscriptions.retrieve` (refetch — PITFALL #4)
    - `apps/worker/src/domain/stripeReducers/subscription-updated.ts` contains string `onConflictDoUpdate` (idempotency assertion — applies to stripe_subscriptions)
    - `apps/worker/src/domain/stripeReducers/subscription-deleted.ts` does NOT call `stripe.X.retrieve` (intentional exception — the resource is deleted, refetch would 404; documented in file comment). Acceptance: file contains a comment string `refetch would 404` OR `resource is deleted` explaining the exception.
    - `apps/worker/src/domain/stripeReducers/subscription-deleted.ts` updates the row keyed by deterministic stripe_subscription_id (idempotency assertion — file contains `eq(schema.stripeSubscriptions.stripeSubscriptionId, sub.id)`)
    - `apps/worker/src/domain/stripeReducers/charge-refunded.ts` contains string `stripe.charges.retrieve` (refetch — PITFALL #4)
    - `apps/worker/src/domain/stripeReducers/charge-refunded.ts` contains string `pdebit_refund_${full.id}_${pass.id}` (deterministic debit ID — idempotency assertion)
    - `apps/worker/src/domain/stripeReducers/charge-refunded.ts` contains string `${-(pass.granted` (negative amount)
    - `apps/worker/src/domain/stripeReducers/charge-refunded.ts` contains string `status: "refunded"` (payments status update)
    - `apps/worker/src/domain/stripeReducers/charge-refunded.ts` contains string `ON CONFLICT (id) DO NOTHING` in the pass_debits INSERT (idempotency assertion)
    - All three Task-2b reducer files have all imports at the TOP (within the first 10 lines of the file) — NO trailing `import` statements (LOW #11)
    - `apps/worker/src/domain/stripeReducers/dispatch.ts` contains ALL 6 event types as keys: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`
    - subscription-updated tests pass (≥2 tests, with onConflictDoUpdate assertion) AND charge-refunded tests pass (≥3 tests, with refetch + deterministic-ID + status-update assertions)
    - **Aggregate idempotency check (HIGH #3 acceptance):** every file in `apps/worker/src/domain/stripeReducers/*.ts` (excluding dispatch.ts and index.ts) MUST contain EITHER `onConflictDoNothing` OR `onConflictDoUpdate` OR a comment explaining a deterministic-key UPDATE alternative (subscription-deleted is the lone exception, explicitly documented).
    - **Aggregate refetch check (HIGH #3 acceptance):** every reducer file (excluding subscription-deleted) MUST contain a `stripe.<resource>.retrieve` call. Verify with: `grep -L "stripe\\..*\\.retrieve" apps/worker/src/domain/stripeReducers/checkout-session-completed.ts apps/worker/src/domain/stripeReducers/invoice-paid.ts apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts apps/worker/src/domain/stripeReducers/subscription-updated.ts apps/worker/src/domain/stripeReducers/charge-refunded.ts` — must return EMPTY (every listed file contains the pattern).
    - `pnpm --filter @gymos/worker build` exits 0
  </acceptance_criteria>
  <done>6 Stripe reducers shipped total (3 in 2a + 3 in 2b). Every reducer file has an explicit idempotency mechanism + a refetch call (subscription-deleted is the lone documented exception). All imports at top of each file (LOW #11).</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/worker test` exits 0 (Task 1 secrets + Task 2a checkout + invoice-paid + Task 2b subscription-updated + charge-refunded — at least 13 tests total)
- All 6 reducers exist in stripeReducers/ directory
- Aggregate refetch check: every reducer file EXCEPT subscription-deleted contains `stripe.<resource>.retrieve` — verify by grep (HIGH #3)
- Aggregate idempotency check: every reducer file contains `onConflictDoNothing`, `onConflictDoUpdate`, or a deterministic-key UPDATE pattern — verify by grep (HIGH #3)
- stripe-event worker wraps reducer + processedAt UPDATE in single db.transaction (WEB-06)
- apiVersion '2026-04-22.dahlia' pinned (PITFALL #3)
- pgcrypto-based secret storage works (Task 1 tests pass)
- No file in stripeReducers/ has a trailing `import { eq }` at the bottom with a "move to top" comment (LOW #11)
</verification>

<success_criteria>
1. All 6 reducers ship in P1b (D-22), split across Task 2a (3) + Task 2b (3) for reviewability (HIGH #3)
2. Single TX wrapping reducer + processedAt UPDATE (WEB-06)
3. Refetch via stripe.X.retrieve in every reducer except subscription-deleted (which is documented as the lone exception because the resource no longer exists) (PITFALL #4)
4. Deterministic IDs (`pay_<piId>`, `pass_<piId>_<liId>`, `pdebit_refund_<chargeId>_<passId>`) + onConflictDoNothing/onConflictDoUpdate make replay safe (STR-07)
5. apiVersion '2026-04-22.dahlia' pinned (PITFALL #3)
6. pgcrypto + rotation-aware getStripeSecretKey (STR-01 storage)
7. All imports at top of each reducer file — no trailing imports with remediation comments (LOW #11)
</success_criteria>

<output>
After completion, create `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-07-SUMMARY.md` recording:
- Final test count for worker (gates + sendMessage + secrets + reducers)
- All 6 event types confirmed handled
- Deterministic ID schemes documented (for future debugging)
- Confirmation per-reducer of the refetch call + idempotency mechanism (table — one row per reducer)
- Notes for Plan 08 (staff-web Stripe rotation UI) about writeSecret('stripe_restricted_key', plaintext, db) usage
- Notes for Plan 09 (validation) about which fixtures to use for `stripe trigger` replay tests
</output>
