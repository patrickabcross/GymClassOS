import { sql } from "drizzle-orm";
import type { getDb } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";

/**
 * WA-08: Sync approved/pending/rejected template metadata from MYÜTIK.
 *
 * Called by the `templates-sync` pg-boss cron handler (daily 03:00 UTC).
 * Hits the MYÜTIK Template Extract API and upserts every template row
 * into `whatsapp_templates` so the send-side gates (Plan 06 templateGate)
 * always have current status.
 *
 * MYÜTIK returns status values as UPPERCASE (e.g. "APPROVED"). The upsert
 * lowercases them so templateGate's `status = "approved"` filter matches.
 *
 * Returns { synced }: the count of templates upserted across all pages.
 * Errors propagate so the cron tick records as failed and is retried next day.
 */
export async function syncWhatsAppTemplates(
  apiKey: string,
  phoneNumberId: string,
  db: ReturnType<typeof getDb>,
): Promise<{ synced: number }> {
  const log = getLogger();

  const baseUrl = new URL("https://myutik.com/api/channels/whatsapp/templates");
  baseUrl.searchParams.set("phoneNumberId", phoneNumberId);
  baseUrl.searchParams.set("limit", "200");

  let synced = 0;
  let after: string | undefined;
  // Defensive cap: at most 20 pages (200 templates × 20 = 4,000 max).
  for (let page = 0; page < 20; page++) {
    const url = new URL(baseUrl.toString());
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `MYÜTIK Template API ${res.status}: ${body.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as {
      templates?: Array<{
        name: string;
        status: string;
        category?: string;
        language?: string;
        components?: unknown;
      }>;
      paging?: { next?: string | null };
    };

    const templates = json.templates ?? [];

    for (const tpl of templates) {
      // guard:allow-unscoped — whatsapp_templates is studio-global (one
      // studio per deploy; no tenant column in this schema).
      await db.execute(sql`
        INSERT INTO whatsapp_templates (name, status, category, language, components_json, last_synced_at)
        VALUES (
          ${tpl.name},
          ${tpl.status.toLowerCase()},
          ${tpl.category ?? null},
          ${tpl.language ?? "en_US"},
          ${JSON.stringify({ components: tpl.components ?? [] })},
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

    const next = json.paging?.next;
    if (next) {
      after = next;
    } else {
      break;
    }
  }

  log.info({ synced }, "[syncTemplates] templates upserted");
  return { synced };
}
