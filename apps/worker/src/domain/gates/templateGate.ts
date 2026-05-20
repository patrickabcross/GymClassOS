import { and, eq } from "drizzle-orm";
import type { getDb } from "../../lib/db.js";
import { schema } from "../../lib/db.js";

/**
 * Template-approved gate (WA-08).
 *
 * Returns true if a row exists in whatsapp_templates with the given name
 * AND status='approved'. Caller throws TemplateNotApprovedError on false.
 *
 * Pure read — no mutations. The template-list sync job (Plan 08) keeps
 * whatsapp_templates fresh against Meta's API; this gate is just the
 * read-side check at outbound-send time.
 */
export async function isTemplateApproved(
  name: string,
  db: ReturnType<typeof getDb>,
): Promise<boolean> {
  // guard:allow-unscoped — template list is studio-global, not per-user
  const rows = await db
    .select({ name: schema.whatsappTemplates.name })
    .from(schema.whatsappTemplates)
    .where(
      and(
        eq(schema.whatsappTemplates.name, name),
        eq(schema.whatsappTemplates.status, "approved"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
