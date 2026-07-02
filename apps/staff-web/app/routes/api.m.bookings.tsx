// POST /api/m/bookings — body { occurrenceId: string }
// Books the signed-in member into a class occurrence.
//
// MEM-03 (MA2) — the demo-grade caveat is RESOLVED. The whole booking now runs
// inside ONE db.transaction (the cancel-occurrence.ts pattern), all-or-nothing:
//   1. idempotency pre-check (already-booked → return existing id, no insert)
//   2. FOR UPDATE lock on the occurrence row (closes the capacity race) + status;
//      also resolves classCategory via LEFT JOIN to class_definitions.
//   3. capacity check (count booked >= capacity → 409 CAPACITY_FULL)
//   4. FIFO active-pass pick (expires_at NULL or future; per-pass remaining =
//      granted − SUM(its own debits); none → 402 NO_PASS). C47: pick also
//      checks category compatibility via pass_types:
//        - pass.pass_type_id IS NULL  → LEGACY allow-all (existing HUSTLE passes)
//        - passType.all_categories    → compatible (books any class)
//        - else: allowed_categories JSON array must include classCategory
//                (or classCategory is null → compatible)
//      If funded passes exist but NONE are compatible → 403 NO_COMPATIBLE_PASS.
//   5. insert booking with pass_id set to the picked pass
//   6. insert a +1 pass_debits row (reason 'class_booking') — the MIRROR of the
//      cancel-occurrence −1 refund, so cancellations reconcile against the same
//      pass_id. Pass is debited ON BOOKING, never on purchase.
import { eq, and, or, gt, isNull, asc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "../../server/db";
import { requireMemberOrDemo } from "../../server/lib/member-session";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader(_: LoaderFunctionArgs) {
  // GET is not supported — clients use /api/m/schedule to read.
  return new Response("Method not allowed", { status: 405 });
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const member = await requireMemberOrDemo(request);

  // PARQ v2 gate — a member must have completed the PAR-Q before booking.
  // guard:allow-unscoped — single-tenant gym members
  {
    const db0 = getDb() as any as {
      execute: (q: unknown) => Promise<{ rows: unknown[] }>;
    };
    const { rows: parqRows } = await db0.execute(
      sql`SELECT parq_completed_at FROM gym_members WHERE id = ${member.id} LIMIT 1`,
    );
    const parqCompletedAt = (
      parqRows[0] as { parq_completed_at?: string | null } | undefined
    )?.parq_completed_at;
    if (!parqCompletedAt) {
      return jsonResponse({ error: "PARQ_REQUIRED" }, 403);
    }
  }

  let occurrenceId: string;
  try {
    const json = (await request.json()) as { occurrenceId?: string };
    occurrenceId = String(json.occurrenceId ?? "");
  } catch {
    return jsonResponse({ error: "Bad JSON" }, 400);
  }
  if (!occurrenceId) {
    return jsonResponse({ error: "Missing occurrenceId" }, 400);
  }

  const db = getDb();
  const nowIso = new Date().toISOString();

  // Captured flags / outputs from the transaction (mutated inside the closure;
  // exactly one terminal flag is ever set because each branch returns early).
  let existingId: string | null = null;
  let notFound = false;
  let unavailable = false;
  let capacityFull = false;
  let noPass = false;
  /** C47: set when at least one funded pass exists but none allow this class category */
  let noCompatiblePass = false;
  let bookingId: string | null = null;
  let pickedPassId: string | null = null;

  // ONE atomic transaction — capacity + entitlement + booking + debit.
  await db.transaction(async (tx) => {
    // 1. Idempotency pre-check INSIDE the txn: already 'booked' for this
    //    (occurrence, member) → return the existing booking, no new rows.
    // guard:allow-unscoped — single-tenant gym tables
    const existing = await tx
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.occurrenceId, occurrenceId),
          eq(schema.bookings.memberId, member.id),
          eq(schema.bookings.status, "booked"),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);
    if (existing) {
      existingId = existing.id;
      return;
    }

    // 2. Lock + validate the occurrence. `.for("update")` is a Postgres row
    //    lock (closes the capacity race, RESEARCH Pattern 3). The compile-time
    //    driver type is LibSQL (no FOR UPDATE) but the runtime is Neon
    //    Postgres, so the lock clause is applied via a narrow cast; the
    //    in-txn capacity count below is the correctness floor regardless.
    //    C47: LEFT JOIN class_definitions to resolve classCategory for the
    //    category compatibility check in step 4.
    // guard:allow-unscoped — single-tenant gym tables
    const occQuery = tx
      .select({
        id: schema.classOccurrences.id,
        capacity: schema.classOccurrences.capacity,
        status: schema.classOccurrences.status,
        category: schema.classDefinitions.category,
      })
      .from(schema.classOccurrences)
      .leftJoin(
        schema.classDefinitions,
        eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
      )
      .where(eq(schema.classOccurrences.id, occurrenceId))
      .limit(1);
    const occRows = (await (occQuery as any).for("update")) as Array<{
      id: string;
      capacity: number;
      status: string;
      category: string | null;
    }>;
    const occ = occRows[0] ?? null;
    if (!occ) {
      notFound = true;
      return;
    }
    if (occ.status !== "scheduled") {
      unavailable = true;
      return;
    }
    // C47: classCategory is null when the definition has no category set →
    // treated as compatible with all pass types (no category gate on unclassified classes).
    const classCategory: string | null = occ.category ?? null;

    // 3. Capacity check — count currently 'booked' rows for this occurrence.
    // guard:allow-unscoped — single-tenant gym tables
    const countRow = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.occurrenceId, occurrenceId),
          eq(schema.bookings.status, "booked"),
        ),
      )
      .then((r) => r[0]);
    const bookedCount = Number(countRow?.count ?? 0);
    if (bookedCount >= occ.capacity) {
      capacityFull = true;
      return;
    }

    // 4. Resolve an active pass with remaining credit (FIFO). "Active" =
    //    expires_at IS NULL OR expires_at > now. Order by expires_at ASC NULLS
    //    LAST, created_at ASC. Per-pass remaining = granted − SUM(its OWN
    //    debits) via a separate aggregation — NEVER chain-join pass_debits
    //    (fan-out double-counts).
    //
    //    C47: also select pass_type_id and enforce category compatibility:
    //      - pass_type_id IS NULL  → LEGACY allow-all (never break existing passes)
    //      - passType.all_categories = true  → compatible (books any class)
    //      - else: allowed_categories JSON array must include classCategory
    //              (or classCategory is null → compatible with all)
    //    Track sawFundedPass to distinguish:
    //      - no funded pass at all                 → 402 NO_PASS (unchanged)
    //      - funded but no category-compatible one → 403 NO_COMPATIBLE_PASS (new)
    // guard:allow-unscoped — single-tenant gym tables
    const candidates = await tx
      .select({
        id: schema.passes.id,
        granted: schema.passes.granted,
        expiresAt: schema.passes.expiresAt,
        createdAt: schema.passes.createdAt,
        passTypeId: schema.passes.passTypeId,
      })
      .from(schema.passes)
      .where(
        and(
          eq(schema.passes.memberId, member.id),
          or(
            isNull(schema.passes.expiresAt),
            gt(schema.passes.expiresAt, nowIso),
          ),
        ),
      )
      .orderBy(
        sql`${schema.passes.expiresAt} ASC NULLS LAST`,
        asc(schema.passes.createdAt),
      );

    let picked: { id: string } | null = null;
    let sawFundedPass = false;
    for (const cand of candidates) {
      // guard:allow-unscoped — single-tenant gym tables
      const debitRow = await tx
        .select({
          sum: sql<number>`COALESCE(SUM(${schema.passDebits.amount}), 0)`,
        })
        .from(schema.passDebits)
        .where(eq(schema.passDebits.passId, cand.id))
        .then((r) => r[0]);
      const used = Number(debitRow?.sum ?? 0);
      const remaining = Number(cand.granted) - used;
      if (remaining <= 0) continue;

      // At least one funded pass exists — distinguish NO_PASS vs NO_COMPATIBLE_PASS.
      sawFundedPass = true;

      // C47: Category compatibility gate.
      let compatible = false;
      if (!cand.passTypeId) {
        // LEGACY allow-all: null pass_type_id books any class category.
        compatible = true;
      } else {
        // Load the pass_type row inside the transaction.
        // guard:allow-unscoped — single-tenant gym tables
        const ptRow = await tx
          .select({
            allCategories: schema.passTypes.allCategories,
            allowedCategories: schema.passTypes.allowedCategories,
          })
          .from(schema.passTypes)
          .where(eq(schema.passTypes.id, cand.passTypeId))
          .limit(1)
          .then((r) => r[0] ?? null);

        if (!ptRow) {
          // pass_type row missing (data inconsistency) → safe allow-all fallback.
          compatible = true;
        } else if (ptRow.allCategories) {
          // Pass type books any class.
          compatible = true;
        } else {
          // Check allowed_categories JSON array.
          const allowed: string[] = (() => {
            try {
              const parsed = JSON.parse(ptRow.allowedCategories ?? "[]");
              return Array.isArray(parsed) ? (parsed as string[]) : [];
            } catch {
              return [] as string[];
            }
          })();
          // classCategory null = unclassified class → treat as compatible.
          compatible = classCategory === null || allowed.includes(classCategory);
        }
      }

      if (compatible) {
        picked = { id: cand.id };
        break;
      }
    }
    if (!picked) {
      if (sawFundedPass) {
        // Member has credit but no compatible pass for this class category.
        noCompatiblePass = true;
      } else {
        // Member has no active passes with remaining credit at all.
        noPass = true;
      }
      return;
    }

    // 5. Insert the booking with pass_id set to the picked pass.
    const newBookingId = `bkg_${crypto.randomUUID()}`;
    // guard:allow-unscoped — single-tenant gym tables
    await tx.insert(schema.bookings).values({
      id: newBookingId,
      occurrenceId,
      memberId: member.id,
      status: "booked",
      passId: picked.id,
      bookedByUserId: null, // self-booked from member app
      bookedAt: new Date().toISOString(),
    });

    // 6. Insert the positive debit — the MIRROR of cancel-occurrence's −1.
    // guard:allow-unscoped — single-tenant gym tables
    await tx.insert(schema.passDebits).values({
      id: `pdebit_${nanoid()}`,
      passId: picked.id,
      bookingId: newBookingId,
      amount: 1,
      reason: "class_booking",
      createdAt: new Date().toISOString(),
    });

    bookingId = newBookingId;
    pickedPassId = picked.id;
  });

  // Translate captured flags → HTTP Responses (JSON).
  if (notFound) return jsonResponse({ error: "OCCURRENCE_NOT_FOUND" }, 404);
  if (unavailable)
    return jsonResponse({ error: "OCCURRENCE_UNAVAILABLE" }, 409);
  if (capacityFull) return jsonResponse({ error: "CAPACITY_FULL" }, 409);
  if (noPass) return jsonResponse({ error: "NO_PASS" }, 402);
  // C47: member has credit but no pass type allows this class category.
  if (noCompatiblePass)
    return jsonResponse({ error: "NO_COMPATIBLE_PASS" }, 403);
  if (existingId) {
    return jsonResponse({ bookingId: existingId, alreadyBooked: true }, 200);
  }
  return jsonResponse(
    { bookingId, passId: pickedPassId, alreadyBooked: false },
    200,
  );
}
