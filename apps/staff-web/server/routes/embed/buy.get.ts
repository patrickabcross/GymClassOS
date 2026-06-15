/**
 * Public embed buy flow — GET /embed/buy
 *
 * Renders the standalone name/email/phone purchase form for a given price.
 * Anonymous, no auth required. Designed for iframe embedding or direct linking.
 *
 * URL params:
 *   priceId     — required — Stripe Price ID on the connected account
 *   productName — optional — display name (default: "Class Pass")
 *   mode        — optional — "payment" (default) | "subscription"
 *   accent      — optional — #RRGGBB accent colour (sanitised; default #000000)
 *   radius      — optional — border radius 0-32px (sanitised; default 6)
 *
 * CORS + auth bypass:
 *   - CORS: already covered by /embed prefix in 00-public-cors.ts (P1c-02)
 *   - Auth: "/embed" is already in publicPaths in auth.ts (P1c-02 owns it)
 *   - No change to auth.ts or 00-public-cors.ts needed
 */
export { renderEmbedBuy as default } from "../../../features/forms/lib/embed-buy-handler.js";
