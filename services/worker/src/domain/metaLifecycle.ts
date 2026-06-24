/**
 * services/worker/src/domain/metaLifecycle.ts
 *
 * MC2-01: Shared worker helpers for the three MC2 lifecycle fire points
 * (Contact, Purchase, Schedule). All DB access uses raw db.execute(sql`...`)
 * with guard:allow-unscoped markers — the worker NEVER imports
 * apps/staff-web/server/db/schema.ts (MC1-03 decision: separate build boundary).
 *
 * Exports:
 *   ZERO_DECIMAL_CURRENCIES — Set of ISO-4217 lowercase codes that are zero-decimal.
 *   toMajorUnits            — Convert Stripe minor-units to major units (zero-decimal aware).
 *   getMemberHashes         — Fetch and SHA-256-hash a member's email + phone from DB.
 *   getOrUpsertAttribution  — Ensure a meta_lead_attribution row exists; return fbc/fbp/IP/UA.
 */

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { enqueueMetaCapiEvent } from "@gymos/queue";
import { resolveStageEvent } from "../lib/stage-event-map.js";

// ---------------------------------------------------------------------------
// 1. Zero-decimal currency set (LIFE-02, D-08)
//
// These currencies have no minor units — 500 KRW is 500, not 5.00.
// Source: Stripe docs + Meta CAPI spec Q3 in MC2-RESEARCH.md.
// ---------------------------------------------------------------------------
export const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

/**
 * Convert an amount in minor units (as delivered by Stripe) to major units for
 * the Meta CAPI `value` field. Zero-decimal currencies pass through unchanged.
 *
 * @param amountMinorUnits - Amount in minor units (e.g. 2999 for GBP £29.99)
 * @param currency - ISO-4217 currency code (any case, e.g. "GBP", "gbp", "JPY")
 * @returns Amount in major units (e.g. 29.99 for GBP, 500 for JPY)
 */
export function toMajorUnits(
  amountMinorUnits: number,
  currency: string,
): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? amountMinorUnits
    : amountMinorUnits / 100;
}

// ---------------------------------------------------------------------------
// 2. SHA-256 PII hashing (D-16)
//
// Mirrors submissions.ts hashForCapi. Email: toLowerCase().trim().
// Phone: strip non-digits. Omit a field when the source value is null/empty.
// ---------------------------------------------------------------------------

function hashForCapi(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Fetch a gym member's email and phone from the DB and return SHA-256 hashes.
 * Returns only the fields that have non-empty values.
 *
 * @param db  - Worker Drizzle DB instance (from getDb())
 * @param memberId - The gym_members.id to look up
 */
export async function getMemberHashes(
  db: any,
  memberId: string,
): Promise<{ hashedEmail?: string; hashedPhone?: string }> {
  // guard:allow-unscoped — single-tenant meta attribution
  const rows = await db.execute(sql`
    SELECT email, phone_e164
    FROM gym_members
    WHERE id = ${memberId}
    LIMIT 1
  `);

  const rowList = (rows as any)?.rows ?? (rows as any) ?? [];
  const row = Array.isArray(rowList) ? rowList[0] : undefined;

  if (!row) return {};

  const result: { hashedEmail?: string; hashedPhone?: string } = {};

  const email = row.email as string | null | undefined;
  if (email && email.trim()) {
    result.hashedEmail = hashForCapi(email.toLowerCase().trim());
  }

  const phone = row.phone_e164 as string | null | undefined;
  if (phone && phone.trim()) {
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly) {
      result.hashedPhone = hashForCapi(digitsOnly);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 3. Member-keyed attribution upsert + read (D-04 / D-05)
//
// Ensures a meta_lead_attribution row exists (INSERT ... ON CONFLICT DO NOTHING),
// then returns the stored fbc / fbp / client_ip / client_user_agent.
// This handles the case where a lifecycle event fires for a member who joined
// before MC1 and never submitted a form (no existing attribution row).
// ---------------------------------------------------------------------------

/**
 * Ensure a meta_lead_attribution row exists for the given member, then return
 * the stored attribution signals (fbc, fbp, client_ip, client_user_agent).
 * Maps DB nulls to undefined so Meta omits absent fields in the CAPI request.
 *
 * @param db       - Worker Drizzle DB instance (from getDb())
 * @param memberId - The gym_members.id to upsert + read
 */
export async function getOrUpsertAttribution(
  db: any,
  memberId: string,
): Promise<{
  fbc?: string;
  fbp?: string;
  clientIp?: string;
  clientUserAgent?: string;
  metaLeadId?: string;
}> {
  // Ensure a row exists — INSERT ... ON CONFLICT (member_id) DO NOTHING
  // guard:allow-unscoped — single-tenant meta attribution
  await db.execute(sql`
    INSERT INTO meta_lead_attribution (id, member_id, created_at, updated_at)
    VALUES (${nanoid()}, ${memberId}, NOW(), NOW())
    ON CONFLICT (member_id) DO NOTHING
  `);

  // Read back the stored attribution signals
  // guard:allow-unscoped — single-tenant meta attribution
  const rows = await db.execute(sql`
    SELECT fbc, fbp, client_ip, client_user_agent, meta_lead_id
    FROM meta_lead_attribution
    WHERE member_id = ${memberId}
    LIMIT 1
  `);

  const rowList = (rows as any)?.rows ?? (rows as any) ?? [];
  const row = Array.isArray(rowList) ? rowList[0] : undefined;

  if (!row) return {};

  return {
    fbc: (row.fbc as string | null) ?? undefined,
    fbp: (row.fbp as string | null) ?? undefined,
    clientIp: (row.client_ip as string | null) ?? undefined,
    clientUserAgent: (row.client_user_agent as string | null) ?? undefined,
    metaLeadId: (row.meta_lead_id as string | null) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// 4. Contact CAPI fire-on-first-reply (LIFE-01, MC2-02)
//
// Enqueues a Contact CAPI event the first time a lead replies on WhatsApp.
// Gated on contact_sent_at IS NULL so repeat inbounds are no-ops.
// The contact_sent_at marker is stamped by the worker CAPI handler on SUCCESS
// (Plan 01 stageKey write-back) — not here. This preserves retry-until-success
// semantics: if the enqueue or send fails, the marker stays NULL and the next
// inbound will retry.
//
// Race note: rapid double-inbound before the first send completes could enqueue
// twice, but the pg-boss singletonKey (meta-capi-event:memberId:contact) in the
// CAPI handler collapses duplicates — acceptable and documented.
// ---------------------------------------------------------------------------

/**
 * Fire a Contact CAPI event on the first inbound WhatsApp reply from a lead.
 * Best-effort — callers MUST wrap in try/catch (D-17: enqueue failure must
 * never abort inbound message processing).
 *
 * @param db                  - Worker Drizzle DB instance (from getDb())
 * @param memberId            - The gym_members.id of the replying member
 * @param stageEventMapConfig - Optional studio override map; null uses default "Contact"
 */
export async function fireContactCapiIfFirstReply(
  db: any,
  memberId: string,
  stageEventMapConfig?: string | Record<string, string> | null,
): Promise<void> {
  // 1. Ensure attribution row exists (D-04/D-05) and read fbc/fbp.
  const attr = await getOrUpsertAttribution(db, memberId);

  // 2. Durable idempotency gate: contact_sent_at must be NULL.
  //    guard:allow-unscoped — single-tenant meta attribution
  const rows = await db.execute(sql`
    SELECT contact_sent_at FROM meta_lead_attribution WHERE member_id = ${memberId} LIMIT 1
  `);
  const rowList = (rows as any)?.rows ?? (rows as any) ?? [];
  const row = Array.isArray(rowList) ? rowList[0] : undefined;
  if (row?.contact_sent_at != null) return; // already sent — idempotent no-op

  // 3. Hashed PII for matching.
  const { hashedEmail, hashedPhone } = await getMemberHashes(db, memberId);

  // 4. Resolve event name via the shared resolver (LIFE-04).
  const eventName = resolveStageEvent(stageEventMapConfig ?? null, "contact");

  // 5. Enqueue. event_id = memberId:contact (verbatim LIFE-01). action_source literal.
  await enqueueMetaCapiEvent({
    eventId: `${memberId}:contact`,
    memberId,
    eventName,
    actionSource: "system_generated",
    stageKey: "contact",
    eventTime: Math.floor(Date.now() / 1000),
    hashedEmail,
    hashedPhone,
    fbc: attr.fbc,
    fbp: attr.fbp,
    clientIp: attr.clientIp,
    clientUserAgent: attr.clientUserAgent,
    leadId: attr.metaLeadId, // MC3 (LEAD-02): undefined for non-Lead-Ad members (additive)
  });
  // NOTE: contact_sent_at is stamped by the worker CAPI handler on SUCCESS
  // (Plan 01 stageKey write-back). If the enqueue or send fails, the marker
  // stays NULL and the next inbound retries — correct retry-until-success.
}
