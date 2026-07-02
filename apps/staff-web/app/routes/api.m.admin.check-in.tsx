// POST /api/m/admin/check-in   { bookingId }
// Admin tap-to-check-in (DE6-02) — a pure CALLER of the existing
// mark-booking-attended attendance chokepoint. There is NO new attendance
// write path here. This route:
//   (a) gates the caller as an admin (requireAdmin → operator email allow-list),
//   (b) accepts a bookingId (400 if missing),
//   (c) calls mark-booking-attended.run — the sole attendance writer.
//
// Differs from teacher check-in in that there is NO trainer-ownership check —
// an admin can check in any member for any class. Lives under the public /api/m
// path (publicPaths: ["/api/m"]) but self-gates with requireAdmin, exactly like
// /api/m/admin/agent/stream.
import { requireAdmin } from "../../server/lib/admin-session";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  const _admin = await requireAdmin(request); // throws 401/403

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad input", { status: 400 });
  }
  const bookingId = body?.bookingId;
  if (!bookingId || typeof bookingId !== "string") {
    return new Response(
      JSON.stringify({ error: "bookingId required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Call the SOLE attendance chokepoint. Do NOT replicate the UPDATE here.
  // The Meta Schedule CAPI event fires inside .run() (single write path preserved).
  const mod = await import("../../actions/mark-booking-attended.js");
  const parsed = mod.default.schema.safeParse({ bookingId });
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Bad input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const result = await mod.default.run(parsed.data);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
