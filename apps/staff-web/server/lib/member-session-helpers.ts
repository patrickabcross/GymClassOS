/**
 * Pure claim helpers for member-session.ts.
 *
 * Extracted from member-session.ts so Vitest (ESM) can test them without
 * importing @agent-native/core (which causes a CJS React "module is not
 * defined" error in the unit config). BD4-01 pattern.
 *
 * Both helpers take an injected `db` (the Drizzle database instance) so
 * they are fully testable without a live Neon connection.
 */

import { eq, and, isNull } from "drizzle-orm";
import { schema } from "../db";
import { normalizePhone } from "./csv-leads";

export type Member = typeof schema.gymMembers.$inferSelect;

export type ClaimEmailResult =
  | Member
  | { error: "RECLAIM"; status: 409 }
  | { error: "NO_EMAIL_MATCH" };

export type ClaimPhoneResult =
  | Member
  | { error: "RECLAIM"; status: 409 }
  | { error: "NO_PHONE_MATCH" };

/**
 * Claim a gym_members row by email.
 *
 * Safety guarantees:
 *   1. UPDATE writes ONLY userId — never email or phoneE164 (dual-unique-key safety, Pitfall 3).
 *   2. isNull(userId) guard in WHERE prevents concurrent re-claim races.
 *   3. Idempotent fast-path: repeated calls for the same user return the same row.
 *   4. 409 (RECLAIM) if the email-matched row already belongs to a different user.
 *   5. NO_EMAIL_MATCH sentinel returned if no row matches — never auto-creates.
 */
export async function claimMemberByEmailWithDb(
  db: any,
  userId: string,
  email: string,
): Promise<ClaimEmailResult> {
  const normalised = email.toLowerCase().trim();

  // STEP 1: Idempotent fast path — already claimed by this user?
  // guard:allow-unscoped — single-tenant gym tables
  const existing = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.userId, userId))
    .limit(1)
    .then((r: Member[]) => r[0] ?? null);
  if (existing) return existing;

  // STEP 2: Find row by email
  // guard:allow-unscoped — single-tenant gym tables
  const byEmail = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.email, normalised))
    .limit(1)
    .then((r: Member[]) => r[0] ?? null);

  if (byEmail) {
    if (byEmail.userId !== null && byEmail.userId !== userId) {
      // Row already claimed by a DIFFERENT user
      return { error: "RECLAIM", status: 409 };
    }
    // Claim: UPDATE writes userId ONLY — never email or phoneE164 (D-10, Pitfall 3)
    await db
      .update(schema.gymMembers)
      .set({ userId })
      .where(
        and(
          eq(schema.gymMembers.id, byEmail.id),
          isNull(schema.gymMembers.userId), // race guard
        ),
      );
    return { ...byEmail, userId };
  }

  // STEP 3: No email match
  return { error: "NO_EMAIL_MATCH" };
}

/**
 * Claim a gym_members row by phone E.164.
 *
 * Same safety properties as claimMemberByEmailWithDb:
 *   - UPDATE writes ONLY userId (dual-unique-key safety)
 *   - isNull(userId) race guard
 *   - Idempotent
 *   - 409 on re-claim
 *   - NO_PHONE_MATCH if no row matches (or phone normalisation fails)
 */
export async function claimMemberByPhoneWithDb(
  db: any,
  userId: string,
  phoneRaw: string,
): Promise<ClaimPhoneResult> {
  const phoneE164 = normalizePhone(phoneRaw);
  if (!phoneE164) return { error: "NO_PHONE_MATCH" };

  // STEP 1: Idempotent fast path
  // guard:allow-unscoped — single-tenant gym tables
  const existing = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.userId, userId))
    .limit(1)
    .then((r: Member[]) => r[0] ?? null);
  if (existing) return existing;

  // STEP 2: Find row by phone
  // guard:allow-unscoped — single-tenant gym tables
  const byPhone = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.phoneE164, phoneE164))
    .limit(1)
    .then((r: Member[]) => r[0] ?? null);

  if (byPhone) {
    if (byPhone.userId !== null && byPhone.userId !== userId) {
      return { error: "RECLAIM", status: 409 };
    }
    // Claim: UPDATE writes userId ONLY — never phoneE164 or email (D-10, Pitfall 3)
    await db
      .update(schema.gymMembers)
      .set({ userId })
      .where(
        and(
          eq(schema.gymMembers.id, byPhone.id),
          isNull(schema.gymMembers.userId),
        ),
      );
    return { ...byPhone, userId };
  }

  return { error: "NO_PHONE_MATCH" };
}
