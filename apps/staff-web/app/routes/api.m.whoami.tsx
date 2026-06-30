// GET /api/m/whoami
// Role-discovery surface for the mobile client (enables AI-01 client gating).
// Returns the caller's resolved role for ANY signed-in user (does NOT 403
// non-admins — the admin SSE endpoint is the security boundary, not this).
import type { LoaderFunctionArgs } from "react-router";
import { resolveRequestRole } from "../../server/lib/admin-session.js";

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await resolveRequestRole(request);
  if (!ctx) {
    return new Response(JSON.stringify({ error: "Unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ role: ctx.role }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
