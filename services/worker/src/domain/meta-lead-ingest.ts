/**
 * services/worker/src/domain/meta-lead-ingest.ts
 *
 * MC3 (LEAD-01 / LEAD-03): Ingest a Meta Lead Ad submission into the studio DB.
 *
 * Called by the meta-lead queue handler after retrieving field_data via the
 * Graph API. This module is the worker-side sibling of the website-form path
 * (apps/staff-web/features/forms/handlers/submissions.ts) — it performs the
 * same member reconcile + conversation upsert + attribution + opt-in writes,
 * but:
 *   1. Reads from Meta's field_data (name/values pairs) instead of form fields.
 *   2. Stores meta_lead_id on meta_lead_attribution (the key MC3 addition).
 *   3. SKIPS the Lead CAPI enqueue — D-03: Meta already counted this in-platform
 *      lead; firing Lead back risks double-counting and skews ROAS.
 *
 * ALL DB access uses raw db.execute(sql`...`) with guard:allow-unscoped markers.
 * This module NEVER imports apps/staff-web/server/db/schema.ts (MC1-03 boundary:
 * separate build boundary, no cross-app Drizzle imports).
 *
 * DB row-shape: db.execute returns { rows: [] } (Neon neon-serverless) — read
 * via `(result as any)?.rows ?? (result as any) ?? []` then `[0]`, same as
 * metaLifecycle.ts.
 */

import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getLogger } from "../lib/logger.js";

/** Shape of the Graph API lead response (GET /{leadgen_id}). */
export interface MetaLeadGraphResponse {
  id?: string;
  created_time?: string;
  field_data?: Array<{ name: string; values?: string[] }>;
}

/** Return type from ingestMetaLead — undefined if lead was parked (D-07). */
export interface IngestResult {
  memberId: string;
}

/**
 * Ingest a Meta Lead Ad into the studio DB.
 *
 * @param db        - Worker Drizzle DB instance (from getDb())
 * @param lead      - Graph API response body ({ field_data: [...] })
 * @param leadgenId - The leadgen_id as a string (precision-safe, from the edge)
 * @param formId    - form_id from the webhook payload (for message context)
 * @returns         { memberId } on success, or undefined if parked (D-07)
 */
export async function ingestMetaLead(
  db: any,
  lead: MetaLeadGraphResponse,
  leadgenId: string,
  formId?: string,
): Promise<IngestResult | undefined> {
  const log = getLogger();

  // ── 1. Build field map from Meta's field_data name/values pairs (D-05) ──────
  const fieldMap: Record<string, string> = Object.fromEntries(
    (lead.field_data ?? []).map((f) => [f.name, f.values?.[0] ?? ""]),
  );

  // ── 2. Extract standard fields (D-05) ────────────────────────────────────────
  const fullName = (fieldMap["full_name"] ?? "").trim();
  const email = (fieldMap["email"] ?? "").trim().toLowerCase() || null;

  // Phone: prefer standard field 'phone_number'; fuzzy-fallback to any key
  // containing 'phone' for custom-named fields (RESEARCH edge case note).
  let rawPhone = fieldMap["phone_number"] ?? "";
  if (!rawPhone) {
    const phoneKey = Object.keys(fieldMap).find((k) =>
      k.toLowerCase().includes("phone"),
    );
    rawPhone = phoneKey ? (fieldMap[phoneKey] ?? "") : "";
  }

  // Minimal E.164 normalize: keep leading +, strip non [+\d] characters.
  // We don't import a normalize library here (worker boundary) — this minimal
  // pass handles most real-world formats (+44 7700 900000 → +447700900000).
  const phoneE164 = rawPhone
    ? "+" + rawPhone.replace(/[^+\d]/g, "").replace(/^\+/, "")
    : null;
  const phone = phoneE164 && phoneE164.length > 2 ? phoneE164 : null;

  // Best-effort name split (D-05): first word → firstName, remainder → lastName.
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "Lead";
  const lastName = nameParts.slice(1).join(" ") || null;

  // ── 3. D-07 PARK: skip if neither email nor phone ────────────────────────────
  if (!email && !phone) {
    log.warn(
      { leadgenId },
      "[meta-lead] lead has no email or phone — parking (D-07)",
    );
    // Return undefined — caller (queue handler) still marks job complete;
    // idempotency is already recorded at the edge (insertWebhookEvent).
    return undefined;
  }

  // ── 4. Dual-unique-key member reconcile (mirrors submissions.ts exactly) ─────
  //
  // gym_members has SEPARATE unique indexes on email AND phone_e164.
  // A single ON CONFLICT upsert on one key can violate the other when the
  // submitted value already belongs to a different member.
  // Resolve by looking up BOTH keys first, then branch.

  const memberId = nanoid();
  let resolvedMemberId = memberId;

  // Lookup by email
  // guard:allow-unscoped — single-tenant gym tables
  const byEmailResult = email
    ? await db.execute(
        sql`SELECT id, phone_e164 FROM gym_members WHERE email = ${email} LIMIT 1`,
      )
    : { rows: [] as unknown[] };
  const byEmailRows =
    (byEmailResult as any)?.rows ?? (byEmailResult as any) ?? [];
  const byEmail = Array.isArray(byEmailRows)
    ? (byEmailRows[0] as { id: string; phone_e164: string | null } | undefined)
    : undefined;

  // Lookup by phone
  // guard:allow-unscoped — single-tenant gym tables
  const byPhoneResult = phone
    ? await db.execute(
        sql`SELECT id FROM gym_members WHERE phone_e164 = ${phone} LIMIT 1`,
      )
    : { rows: [] as unknown[] };
  const byPhoneRows =
    (byPhoneResult as any)?.rows ?? (byPhoneResult as any) ?? [];
  const byPhone = Array.isArray(byPhoneRows)
    ? (byPhoneRows[0] as { id: string } | undefined)
    : undefined;

  if (byEmail) {
    // Email matched — reuse this member. Backfill phone only if:
    //   (a) this member has no phone, AND
    //   (b) the phone is not already taken by a different member.
    resolvedMemberId = byEmail.id;
    const canSetPhone =
      phone != null &&
      !byEmail.phone_e164 &&
      (!byPhone || byPhone.id === byEmail.id);
    if (canSetPhone) {
      // guard:allow-unscoped — single-tenant gym tables
      await db.execute(sql`
        UPDATE gym_members
        SET first_name = ${firstName}, phone_e164 = ${phone}, updated_at = NOW()
        WHERE id = ${byEmail.id}
      `);
    } else {
      // guard:allow-unscoped — single-tenant gym tables
      await db.execute(sql`
        UPDATE gym_members
        SET first_name = ${firstName}, updated_at = NOW()
        WHERE id = ${byEmail.id}
      `);
    }
  } else if (byPhone) {
    // Phone matched but email is new — attach to existing member;
    // backfill email via COALESCE (only if the row has none).
    resolvedMemberId = byPhone.id;
    // guard:allow-unscoped — single-tenant gym tables
    await db.execute(sql`
      UPDATE gym_members
      SET first_name = ${firstName},
          email = COALESCE(email, ${email}),
          updated_at = NOW()
      WHERE id = ${byPhone.id}
    `);
  } else {
    // Neither key matches — insert a fresh member row.
    // guard:allow-unscoped — single-tenant gym tables
    await db.execute(sql`
      INSERT INTO gym_members (id, first_name, last_name, email, phone_e164, marketing_consent, created_at, updated_at)
      VALUES (${memberId}, ${firstName}, ${lastName}, ${email}, ${phone}, false, NOW(), NOW())
    `);
    resolvedMemberId = memberId;
  }

  // ── 5. Conversation upsert — status='lead', channel='whatsapp' ───────────────
  //
  // ON CONFLICT (member_id, channel): preserve existing status unless 'closed'
  // (reopen a closed conversation as 'lead' when a new Meta lead arrives).
  const convId = nanoid();
  // guard:allow-unscoped — single-tenant gym tables
  await db.execute(sql`
    INSERT INTO conversations (id, member_id, channel, status, created_at, updated_at)
    VALUES (${convId}, ${resolvedMemberId}, 'whatsapp', 'lead', NOW(), NOW())
    ON CONFLICT (member_id, channel) DO UPDATE SET
      status = CASE
        WHEN conversations.status = 'closed' THEN 'lead'
        ELSE conversations.status
      END,
      updated_at = NOW()
  `);

  // Re-select canonical conversation id by (member_id, channel) — the ON CONFLICT
  // may have returned an existing row whose id differs from our fresh convId.
  // guard:allow-unscoped — single-tenant gym tables
  const convRows = await db.execute(sql`
    SELECT id FROM conversations
    WHERE member_id = ${resolvedMemberId} AND channel = 'whatsapp'
    LIMIT 1
  `);
  const convRowList = (convRows as any)?.rows ?? (convRows as any) ?? [];
  const convRow = Array.isArray(convRowList) ? convRowList[0] : undefined;
  const resolvedConvId =
    (convRow as { id?: string } | undefined)?.id ?? convId;

  // ── 6. Messages row — lead context visible in /gymos inbox (parity with form path) ─
  //
  // Claude's Discretion: include a messages row so the coach sees the lead
  // source in the inbox conversation thread (same pattern as form_submission).
  const messageBody = fullName
    ? `New lead via Meta Lead Ad — ${fullName}`
    : "New lead via Meta Lead Ad";
  // guard:allow-unscoped — single-tenant gym tables
  await db.execute(sql`
    INSERT INTO messages (id, conversation_id, direction, message_type, body, payload, status, created_at)
    VALUES (
      ${nanoid()},
      ${resolvedConvId},
      'in',
      'text',
      ${messageBody},
      ${JSON.stringify({ kind: "meta_lead_ad", leadgenId, formId: formId ?? "", fieldData: fieldMap })},
      'delivered',
      NOW()
    )
  `);

  // ── 7. meta_lead_attribution upsert WITH meta_lead_id (the key MC3 addition) ──
  //
  // On first ingest: INSERT the attribution row with meta_lead_id = leadgenId.
  // On collision (member already has a row): COALESCE to preserve existing
  // meta_lead_id if present (in case the row was created by a lifecycle fire
  // before this ingest ran), but always set meta_lead_id when we have it.
  // guard:allow-unscoped — single-tenant meta attribution
  await db.execute(sql`
    INSERT INTO meta_lead_attribution (id, member_id, meta_lead_id, created_at, updated_at)
    VALUES (${nanoid()}, ${resolvedMemberId}, ${leadgenId}, NOW(), NOW())
    ON CONFLICT (member_id) DO UPDATE SET
      meta_lead_id = COALESCE(EXCLUDED.meta_lead_id, meta_lead_attribution.meta_lead_id),
      updated_at = NOW()
  `);

  // ── 8. WhatsApp opt-in row — source='meta_lead_ads' (D-01 / LEAD-03) ──────────
  //
  // The lead deliberately gave the gym their contact details via the ad — treat
  // as opt-in. ON CONFLICT DO NOTHING: do not overwrite a prior opt-in source
  // (e.g. a member who previously opted in via form_submission or inbound_reply).
  // guard:allow-unscoped — single-tenant gym tables
  await db.execute(sql`
    INSERT INTO whatsapp_opt_in (member_id, opted_in_at, evidence_payload, source)
    VALUES (
      ${resolvedMemberId},
      NOW()::text,
      ${JSON.stringify({ kind: "meta_lead_ad", leadgenId, fieldData: fieldMap })},
      'meta_lead_ads'
    )
    ON CONFLICT (member_id) DO NOTHING
  `);

  // D-03: NO Lead CAPI enqueue — Meta already counted this in-platform lead
  // (avoids double-count). Only downstream Contact/Purchase/Schedule lifecycle
  // events (MC2) are reported for Lead-Ad members — those fire automatically
  // when the member replies (Contact), buys (Purchase), or attends (Schedule),
  // reading meta_lead_id from the attribution row we just wrote above.

  log.info(
    { leadgenId, resolvedMemberId, email, phone: phone ? "[set]" : "[absent]" },
    "[meta-lead] ingest complete",
  );

  return { memberId: resolvedMemberId };
}
