// GET /api/m/purchase  — list purchasable products for this studio
// POST /api/m/purchase — create a member-scoped Connect Checkout session
//
// Member gate: requireDemoMember (D-07 DEMO_MODE + X-Demo-Member-Id header).
// The POST embeds metadata.memberId so the P1b-07 checkout.session.completed
// reducer binds the granted pass to this member on payment completion.
//
// The connected account is read from connected_accounts (P1c.1-01/04).
// If no connected account is configured the endpoint returns 503.
//
// Pitfall 6 (RESEARCH): success_url / cancel_url must be absolute public URLs —
// not deep links. Use STAFF_WEB_URL env with a mobile-friendly return page.
//
// guard:allow-unscoped — single-tenant gym tables
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import Stripe from "stripe";
import { requireDemoMember } from "../../server/lib/demo-member";
import { getPlatformStripe } from "../../server/lib/stripe";
import { readConnectedAccount } from "../../server/lib/connected-account";

// ---------------------------------------------------------------------------
// Curated product catalogue (v1 pilot)
//
// P2 will replace this constant with a live stripe.prices.list() call on the
// connected account so the studio can manage products from their Stripe
// dashboard without touching code.
//
// Each entry maps to the P1b-07 reducer's passCreditsForLineItem() keywords.
// The product DESCRIPTION on Stripe must contain the same keyword for credits
// to be granted on checkout.session.completed (see apps/staff-web/AGENTS.md).
// ---------------------------------------------------------------------------
export const PILOT_PRODUCTS = [
  {
    priceId: process.env.STRIPE_PRICE_DROP_IN ?? "",
    label: "Drop-in class",
    description: "Single class pass — 1 credit",
    mode: "payment" as const,
    keyword: "drop-in",
  },
  {
    priceId: process.env.STRIPE_PRICE_5_PACK ?? "",
    label: "5-class pack",
    description: "Five class credits, never expire",
    mode: "payment" as const,
    keyword: "5-pack",
  },
  {
    priceId: process.env.STRIPE_PRICE_10_PACK ?? "",
    label: "10-class pack",
    description: "Ten class credits, never expire",
    mode: "payment" as const,
    keyword: "10-pack",
  },
  {
    priceId: process.env.STRIPE_PRICE_MEMBERSHIP ?? "",
    label: "Unlimited membership",
    description: "Monthly unlimited classes",
    mode: "subscription" as const,
    keyword: "unlimited",
  },
];

// ---------------------------------------------------------------------------
// GET /api/m/purchase
// Returns the list of purchasable products.
// Filters out entries with no priceId configured (env var not set).
// ---------------------------------------------------------------------------
export async function loader({ request }: LoaderFunctionArgs) {
  await requireDemoMember(request);

  // Filter out unconfigured products (empty priceId = env var not set).
  // On a fully configured studio deploy all four will be present.
  const products = PILOT_PRODUCTS.filter((p) => p.priceId.length > 0).map(
    ({ priceId, label, description, mode }) => ({
      priceId,
      label,
      description,
      mode,
    }),
  );

  return { products };
}

// ---------------------------------------------------------------------------
// POST /api/m/purchase
// Body: { priceId: string, mode?: "payment" | "subscription" }
// Returns: { url: string } — the Stripe hosted Checkout URL
// ---------------------------------------------------------------------------
export async function action({ request }: ActionFunctionArgs) {
  const member = await requireDemoMember(request);

  let body: { priceId?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { priceId, mode = "payment" } = body;
  if (!priceId || typeof priceId !== "string") {
    return new Response(JSON.stringify({ error: "priceId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolve the connected account (studio must have completed Stripe onboarding)
  const connectedAccount = await readConnectedAccount();
  if (!connectedAccount) {
    return new Response(
      JSON.stringify({
        error:
          "Stripe not configured — studio has not completed Connect onboarding",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!connectedAccount.chargesEnabled) {
    return new Response(
      JSON.stringify({
        error: "Stripe account not ready — charges not yet enabled",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const stripe = await getPlatformStripe();
  const baseUrl =
    process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";

  // The Stripe SDK uses discriminated union types on checkout.sessions.create
  // based on the `mode` field. We call payment and subscription branches
  // separately to satisfy TypeScript's type narrowing.
  //
  // CRITICAL: metadata.memberId is the contract the P1b-07 reducer relies on
  // to bind the pass to this member. Never remove this field.
  const reqOpts: Stripe.RequestOptions = { stripeAccount: connectedAccount.id };
  const successUrl = `${baseUrl}/m/checkout-return?result=success`;
  const cancelUrl = `${baseUrl}/m/checkout-return?result=cancelled`;

  let checkoutUrl: string | null;

  if (mode === "subscription") {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { memberId: member.id },
        subscription_data: { metadata: { memberId: member.id } },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      reqOpts,
    );
    checkoutUrl = session.url;
  } else {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { memberId: member.id },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      reqOpts,
    );
    checkoutUrl = session.url;
  }

  return { url: checkoutUrl };
}
