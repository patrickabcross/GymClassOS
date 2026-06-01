/**
 * Per-IP in-memory rate limiter for the public form submission endpoint.
 *
 * Decision 2 (P1c-CONTEXT.md): "rate-limit + lightweight bot protection" is LOCKED.
 * The honeypot (_hp) covers bots; this covers flooding.
 *
 * Limit: 60 requests per 15 minutes per IP key.
 *
 * CAVEAT: This uses a module-level Map. On Fly.io (single always-on machine),
 * the Map persists across requests — this is effective flood protection.
 * On Vercel serverless functions, each cold start is a fresh process and the
 * Map resets — the rate limiter becomes best-effort only.
 * Upgrade to Vercel KV (a durable shared store) if flooding materialises on
 * Vercel serverless.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_HITS = 60;

const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * Returns true if the request is ALLOWED, false if the IP has exceeded
 * the rate limit window.
 *
 * @param ipKey - The IP address string. Empty/missing → fail open (return true).
 * @param now   - Current timestamp in ms (injectable for testing, defaults to Date.now()).
 */
export function checkRateLimit(ipKey: string, now = Date.now()): boolean {
  if (!ipKey) return true; // unknown IP → don't hard-block (fail open)

  const entry = hits.get(ipKey);
  if (!entry || now >= entry.resetAt) {
    // First request in window, or window has expired — start fresh
    hits.set(ipKey, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_HITS) return false;
  entry.count += 1;
  return true;
}
