/**
 * import-leads — bulk-import a CSV of leads.
 *
 * dryRun:true  → parse + preview (no DB writes)
 * dryRun:false → parse + commit (member upserts, opt-in upserts, lead conversations)
 *
 * guard:allow-unscoped — single-tenant gym deploy; bulk lead import by natural key.
 *
 * NOT an agent-facing LLM tool (no `http` key = default POST; not listed in
 * agent-chat.ts system prompt). Surfaced in the inbox Leads view only.
 */

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { parse } from "csv-parse/sync";
import { getDb, schema } from "../server/db/index.js";
import { parseLeadsCsv } from "../server/lib/csv-leads.js";

export default defineAction({
  description:
    "Bulk-import a CSV of leads (auto-detects columns, normalizes phones to E.164, " +
    "dedups, creates status='lead' conversations + opt-ins). " +
    "dryRun:true previews; dryRun:false commits. Surfaced in the inbox Leads view, not an agent-facing tool.",
  schema: z.object({
    csvText: z.string().min(1, "CSV text is required"),
    dryRun: z.boolean().default(true),
  }),
  run: async ({ csvText, dryRun }) => {
    // 1. Parse CSV text
    let rows: Record<string, string>[];
    try {
      rows = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }) as Record<string, string>[];
    } catch (err: unknown) {
      return {
        ok: false,
        error: `CSV parse error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (rows.length === 0) {
      return { ok: false, error: "CSV has no data rows" };
    }

    // 2. Load existing phones for DB dedup
    // guard:allow-unscoped — single-tenant gym deploy; bulk lead import by natural key
    const db = getDb();
    const existingRows = await db
      .select({ p: schema.gymMembers.phoneE164 })
      .from(schema.gymMembers);
    // guard:allow-unscoped
    const existingPhones = new Set(
      existingRows.map((r) => r.p).filter(Boolean) as string[],
    );

    // 3. Parse + normalise rows via shared library
    const nowIso = new Date().toISOString();
    const parsed = parseLeadsCsv(rows, { existingPhones, nowIso });

    // 4. Hard error if required columns not detected
    if (parsed.missingFields.length > 0) {
      return {
        ok: false,
        error:
          "Couldn't detect required column(s): " +
          parsed.missingFields.join(", "),
        mapping: parsed.mapping,
        rawHeaders: parsed.rawHeaders,
      };
    }

    // 5. Build preview payload (same shape for dryRun and commit responses)
    const preview = {
      ok: true as const,
      mapping: parsed.mapping,
      rawHeaders: parsed.rawHeaders,
      counts: parsed.counts,
      sample: parsed.members.slice(0, 5).map((m) => ({
        firstName: m.firstName,
        lastName: m.lastName,
        phoneE164: m.phoneE164,
        email: m.email,
        optIn: m.consent,
      })),
    };

    // 6. Dry-run → return preview only
    if (dryRun) {
      return { ...preview, committed: 0, leadsCreated: 0 };
    }

    // 7. Commit — mirror features/forms/handlers/submissions.ts FK-safe re-select pattern.
    //    For each parsed member:
    //    a) Upsert gym_members (prefer email conflict target; fall back to phone)
    //    b) Re-select canonical id by natural key
    //    c) If consented, upsert whatsapp_opt_in ON CONFLICT DO NOTHING
    //    d) Upsert conversation status='lead' ON CONFLICT (member_id, channel)
    //       (preserves non-closed statuses — mirrors submissions.ts §10)

    // Cast to any for raw SQL execution — Neon HTTP driver returns { rows: [] }.
    const db2 = db as unknown as {
      execute: (q: unknown) => Promise<{ rows: unknown[] }>;
    };

    let committedMembers = 0;
    let leadsCreated = 0;

    for (const m of parsed.members) {
      const memberId = nanoid();

      // a) Upsert gym_members
      // guard:allow-unscoped — single-tenant gym deploy
      if (m.email) {
        await db2.execute(sql`
          INSERT INTO gym_members (id, first_name, last_name, email, phone_e164, marketing_consent, created_at, updated_at)
          VALUES (${memberId}, ${m.firstName}, ${m.lastName ?? null}, ${m.email}, ${m.phoneE164}, ${m.consent}, NOW(), NOW())
          ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET
            first_name = EXCLUDED.first_name,
            phone_e164 = COALESCE(EXCLUDED.phone_e164, gym_members.phone_e164),
            marketing_consent = EXCLUDED.marketing_consent,
            updated_at = NOW()
        `);
      } else {
        await db2.execute(sql`
          INSERT INTO gym_members (id, first_name, last_name, phone_e164, marketing_consent, created_at, updated_at)
          VALUES (${memberId}, ${m.firstName}, ${m.lastName ?? null}, ${m.phoneE164}, ${m.consent}, NOW(), NOW())
          ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO UPDATE SET
            first_name = EXCLUDED.first_name,
            marketing_consent = EXCLUDED.marketing_consent,
            updated_at = NOW()
        `);
      }

      // b) Re-select canonical id (the upsert may have hit an EXISTING row whose id != memberId)
      // guard:allow-unscoped
      let resolvedMemberId = memberId;
      if (m.email) {
        const {
          rows: [existing],
        } = await db2.execute(
          sql`SELECT id FROM gym_members WHERE email = ${m.email} LIMIT 1`,
        );
        const existingId = (existing as Record<string, unknown> | undefined)
          ?.id as string | undefined;
        if (existingId) {
          if (existingId === memberId) committedMembers++;
          resolvedMemberId = existingId;
        }
      } else {
        const {
          rows: [existing],
        } = await db2.execute(
          sql`SELECT id FROM gym_members WHERE phone_e164 = ${m.phoneE164} LIMIT 1`,
        );
        const existingId = (existing as Record<string, unknown> | undefined)
          ?.id as string | undefined;
        if (existingId) {
          if (existingId === memberId) committedMembers++;
          resolvedMemberId = existingId;
        }
      }

      // c) Upsert whatsapp_opt_in for consented members
      // guard:allow-unscoped
      if (m.consent) {
        await db2.execute(sql`
          INSERT INTO whatsapp_opt_in (member_id, opted_in_at, evidence_payload, source)
          VALUES (
            ${resolvedMemberId},
            ${m.consentDate},
            ${JSON.stringify({
              importedVia: "csv-upload",
              consentColumn: m.consentColumn,
              consentValue: m.consentValue,
              importedAt: nowIso,
            })},
            'import'
          )
          ON CONFLICT (member_id) DO NOTHING
        `);
      }

      // d) Upsert conversation status='lead'
      //    ON CONFLICT (member_id, channel) — preserve non-closed statuses.
      //    Mirrors submissions.ts §10 exactly.
      // guard:allow-unscoped
      const convId = nanoid();
      await db2.execute(sql`
        INSERT INTO conversations (id, member_id, channel, status, created_at, updated_at)
        VALUES (${convId}, ${resolvedMemberId}, 'whatsapp', 'lead', NOW(), NOW())
        ON CONFLICT (member_id, channel) DO UPDATE SET
          status = CASE WHEN conversations.status = 'closed' THEN 'lead' ELSE conversations.status END,
          updated_at = NOW()
      `);

      // Re-select to check if a new lead conversation was created
      const {
        rows: [convRow],
      } = await db2.execute(
        sql`SELECT id, status FROM conversations WHERE member_id = ${resolvedMemberId} AND channel = 'whatsapp' LIMIT 1`,
      );
      const convData = convRow as Record<string, unknown> | undefined;
      if (convData?.id === convId || convData?.status === "lead") {
        leadsCreated++;
      }
    }

    return {
      ...preview,
      committed: committedMembers,
      leadsCreated,
    };
  },
});
