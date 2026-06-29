// GET /api/m/members/list
// Demo-only: returns the 5 seeded gym members for the first-launch picker.
// Demo-only picker endpoint: no member auth gate (picker has no member yet);
// still requires DEMO_MODE=true. MA1 (requireMemberOrDemo) replaces the
// member-picker pattern — this endpoint is a demo-only remnant.
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
