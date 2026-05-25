// GymClassOS Settings — Stripe integration (key rotation).
//
// P1b-08 success criterion #6: studio admin can rotate the Stripe restricted
// API key without downtime.
//
// Flow:
//  1. Admin pastes a new key (rk_test_… / rk_live_… / sk_…)
//  2. We validate against Stripe with stripe.accounts.retrieve() — probes
//     scope adequacy + key validity in one call (RESEARCH Open Question #5).
//  3. Atomic UPSERT into the `secrets` table with pgp_sym_encrypt(plaintext,
//     PGCRYPTO_MASTER_KEY). pgcrypto extension is enabled in migration 0001.
//  4. Worker reads via getStripeSecretKey(db) on each Stripe-event job — so
//     the next event after rotation uses the new key. Old key remains active
//     until that next read (typically <1s on a busy worker, longer on idle).
//     No restart required.
//
// LOW #12: the "Current key" status indicator uses Tabler IconPointFilled
// (NOT the U+25CF bullet character), per AGENTS.md "Tabler Icons" rule.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import { IconPointFilled } from "@tabler/icons-react";
import { getDb } from "../../server/db";

export function meta() {
  return [{ title: "GymClassOS — Stripe Integration" }];
}

// Stripe API version pin. PITFALL #3: never let Stripe float the API version.
// Matches apps/worker/src/lib/stripe.ts. The SDK 19.3.1 types LatestApiVersion
// as the older 'clover' literal; the cast keeps the runtime pin intact while
// satisfying TypeScript. Drop the cast when the SDK ships the dahlia literal.
const STRIPE_API_VERSION = "2026-04-22.dahlia" as Stripe.LatestApiVersion;

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader(_: LoaderFunctionArgs) {
  const db = getDb();
  // guard:allow-unscoped — secrets table is studio-global config
  const result = await (db as any).execute(sql`
    SELECT name, updated_at, last_used_at
    FROM secrets
    WHERE name = 'stripe_restricted_key'
    LIMIT 1
  `);
  const rows = (result as any)?.rows ?? (result as any) ?? [];
  const current = rows?.[0] ?? null;
  return {
    keyPresent: Boolean(current),
    updatedAt: current?.updated_at ?? null,
    lastUsedAt: current?.last_used_at ?? null,
  };
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const fd = await request.formData();
  const newKey = String(fd.get("key") ?? "").trim();

  if (!newKey) {
    return { ok: false, error: "Paste a key first." };
  }
  if (!newKey.startsWith("rk_") && !newKey.startsWith("sk_")) {
    return {
      ok: false,
      error:
        "Must be a Stripe key (starts with rk_test_, rk_live_, sk_test_, or sk_live_).",
    };
  }

  // 1. Validate against Stripe — uses the NEW key BEFORE we persist it.
  //    accounts.retrieve() is a known-required call: confirms the key works
  //    and (per Open Question #5) probes that it has at least the minimal
  //    scope set we need. If the key is too narrow, Stripe rejects here and
  //    we never overwrite the old secret.
  const probe = new Stripe(newKey, { apiVersion: STRIPE_API_VERSION });
  try {
    const account = await probe.accounts.retrieve();
    if (!account?.id) {
      return {
        ok: false,
        error: "Stripe accepted the key but returned no account id.",
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Stripe rejected the key — ${msg.slice(0, 200)}`,
    };
  }

  // 2. Atomic UPSERT via pgcrypto.
  //    Old key remains usable until the worker's next getStripeSecretKey()
  //    call (the worker doesn't cache — it reads fresh on every Stripe-event
  //    job). No downtime, no restart.
  const masterKey = process.env.PGCRYPTO_MASTER_KEY;
  if (!masterKey) {
    return {
      ok: false,
      error: "Server misconfigured: PGCRYPTO_MASTER_KEY not set.",
    };
  }

  const db = getDb();
  // guard:allow-unscoped — secrets table is studio-global config
  await (db as any).execute(sql`
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

  // 3. Audit log. Minimal in P1b; the full audit_log table + admin role
  //    gating ship in P1a / P2 (SET-02).
  console.log(
    `[secrets] rotated stripe_restricted_key at ${new Date().toISOString()}`,
  );

  return { ok: true, message: "Key rotated successfully." };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function StripeIntegrations() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-sm font-semibold mb-2">Stripe Integration</h1>
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
          . The key is validated against Stripe and then stored encrypted in the
          database. The old key stays active until the new one succeeds and the
          worker reads it on its next event (no restart needed).
        </p>

        <div className="rounded-lg border border-border/50 p-4 mb-6 bg-card/30">
          <div className="text-[12px] text-muted-foreground mb-1">Current key</div>
          <div className="text-sm inline-flex items-center gap-2">
            {data.keyPresent ? (
              <>
                <IconPointFilled
                  size={10}
                  className="text-emerald-500"
                  aria-hidden
                />
                <span className="font-semibold">set</span>
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
                  not set (worker falls back to env{" "}
                  <code className="text-[11px]">STRIPE_SECRET_KEY</code>)
                </span>
              </>
            )}
          </div>
        </div>

        <Form method="post" className="space-y-3">
          <label className="block text-sm font-semibold">
            New restricted key
          </label>
          <textarea
            name="key"
            placeholder="rk_test_... or rk_live_..."
            className="w-full border border-border/50 rounded-md px-3 py-2 font-mono text-[12px] bg-background"
            rows={3}
            required
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-semibold disabled:opacity-50"
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
          <div className="mt-4 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {result.error}
          </div>
        )}

        <div className="mt-6 text-[11px] text-muted-foreground">
          Note: P1b stores the key encrypted with pgcrypto. Full audit trail +
          admin-role gating ship in P1a / P2 (SET-02).
        </div>
      </div>
    </div>
  );
}
