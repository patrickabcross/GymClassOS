import { sql } from "drizzle-orm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any; // Drizzle transaction client — keep loose, mirrors the rest of this dir

export interface PassTypeRow {
  id: string;
  name: string;
  /** null = unlimited; use granted = 999 sentinel (booking math knows 999 > any realistic debit sum) */
  credits: number | null;
  /** null = never expires; subscriptions use current_period_end instead */
  validityDays: number | null;
}

/**
 * Lookup an active pass_types row by stripe_price_id.
 *
 * Returns the matching row or null if no active pass type exists for the price.
 * Used by checkout-session-completed and invoice-paid reducers to drive
 * pass_type-stamped grants.
 *
 * Result-shape handling mirrors connected-account.ts:
 *   `(result as any)?.rows ?? (result as any) ?? []`
 * Covers both Neon HTTP (`.rows` array) and Neon WebSocket (plain array) drivers.
 */
export async function lookupPassTypeByPrice(
  tx: TxClient,
  priceId: string,
): Promise<PassTypeRow | null> {
  const rawResult = await tx.execute(sql`
    SELECT id, name, credits, validity_days
    FROM pass_types
    WHERE stripe_price_id = ${priceId}
      AND active = true
    LIMIT 1
  `);
  const rows =
    (rawResult as any)?.rows ?? (rawResult as any) ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id as string,
    name: row.name as string,
    credits: (row.credits as number | null) ?? null,
    validityDays: (row.validity_days as number | null) ?? null,
  };
}
