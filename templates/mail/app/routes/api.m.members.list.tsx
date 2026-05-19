// GET /api/m/members/list
// Demo-only: returns the 5 seeded gym members for the first-launch picker.
// NOT gated by requireDemoMember — the picker has no member yet — but still
// requires DEMO_MODE=true to function. Production (P1a) replaces the picker
// with a magic-link flow so this endpoint goes away.
import { asc } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import type { LoaderFunctionArgs } from "react-router";

export async function loader(_: LoaderFunctionArgs) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.DEMO_MODE !== "true"
  ) {
    throw new Response("Demo mode disabled", { status: 401 });
  }
  const db = getDb();
  // guard:allow-unscoped — demo D-07 (picker endpoint; no member context yet)
  const members = await db
    .select({
      id: schema.gymMembers.id,
      firstName: schema.gymMembers.firstName,
      lastName: schema.gymMembers.lastName,
    })
    .from(schema.gymMembers)
    .orderBy(asc(schema.gymMembers.firstName));
  return { members };
}
