// Demo-only auth gate (D2-01 / D-07). Trusts the X-Demo-Member-Id header only
// when DEMO_MODE=true AND NODE_ENV !== 'production'. Returns the gym_members
// row or throws a 401/404 Response. Replaced in P1a by Better-auth member
// sessions (MEMAUTH-02 magic-link).
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";

export type DemoMember = typeof schema.gymMembers.$inferSelect;

export async function requireDemoMember(request: Request): Promise<DemoMember> {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.DEMO_MODE !== "true"
  ) {
    throw new Response("Demo mode disabled", { status: 401 });
  }
  const memberId = request.headers.get("x-demo-member-id");
  if (!memberId)
    throw new Response("Missing X-Demo-Member-Id", { status: 401 });

  const db = getDb();
  // guard:allow-unscoped — demo D-07 (X-Demo-Member-Id is the access scope; no ownableColumns on GymOS schema)
  const member = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.id, memberId))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!member) throw new Response("Member not found", { status: 404 });
  return member;
}
