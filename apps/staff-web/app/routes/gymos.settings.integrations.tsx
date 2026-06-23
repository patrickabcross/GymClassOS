// RunStudio Settings — Stripe Connect integration + Meta Conversion Tracking.
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
//
// MC1-05 (2026-06-23):
//   Added "Meta Conversion Tracking" card (CAPI-06):
//   - Pixel ID + Test Event Code → studio_owner_config
//   - Conversions API token → app_secrets (writeAppSecret, single stable row)
//   - Status badge: config completeness + last-send health (D-09)
//   - Send test event → enqueues synthetic Lead via worker (D-01)

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
  IconAd2,
} from "@tabler/icons-react";
import { useState } from "react";
import { getDb } from "../../server/db";
import { readConnectedAccount } from "../../server/lib/connected-account.js";
import {
  writeAppSecret,
  appSecretExistsByKey,
} from "@agent-native/core/secrets";

export function meta() {
  return [{ title: "RunStudio — Integrations" }];
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
      const { getPlatformStripe } = await import("../../server/lib/stripe.js");
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
        meta: {
          pixelId: "",
          testEventCode: "",
          tokenConfigured: false,
          configured: false,
          lastSendStatus: "never" as "sent" | "failed" | "never",
          lastSendAt: null as string | null,
        },
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
      const { upsertConnectedAccountReadiness } =
        await import("../../server/lib/connected-account.js");
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

  // ── MC1-05: Meta Conversion Tracking status ───────────────────────────────
  // guard:allow-unscoped — studio-global config
  const cfgRows = await (getDb() as any).execute(sql`
    SELECT meta_pixel_id, meta_test_event_code FROM studio_owner_config LIMIT 1
  `);
  const cfg = ((cfgRows as any)?.rows ?? (cfgRows as any))?.[0] ?? {};

  // Token presence by KEY — bypasses the scoping quirk (D-11). Any operator
  // login sees the correct "configured" state.
  const metaTokenConfigured = await appSecretExistsByKey("META_CAPI_TOKEN");

  // Last-send health from attribution (most recent row with a status).
  // guard:allow-unscoped — single-tenant meta attribution
  const lastRows = await (getDb() as any).execute(sql`
    SELECT lead_status, lead_sent_at FROM meta_lead_attribution
    WHERE lead_status IS NOT NULL
    ORDER BY lead_sent_at DESC NULLS LAST LIMIT 1
  `);
  const last = ((lastRows as any)?.rows ?? (lastRows as any))?.[0] ?? null;

  const meta = {
    pixelId: (cfg.meta_pixel_id ?? "") as string,
    testEventCode: (cfg.meta_test_event_code ?? "") as string,
    tokenConfigured: metaTokenConfigured,
    configured: !!(
      cfg.meta_pixel_id &&
      metaTokenConfigured &&
      cfg.meta_test_event_code
    ),
    lastSendStatus: (last?.lead_status ?? "never") as
      | "sent"
      | "failed"
      | "never",
    lastSendAt: (last?.lead_sent_at ?? null) as string | null,
  };

  return {
    connectedAccount,
    refreshError: null as string | null,
    keyPresent: Boolean(current),
    updatedAt: current?.updated_at ?? null,
    lastUsedAt: current?.last_used_at ?? null,
    meta,
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
      const { readConnectedAccount: readAcct } =
        await import("../../server/lib/connected-account.js");
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

  // ── MC1-05: Save Meta config (Pixel ID + Test Event Code + optional token) ─
  if (intent === "save-meta-config") {
    const pixelId = String(fd.get("pixelId") ?? "")
      .trim()
      .replace(/[^0-9]/g, "");
    const testEventCode = String(fd.get("testEventCode") ?? "").trim();
    const token = String(fd.get("token") ?? "").trim();

    // guard:allow-unscoped — studio-global config (singleton row)
    await (getDb() as any).execute(sql`
      INSERT INTO studio_owner_config (id, meta_pixel_id, meta_test_event_code, updated_at)
      VALUES ('singleton', ${pixelId || null}, ${testEventCode || null}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        meta_pixel_id = ${pixelId || null},
        meta_test_event_code = ${testEventCode || null},
        updated_at = NOW()
    `);

    // Token only written if a non-empty value was provided (masked field —
    // empty means "keep existing"). Uses the fixed scope/scopeId so re-saves
    // UPSERT one stable row — no competing duplicates (D-11 / D-02).
    if (token) {
      await writeAppSecret({
        key: "META_CAPI_TOKEN",
        value: token,
        scope: "workspace",
        scopeId: "global",
        description: "Meta Conversions API access token",
      });
    }

    return { ok: true, intent };
  }

  // ── MC1-05: Rotate Meta token only ────────────────────────────────────────
  if (intent === "rotate-meta-token") {
    const token = String(fd.get("token") ?? "").trim();
    if (!token) return { ok: false, error: "Paste a token first.", intent };

    // Same fixed scope/scopeId as save-meta-config → UPSERT hits the same row (D-11).
    await writeAppSecret({
      key: "META_CAPI_TOKEN",
      value: token,
      scope: "workspace",
      scopeId: "global",
      description: "Meta Conversions API access token",
    });

    return { ok: true, intent };
  }

  // ── MC1-05: Send test event (ENQUEUE — D-01: no direct Meta API call) ─────
  if (intent === "send-meta-test-event") {
    // guard:allow-unscoped — studio-global config
    const rows = await (getDb() as any).execute(sql`
      SELECT meta_pixel_id FROM studio_owner_config LIMIT 1
    `);
    const c = ((rows as any)?.rows ?? (rows as any))?.[0] ?? {};

    // Resolve a real member id for the worker's attribution write-back.
    // guard:allow-unscoped — single-tenant; resolve most-recent gym member
    const mRows = await (getDb() as any).execute(sql`
      SELECT id FROM gym_members ORDER BY created_at DESC LIMIT 1
    `);
    const memberId = ((mRows as any)?.rows ?? (mRows as any))?.[0]?.id ?? "";

    const { enqueueMetaTestLead } =
      await import("../../server/lib/meta-capi-test-send.js");
    const result = await enqueueMetaTestLead({
      pixelId: c.meta_pixel_id ?? "",
      memberId,
    });

    return {
      ok: result.ok,
      intent,
      eventId: result.eventId,
      error: result.error,
    };
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
  const keyFetcher = useFetcher<{
    ok: boolean;
    message?: string;
    error?: string;
    intent?: string;
  }>();
  const connectFetcher = useFetcher<{
    ok: boolean;
    error?: string;
    intent?: string;
  }>();
  const metaConfigFetcher = useFetcher<{
    ok: boolean;
    error?: string;
    intent?: string;
  }>();
  const metaTestFetcher = useFetcher<{
    ok: boolean;
    eventId?: string;
    error?: string;
    intent?: string;
  }>();

  // Masked token reveal state (mirrors rotate-key UX for Meta token)
  const [showTokenField, setShowTokenField] = useState(false);

  const submitting = nav.state === "submitting" || nav.state === "loading";
  const connectSubmitting = connectFetcher.state !== "idle";
  const keySubmitting = keyFetcher.state !== "idle";
  const metaConfigSubmitting = metaConfigFetcher.state !== "idle";
  const metaTestSubmitting = metaTestFetcher.state !== "idle";

  const connectedAccount = data.connectedAccount;
  const isConnected = Boolean(connectedAccount);
  const isReady =
    isConnected &&
    connectedAccount!.chargesEnabled &&
    connectedAccount!.payoutsEnabled;
  const isPending =
    isConnected &&
    (!connectedAccount!.chargesEnabled ||
      connectedAccount!.payoutsEnabled === false);

  const meta = data.meta;

  // Status badge config for Meta card
  const metaBadge = (() => {
    if (meta.configured) {
      if (meta.lastSendStatus === "sent")
        return { label: "Active", variant: "success" as const };
      if (meta.lastSendStatus === "failed")
        return { label: "Last send failed", variant: "error" as const };
      return {
        label: "Configured — no sends yet",
        variant: "neutral" as const,
      };
    }
    return { label: "Not configured", variant: "outline" as const };
  })();

  const badgeClasses = {
    success:
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
    error:
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20",
    neutral:
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border/50",
    outline:
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-transparent text-muted-foreground border border-border/60",
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-sm font-semibold mb-1">Integrations</h1>
          <p className="text-[12px] text-muted-foreground">
            Connect your studio&apos;s Stripe account and Meta Pixel to process
            payments and track conversions.
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

        {/* ── Stripe Connect card ─────────────────────────────────────────── */}
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
                Account id:{" "}
                <code className="text-[10px]">{connectedAccount!.id}</code>
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

        {/* ── Meta Conversion Tracking card (MC1-05) ──────────────────────── */}
        <div className="rounded-lg border border-border/50 p-4 bg-card/30 space-y-4">
          {/* Header: icon + title + status badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <IconAd2 size={16} className="text-[#1877F2]" />
            <span className="text-sm font-semibold">
              Meta Conversion Tracking
            </span>
            <span className={badgeClasses[metaBadge.variant]}>
              {metaBadge.label}
            </span>
            {meta.lastSendAt && (
              <span className="text-[11px] text-muted-foreground ml-auto">
                Last send:{" "}
                {new Date(meta.lastSendAt).toLocaleString("en-GB", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            )}
          </div>

          <p className="text-[12px] text-muted-foreground">
            Send conversion events to Meta via the Conversions API (CAPI). The
            Fly worker sends all events — staff-web never calls Meta directly.
          </p>

          {/* Config form: Pixel ID + Test Event Code + masked token */}
          <metaConfigFetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="_intent" value="save-meta-config" />

            <div className="space-y-1">
              <label
                className="block text-[12px] font-medium"
                htmlFor="pixelId"
              >
                Pixel ID
              </label>
              <input
                id="pixelId"
                name="pixelId"
                type="text"
                inputMode="numeric"
                defaultValue={meta.pixelId}
                placeholder="e.g. 1234567890"
                autoComplete="off"
                className="w-full border border-border/50 rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label
                className="block text-[12px] font-medium"
                htmlFor="testEventCode"
              >
                Test Event Code
              </label>
              <input
                id="testEventCode"
                name="testEventCode"
                type="text"
                defaultValue={meta.testEventCode}
                placeholder="TEST12345"
                autoComplete="off"
                className="w-full border border-border/50 rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-[11px] text-muted-foreground">
                From Meta Events Manager → Test Events tab.
              </p>
            </div>

            {/* Masked token field (D-11: never pre-filled) */}
            <div className="space-y-1">
              <label className="block text-[12px] font-medium">
                Conversions API token
              </label>
              {meta.tokenConfigured && !showTokenField ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-[12px]">
                    <IconPointFilled
                      size={10}
                      className="text-emerald-500"
                      aria-hidden
                    />
                    <span className="font-medium">Configured</span>
                    <span className="text-muted-foreground">
                      — token is stored and encrypted
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTokenField(true)}
                    className="text-[11px] text-primary underline underline-offset-2"
                  >
                    Replace token
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <input
                    name="token"
                    type="password"
                    placeholder="EAAxxxxxxx…"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full border border-border/50 rounded-md px-3 py-2 text-sm bg-background font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  {meta.tokenConfigured && (
                    <button
                      type="button"
                      onClick={() => setShowTokenField(false)}
                      className="text-[11px] text-muted-foreground underline underline-offset-2"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={metaConfigSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm font-semibold disabled:opacity-50"
            >
              {metaConfigSubmitting ? (
                <>
                  <IconLoader2 size={14} className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </button>

            {metaConfigFetcher.data?.ok === true &&
              metaConfigFetcher.data.intent === "save-meta-config" && (
                <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
                  Configuration saved.
                </div>
              )}
            {metaConfigFetcher.data?.ok === false &&
              metaConfigFetcher.data.intent === "save-meta-config" && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-[12px] text-destructive">
                  {metaConfigFetcher.data.error}
                </div>
              )}
          </metaConfigFetcher.Form>

          {/* Send test event (D-01: ENQUEUES — worker is sole CAPI sender) */}
          <div className="border-t border-border/30 pt-4 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <metaTestFetcher.Form method="post">
                <input
                  type="hidden"
                  name="_intent"
                  value="send-meta-test-event"
                />
                <button
                  type="submit"
                  disabled={metaTestSubmitting || !meta.configured}
                  title={
                    !meta.configured
                      ? "Enter Pixel ID, token, and Test Event Code first"
                      : undefined
                  }
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/60 text-[12px] font-medium text-foreground bg-background hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {metaTestSubmitting ? (
                    <>
                      <IconLoader2 size={12} className="animate-spin" />
                      Queuing…
                    </>
                  ) : (
                    <>
                      <IconAd2 size={12} />
                      Send test event
                    </>
                  )}
                </button>
              </metaTestFetcher.Form>

              {!meta.configured && (
                <span className="text-[11px] text-muted-foreground">
                  Enter Pixel ID, token, and Test Event Code first
                </span>
              )}
            </div>

            {/* Optimistic confirmation — shown after the fetch settles */}
            {metaTestFetcher.data?.ok === true && (
              <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
                Test event queued — check Meta Events Manager → Test Events in
                ~30s.
                {metaTestFetcher.data.eventId && (
                  <span className="block text-[11px] text-emerald-600/80 dark:text-emerald-400/70 mt-0.5 font-mono">
                    event_id: {metaTestFetcher.data.eventId}
                  </span>
                )}
              </div>
            )}
            {metaTestFetcher.data?.ok === false && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-[12px] text-destructive">
                {metaTestFetcher.data.error ?? "Test send failed."}
              </div>
            )}
          </div>
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
            {keyFetcher.data?.ok === false &&
              keyFetcher.data.intent === "rotate-key" && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                  {keyFetcher.data.error}
                </div>
              )}

            <div className="text-[11px] text-muted-foreground">
              Dev fallback only — append <code>?devKeyEntry=1</code> to show
              this section. The restricted-key model is deprecated in favour of
              Stripe Connect (P1c.1). Delete this section post-cutover.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
