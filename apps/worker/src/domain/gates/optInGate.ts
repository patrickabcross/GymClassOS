import { eq } from "drizzle-orm";
import type { getDb } from "../../lib/db.js";
import { schema } from "../../lib/db.js";

/**
 * Opt-in gate (WA-07; PITFALL #17).
 *
 * Returns true if the member has at least one row in whatsapp_opt_in.
 * Caller (sendMessage chokepoint) throws NoOptInError on false.
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
    .select({ memberId: schema.whatsappOptIn.memberId })
    .from(schema.whatsappOptIn)
    .where(eq(schema.whatsappOptIn.memberId, memberId))
    .limit(1);
  return rows.length > 0;
}
