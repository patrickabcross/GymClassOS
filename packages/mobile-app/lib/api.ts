// Mobile fetch wrapper — sends Authorization: Bearer <token> on every request.
// MA1-02: swapped from the demo member header to a real Bearer session token.
// All TanStack Query queryFns route through here.
import { getSessionToken } from "./session";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8081";

export async function apiFetch(path: string, init?: RequestInit) {
  const token = await getSessionToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const API_BASE_URL = API_BASE;
