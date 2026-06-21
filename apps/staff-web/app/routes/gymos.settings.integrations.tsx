// RunStudio Settings — Stripe Connect integration + restricted-key fallback.
//
// P1c.1 rework (2026-06-12):
//   Primary surface: "Connect Stripe" button → create-connect-account →
//   create-account-link → window.location.href = Stripe-hosted onboarding.
//   Readiness state is read from connected_accounts (written by the Plan 03
//   account.updated reducer — NOT inferred from the return URL).
//
//   ?stripe=refresh → link expired/abandoned; auto-regenerate and redirect.
//   ?stripe=return  → user came back from onboarding; reload the loader.
//
//   Restricted-key UI (P1b-08) preserved behind ?devKeyEntry=1
//   (rollback insurance — do NOT delete until Connect is confirmed live).

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  redirect,
  useFetcher,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import {
  IconPointFilled,
  IconBrandStripe,
  IconCircleCheck,
  IconCircleX,
  IconAlertTriangle,
  IconLoader2,
} from "@tabler/icons-react";
import { getDb } from "../../server/db";
import { readConnectedAccount } from "../../server/lib/connected-account.js";

export function meta() {
  return [{ title: "RunStudio — Stripe Integration" }];
}

// Stripe API version pin — matches stripe.ts + worker.
const STRIPE_API_VERSION = "2026-04-22.dahlia" as Stripe.LatestApiVersion;

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const stripeParam = url.searchParams.get("stripe");

  // Connected account state (from connected_accounts table)
  let connectedAccount = await readConnectedAccount();

  // ?stripe=refresh → Stripe's onboarding link expired or was abandoned.
  // Auto-generate a fresh Account Link and redirect immediately.
  // Only redirect if we have an account to link (idempotency guard).
  if (stripeParam === "refresh" && connectedAccount) {
    try {
      // Inline the link creation here to avoid a round-trip through the action.
      // This keeps the UX instant (loader handles the redirect without a JS fetch).
      const { getPlatformStripe } = await import(
        "../../server/lib/stripe.js"
      );
      const BASE =
        process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";
      const platform = await getPlatformStripe();
      const link = await platform.accountLinks.create({
        account: connectedAccount.id,
        type: "account_onboarding",
        refresh_url: `${BASE}/gymos/settings/integrations?stripe=refresh`,
        return_url: `${BASE}/gymos/settings/integrations?stripe=return`,
      });
      return redirect(link.url);
    } catch (err) {
      // Fall through to render page with an error note if link generation fails.
      return {
        connectedAccount,
        refreshError: `Could not regenerate onboarding link: ${err instanceof Error ? err.message : String(err)}`,
        // restricted-key state (below)
        keyPresent: false,
        updatedAt: null,
        lastUsedAt: null,
      };
    }
  }

  // ?stripe=return → user came back from hosted onboarding. The account.updated
  // webhook normally fills readiness, but it can lag or fail to deliver (e.g.
  // misregistered endpoint / signing-secret mismatch), leaving the UI stuck on
  // "pending" forever. Refetch the authoritative account from Stripe and upsert
  // so readiness reflects truth immediately, independent of webhook delivery.
  if (stripeParam === "return" && connectedAccount) {
    try {
      const { getPlatformStripe } = await import("../../server/lib/stripe.js");
      const { upsertConnectedAccountReadiness } = await import(
        "../../server/lib/connected-account.js"
      );
      const platform = await getPlatformStripe();
      const acct = await platform.accounts.retrieve(connectedAccount.id);
      await upsertConnectedAccountReadiness(acct);
      connectedAccount = await readConnectedAccount();
    } catch {
      // Non-fatal — fall back to whatever the webhook has written so far.
    }
  }

  // Load restricted-key status for the dev fallback section.
  const db = getDb();
  // guard:allow-unscoped — secrets table is studio-global config
  const keyResult = await (db as any).execute(sql`
    SELECT name, updated_at, last_used_at
    FROM secrets
    WHERE name = 'stripe_restricted_key'
    LIMIT 1
  `);
  const keyRows = (keyResult as any)?.rows ?? (keyResult as any) ?? [];
  const current = keyRows?.[0] ?? null;

  return {
    connectedAccount,
    refreshError: null as string | null,
    keyPresent: Boolean(current),
    updatedAt: current?.updated_at ?? null,
    lastUsedAt: current?.last_used_at ?? null,
  };
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "").trim();

  // ── Connect: create account + generate first onboarding link ─────────────
  if (intent === "connect-stripe") {
    try {
      const { readConnectedAccount: readAcct, upsertConnectedAccountId } =
        await import("../../server/lib/connected-account.js");
      const { getPlatformStripe } = await import("../../server/lib/stripe.js");

      // Idempotent: use existing account if already created.
      let accountId: string;
      const existing = await readAcct();
      if (existing) {
        accountId = existing.id;
      } else {
        const platform = await getPlatformStripe();
        const account = await platform.accounts.create({
          controller: {
            stripe_dashboard: { type: "none" },
            fees: { payer: "application" },
            losses: { payments: "application" },
            requirement_collection: "application",
          },
          country: "GB",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        accountId = account.id;
        await upsertConnectedAccountId(accountId, "hustle");
      }

      // Generate the hosted onboarding link.
      const BASE =
        process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";
      const platform = await getPlatformStripe();
      const link = await platform.accountLinks.create({
        account: accountId,
        type: "account_onboarding",
        refresh_url: `${BASE}/gymos/settings/integrations?stripe=refresh`,
        return_url: `${BASE}/gymos/settings/integrations?stripe=return`,
      });

      // Redirect to Stripe-hosted onboarding (full page navigation).
      return redirect(link.url);
    } catch (err) {
      return {
        ok: false,
        error: `Could not start Stripe onboarding: ${err instanceof Error ? err.message : String(err)}`,
        intent,
      };
    }
  }

  // ── Connect: re-generate onboarding link for existing account ────────────
  if (intent === "continue-onboarding") {
    try {
      const { readConnectedAccount: readAcct } = await import(
        "../../server/lib/connected-account.js"
      );
      const { getPlatformStripe } = await import("../../server/lib/stripe.js");

      const acct = await readAcct();
      if (!acct) {
        return {
          ok: false,
          error: "No connected account found — please start onboarding first.",
          intent,
        };
      }

      const BASE =
        process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";
      const platform = await getPlatformStripe();
      const link = await platform.accountLinks.create({
        account: acct.id,
        type: "account_onboarding",
        refresh_url: `${BASE}/gymos/settings/integrations?stripe=refresh`,
        return_url: `${BASE}/gymos/settings/integrations?stripe=return`,
      });

      return redirect(link.url);
    } catch (err) {
      return {
        ok: false,
        error: `Could not generate onboarding link: ${err instanceof Error ? err.message : String(err)}`,
        intent,
      };
    }
  }

  // ── Dev fallback: rotate restricted key (P1b-08) ─────────────────────────
  if (intent === "rotate-key") {
    const newKey = String(fd.get("key") ?? "").trim();

    if (!newKey) {
      return { ok: false, error: "Paste a key first.", intent };
    }
    if (!newKey.startsWith("rk_") && !newKey.startsWith("sk_")) {
      return {
        ok: false,
        error:
          "Must be a Stripe key (starts with rk_test_, rk_live_, sk_test_, or sk_live_).",
        intent,
      };
    }

    const probe = new Stripe(newKey, { apiVersion: STRIPE_API_VERSION });
    try {
      const account = await probe.accounts.retrieve();
      if (!account?.id) {
        return {
          ok: false,
          error: "Stripe accepted the key but returned no account id.",
          intent,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Stripe rejected the key — ${msg.slice(0, 200)}`,
        intent,
      };
    }

    const masterKey = process.env.PGCRYPTO_MASTER_KEY;
    if (!masterKey) {
      return {
        ok: false,
        error: "Server misconfigured: PGCRYPTO_MASTER_KEY not set.",
        intent,
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

    console.log(
      `[secrets] rotated stripe_restricted_key at ${new Date().toISOString()}`,
    );

    return { ok: true, message: "Key rotated successfully.", intent };
  }

  return { ok: false, error: "Unknown intent.", intent };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function StripeIntegrations() {
  const data = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const [searchParams] = useSearchParams();
  const devKeyEntry = searchParams.get("devKeyEntry") === "1";

  // Separate fetcher for the key rotation form (dev fallback)
  const keyFetcher = useFetcher<{ ok: boolean; message?: string; error?: string; intent?: string }>();
  const connectFetcher = useFetcher<{ ok: boolean; error?: string; intent?: string }>();

  const submitting = nav.state === "submitting" || nav.state === "loading";
  const connectSubmitting = connectFetcher.state !== "idle";
  const keySubmitting = keyFetcher.state !== "idle";

  const connectedAccount = data.connectedAccount;
  const isConnected = Boolean(connectedAccount);
  const isReady =
    isConnected &&
    connectedAccount!.chargesEnabled &&
    connectedAccount!.payoutsEnabled;
  const isPending =
    isConnected &&
    (!connectedAccount!.chargesEnabled || connectedAccount!.payoutsEnabled === false);

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-sm font-semibold mb-1">Stripe Integration</h1>
          <p className="text-[12px] text-muted-foreground">
            Connect your studio&apos;s Stripe account so RunStudio can process
            class pass purchases and memberships on your behalf.
          </p>
        </div>

        {/* Cost note (Pitfall 7 — fees.payer: "application") */}
        <div className="rounded-md bg-muted/40 border border-border/40 px-4 py-3 text-[12px] text-muted-foreground">
          RunStudio covers Stripe processing fees during the pilot (no platform
          fee charged to the studio).
        </div>

        {/* Refresh error banner */}
        {data.refreshError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {data.refreshError}
          </div>
        )}

        {/* Connect section */}
        <div className="rounded-lg border border-border/50 p-4 bg-card/30 space-y-4">
          <div className="flex items-center gap-2">
            <IconBrandStripe size={16} className="text-[#635BFF]" />
            <span className="text-sm font-semibold">Stripe Connect</span>
          </div>

          {/* State: not connected */}
          {!isConnected && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Click below to create your studio&apos;s Stripe account and
                complete the required identity verification. You&apos;ll be
                redirected to Stripe&apos;s secure onboarding flow.
              </p>
              <connectFetcher.Form method="post">
                <input type="hidden" name="_intent" value="connect-stripe" />
                <button
                  type="submit"
                  disabled={connectSubmitting || submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm font-semibold disabled:opacity-50"
                >
                  {connectSubmitting ? (
                    <>
                      <IconLoader2 size={14} className="animate-spin" />
                      Starting onboarding…
                    </>
                  ) : (
                    <>
                      <IconBrandStripe size={14} />
                      Connect Stripe
                    </>
                  )}
                </button>
              </connectFetcher.Form>
              {connectFetcher.data?.ok === false && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-[12px] text-destructive">
                  {connectFetcher.data.error}
                </div>
              )}
            </div>
          )}

          {/* State: connected but not ready (pending KYC / review) */}
          {isConnected && !isReady && (
            <div className="space-y-3">
              <div className="text-[12px] space-y-1">
                <div className="flex items-center gap-2">
                  {connectedAccount!.chargesEnabled ? (
                    <IconCircleCheck size={14} className="text-emerald-500" />
                  ) : (
                    <IconCircleX size={14} className="text-zinc-400" />
                  )}
                  <span>Charges enabled</span>
                </div>
                <div className="flex items-center gap-2">
                  {connectedAccount!.payoutsEnabled ? (
                    <IconCircleCheck size={14} className="text-emerald-500" />
                  ) : (
                    <IconCircleX size={14} className="text-zinc-400" />
                  )}
                  <span>Payouts enabled</span>
                </div>
              </div>

              {connectedAccount!.requirementsDue.length > 0 && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[12px]">
                  <div className="flex items-center gap-1 text-amber-700 dark:text-amber-300 font-medium mb-1">
                    <IconAlertTriangle size={12} />
                    Outstanding requirements
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {connectedAccount!.requirementsDue.map((req) => (
                      <li key={req}>{req}</li>
                    ))}
                  </ul>
                </div>
              )}

              {connectedAccount!.disabledReason && (
                <p className="text-[12px] text-destructive">
                  Disabled: {connectedAccount!.disabledReason}
                </p>
              )}

              <connectFetcher.Form method="post">
                <input
                  type="hidden"
                  name="_intent"
                  value="continue-onboarding"
                />
                <button
                  type="submit"
                  disabled={connectSubmitting || submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm font-semibold disabled:opacity-50"
                >
                  {connectSubmitting ? (
                    <>
                      <IconLoader2 size={14} className="animate-spin" />
                      Opening onboarding…
                    </>
                  ) : (
                    "Continue onboarding"
                  )}
                </button>
              </connectFetcher.Form>

              {connectFetcher.data?.ok === false && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-[12px] text-destructive">
                  {connectFetcher.data.error}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Account id: <code className="text-[10px]">{connectedAccount!.id}</code>
              </p>
            </div>
          )}

          {/* State: fully connected and ready */}
          {isReady && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                <IconCircleCheck size={16} />
                Stripe connected — accepting payments
              </div>
              <p className="text-[12px] text-muted-foreground">
                Account id:{" "}
                <code className="text-[10px]">{connectedAccount!.id}</code>
              </p>
            </div>
          )}
        </div>

        {/* Dev fallback: restricted-key rotation (P1b-08) — hidden behind ?devKeyEntry=1 */}
        {devKeyEntry && (
          <div className="rounded-lg border border-dashed border-border/50 p-4 bg-card/20 space-y-4">
            <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
              Dev / Rollback — Restricted Key (P1b-08)
            </div>

            <div className="rounded-lg border border-border/50 p-3 bg-background/50">
              <div className="text-[12px] text-muted-foreground mb-1">
                Current key
              </div>
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

            <keyFetcher.Form method="post" className="space-y-3">
              <input type="hidden" name="_intent" value="rotate-key" />
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
                disabled={keySubmitting}
                className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-semibold disabled:opacity-50"
              >
                {keySubmitting ? "Validating + rotating…" : "Validate & rotate"}
              </button>
            </keyFetcher.Form>

            {keyFetcher.data?.ok === true && (
              <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                {keyFetcher.data.message}
              </div>
            )}
            {keyFetcher.data?.ok === false && keyFetcher.data.intent === "rotate-key" && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {keyFetcher.data.error}
              </div>
            )}

            <div className="text-[11px] text-muted-foreground">
              Dev fallback only — append <code>?devKeyEntry=1</code> to show this
              section. The restricted-key model is deprecated in favour of
              Stripe Connect (P1c.1). Delete this section post-cutover.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
