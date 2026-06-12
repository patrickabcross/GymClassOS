/**
 * connected-account.ts — helpers for the Stripe Connect connected account.
 *
 * P1c.1: GymClassOS uses a single Custom-equivalent connected account per
 * studio (single-tenant deploy). This module reads and writes the
 * connected_accounts table that the Plan 03 account.updated reducer populates.
 *
 * guard:allow-unscoped — connected_accounts is studio-global config
 * (single-tenant, no studio_id scoping by design — one row per deploy).
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";

export interface ConnectedAccount {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
}

/**
 * Read the single connected account row for this studio.
 *
 * Returns null if no account has been created yet (pre-onboarding state).
 *
 * SQL: SELECT id, charges_enabled, payouts_enabled, requirements_due,
 *             disabled_reason FROM connected_accounts LIMIT 1
 *
 * guard:allow-unscoped — connected_accounts is studio-global config (single-tenant)
 */
export async function readConnectedAccount(): Promise<ConnectedAccount | null> {
  const db = getDb();
  // guard:allow-unscoped — connected_accounts is studio-global config (single-tenant)
  const result = await (db as any).execute(sql`
    SELECT id, charges_enabled, payouts_enabled, requirements_due, disabled_reason
    FROM connected_accounts
    LIMIT 1
  `);
  const rows = (result as any)?.rows ?? (result as any) ?? [];
  if (!rows || rows.length === 0) return null;

  const row = rows[0];

  // requirements_due is stored as a JSON array string (e.g. '["id.front","id.back"]')
  let requirementsDue: string[] = [];
  if (row.requirements_due) {
    try {
      const parsed = JSON.parse(row.requirements_due);
      requirementsDue = Array.isArray(parsed) ? parsed : [];
    } catch {
      requirementsDue = [];
    }
  }

  return {
    id: row.id as string,
    chargesEnabled: Boolean(row.charges_enabled),
    payoutsEnabled: Boolean(row.payouts_enabled),
    requirementsDue,
    disabledReason: (row.disabled_reason as string | null) ?? null,
  };
}

/**
 * Insert the connected account id at creation time.
 *
 * Called by create-connect-account immediately after accounts.create() resolves.
 * Uses INSERT ... ON CONFLICT (id) DO NOTHING — idempotent; if the row already
 * exists (e.g. re-run after a crash), it is a safe no-op.
 *
 * The readiness flags (charges_enabled, payouts_enabled, requirements_due) are
 * filled later by the Plan 03 worker's account.updated reducer; this just
 * records the id at creation time so the settings UI can show "pending" state.
 *
 * guard:allow-unscoped — connected_accounts is studio-global config (single-tenant)
 */
export async function upsertConnectedAccountId(
  acctId: string,
  studioLabel?: string,
): Promise<void> {
  const db = getDb();
  // guard:allow-unscoped — connected_accounts is studio-global config (single-tenant)
  await (db as any).execute(sql`
    INSERT INTO connected_accounts (id, studio_label, charges_enabled, payouts_enabled, created_at, updated_at)
    VALUES (
      ${acctId},
      ${studioLabel ?? null},
      false,
      false,
      now()::text,
      now()::text
    )
    ON CONFLICT (id) DO NOTHING
  `);
}
