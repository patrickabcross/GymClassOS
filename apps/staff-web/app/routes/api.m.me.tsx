// GET /api/m/me
// Role surface for the mobile client (MA3-01 / TCH-01, TCH-03). Returns the
// caller's role so the app can branch UI (member coach / teacher / admin).
//
// Unlike /api/m/profile, this route does NOT require a gym_members row — a
// teacher or admin with no member row must still get a 200 with their role,
// not a 403. Only teachers resolve a trainerId (from trainers.user_id).
import type { LoaderFunctionArgs } from "react-router";
import { resolveRole } from "../../server/lib/role-resolver";
import {
  sessionFromRequest,
  resolveTrainerIdForUser,
} from "../../server/lib/teacher-session";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await sessionFromRequest(request);
  if (!session?.userId || !session?.email) {
    throw new Response("Unauthenticated", { status: 401 });
  }
  const role = resolveRole(session.email);
  const trainerId =
    role === "teacher" ? await resolveTrainerIdForUser(session.userId) : null;
  return { role, userId: session.userId, email: session.email, trainerId };
}
