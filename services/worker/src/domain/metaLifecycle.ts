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
    SELECT fbc, fbp, client_ip, client_user_agent
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
  };
}
