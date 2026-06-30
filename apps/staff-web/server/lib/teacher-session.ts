/**
 * teacher-session.ts — Production teacher identity resolution (MA3-01 / TCH-01,
 * TCH-03).
 *
 * Provides requireTeacher(request), sessionFromRequest, and
 * resolveTrainerIdForUser. This is the teacher sibling of member-session.ts —
 * but it NEVER claims or requires a member row. Teachers have no member
 * row, so the member-session gates would 403 them.
 *
 * Role is decided ENTIRELY by resolveRole(email) (RUNSTUDIO_TEACHER_EMAILS env
 * allowlist) — the trainers.user_id link is ONLY for mapping a logged-in
 * teacher to their assigned class_occurrences, NOT for deciding who is a teacher.
 *
 * A null trainerId is a VALID state: a teacher whose trainers.user_id has not
 * yet been populated by the manual by-email data step. Callers must render an
 * empty / "contact admin" state for trainerId === null — never a 500.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getSession } from "@agent-native/core/server";
import { resolveRole } from "./role-resolver";

// ─────────────────────────────────────────────────────────────────────────────
// H3Event adapter — COPIED from member-session.ts.
//
// getSession takes an H3Event. React Router v7 routes receive a Web Request.
// The installed core resolves h3 v2 (2.0.x-rc): getHeader reads event.req and
// the Better-auth cookie path reads event.headers, so the adapter MUST expose
// BOTH `req` (the web Request) and `headers`. Verified in the MA1 spike.
// ─────────────────────────────────────────────────────────────────────────────
export async function sessionFromRequest(request: Request) {
  const event = {
    req: request,
    headers: request.headers,
    url: new URL(request.url),
    path: new URL(request.url).pathname,
  } as any;
  return getSession(event);
}

/**
 * Map a Better-auth user.id → their trainers.id (LIMIT 1). Returns null if the
 * teacher is not yet linked (trainers.user_id unpopulated). A null result is a
 * valid, non-error state — callers render an empty/"contact admin" view.
 */
export async function resolveTrainerIdForUser(
  userId: string,
): Promise<string | null> {
  // guard:allow-unscoped — single-tenant gym tables
  const r = await getDb()
    .select({ id: schema.trainers.id })
    .from(schema.trainers)
    .where(eq(schema.trainers.userId, userId))
    .limit(1);
  return r[0]?.id ?? null;
}

export type TeacherIdentity = {
  userId: string;
  email: string;
  trainerId: string | null;
};

/**
 * requireTeacher(request) — resolve a verified Better-auth Bearer session into
 * a teacher identity. Does NOT touch gym_members.
 *
 * Throws:
 *   401 — no valid session
 *   403 — role !== "teacher" (admin > teacher > member precedence is encoded in
 *         resolveRole; a pure admin correctly 403s here and uses the MA4 admin
 *         surface instead)
 *
 * trainerId may be null (teacher not yet linked) — that is a valid state.
 */
export async function requireTeacher(
  request: Request,
): Promise<TeacherIdentity> {
  const session = await sessionFromRequest(request);
  if (!session?.userId || !session?.email) {
    throw new Response("Unauthenticated", { status: 401 });
  }
  if (resolveRole(session.email) !== "teacher") {
    throw new Response("Forbidden", { status: 403 });
  }
  const trainerId = await resolveTrainerIdForUser(session.userId);
  return { userId: session.userId, email: session.email, trainerId };
}
