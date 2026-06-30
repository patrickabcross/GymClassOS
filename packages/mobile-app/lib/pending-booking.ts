// Pending-booking intent store — MA2-02 (MEM-02).
//
// A tiny in-session intent store (module-level variable). When a signed-out
// member taps Book on the schedule (MA2-03), the occurrenceId is stashed here
// before routing to /sign-in. After a successful sign-in, sign-in.tsx checks
// for a pending intent and returns the member to /(tabs)/schedule so they can
// complete the booking for that class in one continuous flow.
//
// The intent lives for the duration of one app run — which is all MEM-02 needs:
// the sign-in → return-to-class hop happens within a single session. It is NOT
// persisted to secure-store/AsyncStorage (a cold-start mid-flow is rare and a
// stale intent would surprise the member). MA2-03's schedule screen consumes
// and clears it on focus (the resume leg). This module only sets it (Book press)
// and reads it (sign-in success) — it never clears it itself except via the
// explicit clearPendingBooking escape hatch.
let pending: string | null = null;

export function setPendingBooking(occurrenceId: string): void {
  pending = occurrenceId;
}

export function getPendingBooking(): string | null {
  return pending;
}

export function clearPendingBooking(): void {
  pending = null;
}
