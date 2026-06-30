// Poll-for-grant — MA2-03 (MEM-04), the async pass-grant race.
//
// /api/m/purchase returns a hosted Stripe Checkout URL; the pass is granted
// ASYNCHRONOUSLY by the Fly worker after Stripe fires checkout.session.completed.
// The hosted-Checkout return (expo-web-browser dismiss) can precede that webhook,
// so the booking CANNOT complete synchronously after purchase. The client must
// observe the grant by polling /api/m/profile until passBalance rises, THEN
// re-issue the booking. success_url is a plain web page, NOT a deep link — the
// browser return tells us only "the user came back", never the payment outcome.
import { apiFetch } from "./api";

// Returns the current passBalance, or null on a transient read failure
// (401 / network) — null means "no reading this cycle", never a balance change.
async function readPassBalance(): Promise<number | null> {
  try {
    const profile = await apiFetch("/api/m/profile");
    return typeof profile?.passBalance === "number" ? profile.passBalance : 0;
  } catch {
    return null;
  }
}

/**
 * Poll /api/m/profile until the member's pass balance increases above the
 * balance read at the start, or until the timeout elapses.
 *
 * @returns true as soon as a grant is observed (balance rose); false on timeout.
 */
export async function pollForGrant(opts?: {
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<boolean> {
  const intervalMs = opts?.intervalMs ?? 2000;
  const timeoutMs = opts?.timeoutMs ?? 30000;

  // Baseline: a failed start-read clamps to 0 so any later positive balance
  // still registers as a grant (never a false positive from a sentinel).
  const startBalance = (await readPassBalance()) ?? 0;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const current = await readPassBalance();
    if (current !== null && current > startBalance) {
      return true;
    }
  }
  return false;
}
