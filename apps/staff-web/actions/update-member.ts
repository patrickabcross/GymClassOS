// update-member — AEM-01, AEM-02
//
// Update a gym member's profile fields: first name, last name, email,
// phone (E.164), or notes — and ONLY those fields. The schema is .strict(),
// so marketing_consent / whatsapp_opt_in / any other key is rejected at
// parse time: the agent can never silently flip consent (AEM-02). Phone is
// validated as E.164 and REJECTED (never normalized) if malformed; email is
// validated. An empty patch is a no-op success.
//
// Agent-only mutation: no `http` key (write actions are agent-only per
// apps/staff-web/AGENTS.md "Adding a New Gym Action" step 2; a GET would also
// suppress the live-refresh source:"action" signal).

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { and, eq, ne } from "drizzle-orm";

// E.164: leading '+', first digit 1-9, then up to 14 more digits (max 15 total).
const E164 = /^\+[1-9]\d{1,14}$/;

export default defineAction({
  description:
    "Update a gym member's profile: first name, last name, email, phone (E.164), or notes. " +
    "Only the supplied fields change. NEVER changes marketing consent or WhatsApp opt-in — those " +
    "are structurally excluded and cannot be set by this tool. Phone must be valid E.164 " +
    "(e.g. +447700900123) or it is rejected (no auto-formatting). Empty patch is a no-op success. " +
    "Returns {updated:true} | {updated:false, reason} | {error}.",
  schema: z
    .object({
      memberId: z.string().min(1),
      firstName: z.string().min(1).max(120).optional(),
      lastName: z.string().max(120).optional(),
      email: z.string().max(254).optional(),
      phoneE164: z.string().max(20).optional(),
      notes: z.string().max(2000).optional(),
    })
    .strict(), // AEM-02: rejects marketing_consent / whatsapp_opt_in / any extra key at parse time

  run: async ({ memberId, firstName, lastName, email, phoneE164, notes }) => {
    const db = getDb();

    // Resolve the member first (explicit not-found error, mirrors update-class-definition).
    // guard:allow-unscoped — single-tenant gym tables
    const [m] = await db
      .select({ id: schema.gymMembers.id })
      .from(schema.gymMembers)
      .where(eq(schema.gymMembers.id, memberId))
      .limit(1);
    if (!m) return { error: "MEMBER_NOT_FOUND" };

    // Validate phone/email in-run so the agent gets a typed, explainable error
    // (NOT a raw Zod failure). D-07: reject, never normalize — phone_e164 is the
    // WhatsApp natural key.
    if (phoneE164 !== undefined && !E164.test(phoneE164)) {
      return { error: "INVALID_PHONE" };
    }
    if (email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { error: "INVALID_EMAIL" };
    }

    // Collision pre-checks: gym_members is UNIQUE on BOTH email and phone_e164.
    // Updating to a value already owned by ANOTHER member would 500 on the
    // unique index; pre-check and return a typed error instead (Pitfall 5).
    if (email !== undefined) {
      // guard:allow-unscoped — single-tenant gym tables
      const [clash] = await db
        .select({ id: schema.gymMembers.id })
        .from(schema.gymMembers)
        .where(
          and(
            eq(schema.gymMembers.email, email),
            ne(schema.gymMembers.id, memberId),
          ),
        )
        .limit(1);
      if (clash) return { error: "EMAIL_IN_USE" };
    }
    if (phoneE164 !== undefined) {
      // guard:allow-unscoped — single-tenant gym tables
      const [clash] = await db
        .select({ id: schema.gymMembers.id })
        .from(schema.gymMembers)
        .where(
          and(
            eq(schema.gymMembers.phoneE164, phoneE164),
            ne(schema.gymMembers.id, memberId),
          ),
        )
        .limit(1);
      if (clash) return { error: "PHONE_IN_USE" };
    }

    const updates: Partial<typeof schema.gymMembers.$inferInsert> = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (email !== undefined) updates.email = email;
    if (phoneE164 !== undefined) updates.phoneE164 = phoneE164;
    if (notes !== undefined) updates.notes = notes;
    if (Object.keys(updates).length === 0)
      return { updated: false, reason: "no changes" };

    // gym_members.updatedAt exists (schema.ts:131).
    updates.updatedAt = new Date().toISOString();

    // guard:allow-unscoped — single-tenant gym tables
    await db
      .update(schema.gymMembers)
      .set(updates)
      .where(eq(schema.gymMembers.id, memberId));
    return { updated: true };
  },
});
