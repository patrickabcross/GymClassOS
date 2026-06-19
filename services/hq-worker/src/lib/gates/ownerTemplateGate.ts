import { and, eq } from "drizzle-orm";
import type { getHqDb } from "../db.js";
import { schema } from "../db.js";

/**
 * Template-approved gate for HQ owner B2B comms (HQD-03, D-07).
 *
 * MIRROR of services/worker/src/domain/gates/templateGate.ts.
 * DO NOT import from services/worker — CI guard enforces WABA separation (D-07).
 *
 * Returns true if a row exists in hq_whatsapp_templates with the given name
 * AND status='approved'. Caller throws OwnerTemplateNotApprovedError on false.
 *
 * Pure read — no mutations. The template-list sync action keeps
 * hq_whatsapp_templates fresh against Meta's API; this gate is the
 * read-side check at outbound-send time.
 */
export async function isOwnerTemplateApproved(
  name: string,
  db: ReturnType<typeof getHqDb>,
): Promise<boolean> {
  // guard:allow-unscoped — template list is HQ-global, not per-studio
  const rows = await db
    .select({ name: schema.hqWhatsappTemplates.name })
    .from(schema.hqWhatsappTemplates)
    .where(
      and(
        eq(schema.hqWhatsappTemplates.name, name),
        eq(schema.hqWhatsappTemplates.status, "approved"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
