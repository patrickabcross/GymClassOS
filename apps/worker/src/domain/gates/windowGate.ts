/**
 * 24-hour window gate (WA-06; PITFALL #1).
 *
 * Per Meta's Cloud API policy: a business may send free-text messages to
 * a customer only within 24 hours of the customer's most recent inbound
 * message. Outside this window, only approved templates may be sent.
 *
 * Pure function — no DB access. Caller loads lastInboundAt from
 * conversations.last_inbound_at and passes it here.
 */
export const WINDOW_HOURS = 24;

export function isInWindow(
  lastInboundAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (lastInboundAt === null) return false;
  const elapsedMs = now.getTime() - lastInboundAt.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  return elapsedHours < WINDOW_HOURS;
}
