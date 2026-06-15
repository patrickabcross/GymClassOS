/**
 * Public embed buy success page — GET /embed/buy/thank-you
 *
 * Stripe redirects the buyer here (success_url) after a completed Checkout.
 * Renders a self-contained dark-theme "Payment received" page. Anonymous,
 * iframe-embeddable (frame-ancestors *). Reads optional ?member query param
 * (informational only — pass-grant happens server-side via the worker
 * stripe-event reducer, NOT here).
 *
 * CORS + auth bypass:
 *   - "/embed" is already in publicPaths (auth.ts) + the allowlist skip block.
 *   - No auth.ts or 00-public-cors.ts change needed.
 *
 * guard:allow-unscoped — no DB access; renders static HTML only.
 */
import { defineEventHandler, getRequestURL } from "h3";
import {
  CSS,
  HTML_HEADERS,
} from "../../../../features/forms/lib/embed-buy-handler.js";

function renderThankYouPage(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Payment received</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  ${CSS()}
  .ty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px;padding-top:24px}
  .ty-check{width:56px;height:56px;color:#22c55e}
  .ty h1{font-size:1.5rem;font-weight:600;letter-spacing:-0.01em}
  .ty p{font-size:0.9375rem;color:hsl(var(--muted-fg));line-height:1.5;max-width:360px}
</style>
</head>
<body>
<div class="page">
  <div class="container">
    <div class="ty">
      <svg class="ty-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <h1>Payment received</h1>
      <p>Thank you. Your payment was successful and your pass will be applied to your account shortly. You can close this window.</p>
    </div>
  </div>
</div>
<script>
(function(){
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

export default defineEventHandler((event): Response => {
  // member query param is present for parity with success_url; page is identical regardless.
  void getRequestURL(event).searchParams.get("member");
  return new Response(renderThankYouPage(), {
    status: 200,
    headers: HTML_HEADERS,
  });
});
