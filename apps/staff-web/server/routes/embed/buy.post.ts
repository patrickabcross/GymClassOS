/**
 * Public embed buy flow — POST /embed/buy
 *
 * Handles the form submission from GET /embed/buy:
 *   1. Validates name + email (required)
 *   2. Guards on connected account chargesEnabled
 *   3. Upserts gym_member by email (FK-safe re-select — P1c-02 pattern)
 *   4. Upserts conversation with status='lead'
 *   5. Creates Stripe Checkout session on connected account
 *   6. Redirects to session.url
 *
 * CORS + auth bypass:
 *   - CORS: already covered by /embed prefix in 00-public-cors.ts (P1c-02)
 *   - Auth: "/embed" is already in publicPaths in auth.ts (P1c-02 owns it)
 *
 * guard:allow-unscoped — gym_members, conversations are single-tenant.
 * Public anonymous endpoint — no runWithRequestContext.
 */
export { handleEmbedBuyPost as default } from "../../../features/forms/lib/embed-buy-handler.js";
