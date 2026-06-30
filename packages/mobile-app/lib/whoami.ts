// Role discovery for client-side UX gating (MA4 AI-01). The real security
// boundary is the server requireAdmin on /api/m/admin/agent/stream — this only
// decides which agent entry to show. A member who forces the admin URL still 403s.
import { getSessionToken } from "./session";
import { API_BASE_URL } from "./api";

export type AppRole = "admin" | "teacher" | "member";

export async function fetchRole(): Promise<AppRole | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/m/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { role?: AppRole };
    return json.role ?? null;
  } catch {
    return null;
  }
}
