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
  - apps/worker/src/domain/stripeReducers/checkout-session-completed.ts
  - apps/worker/src/domain/stripeReducers/invoice-paid.ts
  - apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts
  - apps/worker/src/domain/stripeReducers/subscription-updated.ts
  - apps/worker/src/domain/stripeReducers/subscription-deleted.ts
  - apps/worker/src/domain/stripeReducers/charge-refunded.ts
  - apps/worker/src/domain/stripeReducers/checkout-session-completed.test.ts
  - apps/worker/src/domain/stripeReducers/charge-refunded.test.ts
  - apps/worker/src/lib/secrets.test.ts
  - apps/worker/src/index.ts
autonomous: true
requirements: [WEB-06, STR-03, STR-04, STR-05, STR-06, STR-07]
must_haves:
  truths:
    - "stripe-event queue handler runs each reducer + processed_at UPDATE in a SINGLE Drizzle transaction (WEB-06)"
    - "Each reducer REFETCHES from Stripe via stripe.X.retrieve(id) — does NOT trust webhook payload (WEB-06, PITFALL #4)"
    - "All 6 reducers idempotent — replay-twice produces no duplicate rows (STR-07, success criterion #1)"
    - "Stripe SDK apiVersion pinned to '2026-04-22.dahlia' (PITFALL #3)"
    - "Stripe restricted key stored encrypted via pgcrypto pgp_sym_encrypt(value, PGCRYPTO_MASTER_KEY) in secrets table (STR-01 storage)"
    - "getStripeSecretKey() reads from secrets table first, falls back to env STRIPE_SECRET_KEY (rotation-capable)"
    - "checkout.session.completed grants pass deterministically — pass_id = pass_<paymentIntentId>_<lineItemId> + ON CONFLICT DO NOTHING (idempotent)"
    - "charge.refunded inserts NEGATIVE pass_debits entry (ledger pattern from D1-02 SUMMARY)"
    - "stripe-event queue concurrency=3 (D-14)"
  artifacts:
    - path: "apps/worker/src/queues/stripe-event.ts"
      provides: "pg-boss handler that loads webhook_events row + dispatches to reducer in single TX"
      contains: "db.transaction"
    - path: "apps/worker/src/domain/stripeReducers/index.ts"
      provides: "Dispatch table mapping event.type → reducer function"
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

<!-- The 6 event types -->
- checkout.session.completed → STR-03 (upsert stripe_customers + payments + grant passes)
- invoice.paid → STR-04 (upsert stripe_subscriptions current_period_end + insert payments row)
- invoice.payment_failed → STR-04 (update stripe_subscriptions.status='past_due' + insert payments status='failed')
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
  <name>Task 2: Implement 6 Stripe reducers + dispatch table + stripe-event queue handler with single TX</name>
  <files>apps/worker/src/queues/stripe-event.ts, apps/worker/src/domain/stripeReducers/index.ts, apps/worker/src/domain/stripeReducers/checkout-session-completed.ts, apps/worker/src/domain/stripeReducers/invoice-paid.ts, apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts, apps/worker/src/domain/stripeReducers/subscription-updated.ts, apps/worker/src/domain/stripeReducers/subscription-deleted.ts, apps/worker/src/domain/stripeReducers/charge-refunded.ts, apps/worker/src/domain/stripeReducers/checkout-session-completed.test.ts, apps/worker/src/domain/stripeReducers/charge-refunded.test.ts</files>
  <read_first>
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md §"Pattern 3: Stripe Event Reducers" lines 628-804
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-CONTEXT.md (D-22 all 6 handlers in P1b, D-14 concurrency=3)
    - apps/staff-web/server/db/schema.ts (stripeCustomers, stripeSubscriptions, payments, passes, passDebits — Plan 02 added the first 3, last 2 are existing)
    - apps/worker/src/lib/stripe.ts (created in Task 1)
    - apps/worker/src/lib/db.ts (Drizzle client)
    - .planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-RESEARCH.md Pitfall #4 (refetch from Stripe)
    - .planning/STATE.md §"Decisions" — D1-02 ledger pattern (pass balance = SUM grants − SUM debits)
  </read_first>
  <behavior>
    - stripe-event queue handler: loads webhook_events row by externalId; skips if processedAt is non-null; parses payloadRaw; dispatches to reducers[event.type]; wraps reducer + UPDATE processedAt in ONE db.transaction
    - Each reducer: refetches via stripe.X.retrieve(id); inserts/upserts with deterministic IDs + onConflictDoNothing for idempotency
    - checkout-session-completed: upsert stripe_customers; insert payments (id='pay_<piId>'); grant passes (id='pass_<piId>_<liId>') based on line item product (helper passCreditsForProduct returns null for unknown — keeps demo simple, P2 builds products table)
    - invoice-paid: upsert stripe_subscriptions from invoice.subscription; insert payments
    - invoice-payment-failed: upsert stripe_subscriptions.status='past_due'; insert payments status='failed'
    - subscription-updated: upsert stripe_subscriptions from event.data.object
    - subscription-deleted: UPDATE stripe_subscriptions.status='canceled'
    - charge-refunded: SELECT passes WHERE stripe_charge_id = piId; insert NEGATIVE pass_debits (id='pdebit_refund_<chargeId>_<passId>'); UPDATE payments.status='refunded'
    - Tests: checkout-session-completed replay-twice → 1 payments row + 1 passes row; charge-refunded inserts negative pass_debits with deterministic ID
  </behavior>
  <action>
    Concrete steps:

    1. Create `apps/worker/src/domain/stripeReducers/checkout-session-completed.ts`:
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

    2. Create `apps/worker/src/domain/stripeReducers/invoice-paid.ts`:
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

    3. Create `apps/worker/src/domain/stripeReducers/invoice-payment-failed.ts`:
       ```ts
       import type Stripe from "stripe";
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

       // Drizzle re-import for the eq used above
       import { eq } from "drizzle-orm";
       ```
       (Note: the `import { eq }` should be at the top — move it up when writing the actual file.)

    4. Create `apps/worker/src/domain/stripeReducers/subscription-updated.ts`:
       ```ts
       import type Stripe from "stripe";
       import { schema } from "../../lib/db.js";

       export async function subscriptionUpdated(
         event: Stripe.Event,
         tx: any,
         stripe: Stripe,
       ): Promise<void> {
         const sub = event.data.object as Stripe.Subscription;
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

    5. Create `apps/worker/src/domain/stripeReducers/subscription-deleted.ts`:
       ```ts
       import type Stripe from "stripe";
       import { eq } from "drizzle-orm";
       import { schema } from "../../lib/db.js";

       export async function subscriptionDeleted(
         event: Stripe.Event,
         tx: any,
         stripe: Stripe,
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

    6. Create `apps/worker/src/domain/stripeReducers/charge-refunded.ts`:
       ```ts
       import type Stripe from "stripe";
       import { eq, sql } from "drizzle-orm";
       import { schema } from "../../lib/db.js";

       /**
        * STR-06: charge.refunded.
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
         const piId = typeof charge.payment_intent === "string"
           ? charge.payment_intent
           : charge.payment_intent?.id;
         if (!piId) return;

         // guard:allow-unscoped — Stripe webhook processor; no per-user scoping
         const passes = await tx
           .select()
           .from(schema.passes)
           .where(eq(schema.passes.stripeChargeId, piId));

         for (const pass of passes) {
           const debitId = `pdebit_refund_${charge.id}_${pass.id}`;
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

    7. Create `apps/worker/src/domain/stripeReducers/index.ts`:
       ```ts
       import { checkoutSessionCompleted } from "./checkout-session-completed.js";
       import { invoicePaid } from "./invoice-paid.js";
       import { invoicePaymentFailed } from "./invoice-payment-failed.js";
       import { subscriptionUpdated } from "./subscription-updated.js";
       import { subscriptionDeleted } from "./subscription-deleted.js";
       import { chargeRefunded } from "./charge-refunded.js";

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

    8. Create `apps/worker/src/queues/stripe-event.ts`:
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
             const reducer = reducers[event.type as keyof typeof reducers];

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

    9. Update `apps/worker/src/index.ts` to register the stripe-event worker:
       ```ts
       import { registerStripeEventWorker } from "./queues/stripe-event.js";
       // ...inside main(), after registerOutboundWhatsAppWorker:
       await registerStripeEventWorker(boss);
       log.info("[worker] stripe-event queue registered");
       ```

    10. Create `apps/worker/src/domain/stripeReducers/checkout-session-completed.test.ts`:
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
            const event = {
              data: { object: { id: "cs_test_abc" } },
            } as any;
            await checkoutSessionCompleted(event, mockTx as any, mockStripe);
            expect(stripeRetrieve).toHaveBeenCalledWith("cs_test_abc", expect.objectContaining({ expand: expect.any(Array) }));
          });

          it("upserts stripe_customers + payments with onConflictDoNothing (idempotent)", async () => {
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

          it("grants pass with deterministic ID for 10-pack line item", async () => {
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
            // The execute call should include INSERT INTO passes with pass_pi_pack_li_1
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
            // No INSERT INTO passes call
            const passesCall = executeMock.mock.calls.find((c) => JSON.stringify(c[0]).includes("passes"));
            expect(passesCall).toBeUndefined();
          });
        });
        ```

    11. Create `apps/worker/src/domain/stripeReducers/charge-refunded.test.ts`:
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
          });

          it("inserts negative pass_debits entry for each pass granted by payment_intent", async () => {
            const event = {
              data: {
                object: {
                  id: "ch_refund_1",
                  payment_intent: "pi_abc",
                },
              },
            } as any;
            await chargeRefunded(event, mockTx as any, {} as any);
            const sqlStr = JSON.stringify(executeMock.mock.calls[0][0]);
            expect(sqlStr).toContain("pass_debits");
            expect(sqlStr).toContain("pdebit_refund_ch_refund_1_pass_pi_abc_li_1");
            expect(sqlStr).toContain("ON CONFLICT");
            // amount is -10 (the negative of pass.granted=10)
            expect(sqlStr).toContain("-10");
          });

          it("marks payments.status='refunded' for the payment_intent", async () => {
            const event = {
              data: { object: { id: "ch_x", payment_intent: "pi_y" } },
            } as any;
            await chargeRefunded(event, mockTx as any, {} as any);
            const setArgs = updateChain.set.mock.calls[0][0];
            expect(setArgs.status).toBe("refunded");
          });
        });
        ```

    12. Run `pnpm --filter @gymos/worker test` — all tests pass (gates from Plan 06 + reducers from Plan 07).
    13. Run `pnpm --filter @gymos/worker typecheck` — exits 0.
    14. Run `pnpm --filter @gymos/worker build` — emits dist/.
    15. Run `npx prettier --write apps/worker/src/domain/stripeReducers/**/*.ts apps/worker/src/queues/stripe-event.ts apps/worker/src/index.ts`.
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
    - `apps/worker/src/domain/stripeReducers/checkout-session-completed.ts` contains string `onConflictDoNothing`
    - `apps/worker/src/domain/stripeReducers/charge-refunded.ts` contains string `pdebit_refund_${charge.id}_${pass.id}` (deterministic debit ID)
    - `apps/worker/src/domain/stripeReducers/charge-refunded.ts` contains string `${-(pass.granted` (negative amount)
    - `apps/worker/src/domain/stripeReducers/charge-refunded.ts` contains string `status: "refunded"` (payments status update)
    - `apps/worker/src/domain/stripeReducers/index.ts` contains all 6 event types as keys: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`
    - All checkout-session-completed + charge-refunded tests pass (≥4 + ≥2 = ≥6)
    - `pnpm --filter @gymos/worker build` exits 0
  </acceptance_criteria>
  <done>6 Stripe reducers shipped + dispatched from stripe-event queue handler. Single TX guarantees atomicity (WEB-06). Tests verify idempotency at the deterministic-ID level (STR-07).</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/worker test` exits 0 (all reducer + gate + secrets tests pass)
- All 6 reducers exist in stripeReducers/ directory
- Each reducer uses stripe.X.retrieve (refetch — PITFALL #4) — verify by grep
- Each reducer uses deterministic IDs OR onConflictDoNothing/DoUpdate (idempotency — STR-07)
- stripe-event worker wraps reducer + processedAt UPDATE in single db.transaction (WEB-06)
- apiVersion '2026-04-22.dahlia' pinned (PITFALL #3)
- pgcrypto-based secret storage works (Task 1 tests pass)
</verification>

<success_criteria>
1. All 6 reducers ship in P1b (D-22)
2. Single TX wrapping reducer + processedAt UPDATE (WEB-06)
3. Refetch via stripe.X.retrieve in every reducer (PITFALL #4)
4. Deterministic IDs (`pay_<piId>`, `pass_<piId>_<liId>`, `pdebit_refund_<chargeId>_<passId>`) + onConflictDoNothing make replay safe (STR-07)
5. apiVersion '2026-04-22.dahlia' pinned (PITFALL #3)
6. pgcrypto + rotation-aware getStripeSecretKey (STR-01 storage)
</success_criteria>

<output>
After completion, create `.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-07-SUMMARY.md` recording:
- Final test count for worker (gates + sendMessage + secrets + reducers)
- All 6 event types confirmed handled
- Deterministic ID schemes documented (for future debugging)
- Notes for Plan 08 (staff-web Stripe rotation UI) about writeSecret('stripe_restricted_key', plaintext, db) usage
- Notes for Plan 09 (validation) about which fixtures to use for `stripe trigger` replay tests
</output>
