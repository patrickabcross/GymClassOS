import { eq } from "drizzle-orm";
import type { getHqDb } from "../db.js";
import { schema } from "../db.js";

/**
 * Opt-in gate for HQ owner B2B comms (HQD-01, D-07).
 *
 * MIRROR of services/worker/src/domain/gates/optInGate.ts.
 * DO NOT import from services/worker — CI guard enforces WABA separation (D-07).
 *
 * Returns true if the studio has an opt-in row AND is not opted out.
 * Caller (sendOwnerMessage chokepoint) throws OwnerNoOptInError on false.
 *
 * Gate logic:
 *   - No row                    → false (studio never opted in)
 *   - Row + optedOutAt IS NULL  → true  (opted in, active)
 *   - Row + optedOutAt IS SET   → false (previously opted in, now opted out)
 *
 * Targets hq_whatsapp_opt_in (one row per studio — UNIQUE(studio_id)).
 * The owner_email + phone_e164 on that row are the GYM-OWNER's own contact
 * info (B2B), NOT gym members. HQ Neon has no member data.
 */
export async function hasOwnerOptIn(
  studioId: string,
  db: ReturnType<typeof getHqDb>,
): Promise<boolean> {
  // guard:allow-unscoped — HQ send chokepoint; studio_id IS the access check
  const rows = await db
    .select({
      studioId: schema.hqWhatsappOptIn.studioId,
      optedOutAt: schema.hqWhatsappOptIn.optedOutAt,
    })
    .from(schema.hqWhatsappOptIn)
    .where(eq(schema.hqWhatsappOptIn.studioId, studioId))
    .limit(1);
  // Row must exist AND opted_out_at must be NULL (not opted out).
  return rows.length > 0 && rows[0].optedOutAt == null;
}
