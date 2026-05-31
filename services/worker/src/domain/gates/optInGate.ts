import { eq } from "drizzle-orm";
import type { getDb } from "../../lib/db.js";
import { schema } from "../../lib/db.js";

/**
 * Opt-in gate (WA-07, WA-09/WA-10; PITFALL #17).
 *
 * Returns true if the member has an opt-in row AND is not opted out.
 * Opted-out members are refused via NoOptInError at the chokepoint (WA-09/WA-10).
 * Caller (sendMessage chokepoint) throws NoOptInError on false.
 *
 * Gate logic:
 *   - No row                    → false (not opted in)
 *   - Row + optedOutAt IS NULL  → true  (opted in, not opted out)
 *   - Row + optedOutAt IS SET   → false (opted in but subsequently opted out)
 *
 * NoOptInError is reused for opted-out members to keep the typed-code surface
 * stable (NO_OPT_IN maps to the staff-web failed-bubble copy per P1b-06).
 * A dedicated OptedOutError would require additional wiring in the
 * outbound-whatsapp queue handler — avoid unless needed in a future plan.
 *
 * Pure read — no mutations. Caller is responsible for translating false
 * into the typed refusal error.
 */
export async function hasOptIn(
  memberId: string,
  db: ReturnType<typeof getDb>,
): Promise<boolean> {
  // guard:allow-unscoped — sendMessage chokepoint is the gate; no per-user
  // scoping needed at this point (the gate IS the access check).
  const rows = await db
    .select({
      memberId: schema.whatsappOptIn.memberId,
      optedOutAt: schema.whatsappOptIn.optedOutAt,
    })
    .from(schema.whatsappOptIn)
    .where(eq(schema.whatsappOptIn.memberId, memberId))
    .limit(1);
  // Row must exist AND opted_out_at must be NULL (not opted out).
  return rows.length > 0 && rows[0].optedOutAt == null;
}
