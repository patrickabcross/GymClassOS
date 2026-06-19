/**
 * 24-hour window gate for HQ owner B2B comms (HQD-03, D-07).
 *
 * MIRROR of services/worker/src/domain/gates/windowGate.ts.
 * DO NOT import from services/worker — CI guard enforces WABA separation (D-07).
 *
 * Per Meta's Cloud API policy: a business may send free-text messages to
 * a customer only within 24 hours of the customer's most recent inbound
 * message. Outside this window, only approved templates may be sent.
 * The same policy applies to B2B WABA sends (gym-owner comms).
 *
 * Pure function — no DB access. Caller loads lastInboundAt from
 * hq_whatsapp_opt_in.last_inbound_at and passes it here.
 */
export const OWNER_WINDOW_HOURS = 24;

export function isOwnerInWindow(
  lastInboundAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (lastInboundAt === null) return false;
  const elapsedMs = now.getTime() - lastInboundAt.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  return elapsedHours < OWNER_WINDOW_HOURS;
}
