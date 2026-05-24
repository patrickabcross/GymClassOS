import { sql } from "drizzle-orm";
import type { getDb } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";

/**
 * WA-08: Sync approved/pending/rejected template metadata from Meta.
 *
 * Called by the `templates-sync` pg-boss cron handler (daily 03:00 UTC).
 * Hits the Meta Template Management API and upserts every template row
 * into `whatsapp_templates` so the send-side gates (Plan 06 templateGate)
 * always have current status.
 *
 * Returns { synced }: the count of templates upserted. Errors propagate
 * so the cron tick records as failed and is retried next day.
 */
export async function syncWhatsAppTemplates(
  accessToken: string,
  wabaId: string,
  db: ReturnType<typeof getDb>,
): Promise<{ synced: number }> {
  const log = getLogger();
  const url = `https://graph.facebook.com/v23.0/${wabaId}/message_templates?fields=name,language,status,category,components&limit=200`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Meta Template API ${res.status}: ${errText.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    data?: Array<{
      name: string;
      status: string;
      category?: string;
      language?: string;
      components?: unknown;
    }>;
  };
  const templates = json.data ?? [];

  let synced = 0;
  for (const tpl of templates) {
    // guard:allow-unscoped — whatsapp_templates is studio-global (one
    // studio per deploy; no tenant column in this schema).
    await db.execute(sql`
      INSERT INTO whatsapp_templates (name, status, category, language, components_json, last_synced_at)
      VALUES (
        ${tpl.name},
        ${tpl.status},
        ${tpl.category ?? null},
        ${tpl.language ?? "en_US"},
        ${JSON.stringify(tpl.components ?? [])},
        NOW()
      )
      ON CONFLICT (name) DO UPDATE
        SET status = EXCLUDED.status,
            category = EXCLUDED.category,
            language = EXCLUDED.language,
            components_json = EXCLUDED.components_json,
            last_synced_at = EXCLUDED.last_synced_at
    `);
    synced += 1;
  }

  log.info({ synced }, "[syncTemplates] templates upserted");
  return { synced };
}
