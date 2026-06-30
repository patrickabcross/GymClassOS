// Admin identity resolution for the mobile admin agent (AI-03).
// Mirrors member-session.ts's h3-v2 session adapter (the {req,headers,url,path}
// shape is load-bearing — see member-session.ts:29-44). resolveRole comes from
// role-resolver.ts (RUNSTUDIO_OPERATOR_EMAILS = admin; NOT GYMOS_ADMIN_EMAILS).
import { getSession } from "@agent-native/core/server";
import { resolveRole, type AppRole } from "./role-resolver.js";

async function sessionFromRequest(request: Request) {
  const url = new URL(request.url);
  return getSession({
    req: request,
    headers: request.headers,
    url,
    path: url.pathname,
  } as any);
}

export async function resolveRequestRole(
  request: Request,
): Promise<{ email: string; userId: string; role: AppRole } | null> {
  const session = await sessionFromRequest(request);
  if (!session?.userId || !session?.email) return null;
  return {
    email: session.email,
    userId: session.userId,
    role: resolveRole(session.email),
  };
}

// Throws 401 (no session) or 403 (not admin) — caller MUST invoke at the top of
// the action so the throw fires BEFORE any SSE stream opens.
export async function requireAdmin(
  request: Request,
): Promise<{ email: string; userId: string }> {
  const ctx = await resolveRequestRole(request);
  if (!ctx) throw new Response("Unauthenticated", { status: 401 });
  if (ctx.role !== "admin") throw new Response("Forbidden", { status: 403 });
  return { email: ctx.email, userId: ctx.userId };
}
