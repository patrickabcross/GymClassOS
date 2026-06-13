/**
 * Embed Buy handler — shared SSR logic for GET + POST at /embed/buy.
 *
 * GET  → renders the buy form HTML (priceId, productName, mode, accent, radius URL params)
 * POST → upserts gym_member by email/phone (FK-safe re-select), creates Checkout
 *         session on connected account, redirects to session.url.
 *
 * guard:allow-unscoped — gym_members, conversations are studio-global single-tenant.
 * Public anonymous endpoint — no runWithRequestContext.
 */

import {
  getRequestURL,
  readBody,
  sendRedirect,
  setResponseStatus,
  type H3Event,
} from "h3";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../../../server/db/index.js";
import { sanitizeHexColor, sanitizeIntPx } from "./public-form-ssr.js";
import { normalizePhone } from "./normalize-phone.js";
import {
  validateConnectedAccount,
  buildCheckoutParams,
} from "../../../actions/create-checkout-link-helpers.js";
import { getPlatformStripe } from "../../../server/lib/stripe.js";
import { readConnectedAccount } from "../../../server/lib/connected-account.js";

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function esc(value: unknown): string {
  const s =
    typeof value === "string" ? value : value == null ? "" : String(value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// CSS (mirrors schedule-widget-ssr.ts dark theme)
// ---------------------------------------------------------------------------

export function CSS(): string {
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:0 0% 100%;--fg:220 10% 10%;--card:0 0% 98%;--card-fg:220 10% 10%;--muted:220 10% 95%;--muted-fg:220 5% 45%;--border:220 10% 88%;--input:220 10% 90%;--ring:220 10% 40%;--accent-color:var(--gym-accent,#000);--radius:var(--gym-radius,6px)}
.dark{--bg:220 6% 4%;--fg:0 0% 90%;--card:220 5% 7%;--card-fg:0 0% 90%;--muted:220 4% 8%;--muted-fg:220 4% 55%;--border:220 4% 13%;--input:220 4% 13%;--ring:0 0% 60%}
html{font-family:"Inter",system-ui,-apple-system,sans-serif;font-feature-settings:"cv02","cv03","cv04","cv11"}
body{background:hsl(var(--bg));color:hsl(var(--fg));-webkit-font-smoothing:antialiased}
.page{padding:40px 16px 64px;min-height:100vh}.container{max-width:480px;margin:0 auto}
.header{margin-bottom:28px}.header h1{font-size:1.375rem;font-weight:600;letter-spacing:-0.01em}
.desc{margin-top:6px;font-size:0.875rem;color:hsl(var(--muted-fg));line-height:1.5}
.buy-form{display:flex;flex-direction:column;gap:16px}
.field{display:flex;flex-direction:column;gap:6px}
.field-label{font-size:0.875rem;font-weight:500;color:hsl(var(--card-fg))}.req{color:#ef4444;margin-left:2px}
.fi{width:100%;padding:8px 12px;font-size:0.875rem;font-family:inherit;background:hsl(var(--bg));border:1px solid hsl(var(--input));border-radius:var(--radius);color:hsl(var(--fg));outline:none}
.fi:focus{border-color:var(--accent-color);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-color) 20%,transparent)}
.submit-btn{margin-top:8px;padding:10px 24px;font-size:0.9375rem;font-weight:500;font-family:inherit;background:var(--accent-color);color:#fff;border:none;border-radius:var(--radius);cursor:pointer;transition:opacity 0.15s}
.submit-btn:hover{opacity:0.85}.submit-btn:disabled{opacity:0.6;cursor:not-allowed}
.error-banner{margin-bottom:16px;padding:10px 16px;background:#7f1d1d;color:#fca5a5;border-radius:var(--radius);font-size:0.875rem;border:1px solid #991b1b}
@media(max-width:480px){.page{padding:24px 12px 48px}}
`;
}

// ---------------------------------------------------------------------------
// GET: Render the buy form HTML
// ---------------------------------------------------------------------------

function renderBuyPage(opts: {
  priceId: string;
  productName: string;
  mode: "payment" | "subscription";
  accent: string;
  radius: number;
  error?: string;
}): string {
  const { priceId, productName, mode, accent, radius, error } = opts;

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Buy ${esc(productName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --gym-accent: ${accent};
    --gym-radius: ${radius}px;
  }
  ${CSS()}
</style>
</head>
<body>
<div class="page">
  <div class="container">
    <div class="header">
      <h1>${esc(productName)}</h1>
      <p class="desc">Enter your details to proceed to secure payment.</p>
    </div>

    ${error ? `<div class="error-banner">${esc(error)}</div>` : ""}

    <form method="POST" action="/embed/buy" class="buy-form">
      <input type="hidden" name="priceId" value="${esc(priceId)}">
      <input type="hidden" name="productName" value="${esc(productName)}">
      <input type="hidden" name="mode" value="${esc(mode)}">

      <div class="field">
        <label class="field-label">Your name <span class="req">*</span></label>
        <input type="text" name="name" class="fi" placeholder="Jane Smith" required autocomplete="name">
      </div>

      <div class="field">
        <label class="field-label">Email <span class="req">*</span></label>
        <input type="email" name="email" class="fi" placeholder="you@example.com" required autocomplete="email">
      </div>

      <div class="field">
        <label class="field-label">Phone (optional)</label>
        <input type="tel" name="phone" class="fi" placeholder="+44 7700 900000" autocomplete="tel">
      </div>

      <button type="submit" class="submit-btn" id="submitBtn">Continue to payment</button>
    </form>
  </div>
</div>

<script>
(function(){
  var form = document.querySelector(".buy-form");
  var btn = document.getElementById("submitBtn");
  if (form && btn) {
    form.addEventListener("submit", function() {
      btn.textContent = "Redirecting to payment…";
      btn.disabled = true;
    });
  }
  function sendResize() {
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: "gymos:resize", height: document.body.scrollHeight }, "*"); } catch (_) {}
    }
  }
  window.addEventListener("load", sendResize);
  sendResize();
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Shared HTML response headers
// ---------------------------------------------------------------------------

export const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "frame-ancestors *",
  "Cache-Control": "no-store",
};

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function renderEmbedBuy(event: H3Event): Promise<Response> {
  const reqUrl = getRequestURL(event);
  const searchParams = reqUrl.searchParams;

  const priceId = searchParams.get("priceId") ?? "";
  const productName = searchParams.get("productName") ?? "Class Pass";
  const rawMode = searchParams.get("mode") ?? "payment";
  const mode: "payment" | "subscription" =
    rawMode === "subscription" ? "subscription" : "payment";
  const accent = sanitizeHexColor(searchParams.get("accent"));
  const radius = sanitizeIntPx(searchParams.get("radius"));

  if (!priceId) {
    return new Response(
      renderBuyPage({
        priceId: "",
        productName,
        mode,
        accent,
        radius,
        error: "Missing priceId parameter.",
      }),
      { status: 400, headers: HTML_HEADERS },
    );
  }

  return new Response(
    renderBuyPage({ priceId, productName, mode, accent, radius }),
    { status: 200, headers: HTML_HEADERS },
  );
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function handleEmbedBuyPost(
  event: H3Event,
): Promise<Response | void> {
  const rawBody = await readBody(event);
  const body = rawBody as Record<string, unknown> | undefined;

  const priceId = (body?.priceId as string | undefined)?.trim() ?? "";
  const productName =
    (body?.productName as string | undefined)?.trim() ?? "pass";
  const rawMode = (body?.mode as string | undefined)?.trim();
  const mode: "payment" | "subscription" =
    rawMode === "subscription" ? "subscription" : "payment";
  const name = (body?.name as string | undefined)?.trim() ?? "";
  const email = (body?.email as string | undefined)?.trim().toLowerCase() ?? "";
  const phone = (body?.phone as string | undefined)?.trim() ?? "";
  const accent = sanitizeHexColor(null);
  const radius = sanitizeIntPx(null);

  // Validate required fields
  if (!priceId || !email || !name) {
    setResponseStatus(event, 400);
    return new Response(
      renderBuyPage({
        priceId: priceId || "",
        productName,
        mode,
        accent,
        radius,
        error: "Name and email are required.",
      }),
      { status: 400, headers: HTML_HEADERS },
    );
  }

  // Guard: connected account must be ready
  const acct = await readConnectedAccount();
  try {
    validateConnectedAccount(acct);
  } catch {
    setResponseStatus(event, 503);
    return new Response(
      renderBuyPage({
        priceId,
        productName,
        mode,
        accent,
        radius,
        error:
          "Online payments are temporarily unavailable. Please contact us directly.",
      }),
      { status: 503, headers: HTML_HEADERS },
    );
  }

  // ---------------------------------------------------------------------------
  // Upsert gym_member by email — FK-safe re-select pattern
  // (mirrors P1c-02 submissions.ts; re-SELECT canonical id after ON CONFLICT)
  //
  // guard:allow-unscoped — gym_members is single-tenant
  // ---------------------------------------------------------------------------
  const phoneE164 = phone ? normalizePhone(phone) : null;
  const nameParts = name.split(/\s+/);
  const firstName = nameParts[0] ?? "Guest";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  const db = getDb();
  const db2 = db as any as {
    execute: (q: unknown) => Promise<{ rows: unknown[] }>;
  };

  const freshMemberId = nanoid();
  let resolvedMemberId = freshMemberId;

  await db2.execute(sql`
    INSERT INTO gym_members (id, first_name, last_name, email, phone_e164, marketing_consent, created_at, updated_at)
    VALUES (${freshMemberId}, ${firstName}, ${lastName ?? null}, ${email}, ${phoneE164 ?? null}, false, NOW(), NOW())
    ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET
      first_name = EXCLUDED.first_name,
      phone_e164 = COALESCE(EXCLUDED.phone_e164, gym_members.phone_e164),
      updated_at = NOW()
  `);

  // Re-select canonical id — the upsert may have matched an existing row
  const { rows: memberRows } = await db2.execute(
    sql`SELECT id FROM gym_members WHERE email = ${email} LIMIT 1`,
  );
  resolvedMemberId =
    ((memberRows[0] as Record<string, unknown>)?.id as string | undefined) ??
    freshMemberId;

  // ---------------------------------------------------------------------------
  // Upsert conversation with status='lead' (coach sees buyer in /gymos)
  // guard:allow-unscoped — conversations is single-tenant
  // ---------------------------------------------------------------------------
  const freshConvId = nanoid();
  await db2.execute(sql`
    INSERT INTO conversations (id, member_id, channel, status, created_at, updated_at)
    VALUES (${freshConvId}, ${resolvedMemberId}, 'whatsapp', 'lead', NOW(), NOW())
    ON CONFLICT (member_id, channel) DO UPDATE SET
      status = CASE WHEN conversations.status = 'closed' THEN 'lead' ELSE conversations.status END,
      updated_at = NOW()
  `);

  // ---------------------------------------------------------------------------
  // Build Checkout session params and create on connected account
  // ---------------------------------------------------------------------------
  const baseUrl =
    process.env.STAFF_WEB_URL ?? "https://gym-class-os.vercel.app";

  const { params, opts } = buildCheckoutParams({
    memberId: resolvedMemberId,
    priceId,
    mode,
    acctId: acct!.id,
    baseUrl,
  });

  // Override success/cancel URLs for the embed context (Pitfall 6 — not behind auth)
  (params as any).success_url =
    `${baseUrl}/embed/buy/thank-you?member=${resolvedMemberId}`;
  (params as any).cancel_url =
    `${baseUrl}/embed/buy?priceId=${encodeURIComponent(priceId)}&productName=${encodeURIComponent(productName)}&mode=${mode}`;

  const platform = await getPlatformStripe();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (platform.checkout.sessions.create as any)(
    params,
    opts,
  );

  if (!session.url) {
    setResponseStatus(event, 502);
    return new Response(
      renderBuyPage({
        priceId,
        productName,
        mode,
        accent,
        radius,
        error: "Failed to create payment session. Please try again.",
      }),
      { status: 502, headers: HTML_HEADERS },
    );
  }

  // Redirect to Stripe-hosted Checkout
  return sendRedirect(event, session.url, 302) as unknown as Response;
}
